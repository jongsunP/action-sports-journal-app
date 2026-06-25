import { useState } from 'react';
import { useEventListener } from 'expo';
import {
  ActivityIndicator,
  Alert,
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
  getMomentStatusLabel,
  getMomentStatusMessage,
  getRetryEligibility,
} from './momentStatus';
import {
  buildRiderFacingAnalysis,
  type RiderFacingAnalysis,
} from './riderFacingAnalysis';
import { MomentStatusDot } from './sessionComponents';
import { getSessionDisplayTitle } from './sessionFormatters';

import type { SessionVideoAsset } from '../../services/ai';
import type { AnalysisResult, GeminiEvidenceResult, MomentStatus, Session } from '../../types';

const ENABLE_INTERNAL_DEBUG_VIEWER =
  __DEV__ || process.env.EXPO_PUBLIC_ENABLE_DEBUG_VIEWER === 'true';

type HomeScreenStyles = Record<string, any>;
let styles: HomeScreenStyles;

function LocalSessionVideoPlayer({
  thumbnailUri,
  videoUri,
}: {
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
        <Image
          resizeMode="cover"
          source={{ uri: thumbnailUri }}
          style={styles.detailVideo}
        />
      );
    }

    return (
      <View style={styles.videoMissingFallback}>
        <Text style={styles.videoMissingTitle}>영상 파일을 다시 선택해 주세요.</Text>
        <Text style={styles.videoMissingText}>
          로컬 영상 위치가 바뀌었거나 접근 권한이 만료되었습니다.
        </Text>
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
      evidence.requiresUserConfirmation ||
      evidence.consistencyStatus === 'needs_review' ||
      evidence.consistencyStatus === 'inconsistent' ||
      evidence.confidence === 'low' ||
      evidence.primaryCandidate.confidence === 'low' ||
      evidence.candidateTrace?.displayLabel,
  );
}

export type MomentDetailContentProps = {
  canRequestGeminiEvidence: boolean;
  debugEndpoint?: string;
  evidence?: GeminiEvidenceResult;
  isDeleting?: boolean;
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
  evidence,
  isDeleting = false,
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
  if (!session) {
    return null;
  }

  const retryEligibility = getRetryEligibility({
    canRequestGeminiEvidence,
    evidence,
    isLoading,
    momentStatus,
    session,
    video,
  });
  const visibleEvidence =
    evidence && (!momentStatus || momentStatus === 'completed')
      ? evidence
      : undefined;
  const shouldShowStatusMessage = Boolean(
    momentStatus && momentStatus !== 'completed',
  );
  const statusMessage = momentStatus
    ? getMomentStatusMessage(momentStatus)
    : undefined;
  const shouldShowTrickReviewAction = shouldShowTrickConfirmationAction(
    visibleEvidence,
  );
  const handleOpenTrickReview = () => {
    Alert.alert(
      '기술명 확인',
      '검토가 필요한 분석입니다. 기술 확정은 다음 단계에서 action sheet로 제공할 예정입니다.',
    );
  };
  const shouldShowInlineRetry =
    retryEligibility.canRetry && momentStatus === 'failed' && Boolean(onRetry);

  return (
    <SafeAreaView style={styles.detailModalContainer}>
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
            {getSessionDisplayTitle(session, visibleEvidence)}
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
              accessibilityLabel={isDeleting ? '영상 삭제 중' : '영상 삭제'}
              accessibilityRole="button"
              disabled={isDeleting}
              onPress={onDelete}
              style={({ pressed }) => [
                styles.detailHeaderDeleteButton,
                isDeleting ? styles.detailHeaderDeleteButtonDisabled : undefined,
                pressed ? styles.buttonPressed : undefined,
              ]}
            >
              {isDeleting ? (
                <Text style={styles.detailHeaderDeleteText}>삭제 중…</Text>
              ) : (
                <View style={styles.detailTrashIcon}>
                  <View style={styles.detailTrashLid} />
                  <View style={styles.detailTrashCan} />
                </View>
              )}
            </Pressable>
          ) : null}
        </View>
      </View>
      <ScrollView
        contentContainerStyle={styles.detailModalBody}
        showsVerticalScrollIndicator
      >
        <View style={styles.detailVideoFrame}>
          {shouldShowInlineRetry ? (
            <Pressable
              accessibilityRole="button"
              onPress={onRetry}
              style={({ pressed }) => [
                styles.detailInlineRetry,
                pressed ? styles.buttonPressed : undefined,
              ]}
            >
              <Text style={styles.detailInlineRetryTitle}>분석 다시 시도</Text>
              <Text style={styles.detailInlineRetryText}>
                분석에 실패했습니다. 다시 요청할 수 있습니다.
              </Text>
            </Pressable>
          ) : video ? (
            <LocalSessionVideoPlayer
              thumbnailUri={thumbnailUri}
              videoUri={video.uri}
            />
          ) : thumbnailUri ? (
            <Image
              resizeMode="cover"
              source={{ uri: thumbnailUri }}
              style={styles.detailVideo}
            />
          ) : (
            <View style={styles.videoMissingFallback}>
              <Text style={styles.videoMissingTitle}>영상이 필요합니다</Text>
              <Text style={styles.videoMissingText}>
                원본 영상은 이 기기에 없지만, 저장된 분석 결과는 계속 확인할 수
                있습니다.
              </Text>
            </View>
          )}
        </View>

          {shouldShowTrickReviewAction ? (
            <Pressable
              accessibilityRole="button"
              onPress={handleOpenTrickReview}
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
          ) : null}

          <View style={styles.detailSummaryCard}>
            <Text style={styles.detailSectionHeading}>메모</Text>
            {session.notes ? (
              <Text style={styles.detailMomentReason}>{session.notes}</Text>
            ) : null}
          </View>

            {shouldShowStatusMessage && statusMessage ? (
              <View style={styles.detailStateCard}>
                <Text style={styles.detailStateTitle}>{statusMessage.title}</Text>
                <Text style={styles.detailStateText}>
                  {statusMessage.body}
                </Text>
              </View>
            ) : null}
            {visibleEvidence ? (
              <>
                <RiderFacingAnalysisCard
                  analysis={buildRiderFacingAnalysis(visibleEvidence)}
                />
                <GeminiEvidenceView evidence={visibleEvidence} />
              </>
            ) : !shouldShowStatusMessage && !isLoading && video ? (
              <View style={styles.detailStateCard}>
                <Text style={styles.detailStateTitle}>아직 추출 결과가 없습니다</Text>
                <Text style={styles.detailStateText}>
                  다시 시도를 누르면 Gemini evidence endpoint만 호출합니다.
                </Text>
              </View>
            ) : null}
            {debugEndpoint ? (
              <View style={styles.debugBox}>
                <Text style={styles.debugText}>
                  DEV endpoint: {debugEndpoint}
                </Text>
              </View>
            ) : null}
      </ScrollView>
      {isDeleting ? (
        <View accessibilityRole="progressbar" style={styles.uploadBlockingOverlay}>
          <View style={styles.uploadBlockingCard}>
            <ActivityIndicator color="#f8fafc" size="large" />
            <Text style={styles.uploadBlockingTitle}>
              영상을 삭제하고 있습니다.
            </Text>
            <Text style={styles.uploadBlockingText}>
              잠시만 기다려 주세요.
            </Text>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
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
        <Text style={styles.riderAnalysisBadge}>{analysis.confidenceLabel}</Text>
      </View>
      <Text style={styles.riderAnalysisTitle}>{analysis.title}</Text>
      <Text style={styles.riderAnalysisSummary}>{analysis.summary}</Text>
      <RiderAnalysisList title="확인된 신호" items={analysis.confirmedSignals} />
      <RiderAnalysisList title="확인할 점" items={analysis.reviewNotes} />
      <RiderAnalysisList title="다음 연습" items={analysis.nextPractice} />
    </View>
  );
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
        {evidence.status === 'failed' ? 'Gemini 근거 추출 실패' : 'Gemini 동작 근거'}
      </Text>
      <Text
        style={[
          styles.evidenceModelBadge,
          evidence.qualityMode === 'degraded'
            ? styles.evidenceModelBadgeDegraded
            : undefined,
        ]}
      >
        모델: {evidence.model ?? 'unknown'} ·{' '}
        {evidence.qualityMode === 'degraded'
          ? 'degraded / low-confidence'
          : 'standard'}
      </Text>
      <View style={styles.evidenceSummaryGrid}>
        <EvidenceSummaryCard label="Predicted" value={evidence.primaryCandidate.name} />
        <EvidenceSummaryCard label="Family" value={evidence.family.value} />
        <EvidenceSummaryCard label="Confidence" value={evidence.confidence} />
        <EvidenceSummaryCard
          label="Review"
          value={
            evidence.requiresUserConfirmation ||
            evidence.consistencyStatus === 'needs_review' ||
            evidence.consistencyStatus === 'inconsistent'
              ? 'needs_review'
              : 'ok'
          }
        />
      </View>
      <View style={styles.evidenceFactRow}>
        <Text style={styles.evidenceFactLabel}>AI 추정 기술</Text>
        <Text style={styles.evidenceFactValue}>
          {evidence.primaryCandidate.name} ({evidence.primaryCandidate.confidence})
        </Text>
        {shouldAskUser ? (
          <Text style={styles.evidenceWarningText}>
            {hasConsistencyIssue
              ? 'AI 추정 결과에 내부 불일치가 있어 상세 검토가 필요합니다.'
              : evidence.qualityMode === 'degraded'
              ? '서비스 혼잡으로 낮은 품질 fallback 결과입니다. 코칭 전에 상세 검토가 필요합니다.'
              : evidence.recoveredFromPartial
                ? 'Gemini 응답 일부만 복구된 결과입니다. 코칭 전에 상세 검토가 필요합니다.'
              : 'AI가 기술명을 확신하지 못했습니다. 확정 기술명이 아닌 검토 후보로 봐주세요.'}
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
            {candidateTrace.displayLabel} ({candidateTrace.confidence})
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
              {window.label} ({window.confidence}): {window.evidence}
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
              {observation.confidence}): {observation.detail}
            </Text>
          ))}
        </View>
      ) : null}
      <View style={styles.evidenceSection}>
        <Text style={styles.evidenceSectionTitle}>
          불확실성 ({evidence.uncertainty.level})
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
        stance: {facts.stance.value} ({facts.stance.confidence})
      </Text>
      <Text style={styles.evidenceText}>
        leadFoot: {facts.leadFoot.value} ({facts.leadFoot.confidence})
      </Text>
      <Text style={styles.evidenceText}>
        boardDirection: {facts.boardDirection.value} (
        {facts.boardDirection.confidence})
      </Text>
      <Text style={styles.evidenceText}>
        wakePath: {facts.wakeCrossingPath.startPosition} →{' '}
        {facts.wakeCrossingPath.takeoffPosition} →{' '}
        {facts.wakeCrossingPath.landingPosition} (
        {facts.wakeCrossingPath.confidence})
      </Text>
      <Text style={styles.evidenceText}>
        edge: {facts.edgeDirectionEvidence.value} (
        {facts.edgeDirectionEvidence.confidence})
      </Text>
      <Text style={styles.evidenceText}>
        handle/body: {facts.handlePosition.value} · {facts.bodyOrientation.value}
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
        bodyInverted: {formatObservedBoolean(facts.bodyInverted)}
      </Text>
      <Text style={styles.evidenceText}>
        boardAboveHead: {formatObservedBoolean(facts.boardAboveHead)}
      </Text>
      <Text style={styles.evidenceText}>
        rollAxisObserved: {formatObservedBoolean(facts.rollAxisObserved)}
      </Text>
      <Text style={styles.evidenceText}>
        flipAxisObserved: {formatObservedBoolean(facts.flipAxisObserved)}
      </Text>
      <Text style={styles.evidenceText}>
        duration: {duration} ({facts.inversionDuration.confidence})
      </Text>
      <Text style={styles.evidenceText}>
        evidenceCount: {facts.inversionEvidenceCount}
      </Text>
      {facts.antiInversionEvidence.slice(0, 3).map((item) => (
        <Text key={item} style={styles.evidenceText}>
          anti: {item}
        </Text>
      ))}
    </View>
  );
}

function formatObservedBoolean(value: true | false | 'unknown') {
  if (value === true) {
    return 'true';
  }

  if (value === false) {
    return 'false';
  }

  return 'unknown';
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
        {value} ({confidence})
      </Text>
      <Text style={styles.evidenceText}>{evidence}</Text>
    </View>
  );
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
