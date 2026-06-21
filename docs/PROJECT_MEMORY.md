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
- Supabase-backed Moment persistence and latest Evidence restore are now wired
  into the standalone app.
- Async Analysis MVP is validated for personal iPhone usage.
- No login, cloud video storage, external queue, push, CDN, TestFlight, or App
  Store path exists yet.
- As of 2026-06-20, the latest iPhone QA baseline is a clean empty-state build:
  Supabase test Moments were cleared, bundled seeded sessions were removed, and
  EAS preview build number `6` was created for fresh real-video testing.

Current AI product boundary:

- Normal upload uses one Gemini Pro call per Moment for Evidence Extraction.
- The app is currently in the Evidence Extraction + Rider-facing Analysis
  Summary stage.
- The real AI Coach experience is not implemented yet.
- Current work is focused on identifying what the video is, validating that
  evidence, and turning it into rider-readable analysis.
- A future AI Coach layer should be designed separately after the analysis
  layer is trustworthy enough.
- The current confidence wording avoids the stronger "확실" label and uses
  `근거 충분`, `가능성 있음`, and `확인 필요`.
- User-facing fallback copy no longer exposes internal storage names such as
  Supabase.
- Session sync responsibilities have been split into focused patch helpers and
  `useSyncRemoteMoments` so the Home screen is less responsible for remote
  restore mechanics.
- The next validation loop is real-video calibration using
  `docs/EVIDENCE_POSTPROCESSING_CALIBRATION_MATRIX.md`.
- Latest checkpoint for this boundary: `cc01177`.

Analysis Trust work currently includes:

- Evidence Extraction
- ObservedFacts
- Validators
- CandidateTrace
- KnowledgeRules
- Rider-facing Summary
- Calibration

All of these serve one product question:

```text
Can the user trust what the app says this video is?
```

Coaching is the next product layer. It should depend on previous session
comparison, rider history, progression, and priority selection. It is not part
of the current implementation stage.

Detailed status documents:

- `docs/CURRENT_STAGE.md`
- `docs/HANDOFF.md`
- `docs/CONTINUITY_CHECKPOINT.md`
- `docs/DEPLOYMENT_READINESS_ROADMAP.md`
- `docs/TECH_DEBT_AND_REFACTOR_TODO.md`

## Current Refactor and Technical Debt Backlog

Current product direction remains Analysis First. The active technical debt
backlog is now recorded in `docs/TECH_DEBT_AND_REFACTOR_TODO.md`.

The most important architectural decision is that a remote Moment should not be
treated as analysis-ready until the source video has reached durable temporary
Storage. Upload state and analysis state must remain separate:

```text
uploading / upload_failed
queued / processing / completed / failed
```

Immediate focus:

- keep `POST /api/moments/from-source-video` as the preferred source-video-first upload path
- ensure incomplete uploads do not leave analysis-looking remote Moments
- keep legacy/fallback endpoints only while the new path is validated

2026-06-21 validation update:

- Upload screen remains open until source video upload completes.
- The app now warns users not to close the app during the upload phase.
- The upload screen closes only after upload succeeds and server-side analysis is accepted.
- Render + Supabase validation confirmed that fileless requests return 400 without creating rows.
- Normal upload validation confirmed `source_video_storage_uploaded_at -> moment.created_at -> analysis_jobs.queued_at` ordering.
- QA policy remains: do not auto-reset DB after builds; report counts only unless the Founder explicitly requests deletion.
- Simulator upload remains disallowed by default; real upload QA belongs on the physical iPhone.
- If the user force-closes the app immediately after tapping upload and analysis still succeeds, do not assume a bug. The file may have already reached the server, or iOS may have briefly allowed the network request to finish. The product rule is: closing before upload completion can fail; closing after upload completion should allow server-side analysis to continue.
- Upload-state copy should later move from an absolute warning toward risk-aware wording: "업로드가 끝날 때까지 앱을 닫지 않는 것이 안전합니다." and "업로드가 완료되면 분석은 서버에서 계속됩니다."
- Follow-up TODOs: deliberately test app termination before/after upload completion, refine upload-state copy, collect analysis timing data, continue sample-based AI Calibration, revisit Detail structure, add Push deep link later, and consider OS-level background upload as a long-term stability option.

Later work is grouped by stage:

- Upload structure and UX: upload-first path, signed/direct upload evaluation,
  upload progress feasibility, blocking overlay, and timing logs
- Mobile app screen structure: reduce Home-owned modal/conditional rendering,
  evaluate UploadScreen and MomentDetailScreen, and decide whether React
  Navigation or Expo Router is the right route layer
- App-native return/gesture behavior: native stack swipe back, Push tap to the
  relevant Moment Detail, and foreground/background restore polish
- UX stabilization: Boot Loading, Upload, Delete, Empty/Error states, and
  cross-device thumbnail fallback
- Calibration: timing/quality observation data and sample-based AI calibration
- Stabilization: legacy endpoint cleanup and thumbnail storage policy
- Product scale: auth/user ownership and background upload

Current product priority clarification:

The near-term goal is not to improve AI result accuracy first. The goal is that
even one uploaded video behaves like a proper mobile app experience:

```text
select video
-> upload clearly
-> secure durable input
-> transition into server-owned analysis
-> restore result
-> notify user
-> show understandable output
```

AI Calibration for toeside/heelside, Back Roll, and other trick-name accuracy
comes after Upload structure, mobile screen structure, app-native gestures /
return flows, and core UX states are stable. Do not tune prompts or validators
just because one QA sample feels surprising while the upload/detail/navigation
experience is still being settled.

## Mobile-First UX Development Principle

The Founder may describe product behavior with web-development analogies, but
Action Sports Journal is an iOS-first mobile app. Future implementation should
evaluate mobile app patterns before falling back to web-style conditional
rendering.

Principles:

- Do not default to web-style screen swaps or conditional rendering when a
  mobile navigation, lifecycle, or gesture pattern would be more natural.
- Consider common mobile app structure first for Upload, Detail, Push,
  foreground/background refresh, app lifecycle, and long-running upload flows.
- If the user describes a web-like approach but there is a more appropriate
  mobile app structure, propose the mobile-native option first.
- Treat "it works" as insufficient when the interaction does not feel natural
  in a real app.
- Prioritize whether the user perceives the flow as app-like, stable, and
  trustworthy.

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

Current product priority:

```text
1. AI Analysis UX Completion
2. Analysis Trust
3. Coaching
```

Action Sports Journal is not being built as an AI Coach app first. It is an
AI-based Action Sports Analysis platform. Before coaching can matter, the rider
must trust the full analysis product loop:

```text
upload
-> async processing
-> analysis completed
-> result restored
-> result understood
```

The current stage is therefore AI Analysis Product Completion:

```text
video upload
-> async analysis
-> completed result
-> restored result
-> Rider-facing Summary
-> user-understandable analysis
```

Coaching comes after the rider can trust what the system says happened in the
video.

Analysis UX principle:

AI analysis takes time. The product does not need to pretend it is instant.
During analysis, the more important goal is that the user does not feel the app
has stopped, failed, or hit a bug.

Known Analysis Product UX observations:

1. Analysis Progress UX
2. Cold Start Loading UX
3. Push Notification
4. Durable Analysis Pipeline / video storage

Cold Start Loading UX:

The previous app startup could follow this path:

```text
app starts
-> no local restored state yet
-> Empty State appears
-> Supabase query finishes
-> real data appears
```

This was technically functioning, but the user could perceive it as a bug
because the app first said "there is no data" and then data appeared a moment
later.

The principle is:

```text
Loading State and Empty State must be separate.
```

Implemented direction:

```text
app starts
-> Loading State
-> Supabase query
-> if data exists: show real data
-> if no data exists: show Empty State
```

`a8caf86 feat: add analysis completion notifications and cold start loading`
implements this separation. Startup now shows "기록을 불러오는 중입니다" while
remote Moments are loading, and only shows the Empty State after the first
remote query completes with no data.

Durable Analysis Pipeline observation:

Build 8 confirmed that Gemini Pro analysis works, but it also exposed the
current async limitation. The app can create a durable Moment and queued
AnalysisJob before the backend has a durable copy of the video. If the app is
closed, the network fails, or the multipart evidence request does not complete,
the job can remain queued even though the backend has no video payload to
process later.

Current conclusion:

```text
Durable job record without durable video input is not true durable async.
```

The Phase 8 MVP path now uses Supabase Storage because the project already
uses Supabase for Moment, AnalysisJob, and EvidenceResult state. See
`docs/DURABLE_ANALYSIS_PIPELINE_PLAN.md` and
`docs/SUPABASE_STORAGE_ANALYSIS_PIPELINE_PLAN.md`.

Storage policy decision:

Supabase Storage is temporary durable analysis-input storage, not permanent
video archive storage. Original videos remain local-first. If the local video
URI is still available, the app should use it for playback. If the local video
URI is missing, the app should not treat that as a broken Moment; it should show
the thumbnail, EvidenceResult, and Rider-facing Summary. After analysis
completes, the Storage source object should be eligible for deletion
immediately or after a short QA/retry retention window. Reanalysis after source
deletion may require the rider to reupload the original video.

Implementation status:

Storage-backed evidence analysis path is implemented and pushed in
`306b3ca feat: add storage-backed evidence analysis path`. Local E2E verified:
source video upload to `moment-videos`, `moments.source_video_storage_*`
update, `analysis_jobs.input_video_storage_*` update, Storage download by
Render, Gemini Evidence Extraction, `evidence_results` persistence, and
completed Moment restore. Build 14 QA exposed that the first storage-backed
implementation still depended on the app making a second
`/analyze-stored-video` request after source upload. That was not durable
enough: the source object could be uploaded while the job stayed queued if the
second request failed. `cf71b58 feat: start analysis automatically after
storage upload` fixed this by making successful `/source-video` upload start
the queued job server-side. `/analyze-stored-video` remains only as
legacy/fallback. Real Render + Gemini Pro E2E verified `queued -> processing ->
completed`, `evidence_results` creation, and
`source_video_storage_status=deleted`. The direct multipart upload path remains
as fallback.

Durable Analysis / Analysis Progress completion:

- `a397584 feat: clean up analyzed source videos` deletes analyzed source
  videos on a best-effort basis after successful stored-video analysis.
- `source_video_storage_status` becomes `deleted` on cleanup success and
  `delete_failed` on cleanup failure.
- Cleanup failure is warning-only and does not turn completed analysis into
  failed analysis.
- `9bad25f fix: handle stale analysis jobs` marks old queued/processing jobs
  failed when they cannot reasonably complete.
- `f7488a8 refine: improve analysis progress messaging` improves app-facing
  status language: 대기, 분석중, 완료, 실패.

The current product objective is stable completion for one real uploaded video:
upload -> temporary durable input -> stored analysis -> completed restore.

Push Notification MVP:

Push Notification is now implemented as a first MVP capability for the async
analysis product:

```text
upload
-> close app
-> analysis completes
-> push notification
-> open result
```

`a8caf86 feat: add analysis completion notifications and cold start loading`
adds Expo notification registration in the app, `/api/push-tokens` on the
Render backend, and best-effort Expo Push API delivery after successful
EvidenceResult persistence. The notification text is:

```text
분석이 완료되었습니다
결과를 확인해보세요
```

`supabase/phase9_device_push_tokens.sql` defines `device_push_tokens`. The
phase9 migration is assumed applied on the remote Supabase project for this
checkpoint. Notification tapping opens the app; Detail deep link navigation is
not implemented yet. Because `expo-notifications` adds a native plugin, a new
EAS iOS preview/internal build is required before device QA.

Build 22 closeout:

Build 22 is the current preview/internal handoff build for the next QA session.
It includes the upload-first Moment creation refactor and the upload progress
UX needed to make the durable analysis flow understandable:

- The default upload path is `POST /api/moments/from-source-video`.
- The source video must reach temporary durable Storage before the server
  creates a Moment and AnalysisJob.
- The Upload screen stays open during source upload and warns the rider not to
  close the app before upload completion.
- After upload completion, server-side analysis owns the job and the app can be
  closed while analysis continues.
- Fileless upload-first requests return 400 and do not create DB rows.
- The force-close-after-upload case is interpreted carefully: success can mean
  upload already completed or iOS briefly finished the request.

The next session should start by installing Build 22 and verifying:

1. Upload screen remains visible while source video upload is in progress.
2. No incomplete remote Moment appears if upload is interrupted before the
   source video reaches Storage.
3. Normal upload creates Storage input first, then Moment, then AnalysisJob.
4. Completed analysis restores after app relaunch.
5. Push delivery still works after completed analysis.
6. Existing thumbnail fallback, delete feedback, and long-analysis waiting copy
   remain acceptable.

Performance timing and bottleneck analysis should wait until real QA data is
allowed to accumulate. Do not auto-clear QA data after builds. By default keep
`moments`, `analysis_jobs`, `evidence_results`, and `device_push_tokens` for
analysis-time measurement, calibration, and real usage pattern review. Only
delete QA data when the Founder explicitly requests "초기화" or "DB 비우기".

Build 23 real-device UX QA:

Build 23 passed the first real-device UX check. Boot Loading felt natural and is
confirmed to be data-readiness based, not a fixed decorative delay: Home waits
for local restore plus `/api/moments` remote sync, with an 8 second fail-open
timeout. The Upload Overlay also felt natural; the full-screen blocking state
made it clear that upload is separate from server-owned analysis.

The latest QA sample was about 18.25 MB and about 9 seconds long. Directional
timing from the DB and user observation:

- Upload start estimate to server file/storage flow entry: about 5.2 seconds.
- Server Storage/Moment creation side: about 3.9 seconds.
- Job queue/start: within roughly 1 second.
- Gemini `started_at -> completed_at`: about 50.7 seconds.
- Push was received; the perceived arrival was more than 1 minute and less than
  3 minutes.
- Result restore worked.
- Delete was intentionally not tested in this QA pass.

These numbers are not yet enough to justify upload architecture changes or a
progress bar. For exact bottleneck analysis, capture paired iPhone
`[upload_timing]` logs and Render Dashboard `[source_video_timing]` logs. Keep
Build 23 QA running and keep code changes paused until more samples accumulate.

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
- Supabase env values are present locally.
- `scripts/smoke-test-supabase.mjs` confirms Supabase connectivity with the
  service role key and reports Phase 1 schema readiness separately.
- `supabase/phase1_schema.sql` drafts `users`, `moments`, `analysis_jobs`, and
  `evidence_results`.
- Current Supabase status: connection passes, Phase 1 tables exist, and
  service-role table grants are applied.
- `supabase/phase1_service_role_grants.sql` repairs existing projects where the
  tables were created before service-role grants were added.
- `npm run supabase:write-smoke` confirms server-side insert/update/delete
  across `users`, `moments`, `analysis_jobs`, and `evidence_results`.
- Gemini Evidence Extraction now attempts to persist an `evidence_results` row
  when an existing Moment is linked by `momentId` or UUID `sessionId`.
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

1. Correct the local Gemini API key before real linked Evidence Extraction
   verification.
2. Run a real Evidence Extraction request with a linked `momentId`.
3. Confirm the created `evidence_results` row and linked Moment latest IDs.

## 2026-06-16 Async Analysis MVP Checkpoint

Confirmed facts:

- Async Analysis MVP was implemented and pushed:

```text
0e9594e Implement async evidence analysis MVP
```

- Rate-limit and queued-state mismatch was fixed and pushed:

```text
7d83e7e Keep async evidence jobs queued on enqueue delay
```

- Render is deployed with the latest rate-limit behavior.
- `/health` returns `ok: true`, `geminiConfigured: true`, and
  `geminiEvidence.configured: true`.
- Route-scoped rate limiting is active. Health, Moment reads, and polling are
  not counted.
- Standalone iOS internal build `1.0.0 (5)` was created:

```text
https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/66b48f3c-5564-4ddd-aa20-698f201e6204
```

- Founder validated this standalone app flow:

```text
video selected
-> queued
-> app immediately closed
-> wait 2-3 minutes
-> app relaunched
-> completed restored
```

Implementation status:

- `POST /api/moments` creates a Moment and queued AnalysisJob, then returns
  quickly.
- `/api/extract-session-evidence` starts background evidence extraction for the
  queued job.
- Supabase stores `moments`, `analysis_jobs`, and `evidence_results`.
- Home restores Supabase Moments and latest Evidence after app relaunch.
- UI shows `queued`, `processing`, `completed`, and `failed`.
- A `429` or network-like enqueue failure does not falsely mark the Moment
  `failed`; the app keeps it `queued` unless the backend records a real job
  failure.

Important boundary:

- This is the short-path Async MVP, not a fully durable job system.
- The current worker still relies on the Render process retaining the uploaded
  video buffer after enqueue.
- If Render restarts during analysis, the current design may still lose the
  in-process work.
- Supabase Storage or another durable video store is not implemented yet.

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
Preview build and device QA for notification-enabled analysis UX
```

Next starting point:

- Install the new iOS preview/internal build that includes
  `expo-notifications`.
- Confirm notification permission, Expo push token registration, and completion
  push delivery after a real analysis.
- Confirm Cold Start Loading no longer flashes Empty State before remote restore.
- Detail deep link from notification remains a later enhancement.

Goal:

- Preserve the durable standalone iPhone analysis flow while making async
  waiting feel intentional rather than broken.

Secondary priorities:

- If AI work resumes, validate `InversionObservedFacts` v1 on the real test
  clip before modifying trick classification again.
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

- Supabase Moment persistence and latest Evidence restore are wired for the
  Async MVP.
- No login yet.
- Supabase Storage is used as temporary durable analysis input, not a permanent
  video archive.
- Source-video cleanup is best-effort after successful stored-video analysis.
- Stale queued/processing cleanup is implemented during remote restore.
- No CDN yet.
- No production App Store/TestFlight path yet.
- Detail deep link for push notifications is not implemented yet.
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
Start from the validated Gemini one-call Evidence Extraction + Rider-facing
Analysis Summary stage. Do not implement AI Coach or add a second API call yet.
Upload and review 5 to 10 real wakeboard videos, record each result in
docs/EVIDENCE_POSTPROCESSING_CALIBRATION_MATRIX.md, and only change
prompt/schema/validators after repeated patterns appear.
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
