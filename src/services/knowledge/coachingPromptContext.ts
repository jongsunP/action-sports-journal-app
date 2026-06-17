import type { CoachingInsightContext } from '../../types';

const MAX_PROMPT_CONTEXT_ITEMS = 4;

export function buildCoachingInsightPromptSection(
  contexts: CoachingInsightContext[],
): string | undefined {
  const promptSafeContexts = contexts
    .filter((context) => context.mode !== 'internal_only')
    .slice(0, MAX_PROMPT_CONTEXT_ITEMS);

  if (promptSafeContexts.length === 0) {
    return undefined;
  }

  return [
    '코칭 참고 신호:',
    '아래 신호는 확정 진단이 아닙니다. confidence를 유지하고 과장하지 마세요.',
    'review_context는 "확인 필요"로만 표현하세요. internal_only는 제외되었습니다.',
    ...promptSafeContexts.map(formatContextForPrompt),
  ].join('\n');
}

function formatContextForPrompt(
  context: CoachingInsightContext,
  index: number,
) {
  const wording =
    context.mode === 'review_context'
      ? '확인 필요로만 표현'
      : '관찰 기반 cue로만 표현';

  return [
    `${index + 1}. mode=${context.mode} / rule=${context.sourceRuleId} / ${context.category} / confidence=${context.confidence} / severity=${context.severity}`,
    `   message=${context.message}`,
    `   wording=${wording}`,
  ].join('\n');
}
