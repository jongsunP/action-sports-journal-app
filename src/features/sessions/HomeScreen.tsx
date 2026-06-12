import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
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
  hasConfiguredAnalysisEndpoint,
  type SessionVideoAsset,
} from '../../services/ai';
import { mockActivityGroups } from '../groups/mockActivityGroups';
import { mockSessions } from './mockSessions';

import type { AnalysisResult, Session } from '../../types';

const SESSION_STORAGE_KEY = 'action-sports-journal:sessions:v1';

type PersistedSessionState = {
  selectedGroupId?: string;
  sessions?: Session[];
  videosBySessionId?: Record<string, SessionVideoAsset>;
  analysisBySessionId?: Record<string, AnalysisResult>;
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
  const [analyzingSessionId, setAnalyzingSessionId] = useState<string | null>(
    null,
  );
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
      } catch {
        Alert.alert(
          '저장된 세션을 불러오지 못했습니다',
          '앱은 기본 세션 데이터로 계속 실행됩니다.',
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
    };

    AsyncStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify(persistedState),
    ).catch(() => {
      Alert.alert(
        '세션 저장에 실패했습니다',
        '앱을 종료하면 방금 추가한 내용이 남지 않을 수 있습니다.',
      );
    });
  }, [analysisBySessionId, isStorageLoaded, selectedGroupId, sessions, videosBySessionId]);

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
    (analysis) => analysis.status === 'completed',
  ).length;
  const canRequestRemoteAnalysis = hasConfiguredAnalysisEndpoint();

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
        '세션 영상을 선택하려면 사진 보관함 접근을 허용해주세요.',
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
      Alert.alert('영상이 필요합니다', 'AI 체크 전에 영상을 먼저 연결해주세요.');
      return;
    }

    const group =
      mockActivityGroups.find((item) => item.id === session.activityGroupId) ??
      selectedGroup;

    try {
      setAnalyzingSessionId(session.id);
      const analysis = await analyzeSessionVideo({
        session,
        activityGroupName: group?.name ?? 'Activity',
        video,
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
            <Text style={styles.title}>오늘의 세션을 남기고, 영상을 체크하세요.</Text>
            <Text style={styles.subtitle}>
              웨이크보드, 스노보드, 스케이트보드 기록을 세션 중심으로 모아봅니다.
            </Text>
            <View style={styles.metricRow}>
              <MetricItem label="세션" value={sessions.length} />
              <MetricItem label="영상" value={attachedVideoCount} />
              <MetricItem label="AI 체크" value={completedAnalysisCount} />
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionLabel}>종목</Text>
              <Text style={styles.sectionHint}>오늘의 포커스</Text>
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
                <Text style={styles.sectionLabel}>세션 피드</Text>
                <Text style={styles.contextText}>
                  {selectedGroup?.name ?? '선택된 종목 없음'} ·{' '}
                  {visibleSessions.length}개 세션
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => setIsComposerOpen((current) => !current)}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed ? styles.buttonPressed : undefined,
                ]}
              >
                <Text style={styles.secondaryButtonText}>
                  {isComposerOpen ? '닫기' : '세션 추가'}
                </Text>
              </Pressable>
            </View>

            {isComposerOpen ? (
              <View style={styles.composer}>
                <TextInput
                  placeholder="세션 제목"
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
                    영상을 선택하면 AI 체크 흐름을 바로 확인할 수 있습니다.
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
                    세션 저장
                  </Text>
                </Pressable>
                <Text style={styles.helperText}>세션 제목은 필수입니다.</Text>
              </View>
            ) : null}

            {visibleSessions.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>아직 세션이 없습니다</Text>
                  <Text style={styles.emptyText}>
                    새 세션을 추가해서 종목별 기록 흐름을 확인해보세요.
                  </Text>
                </View>
            ) : (
              visibleSessions.map((item) => (
                <View key={item.id} style={styles.sessionRow}>
                  <View style={styles.sessionMeta}>
                    <Text style={styles.sessionTitle}>{item.title}</Text>
                    <Text style={styles.sessionDate}>
                      {new Date(item.occurredAt).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                  {item.notes ? (
                    <Text style={styles.sessionNotes}>{item.notes}</Text>
                  ) : null}
                  <View style={styles.statusRow}>
                    <StatusPill
                      active={Boolean(item.videoUri)}
                      label={item.videoUri ? '영상 있음' : '영상 없음'}
                    />
                    <StatusPill
                      active={analysisBySessionId[item.id]?.status === 'completed'}
                      label={
                        analysisBySessionId[item.id]?.status === 'completed'
                          ? '체크 완료'
                          : 'AI 대기'
                      }
                    />
                  </View>
                  <View style={styles.analysisPanel}>
                    {!canRequestRemoteAnalysis ? (
                      <Text style={styles.analysisLabel}>
                        서버 분석 엔드포인트가 연결되면 AI 체크를 사용할 수 있습니다.
                      </Text>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      disabled={
                        !item.videoUri ||
                        !canRequestRemoteAnalysis ||
                        analyzingSessionId === item.id
                      }
                      onPress={() => handleAnalyzeSession(item)}
                      style={({ pressed }) => [
                        styles.analysisButton,
                        !item.videoUri ||
                        !canRequestRemoteAnalysis ||
                        analyzingSessionId === item.id
                          ? styles.analysisButtonDisabled
                          : undefined,
                        pressed ? styles.buttonPressed : undefined,
                      ]}
                    >
                      <Text style={styles.analysisButtonText}>
                        {analyzingSessionId === item.id
                          ? '분석 중...'
                          : 'AI 체크하기'}
                      </Text>
                    </Pressable>
                    {analysisBySessionId[item.id] ? (
                      <AnalysisResultView result={analysisBySessionId[item.id]} />
                    ) : null}
                  </View>
                </View>
              ))
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
    paddingBottom: 40,
    paddingHorizontal: 18,
  },
  header: {
    backgroundColor: '#101828',
    borderRadius: 24,
    marginTop: 10,
    marginBottom: 18,
    overflow: 'hidden',
    padding: 22,
  },
  kicker: {
    color: '#5eead4',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  title: {
    color: '#f8fafc',
    fontSize: 32,
    fontWeight: '900',
    lineHeight: 37,
  },
  subtitle: {
    color: '#cbd5e1',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  metricItem: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  metricValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
  },
  metricLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionLabel: {
    color: '#0f172a',
    fontSize: 19,
    fontWeight: '900',
  },
  sectionHint: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  groupRow: {
    gap: 12,
    paddingBottom: 4,
  },
  groupChip: {
    backgroundColor: '#fff',
    borderColor: '#dbe4ee',
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 100,
    paddingHorizontal: 16,
    paddingVertical: 14,
    width: 178,
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
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 6,
  },
  groupChipTitleSelected: {
    color: '#f8fafc',
  },
  groupChipMeta: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 18,
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
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 16,
    padding: 16,
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
    minHeight: 90,
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
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 12,
    padding: 16,
  },
  sessionMeta: {
    marginBottom: 6,
  },
  sessionTitle: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 4,
  },
  sessionDate: {
    color: '#64748b',
    fontSize: 12,
  },
  sessionNotes: {
    color: '#334155',
    fontSize: 14,
    lineHeight: 20,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
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
    marginTop: 12,
    paddingTop: 12,
  },
  analysisLabel: {
    color: '#64748b',
    fontSize: 12,
    marginBottom: 8,
  },
  analysisButton: {
    alignItems: 'center',
    backgroundColor: '#0f766e',
    borderRadius: 14,
    paddingVertical: 11,
  },
  analysisButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  analysisButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  analysisResult: {
    backgroundColor: '#f0fdfa',
    borderColor: '#99f6e4',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 10,
    padding: 12,
  },
  analysisResultTitle: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  analysisResultText: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 8,
  },
  analysisResultListItem: {
    color: '#475569',
    fontSize: 12,
    lineHeight: 18,
  },
  highlightScene: {
    backgroundColor: '#fff',
    borderColor: '#99f6e4',
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    overflow: 'hidden',
  },
  highlightImage: {
    backgroundColor: '#ccfbf1',
    height: 140,
    width: '100%',
  },
  highlightBody: {
    padding: 12,
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

function MetricItem({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metricItem}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
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

function AnalysisResultView({ result }: { result: AnalysisResult }) {
  return (
    <View style={styles.analysisResult}>
      <Text style={styles.analysisResultTitle}>
        {result.status === 'failed' ? '분석 실패' : 'AI 체크 결과'}
      </Text>
      <Text style={styles.analysisResultText}>{result.summary}</Text>
      {result.highlightScenes?.map((scene) => (
        <View key={scene.id} style={styles.highlightScene}>
          {scene.imageUri ? (
            <Image source={{ uri: scene.imageUri }} style={styles.highlightImage} />
          ) : null}
          <View style={styles.highlightBody}>
            <Text style={styles.highlightMeta}>{scene.timestampLabel}</Text>
            <Text style={styles.highlightTitle}>{scene.title}</Text>
            <Text style={styles.highlightDescription}>{scene.description}</Text>
          </View>
        </View>
      ))}
      {result.highlights.map((highlight) => (
        <Text key={highlight} style={styles.analysisResultListItem}>
          - {highlight}
        </Text>
      ))}
      {result.suggestions.map((suggestion) => (
        <Text key={suggestion} style={styles.analysisResultListItem}>
          - {suggestion}
        </Text>
      ))}
    </View>
  );
}
