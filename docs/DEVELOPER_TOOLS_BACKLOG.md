# Developer Tools Backlog

Date: 2026-06-17

Purpose:

Track internal debug/developer tooling for Action Sports Journal as the product
moves from "AI video analyzer" toward a Wakeboard Knowledge System.

This document is a backlog and planning reference only. It does not implement
new UI, API routes, database schema, or migrations.

## Scope

Developer tools should help verify this pipeline:

```text
Video
-> Gemini Evidence Extraction
-> ObservedFacts
-> Validators
-> Taxonomy Gates
-> KnowledgeInsights
-> CoachingInsightContext
-> Coaching wording
```

The goal is not to expose more technical data to riders. The goal is to make
developer validation faster, safer, and more repeatable.

## Current Debug / Developer Features

### Internal Debug Result Viewer

Status: implemented

Primary files:

- `src/features/sessions/DebugResultViewer.tsx`
- `src/features/sessions/debugResultFormatting.ts`
- `src/features/sessions/HomeScreen.tsx`
- `docs/DEBUG_RESULT_VIEWER_DESIGN.md`

Current behavior:

- Read-only internal viewer.
- Hidden unless `__DEV__` or `EXPO_PUBLIC_ENABLE_DEBUG_VIEWER === "true"`.
- Collapsed by default.
- Shows:
  - result header,
  - top-level classification,
  - temporal windows,
  - ApproachObservedFacts,
  - EdgeLoadObservedFacts,
  - PopObservedFacts,
  - RotationObservedFacts,
  - LandingObservedFacts,
  - GrabObservedFacts,
  - InversionObservedFacts,
  - validation summary,
  - KnowledgeInsights,
  - CoachingInsightContext,
  - raw evidence JSON in a nested collapsed area.

Current limitations:

- No copy/export action.
- No side-by-side run comparison.
- No rule trace detail beyond visible rule output.
- No direct link to server debug captures.
- Depends on the evidence object available in the app state.

### Evidence Captures

Status: implemented

Primary files:

- `dev-server/index.ts`
- `dev-artifacts/evidence-captures/`

Current behavior:

- `GET /debug/evidence-captures` returns in-memory captures.
- Access is guarded by `DEBUG_CAPTURE_TOKEN`.
- Evidence extraction captures include:
  - request metadata,
  - file metadata,
  - raw Gemini response text,
  - raw parsed evidence,
  - taxonomy-adjusted result,
  - normalized result,
  - final evidence response,
  - KnowledgeInsights,
  - CoachingInsightContext,
  - model info.
- Local artifact writing can persist captures under `dev-artifacts/evidence-captures/`.

Current limitations:

- In-memory captures are not a durable production audit log.
- Capture retrieval is endpoint/token based, not integrated into the app.
- No filtering by moment, job, model, rule, confidence, or date.
- No built-in redaction viewer beyond current secret hygiene.

### KnowledgeInsights

Status: implemented

Primary files:

- `src/services/knowledge/wakeboardKnowledgeRules.ts`
- `src/types/index.ts`
- `docs/WAKEBOARD_KNOWLEDGE_BASE_DESIGN.md`

Current behavior:

- Rule engine generates `KnowledgeInsight[]` from validated ObservedFacts.
- MVP v1 rules:
  - `weak_edge_load_limits_pop.v1`
  - `strong_pop_supports_rotation.v1`
  - `late_handle_pull_destabilizes_rotation.v1`
  - `clean_landing_supports_completion.v1`
  - `grab_attempt_indicates_air_awareness.v1`
  - `low_confidence_facts_require_review.v1`
- Insights are exposed through evidence/debug response.
- Not stored in Supabase.
- Not shown in rider-facing UI except through internal debug viewer.

Current limitations:

- Rule trace is compact; it does not yet expose every condition checked.
- No per-rule before/after debugger.
- No aggregate rule quality dashboard.
- No true-positive/false-positive sample library linkage.

### CoachingInsightContext

Status: implemented

Primary files:

- `src/services/knowledge/coachingInsightContext.ts`
- `src/services/knowledge/coachingPromptContext.ts`
- `src/services/ai/analyzeSessionVideo.ts`
- `dev-server/index.ts`
- `docs/KNOWLEDGE_TO_COACHING_DESIGN.md`
- `docs/KNOWLEDGE_COACHING_WORDING_MATRIX.md`

Current behavior:

- Converts KnowledgeInsights into:
  - `direct_cue`,
  - `review_context`,
  - `internal_only`.
- `internal_only` is excluded from rider-facing coaching prompt context.
- Gemini short analysis path uses the safe prompt context.
- Debug/evidence response includes `coachingInsightContext`.

Current limitations:

- No dedicated inspector for what entered the coaching prompt versus what was withheld.
- No automated wording safety diff for multiple samples.
- No visual trace from source ObservedFacts to final rider-facing sentence.

### Health Endpoint

Status: implemented

Primary file:

- `dev-server/index.ts`

Endpoint:

```text
GET /health
```

Current behavior:

- Reports server readiness.
- Reports primary provider.
- Reports Gemini configured state and model names.
- Reports OpenAI benchmark configured state.
- Reports evidence endpoint path.
- Reports rate limit settings and route scope.
- Does not expose secret values.

Current limitations:

- No deployed commit hash or build timestamp in the health response.
- No database connectivity check.
- No Supabase schema/version readiness check.
- No recent analysis job health summary.
- No debug feature flag summary.

## Backlog Summary

Priority scale:

- P0: Needed to safely debug current production/internal builds.
- P1: High leverage for validation speed and quality.
- P2: Useful after more samples exist.
- P3: Nice-to-have or later-stage.

Difficulty scale:

- Low: small UI/API addition, no schema change.
- Medium: multiple files or careful state handling.
- High: new workflow, persistent storage, or non-trivial comparison logic.

User impact scale:

- None: developer-only.
- Indirect: improves reliability or diagnosis but not visible to riders.
- Direct: may affect rider-facing experience or support workflows.

## Prioritized Backlog

| Priority | Feature | Description | Difficulty | User Impact |
| --- | --- | --- | --- | --- |
| P0 | EAS env readiness check | Add a documented command/checklist to verify required EAS public env vars before iOS builds. | Low | Indirect |
| P0 | Health commit/build metadata | Add deployed commit hash/build timestamp to `/health` when available. | Low-Medium | Indirect |
| P0 | Debug Viewer production guard test | Add a lightweight test or script confirming Debug Viewer is hidden unless explicitly enabled. | Low | Indirect |
| P1 | Copy JSON | Add copy-to-clipboard for raw evidence JSON and selected sections. | Low | None |
| P1 | Export Evidence | Export current evidence/debug payload as a local JSON file from app or server route. | Medium | Indirect |
| P1 | Rule Trace Viewer | Show which Knowledge Rule conditions passed/failed for each rule. | Medium | Indirect |
| P1 | Knowledge Trace Viewer | Show path from ObservedFacts -> Validator -> KnowledgeInsight -> CoachingInsightContext. | Medium | Indirect |
| P1 | Coaching Prompt Context Inspector | Show direct/review/internal split and exactly what entered short-analysis prompt. | Medium | Indirect |
| P1 | Supabase schema readiness check | Verify required columns for current ObservedFacts phases exist before analysis. | Medium | Indirect |
| P2 | Compare Runs | Compare two evidence runs side by side, especially Flash vs Pro or before/after prompt changes. | High | Indirect |
| P2 | Replay Analysis | Re-run a stored/local video through the current pipeline from a debug workflow. | High | Indirect |
| P2 | Sample Matrix Runner | Run known validation samples and summarize expected vs actual facts/rules/coaching wording. | High | Indirect |
| P2 | Capture Search / Filter | Filter captures by moment id, model, trick, rule id, confidence, or needsReview. | Medium-High | Indirect |
| P2 | Wording Safety Diff | Compare coaching output with and without Knowledge context for a sample set. | Medium | Indirect |
| P3 | Developer Dashboard | Dedicated local/internal page for health, captures, jobs, schema checks, and sample matrix status. | High | Indirect |
| P3 | Persistent Debug Capture Store | Store sanitized captures in a durable table or object store. | High | Indirect |
| P3 | Rule Quality Metrics | Aggregate rule trigger frequency, false-positive notes, and sample coverage over time. | High | Indirect |

## Feature Notes

### Debug Viewer Improvements

Priority: P1

Recommended improvements:

- Add section-level copy buttons.
- Add a compact mode for small screens.
- Add "show only warnings/review" filter.
- Add visual badges for:
  - `needsReview`,
  - `internal_only`,
  - `coachingSafe=false`,
  - low confidence,
  - parse recovery.

Difficulty: Medium

User impact: Indirect

Risk:

- The viewer can become too dense. Keep it collapsed and internal-only.

### Copy JSON

Priority: P1

Purpose:

Quickly copy evidence payloads for GPT/Codex analysis without manually selecting
long JSON text on a phone.

MVP:

- Copy full raw evidence JSON.
- Copy one section:
  - ObservedFacts,
  - Validation,
  - KnowledgeInsights,
  - CoachingInsightContext.

Difficulty: Low

User impact: None

Risk:

- Make sure copied payloads do not include API keys or tokens.

### Export Evidence

Priority: P1

Purpose:

Create a shareable debug artifact from one Moment/run.

MVP:

- Export sanitized JSON.
- Include:
  - moment id,
  - analysis job id,
  - evidence result id,
  - model,
  - ObservedFacts,
  - validators,
  - KnowledgeInsights,
  - CoachingInsightContext,
  - top-level classification.
- Exclude:
  - API keys,
  - debug tokens,
  - private env values.

Difficulty: Medium

User impact: Indirect

Risk:

- Needs clear redaction rules before any sharing workflow.

### Replay Analysis

Priority: P2

Purpose:

Re-run a known sample through the current server pipeline to compare behavior
after prompt/rule/model changes.

MVP:

- Local script first.
- Use files under `dev-artifacts/benchmark-videos/`.
- Output a timestamped debug artifact.
- Do not add rider-facing UI.

Difficulty: High

User impact: Indirect

Risk:

- Requires the original video file. Current production flow does not use cloud
  video storage, so many historical moments cannot be replayed unless the local
  file exists.

### Compare Runs

Priority: P2

Purpose:

Compare two results for the same video:

- Flash vs Pro,
- before vs after prompt,
- before vs after validator,
- before vs after Knowledge rule.

MVP:

- Local/script output first.
- Compare:
  - predicted trick,
  - family,
  - approach,
  - confidence,
  - each ObservedFacts object,
  - validation needsReview,
  - KnowledgeInsights,
  - coaching wording.

Difficulty: High

User impact: Indirect

Risk:

- Requires stable sample naming and repeatable inputs.

### Rule Trace Viewer

Priority: P1

Purpose:

Show why a Knowledge Rule fired or did not fire.

MVP:

- For each rule:
  - rule id,
  - input facts,
  - trigger condition summary,
  - passed checks,
  - failed checks,
  - output insight if any.

Difficulty: Medium

User impact: Indirect

Risk:

- Current rule engine returns only final insights. A trace mode needs a small
  rule-engine contract extension.

### Knowledge Trace Viewer

Priority: P1

Purpose:

Show the full path from raw evidence to coaching-safe context:

```text
ObservedFacts
-> Validation
-> KnowledgeInsight
-> CoachingInsightContext
-> Prompt Context
```

MVP:

- Read-only debug view.
- Highlight which insights were:
  - direct cue,
  - review context,
  - internal only.
- Show what was excluded from prompt injection.

Difficulty: Medium

User impact: Indirect

Risk:

- Must avoid making internal-only content look rider-facing.

### Coaching Prompt Context Inspector

Priority: P1

Purpose:

Verify that `internal_only` never reaches the rider-facing prompt and that
`review_context` is phrased as review-only.

MVP:

- Show generated prompt context section only.
- Do not show API keys or full request headers.
- Compare with resulting short-analysis text.

Difficulty: Medium

User impact: Indirect

Risk:

- Prompt text can be long; keep it collapsed by default.

### Health Endpoint Enhancements

Priority: P0

Purpose:

Make production readiness easier to verify after Render deploys.

MVP:

- Add deployed commit hash if available.
- Add deploy timestamp if available.
- Add app/server version.
- Add Supabase connectivity check.
- Add required schema readiness summary.

Difficulty: Low-Medium

User impact: Indirect

Risk:

- Health endpoint must stay fast and must not expose secret values.

### EAS Env Readiness Check

Priority: P0

Purpose:

Prevent successful builds that run but cannot restore Supabase-backed Moments
because public EAS env vars were missing.

MVP:

- Document or script a pre-build check for EAS preview env:
  - `EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT`,
  - `EXPO_PUBLIC_SUPABASE_URL`,
  - `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Print only variable names and present/missing status.
- Do not print values.

Difficulty: Low

User impact: Indirect

Risk:

- EAS CLI output can expose variable names and metadata; avoid printing values.

### Supabase Schema Readiness Check

Priority: P1

Purpose:

Verify DB columns exist before a new observed-facts phase reaches production.

MVP:

- Check `evidence_results` columns:
  - observed facts JSONB columns,
  - validation JSONB columns.
- Check `analysis_jobs` status fields.
- Check `moments.latest_analysis_job_id` and `latest_evidence_result_id`.

Difficulty: Medium

User impact: Indirect

Risk:

- Should not require service role key inside the mobile app. Keep this as server
  or local developer tooling.

## Recommended Implementation Order

1. EAS env readiness check.
2. Health commit/build metadata.
3. Copy JSON in Debug Viewer.
4. Coaching Prompt Context Inspector.
5. Rule Trace Viewer.
6. Export Evidence.
7. Supabase schema readiness check.
8. Compare Runs.
9. Replay Analysis.
10. Sample Matrix Runner.

This order keeps the first improvements small and directly tied to recent
issues:

- EAS builds can succeed while required public env is incomplete.
- Render deploy verification is easier with commit/build metadata.
- Debug output exists but is still slow to extract and share.
- Knowledge/Coaching safety now needs traceability.

## What Not To Build Yet

Do not build these until the product needs them:

- rider-facing debug UI,
- persistent debug capture database,
- public admin dashboard,
- automatic replay from production Moments,
- cloud video storage just for debug,
- score/ranking UI based on debug data,
- Knowledge rule editing UI.

Reason:

The current product is still early-stage and personal-use-first. Developer tools
should reduce validation friction without turning the app into an operations
platform too early.

## Open Questions

1. Should Debug Viewer be enabled in internal EAS preview builds by default, or
   only when `EXPO_PUBLIC_ENABLE_DEBUG_VIEWER=true`?
2. Should evidence export happen inside the app, through the server, or as a
   local script first?
3. Should Knowledge rule traces be generated on every request, or only when a
   debug flag is present?
4. Should health include Supabase schema checks on every call, or should that be
   a separate `/debug/readiness` endpoint?
5. Should Compare Runs start as a CLI artifact tool before any app UI exists?

## Current Recommendation

Recommendation:

Start with low-risk tooling that improves deployment and validation confidence:

```text
EAS env readiness check
-> Health commit/build metadata
-> Copy JSON
-> Coaching Prompt Context Inspector
-> Rule Trace Viewer
```

Confirmed fact:

The app already has a useful internal Debug Viewer and server-side evidence
captures. The next bottleneck is not raw visibility; it is faster extraction,
copying, traceability, and repeatable comparison.
