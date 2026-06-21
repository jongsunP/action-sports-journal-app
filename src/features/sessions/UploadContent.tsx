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
import type { UploadProgressState } from './uploadProgress';

type HomeScreenStyles = Record<string, any>;

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
  const visibleVideo =
    selectedVideo ?? (uploadDraft ? getVideoFromUploadDraft(uploadDraft) : null);
  const hasUploadFailed = uploadDraft?.status === 'upload_failed';
  const uploadPercentLabel =
    typeof uploadProgress?.percent === 'number'
      ? `${uploadProgress.percent}%`
      : undefined;
  const uploadTitle = uploadPercentLabel
    ? `${uploadProgress?.label ?? '영상 전송 중'} ${uploadPercentLabel}`
    : uploadProgress?.label;

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
                <Text style={styles.selectedVideoLabel}>선택된 영상</Text>
                <Text style={styles.selectedVideoTitle} numberOfLines={1}>
                  {visibleVideo.fileName ?? '선택한 영상'}
                </Text>
                <Text style={styles.selectedVideoMeta}>
                  {formatVideoMeta(visibleVideo)}
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
                {uploadTitle ?? '영상을 서버에 업로드하고 있습니다.'}
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
                {uploadTitle ?? '영상을 업로드하고 있습니다.'}
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
                  '업로드가 끝날 때까지 앱을 닫지 않는 것이 안전합니다.'}
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
