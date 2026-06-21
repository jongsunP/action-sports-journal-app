import { useState } from 'react';
import { useEventListener } from 'expo';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
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

export type AppTabId = 'home' | 'video' | 'flow';

export const APP_TABS: Array<{
  id: AppTabId;
  label: string;
  hint: string;
}> = [
  { id: 'home', label: '홈', hint: '대시보드' },
  { id: 'video', label: '영상', hint: '아카이브' },
  { id: 'flow', label: '성장', hint: '진행' },
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

  return null;
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
        <Text style={styles.title}>성장</Text>
        <Text style={styles.headerMeta}>Progression 준비 중</Text>
      </View>
      <View style={styles.placeholderCard}>
        <Text style={styles.placeholderTitle}>Progression Layer</Text>
        <Text style={styles.placeholderText}>
          반복된 세션과 분석 결과가 충분히 쌓이면 성장 추이, 검토 후보, 다음
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
  isLoading = false,
  onOpenSession,
  sessions,
  styles,
}: {
  formatShortSessionDate: (value: string) => string;
  isLoading?: boolean;
  onOpenSession: (session: Session) => void;
  sessions: SessionSummary[];
  styles: HomeScreenStyles;
}) {
  if (sessions.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>
          {isLoading ? 'Wake Board Loading...' : '아직 세션이 없습니다'}
        </Text>
        <Text style={styles.emptyText}>
          {isLoading
            ? '라이딩 기록과 분석 결과를 준비하고 있습니다.'
            : '첫 영상을 추가하면 최근 세션이 이곳에 표시됩니다.'}
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
                resizeMode="cover"
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
            <Text style={styles.recentDate} numberOfLines={1}>
              {formatShortSessionDate(session.occurredAt)}
            </Text>
          </View>
          <Text style={styles.recentTitle} numberOfLines={1}>
            {card.momentTitle}
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
  isLoading = false,
  onOpenSession,
  summary,
  styles,
}: {
  formatShortSessionDate: (value: string) => string;
  isLoading?: boolean;
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
      ) : isLoading ? (
        <>
          <Text style={styles.primaryInsightTitle}>
            Wake Board Loading...
          </Text>
          <Text style={styles.primaryInsightText}>
            라이딩 기록과 분석 결과를 준비하고 있습니다.
          </Text>
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

export function VideoArchiveList({
  formatShortSessionDate,
  getVideoArchiveDescription,
  isLoading = false,
  onOpenSession,
  sessions,
  styles,
}: {
  formatShortSessionDate: (value: string) => string;
  getVideoArchiveDescription: (session: Session) => string;
  isLoading?: boolean;
  onOpenSession: (session: Session) => void;
  sessions: SessionSummary[];
  styles: HomeScreenStyles;
}) {
  if (sessions.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>
          {isLoading ? 'Wake Board Loading...' : '아직 영상 세션이 없습니다'}
        </Text>
        <Text style={styles.emptyText}>
          {isLoading
            ? '라이딩 기록과 분석 결과를 준비하고 있습니다.'
            : '홈에서 새 분석을 시작하면 영상 세션이 이곳에 모입니다.'}
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
                resizeMode="cover"
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
              <Text style={styles.recentDate} numberOfLines={1}>
                {formatShortSessionDate(session.occurredAt)}
              </Text>
            </View>
            <Text style={styles.timelineTitle} numberOfLines={1}>
              {card.momentTitle}
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
  isPreparingThumbnail,
  isSubmitting,
  onClose,
  onPickVideo,
  onSubmit,
  selectedVideo,
  styles,
}: {
  canUploadSession: boolean;
  formatVideoMeta: (video: SessionVideoAsset) => string;
  isOpen: boolean;
  isPreparingThumbnail: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onPickVideo: () => void;
  onSubmit: () => void;
  selectedVideo: SessionVideoAsset | null;
  styles: HomeScreenStyles;
}) {
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      visible={isOpen}
    >
      <SafeAreaView style={styles.uploadSheetBackdrop}>
        <View style={styles.uploadSheet}>
          <View style={styles.uploadSheetPaddedSection}>
            <View style={styles.uploadSheetHeader}>
              <Pressable
                accessibilityLabel="업로드 화면 닫기"
                accessibilityRole="button"
                disabled={isSubmitting}
                onPress={onClose}
                style={({ pressed }) => [
                  styles.headerMenuButton,
                  isSubmitting ? styles.uploadSheetSubmitButtonDisabled : undefined,
                  pressed ? styles.buttonPressed : undefined,
                ]}
              >
                <Text style={styles.headerMenuText}>×</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={styles.uploadPageBody}
            showsVerticalScrollIndicator={false}
          >
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
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>선택된 영상이 없습니다</Text>
                <Text style={styles.emptyText}>영상을 다시 선택해주세요.</Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.uploadPageFooter}>
            <Text style={styles.uploadAiNotice}>
              업로드가 끝나면 AI 분석을 시작합니다. 업로드가 끝날 때까지 앱을 닫지 않는 것이 안전합니다.
            </Text>
            {isSubmitting ? (
              <View style={styles.uploadSubmittingPanel}>
                <Text style={styles.uploadSubmittingTitle}>
                  영상을 서버에 업로드하고 있습니다.
                </Text>
                <Text style={styles.uploadSubmittingHint}>
                  업로드가 완료되면 분석은 서버에서 계속됩니다.
                </Text>
              </View>
            ) : isPreparingThumbnail ? (
              <Text style={styles.uploadSubmittingHint}>
                썸네일을 준비하고 있습니다.
              </Text>
            ) : null}
            <View style={styles.uploadPageFooterActions}>
              <Pressable
                accessibilityLabel="영상 바꾸기"
                accessibilityRole="button"
                disabled={isSubmitting}
                onPress={onPickVideo}
                style={({ pressed }) => [
                  styles.uploadPageSecondaryButton,
                  isSubmitting ? styles.uploadSheetSubmitButtonDisabled : undefined,
                  pressed ? styles.buttonPressed : undefined,
                ]}
              >
                <Text style={styles.uploadPageSecondaryText}>영상 바꾸기</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="업로드 실행"
                accessibilityRole="button"
                disabled={!canUploadSession || isSubmitting || isPreparingThumbnail}
                onPress={onSubmit}
                style={({ pressed }) => [
                  styles.uploadPagePrimaryButton,
                  !canUploadSession || isSubmitting || isPreparingThumbnail
                    ? styles.uploadSheetSubmitButtonDisabled
                    : undefined,
                  pressed ? styles.buttonPressed : undefined,
                ]}
              >
                <Text
                  style={[
                    styles.uploadPagePrimaryText,
                    !canUploadSession || isSubmitting || isPreparingThumbnail
                      ? styles.uploadSheetSubmitTextDisabled
                      : undefined,
                  ]}
                >
                  {isSubmitting
                    ? '업로드 중...'
                    : isPreparingThumbnail
                      ? '준비 중...'
                      : '업로드'}
                </Text>
              </Pressable>
            </View>
          </View>
          {isSubmitting ? (
            <View
              accessibilityRole="progressbar"
              style={styles.uploadBlockingOverlay}
            >
              <View style={styles.uploadBlockingCard}>
                <ActivityIndicator color="#f8fafc" size="large" />
                <Text style={styles.uploadBlockingTitle}>
                  영상을 업로드하고 있습니다.
                </Text>
                <Text style={styles.uploadBlockingText}>
                  업로드가 끝날 때까지 앱을 닫지 않는 것이 안전합니다.
                </Text>
                <Text style={styles.uploadBlockingText}>
                  업로드가 완료되면 분석은 서버에서 계속됩니다.
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      </SafeAreaView>
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
