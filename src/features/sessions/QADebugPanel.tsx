import {
  Pressable,
  type StyleProp,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';

const ENABLE_QA_DEBUG_PANEL =
  process.env.EXPO_PUBLIC_ENABLE_QA_DEBUG_PANEL !== 'false';

type QADebugPanelStyles = {
  buttonPressed: StyleProp<ViewStyle>;
  qaDebugCollapsed: StyleProp<ViewStyle>;
  qaDebugCollapsedText: StyleProp<TextStyle>;
  qaDebugCollapseHint: StyleProp<TextStyle>;
  qaDebugHeader: StyleProp<ViewStyle>;
  qaDebugLine: StyleProp<TextStyle>;
  qaDebugPanel: StyleProp<ViewStyle>;
  qaDebugTitle: StyleProp<TextStyle>;
};

export type QADebugPanelSnapshot = {
  auth: {
    bootstrapDurationMs: number | null;
    bootstrapReason: string | null;
    bootstrapStage: string;
    bootstrapStatus: string;
    bootstrapUpdatedAt: number | null;
    hasUser: boolean;
    isAnonymous: boolean;
    isLoading: boolean;
    mode: string;
  };
  boot: {
    count: number | null;
    durationMs: number | null;
    hasMore: boolean | null;
    journalCacheAgeMs?: number | null;
    journalCacheCount?: number | null;
    journalCacheReason?: string | null;
    journalCacheRefreshStatus?: string;
    journalCacheSource?: string;
    journalCacheStale?: boolean | null;
    reason: string | null;
    status: string;
    updatedAt: number | null;
  };
  counts: {
    home: number;
    videoArchiveIds: number;
    videoArchive: number;
    videoShown: number;
  };
  thumbnailHydration: {
    fallbackResponseCount: number | null;
    reason: string | null;
    responseCount: number | null;
    status: 'empty' | 'error' | 'idle' | 'loading' | 'ready';
    targetCount: number;
    updatedAt: number | null;
  };
  video: {
    apiMs: number | null;
    authClaimsMs: number | null;
    authGetUserMs: number | null;
    authVerificationMode: string | null;
    bootPageReused: boolean | null;
    clientNormalizeMs: number | null;
    count: number | null;
    duplicateVideoFetchBlocked: boolean | null;
    durationMs: number | null;
    evidenceQueryMs: number | null;
    hasMore: boolean | null;
    momentsQueryMs: number | null;
    publicUserLookupMs: number | null;
    reason: string | null;
    requestId: string | null;
    requestUserInflightHit: boolean | null;
    requestUserInflightWaitMs: number | null;
    resolveRequestUserMs: number | null;
    responseBytes: number | null;
    retryCount: number;
    serverTotalMs: number | null;
    source: 'archive_fetch' | 'boot_reuse' | 'local_snapshot' | null;
    status: 'empty' | 'error' | 'idle' | 'loading' | 'ready' | 'timeout';
    thumbnailSignedUrlWallMs: number | null;
    updatedAt: number | null;
    view: string | null;
  };
  videoUiLoadState: string;
};

type QADebugPanelProps = {
  isOpen: boolean;
  onToggle: () => void;
  snapshot: QADebugPanelSnapshot;
  styles: QADebugPanelStyles;
};

function compactDebugReason(reason: string | null) {
  if (!reason) {
    return '-';
  }

  return reason.replace(/\s+/g, ' ').slice(0, 72);
}

function formatDebugRequestId(requestId: string | null) {
  return requestId ? requestId.slice(0, 8) : '-';
}

function formatDebugBoolean(value: boolean | null) {
  if (value === null) {
    return '-';
  }

  return value ? 'Y' : 'N';
}

function formatDebugTimestamp(updatedAt: number | null) {
  if (!updatedAt) {
    return '-';
  }

  return new Date(updatedAt).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function QADebugPanel({
  isOpen,
  onToggle,
  snapshot,
  styles,
}: QADebugPanelProps) {
  if (!ENABLE_QA_DEBUG_PANEL) {
    return null;
  }

  if (!isOpen) {
    return (
      <Pressable
        accessibilityLabel="QA debug panel 열기"
        accessibilityRole="button"
        onPress={onToggle}
        style={({ pressed }) => [
          styles.qaDebugCollapsed,
          pressed ? styles.buttonPressed : undefined,
        ]}
      >
        <Text style={styles.qaDebugCollapsedText}>QA</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.qaDebugPanel}>
      <Pressable
        accessibilityLabel="QA debug panel 닫기"
        accessibilityRole="button"
        onPress={onToggle}
        style={({ pressed }) => [
          styles.qaDebugHeader,
          pressed ? styles.buttonPressed : undefined,
        ]}
      >
        <Text style={styles.qaDebugTitle}>QA Debug</Text>
        <Text style={styles.qaDebugCollapseHint}>접기</Text>
      </Pressable>
      <Text style={styles.qaDebugLine}>
        Auth {snapshot.auth.mode} · loading {snapshot.auth.isLoading ? 'Y' : 'N'} ·
        user {snapshot.auth.hasUser ? 'Y' : 'N'} · anon{' '}
        {snapshot.auth.isAnonymous ? 'Y' : 'N'}
      </Text>
      <Text style={styles.qaDebugLine}>
        Auth boot {snapshot.auth.bootstrapStatus}/{snapshot.auth.bootstrapStage} ·{' '}
        {snapshot.auth.bootstrapDurationMs ?? '-'}ms
      </Text>
      <Text style={styles.qaDebugLine}>
        Auth at {formatDebugTimestamp(snapshot.auth.bootstrapUpdatedAt)} · reason{' '}
        {compactDebugReason(snapshot.auth.bootstrapReason)}
      </Text>
      <Text style={styles.qaDebugLine}>
        Boot {snapshot.boot.status} · {snapshot.boot.durationMs ?? '-'}ms · count{' '}
        {snapshot.boot.count ?? '-'} · more{' '}
        {snapshot.boot.hasMore === null ? '-' : snapshot.boot.hasMore ? 'Y' : 'N'}
      </Text>
      <Text style={styles.qaDebugLine}>
        Boot at {formatDebugTimestamp(snapshot.boot.updatedAt)} · reason{' '}
        {compactDebugReason(snapshot.boot.reason)}
      </Text>
      <Text style={styles.qaDebugLine}>
        Journal cache {snapshot.boot.journalCacheSource ?? '-'} · refresh{' '}
        {snapshot.boot.journalCacheRefreshStatus ?? '-'} · count{' '}
        {snapshot.boot.journalCacheCount ?? '-'} · age{' '}
        {snapshot.boot.journalCacheAgeMs ?? '-'}ms
      </Text>
      <Text style={styles.qaDebugLine}>
        Journal stale{' '}
        {snapshot.boot.journalCacheStale === null ||
        snapshot.boot.journalCacheStale === undefined
          ? '-'
          : snapshot.boot.journalCacheStale
            ? 'Y'
            : 'N'}{' '}
        · reason {compactDebugReason(snapshot.boot.journalCacheReason ?? null)}
      </Text>
      <Text style={styles.qaDebugLine}>
        Video {snapshot.video.status} · {snapshot.video.durationMs ?? '-'}ms ·
        api {snapshot.video.apiMs ?? '-'}ms · source {snapshot.video.source ?? '-'}
      </Text>
      <Text style={styles.qaDebugLine}>
        Video ui {snapshot.videoUiLoadState} · norm{' '}
        {snapshot.video.clientNormalizeMs ?? '-'}ms · bootReuse{' '}
        {snapshot.video.bootPageReused === null
          ? '-'
          : snapshot.video.bootPageReused
            ? 'Y'
            : 'N'}{' '}
        · dupBlocked{' '}
        {snapshot.video.duplicateVideoFetchBlocked === null
          ? '-'
          : snapshot.video.duplicateVideoFetchBlocked
            ? 'Y'
            : 'N'}
      </Text>
      <Text style={styles.qaDebugLine}>
        Video req {formatDebugRequestId(snapshot.video.requestId)} · server{' '}
        {snapshot.video.serverTotalMs ?? '-'}ms
      </Text>
      <Text style={styles.qaDebugLine}>
        Video view {snapshot.video.view ?? '-'} · auth{' '}
        {snapshot.video.authVerificationMode ?? '-'} · claims{' '}
        {snapshot.video.authClaimsMs ?? '-'}ms · getUser{' '}
        {snapshot.video.authGetUserMs ?? '-'}ms
      </Text>
      <Text style={styles.qaDebugLine}>
        Video inflight {formatDebugBoolean(snapshot.video.requestUserInflightHit)} ·
        wait {snapshot.video.requestUserInflightWaitMs ?? '-'}ms
      </Text>
      <Text style={styles.qaDebugLine}>
        Video resolve {snapshot.video.resolveRequestUserMs ?? '-'}ms · user{' '}
        {snapshot.video.publicUserLookupMs ?? '-'}ms · query{' '}
        {snapshot.video.momentsQueryMs ?? '-'}ms
      </Text>
      <Text style={styles.qaDebugLine}>
        Video ev {snapshot.video.evidenceQueryMs ?? '-'}ms · thumb{' '}
        {snapshot.video.thumbnailSignedUrlWallMs ?? '-'}ms · bytes{' '}
        {snapshot.video.responseBytes ?? '-'}
      </Text>
      <Text style={styles.qaDebugLine}>
        Video count {snapshot.video.count ?? '-'} · more{' '}
        {snapshot.video.hasMore === null ? '-' : snapshot.video.hasMore ? 'Y' : 'N'} ·
        retry {snapshot.video.retryCount}
      </Text>
      <Text style={styles.qaDebugLine}>
        Video at {formatDebugTimestamp(snapshot.video.updatedAt)} · reason{' '}
        {compactDebugReason(snapshot.video.reason)}
      </Text>
      <Text style={styles.qaDebugLine}>
        Thumb hydrate {snapshot.thumbnailHydration.status} · need{' '}
        {snapshot.thumbnailHydration.targetCount} · got{' '}
        {snapshot.thumbnailHydration.responseCount ?? '-'} · reason{' '}
        {compactDebugReason(snapshot.thumbnailHydration.reason)}
      </Text>
      <Text style={styles.qaDebugLine}>
        Thumb fallback got{' '}
        {snapshot.thumbnailHydration.fallbackResponseCount ?? '-'}
      </Text>
      <Text style={styles.qaDebugLine}>
        Counts home {snapshot.counts.home} · archive{' '}
        {snapshot.counts.videoArchive} · ids {snapshot.counts.videoArchiveIds} ·
        shown {snapshot.counts.videoShown}
      </Text>
    </View>
  );
}
