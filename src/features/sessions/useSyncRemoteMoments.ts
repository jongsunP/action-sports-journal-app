import { useCallback, type Dispatch, type SetStateAction } from 'react';

import type { SessionVideoAsset } from '../../services/ai';
import type { RemoteMomentRecord } from '../../services/moments';
import type { GeminiEvidenceResult, Session } from '../../types';
import {
  applyRemoteMomentIds,
  applyRemoteEvidence,
  applyRemoteSessions,
  applyRemoteThumbnails,
  applyRemoteVideos,
  buildRemoteMomentSessionIdMap,
} from './sessionSyncPatches';

type UseSyncRemoteMomentsParams = {
  remoteMomentIdsBySessionId: Record<string, string>;
  sessions: Session[];
  setGeminiEvidenceBySessionId: Dispatch<
    SetStateAction<Record<string, GeminiEvidenceResult>>
  >;
  setRemoteMomentIdsBySessionId: Dispatch<SetStateAction<Record<string, string>>>;
  setSessions: Dispatch<SetStateAction<Session[]>>;
  setThumbnailsBySessionId: Dispatch<SetStateAction<Record<string, string>>>;
  setVideosBySessionId: Dispatch<
    SetStateAction<Record<string, SessionVideoAsset>>
  >;
};

export function useSyncRemoteMoments({
  remoteMomentIdsBySessionId,
  sessions,
  setGeminiEvidenceBySessionId,
  setRemoteMomentIdsBySessionId,
  setSessions,
  setThumbnailsBySessionId,
  setVideosBySessionId,
}: UseSyncRemoteMomentsParams) {
  return useCallback(
    (remoteMoments: RemoteMomentRecord[]) => {
      const sessionIdByRemoteMomentId = buildRemoteMomentSessionIdMap({
        remoteMomentIdsBySessionId,
        remoteMoments,
        sessions,
      });

      setSessions((current) =>
        applyRemoteSessions({
          current,
          remoteMoments,
          sessionIdByRemoteMomentId,
        }),
      );

      setRemoteMomentIdsBySessionId((current) =>
        applyRemoteMomentIds({
          current,
          remoteMoments,
          sessionIdByRemoteMomentId,
        }),
      );

      setVideosBySessionId((current) =>
        applyRemoteVideos({
          current,
          remoteMoments,
          sessionIdByRemoteMomentId,
        }),
      );

      setGeminiEvidenceBySessionId((current) =>
        applyRemoteEvidence({
          current,
          remoteMoments,
          sessionIdByRemoteMomentId,
        }),
      );

      setThumbnailsBySessionId((current) =>
        applyRemoteThumbnails({
          current,
          remoteMoments,
          sessionIdByRemoteMomentId,
        }),
      );
    },
    [
      remoteMomentIdsBySessionId,
      sessions,
      setGeminiEvidenceBySessionId,
      setRemoteMomentIdsBySessionId,
      setSessions,
      setThumbnailsBySessionId,
      setVideosBySessionId,
    ],
  );
}
