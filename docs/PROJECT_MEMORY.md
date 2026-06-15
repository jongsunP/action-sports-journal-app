# Project Memory

## Purpose

This is the top-level permanent memory document and operating system for
Action Sports Journal.

Future GPT sessions, Codex sessions, new computers, and handoffs should read
this first, then follow references to the more detailed documents.

Use this document as the primary source of truth for project identity,
collaboration rules, product philosophy, AI architecture direction, wakeboard
domain constraints, current priorities, and recovery instructions.

## Project Identity

Project name:

```text
Action Sports Journal
```

Product vision:

```text
Private Action Sports Moment Feed
+
AI Coach
```

Action Sports Journal is an iOS-first React Native app for action sports
athletes. It is an Action Sports Life Log platform, not an AI-only analysis
tool and not a generic session database.

The current product direction is Moment First:

- Users should open the app to revisit riding moments.
- Riding clips and moments are the primary product surface.
- AI coaching supports the moment after the user is already engaged by the
  content.

Current stage:

```text
Stage 1 complete
Stage 2 local ActivityGroup / Session prototype complete
Stage 3 standalone iPhone video-to-analysis prototype in progress
```

Confirmed deployment state:

- Standalone iPhone app works through EAS preview/internal distribution.
- App is not Expo Go, TestFlight, or App Store.
- Render backend works at `https://action-sports-journal-api.onrender.com`.
- Public HTTPS backend is used instead of the local Mac/LAN server.
- Data remains local-first on the iPhone with AsyncStorage.
- Supabase Phase 1 connection scaffolding exists, but no user-facing database
  integration, login, cloud video storage, or CDN exists yet.

Detailed status documents:

- `docs/CURRENT_STAGE.md`
- `docs/HANDOFF.md`
- `docs/CONTINUITY_CHECKPOINT.md`
- `docs/DEPLOYMENT_READINESS_ROADMAP.md`

## Roles

Founder / Product Owner / Domain Expert:

- Owns product direction.
- Owns wakeboard/action-sports domain judgment.
- Owns QA feedback from real iPhone usage.
- Decides priorities and what matters for the product.

GPT:

```text
CTO + Project Secretary + Project Historian
```

GPT helps with:

- Product and technical strategy.
- Architecture thinking.
- Decision records.
- Session summaries and continuity.
- Clear separation between known facts, hypotheses, recommendations, and
  unknowns.

Codex:

```text
Implementation Engineer
```

Codex helps with:

- Reading and modifying the codebase.
- Running tests and local verification.
- Creating and updating project documents.
- Committing and pushing checkpoints when requested.
- Preserving continuity in git-backed docs.

## Collaboration Rules

Truth over confidence.

When evidence is missing, say so. Do not sound certain just to be useful.

Use these labels when diagnosing or reporting:

- Confirmed Fact
- Observation
- Hypothesis
- Recommendation
- Unknown

Rules:

- Do not claim work is completed unless it was actually completed and verified.
- Do not imply implementation exists if it is only a design or document.
- Separate raw AI evidence from interpretation.
- Separate implementation from validation.
- Prefer "unknown yet" over premature conclusions.
- Diagnose with evidence before changing prompts or logic.
- Keep settings, memory, and important state remote-first whenever possible.

Save Point workflow:

1. Update continuity documents when a meaningful milestone is reached.
2. Record decisions, findings, open questions, and next starting point.
3. Run relevant verification such as `npm run typecheck`.
4. Confirm git status.
5. Verify no secrets are committed.
6. Commit and push one clean checkpoint.

## Product Philosophy

Moment First.

The product should feel like revisiting real riding moments, not managing a
database.

Core principles:

- Content > Data
- Feed > Dashboard
- Moment review > Report reading
- AI Coach as supporting layer
- Local-first is acceptable for early personal usage
- Korean mobile product polish is preferred over a pure US extreme-sports
  aesthetic

Validated product decisions:

- Large real thumbnails improve perceived product quality.
- Edge-to-edge content is more immersive than floating cards.
- Story-style recent moments are useful.
- Top dashboard/stat blocks reduce immersion.
- Feed should remain mostly frozen unless iPhone QA reveals a specific issue.
- Current major UX risk remains the Detail Screen.

## AI Architecture

Current implemented reality:

```text
Video
↓
Gemini evidence extraction
↓
Wakeboard taxonomy / validation gates
↓
User confirmation where needed
↓
Gemini coaching path and OpenAI benchmark path
```

Current direction:

```text
Video
↓
Observed Facts
↓
Trick Family
↓
Specific Trick
↓
Judge
↓
Coach
```

Why this direction exists:

- Single-pass video classification caused hallucinations.
- The model jumped from basic wake jumps into advanced invert tricks.
- Trick identity must be built from observable facts, not direct confident
  naming.
- Parent-family gates must pass before specific trick naming.

Implemented AI safeguards:

- Gemini evidence extraction endpoint: `/api/extract-session-evidence`.
- Wakeboard Trick Taxonomy Gate.
- Wakeboard Validation Matrix.
- `ApproachObservedFacts`.
- `FinalApproachWindow`.
- `InversionObservedFacts` v1.
- Debug capture for evidence analysis.
- Degraded mode handling for fallback model results.

Reference documents:

- `docs/AI_ANALYSIS_PIPELINE_DESIGN.md`
- `docs/AI_COACHING_PRINCIPLES.md`
- `docs/WAKEBOARD_TRICK_TAXONOMY_REFERENCE.md`
- `docs/WAKEBOARD_VALIDATION_MATRIX.md`
- `docs/OPENAI_BENCHMARK_REPORT.md`

## 2026-06-15 Infrastructure Checkpoint

Today's architecture direction shifted from synchronous evidence extraction
toward durable asynchronous analysis.

Completed planning and scaffolding:

- Supabase was selected as the Phase 1 infrastructure direction.
- Supabase SDK and React Native URL polyfill were added.
- `.env.example` now includes Supabase Phase 1 environment placeholders.
- `src/services/supabase/client.ts` exists as a guarded mobile client scaffold.
- `scripts/smoke-test-supabase.mjs` checks Supabase connectivity once env
  values and schema are ready.
- `supabase/phase1_schema.sql` drafts `users`, `moments`, `analysis_jobs`, and
  `evidence_results`.
- Node standard was raised to Node 22 LTS through `.nvmrc`, `package.json`
  engines, and setup docs.
- Async analysis transition planning was documented in
  `docs/ASYNC_ANALYSIS_PLAN.md`.

Important current boundary:

- Supabase is prepared, not product-wired.
- Auth UI is not implemented.
- Storage is not connected.
- Job Queue is not implemented.
- The app still uses the current local/Render evidence extraction path.

Current next architecture target:

```text
Moment created
-> screen returns immediately
-> AnalysisJob runs in background
-> EvidenceResult is persisted
-> Moment becomes completed or failed
```

Recommended next starting point:

1. Owner prepares Supabase env values.
2. Create `.env.local` and Render env values.
3. Run `npm run supabase:smoke`.
4. Apply `supabase/phase1_schema.sql` manually in the Supabase SQL editor.
5. Start server-side DB write spike before changing mobile UX.

## Wakeboard Domain Knowledge

Heelside and Toeside are approach / edge directions, not trick families.

Top-level trick families:

- Basic Air / Straight Air
- Surface Tricks
- Grabs
- Spins
- Inverts
- Raley-based tricks

Core taxonomy rules:

- Basic Air / Straight Air is separate from Inverts.
- A trick cannot enter Inverts unless visible inversion evidence exists.
- Inversion gate v1 allows Inverts only when `boardAboveHead`, `bodyInverted`,
  or `rollAxisObserved` is true.
- `boardAboveHead` is the primary inversion evidence. Do not define inversion
  only as head-below-hips.
- Back Roll belongs to invert / roll-axis family.
- Tantrum belongs to heel-side backflip / invert family.
- Tantrum cannot be high confidence from a toeside approach.
- Back Roll high requires heelside setup and roll-axis evidence.
- Toeside Basic Jump must not become Tantrum or Back Roll unless visible
  invert / roll-axis evidence exists.
- Do not infer advanced invert tricks from airtime alone.
- Parent-family gate must pass before specific trick naming.

Approach detection rules:

- Approach should not be directly labeled first.
- Extract observed facts first: stance, lead foot, board direction,
  wake-crossing path, edge direction evidence, handle position, body
  orientation.
- Chest/back visibility alone is not sufficient evidence for heelside/toeside.
- Approach must be anchored near wake crossing and takeoff through
  `FinalApproachWindow`.
- Earlier slalom/setup is context only unless explicitly inside the final
  approach window.

Known current classification state:

- Toeside Basic Jump was initially misclassified as Back Roll / Tantrum /
  Invert.
- Parsing and post-processing did not create the original false positive.
- Raw model evidence plus missing taxonomy structure caused the major error.
- Taxonomy Gate and approach-window safeguards improved the result.
- `InversionObservedFacts` v1 now records observed inversion evidence before
  family classification, including `bodyInverted`, `boardAboveHead`,
  `rollAxisObserved`, `flipAxisObserved`, `inversionDuration`,
  `inversionEvidenceCount`, and `antiInversionEvidence`.
- Invert Family is blocked unless `boardAboveHead`, `bodyInverted`, or
  `rollAxisObserved` is true.
- Invalid Tantrum classifications are now downgraded instead of confidently
  returned.

## Major Historical Decisions

Timeline:

- 2026-06-12: Priority shifted from Expo Go validation to standalone iPhone app
  installation through EAS preview/internal distribution.
- 2026-06-13: Real wakeboard-video AI architecture was validated with Gemini
  and OpenAI benchmark paths.
- 2026-06-14: Render backend was deployed and the standalone iPhone app was
  installed with the public HTTPS backend.
- 2026-06-14: Product direction shifted from Session First to Moment First.
- 2026-06-14: Gemini API key rotation was completed in Render and local env
  without exposing secrets.
- 2026-06-14 / 2026-06-15: Toeside Basic Jump false positive investigation
  showed raw model hallucination and missing taxonomy structure.
- 2026-06-15: Wakeboard taxonomy, validation matrix, Taxonomy Gate,
  `ApproachObservedFacts`, `FinalApproachWindow`, and `InversionObservedFacts`
  became the active AI quality direction.

Why key decisions were made:

- Standalone iPhone app was required because the product must work away from
  the local Mac/LAN server.
- Render was chosen as the simplest backend path for a single developer,
  early-stage product, low traffic, and personal usage first.
- Database and cloud video storage were intentionally deferred.
- Moment First was chosen because iPhone QA showed users respond to real riding
  content more than session records or dashboards.
- Taxonomy and observed-facts layers were introduced because prompt-only tuning
  could not reliably prevent family-jumping hallucinations.

## Current Priorities

Current active problem:

```text
Inversion Detection
```

Next starting point:

- Validate `InversionObservedFacts` v1 on the real test clip before modifying
  trick classification again.

Goal:

- Understand why nonexistent inversion evidence is being generated.
- Determine whether Gemini is using incorrect visual cues.
- Determine whether it is inferring inversion from airtime/body position rather
  than true inversion mechanics.

Secondary priorities:

- Continue Detail Screen QA.
- Review Progression UX.
- Keep Feed mostly frozen for now.
- Investigate coaching structured parsing failure after evidence truthfulness
  work.

## Open Problems

AI:

- Unknown: why Gemini still believes inversion exists in the Toeside Basic Jump
  test clip.
- Unknown: whether inversion detection is using incorrect visual cues.
- Unknown: whether inversion evidence is inferred from airtime/body position
  rather than true inversion mechanics.
- Coaching response flow has a structured parsing issue.
- Long-term Gemini availability / degraded mode strategy still needs work.

Product:

- Detail Screen still needs iPhone QA.
- Progression UX is not settled.
- Feed should remain mostly frozen unless QA finds a specific problem.

Architecture:

- No user-facing database integration yet; Supabase Phase 1 scaffolding exists.
- No login yet.
- No cloud video storage yet.
- No CDN yet.
- No production App Store/TestFlight path yet.
- AI keys must remain only in Render environment variables and local ignored env
  files.

## Session Recovery Instructions

For a new GPT session:

1. Read this file first.
2. Read `docs/CURRENT_STAGE.md`.
3. Read `docs/HANDOFF.md`.
4. Read `docs/CONTINUITY_CHECKPOINT.md`.
5. If working on wakeboard AI, read:
   - `docs/WAKEBOARD_TRICK_TAXONOMY_REFERENCE.md`
   - `docs/WAKEBOARD_VALIDATION_MATRIX.md`
   - `docs/AI_ANALYSIS_PIPELINE_DESIGN.md`
6. Use explicit uncertainty labels.
7. Do not propose implementation as completed work.

Recommended opening prompt for a new GPT session:

```text
Read docs/PROJECT_MEMORY.md as the primary source of truth for Action Sports
Journal. Then read docs/CURRENT_STAGE.md, docs/HANDOFF.md, and
docs/CONTINUITY_CHECKPOINT.md. Continue from the current resume point. Use
Confirmed Fact / Observation / Hypothesis / Recommendation / Unknown labels
when diagnosing. Do not imply anything is implemented unless the docs or code
confirm it.
```

For a new Codex session:

1. Sync the personal context repository if required by local instructions.
2. Open the project repository:
   `~/repository/action-sports-journal-app`
3. Read this file first.
4. Read `AGENTS.md` if present, then:
   - `docs/CURRENT_STAGE.md`
   - `docs/HANDOFF.md`
   - `docs/CONTINUITY_CHECKPOINT.md`
5. Check git status before editing.
6. Do not print secrets.
7. Do not commit `.env.local` or any local secret file.
8. Prefer small focused commits and push important checkpoints to
   `origin/master`.

Recommended opening prompt for a new Codex session:

```text
Open ~/repository/action-sports-journal-app. Read docs/PROJECT_MEMORY.md first
as the primary source of truth, then read AGENTS.md if present,
docs/CURRENT_STAGE.md, docs/HANDOFF.md, and docs/CONTINUITY_CHECKPOINT.md.
Check git status before edits. Do not print secrets. Continue from the current
resume point and keep changes scoped.
```

Current resume instruction:

```text
Start with Inversion Detection.
Design InversionObservedFacts.
Do not change trick classification again until raw inversion evidence is
understood.
```

## Save Point Procedure

When the Founder says any of these:

- "정리하자"
- "작업 정리"
- "오늘 마무리"
- "Save Point"
- "마무리하자"

Expected process:

1. Summarize findings.
   - Confirmed facts
   - Observations
   - Hypotheses
   - Recommendations
   - Unknowns

2. Record decisions.
   - Product decisions
   - Technical decisions
   - Rejected directions
   - Reasons decisions were made

3. Record current status.
   - What works
   - What changed
   - What was verified
   - What was not verified

4. Record open issues.
   - Bugs
   - AI uncertainty
   - Product questions
   - Deployment or environment risks

5. Record next starting point.
   - The exact next priority
   - The first task for the next session
   - What not to do yet

6. Update documentation.
   - Always update this file if the operating context changed.
   - Update `docs/HANDOFF.md`, `docs/CONTINUITY_CHECKPOINT.md`, and
     `docs/CURRENT_STAGE.md` when milestone status, current priority, or next
     starting point changes.
   - Update specialized docs when relevant, such as taxonomy, validation,
     deployment, or AI design docs.

7. Verify.
   - Run `npm run typecheck` when code or TypeScript-facing docs/config changed,
     or when the Founder requests it.
   - Check `git status`.
   - Verify no secrets are committed.
   - Verify `.env.local` and local secret files remain ignored when env files
     are involved.

8. Commit and push when requested.
   - Use one clean checkpoint commit.
   - Push to `origin/master`.
   - Report commit hash and final git status.

Save Point report format:

```text
Confirmed:
- ...

Unknown:
- ...

Changed:
- ...

Verified:
- ...

Commit:
- ...

Next starting point:
- ...
```
