import { useCallback, useEffect, useMemo, useState } from 'react';
import { useEventListener } from 'expo';
import {
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';

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
import { DebugResultViewer } from './DebugResultViewer';

import type {
  AnalysisResult,
  GeminiEvidenceResult,
  MomentStatus,
  Session,
} from '../../types';

const SESSION_STORAGE_KEY = 'action-sports-journal:sessions:v1';
const ACTIVE_WAKEBOARD_GROUP_ID = 'group-wakeboard';
const ENABLE_INTERNAL_DEBUG_VIEWER =
  __DEV__ || process.env.EXPO_PUBLIC_ENABLE_DEBUG_VIEWER === 'true';

type PersistedSessionState = {
  selectedGroupId?: string;
  sessions?: Session[];
  videosBySessionId?: Record<string, SessionVideoAsset>;
  analysisBySessionId?: Record<string, AnalysisResult>;
  openAiBenchmarkBySessionId?: Record<string, AnalysisResult>;
  geminiEvidenceBySessionId?: Record<string, GeminiEvidenceResult>;
  userConfirmedTrickBySessionId?: Record<string, string>;
  thumbnailsBySessionId?: Record<string, string>;
  remoteMomentIdsBySessionId?: Record<string, string>;
};

export function HomeScreen() {
  const [selectedGroupId, setSelectedGroupId] = useState(
    ACTIVE_WAKEBOARD_GROUP_ID,
  );
  const [sessions, setSessions] = useState<Session[]>(mockSessions);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
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

  const syncRemoteMoments = useCallback(
    (remoteMoments: RemoteMomentRecord[]) => {
      const sessionIdByRemoteMomentId = new Map(
        remoteMoments.map((moment) => [
          moment.remoteMomentId,
          resolveLocalSessionIdForRemoteMoment(
            moment,
            remoteMomentIdsBySessionId,
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
    [remoteMomentIdsBySessionId],
  );

  useEffect(() => {
    let isMounted = true;

    async function loadPersistedSessions() {
      try {
        const rawValue = await AsyncStorage.getItem(SESSION_STORAGE_KEY);

        if (!rawValue || !isMounted) {
          return;
        }

        const parsed = JSON.parse(rawValue) as PersistedSessionState;

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

    AsyncStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify(persistedState),
    ).catch(() => {
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
  const canSaveSession = title.trim().length > 0;

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
      return undefined;
    }

    try {
      const remoteMomentId = await insertMoment(session, video);

      if (!remoteMomentId) {
        return undefined;
      }

      setRemoteMomentIdsBySessionId((current) => ({
        ...current,
        [session.id]: remoteMomentId,
      }));

      return remoteMomentId;
    } catch (error) {
      updateLocalMomentStatus(session.id, 'failed');

      console.warn(
        'Supabase moment persistence failed:',
        error instanceof Error ? error.message : 'Unknown error',
      );

      return undefined;
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
      await updateMomentStatus(remoteMomentId, momentStatus);
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
    const remoteMomentId = await persistMomentToSupabase(
      nextSession,
      selectedVideo,
    );

    if (selectedVideo) {
      setVideosBySessionId((current) => ({
        ...current,
        [nextSession.id]: selectedVideo,
      }));
      createThumbnailForSession(nextSession.id, selectedVideo);
      setSelectedSessionId(nextSession.id);
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
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsEditing: false,
      quality: 1,
    });

    if (result.canceled) {
      return;
    }

    const asset = result.assets[0];

    if (!asset || asset.type !== 'video') {
      Alert.alert('영상이 필요합니다', '분석할 영상을 선택해주세요.');
      return;
    }

    setSelectedVideo({
      uri: asset.uri,
      fileName: asset.fileName,
      fileSize: asset.fileSize,
      mimeType: asset.mimeType,
      duration: asset.duration,
    });
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
      const queuedJob = await queueSessionEvidenceExtractionWithGemini({
        session,
        activityGroupName: 'Wakeboard',
        video,
        momentId:
          options?.momentIdOverride ?? remoteMomentIdsBySessionId[session.id],
        userConfirmedTrick: userConfirmedTrickBySessionId[session.id],
      });

      await syncMomentStatus(
        session.id,
        queuedJob.momentStatus,
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
            'Moment는 분석 대기 상태로 유지됩니다. 잠시 후 다시 시도해주세요.',
          );
        }

        console.warn('Evidence queue request delayed:', message);
        return;
      }

      await syncMomentStatus(session.id, 'failed', options?.momentIdOverride);
    } finally {
      setExtractingEvidenceBySessionId((current) => ({
        ...current,
        [session.id]: false,
      }));
    }
  };

  const handleDeleteSession = (session: Session) => {
    Alert.alert('모먼트를 삭제할까요?', '이 모먼트와 연결된 리뷰 결과가 함께 삭제됩니다.', [
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

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.kicker}>Wakeboard Moments</Text>
              <Text style={styles.title}>내 라이딩 갤러리</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setIsComposerOpen((current) => !current)}
              style={({ pressed }) => [
                styles.headerAddButton,
                pressed ? styles.buttonPressed : undefined,
              ]}
            >
              <Text style={styles.headerAddText}>
                {isComposerOpen ? '닫기' : '+'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.section}>
            {isComposerOpen ? (
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionLabel}>새 모먼트</Text>
                  <Text style={styles.contextText}>
                    Wakeboard 모먼트에 추가
                  </Text>
                </View>
              </View>
            ) : null}

            {isComposerOpen ? (
              <View style={styles.composer}>
                <TextInput
                  placeholder="무슨 모먼트였나요?"
                  placeholderTextColor="#94a3b8"
                  style={styles.input}
                  value={title}
                  onChangeText={setTitle}
                />
                <TextInput
                  multiline
                  placeholder="짧은 느낌 남기기"
                  placeholderTextColor="#94a3b8"
                  style={[styles.input, styles.textArea]}
                  value={notes}
                  onChangeText={setNotes}
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={handlePickVideo}
                  style={({ pressed }) => [
                    styles.videoButton,
                    pressed ? styles.buttonPressed : undefined,
                  ]}
                >
                  <Text style={styles.videoButtonText}>
                    {selectedVideo ? '영상 바꾸기' : '영상 선택'}
                  </Text>
                </Pressable>
                {selectedVideo ? (
                  <Text style={styles.videoMeta}>
                    {selectedVideo.fileName ?? '선택한 영상'} ·{' '}
                    {formatVideoMeta(selectedVideo)}
                  </Text>
                ) : (
                  <Text style={styles.helperText}>
                    영상을 선택하면 저장 후 Gemini 근거 추출이 자동으로 시작됩니다.
                  </Text>
                )}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => Keyboard.dismiss()}
                  style={({ pressed }) => [
                    styles.tertiaryButton,
                    pressed ? styles.buttonPressed : undefined,
                  ]}
                >
                  <Text style={styles.tertiaryButtonText}>키보드 내리기</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={!canSaveSession}
                  onPress={handleAddSession}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    !canSaveSession ? styles.primaryButtonDisabled : undefined,
                    pressed ? styles.buttonPressed : undefined,
                  ]}
                >
                  <Text
                    style={[
                      styles.primaryButtonText,
                      !canSaveSession
                        ? styles.primaryButtonTextDisabled
                        : undefined,
                    ]}
                  >
                    갤러리에 추가
                  </Text>
                </Pressable>
                <Text style={styles.helperText}>어떤 시도였는지 짧게 남겨주세요.</Text>
              </View>
            ) : null}

            {visibleSessions.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>아직 모먼트가 없습니다</Text>
                  <Text style={styles.emptyText}>
                    첫 라이딩 클립을 추가해 나만의 갤러리를 시작해보세요.
                  </Text>
                </View>
            ) : (
              <View style={styles.galleryGrid}>
                {visibleSessions.map((item) => {
                  const isWorking = extractingEvidenceBySessionId[item.id];
                  const momentStatus = getMomentStatus({
                    evidence: geminiEvidenceBySessionId[item.id],
                    isProcessing: Boolean(isWorking),
                    sessionStatus: item.momentStatus,
                  });
                  const completedEvidence = getCompletedMomentEvidence({
                    evidence: geminiEvidenceBySessionId[item.id],
                    isProcessing: Boolean(isWorking),
                    sessionStatus: item.momentStatus,
                  });
                  const card = getSessionCardPresentation({
                    session: item,
                    evidence: completedEvidence,
                    thumbnailUri: thumbnailsBySessionId[item.id],
                  });

                  return (
                    <Pressable
                      accessibilityRole="button"
                      key={item.id}
                      onPress={() => openEvidenceSheet(item)}
                      style={({ pressed }) => [
                        styles.galleryCard,
                        pressed ? styles.sessionRowPressed : undefined,
                      ]}
                    >
                      <View style={styles.galleryFrame}>
                        <View style={styles.galleryThumb}>
                          {card.thumbnailUri ? (
                            <Image
                              source={{ uri: card.thumbnailUri }}
                              style={styles.galleryImage}
                            />
                          ) : (
                            <View style={styles.galleryFallback}>
                              <Text style={styles.galleryFallbackPlay}>▶</Text>
                              <Text style={styles.galleryFallbackText}>
                                {item.videoUri ? 'CLIP' : 'NO CLIP'}
                              </Text>
                            </View>
                          )}
                          <View style={styles.galleryTopBar}>
                            <Text style={styles.galleryDate} numberOfLines={1}>
                              {formatShortSessionDate(item.occurredAt)}
                            </Text>
                            <Text
                              style={[
                                styles.galleryBadge,
                                getMomentStatusStyle(momentStatus),
                              ]}
                              numberOfLines={1}
                            >
                              {momentStatus
                                ? getMomentStatusLabel(momentStatus)
                                : item.videoUri
                                  ? '대기'
                                  : '영상 필요'}
                            </Text>
                          </View>
                        </View>
                      </View>
                      <Text style={styles.galleryTitle} numberOfLines={1}>
                        {card.momentTitle}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
        video={selectedSessionVideo}
      />
    </SafeAreaView>
  );
}

function resolveLocalSessionIdForRemoteMoment(
  remoteMoment: RemoteMomentRecord,
  remoteMomentIdsBySessionId: Record<string, string>,
) {
  const existingLocalSessionId = Object.entries(remoteMomentIdsBySessionId).find(
    ([, remoteMomentId]) => remoteMomentId === remoteMoment.remoteMomentId,
  )?.[0];

  return existingLocalSessionId ?? remoteMoment.session.id;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0d12',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 34,
    paddingHorizontal: 0,
    paddingTop: 6,
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
    color: '#03c75a',
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  title: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 27,
  },
  headerAddButton: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 999,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  headerAddText: {
    color: '#111318',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 24,
  },
  section: {
    marginBottom: 14,
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
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '900',
  },
  sectionHint: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
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
  composer: {
    backgroundColor: '#fff',
    borderColor: '#dbe4ee',
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
    marginHorizontal: 16,
    padding: 12,
  },
  input: {
    backgroundColor: '#f1f5f9',
    borderColor: '#dbe4ee',
    borderRadius: 14,
    borderWidth: 1,
    color: '#0f172a',
    fontSize: 15,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  textArea: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  videoButton: {
    alignItems: 'center',
    backgroundColor: '#ecfeff',
    borderColor: '#67e8f9',
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
    paddingVertical: 12,
  },
  videoButtonText: {
    color: '#155e75',
    fontSize: 14,
    fontWeight: '700',
  },
  videoMeta: {
    color: '#155e75',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 14,
    paddingVertical: 13,
  },
  primaryButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  primaryButtonTextDisabled: {
    color: '#e2e8f0',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#03c75a',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  secondaryButtonText: {
    color: '#07110a',
    fontSize: 12,
    fontWeight: '900',
  },
  tertiaryButton: {
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 14,
    marginBottom: 10,
    paddingVertical: 11,
  },
  tertiaryButtonText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  emptyState: {
    backgroundColor: '#fff',
    borderColor: '#dbe4ee',
    borderRadius: 18,
    borderWidth: 1,
    marginHorizontal: 16,
    padding: 16,
  },
  emptyTitle: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptyText: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 18,
  },
  helperText: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 8,
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
  momentBadge: {
    backgroundColor: '#03c75a',
    color: '#07110a',
    fontSize: 10,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  momentStatusQueued: {
    backgroundColor: '#93c5fd',
  },
  momentStatusProcessing: {
    backgroundColor: '#facc15',
  },
  momentStatusCompleted: {
    backgroundColor: '#03c75a',
  },
  momentStatusFailed: {
    backgroundColor: '#fb7185',
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
    backgroundColor: '#0b0d12',
    flex: 1,
  },
  detailModalBody: {
    paddingBottom: 34,
  },
  detailModalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  detailCloseButton: {
    backgroundColor: '#f8fafc',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  detailCloseText: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '900',
  },
  detailHeaderText: {
    flex: 1,
  },
  detailKicker: {
    color: '#03c75a',
    fontSize: 10,
    fontWeight: '900',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  detailHeaderTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '900',
  },
  detailVideoFrame: {
    aspectRatio: 1,
    backgroundColor: '#0f172a',
    marginBottom: 12,
    overflow: 'hidden',
    width: '100%',
  },
  detailSummaryCard: {
    backgroundColor: '#111318',
    borderColor: 'rgba(248, 250, 252, 0.08)',
    borderRadius: 16,
    borderWidth: 1,
    marginHorizontal: 16,
    padding: 14,
  },
  detailSummaryTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailStateCard: {
    backgroundColor: '#111318',
    borderColor: 'rgba(248, 250, 252, 0.1)',
    borderRadius: 16,
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
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
  detailMomentDate: {
    color: '#03c75a',
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 5,
    textTransform: 'uppercase',
  },
  detailMomentTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 23,
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
    backgroundColor: '#f8fafc',
    borderColor: '#cbd5e1',
    borderRadius: 16,
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
  },
  evidenceTitle: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  evidenceModelBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#ecfdf5',
    borderColor: '#99f6e4',
    borderRadius: 999,
    borderWidth: 1,
    color: '#0f766e',
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  evidenceModelBadgeDegraded: {
    backgroundColor: '#fff1f2',
    borderColor: '#fecdd3',
    color: '#be123c',
  },
  evidenceFactRow: {
    borderTopColor: '#e2e8f0',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
  },
  evidenceFactLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 2,
  },
  evidenceFactValue: {
    color: '#0f766e',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 3,
  },
  evidenceSection: {
    borderTopColor: '#e2e8f0',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  evidenceSectionTitle: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 4,
  },
  evidenceText: {
    color: '#475569',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 4,
  },
  evidenceWarningText: {
    color: '#be123c',
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
    backgroundColor: '#fff',
    borderColor: '#dbe4ee',
    borderRadius: 12,
    borderWidth: 1,
    flexGrow: 1,
    flexBasis: '47%',
    padding: 9,
  },
  evidenceSummaryLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '900',
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  evidenceSummaryValue: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 16,
  },
  candidateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  candidateChip: {
    backgroundColor: '#fff',
    borderColor: '#99f6e4',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  candidateChipSelected: {
    backgroundColor: '#0f766e',
    borderColor: '#0f766e',
  },
  candidateChipText: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '900',
  },
  candidateChipTextSelected: {
    color: '#fff',
  },
  confirmTrickInput: {
    backgroundColor: '#fff',
    borderColor: '#cbd5e1',
    borderRadius: 10,
    borderWidth: 1,
    color: '#0f172a',
    fontSize: 13,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  confirmTrickButton: {
    alignItems: 'center',
    backgroundColor: '#0f766e',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  confirmTrickButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
  },
  confirmedTrickText: {
    color: '#b7f5ce',
    fontSize: 12,
    fontWeight: '900',
    marginTop: 8,
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

function getVideoAssetFromSession(session: Session): SessionVideoAsset | null {
  if (!session.videoUri) {
    return null;
  }

  return {
    uri: session.videoUri,
    fileName: `${session.id}.mov`,
    mimeType: 'video/quicktime',
  };
}

function formatVideoMeta(video: SessionVideoAsset) {
  const parts = [
    video.duration ? `${Math.round(video.duration / 1000)}s` : null,
    video.fileSize ? `${Math.round(video.fileSize / 1024 / 1024)} MB` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' · ') : '준비됨';
}

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

function getMomentStatus({
  evidence,
  isProcessing,
  sessionStatus,
}: {
  evidence?: GeminiEvidenceResult;
  isProcessing: boolean;
  sessionStatus?: MomentStatus;
}): MomentStatus | undefined {
  if (sessionStatus === 'completed' || evidence?.status === 'completed') {
    return 'completed';
  }

  if (sessionStatus === 'failed' || evidence?.status === 'failed') {
    return 'failed';
  }

  if (isProcessing || sessionStatus === 'processing') {
    return 'processing';
  }

  if (sessionStatus === 'queued') {
    return 'queued';
  }

  return evidence ? undefined : sessionStatus;
}

function getMomentStatusLabel(status: MomentStatus) {
  if (status === 'queued') {
    return '분석 대기';
  }

  if (status === 'processing') {
    return '분석 중';
  }

  if (status === 'completed') {
    return '분석 완료';
  }

  return '분석 실패';
}

function getMomentStatusStyle(status?: MomentStatus) {
  if (status === 'queued') {
    return styles.momentStatusQueued;
  }

  if (status === 'processing') {
    return styles.momentStatusProcessing;
  }

  if (status === 'completed') {
    return styles.momentStatusCompleted;
  }

  if (status === 'failed') {
    return styles.momentStatusFailed;
  }

  return undefined;
}

function getMomentStatusMessage(status: MomentStatus) {
  if (status === 'queued') {
    return {
      title: '분석 대기 중',
      body:
        'Moment가 저장됐고 evidence extraction을 시작할 준비를 하고 있습니다. 서버가 바쁘거나 요청이 제한되면 이 상태를 유지합니다.',
    };
  }

  if (status === 'processing') {
    return {
      title: '분석 중',
      body: '영상에서 어프로치, 인버전, 기술 계열 근거를 확인하고 있습니다.',
    };
  }

  if (status === 'failed') {
    return {
      title: '분석 실패',
      body: 'Evidence extraction이 완료되지 않았습니다. 다시 시도할 수 있습니다.',
    };
  }

  return {
    title: '분석 완료',
    body: 'Evidence result가 준비됐습니다.',
  };
}

function getCompletedMomentEvidence({
  evidence,
  isProcessing,
  sessionStatus,
}: {
  evidence?: GeminiEvidenceResult;
  isProcessing: boolean;
  sessionStatus?: MomentStatus;
}) {
  const momentStatus = getMomentStatus({
    evidence,
    isProcessing,
    sessionStatus,
  });

  return momentStatus === 'completed' ? evidence : undefined;
}

function getSessionCardPresentation({
  session,
  evidence,
  thumbnailUri,
}: {
  session: Session;
  evidence?: GeminiEvidenceResult;
  thumbnailUri?: string;
}) {
  const detectedAction =
    evidence?.primaryCandidate.name === '확인 필요'
      ? undefined
      : evidence?.primaryCandidate.name;
  const hook =
    evidence?.evidence ??
    evidence?.approachObservedFacts?.wakeCrossingPath.evidence ??
    evidence?.family.evidence;
  const hasEvidence = evidence?.status === 'completed';
  const momentTitle =
    detectedAction ??
    inferMomentTitle(session.title) ??
    (session.videoUri ? '라이딩 모먼트' : '클립 대기 중');
  const reason = hasEvidence
    ? hook ?? '동작 근거가 준비됐습니다.'
    : session.videoUri
      ? 'Gemini 근거 추출을 시작합니다.'
      : '클립을 추가하면 모먼트가 살아납니다.';
  const openReason = hasEvidence
    ? '동작 근거 준비'
    : session.videoUri
      ? '근거 추출 대기'
      : '클립 추가 필요';

  return {
    thumbnailUri,
    detectedAction: detectedAction ? compactCardText(detectedAction, 42) : undefined,
    hook: hook ? compactCardText(hook, 92) : undefined,
    momentTitle: compactCardText(momentTitle, 34),
    reason: compactCardText(reason, 58),
    openReason,
  };
}

function inferMomentTitle(title: string) {
  const normalized = title.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return undefined;
  }

  if (
    normalized.toLowerCase().includes('back roll') ||
    normalized.includes('백롤')
  ) {
    return 'HS 백롤 시도';
  }

  if (
    normalized.toLowerCase().includes('landing') ||
    normalized.includes('착지')
  ) {
    return '착지 진행 상황';
  }

  return normalized;
}

function compactCardText(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, ' ').trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
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

function LocalSessionVideoPlayer({ videoUri }: { videoUri: string }) {
  const [hasPlaybackError, setHasPlaybackError] = useState(false);
  const player = useVideoPlayer(videoUri, (videoPlayer) => {
    videoPlayer.play();
  });

  useEventListener(player, 'statusChange', ({ status, error }) => {
    if (status === 'error' || error) {
      setHasPlaybackError(true);
    }
  });

  if (hasPlaybackError) {
    return (
      <View style={styles.videoMissingFallback}>
        <Text style={styles.videoMissingTitle}>영상 파일을 다시 선택해 주세요.</Text>
        <Text style={styles.videoMissingText}>
          로컬 영상 위치가 바뀌었거나 접근 권한이 만료되었습니다.
        </Text>
      </View>
    );
  }

  return (
    <VideoView
      allowsFullscreen
      contentFit="cover"
      nativeControls
      player={player}
      style={styles.detailVideo}
    />
  );
}

function MomentDetailModal({
  canRequestGeminiEvidence,
  debugEndpoint,
  evidence,
  isLoading,
  momentStatus,
  onClose,
  onDelete,
  onRetry,
  session,
  video,
}: {
  canRequestGeminiEvidence: boolean;
  debugEndpoint?: string;
  evidence?: GeminiEvidenceResult;
  isLoading: boolean;
  momentStatus?: MomentStatus;
  onClose: () => void;
  onDelete?: () => void;
  onRetry?: () => void;
  session?: Session;
  video?: SessionVideoAsset | null;
}) {
  if (!session) {
    return null;
  }

  const canRetry = Boolean(video && canRequestGeminiEvidence && !isLoading);
  const visibleEvidence =
    evidence && (!momentStatus || momentStatus === 'completed')
      ? evidence
      : undefined;
  const shouldShowStatusMessage = Boolean(
    momentStatus && momentStatus !== 'completed',
  );
  const statusMessage = momentStatus
    ? getMomentStatusMessage(momentStatus)
    : undefined;

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      visible={Boolean(session)}
    >
      <SafeAreaView style={styles.detailModalContainer}>
        <ScrollView
          contentContainerStyle={styles.detailModalBody}
          showsVerticalScrollIndicator
        >
          <View style={styles.detailModalHeader}>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [
                styles.detailCloseButton,
                pressed ? styles.buttonPressed : undefined,
              ]}
            >
              <Text style={styles.detailCloseText}>닫기</Text>
            </Pressable>
            <View style={styles.detailHeaderText}>
              <Text style={styles.detailKicker}>Moment Detail</Text>
              <Text style={styles.detailHeaderTitle} numberOfLines={1}>
                {session.title}
              </Text>
            </View>
          </View>

          <View style={styles.detailVideoFrame}>
            {video ? (
              <LocalSessionVideoPlayer videoUri={video.uri} />
            ) : (
              <View style={styles.videoMissingFallback}>
                <Text style={styles.videoMissingTitle}>영상이 필요합니다</Text>
                <Text style={styles.videoMissingText}>
                  Evidence Extraction MVP는 웨이크보드 영상을 기준으로 동작 근거를
                  추출합니다.
                </Text>
              </View>
            )}
          </View>

          <View style={styles.detailSummaryCard}>
            <View style={styles.detailSummaryTopRow}>
              <Text style={styles.detailMomentDate}>
                {formatSessionDateTime(session.occurredAt)}
              </Text>
              {momentStatus ? (
                <Text
                  style={[
                    styles.momentBadge,
                    getMomentStatusStyle(momentStatus),
                  ]}
                >
                  {getMomentStatusLabel(momentStatus)}
                </Text>
              ) : null}
            </View>
            <Text style={styles.detailMomentTitle}>{session.title}</Text>
            {session.notes ? (
              <Text style={styles.detailMomentReason}>{session.notes}</Text>
            ) : null}
          </View>

            {shouldShowStatusMessage && statusMessage ? (
              <View style={styles.detailStateCard}>
                <Text style={styles.detailStateTitle}>{statusMessage.title}</Text>
                <Text style={styles.detailStateText}>
                  {statusMessage.body}
                </Text>
              </View>
            ) : null}
            {visibleEvidence ? (
              <GeminiEvidenceView
                evidence={visibleEvidence}
                userConfirmedTrick={undefined}
                onConfirmTrick={() => undefined}
              />
            ) : !shouldShowStatusMessage && !isLoading && video ? (
              <View style={styles.detailStateCard}>
                <Text style={styles.detailStateTitle}>아직 추출 결과가 없습니다</Text>
                <Text style={styles.detailStateText}>
                  다시 시도를 누르면 Gemini evidence endpoint만 호출합니다.
                </Text>
              </View>
            ) : null}
            <View style={styles.detailActionRow}>
              <Pressable
                accessibilityRole="button"
                disabled={!canRetry}
                onPress={onRetry}
                style={({ pressed }) => [
                  styles.detailRetryButton,
                  !canRetry ? styles.detailRetryButtonDisabled : undefined,
                  pressed ? styles.buttonPressed : undefined,
                ]}
              >
                <Text style={styles.detailRetryText}>
                  {isLoading ? '추출 중...' : '근거 추출 다시 시도'}
                </Text>
              </Pressable>
              {onDelete ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={onDelete}
                  style={({ pressed }) => [
                    styles.detailDeleteButton,
                    pressed ? styles.buttonPressed : undefined,
                  ]}
                >
                  <Text style={styles.detailDeleteText}>삭제</Text>
                </Pressable>
              ) : null}
            </View>
            {debugEndpoint ? (
              <View style={styles.debugBox}>
                <Text style={styles.debugText}>
                  DEV endpoint: {debugEndpoint}
                </Text>
              </View>
            ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function AnalysisResultView({
  result,
  title,
}: {
  result: AnalysisResult;
  title?: string;
}) {
  return (
    <View style={styles.analysisResult}>
      <Text style={styles.analysisResultTitle}>
        {result.status === 'failed' ? '분석 실패' : title ?? '코칭 결과'}
      </Text>
      <Text style={styles.analysisResultText}>{result.summary}</Text>
      {result.detectedTrick || result.confidence ? (
        <Text style={styles.analysisCompactMeta}>
          {[result.detectedTrick, formatConfidence(result.confidence)]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      ) : null}
      <HighlightSceneList scenes={result.highlightScenes} />
      {result.strengths?.slice(0, 2).map((strength) => (
        <Text key={`strength-${strength}`} style={styles.analysisResultListItem}>
          강점: {strength}
        </Text>
      ))}
      {result.improvements?.slice(0, 2).map((improvement) => (
        <Text key={`improvement-${improvement}`} style={styles.analysisResultListItem}>
          개선: {improvement}
        </Text>
      ))}
      {result.coachingObservations?.slice(0, 2).map((observation) => (
        <Text key={`${observation.label}-${observation.detail}`} style={styles.analysisResultListItem}>
          관찰: {observation.label} - {observation.detail}
        </Text>
      ))}
      {result.highlights.slice(0, 3).map((highlight) => (
        <Text key={highlight} style={styles.analysisResultListItem}>
          - {highlight}
        </Text>
      ))}
      {result.suggestions.slice(0, 3).map((suggestion) => (
        <Text key={suggestion} style={styles.analysisResultListItem}>
          - {suggestion}
        </Text>
      ))}
    </View>
  );
}

function GeminiEvidenceView({
  evidence,
  userConfirmedTrick,
  onConfirmTrick,
}: {
  evidence: GeminiEvidenceResult;
  userConfirmedTrick?: string;
  onConfirmTrick?: (trickName: string) => void;
}) {
  const [draftTrickName, setDraftTrickName] = useState(
    userConfirmedTrick ?? evidence.primaryCandidate.name,
  );
  const candidateNames = [
    evidence.primaryCandidate.name,
    ...evidence.alternativeCandidates.map((candidate) => candidate.name),
  ].filter((name, index, names) => name && names.indexOf(name) === index);
  const shouldAskUser =
    evidence.requiresUserConfirmation ||
    evidence.qualityMode === 'degraded' ||
    evidence.recoveredFromPartial ||
    evidence.consistencyStatus === 'inconsistent' ||
    evidence.consistencyStatus === 'needs_review' ||
    evidence.confidence === 'low' ||
    evidence.primaryCandidate.confidence === 'low';
  const hasConsistencyIssue =
    evidence.consistencyStatus === 'inconsistent' ||
    evidence.consistencyStatus === 'needs_review';

  return (
    <View style={styles.evidencePanel}>
      <Text style={styles.evidenceTitle}>
        {evidence.status === 'failed' ? 'Gemini 근거 추출 실패' : 'Gemini 동작 근거'}
      </Text>
      <Text
        style={[
          styles.evidenceModelBadge,
          evidence.qualityMode === 'degraded'
            ? styles.evidenceModelBadgeDegraded
            : undefined,
        ]}
      >
        모델: {evidence.model ?? 'unknown'} ·{' '}
        {evidence.qualityMode === 'degraded'
          ? 'degraded / low-confidence'
          : 'standard'}
      </Text>
      <View style={styles.evidenceSummaryGrid}>
        <EvidenceSummaryCard label="Predicted" value={evidence.primaryCandidate.name} />
        <EvidenceSummaryCard label="Family" value={evidence.family.value} />
        <EvidenceSummaryCard label="Confidence" value={evidence.confidence} />
        <EvidenceSummaryCard
          label="Review"
          value={
            evidence.requiresUserConfirmation ||
            evidence.consistencyStatus === 'needs_review' ||
            evidence.consistencyStatus === 'inconsistent'
              ? 'needs_review'
              : 'ok'
          }
        />
      </View>
      <View style={styles.evidenceFactRow}>
        <Text style={styles.evidenceFactLabel}>AI 추정 기술</Text>
        <Text style={styles.evidenceFactValue}>
          {evidence.primaryCandidate.name} ({evidence.primaryCandidate.confidence})
        </Text>
        {shouldAskUser ? (
          <Text style={styles.evidenceWarningText}>
            {hasConsistencyIssue
              ? 'AI 추정 결과에 내부 불일치가 있습니다. 시도한 기술을 확인해 주세요.'
              : evidence.qualityMode === 'degraded'
              ? '서비스 혼잡으로 낮은 품질 fallback 결과입니다. 코칭 전에 시도한 기술을 반드시 확인해 주세요.'
              : evidence.recoveredFromPartial
                ? 'Gemini 응답 일부만 복구된 결과입니다. 코칭 전에 시도한 기술을 확인해 주세요.'
              : 'AI가 기술명을 확신하지 못했습니다. 시도한 기술을 선택해 주세요.'}
          </Text>
        ) : null}
        {evidence.consistencyWarnings?.map((warning) => (
          <Text key={warning} style={styles.evidenceWarningText}>
            - {warning}
          </Text>
        ))}
        <Text style={styles.evidenceText}>
          {evidence.primaryCandidate.evidence ?? evidence.evidence}
        </Text>
      </View>
      <EvidenceFactRow
        label="계열"
        value={evidence.family.value}
        confidence={evidence.family.confidence}
        evidence={evidence.family.evidence}
      />
      <EvidenceFactRow
        label="어프로치"
        value={evidence.approachType.value}
        confidence={evidence.approachType.confidence}
        evidence={evidence.approachType.evidence}
      />
      <EvidenceFactRow
        label="회전"
        value={evidence.rotationType.value}
        confidence={evidence.rotationType.confidence}
        evidence={evidence.rotationType.evidence}
      />
      <EvidenceFactRow
        label="착지"
        value={evidence.landingOutcome.value}
        confidence={evidence.landingOutcome.confidence}
        evidence={evidence.landingOutcome.evidence}
      />
      {evidence.approachObservedFacts ? (
        <ApproachObservedFactsSummary facts={evidence.approachObservedFacts} />
      ) : null}
      {evidence.inversionObservedFacts ? (
        <InversionObservedFactsSummary facts={evidence.inversionObservedFacts} />
      ) : null}
      {onConfirmTrick ? (
        <View style={styles.evidenceSection}>
        <Text style={styles.evidenceSectionTitle}>기술명 확인</Text>
        <View style={styles.candidateRow}>
          {candidateNames.map((name) => (
            <Pressable
              accessibilityRole="button"
              key={name}
              onPress={() => {
                setDraftTrickName(name);
                onConfirmTrick?.(name);
              }}
              style={({ pressed }) => [
                styles.candidateChip,
                userConfirmedTrick === name ? styles.candidateChipSelected : undefined,
                pressed ? styles.buttonPressed : undefined,
              ]}
            >
              <Text
                style={[
                  styles.candidateChipText,
                  userConfirmedTrick === name
                    ? styles.candidateChipTextSelected
                    : undefined,
                ]}
              >
                {name}
              </Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          placeholder="직접 입력"
          placeholderTextColor="#94a3b8"
          style={styles.confirmTrickInput}
          value={draftTrickName}
          onChangeText={setDraftTrickName}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => onConfirmTrick(draftTrickName)}
          style={({ pressed }) => [
            styles.confirmTrickButton,
            pressed ? styles.buttonPressed : undefined,
          ]}
        >
          <Text style={styles.confirmTrickButtonText}>
            {userConfirmedTrick ? '확정 기술 업데이트' : '이 기술로 확정'}
          </Text>
        </Pressable>
        {userConfirmedTrick ? (
          <Text style={styles.confirmedTrickText}>
            사용자 확정 기술: {userConfirmedTrick}
          </Text>
        ) : null}
        </View>
      ) : null}
      {evidence.evidenceWindows.length > 0 ? (
        <View style={styles.evidenceSection}>
          <Text style={styles.evidenceSectionTitle}>근거 구간</Text>
          {evidence.evidenceWindows.map((window) => (
            <Text
              key={`${window.startSeconds}-${window.endSeconds}-${window.label}`}
              style={styles.evidenceText}
            >
              {window.startSeconds.toFixed(1)}s-{window.endSeconds.toFixed(1)}s ·{' '}
              {window.label} ({window.confidence}): {window.evidence}
            </Text>
          ))}
        </View>
      ) : null}
      {evidence.observations.length > 0 ? (
        <View style={styles.evidenceSection}>
          <Text style={styles.evidenceSectionTitle}>관찰</Text>
          {evidence.observations.slice(0, 5).map((observation) => (
            <Text
              key={`${observation.timestampLabel}-${observation.label}`}
              style={styles.evidenceText}
            >
              {observation.timestampLabel} · {observation.label} (
              {observation.confidence}): {observation.detail}
            </Text>
          ))}
        </View>
      ) : null}
      <View style={styles.evidenceSection}>
        <Text style={styles.evidenceSectionTitle}>
          불확실성 ({evidence.uncertainty.level})
        </Text>
        {evidence.uncertainty.reasons.map((reason) => (
          <Text key={reason} style={styles.evidenceText}>
            - {reason}
          </Text>
        ))}
      </View>
      {ENABLE_INTERNAL_DEBUG_VIEWER ? (
        <DebugResultViewer evidence={evidence} />
      ) : null}
    </View>
  );
}

function EvidenceSummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.evidenceSummaryCard}>
      <Text style={styles.evidenceSummaryLabel}>{label}</Text>
      <Text style={styles.evidenceSummaryValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function ApproachObservedFactsSummary({
  facts,
}: {
  facts: NonNullable<GeminiEvidenceResult['approachObservedFacts']>;
}) {
  return (
    <View style={styles.evidenceSection}>
      <Text style={styles.evidenceSectionTitle}>approachObservedFacts</Text>
      <Text style={styles.evidenceText}>
        stance: {facts.stance.value} ({facts.stance.confidence})
      </Text>
      <Text style={styles.evidenceText}>
        leadFoot: {facts.leadFoot.value} ({facts.leadFoot.confidence})
      </Text>
      <Text style={styles.evidenceText}>
        boardDirection: {facts.boardDirection.value} (
        {facts.boardDirection.confidence})
      </Text>
      <Text style={styles.evidenceText}>
        wakePath: {facts.wakeCrossingPath.startPosition} →{' '}
        {facts.wakeCrossingPath.takeoffPosition} →{' '}
        {facts.wakeCrossingPath.landingPosition} (
        {facts.wakeCrossingPath.confidence})
      </Text>
      <Text style={styles.evidenceText}>
        edge: {facts.edgeDirectionEvidence.value} (
        {facts.edgeDirectionEvidence.confidence})
      </Text>
      <Text style={styles.evidenceText}>
        handle/body: {facts.handlePosition.value} · {facts.bodyOrientation.value}
      </Text>
    </View>
  );
}

function InversionObservedFactsSummary({
  facts,
}: {
  facts: NonNullable<GeminiEvidenceResult['inversionObservedFacts']>;
}) {
  const duration =
    facts.inversionDuration.seconds === null
      ? 'unknown'
      : `${facts.inversionDuration.seconds}s`;

  return (
    <View style={styles.evidenceSection}>
      <Text style={styles.evidenceSectionTitle}>inversionObservedFacts</Text>
      <Text style={styles.evidenceText}>
        bodyInverted: {formatObservedBoolean(facts.bodyInverted)}
      </Text>
      <Text style={styles.evidenceText}>
        boardAboveHead: {formatObservedBoolean(facts.boardAboveHead)}
      </Text>
      <Text style={styles.evidenceText}>
        rollAxisObserved: {formatObservedBoolean(facts.rollAxisObserved)}
      </Text>
      <Text style={styles.evidenceText}>
        flipAxisObserved: {formatObservedBoolean(facts.flipAxisObserved)}
      </Text>
      <Text style={styles.evidenceText}>
        duration: {duration} ({facts.inversionDuration.confidence})
      </Text>
      <Text style={styles.evidenceText}>
        evidenceCount: {facts.inversionEvidenceCount}
      </Text>
      {facts.antiInversionEvidence.slice(0, 3).map((item) => (
        <Text key={item} style={styles.evidenceText}>
          anti: {item}
        </Text>
      ))}
    </View>
  );
}

function formatObservedBoolean(value: true | false | 'unknown') {
  if (value === true) {
    return 'true';
  }

  if (value === false) {
    return 'false';
  }

  return 'unknown';
}

function EvidenceFactRow({
  label,
  value,
  confidence,
  evidence,
}: {
  label: string;
  value: string;
  confidence: string;
  evidence: string;
}) {
  return (
    <View style={styles.evidenceFactRow}>
      <Text style={styles.evidenceFactLabel}>{label}</Text>
      <Text style={styles.evidenceFactValue}>
        {value} ({confidence})
      </Text>
      <Text style={styles.evidenceText}>{evidence}</Text>
    </View>
  );
}

function CoachingResultDetail({
  result,
  title,
  onBack,
}: {
  result: AnalysisResult;
  title: string;
  onBack: () => void;
}) {
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        style={({ pressed }) => [
          styles.backButton,
          pressed ? styles.buttonPressed : undefined,
        ]}
      >
        <Text style={styles.backButtonText}>← 라이딩 상세</Text>
      </Pressable>
      <Text style={styles.detailTitle}>{title}</Text>
      {result.detectedTrick || result.confidence ? (
        <Text style={styles.analysisCompactMeta}>
          {[result.detectedTrick, formatConfidence(result.confidence)]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      ) : null}
      <ResultSection title="요약" items={[result.humanReadableAnalysis ?? result.summary]} />
      <ResultSection
        title="응답 원문"
        items={[result.rawResponseText ?? result.summary]}
        preserveWhitespace
      />
      <ResultSection title="하이라이트" items={result.highlights} />
      <ObservationSection title="관찰" items={result.observations} />
      <ObservationSection title="패턴" items={result.patternRecognition} />
      <ObservationSection title="해석" items={result.inferences} />
      <ObservationSection title="코칭 관찰" items={result.coachingObservations} />
      <ResultSection title="분석 한계" items={result.selfCritique?.limitations} />
      <ResultSection
        title="다음 분석 개선점"
        items={result.selfCritique?.whatWouldImproveAnalysis}
      />
      <ResultSection title="강점" items={result.strengths} />
      <ResultSection title="개선할 점" items={result.improvements} />
      <ResultSection title="다음 연습" items={result.suggestions} />
      {result.highlightScenes && result.highlightScenes.length > 0 ? (
        <View style={styles.resultDetailSection}>
          <Text style={styles.resultDetailSectionTitle}>주요 장면</Text>
          <HighlightSceneList scenes={result.highlightScenes} />
        </View>
      ) : null}
    </View>
  );
}

function HighlightSceneList({
  scenes,
}: {
  scenes?: AnalysisResult['highlightScenes'];
}) {
  const imageScenes = scenes?.filter((scene) => scene.imageUri) ?? [];
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selectedScene =
    selectedIndex === null ? undefined : imageScenes[selectedIndex];

  if (!scenes || scenes.length === 0) {
    return null;
  }

  return (
    <>
      {scenes.map((scene) => {
        const imageIndex = imageScenes.findIndex((item) => item.id === scene.id);

        return (
          <View key={scene.id} style={styles.highlightScene}>
            {scene.imageUri ? (
              <Pressable
                accessibilityRole="imagebutton"
                onPress={() => setSelectedIndex(Math.max(imageIndex, 0))}
              >
                <Image source={{ uri: scene.imageUri }} style={styles.highlightImage} />
              </Pressable>
            ) : null}
            <View style={styles.highlightBody}>
              <Text style={styles.highlightMeta}>{scene.timestampLabel}</Text>
              <Text style={styles.highlightTitle}>{scene.title}</Text>
              <Text style={styles.highlightDescription}>{scene.description}</Text>
            </View>
          </View>
        );
      })}
      <Modal
        animationType="fade"
        onRequestClose={() => setSelectedIndex(null)}
        transparent
        visible={Boolean(selectedScene)}
      >
        <SafeAreaView style={styles.imageModalBackdrop}>
          <View style={styles.imageModalHeader}>
            <View style={styles.imageModalTitleBlock}>
              <Text style={styles.imageModalTitle}>
                {selectedScene?.title ?? '하이라이트'}
              </Text>
              <Text style={styles.imageModalMeta}>
                {selectedScene?.timestampLabel ?? ''}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setSelectedIndex(null)}
              style={({ pressed }) => [
                styles.imageModalCloseButton,
                pressed ? styles.buttonPressed : undefined,
              ]}
            >
              <Text style={styles.imageModalCloseText}>닫기</Text>
            </Pressable>
          </View>
          <View style={styles.imageModalBody}>
            {selectedScene?.imageUri ? (
              <Image
                resizeMode="contain"
                source={{ uri: selectedScene.imageUri }}
                style={styles.imageModalImage}
              />
            ) : null}
          </View>
          <View style={styles.imageModalNavRow}>
            <Pressable
              accessibilityRole="button"
              disabled={selectedIndex === null || selectedIndex <= 0}
              onPress={() =>
                setSelectedIndex((current) =>
                  current === null ? current : Math.max(current - 1, 0),
                )
              }
              style={({ pressed }) => [
                styles.imageModalNavButton,
                selectedIndex === null || selectedIndex <= 0
                  ? styles.imageModalNavButtonDisabled
                  : undefined,
                pressed ? styles.buttonPressed : undefined,
              ]}
            >
              <Text style={styles.imageModalNavText}>이전</Text>
            </Pressable>
            <Text style={styles.imageModalCounter}>
              {selectedIndex === null ? 0 : selectedIndex + 1}/{imageScenes.length}
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={
                selectedIndex === null || selectedIndex >= imageScenes.length - 1
              }
              onPress={() =>
                setSelectedIndex((current) =>
                  current === null
                    ? current
                    : Math.min(current + 1, imageScenes.length - 1),
                )
              }
              style={({ pressed }) => [
                styles.imageModalNavButton,
                selectedIndex === null || selectedIndex >= imageScenes.length - 1
                  ? styles.imageModalNavButtonDisabled
                  : undefined,
                pressed ? styles.buttonPressed : undefined,
              ]}
            >
              <Text style={styles.imageModalNavText}>다음</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

function ResultSection({
  title,
  items,
  preserveWhitespace = false,
}: {
  title: string;
  items?: string[];
  preserveWhitespace?: boolean;
}) {
  const visibleItems = items?.filter((item) => item.trim().length > 0);

  if (!visibleItems || visibleItems.length === 0) {
    return null;
  }

  return (
    <View style={styles.resultDetailSection}>
      <Text style={styles.resultDetailSectionTitle}>{title}</Text>
      {visibleItems.map((item) => (
        <Text
          key={`${title}-${item}`}
          style={[
            styles.resultDetailText,
            preserveWhitespace ? styles.rawResponseText : undefined,
          ]}
        >
          {item}
        </Text>
      ))}
    </View>
  );
}

function ObservationSection({
  title,
  items,
}: {
  title: string;
  items?: AnalysisResult['observations'];
}) {
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <View style={styles.resultDetailSection}>
      <Text style={styles.resultDetailSectionTitle}>{title}</Text>
      {items.map((item) => (
        <Text key={`${title}-${item.label}-${item.detail}`} style={styles.resultDetailText}>
          {item.label}: {item.detail}
          {item.confidence ? ` (${item.confidence})` : ''}
        </Text>
      ))}
    </View>
  );
}

function formatSessionDateTime(value: string) {
  return new Date(value).toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatShortSessionDate(value: string) {
  return new Date(value).toLocaleDateString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
  });
}

function formatConfidence(confidence: AnalysisResult['confidence']) {
  if (!confidence) {
    return undefined;
  }

  return `확신도 ${confidence.level}`;
}
