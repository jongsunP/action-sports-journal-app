# CTO Handoff - 2026-06-17

This is a successor CTO handoff for Action Sports Journal. It summarizes the
product direction, current architecture, verified operating state, recent
commits, known risks, and the most useful next steps.

Primary continuity documents:

- `docs/PROJECT_MEMORY.md`
- `docs/PROJECT_STATUS_2026_06_17.md`
- `docs/CURRENT_STAGE.md`
- `docs/WAKEBOARD_OBSERVED_FACTS_V3_PLAN.md`
- `docs/LANDING_OBSERVED_FACTS_DESIGN.md`
- `docs/GRAB_OBSERVED_FACTS_DESIGN.md`

## Product Goal

Action Sports Journal should not be treated as a generic AI Video Analyzer.

The correct product direction is:

```text
Wakeboard Knowledge System
```

The product should help riders preserve riding moments, analyze wakeboard
movement honestly, and receive coaching grounded in visible evidence. The AI
should not sound confident when visual evidence is weak.

Current philosophy:

- Moment First
- Content > Data
- Feed > Dashboard
- AI Coach as a supporting layer
- Truth and uncertainty calibration over confident output

## Current Architecture

Production architecture:

```text
Standalone iPhone app
↓
Render HTTPS backend
↓
Supabase
↓
Gemini 2.5 Pro evidence extraction
```

Evidence pipeline:

```text
Video
↓
Moment
↓
AnalysisJob
↓
Gemini Pro
↓
ApproachObservedFacts
↓
EdgeLoadObservedFacts
↓
PopObservedFacts
↓
RotationObservedFacts
↓
GrabObservedFacts
↓
LandingObservedFacts
↓
Validator
↓
EvidenceResult
```

Important operating constraints:

- No auth yet.
- No cloud video storage yet.
- Supabase stores Moments, AnalysisJobs, and EvidenceResults.
- Videos are still handled in the current MVP flow, not as durable cloud video
  assets.
- AI keys live only in Render/local environment variables.
- The standalone iPhone app uses the public Render backend.

## Operating Verification Complete

Confirmed complete:

- Render backend is live.
- Standalone iPhone app works without Expo Go.
- Supabase Moment persistence and restoration work.
- Async Analysis MVP works for queued/processing/completed state restoration.
- Production evidence extraction uses `gemini-2.5-pro`.
- LandingObservedFacts E2E is complete on Render + Gemini Pro.
- GrabObservedFacts E2E is complete on Render + Gemini Pro.
- Grab false-positive hardening was revalidated on Render + Gemini Pro.
- Wakeboard Knowledge Base v1 is complete and operationally verified.
- CoachingInsightContext transform is complete and operationally verified.
- Knowledge -> Coaching prompt injection is connected only to the Gemini short
  analysis path and operationally verified on Render + Gemini Pro.

Current production model:

```text
GEMINI_ANALYSIS_MODEL=gemini-2.5-pro
GEMINI_FALLBACK_MODEL=gemini-2.5-flash-lite
```

## Completed ObservedFacts Layers

### ApproachObservedFacts

Purpose:

- Determine approach from observed stance, lead foot, board direction, wake
  crossing path, edge evidence, handle position, and body orientation.

Key rule:

- Chest/back visibility alone is not enough for heelside/toeside.

### EdgeLoadObservedFacts

Purpose:

- Separate physical edge-load evidence from edge labels.

Key rule:

- Toe/heel labels without visible board/spray/line/weight evidence should be
  downgraded.

### PopObservedFacts

Purpose:

- Observe takeoff mechanics.

Key rule:

- Pop does not name tricks.

### RotationObservedFacts

Purpose:

- Observe rotation axis, direction, inversion, spin degrees, and handle pass.

Key rule:

- No-rotation Basic Air evidence can be valid evidence.
- Invert tricks still require visible rotation/inversion mechanics.

### LandingObservedFacts

Purpose:

- Observe landing visibility, outcome, board contact, edge on landing, handle
  position, balance recovery, and anti-evidence.

Status:

- Implemented.
- Supabase columns applied.
- Render + Gemini Pro E2E verified.

Key rule:

- Landing outcome must not create or override trick identity.

### GrabObservedFacts

Purpose:

- Observe actual hand-to-board contact during airborne phase.

Status:

- Implemented.
- Supabase columns applied.
- Render + Gemini Pro E2E verified.
- Initial false positive on `ts_regular_1.mov` was hardened and revalidated.

Key rule:

- Grab does not classify Indy/Melon/Stalefish names in MVP.
- Positive grab requires visible hand/finger-to-board contact point.
- Hand near board, overlap, occlusion, style motion, knee tuck, arm swing, or
  handle movement is not enough.

## Knowledge / Coaching Status

Confirmed complete:

- `KnowledgeInsight[]` is produced from validated ObservedFacts by Wakeboard
  Knowledge Base v1.
- `CoachingInsightContext[]` transforms KnowledgeInsights into three modes:
  - `direct_cue`
  - `review_context`
  - `internal_only`
- Gemini short analysis (`POST /api/analyze-session-video`) receives a compact
  prompt context from `direct_cue` and `review_context` only.
- `internal_only` is excluded from rider-facing prompt context.
- Render + Gemini 2.5 Pro E2E verified the short-analysis path with context.

Still not connected:

- DB storage for KnowledgeInsights or CoachingInsightContext.
- Dedicated UI rendering.
- Supabase migration.
- OpenAI benchmark path.
- Progression layer.
- Additional Knowledge Rules beyond v1.

Operating verification sample:

```text
Contextなし:
status: completed
summary: 웨이크보딩 기술 훈련 영상입니다.

Contextあり:
status: completed
summary: 웨이크보딩 기본 동작을 배우는 영상입니다.
internal_only leaked: false
review_context became hard diagnosis: false
```

## Recent Important Commits

```text
615781e feat: add landing observed facts MVP
b9e84ad feat: add grab observed facts MVP
5b5380e fix: reduce grab false positives
4e550c feat: add wakeboard knowledge rules v1
def259f feat: add coaching insight context transform
b0ae214 feat: connect knowledge insights to coaching prompt
```

Landing commit:

- Added LandingObservedFacts types, prompt/schema carrier, normalization,
  validation, Supabase persistence/restore, and migration.

Grab MVP commit:

- Added GrabObservedFacts types, prompt/schema carrier, normalization,
  validation, Supabase persistence/restore, and migration.

Grab false-positive commit:

- Made Grab prompt and validator more conservative after visual review showed
  `ts_regular_1.mov` did not clearly show hand-to-board contact.

Knowledge rules commit:

- Added Wakeboard Knowledge Base v1 rule engine and six MVP rules.
- Connected `knowledgeInsights` to response/debug metadata only.

Coaching context transform commit:

- Added `CoachingInsightContext` transform.
- Verified `direct_cue`, `review_context`, and `internal_only` modes.
- Exposed transformed context in response/debug metadata only.

Knowledge -> Coaching prompt commit:

- Connected `CoachingInsightContext` to the Gemini short-analysis prompt only.
- Kept DB, UI, Supabase, OpenAI benchmark, and Progression disconnected.
- Added short-analysis stability guardrails including compact prompt context and
  `thinkingBudget: 0`.
- Verified Render + Gemini 2.5 Pro E2E.

## Known Risks

### Grab True Positive Not Yet Validated

Confirmed Fact:

- The no-grab false positive on `ts_regular_1.mov` was reduced.

Unknown:

- Whether a known true grab is detected correctly after the conservative
  validator changes.

Risk:

- The current Grab validator may now be too conservative and produce false
  negatives.

### Gemini Schema Complexity

Confirmed Fact:

- Nested/rich Gemini structured schemas can trigger `400 INVALID_ARGUMENT`.

Current practice:

- Keep observed-facts schemas flat.
- Use one aggregate confidence field.
- Avoid nested confidence objects.
- Use JSON string carrier for complex observed-facts payloads.

### Async Processing Recovery

Observation:

- Some jobs can remain stuck in `processing` after interruptions or timeout
  paths.

Recommendation:

- Add stale processing job cleanup and stronger upload/file activation timeout
  handling.

### Fresh Back Roll Coverage

Unknown:

- Fresh Back Roll behavior with the latest Rotation/Grab/Landing layers still
  needs accessible source footage.

### Coaching Wording Coverage

Confirmed Fact:

- Knowledge -> Coaching prompt injection works on the stable `ts_regular_1.mov`
  sample.

Unknown:

- Whether the wording stays safe across true grabs, failed landings, spins, and
  inverts.

Risk:

- `review_context` may become too generic or too causal on harder samples unless
  tested with a broader matrix.

### Gemini Pro Congestion

Observation:

- Operating verification hit temporary Gemini busy/congestion responses before a
  later retry completed.

Recommendation:

- Treat occasional Pro congestion as an external availability risk. Add UX or
  retry strategy only if it becomes frequent.

## Next Work Candidates

Recommended highest-priority next task:

```text
Knowledge -> Coaching wording matrix
```

Suggested sequence:

1. Keep the current connection limited to Gemini short analysis.
2. Run Render + Gemini Pro with:
   - no-grab Basic Air,
   - known true grab,
   - weak/low-confidence evidence,
   - failed landing,
   - invert sample.
3. Compare rider-facing wording against raw `CoachingInsightContext`.
4. Confirm `review_context` stays review-only and `internal_only` never leaks.
5. Only then consider wider coaching integration.

Other useful next tasks:

- Grab true-positive validation with known true-grab footage.
- Add stale processing job recovery.
- Fresh Back Roll validation with accessible source video.
- Continue building validation matrix coverage.
- Keep Knowledge/Coaching disconnected from DB/UI/Progression until wording
  coverage is stronger.

## Codex / CTO Collaboration Method

Working principle:

- Truth over confidence.
- Label conclusions as Confirmed Fact, Observation, Hypothesis,
  Recommendation, or Unknown.
- Do not claim implementation exists unless it is actually implemented and
  verified.
- Keep implementation scoped.
- Do not change UI, deployment architecture, or prompts when the task is only a
  design or diagnosis task.

Save Point procedure:

When the Founder says `정리하자`, `작업 정리`, or `오늘 마무리`, update the
continuity docs with:

- findings,
- decisions,
- implementation status,
- operating verification status,
- open issues,
- next starting point,
- commit/push state.

## Immediate Next Session Prompt

Recommended opening prompt:

```text
Action Sports Journal 작업 재개.

먼저 docs/PROJECT_MEMORY.md,
docs/PROJECT_STATUS_2026_06_17.md,
docs/CTO_HANDOFF_2026_06_17.md를 읽고 현재 상태를 복원해줘.

다음 목표는 Knowledge -> Coaching wording matrix 검증이다.
현재 연결은 Gemini short analysis path 하나에만 제한되어 있다.
Render + Gemini 2.5 Pro에서 no-grab Basic Air, true grab, low-confidence,
failed landing, invert 샘플을 비교해 review_context가 확정 진단으로 변하지
않는지 확인한다.

코드 수정 전 운영 검증 계획과 샘플 기준부터 제시해줘.
```

## Final CTO Note

The project has crossed an important boundary.

The goal is no longer "make Gemini guess the trick better." The goal is to
build a wakeboard-specific evidence system where AI observations are constrained
by domain rules, validators, and explicit uncertainty.

That direction is working. The next challenge is coverage: validating the
observed-facts layers against more known-good and known-bad wakeboard samples.
