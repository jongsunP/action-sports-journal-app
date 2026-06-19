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

import {
  getMomentStatusLabel,
  getMomentStatusMessage,
  getVisibleMomentStatus,
} from './momentStatus';

import type { SessionVideoAsset } from '../../services/ai';
import type { GeminiEvidenceResult, MomentStatus, Session } from '../../types';

type HomeScreenStyles = Record<string, object>;

export type AppTabId = 'home' | 'video' | 'flow' | 'profile';

export const APP_TABS: Array<{
  id: AppTabId;
  label: string;
  hint: string;
}> = [
  { id: 'home', label: '홈', hint: '대시보드' },
  { id: 'video', label: '영상', hint: '아카이브' },
  { id: 'flow', label: '흐름', hint: '진행' },
  { id: 'profile', label: '개인정보', hint: '설정' },
];

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

export function BottomNavigation({
  activeTab,
  isDarkMode,
  onChangeTab,
  styles,
}: {
  activeTab: AppTabId;
  isDarkMode: boolean;
  onChangeTab: (tab: AppTabId) => void;
  styles: HomeScreenStyles;
}) {
  return (
    <View
      style={[
        styles.bottomTabBar,
        isDarkMode ? styles.bottomTabBarDark : undefined,
      ]}
    >
      {APP_TABS.map((tab) => {
        const isSelected = activeTab === tab.id;

        return (
          <Pressable
            accessibilityLabel={tab.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            key={tab.id}
            onPress={() => onChangeTab(tab.id)}
            style={({ pressed }) => [
              styles.bottomTabItem,
              isSelected ? styles.bottomTabItemSelected : undefined,
              isSelected && isDarkMode
                ? styles.bottomTabItemSelectedDark
                : undefined,
              pressed ? styles.buttonPressed : undefined,
            ]}
          >
            <BottomTabIcon id={tab.id} isSelected={isSelected} styles={styles} />
          </Pressable>
        );
      })}
    </View>
  );
}

function BottomTabIcon({
  id,
  isSelected,
  styles,
}: {
  id: AppTabId;
  isSelected: boolean;
  styles: HomeScreenStyles;
}) {
  if (id === 'home') {
    return (
      <View
        style={[
          styles.bottomTabIconFrame,
          isSelected ? styles.bottomTabIconFrameSelected : undefined,
        ]}
      >
        <View
          style={[
            styles.tabIconHome,
            isSelected ? styles.tabIconFilled : undefined,
          ]}
        />
      </View>
    );
  }

  if (id === 'video') {
    return (
      <View
        style={[
          styles.bottomTabIconFrame,
          isSelected ? styles.bottomTabIconFrameSelected : undefined,
        ]}
      >
        <View
          style={[
            styles.tabIconVideo,
            isSelected ? styles.tabIconFilled : undefined,
          ]}
        />
      </View>
    );
  }

  if (id === 'flow') {
    return (
      <View
        style={[
          styles.bottomTabIconFrame,
          styles.tabIconFlowFrame,
          isSelected ? styles.bottomTabIconFrameSelected : undefined,
        ]}
      >
        {[0, 1, 2].map((index) => (
          <View
            key={`flow-${index}`}
            style={[
              styles.tabIconFlowDot,
              isSelected ? styles.tabIconFilled : undefined,
            ]}
          />
        ))}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.bottomTabIconFrame,
        isSelected ? styles.bottomTabIconFrameSelected : undefined,
      ]}
    >
      <View
        style={[
          styles.tabIconProfileHead,
          isSelected ? styles.tabIconFilled : undefined,
        ]}
      />
      <View
        style={[
          styles.tabIconProfileBody,
          isSelected ? styles.tabIconFilled : undefined,
        ]}
      />
    </View>
  );
}

export function FlowPlaceholderTab({
  kicker,
  styles,
}: {
  kicker: string;
  styles: HomeScreenStyles;
}) {
  return (
    <>
      <View style={styles.tabPageHeader}>
        <Text style={styles.kicker}>{kicker}</Text>
        <Text style={styles.title}>흐름</Text>
        <Text style={styles.headerMeta}>Progression / Flow 준비 중</Text>
      </View>
      <View style={styles.placeholderCard}>
        <Text style={styles.placeholderTitle}>Progression Layer</Text>
        <Text style={styles.placeholderText}>
          반복된 세션과 분석 결과가 충분히 쌓이면 연습 흐름, 검토 후보, 다음
          연습 포인트를 이곳에서 보여줄 예정입니다.
        </Text>
      </View>
    </>
  );
}

export function ProfilePlaceholderTab({ styles }: { styles: HomeScreenStyles }) {
  return (
    <>
      <View style={styles.tabPageHeader}>
        <Text style={styles.kicker}>Action Sports Journal</Text>
        <Text style={styles.title}>개인정보</Text>
        <Text style={styles.headerMeta}>계정과 설정 진입점</Text>
      </View>
      <View style={styles.placeholderCard}>
        <Text style={styles.placeholderTitle}>마이페이지</Text>
        <Text style={styles.placeholderText}>
          ActivityGroup, 계정, 개인정보, 앱 설정은 이후 단계에서 이 탭에
          정리합니다. 현재는 실사용 QA를 위한 정보 구조만 준비합니다.
        </Text>
      </View>
    </>
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

export function PrimaryInsightCard({
  formatShortSessionDate,
  onOpenSession,
  summary,
  styles,
}: {
  formatShortSessionDate: (value: string) => string;
  onOpenSession: (session: Session) => void;
  summary?: SessionSummary;
  styles: HomeScreenStyles;
}) {
  return (
    <View style={styles.primaryInsightCard}>
      <Text style={styles.cardEyebrow}>오늘의 인사이트</Text>
      {summary?.completedEvidence ? (
        <>
          <Text style={styles.primaryInsightTitle}>
            {getInsightTitle(summary.completedEvidence)}
          </Text>
          <Text style={styles.primaryInsightText}>
            {getInsightSummary(summary.completedEvidence)}
          </Text>
          {summary.completedEvidence.candidateTrace ? (
            <Text style={styles.primaryInsightReview}>
              검토 후보:{' '}
              {summary.completedEvidence.candidateTrace.displayLabel ??
                summary.completedEvidence.candidateTrace.safePredictedTrick}
            </Text>
          ) : null}
          <View style={styles.primaryInsightFooter}>
            <MomentStatusDot status={summary.momentStatus ?? 'completed'} />
            <Text style={styles.primaryInsightDate}>
              {formatShortSessionDate(summary.session.occurredAt)}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => onOpenSession(summary.session)}
            style={({ pressed }) => [
              styles.textLinkButton,
              pressed ? styles.buttonPressed : undefined,
            ]}
          >
            <Text style={styles.textLinkButtonText}>자세히 보기</Text>
          </Pressable>
        </>
      ) : summary ? (
        <>
          <Text style={styles.primaryInsightTitle}>
            {summary.momentStatus === 'failed'
              ? '분석을 다시 시도할 수 있습니다'
              : '최근 세션을 분석하고 있습니다'}
          </Text>
          <Text style={styles.primaryInsightText}>
            {summary.momentStatus
              ? getMomentStatusMessage(summary.momentStatus).body
              : '영상 근거가 준비되면 이곳에 요약이 표시됩니다.'}
          </Text>
          <View style={styles.primaryInsightFooter}>
            <MomentStatusDot status={summary.momentStatus} />
            <Text style={styles.primaryInsightDate}>
              {formatShortSessionDate(summary.session.occurredAt)}
            </Text>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.primaryInsightTitle}>
            분석 결과가 여기에 표시됩니다
          </Text>
          <Text style={styles.primaryInsightText}>
            상단 업로드 버튼으로 라이딩 영상을 추가하면 세션별 동작 근거와
            보수적인 요약을 이곳에 표시합니다.
          </Text>
        </>
      )}
    </View>
  );
}

export function JournalTimeline({
  formatTimelineDay,
  formatTimelineMonth,
  onOpenSession,
  sessions,
  styles,
}: {
  formatTimelineDay: (value: string) => string;
  formatTimelineMonth: (value: string) => string;
  onOpenSession: (session: Session) => void;
  sessions: SessionSummary[];
  styles: HomeScreenStyles;
}) {
  return (
    <View style={styles.timeline}>
      {sessions.length === 0 ? (
        <View style={styles.timelineEmpty}>
          <Text style={styles.emptyTitle}>기록이 비어 있습니다</Text>
          <Text style={styles.emptyText}>
            분석 결과와 세션 메모가 시간순으로 쌓입니다.
          </Text>
        </View>
      ) : (
        sessions.map(({ card, completedEvidence, momentStatus, session }) => (
          <Pressable
            accessibilityRole="button"
            key={session.id}
            onPress={() => onOpenSession(session)}
            style={({ pressed }) => [
              styles.timelineRow,
              pressed ? styles.sessionRowPressed : undefined,
            ]}
          >
            <View style={styles.timelineDateBlock}>
              <Text style={styles.timelineMonth}>
                {formatTimelineMonth(session.occurredAt)}
              </Text>
              <Text style={styles.timelineDay}>
                {formatTimelineDay(session.occurredAt)}
              </Text>
            </View>
            <View style={styles.timelineBody}>
              <View style={styles.timelineTopRow}>
                <Text style={styles.timelineTitle} numberOfLines={1}>
                  {card.momentTitle}
                </Text>
                <MomentStatusDot status={momentStatus} />
              </View>
              <Text style={styles.timelineSummary} numberOfLines={2}>
                {completedEvidence
                  ? getTimelineSummary(completedEvidence)
                  : card.reason}
              </Text>
            </View>
          </Pressable>
        ))
      )}
    </View>
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

function getInsightTitle(evidence: GeminiEvidenceResult) {
  if (evidence.candidateTrace?.displayLabel) {
    return evidence.candidateTrace.displayLabel;
  }

  if (evidence.primaryCandidate.name !== '확인 필요') {
    return evidence.primaryCandidate.name;
  }

  return evidence.family.value || '분석 결과 확인';
}

function getInsightSummary(evidence: GeminiEvidenceResult) {
  if (evidence.requiresUserConfirmation || evidence.consistencyStatus === 'needs_review') {
    return 'AI가 일부 근거를 확신하지 못했습니다. 상세 화면에서 후보와 관찰 신호를 확인해 주세요.';
  }

  return compactCardText(
    evidence.primaryCandidate.evidence ??
      evidence.evidence ??
      '분석 결과가 준비됐습니다.',
    118,
  );
}

function getTimelineSummary(evidence: GeminiEvidenceResult) {
  if (evidence.candidateTrace?.displayLabel) {
    return `검토 후보: ${evidence.candidateTrace.displayLabel}`;
  }

  if (evidence.requiresUserConfirmation || evidence.consistencyStatus === 'needs_review') {
    return '상세 확인이 필요한 분석 결과입니다.';
  }

  return compactCardText(evidence.evidence, 86);
}

function compactCardText(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, ' ').trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
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
