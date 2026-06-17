import type { CoachingInsightContext, KnowledgeInsight } from '../../types';

export function buildCoachingInsightContext(
  knowledgeInsights: KnowledgeInsight[],
): CoachingInsightContext[] {
  return knowledgeInsights.map((insight) => ({
    mode: getCoachingInsightMode(insight),
    sourceRuleId: insight.ruleId,
    category: insight.category,
    message: insight.message,
    confidence: insight.confidence,
    severity: insight.severity,
    requiresReview: insight.requiresReview,
    coachingSafe: insight.coachingSafe,
  }));
}

function getCoachingInsightMode(
  insight: KnowledgeInsight,
): CoachingInsightContext['mode'] {
  if (!insight.coachingSafe) {
    return 'internal_only';
  }

  if (insight.requiresReview) {
    return 'review_context';
  }

  return 'direct_cue';
}
