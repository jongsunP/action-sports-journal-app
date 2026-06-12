import { useMemo, useState } from 'react';
import {
  FlatList,
  Keyboard,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { mockActivityGroups } from '../groups/mockActivityGroups';
import { mockSessions } from './mockSessions';

import type { Session } from '../../types';

export function HomeScreen() {
  const [selectedGroupId, setSelectedGroupId] = useState(
    mockActivityGroups[0]?.id ?? '',
  );
  const [sessions, setSessions] = useState<Session[]>(mockSessions);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');

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
      shareResultIds: [],
      createdAt: now,
      updatedAt: now,
    };

    setSessions((current) => [nextSession, ...current]);
    setTitle('');
    setNotes('');
    setIsComposerOpen(false);
    Keyboard.dismiss();
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
});
