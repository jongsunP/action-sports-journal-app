# Project Status - 2026-06-17

## Purpose

This document captures the current operating state of Action Sports Journal as
of 2026-06-17. A future GPT or Codex session should be able to restore the
current project context from this file without relying on chat history.

Read this together with:

- `docs/PROJECT_MEMORY.md`
- `docs/CURRENT_STAGE.md`
- `docs/WAKEBOARD_OBSERVED_FACTS_V3_PLAN.md`
- `docs/PRO_OPERATION_VALIDATION_2026_06_16.md`
- `docs/ROTATION_OBSERVED_FACTS_PLAN.md`
- `docs/GRAB_OBSERVED_FACTS_DESIGN.md`

## Current Operating Model

Confirmed Fact:

The production evidence extraction model is:

```text
gemini-2.5-pro
```

The model is configured through Render environment variables. The iPhone app
does not need an EAS rebuild to switch evidence extraction models because the
standalone app calls the Render backend, and Render chooses the Gemini model
server-side.

Current Render model configuration:

```text
GEMINI_ANALYSIS_MODEL=gemini-2.5-pro
GEMINI_FALLBACK_MODEL=gemini-2.5-flash-lite
```

Flash to Pro transition background:

- Gemini Flash was useful for early iteration and cost control.
- Real wakeboard approach and trick-family classification showed quality
  limits, especially around toeside/heelside approach and invert hallucination.
- Benchmark and operating validation showed Pro produced more reliable
  approach and family-level results on recent practical samples.
- Pro is now the operating default for evidence extraction.

Benchmark summary:

- Observation: Pro improved practical reliability for `nee toe` and
  `nee heel`.
- Observation: Pro correctly distinguished toe and heel in those recent
  operating checks.
- Observation: Trick/family outputs were more consistent than the earlier
  Flash-era behavior.
- Unknown: Pro is not a complete solution by itself. Domain decomposition and
  validators are still required.

## Current Evidence Pipeline

Current operating flow:

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

Implementation reality:

- The standalone iPhone app creates a Moment.
- The backend creates an AnalysisJob.
- Evidence extraction is run through the Render backend.
- Results are persisted to Supabase `evidence_results`.
- The app restores Moment and latest Evidence state from Supabase.

## Completed Observed-Facts Layers

### Approach

Confirmed Fact:

`ApproachObservedFacts` and approach decision logic exist.

Current domain rule:

- Do not ask only "heelside or toeside?"
- Extract stance, lead foot, board direction, wake crossing path, takeoff
  position, landing position, edge direction evidence, handle position, and
  body orientation first.
- Body orientation is supporting evidence only.
- Chest/back visibility alone must not determine heelside or toeside.

### EdgeLoad

Confirmed Fact:

`EdgeLoadObservedFacts` exists and is connected to validation.

Current domain rule:

- Edge load should come from board tilt, spray, line tension, rider weight over
  edge, and final approach context.
- Edge labels without visible physical evidence should be downgraded.

### Pop

Confirmed Fact:

`PopObservedFacts` exists with a simplified flat schema.

Current status:

- Pop storage in Supabase is confirmed.
- Pop validator calibration has been adjusted so plausible
  `progressive_pop / on_wake / moderate` cases are not over-downgraded to low.
- Schema complexity was reduced after Gemini structured schema returned
  `400 INVALID_ARGUMENT` when the schema became too complex.

### Rotation

Confirmed Fact:

`RotationObservedFacts` exists with a simplified flat schema.

Current fields:

```text
rotationAxis
rotationDirection
inversionDetected
spinDegrees
handlePassObserved
evidenceText
confidence
antiEvidence
```

Current status:

- Rotation storage in Supabase is confirmed.
- Rotation validation is calibrated for Basic Jump no-rotation cases.
- For Basic Jump / Basic Air cases, clear absence of rotation is now accepted
  as valid physical evidence.

Current no-rotation validation behavior:

- If `family` is Basic Jump / Basic Air / Straight Air,
- and `rotationAxis=none`,
- and `inversionDetected=false`,
- and `spinDegrees=0`,
- and `handlePassObserved=false`,
- and the evidence text clearly says rotation/spin/axis is not observed,
- then `rotationValidation.needsReview=false` is allowed.

Operating verification:

```text
predicted_trick: Toeside Basic Jump
family: 기본 점프
rotationAxis: none
inversionDetected: false
spinDegrees: 0
handlePassObserved: false
rotation confidence: medium
rotationValidation.needsReview: false
```

## Current Operating Verification State

Confirmed Fact:

- Pro operating deployment is complete.
- `/health` reports Gemini evidence extraction configured.
- Evidence extraction uses `gemini-2.5-pro`.
- Pop storage is confirmed.
- Rotation storage is confirmed.
- Stuck job cleanup was completed manually.

Stuck job cleanup:

```text
job_status: failed
moment_status: failed
latest_evidence_result_id: null
last_error: manual cleanup: stuck processing job after timeout
evidence_result_count: 0
```

Rotation migration:

Confirmed applied columns:

```text
evidence_results.rotation_observed_facts
evidence_results.rotation_validation
```

Recent rotation validation result:

- Basic Jump no-rotation result is persisted.
- `rotationValidation.needsReview=false` was confirmed after calibration.
- Back Roll / Tantrum / Invert high-confidence requirements remain stricter
  and still require visible rotation or inversion mechanics.

### Landing

Confirmed Fact:

`LandingObservedFacts` MVP has been implemented and operationally verified.

Current fields:

```text
landingVisible
landingOutcome
boardContact
edgeOnLanding
handlePosition
balanceRecovery
evidenceText
confidence
antiEvidence
```

Current implementation status:

- Local TypeScript types are added.
- Server-side normalization and validation are added.
- Gemini prompt now asks for landing/recovery observed facts.
- Debug capture and response fields are wired.
- Supabase persistence/restore paths are wired.
- `supabase/phase5_landing_observed_facts.sql` exists.

Important implementation detail:

- Direct Gemini object schema for `landingObservedFacts` caused
  `400 INVALID_ARGUMENT` due to structured schema complexity.
- The MVP now asks Gemini to return `landingObservedFacts` as a compact JSON
  string.
- The server parses that string, normalizes it, validates it, and exposes a
  normal object to the app/backend response.

Verification:

- `npm run typecheck` passes.
- `git diff --check` passes.
- Local server `/health` passes.
- Local Gemini Flash evidence extraction completed after switching
  `landingObservedFacts` to the compact JSON-string carrier.
- Debug artifact confirmed `landingObservedFacts` and `landingValidation`.
- Supabase remote migration has been applied.
- Render/Gemini Pro operating verification completed successfully.
- Supabase `landing_observed_facts` / `landing_validation` persistence was
  verified on the remote DB.

Operating verification sample:

```text
Moment ID: b548a645-d0bf-4886-aeb0-ec4cc77e4d2c
Analysis Job ID: 926942f7-3ec5-4892-a478-ab47bca8c93b
Evidence Result ID: 21d5d4d8-2323-4a4d-bace-d786df0a63a2
model: gemini-2.5-pro
landingVisible: true
landingOutcome: rides_away
landing confidence: medium
landingValidation.needsReview: false
```

Migration prepared:

```sql
alter table public.evidence_results
  add column if not exists landing_observed_facts jsonb,
  add column if not exists landing_validation jsonb;
```

Verification SQL after applying migration:

```sql
select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'evidence_results'
  and column_name in (
    'landing_observed_facts',
    'landing_validation'
  )
order by column_name;
```

Rollback SQL if needed:

```sql
alter table public.evidence_results
  drop column if exists landing_observed_facts,
  drop column if exists landing_validation;
```

### Grab

Confirmed Fact:

`GrabObservedFacts` MVP has been implemented and system E2E verified.

Current fields:

```text
grabDetected
contactVisible
grabbingHand
grabbedBoardZone
grabTiming
grabDuration
evidenceText
confidence
antiEvidence
```

Current implementation status:

- TypeScript types are added.
- Server-side normalization and validation are added.
- Gemini prompt now asks for grab observed facts.
- Gemini schema uses a JSON string carrier for `grabObservedFacts`.
- Debug capture and response fields are wired.
- Supabase persistence/restore paths are wired.
- `supabase/phase6_grab_observed_facts.sql` exists and was applied remotely.

Operating verification:

```text
Moment ID: 7090da09-6676-405f-81c8-0b77601ab49f
Analysis Job ID: d09bca5c-4624-494e-8292-2c50dd774f98
Evidence Result ID: d1e7d5ac-2a13-4760-8d46-fd941af90253
model: gemini-2.5-pro
analysis_jobs.status: completed
evidence_results.grab_observed_facts: present
evidence_results.grab_validation: present
debug response grabObservedFacts: present
debug response grabValidation: present
```

Observed system behavior:

- Storage path works.
- API response path works.
- Debug artifact path works.
- Existing Approach, Pop, Rotation, and Landing observed-facts outputs remained
  present.
- Validator downgraded a raw high-confidence grab to medium because independent
  contact indicators were insufficient and precise timing was not supported.

Quality validation finding:

Gemini Pro produced:

```text
grabDetected: true
contactVisible: true
grabbingHand: rear_hand
grabbedBoardZone: toe_edge_between_bindings
grabTiming: unknown
grabDuration: held
confidence: medium
```

Gemini evidence text:

```text
뒷손(오른손)이 핸들에서 떨어져 보드의 토우 엣지 중앙을 잡는 것이 1.50초부터 명확히 보임.
```

Manual visual check:

- Source video: `dev-artifacts/benchmark-videos/ts_regular_1.mov`
- Generated artifacts:
  - `dev-artifacts/grab-validation/ts_regular_1_2026-06-17/ts_regular_1_1.2-2.0.mp4`
  - `dev-artifacts/grab-validation/ts_regular_1_2026-06-17/frame_1_20s.jpg`
  - `dev-artifacts/grab-validation/ts_regular_1_2026-06-17/frame_1_35s.jpg`
  - `dev-artifacts/grab-validation/ts_regular_1_2026-06-17/frame_1_50s.jpg`
  - `dev-artifacts/grab-validation/ts_regular_1_2026-06-17/frame_1_65s.jpg`
  - `dev-artifacts/grab-validation/ts_regular_1_2026-06-17/frame_1_50s_crop.jpg`
  - `dev-artifacts/grab-validation/ts_regular_1_2026-06-17/frame_1_65s_crop.jpg`

Observation:

- At 1.20s and 1.35s, hand-board contact is not visible.
- At 1.50s, the rider is rising and the board is vertical, but the hand appears
  near the handle/upper body rather than clearly touching the board.
- At 1.65s, the hand/board region is closer and partly overlapping, but clear
  hand-to-board contact is still not confirmed from the extracted frame.

Current judgment:

- System E2E is successful.
- Positive grab quality is not yet validated.
- The `ts_regular_1` positive grab result may be a false positive or at least
  an overconfident interpretation of hand/board overlap.
- Next Grab work should make positive grab validation more conservative before
  trusting positive grab labels.

## Remaining Observed-Facts Layers

All planned MVP V3 observed-facts layers are now represented in the evidence
path:

- Approach
- EdgeLoad
- Pop
- Rotation
- Grab
- Landing

Next validation step:

```text
Calibrate GrabObservedFacts positive detection
↓
Collect or identify a known true grab sample
↓
Compare true grab vs no-grab Basic Air samples
↓
Adjust validator/prompt only after visual evidence review
```

## Known Issues

### Gemini Schema Complexity

Confirmed Fact:

Gemini structured response schema can fail with `400 INVALID_ARGUMENT` if the
schema becomes too complex.

Current rule:

- Keep new observed-facts schemas flat.
- Avoid nested confidence objects.
- Avoid adding many enums and deeply nested required fields.
- Prefer one top-level confidence field per observed-facts layer.

### Upload / Processing Timeout Recovery

Observation:

Some async evidence jobs can remain in `processing` with:

```text
last_error: null
completed_at: null
failed_at: null
latest_evidence_result_id: null
```

Hypothesis:

The job can be marked `processing` and then fail to reach the catch/failure
path if the server process is interrupted or if the upload stage hangs before
the timed Gemini generation call.

Recommendation:

Add recovery logic later:

- timeout wrapper around Gemini file upload / file activation,
- stale processing job cleanup,
- retry or fail-safe transition for jobs stuck beyond an expected age,
- clearer job-level logging with job id and moment id.

Do not treat this as solved yet.

### Back Roll Fresh Rotation Validation

Observation:

Existing Back Roll Moments exist in Supabase, but their source video URIs point
to iPhone sandbox paths and are not available to the Render server or local Mac
for re-upload.

Confirmed Fact:

Existing Back Roll evidence rows were created before RotationObservedFacts
columns were added, so `rotation_observed_facts` is null on those old rows.

Unknown:

Fresh Back Roll validation against the new RotationObservedFacts layer still
needs an accessible Back Roll video file.

## Next Session Recommended Starting Point

Recommended next start:

```text
GrabObservedFacts positive detection calibration
↓
Known true grab / no-grab sample comparison
```

Suggested opening task:

```text
Review the GrabObservedFacts E2E result for ts_regular_1.
Use the generated 1.2s-1.65s visual artifacts to determine whether the
positive grab result is a false positive. Do not change prompt or validator
until visual evidence is reviewed.
```

Suggested next validation questions:

```text
Does ts_regular_1 show actual hand-board contact?
Should contactVisible=true require a visible finger/hand-board contact point?
Should grabDuration=held require multiple extracted frames with visible contact?
Should positive grab medium also require more than one independent indicator?
Do we need a known true grab sample before further tuning?
```

Validation ideas:

- Positive grab should require visible hand-board contact, not only overlap.
- Attempted reach should remain separate from actual grab.
- Board poke/style should not count as grab evidence.
- No-grab Basic Air should be accepted as valid evidence when hands/board are
  visible.
- Prompt/validator changes should be based on visual review, not on model text
  alone.

## CTO Summary

Current project state:

```text
Action Sports Journal has moved past the stage of "make the AI guess better."
It has entered the stage of building a Wakeboard Knowledge System.
```

The important shift is architectural:

- Do not rely on one model pass to name the trick.
- Extract observed facts first.
- Validate those facts with wakeboard domain rules.
- Only then classify family, trick, and coaching implications.

Current confidence:

- The deployed standalone app and Render/Supabase pipeline are operational.
- Gemini Pro is the current best operating model.
- Approach, EdgeLoad, Pop, and Rotation observed-facts layers are implemented.
- Basic Jump no-rotation validation now behaves more realistically.

Current uncertainty:

- Fresh Back Roll validation with RotationObservedFacts still requires an
  accessible Back Roll source video.
- Upload-stage timeout recovery remains an infrastructure issue.
- Landing and Grab observed-facts layers are not implemented yet.
