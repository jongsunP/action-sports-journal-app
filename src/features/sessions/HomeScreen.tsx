import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
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

import {
  analyzeSessionVideo,
  benchmarkSessionVideoWithOpenAi,
  extractSessionEvidenceWithGemini,
  hasConfiguredAnalysisEndpoint,
  hasConfiguredGeminiEvidenceEndpoint,
  hasConfiguredOpenAiBenchmarkEndpoint,
  type SessionVideoAsset,
} from '../../services/ai';
import { mockActivityGroups } from '../groups/mockActivityGroups';
import { mockSessions } from './mockSessions';

import type { AnalysisResult, GeminiEvidenceResult, Session } from '../../types';

const SESSION_STORAGE_KEY = 'action-sports-journal:sessions:v1';

type PersistedSessionState = {
  selectedGroupId?: string;
  sessions?: Session[];
  videosBySessionId?: Record<string, SessionVideoAsset>;
  analysisBySessionId?: Record<string, AnalysisResult>;
  openAiBenchmarkBySessionId?: Record<string, AnalysisResult>;
  geminiEvidenceBySessionId?: Record<string, GeminiEvidenceResult>;
  userConfirmedTrickBySessionId?: Record<string, string>;
};

export function HomeScreen() {
  const [selectedGroupId, setSelectedGroupId] = useState(
    mockActivityGroups[0]?.id ?? '',
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
  const [analyzingSessionId, setAnalyzingSessionId] = useState<string | null>(
    null,
  );
  const [benchmarkingSessionId, setBenchmarkingSessionId] = useState<string | null>(
    null,
  );
  const [extractingEvidenceSessionId, setExtractingEvidenceSessionId] = useState<
    string | null
  >(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedCoachingResult, setSelectedCoachingResult] = useState<{
    title: string;
    result: AnalysisResult;
  } | null>(null);
  const [isStorageLoaded, setIsStorageLoaded] = useState(false);

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

        if (parsed.selectedGroupId) {
          setSelectedGroupId(parsed.selectedGroupId);
        }

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
    selectedGroupId,
    sessions,
    userConfirmedTrickBySessionId,
    videosBySessionId,
  ]);

  const selectedGroup =
    mockActivityGroups.find((group) => group.id === selectedGroupId) ??
    mockActivityGroups[0];

  const visibleSessions = useMemo(
    () =>
      sessions
        .filter((session) => session.activityGroupId === selectedGroup?.id)
        .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)),
    [sessions, selectedGroup?.id],
  );
  const attachedVideoCount = sessions.filter((session) => session.videoUri).length;
  const completedAnalysisCount = Object.values(analysisBySessionId).filter(
    (analysis) => hasCoachingResult(analysis),
  ).length;
  const canRequestRemoteAnalysis = hasConfiguredAnalysisEndpoint();
  const canRequestGeminiEvidence = hasConfiguredGeminiEvidenceEndpoint();
  const canRequestOpenAiBenchmark = hasConfiguredOpenAiBenchmarkEndpoint();
  const visibleAnalysisResults = visibleSessions
    .map((session) => analysisBySessionId[session.id])
    .filter(
      (analysis): analysis is AnalysisResult =>
        Boolean(analysis && hasCoachingResult(analysis)),
    );
  const latestVisibleSession = visibleSessions[0];
  const latestDetectedTrick = visibleAnalysisResults.find(
    (analysis) => analysis.detectedTrick,
  )?.detectedTrick;
  const selectedSession = selectedSessionId
    ? sessions.find((session) => session.id === selectedSessionId)
    : undefined;

  const canSaveSession = title.trim().length > 0;

  const handleAddSession = () => {
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
    }
    setTitle('');
    setNotes('');
    setSelectedVideo(null);
    setIsComposerOpen(false);
    Keyboard.dismiss();
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

  const handleAnalyzeSession = async (session: Session) => {
    const video = videosBySessionId[session.id] ?? getVideoAssetFromSession(session);

    if (!video) {
      Alert.alert('영상이 필요합니다', '코칭을 받으려면 영상을 먼저 연결해주세요.');
      return;
    }

    const group =
      mockActivityGroups.find((item) => item.id === session.activityGroupId) ??
      selectedGroup;
    const evidence = geminiEvidenceBySessionId[session.id];
    const needsConfirmation =
      evidence &&
      (evidence.requiresUserConfirmation ||
        evidence.qualityMode === 'degraded' ||
        evidence.consistencyStatus === 'inconsistent' ||
        evidence.consistencyStatus === 'needs_review') &&
      !userConfirmedTrickBySessionId[session.id];

    if (needsConfirmation) {
      Alert.alert(
        '기술 확인이 필요합니다',
        '현재 AI 추정 결과의 확신도나 내부 일관성이 충분하지 않습니다. 코칭 전에 시도한 기술을 먼저 확정해 주세요.',
      );
      return;
    }

    try {
      setAnalyzingSessionId(session.id);
      const analysis = await analyzeSessionVideo({
        session,
        activityGroupName: group?.name ?? 'Activity',
        video,
        userConfirmedTrick: userConfirmedTrickBySessionId[session.id],
      });

      setAnalysisBySessionId((current) => ({
        ...current,
        [session.id]: analysis,
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '분석 요청에 실패했습니다.';

      setAnalysisBySessionId((current) => ({
        ...current,
        [session.id]: {
          id: `analysis-error-${Date.now()}`,
          sessionId: session.id,
          status: 'failed',
          summary: message,
          highlights: [],
          suggestions: ['분석 서버 설정을 확인한 뒤 다시 시도해주세요.'],
          createdAt: new Date().toISOString(),
        },
      }));
    } finally {
      setAnalyzingSessionId(null);
    }
  };

  const handleBenchmarkSession = async (session: Session) => {
    const video = videosBySessionId[session.id] ?? getVideoAssetFromSession(session);

    if (!video) {
      Alert.alert('영상이 필요합니다', '비교 코칭 전에 영상을 먼저 연결해주세요.');
      return;
    }

    const group =
      mockActivityGroups.find((item) => item.id === session.activityGroupId) ??
      selectedGroup;
    const evidence = geminiEvidenceBySessionId[session.id];
    const needsConfirmation =
      evidence &&
      (evidence.requiresUserConfirmation ||
        evidence.qualityMode === 'degraded' ||
        evidence.consistencyStatus === 'inconsistent' ||
        evidence.consistencyStatus === 'needs_review') &&
      !userConfirmedTrickBySessionId[session.id];

    if (needsConfirmation) {
      Alert.alert(
        '기술 확인이 필요합니다',
        '현재 AI 추정 결과의 확신도나 내부 일관성이 충분하지 않습니다. 비교 코칭 전에 시도한 기술을 먼저 확정해 주세요.',
      );
      return;
    }

    try {
      setBenchmarkingSessionId(session.id);
      const analysis = await benchmarkSessionVideoWithOpenAi({
        session,
        activityGroupName: group?.name ?? 'Activity',
        video,
        userConfirmedTrick: userConfirmedTrickBySessionId[session.id],
      });

      setOpenAiBenchmarkBySessionId((current) => ({
        ...current,
        [session.id]: analysis,
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '비교 코칭 요청에 실패했습니다.';

      setOpenAiBenchmarkBySessionId((current) => ({
        ...current,
        [session.id]: {
          id: `openai-benchmark-error-${Date.now()}`,
          sessionId: session.id,
          status: 'failed',
          summary: message,
          highlights: [],
          suggestions: ['서버 설정과 API 키를 확인한 뒤 다시 시도해주세요.'],
          createdAt: new Date().toISOString(),
        },
      }));
    } finally {
      setBenchmarkingSessionId(null);
    }
  };

  const handleExtractEvidence = async (session: Session) => {
    const video = videosBySessionId[session.id] ?? getVideoAssetFromSession(session);

    if (!video) {
      Alert.alert('영상이 필요합니다', '근거 추출 전에 영상을 먼저 연결해주세요.');
      return;
    }

    const group =
      mockActivityGroups.find((item) => item.id === session.activityGroupId) ??
      selectedGroup;

    try {
      setExtractingEvidenceSessionId(session.id);
      const evidence = await extractSessionEvidenceWithGemini({
        session,
        activityGroupName: group?.name ?? 'Activity',
        video,
        userConfirmedTrick: userConfirmedTrickBySessionId[session.id],
      });

      setGeminiEvidenceBySessionId((current) => ({
        ...current,
        [session.id]: evidence,
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '근거 추출 요청에 실패했습니다.';

      setGeminiEvidenceBySessionId((current) => ({
        ...current,
        [session.id]: {
          id: `evidence-error-${Date.now()}`,
          sessionId: session.id,
          status: 'failed',
          provider: 'gemini',
          primaryCandidate: {
            name: '확인 실패',
            confidence: 'low',
            evidence: message,
          },
          alternativeCandidates: [],
          family: {
            value: '확인 실패',
            confidence: 'low',
            evidence: message,
          },
          approachType: {
            value: '확인 실패',
            confidence: 'low',
            evidence: message,
          },
          rotationType: {
            value: '확인 실패',
            confidence: 'low',
            evidence: message,
          },
          landingOutcome: {
            value: '확인 실패',
            confidence: 'low',
            evidence: message,
          },
          confidence: 'low',
          evidence: message,
          evidenceWindows: [],
          observations: [],
          uncertainty: {
            level: 'high',
            reasons: [message],
          },
          createdAt: new Date().toISOString(),
        },
      }));
    } finally {
      setExtractingEvidenceSessionId(null);
    }
  };

  const handleDeleteSession = (session: Session) => {
    Alert.alert('기록을 삭제할까요?', '이 라이딩 기록과 연결된 분석 결과가 함께 삭제됩니다.', [
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

          if (selectedSessionId === session.id) {
            setSelectedSessionId(null);
            setSelectedCoachingResult(null);
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
            <Text style={styles.kicker}>Action Sports Journal</Text>
            <Text style={styles.title}>성장 흐름을 남기는 액션스포츠 저널</Text>
            <View style={styles.metricRow}>
              <MetricItem label="기록" value={sessions.length} />
              <MetricItem label="영상" value={attachedVideoCount} />
              <MetricItem label="코칭" value={completedAnalysisCount} />
            </View>
          </View>

          <View style={styles.progressStrip}>
            <ProgressItem
              label="최근 라이딩"
              value={
                latestVisibleSession
                  ? formatSessionDateTime(latestVisibleSession.occurredAt)
                  : '기록 없음'
              }
            />
            <ProgressItem
              label="코칭 기록"
              value={`${visibleAnalysisResults.length}/${visibleSessions.length}`}
            />
            <ProgressItem label="최근 트릭" value={latestDetectedTrick ?? '확인 전'} />
          </View>

          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionLabel}>종목</Text>
            </View>
            <FlatList
              data={mockActivityGroups}
              horizontal
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.groupRow}
              renderItem={({ item }) => {
                const selected = item.id === selectedGroup?.id;

                return (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setSelectedGroupId(item.id)}
                    style={({ pressed }) => [
                      styles.groupChip,
                      selected ? styles.groupChipSelected : undefined,
                      pressed ? styles.groupChipPressed : undefined,
                    ]}
                  >
                    <Text
                      style={[
                        styles.groupChipTitle,
                        selected ? styles.groupChipTitleSelected : undefined,
                      ]}
                    >
                      {item.name}
                    </Text>
                    <Text
                      style={[
                        styles.groupChipMeta,
                        selected ? styles.groupChipMetaSelected : undefined,
                      ]}
                    >
                      {item.description}
                    </Text>
                  </Pressable>
                );
              }}
              showsHorizontalScrollIndicator={false}
            />
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionLabel}>
                  {selectedSession ? '라이딩 상세' : '라이딩 기록'}
                </Text>
                <Text style={styles.contextText}>
                  {selectedSession
                    ? '코칭 피드백과 성장 단서를 확인합니다'
                    : `${selectedGroup?.name ?? '선택된 종목 없음'} · 최근 기록순`}
                </Text>
              </View>
              {selectedSession ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setSelectedSessionId(null);
                    setSelectedCoachingResult(null);
                  }}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed ? styles.buttonPressed : undefined,
                  ]}
                >
                  <Text style={styles.secondaryButtonText}>목록</Text>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setIsComposerOpen((current) => !current)}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed ? styles.buttonPressed : undefined,
                  ]}
                >
                  <Text style={styles.secondaryButtonText}>
                    {isComposerOpen ? '닫기' : '기록 추가'}
                  </Text>
                </Pressable>
              )}
            </View>

            {!selectedSession && isComposerOpen ? (
              <View style={styles.composer}>
                <TextInput
                  placeholder="라이딩 제목"
                  placeholderTextColor="#94a3b8"
                  style={styles.input}
                  value={title}
                  onChangeText={setTitle}
                />
                <TextInput
                  multiline
                  placeholder="메모"
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
                    영상을 선택하면 코칭 흐름을 바로 확인할 수 있습니다.
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
                    기록 저장
                  </Text>
                </Pressable>
                <Text style={styles.helperText}>라이딩 제목은 필수입니다.</Text>
              </View>
            ) : null}

            {selectedSession ? (
              <View style={styles.detailPanel}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setSelectedSessionId(null)}
                  style={({ pressed }) => [
                    styles.backButton,
                    pressed ? styles.buttonPressed : undefined,
                  ]}
                >
                  <Text style={styles.backButtonText}>← 기록 목록</Text>
                </Pressable>
                {selectedCoachingResult ? (
                  <CoachingResultDetail
                    result={selectedCoachingResult.result}
                    title={selectedCoachingResult.title}
                    onBack={() => setSelectedCoachingResult(null)}
                  />
                ) : (
                  <>
                    <Text style={styles.detailTitle}>{selectedSession.title}</Text>
                    <Text style={styles.sessionDate}>
                      {formatSessionDateTime(selectedSession.occurredAt)}
                    </Text>
                    {selectedSession.notes ? (
                      <Text style={styles.detailNotes}>{selectedSession.notes}</Text>
                    ) : null}
                    {userConfirmedTrickBySessionId[selectedSession.id] ? (
                      <Text style={styles.confirmedTrickText}>
                        확정 기술: {userConfirmedTrickBySessionId[selectedSession.id]}
                      </Text>
                    ) : null}
                    <View style={styles.detailActionRow}>
                      <Pressable
                        accessibilityRole="button"
                        disabled={
                          !hasCoachingResult(analysisBySessionId[selectedSession.id]) &&
                          (!selectedSession.videoUri ||
                            !canRequestRemoteAnalysis ||
                            analyzingSessionId === selectedSession.id)
                        }
                        onPress={() => {
                          const result = analysisBySessionId[selectedSession.id];

                          if (result) {
                            setSelectedCoachingResult({
                              title: 'Gemini 코칭',
                              result,
                            });
                            return;
                          }

                          handleAnalyzeSession(selectedSession);
                        }}
                        style={({ pressed }) => [
                          hasCoachingResult(analysisBySessionId[selectedSession.id])
                            ? styles.coachingButtonComplete
                            : styles.coachingButtonPending,
                          !hasCoachingResult(analysisBySessionId[selectedSession.id]) &&
                          (!selectedSession.videoUri ||
                            !canRequestRemoteAnalysis ||
                            analyzingSessionId === selectedSession.id)
                            ? styles.analysisButtonDisabled
                            : undefined,
                          pressed ? styles.buttonPressed : undefined,
                        ]}
                      >
                        <Text
                          style={[
                            styles.analysisButtonText,
                            hasCoachingResult(analysisBySessionId[selectedSession.id])
                              ? undefined
                              : styles.pendingButtonText,
                          ]}
                        >
                          {analyzingSessionId === selectedSession.id
                            ? '코칭 중...'
                            : hasCoachingResult(analysisBySessionId[selectedSession.id])
                              ? 'Gemini 코칭 보기'
                              : 'Gemini 코칭 받기'}
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        disabled={
                          !hasCoachingResult(
                            openAiBenchmarkBySessionId[selectedSession.id],
                          ) &&
                          (!selectedSession.videoUri ||
                            !canRequestOpenAiBenchmark ||
                            benchmarkingSessionId === selectedSession.id)
                        }
                        onPress={() => {
                          const result = openAiBenchmarkBySessionId[selectedSession.id];

                          if (result) {
                            setSelectedCoachingResult({
                              title: 'GPT 코칭',
                              result,
                            });
                            return;
                          }

                          handleBenchmarkSession(selectedSession);
                        }}
                        style={({ pressed }) => [
                          hasCoachingResult(openAiBenchmarkBySessionId[selectedSession.id])
                            ? styles.coachingButtonComplete
                            : styles.coachingButtonPending,
                          !hasCoachingResult(
                            openAiBenchmarkBySessionId[selectedSession.id],
                          ) &&
                          (!selectedSession.videoUri ||
                            !canRequestOpenAiBenchmark ||
                            benchmarkingSessionId === selectedSession.id)
                            ? styles.analysisButtonDisabled
                            : undefined,
                          pressed ? styles.buttonPressed : undefined,
                        ]}
                      >
                        <Text
                          style={[
                            styles.analysisButtonText,
                            hasCoachingResult(
                              openAiBenchmarkBySessionId[selectedSession.id],
                            )
                              ? undefined
                              : styles.pendingButtonText,
                          ]}
                        >
                          {benchmarkingSessionId === selectedSession.id
                            ? '분석 중...'
                            : hasCoachingResult(
                                openAiBenchmarkBySessionId[selectedSession.id],
                              )
                              ? 'GPT 코칭 보기'
                              : 'GPT 코칭 받기'}
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        disabled={
                          !selectedSession.videoUri ||
                          !canRequestGeminiEvidence ||
                          extractingEvidenceSessionId === selectedSession.id
                        }
                        onPress={() => handleExtractEvidence(selectedSession)}
                        style={({ pressed }) => [
                          styles.coachingButtonPending,
                          !selectedSession.videoUri ||
                          !canRequestGeminiEvidence ||
                          extractingEvidenceSessionId === selectedSession.id
                            ? styles.analysisButtonDisabled
                            : undefined,
                          pressed ? styles.buttonPressed : undefined,
                        ]}
                      >
                        <Text style={[styles.analysisButtonText, styles.pendingButtonText]}>
                          {extractingEvidenceSessionId === selectedSession.id
                            ? 'Gemini 확인 중...'
                            : geminiEvidenceBySessionId[selectedSession.id]
                              ? 'Gemini 근거 다시 추출'
                              : 'Gemini 근거 추출'}
                        </Text>
                      </Pressable>
                    </View>
                    <Text style={styles.detailHint}>
                      같은 영상으로 Gemini나 GPT에 코칭을 요청합니다.
                    </Text>
                    {geminiEvidenceBySessionId[selectedSession.id] ? (
                      <GeminiEvidenceView
                        evidence={geminiEvidenceBySessionId[selectedSession.id]}
                        userConfirmedTrick={
                          userConfirmedTrickBySessionId[selectedSession.id]
                        }
                        onConfirmTrick={(trickName) => {
                          const trimmed = trickName.trim();

                          if (!trimmed) {
                            return;
                          }

                          setUserConfirmedTrickBySessionId((current) => ({
                            ...current,
                            [selectedSession.id]: trimmed,
                          }));
                        }}
                      />
                    ) : null}
                    {analysisBySessionId[selectedSession.id] ? (
                      <AnalysisResultView
                        result={analysisBySessionId[selectedSession.id]}
                        title="Gemini 코칭"
                      />
                    ) : null}
                    {openAiBenchmarkBySessionId[selectedSession.id] ? (
                      <AnalysisResultView
                        result={openAiBenchmarkBySessionId[selectedSession.id]}
                        title="GPT 코칭"
                      />
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => handleDeleteSession(selectedSession)}
                      style={({ pressed }) => [
                        styles.deleteButton,
                        pressed ? styles.buttonPressed : undefined,
                      ]}
                    >
                      <Text style={styles.deleteButtonText}>기록 삭제</Text>
                    </Pressable>
                  </>
                )}
              </View>
            ) : visibleSessions.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>아직 기록이 없습니다</Text>
                  <Text style={styles.emptyText}>
                    첫 라이딩을 남기고 변화 흐름을 확인해보세요.
                  </Text>
                </View>
            ) : (
              visibleSessions.map((item) => {
                const card = getSessionCardPresentation({
                  session: item,
                  geminiResult: analysisBySessionId[item.id],
                  gptResult: openAiBenchmarkBySessionId[item.id],
                });

                return (
                <View key={item.id} style={styles.sessionRow}>
                  <View style={styles.sessionHeroRow}>
                    <View style={styles.sessionThumb}>
                      {card.thumbnailUri ? (
                        <Image source={{ uri: card.thumbnailUri }} style={styles.sessionThumbImage} />
                      ) : (
                        <View style={styles.sessionThumbFallback}>
                          <Text style={styles.sessionThumbFallbackText}>
                            {item.videoUri ? '영상' : '기록'}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.sessionHeroBody}>
                      <View style={styles.sessionHeaderRow}>
                        <View style={styles.sessionTitleBlock}>
                          <Text style={styles.sessionTitle} numberOfLines={1}>
                            {item.title}
                          </Text>
                          <Text style={styles.sessionDate}>
                            {formatSessionDateTime(item.occurredAt)}
                          </Text>
                        </View>
                      </View>
                      {card.detectedAction ? (
                        <Text style={styles.sessionDetectedAction} numberOfLines={1}>
                          {card.detectedAction}
                        </Text>
                      ) : null}
                      {card.hook ? (
                        <Text style={styles.sessionHook} numberOfLines={2}>
                          {card.hook}
                        </Text>
                      ) : item.notes ? (
                        <Text style={styles.sessionHookMuted} numberOfLines={2}>
                          {item.notes}
                        </Text>
                      ) : (
                        <Text style={styles.sessionHookMuted} numberOfLines={2}>
                          코칭 결과를 받으면 하이라이트가 여기에 표시됩니다.
                        </Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.listStatusRow}>
                    <StatusPill
                      active={Boolean(item.videoUri)}
                      label={item.videoUri ? '영상 있음' : '영상 없음'}
                    />
                    <StatusPill
                      active={
                        hasCoachingResult(analysisBySessionId[item.id]) ||
                        analyzingSessionId === item.id
                      }
                      label={
                        analyzingSessionId === item.id
                          ? 'Gemini 분석 중'
                          : hasCoachingResult(analysisBySessionId[item.id])
                          ? 'Gemini 완료'
                          : 'Gemini 대기'
                      }
                    />
                    <StatusPill
                      active={
                        hasCoachingResult(openAiBenchmarkBySessionId[item.id]) ||
                        benchmarkingSessionId === item.id
                      }
                      label={
                        benchmarkingSessionId === item.id
                          ? 'GPT 분석 중'
                          : hasCoachingResult(openAiBenchmarkBySessionId[item.id])
                          ? 'GPT 완료'
                          : 'GPT 대기'
                      }
                    />
                    <StatusPill
                      active={
                        hasCoachingResult(analysisBySessionId[item.id]) &&
                        hasCoachingResult(openAiBenchmarkBySessionId[item.id])
                      }
                      label={
                        hasCoachingResult(analysisBySessionId[item.id]) &&
                        hasCoachingResult(openAiBenchmarkBySessionId[item.id])
                          ? '코칭 완료'
                          : '코칭 진행중'
                      }
                    />
                  </View>
                  <View style={styles.sessionActionRow}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        setSelectedSessionId(item.id);
                        setSelectedCoachingResult(null);
                      }}
                      style={({ pressed }) => [
                        styles.sessionOpenButton,
                        pressed ? styles.buttonPressed : undefined,
                      ]}
                    >
                      <Text style={styles.sessionOpenText}>상세 피드백 보기</Text>
                    </Pressable>
                  </View>
                </View>
                );
              })
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 28,
    paddingHorizontal: 16,
  },
  header: {
    backgroundColor: '#101828',
    borderRadius: 18,
    marginTop: 8,
    marginBottom: 10,
    overflow: 'hidden',
    padding: 16,
  },
  kicker: {
    color: '#5eead4',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  title: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 27,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  metricItem: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 9,
    paddingVertical: 9,
  },
  metricValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
  },
  metricLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  progressStrip: {
    backgroundColor: '#fff',
    borderColor: '#dbe4ee',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    padding: 10,
  },
  progressItem: {
    flex: 1,
  },
  progressLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 3,
  },
  progressValue: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '900',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionLabel: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '900',
  },
  sectionHint: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  groupRow: {
    gap: 8,
    paddingBottom: 4,
  },
  groupChip: {
    backgroundColor: '#fff',
    borderColor: '#dbe4ee',
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 72,
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: 148,
  },
  groupChipSelected: {
    backgroundColor: '#0f766e',
    borderColor: '#0f766e',
  },
  groupChipPressed: {
    opacity: 0.85,
  },
  groupChipTitle: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 4,
  },
  groupChipTitleSelected: {
    color: '#f8fafc',
  },
  groupChipMeta: {
    color: '#64748b',
    fontSize: 12,
    lineHeight: 16,
  },
  groupChipMetaSelected: {
    color: '#cbd5e1',
  },
  contextText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  composer: {
    backgroundColor: '#fff',
    borderColor: '#dbe4ee',
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
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
    backgroundColor: '#0f172a',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
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
  sessionRow: {
    backgroundColor: '#fff',
    borderColor: '#dbe4ee',
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
    padding: 12,
  },
  sessionHeroRow: {
    flexDirection: 'row',
    gap: 10,
  },
  sessionThumb: {
    backgroundColor: '#f8fafc',
    borderColor: '#dbe4ee',
    borderRadius: 10,
    borderWidth: 1,
    height: 86,
    overflow: 'hidden',
    width: 86,
  },
  sessionThumbImage: {
    height: '100%',
    width: '100%',
  },
  sessionThumbFallback: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  sessionThumbFallbackText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '900',
  },
  sessionHeroBody: {
    flex: 1,
    minHeight: 86,
  },
  sessionHeaderRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sessionTitleBlock: {
    flex: 1,
  },
  sessionTitle: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 2,
  },
  sessionDate: {
    color: '#64748b',
    fontSize: 12,
  },
  sessionDetectedAction: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 4,
  },
  sessionHook: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 19,
  },
  sessionHookMuted: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 18,
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
    backgroundColor: '#fff',
    borderColor: '#dbe4ee',
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#f1f5f9',
    borderRadius: 999,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backButtonText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '900',
  },
  detailTitle: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 4,
  },
  detailNotes: {
    color: '#334155',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
  detailActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  detailHint: {
    color: '#64748b',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
    marginTop: 8,
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
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
    padding: 10,
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
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
    padding: 10,
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
    color: '#0f766e',
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
    marginTop: 12,
    paddingVertical: 11,
  },
  deleteButtonText: {
    color: '#be123c',
    fontSize: 13,
    fontWeight: '900',
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

function getSessionCardPresentation({
  session,
  geminiResult,
  gptResult,
}: {
  session: Session;
  geminiResult?: AnalysisResult;
  gptResult?: AnalysisResult;
}) {
  const result = chooseCardResult(geminiResult, gptResult);
  const primaryScene = result?.highlightScenes?.find((scene) => scene.imageUri);
  const detectedAction =
    result?.detectedTrick ??
    result?.patternRecognition?.[0]?.label ??
    result?.highlightScenes?.[0]?.title;
  const hook =
    result?.highlights?.[0] ??
    result?.coachingObservations?.[0]?.detail ??
    result?.improvements?.[0] ??
    result?.summary;

  return {
    thumbnailUri: primaryScene?.imageUri,
    detectedAction: detectedAction ? compactCardText(detectedAction, 42) : undefined,
    hook: hook ? compactCardText(hook, 92) : undefined,
  };
}

function chooseCardResult(
  geminiResult: AnalysisResult | undefined,
  gptResult: AnalysisResult | undefined,
) {
  if (gptResult?.status === 'completed') {
    return gptResult;
  }

  if (geminiResult?.status === 'completed') {
    return geminiResult;
  }

  return gptResult ?? geminiResult;
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

function MetricItem({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metricItem}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function ProgressItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.progressItem}>
      <Text style={styles.progressLabel}>{label}</Text>
      <Text style={styles.progressValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
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
  onConfirmTrick: (trickName: string) => void;
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
      <View style={styles.evidenceSection}>
        <Text style={styles.evidenceSectionTitle}>기술명 확인</Text>
        <View style={styles.candidateRow}>
          {candidateNames.map((name) => (
            <Pressable
              accessibilityRole="button"
              key={name}
              onPress={() => {
                setDraftTrickName(name);
                onConfirmTrick(name);
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
    </View>
  );
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

function formatConfidence(confidence: AnalysisResult['confidence']) {
  if (!confidence) {
    return undefined;
  }

  return `확신도 ${confidence.level}`;
}
