# Project Status - 2026-06-17

This document is the current operating snapshot for Action Sports Journal on
2026-06-17. It is written so a future GPT, Codex session, or successor CTO can
resume without relying on chat history.

Read this together with:

- `docs/PROJECT_MEMORY.md`
- `docs/CURRENT_STAGE.md`
- `docs/WAKEBOARD_OBSERVED_FACTS_V3_PLAN.md`
- `docs/LANDING_OBSERVED_FACTS_DESIGN.md`
- `docs/GRAB_OBSERVED_FACTS_DESIGN.md`
- `docs/PRO_OPERATION_VALIDATION_2026_06_16.md`

## Current Operating Model

Confirmed Fact:

The production evidence extraction model is:

```text
gemini-2.5-pro
```

Render owns the operating model configuration. The standalone iPhone app calls
the Render backend, so changing the Gemini model through Render environment
variables does not require an EAS rebuild.

Current Render model configuration:

```text
GEMINI_ANALYSIS_MODEL=gemini-2.5-pro
GEMINI_FALLBACK_MODEL=gemini-2.5-flash-lite
```

Flash to Pro transition background:

- Flash was useful for early iteration and cost control.
- Flash-era behavior struggled with wakeboard approach and parent-family
  accuracy, including toeside/heelside confusion and invert hallucination.
- Operating checks on recent `nee toe` and `nee heel` samples showed Pro gave
  more reliable approach and family-level outputs.
- Pro is not treated as a complete solution. The product direction is still
  domain decomposition plus validation, not model confidence alone.

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
KnowledgeInsights
↓
CoachingInsightContext
↓
EvidenceResult
```

Implementation reality:

- The standalone iPhone app creates a Moment.
- The Render backend creates an AnalysisJob and starts evidence extraction.
- Evidence extraction results are persisted to Supabase `evidence_results`.
- The app restores Moment and latest Evidence state from Supabase.
- AI keys live only in Render/local environment variables.
- KnowledgeInsights and CoachingInsightContext are currently response/debug and
  Gemini short-analysis prompt context only. They are not stored in Supabase and
  are not rendered as a dedicated UI feature.

## Completed ObservedFacts Layers

All MVP V3 observed-facts layers are now represented in the evidence path:

- Approach
- EdgeLoad
- Pop
- Rotation
- Landing
- Grab

### Approach

Confirmed Fact:

`ApproachObservedFacts` and derived approach decision logic exist.

Current rule:

- Do not ask only "heelside or toeside?"
- Extract stance, lead foot, board direction, wake crossing path, edge evidence,
  handle position, and body orientation first.
- Body orientation is supporting evidence only.
- Chest/back visibility alone must not determine heelside or toeside.
- Approach evidence should be anchored to the final approach window near
  takeoff, not the whole slalom/setup section.

### EdgeLoad

Confirmed Fact:

`EdgeLoadObservedFacts` exists and is connected to validation.

Current rule:

- Edge load should come from board tilt, spray, line tension, rider weight over
  edge, and final approach context.
- Edge labels without visible physical evidence should be downgraded.

### Pop

Confirmed Fact:

`PopObservedFacts` exists with a simplified flat schema and Supabase storage.

Current rule:

- Pop observes takeoff mechanics only.
- It should not infer trick identity.
- Plausible `progressive_pop / on_wake / moderate` cases should not be
  automatically downgraded to low when physical evidence exists.

Important lesson:

- A richer nested Pop schema caused Gemini structured response complexity
  issues. Keep observed-facts schemas flat.

### Rotation

Confirmed Fact:

`RotationObservedFacts` exists with a simplified flat schema and Supabase
storage.

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

Current rule:

- For Basic Air / Straight Air, clear absence of rotation can be valid physical
  evidence.
- For Back Roll / Tantrum / Invert-family candidates, high confidence still
  requires visible rotation or inversion mechanics.

Operating verification:

```text
predicted_trick: Toeside Basic Jump
family: Basic Air / Basic Jump
rotationAxis: none
inversionDetected: false
spinDegrees: 0
handlePassObserved: false
rotationValidation.needsReview: false
```

### Landing

Confirmed Fact:

`LandingObservedFacts` MVP has been implemented and operationally verified on
Render + Gemini 2.5 Pro.

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

Implementation status:

- TypeScript types are added.
- Server normalization and validation are added.
- Gemini prompt asks for landing/recovery observed facts.
- Gemini schema uses a JSON string carrier for `landingObservedFacts`.
- Debug capture and response fields are wired.
- Supabase persistence/restore paths are wired.
- Remote Supabase columns are applied:
  - `evidence_results.landing_observed_facts`
  - `evidence_results.landing_validation`

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

Current rule:

- Landing observes outcome and recovery only.
- Landing must not create or override trick identity.
- Landing fields should be low confidence or unknown when landing is obscured by
  camera crop, splash, video end, or aftermath-only frames.

### Grab

Confirmed Fact:

`GrabObservedFacts` MVP has been implemented and operationally verified on
Render + Gemini 2.5 Pro.

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

Implementation status:

- TypeScript types are added.
- Server normalization and validation are added.
- Gemini prompt asks for grab observed facts.
- Gemini schema uses a JSON string carrier for `grabObservedFacts`.
- Debug capture and response fields are wired.
- Supabase persistence/restore paths are wired.
- Remote Supabase columns are applied:
  - `evidence_results.grab_observed_facts`
  - `evidence_results.grab_validation`

Initial operating verification:

```text
Moment ID: 7090da09-6676-405f-81c8-0b77601ab49f
Analysis Job ID: d09bca5c-4624-494e-8292-2c50dd774f98
Evidence Result ID: d1e7d5ac-2a13-4760-8d46-fd941af90253
model: gemini-2.5-pro
analysis_jobs.status: completed
grab_observed_facts: present
grab_validation: present
```

False-positive finding:

- On `dev-artifacts/benchmark-videos/ts_regular_1.mov`, Gemini Pro initially
  reported a positive grab.
- Manual frame review around 1.20s to 1.65s did not confirm clear hand-to-board
  contact.
- This was treated as a probable false positive or overconfident interpretation
  of hand/board overlap.

Visual review artifacts:

```text
dev-artifacts/grab-validation/ts_regular_1_2026-06-17/
```

False-positive hardening:

- Commit `5b5380e` made Grab prompt/validator more conservative.
- Positive grab now requires visible hand/finger-to-board contact point.
- Hand near board, overlap, occlusion, board poke, style motion, knee tuck, arm
  swing, handle movement, or "appears likely" phrasing must not create a
  positive grab.

Post-hardening operating verification:

```text
Moment ID: a0fe9185-9ec6-42a1-a04d-c9c0a02ead3d
Analysis Job ID: bbb58903-e035-44b5-9a96-a71b0fc5d024
Evidence Result ID: b8f9405e-4e0a-4c2a-aba5-c746201538da
model: gemini-2.5-pro
analysis_jobs.status: completed
grabDetected: false
contactVisible: false
grabValidation.needsReview: false
```

Post-hardening sample:

```json
{
  "grabDetected": false,
  "contactVisible": false,
  "grabbingHand": "none",
  "grabbedBoardZone": "none",
  "grabTiming": "none",
  "grabDuration": "none",
  "evidenceText": "라이더의 양손이 공중 동작 내내 핸들을 잡고 있으며, 보드를 잡으려는 시도가 없습니다.",
  "confidence": "high",
  "antiEvidence": [
    "손과 보드 사이에 충분한 거리가 유지됩니다."
  ]
}
```

Current Grab judgment:

- System E2E is complete.
- The known false positive on `ts_regular_1.mov` was reduced.
- Unknown: true-grab positive quality is not validated yet.
- Risk: the stricter validator may create false negatives until tested against
  known true grab footage.

## Current Operating Verification State

Confirmed Fact:

- Standalone iPhone app works without Expo Go.
- Render backend works.
- Supabase Moment/Evidence persistence works.
- Async Analysis MVP works for queued/processing/completed restoration.
- Gemini 2.5 Pro is the operating evidence model.
- Landing and Grab both completed Render + Gemini Pro E2E verification.
- Wakeboard Knowledge Base v1 is implemented and operationally verified.
- CoachingInsightContext transform is implemented and operationally verified.
- Knowledge -> Coaching prompt injection is connected only to the Gemini short
  analysis path and operationally verified on Render + Gemini 2.5 Pro.

Knowledge / Coaching connection status:

- `knowledgeInsights` are generated from validated ObservedFacts.
- `coachingInsightContext` converts safe KnowledgeInsights into prompt context
  modes:
  - `direct_cue`
  - `review_context`
  - `internal_only`
- Only `direct_cue` and `review_context` can enter the Gemini short-analysis
  prompt.
- `internal_only` is excluded from rider-facing prompt context.
- The connection is limited to `POST /api/analyze-session-video`.
- Not connected:
  - DB storage,
  - dedicated UI rendering,
  - Supabase migration,
  - OpenAI benchmark path,
  - Progression layer.

Operating verification:

```text
Render health:
ok: true
geminiModel: gemini-2.5-pro
geminiEvidence.model: gemini-2.5-pro

Gemini short analysis without Knowledge context:
status: completed
summary: 웨이크보딩 기술 훈련 영상입니다.

Gemini short analysis with Knowledge context:
status: completed
summary: 웨이크보딩 기본 동작을 배우는 영상입니다.
internal_only leaked to rider output: false
review_context became hard cause diagnosis: false
```

Recent important commits:

```text
615781e feat: add landing observed facts MVP
b9e84ad feat: add grab observed facts MVP
5b5380e fix: reduce grab false positives
4e550c feat: add wakeboard knowledge rules v1
def259f feat: add coaching insight context transform
b0ae214 feat: connect knowledge insights to coaching prompt
```

## Known Issues And Risks

### Grab True Positive Not Validated

Confirmed Fact:

The no-grab false positive on `ts_regular_1.mov` was reduced after conservative
Grab prompt/validator changes.

Unknown:

Whether the stricter Grab rules correctly detect a known true grab.

Recommendation:

Next Grab validation should use at least one known true grab sample and one
known no-grab Basic Air sample.

### Coaching Sample Coverage

Confirmed Fact:

Knowledge -> Coaching prompt injection was verified on Render + Gemini 2.5 Pro
with the stable `ts_regular_1.mov` sample.

Unknown:

Whether the wording remains safe across a wider range of rider levels, failed
landings, true grabs, spins, and inverts.

Recommendation:

Before expanding to the OpenAI benchmark path, dedicated UI, or Progression,
run a small coaching wording matrix:

- no-grab Basic Air,
- known true grab,
- weak/low-confidence evidence,
- clean landing,
- failed landing,
- invert sample.

### Gemini Pro Availability / Congestion

Observation:

During operating verification, Gemini Pro occasionally returned a temporary
busy/congestion error. Retrying later produced a completed response.

Recommendation:

Keep short-analysis calls resilient and do not treat a single Gemini busy
response as a product regression. If this becomes frequent, add user-facing
retry copy or a targeted fallback strategy.

### Gemini Schema Complexity

Confirmed Fact:

Gemini structured response schema can fail with `400 INVALID_ARGUMENT` when the
schema becomes too complex.

Current rule:

- Keep new observed-facts schemas flat.
- Avoid nested confidence objects.
- Prefer one top-level confidence field per observed-facts layer.
- Use JSON string carriers for new complex observed-facts sections when needed.

### Upload / Processing Timeout Recovery

Observation:

Async evidence jobs can get stuck in `processing` if the server is interrupted
or the upload/file activation path does not reach the failure handler.

Recommendation:

Add recovery logic later:

- timeout wrapper around Gemini file upload and file activation,
- stale processing job cleanup,
- retry or fail-safe transition for jobs stuck beyond expected age,
- clearer job-level logging with job id and moment id.

### Fresh Back Roll Validation

Unknown:

Fresh Back Roll validation against the new Rotation/Grab/Landing layers still
requires an accessible Back Roll source video file.

## Next Priorities

Recommended next start:

```text
Grab true-positive validation
↓
Known true grab sample vs no-grab Basic Air comparison
↓
Only then tune Grab prompt/validator further
```

Next work candidates:

- Collect or identify known true grab footage.
- Run operating Render + Gemini Pro E2E on true grab footage.
- Compare `grabDetected`, `contactVisible`, `grabDuration`, and
  `grabValidation`.
- Run a broader Knowledge -> Coaching wording matrix before connecting any
  additional coaching paths.
- Add upload/stuck-job recovery for async analysis.
- Fresh Back Roll validation with accessible source video.
- Keep Knowledge -> Coaching disconnected from DB/UI/Progression until wording
  coverage is stronger.

## CTO Summary

Action Sports Journal is no longer primarily an "AI Video Analyzer" project.
It is becoming a Wakeboard Knowledge System.

The important architectural shift:

- Extract observed facts first.
- Validate those facts with wakeboard domain rules.
- Keep trick naming downstream from observed facts.
- Prefer uncertainty over confident but unsupported labels.

Current confidence:

- The deployed standalone app and Render/Supabase pipeline are operational.
- Gemini Pro is the current operating model.
- Approach, EdgeLoad, Pop, Rotation, Landing, and Grab observed-facts layers are
  implemented.
- Landing and Grab E2E paths have been verified in production.
- Knowledge Base v1, CoachingInsightContext, and limited Gemini short-analysis
  prompt injection have been verified in production.

Current uncertainty:

- True-grab positive detection quality is not validated.
- Fresh Back Roll validation still needs accessible source footage.
- Upload-stage timeout recovery remains an infrastructure issue.
- Coaching wording has only limited sample coverage.
- Gemini Pro can be temporarily busy/congested.
