# Back Roll Display And Stale Moment Review

Date: 2026-06-17

Purpose:

Investigate why a recent Back Roll video produced a raw Gemini Back Roll
candidate and supporting ObservedFacts, but the installed app displayed the
top-level result as "확인 필요". Also review incomplete queued Moment rows that
can appear after interrupted uploads.

This document is investigation and design only. No code, migration, UI, or
database changes are implemented here.

## Summary

Confirmed fact:

For the recent completed Back Roll Moment, Gemini raw output did identify:

- `primaryCandidate.name = Back Roll`
- `family.value = Invert`
- `rotationType.value = Back Roll`
- `approachDecisionV2.value = heelside`
- `rotationObservedFacts.rotationAxis = roll_axis`
- `rotationObservedFacts.inversionDetected = true`
- `inversionObservedFacts.boardAboveHead = true`
- `inversionObservedFacts.rollAxisObserved = true`
- `popObservedFacts.popType = progressive_pop`
- `popObservedFacts.timing = on_wake`

Confirmed fact:

The persisted top-level row for that same completed Moment is:

- `predicted_trick = 확인 필요`
- `family = 확인 필요`
- `confidence = low`
- `needs_review = true`
- `consistency_status = needs_review`

Conclusion:

The Back Roll candidate did not disappear because Gemini failed to see it. It
disappeared because the current safety pipeline stores only the post-gated,
post-consistency top-level candidate. Once that candidate is downgraded to
`확인 필요`, the app restore path has no durable raw/safe candidate split to show
"Back Roll 가능성 / 확인 필요".

## Recent Test Rows

Recent user test rows showed three Moment rows, but only two valid video-backed
attempts:

### Completed Back Roll Row

Moment:

- title: `백롤`
- status: `completed`
- file: `IMG_7211.MOV`
- duration: 9.0s
- latest analysis job: completed
- latest evidence result: present

Persisted evidence result:

- model: `gemini-2.5-pro`
- predicted trick: `확인 필요`
- family: `확인 필요`
- confidence: `low`
- needs review: `true`

Raw Gemini evidence in `raw_response_text` included Back Roll / Invert / Back
Roll rotation labels.

### Incomplete Queued Back Roll Row

Moment:

- title: `백롤`
- status: `queued`
- file_name: `null`
- file_size: `0`
- duration_ms: `0`
- source_video_uri: missing
- latest evidence result: `null`
- analysis job: `queued`
- attempts: `0`
- started_at: `null`

This row cannot complete analysis because the stored database record does not
contain a usable video payload. It should be treated as stale/incomplete, not as
a normal queued analysis.

### Completed Test Row

Moment:

- title: `테스트`
- status: `completed`
- file: `FullSizeRender.mov`
- duration: 8.4s
- latest analysis job: completed
- latest evidence result: present

It has similar behavior: raw evidence contains Back Roll-like rotation/inversion
facts, while persisted top-level display is `확인 필요`.

## Pipeline Breakdown

### 1. Raw Gemini Candidate

Location:

- `dev-server/index.ts`
- Gemini evidence prompt and parsing path around `parseGeminiEvidence`

Observed behavior:

Gemini raw text can contain a strong candidate:

```text
primaryCandidate.name: Back Roll
family.value: Invert
rotationType.value: Back Roll
```

This is preserved in:

- `raw_response_text`
- local/debug artifacts when available

Current issue:

Raw candidate is not stored in first-class structured columns. It is only
recoverable from the raw response text or debug artifacts.

### 2. Observed Facts

Location:

- `dev-server/index.ts`
- normalized evidence result
- `evidence_results` JSONB columns

Relevant stored facts:

- `approach_decision_v2`
- `pop_observed_facts`
- `rotation_observed_facts`
- `rotation_validation`
- `landing_observed_facts`
- `grab_observed_facts`
- `inversion_observed_facts`

Recent Back Roll stored facts:

```text
approachDecisionV2.value = heelside
approachDecisionV2.confidence = low
rotationObservedFacts.rotationAxis = roll_axis
rotationObservedFacts.inversionDetected = true
rotationObservedFacts.confidence = medium
inversionObservedFacts.bodyInverted = true
inversionObservedFacts.boardAboveHead = true
inversionObservedFacts.rollAxisObserved = true
popObservedFacts.popType = progressive_pop
popObservedFacts.timing = on_wake
```

Observation:

The facts support "Back Roll candidate should remain visible as a possible
candidate", but they do not necessarily justify a confident final Back Roll
label.

### 3. Taxonomy Gate

Location:

- `dev-server/index.ts`
- `applyWakeboardTaxonomyGates`
- `validateWakeboardTaxonomy`
- `trickCandidateForTaxonomy`
- `familyFactForTaxonomy`
- `rotationFactForTaxonomy`

Current behavior:

If taxonomy gate failures exist:

- `primaryCandidate` is replaced with a safe name:
  - `Basic Air / Straight Air`, or
  - `확인 필요`
- `family` is replaced with:
  - `Basic Air / Straight Air`, or
  - `확인 필요`
- `rotationType` is replaced with:
  - `No roll axis / 확인 필요`, or
  - `확인 필요`
- overall confidence is forced to `low`

Important code behavior:

```text
persisted top-level result is based on the gated candidate, not raw Gemini.
```

Confirmed from code:

`persistEvidenceResultForLinkedMoment` writes:

```text
predicted_trick = evidence.primaryCandidate.name
family = evidence.family.value
confidence = evidence.confidence
```

At that point, `evidence` is already the normalized/gated/consistency-adjusted
result.

Hypothesis:

For the recent Back Roll row, taxonomy may have passed or partially passed, but
the final persisted state proves that at least one later safety step lowered the
top-level candidate before persistence. The exact taxonomy warnings/gateFailures
were not persisted as columns, so DB-only diagnosis cannot fully prove whether
taxonomy gate was the first downgrade point.

### 4. Rotation Validator

Location:

- `dev-server/index.ts`
- rotation observed facts normalization/validation

Recent Back Roll result:

Before validation:

```text
rotation confidence = high
rotationAxis = roll_axis
inversionDetected = true
antiEvidence = []
```

After validation:

```text
rotation confidence = medium
needsReview = true
rulesApplied:
  - Rotation confidence downgraded from high to medium.
  - Rotation confidence was high while antiEvidence was empty.
rejectedHighConfidenceReasons:
  - Rotation high confidence requires at least two independent visible rotation indicators.
  - Rotation high confidence requires antiEvidence to document missing or contradictory cues.
```

Observation:

The rotation validator is intentionally conservative. It prevents overconfident
Back Roll/Invert claims, but in this case it contributes to the final top-level
candidate becoming too invisible.

### 5. Consistency Decision

Location:

- `dev-server/index.ts`
- `applyGeminiEvidenceConsistency`

Current behavior:

If consistency is not `valid`, the function returns a modified result:

- `confidence = low`
- `primaryCandidate.confidence = low`
- `uncertainty.level = high`

If status is `inconsistent` and the candidate is an invert family, it can replace
the candidate with:

```text
unknown invert
```

If status is only `needs_review`, it keeps the candidate name but lowers
confidence.

Important observed behavior:

The recent persisted row is:

```text
consistency_status = needs_review
predicted_trick = 확인 필요
```

That means one of the earlier normalized/gated stages likely already replaced
the top-level candidate with `확인 필요`, or Gemini parsing/normalization produced
a safe candidate before consistency persisted it. Consistency then preserved the
safe candidate while lowering/keeping low confidence.

Confirmed limitation:

`taxonomyWarnings`, `gateFailures`, `rawFamilyCandidate`, and
`safeFamilyCandidate` are returned in the evidence response/debug artifact but
are not persisted in `evidence_results`. That makes after-the-fact DB diagnosis
lossy.

### 6. Persistence Mapping

Location:

- `dev-server/index.ts`
- `persistEvidenceResultForLinkedMoment`

Current behavior:

Persistence writes the already-safe app-facing result:

```text
predicted_trick: evidence.primaryCandidate.name
family: evidence.family.value
confidence: evidence.confidence
```

It also stores the raw Gemini text:

```text
raw_response_text
```

But it does not store first-class structured versions of:

- raw candidate,
- raw family,
- raw rotation type,
- safe candidate,
- gate failures,
- taxonomy warnings,
- candidate before consistency,
- candidate after consistency.

Conclusion:

Persistence mapping is not the original cause. It is faithfully storing the
post-safety result. The problem is that it stores no structured candidate trace,
so the app can only show `확인 필요` even when raw Back Roll evidence exists.

### 7. App Restore Mapping

Location:

- `src/services/moments/supabaseMoments.ts`
- `normalizeRemoteEvidenceResult`
- `src/features/sessions/HomeScreen.tsx`
- `GeminiEvidenceView`

Current behavior:

Remote evidence is restored from persisted columns:

```text
primaryCandidate.name = evidence_results.predicted_trick
family.value = evidence_results.family
confidence = evidence_results.confidence
```

The app also restores many ObservedFacts JSONB objects.

Current limitation:

The app restore path sets summary facts to placeholders:

```text
approachType.value = 확인 필요
rotationType.value = 확인 필요
landingOutcome.value = 확인 필요
```

Reason:

Those top-level summary fields are not stored in dedicated columns.

User-visible effect:

Even if stored ObservedFacts contain:

```text
approachDecisionV2 = heelside
rotationObservedFacts = roll_axis + inversionDetected
inversionObservedFacts = boardAboveHead + rollAxisObserved
```

the normal summary cards can still show:

```text
Predicted: 확인 필요
Family: 확인 필요
어프로치: 확인 필요
회전: 확인 필요
```

unless a debug/internal section is opened.

## Exact Point Where Back Roll Disappears

Confirmed:

The raw Gemini candidate exists.

Confirmed:

ObservedFacts supporting Back Roll mechanics exist.

Confirmed:

The persisted top-level fields do not contain Back Roll.

Most likely downgrade path:

```text
Raw Gemini candidate: Back Roll / Invert / Back Roll
-> ObservedFacts: heelside + roll_axis + inversion
-> Rotation validator: high -> medium, needsReview=true
-> Taxonomy/consistency app-facing safety result: candidate/family lowered
-> Persistence: stores lowered top-level result only
-> App restore: shows persisted top-level result, not raw candidate trace
```

Unknown:

The exact taxonomy `gateFailures` for the recent run are unknown from DB alone
because they were not persisted as structured columns. Render
`/debug/evidence-captures` could contain them, but the local token used during
this investigation received `401` from the live service.

## Recommended Fix Direction

### Principle

Do not swing back to overconfident Back Roll labeling.

The correct app-facing behavior is not:

```text
Back Roll
```

when validators require review.

The better behavior is:

```text
Back Roll 가능성 / 확인 필요
```

or:

```text
Likely Back Roll mechanics observed, needs review
```

This preserves the useful candidate without overstating certainty.

### Recommended Data Model / Response Fix

Add a durable candidate trace, either in response-only first or persisted later:

```ts
candidateTrace: {
  rawPrimaryCandidate: TrickCandidateEvidence;
  rawFamily: EvidenceFact;
  rawRotationType: EvidenceFact;
  safePrimaryCandidate: TrickCandidateEvidence;
  safeFamily: EvidenceFact;
  safeRotationType: EvidenceFact;
  downgradeReason: string[];
  downgradeStage: 'taxonomy' | 'validator' | 'consistency' | 'parse' | 'unknown';
}
```

MVP without migration:

- Include this in response/debug artifacts first.
- Use it only in Debug Viewer.

MVP with app display improvement:

- If persisted `predicted_trick` is `확인 필요`, derive a conservative display
  candidate from stored facts:
  - `approachDecisionV2.value = heelside`
  - `rotationObservedFacts.rotationAxis = roll_axis`
  - `rotationObservedFacts.inversionDetected = true`
  - `inversionObservedFacts.boardAboveHead = true`
  - `inversionObservedFacts.rollAxisObserved = true`
- Display:

```text
Back Roll 가능성
확인 필요
```

Do not write this derived label back as confirmed `predicted_trick`.

### Recommended Persistence Fix

Add structured columns later if needed:

- `raw_predicted_trick`
- `raw_family`
- `raw_rotation_type`
- `safe_predicted_trick`
- `safe_family`
- `taxonomy_warnings`
- `gate_failures`
- `candidate_trace jsonb`

Lower-risk alternative:

- Add one `candidate_trace jsonb` column instead of many scalar columns.

Recommendation:

Start response/debug-only, then persist `candidate_trace jsonb` if the display
logic proves useful.

### Recommended App Restore Fix

Improve `normalizeRemoteEvidenceResult`:

1. Restore `approachType` from `approach_decision_v2` when available.
2. Restore `rotationType` conservatively from `rotation_observed_facts`:
   - roll axis + inversion true -> `Back Roll mechanics / 확인 필요`
   - no rotation -> `No rotation`
   - unknown -> `확인 필요`
3. Restore `landingOutcome` from `landing_observed_facts` when available.
4. Preserve top-level `predicted_trick = 확인 필요` if it was downgraded, but add
   an app-facing possible candidate label.

Possible app-facing copy:

```text
AI 추정 기술: 확인 필요
가능성: Back Roll mechanics observed
Review: needs_review
```

or Korean-only:

```text
AI 추정 기술: 확인 필요
관찰된 가능성: 백롤 계열 동작
상태: 확인 필요
```

## Stale / Incomplete Queued Moment Review

### Current Behavior

Location:

- `dev-server/index.ts`
- `POST /api/moments`
- `createQueuedEvidenceAnalysisJob`
- `GET /api/moments`
- `src/services/moments/supabaseMoments.ts`

Current creation flow:

```text
POST /api/moments
-> insert moments row
-> create queued analysis_jobs row
-> app later uploads video/evidence request
```

Issue:

If the flow is interrupted after Moment/job creation but before video evidence
request starts, DB can contain:

```text
moments.status = queued
file_name = null
file_size = 0
duration_ms = 0
source_video_uri missing
latest_evidence_result_id = null
analysis_jobs.status = queued
analysis_jobs.attempts = 0
analysis_jobs.started_at = null
```

These rows cannot progress by themselves because no durable video payload is
stored.

### Current Stale Queued Examples

At investigation time, queued rows included:

1. Recent Back Roll incomplete row:
   - file metadata missing
   - video uri missing
   - job attempts 0
   - started_at null

2. Older queued row:
   - file metadata exists
   - evidence result missing
   - job attempts 0
   - started_at null

The first is clearly incomplete. The second may be stale because the app had a
local video URI but no durable server-side video payload.

### Recommendation: App Filtering

Low-risk first fix:

In the app restore path, hide or visually demote queued Moments that are stale
and non-actionable.

Stale incomplete condition:

```text
status = queued
latest_evidence_result_id is null
analysis job attempts = 0 or unknown
and (
  source_video_uri missing
  or file_name missing
  or file_size is null/0
  or duration_ms is null/0
)
and created_at older than a short grace period
```

Suggested grace period:

- 2 minutes for local UI hiding.
- 10 minutes for server cleanup.

Display option:

- Hide from normal feed after grace period.
- Keep visible in Debug Viewer / developer tools if needed.

### Recommendation: Server Cleanup

Add a cleanup path later:

- Mark stale queued jobs as `failed`.
- Mark linked Moments as `failed` or `abandoned`.
- Write `last_error`:

```text
stale queued job: video payload was not received
```

Potential implementation locations:

- On `GET /api/moments`, optionally run lightweight stale cleanup before listing.
- Safer: dedicated admin/debug cleanup endpoint guarded by token.
- Later: scheduled job if infrastructure grows.

Recommendation:

Do not silently delete rows first. Mark them failed/abandoned so the behavior is
auditable.

### Recommendation: Creation Flow Guard

Future improvement:

Avoid creating durable queued jobs unless the app has enough video metadata to
attempt evidence extraction.

Minimum validation for `POST /api/moments`:

- reject or mark draft if:
  - no `sourceVideoUri`,
  - no `fileName`,
  - `fileSize <= 0`,
  - `durationMs <= 0`.

However:

This must be done carefully because some local/dev benchmark flows may create
Moments with partial metadata. Add the guard behind a clear helper and test
against existing scripts.

## Related Files

Server:

- `dev-server/index.ts`
  - `POST /api/moments`
  - `GET /api/moments`
  - `applyWakeboardTaxonomyGates`
  - `validateWakeboardTaxonomy`
  - `applyGeminiEvidenceConsistency`
  - `persistEvidenceResultForLinkedMoment`

App restore:

- `src/services/moments/supabaseMoments.ts`
  - `listMoments`
  - `normalizeRemoteMoment`
  - `normalizeRemoteEvidenceResult`

App display:

- `src/features/sessions/HomeScreen.tsx`
  - `getSessionCardPresentation`
  - `MomentDetailModal`
  - `GeminiEvidenceView`

Types:

- `src/types/index.ts`
  - `GeminiEvidenceResult`
  - `TrickCandidateEvidence`
  - `EvidenceFact`

Debug docs:

- `docs/DEBUG_RESULT_VIEWER_DESIGN.md`
- `docs/DEVELOPER_TOOLS_BACKLOG.md`

## Proposed Implementation Plan

### Step 1: Preserve Candidate Trace In Debug Response

Scope:

- server only
- no DB migration
- no UI change except Debug Viewer if desired

Goal:

Expose:

- raw candidate,
- taxonomy safe candidate,
- consistency result,
- downgrade reason.

### Step 2: Improve App Restore Summaries

Scope:

- app restore mapping only

Goal:

Use persisted ObservedFacts to show useful non-final summaries:

- approach from `approachDecisionV2`
- rotation mechanics from `rotationObservedFacts`
- landing from `landingObservedFacts`

Do not convert these into confirmed trick names.

### Step 3: Add Possible Candidate Display

Scope:

- app display only

Goal:

When top-level is `확인 필요` but facts strongly indicate a family/candidate, show:

```text
가능성: 백롤 계열 동작
상태: 확인 필요
```

Do not show:

```text
확정 Back Roll
```

### Step 4: Handle Stale Queued Moments

Scope:

- app filtering first
- server cleanup second

Goal:

Prevent incomplete queued rows from appearing as normal ride Moments.

### Step 5: Persist Candidate Trace If Needed

Scope:

- DB migration
- server persistence
- app restore

Goal:

Make after-the-fact diagnosis possible without parsing `raw_response_text`.

## Code Changes Needed

Yes, code changes are needed later.

Recommended minimal code changes:

1. `src/services/moments/supabaseMoments.ts`
   - restore approach/rotation/landing summaries from ObservedFacts.
   - optionally filter stale incomplete queued rows after a grace period.

2. `src/features/sessions/HomeScreen.tsx`
   - display possible candidate separately from final predicted trick.
   - keep review wording conservative.

3. `dev-server/index.ts`
   - add response/debug candidate trace.
   - optionally persist candidate trace later.
   - optionally add stale queued cleanup endpoint later.

4. `src/types/index.ts`
   - add candidate trace type if response/debug field is added.

Not recommended as first fix:

- Simply stop downgrading Back Roll.
- Store raw Gemini `Back Roll` directly as final `predicted_trick`.
- Hide all `needs_review` warnings.

Those would reintroduce the earlier false-positive risk.

## Acceptance Criteria For A Future Fix

For a real Back Roll sample:

- raw candidate may be `Back Roll`.
- final prediction may still be `확인 필요` if confidence/review gates require it.
- app must still show a conservative candidate:

```text
관찰된 가능성: 백롤 계열 동작
확인 필요
```

- user must not see a confident Back Roll label unless gates pass.
- Debug Viewer must show why the candidate was downgraded.

For a Toeside Basic Jump sample:

- app must not show `Back Roll 가능성` unless roll axis + inversion facts exist.
- taxonomy gates must continue to suppress false invert/backroll candidates.

For stale queued Moments:

- incomplete queued rows should not look like normal user-created Moments.
- stale cleanup should be auditable, not silent destructive deletion.
