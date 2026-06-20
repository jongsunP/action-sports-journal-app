# Evidence Post-processing Calibration Matrix

## Purpose

This document is the working calibration matrix for Action Sports Journal's
current one-call AI analysis path.

The goal is to improve the quality of:

```text
Gemini Evidence Extraction
-> ObservedFacts
-> Validators
-> CandidateTrace
-> KnowledgeRules
-> Rider-facing Summary
```

without adding an AI Coach layer, a second API call, database changes, or major
UI changes.

## Why This Document Exists Now

The product is currently in the Evidence Extraction + Rider-facing Analysis
Summary stage.

The system can already produce rich technical evidence, but quality problems
can still appear in several places:

- Gemini may produce a weak or overconfident raw candidate.
- ObservedFacts may be incomplete or ambiguous.
- Validators may downgrade correctly but leave the user-facing reason unclear.
- CandidateTrace may preserve the right candidate but still feel confusing.
- KnowledgeRules may identify a useful pattern that is not yet reflected in
  rider-facing language.
- Rider-facing Summary may still sound too certain, too vague, or too technical.

This matrix exists so changes are driven by repeated real-video patterns, not
by one surprising output.

## Current Analysis Flow

### Gemini Evidence Extraction

One uploaded Moment normally triggers one Gemini Pro Evidence Extraction call.

This call is responsible for extracting visible evidence from the video. It is
not the future AI Coach call.

### ObservedFacts

ObservedFacts break the video into visible wakeboard facts:

- ApproachObservedFacts
- EdgeLoadObservedFacts
- PopObservedFacts
- RotationObservedFacts
- LandingObservedFacts
- GrabObservedFacts
- InversionObservedFacts

These facts should describe what is visible, not decide the rider's training
plan.

### Validators

Validators check whether the observed facts are physically supported and
internally consistent.

They should downgrade or mark results for review when evidence is missing,
weak, contradictory, outside the relevant time window, or label-only.

### CandidateTrace

CandidateTrace keeps the distinction between:

- raw Gemini candidate,
- safe app-facing result,
- observed signals,
- downgrade reasons,
- review state.

It helps prevent a raw candidate such as Back Roll from disappearing entirely
while still avoiding overconfident trick naming.

### KnowledgeRules

KnowledgeRules apply deterministic wakeboard domain logic to validated facts.

They are not a Coach yet. In this stage, they should help interpret evidence
and support safer summary language.

### Rider-facing Summary

Rider-facing Summary translates evidence into language a rider can understand.

It should:

- avoid internal technical labels where possible,
- keep uncertainty visible,
- avoid overclaiming trick names,
- explain review-needed cases clearly,
- provide simple next-practice cues only when grounded in the evidence.

## Calibration Matrix

Do not invent rows.

Only add a row after a real video has been uploaded, analyzed, and reviewed.

| Sample ID | 영상 맥락 | 사용자가 기대한 기술/상황 | Raw Gemini candidate | ObservedFacts 핵심값 | Validator 결과 | CandidateTrace / downgrade 여부 | Rider-facing title | Rider-facing summary | 오해 가능 문구 | 수정 필요 여부 | 후속 조치 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| TODO-real-sample-001 | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| TODO-real-sample-002 | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| TODO-real-sample-003 | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| TODO-real-sample-004 | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| TODO-real-sample-005 | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO |

## Row Guidance

### Sample ID

Use a stable label that can be traced later.

Examples:

```text
real-2026-06-20-ts-basic-air-01
real-2026-06-20-backroll-review-01
```

Do not paste secret URLs, API keys, or private storage paths.

### 영상 맥락

Describe the visible clip context in plain language.

Example:

```text
Short wakeboard clip under 10 seconds, rider approaches wake and jumps.
```

### 사용자가 기대한 기술/상황

Record what the founder/rider expected the clip to represent.

This is not automatically truth. It is the human expectation used for QA.

### Raw Gemini candidate

Record the raw candidate only if available from debug/evidence output.

Do not treat this as the final app-facing result.

### ObservedFacts 핵심값

Capture only the values needed to understand the case.

Example:

```text
approach=toeside, edgeLoad=moderate, pop=on_wake, rotationAxis=none,
inversionDetected=false, landing=rides_away, grabDetected=false
```

### Validator 결과

Record whether validators changed confidence, added warnings, or marked
`needsReview`.

### CandidateTrace / downgrade 여부

Record:

- raw candidate,
- safe result,
- display label,
- downgrade reasons,
- whether `needsReview` is true.

### Rider-facing title

Record exactly what the user sees at the top of the analysis summary.

### Rider-facing summary

Record the main rider-facing summary sentence.

### 오해 가능 문구

Record any wording that could cause the rider to misunderstand the result.

Examples:

- sounds too certain,
- hides a review-needed state,
- sounds like coaching rather than analysis,
- uses an internal pipeline term,
- loses a meaningful candidate entirely.

### 수정 필요 여부

Use one of:

```text
no
maybe
yes
```

Do not mark `yes` based on a single odd case unless the wording is clearly
unsafe or misleading.

### 후속 조치

Record the recommended action.

Examples:

- no code change,
- collect more samples,
- adjust rider-facing wording,
- add validator warning mapping,
- update candidateTrace display,
- review prompt/schema only after repeated pattern.

## Operating Method

Use this matrix as the next QA loop:

1. Upload and analyze 5 to 10 real wakeboard videos.
2. Record each result in the matrix.
3. Compare the user expectation, raw Gemini candidate, validated facts,
   CandidateTrace, and Rider-facing Summary.
4. Look for repeated misunderstanding patterns.
5. Improve code only for repeated or clearly unsafe patterns.
6. Do not change prompt/schema because of one isolated result.
7. Do not add a second AI Coach call for issues that can be solved by safer
   post-processing.

## Current Boundary

This document is only for the one-call Evidence Extraction path.

It does not define:

- AI Coach implementation,
- second API call behavior,
- database schema changes,
- progression tracking,
- multi-video comparison,
- paid coaching features.

Those belong to later stages after the analysis layer is calibrated.
