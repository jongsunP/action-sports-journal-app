# Current Stage

`docs/PROJECT_MEMORY.md` is the primary source of truth and project operating
system. Read it first for top-level project memory, collaboration rules,
product philosophy, AI architecture direction, and current resume point.

## Stage

Stage 1: Initial project setup complete.

Stage 2: Local-only ActivityGroup / Session prototype complete.

Stage 3: Standalone iPhone video-to-analysis prototype in progress.

## Current Status

Update on 2026-06-20, Analysis-first Product Strategy:

Current refactor backlog:

```text
docs/TECH_DEBT_AND_REFACTOR_TODO.md
```

Current architecture cleanup priority:

```text
POST /api/moments/from-source-video
-> source video reaches temporary durable Storage
-> Moment is created
-> AnalysisJob is created
-> server starts Gemini analysis
```

This replaces the earlier problematic shape where a Moment could exist before
the source video upload completed. The app-facing state model must keep upload
and analysis separate:

```text
uploading / upload_failed
queued / processing / completed / failed
```

Next QA should validate that interrupted uploads do not create remote Moments
that look like stuck analysis jobs.

Mobile-first UX principle for this stage:

Do not judge Upload, Detail, Push, foreground refresh, app lifecycle, or
long-running upload flows only by whether they technically work. The UI should
feel like a mobile app. Prefer app-native navigation, lifecycle, gesture, and
foreground/background patterns over web-style conditional rendering when the
mobile pattern better matches user expectation.

2026-06-21 validation update:

- Fileless upload-first request returns HTTP 400 and leaves DB counts unchanged.
- Normal upload creates durable Storage input before Moment/AnalysisJob creation.
- Verified order: `source_video_storage_uploaded_at -> moment.created_at -> analysis_jobs.queued_at`.
- The Upload screen now remains visible until upload completion and includes the explicit "do not close the app" warning.
- If an immediate force-close test still completes, treat it as likely upload completion before termination or iOS briefly finishing the network request. The key distinction is upload-before-completion can fail; upload-after-completion should continue server-side.
- Upload copy should later be refined toward "업로드가 끝날 때까지 앱을 닫지 않는 것이 안전합니다." and "업로드가 완료되면 분석은 서버에서 계속됩니다."
- Follow-up TODOs: verify app termination before/after upload completion, polish upload-state copy, collect timing data, continue AI Calibration from repeated sample patterns, revisit Detail structure, add Push deep link later, and consider background upload long-term.
- Simulator upload is not part of default QA. Physical iPhone QA should verify the same flow after the next preview/internal build.
- DB auto-initialization is disabled; build reports should include counts only.

Problem:

The product vision includes AI Coach, but making coaching the next immediate
build target would skip the product foundation. A rider first needs to trust
that upload, async processing, analysis completion, result restore, and result
understanding all work as one coherent experience.

Why it mattered:

Action Sports Journal is an AI-based Action Sports Analysis platform before it
is an AI Coach app. If coaching appears before the rider trusts the analysis,
coaching will feel like confident advice built on uncertain ground.

Decision:

Use this product priority order:

```text
1. AI Analysis UX Completion
2. Analysis Trust
3. Coaching
```

Current stage:

```text
AI Analysis Product Completion
```

This means completing the loop:

```text
video upload
-> async analysis
-> analysis completed
-> result restored
-> Rider-facing Summary
-> user-understandable result
```

Result:

- AI Coach remains out of scope.
- A second API call remains out of scope.
- Current work stays focused on Evidence Extraction, ObservedFacts,
  Validators, CandidateTrace, KnowledgeRules, Rider-facing Summary, and
  Calibration.
- Push Notification MVP is implemented for analysis completion. The app
  registers an Expo push token, Render stores it through `/api/push-tokens`,
  and completed EvidenceResult persistence triggers a best-effort Expo Push API
  notification. Push failure is warning-only.
- Cold Start Loading is implemented. The app now separates Loading State from
  Empty State and shows "기록을 불러오는 중입니다" while remote Moments are loading.
- Durable Analysis Pipeline Phase 8 MVP is implemented. New evidence jobs can
  use Supabase Storage as temporary durable analysis input: upload source video
  to `moment-videos`, store paths on `moments` and `analysis_jobs`, let Render
  download the stored object, run Gemini Evidence Extraction, and restore the
  completed EvidenceResult.
- Build 14 QA found that storage upload could succeed while the job remained
  queued because analysis start still depended on the app calling
  `/analyze-stored-video` after upload. The durable pipeline now starts
  analysis automatically after source-video upload.
- Build 15/16/17/18 QA found that upload completion, foreground refresh, and
  boot loading all need to behave like mobile lifecycle features, not web
  refresh patterns.
- The durable pipeline starts analysis server-side immediately after
  `/source-video` succeeds. The
  `/analyze-stored-video` endpoint remains as legacy/fallback.
- Real Render + Gemini Pro E2E succeeded after the change: the job recorded
  `started_at`, moved through processing to completed, created an
  EvidenceResult, and cleaned up the source object with
  `source_video_storage_status=deleted`.
- Storage policy is explicit: Supabase Storage is temporary durable
  analysis-input storage, not permanent video archive storage. Local video URI
  remains the playback source when available. If local video is unavailable,
  the app should still present thumbnail and analysis results rather than
  trying to replay the Storage source object. Source objects should be deleted
  after successful analysis or after a short QA/retry retention window.
- Source object cleanup after successful stored-video analysis is implemented
  as best-effort cleanup. Success records `source_video_storage_status=deleted`;
  failure records `delete_failed` without failing completed analysis.
- Stale queued/processing cleanup is implemented during `/api/moments` restore.
  Old jobs that cannot reasonably complete become failed, while completed
  evidence remains protected.
- App-facing progress language now separates `대기`, `분석중`, `완료`, and
  `실패`.
- Direct multipart upload remains as fallback.
- Build 23 QA confirmed that Boot Loading and Upload Overlay are now acceptable
  for the first real-device pass.
- `supabase/phase9_device_push_tokens.sql` is the DB migration for push token
  storage and is assumed applied remotely for this checkpoint.
- Notification tap currently opens the app only. Detail deep link navigation is
  not implemented yet.
- Because `expo-notifications` adds a native plugin, the next iOS
  preview/internal build is required before device QA.

2026-06-21 app-first UX priority update:

The immediate product objective is not better AI accuracy. The immediate
objective is making the core upload-to-analysis loop feel like a real mobile
app even if the user uploads only one video.

Prioritize in this order:

```text
1. Upload structure / UX completion
2. Mobile app screen structure
3. App-native gestures and foreground/background return behavior
4. UX stabilization
5. AI Calibration
```

Upload work includes the upload-first structure, signed/direct upload
evaluation, upload progress feasibility, blocking overlay, and timing logs.
Screen-structure work now includes route-backed screens: `MomentDetailScreen`
and `UploadScreen` exist, with `UploadContent` extracted from the old
`UploadSheet` body. This reduces Home-owned modal/conditional rendering while
keeping the existing upload-first behavior. App-native behavior includes native
stack swipe back, Push tap to the
relevant Moment Detail, and foreground/background restore flow.

AI Calibration remains important, but it starts after these mobile app
foundations are stable. Do not prioritize toeside/heelside, Back Roll, or
similar trick-name tuning ahead of Upload, Detail, Push return, and core UX
stability.

Build 22 status:

Build 22 is created and is the next device QA starting point. This build should
be installed and checked before any new feature work.

Build 22 includes:

- The upload-first Moment creation refactor.
- Default upload endpoint: `POST /api/moments/from-source-video`.
- Source video reaches temporary durable Storage before Moment/AnalysisJob
  creation.
- Upload screen remains open during source upload and warns the rider not to
  close the app before upload completion.
- Build 19/20 durable analysis, push, restore, deletion sync, long-analysis
  waiting copy, delete feedback, and Detail thumbnail fallback.

Deferred:

- Detail edge-swipe dismiss. The first implementation worked mechanically but
  felt unnatural in the current full-screen detail structure, so it is paused
  until a later Detail navigation/gesture pass.
- Navigation stack conversion. Current structure is `App.tsx -> HomeScreen`;
  Upload is an `isComposerOpen` modal and Detail is a `selectedSessionId`
  modal. Do not convert during Build 22 QA. Later, move Detail to a route-backed
  screen first, then connect Push deep link, then consider Upload screen
  extraction.
- AI accuracy issues such as toeside/heelside calibration remain in the
  Calibration stage, not in this Build 22 UX handoff.

QA data policy:

Preview/Internal build creation no longer implies automatic database reset.
Keep DB records by default so analysis timing, performance trends, calibration,
and real usage patterns can be reviewed. Only clear data when explicitly
requested by the Founder. Build reports should include counts for `moments`,
`analysis_jobs`, `evidence_results`, and `device_push_tokens`.

Next stage:

```text
Install Build 22, then verify upload-first behavior, interrupted upload
handling, completed result restore, Push delivery, thumbnail fallback, delete
feedback, and analysis waiting copy on the device.
```

Build 23 QA status:

Build 23 is now the active QA baseline. The first real-device pass was
successful at the UX/product-flow level:

- Boot Loading felt natural and is confirmed to wait for local restore plus
  `/api/moments` remote sync, with an 8 second timeout.
- Upload Overlay felt natural and clearly blocked the UI while source upload
  was still in progress.
- The latest QA sample was about 18.25 MB and about 9 seconds long.
- User-perceived upload wait was about 5-8 seconds.
- Directional timing suggests about 5.2 seconds before server file/storage flow
  entry, about 3.9 seconds around server Storage/Moment creation, job queue and
  start within about 1 second, and Gemini analysis around 50.7 seconds.
- Push was received after more than 1 minute and before 3 minutes by user
  perception.
- Result restore worked.
- Delete was not tested in this pass.

Current decision:

Do not implement a progress bar or upload architecture change yet. Continue
Build 23 QA, preserve QA rows, and collect iPhone `[upload_timing]` plus Render
Dashboard `[source_video_timing]` logs before making the next change.

Signed/direct upload decision:

The active Build 23 path remains Render multipart relay:

```text
app
-> Render /api/moments/from-source-video
-> Render receives file
-> Render uploads to Supabase Storage
-> Moment/AnalysisJob
-> Gemini
```

This is acceptable for the current single-user QA stage. Signed/direct upload
is still the likely long-term upload architecture because it reduces Render
file relay load, scales better for larger/concurrent uploads, and improves the
path toward progress or resumable upload. Keep it as a P1 architecture backlog
item, but wait for 5-10 paired timing samples before implementing.

Draft Upload Flow decision:

Local Draft Upload Flow is implemented as the app-like layer before upload
transport:

```text
select video
-> local draft
-> resume previous draft / start new
-> current upload-first Render multipart upload
-> Moment/AnalysisJob
```

Current implementation:

- `UploadDraft` is local-only and stored in AsyncStorage.
- Video selection creates and saves a draft without creating a remote Moment.
- App re-entry can prompt "이전 업로드를 이어서 하시겠습니까?"
- `UploadScreen` can render from the draft.
- Upload success clears the draft.
- Upload failure stores `upload_failed` and keeps retry possible.

Do not create remote Moments for Drafts. A Draft is local selected upload work;
a Moment is created only after upload makes the video analysis-ready.
Signed/direct upload, finalize endpoint, and orphan cleanup are not implemented
yet. Future design should include `uploadId`, future `userId`, Storage path
ownership, orphan cleanup, and a path convention like
`users/{userId}/uploads/{uploadId}/source.mov`.

Durable analysis reference:

```text
docs/DURABLE_ANALYSIS_PIPELINE_PLAN.md
```

Cold Start behavior:

```text
app starts
-> Loading State
-> Supabase query
-> data exists: show real data
-> no data: show Empty State
```

This is now implemented as part of the async analysis UX baseline.

Update on 2026-06-20, Evidence Calibration Checkpoint:

Problem:

The app now shows a rider-facing analysis summary, but the product should not
keep tuning prompts, schemas, or validators from a single surprising result.
One-off fixes can make the system look better on one clip while making the
overall wakeboard analysis less trustworthy.

Decision:

Treat the current product as a Gemini one-call Evidence Extraction system with
post-processing:

```text
one uploaded Moment
-> one Gemini Pro Evidence Extraction call
-> ObservedFacts
-> Validators / Taxonomy / CandidateTrace / KnowledgeRules
-> Rider-facing Analysis Summary
```

Do not implement AI Coach yet. Do not introduce a second API call yet. Gather
real-video calibration evidence first.

Current result:

- Rider-facing Analysis Summary is implemented.
- Confidence wording has been made more conservative:
  `근거 충분`, `가능성 있음`, `확인 필요`.
- User-facing fallback text no longer exposes internal storage names such as
  Supabase.
- Session sync restore logic has been split into focused patch helpers and
  `useSyncRemoteMoments`.
- Evidence calibration matrix exists at
  `docs/EVIDENCE_POSTPROCESSING_CALIBRATION_MATRIX.md`.
- Latest checkpoint: `cc01177`.

Next stage:

```text
Upload and analyze 5 to 10 real wakeboard videos.
Record the results in the calibration matrix.
Only then decide whether wording, validators, prompt, or schema need changes.
```

Update on 2026-06-20, Rider-facing Analysis:

The current AI stage is not "AI Coach" yet.

Problem:

The system can extract detailed Gemini evidence, but raw evidence and internal
pipeline labels are not the same as rider-facing product value.

Decision:

Treat the current production path as a one-call Evidence Extraction flow:

```text
one uploaded Moment
-> one Gemini Pro Evidence Extraction call
-> local/server post-processing
-> Rider-facing Analysis Summary
```

The real AI Coach layer is deferred. It should be designed later as a separate
layer after the analysis summary is readable, conservative, and reliable.

Current result:

- Evidence post-processing has been improved.
- Rider-facing summary wording is more conservative.
- Internal storage wording is no longer exposed in restored evidence fallback
  copy.
- Latest checkpoint: `0c216eb`.

Next stage:

```text
Calibrate Evidence post-processing with real videos.
Then design AI Coach as a separate layer.
Do not add a second AI call just to make coaching sound finished.
```

Update on 2026-06-20:

The current standalone iPhone QA baseline is an empty app state backed by
Supabase and Render.

- Supabase test Moment data was cleared.
- Bundled mock session seed data was removed from the app.
- The app should no longer show seeded placeholder sessions when the database
  is empty.
- EAS preview/internal iOS build number `6` was created from this baseline:

```text
https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/aa0b7383-dadd-41a6-bb0b-bd39da229927
```

Current next task:

```text
Install build 6 on the iPhone, confirm the empty baseline, then upload one real
wakeboard video and verify the full Render + Supabase + Gemini Pro flow.
```

The project has a new Expo React Native TypeScript app, initial docs, initial
domain folders, minimal domain types, an Expo SDK 54 setup, a Stage 1 review,
a working local Stage 2 prototype, and a successful standalone iPhone
preview/internal distribution path through EAS.

Stage 2 implementation is complete. The local ActivityGroup and Session
prototype works without backend, database, or authentication.

Stage 3 has moved from mock analysis to real server-mediated analysis. The
mobile app can select a video for a new Session, attach that video URI to the
Session, and request analysis through `EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT`. The
mobile mock analysis fallback has been removed.

On 2026-06-14, the backend was deployed to Render and the standalone iPhone app
was installed through EAS preview/internal distribution using the public HTTPS
Render endpoint:

```text
https://action-sports-journal-api.onrender.com/api/analyze-session-video
```

The installed app is not Expo Go, TestFlight, or App Store. It runs as a
standalone iPhone app and no longer depends on the local Mac/LAN server.

The app can render AI-provided highlight scene cards, but it does not infer
highlight timestamps locally.

Development API usage should stay under KRW 10,000/month. The local dev server has conservative limits for file size, daily requests, rate limiting, and output tokens.

On 2026-06-12, the app was installed and opened on the user's iPhone as a
standalone EAS preview/internal distribution app, without Expo Go. The local
dev-server was confirmed reachable from the iPhone at:

```text
http://10.10.7.17:8787/health
```

Earlier validation without local keys reported:

```text
primaryProvider: gemini
geminiConfigured: false
openAiBenchmark.configured: false
openAiBenchmark.model: gpt-5.5
```

The server starts successfully with Gemini as the app-facing endpoint and OpenAI
as a parallel benchmark endpoint. The current local workspace can report both
`geminiConfigured: true` and OpenAI benchmark `configured: true` when
`.env.local` is present. Do not commit or paste those local keys.

On 2026-06-13, the real wakeboard-video architecture was validated:

- Gemini real video analysis works.
- OpenAI benchmark analysis works.
- GPT coaching/report quality improved after richer motion-aware sampling.
- Gemini evidence extraction is implemented.
- User-confirmed trick flow is implemented.
- Motion-aware dense sampling is implemented for the OpenAI benchmark path.
- Gemini Flash-Lite fallback is treated as degraded mode only.
- Domain consistency warnings now prevent internally inconsistent AI estimates
  from proceeding as reliable coaching facts.

Current recommended architecture:

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

Wakeboard taxonomy reference:

```text
docs/WAKEBOARD_TRICK_TAXONOMY_REFERENCE.md
```

On 2026-06-14, the product direction was refined through iPhone QA:

```text
Action Sports Journal
=
Private Action Sports Moment Feed
+
AI Coach
```

The product is no longer being treated as a Session database. The current
direction is Moment First: users should open the app to revisit riding moments,
not browse session records. Riding moments are the primary product. AI Coach is
a secondary layer that explains, confirms, and coaches after the user is
already engaged by the clip.

Deployment milestone:

- Render backend is live at `https://action-sports-journal-api.onrender.com`.
- `/health` returns `ok: true`, `geminiConfigured: true`, and
  `geminiEvidence.configured: true`.
- Gemini API key rotation was completed in Render and local `.env.local`
  without exposing key values.
- The previous `API_KEY_INVALID` issue is fixed.
- Thumbnail generation works through the Render backend.
- Evidence extraction works from the standalone app and evidence quality is
  good.
- Coaching requests reach the backend/AI path, but the current next issue is a
  structured parsing failure in the coaching response flow.

Infrastructure milestone on 2026-06-15:

- Supabase Phase 1 preparation is documented and scaffolded.
- Node standard is now Node 22 LTS.
- Initial schema draft exists for `users`, `moments`, `analysis_jobs`, and
  `evidence_results`.
- Supabase SDK client scaffold exists, but the app is not product-wired to
  Supabase yet.
- Supabase env values are present locally.
- `npm run supabase:smoke` confirms Supabase connection with service role.
- Phase 1 tables exist in Supabase.
- Service-role table grants are applied.
- `npm run supabase:smoke` reports `schemaReady: true`.
- `npm run supabase:write-smoke` confirms server-side insert/update/delete
  across `users`, `moments`, `analysis_jobs`, and `evidence_results`.
- Gemini Evidence Extraction can now persist an `evidence_results` row when an
  existing Moment is linked by `momentId` or UUID `sessionId`; no UI behavior is
  changed.
- The next architecture direction is synchronous analysis to asynchronous
  background analysis.
- Async transition plan exists at `docs/ASYNC_ANALYSIS_PLAN.md`.

Async Analysis MVP milestone on 2026-06-16:

- Async Analysis MVP is implemented and pushed.
- `POST /api/moments` creates a Moment and queued AnalysisJob, then returns
  quickly.
- Evidence extraction runs through an AnalysisJob-backed background path.
- Moment status can move through `queued`, `processing`, `completed`, and
  `failed`.
- Supabase Moment restore and latest Evidence restore are wired into the Home
  screen.
- The app polls `/api/moments` while active queued/processing Moments exist.
- A bug was fixed where `/api/extract-session-evidence` 429/network failures
  made the app show `failed` while the DB job remained `queued`.
- Rate limiting is now route-scoped to expensive upload/AI routes only.
  `/health`, `/api/moments`, and status polling are not counted.
- Render has the latest backend deploy with the rate-limit fix.
- Standalone iOS internal build `1.0.0 (5)` was created:

```text
https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/66b48f3c-5564-4ddd-aa20-698f201e6204
```

- Founder validated the target flow on the standalone app:

```text
video selected
-> queued
-> app immediately closed
-> wait 2-3 minutes
-> app relaunched
-> completed restored
```

Current infrastructure boundary:

- The Async MVP is validated for personal iPhone use.
- The worker still depends on the Render process retaining the uploaded video
  buffer after enqueue. It is not yet durable across Render restart/sleep during
  analysis.
- No Supabase Storage, cloud video storage, external queue, Auth, Push, or CDN
  exists yet.

UX and model benchmark milestone on 2026-06-16:

- Gemini native video model benchmark runner exists for dev-only edge judgment
  experiments.
- Ground Truth Dataset v1 is committed under
  `dev-artifacts/benchmark-videos/`.
- Dataset composition is 12 short clips:
  - Toe 6 / Heel 6
  - Regular 6 / Goofy 6
  - Regular Toe 3 / Regular Heel 3
  - Goofy Toe 3 / Goofy Heel 3
- Benchmark modes are available:
  - `smoke`: 1 run per clip
  - `full`: 3 runs per clip
- Flash vs Pro smoke benchmark report exists at
  `docs/MODEL_BENCHMARK_REPORT_2026_06_16.md`.
- Smoke benchmark conclusion:
  - Gemini 2.5 Flash: 10/12, 83.3%, with 1 high-confidence wrong and 1 invalid
    JSON/unknown result.
  - Gemini 2.5 Pro: 12/12, 100%, with 0 high-confidence wrong on this dataset.
  - Flash is faster, but Goofy clips exposed reliability risk.
  - Pro is slower, but currently stronger for edge-critical decisions.
- Home UI was simplified away from Instagram feed / bottom sheet structure.
- Current Home is now an iOS Photos-style personal gallery:
  - 2-column square Moment grid
  - minimal date/status badge on each tile
  - no story rail
  - no feed card structure
  - no bottom sheet for details
- Detail UI is now a full-screen modal:
  - video first
  - Moment metadata next
  - analysis/evidence text below in a normal vertical ScrollView
  - no bottom-sheet clipping behavior
- Latest EAS preview/internal distribution build for iPhone UI QA:

```text
https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/d015ec0b-0c0f-4862-8e94-429faaa9442d
```

- Latest pushed UI checkpoint:

```text
c1ed80a Simplify home to gallery layout
```

AI evidence checkpoint:

- Gemini evidence extraction works from the standalone app.
- A clear Toeside Basic Jump was initially misclassified as Back Roll /
  Tantrum / Invert.
- The initial false positive was not caused by parsing or app-side
  post-processing.
- The root cause involved raw model hallucination plus missing wakeboard trick
  taxonomy structure.
- Wakeboard trick taxonomy and validation matrix documents exist.
- A Taxonomy Gate is implemented to block invalid parent-family jumps.
- `ApproachObservedFacts` is implemented so approach is derived from observed
  facts instead of a raw heelside/toeside label when possible.
- `FinalApproachWindow` is implemented so approach evidence is anchored near
  wake crossing and takeoff, not inferred from the whole clip.
- `InversionObservedFacts` v1 is implemented so inversion evidence is captured
  as observed facts before family classification.
- Invert Family is allowed only when `boardAboveHead`, `bodyInverted`, or
  `rollAxisObserved` is true.
- Toeside detection improved significantly.
- Invalid Tantrum classifications are now downgraded instead of confidently
  returned.

Current AI unknowns:

- Unknown: whether `InversionObservedFacts` v1 will correctly report no
  `boardAboveHead` / no roll-axis on the real test clip.
- Unknown: whether inversion detection is using incorrect visual cues.
- Unknown: whether inversion evidence is inferred from airtime/body position
  rather than true inversion mechanics.

## Today's Conclusions

2026-06-16 end-of-day conclusion:

- Personal gallery UX is now a better fit than SNS feed UX for the current
  product stage because the app is primarily for reviewing the user's own
  Moments.
- Bottom Sheet detail UI caused clipping and poor scrolling, so it was replaced
  by a full-screen detail modal.
- Gemini 2.5 Pro is the current quality leader for wakeboard Toe/Heel edge
  native video judgment on the smoke dataset.
- Gemini 2.5 Flash remains useful for speed/cost, but should be treated as
  risky for high-confidence edge decisions unless validated or routed through
  a stronger model.

Today's product conclusion: Session First became Moment First.

- Feed > Dashboard.
- Content > Data.
- Users want to revisit riding moments, not browse session records.
- The Instagram-style personal action sports feed direction is stronger than a
  GoPro clone. GoPro / Red Bull remain visual inspiration only.
- Korean mobile product feel should be preferred over a pure US extreme-sports
  aesthetic.
- Large thumbnails significantly improve perceived product quality.
- Feed immersion matters more than card styling.
- Edge-to-edge content feels better than floating cards.
- Top dashboard/summary areas reduce immersion.
- Session Feed, Moment Feed direction, thumbnail support, and story rail
  direction are validated.
- Current primary UX weakness is the Detail Screen.

AI development remains a long-term continuous effort. Event Window Detection is
still a core future investment area. For wakeboarding, trick identity is
primarily determined around pop and rotation initiation, with setup and early
airborne mechanics as important context. Landing/crash is outcome evidence and
coaching context, not primary trick identity evidence.

The current AI split remains:

```text
Gemini = primary video/motion/trick evidence extractor
GPT = coaching/reporting engine after confirmed rider intent
```

Current priorities:

- P1: Detail Screen UX, thumbnail experience, content-first experience.
- P2: Progression visibility, story / moment presentation.
- P3: Event Window Detection, trick recognition consistency.

## 2026-06-14 Product History

Today changed the product framing more than the architecture.

Changed:

- The app moved from Session First to Moment First.
- Feed became the primary experience; dashboard/stat UI moved down in priority.
- Session cards became moment/content tiles.
- Real video-derived thumbnails became a core UX requirement.
- Story rail became part of the product direction.
- Detail Screen started moving from report view toward moment review.

Why:

- iPhone QA showed users respond to their riding content first.
- The app felt too much like a database, note-taking app, or session log.
- Real thumbnails and edge-to-edge content made the app feel more like a
  commercial mobile product than styling alone.

Rejected:

- Pure GoPro clone direction.
- US extreme-sports media aesthetic as the main identity.
- Dashboard-first home screen.
- Floating session-record cards.
- AI-first product framing.
- New AI/backend/database work during this UX pass.

Validated:

- Private action sports Moment Feed + AI Coach.
- Instagram-style personal action sports feed direction.
- Large thumbnails.
- Story-style recent moments.
- Feed immersion and edge-to-edge content.
- AI Coach as secondary layer.

Open questions:

- Whether the latest Detail Screen pass is good enough on iPhone.
- How to show progression without returning to a dashboard.
- How to make AI evidence accessible without making the screen feel like a
  report.
- Whether local thumbnail generation should choose a smarter representative
  frame later.
- When to resume Event Window Detection as the primary AI track.

## What Exists

- Minimal home screen
- ActivityGroup, Session, AnalysisResult, and ShareResult types
- Feature folders for groups, sessions, analysis, and share
- Service folder for future AI integration
- Expo SDK 54 setup for physical iPhone Expo Go compatibility
- EAS preview/internal distribution setup for standalone iPhone installation
- Stage 1 review in `REVIEW.md`
- Cross-session handoff in `docs/HANDOFF.md`
- Stage 3 video analysis plan in `docs/STAGE_3_VIDEO_ANALYSIS_PLAN.md`
- Development AI setup notes in `docs/DEV_AI_ANALYSIS_SETUP.md`
- Video selection through `expo-image-picker`
- Local on-device Session persistence through AsyncStorage
- Remote-only AI analysis hook through `EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT`
- Local Gemini-backed dev server with a parallel OpenAI GPT-5.5 benchmark
  endpoint in `dev-server/index.ts`
- Gemini evidence endpoint at `/api/extract-session-evidence`
- User confirmation UI for AI-estimated trick candidates
- Normalized evidence fields for trick candidate, approach, rotation, landing,
  evidence windows, observations, confidence, uncertainty, model, quality mode,
  and consistency warnings
- Wakeboard Trick Taxonomy Gate for family-level classification safety
- `ApproachObservedFacts` and `FinalApproachWindow` fields in the evidence path
- `InversionObservedFacts` v1 fields in the evidence path
- Motion-aware dense sampling in the OpenAI benchmark path
- EAS preview environment variable for the dev analysis endpoint
- EAS preview environment variable for the Render analysis endpoint
- In-app Session detail flow for requesting Gemini coaching and GPT benchmark
  coaching against the same locally persisted Session/video
- Render-hosted thin AI gateway plus thumbnail generation server
- Instagram-style personal Moment Feed first version
- Story-style recent moments rail
- Lightweight video-derived thumbnail support
- Lightweight local video playback from Session detail
- First pass Detail Screen UX with hero video/thumbnail first, moment first,
  AI second, long text last

## What Does Not Exist Yet

- Database
- Login or phone authentication
- Coupons or expenses
- Calendar
- RAG
- Production video upload and storage logic
- Database-backed production persistence
- Production-quality AI pipeline from confirmed Gemini evidence into GPT
  coaching
- Long-term model availability strategy for Gemini 503/high-demand periods
- Stored user progression analysis across Sessions

## Next Recommended Step

Do not add unrelated product features yet.

If returning tomorrow, continue here:

1. Verify a real Gemini Evidence Extraction request with a linked `momentId`
   after the local Gemini API key is corrected.
2. Confirm the created `evidence_results` row and linked `moments` latest IDs.
3. Use `docs/ASYNC_ANALYSIS_PLAN.md` as the implementation guide for
   synchronous to asynchronous analysis.
4. If returning to AI truthfulness, run the real test clip through
   `InversionObservedFacts` v1 before modifying trick classification again.
5. Investigate the coaching structured parsing failure.
6. Review Detail Screen on iPhone.
8. Keep Feed mostly frozen unless new iPhone QA identifies a specific issue.

Open questions:

- Long-term Gemini availability and 503 reliability.
- GPT vs Gemini quality after confirmed trick input.
- InversionObservedFacts design without overfitting one clip.
- Evidence schema evolution without a hard-coded full trick database.
- User progression analysis across repeated Sessions.
- Detail Screen product feel.
- Best way to show progression without turning the app back into a dashboard.

## Resume Notes

For a new Codex session, read `AGENTS.md`, `docs/HANDOFF.md`,
`docs/CONTINUITY_CHECKPOINT.md`, `docs/CURRENT_STAGE.md`, and
`docs/ASYNC_ANALYSIS_PLAN.md` first. Read `docs/DEV_AI_ANALYSIS_SETUP.md` when
working on the AI backend or model behavior.
