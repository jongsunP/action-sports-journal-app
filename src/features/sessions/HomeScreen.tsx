import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  Alert,
  AppState,
  type AppStateStatus,
  InteractionManager,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { TabView } from 'react-native-tab-view';

import {
  getConfiguredAiEndpoints,
  hasConfiguredGeminiEvidenceEndpoint,
} from '../../services/ai';
import {
  getLatestAnalysisNotificationRefreshRequest,
  subscribeToAnalysisNotificationRefresh,
} from '../../services/notifications/analysisNotificationRefreshEvents';
import { useAuthSession } from '../../services/auth/AuthSessionProvider';
import { mockActivityGroups } from '../groups/mockActivityGroups';
import {
  finalizeUploadedSourceVideo,
  hasConfiguredSupabaseMoments,
} from '../../services/moments';
import {
  getMomentStatus,
  getVisibleMomentStatus,
} from './momentStatus';
import {
  APP_TABS,
  type AppTabId,
  BottomNavigation,
  FlowPlaceholderTab,
  JournalSnapshot,
  PrimaryInsightCard,
  RecentSessionsRail,
  type VideoArchiveLoadState,
  VideoArchiveList,
} from './sessionComponents';
import {
  formatShortSessionDate,
  formatVideoMeta,
  getCompletedMomentEvidence,
  getSessionCardPresentation,
  getVideoArchiveDescription,
  getVideoAssetFromSession,
} from './sessionFormatters';
import {
  clearPersistedSessionState,
  savePersistedSessionState,
  type PersistedSessionState,
} from './sessionStorage';
import {
  resetMomentDetailRuntimeState,
  setMomentDetailRuntimeState,
} from './momentDetailRuntimeStore';
import {
  resetUploadRuntimeState,
  setUploadRuntimeState,
} from './uploadRuntimeStore';
import {
  listMomentPageWithTimeout,
  useBootSync,
} from './useBootSync';
import { useAnalysisRealtimeSync } from './useAnalysisRealtimeSync';
import { useDeleteMoment } from './useDeleteMoment';
import { useEvidenceExtraction } from './useEvidenceExtraction';
import {
  resolveLocalSessionIdForRemoteMoment,
  type UploadReconciliationCandidate,
} from './sessionMerge';
import { useMomentDetail } from './useMomentDetail';
import { useSyncRemoteMoments } from './useSyncRemoteMoments';
import { useSessionRepository } from './useSessionRepository';
import { useUploadMoment } from './useUploadMoment';

import type {
  AnalysisResult,
  Session,
} from '../../types';
import type { RootStackParamList } from '../../navigation/types';
import type { RemoteMomentRecord } from '../../services/moments';
import {
  useAppTheme,
  type AppThemeColors,
} from '../../theme';

const ACTIVE_WAKEBOARD_GROUP_ID = 'group-wakeboard';
const ENABLE_INTERNAL_DEBUG_VIEWER =
  __DEV__ || process.env.EXPO_PUBLIC_ENABLE_DEBUG_VIEWER === 'true';
const ENABLE_QA_DEBUG_PANEL =
  process.env.EXPO_PUBLIC_ENABLE_QA_DEBUG_PANEL !== 'false';
const ENABLE_ANALYSIS_PUSH_NOTIFICATIONS =
  process.env.EXPO_PUBLIC_ENABLE_ANALYSIS_PUSH_NOTIFICATIONS === 'true';
type RemoteRefreshReason =
  | 'foreground'
  | 'initial_retry'
  | 'upload_success'
  | 'push_response'
  | 'realtime';
type AnalysisCompletionNotice = {
  sessionId: string;
  title: string;
};
type RemoteMomentFirstPage = {
  moments: RemoteMomentRecord[];
  hasMore: boolean;
  nextCursor: string | null;
};
type RequestDiagnosticsStatus =
  | 'empty'
  | 'error'
  | 'idle'
  | 'loading'
  | 'ready'
  | 'timeout';
type RequestDiagnostics = {
  count: number | null;
  durationMs: number | null;
  hasMore: boolean | null;
  reason: string | null;
  retryCount: number;
  status: RequestDiagnosticsStatus;
  updatedAt: number | null;
};
type AuthCacheOwnerKey =
  | 'internalFallback'
  | 'loginRequired'
  | `authenticated:${string}`;

const PUSH_RESPONSE_BOOT_DEDUPE_MS = 8_000;
const MOMENT_LIST_PAGE_SIZE = 20;
const LOCAL_ONLY_UPLOAD_TTL_MS = 45_000;
const UPLOAD_RECONCILIATION_TTL_MS = 3 * 60_000;
const UPLOAD_RECOVERY_ATTEMPT_INTERVAL_MS = 25_000;
const UPLOAD_FAILURE_REMOTE_RECONCILE_RETRY_MS = 1_200;
const ANALYSIS_REALTIME_INTERNAL_FALLBACK_CHANNEL =
  'analysis-updates:internal-default';

function getRequestDurationMs(startedAt: number) {
  return Date.now() - startedAt;
}

function isRemoteRequestTimeout(error: unknown) {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes('timed out')
  );
}

function compactDebugReason(reason: string | null) {
  if (!reason) {
    return '-';
  }

  return reason.replace(/\s+/g, ' ').slice(0, 72);
}

function formatDebugTimestamp(updatedAt: number | null) {
  if (!updatedAt) {
    return '-';
  }

  return new Date(updatedAt).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function ensureAnalysisPushRegistration(source: string) {
  if (!ENABLE_ANALYSIS_PUSH_NOTIFICATIONS) {
    return;
  }

  import('../../services/notifications/registerAnalysisPushNotifications')
    .then(({ registerForAnalysisPushNotifications }) =>
      registerForAnalysisPushNotifications({ source }),
    )
    .then((result) => {
      console.info('[push_registration]', {
        event: 'analysis_push_registration_ensure_result',
        reason: result.reason,
        registered: result.registered,
        source,
        status: result.status,
      });
    })
    .catch((error) => {
      console.warn(
        'Push notification registration ensure failed:',
        error instanceof Error ? error.message : 'Unknown error',
      );
    });
}

function getAuthCacheOwnerKey({
  authMode,
  userId,
}: {
  authMode: 'authLoading' | 'authenticated' | 'internalFallback' | 'loginRequired';
  userId?: string;
}): AuthCacheOwnerKey | null {
  if (authMode === 'authLoading') {
    return null;
  }

  if (authMode === 'authenticated') {
    return userId ? `authenticated:${userId}` : 'loginRequired';
  }

  return authMode;
}

function getNextPendingRemoteRefreshReason(
  currentReason: RemoteRefreshReason | null,
  nextReason: RemoteRefreshReason,
) {
  if (currentReason === 'upload_success' || nextReason === 'upload_success') {
    return 'upload_success';
  }

  return nextReason;
}

function mergeStyleMaps<T extends Record<string, any>>(
  base: T,
  overrides: Record<string, any>,
) : T & Record<string, any> {
  const merged = { ...base } as Record<string, any>;

  Object.entries(overrides).forEach(([key, value]) => {
    merged[key] = base[key] ? [base[key], value] : value;
  });

  return merged as T & Record<string, any>;
}

export function HomeScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList, 'Home'>>();
  const layout = useWindowDimensions();
  const theme = useAppTheme();
  const prefersDarkMode = theme.mode === 'dark';
  const headerUploadIconColor =
    theme.mode === 'light' ? '#ffffff' : '#050507';
  const styles = useMemo(
    () =>
      mergeStyleMaps(
        baseStyles,
        createHomeThemeStyles(theme.colors, theme.mode),
      ),
    [theme.colors, theme.mode],
  );
  const { authBootstrapDiagnostics, authMode, user } = useAuthSession();
  const canUseRemoteApi =
    authMode === 'authenticated' || authMode === 'internalFallback';
  const isAuthLoading = authMode === 'authLoading';
  const isLoginRequired = authMode === 'loginRequired';
  const realtimeAnalysisChannelName =
    authMode === 'authenticated' && user?.id
      ? `analysis-updates:auth:${user.id}`
      : authMode === 'internalFallback'
        ? ANALYSIS_REALTIME_INTERNAL_FALLBACK_CHANNEL
        : null;
  const [selectedGroupId, setSelectedGroupId] = useState(
    ACTIVE_WAKEBOARD_GROUP_ID,
  );
  const [activeTab, setActiveTab] = useState<AppTabId>('home');
  const activeTabRef = useRef<AppTabId>('home');
  const [analysisCompletionNotice, setAnalysisCompletionNotice] =
    useState<AnalysisCompletionNotice | null>(null);
  // Video Archive owns paged order. Global sessions remain cache/detail source.
  const [hasMoreVideoArchiveMoments, setHasMoreVideoArchiveMoments] =
    useState(false);
  const [hasLoadedVideoArchiveFirstPage, setHasLoadedVideoArchiveFirstPage] =
    useState(false);
  const [hasMountedVideoTab, setHasMountedVideoTab] = useState(false);
  const [isLoadingVideoArchiveInitialPage, setIsLoadingVideoArchiveInitialPage] =
    useState(false);
  const [videoArchiveLoadState, setVideoArchiveLoadState] =
    useState<VideoArchiveLoadState>('empty');
  const [isQADebugPanelOpen, setIsQADebugPanelOpen] = useState(false);
  const [videoArchiveDiagnostics, setVideoArchiveDiagnostics] =
    useState<RequestDiagnostics>({
      count: null,
      durationMs: null,
      hasMore: null,
      reason: null,
      retryCount: 0,
      status: 'empty',
      updatedAt: null,
    });
  const [
    isLoadingMoreVideoArchiveMoments,
    setIsLoadingMoreVideoArchiveMoments,
  ] = useState(false);
  const [videoArchiveSessionIds, setVideoArchiveSessionIds] = useState<
    string[]
  >([]);
  const [
    uploadReconciliationCandidatesBySessionId,
    setUploadReconciliationCandidatesBySessionId,
  ] = useState<Record<string, UploadReconciliationCandidate>>({});
  const [
    sourceVideoStorageStatusBySessionId,
    setSourceVideoStorageStatusBySessionId,
  ] = useState<Record<string, string>>({});
  const [videoArchiveNextCursor, setVideoArchiveNextCursor] = useState<
    string | null
  >(null);
  const handledNotificationRefreshRequestIdRef = useRef<number | null>(null);
  const authCacheOwnerKeyRef = useRef<AuthCacheOwnerKey | null>(null);
  const isRefreshingRemoteMomentsRef = useRef(false);
  const pendingRemoteRefreshReasonRef = useRef<RemoteRefreshReason | null>(null);
  const hasAppliedBootVideoArchivePageRef = useRef(false);
  const hasLoadedVideoArchiveFirstPageRef = useRef(false);
  const isLoadingVideoArchiveInitialPageRef = useRef(false);
  const completedBootSyncAtRef = useRef<number | null>(null);
  const didTriggerSwipeHapticRef = useRef(false);
  const pendingVideoArchiveSessionIdsRef = useRef<Set<string>>(new Set());
  const recoveringUploadSessionIdsRef = useRef<Set<string>>(new Set());
  const hasAttemptedBootUploadRecoveryRef = useRef(false);
  const {
    analysisBySessionId,
    geminiEvidenceBySessionId,
    openAiBenchmarkBySessionId,
    remoteMomentIdsBySessionId,
    removeSessionLocally: removeSessionDataLocally,
    sessions,
    setAnalysisBySessionId,
    setGeminiEvidenceBySessionId,
    setOpenAiBenchmarkBySessionId,
    setRemoteMomentIdForSession,
    setRemoteMomentIdsBySessionId,
    setSessions,
    setThumbnailForSession,
    setThumbnailsBySessionId,
    setUserConfirmedTrickBySessionId,
    setVideoForSession,
    setVideosBySessionId,
    thumbnailsBySessionId,
    userConfirmedTrickBySessionId,
    videosBySessionId,
  } = useSessionRepository();
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const didNavigateToUploadRef = useRef(false);
  const pendingRealtimeCompletionNoticeRef =
    useRef<AnalysisCompletionNotice | null>(null);
  const selectMomentDetailRef = useRef<(sessionId: string) => void>(() => {});
  const {
    extractingEvidenceBySessionId,
    handleExtractEvidence,
    updateLocalMomentStatus,
  } = useEvidenceExtraction({
    remoteMomentIdsBySessionId,
    selectMomentDetail: (sessionId) => selectMomentDetailRef.current(sessionId),
    setSessions,
    userConfirmedTrickBySessionId,
    videosBySessionId,
  });
  const {
    closeMomentDetail,
    closeMomentDetailIfSelected,
    selectMomentDetail,
  } = useMomentDetail({
    extractingEvidenceBySessionId,
    geminiEvidenceBySessionId,
    sessions,
    videosBySessionId,
  });
  selectMomentDetailRef.current = selectMomentDetail;

  const clearUploadReconciliationCandidate = useCallback(
    (sessionId: string) => {
      setUploadReconciliationCandidatesBySessionId((current) => {
        if (!current[sessionId]) {
          return current;
        }

        const next = { ...current };
        delete next[sessionId];
        return next;
      });
    },
    [],
  );
  const upsertUploadReconciliationCandidate = useCallback(
    (candidate: UploadReconciliationCandidate) => {
      setUploadReconciliationCandidatesBySessionId((current) => ({
        ...current,
        [candidate.localSessionId]: candidate,
      }));
      console.info('[moment_reconciliation]', {
        draftId: candidate.draftId,
        event: 'upload_reconciliation_candidate_created',
        fileSize: candidate.fileSize,
        localSessionId: candidate.localSessionId,
        matched: false,
        uploadId: candidate.uploadId,
      });
    },
    [],
  );
  const markUploadReconciliationCandidateWithTarget = useCallback(
    (
      sessionId: string,
      uploadTarget: {
        draftId: string;
        fileSize?: number;
        durationMs?: number;
        provider?: string;
        bucket?: string;
        storagePath: string;
        uploadedThumbnail?: {
          storageProvider: string;
          storageBucket: string;
          storagePath: string;
        };
        uploadId: string;
      },
      draftId?: string,
    ) => {
      setUploadReconciliationCandidatesBySessionId((current) => {
        const candidate = current[sessionId];

        if (!candidate) {
          return current;
        }

        return {
          ...current,
          [sessionId]: {
            ...candidate,
            draftId: draftId ?? uploadTarget.draftId ?? candidate.draftId,
            durationMs: uploadTarget.durationMs ?? candidate.durationMs,
            fileSize: uploadTarget.fileSize ?? candidate.fileSize,
            storageBucket: uploadTarget.bucket ?? candidate.storageBucket,
            storagePath: uploadTarget.storagePath,
            storageProvider: uploadTarget.provider ?? candidate.storageProvider,
            thumbnailStorageBucket:
              uploadTarget.uploadedThumbnail?.storageBucket ??
              candidate.thumbnailStorageBucket,
            thumbnailStoragePath:
              uploadTarget.uploadedThumbnail?.storagePath ??
              candidate.thumbnailStoragePath,
            thumbnailStorageProvider:
              uploadTarget.uploadedThumbnail?.storageProvider ??
              candidate.thumbnailStorageProvider,
            uploadId: uploadTarget.uploadId,
          },
        };
      });
      console.info('[moment_reconciliation]', {
        draftId: draftId ?? uploadTarget.draftId,
        event: 'upload_reconciliation_candidate_targeted',
        localSessionId: sessionId,
        matched: false,
        state: 'recoverable_orphan',
        storagePath: uploadTarget.storagePath,
        uploadId: uploadTarget.uploadId,
      });
    },
    [],
  );
  const handleRemoteMomentReconciled = useCallback(
    ({
      localSessionId,
      matchReason,
      momentId,
      remoteSessionId,
    }: {
      localSessionId: string;
      matchReason: string;
      momentId: string;
      remoteSessionId: string;
    }) => {
      pendingVideoArchiveSessionIdsRef.current.delete(localSessionId);
      clearUploadReconciliationCandidate(localSessionId);
      console.info('[moment_reconciliation]', {
        event: 'remote_moment_reconciled',
        localSessionId,
        matchReason,
        matched: true,
        momentId,
        remoteSessionId,
      });
    },
    [clearUploadReconciliationCandidate],
  );

  const recoverUnfinalizedUploadCandidates = useCallback(
    async (reason: RemoteRefreshReason | 'boot_recovery') => {
      if (!hasConfiguredSupabaseMoments()) {
        return false;
      }

      const now = Date.now();
      const candidates = Object.values(
        uploadReconciliationCandidatesBySessionId,
      );
      let recoveredAny = false;

      for (const candidate of candidates) {
        const session = sessions.find(
          (currentSession) => currentSession.id === candidate.localSessionId,
        );

        if (
          !session ||
          remoteMomentIdsBySessionId[candidate.localSessionId] ||
          !candidate.uploadId ||
          !candidate.storagePath ||
          !candidate.storageProvider ||
          !candidate.storageBucket ||
          !(
            session.momentStatus === 'uploading' ||
            session.momentStatus === 'queued' ||
            session.momentStatus === 'processing'
          )
        ) {
          continue;
        }

        if (recoveringUploadSessionIdsRef.current.has(candidate.localSessionId)) {
          continue;
        }

        const lastAttemptAtMs = candidate.recoveryAttemptedAt
          ? Date.parse(candidate.recoveryAttemptedAt)
          : Number.NaN;
        const attemptedRecently =
          Number.isFinite(lastAttemptAtMs) &&
          now - lastAttemptAtMs < UPLOAD_RECOVERY_ATTEMPT_INTERVAL_MS;

        if (attemptedRecently) {
          continue;
        }

        recoveringUploadSessionIdsRef.current.add(candidate.localSessionId);
        const attemptedAt = new Date().toISOString();

        setUploadReconciliationCandidatesBySessionId((current) => {
          const currentCandidate = current[candidate.localSessionId];

          if (!currentCandidate) {
            return current;
          }

          return {
            ...current,
            [candidate.localSessionId]: {
              ...currentCandidate,
              recoveryAttemptedAt: attemptedAt,
            },
          };
        });

        console.info('[moment_reconciliation]', {
          event: 'recoverable_orphan_recovery_started',
          localSessionId: candidate.localSessionId,
          matchReason: 'recoverable_upload_target',
          reason,
          state: 'recoverable_orphan',
          storagePath: candidate.storagePath,
          uploadId: candidate.uploadId,
        });

        try {
          const localVideo =
            videosBySessionId[candidate.localSessionId] ??
            getVideoAssetFromSession(session);
          const candidateVideoUri =
            localVideo?.uri ?? candidate.sourceVideoUri ?? session.videoUri;
          const storedMoment = await finalizeUploadedSourceVideo({
            draftId: candidate.draftId ?? candidate.uploadId,
            uploadId: candidate.uploadId,
            storageProvider: candidate.storageProvider,
            storageBucket: candidate.storageBucket,
            storagePath: candidate.storagePath,
            session,
            video: candidateVideoUri
              ? {
                  uri: candidateVideoUri,
                  duration: candidate.durationMs ?? localVideo?.duration,
                  fileName:
                    candidate.fileName ??
                    localVideo?.fileName ??
                    `${session.id}.mov`,
                  fileSize: candidate.fileSize ?? localVideo?.fileSize,
                  mimeType: localVideo?.mimeType ?? 'video/quicktime',
                }
              : null,
            thumbnailStorageProvider: candidate.thumbnailStorageProvider,
            thumbnailStorageBucket: candidate.thumbnailStorageBucket,
            thumbnailStoragePath: candidate.thumbnailStoragePath,
          });

          if (storedMoment?.momentId) {
            recoveredAny = true;
            setRemoteMomentIdForSession(
              candidate.localSessionId,
              storedMoment.momentId,
            );
            updateLocalMomentStatus(
              candidate.localSessionId,
              storedMoment.analysisJobStatus ?? 'processing',
            );
            console.info('[moment_reconciliation]', {
              event: 'recoverable_orphan_recovery_success',
              localSessionId: candidate.localSessionId,
              matchReason: 'recoverable_upload_target',
              matched: true,
              momentId: storedMoment.momentId,
              reason,
              state: 'recoverable_orphan',
              storagePath: candidate.storagePath,
              uploadId: candidate.uploadId,
            });
          }
        } catch (error) {
          console.info('[moment_reconciliation]', {
            event: 'recoverable_orphan_recovery_failure',
            localSessionId: candidate.localSessionId,
            matched: false,
            reason: error instanceof Error ? error.message : 'unknown',
            state: 'recoverable_orphan',
            storagePath: candidate.storagePath,
            uploadId: candidate.uploadId,
          });
        } finally {
          recoveringUploadSessionIdsRef.current.delete(candidate.localSessionId);
        }
      }

      return recoveredAny;
    },
    [
      remoteMomentIdsBySessionId,
      sessions,
      setRemoteMomentIdForSession,
      updateLocalMomentStatus,
      uploadReconciliationCandidatesBySessionId,
      videosBySessionId,
    ],
  );

  const syncRemoteMoments = useSyncRemoteMoments({
    remoteMomentIdsBySessionId,
    sessions,
    uploadReconciliationCandidatesBySessionId,
    onRemoteMomentReconciled: handleRemoteMomentReconciled,
    setGeminiEvidenceBySessionId,
    setRemoteMomentIdsBySessionId,
    setSessions,
    setSourceVideoStorageStatusBySessionId,
    setThumbnailsBySessionId,
    setVideosBySessionId,
  });

  const {
    hasInitialRemoteMomentPage,
    isInitialRemoteMomentSyncPending,
    isLoadingInitialMoments,
    isRemoteMomentSyncLoaded,
    isStorageLoaded,
    initialRemoteMomentPageInfo,
    initialRemoteMoments,
    markRemoteMomentSyncCompleted,
    remoteMomentSyncDiagnostics,
    remoteMomentSyncStatus,
  } = useBootSync({
    initialGroupId: ACTIVE_WAKEBOARD_GROUP_ID,
    initialRemoteMomentPageLimit: MOMENT_LIST_PAGE_SIZE,
    normalizeRestoredSession,
    remoteMomentIdsBySessionId,
    remoteMomentSyncEnabled: canUseRemoteApi,
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
  });
  const isSessionListLoading =
    isLoadingInitialMoments || isInitialRemoteMomentSyncPending;

  const getSessionIdsForRemoteMoments = useCallback(
    (remoteMoments: RemoteMomentRecord[]) =>
      remoteMoments.map((remoteMoment) =>
        resolveLocalSessionIdForRemoteMoment(
          remoteMoment,
          remoteMomentIdsBySessionId,
          sessions,
          uploadReconciliationCandidatesBySessionId,
        ),
    ),
    [
      remoteMomentIdsBySessionId,
      sessions,
      uploadReconciliationCandidatesBySessionId,
    ],
  );
  const expireUnmatchedUploadReconciliationCandidates = useCallback(
    (remoteMoments: RemoteMomentRecord[]) => {
      const resolvedSessionIds = new Set(
        getSessionIdsForRemoteMoments(remoteMoments),
      );
      const now = Date.now();
      const expiredSessionIds = Object.values(
        uploadReconciliationCandidatesBySessionId,
      )
        .filter((candidate) => {
          if (resolvedSessionIds.has(candidate.localSessionId)) {
            return false;
          }

          if (
            candidate.uploadId &&
            candidate.storagePath &&
            candidate.storageProvider &&
            candidate.storageBucket
          ) {
            if (
              !candidate.recoveryAttemptedAt ||
              recoveringUploadSessionIdsRef.current.has(candidate.localSessionId)
            ) {
              return false;
            }
          }

          const candidateCreatedAtMs = Date.parse(candidate.createdAt);
          const hasRecoverableUploadTarget = Boolean(
            candidate.uploadId &&
              candidate.storagePath &&
              candidate.storageProvider &&
              candidate.storageBucket,
          );
          const ttlMs = hasRecoverableUploadTarget
            ? UPLOAD_RECONCILIATION_TTL_MS
            : LOCAL_ONLY_UPLOAD_TTL_MS;

          return (
            Number.isFinite(candidateCreatedAtMs) &&
            now - candidateCreatedAtMs >= ttlMs
          );
        })
        .map((candidate) => candidate.localSessionId);

      if (expiredSessionIds.length === 0) {
        return;
      }

      const expiredSessionIdSet = new Set(expiredSessionIds);

      setUploadReconciliationCandidatesBySessionId((current) => {
        const next = { ...current };

        for (const sessionId of expiredSessionIds) {
          delete next[sessionId];
        }

        return next;
      });
      setSessions((current) =>
        current.map((session) =>
          expiredSessionIdSet.has(session.id) &&
          !remoteMomentIdsBySessionId[session.id] &&
          (session.momentStatus === 'uploading' ||
            session.momentStatus === 'queued' ||
            session.momentStatus === 'processing')
            ? {
                ...session,
                momentStatus: 'upload_failed',
                updatedAt: new Date().toISOString(),
              }
            : session,
        ),
      );
      setVideoArchiveSessionIds((current) =>
        current.filter((sessionId) => !expiredSessionIdSet.has(sessionId)),
      );

      for (const sessionId of expiredSessionIds) {
        const expiredCandidate =
          uploadReconciliationCandidatesBySessionId[sessionId];
        const hasRecoverableUploadTarget = Boolean(
          expiredCandidate?.uploadId &&
            expiredCandidate?.storagePath &&
            expiredCandidate?.storageProvider &&
            expiredCandidate?.storageBucket,
        );
        pendingVideoArchiveSessionIdsRef.current.delete(sessionId);
        console.info('[moment_reconciliation]', {
          event: 'remote_moment_unmatched',
          localSessionId: sessionId,
          matchReason: hasRecoverableUploadTarget
            ? 'upload_context_ttl_expired'
            : 'local_only_upload_context_ttl_expired',
          matched: false,
          state: hasRecoverableUploadTarget
            ? 'recoverable_orphan'
            : 'remote_reconcile_pending',
        });
      }
    },
    [
      getSessionIdsForRemoteMoments,
      remoteMomentIdsBySessionId,
      uploadReconciliationCandidatesBySessionId,
    ],
  );
  const expireLocalOnlyOptimisticSessions = useCallback(() => {
    const now = Date.now();
    const expiredSessionIds = sessions
      .filter((session) => {
        if (
          remoteMomentIdsBySessionId[session.id] ||
          uploadReconciliationCandidatesBySessionId[session.id] ||
          !(
            session.momentStatus === 'uploading' ||
            session.momentStatus === 'processing'
          )
        ) {
          return false;
        }

        const createdAtMs = Date.parse(session.createdAt);

        return (
          Number.isFinite(createdAtMs) &&
          now - createdAtMs >= LOCAL_ONLY_UPLOAD_TTL_MS
        );
      })
      .map((session) => session.id);

    if (expiredSessionIds.length === 0) {
      return;
    }

    const expiredSessionIdSet = new Set(expiredSessionIds);

    setSessions((current) =>
      current.map((session) =>
        expiredSessionIdSet.has(session.id)
          ? {
              ...session,
              momentStatus: 'upload_failed',
              updatedAt: new Date().toISOString(),
            }
          : session,
      ),
    );

    for (const sessionId of expiredSessionIds) {
      pendingVideoArchiveSessionIdsRef.current.delete(sessionId);
      console.info('[moment_reconciliation]', {
        event: 'local_only_upload_session_expired',
        localSessionId: sessionId,
        matchReason: 'missing_upload_recovery_context',
        matched: false,
      });
    }

    setVideoArchiveSessionIds((current) =>
      current.filter((sessionId) => !expiredSessionIdSet.has(sessionId)),
    );
  }, [
    remoteMomentIdsBySessionId,
    sessions,
    uploadReconciliationCandidatesBySessionId,
  ]);
  const applyVideoArchiveFirstPage = useCallback(
    (remoteMomentPage: RemoteMomentFirstPage) => {
      hasLoadedVideoArchiveFirstPageRef.current = true;
      const sessionIds = getSessionIdsForRemoteMoments(
        remoteMomentPage.moments,
      );
      const remoteSessionIdSet = new Set(sessionIds);

      setVideoArchiveSessionIds((current) => {
        const existingSessionIds = new Set(sessions.map((session) => session.id));
        const pendingSessionIds = Array.from(
          pendingVideoArchiveSessionIdsRef.current,
        ).filter(
          (sessionId) =>
            existingSessionIds.has(sessionId) &&
            !remoteSessionIdSet.has(sessionId),
        );

        pendingVideoArchiveSessionIdsRef.current = new Set(pendingSessionIds);

        return Array.from(new Set([...pendingSessionIds, ...sessionIds]));
      });
      expireUnmatchedUploadReconciliationCandidates(remoteMomentPage.moments);
      expireLocalOnlyOptimisticSessions();
      setHasMoreVideoArchiveMoments(remoteMomentPage.hasMore);
      setVideoArchiveNextCursor(remoteMomentPage.nextCursor);
      setHasLoadedVideoArchiveFirstPage(true);
      setVideoArchiveLoadState('ready');
      setVideoArchiveDiagnostics((current) => ({
        ...current,
        count: remoteMomentPage.moments.length,
        hasMore: remoteMomentPage.hasMore,
        reason: null,
        status: remoteMomentPage.moments.length > 0 ? 'ready' : 'empty',
        updatedAt: Date.now(),
      }));
    },
    [
      expireUnmatchedUploadReconciliationCandidates,
      expireLocalOnlyOptimisticSessions,
      getSessionIdsForRemoteMoments,
      sessions,
    ],
  );

  const addPendingVideoArchiveSession = useCallback((sessionId: string) => {
    pendingVideoArchiveSessionIdsRef.current.add(sessionId);
    setVideoArchiveSessionIds((current) => [
      sessionId,
      ...current.filter((currentSessionId) => currentSessionId !== sessionId),
    ]);
  }, []);

  const removePendingVideoArchiveSession = useCallback((sessionId: string) => {
    pendingVideoArchiveSessionIdsRef.current.delete(sessionId);
    setVideoArchiveSessionIds((current) =>
      current.filter((currentSessionId) => currentSessionId !== sessionId),
    );
  }, []);

  useEffect(() => {
    if (activeTab === 'video') {
      setHasMountedVideoTab(true);
    }
  }, [activeTab]);

  useEffect(() => {
    if (
      remoteMomentSyncStatus === 'completed' &&
      completedBootSyncAtRef.current === null
    ) {
      completedBootSyncAtRef.current = Date.now();
    }
  }, [remoteMomentSyncStatus]);

  const refreshRemoteMoments = useCallback(
    async (reason: RemoteRefreshReason) => {
      if (
        !canUseRemoteApi ||
        !isStorageLoaded ||
        !isRemoteMomentSyncLoaded ||
        !hasConfiguredSupabaseMoments()
      ) {
        return;
      }

      if (isRefreshingRemoteMomentsRef.current) {
        pendingRemoteRefreshReasonRef.current = getNextPendingRemoteRefreshReason(
          pendingRemoteRefreshReasonRef.current,
          reason,
        );
        console.info('[moment_sync]', {
          event: 'remote_moments_refresh_queued',
          reason,
          pendingReason: pendingRemoteRefreshReasonRef.current,
        });
        return;
      }

      isRefreshingRemoteMomentsRef.current = true;
      let nextRefreshReason: RemoteRefreshReason | null = reason;

      try {
        while (nextRefreshReason) {
          const currentReason = nextRefreshReason;
          nextRefreshReason = null;

          if (currentReason === 'push_response') {
            const completedBootSyncAt = completedBootSyncAtRef.current;
            const shouldSkipRecentBootRefresh =
              completedBootSyncAt !== null &&
              Date.now() - completedBootSyncAt <= PUSH_RESPONSE_BOOT_DEDUPE_MS;

            if (shouldSkipRecentBootRefresh) {
              console.info('[moment_sync]', {
                event: 'remote_moments_refresh_skipped',
                reason: currentReason,
                skippedBecause: 'recent_boot_sync',
              });
              nextRefreshReason = pendingRemoteRefreshReasonRef.current;
              pendingRemoteRefreshReasonRef.current = null;
              continue;
            }
          }

          try {
            await recoverUnfinalizedUploadCandidates(currentReason);
            const remoteMomentPage = await listMomentPageWithTimeout({
              limit: MOMENT_LIST_PAGE_SIZE,
            });
            const remoteMoments = remoteMomentPage.moments;
            const previousRemoteMomentSyncStatus = remoteMomentSyncStatus;
            const completedRealtimeSession = findNewRealtimeCompletedSession({
              remoteMomentIdsBySessionId,
              remoteMoments,
              sessions,
            });
            syncRemoteMoments(remoteMoments);
            markRemoteMomentSyncCompleted({
              count: remoteMoments.length,
              hasMore: remoteMomentPage.hasMore,
              recoveredFrom: previousRemoteMomentSyncStatus,
            });
            if (currentReason === 'realtime') {
              pendingRealtimeCompletionNoticeRef.current =
                completedRealtimeSession;
            }
            applyVideoArchiveFirstPage(remoteMomentPage);
            console.info('[moment_sync]', {
              event: 'remote_moments_refreshed',
              reason: currentReason,
              remoteMomentCount: remoteMoments.length,
            });
          } catch (error) {
            console.warn(
              'Supabase moment refresh failed:',
              error instanceof Error ? error.message : 'Unknown error',
            );
          }

          nextRefreshReason = pendingRemoteRefreshReasonRef.current;
          pendingRemoteRefreshReasonRef.current = null;
        }
      } finally {
        isRefreshingRemoteMomentsRef.current = false;
      }
    },
    [
      canUseRemoteApi,
      isRemoteMomentSyncLoaded,
      isStorageLoaded,
      applyVideoArchiveFirstPage,
      markRemoteMomentSyncCompleted,
      remoteMomentIdsBySessionId,
      remoteMomentSyncStatus,
      recoverUnfinalizedUploadCandidates,
      sessions,
      syncRemoteMoments,
    ],
  );

  useEffect(() => {
    if (
      hasAttemptedBootUploadRecoveryRef.current ||
      !canUseRemoteApi ||
      !isStorageLoaded ||
      !isRemoteMomentSyncLoaded ||
      remoteMomentSyncStatus !== 'completed'
    ) {
      return;
    }

    const hasRecoverableCandidate = Object.values(
      uploadReconciliationCandidatesBySessionId,
    ).some(
      (candidate) =>
        candidate.uploadId &&
        candidate.storagePath &&
        candidate.storageProvider &&
        candidate.storageBucket &&
        !remoteMomentIdsBySessionId[candidate.localSessionId],
    );

    if (!hasRecoverableCandidate) {
      hasAttemptedBootUploadRecoveryRef.current = true;
      return;
    }

    hasAttemptedBootUploadRecoveryRef.current = true;
    void recoverUnfinalizedUploadCandidates('boot_recovery').then(
      (recoveredAny) => {
        if (recoveredAny) {
          void refreshRemoteMoments('initial_retry');
        }
      },
    );
  }, [
    canUseRemoteApi,
    isRemoteMomentSyncLoaded,
    isStorageLoaded,
    recoverUnfinalizedUploadCandidates,
    refreshRemoteMoments,
    remoteMomentIdsBySessionId,
    remoteMomentSyncStatus,
    uploadReconciliationCandidatesBySessionId,
  ]);

  useAnalysisRealtimeSync({
    channelName: realtimeAnalysisChannelName,
    enabled:
      Boolean(realtimeAnalysisChannelName) &&
      canUseRemoteApi &&
      isStorageLoaded &&
      isRemoteMomentSyncLoaded &&
      hasConfiguredSupabaseMoments(),
    onAnalysisCompleted: () => {
      void refreshRemoteMoments('realtime');
    },
  });

  useEffect(() => {
    if (!isStorageLoaded) {
      return;
    }

    const persistedState: PersistedSessionState = {
      selectedGroupId,
      sessions,
      videosBySessionId,
      analysisBySessionId,
      openAiBenchmarkBySessionId,
      geminiEvidenceBySessionId,
      userConfirmedTrickBySessionId,
      thumbnailsBySessionId,
      remoteMomentIdsBySessionId,
      uploadReconciliationCandidatesBySessionId,
    };

    savePersistedSessionState(persistedState).catch(() => {
      Alert.alert(
        '기록 저장에 실패했습니다',
        '앱을 종료하면 방금 추가한 내용이 남지 않을 수 있습니다.',
      );
    });
  }, [
    analysisBySessionId,
    geminiEvidenceBySessionId,
    isStorageLoaded,
    openAiBenchmarkBySessionId,
    remoteMomentIdsBySessionId,
    selectedGroupId,
    sessions,
    thumbnailsBySessionId,
    uploadReconciliationCandidatesBySessionId,
    userConfirmedTrickBySessionId,
    videosBySessionId,
  ]);

  useEffect(() => {
    const pendingNotice = pendingRealtimeCompletionNoticeRef.current;

    if (!pendingNotice) {
      return;
    }

    const completedSession = sessions.find(
      (session) =>
        session.id === pendingNotice.sessionId &&
        session.momentStatus === 'completed',
    );

    if (!completedSession) {
      return;
    }

    pendingRealtimeCompletionNoticeRef.current = null;
    setAnalysisCompletionNotice(pendingNotice);
  }, [sessions]);

  useEffect(() => {
    if (!analysisCompletionNotice) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setAnalysisCompletionNotice(null);
    }, 4_500);

    return () => clearTimeout(timeoutId);
  }, [analysisCompletionNotice]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      const previousAppState = appStateRef.current;
      appStateRef.current = nextAppState;

      if (
        nextAppState === 'active' &&
        (previousAppState === 'background' || previousAppState === 'inactive')
      ) {
        if (authMode === 'authenticated' && user?.id) {
          ensureAnalysisPushRegistration('foreground_retry');
        }

        void refreshRemoteMoments('foreground');
      }
    });

    return () => {
      subscription.remove();
    };
  }, [authMode, refreshRemoteMoments, user?.id]);

  useEffect(() => {
    if (
      !canUseRemoteApi ||
      !isStorageLoaded ||
      !isRemoteMomentSyncLoaded ||
      !hasConfiguredSupabaseMoments()
    ) {
      return;
    }

    const handleNotificationRefresh = (
      request: ReturnType<typeof getLatestAnalysisNotificationRefreshRequest>,
    ) => {
      if (!request) {
        return;
      }

      if (handledNotificationRefreshRequestIdRef.current === request.id) {
        return;
      }

      handledNotificationRefreshRequestIdRef.current = request.id;
      void refreshRemoteMoments('push_response');
    };

    handleNotificationRefresh(getLatestAnalysisNotificationRefreshRequest());

    return subscribeToAnalysisNotificationRefresh(handleNotificationRefresh);
  }, [canUseRemoteApi, isRemoteMomentSyncLoaded, isStorageLoaded, refreshRemoteMoments]);

  useEffect(() => {
    if (
      !canUseRemoteApi ||
      remoteMomentSyncStatus !== 'timeout' &&
      remoteMomentSyncStatus !== 'failed'
    ) {
      return;
    }

    void refreshRemoteMoments('initial_retry');
  }, [canUseRemoteApi, refreshRemoteMoments, remoteMomentSyncStatus]);

  const selectedGroup =
    mockActivityGroups.find((group) => group.id === ACTIVE_WAKEBOARD_GROUP_ID) ??
    mockActivityGroups[0];
  const pagerRoutes = useMemo(
    () => APP_TABS.map((tab) => ({ key: tab.id, title: tab.label })),
    [],
  );
  const activeTabIndex = Math.max(
    0,
    pagerRoutes.findIndex((route) => route.key === activeTab),
  );
  const triggerTabSelectionHaptic = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
      // Haptics are optional feedback and should never block navigation.
    });
  };
  const handleChangeTab = (
    tab: AppTabId,
    options?: { skipHaptic?: boolean },
  ) => {
    if (activeTabRef.current === tab) {
      return;
    }

    activeTabRef.current = tab;
    setActiveTab(tab);

    if (!options?.skipHaptic) {
      triggerTabSelectionHaptic();
    }
  };
  const handlePagerIndexChange = (index: number) => {
    const nextRoute = pagerRoutes[index];

    if (nextRoute) {
      handleChangeTab(nextRoute.key, {
        skipHaptic: didTriggerSwipeHapticRef.current,
      });
      didTriggerSwipeHapticRef.current = false;
    }
  };
  const handlePagerSwipeStart = () => {
    didTriggerSwipeHapticRef.current = true;
    triggerTabSelectionHaptic();
  };

  const visibleSessions = useMemo(
    () =>
      sessions
        .filter((session) => session.activityGroupId === selectedGroup?.id)
        .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)),
    [sessions, selectedGroup?.id],
  );
  useEffect(() => {
    if (
      hasAppliedBootVideoArchivePageRef.current ||
      !canUseRemoteApi ||
      hasLoadedVideoArchiveFirstPage ||
      !hasInitialRemoteMomentPage ||
      remoteMomentSyncStatus !== 'completed'
    ) {
      return;
    }

    hasAppliedBootVideoArchivePageRef.current = true;
    applyVideoArchiveFirstPage({
      moments: initialRemoteMoments,
      hasMore: initialRemoteMomentPageInfo.hasMore,
      nextCursor: initialRemoteMomentPageInfo.nextCursor,
    });
    setVideoArchiveDiagnostics((current) => ({
      ...current,
      count: initialRemoteMoments.length,
      durationMs: remoteMomentSyncDiagnostics.durationMs,
      hasMore: initialRemoteMomentPageInfo.hasMore,
      reason: remoteMomentSyncDiagnostics.reason,
      status: initialRemoteMoments.length > 0 ? 'ready' : 'empty',
      updatedAt: Date.now(),
    }));
  }, [
    applyVideoArchiveFirstPage,
    canUseRemoteApi,
    hasInitialRemoteMomentPage,
    hasLoadedVideoArchiveFirstPage,
    initialRemoteMomentPageInfo.hasMore,
    initialRemoteMomentPageInfo.nextCursor,
    initialRemoteMoments,
    remoteMomentSyncDiagnostics.durationMs,
    remoteMomentSyncDiagnostics.reason,
    remoteMomentSyncStatus,
  ]);
  const appendVideoArchiveSessionIds = useCallback((sessionIds: string[]) => {
    setVideoArchiveSessionIds((current) => {
      const next = [...current];
      const seen = new Set(current);

      for (const sessionId of sessionIds) {
        if (!seen.has(sessionId)) {
          next.push(sessionId);
          seen.add(sessionId);
        }
      }

      return next;
    });
  }, []);
  const loadInitialVideoArchivePage = useCallback(() => {
    if (
      !canUseRemoteApi ||
      hasLoadedVideoArchiveFirstPageRef.current ||
      hasLoadedVideoArchiveFirstPage ||
      isLoadingVideoArchiveInitialPageRef.current ||
      isLoadingVideoArchiveInitialPage ||
      !hasConfiguredSupabaseMoments()
    ) {
      return;
    }

    isLoadingVideoArchiveInitialPageRef.current = true;
    setIsLoadingVideoArchiveInitialPage(true);
    setVideoArchiveLoadState('loading');
    const startedAt = Date.now();
    setVideoArchiveDiagnostics((current) => ({
      ...current,
      count: null,
      durationMs: null,
      hasMore: null,
      reason: null,
      status: 'loading',
      updatedAt: startedAt,
    }));

    console.info('[moment_sync]', {
      event: 'video_archive_first_page_started',
      limit: MOMENT_LIST_PAGE_SIZE,
    });

    listMomentPageWithTimeout({
      limit: MOMENT_LIST_PAGE_SIZE,
    })
      .then((remoteMomentPage) => {
        syncRemoteMoments(remoteMomentPage.moments);
        applyVideoArchiveFirstPage(remoteMomentPage);
        setVideoArchiveDiagnostics((current) => ({
          ...current,
          count: remoteMomentPage.moments.length,
          durationMs: getRequestDurationMs(startedAt),
          hasMore: remoteMomentPage.hasMore,
          reason: null,
          status: remoteMomentPage.moments.length > 0 ? 'ready' : 'empty',
          updatedAt: Date.now(),
        }));
        console.info('[moment_sync]', {
          count: remoteMomentPage.moments.length,
          durationMs: getRequestDurationMs(startedAt),
          event: 'video_archive_first_page_completed',
          hasMore: remoteMomentPage.hasMore,
          status: 'completed',
        });
      })
      .catch((error) => {
        const status = isRemoteRequestTimeout(error) ? 'timeout' : 'error';
        const reason = error instanceof Error ? error.message : 'Unknown error';
        setVideoArchiveLoadState(status);
        setVideoArchiveDiagnostics((current) => ({
          ...current,
          count: null,
          durationMs: getRequestDurationMs(startedAt),
          hasMore: null,
          reason,
          status,
          updatedAt: Date.now(),
        }));
        console.info('[moment_sync]', {
          durationMs: getRequestDurationMs(startedAt),
          event: 'video_archive_first_page_finished',
          reason,
          status,
        });
        console.warn(
          'Supabase video archive initial page failed:',
          reason,
        );
      })
      .finally(() => {
        isLoadingVideoArchiveInitialPageRef.current = false;
        setIsLoadingVideoArchiveInitialPage(false);
      });
  }, [
    applyVideoArchiveFirstPage,
    canUseRemoteApi,
    hasLoadedVideoArchiveFirstPage,
    isLoadingVideoArchiveInitialPage,
    syncRemoteMoments,
  ]);
  const handleRetryVideoArchiveFirstPage = useCallback(() => {
    setVideoArchiveDiagnostics((current) => ({
      ...current,
      retryCount: current.retryCount + 1,
      updatedAt: Date.now(),
    }));
    loadInitialVideoArchivePage();
  }, [loadInitialVideoArchivePage]);

  useEffect(() => {
    if (
      activeTab !== 'video' ||
      !canUseRemoteApi ||
      !isStorageLoaded ||
      !isRemoteMomentSyncLoaded
    ) {
      return;
    }

    loadInitialVideoArchivePage();
  }, [
    activeTab,
    canUseRemoteApi,
    isRemoteMomentSyncLoaded,
    isStorageLoaded,
    loadInitialVideoArchivePage,
  ]);

  const handleLoadMoreVideoArchiveMoments = useCallback(() => {
    if (
      !canUseRemoteApi ||
      !hasLoadedVideoArchiveFirstPage ||
      !hasMoreVideoArchiveMoments ||
      !videoArchiveNextCursor ||
      isLoadingMoreVideoArchiveMoments ||
      !hasConfiguredSupabaseMoments()
    ) {
      return;
    }

    setIsLoadingMoreVideoArchiveMoments(true);
    const startedAt = Date.now();

    console.info('[moment_sync]', {
      cursorPresent: Boolean(videoArchiveNextCursor),
      event: 'video_archive_next_page_started',
      limit: MOMENT_LIST_PAGE_SIZE,
    });

    listMomentPageWithTimeout({
      cursor: videoArchiveNextCursor,
      limit: MOMENT_LIST_PAGE_SIZE,
    })
      .then((remoteMomentPage) => {
        const sessionIds = getSessionIdsForRemoteMoments(
          remoteMomentPage.moments,
        );
        const remoteSessionIdSet = new Set(sessionIds);
        for (const sessionId of remoteSessionIdSet) {
          pendingVideoArchiveSessionIdsRef.current.delete(sessionId);
        }

        syncRemoteMoments(remoteMomentPage.moments);
        appendVideoArchiveSessionIds(sessionIds);
        expireUnmatchedUploadReconciliationCandidates(remoteMomentPage.moments);
        setHasMoreVideoArchiveMoments(remoteMomentPage.hasMore);
        setVideoArchiveNextCursor(remoteMomentPage.nextCursor);
        console.info('[moment_sync]', {
          count: remoteMomentPage.moments.length,
          durationMs: getRequestDurationMs(startedAt),
          event: 'video_archive_next_page_completed',
          hasMore: remoteMomentPage.hasMore,
          status: 'completed',
        });
      })
      .catch((error) => {
        console.info('[moment_sync]', {
          durationMs: getRequestDurationMs(startedAt),
          event: 'video_archive_next_page_finished',
          reason: error instanceof Error ? error.message : 'Unknown error',
          status: isRemoteRequestTimeout(error) ? 'timeout' : 'error',
        });
        console.warn(
          'Supabase moment pagination failed:',
          error instanceof Error ? error.message : 'Unknown error',
        );
      })
      .finally(() => {
        setIsLoadingMoreVideoArchiveMoments(false);
      });
  }, [
    appendVideoArchiveSessionIds,
    canUseRemoteApi,
    expireUnmatchedUploadReconciliationCandidates,
    getSessionIdsForRemoteMoments,
    hasLoadedVideoArchiveFirstPage,
    hasMoreVideoArchiveMoments,
    isLoadingMoreVideoArchiveMoments,
    syncRemoteMoments,
    videoArchiveNextCursor,
  ]);
  const homeSessionSummaries = useMemo(
    () =>
      visibleSessions.map((session) => {
        const isWorking = Boolean(extractingEvidenceBySessionId[session.id]);
        const evidence = geminiEvidenceBySessionId[session.id];
        const momentStatus = getMomentStatus({
          evidence,
          isProcessing: isWorking,
          sessionStatus: session.momentStatus,
        });
        const completedEvidence = getCompletedMomentEvidence({
          evidence,
          isProcessing: isWorking,
          sessionStatus: session.momentStatus,
        });
        const card = getSessionCardPresentation({
          session,
          evidence: completedEvidence,
          thumbnailUri: thumbnailsBySessionId[session.id],
        });

        return {
          card,
          completedEvidence,
          evidence,
          isWorking,
          momentStatus,
          session,
        };
      }),
    [
      extractingEvidenceBySessionId,
      geminiEvidenceBySessionId,
      thumbnailsBySessionId,
      visibleSessions,
    ],
  );
  const latestCompletedSummary = homeSessionSummaries.find(
    (summary) => summary.completedEvidence,
  );
  const latestActiveSummary = homeSessionSummaries.find(
    (summary) =>
      summary.momentStatus === 'uploading' ||
      summary.momentStatus === 'queued' ||
      summary.momentStatus === 'processing' ||
      summary.momentStatus === 'upload_failed' ||
      summary.momentStatus === 'failed',
  );
  const primaryInsightSummary = latestCompletedSummary ?? latestActiveSummary;
  const latestAnalysisLabel = latestCompletedSummary
    ? formatShortSessionDate(latestCompletedSummary.session.occurredAt)
    : undefined;
  const journalSnapshot = useMemo(() => {
    let activeCount = 0;
    let completedCount = 0;
    let failedCount = 0;

    for (const summary of homeSessionSummaries) {
      const visibleStatus = getVisibleMomentStatus(summary.momentStatus);

      if (visibleStatus === 'completed') {
        completedCount += 1;
      } else if (visibleStatus === 'failed') {
        failedCount += 1;
      } else if (visibleStatus === 'running') {
        activeCount += 1;
      }
    }

    return {
      activeCount,
      completedCount,
      failedCount,
      totalCount: homeSessionSummaries.length,
    };
  }, [homeSessionSummaries]);
  const recentSessionSummaries = homeSessionSummaries.slice(0, 8);
  const sessionSummaryById = useMemo(
    () =>
      new Map(
        homeSessionSummaries.map((summary) => [summary.session.id, summary]),
      ),
    [homeSessionSummaries],
  );
  const videoArchiveSessionSummaries = useMemo(
    () =>
      videoArchiveSessionIds
        .map((sessionId) => sessionSummaryById.get(sessionId))
        .filter((summary): summary is NonNullable<typeof summary> =>
          Boolean(summary),
        ),
    [sessionSummaryById, videoArchiveSessionIds],
  );
  const shouldUseVideoArchiveSessionFallback =
    videoArchiveSessionSummaries.length === 0 &&
    homeSessionSummaries.length > 0 &&
    !hasLoadedVideoArchiveFirstPage;
  const visibleVideoArchiveSessionSummaries = shouldUseVideoArchiveSessionFallback
    ? homeSessionSummaries
    : videoArchiveSessionSummaries;
  const hasRemoteMomentSyncDelay =
    remoteMomentSyncStatus === 'timeout' || remoteMomentSyncStatus === 'failed';
  const videoArchiveUiLoadState: VideoArchiveLoadState =
    shouldUseVideoArchiveSessionFallback
      ? 'ready'
      : hasRemoteMomentSyncDelay &&
          visibleVideoArchiveSessionSummaries.length === 0
        ? 'delayed'
        : isLoadingVideoArchiveInitialPage ||
            (isSessionListLoading && videoArchiveSessionSummaries.length === 0)
          ? 'loading'
          : videoArchiveLoadState;
  const canRequestGeminiEvidence = hasConfiguredGeminiEvidenceEndpoint();
  const configuredAiEndpoints = getConfiguredAiEndpoints();

  const removeSessionLocally = useCallback((sessionId: string) => {
    removeSessionDataLocally(sessionId);
    closeMomentDetailIfSelected(sessionId);
  }, [closeMomentDetailIfSelected, removeSessionDataLocally]);

  const { deletingSessionIds, handleDeleteSession } = useDeleteMoment({
    remoteMomentIdsBySessionId,
    removeSessionLocally,
  });
  const shouldSuppressUploadFailureAlert = useCallback(
    async ({
      localSessionId,
      reason,
      stage,
      uploadId,
    }: {
      localSessionId: string;
      reason: string;
      stage: string;
      uploadId?: string;
    }) => {
      if (remoteMomentIdsBySessionId[localSessionId]) {
        console.info('[upload_timing]', {
          event: 'upload_failure_remote_reconcile_existing',
          localSessionId,
          momentId: remoteMomentIdsBySessionId[localSessionId],
          reason,
          stage,
          uploadId,
        });
        return true;
      }

      if (!hasConfiguredSupabaseMoments()) {
        return false;
      }

      const findRemoteMatch = async (attempt: number) => {
        const remoteMomentPage = await listMomentPageWithTimeout({
          limit: MOMENT_LIST_PAGE_SIZE,
        });
        const matchedMoment = remoteMomentPage.moments.find(
          (remoteMoment) =>
            resolveLocalSessionIdForRemoteMoment(
              remoteMoment,
              remoteMomentIdsBySessionId,
              sessions,
              uploadReconciliationCandidatesBySessionId,
            ) === localSessionId,
        );

        syncRemoteMoments(remoteMomentPage.moments);
        applyVideoArchiveFirstPage(remoteMomentPage);

        if (matchedMoment) {
          console.info('[upload_timing]', {
            attempt,
            event: 'upload_failure_remote_reconcile_matched',
            localSessionId,
            momentId: matchedMoment.remoteMomentId,
            reason,
            stage,
            uploadId,
          });
          return true;
        }

        console.info('[upload_timing]', {
          attempt,
          event: 'upload_failure_remote_reconcile_unmatched',
          localSessionId,
          reason,
          stage,
          uploadId,
        });
        return false;
      };

      try {
        if (await findRemoteMatch(1)) {
          return true;
        }

        await new Promise((resolve) =>
          setTimeout(resolve, UPLOAD_FAILURE_REMOTE_RECONCILE_RETRY_MS),
        );

        return await findRemoteMatch(2);
      } catch (error) {
        console.info('[upload_timing]', {
          event: 'upload_failure_remote_reconcile_failed',
          localSessionId,
          reason: error instanceof Error ? error.message : 'unknown',
          sourceFailureReason: reason,
          stage,
          uploadId,
        });
        return false;
      }
    },
    [
      applyVideoArchiveFirstPage,
      remoteMomentIdsBySessionId,
      sessions,
      syncRemoteMoments,
      uploadReconciliationCandidatesBySessionId,
    ],
  );

  const {
    canUploadSession,
    closeUploadSheet,
    handleAddSession,
    handleOpenUploadSheet,
    handlePickVideo,
    isComposerOpen,
    isPreparingSelectedVideoThumbnail,
    isUploadingSession,
    resetUploadFlow,
    selectedVideo,
    uploadDraft,
    uploadProgress,
  } = useUploadMoment({
    activityGroupId: selectedGroup?.id,
    extractEvidence: handleExtractEvidence,
    setRemoteMomentIdForSession,
    setSessions,
    setThumbnailForSession,
    setVideoForSession,
    activateTab: (tabId) => {
      handleChangeTab(tabId, {
        skipHaptic: true,
      });
    },
    onUploadSuccess: () => {
      void refreshRemoteMoments('upload_success');
    },
    onOptimisticSessionCreated: addPendingVideoArchiveSession,
    onOptimisticSessionRejected: (sessionId) => {
      removePendingVideoArchiveSession(sessionId);
      clearUploadReconciliationCandidate(sessionId);
    },
    onOptimisticUploadContextCreated: upsertUploadReconciliationCandidate,
    onUploadReconciliationCandidateResolved:
      clearUploadReconciliationCandidate,
    onUploadReconciliationTargetResolved:
      markUploadReconciliationCandidateWithTarget,
    shouldSuppressUploadFailureAlert,
    updateLocalMomentStatus,
  });

  useEffect(() => {
    if (authMode !== 'authenticated' || !user?.id || !canUseRemoteApi) {
      return;
    }

    ensureAnalysisPushRegistration('auth_owner_ready');
  }, [authMode, canUseRemoteApi, user?.id]);

  useEffect(() => {
    const nextOwnerKey = getAuthCacheOwnerKey({
      authMode,
      userId: user?.id,
    });

    if (!nextOwnerKey) {
      return;
    }

    const previousOwnerKey = authCacheOwnerKeyRef.current;

    if (!previousOwnerKey) {
      authCacheOwnerKeyRef.current = nextOwnerKey;
      return;
    }

    if (previousOwnerKey === nextOwnerKey) {
      return;
    }

    authCacheOwnerKeyRef.current = nextOwnerKey;

    void clearPersistedSessionState().catch((error) => {
      console.warn(
        'Session cache clear failed after auth owner change:',
        error instanceof Error ? error.message : 'Unknown error',
      );
    });

    setSelectedGroupId(ACTIVE_WAKEBOARD_GROUP_ID);
    setSessions([]);
    setVideosBySessionId({});
    setAnalysisBySessionId({});
    setOpenAiBenchmarkBySessionId({});
    setGeminiEvidenceBySessionId({});
    setUserConfirmedTrickBySessionId({});
    setThumbnailsBySessionId({});
    setRemoteMomentIdsBySessionId({});
    setUploadReconciliationCandidatesBySessionId({});
    setAnalysisCompletionNotice(null);

    pendingVideoArchiveSessionIdsRef.current.clear();
    recoveringUploadSessionIdsRef.current.clear();
    handledNotificationRefreshRequestIdRef.current = null;
    pendingRemoteRefreshReasonRef.current = null;
    pendingRealtimeCompletionNoticeRef.current = null;
    isRefreshingRemoteMomentsRef.current = false;
    hasAppliedBootVideoArchivePageRef.current = false;
    hasLoadedVideoArchiveFirstPageRef.current = false;
    isLoadingVideoArchiveInitialPageRef.current = false;
    completedBootSyncAtRef.current = null;
    hasAttemptedBootUploadRecoveryRef.current = false;
    didNavigateToUploadRef.current = false;

    setVideoArchiveSessionIds([]);
    setVideoArchiveNextCursor(null);
    setHasMoreVideoArchiveMoments(false);
    setHasLoadedVideoArchiveFirstPage(false);
    setHasMountedVideoTab(false);
    setVideoArchiveLoadState('empty');
    setVideoArchiveDiagnostics({
      count: null,
      durationMs: null,
      hasMore: null,
      reason: null,
      retryCount: 0,
      status: 'empty',
      updatedAt: Date.now(),
    });
    setIsLoadingVideoArchiveInitialPage(false);
    setIsLoadingMoreVideoArchiveMoments(false);

    resetUploadFlow();
    closeMomentDetail();
    resetUploadRuntimeState();
    resetMomentDetailRuntimeState();
    activeTabRef.current = 'home';
    setActiveTab('home');

    console.info('[auth_cache_boundary]', {
      event: 'user_cache_cleared',
      nextOwnerKey,
      previousOwnerKey,
    });

    if (canUseRemoteApi && hasConfiguredSupabaseMoments()) {
      void refreshRemoteMoments('initial_retry');
    }
  }, [
    authMode,
    canUseRemoteApi,
    closeMomentDetail,
    refreshRemoteMoments,
    resetUploadFlow,
    setAnalysisBySessionId,
    setGeminiEvidenceBySessionId,
    setOpenAiBenchmarkBySessionId,
    setRemoteMomentIdsBySessionId,
    setSessions,
    setThumbnailsBySessionId,
    setUploadReconciliationCandidatesBySessionId,
    setUserConfirmedTrickBySessionId,
    setVideosBySessionId,
    user?.id,
  ]);

  const guardedCanUploadSession = canUseRemoteApi && canUploadSession;
  const guardedHandleOpenUploadSheet = useCallback(() => {
    if (!canUseRemoteApi) {
      return;
    }

    void handleOpenUploadSheet();
  }, [canUseRemoteApi, handleOpenUploadSheet]);
  const guardedHandlePickVideo = useCallback(async () => {
    if (!canUseRemoteApi) {
      return false;
    }

    return handlePickVideo();
  }, [canUseRemoteApi, handlePickVideo]);
  const guardedHandleAddSession = useCallback(() => {
    if (!canUseRemoteApi) {
      return;
    }

    handleAddSession();
  }, [canUseRemoteApi, handleAddSession]);

  useEffect(() => {
    if (!isComposerOpen) {
      didNavigateToUploadRef.current = false;
      return;
    }

    if ((selectedVideo || uploadDraft) && !didNavigateToUploadRef.current) {
      didNavigateToUploadRef.current = true;
      const navigationTask = InteractionManager.runAfterInteractions(() => {
        navigation.navigate('Upload');
      });

      return () => navigationTask.cancel();
    }
  }, [isComposerOpen, navigation, selectedVideo, uploadDraft]);

  useEffect(() => {
    setMomentDetailRuntimeState({
      canRequestGeminiEvidence,
      debugEndpoint: __DEV__
        ? configuredAiEndpoints.geminiEvidenceEndpoint
        : undefined,
      deletingSessionIds,
      extractingEvidenceBySessionId,
      geminiEvidenceBySessionId,
      handleDeleteSession,
      handleExtractEvidence,
      isReady: true,
      sessions,
      sourceVideoStorageStatusBySessionId,
      styles,
      thumbnailsBySessionId,
      videosBySessionId,
    });
  }, [
    canRequestGeminiEvidence,
    configuredAiEndpoints.geminiEvidenceEndpoint,
    deletingSessionIds,
    extractingEvidenceBySessionId,
    geminiEvidenceBySessionId,
    handleDeleteSession,
    handleExtractEvidence,
    sessions,
    sourceVideoStorageStatusBySessionId,
    thumbnailsBySessionId,
    videosBySessionId,
  ]);

  useEffect(() => {
    setUploadRuntimeState({
      canUploadSession: guardedCanUploadSession,
      formatVideoMeta,
      isOpen: isComposerOpen,
      isPreparingThumbnail: isPreparingSelectedVideoThumbnail,
      isReady: canUseRemoteApi,
      isSubmitting: isUploadingSession,
      onClose: closeUploadSheet,
      onPickVideo: guardedHandlePickVideo,
      onSubmit: guardedHandleAddSession,
      selectedVideo,
      styles,
      uploadDraft,
      uploadProgress,
    });
  }, [
    canUseRemoteApi,
    closeUploadSheet,
    guardedCanUploadSession,
    guardedHandleAddSession,
    guardedHandlePickVideo,
    isComposerOpen,
    isPreparingSelectedVideoThumbnail,
    isUploadingSession,
    selectedVideo,
    uploadDraft,
    uploadProgress,
  ]);
  const qaDebugSnapshot = useMemo(
    () => ({
      auth: {
        bootstrapDurationMs: authBootstrapDiagnostics.durationMs,
        bootstrapReason: authBootstrapDiagnostics.reason,
        bootstrapStage: authBootstrapDiagnostics.stage,
        bootstrapStatus: authBootstrapDiagnostics.status,
        bootstrapUpdatedAt: authBootstrapDiagnostics.updatedAt,
        hasUser: Boolean(user),
        isAnonymous: Boolean(
          (user as { is_anonymous?: boolean } | null)?.is_anonymous,
        ),
        isLoading: isAuthLoading,
        mode: authMode,
      },
      boot: remoteMomentSyncDiagnostics,
      counts: {
        home: homeSessionSummaries.length,
        videoArchive: videoArchiveSessionSummaries.length,
        videoShown: visibleVideoArchiveSessionSummaries.length,
      },
      video: videoArchiveDiagnostics,
      videoUiLoadState: videoArchiveUiLoadState,
    }),
    [
      authMode,
      authBootstrapDiagnostics,
      homeSessionSummaries.length,
      isAuthLoading,
      remoteMomentSyncDiagnostics,
      user,
      videoArchiveDiagnostics,
      videoArchiveSessionSummaries.length,
      videoArchiveUiLoadState,
      visibleVideoArchiveSessionSummaries.length,
    ],
  );

  if (isAuthLoading || isLoadingInitialMoments) {
    return (
      <SafeAreaView
        style={[
          styles.bootLoadingScreen,
          prefersDarkMode ? styles.containerDark : undefined,
        ]}
      >
        <View style={styles.bootLoadingContent}>
          <Text style={styles.kicker}>Wake Board</Text>
          <Text style={styles.bootLoadingTitle}>기록을 불러오는 중입니다</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoginRequired) {
    return (
      <SafeAreaView
        style={[
          styles.bootLoadingScreen,
          prefersDarkMode ? styles.containerDark : undefined,
        ]}
      >
        <View style={styles.bootLoadingContent}>
          <Text style={styles.kicker}>Wake Board</Text>
          <Text style={styles.bootLoadingTitle}>로그인이 필요합니다</Text>
          <Text style={styles.emptyText}>
            계정 연결 화면은 다음 단계에서 추가할 예정입니다.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const openEvidenceSheet = (session: Session) => {
    navigation.navigate('MomentDetail', { sessionId: session.id });

    const video = videosBySessionId[session.id] ?? getVideoAssetFromSession(session);

    if (video && !geminiEvidenceBySessionId[session.id]) {
      void handleExtractEvidence(session, { openSheet: false });
    }
  };

  const handleOpenAnalysisCompletionNotice = () => {
    if (!analysisCompletionNotice) {
      return;
    }

    const session = sessions.find(
      (item) => item.id === analysisCompletionNotice.sessionId,
    );

    setAnalysisCompletionNotice(null);

    if (session) {
      openEvidenceSheet(session);
    }
  };

  const handleOpenSettings = () => {
    navigation.navigate('Settings');
  };

  const renderHomeTab = () => (
    <>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="영상 업로드"
          accessibilityRole="button"
          onPress={guardedHandleOpenUploadSheet}
          style={({ pressed }) => [
            styles.headerAddButton,
            pressed ? styles.buttonPressed : undefined,
          ]}
        >
          <View style={styles.headerAddIconWrap}>
            <Ionicons
              color={headerUploadIconColor}
              name="videocam-outline"
              size={23}
            />
            <Ionicons
              color={headerUploadIconColor}
              name="add-circle"
              size={13}
              style={styles.headerAddIconBadge}
            />
          </View>
        </Pressable>
        <View style={styles.headerTitleBlock}>
          <Text style={styles.kicker}>Wake Board</Text>
          <Text style={styles.title}>오늘의 라이딩 기록</Text>
          <Text style={styles.headerMeta}>
            {journalSnapshot.totalCount}개 기록
            {latestAnalysisLabel ? ` · 최근 분석 ${latestAnalysisLabel}` : ''}
          </Text>
        </View>
        <View style={styles.headerActionRow}>
          <Pressable
            accessibilityLabel="프로필 및 설정 열기"
            accessibilityRole="button"
            onPress={handleOpenSettings}
            style={({ pressed }) => [
              styles.headerMenuButton,
              pressed ? styles.buttonPressed : undefined,
            ]}
          >
            <Ionicons
              color={theme.colors.textPrimary}
              name="person-circle-outline"
              size={25}
            />
          </Pressable>
        </View>
      </View>

      <JournalSnapshot
        activeCount={journalSnapshot.activeCount}
        completedCount={journalSnapshot.completedCount}
        failedCount={journalSnapshot.failedCount}
        lastCompletedLabel={latestAnalysisLabel}
        styles={styles}
        totalCount={journalSnapshot.totalCount}
      />

      <PrimaryInsightCard
        formatShortSessionDate={formatShortSessionDate}
        isLoading={isSessionListLoading}
        onOpenSession={openEvidenceSheet}
        styles={styles}
        summary={primaryInsightSummary}
      />

      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionLabel}>최근 기록</Text>
          <Text style={styles.sectionHint}>기록</Text>
        </View>
        <RecentSessionsRail
          formatShortSessionDate={formatShortSessionDate}
          isLoading={isSessionListLoading}
          onOpenSession={openEvidenceSheet}
          sessions={recentSessionSummaries}
          styles={styles}
        />
      </View>
    </>
  );

  const renderVideoArchiveHeader = () => (
    <>
      <View style={styles.tabPageHeader}>
        <Text style={styles.kicker}>{selectedGroup?.name ?? 'Wake Board'}</Text>
        <Text style={styles.title}>영상</Text>
        <Text style={styles.headerMeta}>
          {visibleVideoArchiveSessionSummaries.length}개 표시됨
          {shouldUseVideoArchiveSessionFallback
            ? ' · 홈 기록 기준, 아카이브 동기화 중'
            : ' · 최근 기록 기준'}
        </Text>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionLabel}>세션 아카이브</Text>
          <Text style={styles.sectionHint}>VIDEO</Text>
        </View>
      </View>
    </>
  );

  const renderVideoTab = () => (
    <VideoArchiveList
      formatShortSessionDate={formatShortSessionDate}
      getVideoArchiveDescription={getVideoArchiveDescription}
      hasMore={hasMoreVideoArchiveMoments}
      header={renderVideoArchiveHeader()}
      isLoadingMore={isLoadingMoreVideoArchiveMoments}
      loadState={videoArchiveUiLoadState}
      onEndReached={handleLoadMoreVideoArchiveMoments}
      onOpenSession={openEvidenceSheet}
      onRetry={handleRetryVideoArchiveFirstPage}
      sessions={visibleVideoArchiveSessionSummaries}
      styles={styles}
    />
  );

  const renderFlowTab = () => (
    <FlowPlaceholderTab
      kicker={selectedGroup?.name ?? 'Wake Board'}
      styles={styles}
    />
  );

  const renderPagerScene = ({
    route,
  }: {
    route: { key: AppTabId; title: string };
  }) => {
    if (route.key === 'video') {
      if (!hasMountedVideoTab && activeTab !== 'video') {
        return <View style={styles.pagerLazyPlaceholder} />;
      }

      return renderVideoTab();
    }

    return (
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {route.key === 'home' ? renderHomeTab() : renderFlowTab()}
      </ScrollView>
    );
  };

  return (
    <SafeAreaView
      style={[
        styles.container,
        prefersDarkMode ? styles.containerDark : undefined,
      ]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <TabView
          initialLayout={{ width: layout.width }}
          navigationState={{ index: activeTabIndex, routes: pagerRoutes }}
          onIndexChange={handlePagerIndexChange}
          onSwipeStart={handlePagerSwipeStart}
          renderScene={renderPagerScene}
          renderTabBar={() => null}
          lazy={({ route }) => route.key === 'video'}
          lazyPreloadDistance={0}
          style={styles.pager}
          swipeEnabled
        />
      </KeyboardAvoidingView>
      <BottomNavigation
        activeTab={activeTab}
        isDarkMode={prefersDarkMode}
        onChangeTab={handleChangeTab}
        styles={styles}
      />
      {analysisCompletionNotice ? (
        <Pressable
          accessibilityLabel="완료된 분석 결과 열기"
          accessibilityRole="button"
          onPress={handleOpenAnalysisCompletionNotice}
          style={({ pressed }) => [
            styles.analysisCompleteBanner,
            pressed ? styles.buttonPressed : undefined,
          ]}
        >
          <View style={styles.analysisCompleteIcon}>
            <Text style={styles.analysisCompleteIconText}>✓</Text>
          </View>
          <View style={styles.analysisCompleteBody}>
            <Text style={styles.analysisCompleteTitle}>분석이 완료되었습니다</Text>
            <Text style={styles.analysisCompleteText} numberOfLines={1}>
              {analysisCompletionNotice.title} 결과를 확인해보세요.
            </Text>
          </View>
        </Pressable>
      ) : null}
      <QADebugPanel
        isOpen={isQADebugPanelOpen}
        onToggle={() => setIsQADebugPanelOpen((current) => !current)}
        snapshot={qaDebugSnapshot}
        styles={styles}
      />
    </SafeAreaView>
  );
}

function QADebugPanel({
  isOpen,
  onToggle,
  snapshot,
  styles,
}: {
  isOpen: boolean;
  onToggle: () => void;
  snapshot: {
    auth: {
      bootstrapDurationMs: number | null;
      bootstrapReason: string | null;
      bootstrapStage: string;
      bootstrapStatus: string;
      bootstrapUpdatedAt: number | null;
      hasUser: boolean;
      isAnonymous: boolean;
      isLoading: boolean;
      mode: string;
    };
    boot: {
      count: number | null;
      durationMs: number | null;
      hasMore: boolean | null;
      reason: string | null;
      status: string;
      updatedAt: number | null;
    };
    counts: {
      home: number;
      videoArchive: number;
      videoShown: number;
    };
    video: RequestDiagnostics;
    videoUiLoadState: VideoArchiveLoadState;
  };
  styles: Record<string, object>;
}) {
  if (!ENABLE_QA_DEBUG_PANEL) {
    return null;
  }

  if (!isOpen) {
    return (
      <Pressable
        accessibilityLabel="QA debug panel 열기"
        accessibilityRole="button"
        onPress={onToggle}
        style={({ pressed }) => [
          styles.qaDebugCollapsed,
          pressed ? styles.buttonPressed : undefined,
        ]}
      >
        <Text style={styles.qaDebugCollapsedText}>QA</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.qaDebugPanel}>
      <Pressable
        accessibilityLabel="QA debug panel 닫기"
        accessibilityRole="button"
        onPress={onToggle}
        style={({ pressed }) => [
          styles.qaDebugHeader,
          pressed ? styles.buttonPressed : undefined,
        ]}
      >
        <Text style={styles.qaDebugTitle}>QA Debug</Text>
        <Text style={styles.qaDebugCollapseHint}>접기</Text>
      </Pressable>
      <Text style={styles.qaDebugLine}>
        Auth {snapshot.auth.mode} · loading {snapshot.auth.isLoading ? 'Y' : 'N'} ·
        user {snapshot.auth.hasUser ? 'Y' : 'N'} · anon{' '}
        {snapshot.auth.isAnonymous ? 'Y' : 'N'}
      </Text>
      <Text style={styles.qaDebugLine}>
        Auth boot {snapshot.auth.bootstrapStatus}/{snapshot.auth.bootstrapStage} ·{' '}
        {snapshot.auth.bootstrapDurationMs ?? '-'}ms
      </Text>
      <Text style={styles.qaDebugLine}>
        Auth at {formatDebugTimestamp(snapshot.auth.bootstrapUpdatedAt)} · reason{' '}
        {compactDebugReason(snapshot.auth.bootstrapReason)}
      </Text>
      <Text style={styles.qaDebugLine}>
        Boot {snapshot.boot.status} · {snapshot.boot.durationMs ?? '-'}ms · count{' '}
        {snapshot.boot.count ?? '-'} · more{' '}
        {snapshot.boot.hasMore === null ? '-' : snapshot.boot.hasMore ? 'Y' : 'N'}
      </Text>
      <Text style={styles.qaDebugLine}>
        Boot at {formatDebugTimestamp(snapshot.boot.updatedAt)} · reason{' '}
        {compactDebugReason(snapshot.boot.reason)}
      </Text>
      <Text style={styles.qaDebugLine}>
        Video {snapshot.video.status} · {snapshot.video.durationMs ?? '-'}ms ·
        ui {snapshot.videoUiLoadState} · count {snapshot.video.count ?? '-'} · more{' '}
        {snapshot.video.hasMore === null ? '-' : snapshot.video.hasMore ? 'Y' : 'N'} ·
        retry {snapshot.video.retryCount}
      </Text>
      <Text style={styles.qaDebugLine}>
        Video at {formatDebugTimestamp(snapshot.video.updatedAt)} · reason{' '}
        {compactDebugReason(snapshot.video.reason)}
      </Text>
      <Text style={styles.qaDebugLine}>
        Counts home {snapshot.counts.home} · archive{' '}
        {snapshot.counts.videoArchive} · shown {snapshot.counts.videoShown}
      </Text>
    </View>
  );
}

function normalizeRestoredSession(session: Session): Session {
  if (session.momentStatus !== 'uploading') {
    return session;
  }

  return {
    ...session,
    momentStatus: 'upload_failed',
  };
}

function findNewRealtimeCompletedSession({
  remoteMomentIdsBySessionId,
  remoteMoments,
  sessions,
}: {
  remoteMomentIdsBySessionId: Record<string, string>;
  remoteMoments: RemoteMomentRecord[];
  sessions: Session[];
}): AnalysisCompletionNotice | null {
  for (const remoteMoment of remoteMoments) {
    const isRemoteCompleted =
      remoteMoment.session.momentStatus === 'completed' ||
      remoteMoment.evidence?.status === 'completed';

    if (!isRemoteCompleted) {
      continue;
    }

    const sessionId = resolveLocalSessionIdForRemoteMoment(
      remoteMoment,
      remoteMomentIdsBySessionId,
      sessions,
    );
    const localSession = sessions.find((session) => session.id === sessionId);

    if (!localSession || localSession.momentStatus === 'completed') {
      continue;
    }

    return {
      sessionId,
      title: localSession.title?.trim() || '방금 업로드한 영상',
    };
  }

  return null;
}

function createHomeThemeStyles(colors: AppThemeColors, mode: 'dark' | 'light') {
  const isLight = mode === 'light';
  const borderSoft = isLight ? '#dbe4ee' : 'rgba(255, 255, 255, 0.09)';
  const borderStrong = isLight ? '#cbd5e1' : 'rgba(248, 250, 252, 0.14)';
  const surfaceSubtle = isLight ? '#f1f5f9' : 'rgba(255, 255, 255, 0.04)';
  const overlay = isLight
    ? 'rgba(255, 255, 255, 0.94)'
    : 'rgba(2, 6, 23, 0.92)';
  const accentSoft = isLight ? '#ccfbf1' : 'rgba(3, 199, 90, 0.14)';
  const warningSoft = isLight ? '#fef3c7' : 'rgba(251, 191, 36, 0.14)';
  const errorSoft = isLight ? '#fff1f2' : 'rgba(244, 63, 94, 0.12)';

  return StyleSheet.create({
    container: { backgroundColor: colors.background },
    containerDark: { backgroundColor: colors.background },
    bootLoadingScreen: { backgroundColor: colors.background },
    bootLoadingTitle: { color: colors.textPrimary },
    pagerLazyPlaceholder: { backgroundColor: colors.background },
    analysisCompleteBanner: {
      backgroundColor: overlay,
      borderColor: isLight ? '#bbf7d0' : 'rgba(34, 197, 94, 0.34)',
    },
    analysisCompleteTitle: { color: colors.textPrimary },
    analysisCompleteText: { color: colors.success },
    qaDebugCollapsed: {
      backgroundColor: isLight
        ? 'rgba(255, 255, 255, 0.92)'
        : 'rgba(15, 23, 42, 0.88)',
      borderColor: borderStrong,
    },
    qaDebugCollapsedText: { color: colors.accent },
    qaDebugPanel: {
      backgroundColor: overlay,
      borderColor: borderStrong,
    },
    qaDebugTitle: { color: colors.textPrimary },
    qaDebugCollapseHint: { color: colors.accent },
    qaDebugLine: { color: colors.textSecondary },
    bottomTabBar: {
      backgroundColor: isLight
        ? 'rgba(255, 255, 255, 0.94)'
        : 'rgba(20, 22, 28, 0.92)',
      borderColor: borderStrong,
    },
    bottomTabBarDark: {
      backgroundColor: isLight
        ? 'rgba(255, 255, 255, 0.94)'
        : 'rgba(20, 22, 28, 0.92)',
      borderColor: borderStrong,
    },
    bottomTabItemSelected: {
      backgroundColor: isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.06)',
    },
    bottomTabItemSelectedDark: {
      backgroundColor: isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.06)',
    },
    bottomTabIconFrameSelected: {
      backgroundColor: isLight ? '#cbd5e1' : 'rgba(255, 255, 255, 0.14)',
    },
    bottomTabIconIdle: { color: colors.textMuted },
    bottomTabIconSelected: { color: colors.textPrimary },
    headerActionRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    headerMenuButton: {
      backgroundColor: isLight ? '#ffffff' : 'rgba(248, 250, 252, 0.08)',
      borderColor: borderStrong,
    },
    headerMenuText: { color: colors.textPrimary },
    kicker: { color: colors.textMuted },
    title: { color: colors.textPrimary },
    headerMeta: { color: colors.textMuted },
    headerAddButton: {
      backgroundColor: isLight ? colors.accent : colors.textPrimary,
      borderColor: isLight ? '#059669' : 'transparent',
      borderWidth: isLight ? 1 : 0,
      shadowColor: isLight ? colors.accent : colors.textPrimary,
    },
    journalSnapshot: {
      backgroundColor: colors.surface,
      borderColor: borderSoft,
    },
    journalSnapshotTitle: { color: colors.textPrimary },
    journalSnapshotMeta: { color: colors.textMuted },
    journalSnapshotItem: { backgroundColor: surfaceSubtle },
    journalSnapshotValue: { color: colors.textPrimary },
    journalSnapshotLabel: { color: colors.textMuted },
    primaryInsightCard: {
      backgroundColor: colors.surface,
      borderColor: borderSoft,
    },
    cardEyebrow: { color: colors.textMuted },
    primaryInsightTitle: { color: colors.textPrimary },
    primaryInsightText: { color: colors.textSecondary },
    primaryInsightReview: { color: colors.warning },
    primaryInsightDate: { color: colors.textMuted },
    textLinkButtonText: { color: colors.textPrimary },
    sectionLabel: { color: colors.textPrimary },
    sectionHint: { color: colors.textMuted },
    recentSessionCard: {
      backgroundColor: colors.surface,
      borderColor: borderSoft,
    },
    recentPreview: { backgroundColor: colors.surfaceElevated },
    recentThumbFallbackText: { color: colors.textSecondary },
    recentDate: { color: colors.textMuted },
    momentStatusLabel: { color: colors.textPrimary },
    recentTitle: { color: colors.textPrimary },
    recentSummary: { color: colors.textSecondary },
    timelineTitle: { color: colors.textPrimary },
    videoArchiveRow: {
      backgroundColor: colors.surface,
      borderColor: borderSoft,
    },
    videoArchiveThumb: { backgroundColor: colors.surfaceElevated },
    videoArchiveKicker: { color: colors.success },
    videoArchiveTitle: { color: colors.textPrimary },
    videoArchiveDescription: { color: colors.textSecondary },
    videoArchiveEmptyVisual: {
      backgroundColor: surfaceSubtle,
      borderColor: borderSoft,
    },
    videoArchiveEmptyVisualAttention: {
      backgroundColor: warningSoft,
      borderColor: isLight ? '#fde68a' : 'rgba(251, 191, 36, 0.28)',
    },
    placeholderCard: {
      backgroundColor: colors.surface,
      borderColor: borderSoft,
    },
    placeholderTitle: { color: colors.textPrimary },
    placeholderText: { color: colors.textSecondary },
    groupChip: {
      backgroundColor: colors.surfaceElevated,
      borderColor: borderSoft,
    },
    groupChipSelected: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    groupChipTitle: { color: colors.textPrimary },
    groupChipTitleSelected: { color: colors.background },
    groupChipMeta: { color: colors.textMuted },
    groupChipMetaSelected: { color: colors.background },
    contextText: { color: colors.textMuted },
    uploadSheetBackdrop: { backgroundColor: colors.background },
    uploadSheet: { backgroundColor: colors.background },
    uploadSheetTitle: { color: colors.textPrimary },
    uploadSheetDescription: { color: colors.textSecondary },
    selectedVideoInfo: {
      backgroundColor: colors.surface,
      borderColor: borderSoft,
    },
    selectedVideoLabel: { color: colors.textMuted },
    selectedVideoTitle: { color: colors.textPrimary },
    selectedVideoMeta: { color: colors.accent },
    uploadStepPill: {
      backgroundColor: isLight ? '#e0f2fe' : 'rgba(56, 189, 248, 0.1)',
      borderColor: isLight ? '#bae6fd' : 'rgba(125, 211, 252, 0.22)',
    },
    uploadStepIndex: { color: colors.accent },
    uploadStepText: { color: colors.textPrimary },
    selectedVideoHelper: { borderTopColor: borderSoft },
    selectedVideoHelperTitle: { color: colors.textPrimary },
    selectedVideoHelperText: { color: colors.textSecondary },
    uploadPageFooter: {
      backgroundColor: colors.surface,
      borderColor: borderSoft,
    },
    uploadAiNotice: { color: colors.textSecondary },
    uploadPageSecondaryButton: {
      backgroundColor: isLight ? '#e0f2fe' : 'rgba(56, 189, 248, 0.12)',
      borderColor: isLight ? '#bae6fd' : 'rgba(125, 211, 252, 0.34)',
    },
    uploadPageSecondaryText: { color: colors.accent },
    uploadPagePrimaryButton: { backgroundColor: colors.textPrimary },
    uploadPagePrimaryText: { color: colors.background },
    uploadSubmittingHint: { color: colors.accent },
    uploadSubmittingPanel: {
      backgroundColor: isLight ? '#e0f2fe' : 'rgba(56, 189, 248, 0.1)',
      borderColor: isLight ? '#bae6fd' : 'rgba(125, 211, 252, 0.3)',
    },
    uploadSubmittingTitle: { color: colors.textPrimary },
    uploadBlockingOverlay: {
      backgroundColor: isLight
        ? 'rgba(248, 250, 252, 0.88)'
        : 'rgba(5, 5, 7, 0.86)',
    },
    uploadBlockingCard: {
      backgroundColor: colors.surface,
      borderColor: isLight ? '#bae6fd' : 'rgba(125, 211, 252, 0.34)',
    },
    uploadBlockingTitle: { color: colors.textPrimary },
    uploadBlockingText: { color: colors.accent },
    uploadBlockingStep: { color: colors.textMuted },
    uploadProgressPercent: { color: colors.accent },
    uploadProgressTrack: {
      backgroundColor: isLight ? '#cbd5e1' : 'rgba(148, 163, 184, 0.24)',
    },
    emptyState: {
      backgroundColor: colors.surface,
      borderColor: borderSoft,
    },
    emptyTitle: { color: colors.textPrimary },
    emptyText: { color: colors.textSecondary },
    detailModalContainer: { backgroundColor: colors.background },
    detailModalHeader: {
      backgroundColor: colors.background,
      borderBottomColor: borderSoft,
    },
    detailHeaderTitle: { color: colors.textPrimary },
    detailHeaderMeta: { color: colors.textMuted },
    detailBackIconStrokeTop: { backgroundColor: colors.textPrimary },
    detailBackIconStrokeBottom: { backgroundColor: colors.textPrimary },
    detailVideoFrame: { backgroundColor: colors.surfaceElevated },
    detailActionPanel: { borderBottomColor: borderSoft },
    detailActionTitle: { color: colors.textPrimary },
    detailReviewCard: {
      backgroundColor: accentSoft,
      borderColor: isLight ? '#99f6e4' : 'rgba(3, 199, 90, 0.22)',
    },
    detailReviewLabel: { color: colors.success },
    detailReviewTitle: { color: colors.textPrimary },
    detailReviewAction: { color: colors.success },
    detailSummaryCard: { borderBottomColor: borderSoft },
    detailSectionHeading: { color: colors.textPrimary },
    detailStateCard: { borderBottomColor: borderSoft },
    detailStateTitle: { color: colors.textPrimary },
    detailStateText: { color: colors.textMuted },
    detailHero: { backgroundColor: colors.surfaceElevated },
    detailThumbnailHero: { backgroundColor: colors.surfaceElevated },
    detailHeroFallback: { backgroundColor: colors.surfaceElevated },
    videoMissingFallback: { backgroundColor: colors.surfaceElevated },
    videoMissingTitle: { color: colors.textPrimary },
    videoMissingText: { color: colors.textMuted },
    detailMomentReason: { color: colors.textMuted },
    detailNotes: {
      backgroundColor: surfaceSubtle,
      borderColor: borderSoft,
      color: colors.textSecondary,
    },
    coachDock: {
      backgroundColor: colors.surface,
      borderColor: borderSoft,
    },
    coachDockTitle: { color: colors.textPrimary },
    coachDockText: { color: colors.textMuted },
    detailRetryButton: { backgroundColor: colors.accent },
    detailRetryText: { color: colors.background },
    riderAnalysisCard: {
      backgroundColor: colors.surface,
      borderColor: isLight ? '#99f6e4' : 'rgba(3, 199, 90, 0.2)',
    },
    riderAnalysisEyebrow: { color: colors.success },
    riderAnalysisBadge: {
      backgroundColor: accentSoft,
      borderColor: isLight ? '#99f6e4' : 'rgba(3, 199, 90, 0.26)',
      color: colors.success,
    },
    riderAnalysisTitle: { color: colors.textPrimary },
    riderAnalysisSummary: { color: colors.textSecondary },
    riderAnalysisTrustBox: {
      backgroundColor: surfaceSubtle,
      borderColor: borderSoft,
    },
    riderAnalysisTrustTitle: { color: colors.textPrimary },
    riderAnalysisTrustText: { color: colors.textSecondary },
    riderAnalysisSection: { borderTopColor: borderSoft },
    riderAnalysisSectionTitle: { color: colors.textMuted },
    riderAnalysisItem: { color: colors.textSecondary },
    evidenceDisclosureCard: { borderBottomColor: borderSoft },
    evidenceDisclosureLabel: { color: colors.textMuted },
    evidenceDisclosureTitle: { color: colors.textPrimary },
    evidenceDisclosureAction: { color: colors.accent },
    evidenceTitle: { color: colors.textPrimary },
    evidenceModelBadge: {
      backgroundColor: accentSoft,
      borderColor: isLight ? '#99f6e4' : 'rgba(3, 199, 90, 0.28)',
      color: colors.success,
    },
    evidenceModelBadgeDegraded: {
      backgroundColor: errorSoft,
      borderColor: isLight ? '#fecdd3' : 'rgba(251, 113, 133, 0.28)',
      color: colors.error,
    },
    evidenceFactRow: { borderTopColor: borderSoft },
    evidenceFactLabel: { color: colors.textMuted },
    evidenceFactValue: { color: colors.textPrimary },
    evidenceSection: { borderTopColor: borderSoft },
    evidenceSectionTitle: { color: colors.textPrimary },
    evidenceText: { color: colors.textSecondary },
    evidenceWarningText: { color: colors.warning },
    evidenceSummaryCard: {
      backgroundColor: colors.surface,
      borderColor: borderSoft,
    },
    evidenceSummaryLabel: { color: colors.textMuted },
    evidenceSummaryValue: { color: colors.textPrimary },
    debugBox: {
      backgroundColor: colors.surfaceElevated,
      borderColor: borderStrong,
    },
    debugText: { color: colors.textMuted },
  });
}

const baseStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050507',
  },
  containerDark: {
    backgroundColor: '#050507',
  },
  bootLoadingScreen: {
    alignItems: 'center',
    backgroundColor: '#050507',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  bootLoadingContent: {
    alignItems: 'center',
  },
  bootLoadingTitle: {
    color: '#f9fafb',
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 26,
    marginTop: 6,
    textAlign: 'center',
  },
  keyboardView: {
    flex: 1,
  },
  pager: {
    flex: 1,
  },
  pagerLazyPlaceholder: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 124,
    paddingHorizontal: 0,
    paddingTop: 6,
  },
  analysisCompleteBanner: {
    alignItems: 'center',
    backgroundColor: 'rgba(16, 18, 24, 0.96)',
    borderColor: 'rgba(34, 197, 94, 0.34)',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    left: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    position: 'absolute',
    right: 16,
    shadowColor: '#000',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.26,
    shadowRadius: 20,
    top: Platform.OS === 'ios' ? 58 : 28,
    zIndex: 40,
  },
  analysisCompleteIcon: {
    alignItems: 'center',
    backgroundColor: '#22c55e',
    borderRadius: 999,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  analysisCompleteIconText: {
    color: '#052e16',
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 20,
  },
  analysisCompleteBody: {
    flex: 1,
  },
  analysisCompleteTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 18,
  },
  analysisCompleteText: {
    color: '#bbf7d0',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
    marginTop: 2,
  },
  qaDebugCollapsed: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    borderColor: 'rgba(148, 163, 184, 0.42)',
    borderRadius: 999,
    borderWidth: 1,
    bottom: 88,
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    position: 'absolute',
    right: 16,
    zIndex: 70,
  },
  qaDebugCollapsedText: {
    color: '#bae6fd',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
  },
  qaDebugPanel: {
    backgroundColor: 'rgba(2, 6, 23, 0.92)',
    borderColor: 'rgba(148, 163, 184, 0.34)',
    borderRadius: 14,
    borderWidth: 1,
    bottom: 88,
    maxWidth: 330,
    paddingHorizontal: 10,
    paddingVertical: 9,
    position: 'absolute',
    right: 14,
    width: '82%',
    zIndex: 70,
  },
  qaDebugHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  qaDebugTitle: {
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '900',
  },
  qaDebugCollapseHint: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '900',
  },
  qaDebugLine: {
    color: '#cbd5e1',
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: undefined,
    }),
    fontSize: 9,
    lineHeight: 13,
  },
  bottomTabBar: {
    alignItems: 'center',
    backgroundColor: 'rgba(20, 22, 28, 0.92)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 28,
    borderWidth: 1,
    bottom: 12,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'space-around',
    left: 16,
    paddingHorizontal: 6,
    paddingVertical: 6,
    position: 'absolute',
    right: 16,
    shadowColor: '#000',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.34,
    shadowRadius: 22,
  },
  bottomTabBarDark: {
    backgroundColor: 'rgba(20, 22, 28, 0.92)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  bottomTabItem: {
    alignItems: 'center',
    borderRadius: 18,
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  bottomTabItemSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  bottomTabItemSelectedDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  bottomTabIconFrame: {
    alignItems: 'center',
    borderRadius: 14,
    height: 32,
    justifyContent: 'center',
    width: 42,
  },
  bottomTabIconFrameSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  tabPageHeader: {
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  headerTitleBlock: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 10,
  },
  headerMenuButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(248, 250, 252, 0.08)',
    borderColor: 'rgba(248, 250, 252, 0.14)',
    borderRadius: 999,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  headerMenuText: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 22,
  },
  kicker: {
    color: '#9ca3af',
    fontSize: 10,
    fontWeight: '900',
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  title: {
    color: '#f9fafb',
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 29,
  },
  headerMeta: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  headerAddButton: {
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 999,
    height: 42,
    justifyContent: 'center',
    shadowColor: '#ffffff',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    width: 42,
  },
  headerAddIconWrap: {
    alignItems: 'center',
    height: 25,
    justifyContent: 'center',
    width: 25,
  },
  headerAddIconBadge: {
    position: 'absolute',
    right: -2,
    top: -1,
  },
  journalSnapshot: {
    backgroundColor: '#0f1117',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    marginHorizontal: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  journalSnapshotHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  journalSnapshotTitle: {
    color: '#f9fafb',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  journalSnapshotMeta: {
    color: '#9ca3af',
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'right',
  },
  journalSnapshotGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  journalSnapshotItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 10,
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  journalSnapshotValue: {
    color: '#f9fafb',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 22,
  },
  journalSnapshotLabel: {
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
  },
  primaryInsightCard: {
    backgroundColor: '#101218',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 20,
    marginHorizontal: 16,
    padding: 15,
  },
  cardEyebrow: {
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  primaryInsightTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 25,
  },
  primaryInsightText: {
    color: '#d1d5db',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 8,
  },
  primaryInsightReview: {
    color: '#fde68a',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    marginTop: 9,
  },
  primaryInsightFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  primaryInsightDate: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '800',
  },
  textLinkButton: {
    alignSelf: 'flex-start',
    marginTop: 13,
  },
  textLinkButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
    textDecorationLine: 'underline',
  },
  section: {
    marginBottom: 18,
  },
  sectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  sectionLabel: {
    color: '#f9fafb',
    fontSize: 16,
    fontWeight: '900',
  },
  sectionHint: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  recentRail: {
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 2,
  },
  recentSessionCard: {
    backgroundColor: 'rgba(20, 22, 28, 0.86)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    paddingBottom: 13,
    width: 236,
  },
  recentPreview: {
    alignItems: 'center',
    alignSelf: 'stretch',
    aspectRatio: 1.62,
    backgroundColor: '#0b0d12',
    justifyContent: 'center',
    marginBottom: 12,
    overflow: 'hidden',
    width: '100%',
  },
  recentThumbImage: {
    ...StyleSheet.absoluteFillObject,
    height: '100%',
    width: '100%',
  },
  recentThumbFallback: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  recentThumbFallbackText: {
    color: '#d1d5db',
    fontSize: 11,
    fontWeight: '900',
  },
  recentDate: {
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: '800',
  },
  momentStatusLabel: {
    color: '#f9fafb',
    fontSize: 11,
    fontWeight: '900',
  },
  recentFloatingMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 14,
    marginBottom: 7,
  },
  recentTitle: {
    color: '#f9fafb',
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 20,
    paddingHorizontal: 14,
  },
  recentSummary: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 7,
    paddingHorizontal: 14,
  },
  timelineTitle: {
    color: '#f9fafb',
    flex: 1,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 19,
  },
  videoArchiveList: {
    gap: 10,
    marginHorizontal: 16,
  },
  videoArchiveListContent: {
    paddingBottom: 124,
    paddingTop: 6,
  },
  videoArchiveSeparator: {
    height: 10,
  },
  videoArchiveFooter: {
    alignItems: 'center',
    paddingBottom: 10,
    paddingTop: 16,
  },
  videoArchiveRow: {
    alignItems: 'stretch',
    backgroundColor: '#14161c',
    borderColor: 'rgba(255, 255, 255, 0.09)',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    height: 104,
    marginHorizontal: 16,
    overflow: 'hidden',
  },
  videoArchiveThumb: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#0b0d12',
    justifyContent: 'center',
    overflow: 'hidden',
    width: 108,
  },
  mediaStatusDotOverlay: {
    left: 8,
    position: 'absolute',
    top: 8,
  },
  videoArchiveBody: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  videoArchiveMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    marginBottom: 6,
  },
  videoArchiveKicker: {
    color: '#86efac',
    flexShrink: 0,
    fontSize: 10,
    fontWeight: '900',
  },
  videoArchiveTitle: {
    color: '#f9fafb',
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 20,
  },
  videoArchiveStatusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    marginTop: 5,
  },
  videoArchiveDescription: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 5,
  },
  videoArchiveEmptyVisual: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(148, 163, 184, 0.1)',
    borderColor: 'rgba(148, 163, 184, 0.22)',
    borderRadius: 999,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    marginBottom: 12,
    width: 42,
  },
  videoArchiveEmptyVisualAttention: {
    backgroundColor: 'rgba(251, 191, 36, 0.12)',
    borderColor: 'rgba(251, 191, 36, 0.28)',
  },
  placeholderCard: {
    backgroundColor: '#14161c',
    borderColor: 'rgba(255, 255, 255, 0.09)',
    borderRadius: 18,
    borderWidth: 1,
    marginHorizontal: 16,
    padding: 16,
  },
  placeholderTitle: {
    color: '#f9fafb',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 23,
  },
  placeholderText: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 8,
  },
  groupRow: {
    gap: 6,
    paddingBottom: 4,
    paddingHorizontal: 16,
  },
  groupChip: {
    backgroundColor: 'rgba(248, 250, 252, 0.08)',
    borderColor: 'rgba(248, 250, 252, 0.12)',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  groupChipSelected: {
    backgroundColor: '#03c75a',
    borderColor: '#03c75a',
  },
  groupChipPressed: {
    opacity: 0.85,
  },
  groupChipTitle: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '900',
  },
  groupChipTitleSelected: {
    color: '#07110a',
  },
  groupChipMeta: {
    color: '#94a3b8',
    fontSize: 11,
    lineHeight: 14,
  },
  groupChipMetaSelected: {
    color: '#1f2a0d',
  },
  contextText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 3,
  },
  uploadSheetBackdrop: {
    backgroundColor: '#050507',
    flex: 1,
  },
  uploadSheet: {
    alignSelf: 'stretch',
    backgroundColor: '#050507',
    flex: 1,
    paddingBottom: 12,
    paddingHorizontal: 0,
    paddingTop: 18,
    width: '100%',
  },
  uploadSheetPaddedSection: {
    paddingHorizontal: 18,
  },
  uploadSheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 14,
  },
  uploadSheetTitleBlock: {
    alignItems: 'flex-start',
    flex: 1,
    paddingLeft: 12,
  },
  uploadSheetTitle: {
    color: '#f9fafb',
    fontSize: 21,
    fontWeight: '900',
    lineHeight: 26,
  },
  uploadSheetDescription: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 3,
  },
  uploadSheetSubmitButtonDisabled: {
    backgroundColor: '#2a303b',
  },
  uploadSheetSubmitTextDisabled: {
    color: '#64748b',
  },
  selectedVideoInfo: {
    backgroundColor: '#101218',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    marginHorizontal: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  uploadVideoPreviewFrame: {
    alignSelf: 'stretch',
    aspectRatio: 16 / 9,
    backgroundColor: '#050507',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 12,
    marginHorizontal: 16,
    overflow: 'hidden',
  },
  uploadVideoPreview: {
    height: '100%',
    width: '100%',
  },
  selectedVideoLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 5,
    textTransform: 'uppercase',
  },
  selectedVideoTitle: {
    color: '#f9fafb',
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 19,
  },
  selectedVideoMeta: {
    color: '#bae6fd',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 4,
  },
  uploadStepStrip: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
  },
  uploadStepPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderColor: 'rgba(125, 211, 252, 0.22)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    flex: 1,
    gap: 5,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: 6,
  },
  uploadStepIndex: {
    color: '#bae6fd',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 14,
  },
  uploadStepText: {
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 14,
  },
  selectedVideoHelper: {
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    borderTopWidth: 1,
    marginTop: 12,
    paddingTop: 11,
  },
  selectedVideoHelperTitle: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 17,
  },
  selectedVideoHelperText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 4,
  },
  uploadPageBody: {
    flexGrow: 1,
    paddingTop: 2,
    paddingBottom: 20,
  },
  uploadPageFooter: {
    backgroundColor: '#101218',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    marginHorizontal: 16,
    padding: 12,
  },
  uploadPageFooterActions: {
    flexDirection: 'row',
    gap: 10,
  },
  uploadAiNotice: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    textAlign: 'center',
  },
  uploadPageSecondaryButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderColor: 'rgba(125, 211, 252, 0.34)',
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  uploadPageSecondaryText: {
    color: '#7dd3fc',
    fontSize: 14,
    fontWeight: '900',
  },
  uploadPagePrimaryButton: {
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 14,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  uploadPagePrimaryText: {
    color: '#050507',
    fontSize: 14,
    fontWeight: '900',
  },
  uploadSubmittingHint: {
    color: '#bae6fd',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    textAlign: 'center',
  },
  uploadSubmittingPanel: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderColor: 'rgba(125, 211, 252, 0.3)',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  uploadSubmittingTitle: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 17,
    marginBottom: 4,
    textAlign: 'center',
  },
  uploadBlockingOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(5, 5, 7, 0.86)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    paddingHorizontal: 24,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  uploadBlockingCard: {
    alignItems: 'center',
    backgroundColor: '#101218',
    borderColor: 'rgba(125, 211, 252, 0.34)',
    borderRadius: 22,
    borderWidth: 1,
    gap: 10,
    maxWidth: 340,
    paddingHorizontal: 22,
    paddingVertical: 24,
    width: '100%',
  },
  uploadBlockingTitle: {
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 22,
    marginTop: 4,
    textAlign: 'center',
  },
  uploadBlockingText: {
    color: '#bae6fd',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    textAlign: 'center',
  },
  uploadBlockingStep: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 16,
  },
  uploadProgressFill: {
    backgroundColor: '#38bdf8',
    borderRadius: 999,
    height: '100%',
  },
  uploadProgressPercent: {
    color: '#e0f2fe',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 18,
  },
  uploadProgressTrack: {
    backgroundColor: 'rgba(148, 163, 184, 0.24)',
    borderRadius: 999,
    height: 8,
    overflow: 'hidden',
    width: '100%',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  emptyState: {
    backgroundColor: '#14161c',
    borderColor: 'rgba(255, 255, 255, 0.09)',
    borderRadius: 18,
    borderWidth: 1,
    marginHorizontal: 16,
    padding: 16,
  },
  emptyTitle: {
    color: '#f9fafb',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptyText: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 18,
  },
  galleryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  galleryCard: {
    flexBasis: '48%',
    flexGrow: 1,
    marginBottom: 14,
    maxWidth: '48%',
  },
  galleryFrame: {
    backgroundColor: '#f8fafc',
    borderColor: '#e5e7eb',
    borderRadius: 8,
    borderWidth: 1,
    padding: 5,
    shadowColor: '#000',
    shadowOffset: { height: 3, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },
  galleryThumb: {
    aspectRatio: 1,
    backgroundColor: '#111318',
    borderRadius: 4,
    overflow: 'hidden',
  },
  galleryImage: {
    height: '100%',
    width: '100%',
  },
  galleryFallback: {
    alignItems: 'center',
    backgroundColor: '#171a21',
    flex: 1,
    justifyContent: 'center',
  },
  galleryFallbackPlay: {
    color: '#03c75a',
    fontSize: 32,
    fontWeight: '900',
    marginBottom: 5,
  },
  galleryFallbackText: {
    color: '#cbd5e1',
    fontSize: 10,
    fontWeight: '900',
  },
  galleryTopBar: {
    alignItems: 'flex-start',
    gap: 5,
    left: 7,
    position: 'absolute',
    right: 7,
    top: 7,
  },
  galleryDate: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    color: '#f8fafc',
    fontSize: 10,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  galleryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#94a3b8',
    color: '#07110a',
    fontSize: 10,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  galleryTitle: {
    color: '#e5e7eb',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 4,
    marginTop: 7,
  },
  sessionRow: {
    backgroundColor: '#0b0d12',
    borderRadius: 0,
    marginBottom: 18,
    overflow: 'hidden',
  },
  sessionRowPressed: {
    opacity: 0.9,
  },
  momentHero: {
    backgroundColor: '#171a21',
    height: 390,
    overflow: 'hidden',
  },
  momentImage: {
    height: '100%',
    width: '100%',
  },
  momentFallback: {
    alignItems: 'center',
    backgroundColor: '#171a21',
    flex: 1,
    justifyContent: 'center',
  },
  momentFallbackPlay: {
    color: '#03c75a',
    fontSize: 42,
    fontWeight: '900',
    marginBottom: 6,
  },
  momentFallbackText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  momentShade: {
    backgroundColor: 'rgba(3, 7, 18, 0.48)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  momentTopBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 16,
    position: 'absolute',
    right: 16,
    top: 14,
  },
  momentDate: {
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    color: '#f8fafc',
    fontSize: 10,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  momentCopy: {
    bottom: 16,
    left: 16,
    position: 'absolute',
    right: 16,
  },
  momentTitle: {
    color: '#f8fafc',
    fontSize: 27,
    fontWeight: '900',
    lineHeight: 31,
  },
  momentReason: {
    color: '#b7f5ce',
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 17,
    marginTop: 3,
  },
  momentFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  momentFooterCopy: {
    flex: 1,
  },
  momentSessionTitle: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 2,
  },
  momentWhyOpen: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '800',
  },
  momentSignals: {
    alignItems: 'flex-start',
    gap: 4,
  },
  momentOpenText: {
    color: '#03c75a',
    fontSize: 11,
    fontWeight: '900',
  },
  sessionHeroRow: {
    flexDirection: 'row',
    gap: 9,
  },
  sessionThumb: {
    backgroundColor: '#0b1220',
    borderColor: '#334155',
    borderRadius: 8,
    borderWidth: 1,
    height: 78,
    overflow: 'hidden',
    width: 104,
  },
  sessionThumbImage: {
    height: '100%',
    width: '100%',
  },
  sessionThumbFallback: {
    alignItems: 'center',
    backgroundColor: '#0f172a',
    flex: 1,
    justifyContent: 'center',
  },
  sessionThumbFallbackIcon: {
    color: '#03c75a',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 3,
  },
  sessionThumbFallbackText: {
    color: '#cbd5e1',
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  sessionThumbBadge: {
    backgroundColor: '#03c75a',
    bottom: 5,
    left: 5,
    paddingHorizontal: 6,
    paddingVertical: 3,
    position: 'absolute',
  },
  sessionThumbBadgeText: {
    color: '#07110a',
    fontSize: 9,
    fontWeight: '900',
  },
  sessionHeroBody: {
    flex: 1,
    minHeight: 78,
  },
  sessionHeaderRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  sessionTitleBlock: {
    flex: 1,
  },
  sessionTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 1,
  },
  sessionDate: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
  },
  sessionChevron: {
    alignItems: 'center',
    backgroundColor: '#1f2937',
    borderRadius: 999,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  sessionChevronText: {
    color: '#03c75a',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 22,
  },
  sessionDetectedAction: {
    color: '#03c75a',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 3,
  },
  sessionHook: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
  },
  sessionHookMuted: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 16,
  },
  sessionNotes: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 18,
  },
  listStatusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 9,
    marginBottom: 6,
  },
  sessionSignalRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 7,
  },
  signalItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  signalDot: {
    backgroundColor: '#475569',
    borderRadius: 999,
    height: 6,
    width: 6,
  },
  signalDotActive: {
    backgroundColor: '#03c75a',
  },
  signalText: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '900',
  },
  signalTextActive: {
    color: '#cbd5e1',
  },
  sessionBottomRail: {
    alignItems: 'center',
    borderTopColor: '#243044',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 7,
  },
  sessionBottomText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '900',
  },
  sessionBottomCta: {
    color: '#03c75a',
    fontSize: 11,
    fontWeight: '900',
  },
  sessionActionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 9,
  },
  sessionOpenButton: {
    backgroundColor: '#ecfdf5',
    borderColor: '#99f6e4',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sessionOpenText: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '900',
  },
  detailPanel: {
    backgroundColor: '#0b0d12',
  },
  detailModalContainer: {
    backgroundColor: '#050507',
    flex: 1,
  },
  detailModalBody: {
    paddingBottom: 42,
  },
  detailModalHeader: {
    alignItems: 'center',
    backgroundColor: '#050507',
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  detailCloseButton: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  detailBackIcon: {
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  detailBackIconStrokeTop: {
    backgroundColor: '#f8fafc',
    borderRadius: 999,
    height: 2.5,
    left: 4,
    position: 'absolute',
    top: 5,
    transform: [{ rotate: '-45deg' }],
    width: 12,
  },
  detailBackIconStrokeBottom: {
    backgroundColor: '#f8fafc',
    borderRadius: 999,
    height: 2.5,
    left: 4,
    position: 'absolute',
    top: 13,
    transform: [{ rotate: '45deg' }],
    width: 12,
  },
  detailHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  detailHeaderTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '900',
  },
  detailHeaderMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    marginTop: 3,
  },
  detailHeaderMeta: {
    color: '#9ca3af',
    flex: 1,
    fontSize: 11,
    fontWeight: '800',
  },
  detailHeaderActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 6,
  },
  detailVideoFrame: {
    aspectRatio: 1,
    backgroundColor: '#0f172a',
    marginBottom: 18,
    overflow: 'hidden',
    width: '100%',
  },
  detailActionPanel: {
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
    paddingBottom: 16,
  },
  detailActionTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 10,
  },
  detailReviewCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(3, 199, 90, 0.1)',
    borderColor: 'rgba(3, 199, 90, 0.22)',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    marginHorizontal: 16,
    padding: 14,
  },
  detailReviewTextBlock: {
    flex: 1,
    paddingRight: 12,
  },
  detailReviewLabel: {
    color: '#86efac',
    fontSize: 10,
    fontWeight: '900',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  detailReviewTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 18,
  },
  detailReviewAction: {
    color: '#86efac',
    fontSize: 12,
    fontWeight: '900',
  },
  detailSummaryCard: {
    marginHorizontal: 16,
    paddingBottom: 16,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  detailSectionHeading: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '900',
  },
  detailStateCard: {
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
    paddingVertical: 16,
  },
  detailStateTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 5,
  },
  detailStateText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#1f2937',
    borderRadius: 999,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  backButtonText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '900',
  },
  detailHero: {
    backgroundColor: '#0b1220',
    height: 430,
    marginBottom: 0,
    overflow: 'hidden',
  },
  detailHeroImage: {
    height: '100%',
    width: '100%',
  },
  detailVideo: {
    height: '100%',
    width: '100%',
  },
  detailThumbnailHero: {
    backgroundColor: '#0f172a',
    flex: 1,
  },
  detailThumbnailImage: {
    height: '100%',
    width: '100%',
  },
  detailThumbnailOverlay: {
    backgroundColor: 'rgba(2, 6, 23, 0.68)',
    bottom: 0,
    left: 0,
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 18,
    position: 'absolute',
    right: 0,
  },
  detailThumbnailBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(248, 250, 252, 0.14)',
    borderColor: 'rgba(248, 250, 252, 0.2)',
    borderRadius: 999,
    borderWidth: 1,
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '900',
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  detailThumbnailTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 25,
    marginTop: 8,
  },
  detailThumbnailText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 18,
    marginTop: 4,
  },
  detailHeroFallback: {
    alignItems: 'center',
    backgroundColor: '#0f172a',
    flex: 1,
    justifyContent: 'center',
  },
  detailHeroPlay: {
    color: '#03c75a',
    fontSize: 46,
    fontWeight: '900',
  },
  detailHeroShade: {
    backgroundColor: 'rgba(7, 10, 15, 0.42)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  detailPlayButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(132, 204, 22, 0.92)',
    borderColor: 'rgba(248, 250, 252, 0.7)',
    borderRadius: 999,
    borderWidth: 1,
    height: 58,
    justifyContent: 'center',
    left: '50%',
    marginLeft: -29,
    marginTop: -29,
    position: 'absolute',
    top: '50%',
    width: 58,
  },
  detailBackOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.68)',
    borderColor: 'rgba(248, 250, 252, 0.18)',
    borderRadius: 999,
    borderWidth: 1,
    left: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    position: 'absolute',
    top: 14,
  },
  detailPlayIcon: {
    color: '#07110a',
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 30,
    marginLeft: 3,
  },
  detailHeroContent: {
    bottom: 20,
    left: 16,
    position: 'absolute',
    right: 16,
  },
  detailHeroMeta: {
    color: '#03c75a',
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  detailHeroTitle: {
    color: '#f8fafc',
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 34,
  },
  detailHeroReason: {
    color: '#b7f5ce',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 19,
    marginTop: 5,
  },
  detailSignalRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  videoMissingFallback: {
    alignItems: 'center',
    backgroundColor: '#0f172a',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  videoMissingTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 6,
    textAlign: 'center',
  },
  videoMissingText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    textAlign: 'center',
  },
  detailTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 4,
  },
  detailNotes: {
    backgroundColor: 'rgba(248, 250, 252, 0.06)',
    borderColor: 'rgba(248, 250, 252, 0.1)',
    borderRadius: 14,
    borderWidth: 1,
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
  },
  detailMomentSummary: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  detailMomentReason: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    marginTop: 4,
  },
  coachDock: {
    backgroundColor: '#111318',
    borderColor: 'rgba(248, 250, 252, 0.08)',
    borderRadius: 18,
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 14,
    padding: 13,
  },
  coachDockTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '900',
  },
  coachDockText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 3,
  },
  detailActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  detailRetryButton: {
    alignItems: 'center',
    backgroundColor: '#03c75a',
    borderRadius: 999,
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  detailRetryButtonDisabled: {
    backgroundColor: '#475569',
  },
  detailRetryText: {
    color: '#07110a',
    fontSize: 13,
    fontWeight: '900',
  },
  detailRetryTextDisabled: {
    color: '#cbd5e1',
  },
  detailDeleteButton: {
    alignItems: 'center',
    backgroundColor: '#fff1f2',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  detailDeleteButtonDisabled: {
    opacity: 0.55,
  },
  detailDeleteText: {
    color: '#be123c',
    fontSize: 13,
    fontWeight: '900',
  },
  detailHint: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 8,
    marginTop: 7,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  statusPillActive: {
    backgroundColor: '#ccfbf1',
  },
  statusPillIdle: {
    backgroundColor: '#f1f5f9',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  statusPillTextActive: {
    color: '#0f766e',
  },
  statusPillTextIdle: {
    color: '#64748b',
  },
  analysisPanel: {
    borderTopColor: '#e2e8f0',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 10,
    paddingTop: 10,
  },
  analysisLabel: {
    color: '#64748b',
    fontSize: 12,
    marginBottom: 8,
  },
  analysisButton: {
    alignItems: 'center',
    backgroundColor: '#0f766e',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  coachingButtonComplete: {
    alignItems: 'center',
    backgroundColor: '#0f766e',
    borderColor: '#0f766e',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  coachingButtonPending: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#99f6e4',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  benchmarkButton: {
    alignItems: 'center',
    backgroundColor: '#334155',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  analysisButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  analysisButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  pendingButtonText: {
    color: '#0f766e',
  },
  analysisResult: {
    backgroundColor: '#f0fdfa',
    borderColor: '#99f6e4',
    borderRadius: 16,
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
  },
  analysisResultTitle: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 5,
    textTransform: 'uppercase',
  },
  analysisResultText: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 6,
  },
  analysisResultListItem: {
    color: '#475569',
    fontSize: 12,
    lineHeight: 18,
  },
  sharePreviewCard: {
    backgroundColor: '#f8fafc',
    borderColor: 'rgba(148, 163, 184, 0.28)',
    borderRadius: 8,
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 16,
    overflow: 'hidden',
  },
  sharePreviewHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  sharePreviewEyebrow: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  sharePreviewBrand: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
  },
  sharePreviewImage: {
    backgroundColor: '#cbd5e1',
    height: 188,
    marginTop: 10,
    width: '100%',
  },
  sharePreviewImageFallback: {
    alignItems: 'center',
    backgroundColor: '#111827',
    height: 148,
    justifyContent: 'center',
    marginTop: 10,
    paddingHorizontal: 18,
  },
  sharePreviewImageFallbackText: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
    textAlign: 'center',
  },
  sharePreviewBody: {
    padding: 14,
  },
  sharePreviewMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sharePreviewMeta: {
    color: '#64748b',
    flex: 1,
    fontSize: 11,
    fontWeight: '900',
  },
  sharePreviewBadge: {
    backgroundColor: '#dcfce7',
    borderRadius: 999,
    color: '#166534',
    fontSize: 11,
    fontWeight: '900',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  sharePreviewTitle: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
  },
  sharePreviewAnalysisTitle: {
    color: '#0f172a',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
    marginTop: 6,
  },
  sharePreviewSummary: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
    marginTop: 8,
  },
  sharePreviewSignalList: {
    borderTopColor: '#e2e8f0',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
    paddingTop: 10,
  },
  sharePreviewSignal: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 18,
    marginBottom: 3,
  },
  riderAnalysisCard: {
    backgroundColor: '#101218',
    borderColor: 'rgba(3, 199, 90, 0.2)',
    borderRadius: 8,
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 14,
  },
  riderAnalysisHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  riderAnalysisEyebrow: {
    color: '#86efac',
    fontSize: 11,
    fontWeight: '900',
  },
  riderAnalysisBadge: {
    backgroundColor: 'rgba(3, 199, 90, 0.14)',
    borderColor: 'rgba(3, 199, 90, 0.26)',
    borderRadius: 999,
    borderWidth: 1,
    color: '#86efac',
    fontSize: 11,
    fontWeight: '900',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  riderAnalysisBadgeStrong: {
    backgroundColor: 'rgba(3, 199, 90, 0.14)',
    borderColor: 'rgba(3, 199, 90, 0.26)',
    color: '#86efac',
  },
  riderAnalysisBadgePossible: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderColor: 'rgba(125, 211, 252, 0.28)',
    color: '#7dd3fc',
  },
  riderAnalysisBadgeReview: {
    backgroundColor: 'rgba(251, 191, 36, 0.14)',
    borderColor: 'rgba(251, 191, 36, 0.28)',
    color: '#fbbf24',
  },
  riderAnalysisTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 23,
  },
  riderAnalysisSummary: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
    marginTop: 7,
  },
  riderAnalysisTrustBox: {
    backgroundColor: 'rgba(148, 163, 184, 0.09)',
    borderColor: 'rgba(148, 163, 184, 0.16)',
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  riderAnalysisTrustTitle: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 16,
  },
  riderAnalysisTrustText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 4,
  },
  riderAnalysisSection: {
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
    paddingTop: 10,
  },
  riderAnalysisSectionTitle: {
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 5,
  },
  riderAnalysisItem: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    marginBottom: 4,
  },
  evidenceDisclosureCard: {
    alignItems: 'center',
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    paddingVertical: 16,
  },
  evidenceDisclosureLabel: {
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  evidenceDisclosureTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '900',
  },
  evidenceDisclosureAction: {
    color: '#bfdbfe',
    fontSize: 12,
    fontWeight: '900',
  },
  evidencePanel: {
    marginHorizontal: 16,
    paddingTop: 16,
  },
  evidenceTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 9,
    textTransform: 'uppercase',
  },
  evidenceModelBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(3, 199, 90, 0.12)',
    borderColor: 'rgba(3, 199, 90, 0.28)',
    borderRadius: 999,
    borderWidth: 1,
    color: '#86efac',
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  evidenceModelBadgeDegraded: {
    backgroundColor: 'rgba(251, 113, 133, 0.12)',
    borderColor: 'rgba(251, 113, 133, 0.28)',
    color: '#fb7185',
  },
  evidenceFactRow: {
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
  },
  evidenceFactLabel: {
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 2,
  },
  evidenceFactValue: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 3,
  },
  evidenceSection: {
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  evidenceSectionTitle: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 4,
  },
  evidenceText: {
    color: '#cbd5e1',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 4,
  },
  evidenceWarningText: {
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 18,
    marginBottom: 4,
  },
  evidenceSummaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  evidenceSummaryCard: {
    backgroundColor: '#101218',
    borderColor: 'rgba(255, 255, 255, 0.09)',
    borderRadius: 12,
    borderWidth: 1,
    flexGrow: 1,
    flexBasis: '47%',
    padding: 9,
  },
  evidenceSummaryLabel: {
    color: '#9ca3af',
    fontSize: 10,
    fontWeight: '900',
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  evidenceSummaryValue: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 16,
  },
  analysisCompactMeta: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 5,
  },
  resultOpenText: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '900',
    marginTop: 8,
  },
  resultDetailSection: {
    borderTopColor: '#dbe4ee',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
    paddingTop: 12,
  },
  resultDetailSectionTitle: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 6,
  },
  rawResponseToggle: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rawResponseToggleText: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '900',
  },
  resultDetailText: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 6,
  },
  rawResponseText: {
    color: '#0f172a',
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: undefined,
    }),
    fontSize: 11,
    lineHeight: 17,
  },
  highlightScene: {
    backgroundColor: '#fff',
    borderColor: '#99f6e4',
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
    overflow: 'hidden',
  },
  highlightImage: {
    backgroundColor: '#ccfbf1',
    height: 96,
    width: '100%',
  },
  imageModalBackdrop: {
    backgroundColor: 'rgba(15, 23, 42, 0.96)',
    flex: 1,
  },
  imageModalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  imageModalTitleBlock: {
    flex: 1,
  },
  imageModalTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '900',
  },
  imageModalMeta: {
    color: '#99f6e4',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 3,
  },
  imageModalCloseButton: {
    backgroundColor: '#f8fafc',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  imageModalCloseText: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '900',
  },
  imageModalBody: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  imageModalImage: {
    height: '100%',
    width: '100%',
  },
  imageModalNavRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  imageModalNavButton: {
    backgroundColor: '#0f766e',
    borderRadius: 999,
    minWidth: 76,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  imageModalNavButtonDisabled: {
    backgroundColor: '#475569',
  },
  imageModalNavText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  imageModalCounter: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '900',
    minWidth: 52,
    textAlign: 'center',
  },
  highlightBody: {
    padding: 10,
  },
  highlightMeta: {
    color: '#0f766e',
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  highlightTitle: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 4,
  },
  highlightDescription: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 19,
  },
  deleteButton: {
    alignItems: 'center',
    backgroundColor: '#fff1f2',
    borderColor: '#fecdd3',
    borderRadius: 12,
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 11,
  },
  deleteButtonText: {
    color: '#be123c',
    fontSize: 13,
    fontWeight: '900',
  },
  debugBox: {
    backgroundColor: '#020617',
    borderColor: '#334155',
    borderRadius: 12,
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 10,
  },
  debugText: {
    color: '#94a3b8',
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: undefined,
    }),
    fontSize: 10,
    lineHeight: 15,
  },
});

function hasCoachingResult(result: AnalysisResult | undefined) {
  return Boolean(result);
}

function StatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <View
      style={[
        baseStyles.statusPill,
        active ? baseStyles.statusPillActive : baseStyles.statusPillIdle,
      ]}
    >
      <Text
        style={[
          baseStyles.statusPillText,
          active ? baseStyles.statusPillTextActive : baseStyles.statusPillTextIdle,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function SignalDot({ active, label }: { active: boolean; label: string }) {
  return (
    <View style={baseStyles.signalItem}>
      <View style={[baseStyles.signalDot, active ? baseStyles.signalDotActive : undefined]} />
      <Text style={[baseStyles.signalText, active ? baseStyles.signalTextActive : undefined]}>
        {label}
      </Text>
    </View>
  );
}
