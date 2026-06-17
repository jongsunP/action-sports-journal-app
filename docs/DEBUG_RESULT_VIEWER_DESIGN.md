# Debug Result Viewer Design

Date: 2026-06-17

Purpose:

Design a read-only internal viewer for inspecting the full analysis pipeline:

```text
ObservedFacts
↓
Validators
↓
KnowledgeInsights
↓
CoachingInsightContext
```

This is a design document only. Do not implement UI, change database schema, add
migrations, or change prompts as part of this design step.

## Why This Should Be Separate From User UI

The normal rider-facing UI should stay simple:

- Moment card,
- status,
- evidence result summary,
- coaching or next action.

The debug viewer has a different job:

- inspect raw and normalized model output,
- compare validator before/after state,
- verify rule triggers,
- detect hallucination or overconfident wording,
- support sample matrix testing.

If these fields are mixed into the normal UI, the app becomes harder to use and
the product starts to feel like a developer console instead of a riding journal.

Confirmed design principle:

```text
General user UI stays clean.
Debug viewer is internal, hidden, read-only, and validation-oriented.
```

## Current UI Investigation

Relevant file:

```text
src/features/sessions/HomeScreen.tsx
```

Current relevant components:

- `AnalysisResultView`
- `CoachingResultDetail`
- `GeminiEvidenceView`
- `ApproachObservedFactsSummary`
- `InversionObservedFactsSummary`

Current behavior:

- `GeminiEvidenceView` displays:
  - predicted trick,
  - family,
  - confidence,
  - review status,
  - family / approach / rotation / landing summary,
  - `approachObservedFacts`,
  - `inversionObservedFacts`,
  - evidence windows,
  - observations,
  - uncertainty.
- It does not comprehensively display:
  - EdgeLoadObservedFacts,
  - PopObservedFacts,
  - RotationObservedFacts,
  - LandingObservedFacts,
  - GrabObservedFacts,
  - all validation objects,
  - KnowledgeInsights,
  - CoachingInsightContext.
- `CoachingResultDetail` displays short-analysis / benchmark style coaching
  output, but not the upstream Evidence/Knowledge context that influenced it.

Debug artifact path:

```text
GET /debug/evidence-captures
```

Guard:

```text
DEBUG_CAPTURE_TOKEN
```

Server-side debug artifacts are stored in memory for `/debug/evidence-captures`
and may also be written under:

```text
dev-artifacts/evidence-captures/
```

## Data To Display

### Header

Show the result identity and execution context first:

- Moment ID
- Analysis Job ID
- Evidence Result ID
- provider
- model
- qualityMode
- status
- createdAt
- consistencyStatus
- requiresUserConfirmation
- recoveredFromPartial

### Classification Summary

Compact top-level result:

- primaryCandidate
- alternativeCandidates
- rawFamilyCandidate
- safeFamilyCandidate
- family
- approachType
- rotationType
- landingOutcome
- confidence
- taxonomyWarnings
- gateFailures
- consistencyWarnings

### Temporal Windows

Show temporal anchoring because several historical failures were caused by wrong
temporal focus:

- takeoffTimestamp
- finalApproachWindow
- ignoredSetupWindows
- approachWindowConfidence
- evidenceWindows
- observations

### ObservedFacts Sections

Each ObservedFacts section should be collapsible and use the same pattern:

```text
value fields
confidence
evidenceText / evidence
antiEvidence
warnings
validation result
```

Sections:

- ApproachObservedFacts
- ApproachObservedFactsV2 / ApproachDecisionV2
- EdgeLoadObservedFacts
- PopObservedFacts
- RotationObservedFacts
- LandingObservedFacts
- GrabObservedFacts
- InversionObservedFacts

### Validation Results

Show validation objects near the facts they validate:

- edgeLoadValidation
- popValidation
- rotationValidation
- landingValidation
- grabValidation
- consistency status/warnings
- taxonomy warnings/gate failures

For each validation result, show:

- before
- after
- needsReview
- warnings
- rulesApplied

### KnowledgeInsights

Display each KnowledgeInsight as a compact rule card:

- id
- category
- message
- sourceFacts
- confidence
- severity
- requiresReview
- coachingSafe

Primary use:

- confirm which rules fired,
- detect rule overreach,
- verify low-confidence facts do not become coaching-safe advice.

### CoachingInsightContext

Display each CoachingInsightContext item:

- mode
- sourceRuleId
- category
- message
- confidence
- severity
- requiresReview
- coachingSafe

Important visual distinction:

- `direct_cue`: safe but still confidence-bounded.
- `review_context`: review-only, not diagnosis.
- `internal_only`: must never become rider-facing copy.

The viewer should make it easy to compare:

```text
KnowledgeInsight
↓
CoachingInsightContext
↓
actual coaching output
```

### Raw JSON

Add a final read-only JSON section:

- raw Gemini response text,
- normalized evidence response JSON,
- optional debug capture JSON.

This should be collapsed by default.

## MVP Screen Structure

Recommended first version:

```text
Internal Result Viewer

1. Result Header
2. Top-Level Classification
3. Temporal Windows
4. ObservedFacts Tabs / Accordions
   - Approach
   - EdgeLoad
   - Pop
   - Rotation
   - Landing
   - Grab
   - Inversion
5. Validation Summary
6. KnowledgeInsights
7. CoachingInsightContext
8. Raw JSON
```

MVP does not need graphs, editing, or replay controls. It should be dense,
readable, and optimized for QA.

## Display Priority

Priority 1:

- model/status/qualityMode,
- primaryCandidate/family/confidence,
- requiresReview/consistencyStatus,
- temporal windows,
- KnowledgeInsights,
- CoachingInsightContext.

Priority 2:

- all ObservedFacts,
- all validation results,
- taxonomy warnings/gate failures.

Priority 3:

- raw response text,
- full JSON export,
- debug artifact metadata.

## Internal Entry Options

Do not put this in the main user flow.

Possible hidden entry methods:

1. Development build only:
   - Show a small "Debug" button when `__DEV__` is true.

2. Long press:
   - Long-press the evidence model badge or Moment status badge to open
     Internal Result Viewer.

3. Environment flag:
   - `EXPO_PUBLIC_ENABLE_DEBUG_VIEWER=true`
   - Render/debug token remains separate.

4. Deep link later:
   - `action-sports-journal://debug/result/:momentId`

Recommended MVP:

```text
Development/internal build + long-press on evidence model badge
```

This avoids cluttering the normal rider UI.

## Stored Data vs Response-Only Data

### Stored In Supabase Today

The evidence persistence path stores:

- predicted trick,
- family,
- confidence,
- needs_review,
- consistency status/warnings,
- approachObservedFacts,
- approachObservedFactsV2,
- approachDecisionV2,
- approach v2 signals/conflict summary,
- popObservedFacts / popValidation,
- rotationObservedFacts / rotationValidation,
- grabObservedFacts / grabValidation,
- landingObservedFacts / landingValidation,
- inversionObservedFacts,
- temporalWindows,
- evidenceWindows,
- observations,
- rawResponseText.

### Response / Debug Only Today

Currently response/debug-only:

- KnowledgeInsights,
- CoachingInsightContext,
- possibly some normalized safe/raw family details depending on response path,
- in-memory debug capture wrapper metadata.

Design implication:

- Viewer can show stored observed-facts data for restored Moments.
- Viewer can only show KnowledgeInsights and CoachingInsightContext when they
  are present in the current response/debug artifact unless persistence is added
  later.
- Do not add persistence in MVP.

## Implementation Plan Later

Likely files:

- `src/features/sessions/HomeScreen.tsx`
  - add internal viewer entry point,
  - pass selected `GeminiEvidenceResult`,
  - keep normal UI unchanged.

- New component file, recommended:
  - `src/features/sessions/DebugResultViewer.tsx`

- Optional helper file:
  - `src/features/sessions/debugResultFormatting.ts`

- Existing type source:
  - `src/types/index.ts`

- Existing response normalization:
  - `src/services/ai/analyzeSessionVideo.ts`

No expected changes:

- `supabase/*`
- database migrations,
- production prompts,
- OpenAI benchmark path,
- Progression code.

## MVP Interaction Details

Viewer behavior:

- read-only,
- scrollable,
- collapsible sections,
- copy raw JSON button if needed later,
- no editing of predictions,
- no write-back to Supabase,
- no coaching regeneration button.

Data safety:

- Do not display API keys, tokens, or environment variables.
- Do not require `DEBUG_CAPTURE_TOKEN` inside the client UI.
- If debug captures are retrieved from `/debug/evidence-captures`, that should
  remain a developer-only flow and token handling must not be exposed to regular
  builds.

## Risks

### User UI Complexity

Risk:

The viewer could leak into the normal rider experience and make the product feel
technical.

Mitigation:

- hidden internal entry only,
- no main navigation item,
- no marketing/user-facing copy.

### Data Availability Confusion

Risk:

Stored Moments may not have `KnowledgeInsights` or `CoachingInsightContext`
because those are not persisted today.

Mitigation:

- label sections as "stored", "response-only", or "not available".

### Over-Trusting Debug Data

Risk:

Developers may treat raw Gemini fields as truth.

Mitigation:

- show raw model output separately from normalized/safe evidence,
- show validators and warnings near each fact.

### Secret Exposure

Risk:

Debug endpoints require tokens and may expose raw artifacts.

Mitigation:

- never render tokens,
- do not store tokens in app UI,
- use debug captures only in controlled development contexts.

### Scope Creep

Risk:

The viewer could become an editor, scoring panel, or coaching control surface.

Mitigation:

- MVP is read-only inspection only.
- No DB writes.
- No prompt changes.
- No regeneration controls.

## Recommendation

Build this only after the next wording/validation pass if manual inspection
starts slowing QA.

Start with a local/internal-only component that renders the currently selected
`GeminiEvidenceResult`. Do not fetch extra debug captures from the app in the
first version.
