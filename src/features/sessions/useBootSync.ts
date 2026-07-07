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
import {
  loadRecentJournalSnapshot,
  saveRecentJournalSnapshot,
  type JournalSnapshotCacheOwnerKey,
} from './journalSnapshotCache';
import type { UploadReconciliationCandidate } from './sessionMerge';

type UseBootSyncParams = {
  initialGroupId: string;
  initialRemoteMomentPageLimit?: number;
  journalSnapshotCacheOwnerKey?: JournalSnapshotCacheOwnerKey | null;
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
export type InitialRemoteMomentPageSource = 'local_snapshot' | 'remote_summary';
export type RemoteMomentSyncDiagnostics = {
  authClaimsMs: number | null;
  authGetUserMs: number | null;
  authVerificationMode: string | null;
  count: number | null;
  durationMs: number | null;
  evidenceQueryMs: number | null;
  hasMore: boolean | null;
  journalCacheAgeMs: number | null;
  journalCacheCount: number | null;
  journalCacheReason: string | null;
  journalCacheRefreshStatus: 'idle' | 'loading' | 'completed' | 'failed';
  journalCacheSource: 'local_snapshot' | 'none' | 'remote_summary';
  journalCacheStale: boolean | null;
  momentsQueryMs: number | null;
  publicUserLookupMs: number | null;
  reason: string | null;
  requestId: string | null;
  requestUserInflightHit: boolean | null;
  requestUserInflightWaitMs: number | null;
  resolveRequestUserMs: number | null;
  responseBytes: number | null;
  serverTotalMs: number | null;
  status: RemoteMomentSyncStatus;
  thumbnailSignedUrlWallMs: number | null;
  updatedAt: number | null;
  view: string | null;
};

function getRemoteMomentSyncDuration(startedAt: number) {
  return Date.now() - startedAt;
}

export function useBootSync({
  initialGroupId,
  initialRemoteMomentPageLimit,
  journalSnapshotCacheOwnerKey = null,
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
  const [initialRemoteMomentPageSource, setInitialRemoteMomentPageSource] =
    useState<InitialRemoteMomentPageSource | null>(null);
  const [hasInitialRemoteMomentPage, setHasInitialRemoteMomentPage] =
    useState(false);
  const [hasAppliedJournalSnapshotCache, setHasAppliedJournalSnapshotCache] =
    useState(false);
  const [isStorageLoaded, setIsStorageLoaded] = useState(false);
  const [remoteMomentSyncStatus, setRemoteMomentSyncStatus] =
    useState<RemoteMomentSyncStatus>(
      isRemoteMomentSyncConfigured ? 'waiting_for_storage' : 'not_configured',
    );
  const [remoteMomentSyncDiagnostics, setRemoteMomentSyncDiagnostics] =
    useState<RemoteMomentSyncDiagnostics>({
      authClaimsMs: null,
      authGetUserMs: null,
      authVerificationMode: null,
      count: null,
      durationMs: null,
      evidenceQueryMs: null,
      hasMore: null,
      journalCacheAgeMs: null,
      journalCacheCount: null,
      journalCacheReason: null,
      journalCacheRefreshStatus: 'idle',
      journalCacheSource: 'none',
      journalCacheStale: null,
      momentsQueryMs: null,
      publicUserLookupMs: null,
      reason: null,
      requestId: null,
      requestUserInflightHit: null,
      requestUserInflightWaitMs: null,
      resolveRequestUserMs: null,
      responseBytes: null,
      serverTotalMs: null,
      status: isRemoteMomentSyncConfigured
        ? 'waiting_for_storage'
        : 'not_configured',
      thumbnailSignedUrlWallMs: null,
      updatedAt: null,
      view: null,
    });
  const previousRemoteMomentSyncEnabledRef = useRef(remoteMomentSyncEnabled);
  const hasStartedInitialRemoteSyncRef = useRef(false);
  const syncRemoteMomentsRef = useRef(syncRemoteMoments);

  useEffect(() => {
    syncRemoteMomentsRef.current = syncRemoteMoments;
  }, [syncRemoteMoments]);

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
      setInitialRemoteMomentPageSource(null);
      setHasAppliedJournalSnapshotCache(false);
      setInitialRemoteMomentPageInfo({
        hasMore: false,
        nextCursor: null,
      });
      setRemoteMomentSyncStatus(
        hasConfiguredSupabaseMoments() ? 'waiting_for_storage' : 'not_configured',
      );
      setRemoteMomentSyncDiagnostics({
        authClaimsMs: null,
        authGetUserMs: null,
        authVerificationMode: null,
        count: null,
        durationMs: null,
        evidenceQueryMs: null,
        hasMore: null,
        journalCacheAgeMs: null,
        journalCacheCount: null,
        journalCacheReason: null,
        journalCacheRefreshStatus: 'idle',
        journalCacheSource: 'none',
        journalCacheStale: null,
        momentsQueryMs: null,
        publicUserLookupMs: null,
        reason: null,
        requestId: null,
        requestUserInflightHit: null,
        requestUserInflightWaitMs: null,
        resolveRequestUserMs: null,
        responseBytes: null,
        serverTotalMs: null,
        status: hasConfiguredSupabaseMoments()
          ? 'waiting_for_storage'
          : 'not_configured',
        thumbnailSignedUrlWallMs: null,
        updatedAt: Date.now(),
        view: null,
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
      let snapshotCacheApplied = false;
      setRemoteMomentSyncDiagnostics({
        authClaimsMs: null,
        authGetUserMs: null,
        authVerificationMode: null,
        count: null,
        durationMs: null,
        evidenceQueryMs: null,
        hasMore: null,
        journalCacheAgeMs: null,
        journalCacheCount: null,
        journalCacheReason: null,
        journalCacheRefreshStatus: 'loading',
        journalCacheSource: 'none',
        journalCacheStale: null,
        momentsQueryMs: null,
        publicUserLookupMs: null,
        reason: null,
        requestId: null,
        requestUserInflightHit: null,
        requestUserInflightWaitMs: null,
        resolveRequestUserMs: null,
        responseBytes: null,
        serverTotalMs: null,
        status: 'loading',
        thumbnailSignedUrlWallMs: null,
        updatedAt: startedAt,
        view: null,
      });

      try {
        const snapshotResult = await loadRecentJournalSnapshot(
          journalSnapshotCacheOwnerKey,
        );

        if (!isMounted) {
          return;
        }

        if (snapshotResult.hit) {
          snapshotCacheApplied = true;
          const snapshot = snapshotResult.snapshot;

          syncRemoteMomentsRef.current(snapshot.moments);
          setInitialRemoteMoments(snapshot.moments);
          setInitialRemoteMomentPageInfo({
            hasMore: snapshot.hasMore,
            nextCursor: snapshot.nextCursor,
          });
          setInitialRemoteMomentPageSource('local_snapshot');
          setHasInitialRemoteMomentPage(true);
          setHasAppliedJournalSnapshotCache(true);
          setRemoteMomentSyncDiagnostics((current) => ({
            ...current,
            count: snapshot.snapshotCount,
            hasMore: snapshot.hasMore,
            journalCacheAgeMs: snapshot.ageMs,
            journalCacheCount: snapshot.snapshotCount,
            journalCacheReason: 'hit',
            journalCacheRefreshStatus: 'loading',
            journalCacheSource: 'local_snapshot',
            journalCacheStale: false,
            updatedAt: Date.now(),
            view: 'summary',
          }));
          console.info('[moment_sync]', {
            count: snapshot.snapshotCount,
            event: 'boot_journal_snapshot_cache_hit',
            status: 'hit',
          });
        } else {
          setRemoteMomentSyncDiagnostics((current) => ({
            ...current,
            journalCacheReason: snapshotResult.reason,
            journalCacheRefreshStatus: 'loading',
            journalCacheSource: 'none',
            journalCacheStale: snapshotResult.reason === 'expired',
            updatedAt: Date.now(),
          }));
        }
      } catch (error) {
        setRemoteMomentSyncDiagnostics((current) => ({
          ...current,
          journalCacheReason:
            error instanceof Error ? error.message : 'snapshot_cache_error',
          journalCacheRefreshStatus: 'loading',
          journalCacheSource: 'none',
          journalCacheStale: null,
          updatedAt: Date.now(),
        }));
      }

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

        syncRemoteMomentsRef.current(remoteMomentPage.moments);
        void saveRecentJournalSnapshot({
          ownerKey: journalSnapshotCacheOwnerKey,
          page: remoteMomentPage,
        }).catch((error) => {
          console.warn(
            'Recent journal snapshot save failed:',
            error instanceof Error ? error.message : 'Unknown error',
          );
        });
        setInitialRemoteMoments(remoteMomentPage.moments);
        setInitialRemoteMomentPageInfo({
          hasMore: remoteMomentPage.hasMore,
          nextCursor: remoteMomentPage.nextCursor,
        });
        setInitialRemoteMomentPageSource('remote_summary');
        setHasInitialRemoteMomentPage(true);
        didFinishInitialRemoteSync = true;
        setRemoteMomentSyncStatus('completed');
        setRemoteMomentSyncDiagnostics({
          authClaimsMs: remoteMomentPage.authClaimsMs,
          authGetUserMs: remoteMomentPage.authGetUserMs,
          authVerificationMode: remoteMomentPage.authVerificationMode,
          count: remoteMomentPage.moments.length,
          durationMs: getRemoteMomentSyncDuration(startedAt),
          evidenceQueryMs: remoteMomentPage.evidenceQueryMs,
          hasMore: remoteMomentPage.hasMore,
          journalCacheAgeMs: snapshotCacheApplied
            ? getRemoteMomentSyncDuration(startedAt)
            : null,
          journalCacheCount: remoteMomentPage.moments.length,
          journalCacheReason: null,
          journalCacheRefreshStatus: 'completed',
          journalCacheSource: 'remote_summary',
          journalCacheStale: false,
          momentsQueryMs: remoteMomentPage.momentsQueryMs,
          publicUserLookupMs: remoteMomentPage.publicUserLookupMs,
          reason: null,
          requestId: remoteMomentPage.requestId,
          requestUserInflightHit: remoteMomentPage.requestUserInflightHit,
          requestUserInflightWaitMs: remoteMomentPage.requestUserInflightWaitMs,
          resolveRequestUserMs: remoteMomentPage.resolveRequestUserMs,
          responseBytes: remoteMomentPage.responseBytes,
          serverTotalMs: remoteMomentPage.serverTotalMs,
          status: 'completed',
          thumbnailSignedUrlWallMs: remoteMomentPage.thumbnailSignedUrlWallMs,
          updatedAt: Date.now(),
          view: remoteMomentPage.view,
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
            authClaimsMs: null,
            authGetUserMs: null,
            authVerificationMode: null,
            count: null,
            durationMs: getRemoteMomentSyncDuration(startedAt),
            evidenceQueryMs: null,
            hasMore: null,
            journalCacheAgeMs: null,
            journalCacheCount: null,
            journalCacheReason: reason,
            journalCacheRefreshStatus: 'failed',
            journalCacheSource: snapshotCacheApplied ? 'local_snapshot' : 'none',
            journalCacheStale: snapshotCacheApplied,
            momentsQueryMs: null,
            publicUserLookupMs: null,
            reason,
            requestId: null,
            requestUserInflightHit: null,
            requestUserInflightWaitMs: null,
            resolveRequestUserMs: null,
            responseBytes: null,
            serverTotalMs: null,
            status,
            thumbnailSignedUrlWallMs: null,
            updatedAt: Date.now(),
            view: null,
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
    journalSnapshotCacheOwnerKey,
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
      evidenceQueryMs?: number | null;
      hasMore?: boolean;
      momentsQueryMs?: number | null;
      publicUserLookupMs?: number | null;
      reason?: string | null;
      recoveredFrom?: RemoteMomentSyncStatus;
      requestId?: string | null;
      requestUserInflightHit?: boolean | null;
      requestUserInflightWaitMs?: number | null;
      resolveRequestUserMs?: number | null;
      responseBytes?: number | null;
      serverTotalMs?: number | null;
      thumbnailSignedUrlWallMs?: number | null;
      view?: string | null;
      authClaimsMs?: number | null;
      authGetUserMs?: number | null;
      authVerificationMode?: string | null;
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
          authClaimsMs: diagnostics?.authClaimsMs ?? current.authClaimsMs,
          authGetUserMs: diagnostics?.authGetUserMs ?? current.authGetUserMs,
          authVerificationMode:
            diagnostics?.authVerificationMode ?? current.authVerificationMode,
          count: diagnostics?.count ?? current.count,
          durationMs: diagnostics?.durationMs ?? current.durationMs,
          evidenceQueryMs:
            diagnostics?.evidenceQueryMs ?? current.evidenceQueryMs,
          hasMore: diagnostics?.hasMore ?? current.hasMore,
          journalCacheAgeMs: current.journalCacheAgeMs,
          journalCacheCount: current.journalCacheCount,
          journalCacheReason: current.journalCacheReason,
          journalCacheRefreshStatus: current.journalCacheRefreshStatus,
          journalCacheSource: current.journalCacheSource,
          journalCacheStale: current.journalCacheStale,
          momentsQueryMs: diagnostics?.momentsQueryMs ?? current.momentsQueryMs,
          publicUserLookupMs:
            diagnostics?.publicUserLookupMs ?? current.publicUserLookupMs,
          reason:
            diagnostics?.reason ??
            (status === 'recovered_after_timeout'
              ? 'Remote moment sync recovered after timeout.'
              : null),
          requestId: diagnostics?.requestId ?? current.requestId,
          requestUserInflightHit:
            diagnostics?.requestUserInflightHit ??
            current.requestUserInflightHit,
          requestUserInflightWaitMs:
            diagnostics?.requestUserInflightWaitMs ??
            current.requestUserInflightWaitMs,
          resolveRequestUserMs:
            diagnostics?.resolveRequestUserMs ?? current.resolveRequestUserMs,
          responseBytes: diagnostics?.responseBytes ?? current.responseBytes,
          serverTotalMs: diagnostics?.serverTotalMs ?? current.serverTotalMs,
          status,
          thumbnailSignedUrlWallMs:
            diagnostics?.thumbnailSignedUrlWallMs ??
            current.thumbnailSignedUrlWallMs,
          updatedAt: Date.now(),
          view: diagnostics?.view ?? current.view,
        }));

        return status;
      });
    },
    [],
  );

  return {
    isLoadingInitialMoments:
      !isStorageLoaded ||
      (isRemoteMomentSyncConfigured &&
        !hasAppliedJournalSnapshotCache &&
        remoteMomentSyncStatus === 'not_configured') ||
      (isRemoteMomentSyncConfigured &&
        !hasAppliedJournalSnapshotCache &&
        remoteMomentSyncStatus === 'loading') ||
      (!hasAppliedJournalSnapshotCache &&
        remoteMomentSyncStatus === 'waiting_for_storage'),
    isInitialRemoteMomentSyncPending:
      isRemoteMomentSyncConfigured && !hasFinishedInitialRemoteMomentSync,
    hasInitialRemoteMomentPage,
    isRemoteMomentSyncLoaded,
    isStorageLoaded,
    initialRemoteMoments,
    initialRemoteMomentPageInfo,
    initialRemoteMomentPageSource,
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
