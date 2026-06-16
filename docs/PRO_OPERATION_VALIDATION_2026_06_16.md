# Pro Operation Validation 2026-06-16

## Purpose

Record the first production validation after switching Action Sports Journal's
operating Gemini evidence model from Flash to Pro.

This document is about the live Render-backed product evidence flow, not the
dev-only benchmark runner.

## 1. Flash To Pro Background

Confirmed benchmark result:

- `docs/MODEL_BENCHMARK_REPORT_2026_06_16.md` compared Gemini 2.5 Flash and
  Gemini 2.5 Pro on the 12-clip wakeboard Toe/Heel Ground Truth Dataset v1.
- Flash result:
  - 10/12 correct, 83.3%.
  - 1 high-confidence wrong edge result.
  - 1 invalid JSON / unknown result.
  - Goofy clips exposed reliability risk.
- Pro result:
  - 12/12 correct, 100%.
  - 0 high-confidence wrong.
  - 0 unknown / invalid JSON.

Observation:

- The main Flash risk was not only lower accuracy.
- The product risk was high-confidence wrong edge classification.
- Edge direction is upstream of approach detection and trick-family decisions,
  so a wrong Toe/Heel label can contaminate downstream evidence and coaching.

Decision:

- Move the operating evidence extraction model to Gemini 2.5 Pro for the
  current personal-use MVP validation period.
- Keep future hybrid routing open, but do not build it before validating Pro in
  real product use.

## 2. Render Environment Change

Render Web Service:

```text
action-sports-journal-api
```

Environment change:

```text
GEMINI_ANALYSIS_MODEL=gemini-2.5-pro
```

Fallback remained:

```text
GEMINI_FALLBACK_MODEL=gemini-2.5-flash-lite
```

Important boundary:

- No app code change was required.
- No EAS rebuild was required.
- The iPhone app calls the same Render endpoint, and the backend selects the
  model from server environment variables.

## 3. Operating Deployment Verification

Render redeploy was completed after the environment variable change.

`/health` confirmed:

```text
httpStatus: 200
ok: true
geminiConfigured: true
geminiModel: gemini-2.5-pro
geminiEvidence.configured: true
geminiEvidence.model: gemini-2.5-pro
geminiEvidence.fallbackModel: gemini-2.5-flash-lite
```

Confirmed fact:

- The live Render backend is using `gemini-2.5-pro` as the operating Gemini
  model for evidence extraction.

## 4. Production Evidence Extraction Verification

Two real standalone-app Moments were uploaded and analyzed after the Pro
deployment:

```text
nee toe
nee heel
```

Both Moments completed Evidence Extraction through the live Render backend and
were persisted to Supabase.

## 5. Model Persistence Verification

### nee toe

Moment:

```text
title: nee toe
status: completed
```

Model persistence:

```text
analysis_jobs.model: gemini-2.5-pro
evidence_results.model: gemini-2.5-pro
```

### nee heel

Moment:

```text
title: nee heel
status: completed
```

Model persistence:

```text
analysis_jobs.model: gemini-2.5-pro
evidence_results.model: gemini-2.5-pro
```

Confirmed fact:

- The live product evidence flow did not merely report Pro in `/health`.
- The actual saved job and saved evidence rows also recorded
  `gemini-2.5-pro`.

## 6. nee toe Result

Top-level result:

```text
predicted_trick: Toeside Basic Jump
family: Basic Jump
confidence: high
model: gemini-2.5-pro
```

Approach / edge result:

```text
approachDecisionV2.value: toeside
approachDecisionV2.confidence: low
edgeDirectionEvidence.value: Looks toeside
edgeDirectionEvidence.confidence: high
```

Edge load observed facts:

```text
toeEdgeLoaded: True / high
heelEdgeLoaded: False / high
edgeLoadVisible: True / high
boardTiltDirection: Toe edge down / medium
sprayDirection: Away from the toe edge / medium
edgeLoadConfidence: high
```

Observation:

- The clip named `nee toe` was classified as toe-side.
- The trick/family result was also consistent with the current product
  expectation: Basic Jump / Toeside Basic Jump.
- This is a significant improvement from earlier false-positive paths where a
  Toeside Basic Jump could drift into Back Roll, Tantrum, or Invert.

Validation caveat:

- `needs_review` remained true.
- `approachDecisionV2.confidence` remained low.
- The low V2 confidence came from the validator, not from the raw model result.
- The validator saw supporting evidence for toeside, but not enough strong
  primary evidence to promote the derived V2 decision to high confidence.

## 7. nee heel Result

Top-level result:

```text
predicted_trick: Back Roll
family: Invert
confidence: high
model: gemini-2.5-pro
```

Approach / edge result:

```text
approachDecisionV2.value: heelside
approachDecisionV2.confidence: low
edgeDirectionEvidence.value: Heelside Approach
edgeDirectionEvidence.confidence: high
```

Edge load observed facts:

```text
toeEdgeLoaded: false / high
heelEdgeLoaded: true / high
edgeLoadVisible: true / high
boardTiltDirection: heel edge / high
sprayDirection: heel spray / high
riderWeightOverEdge: true / high
edgeLoadConfidence: high
```

Observation:

- The clip named `nee heel` was classified as heelside.
- The trick/family result was internally consistent with the raw evidence:
  Back Roll / Invert.
- If the user's domain review agrees that this clip is a heelside invert /
  back-roll attempt, the Pro result is product-useful.

Validation caveat:

- `needs_review` remained true.
- `approachDecisionV2.confidence` remained low.
- The validator stayed conservative even though raw edge evidence was high.

## 8. Flash-Era Comparison

Confirmed benchmark context:

- Flash had at least one high-confidence wrong Toe/Heel result on the smoke
  benchmark.
- Flash showed weaker Goofy stability.
- Flash also produced an invalid JSON / unknown case.

Confirmed operating observation after Pro:

- `nee toe` was judged toe.
- `nee heel` was judged heel.
- Both were processed by `gemini-2.5-pro`.
- Both completed and persisted successfully.
- Trick/family outputs were more coherent with the clip titles and edge
  direction than the earlier false-positive Toeside Basic Jump path.

Observation:

- This does not prove Pro is perfect.
- It does show that Pro is behaving better than the known Flash failure mode on
  these two real operating samples.

## 9. Current Judgment

Recommendation:

- Treat the Pro operating switch as successful.
- Keep Pro as the operating evidence model for the current personal-use MVP.
- Continue collecting real iPhone samples and compare the model output against
  human wakeboard review.

Product judgment:

- The user can trust these results more than prior Flash-era edge outputs.
- The app still should not present them as unchallengeable truth.
- The best current product language remains "AI evidence result" plus a review
  or confirmation affordance for high-impact classification.

## 10. Remaining Issue

Confirmed issue:

- The validator still sets:

```text
needs_review: true
approachDecisionV2.confidence: low
```

for both `nee toe` and `nee heel`.

Likely cause:

- The raw Gemini Pro output provides high-confidence edge evidence.
- The V2 validator is intentionally conservative and is not yet promoting edge
  decisions to high confidence unless it sees enough strong primary signals.
- Some strong-looking raw facts are still being treated as weak/supporting
  signals.

Unknown:

- Whether the validator is too conservative, or whether it is correctly
  protecting the product from overtrusting model-generated physical evidence.

Recommended next work:

1. Review `ApproachDecisionV2` scoring and signal strength rules.
2. Decide what counts as strong primary evidence for edge/approach:
   - direct edge load facts
   - board tilt direction
   - spray source
   - rider weight over loaded edge
   - final approach window timing
3. Do not simply remove `needs_review`.
4. Calibrate V2 confidence so strong Pro evidence can become medium/high when
   independent physical facts agree, while still catching hallucinated evidence.

