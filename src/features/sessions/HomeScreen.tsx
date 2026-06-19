import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import {
  getConfiguredAiEndpoints,
  hasConfiguredGeminiEvidenceEndpoint,
  queueSessionEvidenceExtractionWithGemini,
  RemoteRequestError,
  type SessionVideoAsset,
} from '../../services/ai';
import { mockActivityGroups } from '../groups/mockActivityGroups';
import { mockSessions } from './mockSessions';
import {
  createSessionVideoThumbnail,
  hasConfiguredVideoThumbnailEndpoint,
} from '../../services/video/createSessionVideoThumbnail';
import {
  hasConfiguredSupabaseMoments,
  insertMoment,
  listMoments,
  type RemoteMomentRecord,
  updateMomentStatus,
} from '../../services/moments';
import {
  getMomentStatus,
} from './momentStatus';
import {
  type AppTabId,
  BottomNavigation,
  FlowPlaceholderTab,
  JournalTimeline,
  PrimaryInsightCard,
  ProfilePlaceholderTab,
  RecentSessionsRail,
  UploadSheet,
  VideoArchiveList,
} from './sessionComponents';
import { MomentDetailModal } from './MomentDetailModal';
import {
  mergeMomentStatus,
  resolveLocalSessionIdForRemoteMoment,
} from './sessionMerge';
import {
  formatShortSessionDate,
  formatTimelineDay,
  formatTimelineMonth,
  formatVideoMeta,
  getCompletedMomentEvidence,
  getSessionCardPresentation,
  getVideoArchiveDescription,
  getVideoAssetFromSession,
} from './sessionFormatters';
import {
  loadPersistedSessionState,
  savePersistedSessionState,
  type PersistedSessionState,
} from './sessionStorage';

import type {
  AnalysisResult,
  GeminiEvidenceResult,
  MomentStatus,
  Session,
} from '../../types';

const ACTIVE_WAKEBOARD_GROUP_ID = 'group-wakeboard';
const ENABLE_INTERNAL_DEBUG_VIEWER =
  __DEV__ || process.env.EXPO_PUBLIC_ENABLE_DEBUG_VIEWER === 'true';

export function HomeScreen() {
  const colorScheme = useColorScheme();
  const prefersDarkMode = colorScheme === 'dark';
  const [selectedGroupId, setSelectedGroupId] = useState(
    ACTIVE_WAKEBOARD_GROUP_ID,
  );
  const [activeTab, setActiveTab] = useState<AppTabId>('home');
  const [sessions, setSessions] = useState<Session[]>(mockSessions);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const uploadTitleInputRef = useRef<TextInput>(null);
  const uploadSheetTranslateY = useRef(new Animated.Value(1)).current;
  const [selectedVideo, setSelectedVideo] = useState<SessionVideoAsset | null>(
    null,
  );
  const [videosBySessionId, setVideosBySessionId] = useState<
    Record<string, SessionVideoAsset>
  >({});
  const [analysisBySessionId, setAnalysisBySessionId] = useState<
    Record<string, AnalysisResult>
  >({});
  const [openAiBenchmarkBySessionId, setOpenAiBenchmarkBySessionId] = useState<
    Record<string, AnalysisResult>
  >({});
  const [geminiEvidenceBySessionId, setGeminiEvidenceBySessionId] = useState<
    Record<string, GeminiEvidenceResult>
  >({});
  const [userConfirmedTrickBySessionId, setUserConfirmedTrickBySessionId] =
    useState<Record<string, string>>({});
  const [thumbnailsBySessionId, setThumbnailsBySessionId] = useState<
    Record<string, string>
  >({});
  const [remoteMomentIdsBySessionId, setRemoteMomentIdsBySessionId] = useState<
    Record<string, string>
  >({});
  const [extractingEvidenceBySessionId, setExtractingEvidenceBySessionId] =
    useState<Record<string, boolean>>({});
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [playingVideoSessionId, setPlayingVideoSessionId] = useState<string | null>(
    null,
  );
  const [isStorageLoaded, setIsStorageLoaded] = useState(false);
  const [isRemoteMomentSyncLoaded, setIsRemoteMomentSyncLoaded] =
    useState(false);

  useEffect(() => {
    if (!isComposerOpen) {
      uploadSheetTranslateY.setValue(1);
      return;
    }

    uploadSheetTranslateY.setValue(1);
    Animated.timing(uploadSheetTranslateY, {
      duration: 260,
      toValue: 0,
      useNativeDriver: true,
    }).start();

    const focusTimer = setTimeout(() => {
      uploadTitleInputRef.current?.focus();
    }, 320);

    return () => clearTimeout(focusTimer);
  }, [isComposerOpen, uploadSheetTranslateY]);

  const syncRemoteMoments = useCallback(
    (remoteMoments: RemoteMomentRecord[]) => {
      const sessionIdByRemoteMomentId = new Map(
        remoteMoments.map((moment) => [
          moment.remoteMomentId,
          resolveLocalSessionIdForRemoteMoment(
            moment,
            remoteMomentIdsBySessionId,
            sessions,
          ),
        ]),
      );

      setSessions((current) => {
        const nextSessionsById = new Map(
          current.map((session) => [session.id, session]),
        );

        for (const remoteMoment of remoteMoments) {
          const sessionId =
            sessionIdByRemoteMomentId.get(remoteMoment.remoteMomentId) ??
            remoteMoment.session.id;
          const existingSession = nextSessionsById.get(sessionId);

          nextSessionsById.set(sessionId, {
            ...existingSession,
            ...remoteMoment.session,
            id: sessionId,
            momentStatus: mergeMomentStatus(
              existingSession?.momentStatus,
              remoteMoment.session.momentStatus,
            ),
            videoUri: existingSession?.videoUri ?? remoteMoment.session.videoUri,
            shareResultIds: existingSession?.shareResultIds ?? [],
          });
        }

        return Array.from(nextSessionsById.values()).sort((left, right) =>
          right.occurredAt.localeCompare(left.occurredAt),
        );
      });

      setRemoteMomentIdsBySessionId((current) => {
        const next = { ...current };

        for (const remoteMoment of remoteMoments) {
          const sessionId =
            sessionIdByRemoteMomentId.get(remoteMoment.remoteMomentId) ??
            remoteMoment.session.id;

          next[sessionId] = remoteMoment.remoteMomentId;
        }

        return next;
      });

      setVideosBySessionId((current) => {
        const next = { ...current };

        for (const remoteMoment of remoteMoments) {
          if (!remoteMoment.video) {
            continue;
          }

          const sessionId =
            sessionIdByRemoteMomentId.get(remoteMoment.remoteMomentId) ??
            remoteMoment.session.id;

          next[sessionId] = current[sessionId] ?? remoteMoment.video;
        }

        return next;
      });

      setGeminiEvidenceBySessionId((current) => {
        const next = { ...current };

        for (const remoteMoment of remoteMoments) {
          if (!remoteMoment.evidence) {
            continue;
          }

          const sessionId =
            sessionIdByRemoteMomentId.get(remoteMoment.remoteMomentId) ??
            remoteMoment.session.id;

          next[sessionId] = {
            ...remoteMoment.evidence,
            sessionId,
          };
        }

        return next;
      });

      setThumbnailsBySessionId((current) => {
        const next = { ...current };

        for (const remoteMoment of remoteMoments) {
          if (!remoteMoment.thumbnailUri) {
            continue;
          }

          const sessionId =
            sessionIdByRemoteMomentId.get(remoteMoment.remoteMomentId) ??
            remoteMoment.session.id;

          next[sessionId] = current[sessionId] ?? remoteMoment.thumbnailUri;
        }

        return next;
      });
    },
    [remoteMomentIdsBySessionId, sessions],
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
          setSessions(parsed.sessions);
        }

        setSelectedGroupId(ACTIVE_WAKEBOARD_GROUP_ID);

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
  }, []);

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
    userConfirmedTrickBySessionId,
    videosBySessionId,
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
        const remoteMoments = await listMoments();

        if (!isMounted || remoteMoments.length === 0) {
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

  useEffect(() => {
    if (!isStorageLoaded || !isRemoteMomentSyncLoaded || !hasConfiguredSupabaseMoments()) {
      return;
    }

    const hasActiveMoment = sessions.some(
      (session) =>
        session.momentStatus === 'queued' ||
        session.momentStatus === 'processing',
    );

    if (!hasActiveMoment) {
      return;
    }

    let isMounted = true;

    const intervalId = setInterval(() => {
      listMoments()
        .then((remoteMoments) => {
          if (isMounted) {
            syncRemoteMoments(remoteMoments);
          }
        })
        .catch((error) => {
          console.warn(
            'Supabase moment polling failed:',
            error instanceof Error ? error.message : 'Unknown error',
          );
        });
    }, 5000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [
    isRemoteMomentSyncLoaded,
    isStorageLoaded,
    sessions,
    syncRemoteMoments,
  ]);

  const selectedGroup =
    mockActivityGroups.find((group) => group.id === ACTIVE_WAKEBOARD_GROUP_ID) ??
    mockActivityGroups[0];

  const visibleSessions = useMemo(
    () =>
      sessions
        .filter((session) => session.activityGroupId === selectedGroup?.id)
        .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)),
    [sessions, selectedGroup?.id],
  );
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
      summary.momentStatus === 'queued' || summary.momentStatus === 'processing',
  );
  const primaryInsightSummary = latestCompletedSummary ?? latestActiveSummary;
  const latestAnalysisLabel = latestCompletedSummary
    ? formatShortSessionDate(latestCompletedSummary.session.occurredAt)
    : undefined;
  const recentSessionSummaries = homeSessionSummaries.slice(0, 8);
  const timelineSummaries = homeSessionSummaries;
  const canRequestGeminiEvidence = hasConfiguredGeminiEvidenceEndpoint();
  const configuredAiEndpoints = getConfiguredAiEndpoints();
  const canCreateVideoThumbnail = hasConfiguredVideoThumbnailEndpoint();
  const selectedSession = selectedSessionId
    ? sessions.find((session) => session.id === selectedSessionId)
    : undefined;
  const selectedSessionVideo = selectedSession
    ? videosBySessionId[selectedSession.id] ?? getVideoAssetFromSession(selectedSession)
    : null;
  const selectedMomentStatus = selectedSession
    ? getMomentStatus({
        evidence: geminiEvidenceBySessionId[selectedSession.id],
        isProcessing: Boolean(extractingEvidenceBySessionId[selectedSession.id]),
        sessionStatus: selectedSession.momentStatus,
      })
    : undefined;
  const canUploadSession = title.trim().length > 0 && Boolean(selectedVideo);

  const closeUploadSheet = () => {
    Keyboard.dismiss();
    setIsComposerOpen(false);
    setSelectedVideo(null);
    setTitle('');
    setNotes('');
  };

  const updateLocalMomentStatus = (
    sessionId: string,
    momentStatus: Session['momentStatus'],
  ) => {
    setSessions((current) =>
      current.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              momentStatus,
              updatedAt: new Date().toISOString(),
            }
          : session,
      ),
    );
  };

  const persistMomentToSupabase = async (
    session: Session,
    video?: SessionVideoAsset | null,
  ) => {
    if (!hasConfiguredSupabaseMoments()) {
      return {
        failed: false,
        remoteMomentId: undefined,
      };
    }

    try {
      const remoteMomentId = await insertMoment(session, video);

      if (!remoteMomentId) {
        updateLocalMomentStatus(session.id, 'failed');

        console.warn('Supabase moment persistence failed: missing moment id');

        return {
          failed: true,
          remoteMomentId: undefined,
        };
      }

      setRemoteMomentIdsBySessionId((current) => ({
        ...current,
        [session.id]: remoteMomentId,
      }));

      return {
        failed: false,
        remoteMomentId,
      };
    } catch (error) {
      updateLocalMomentStatus(session.id, 'failed');

      console.warn(
        'Supabase moment persistence failed:',
        error instanceof Error ? error.message : 'Unknown error',
      );

      return {
        failed: true,
        remoteMomentId: undefined,
      };
    }
  };

  const syncMomentStatus = async (
    sessionId: string,
    momentStatus: Session['momentStatus'],
    remoteMomentIdOverride?: string,
  ) => {
    if (!momentStatus) {
      return;
    }

    updateLocalMomentStatus(sessionId, momentStatus);

    const remoteMomentId =
      remoteMomentIdOverride ?? remoteMomentIdsBySessionId[sessionId];

    if (!remoteMomentId) {
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
  };

  const openEvidenceSheet = (session: Session) => {
    setSelectedSessionId(session.id);
    setPlayingVideoSessionId(null);

    const video = videosBySessionId[session.id] ?? getVideoAssetFromSession(session);

    if (video && !geminiEvidenceBySessionId[session.id]) {
      void handleExtractEvidence(session, { openSheet: false });
    }
  };

  const handleAddSession = async () => {
    if (!selectedGroup || !title.trim()) {
      return;
    }

    const now = new Date().toISOString();
    const nextSession: Session = {
      id: `session-${Date.now()}`,
      activityGroupId: selectedGroup.id,
      title: title.trim(),
      notes: notes.trim() || undefined,
      occurredAt: now,
      videoUri: selectedVideo?.uri,
      momentStatus: 'queued',
      shareResultIds: [],
      createdAt: now,
      updatedAt: now,
    };

    setSessions((current) => [nextSession, ...current]);

    if (selectedVideo) {
      setVideosBySessionId((current) => ({
        ...current,
        [nextSession.id]: selectedVideo,
      }));
      createThumbnailForSession(nextSession.id, selectedVideo);
      setSelectedSessionId(nextSession.id);
    }

    const { failed: failedToPersistMoment, remoteMomentId } =
      await persistMomentToSupabase(nextSession, selectedVideo);

    if (failedToPersistMoment) {
      Alert.alert(
        '영상 저장에 실패했습니다',
        '서버에 영상 기록을 만들지 못해 분석을 시작하지 않았습니다. 네트워크를 확인한 뒤 다시 시도해주세요.',
      );
      setTitle('');
      setNotes('');
      setSelectedVideo(null);
      setIsComposerOpen(false);
      Keyboard.dismiss();
      return;
    }

    if (selectedVideo) {
      void handleExtractEvidence(nextSession, {
        openSheet: false,
        videoOverride: selectedVideo,
        momentIdOverride: remoteMomentId,
      });
    }
    setTitle('');
    setNotes('');
    setSelectedVideo(null);
    setIsComposerOpen(false);
    Keyboard.dismiss();
  };

  const createThumbnailForSession = async (
    sessionId: string,
    video: SessionVideoAsset,
  ) => {
    if (!canCreateVideoThumbnail) {
      return;
    }

    try {
      const imageUri = await createSessionVideoThumbnail(video);

      setThumbnailsBySessionId((current) => ({
        ...current,
        [sessionId]: imageUri,
      }));
    } catch {
      // Thumbnail generation is best-effort. The feed keeps its visual fallback.
    }
  };

  const handlePickVideo = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        '사진 접근 권한이 필요합니다',
        '라이딩 영상을 선택하려면 사진 보관함 접근을 허용해주세요.',
      );
      return false;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsEditing: false,
      quality: 1,
    });

    if (result.canceled) {
      return false;
    }

    const asset = result.assets[0];

    if (!asset || asset.type !== 'video') {
      Alert.alert('영상이 필요합니다', '분석할 영상을 선택해주세요.');
      return false;
    }

    setSelectedVideo({
      uri: asset.uri,
      fileName: asset.fileName,
      fileSize: asset.fileSize,
      mimeType: asset.mimeType,
      duration: asset.duration,
    });

    return true;
  };

  const handleOpenUploadSheet = async () => {
    const didPickVideo = await handlePickVideo();

    if (didPickVideo) {
      setIsComposerOpen(true);
    }
  };

  const handleExtractEvidence = async (
    session: Session,
    options?: {
      openSheet?: boolean;
      videoOverride?: SessionVideoAsset;
      momentIdOverride?: string;
    },
  ) => {
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
      setSelectedSessionId(session.id);
    }

    const group =
      mockActivityGroups.find((item) => item.id === session.activityGroupId) ??
      selectedGroup;

    try {
      setExtractingEvidenceBySessionId((current) => ({
        ...current,
        [session.id]: true,
      }));
      updateLocalMomentStatus(session.id, 'processing');

      const queuedJob = await queueSessionEvidenceExtractionWithGemini({
        session,
        activityGroupName: 'Wakeboard',
        video,
        momentId:
          options?.momentIdOverride ?? remoteMomentIdsBySessionId[session.id],
        userConfirmedTrick: userConfirmedTrickBySessionId[session.id],
      });

      const nextMomentStatus =
        queuedJob.momentStatus === 'queued'
          ? 'processing'
          : queuedJob.momentStatus;

      await syncMomentStatus(
        session.id,
        nextMomentStatus,
        options?.momentIdOverride,
      );
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
  };

  const handleDeleteSession = (session: Session) => {
    Alert.alert('영상을 삭제할까요?', '이 영상과 연결된 리뷰 결과가 함께 삭제됩니다.', [
      {
        text: '취소',
        style: 'cancel',
      },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          setSessions((current) => current.filter((item) => item.id !== session.id));
          setVideosBySessionId((current) => removeRecordKey(current, session.id));
          setAnalysisBySessionId((current) => removeRecordKey(current, session.id));
          setGeminiEvidenceBySessionId((current) =>
            removeRecordKey(current, session.id),
          );
          setUserConfirmedTrickBySessionId((current) =>
            removeRecordKey(current, session.id),
          );
          setOpenAiBenchmarkBySessionId((current) =>
            removeRecordKey(current, session.id),
          );
          setThumbnailsBySessionId((current) => removeRecordKey(current, session.id));
          setRemoteMomentIdsBySessionId((current) =>
            removeRecordKey(current, session.id),
          );

          if (selectedSessionId === session.id) {
            setSelectedSessionId(null);
            setPlayingVideoSessionId(null);
          }
        },
      },
    ]);
  };

  const renderVideoTab = () => (
    <>
      <View style={styles.tabPageHeader}>
        <Text style={styles.kicker}>{selectedGroup?.name ?? 'Wakeboard'}</Text>
        <Text style={styles.title}>영상</Text>
        <Text style={styles.headerMeta}>
          {visibleSessions.length}개 세션 · 날짜별/기술별 분류 예정
        </Text>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionLabel}>세션 아카이브</Text>
          <Text style={styles.sectionHint}>VIDEO</Text>
        </View>
        <VideoArchiveList
          formatShortSessionDate={formatShortSessionDate}
          getVideoArchiveDescription={getVideoArchiveDescription}
          onOpenSession={openEvidenceSheet}
          sessions={timelineSummaries}
          styles={styles}
        />
      </View>
    </>
  );

  const renderFlowTab = () => (
    <FlowPlaceholderTab
      kicker={selectedGroup?.name ?? 'Wakeboard'}
      styles={styles}
    />
  );

  const renderProfileTab = () => (
    <ProfilePlaceholderTab styles={styles} />
  );

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
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {activeTab === 'home' ? (
            <>
          <View style={styles.header}>
            <View>
              <Text style={styles.kicker}>Riding Journal</Text>
              <Text style={styles.title}>오늘의 라이딩 저널</Text>
              <Text style={styles.headerMeta}>
                {visibleSessions.length}개 세션
                {latestAnalysisLabel ? ` · 최근 분석 ${latestAnalysisLabel}` : ''}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={handleOpenUploadSheet}
              style={({ pressed }) => [
                styles.headerAddButton,
                pressed ? styles.buttonPressed : undefined,
              ]}
            >
              <Text style={styles.headerAddText}>↑</Text>
            </Pressable>
          </View>

          <PrimaryInsightCard
            formatShortSessionDate={formatShortSessionDate}
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
              onOpenSession={openEvidenceSheet}
              sessions={recentSessionSummaries}
              styles={styles}
            />
          </View>

          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionLabel}>저널</Text>
              <Text style={styles.sectionHint}>HISTORY</Text>
            </View>
            <JournalTimeline
              formatTimelineDay={formatTimelineDay}
              formatTimelineMonth={formatTimelineMonth}
              onOpenSession={openEvidenceSheet}
              sessions={timelineSummaries}
              styles={styles}
            />
          </View>
            </>
          ) : activeTab === 'video' ? (
            renderVideoTab()
          ) : activeTab === 'flow' ? (
            renderFlowTab()
          ) : (
            renderProfileTab()
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <BottomNavigation
        activeTab={activeTab}
        isDarkMode={prefersDarkMode}
        onChangeTab={setActiveTab}
        styles={styles}
      />
      <MomentDetailModal
        canRequestGeminiEvidence={canRequestGeminiEvidence}
        debugEndpoint={
          __DEV__ ? configuredAiEndpoints.geminiEvidenceEndpoint : undefined
        }
        evidence={selectedSession ? geminiEvidenceBySessionId[selectedSession.id] : undefined}
        isLoading={
          selectedSession ? Boolean(extractingEvidenceBySessionId[selectedSession.id]) : false
        }
        momentStatus={selectedMomentStatus}
        onClose={() => {
          setSelectedSessionId(null);
          setPlayingVideoSessionId(null);
        }}
        onDelete={
          selectedSession ? () => handleDeleteSession(selectedSession) : undefined
        }
        onRetry={
          selectedSession
            ? () => handleExtractEvidence(selectedSession, { openSheet: true })
            : undefined
        }
        session={selectedSession}
        styles={styles}
        video={selectedSessionVideo}
      />
      <UploadSheet
        canUploadSession={canUploadSession}
        formatVideoMeta={formatVideoMeta}
        isOpen={isComposerOpen}
        notes={notes}
        onClose={closeUploadSheet}
        onPickVideo={handlePickVideo}
        onSubmit={handleAddSession}
        selectedVideo={selectedVideo}
        setNotes={setNotes}
        setTitle={setTitle}
        styles={styles}
        title={title}
        titleInputRef={uploadTitleInputRef}
        translateY={uploadSheetTranslateY}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050507',
  },
  containerDark: {
    backgroundColor: '#050507',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 124,
    paddingHorizontal: 0,
    paddingTop: 6,
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
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  headerAddText: {
    color: '#050507',
    fontSize: 22,
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
    alignSelf: 'stretch',
    aspectRatio: 1.62,
    backgroundColor: '#0b0d12',
    marginBottom: 12,
    overflow: 'hidden',
  },
  recentThumbImage: {
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
  timeline: {
    marginHorizontal: 16,
  },
  timelineEmpty: {
    backgroundColor: '#14161c',
    borderColor: 'rgba(255, 255, 255, 0.09)',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  timelineRow: {
    alignItems: 'flex-start',
    backgroundColor: '#14161c',
    borderColor: 'rgba(255, 255, 255, 0.09)',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
    padding: 12,
  },
  timelineDateBlock: {
    alignItems: 'center',
    backgroundColor: '#20232d',
    borderRadius: 10,
    minWidth: 48,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  timelineMonth: {
    color: '#9ca3af',
    fontSize: 10,
    fontWeight: '900',
  },
  timelineDay: {
    color: '#f9fafb',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 22,
  },
  timelineBody: {
    flex: 1,
  },
  timelineTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  timelineTitle: {
    color: '#f9fafb',
    flex: 1,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 19,
  },
  timelineSummary: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 5,
  },
  videoArchiveList: {
    gap: 10,
    marginHorizontal: 16,
  },
  videoArchiveRow: {
    alignItems: 'stretch',
    backgroundColor: '#14161c',
    borderColor: 'rgba(255, 255, 255, 0.09)',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    height: 92,
    overflow: 'hidden',
  },
  videoArchiveThumb: {
    alignSelf: 'stretch',
    backgroundColor: '#0b0d12',
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
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  uploadSheetKeyboardView: {
    flex: 1,
  },
  uploadSheet: {
    alignSelf: 'stretch',
    backgroundColor: '#101218',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    height: '68%',
    minHeight: '66%',
    paddingBottom: 28,
    paddingHorizontal: 0,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOffset: { height: -10, width: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    width: '100%',
  },
  uploadSheetContent: {
    flex: 1,
    width: '100%',
  },
  uploadSheetPaddedSection: {
    paddingHorizontal: 18,
  },
  uploadSheetHandle: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    borderRadius: 999,
    height: 4,
    marginBottom: 16,
    width: 42,
  },
  uploadSheetHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  uploadSheetTitleBlock: {
    flex: 1,
    paddingRight: 14,
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
  },
  uploadSheetActions: {
    flexDirection: 'row',
    gap: 8,
  },
  uploadSheetActionButton: {
    alignItems: 'center',
    borderRadius: 999,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  uploadSheetReselectButton: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderColor: 'rgba(125, 211, 252, 0.34)',
    borderWidth: 1,
  },
  uploadSheetSubmitButton: {
    backgroundColor: '#f9fafb',
  },
  uploadSheetSubmitButtonDisabled: {
    backgroundColor: '#2a303b',
  },
  uploadSheetActionText: {
    color: '#050507',
    fontSize: 21,
    fontWeight: '900',
    lineHeight: 24,
  },
  uploadSheetReselectText: {
    color: '#7dd3fc',
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
    borderRadius: 0,
    marginBottom: 12,
    overflow: 'hidden',
    width: '100%',
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
  input: {
    backgroundColor: '#1b1e27',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 14,
    borderWidth: 1,
    color: '#f9fafb',
    fontSize: 15,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  textArea: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  uploadNotesInput: {
    flex: 1,
    marginBottom: 0,
    minHeight: 120,
  },
  uploadFormFields: {
    flex: 1,
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
    backgroundColor: 'rgba(17, 19, 27, 0.76)',
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    left: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    position: 'absolute',
    right: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.34,
    shadowRadius: 28,
    top: Platform.OS === 'ios' ? 58 : 16,
    zIndex: 20,
  },
  detailCloseButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 999,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  detailCloseText: {
    color: '#f8fafc',
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 26,
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
  detailMoreButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 999,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  detailMoreText: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 17,
  },
  detailVideoFrame: {
    aspectRatio: 1,
    backgroundColor: '#0f172a',
    marginBottom: 18,
    overflow: 'hidden',
    width: '100%',
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

function removeRecordKey<T>(record: Record<string, T>, key: string) {
  const { [key]: _removed, ...remaining } = record;

  return remaining;
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
