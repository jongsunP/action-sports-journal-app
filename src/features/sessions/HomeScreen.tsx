import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
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
  useColorScheme,
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
} from './momentStatus';
import {
  APP_TABS,
  type AppTabId,
  BottomNavigation,
  FlowPlaceholderTab,
  PrimaryInsightCard,
  RecentSessionsRail,
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

const ACTIVE_WAKEBOARD_GROUP_ID = 'group-wakeboard';
const ENABLE_INTERNAL_DEBUG_VIEWER =
  __DEV__ || process.env.EXPO_PUBLIC_ENABLE_DEBUG_VIEWER === 'true';
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

export function HomeScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList, 'Home'>>();
  const layout = useWindowDimensions();
  const colorScheme = useColorScheme();
  const prefersDarkMode = colorScheme === 'dark';
  const { authMode, user } = useAuthSession();
  const canUseRemoteApi =
    authMode === 'authenticated' || authMode === 'internalFallback';
  const isAuthLoading = authMode === 'authLoading';
  const isLoginRequired = authMode === 'loginRequired';
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
  const [videoArchiveNextCursor, setVideoArchiveNextCursor] = useState<
    string | null
  >(null);
  const handledNotificationRefreshRequestIdRef = useRef<number | null>(null);
  const authCacheOwnerKeyRef = useRef<AuthCacheOwnerKey | null>(null);
  const isRefreshingRemoteMomentsRef = useRef(false);
  const pendingRemoteRefreshReasonRef = useRef<RemoteRefreshReason | null>(null);
  const hasAppliedBootVideoArchivePageRef = useRef(false);
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
            const completedRealtimeSession = findNewRealtimeCompletedSession({
              remoteMomentIdsBySessionId,
              remoteMoments,
              sessions,
            });
            syncRemoteMoments(remoteMoments);
            markRemoteMomentSyncCompleted();
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
    enabled:
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
        void refreshRemoteMoments('foreground');
      }
    });

    return () => {
      subscription.remove();
    };
  }, [refreshRemoteMoments]);

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
  }, [
    applyVideoArchiveFirstPage,
    canUseRemoteApi,
    hasInitialRemoteMomentPage,
    hasLoadedVideoArchiveFirstPage,
    initialRemoteMomentPageInfo.hasMore,
    initialRemoteMomentPageInfo.nextCursor,
    initialRemoteMoments,
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
      hasLoadedVideoArchiveFirstPage ||
      isLoadingVideoArchiveInitialPage ||
      !hasConfiguredSupabaseMoments()
    ) {
      return;
    }

    setIsLoadingVideoArchiveInitialPage(true);

    listMomentPageWithTimeout({
      limit: MOMENT_LIST_PAGE_SIZE,
    })
      .then((remoteMomentPage) => {
        syncRemoteMoments(remoteMomentPage.moments);
        applyVideoArchiveFirstPage(remoteMomentPage);
      })
      .catch((error) => {
        console.warn(
          'Supabase video archive initial page failed:',
          error instanceof Error ? error.message : 'Unknown error',
        );
      })
      .finally(() => {
        setIsLoadingVideoArchiveInitialPage(false);
      });
  }, [
    applyVideoArchiveFirstPage,
    canUseRemoteApi,
    hasLoadedVideoArchiveFirstPage,
    isLoadingVideoArchiveInitialPage,
    syncRemoteMoments,
  ]);

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
      })
      .catch((error) => {
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
      summary.momentStatus === 'upload_failed',
  );
  const primaryInsightSummary = latestCompletedSummary ?? latestActiveSummary;
  const latestAnalysisLabel = latestCompletedSummary
    ? formatShortSessionDate(latestCompletedSummary.session.occurredAt)
    : undefined;
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
    completedBootSyncAtRef.current = null;
    hasAttemptedBootUploadRecoveryRef.current = false;
    didNavigateToUploadRef.current = false;

    setVideoArchiveSessionIds([]);
    setVideoArchiveNextCursor(null);
    setHasMoreVideoArchiveMoments(false);
    setHasLoadedVideoArchiveFirstPage(false);
    setHasMountedVideoTab(false);
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

  if (isAuthLoading || isLoadingInitialMoments) {
    return (
      <SafeAreaView
        style={[
          styles.bootLoadingScreen,
          prefersDarkMode ? styles.containerDark : undefined,
        ]}
      >
        <View style={styles.bootLoadingContent}>
          <Text style={styles.kicker}>Riding Journal</Text>
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
          <Text style={styles.kicker}>Riding Journal</Text>
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

  const handleOpenProfile = () => {
    Alert.alert(
      '마이페이지',
      '계정과 설정 화면은 이후 단계에서 연결할 예정입니다.',
    );
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
          <Text style={styles.headerAddText}>＋</Text>
        </Pressable>
        <View style={styles.headerTitleBlock}>
          <Text style={styles.kicker}>Riding Journal</Text>
          <Text style={styles.title}>오늘의 라이딩 저널</Text>
          <Text style={styles.headerMeta}>
            {visibleSessions.length}개 세션
            {latestAnalysisLabel ? ` · 최근 분석 ${latestAnalysisLabel}` : ''}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="마이페이지 열기"
          accessibilityRole="button"
          onPress={handleOpenProfile}
          style={({ pressed }) => [
            styles.headerMenuButton,
            pressed ? styles.buttonPressed : undefined,
          ]}
        >
          <Text style={styles.headerMenuText}>☰</Text>
        </Pressable>
      </View>

      <PrimaryInsightCard
        formatShortSessionDate={formatShortSessionDate}
        isLoading={isSessionListLoading}
        onOpenSession={openEvidenceSheet}
        styles={styles}
        summary={primaryInsightSummary}
      />

      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionLabel}>최근 세션</Text>
          <Text style={styles.sectionHint}>RECENT</Text>
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
        <Text style={styles.kicker}>{selectedGroup?.name ?? 'Wakeboard'}</Text>
        <Text style={styles.title}>영상</Text>
        <Text style={styles.headerMeta}>
          {videoArchiveSessionSummaries.length}개 로드됨 · 날짜별/기술별 분류 예정
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
      isLoading={
        isLoadingVideoArchiveInitialPage ||
        (isSessionListLoading && videoArchiveSessionSummaries.length === 0)
      }
      isLoadingMore={isLoadingMoreVideoArchiveMoments}
      onEndReached={handleLoadMoreVideoArchiveMoments}
      onOpenSession={openEvidenceSheet}
      sessions={videoArchiveSessionSummaries}
      styles={styles}
    />
  );

  const renderFlowTab = () => (
    <FlowPlaceholderTab
      kicker={selectedGroup?.name ?? 'Wakeboard'}
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
    </SafeAreaView>
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

const styles = StyleSheet.create({
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
    shadowOpacity: 0.28,
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
    backgroundColor: 'transparent',
  },
  bottomTabItemSelectedDark: {
    backgroundColor: 'transparent',
  },
  bottomTabIconFrame: {
    alignItems: 'center',
    borderRadius: 14,
    height: 32,
    justifyContent: 'center',
    width: 42,
  },
  bottomTabIconFrameSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  tabIconHome: {
    borderColor: '#f8fafc',
    borderRadius: 5,
    borderWidth: 2,
    height: 18,
    opacity: 0.7,
    width: 20,
  },
  tabIconVideo: {
    borderColor: '#f8fafc',
    borderRadius: 5,
    borderWidth: 2,
    height: 16,
    opacity: 0.7,
    width: 24,
  },
  tabIconFlowFrame: {
    flexDirection: 'row',
    gap: 4,
  },
  tabIconFlowDot: {
    borderColor: '#f8fafc',
    borderRadius: 999,
    borderWidth: 2,
    height: 7,
    opacity: 0.7,
    width: 7,
  },
  tabIconProfileHead: {
    borderColor: '#f8fafc',
    borderRadius: 999,
    borderWidth: 2,
    height: 10,
    marginBottom: 3,
    opacity: 0.7,
    width: 10,
  },
  tabIconProfileBody: {
    borderColor: '#f8fafc',
    borderRadius: 999,
    borderWidth: 2,
    height: 9,
    opacity: 0.7,
    width: 18,
  },
  tabIconFilled: {
    backgroundColor: '#f8fafc',
    opacity: 1,
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
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  headerAddText: {
    color: '#050507',
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 24,
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
    height: 92,
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
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  videoArchiveMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    marginBottom: 5,
  },
  videoArchiveDescription: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 5,
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
    justifyContent: 'flex-start',
    marginBottom: 14,
  },
  uploadSheetTitleBlock: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 12,
  },
  uploadSheetTitle: {
    color: '#f9fafb',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 27,
  },
  uploadSheetDescription: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 4,
    textAlign: 'center',
  },
  uploadSheetSubmitButtonDisabled: {
    backgroundColor: '#2a303b',
  },
  uploadSheetSubmitTextDisabled: {
    color: '#64748b',
  },
  selectedVideoInfo: {
    marginBottom: 12,
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
  detailHeaderDeleteButton: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 10,
    height: 34,
    justifyContent: 'center',
    minWidth: 34,
    paddingHorizontal: 6,
  },
  detailHeaderDeleteButtonDisabled: {
    backgroundColor: 'rgba(252, 165, 165, 0.12)',
    opacity: 0.7,
  },
  detailHeaderDeleteText: {
    color: '#fca5a5',
    fontSize: 11,
    fontWeight: '900',
  },
  detailTrashIcon: {
    alignItems: 'center',
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  detailTrashLid: {
    backgroundColor: '#fca5a5',
    borderRadius: 999,
    height: 2,
    marginBottom: 2,
    width: 13,
  },
  detailTrashCan: {
    borderColor: '#fca5a5',
    borderRadius: 2,
    borderTopWidth: 0,
    borderWidth: 2,
    height: 12,
    width: 11,
  },
  detailVideoFrame: {
    aspectRatio: 1,
    backgroundColor: '#0f172a',
    marginBottom: 18,
    overflow: 'hidden',
    width: '100%',
  },
  detailInlineRetry: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  detailInlineRetryTitle: {
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 8,
  },
  detailInlineRetryText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
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
    marginHorizontal: 16,
    marginTop: 12,
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
  detailDeleteButton: {
    alignItems: 'center',
    backgroundColor: '#fff1f2',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 11,
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
        styles.statusPill,
        active ? styles.statusPillActive : styles.statusPillIdle,
      ]}
    >
      <Text
        style={[
          styles.statusPillText,
          active ? styles.statusPillTextActive : styles.statusPillTextIdle,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function SignalDot({ active, label }: { active: boolean; label: string }) {
  return (
    <View style={styles.signalItem}>
      <View style={[styles.signalDot, active ? styles.signalDotActive : undefined]} />
      <Text style={[styles.signalText, active ? styles.signalTextActive : undefined]}>
        {label}
      </Text>
    </View>
  );
}
