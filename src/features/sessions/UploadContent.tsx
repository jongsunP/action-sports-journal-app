import { useState } from 'react';
import { useEventListener } from 'expo';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

import type { SessionVideoAsset } from '../../services/ai';
import {
  getVideoFromUploadDraft,
  type UploadDraft,
} from './uploadDraftStorage';
import {
  runUploadCompressionPoc,
  type UploadCompressionPocResult,
} from './uploadCompressionPoc';
import type { UploadProgressState } from './uploadProgress';

type HomeScreenStyles = Record<string, any>;

const ENABLE_UPLOAD_COMPRESSION_POC =
  __DEV__ ||
  process.env.EXPO_PUBLIC_ENABLE_DEBUG_VIEWER === 'true' ||
  process.env.EXPO_PUBLIC_ENABLE_UPLOAD_COMPRESSION_POC === 'true';

export type UploadContentProps = {
  canUploadSession: boolean;
  formatVideoMeta: (video: SessionVideoAsset) => string;
  isPreparingThumbnail: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onPickVideo: () => void;
  onSubmit: () => void;
  selectedVideo: SessionVideoAsset | null;
  styles: HomeScreenStyles;
  uploadDraft?: UploadDraft | null;
  uploadProgress?: UploadProgressState | null;
};

export function UploadContent({
  canUploadSession,
  formatVideoMeta,
  isPreparingThumbnail,
  isSubmitting,
  onClose,
  onPickVideo,
  onSubmit,
  selectedVideo,
  styles,
  uploadDraft,
  uploadProgress,
}: UploadContentProps) {
  const [compressionPocError, setCompressionPocError] = useState<string | null>(
    null,
  );
  const [compressionPocResult, setCompressionPocResult] =
    useState<UploadCompressionPocResult | null>(null);
  const [isRunningCompressionPoc, setIsRunningCompressionPoc] = useState(false);
  const visibleVideo =
    selectedVideo ?? (uploadDraft ? getVideoFromUploadDraft(uploadDraft) : null);
  const hasUploadFailed = uploadDraft?.status === 'upload_failed';
  const uploadPercentLabel =
    typeof uploadProgress?.percent === 'number'
      ? `${uploadProgress.percent}%`
      : undefined;
  const uploadTitle = uploadProgress?.label;
  const canRunCompressionPoc =
    ENABLE_UPLOAD_COMPRESSION_POC &&
    Boolean(visibleVideo) &&
    !isSubmitting &&
    !isRunningCompressionPoc;

  const handleRunCompressionPoc = async () => {
    if (!visibleVideo || isSubmitting || isRunningCompressionPoc) {
      return;
    }

    setCompressionPocError(null);
    setCompressionPocResult(null);
    setIsRunningCompressionPoc(true);

    try {
      const result = await runUploadCompressionPoc(visibleVideo);
      setCompressionPocResult(result);
    } catch (error) {
      setCompressionPocError(getCompressionPocDisplayError(error));
    } finally {
      setIsRunningCompressionPoc(false);
    }
  };

  return (
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
            <View style={styles.uploadSheetTitleBlock}>
              <Text style={styles.uploadSheetTitle}>새 기록 만들기</Text>
              <Text style={styles.uploadSheetDescription}>
                영상을 고르면 바로 업로드하고 분석을 시작합니다.
              </Text>
            </View>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.uploadPageBody}
          showsVerticalScrollIndicator={false}
        >
          {visibleVideo ? (
            <>
              <LocalUploadVideoPreview
                key={visibleVideo.uri}
                styles={styles}
                videoUri={visibleVideo.uri}
              />
              <View
                style={[
                  styles.uploadSheetPaddedSection,
                  styles.selectedVideoInfo,
                ]}
              >
                <Text style={styles.selectedVideoLabel}>선택한 라이딩 영상</Text>
                <Text style={styles.selectedVideoTitle} numberOfLines={1}>
                  {visibleVideo.fileName ?? '선택한 영상'}
                </Text>
                <Text style={styles.selectedVideoMeta}>
                  {formatVideoMeta(visibleVideo)}
                </Text>
                <View style={styles.uploadStepStrip}>
                  <UploadStepItem index="1" label="영상 확인" styles={styles} />
                  <UploadStepItem index="2" label="업로드" styles={styles} />
                  <UploadStepItem index="3" label="분석 시작" styles={styles} />
                </View>
                <View style={styles.selectedVideoHelper}>
                  <Text style={styles.selectedVideoHelperTitle}>
                    빠르게 기록을 시작합니다
                  </Text>
                  <Text style={styles.selectedVideoHelperText}>
                    메모 입력 없이 먼저 분석합니다. 현재 업로드는 30MB / 15초
                    이하 클립만 지원하며, 20MB를 넘는 영상은 업로드 전에
                    자동으로 최적화합니다.
                  </Text>
                </View>
                {ENABLE_UPLOAD_COMPRESSION_POC ? (
                  <CompressionPocPanel
                    canRun={canRunCompressionPoc}
                    error={compressionPocError}
                    isRunning={isRunningCompressionPoc}
                    onRun={handleRunCompressionPoc}
                    result={compressionPocResult}
                    styles={styles}
                  />
                ) : null}
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
            업로드가 끝나면 분석은 서버에서 이어집니다. 업로드 중에는 앱을 닫지 않는 것이 안전합니다.
          </Text>
          {isSubmitting ? (
            <View style={styles.uploadSubmittingPanel}>
              <Text style={styles.uploadSubmittingTitle}>
                {uploadTitle ?? '영상 기록을 만들고 있습니다'}
              </Text>
              <Text style={styles.uploadSubmittingHint}>
                {uploadProgress?.detail ??
                  '업로드가 완료되면 분석은 서버에서 계속됩니다.'}
              </Text>
            </View>
          ) : isPreparingThumbnail ? (
            <Text style={styles.uploadSubmittingHint}>
              썸네일을 준비하고 있습니다.
            </Text>
          ) : hasUploadFailed ? (
            <Text style={styles.uploadSubmittingHint}>
              업로드가 완료되지 않았습니다. 다시 시도해 주세요.
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
                  ? '기록 생성 중...'
                  : isPreparingThumbnail
                    ? '준비 중...'
                    : '업로드하고 분석 시작'}
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
                {uploadTitle ?? '영상 기록을 만들고 있습니다'}
              </Text>
              {typeof uploadProgress?.percent === 'number' ? (
                <View style={styles.uploadProgressTrack}>
                  <View
                    style={[
                      styles.uploadProgressFill,
                      {
                        width: `${uploadProgress.percent}%`,
                      },
                    ]}
                  />
                </View>
              ) : null}
              {uploadPercentLabel ? (
                <Text style={styles.uploadProgressPercent}>
                  {uploadPercentLabel}
                </Text>
              ) : null}
              <Text style={styles.uploadBlockingText}>
                {uploadProgress?.detail ??
                  '앱을 닫지 말고 잠시만 기다려주세요.'}
              </Text>
              <Text style={styles.uploadBlockingText}>
                업로드가 완료되면 분석은 서버에서 계속됩니다.
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function UploadStepItem({
  index,
  label,
  styles,
}: {
  index: string;
  label: string;
  styles: HomeScreenStyles;
}) {
  return (
    <View style={styles.uploadStepPill}>
      <Text style={styles.uploadStepIndex}>{index}</Text>
      <Text style={styles.uploadStepText}>{label}</Text>
    </View>
  );
}

function CompressionPocPanel({
  canRun,
  error,
  isRunning,
  onRun,
  result,
  styles,
}: {
  canRun: boolean;
  error: string | null;
  isRunning: boolean;
  onRun: () => void;
  result: UploadCompressionPocResult | null;
  styles: HomeScreenStyles;
}) {
  return (
    <View style={styles.selectedVideoHelper}>
      <Text style={styles.selectedVideoHelperTitle}>
        QA 전용 · 업로드 전 최적화 POC
      </Text>
      <Text style={styles.selectedVideoHelperText}>
        실제 업로드 없이 로컬 압축 결과와 upload target 요청 직전 메타만
        확인합니다.
      </Text>
      <Pressable
        accessibilityLabel="압축 POC 실행"
        accessibilityRole="button"
        disabled={!canRun}
        onPress={onRun}
        style={({ pressed }) => [
          styles.uploadPageSecondaryButton,
          !canRun ? styles.uploadSheetSubmitButtonDisabled : undefined,
          pressed ? styles.buttonPressed : undefined,
        ]}
      >
        <Text style={styles.uploadPageSecondaryText}>
          {isRunning ? '최적화 확인 중...' : 'QA 압축 메타 확인'}
        </Text>
      </Pressable>
      {isRunning ? (
        <Text style={styles.uploadSubmittingHint}>
          업로드 전 영상을 최적화하고 있습니다.
        </Text>
      ) : null}
      {error ? (
        <Text style={styles.uploadSubmittingHint}>{error}</Text>
      ) : null}
      {result ? (
        <View>
          <Text style={styles.selectedVideoHelperText}>
            원본: {formatBytesForPoc(result.original.fileSize)} · 압축 후:{' '}
            {formatBytesForPoc(result.compressed.fileSize)} · 감소율:{' '}
            {formatPercentForPoc(result.reductionRatio)}
          </Text>
          <Text style={styles.selectedVideoHelperText}>
            최종 payload: {result.backendUploadTargetPayload.mimeType} ·{' '}
            {formatBytesForPoc(result.backendUploadTargetPayload.fileSize)} ·{' '}
            {formatDurationForPoc(result.backendUploadTargetPayload.durationMs)}
          </Text>
          <Text style={styles.selectedVideoHelperText}>
            처리 메타: {result.backendUploadTargetPayload.uploadProcessing.source}{' '}
            · 압축 시간{' '}
            {formatDurationForPoc(
              result.backendUploadTargetPayload.uploadProcessing
                .compressionDurationMs ?? null,
            )}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function getCompressionPocDisplayError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes('react-native-compressor') ||
    normalizedMessage.includes('native') ||
    normalizedMessage.includes('dev-client') ||
    normalizedMessage.includes('standalone')
  ) {
    return '이 확인은 native build에서만 실행됩니다. 다음 standalone QA에서 확인해주세요.';
  }

  return '압축 메타를 확인하지 못했습니다. 다른 짧은 영상으로 다시 확인해주세요.';
}

function formatBytesForPoc(value: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '-';
  }

  return `${Math.round((value / 1024 / 1024) * 10) / 10} MB`;
}

function formatDurationForPoc(value: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '-';
  }

  return `${Math.round(value / 100) / 10}s`;
}

function formatPercentForPoc(value: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '-';
  }

  return `${value}%`;
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
