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

## Remaining Observed-Facts Layers

Not implemented yet:

- `LandingObservedFacts`
- `GrabObservedFacts`

Recommended next layer:

```text
LandingObservedFacts
```

Reason:

- Landing quality is directly useful for coaching.
- Landing can be observed without requiring advanced trick taxonomy.
- It can help separate clean completion, butt check, edge catch, handle loss,
  over-rotation, and recovery.

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
LandingObservedFacts design
↓
LandingObservedFacts implementation
```

Suggested opening task:

```text
Design LandingObservedFacts using the same flat schema pattern as
PopObservedFacts and RotationObservedFacts. Do not implement Grab yet.
```

Suggested LandingObservedFacts fields:

```text
landingOutcome
edgeOnLanding
handlePositionOnLanding
bodyPositionOnLanding
boardControl
fallDetected
recoveryObserved
evidenceText
confidence
antiEvidence
```

Validation ideas:

- Clean landing should require visible board contact and continued riding.
- Butt check should require visible hip/seat contact or clear loss of riding
  posture.
- Edge catch should require visible edge dig, abrupt deceleration, or fall.
- High confidence should require direct landing evidence, not inferred trick
  difficulty.

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
