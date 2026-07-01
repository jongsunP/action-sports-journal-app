import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { Alert } from 'react-native';

import {
  hasConfiguredSupabaseMoments,
  listMomentsPage,
  type ListMomentsOptions,
} from '../../services/moments';
import type { SessionVideoAsset } from '../../services/ai';
import type { RemoteMomentRecord } from '../../services/moments';
import type { AnalysisResult, GeminiEvidenceResult, Session } from '../../types';
import {
  loadPersistedSessionState,
  type PersistedSessionState,
} from './sessionStorage';
import type { UploadReconciliationCandidate } from './sessionMerge';

type UseBootSyncParams = {
  initialGroupId: string;
  initialRemoteMomentPageLimit?: number;
  normalizeRestoredSession: (session: Session) => Session;
  remoteMomentIdsBySessionId: Record<string, string>;
  remoteMomentSyncEnabled?: boolean;
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
  setUploadReconciliationCandidatesBySessionId?: Dispatch<
    SetStateAction<Record<string, UploadReconciliationCandidate>>
  >;
  setUserConfirmedTrickBySessionId: Dispatch<
    SetStateAction<Record<string, string>>
  >;
  setVideosBySessionId: Dispatch<
    SetStateAction<Record<string, SessionVideoAsset>>
  >;
  syncRemoteMoments: (remoteMoments: RemoteMomentRecord[]) => void;
};

const REMOTE_MOMENT_SYNC_TIMEOUT_MS = 8000;
export type RemoteMomentSyncStatus =
  | 'completed'
  | 'failed'
  | 'loading'
  | 'not_configured'
  | 'recovered_after_timeout'
  | 'timeout'
  | 'waiting_for_storage';
export type RemoteMomentPageInfo = {
  hasMore: boolean;
  nextCursor: string | null;
};
export type RemoteMomentSyncDiagnostics = {
  count: number | null;
  durationMs: number | null;
  hasMore: boolean | null;
  reason: string | null;
  requestId: string | null;
  serverTotalMs: number | null;
  status: RemoteMomentSyncStatus;
  updatedAt: number | null;
};

function getRemoteMomentSyncDuration(startedAt: number) {
  return Date.now() - startedAt;
}

export function useBootSync({
  initialGroupId,
  initialRemoteMomentPageLimit,
  normalizeRestoredSession,
  remoteMomentSyncEnabled = true,
  setAnalysisBySessionId,
  setGeminiEvidenceBySessionId,
  setOpenAiBenchmarkBySessionId,
  setRemoteMomentIdsBySessionId,
  setSelectedGroupId,
  setSessions,
  setThumbnailsBySessionId,
  setUploadReconciliationCandidatesBySessionId,
  setUserConfirmedTrickBySessionId,
  setVideosBySessionId,
  syncRemoteMoments,
}: UseBootSyncParams) {
  const isRemoteMomentSyncConfigured =
    remoteMomentSyncEnabled && hasConfiguredSupabaseMoments();
  const [initialRemoteMomentPageInfo, setInitialRemoteMomentPageInfo] =
    useState<RemoteMomentPageInfo>({
      hasMore: false,
      nextCursor: null,
    });
  const [initialRemoteMoments, setInitialRemoteMoments] = useState<
    RemoteMomentRecord[]
  >([]);
  const [hasInitialRemoteMomentPage, setHasInitialRemoteMomentPage] =
    useState(false);
  const [isStorageLoaded, setIsStorageLoaded] = useState(false);
  const [remoteMomentSyncStatus, setRemoteMomentSyncStatus] =
    useState<RemoteMomentSyncStatus>(
      isRemoteMomentSyncConfigured ? 'waiting_for_storage' : 'not_configured',
    );
  const [remoteMomentSyncDiagnostics, setRemoteMomentSyncDiagnostics] =
    useState<RemoteMomentSyncDiagnostics>({
      count: null,
      durationMs: null,
      hasMore: null,
      reason: null,
      requestId: null,
      serverTotalMs: null,
      status: isRemoteMomentSyncConfigured
        ? 'waiting_for_storage'
        : 'not_configured',
      updatedAt: null,
    });
  const previousRemoteMomentSyncEnabledRef = useRef(remoteMomentSyncEnabled);
  const hasStartedInitialRemoteSyncRef = useRef(false);

  useEffect(() => {
    const wasRemoteMomentSyncEnabled =
      previousRemoteMomentSyncEnabledRef.current;
    previousRemoteMomentSyncEnabledRef.current = remoteMomentSyncEnabled;

    if (!remoteMomentSyncEnabled) {
      hasStartedInitialRemoteSyncRef.current = false;
      setRemoteMomentSyncStatus('not_configured');
      setRemoteMomentSyncDiagnostics((current) => ({
        ...current,
        reason: null,
        requestId: null,
        serverTotalMs: null,
        status: 'not_configured',
        updatedAt: Date.now(),
      }));
      return;
    }

    if (!wasRemoteMomentSyncEnabled && remoteMomentSyncEnabled) {
      hasStartedInitialRemoteSyncRef.current = false;
      setHasInitialRemoteMomentPage(false);
      setInitialRemoteMoments([]);
      setInitialRemoteMomentPageInfo({
        hasMore: false,
        nextCursor: null,
      });
      setRemoteMomentSyncStatus(
        hasConfiguredSupabaseMoments() ? 'waiting_for_storage' : 'not_configured',
      );
      setRemoteMomentSyncDiagnostics({
        count: null,
        durationMs: null,
        hasMore: null,
        reason: null,
        requestId: null,
        serverTotalMs: null,
        status: hasConfiguredSupabaseMoments()
          ? 'waiting_for_storage'
          : 'not_configured',
        updatedAt: Date.now(),
      });
      return;
    }

    if (
      hasConfiguredSupabaseMoments() &&
      remoteMomentSyncStatus === 'not_configured'
    ) {
      setRemoteMomentSyncStatus('waiting_for_storage');
      setRemoteMomentSyncDiagnostics((current) => ({
        ...current,
        reason: null,
        requestId: null,
        serverTotalMs: null,
        status: 'waiting_for_storage',
        updatedAt: Date.now(),
      }));
    }
  }, [remoteMomentSyncEnabled, remoteMomentSyncStatus]);

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
          setUploadReconciliationCandidatesBySessionId,
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
    setUploadReconciliationCandidatesBySessionId,
    setUserConfirmedTrickBySessionId,
    setVideosBySessionId,
  ]);

  useEffect(() => {
    if (
      !isStorageLoaded ||
      !isRemoteMomentSyncConfigured ||
      hasStartedInitialRemoteSyncRef.current
    ) {
      return;
    }

    hasStartedInitialRemoteSyncRef.current = true;
    let didFinishInitialRemoteSync = false;
    let isMounted = true;

    async function loadRemoteMoments() {
      setRemoteMomentSyncStatus('loading');
      const startedAt = Date.now();
      setRemoteMomentSyncDiagnostics({
        count: null,
        durationMs: null,
        hasMore: null,
        reason: null,
        requestId: null,
        serverTotalMs: null,
        status: 'loading',
        updatedAt: startedAt,
      });

      console.info('[moment_sync]', {
        event: 'boot_remote_moments_started',
        limit: initialRemoteMomentPageLimit,
      });

      try {
        const remoteMomentPage = await listMomentPageWithTimeout({
          limit: initialRemoteMomentPageLimit,
          view: 'summary',
        });

        if (!isMounted) {
          return;
        }

        syncRemoteMoments(remoteMomentPage.moments);
        setInitialRemoteMoments(remoteMomentPage.moments);
        setInitialRemoteMomentPageInfo({
          hasMore: remoteMomentPage.hasMore,
          nextCursor: remoteMomentPage.nextCursor,
        });
        setHasInitialRemoteMomentPage(true);
        didFinishInitialRemoteSync = true;
        setRemoteMomentSyncStatus('completed');
        setRemoteMomentSyncDiagnostics({
          count: remoteMomentPage.moments.length,
          durationMs: getRemoteMomentSyncDuration(startedAt),
          hasMore: remoteMomentPage.hasMore,
          reason: null,
          requestId: remoteMomentPage.requestId,
          serverTotalMs: remoteMomentPage.serverTotalMs,
          status: 'completed',
          updatedAt: Date.now(),
        });
        console.info('[moment_sync]', {
          count: remoteMomentPage.moments.length,
          durationMs: getRemoteMomentSyncDuration(startedAt),
          event: 'boot_remote_moments_completed',
          hasMore: remoteMomentPage.hasMore,
          status: 'completed',
        });
      } catch (error) {
        if (isMounted) {
          const status = isRemoteMomentSyncTimeout(error) ? 'timeout' : 'failed';
          const reason = error instanceof Error ? error.message : 'Unknown error';
          didFinishInitialRemoteSync = true;
          setRemoteMomentSyncStatus(status);
          setRemoteMomentSyncDiagnostics({
            count: null,
            durationMs: getRemoteMomentSyncDuration(startedAt),
            hasMore: null,
            reason,
            requestId: null,
            serverTotalMs: null,
            status,
            updatedAt: Date.now(),
          });
          console.info('[moment_sync]', {
            durationMs: getRemoteMomentSyncDuration(startedAt),
            event: 'boot_remote_moments_finished',
            reason,
            status,
          });
        }
        console.warn(
          'Supabase moment list failed:',
          error instanceof Error ? error.message : 'Unknown error',
        );
      }
    }

    void loadRemoteMoments();

    return () => {
      isMounted = false;
      if (!didFinishInitialRemoteSync) {
        hasStartedInitialRemoteSyncRef.current = false;
      }
    };
  }, [
    isStorageLoaded,
    isRemoteMomentSyncConfigured,
    initialRemoteMomentPageLimit,
    syncRemoteMoments,
  ]);

  const isRemoteMomentSyncLoaded =
    !isRemoteMomentSyncConfigured ||
    remoteMomentSyncStatus === 'completed' ||
    remoteMomentSyncStatus === 'failed' ||
    remoteMomentSyncStatus === 'recovered_after_timeout' ||
    remoteMomentSyncStatus === 'timeout';
  const hasCompletedInitialRemoteMomentSync =
    !isRemoteMomentSyncConfigured ||
    remoteMomentSyncStatus === 'completed' ||
    remoteMomentSyncStatus === 'recovered_after_timeout';
  const hasFinishedInitialRemoteMomentSync =
    !isRemoteMomentSyncConfigured ||
    remoteMomentSyncStatus === 'completed' ||
    remoteMomentSyncStatus === 'failed' ||
    remoteMomentSyncStatus === 'recovered_after_timeout' ||
    remoteMomentSyncStatus === 'timeout';
  const markRemoteMomentSyncCompleted = useCallback(
    (diagnostics?: {
      count?: number;
      durationMs?: number;
      hasMore?: boolean;
      reason?: string | null;
      recoveredFrom?: RemoteMomentSyncStatus;
      requestId?: string | null;
      serverTotalMs?: number | null;
    }) => {
      setRemoteMomentSyncStatus((currentStatus) => {
        const status =
          diagnostics?.recoveredFrom === 'timeout' ||
          diagnostics?.recoveredFrom === 'failed' ||
          currentStatus === 'timeout' ||
          currentStatus === 'failed'
            ? 'recovered_after_timeout'
            : 'completed';

        setRemoteMomentSyncDiagnostics((current) => ({
          count: diagnostics?.count ?? current.count,
          durationMs: diagnostics?.durationMs ?? current.durationMs,
          hasMore: diagnostics?.hasMore ?? current.hasMore,
          reason:
            diagnostics?.reason ??
            (status === 'recovered_after_timeout'
              ? 'Remote moment sync recovered after timeout.'
              : null),
          requestId: diagnostics?.requestId ?? current.requestId,
          serverTotalMs: diagnostics?.serverTotalMs ?? current.serverTotalMs,
          status,
          updatedAt: Date.now(),
        }));

        return status;
      });
    },
    [],
  );

  return {
    isLoadingInitialMoments:
      !isStorageLoaded ||
      (isRemoteMomentSyncConfigured && remoteMomentSyncStatus === 'loading') ||
      remoteMomentSyncStatus === 'waiting_for_storage',
    isInitialRemoteMomentSyncPending:
      isRemoteMomentSyncConfigured && !hasFinishedInitialRemoteMomentSync,
    hasInitialRemoteMomentPage,
    isRemoteMomentSyncLoaded,
    isStorageLoaded,
    initialRemoteMoments,
    initialRemoteMomentPageInfo,
    markRemoteMomentSyncCompleted,
    remoteMomentSyncDiagnostics,
    remoteMomentSyncStatus,
  };
}

function isRemoteMomentSyncTimeout(error: unknown) {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes('timed out')
  );
}

function restorePersistedSessionMaps({
  parsed,
  setAnalysisBySessionId,
  setGeminiEvidenceBySessionId,
  setOpenAiBenchmarkBySessionId,
  setRemoteMomentIdsBySessionId,
  setThumbnailsBySessionId,
  setUploadReconciliationCandidatesBySessionId,
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
  setUploadReconciliationCandidatesBySessionId?: Dispatch<
    SetStateAction<Record<string, UploadReconciliationCandidate>>
  >;
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

  if (
    parsed.uploadReconciliationCandidatesBySessionId &&
    typeof parsed.uploadReconciliationCandidatesBySessionId === 'object'
  ) {
    setUploadReconciliationCandidatesBySessionId?.(
      parsed.uploadReconciliationCandidatesBySessionId,
    );
  }
}

export async function listMomentsWithTimeout() {
  const page = await listMomentPageWithTimeout();

  return page.moments;
}

export async function listMomentPageWithTimeout(
  options: ListMomentsOptions = {},
) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      listMomentsPage(options),
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
