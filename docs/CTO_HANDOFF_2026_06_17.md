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

## Recent Important Commits

```text
615781e feat: add landing observed facts MVP
b9e84ad feat: add grab observed facts MVP
5b5380e fix: reduce grab false positives
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

## Next Work Candidates

Recommended highest-priority next task:

```text
Grab true-positive validation
```

Suggested sequence:

1. Identify one known true grab sample and one known no-grab Basic Air sample.
2. Run Render + Gemini Pro E2E on both.
3. Compare `grabDetected`, `contactVisible`, `grabDuration`, `evidenceText`,
   and `grabValidation`.
4. Tune only after visual evidence review.

Other useful next tasks:

- Add stale processing job recovery.
- Fresh Back Roll validation with accessible source video.
- Continue building validation matrix coverage.
- Begin Wakeboard Knowledge Base / RAG reference only after observed-facts
  validation has enough sample coverage.

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

다음 목표는 Grab true-positive validation이다.
known true grab sample과 no-grab Basic Air sample을 비교해서
GrabObservedFacts가 너무 보수적인지 검증한다.

코드 수정 전 운영/시각 검증 계획부터 제시해줘.
```

## Final CTO Note

The project has crossed an important boundary.

The goal is no longer "make Gemini guess the trick better." The goal is to
build a wakeboard-specific evidence system where AI observations are constrained
by domain rules, validators, and explicit uncertainty.

That direction is working. The next challenge is coverage: validating the
observed-facts layers against more known-good and known-bad wakeboard samples.
