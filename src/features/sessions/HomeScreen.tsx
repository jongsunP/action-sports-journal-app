import { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Keyboard,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { analyzeSessionVideo, type SessionVideoAsset } from '../../services/ai';
import { mockActivityGroups } from '../groups/mockActivityGroups';
import { mockSessions } from './mockSessions';

import type { AnalysisResult, Session } from '../../types';

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
        'Permission required',
        'Please allow photo library access to select a session video.',
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
      Alert.alert('Video required', 'Please choose a video for analysis.');
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
      Alert.alert('Video required', 'Attach a video before requesting analysis.');
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
        error instanceof Error ? error.message : 'The analysis request failed.';

      setAnalysisBySessionId((current) => ({
        ...current,
        [session.id]: {
          id: `analysis-error-${Date.now()}`,
          sessionId: session.id,
          status: 'failed',
          summary: message,
          highlights: [],
          suggestions: ['Check the analysis endpoint and try again.'],
          createdAt: new Date().toISOString(),
        },
      }));
    } finally {
      setAnalyzingSessionId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.kicker}>Action Sports Journal</Text>
        <Text style={styles.title}>ActivityGroup / Session Prototype</Text>
        <Text style={styles.subtitle}>
          Local-only data for testing the core flow before any persistence work.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Activity Groups</Text>
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
          <Text style={styles.sectionLabel}>Sessions</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setIsComposerOpen((current) => !current)}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed ? styles.buttonPressed : undefined,
            ]}
          >
            <Text style={styles.secondaryButtonText}>
              {isComposerOpen ? 'Close' : 'Add Session'}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.contextText}>
          {selectedGroup?.name ?? 'No group selected'} · {visibleSessions.length}{' '}
          sessions
        </Text>

        {isComposerOpen ? (
          <View style={styles.composer}>
            <TextInput
              placeholder="Session title"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={title}
              onChangeText={setTitle}
            />
            <TextInput
              multiline
              placeholder="Notes"
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
                {selectedVideo ? 'Change Video' : 'Select Video'}
              </Text>
            </Pressable>
            {selectedVideo ? (
              <Text style={styles.videoMeta}>
                {selectedVideo.fileName ?? 'Selected video'} ·{' '}
                {formatVideoMeta(selectedVideo)}
              </Text>
            ) : (
              <Text style={styles.helperText}>
                Add a video now to test the AI analysis flow.
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
              <Text style={styles.tertiaryButtonText}>Hide Keyboard</Text>
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
                  !canSaveSession ? styles.primaryButtonTextDisabled : undefined,
                ]}
              >
                Save Session
              </Text>
            </Pressable>
            <Text style={styles.helperText}>Title is required.</Text>
          </View>
        ) : null}

        <FlatList
          data={visibleSessions}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No sessions yet</Text>
              <Text style={styles.emptyText}>
                Add a local session to test the group-to-session flow.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.sessionRow}>
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
              <View style={styles.analysisPanel}>
                <Text style={styles.analysisLabel}>
                  {item.videoUri ? 'Video attached' : 'No video attached'}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={!item.videoUri || analyzingSessionId === item.id}
                  onPress={() => handleAnalyzeSession(item)}
                  style={({ pressed }) => [
                    styles.analysisButton,
                    !item.videoUri || analyzingSessionId === item.id
                      ? styles.analysisButtonDisabled
                      : undefined,
                    pressed ? styles.buttonPressed : undefined,
                  ]}
                >
                  <Text style={styles.analysisButtonText}>
                    {analyzingSessionId === item.id
                      ? 'Analyzing...'
                      : 'Request AI Check'}
                  </Text>
                </Pressable>
                {analysisBySessionId[item.id] ? (
                  <AnalysisResultView result={analysisBySessionId[item.id]} />
                ) : null}
              </View>
            </View>
          )}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 20,
  },
  header: {
    paddingTop: 12,
    paddingBottom: 20,
  },
  kicker: {
    color: '#0f766e',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  title: {
    color: '#0f172a',
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 36,
  },
  subtitle: {
    color: '#475569',
    fontSize: 15,
    lineHeight: 21,
    marginTop: 10,
  },
  section: {
    borderTopColor: '#e2e8f0',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 18,
    marginTop: 2,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionLabel: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '700',
  },
  groupRow: {
    gap: 12,
    paddingBottom: 4,
  },
  groupChip: {
    backgroundColor: '#fff',
    borderColor: '#dbe4ee',
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 92,
    paddingHorizontal: 14,
    paddingVertical: 12,
    width: 190,
  },
  groupChipSelected: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  groupChipPressed: {
    opacity: 0.85,
  },
  groupChipTitle: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '700',
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
    marginBottom: 12,
  },
  composer: {
    backgroundColor: '#fff',
    borderColor: '#dbe4ee',
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
    padding: 14,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderColor: '#dbe4ee',
    borderRadius: 10,
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
    borderRadius: 10,
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
    borderRadius: 10,
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
    backgroundColor: '#e2e8f0',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  secondaryButtonText: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '700',
  },
  tertiaryButton: {
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
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
    borderRadius: 12,
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
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
    padding: 14,
  },
  sessionMeta: {
    marginBottom: 6,
  },
  sessionTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '700',
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
    borderRadius: 10,
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
    backgroundColor: '#f8fafc',
    borderColor: '#dbe4ee',
    borderRadius: 10,
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

  return parts.length > 0 ? parts.join(' · ') : 'ready';
}

function AnalysisResultView({ result }: { result: AnalysisResult }) {
  return (
    <View style={styles.analysisResult}>
      <Text style={styles.analysisResultTitle}>
        {result.status === 'failed' ? 'Analysis failed' : 'AI check result'}
      </Text>
      <Text style={styles.analysisResultText}>{result.summary}</Text>
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
