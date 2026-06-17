import assert from 'node:assert/strict';
import { buildCoachingInsightContext } from '../src/services/knowledge/coachingInsightContext';
import { applyWakeboardKnowledgeRules } from '../src/services/knowledge/wakeboardKnowledgeRules';
import type {
  EdgeLoadObservedFacts,
  EvidenceConfidence,
  EvidenceFact,
  GeminiEvidenceResult,
  LandingObservedFacts,
  PopObservedFacts,
} from '../src/types';

const baseEvidence = (): GeminiEvidenceResult => ({
  id: 'fixture-evidence',
  sessionId: 'fixture-session',
  status: 'completed',
  provider: 'gemini',
  model: 'fixture-model',
  primaryCandidate: {
    name: 'Toeside Basic Jump',
    confidence: 'medium',
    evidence: 'fixture',
  },
  alternativeCandidates: [],
  family: fact('Basic Air', 'medium', 'fixture'),
  approachType: fact('toeside', 'medium', 'fixture'),
  rotationType: fact('none', 'medium', 'fixture'),
  landingOutcome: fact('unknown', 'low', 'fixture'),
  confidence: 'medium',
  evidence: 'fixture',
  evidenceWindows: [],
  observations: [],
  uncertainty: {
    level: 'medium',
    reasons: [],
  },
  createdAt: new Date(0).toISOString(),
});

type KnowledgeRuleFixtureScenario = {
  name: string;
  evidence: GeminiEvidenceResult;
  expectPresent: string[];
  expectAbsent: string[];
};

const scenarios: KnowledgeRuleFixtureScenario[] = [
  {
    name: 'weak edge load with weak pop triggers pop limitation insight',
    evidence: {
      ...baseEvidence(),
      temporalWindows: {
        takeoffTimestamp: {
          timestampSeconds: 1.2,
          confidence: 'medium',
          evidence: 'takeoff visible',
        },
        finalApproachWindow: {
          startSeconds: 0,
          endSeconds: 1.2,
          confidence: 'medium',
          reasonWindowWasChosen: 'fixture',
        },
        ignoredSetupWindows: [],
        approachWindowConfidence: 'medium',
      },
      edgeLoadObservedFacts: edgeLoadFacts({
        edgeLoadVisible: fact('not_visible', 'low', 'edge load is unclear'),
        edgeLoadConfidence: 'low',
        edgeLoadEvidenceText: 'edge load is unclear before takeoff',
      }),
      popObservedFacts: popFacts({
        popType: 'early_release',
        timing: 'early_release',
        intensity: 'weak',
        confidence: 'low',
      }),
    },
    expectPresent: ['weak_edge_load_limits_pop.v1'],
    expectAbsent: ['clean_landing_supports_completion.v1'],
  },
  {
    name: 'clean controlled landing supports completion',
    evidence: {
      ...baseEvidence(),
      landingObservedFacts: landingFacts({
        landingVisible: true,
        landingOutcome: 'rides_away',
        balanceRecovery: 'controlled',
        evidenceText: 'The rider lands on the board and rides away under control.',
        confidence: 'medium',
      }),
    },
    expectPresent: ['clean_landing_supports_completion.v1'],
    expectAbsent: ['grab_attempt_indicates_air_awareness.v1'],
  },
  {
    name: 'validation review flag triggers review insight without false grab insight',
    evidence: {
      ...baseEvidence(),
      grabObservedFacts: {
        grabDetected: false,
        contactVisible: false,
        grabbingHand: 'none',
        grabbedBoardZone: 'none',
        grabTiming: 'none',
        grabDuration: 'none',
        evidenceText: 'No hand-to-board contact is visible.',
        confidence: 'high',
        antiEvidence: ['Hands stay on the handle.'],
      },
      rotationValidation: {
        before: {
          rotationAxis: 'unknown',
          rotationDirection: 'unknown',
          inversionDetected: 'unknown',
          spinDegrees: 'unknown',
          handlePassObserved: 'unknown',
          evidenceText: null,
          confidence: 'low',
          antiEvidence: [],
        },
        after: {
          rotationAxis: 'unknown',
          rotationDirection: 'unknown',
          inversionDetected: 'unknown',
          spinDegrees: 'unknown',
          handlePassObserved: 'unknown',
          evidenceText: null,
          confidence: 'low',
          antiEvidence: [],
        },
        adjusted: false,
        needsReview: true,
        independentRotationEvidenceCount: 0,
        rulesApplied: ['fixture review'],
        rejectedHighConfidenceReasons: [],
      },
    },
    expectPresent: ['low_confidence_facts_require_review.v1'],
    expectAbsent: ['grab_attempt_indicates_air_awareness.v1'],
  },
];

for (const scenario of scenarios) {
  const insights = applyWakeboardKnowledgeRules(scenario.evidence);
  const ruleIds = insights.map((insight) => insight.ruleId);

  for (const expected of scenario.expectPresent) {
    assert.ok(
      ruleIds.includes(expected),
      `${scenario.name}: expected ${expected}, got ${ruleIds.join(', ')}`,
    );
  }

  for (const unexpected of scenario.expectAbsent) {
    assert.ok(
      !ruleIds.includes(unexpected),
      `${scenario.name}: did not expect ${unexpected}, got ${ruleIds.join(', ')}`,
    );
  }

  console.log(`${scenario.name}: ${ruleIds.join(', ') || 'no insights'}`);
}

const coachingContext = buildCoachingInsightContext([
  {
    id: 'direct-fixture',
    ruleId: 'direct_rule.v1',
    category: 'pop',
    message: 'Direct cue fixture.',
    sourceFacts: ['popObservedFacts'],
    confidence: 'medium',
    severity: 'info',
    requiresReview: false,
    coachingSafe: true,
  },
  {
    id: 'review-fixture',
    ruleId: 'review_rule.v1',
    category: 'review',
    message: 'Review context fixture.',
    sourceFacts: ['popValidation'],
    confidence: 'high',
    severity: 'medium',
    requiresReview: true,
    coachingSafe: true,
  },
  {
    id: 'internal-fixture',
    ruleId: 'internal_rule.v1',
    category: 'rotation',
    message: 'Internal only fixture.',
    sourceFacts: ['rotationObservedFacts'],
    confidence: 'low',
    severity: 'medium',
    requiresReview: true,
    coachingSafe: false,
  },
]);

assert.equal(coachingContext[0]?.mode, 'direct_cue');
assert.equal(coachingContext[1]?.mode, 'review_context');
assert.equal(coachingContext[2]?.mode, 'internal_only');

console.log(
  `coaching insight context modes: ${coachingContext
    .map((context) => context.mode)
    .join(', ')}`,
);

function fact(
  value: string,
  confidence: EvidenceConfidence,
  evidence: string,
): EvidenceFact {
  return { value, confidence, evidence };
}

function popFacts(overrides: Partial<PopObservedFacts>): PopObservedFacts {
  return {
    popType: 'unknown',
    timing: 'unknown',
    intensity: 'unknown',
    evidenceText: 'fixture',
    confidence: 'low',
    antiEvidence: [],
    ...overrides,
  };
}

function edgeLoadFacts(
  overrides: Partial<EdgeLoadObservedFacts>,
): EdgeLoadObservedFacts {
  return {
    toeEdgeLoaded: fact('unknown', 'low', 'fixture'),
    heelEdgeLoaded: fact('unknown', 'low', 'fixture'),
    edgeLoadVisible: fact('unknown', 'low', 'fixture'),
    edgeLoadTiming: {
      startSec: null,
      endSec: null,
      observedMoment: 'unknown',
      evidenceFrameDescription: 'fixture',
    },
    boardTiltDirection: fact('unknown', 'low', 'fixture'),
    sprayDirection: fact('unknown', 'low', 'fixture'),
    lineTensionDirection: fact('unknown', 'low', 'fixture'),
    riderWeightOverEdge: fact('unknown', 'low', 'fixture'),
    edgeLoadConfidence: 'low',
    edgeLoadEvidenceText: 'fixture',
    antiEdgeLoadEvidence: [],
    ...overrides,
  };
}

function landingFacts(
  overrides: Partial<LandingObservedFacts>,
): LandingObservedFacts {
  return {
    landingVisible: 'unknown',
    landingOutcome: 'unknown',
    boardContact: 'unknown',
    edgeOnLanding: 'unknown',
    handlePosition: 'unknown',
    balanceRecovery: 'unknown',
    evidenceText: null,
    confidence: 'low',
    antiEvidence: [],
    ...overrides,
  };
}
