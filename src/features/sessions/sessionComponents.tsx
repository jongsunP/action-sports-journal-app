import { useState, type RefObject } from 'react';
import { useEventListener } from 'expo';
import {
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

import { getMomentStatusLabel, getVisibleMomentStatus } from './momentStatus';

import type { SessionVideoAsset } from '../../services/ai';
import type { GeminiEvidenceResult, MomentStatus, Session } from '../../types';

type HomeScreenStyles = Record<string, object>;

type SessionSummary = {
  card: {
    momentTitle: string;
    reason: string;
    thumbnailUri?: string;
  };
  completedEvidence?: GeminiEvidenceResult;
  momentStatus?: MomentStatus;
  session: Session;
};

export function MomentStatusDot({ status }: { status?: MomentStatus }) {
  if (!status) {
    return null;
  }

  return (
    <View
      accessibilityLabel={getMomentStatusLabel(status)}
      style={[statusDotStyles.dot, getMomentStatusDotStyle(status)]}
    />
  );
}

export function RecentSessionsRail({
  formatShortSessionDate,
  onOpenSession,
  sessions,
  styles,
}: {
  formatShortSessionDate: (value: string) => string;
  onOpenSession: (session: Session) => void;
  sessions: SessionSummary[];
  styles: HomeScreenStyles;
}) {
  if (sessions.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>아직 세션이 없습니다</Text>
        <Text style={styles.emptyText}>
          첫 영상을 추가하면 최근 세션이 이곳에 표시됩니다.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      contentContainerStyle={styles.recentRail}
      showsHorizontalScrollIndicator={false}
    >
      {sessions.map(({ card, momentStatus, session }) => (
        <Pressable
          accessibilityRole="button"
          key={session.id}
          onPress={() => onOpenSession(session)}
          style={({ pressed }) => [
            styles.recentSessionCard,
            pressed ? styles.sessionRowPressed : undefined,
          ]}
        >
          <View style={styles.recentPreview}>
            {card.thumbnailUri ? (
              <Image
                source={{ uri: card.thumbnailUri }}
                style={styles.recentThumbImage}
              />
            ) : (
              <View style={styles.recentThumbFallback}>
                <Text style={styles.recentThumbFallbackText}>
                  {session.videoUri ? 'CLIP' : 'NOTE'}
                </Text>
              </View>
            )}
            <View style={styles.mediaStatusDotOverlay}>
              <MomentStatusDot status={momentStatus} />
            </View>
          </View>
          <View style={styles.recentFloatingMetaRow}>
            <Text style={styles.recentDate}>
              {formatShortSessionDate(session.occurredAt)}
            </Text>
          </View>
          <Text style={styles.recentTitle} numberOfLines={1}>
            {session.title}
          </Text>
          {session.notes ? (
            <Text style={styles.recentSummary} numberOfLines={2}>
              {session.notes}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function VideoArchiveList({
  formatShortSessionDate,
  getVideoArchiveDescription,
  onOpenSession,
  sessions,
  styles,
}: {
  formatShortSessionDate: (value: string) => string;
  getVideoArchiveDescription: (session: Session) => string;
  onOpenSession: (session: Session) => void;
  sessions: SessionSummary[];
  styles: HomeScreenStyles;
}) {
  if (sessions.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>아직 영상 세션이 없습니다</Text>
        <Text style={styles.emptyText}>
          홈에서 새 분석을 시작하면 영상 세션이 이곳에 모입니다.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.videoArchiveList}>
      {sessions.map(({ card, momentStatus, session }) => (
        <Pressable
          accessibilityRole="button"
          key={session.id}
          onPress={() => onOpenSession(session)}
          style={({ pressed }) => [
            styles.videoArchiveRow,
            pressed ? styles.sessionRowPressed : undefined,
          ]}
        >
          <View style={styles.videoArchiveThumb}>
            {card.thumbnailUri ? (
              <Image
                source={{ uri: card.thumbnailUri }}
                style={styles.recentThumbImage}
              />
            ) : (
              <View style={styles.recentThumbFallback}>
                <Text style={styles.recentThumbFallbackText}>
                  {session.videoUri ? 'CLIP' : 'NOTE'}
                </Text>
              </View>
            )}
            <View style={styles.mediaStatusDotOverlay}>
              <MomentStatusDot status={momentStatus} />
            </View>
          </View>
          <View style={styles.videoArchiveBody}>
            <View style={styles.videoArchiveMetaRow}>
              <Text style={styles.recentDate}>
                {formatShortSessionDate(session.occurredAt)}
              </Text>
            </View>
            <Text style={styles.timelineTitle} numberOfLines={1}>
              {session.title}
            </Text>
            <Text style={styles.videoArchiveDescription} numberOfLines={2}>
              {session.notes ?? getVideoArchiveDescription(session)}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

export function UploadSheet({
  canUploadSession,
  formatVideoMeta,
  isOpen,
  notes,
  onClose,
  onPickVideo,
  onSubmit,
  selectedVideo,
  setNotes,
  setTitle,
  styles,
  title,
  titleInputRef,
  translateY,
}: {
  canUploadSession: boolean;
  formatVideoMeta: (video: SessionVideoAsset) => string;
  isOpen: boolean;
  notes: string;
  onClose: () => void;
  onPickVideo: () => void;
  onSubmit: () => void;
  selectedVideo: SessionVideoAsset | null;
  setNotes: (value: string) => void;
  setTitle: (value: string) => void;
  styles: HomeScreenStyles;
  title: string;
  titleInputRef: RefObject<TextInput | null>;
  translateY: Animated.Value;
}) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={isOpen}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.uploadSheetKeyboardView}
      >
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={styles.uploadSheetBackdrop}
        >
          <Animated.View
            style={[
              styles.uploadSheet,
              {
                transform: [
                  {
                    translateY: translateY.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 520],
                    }),
                  },
                ],
              },
            ]}
          >
            <Pressable
              accessibilityRole="none"
              onPress={(event) => event.stopPropagation()}
              style={styles.uploadSheetContent}
            >
              <View style={styles.uploadSheetPaddedSection}>
                <View style={styles.uploadSheetHandle} />
                <View style={styles.uploadSheetHeader}>
                  <View style={styles.uploadSheetTitleBlock}>
                    <Text style={styles.uploadSheetTitle}>영상 업로드</Text>
                    <Text style={styles.uploadSheetDescription}>
                      라이딩 영상을 AI로 분석합니다.
                    </Text>
                  </View>
                  <View style={styles.uploadSheetActions}>
                    <Pressable
                      accessibilityLabel="영상 다시 선택"
                      accessibilityRole="button"
                      onPress={onPickVideo}
                      style={({ pressed }) => [
                        styles.uploadSheetActionButton,
                        styles.uploadSheetReselectButton,
                        pressed ? styles.buttonPressed : undefined,
                      ]}
                    >
                      <Text
                        style={[
                          styles.uploadSheetActionText,
                          styles.uploadSheetReselectText,
                        ]}
                      >
                        ↻
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel="업로드 실행"
                      accessibilityRole="button"
                      disabled={!canUploadSession}
                      onPress={onSubmit}
                      style={({ pressed }) => [
                        styles.uploadSheetActionButton,
                        styles.uploadSheetSubmitButton,
                        !canUploadSession
                          ? styles.uploadSheetSubmitButtonDisabled
                          : undefined,
                        pressed ? styles.buttonPressed : undefined,
                      ]}
                    >
                      <Text
                        style={[
                          styles.uploadSheetActionText,
                          !canUploadSession
                            ? styles.uploadSheetSubmitTextDisabled
                            : undefined,
                        ]}
                      >
                        ↑
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
              {selectedVideo ? (
                <>
                  <LocalUploadVideoPreview
                    key={selectedVideo.uri}
                    styles={styles}
                    videoUri={selectedVideo.uri}
                  />
                  <View
                    style={[
                      styles.uploadSheetPaddedSection,
                      styles.selectedVideoInfo,
                    ]}
                  >
                    <Text style={styles.selectedVideoLabel}>선택된 영상</Text>
                    <Text style={styles.selectedVideoTitle} numberOfLines={1}>
                      {selectedVideo.fileName ?? '선택한 영상'}
                    </Text>
                    <Text style={styles.selectedVideoMeta}>
                      {formatVideoMeta(selectedVideo)}
                    </Text>
                  </View>
                </>
              ) : null}
              <View
                style={[
                  styles.uploadSheetPaddedSection,
                  styles.uploadFormFields,
                ]}
              >
                <TextInput
                  onBlur={() => Keyboard.dismiss()}
                  placeholder="어떤 영상인가요?"
                  placeholderTextColor="#94a3b8"
                  ref={titleInputRef}
                  style={styles.input}
                  value={title}
                  onChangeText={setTitle}
                />
                <TextInput
                  multiline
                  onBlur={() => Keyboard.dismiss()}
                  placeholder="짧은 느낌 남기기"
                  placeholderTextColor="#94a3b8"
                  style={[styles.input, styles.textArea, styles.uploadNotesInput]}
                  value={notes}
                  onChangeText={setNotes}
                />
              </View>
            </Pressable>
          </Animated.View>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function LocalUploadVideoPreview({
  styles,
  videoUri,
}: {
  styles: HomeScreenStyles;
  videoUri: string;
}) {
  const [hasPlaybackError, setHasPlaybackError] = useState(false);
  const player = useVideoPlayer(videoUri);

  useEventListener(player, 'statusChange', ({ status, error }) => {
    if (status === 'error' || error) {
      setHasPlaybackError(true);
    }
  });

  if (hasPlaybackError) {
    return null;
  }

  return (
    <View style={styles.uploadVideoPreviewFrame}>
      <VideoView
        contentFit="cover"
        nativeControls
        player={player}
        style={styles.uploadVideoPreview}
      />
    </View>
  );
}

function getMomentStatusDotStyle(status?: MomentStatus) {
  const visibleStatus = getVisibleMomentStatus(status);

  if (visibleStatus === 'running') {
    return statusDotStyles.processing;
  }

  if (visibleStatus === 'completed') {
    return statusDotStyles.completed;
  }

  if (visibleStatus === 'failed') {
    return statusDotStyles.failed;
  }

  return undefined;
}

const statusDotStyles = StyleSheet.create({
  dot: {
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 999,
    borderWidth: 1,
    height: 9,
    width: 9,
  },
  processing: {
    backgroundColor: '#facc15',
  },
  completed: {
    backgroundColor: '#03c75a',
  },
  failed: {
    backgroundColor: '#fb7185',
  },
});
