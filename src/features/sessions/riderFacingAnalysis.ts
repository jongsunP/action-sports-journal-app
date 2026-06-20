import type { GeminiEvidenceResult } from '../../types';

export type RiderFacingConfidenceLabel = '확실' | '가능성 높음' | '확인 필요';

export type RiderFacingAnalysis = {
  title: string;
  confidenceLabel: RiderFacingConfidenceLabel;
  summary: string;
  confirmedSignals: string[];
  reviewNotes: string[];
  nextPractice: string[];
};

const MAX_LIST_ITEMS = 3;

export function buildRiderFacingAnalysis(
  evidence: GeminiEvidenceResult,
): RiderFacingAnalysis {
  const needsReview = getNeedsReview(evidence);
  const confidenceLabel = getConfidenceLabel(evidence, needsReview);
  const candidateLabel = getCandidateLabel(evidence, confidenceLabel);
  const confirmedSignals = uniqueCompact([
    getApproachSignal(evidence),
    getRotationSignal(evidence),
    getLandingSignal(evidence),
    getGrabSignal(evidence),
    getPopSignal(evidence),
  ]).slice(0, MAX_LIST_ITEMS);
  const reviewNotes = uniqueCompact([
    ...getReviewNotes(evidence, needsReview),
    ...getUncertaintyNotes(evidence),
  ]).slice(0, MAX_LIST_ITEMS);
  const nextPractice = uniqueCompact([
    getEdgePracticeCue(evidence),
    getPopPracticeCue(evidence),
    getLandingPracticeCue(evidence),
  ]).slice(0, MAX_LIST_ITEMS);

  return {
    title: candidateLabel,
    confidenceLabel,
    summary: getSummary(evidence, confidenceLabel),
    confirmedSignals,
    reviewNotes:
      reviewNotes.length > 0
        ? reviewNotes
        : ['현재 결과는 영상 근거를 바탕으로 한 보수적인 요약입니다.'],
    nextPractice:
      nextPractice.length > 0
        ? nextPractice
        : ['다음 영상에서도 접근, 팝, 착지 흐름을 같은 기준으로 확인해보세요.'],
  };
}

function getNeedsReview(evidence: GeminiEvidenceResult) {
  return Boolean(
    evidence.requiresUserConfirmation ||
      evidence.recoveredFromPartial ||
      evidence.qualityMode === 'degraded' ||
      evidence.consistencyStatus === 'needs_review' ||
      evidence.consistencyStatus === 'inconsistent' ||
      evidence.confidence === 'low' ||
      evidence.primaryCandidate.confidence === 'low' ||
      evidence.primaryCandidate.name.trim() === '확인 필요' ||
      evidence.candidateTrace?.needsReview,
  );
}

function getConfidenceLabel(
  evidence: GeminiEvidenceResult,
  needsReview: boolean,
): RiderFacingConfidenceLabel {
  if (needsReview) {
    return '확인 필요';
  }

  if (
    evidence.confidence === 'high' &&
    evidence.primaryCandidate.confidence === 'high'
  ) {
    return '확실';
  }

  return '가능성 높음';
}

function getCandidateLabel(
  evidence: GeminiEvidenceResult,
  confidenceLabel: RiderFacingConfidenceLabel,
) {
  const candidate =
    evidence.candidateTrace?.displayLabel ??
    (isUsableName(evidence.primaryCandidate.name)
      ? evidence.primaryCandidate.name
      : undefined) ??
    (isUsableName(evidence.family.value) ? evidence.family.value : undefined);

  if (!candidate) {
    return '분석 결과를 확인해 주세요';
  }

  if (confidenceLabel === '확실') {
    return `${candidate}로 보입니다`;
  }

  if (confidenceLabel === '가능성 높음') {
    return `${candidate} 가능성이 높습니다`;
  }

  return `${candidate} 검토가 필요합니다`;
}

function getSummary(
  evidence: GeminiEvidenceResult,
  confidenceLabel: RiderFacingConfidenceLabel,
) {
  const family = evidence.safeFamilyCandidate ?? evidence.family.value;
  const approach = getApproachValue(evidence);

  if (confidenceLabel === '확인 필요') {
    return 'AI가 일부 근거를 확신하지 못했습니다. 아래 요약은 확정 판정이 아니라 확인할 지점입니다.';
  }

  if (approach && isUsableName(family)) {
    return `${approach} 접근과 ${family} 계열 신호를 중심으로 분석한 결과입니다.`;
  }

  return '영상에서 보이는 접근, 팝, 회전, 착지 신호를 바탕으로 정리한 요약입니다.';
}

function getApproachSignal(evidence: GeminiEvidenceResult) {
  const approach = getApproachValue(evidence);

  if (!approach) {
    return undefined;
  }

  const confidence =
    evidence.approachDecisionV2?.confidence ?? evidence.approachType.confidence;

  if (confidence === 'low') {
    return `${approach} 접근 가능성이 있지만 추가 확인이 필요합니다.`;
  }

  return `접근 방향은 ${approach}로 보입니다.`;
}

function getRotationSignal(evidence: GeminiEvidenceResult) {
  const rotation = evidence.rotationObservedFacts;

  if (rotation) {
    if (
      rotation.rotationAxis === 'none' &&
      rotation.inversionDetected === false &&
      rotation.spinDegrees === '0'
    ) {
      return '뚜렷한 회전축이나 인버트 동작은 보이지 않습니다.';
    }

    if (
      rotation.inversionDetected === true ||
      rotation.rotationAxis === 'roll_axis' ||
      rotation.rotationAxis === 'flip_axis'
    ) {
      return '회전 또는 인버트 계열로 볼 수 있는 신호가 관찰됐습니다.';
    }
  }

  if (isUsableName(evidence.rotationType.value)) {
    return `회전 판단은 ${evidence.rotationType.value} 기준으로 검토됐습니다.`;
  }

  return undefined;
}

function getLandingSignal(evidence: GeminiEvidenceResult) {
  const landing = evidence.landingObservedFacts;

  if (landing?.landingVisible === false || landing?.landingVisible === 'unknown') {
    return '착지 장면은 영상 기준으로 명확하지 않습니다.';
  }

  if (landing?.landingOutcome === 'rides_away') {
    return '착지는 이어진 것으로 보입니다.';
  }

  if (landing?.landingOutcome === 'butt_check') {
    return '착지 후 균형 회복이 필요한 장면이 보입니다.';
  }

  if (landing?.landingOutcome === 'fall' || landing?.landingOutcome === 'crash') {
    return '착지 또는 회복 과정에서 실패 신호가 보입니다.';
  }

  if (isUsableName(evidence.landingOutcome.value)) {
    return `착지는 ${evidence.landingOutcome.value}로 기록됐습니다.`;
  }

  return undefined;
}

function getGrabSignal(evidence: GeminiEvidenceResult) {
  const grab = evidence.grabObservedFacts;

  if (!grab) {
    return undefined;
  }

  if (grab.grabDetected === false && grab.contactVisible === false) {
    return '명확한 그랩 접촉은 보이지 않습니다.';
  }

  if (grab.grabDetected === true && grab.contactVisible === true) {
    return '손과 보드 접촉 가능성이 보여 그랩 여부를 확인할 수 있습니다.';
  }

  if (grab.grabDetected === 'unknown' || grab.contactVisible === 'unknown') {
    return '그랩 여부는 영상 기준으로 확실하지 않습니다.';
  }

  return undefined;
}

function getPopSignal(evidence: GeminiEvidenceResult) {
  const pop = evidence.popObservedFacts;

  if (!pop?.popType && !pop?.timing && !pop?.intensity) {
    return undefined;
  }

  const timing = pop.timing === 'on_wake' ? '웨이크에서' : undefined;
  const intensity =
    pop.intensity === 'strong'
      ? '강한 팝'
      : pop.intensity === 'moderate'
        ? '중간 정도의 팝'
        : undefined;

  if (timing && intensity) {
    return `${timing} ${intensity}이 관찰됐습니다.`;
  }

  if (pop.confidence === 'low') {
    return '팝 타이밍은 추가 확인이 필요합니다.';
  }

  return undefined;
}

function getReviewNotes(evidence: GeminiEvidenceResult, needsReview: boolean) {
  const notes: string[] = [];

  if (!needsReview) {
    return notes;
  }

  if (evidence.candidateTrace?.displayLabel) {
    notes.push(
      `${evidence.candidateTrace.displayLabel}는 확정 기술명이 아니라 검토 후보입니다.`,
    );
  }

  if (
    evidence.consistencyStatus === 'needs_review' ||
    evidence.consistencyStatus === 'inconsistent'
  ) {
    notes.push('일부 판단 사이에 불확실성이 있어 세부 근거 확인이 필요합니다.');
  }

  if (evidence.confidence === 'low' || evidence.primaryCandidate.confidence === 'low') {
    notes.push('기술명 확신도가 낮아 단정하지 않는 것이 안전합니다.');
  }

  if (evidence.qualityMode === 'degraded' || evidence.recoveredFromPartial) {
    notes.push('AI 응답 품질이 낮거나 일부만 복구되어 재분석이 도움이 될 수 있습니다.');
  }

  return notes;
}

function getUncertaintyNotes(evidence: GeminiEvidenceResult) {
  return evidence.uncertainty.reasons
    .map((reason) => normalizeSentence(reason))
    .filter(Boolean);
}

function getEdgePracticeCue(evidence: GeminiEvidenceResult) {
  const edge = evidence.edgeLoadObservedFacts;

  if (!edge) {
    return undefined;
  }

  if (
    edge.edgeLoadConfidence === 'low' ||
    edge.edgeLoadVisible.confidence === 'low'
  ) {
    return '다음 영상에서는 웨이크 끝까지 엣지가 유지되는지 확인해보세요.';
  }

  if (edge.edgeLoadConfidence === 'high') {
    return '좋은 엣지 흐름이 보이면 같은 진입 속도와 라인 텐션을 반복해보세요.';
  }

  return undefined;
}

function getPopPracticeCue(evidence: GeminiEvidenceResult) {
  const pop = evidence.popObservedFacts;

  if (!pop) {
    return undefined;
  }

  if (pop.timing === 'early_release' || pop.intensity === 'weak') {
    return '팝 전에 서두르지 말고 웨이크 정점까지 기다리는지 확인해보세요.';
  }

  if (pop.popType === 'progressive_pop' && pop.timing === 'on_wake') {
    return '웨이크 위에서 만들어진 팝 타이밍을 다음 시도에서도 반복해보세요.';
  }

  return undefined;
}

function getLandingPracticeCue(evidence: GeminiEvidenceResult) {
  const landing = evidence.landingObservedFacts;

  if (!landing) {
    return undefined;
  }

  if (landing.landingOutcome === 'rides_away') {
    return '착지 후 핸들과 시선이 안정적으로 유지되는지 이어서 확인해보세요.';
  }

  if (
    landing.landingOutcome === 'butt_check' ||
    landing.landingOutcome === 'fall' ||
    landing.landingOutcome === 'crash'
  ) {
    return '착지에서는 보드가 먼저 닿은 뒤 핸들을 몸 가까이에 두는지 확인해보세요.';
  }

  return undefined;
}

function getApproachValue(evidence: GeminiEvidenceResult) {
  const value = evidence.approachDecisionV2?.value ?? evidence.approachType.value;

  if (!value || value === 'unknown' || value === 'ambiguous') {
    return undefined;
  }

  if (value === 'toeside') {
    return '토사이드';
  }

  if (value === 'heelside') {
    return '힐사이드';
  }

  if (value === 'switch') {
    return '스위치';
  }

  return value;
}

function isUsableName(value?: string | null) {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();

  return Boolean(
    normalized &&
      normalized !== 'unknown' &&
      normalized !== '확인 필요' &&
      normalized !== 'needs_review',
  );
}

function normalizeSentence(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return undefined;
  }

  return normalized.endsWith('.') || normalized.endsWith('요')
    ? normalized
    : `${normalized}.`;
}

function uniqueCompact(values: Array<string | undefined>) {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const value of values) {
    const normalized = value?.replace(/\s+/g, ' ').trim();

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    next.push(normalized);
  }

  return next;
}
