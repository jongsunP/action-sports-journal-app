# KnowledgeInsight To Coaching Design

This document designs how Wakeboard Knowledge Base v1 should connect to the
Coaching Layer later.

This is a design document only. It does not change code, prompts, database
schema, UI, or deployment architecture.

## Current Status

Confirmed Fact:

- Wakeboard Knowledge Base v1 is implemented.
- Render + Gemini 2.5 Pro E2E verified that `knowledgeInsights` are returned in
  evidence/debug response.
- `knowledgeInsights` are not stored in Supabase.
- No UI renders `knowledgeInsights`.
- Coaching does not consume `knowledgeInsights` yet.

Current relevant documents:

- `docs/WAKEBOARD_KNOWLEDGE_BASE_DESIGN.md`
- `docs/AI_COACHING_PRINCIPLES.md`
- `docs/AI_ANALYSIS_PIPELINE_DESIGN.md`
- `docs/WAKEBOARD_OBSERVED_FACTS_V3_PLAN.md`

## Current Coaching Code Paths

### Gemini Short Analysis Path

Relevant files:

- `dev-server/index.ts`
- `src/services/ai/analyzeSessionVideo.ts`
- `src/features/sessions/HomeScreen.tsx`

Current endpoint:

```text
POST /api/analyze-session-video
```

Current prompt function:

```text
buildGeminiAnalysisPrompt
```

Current output shape:

```text
summary
highlights
highlightScenes
suggestions
```

Observation:

This path is a shorter Gemini-generated coaching/summary path. It is separate
from the Gemini evidence extraction path that now produces ObservedFacts and
KnowledgeInsights.

### Gemini Evidence Path

Relevant files:

- `dev-server/index.ts`
- `src/services/ai/analyzeSessionVideo.ts`
- `src/services/knowledge/wakeboardKnowledgeRules.ts`

Current endpoint:

```text
POST /api/extract-session-evidence
```

Current output includes:

```text
ObservedFacts
Validation results
KnowledgeInsights
```

Observation:

This path currently produces the most trustworthy coaching inputs, but it does
not generate rider-facing coaching prose.

### OpenAI Benchmark / Coach Path

Relevant files:

- `dev-server/index.ts`
- `src/services/ai/analyzeSessionVideo.ts`
- `src/features/sessions/HomeScreen.tsx`

Current endpoint:

```text
POST /api/benchmarks/openai-wakeboard-video
```

Current prompt functions:

```text
buildOpenAiMotionScoutInstructions
buildOpenAiMotionScoutPrompt
buildOpenAiCoachInstructions
buildOpenAiBenchmarkPrompt
```

Current response shape:

```text
humanReadableAnalysis
summary
highlights
highlightScenes
observations
patternRecognition
inferences
confidence
selfCritique
suggestions
```

Observation:

This is currently the richest coaching/report path. It still works directly
from sampled frames and prompt instructions. It does not yet consume
KnowledgeInsights from the evidence pipeline.

### App Display Path

Relevant file:

```text
src/features/sessions/HomeScreen.tsx
```

Current display components:

- `AnalysisResultView`
- `CoachingResultDetail`
- `GeminiEvidenceView`

Observation:

The app displays coaching output from `AnalysisResult`. It displays Gemini
evidence separately through `GeminiEvidenceView`. KnowledgeInsights are not
displayed.

## Purpose

The purpose of connecting KnowledgeInsight to coaching is:

- make coaching grounded in domain rules,
- reduce confident but unsupported advice,
- preserve uncertainty,
- use observed facts and validators before language generation,
- keep rider-facing guidance useful without pretending uncertain conclusions
  are facts.

The goal is not:

- to make KnowledgeInsight a UI feature immediately,
- to store KnowledgeInsights in DB immediately,
- to let AI decide which rules apply,
- to let Coach override rule confidence.

## Role Separation

### Raw Gemini Output

Role:

- Candidate model output.
- May contain useful observations.
- May also contain hallucinations, overconfidence, or schema artifacts.

Coaching rule:

```text
Do not coach directly from raw Gemini output.
```

### Raw ObservedFacts

Role:

- Normalized facts extracted from video.
- Still may contain low confidence, validator adjustments, or uncertainty.

Coaching rule:

```text
ObservedFacts can provide source evidence, but should be filtered through
validators and KnowledgeInsights before becoming coaching.
```

### Validation Results

Role:

- Indicate whether ObservedFacts were adjusted or need review.
- Prevent low-quality facts from silently becoming advice.

Coaching rule:

```text
Validator warnings must lower coaching certainty.
```

### KnowledgeInsight

Role:

- Domain-rule interpretation of validated ObservedFacts.
- Bridge between evidence and coaching.
- Contains `sourceFacts`, `confidence`, `requiresReview`, and `coachingSafe`.

Coaching rule:

```text
KnowledgeInsight may inform coaching, but is not automatically rider-facing.
```

### Coach

Role:

- Turn safe insights into clear Korean coaching language.
- Preserve confidence and uncertainty.
- Avoid inventing missing mechanics.

Coaching rule:

```text
Coach phrases. Coach does not decide truth.
```

## KnowledgeInsight To Coaching Transform

Before passing KnowledgeInsights to a coach prompt, convert them into a
restricted coaching context.

Draft type:

```ts
type CoachingInsightContext = {
  ruleId: string;
  category: string;
  coachingMode: 'direct_cue' | 'review_context' | 'internal_only';
  message: string;
  sourceFacts: string[];
  confidence: 'low' | 'medium' | 'high';
  wordingGuidance: string;
};
```

Transform rules:

```text
coachingSafe=true and requiresReview=false
-> direct_cue

coachingSafe=true and requiresReview=true
-> review_context

coachingSafe=false
-> internal_only
```

`internal_only` insights may be used to instruct the coach what not to overstate,
but they must not become direct rider advice.

## Rider-Facing Wording By Mode

### direct_cue

Rider-facing use:

```text
Allowed.
```

Use `direct_cue` when the insight is coaching-safe and does not require review.
This mode may become a rider-facing coaching cue, but it still must preserve
confidence. Most `direct_cue` messages should sound like practical guidance, not
absolute diagnosis.

Allowed tone:

- calm and practical,
- evidence-grounded,
- action-oriented,
- "may help" or "try" language for medium confidence,
- positive reinforcement when the insight is supportive.

Forbidden tone:

- "This is definitely the cause."
- "You failed because..."
- "Always / never" unless supported by repeated evidence.
- trick identity claims from non-identity insights.

Example rider-facing sentences:

```text
팝 타이밍은 회전이나 공중 자세를 만들기에 괜찮은 기반으로 보입니다. 다음 시도에서도 웨이크 정점에서 서는 감각은 유지해 보세요.
```

```text
착지가 안정적으로 이어진다면, 이번 시도는 마무리 동작 자체는 꽤 신뢰할 수 있습니다. 다음에는 이 착지 안정감을 유지하면서 이륙 전 엣지 압력을 더 확인해 보세요.
```

```text
공중에서 자세를 만들 시간은 어느 정도 확보된 것으로 보입니다. 다음 시도에서는 그 여유를 이용해 핸들을 몸 가까이에 두는 감각을 점검해 보세요.
```

### review_context

Rider-facing use:

```text
Allowed only as "확인해볼 지점".
```

`review_context` is not a diagnosis. It can be shown or passed to the coach only
as an uncertainty-preserving review point. It should not become the main cause,
main correction, or a hard instruction.

Allowed tone:

- "확인 필요",
- "가능성이 있습니다",
- "다음 영상에서 확인해 볼 지점입니다",
- "현재 영상만으로는 단정하지 않습니다",
- gentle, investigative language.

Forbidden tone:

- "원인은 X입니다."
- "X 때문에 실패했습니다."
- "반드시 X를 고쳐야 합니다."
- "AI가 확인했습니다."
- negative rider judgment.

Example rider-facing sentences:

```text
확인 필요: 엣지 로드와 팝 근거가 일부 불확실합니다. 다음 영상에서는 이륙 직전까지 엣지를 유지하는지 먼저 확인해 보세요.
```

```text
그랩 시도처럼 보일 수 있는 움직임은 있지만, 실제 손-보드 접촉은 확정하지 않습니다. 다음 리뷰에서는 손이 보드에 닿는 순간이 보이는지 확인해 보세요.
```

```text
일부 근거는 리뷰가 필요합니다. 지금은 확정 코칭보다, 다음 시도에서 같은 구간을 더 잘 보이게 촬영해 확인하는 편이 안전합니다.
```

### internal_only

Rider-facing use:

```text
Forbidden.
```

`internal_only` is a guardrail for the coach. It can tell the coach what not to
overstate, but it must not appear as direct rider-facing advice, diagnosis, or
suggestion.

Allowed internal use:

- reduce confidence,
- prevent overclaiming,
- guide self-critique,
- block unsafe direct cues.

Forbidden rider-facing tone:

- any direct instruction,
- any causal diagnosis,
- any statement that presents the insight as observed fact,
- any "you did X" sentence.

Forbidden rider-facing examples:

```text
핸들을 늦게 당겨서 회전이 흔들렸습니다.
```

```text
이 동작의 문제는 핸들 타이밍입니다.
```

```text
다음에는 핸들을 반드시 더 빨리 당기세요.
```

Allowed internal-only instruction to the coach:

```text
Do not present handle timing as a direct coaching cue because the source insight is internal_only.
```

## Handling coachingSafe=false

Rule:

```text
Do not include coachingSafe=false insight as a direct user-facing coaching cue.
```

Allowed use:

- Provide to the coach as a caution.
- Use to prevent overconfident advice.
- Use in internal debug/self-critique.

Forbidden use:

- "Your handle pull is late."
- "This caused your rotation problem."
- "Fix X because Y happened."

Allowed wording if referenced at all:

```text
핸들 타이밍은 아직 근거가 충분하지 않아서 확정 코칭으로 말하지 않습니다.
```

## Handling requiresReview=true

Rule:

```text
requiresReview=true means this insight is review context, not firm diagnosis.
```

Allowed wording:

- "확인 필요"
- "가능성이 있습니다"
- "다음 리뷰에서 확인해 볼 지점입니다"
- "현재 영상 근거만으로는 단정하지 않습니다"

Forbidden wording:

- "원인은 X입니다"
- "반드시 X를 고쳐야 합니다"
- "X 때문에 실패했습니다"

Example:

```text
확인 필요: 팝과 엣지 로드 근거가 일부 낮은 확신도로 나왔습니다. 다음 영상에서는
이륙 직전 엣지를 끝까지 유지하는지 먼저 확인해 보세요.
```

## Confidence-Based Wording Rules

### High Confidence

Use only when:

- insight confidence is high,
- `coachingSafe=true`,
- `requiresReview=false`,
- source facts are not validator-downgraded.

Allowed language:

- "보입니다"
- "확인됩니다"
- "이 부분은 다음 연습에서 유지해도 좋습니다"

Still avoid:

- claiming causality unless the rule explicitly supports it.

### Medium Confidence

Default rider-facing coaching confidence.

Allowed language:

- "가능성이 있습니다"
- "도움이 될 수 있습니다"
- "우선 확인해 볼 만합니다"
- "다음 시도에서 의식해 보세요"

### Low Confidence

Use as review context only.

Allowed language:

- "확실하지 않습니다"
- "영상 근거가 제한적입니다"
- "다음 촬영/리뷰에서 확인이 필요합니다"

Low-confidence insights should not become a primary training assignment.

## Conditions Where Coach Must Not Speak Definitively

Coach must not speak definitively when:

- `coachingSafe=false`.
- `requiresReview=true`.
- insight confidence is low.
- source facts include validator `needsReview=true`.
- raw ObservedFacts were downgraded.
- landing/aftermath is the only evidence for trick identity.
- grab evidence lacks visible hand-to-board contact.
- handle timing is inferred without explicit handle evidence.
- approach or edge load is based only on body orientation.
- evidence window/takeoff timing is unreliable.

## MVP Connection Scope

MVP should connect KnowledgeInsights to coaching in stages.

### Stage 1: Server-Side Context Builder

Implement a pure transform:

```text
KnowledgeInsight[] -> CoachingInsightContext[]
```

No AI call changes yet.

### Stage 2: Debug-Only Coach Context

Expose the transformed context in debug artifacts or response metadata only.

No user-facing UI.

### Stage 3: Prompt Context Injection

Add the safe context to a coaching prompt with strict instructions:

- do not override confidence,
- do not use `internal_only` as direct advice,
- phrase `review_context` as uncertainty,
- do not invent source facts.

### Stage 4: Coaching Output Calibration

Run known samples and compare:

- with KnowledgeInsight context,
- without KnowledgeInsight context.

Only after calibration should the app expose this in regular coaching UX.

## Out Of Scope For MVP

- DB storage.
- Supabase migration.
- UI rendering of KnowledgeInsights.
- Progression timeline.
- Automatic score.
- Push notifications.
- New rule creation.
- RAG/vector search.
- Rewriting the full coaching system.

## Expected Implementation Files

Likely files:

- `src/types/index.ts`
  - add `CoachingInsightContext` type if shared with app.

- `src/services/knowledge/`
  - add transform function, likely
    `buildCoachingInsightContext(knowledgeInsights)`.

- `dev-server/index.ts`
  - later inject `CoachingInsightContext` into the chosen coaching prompt.
  - likely candidates:
    - `buildOpenAiBenchmarkPrompt`
    - future dedicated coaching endpoint
    - possibly `buildGeminiAnalysisPrompt` if that path remains active.

- `src/services/ai/analyzeSessionVideo.ts`
  - only if the app needs to receive transformed context.

Files not expected for MVP:

- `supabase/*`
- UI components in `src/features/sessions/HomeScreen.tsx`
- migration files

## Recommended First Implementation

Recommendation:

Start with a pure transform and debug-only exposure.

```text
KnowledgeInsight[]
↓
buildCoachingInsightContext
↓
debug artifact / response metadata
```

Then test with the existing `ts_regular_1.mov` flow:

- Confirm safe insights become `direct_cue` or `review_context`.
- Confirm `coachingSafe=false` becomes `internal_only`.
- Confirm low confidence is never converted into direct advice.

Only after this should prompt injection happen.

## Prompt Injection Draft

When prompt injection happens, add a compact section like:

```text
KnowledgeInsight coaching context:

- direct_cue: safe to phrase as coaching, preserving confidence.
- review_context: mention only as 확인 필요 / possible review point.
- internal_only: do not give this as rider advice. Use it only to avoid
  overclaiming.

Rules:
- Do not say a low-confidence insight as fact.
- Do not turn review_context into a cause.
- Do not invent facts not listed in sourceFacts.
- If source facts are uncertain, say the video evidence is limited.
```

## Risks

### Overconfident Rewording

Risk:

The coach may turn "may indicate" into "this caused."

Mitigation:

- Include `coachingMode`.
- Include confidence and review flags.
- Explicitly forbid causal language unless rule supports it.

### Unsafe Insights Becoming Advice

Risk:

`coachingSafe=false` may leak into rider-facing suggestions.

Mitigation:

- Transform to `internal_only`.
- Keep it out of direct cue list.
- Add tests for this behavior.

### Review Context Becoming Negative Feedback

Risk:

`requiresReview=true` could sound like a failure diagnosis.

Mitigation:

- Use "확인 필요" language.
- Keep review context separate from "next drill" suggestions.

### Low-Quality ObservedFacts Propagation

Risk:

Bad ObservedFacts can produce bad KnowledgeInsights, then bad coaching.

Mitigation:

- Include validator state in context.
- Downshift or block insights with low confidence.
- Prefer asking for review over giving a firm drill.

### Path Confusion

Risk:

There are multiple analysis/coaching paths. KnowledgeInsight may be wired into
the wrong one.

Mitigation:

- Start with debug-only transform.
- Choose one coaching path later.
- Prefer the future dedicated coaching endpoint over broad changes to both
  Gemini short analysis and OpenAI benchmark at once.

### Grab Attempt False Positive Propagation

Risk:

`grab_attempt_indicates_air_awareness.v1` can become risky if a no-grab motion,
hand/board overlap, knee tuck, handle movement, or camera crop is interpreted as
a grab attempt.

Observed context:

- The project already found a Grab false-positive risk on `ts_regular_1.mov`.
- Later prompt/validator changes reduced positive grab false positives.
- However, `grab_attempt_indicates_air_awareness.v1` can still produce
  `review_context` when the model sees a possible reach.

Mitigation:

- Never phrase this rule as "you grabbed the board" unless `contactVisible=true`
  and validator confidence supports it.
- Keep this rule as `review_context` when contact is not visible.
- Use "possible reach" or "확인해볼 지점" language only.
- Validate against known true-grab and known no-grab samples before prompt
  injection.

## Acceptance Criteria Before Prompt Injection

Do not inject `CoachingInsightContext` into a coaching prompt until all criteria
below are satisfied.

### Transform Correctness

- `coachingSafe=true` and `requiresReview=false` maps to `direct_cue`.
- `coachingSafe=true` and `requiresReview=true` maps to `review_context`.
- `coachingSafe=false` maps to `internal_only`.
- Fixture tests cover all three modes.

### Wording Safety

- `direct_cue` examples preserve confidence and avoid unsupported causality.
- `review_context` examples use "확인 필요" or "가능성" wording.
- `internal_only` examples are not rider-facing.
- Low-confidence insights do not become primary training instructions.

### Evidence Safety

- Every coaching context item keeps its source rule id.
- Every coaching context item keeps confidence, severity, and review flags.
- Validator `needsReview=true` lowers wording certainty.
- Grab attempt language is tested on both true-grab and no-grab samples.

### System Boundary

- No DB storage is added.
- No UI rendering is added.
- No Supabase migration is added.
- No new Knowledge Rules are added during prompt injection.
- Prompt injection is done in one coaching path first, not all paths at once.

### Output Review

- At least one known no-grab Basic Air sample is checked.
- At least one known true-grab sample is checked before relying on grab attempt
  language.
- At least one low-confidence/review sample is checked.
- The coach output is compared against raw `CoachingInsightContext` to verify it
  did not overstate uncertainty.

## Recommendation

Do not connect KnowledgeInsights directly to user-facing coaching yet.

Next step should be:

```text
Implement buildCoachingInsightContext()
↓
Expose debug-only transformed context
↓
Validate wording modes on real samples
↓
Only then inject into coaching prompt
```

This keeps the system aligned with the current product principle:

```text
Evidence first.
Domain rules second.
Coaching language last.
```
