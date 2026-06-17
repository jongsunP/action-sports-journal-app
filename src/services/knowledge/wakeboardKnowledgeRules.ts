import type {
  EdgeLoadObservedFacts,
  EvidenceConfidence,
  GeminiEvidenceResult,
  KnowledgeInsight,
  KnowledgeInsightCategory,
  KnowledgeInsightSeverity,
  WakeboardKnowledgeRule,
} from '../../types';

const KNOWLEDGE_RULE_VERSION = 'v1';

export const wakeboardKnowledgeRules: WakeboardKnowledgeRule[] = [
  {
    id: `weak_edge_load_limits_pop.${KNOWLEDGE_RULE_VERSION}`,
    title: 'Weak edge load may limit pop',
    category: 'edge_load',
    inputFacts: ['edgeLoadObservedFacts', 'popObservedFacts'],
    apply: applyWeakEdgeLoadLimitsPop,
  },
  {
    id: `strong_pop_supports_rotation.${KNOWLEDGE_RULE_VERSION}`,
    title: 'Strong pop can support rotation control',
    category: 'pop',
    inputFacts: ['popObservedFacts', 'rotationObservedFacts'],
    apply: applyStrongPopSupportsRotation,
  },
  {
    id: `late_handle_pull_destabilizes_rotation.${KNOWLEDGE_RULE_VERSION}`,
    title: 'Late handle movement may destabilize rotation',
    category: 'rotation',
    inputFacts: [
      'approachObservedFacts.handlePosition',
      'rotationObservedFacts',
      'landingObservedFacts.handlePosition',
    ],
    apply: applyLateHandlePullDestabilizesRotation,
  },
  {
    id: `clean_landing_supports_completion.${KNOWLEDGE_RULE_VERSION}`,
    title: 'Clean landing supports completion confidence',
    category: 'completion',
    inputFacts: ['landingObservedFacts'],
    apply: applyCleanLandingSupportsCompletion,
  },
  {
    id: `grab_attempt_indicates_air_awareness.${KNOWLEDGE_RULE_VERSION}`,
    title: 'Grab attempt can indicate air awareness',
    category: 'grab',
    inputFacts: ['grabObservedFacts', 'popObservedFacts'],
    apply: applyGrabAttemptIndicatesAirAwareness,
  },
  {
    id: `low_confidence_facts_require_review.${KNOWLEDGE_RULE_VERSION}`,
    title: 'Low confidence facts require review',
    category: 'review',
    inputFacts: [
      'approachDecisionV2',
      'edgeLoadValidation',
      'popValidation',
      'rotationValidation',
      'grabValidation',
      'landingValidation',
    ],
    apply: applyLowConfidenceFactsRequireReview,
  },
];

export function applyWakeboardKnowledgeRules(
  evidenceResult: GeminiEvidenceResult,
): KnowledgeInsight[] {
  return wakeboardKnowledgeRules.flatMap((rule) => rule.apply(evidenceResult));
}

function applyWeakEdgeLoadLimitsPop(
  evidence: GeminiEvidenceResult,
): KnowledgeInsight[] {
  const edgeLoad = evidence.edgeLoadObservedFacts;
  const pop = evidence.popObservedFacts;

  if (!edgeLoad || !pop) {
    return [];
  }

  const edgeWeak = isWeakEdgeLoad(edgeLoad);
  const popWeak = isWeakPop(pop.popType, pop.timing, pop.intensity, pop.confidence);

  if (!edgeWeak || !popWeak) {
    return [];
  }

  const finalApproachConfidence =
    evidence.temporalWindows?.finalApproachWindow.confidence;
  const confidence = confidenceMin(
    edgeLoad.edgeLoadConfidence,
    pop.confidence,
    finalApproachConfidence ?? 'medium',
  );

  return [
    createInsight({
      ruleId: `weak_edge_load_limits_pop.${KNOWLEDGE_RULE_VERSION}`,
      category: 'edge_load',
      message: 'Weak or unclear edge load may be limiting pop.',
      sourceFacts: ['edgeLoadObservedFacts', 'popObservedFacts'],
      confidence: confidence === 'high' ? 'medium' : confidence,
      severity: 'medium',
      requiresReview:
        finalApproachConfidence === 'low' ||
        evidence.edgeLoadValidation?.needsReview === true ||
        evidence.popValidation?.needsReview === true,
      coachingSafe: confidence !== 'low' && finalApproachConfidence !== 'low',
    }),
  ];
}

function applyStrongPopSupportsRotation(
  evidence: GeminiEvidenceResult,
): KnowledgeInsight[] {
  const pop = evidence.popObservedFacts;

  if (!pop) {
    return [];
  }

  const popType = normalizeToken(pop.popType);
  const timing = normalizeToken(pop.timing);
  const intensity = normalizeToken(pop.intensity);
  const supportedPop =
    ['progressive_pop', 'trip_pop'].includes(popType) &&
    timing === 'on_wake' &&
    ['moderate', 'strong'].includes(intensity) &&
    pop.confidence !== 'low' &&
    !isLabelOnly(pop.evidenceText);

  if (!supportedPop) {
    return [];
  }

  const rotationNeedsReview = evidence.rotationValidation?.needsReview === true;

  return [
    createInsight({
      ruleId: `strong_pop_supports_rotation.${KNOWLEDGE_RULE_VERSION}`,
      category: 'pop',
      message: 'The takeoff quality may support controlled rotation or air position.',
      sourceFacts: ['popObservedFacts', 'rotationObservedFacts'],
      confidence: rotationNeedsReview ? 'low' : 'medium',
      severity: 'info',
      requiresReview: rotationNeedsReview,
      coachingSafe: !rotationNeedsReview,
    }),
  ];
}

function applyLateHandlePullDestabilizesRotation(
  evidence: GeminiEvidenceResult,
): KnowledgeInsight[] {
  const handleText = [
    evidence.approachObservedFacts?.handlePosition.evidence,
    evidence.approachObservedFacts?.handlePosition.value,
    evidence.landingObservedFacts?.handlePosition,
    evidence.landingObservedFacts?.evidenceText,
    evidence.rotationObservedFacts?.evidenceText,
  ].join(' ');
  const explicitHandleIssue = hasLateHandleEvidence(handleText);
  const rotationUnstable = hasUnstableRotationEvidence(evidence);
  const landingUnstable = hasUnstableLandingEvidence(evidence);

  if (!explicitHandleIssue || (!rotationUnstable && !landingUnstable)) {
    return [];
  }

  const confidence =
    evidence.rotationObservedFacts?.confidence === 'high' &&
    evidence.landingObservedFacts?.confidence !== 'low'
      ? 'medium'
      : 'low';

  return [
    createInsight({
      ruleId: `late_handle_pull_destabilizes_rotation.${KNOWLEDGE_RULE_VERSION}`,
      category: 'rotation',
      message: 'Late or loose handle movement may be affecting rotation control.',
      sourceFacts: [
        'approachObservedFacts.handlePosition',
        'rotationObservedFacts',
        'landingObservedFacts.handlePosition',
      ],
      confidence,
      severity: 'medium',
      requiresReview: true,
      coachingSafe: confidence === 'medium',
    }),
  ];
}

function applyCleanLandingSupportsCompletion(
  evidence: GeminiEvidenceResult,
): KnowledgeInsight[] {
  const landing = evidence.landingObservedFacts;

  if (!landing || landing.landingVisible !== true) {
    return [];
  }

  const outcome = normalizeToken(landing.landingOutcome);
  const recovery = normalizeToken(landing.balanceRecovery);
  const cleanLanding =
    ['rides_away', 'clean'].includes(outcome) &&
    ['controlled', 'stable'].includes(recovery) &&
    !isLabelOnly(landing.evidenceText);

  if (!cleanLanding) {
    return [];
  }

  return [
    createInsight({
      ruleId: `clean_landing_supports_completion.${KNOWLEDGE_RULE_VERSION}`,
      category: 'completion',
      message: 'Visible controlled landing supports completion confidence.',
      sourceFacts: ['landingObservedFacts'],
      confidence: landing.confidence === 'low' ? 'low' : 'medium',
      severity: 'info',
      requiresReview:
        landing.confidence === 'low' || evidence.landingValidation?.needsReview === true,
      coachingSafe:
        landing.confidence !== 'low' && evidence.landingValidation?.needsReview !== true,
    }),
  ];
}

function applyGrabAttemptIndicatesAirAwareness(
  evidence: GeminiEvidenceResult,
): KnowledgeInsight[] {
  const grab = evidence.grabObservedFacts;

  if (!grab) {
    return [];
  }

  const duration = normalizeToken(grab.grabDuration);
  const text = normalizeToken(grab.evidenceText);
  const actualGrabDetected = grab.grabDetected === true && grab.contactVisible === true;
  const attemptedReach =
    !actualGrabDetected &&
    (duration === 'attempted_reach' ||
      /attempt|reach|reaching|toward|시도|뻗|가져가|향해/.test(text));

  if (!attemptedReach) {
    return [];
  }

  return [
    createInsight({
      ruleId: `grab_attempt_indicates_air_awareness.${KNOWLEDGE_RULE_VERSION}`,
      category: 'grab',
      message: 'A visible grab attempt may indicate developing air awareness.',
      sourceFacts: ['grabObservedFacts', 'popObservedFacts'],
      confidence: grab.confidence === 'high' ? 'medium' : grab.confidence,
      severity: 'info',
      requiresReview: grab.contactVisible !== true,
      coachingSafe: true,
    }),
  ];
}

function applyLowConfidenceFactsRequireReview(
  evidence: GeminiEvidenceResult,
): KnowledgeInsight[] {
  const sourceFacts: string[] = [];

  if (evidence.approachDecisionV2?.confidence === 'low') {
    sourceFacts.push('approachDecisionV2');
  }

  addValidationReviewSource(
    sourceFacts,
    evidence.edgeLoadValidation?.needsReview,
    'edgeLoadValidation',
  );
  addValidationReviewSource(
    sourceFacts,
    evidence.popValidation?.needsReview,
    'popValidation',
  );
  addValidationReviewSource(
    sourceFacts,
    evidence.rotationValidation?.needsReview,
    'rotationValidation',
  );
  addValidationReviewSource(
    sourceFacts,
    evidence.grabValidation?.needsReview,
    'grabValidation',
  );
  addValidationReviewSource(
    sourceFacts,
    evidence.landingValidation?.needsReview,
    'landingValidation',
  );

  if (evidence.consistencyStatus && evidence.consistencyStatus !== 'valid') {
    sourceFacts.push('consistencyStatus');
  }

  if (evidence.confidence === 'low') {
    sourceFacts.push('confidence');
  }

  if (sourceFacts.length === 0) {
    return [];
  }

  const hasDeterministicReviewFlag = sourceFacts.some((source) =>
    source.endsWith('Validation') || source === 'consistencyStatus',
  );

  return [
    createInsight({
      ruleId: `low_confidence_facts_require_review.${KNOWLEDGE_RULE_VERSION}`,
      category: 'review',
      message:
        'Some evidence is uncertain and should be reviewed before giving firm coaching.',
      sourceFacts,
      confidence: hasDeterministicReviewFlag ? 'high' : 'medium',
      severity: 'medium',
      requiresReview: true,
      coachingSafe: true,
    }),
  ];
}

function createInsight({
  ruleId,
  category,
  message,
  sourceFacts,
  confidence,
  severity,
  requiresReview,
  coachingSafe,
}: {
  ruleId: string;
  category: KnowledgeInsightCategory;
  message: string;
  sourceFacts: string[];
  confidence: EvidenceConfidence;
  severity: KnowledgeInsightSeverity;
  requiresReview: boolean;
  coachingSafe: boolean;
}): KnowledgeInsight {
  return {
    id: `${ruleId}:${sourceFacts.join('+')}`,
    ruleId,
    category,
    message,
    sourceFacts,
    confidence,
    severity,
    requiresReview,
    coachingSafe,
  };
}

function isWeakEdgeLoad(edgeLoad: EdgeLoadObservedFacts) {
  const visible = normalizeToken(edgeLoad.edgeLoadVisible.value);
  const evidence = normalizeToken(edgeLoad.edgeLoadEvidenceText);

  return (
    edgeLoad.edgeLoadConfidence === 'low' ||
    ['false', 'no', 'none', 'not_visible', 'unknown', 'unclear'].includes(
      visible,
    ) ||
    /unclear|unknown|not visible|no clear|없|불명확|보이지/.test(evidence)
  );
}

function isWeakPop(
  popType: string | null,
  timing: string | null,
  intensity: string | null,
  confidence: EvidenceConfidence,
) {
  const type = normalizeToken(popType);
  const popTiming = normalizeToken(timing);
  const popIntensity = normalizeToken(intensity);

  return (
    confidence === 'low' ||
    ['weak', 'low', 'minimal', 'unknown', 'no_clear_pop'].includes(type) ||
    ['early_release', 'late_pop', 'unknown', 'no_clear_pop'].includes(popTiming) ||
    ['weak', 'low', 'minimal', 'unknown'].includes(popIntensity)
  );
}

function hasLateHandleEvidence(text: string) {
  return /late handle|handle.*late|handle.*away|loose handle|handle pass timing|핸들.*늦|늦은.*핸들|핸들.*멀|핸들.*빠져|핸들.*타이밍/i.test(
    text,
  );
}

function hasUnstableRotationEvidence(evidence: GeminiEvidenceResult) {
  const rotationText = normalizeToken(evidence.rotationObservedFacts?.evidenceText);
  const axis = normalizeToken(evidence.rotationObservedFacts?.rotationAxis);

  return (
    evidence.rotationValidation?.needsReview === true ||
    ['off_axis', 'unknown'].includes(axis) ||
    /unstable|off.axis|late|불안정|축.*흔들|늦/.test(rotationText)
  );
}

function hasUnstableLandingEvidence(evidence: GeminiEvidenceResult) {
  const outcome = normalizeToken(evidence.landingObservedFacts?.landingOutcome);
  const recovery = normalizeToken(evidence.landingObservedFacts?.balanceRecovery);

  return (
    evidence.landingValidation?.needsReview === true ||
    ['butt_check', 'crash', 'fall', 'edge_catch'].includes(outcome) ||
    ['unstable', 'poor', 'lost_balance'].includes(recovery)
  );
}

function addValidationReviewSource(
  sourceFacts: string[],
  needsReview: boolean | undefined,
  source: string,
) {
  if (needsReview) {
    sourceFacts.push(source);
  }
}

function confidenceMin(
  ...values: Array<EvidenceConfidence | undefined>
): EvidenceConfidence {
  if (values.includes('low')) {
    return 'low';
  }

  if (values.includes('medium')) {
    return 'medium';
  }

  return 'high';
}

function isLabelOnly(evidenceText: string | null | undefined) {
  if (!evidenceText || evidenceText.trim().length === 0) {
    return true;
  }

  const text = normalizeToken(evidenceText);

  return /^(clean|rides_away|progressive_pop|trip_pop|grab|attempted_reach|strong|moderate|weak)$/.test(
    text,
  );
}

function normalizeToken(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, '_') ?? '';
}
