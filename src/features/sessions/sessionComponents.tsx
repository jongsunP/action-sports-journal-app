import { useRef, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  FlatList,
  type GestureResponderEvent,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  getMomentStatusLabel,
  getMomentStatusMessage,
  getVisibleMomentStatus,
} from './momentStatus';
import { UploadContent } from './UploadContent';

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

const HORIZONTAL_PRESS_CANCEL_PX = 10;

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

function MomentStatusLabel({
  status,
  styles,
}: {
  status?: MomentStatus;
  styles: HomeScreenStyles;
}) {
  if (!status) {
    return null;
  }

  return (
    <Text style={styles.momentStatusLabel} numberOfLines={1}>
      {getMomentStatusLabel(status)}
    </Text>
  );
}

function SessionMediaPreview({
  hasVideo,
  styles,
  thumbnailUri,
}: {
  hasVideo: boolean;
  styles: HomeScreenStyles;
  thumbnailUri?: string;
}) {
  const [didImageFail, setDidImageFail] = useState(false);

  if (thumbnailUri && !didImageFail) {
    return (
      <Image
        onError={() => setDidImageFail(true)}
        resizeMode="cover"
        source={{ uri: thumbnailUri }}
        style={styles.recentThumbImage}
      />
    );
  }

  return (
    <View style={styles.recentThumbFallback}>
      <Text style={styles.recentThumbFallbackText}>
        {hasVideo ? 'CLIP' : 'NOTE'}
      </Text>
    </View>
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
            <SessionMediaPreview
              hasVideo={Boolean(session.videoUri)}
              styles={styles}
              thumbnailUri={card.thumbnailUri}
            />
            <View style={styles.mediaStatusDotOverlay}>
              <MomentStatusDot status={momentStatus} />
            </View>
          </View>
          <View style={styles.recentFloatingMetaRow}>
            <MomentStatusLabel status={momentStatus} styles={styles} />
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
  const visibleSummaryStatus = getVisibleMomentStatus(summary?.momentStatus);

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
            <MomentStatusLabel
              status={summary.momentStatus ?? 'completed'}
              styles={styles}
            />
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
            {visibleSummaryStatus === 'failed'
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
            <MomentStatusLabel status={summary.momentStatus} styles={styles} />
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
  hasMore = false,
  header,
  isLoading = false,
  isLoadingMore = false,
  onEndReached,
  onOpenSession,
  sessions,
  styles,
}: {
  formatShortSessionDate: (value: string) => string;
  getVideoArchiveDescription: (session: Session) => string;
  hasMore?: boolean;
  header?: ReactElement | null;
  isLoading?: boolean;
  isLoadingMore?: boolean;
  onEndReached?: () => void;
  onOpenSession: (session: Session) => void;
  sessions: SessionSummary[];
  styles: HomeScreenStyles;
}) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const hasUserScrolledRef = useRef(false);
  const shouldCancelPressRef = useRef(false);

  const handleRowTouchStart = (event: GestureResponderEvent) => {
    touchStartRef.current = {
      x: event.nativeEvent.pageX,
      y: event.nativeEvent.pageY,
    };
    shouldCancelPressRef.current = false;
  };

  const handleRowTouchMove = (event: GestureResponderEvent) => {
    const touchStart = touchStartRef.current;

    if (!touchStart) {
      return;
    }

    const dx = event.nativeEvent.pageX - touchStart.x;
    const dy = event.nativeEvent.pageY - touchStart.y;
    const horizontalDistance = Math.abs(dx);
    const verticalDistance = Math.abs(dy);

    if (
      horizontalDistance >= HORIZONTAL_PRESS_CANCEL_PX &&
      horizontalDistance > verticalDistance
    ) {
      shouldCancelPressRef.current = true;
    }
  };

  const handleRowPress = (session: Session) => {
    if (shouldCancelPressRef.current) {
      shouldCancelPressRef.current = false;
      return;
    }

    onOpenSession(session);
  };

  const handleEndReached = () => {
    if (!hasUserScrolledRef.current || !hasMore || isLoadingMore) {
      return;
    }

    onEndReached?.();
  };

  const handleMomentumScrollBegin = () => {
    hasUserScrolledRef.current = true;
  };

  const renderSessionRow = ({ item }: { item: SessionSummary }) => {
    const { card, momentStatus, session } = item;

    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => handleRowPress(session)}
        onTouchMove={handleRowTouchMove}
        onTouchStart={handleRowTouchStart}
        pressRetentionOffset={{ bottom: 4, left: 8, right: 8, top: 4 }}
        style={({ pressed }) => [
          styles.videoArchiveRow,
          pressed ? styles.sessionRowPressed : undefined,
        ]}
      >
        <View style={styles.videoArchiveThumb}>
          <SessionMediaPreview
            hasVideo={Boolean(session.videoUri)}
            styles={styles}
            thumbnailUri={card.thumbnailUri}
          />
          <View style={styles.mediaStatusDotOverlay}>
            <MomentStatusDot status={momentStatus} />
          </View>
        </View>
        <View style={styles.videoArchiveBody}>
          <View style={styles.videoArchiveMetaRow}>
            <MomentStatusLabel status={momentStatus} styles={styles} />
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
    );
  };

  return (
    <FlatList
      contentContainerStyle={styles.videoArchiveListContent}
      data={sessions}
      initialNumToRender={8}
      ItemSeparatorComponent={() => (
        <View style={styles.videoArchiveSeparator} />
      )}
      keyExtractor={({ session }) => session.id}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          {isLoading ? <ActivityIndicator color="#9ca3af" /> : null}
          <Text style={styles.emptyTitle}>
            {isLoading ? 'Wake Board Loading...' : '아직 영상 세션이 없습니다'}
          </Text>
          <Text style={styles.emptyText}>
            {isLoading
              ? '라이딩 기록과 분석 결과를 준비하고 있습니다.'
              : '홈에서 새 분석을 시작하면 영상 세션이 이곳에 모입니다.'}
          </Text>
        </View>
      }
      ListFooterComponent={
        isLoadingMore ? (
          <View style={styles.videoArchiveFooter}>
            <ActivityIndicator color="#9ca3af" />
          </View>
        ) : null
      }
      ListHeaderComponent={header}
      maxToRenderPerBatch={8}
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.25}
      onMomentumScrollBegin={handleMomentumScrollBegin}
      renderItem={renderSessionRow}
      showsVerticalScrollIndicator={false}
      updateCellsBatchingPeriod={80}
      windowSize={5}
    />
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
      <UploadContent
        canUploadSession={canUploadSession}
        formatVideoMeta={formatVideoMeta}
        isPreparingThumbnail={isPreparingThumbnail}
        isSubmitting={isSubmitting}
        onClose={onClose}
        onPickVideo={onPickVideo}
        onSubmit={onSubmit}
        selectedVideo={selectedVideo}
        styles={styles}
      />
    </Modal>
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
