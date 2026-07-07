import { Text, View } from 'react-native';

import {
  RecentSessionsRail,
  type HomeScreenStyles,
  type SessionSummary,
  VideoArchiveList,
  type VideoArchiveLoadState,
} from './sessionComponents';

import type { Session } from '../../types';

type RecentRecordsSectionProps = {
  formatShortSessionDate: (value: string) => string;
  isLoading: boolean;
  onOpenSession: (session: Session) => void;
  sessions: SessionSummary[];
  styles: HomeScreenStyles;
};

type VideoArchiveSectionProps = {
  formatShortSessionDate: (value: string) => string;
  getVideoArchiveDescription: (session: Session) => string;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadState: VideoArchiveLoadState;
  onEndReached: () => void;
  onOpenSession: (session: Session) => void;
  onRetry: () => void;
  sessions: SessionSummary[];
  shouldUseHomeFallback: boolean;
  styles: HomeScreenStyles;
};

export function RecentRecordsSection({
  formatShortSessionDate,
  isLoading,
  onOpenSession,
  sessions,
  styles,
}: RecentRecordsSectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionLabel}>최근 기록</Text>
        <Text style={styles.sectionHint}>최신순</Text>
      </View>
      <RecentSessionsRail
        formatShortSessionDate={formatShortSessionDate}
        isLoading={isLoading}
        onOpenSession={onOpenSession}
        sessions={sessions}
        styles={styles}
      />
    </View>
  );
}

export function VideoArchiveSection({
  formatShortSessionDate,
  getVideoArchiveDescription,
  hasMore,
  isLoadingMore,
  loadState,
  onEndReached,
  onOpenSession,
  onRetry,
  sessions,
  shouldUseHomeFallback,
  styles,
}: VideoArchiveSectionProps) {
  return (
    <VideoArchiveList
      formatShortSessionDate={formatShortSessionDate}
      getVideoArchiveDescription={getVideoArchiveDescription}
      hasMore={hasMore}
      header={
        <>
          <View style={styles.tabPageHeader}>
            <Text style={styles.title}>영상</Text>
            <Text style={styles.headerMeta}>
              {sessions.length}개 표시됨
              {shouldUseHomeFallback ? ' · 홈 기록 기준' : ' · 최근 기록 기준'}
            </Text>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionLabel}>최근 영상</Text>
              <Text style={styles.sectionHint}>최신순</Text>
            </View>
          </View>
        </>
      }
      isLoadingMore={isLoadingMore}
      loadState={loadState}
      onEndReached={onEndReached}
      onOpenSession={onOpenSession}
      onRetry={onRetry}
      sessions={sessions}
      styles={styles}
    />
  );
}
