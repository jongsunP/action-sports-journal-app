import { useEffect, useRef, useState } from 'react';
import { useEventListener } from 'expo';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

import { DebugResultViewer } from './DebugResultViewer';
import {
  getCompletedMomentNoEvidenceCopy,
  getMissingDetailMediaCopy,
  getMomentStatusLabel,
  getMomentStatusMessage,
  getRetryEligibility,
  getVisibleEvidenceForMoment,
  isMomentCompleted,
  needsEvidenceReview,
  shouldShowMomentStatusMessage,
} from './momentStatus';
import {
  buildRiderFacingAnalysis,
  type RiderFacingAnalysis,
} from './riderFacingAnalysis';
import { MomentStatusDot } from './sessionComponents';
import { getSessionDisplayTitle } from './sessionFormatters';

import type { SessionVideoAsset } from '../../services/ai';
import type { MomentDetailFetchDiagnostics } from '../../services/moments';
import type { AnalysisResult, GeminiEvidenceResult, MomentStatus, Session } from '../../types';

const ENABLE_INTERNAL_DEBUG_VIEWER =
  __DEV__ || process.env.EXPO_PUBLIC_ENABLE_DEBUG_VIEWER === 'true';

type HomeScreenStyles = Record<string, any>;
let styles: HomeScreenStyles;

function formatDetailDebugRequestId(requestId?: string | null) {
  return requestId ? requestId.slice(0, 8) : '-';
}

function DetailThumbnailPreview({
  momentStatus,
  thumbnailUri,
}: {
  momentStatus?: MomentStatus;
  thumbnailUri: string;
}) {
  const completed = isMomentCompleted({ momentStatus });
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      duration: 180,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim, thumbnailUri]);

  return (
    <View style={styles.detailThumbnailHero}>
      <Animated.Image
        resizeMode="cover"
        source={{ uri: thumbnailUri }}
        style={[styles.detailThumbnailImage, { opacity: fadeAnim }]}
      />
      <View style={styles.detailThumbnailOverlay}>
        <Text style={styles.detailThumbnailBadge}>대표 이미지</Text>
        <Text style={styles.detailThumbnailTitle}>
          {completed ? '완료된 라이딩 기록' : '라이딩 대표 이미지'}
        </Text>
        <Text style={styles.detailThumbnailText}>
          {completed
            ? '영상 대신 대표 이미지와 분석 결과를 확인할 수 있습니다.'
            : '영상 미리보기를 준비하는 동안 대표 이미지를 보여줍니다.'}
        </Text>
      </View>
    </View>
  );
}

function DetailMediaPlaceholder() {
  return (
    <View style={styles.detailMediaPlaceholder}>
      <View style={styles.detailMediaPlaceholderGlow} />
      <View style={styles.detailMediaPlaceholderIcon}>
        <Ionicons
          color="rgba(203, 213, 225, 0.7)"
          name="film-outline"
          size={30}
        />
      </View>
      <View style={styles.detailMediaPlaceholderLineWide} />
      <View style={styles.detailMediaPlaceholderLineNarrow} />
    </View>
  );
}

function DetailDataLoadingPlaceholder() {
  return (
    <>
      <View style={styles.detailHydrationPreviewCard}>
        <View style={styles.detailHydrationHeaderRow}>
          <View style={styles.detailLoadingLineNarrow} />
          <View style={styles.detailHydrationPill} />
        </View>
        <View style={styles.detailHydrationImage} />
        <View style={styles.detailHydrationBody}>
          <View style={styles.detailLoadingLineWide} />
          <View style={styles.detailLoadingLineNarrow} />
          <View style={styles.detailHydrationLineFull} />
        </View>
      </View>
      <View style={styles.detailHydrationAnalysisCard}>
        <View style={styles.detailLoadingLineWide} />
        <View style={styles.detailHydrationLineFull} />
        <View style={styles.detailHydrationLineMid} />
        <View style={styles.detailHydrationChipRow}>
          <View style={styles.detailHydrationChip} />
          <View style={styles.detailHydrationChip} />
        </View>
      </View>
    </>
  );
}

function LocalSessionVideoPlayer({
  momentStatus,
  thumbnailUri,
  videoUri,
}: {
  momentStatus?: MomentStatus;
  thumbnailUri?: string;
  videoUri: string;
}) {
  const [hasPlaybackError, setHasPlaybackError] = useState(false);
  const player = useVideoPlayer(videoUri, (videoPlayer) => {
    videoPlayer.play();
  });

  useEventListener(player, 'statusChange', ({ status, error }) => {
    if (status === 'error' || error) {
      setHasPlaybackError(true);
    }
  });

  if (hasPlaybackError) {
    if (thumbnailUri) {
      return (
        <DetailThumbnailPreview
          momentStatus={momentStatus}
          thumbnailUri={thumbnailUri}
        />
      );
    }

    const missingMediaCopy = getMissingDetailMediaCopy(momentStatus);

    return (
      <View style={styles.videoMissingFallback}>
        <Text style={styles.videoMissingTitle}>{missingMediaCopy.title}</Text>
        <Text style={styles.videoMissingText}>{missingMediaCopy.body}</Text>
      </View>
    );
  }

  return (
    <VideoView
      allowsFullscreen
      contentFit="cover"
      nativeControls
      player={player}
      style={styles.detailVideo}
    />
  );
}

function shouldShowTrickConfirmationAction(evidence?: GeminiEvidenceResult) {
  if (!evidence) {
    return false;
  }

  const predictedName = evidence.primaryCandidate.name.trim().toLowerCase();
  const predictedNeedsReview =
    predictedName === '확인 필요' ||
    predictedName === 'unknown' ||
    predictedName === 'needs_review';

  return Boolean(
    predictedNeedsReview ||
      needsEvidenceReview(evidence) ||
      evidence.candidateTrace?.displayLabel,
  );
}

export type MomentDetailContentProps = {
  canRequestGeminiEvidence: boolean;
  debugEndpoint?: string;
  detailDiagnostics?: MomentDetailFetchDiagnostics | null;
  evidence?: GeminiEvidenceResult;
  isDeleting?: boolean;
  isDetailDataLoading?: boolean;
  isLoading: boolean;
  momentStatus?: MomentStatus;
  onClose: () => void;
  onDelete?: () => void;
  onRetry?: () => void;
  session?: Session;
  styles: HomeScreenStyles;
  thumbnailUri?: string;
  video?: SessionVideoAsset | null;
};

export function MomentDetailContent({
  canRequestGeminiEvidence,
  debugEndpoint,
  detailDiagnostics,
  evidence,
  isDeleting = false,
  isDetailDataLoading = false,
  isLoading,
  momentStatus,
  onClose,
  onDelete,
  onRetry,
  session,
  styles: nextStyles,
  thumbnailUri,
  video,
}: MomentDetailContentProps) {
  styles = nextStyles;
  const [isEvidenceDetailOpen, setIsEvidenceDetailOpen] = useState(false);

  if (!session) {
    return null;
  }

  const isCompleted = isMomentCompleted({
    evidence,
    momentStatus,
  });
  const retryEligibility = getRetryEligibility({
    canRequestGeminiEvidence,
    evidence,
    isLoading,
    momentStatus,
    session,
    video,
  });
  const visibleEvidence = getVisibleEvidenceForMoment({
    evidence,
    momentStatus,
  });
  const shouldShowStatusMessage = shouldShowMomentStatusMessage(momentStatus);
  const statusMessage = momentStatus
    ? getMomentStatusMessage(momentStatus)
    : undefined;
  const shouldShowTrickReviewAction = shouldShowTrickConfirmationAction(
    visibleEvidence,
  );
  const riderFacingAnalysis = visibleEvidence
    ? buildRiderFacingAnalysis(visibleEvidence)
    : null;
  const handleOpenTrickReview = () => {
    Alert.alert(
      '기술명 확인',
      '검토가 필요한 분석입니다. 기술 확정은 다음 단계에서 action sheet로 제공할 예정입니다.',
    );
  };
  const shouldShowRetryAction = Boolean(onRetry && !isCompleted);
  const hasDetailActions = shouldShowRetryAction;
  const canPressRetry = Boolean(
    shouldShowRetryAction && retryEligibility.canRetry && !isDeleting,
  );
  const canPressDelete = Boolean(onDelete && !isDeleting);
  const missingMediaCopy = getMissingDetailMediaCopy(momentStatus);

  return (
    <SafeAreaView style={styles.detailModalContainer}>
      <DetailHeaderSection
        canPressDelete={canPressDelete}
        evidence={visibleEvidence}
        momentStatus={momentStatus}
        onClose={onClose}
        onDelete={onDelete}
        session={session}
      />
      <ScrollView
        contentContainerStyle={styles.detailModalBody}
        showsVerticalScrollIndicator
      >
        <DetailMediaSection
          isDetailDataLoading={isDetailDataLoading}
          missingMediaCopy={missingMediaCopy}
          momentStatus={momentStatus}
          thumbnailUri={thumbnailUri}
          video={video}
        />
        <DetailDiagnosticsSection detailDiagnostics={detailDiagnostics} />
        <DetailActionSection
          canPressRetry={canPressRetry}
          hasDetailActions={hasDetailActions}
          onRetry={onRetry}
          retryReason={retryEligibility.reason}
          shouldShowRetryAction={shouldShowRetryAction}
        />
        <DetailTrickReviewSection
          onOpen={handleOpenTrickReview}
          visible={shouldShowTrickReviewAction}
        />
        <DetailMemoSection session={session} />
        <DetailStatusSection
          shouldShowStatusMessage={shouldShowStatusMessage}
          statusMessage={statusMessage}
        />
        <DetailAnalysisSections
          isDetailDataLoading={isDetailDataLoading}
          isEvidenceDetailOpen={isEvidenceDetailOpen}
          isLoading={isLoading}
          onToggleEvidenceDetail={() =>
            setIsEvidenceDetailOpen((current) => !current)
          }
          riderFacingAnalysis={riderFacingAnalysis}
          session={session}
          shouldShowStatusMessage={shouldShowStatusMessage}
          thumbnailUri={thumbnailUri}
          video={video}
          visibleEvidence={visibleEvidence}
        />
      </ScrollView>
      <DetailDeletingOverlay visible={isDeleting} />
    </SafeAreaView>
  );
}

function DetailHeaderSection({
  canPressDelete,
  evidence,
  momentStatus,
  onClose,
  onDelete,
  session,
}: {
  canPressDelete: boolean;
  evidence?: GeminiEvidenceResult;
  momentStatus?: MomentStatus;
  onClose: () => void;
  onDelete?: () => void;
  session: Session;
}) {
  return (
    <View style={styles.detailModalHeader}>
      <Pressable
        accessibilityLabel="닫기"
        accessibilityRole="button"
        onPress={onClose}
        style={({ pressed }) => [
          styles.detailCloseButton,
          pressed ? styles.buttonPressed : undefined,
        ]}
      >
        <View style={styles.detailBackIcon}>
          <View style={styles.detailBackIconStrokeTop} />
          <View style={styles.detailBackIconStrokeBottom} />
        </View>
      </Pressable>
      <View style={styles.detailHeaderText}>
        <Text style={styles.detailHeaderTitle} numberOfLines={1}>
          {getSessionDisplayTitle(session, evidence)}
        </Text>
        <View style={styles.detailHeaderMetaRow}>
          <MomentStatusDot status={momentStatus} />
          <Text style={styles.detailHeaderMeta} numberOfLines={1}>
            {momentStatus
              ? `${getMomentStatusLabel(momentStatus)} · ${formatSessionDateTime(
                  session.occurredAt,
                )}`
              : formatSessionDateTime(session.occurredAt)}
          </Text>
        </View>
      </View>
      <View style={styles.detailHeaderActions}>
        {onDelete ? (
          <Pressable
            accessibilityLabel="기록 삭제"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canPressDelete }}
            disabled={!canPressDelete}
            onPress={canPressDelete ? onDelete : undefined}
            style={({ pressed }) => [
              styles.detailHeaderDeleteButton,
              !canPressDelete ? styles.detailHeaderDeleteButtonDisabled : undefined,
              pressed ? styles.buttonPressed : undefined,
            ]}
          >
            <Ionicons
              color={canPressDelete ? '#fb7185' : '#94a3b8'}
              name="trash-outline"
              size={18}
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function DetailMediaSection({
  isDetailDataLoading,
  missingMediaCopy,
  momentStatus,
  thumbnailUri,
  video,
}: {
  isDetailDataLoading: boolean;
  missingMediaCopy: ReturnType<typeof getMissingDetailMediaCopy>;
  momentStatus?: MomentStatus;
  thumbnailUri?: string;
  video?: SessionVideoAsset | null;
}) {
  return (
    <View style={styles.detailVideoFrame}>
      {video ? (
        <LocalSessionVideoPlayer
          momentStatus={momentStatus}
          thumbnailUri={thumbnailUri}
          videoUri={video.uri}
        />
      ) : thumbnailUri ? (
        <DetailThumbnailPreview
          momentStatus={momentStatus}
          thumbnailUri={thumbnailUri}
        />
      ) : isDetailDataLoading ? (
        <DetailMediaPlaceholder />
      ) : (
        <View style={styles.videoMissingFallback}>
          <Text style={styles.videoMissingTitle}>{missingMediaCopy.title}</Text>
          <Text style={styles.videoMissingText}>{missingMediaCopy.body}</Text>
        </View>
      )}
    </View>
  );
}

function DetailDiagnosticsSection({
  detailDiagnostics,
}: {
  detailDiagnostics?: MomentDetailFetchDiagnostics | null;
}) {
  if (!ENABLE_INTERNAL_DEBUG_VIEWER || !detailDiagnostics) {
    return null;
  }

  return (
    <View style={styles.detailStateCard}>
      <Text style={styles.detailStateTitle}>QA Detail fetch</Text>
      <Text style={styles.detailStateText}>
        detail req {formatDetailDebugRequestId(detailDiagnostics.requestId)} ·
        server {detailDiagnostics.serverTotalMs ?? '-'}ms · fetch{' '}
        {detailDiagnostics.fetchMs ?? '-'}ms · bytes{' '}
        {detailDiagnostics.responseBytes ?? '-'}
      </Text>
    </View>
  );
}

function DetailActionSection({
  canPressRetry,
  hasDetailActions,
  onRetry,
  retryReason,
  shouldShowRetryAction,
}: {
  canPressRetry: boolean;
  hasDetailActions: boolean;
  onRetry?: () => void;
  retryReason: string;
  shouldShowRetryAction: boolean;
}) {
  if (!hasDetailActions) {
    return null;
  }

  return (
    <View style={styles.detailActionPanel}>
      <Text style={styles.detailActionTitle}>작업</Text>
      <View style={styles.detailActionRow}>
        {shouldShowRetryAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canPressRetry }}
            disabled={!canPressRetry}
            onPress={canPressRetry ? onRetry : undefined}
            style={({ pressed }) => [
              styles.detailRetryButton,
              !canPressRetry ? styles.detailRetryButtonDisabled : undefined,
              pressed ? styles.buttonPressed : undefined,
            ]}
          >
            <Text
              style={[
                styles.detailRetryText,
                !canPressRetry ? styles.detailRetryTextDisabled : undefined,
              ]}
            >
              분석 다시 시도
            </Text>
          </Pressable>
        ) : null}
      </View>
      {shouldShowRetryAction ? (
        <Text style={styles.detailHint}>{retryReason}</Text>
      ) : null}
    </View>
  );
}

function DetailTrickReviewSection({
  onOpen,
  visible,
}: {
  onOpen: () => void;
  visible: boolean;
}) {
  if (!visible) {
    return null;
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onOpen}
      style={({ pressed }) => [
        styles.detailReviewCard,
        pressed ? styles.buttonPressed : undefined,
      ]}
    >
      <View style={styles.detailReviewTextBlock}>
        <Text style={styles.detailReviewLabel}>기술 검토</Text>
        <Text style={styles.detailReviewTitle}>
          확정 전 확인이 필요한 영상입니다
        </Text>
      </View>
      <Text style={styles.detailReviewAction}>확인</Text>
    </Pressable>
  );
}

function DetailMemoSection({ session }: { session: Session }) {
  return (
    <View style={styles.detailSummaryCard}>
      <Text style={styles.detailSectionHeading}>메모</Text>
      {session.notes ? (
        <Text style={styles.detailMomentReason}>{session.notes}</Text>
      ) : null}
    </View>
  );
}

function DetailStatusSection({
  shouldShowStatusMessage,
  statusMessage,
}: {
  shouldShowStatusMessage: boolean;
  statusMessage?: ReturnType<typeof getMomentStatusMessage>;
}) {
  if (!shouldShowStatusMessage || !statusMessage) {
    return null;
  }

  return (
    <View style={styles.detailStateCard}>
      <Text style={styles.detailStateTitle}>{statusMessage.title}</Text>
      <Text style={styles.detailStateText}>{statusMessage.body}</Text>
    </View>
  );
}

function DetailAnalysisSections({
  isDetailDataLoading,
  isEvidenceDetailOpen,
  isLoading,
  onToggleEvidenceDetail,
  riderFacingAnalysis,
  session,
  shouldShowStatusMessage,
  thumbnailUri,
  video,
  visibleEvidence,
}: {
  isDetailDataLoading: boolean;
  isEvidenceDetailOpen: boolean;
  isLoading: boolean;
  onToggleEvidenceDetail: () => void;
  riderFacingAnalysis: RiderFacingAnalysis | null;
  session: Session;
  shouldShowStatusMessage: boolean;
  thumbnailUri?: string;
  video?: SessionVideoAsset | null;
  visibleEvidence?: GeminiEvidenceResult;
}) {
  if (isDetailDataLoading && !visibleEvidence) {
    return <DetailDataLoadingPlaceholder />;
  }

  if (visibleEvidence && riderFacingAnalysis) {
    return (
      <>
        <SharePreviewCard
          analysis={riderFacingAnalysis}
          session={session}
          thumbnailUri={thumbnailUri}
        />
        <RiderFacingAnalysisCard analysis={riderFacingAnalysis} />
        <Pressable
          accessibilityRole="button"
          onPress={onToggleEvidenceDetail}
          style={({ pressed }) => [
            styles.evidenceDisclosureCard,
            pressed ? styles.buttonPressed : undefined,
          ]}
        >
          <View>
            <Text style={styles.evidenceDisclosureLabel}>분석 근거</Text>
            <Text style={styles.evidenceDisclosureTitle}>
              {isEvidenceDetailOpen ? '세부 근거 접기' : '세부 근거 보기'}
            </Text>
          </View>
          <Text style={styles.evidenceDisclosureAction}>
            {isEvidenceDetailOpen ? '접기' : '보기'}
          </Text>
        </Pressable>
        {isEvidenceDetailOpen ? (
          <GeminiEvidenceView evidence={visibleEvidence} />
        ) : null}
      </>
    );
  }

  if (!shouldShowStatusMessage && !isLoading && !isDetailDataLoading && video) {
    const noEvidenceCopy = getCompletedMomentNoEvidenceCopy();

    return (
      <View style={styles.detailStateCard}>
        <Text style={styles.detailStateTitle}>{noEvidenceCopy.title}</Text>
        <Text style={styles.detailStateText}>{noEvidenceCopy.body}</Text>
      </View>
    );
  }

  return null;
}

function DetailDeletingOverlay({ visible }: { visible: boolean }) {
  if (!visible) {
    return null;
  }

  return (
    <View accessibilityRole="progressbar" style={styles.uploadBlockingOverlay}>
      <View style={styles.uploadBlockingCard}>
        <ActivityIndicator color="#f8fafc" size="large" />
        <Text style={styles.uploadBlockingTitle}>
          영상을 삭제하고 있습니다.
        </Text>
        <Text style={styles.uploadBlockingText}>잠시만 기다려 주세요.</Text>
      </View>
    </View>
  );
}

function SharePreviewCard({
  analysis,
  session,
  thumbnailUri,
}: {
  analysis: RiderFacingAnalysis;
  session: Session;
  thumbnailUri?: string;
}) {
  const title = getSessionDisplayTitle(session);
  const signals = analysis.confirmedSignals.slice(0, 2);

  return (
    <View style={styles.sharePreviewCard}>
      <View style={styles.sharePreviewHeaderRow}>
        <Text style={styles.sharePreviewEyebrow}>공유 미리보기</Text>
        <Text style={styles.sharePreviewBrand}>Wake Board</Text>
      </View>
      {thumbnailUri ? (
        <Image
          resizeMode="cover"
          source={{ uri: thumbnailUri }}
          style={styles.sharePreviewImage}
        />
      ) : (
        <View style={styles.sharePreviewImageFallback}>
          <Text style={styles.sharePreviewImageFallbackText}>
            오늘의 라이딩 기록
          </Text>
        </View>
      )}
      <View style={styles.sharePreviewBody}>
        <View style={styles.sharePreviewMetaRow}>
          <Text style={styles.sharePreviewMeta} numberOfLines={1}>
            {formatSessionDateTime(session.occurredAt)}
          </Text>
          <Text style={styles.sharePreviewBadge}>
            {analysis.confidenceLabel}
          </Text>
        </View>
        <Text style={styles.sharePreviewTitle} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.sharePreviewAnalysisTitle} numberOfLines={2}>
          {analysis.title}
        </Text>
        <Text style={styles.sharePreviewSummary} numberOfLines={2}>
          {analysis.summary}
        </Text>
        {signals.length > 0 ? (
          <View style={styles.sharePreviewSignalList}>
            {signals.map((signal) => (
              <Text key={signal} style={styles.sharePreviewSignal} numberOfLines={2}>
                - {signal}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function RiderFacingAnalysisCard({
  analysis,
}: {
  analysis: RiderFacingAnalysis;
}) {
  return (
    <View style={styles.riderAnalysisCard}>
      <View style={styles.riderAnalysisHeaderRow}>
        <Text style={styles.riderAnalysisEyebrow}>분석 요약</Text>
        <Text
          style={[
            styles.riderAnalysisBadge,
            getRiderAnalysisBadgeStyle(analysis.confidenceLabel),
          ]}
        >
          {analysis.confidenceLabel}
        </Text>
      </View>
      <Text style={styles.riderAnalysisTitle}>{analysis.title}</Text>
      <Text style={styles.riderAnalysisSummary}>{analysis.summary}</Text>
      <View style={styles.riderAnalysisTrustBox}>
        <Text style={styles.riderAnalysisTrustTitle}>신뢰 안내</Text>
        <Text style={styles.riderAnalysisTrustText}>
          {analysis.trustDescription}
        </Text>
      </View>
      <RiderAnalysisList title="판단 근거" items={analysis.confirmedSignals} />
      <RiderAnalysisList title="확인할 점" items={analysis.reviewNotes} />
      <RiderAnalysisList title="다음 연습" items={analysis.nextPractice} />
    </View>
  );
}

function getRiderAnalysisBadgeStyle(
  confidenceLabel: RiderFacingAnalysis['confidenceLabel'],
) {
  if (confidenceLabel === '근거 충분') {
    return styles.riderAnalysisBadgeStrong;
  }

  if (confidenceLabel === '가능성 있음') {
    return styles.riderAnalysisBadgePossible;
  }

  return styles.riderAnalysisBadgeReview;
}

function RiderAnalysisList({
  items,
  title,
}: {
  items: string[];
  title: string;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <View style={styles.riderAnalysisSection}>
      <Text style={styles.riderAnalysisSectionTitle}>{title}</Text>
      {items.map((item) => (
        <Text key={`${title}-${item}`} style={styles.riderAnalysisItem}>
          - {item}
        </Text>
      ))}
    </View>
  );
}

function AnalysisResultView({
  result,
  title,
}: {
  result: AnalysisResult;
  title?: string;
}) {
  return (
    <View style={styles.analysisResult}>
      <Text style={styles.analysisResultTitle}>
        {result.status === 'failed' ? '분석 실패' : title ?? '코칭 결과'}
      </Text>
      <Text style={styles.analysisResultText}>{result.summary}</Text>
      {result.detectedTrick || result.confidence ? (
        <Text style={styles.analysisCompactMeta}>
          {[result.detectedTrick, formatConfidence(result.confidence)]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      ) : null}
      <HighlightSceneList scenes={result.highlightScenes} />
      {result.strengths?.slice(0, 2).map((strength) => (
        <Text key={`strength-${strength}`} style={styles.analysisResultListItem}>
          강점: {strength}
        </Text>
      ))}
      {result.improvements?.slice(0, 2).map((improvement) => (
        <Text key={`improvement-${improvement}`} style={styles.analysisResultListItem}>
          개선: {improvement}
        </Text>
      ))}
      {result.coachingObservations?.slice(0, 2).map((observation) => (
        <Text key={`${observation.label}-${observation.detail}`} style={styles.analysisResultListItem}>
          관찰: {observation.label} - {observation.detail}
        </Text>
      ))}
      {result.highlights.slice(0, 3).map((highlight) => (
        <Text key={highlight} style={styles.analysisResultListItem}>
          - {highlight}
        </Text>
      ))}
      {result.suggestions.slice(0, 3).map((suggestion) => (
        <Text key={suggestion} style={styles.analysisResultListItem}>
          - {suggestion}
        </Text>
      ))}
    </View>
  );
}

function GeminiEvidenceView({ evidence }: { evidence: GeminiEvidenceResult }) {
  const shouldAskUser =
    evidence.requiresUserConfirmation ||
    evidence.qualityMode === 'degraded' ||
    evidence.recoveredFromPartial ||
    evidence.consistencyStatus === 'inconsistent' ||
    evidence.consistencyStatus === 'needs_review' ||
    evidence.confidence === 'low' ||
    evidence.primaryCandidate.confidence === 'low';
  const hasConsistencyIssue =
    evidence.consistencyStatus === 'inconsistent' ||
    evidence.consistencyStatus === 'needs_review';
  const candidateTrace = evidence.candidateTrace;

  return (
    <View style={styles.evidencePanel}>
      <Text style={styles.evidenceTitle}>
        {evidence.status === 'failed' ? '근거 추출 실패' : '판단 근거 상세'}
      </Text>
      <Text
        style={[
          styles.evidenceModelBadge,
          evidence.qualityMode === 'degraded'
            ? styles.evidenceModelBadgeDegraded
            : undefined,
        ]}
      >
        분석 신호 ·{' '}
        {evidence.qualityMode === 'degraded'
          ? '확인 필요'
          : '기본 확인'}
      </Text>
      <View style={styles.evidenceSummaryGrid}>
        <EvidenceSummaryCard label="추정 기술" value={evidence.primaryCandidate.name} />
        <EvidenceSummaryCard label="계열" value={evidence.family.value} />
        <EvidenceSummaryCard
          label="확신 수준"
          value={formatEvidenceConfidence(evidence.confidence)}
        />
        <EvidenceSummaryCard
          label="검토"
          value={
            evidence.requiresUserConfirmation ||
            evidence.consistencyStatus === 'needs_review' ||
            evidence.consistencyStatus === 'inconsistent'
              ? '확인 필요'
              : '검토 없음'
          }
        />
      </View>
      <View style={styles.evidenceFactRow}>
        <Text style={styles.evidenceFactLabel}>AI 추정 기술</Text>
        <Text style={styles.evidenceFactValue}>
          {evidence.primaryCandidate.name} ·{' '}
          {formatEvidenceConfidence(evidence.primaryCandidate.confidence)}
        </Text>
        {shouldAskUser ? (
          <Text style={styles.evidenceWarningText}>
            {hasConsistencyIssue
              ? '분석 신호가 서로 맞지 않아 다시 확인이 필요합니다.'
              : evidence.qualityMode === 'degraded'
              ? '서비스 응답이 불안정해 보수적으로 표시한 결과입니다.'
              : evidence.recoveredFromPartial
                ? '일부 신호만 복구된 결과라 다시 확인이 필요합니다.'
              : '기술명을 확정하기 전 참고 후보로 봐주세요.'}
          </Text>
        ) : null}
        {evidence.consistencyWarnings?.map((warning) => (
          <Text key={warning} style={styles.evidenceWarningText}>
            - {warning}
          </Text>
        ))}
        <Text style={styles.evidenceText}>
          {evidence.primaryCandidate.evidence ?? evidence.evidence}
        </Text>
      </View>
      {candidateTrace?.displayLabel ? (
        <View style={styles.evidenceFactRow}>
          <Text style={styles.evidenceFactLabel}>검토 후보</Text>
          <Text style={styles.evidenceFactValue}>
            {candidateTrace.displayLabel} ·{' '}
            {formatEvidenceConfidence(candidateTrace.confidence)}
          </Text>
          <Text style={styles.evidenceWarningText}>
            확정 기술명이 아니라, 저장된 관찰 신호를 바탕으로 남긴 검토 후보입니다.
          </Text>
          {candidateTrace.observedSignals.slice(0, 4).map((signal) => (
            <Text key={signal} style={styles.evidenceText}>
              - {signal}
            </Text>
          ))}
        </View>
      ) : null}
      <EvidenceFactRow
        label="계열"
        value={evidence.family.value}
        confidence={evidence.family.confidence}
        evidence={evidence.family.evidence}
      />
      <EvidenceFactRow
        label="어프로치"
        value={evidence.approachType.value}
        confidence={evidence.approachType.confidence}
        evidence={evidence.approachType.evidence}
      />
      <EvidenceFactRow
        label="회전"
        value={evidence.rotationType.value}
        confidence={evidence.rotationType.confidence}
        evidence={evidence.rotationType.evidence}
      />
      <EvidenceFactRow
        label="착지"
        value={evidence.landingOutcome.value}
        confidence={evidence.landingOutcome.confidence}
        evidence={evidence.landingOutcome.evidence}
      />
      {evidence.approachObservedFacts ? (
        <ApproachObservedFactsSummary facts={evidence.approachObservedFacts} />
      ) : null}
      {evidence.inversionObservedFacts ? (
        <InversionObservedFactsSummary facts={evidence.inversionObservedFacts} />
      ) : null}
      {evidence.evidenceWindows.length > 0 ? (
        <View style={styles.evidenceSection}>
          <Text style={styles.evidenceSectionTitle}>근거 구간</Text>
          {evidence.evidenceWindows.map((window) => (
            <Text
              key={`${window.startSeconds}-${window.endSeconds}-${window.label}`}
              style={styles.evidenceText}
            >
              {window.startSeconds.toFixed(1)}s-{window.endSeconds.toFixed(1)}s ·{' '}
              {window.label} · {formatEvidenceConfidence(window.confidence)}:{' '}
              {window.evidence}
            </Text>
          ))}
        </View>
      ) : null}
      {evidence.observations.length > 0 ? (
        <View style={styles.evidenceSection}>
          <Text style={styles.evidenceSectionTitle}>관찰</Text>
          {evidence.observations.slice(0, 5).map((observation) => (
            <Text
              key={`${observation.timestampLabel}-${observation.label}`}
              style={styles.evidenceText}
            >
              {observation.timestampLabel} · {observation.label} (
              {formatEvidenceConfidence(observation.confidence)}):{' '}
              {observation.detail}
            </Text>
          ))}
        </View>
      ) : null}
      <View style={styles.evidenceSection}>
        <Text style={styles.evidenceSectionTitle}>
          불확실성 ({formatEvidenceConfidence(evidence.uncertainty.level)})
        </Text>
        {evidence.uncertainty.reasons.map((reason) => (
          <Text key={reason} style={styles.evidenceText}>
            - {reason}
          </Text>
        ))}
      </View>
      {ENABLE_INTERNAL_DEBUG_VIEWER ? (
        <DebugResultViewer evidence={evidence} />
      ) : null}
    </View>
  );
}

function EvidenceSummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.evidenceSummaryCard}>
      <Text style={styles.evidenceSummaryLabel}>{label}</Text>
      <Text style={styles.evidenceSummaryValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function ApproachObservedFactsSummary({
  facts,
}: {
  facts: NonNullable<GeminiEvidenceResult['approachObservedFacts']>;
}) {
  return (
    <View style={styles.evidenceSection}>
      <Text style={styles.evidenceSectionTitle}>어프로치 관찰 세부</Text>
      <Text style={styles.evidenceText}>
        스탠스: {facts.stance.value} ·{' '}
        {formatEvidenceConfidence(facts.stance.confidence)}
      </Text>
      <Text style={styles.evidenceText}>
        앞발: {facts.leadFoot.value} ·{' '}
        {formatEvidenceConfidence(facts.leadFoot.confidence)}
      </Text>
      <Text style={styles.evidenceText}>
        보드 방향: {facts.boardDirection.value} ·{' '}
        {formatEvidenceConfidence(facts.boardDirection.confidence)}
      </Text>
      <Text style={styles.evidenceText}>
        웨이크 경로: {facts.wakeCrossingPath.startPosition} →{' '}
        {facts.wakeCrossingPath.takeoffPosition} →{' '}
        {facts.wakeCrossingPath.landingPosition} ·{' '}
        {formatEvidenceConfidence(facts.wakeCrossingPath.confidence)}
      </Text>
      <Text style={styles.evidenceText}>
        엣지: {facts.edgeDirectionEvidence.value} ·{' '}
        {formatEvidenceConfidence(facts.edgeDirectionEvidence.confidence)}
      </Text>
      <Text style={styles.evidenceText}>
        핸들/몸 방향: {facts.handlePosition.value} ·{' '}
        {facts.bodyOrientation.value}
      </Text>
    </View>
  );
}

function InversionObservedFactsSummary({
  facts,
}: {
  facts: NonNullable<GeminiEvidenceResult['inversionObservedFacts']>;
}) {
  const duration =
    facts.inversionDuration.seconds === null
      ? 'unknown'
      : `${facts.inversionDuration.seconds}s`;

  return (
    <View style={styles.evidenceSection}>
      <Text style={styles.evidenceSectionTitle}>인버트 관찰 세부</Text>
      <Text style={styles.evidenceText}>
        몸이 뒤집힘: {formatObservedBoolean(facts.bodyInverted)}
      </Text>
      <Text style={styles.evidenceText}>
        보드가 머리 위로 올라감: {formatObservedBoolean(facts.boardAboveHead)}
      </Text>
      <Text style={styles.evidenceText}>
        롤 축 관찰: {formatObservedBoolean(facts.rollAxisObserved)}
      </Text>
      <Text style={styles.evidenceText}>
        플립 축 관찰: {formatObservedBoolean(facts.flipAxisObserved)}
      </Text>
      <Text style={styles.evidenceText}>
        지속 시간: {duration} ·{' '}
        {formatEvidenceConfidence(facts.inversionDuration.confidence)}
      </Text>
      <Text style={styles.evidenceText}>
        인버트 근거 수: {facts.inversionEvidenceCount}
      </Text>
      {facts.antiInversionEvidence.slice(0, 3).map((item) => (
        <Text key={item} style={styles.evidenceText}>
          반대 근거: {item}
        </Text>
      ))}
    </View>
  );
}

function formatObservedBoolean(value: true | false | 'unknown') {
  if (value === true) {
    return '보임';
  }

  if (value === false) {
    return '보이지 않음';
  }

  return '확인 필요';
}

function EvidenceFactRow({
  label,
  value,
  confidence,
  evidence,
}: {
  label: string;
  value: string;
  confidence: string;
  evidence: string;
}) {
  return (
    <View style={styles.evidenceFactRow}>
      <Text style={styles.evidenceFactLabel}>{label}</Text>
      <Text style={styles.evidenceFactValue}>
        {value} · {formatEvidenceConfidence(confidence)}
      </Text>
      <Text style={styles.evidenceText}>{evidence}</Text>
    </View>
  );
}

function formatEvidenceConfidence(confidence: string) {
  if (confidence === 'high') {
    return '높음';
  }

  if (confidence === 'medium') {
    return '중간';
  }

  if (confidence === 'low') {
    return '낮음';
  }

  return confidence;
}

function CoachingResultDetail({
  result,
  title,
  onBack,
}: {
  result: AnalysisResult;
  title: string;
  onBack: () => void;
}) {
  const [isRawResponseOpen, setIsRawResponseOpen] = useState(false);
  const rawResponse = result.rawResponseText ?? result.summary;

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        style={({ pressed }) => [
          styles.backButton,
          pressed ? styles.buttonPressed : undefined,
        ]}
      >
        <Text style={styles.backButtonText}>← 라이딩 상세</Text>
      </Pressable>
      <Text style={styles.detailTitle}>{title}</Text>
      {result.detectedTrick || result.confidence ? (
        <Text style={styles.analysisCompactMeta}>
          {[result.detectedTrick, formatConfidence(result.confidence)]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      ) : null}
      <ResultSection title="요약" items={[result.humanReadableAnalysis ?? result.summary]} />
      {rawResponse.trim().length > 0 ? (
        <View style={styles.resultDetailSection}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setIsRawResponseOpen((current) => !current)}
            style={({ pressed }) => [
              styles.rawResponseToggle,
              pressed ? styles.buttonPressed : undefined,
            ]}
          >
            <Text style={styles.resultDetailSectionTitle}>응답 원문</Text>
            <Text style={styles.rawResponseToggleText}>
              {isRawResponseOpen ? '접기' : '펼치기'}
            </Text>
          </Pressable>
          {isRawResponseOpen ? (
            <Text selectable style={[styles.resultDetailText, styles.rawResponseText]}>
              {rawResponse}
            </Text>
          ) : null}
        </View>
      ) : null}
      <ResultSection title="하이라이트" items={result.highlights} />
      <ObservationSection title="관찰" items={result.observations} />
      <ObservationSection title="패턴" items={result.patternRecognition} />
      <ObservationSection title="해석" items={result.inferences} />
      <ObservationSection title="코칭 관찰" items={result.coachingObservations} />
      <ResultSection title="분석 한계" items={result.selfCritique?.limitations} />
      <ResultSection
        title="다음 분석 개선점"
        items={result.selfCritique?.whatWouldImproveAnalysis}
      />
      <ResultSection title="강점" items={result.strengths} />
      <ResultSection title="개선할 점" items={result.improvements} />
      <ResultSection title="다음 연습" items={result.suggestions} />
      {result.highlightScenes && result.highlightScenes.length > 0 ? (
        <View style={styles.resultDetailSection}>
          <Text style={styles.resultDetailSectionTitle}>주요 장면</Text>
          <HighlightSceneList scenes={result.highlightScenes} />
        </View>
      ) : null}
    </View>
  );
}

function HighlightSceneList({
  scenes,
}: {
  scenes?: AnalysisResult['highlightScenes'];
}) {
  const imageScenes = scenes?.filter((scene) => scene.imageUri) ?? [];
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selectedScene =
    selectedIndex === null ? undefined : imageScenes[selectedIndex];

  if (!scenes || scenes.length === 0) {
    return null;
  }

  return (
    <>
      {scenes.map((scene) => {
        const imageIndex = imageScenes.findIndex((item) => item.id === scene.id);

        return (
          <View key={scene.id} style={styles.highlightScene}>
            {scene.imageUri ? (
              <Pressable
                accessibilityRole="imagebutton"
                onPress={() => setSelectedIndex(Math.max(imageIndex, 0))}
              >
                <Image source={{ uri: scene.imageUri }} style={styles.highlightImage} />
              </Pressable>
            ) : null}
            <View style={styles.highlightBody}>
              <Text style={styles.highlightMeta}>{scene.timestampLabel}</Text>
              <Text style={styles.highlightTitle}>{scene.title}</Text>
              <Text style={styles.highlightDescription}>{scene.description}</Text>
            </View>
          </View>
        );
      })}
      <Modal
        animationType="fade"
        onRequestClose={() => setSelectedIndex(null)}
        transparent
        visible={Boolean(selectedScene)}
      >
        <SafeAreaView style={styles.imageModalBackdrop}>
          <View style={styles.imageModalHeader}>
            <View style={styles.imageModalTitleBlock}>
              <Text style={styles.imageModalTitle}>
                {selectedScene?.title ?? '하이라이트'}
              </Text>
              <Text style={styles.imageModalMeta}>
                {selectedScene?.timestampLabel ?? ''}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setSelectedIndex(null)}
              style={({ pressed }) => [
                styles.imageModalCloseButton,
                pressed ? styles.buttonPressed : undefined,
              ]}
            >
              <Text style={styles.imageModalCloseText}>닫기</Text>
            </Pressable>
          </View>
          <View style={styles.imageModalBody}>
            {selectedScene?.imageUri ? (
              <Image
                resizeMode="contain"
                source={{ uri: selectedScene.imageUri }}
                style={styles.imageModalImage}
              />
            ) : null}
          </View>
          <View style={styles.imageModalNavRow}>
            <Pressable
              accessibilityRole="button"
              disabled={selectedIndex === null || selectedIndex <= 0}
              onPress={() =>
                setSelectedIndex((current) =>
                  current === null ? current : Math.max(current - 1, 0),
                )
              }
              style={({ pressed }) => [
                styles.imageModalNavButton,
                selectedIndex === null || selectedIndex <= 0
                  ? styles.imageModalNavButtonDisabled
                  : undefined,
                pressed ? styles.buttonPressed : undefined,
              ]}
            >
              <Text style={styles.imageModalNavText}>이전</Text>
            </Pressable>
            <Text style={styles.imageModalCounter}>
              {selectedIndex === null ? 0 : selectedIndex + 1}/{imageScenes.length}
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={
                selectedIndex === null || selectedIndex >= imageScenes.length - 1
              }
              onPress={() =>
                setSelectedIndex((current) =>
                  current === null
                    ? current
                    : Math.min(current + 1, imageScenes.length - 1),
                )
              }
              style={({ pressed }) => [
                styles.imageModalNavButton,
                selectedIndex === null || selectedIndex >= imageScenes.length - 1
                  ? styles.imageModalNavButtonDisabled
                  : undefined,
                pressed ? styles.buttonPressed : undefined,
              ]}
            >
              <Text style={styles.imageModalNavText}>다음</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

function ResultSection({
  title,
  items,
  preserveWhitespace = false,
}: {
  title: string;
  items?: string[];
  preserveWhitespace?: boolean;
}) {
  const visibleItems = items?.filter((item) => item.trim().length > 0);

  if (!visibleItems || visibleItems.length === 0) {
    return null;
  }

  return (
    <View style={styles.resultDetailSection}>
      <Text style={styles.resultDetailSectionTitle}>{title}</Text>
      {visibleItems.map((item) => (
        <Text
          key={`${title}-${item}`}
          style={[
            styles.resultDetailText,
            preserveWhitespace ? styles.rawResponseText : undefined,
          ]}
        >
          {item}
        </Text>
      ))}
    </View>
  );
}

function ObservationSection({
  title,
  items,
}: {
  title: string;
  items?: AnalysisResult['observations'];
}) {
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <View style={styles.resultDetailSection}>
      <Text style={styles.resultDetailSectionTitle}>{title}</Text>
      {items.map((item) => (
        <Text key={`${title}-${item.label}-${item.detail}`} style={styles.resultDetailText}>
          {item.label}: {item.detail}
          {item.confidence ? ` (${item.confidence})` : ''}
        </Text>
      ))}
    </View>
  );
}

function formatSessionDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const datePart = date.toLocaleDateString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
  });
  const timePart = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return `${datePart} ${timePart}`;
}


function formatConfidence(confidence: AnalysisResult['confidence']) {
  if (!confidence) {
    return undefined;
  }

  return `확신도 ${confidence.level}`;
}
