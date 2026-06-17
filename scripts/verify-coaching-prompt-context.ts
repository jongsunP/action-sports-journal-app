import assert from 'node:assert/strict';
import { buildCoachingInsightPromptSection } from '../src/services/knowledge/coachingPromptContext';
import type { CoachingInsightContext } from '../src/types';

const normalSample: CoachingInsightContext[] = [
  {
    mode: 'direct_cue',
    sourceRuleId: 'strong_pop_supports_rotation.v1',
    category: 'pop',
    message: 'The takeoff quality may support controlled rotation or air position.',
    confidence: 'medium',
    severity: 'info',
    requiresReview: false,
    coachingSafe: true,
  },
];

const lowConfidenceSample: CoachingInsightContext[] = [
  {
    mode: 'internal_only',
    sourceRuleId: 'late_handle_pull_destabilizes_rotation.v1',
    category: 'rotation',
    message: 'Late or loose handle movement may be affecting rotation control.',
    confidence: 'low',
    severity: 'medium',
    requiresReview: true,
    coachingSafe: false,
  },
];

const reviewContextSample: CoachingInsightContext[] = [
  {
    mode: 'review_context',
    sourceRuleId: 'grab_attempt_indicates_air_awareness.v1',
    category: 'grab',
    message: 'A visible grab attempt may indicate developing air awareness.',
    confidence: 'medium',
    severity: 'info',
    requiresReview: true,
    coachingSafe: true,
  },
];

const normalSection = buildCoachingInsightPromptSection(normalSample);
const lowConfidenceSection = buildCoachingInsightPromptSection(lowConfidenceSample);
const reviewSection = buildCoachingInsightPromptSection(reviewContextSample);

assert.ok(normalSection);
assert.ok(normalSection.includes('strong_pop_supports_rotation.v1'));
assert.equal(lowConfidenceSection, undefined);
assert.ok(reviewSection);
assert.ok(reviewSection.includes('mode=review_context'));
assert.ok(reviewSection.includes('확인 필요로만 표현'));

console.log('normal sample before: no KnowledgeInsight context');
console.log(`normal sample after: ${preview(normalSection)}`);
console.log('low confidence sample before: no KnowledgeInsight context');
console.log('low confidence sample after: internal_only excluded from prompt');
console.log('review_context sample before: no KnowledgeInsight context');
console.log(`review_context sample after: ${preview(reviewSection)}`);

function preview(section: string | undefined) {
  return section?.split('\n').slice(0, 10).join(' / ') ?? 'no section';
}
