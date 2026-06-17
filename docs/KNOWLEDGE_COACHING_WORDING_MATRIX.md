# Knowledge Coaching Wording Matrix

Date: 2026-06-17

Purpose:

Verify whether the limited Knowledge -> Coaching prompt connection produces
rider-facing coaching language safely.

This is a validation document only. It does not change code, prompts, database
schema, UI, Supabase, OpenAI benchmark, or Progression.

## Current Connection Under Test

Confirmed Fact:

- Wakeboard Knowledge Base v1 is implemented.
- CoachingInsightContext transform is implemented.
- Gemini short analysis path consumes compact `CoachingInsightContext`.
- Only `direct_cue` and `review_context` are allowed into prompt context.
- `internal_only` is excluded from rider-facing prompt context.
- The connection is limited to:

```text
POST /api/analyze-session-video
```

Out of scope:

- DB storage,
- UI rendering,
- Supabase migration,
- OpenAI benchmark path,
- Progression.

## Safety Checks

Each scenario checks:

- `direct_cue` does not become overconfident.
- `review_context` does not become a hard cause diagnosis.
- `internal_only` does not leak to rider-facing output.
- Grab-related wording does not create a false positive.
- Low-confidence facts do not become firm training instructions.

## Scenario Matrix

### 1. No-Grab Basic Air

Status:

```text
Executed on Render + Gemini 2.5 Pro
```

Sample:

```text
dev-artifacts/benchmark-videos/ts_regular_1.mov
```

Why this sample:

- This is a known no-grab Basic Air style sample.
- Previous visual review around 1.20s to 1.65s did not confirm clear
  hand-to-board contact.
- It is the primary regression sample for Grab false-positive prevention.

Injected coaching context:

```text
direct_cue:
- strong_pop_supports_rotation.v1
- confidence: medium
- message: The takeoff quality may support controlled rotation or air position.

review_context:
- grab_attempt_indicates_air_awareness.v1
- confidence: medium
- message: A possible reach near the board may need visual review before
  calling it a grab attempt.

internal_only:
- late_handle_pull_destabilizes_rotation.v1
- confidence: low
- message: Late or loose handle movement may be affecting rotation control.
```

First operating attempt:

```text
Result: Gemini busy / congestion
Error: Gemini 모델이 현재 혼잡합니다. 잠시 후 다시 시도해 주세요.
```

Retry result:

```text
status: completed
summary: 기본적인 에어 트릭을 연습하는 모습입니다.
highlights:
- 기본 에어 트릭 연습
- 자세 교정
suggestions:
- 팝 동작 시 보드 컨트롤 향상
- 착지 동작 시 안정성 강화
rawLength: 362
```

Safety result:

```text
internal_only leaked: false
hard grab diagnosis: false
review_context became hard cause diagnosis: false
response schema completed: true
```

Assessment:

The output stayed safe for this sample. It did not say the rider grabbed the
board, did not expose the internal handle-pull caution, and did not turn the
grab review context into a firm diagnosis.

Observation:

The suggestions were generic. "착지 동작 시 안정성 강화" is not unsafe, but it is
also not strongly grounded in this specific validation context. This reinforces
that the next phase should test wording quality, not only safety.

### 2. Known True Grab

Status:

```text
Not executed - sample not secured
```

Reason:

No known true-grab source video is currently available in the local benchmark
set. Do not treat the existing `ts_regular_1.mov` no-grab sample as a true grab.

Required future check:

- Confirm `grabDetected=true` and `contactVisible=true` from Evidence.
- Confirm Coaching does not overstate the grab name.
- Confirm wording focuses on visible hand/board contact and air awareness.
- Confirm `grab_attempt_indicates_air_awareness.v1` does not produce false
  confidence when contact is only partial or occluded.

### 3. Low-Confidence Facts

Status:

```text
Not executed as a full video scenario - verified only as prompt-context safety
```

Available evidence:

- Fixture/script validation confirms `internal_only` is excluded from prompt
  context.
- Operating no-grab sample included a low-confidence `internal_only` handle
  context and it did not leak to rider-facing output.

Unknown:

No dedicated low-confidence riding sample has been verified end-to-end through
Evidence -> KnowledgeInsights -> Coaching wording.

Required future check:

- Use a real sample whose Evidence validators mark `requiresReview=true`.
- Confirm low confidence remains "확인 필요" or "가능성" wording.
- Confirm it does not become a primary drill or firm correction.

### 4. Failed Landing

Status:

```text
Not executed - sample not secured
```

Reason:

No confirmed failed-landing video sample is currently available in the local
benchmark set.

Required future check:

- Use a sample with visible `landingOutcome=fall`, `butt_check`, or failed
  recovery.
- Confirm coaching does not shame the rider or overstate the cause.
- Confirm landing facts do not override trick identity.
- Confirm review-context language remains cautious if the landing is cropped,
  splashed, or partially visible.

### 5. Invert / Back Roll Possible Sample

Status:

```text
Not executed - sample not secured
```

Reason:

No accessible known Back Roll / invert source video is currently available in
the benchmark set.

Required future check:

- Use a known Back Roll or invert sample.
- Confirm RotationObservedFacts and taxonomy gates support the family.
- Confirm coaching does not claim inversion if the evidence is review-only.
- Confirm false positive guardrails still protect Basic Air samples.

## Current Judgment

Confirmed Fact:

The limited Knowledge -> Coaching prompt connection is safe on the available
no-grab Basic Air sample.

Observation:

The current Gemini short-analysis output is safe but generic. It did not leak
unsafe internal context, but it also did not produce highly specific coaching.

Unknown:

- True-grab positive wording quality.
- Failed-landing wording quality.
- Low-confidence full-video wording quality.
- Invert/backroll wording quality.

Recommendation:

Do not expand Knowledge -> Coaching into OpenAI benchmark, UI, DB, or
Progression yet. First secure a small validated video set:

- no-grab Basic Air,
- known true grab,
- low-confidence/review-heavy sample,
- failed landing,
- known Back Roll or invert.

Then rerun this wording matrix against each sample.

