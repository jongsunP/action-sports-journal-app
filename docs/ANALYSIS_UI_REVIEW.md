# Analysis UI Review

Date: 2026-06-17

Purpose:

Review the current analysis/result display surfaces for UI/UX stability before
adding more features.

Scope:

- Code review only.
- No screenshots.
- No code changes.
- No logic changes.
- No database changes.

## Reviewed Surfaces

Primary file:

```text
src/features/sessions/HomeScreen.tsx
```

Reviewed components:

- `HomeScreen`
- `MomentDetailModal`
- `AnalysisResultView`
- `CoachingResultDetail`
- `GeminiEvidenceView`
- `ApproachObservedFactsSummary`
- `InversionObservedFactsSummary`
- `ResultSection`
- `ObservationSection`

Internal debug file:

```text
src/features/sessions/DebugResultViewer.tsx
```

Reviewed component:

- `DebugResultViewer`

## Current Display Path

Moment detail path:

```text
HomeScreen
↓
MomentDetailModal
↓
GeminiEvidenceView
↓
optional DebugResultViewer
```

Coaching detail path:

```text
AnalysisResultView
↓
CoachingResultDetail
```

Important current behavior:

- Main result display is inside a full-screen `Modal`.
- `MomentDetailModal` owns the main `ScrollView`.
- `GeminiEvidenceView` is rendered inside that modal scroll.
- `DebugResultViewer` is rendered below `GeminiEvidenceView` only when:

```text
__DEV__ || EXPO_PUBLIC_ENABLE_DEBUG_VIEWER === "true"
```

## Summary Judgment

Confirmed Fact:

The current result UI is functionally simple and mostly safe for normal users.
The normal user path does not expose the full debug pipeline unless development
or an explicit debug flag is enabled.

Observation:

The biggest UI risk is not the normal summary UI. The risk is long technical
content inside `GeminiEvidenceView`, `CoachingResultDetail`, and especially
`DebugResultViewer`.

Recommendation:

Do not add new result data to the normal rider-facing screen until the debug
viewer has been used for QA. Keep the normal UI focused on status, summary,
evidence summary, and safe coaching.

## Findings By Area

### Small Screens

Observation:

`MomentDetailModal` uses one vertical `ScrollView`, which is good. The modal
content can grow naturally without nested vertical scroll views.

Risks:

- Header title uses `numberOfLines={1}` and can truncate long Moment titles.
- Evidence summary cards use two-column wrapping; very long labels/values can
  become visually dense.
- Debug rows use a fixed `rowLabel` width of `132`, leaving less room for values
  on small screens.

Classification:

```text
출시 전 수정 필요
```

Recommended fix later:

- Allow key detail headings to wrap to two lines where useful.
- In debug viewer, switch label/value rows to vertical layout on narrow screens
  or reduce label width.

### Long Coaching Sentences

Observation:

`AnalysisResultView` and `CoachingResultDetail` render coaching text with
standard `Text` components and line heights. Long text will wrap.

Risks:

- `CoachingResultDetail` can become very long because it renders many sections:
  raw response, highlights, observations, patterns, inferences, coaching
  observations, self-critique, strengths, improvements, suggestions.
- The raw response section can overwhelm the useful coaching sections.

Classification:

```text
출시 전 수정 필요
```

Recommended fix later:

- Collapse raw response by default.
- Put "요약" and "다음 연습" above detailed diagnostic sections.
- Limit section count in the rider-facing coaching detail view.

### Long ObservedFacts

Observation:

`GeminiEvidenceView` currently shows only a subset of observed facts directly:

- `approachObservedFacts`
- `inversionObservedFacts`

More verbose facts are now available in `DebugResultViewer`, where JSON blocks
are collapsed.

Risks:

- `ApproachObservedFactsSummary` still renders several long values directly.
- Long wake path or evidence strings can make the evidence panel dense.

Classification:

```text
나중에 해도 됨
```

Recommended fix later:

- Keep full ObservedFacts in internal viewer.
- Keep rider-facing evidence panel to short "why this result" summaries.

### Long KnowledgeInsights

Observation:

`KnowledgeInsights` are not shown in normal user UI. They are only shown inside
`DebugResultViewer`.

Risks:

- KnowledgeInsight messages can be long.
- Several rule cards can stack into a long debug section.
- This is acceptable for internal QA but not for rider-facing UI.

Classification:

```text
나중에 해도 됨
```

Recommended fix later:

- Add per-section collapse counts in debug viewer if rule count grows.
- Keep KnowledgeInsights out of normal UI until wording is productized.

### Long CoachingInsightContext

Observation:

`CoachingInsightContext` is internal-only in the viewer. `internal_only` is
labeled as `debug only`.

Risks:

- The mode labels are technically clear, but could be confusing if accidentally
  exposed in a production/non-dev build.

Classification:

```text
즉시 수정 필요 없음
출시 전 확인 필요
```

Recommended check before release:

- Confirm production standalone builds do not set
  `EXPO_PUBLIC_ENABLE_DEBUG_VIEWER=true`.
- Confirm internal-only content is not visible in public builds.

### Long JSON

Observation:

`DebugResultViewer` has a raw JSON section that is collapsed by default.
Individual ObservedFacts JSON blocks are also collapsed by default.

Risks:

- Once opened, long JSON can create very tall content.
- The raw JSON text uses monospace and small font, which is acceptable for debug
  use but not pleasant on phones.

Classification:

```text
나중에 해도 됨
```

Recommended fix later:

- Keep raw JSON collapsed by default.
- Add copy/export only if QA workflow needs it.
- Avoid rendering raw JSON in production user UI.

### Scroll Nesting

Observation:

There is one main `ScrollView` in `MomentDetailModal`. `DebugResultViewer` does
not introduce another `ScrollView`; it expands inline.

Confirmed good:

- No obvious nested vertical scroll conflict was introduced by the debug viewer.

Risks:

- Expanded debug viewer can make the main modal extremely long.
- Users may lose their place when opening many JSON blocks.

Classification:

```text
나중에 해도 됨
```

Recommended fix later:

- If debug use becomes frequent, make debug viewer a separate modal/screen.

### Accordion / Collapse Strategy

Observation:

`DebugResultViewer` is collapsed by default, and raw JSON is separately
collapsed. Each ObservedFacts block can show compact preview or full JSON.

Risks:

- The debug viewer has many sections. Once opened, it is information-heavy.
- The current implementation is acceptable for internal validation but would be
  too much for normal users.

Classification:

```text
나중에 해도 됨
```

Recommended fix later:

- Add section-level collapse for:
  - ObservedFacts,
  - Validation,
  - KnowledgeInsights,
  - CoachingInsightContext.
- Preserve default collapsed state.

### Heading Structure

Observation:

The UI uses clear local section titles:

- Gemini evidence title,
- evidence section titles,
- result detail section titles,
- debug section titles.

Risks:

- `DebugResultViewer` uses English technical headings. This is acceptable for
  internal tooling but should not appear in rider-facing UI.
- Normal user UI mixes Korean labels with technical English such as
  `approachObservedFacts` and `inversionObservedFacts`.

Classification:

```text
출시 전 수정 필요
```

Recommended fix later:

- Keep technical English labels in internal viewer.
- In normal UI, replace technical headings with rider-safe Korean labels or hide
  them.

### Information Priority

Observation:

Current normal evidence priority:

```text
model/status
↓
Predicted / Family / Confidence / Review
↓
AI 추정 기술
↓
Family / Approach / Rotation / Landing
↓
ObservedFacts snippets
↓
Evidence windows / observations / uncertainty
↓
Debug viewer
```

This is reasonable for internal/product review.

Risks:

- For a normal rider, "Predicted / Family / Confidence / Review" may be too
  system-oriented.
- "다음에 무엇을 하면 되는지" is not visually prioritized in the Evidence view.

Classification:

```text
출시 전 수정 필요
```

Recommended fix later:

- Keep evidence detail available, but introduce a rider-facing summary block:
  - what was observed,
  - what is uncertain,
  - one next focus.
- Keep full evidence/debug sections below.

## Priority List

### 즉시 수정 필요

None found from code review.

Reason:

- No blocking layout issue was proven from code review alone.
- No nested scroll conflict was introduced.
- Debug viewer is gated behind dev/debug flag.
- Raw JSON is collapsed by default.

### 출시 전 수정 필요

1. Confirm production builds do not expose `DebugResultViewer`.
2. Collapse raw response in `CoachingResultDetail` by default.
3. Replace technical observed-facts headings in normal UI or move them fully
   into internal viewer.
4. Improve small-screen behavior for long labels/values.
5. Reprioritize normal rider-facing result order around:
   - clear outcome,
   - uncertainty,
   - next focus.

### 나중에 해도 됨

1. Separate debug viewer into its own screen/modal if QA use grows.
2. Add copy/export for raw JSON.
3. Add section-level collapse inside debug viewer.
4. Add visual status icons for validation/knowledge modes.
5. Add sample comparison tooling for wording matrix reviews.

## Recommended Implementation Order

When UI work resumes, implement in this order:

1. Release-safety check:
   - verify `EXPO_PUBLIC_ENABLE_DEBUG_VIEWER` is not enabled for public builds.

2. Rider-facing cleanup:
   - collapse raw response in coaching detail,
   - hide technical observed-facts headings from normal UI,
   - keep debug viewer as the technical home.

3. Small-screen polish:
   - test on small iPhone viewport,
   - check long titles and long evidence text,
   - adjust wrapping where needed.

4. Debug viewer refinement:
   - section-level collapse,
   - optional separate internal modal,
   - raw JSON copy/export if useful.

## Final Judgment

Current UI is acceptable for internal validation.

It is not yet polished as a public rider-facing analysis experience. The biggest
near-term product work is not adding more data to the screen, but reducing what
normal users see and moving technical details into the internal viewer.
