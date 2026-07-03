import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { Alert } from 'react-native';

import {
  queueSessionEvidenceExtractionWithGemini,
  queueStoredSessionEvidenceExtractionWithGemini,
  RemoteRequestError,
  type SessionVideoAsset,
} from '../../services/ai';
import {
  updateMomentStatus,
  uploadMomentSourceVideo,
} from '../../services/moments';

import type { MomentStatus, PersistedMomentStatus, Session } from '../../types';
import { getVideoAssetFromSession } from './sessionFormatters';
import { mergeMomentStatus } from './sessionMerge';

const PERSISTED_MOMENT_STATUSES: ReadonlySet<MomentStatus> = new Set([
  'queued',
  'processing',
  'completed',
  'failed',
]);

type ExtractEvidenceOptions = {
  openSheet?: boolean;
  videoOverride?: SessionVideoAsset;
  momentIdOverride?: string;
};

type UseEvidenceExtractionParams = {
  remoteMomentIdsBySessionId: Record<string, string>;
  selectMomentDetail: (sessionId: string) => void;
  sessions: Session[];
  setSessions: Dispatch<SetStateAction<Session[]>>;
  userConfirmedTrickBySessionId: Record<string, string>;
  videosBySessionId: Record<string, SessionVideoAsset>;
};

export function useEvidenceExtraction({
  remoteMomentIdsBySessionId,
  selectMomentDetail,
  sessions,
  setSessions,
  userConfirmedTrickBySessionId,
  videosBySessionId,
}: UseEvidenceExtractionParams) {
  const [extractingEvidenceBySessionId, setExtractingEvidenceBySessionId] =
    useState<Record<string, boolean>>({});
  const sessionsRef = useRef(sessions);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  function isCompletedSession(sessionId: string) {
    return sessionsRef.current.find((session) => session.id === sessionId)
      ?.momentStatus === 'completed';
  }

  function updateLocalMomentStatus(
    sessionId: string,
    momentStatus: Session['momentStatus'],
  ) {
    const mergeSessions = (current: Session[]) =>
      current.map((session) => {
        if (session.id !== sessionId) {
          return session;
        }

        const nextMomentStatus = mergeMomentStatus(
          session.momentStatus,
          momentStatus,
        );

        if (nextMomentStatus === session.momentStatus) {
          return session;
        }

        return {
          ...session,
          momentStatus: nextMomentStatus,
          updatedAt: new Date().toISOString(),
        };
      });

    sessionsRef.current = mergeSessions(sessionsRef.current);
    setSessions(mergeSessions);
  }

  async function syncMomentStatus(
    sessionId: string,
    momentStatus: Session['momentStatus'],
    remoteMomentIdOverride?: string,
  ) {
    if (!momentStatus) {
      return;
    }

    if (momentStatus !== 'completed' && isCompletedSession(sessionId)) {
      return;
    }

    updateLocalMomentStatus(sessionId, momentStatus);

    const remoteMomentId =
      remoteMomentIdOverride ?? remoteMomentIdsBySessionId[sessionId];

    if (!remoteMomentId) {
      return;
    }

    if (!isPersistedMomentStatus(momentStatus)) {
      return;
    }

    if (momentStatus !== 'completed' && isCompletedSession(sessionId)) {
      return;
    }

    try {
      const remoteStatus = await updateMomentStatus(remoteMomentId, momentStatus);

      if (remoteStatus && remoteStatus !== momentStatus) {
        updateLocalMomentStatus(sessionId, remoteStatus);
      }
    } catch (error) {
      console.warn(
        'Supabase moment status update failed:',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  async function handleExtractEvidence(
    session: Session,
    options?: ExtractEvidenceOptions,
  ) {
    if (extractingEvidenceBySessionId[session.id]) {
      return;
    }

    const video =
      options?.videoOverride ??
      videosBySessionId[session.id] ??
      getVideoAssetFromSession(session);

    if (!video) {
      Alert.alert('영상이 필요합니다', '근거 추출 전에 영상을 먼저 연결해주세요.');
      return;
    }

    if (options?.openSheet !== false) {
      selectMomentDetail(session.id);
    }

    try {
      setExtractingEvidenceBySessionId((current) => ({
        ...current,
        [session.id]: true,
      }));
      const momentId =
        options?.momentIdOverride ?? remoteMomentIdsBySessionId[session.id];
      const syncQueuedEvidenceStatus = async (queuedJob: {
        momentStatus: 'queued' | 'processing';
      }) => {
        const nextMomentStatus =
          queuedJob.momentStatus === 'queued'
            ? 'processing'
            : queuedJob.momentStatus;

        await syncMomentStatus(session.id, nextMomentStatus, momentId);
      };

      if (momentId) {
        try {
          updateLocalMomentStatus(session.id, 'uploading');
          const uploadedSourceVideo = await uploadMomentSourceVideo(momentId, video);

          if (
            uploadedSourceVideo?.analysisStarted ||
            uploadedSourceVideo?.analysisJobStatus
          ) {
            const nextMomentStatus =
              uploadedSourceVideo.analysisJobStatus === 'processing' ||
              uploadedSourceVideo.analysisStarted
                ? 'processing'
                : 'queued';

            await syncMomentStatus(session.id, nextMomentStatus, momentId);
            return;
          }

          const queuedJob = await queueStoredSessionEvidenceExtractionWithGemini({
            session,
            activityGroupName: 'Wakeboard',
            momentId,
            userConfirmedTrick: userConfirmedTrickBySessionId[session.id],
          });

          await syncQueuedEvidenceStatus(queuedJob);
          return;
        } catch (storageError) {
          const storageMessage =
            storageError instanceof Error
              ? storageError.message
              : 'Storage-backed evidence queue failed.';
          console.warn(
            'Source video upload failed; marking upload failed:',
            storageMessage,
          );
          await syncMomentStatus(session.id, 'upload_failed', momentId);
          if (isCompletedSession(session.id)) {
            return;
          }
          Alert.alert(
            '영상 업로드에 실패했습니다',
            '분석을 시작하려면 원본 영상을 서버에 먼저 업로드해야 합니다. 네트워크 상태를 확인한 뒤 다시 시도해주세요.',
          );
          return;
        }
      }

      updateLocalMomentStatus(session.id, 'processing');

      const queuedJob = await queueSessionEvidenceExtractionWithGemini({
        session,
        activityGroupName: 'Wakeboard',
        video,
        momentId,
        userConfirmedTrick: userConfirmedTrickBySessionId[session.id],
      });

      await syncQueuedEvidenceStatus(queuedJob);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '근거 추출 요청에 실패했습니다.';
      const shouldKeepQueued = isEvidenceQueueRequestRetryable(error);

      if (shouldKeepQueued) {
        updateLocalMomentStatus(session.id, 'queued');

        if (error instanceof RemoteRequestError && error.status === 429) {
          Alert.alert(
            '분석 요청이 잠시 제한됐습니다',
            '영상은 진행중 상태로 유지됩니다. 잠시 후 다시 시도해주세요.',
          );
        } else {
          Alert.alert(
            '분석 요청이 지연됐습니다',
            '네트워크나 서버 응답이 불안정해 영상은 진행중 상태로 유지됩니다. 잠시 후 다시 시도해주세요.',
          );
        }

        console.warn('Evidence queue request delayed:', message);
        return;
      }

      await syncMomentStatus(session.id, 'failed', options?.momentIdOverride);
      if (isCompletedSession(session.id)) {
        return;
      }
      Alert.alert(
        '분석 시작에 실패했습니다',
        '영상 상태를 실패로 표시했습니다. 더보기 메뉴에서 다시 시도할 수 있습니다.',
      );
    } finally {
      setExtractingEvidenceBySessionId((current) => ({
        ...current,
        [session.id]: false,
      }));
    }
  }

  return {
    extractingEvidenceBySessionId,
    handleExtractEvidence,
    updateLocalMomentStatus,
  };
}

function isPersistedMomentStatus(
  status: MomentStatus,
): status is PersistedMomentStatus {
  return PERSISTED_MOMENT_STATUSES.has(status);
}

function isEvidenceQueueRequestRetryable(error: unknown) {
  if (error instanceof RemoteRequestError) {
    return error.status === 429 || error.status === 408 || error.status === 503;
  }

  if (error instanceof TypeError) {
    return true;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : '';

  return (
    message.includes('network') ||
    message.includes('timed out') ||
    message.includes('too many requests')
  );
}
