import { useCallback, type Dispatch, type SetStateAction } from 'react';

import type { SessionVideoAsset } from '../../services/ai';
import type { RemoteMomentRecord } from '../../services/moments';
import type { GeminiEvidenceResult, Session } from '../../types';
import {
  applyRemoteMomentIds,
  applyRemoteEvidence,
  applyRemoteSessions,
  applyRemoteSourceVideoStorageStatuses,
  applyRemoteThumbnails,
  applyRemoteVideos,
  buildRemoteMomentSessionIdMap,
} from './sessionSyncPatches';
import type { UploadReconciliationCandidate } from './sessionMerge';

type UseSyncRemoteMomentsParams = {
  remoteMomentIdsBySessionId: Record<string, string>;
  sessions: Session[];
  uploadReconciliationCandidatesBySessionId?: Record<
    string,
    UploadReconciliationCandidate
  >;
  onRemoteMomentReconciled?: (details: {
    localSessionId: string;
    matchReason: string;
    momentId: string;
    remoteSessionId: string;
  }) => void;
  setGeminiEvidenceBySessionId: Dispatch<
    SetStateAction<Record<string, GeminiEvidenceResult>>
  >;
  setRemoteMomentIdsBySessionId: Dispatch<SetStateAction<Record<string, string>>>;
  setSessions: Dispatch<SetStateAction<Session[]>>;
  setSourceVideoStorageStatusBySessionId?: Dispatch<
    SetStateAction<Record<string, string>>
  >;
  setThumbnailsBySessionId: Dispatch<SetStateAction<Record<string, string>>>;
  setVideosBySessionId: Dispatch<
    SetStateAction<Record<string, SessionVideoAsset>>
  >;
};

export function useSyncRemoteMoments({
  remoteMomentIdsBySessionId,
  sessions,
  uploadReconciliationCandidatesBySessionId,
  onRemoteMomentReconciled,
  setGeminiEvidenceBySessionId,
  setRemoteMomentIdsBySessionId,
  setSessions,
  setSourceVideoStorageStatusBySessionId,
  setThumbnailsBySessionId,
  setVideosBySessionId,
}: UseSyncRemoteMomentsParams) {
  return useCallback(
    (remoteMoments: RemoteMomentRecord[]) => {
      const sessionIdByRemoteMomentId = buildRemoteMomentSessionIdMap({
        remoteMomentIdsBySessionId,
        remoteMoments,
        sessions,
        uploadReconciliationCandidatesBySessionId,
      });

      for (const remoteMoment of remoteMoments) {
        const resolution = sessionIdByRemoteMomentId.get(
          remoteMoment.remoteMomentId,
        );

        if (!resolution) {
          continue;
        }

        console.info('[moment_reconciliation]', {
          event: 'remote_moment_resolution',
          localSessionId: resolution.sessionId,
          matchReason: resolution.matchReason,
          matched: true,
          momentId: remoteMoment.remoteMomentId,
          remoteSessionId: remoteMoment.session.id,
          replacedRemoteSessionId: resolution.sessionId !== remoteMoment.session.id,
        });

        if (uploadReconciliationCandidatesBySessionId?.[resolution.sessionId]) {
          onRemoteMomentReconciled?.({
            localSessionId: resolution.sessionId,
            matchReason: resolution.matchReason,
            momentId: remoteMoment.remoteMomentId,
            remoteSessionId: remoteMoment.session.id,
          });
        }
      }

      setSessions((current) =>
        applyRemoteSessions({
          current,
          remoteMoments,
          sessionResolutionByRemoteMomentId: sessionIdByRemoteMomentId,
        }),
      );

      setRemoteMomentIdsBySessionId((current) =>
        applyRemoteMomentIds({
          current,
          remoteMoments,
          sessionResolutionByRemoteMomentId: sessionIdByRemoteMomentId,
        }),
      );

      setSourceVideoStorageStatusBySessionId?.((current) =>
        applyRemoteSourceVideoStorageStatuses({
          current,
          remoteMoments,
          sessionResolutionByRemoteMomentId: sessionIdByRemoteMomentId,
        }),
      );

      setVideosBySessionId((current) =>
        applyRemoteVideos({
          current,
          remoteMoments,
          sessionResolutionByRemoteMomentId: sessionIdByRemoteMomentId,
        }),
      );

      setGeminiEvidenceBySessionId((current) =>
        applyRemoteEvidence({
          current,
          remoteMoments,
          sessionResolutionByRemoteMomentId: sessionIdByRemoteMomentId,
        }),
      );

      setThumbnailsBySessionId((current) =>
        applyRemoteThumbnails({
          current,
          remoteMoments,
          sessionResolutionByRemoteMomentId: sessionIdByRemoteMomentId,
        }),
      );
    },
    [
      remoteMomentIdsBySessionId,
      sessions,
      uploadReconciliationCandidatesBySessionId,
      onRemoteMomentReconciled,
      setGeminiEvidenceBySessionId,
      setRemoteMomentIdsBySessionId,
      setSourceVideoStorageStatusBySessionId,
      setSessions,
      setThumbnailsBySessionId,
      setVideosBySessionId,
    ],
  );
}
