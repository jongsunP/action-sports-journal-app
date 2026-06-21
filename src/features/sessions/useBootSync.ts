import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { Alert } from 'react-native';

import { hasConfiguredSupabaseMoments, listMoments } from '../../services/moments';
import type { SessionVideoAsset } from '../../services/ai';
import type { RemoteMomentRecord } from '../../services/moments';
import type { AnalysisResult, GeminiEvidenceResult, Session } from '../../types';
import {
  loadPersistedSessionState,
  type PersistedSessionState,
} from './sessionStorage';

type UseBootSyncParams = {
  initialGroupId: string;
  normalizeRestoredSession: (session: Session) => Session;
  remoteMomentIdsBySessionId: Record<string, string>;
  setAnalysisBySessionId: Dispatch<SetStateAction<Record<string, AnalysisResult>>>;
  setGeminiEvidenceBySessionId: Dispatch<
    SetStateAction<Record<string, GeminiEvidenceResult>>
  >;
  setOpenAiBenchmarkBySessionId: Dispatch<
    SetStateAction<Record<string, AnalysisResult>>
  >;
  setRemoteMomentIdsBySessionId: Dispatch<SetStateAction<Record<string, string>>>;
  setSelectedGroupId: Dispatch<SetStateAction<string>>;
  setSessions: Dispatch<SetStateAction<Session[]>>;
  setThumbnailsBySessionId: Dispatch<SetStateAction<Record<string, string>>>;
  setUserConfirmedTrickBySessionId: Dispatch<
    SetStateAction<Record<string, string>>
  >;
  setVideosBySessionId: Dispatch<
    SetStateAction<Record<string, SessionVideoAsset>>
  >;
  syncRemoteMoments: (remoteMoments: RemoteMomentRecord[]) => void;
};

const REMOTE_MOMENT_SYNC_TIMEOUT_MS = 8000;

export function useBootSync({
  initialGroupId,
  normalizeRestoredSession,
  remoteMomentIdsBySessionId,
  setAnalysisBySessionId,
  setGeminiEvidenceBySessionId,
  setOpenAiBenchmarkBySessionId,
  setRemoteMomentIdsBySessionId,
  setSelectedGroupId,
  setSessions,
  setThumbnailsBySessionId,
  setUserConfirmedTrickBySessionId,
  setVideosBySessionId,
  syncRemoteMoments,
}: UseBootSyncParams) {
  const [isStorageLoaded, setIsStorageLoaded] = useState(false);
  const [isRemoteMomentSyncLoaded, setIsRemoteMomentSyncLoaded] = useState(
    !hasConfiguredSupabaseMoments(),
  );

  useEffect(() => {
    let isMounted = true;

    async function loadPersistedSessions() {
      try {
        const parsed = await loadPersistedSessionState();

        if (!parsed || !isMounted) {
          return;
        }

        if (Array.isArray(parsed.sessions)) {
          setSessions(parsed.sessions.map(normalizeRestoredSession));
        }

        setSelectedGroupId(initialGroupId);
        restorePersistedSessionMaps({
          parsed,
          setAnalysisBySessionId,
          setGeminiEvidenceBySessionId,
          setOpenAiBenchmarkBySessionId,
          setRemoteMomentIdsBySessionId,
          setThumbnailsBySessionId,
          setUserConfirmedTrickBySessionId,
          setVideosBySessionId,
        });
      } catch {
        Alert.alert(
          '기록을 불러오지 못했습니다',
          '앱은 기본 라이딩 기록으로 계속 실행됩니다.',
        );
      } finally {
        if (isMounted) {
          setIsStorageLoaded(true);
        }
      }
    }

    loadPersistedSessions();

    return () => {
      isMounted = false;
    };
  }, [
    normalizeRestoredSession,
    initialGroupId,
    setAnalysisBySessionId,
    setGeminiEvidenceBySessionId,
    setOpenAiBenchmarkBySessionId,
    setRemoteMomentIdsBySessionId,
    setSelectedGroupId,
    setSessions,
    setThumbnailsBySessionId,
    setUserConfirmedTrickBySessionId,
    setVideosBySessionId,
  ]);

  useEffect(() => {
    if (
      !isStorageLoaded ||
      isRemoteMomentSyncLoaded ||
      !hasConfiguredSupabaseMoments()
    ) {
      return;
    }

    let isMounted = true;

    async function loadRemoteMoments() {
      try {
        const remoteMoments = await listMomentsWithTimeout();

        if (!isMounted) {
          return;
        }

        syncRemoteMoments(remoteMoments);
      } catch (error) {
        console.warn(
          'Supabase moment list failed:',
          error instanceof Error ? error.message : 'Unknown error',
        );
      } finally {
        if (isMounted) {
          setIsRemoteMomentSyncLoaded(true);
        }
      }
    }

    void loadRemoteMoments();

    return () => {
      isMounted = false;
    };
  }, [
    isRemoteMomentSyncLoaded,
    isStorageLoaded,
    remoteMomentIdsBySessionId,
    syncRemoteMoments,
  ]);

  return {
    isLoadingInitialMoments:
      !isStorageLoaded ||
      (hasConfiguredSupabaseMoments() && !isRemoteMomentSyncLoaded),
    isRemoteMomentSyncLoaded,
    isStorageLoaded,
  };
}

function restorePersistedSessionMaps({
  parsed,
  setAnalysisBySessionId,
  setGeminiEvidenceBySessionId,
  setOpenAiBenchmarkBySessionId,
  setRemoteMomentIdsBySessionId,
  setThumbnailsBySessionId,
  setUserConfirmedTrickBySessionId,
  setVideosBySessionId,
}: {
  parsed: PersistedSessionState;
  setAnalysisBySessionId: Dispatch<SetStateAction<Record<string, AnalysisResult>>>;
  setGeminiEvidenceBySessionId: Dispatch<
    SetStateAction<Record<string, GeminiEvidenceResult>>
  >;
  setOpenAiBenchmarkBySessionId: Dispatch<
    SetStateAction<Record<string, AnalysisResult>>
  >;
  setRemoteMomentIdsBySessionId: Dispatch<SetStateAction<Record<string, string>>>;
  setThumbnailsBySessionId: Dispatch<SetStateAction<Record<string, string>>>;
  setUserConfirmedTrickBySessionId: Dispatch<
    SetStateAction<Record<string, string>>
  >;
  setVideosBySessionId: Dispatch<
    SetStateAction<Record<string, SessionVideoAsset>>
  >;
}) {
  if (parsed.videosBySessionId && typeof parsed.videosBySessionId === 'object') {
    setVideosBySessionId(parsed.videosBySessionId);
  }

  if (
    parsed.analysisBySessionId &&
    typeof parsed.analysisBySessionId === 'object'
  ) {
    setAnalysisBySessionId(parsed.analysisBySessionId);
  }

  if (
    parsed.openAiBenchmarkBySessionId &&
    typeof parsed.openAiBenchmarkBySessionId === 'object'
  ) {
    setOpenAiBenchmarkBySessionId(parsed.openAiBenchmarkBySessionId);
  }

  if (
    parsed.geminiEvidenceBySessionId &&
    typeof parsed.geminiEvidenceBySessionId === 'object'
  ) {
    setGeminiEvidenceBySessionId(parsed.geminiEvidenceBySessionId);
  }

  if (
    parsed.userConfirmedTrickBySessionId &&
    typeof parsed.userConfirmedTrickBySessionId === 'object'
  ) {
    setUserConfirmedTrickBySessionId(parsed.userConfirmedTrickBySessionId);
  }

  if (
    parsed.thumbnailsBySessionId &&
    typeof parsed.thumbnailsBySessionId === 'object'
  ) {
    setThumbnailsBySessionId(parsed.thumbnailsBySessionId);
  }

  if (
    parsed.remoteMomentIdsBySessionId &&
    typeof parsed.remoteMomentIdsBySessionId === 'object'
  ) {
    setRemoteMomentIdsBySessionId(parsed.remoteMomentIdsBySessionId);
  }
}

export async function listMomentsWithTimeout() {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      listMoments(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('Remote moment sync timed out.'));
        }, REMOTE_MOMENT_SYNC_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
