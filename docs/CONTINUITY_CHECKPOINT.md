# Continuity Checkpoint

## Purpose

This file records the current handoff state after the prior Codex account/session became unavailable.

`docs/PROJECT_MEMORY.md` is the primary source of truth and project operating
system. Use this file together with:

- `docs/PROJECT_MEMORY.md`
- `AGENTS.md`
- `docs/HANDOFF.md`
- `docs/CURRENT_STAGE.md`
- `REVIEW.md`

## Collaboration Model

- User: Product Owner / Founder / Domain Expert.
- Codex: Implementation Engineer.
- ChatGPT: CTO + Project Secretary + Project Historian.

Wrap-ups and handoffs must preserve product continuity, not only code
continuity. Include decisions, discoveries, validated assumptions, rejected
directions, next starting point, technical status, and commit candidates.

## Current Project State

The project is in this state:

```text
Stage 1 complete
Stage 2 local ActivityGroup / Session prototype complete
App Store / TestFlight preparation started
Standalone iPhone EAS preview/internal distribution validated
Stage 3 real video-to-analysis prototype in progress
Evidence-first AI architecture validated with a real wakeboard video
Product direction shifted from Session First to Moment First
Private action sports moment feed + AI Coach direction validated
Render backend deployed and standalone iPhone app working without Expo Go
```

## 2026-06-23 State Sync / Polling Removal Checkpoint

Problem:

Build 52 still allowed state to feel inconsistent after upload: Home could show
the new Moment while Video waited for another event, and tab active indicators
could become stale. This blocked Auth / Part 2 because upload success must
converge across Home and Video before user ownership work begins.

Decision:

Build 53 QA passed the state-sync blocker. The app now treats upload success as
a mutation success that explicitly invalidates/refetches `/api/moments` first
page. That first page updates the global session cache and the Video Archive
first-page source. Tab activation no longer calls a raw setter from upload
flow; it goes through the same helper that updates both state and ref.

Current rule:

- Home = Global Session Cache.
- Video = Server Archive Source.
- Detail = Cache + Server context.
- Main sync = upload_success, Realtime, Push response, foreground refresh.
- Polling = removed from active Moment sync.
- `moment_updated` Broadcast = queued/processing/completed/failed refresh
  trigger.

Next starting point:

Commit the polling removal, then proceed toward Auth / Ownership. Keep
`moment_updated` payloads as refresh triggers rather than direct state merges.

## Part 1 Upload Experience Closeout - 2026-06-22

Problem:

Part 1 was not only about making uploads technically work. It was about making
the first real video upload feel durable, understandable, and app-native before
moving into AI Calibration. The team found that a rider could otherwise confuse
uploading with analysis, miss active-state completion, see stale processing
state after Push/foreground transitions, or depend on a local draft URI that may
not survive app lifecycle changes.

Why it mattered:

The app's first trust contract is:

```text
video selected
-> durable upload
-> server-owned analysis
-> result restore
-> rider-readable completion
```

If that contract is weak, coaching and calibration improvements will not matter
because the user will not trust the product loop.

Decision:

Close Part 1 as complete for single-user internal QA, with explicit boundaries:

- Direct Upload is the preferred architecture.
- Multipart remains as a reliability fallback.
- Local Draft Resume is removed.
- `/api/moments` remains the source of truth for result state.
- Push is for background user notification.
- Realtime Broadcast is for active app screen refresh.
- Foreground refresh remains fallback.

Implementation:

- UploadScreen / UploadContent are route-backed.
- Direct Upload uses signed target + `FileSystem.uploadAsync`.
- Real byte-based percent appears only during the actual video transfer stage.
- Finalize creates Moment and AnalysisJob only after Storage input exists.
- Boot Loading and Empty State are separated.
- Push, Realtime Broadcast, passive foreground refresh, and in-app completion
  banner cover result awareness.
- `upload_targets` tracks issue/upload/finalize/failure for diagnostics.

Result:

The single-user internal QA baseline is now Part 1 complete. Build 36 is the
latest build prepared after the Realtime completion banner:

```text
buildNumber: 36
feature commit: fb42fde feat: show in-app banner for realtime analysis completion
build commit: cf80100 chore: prepare realtime completion banner build
EAS Build: https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/cefad9fb-2a43-4cf9-bfee-dd092e18dcf3
```

Remaining risks:

- External testers require Auth/User Ownership first.
- `upload_targets` status semantics must be clarified before orphan cleanup.
- Direct Upload needs more real-device samples; fallback must stay.
- Realtime Broadcast is public MVP and should be scoped after Auth.

Next:

Do not begin AI Calibration as the immediate next step unless the Founder
explicitly changes priority. Next structural candidates are server Draft/upload
session, upload/orphan cleanup policy, Push deep link, pre-upload video
optimization investigation, and Auth/user ownership.

Navigation / Instagram UX decision:

Record this as a Part 1 closeout skeleton decision. Instagram inflow and
sharing matter to Action Sports Journal. After real-device pager prototype QA,
Home / Video / Growth horizontal swipe is adopted as the Part 1 navigation
skeleton. Bottom Tabs remain visible and continue to provide explicit
navigation, but the same top-level surfaces are also reachable through swipe.

The product reason is that Instagram-inflow users may not separate screen roles
like developers do; they may understand a horizontal swipe as "the next
screen." Instagram UX is not only taste, but a proven user learning model. ASJ
should keep its product idea original while borrowing validated interaction
patterns where they help.

Use Instagram-style media interaction first in bounded places: Video tab media
viewer, previous/next Moment Detail swipe, ShareResult / Growth Card preview
carousel, and Instagram share outputs. The current pager adoption does not
complete the final navigation architecture: route-backed Bottom Tabs plus Stack
remains a later structural refactor for Push deep links, tab state restore,
screen lifecycle separation, and future ShareResult routes.

Pager decision record:

- Problem: Instagram-inflow users may perceive Home / Video / Growth as
  adjacent app surfaces rather than strictly separate tabs.
- Cause: ASJ is a journal/analysis app, but its acquisition and sharing loop is
  Instagram-heavy.
- Options: Bottom Tabs only; full pager-only navigation; Bottom Tabs plus
  horizontal swipe.
- Decision: adopt Bottom Tabs plus horizontal swipe after real-device prototype
  QA. Keep light haptic feedback on tab transitions.
- Result: Build 43 keeps Pager/Haptic as part of the stable baseline.
- TODO: route-backed Bottom Tabs plus Stack remains future architecture work.

Part 2 P1 pagination / infinite scroll starting point:

Cursor pagination has started at the server/app API layer, but the Video
archive rendering path is intentionally back on the stable Build 40-style
`ScrollView + map()` implementation. Build 43 is the current stability
checkpoint after the FlatList launch-crash rollback.

Adopt this direction for the next design/implementation step:

- `/api/moments` should move to cursor pagination with `limit`, `cursor`,
  `nextCursor`, and `hasMore`.
- The stable cursor should be based on `occurred_at desc` plus `id desc`.
- Home should render from the latest N Moments, not from the whole archive.
- Video should be the archive view, but infinite scroll UI should not be
  retried in the current mounted TabView/PagerView scene without a dedicated
  prototype.
- Detail should keep working from the selected Moment payload, but a later
  single-Moment read path should be possible for Push deep links and restore.

Implementation order:

1. Server cursor response.
2. App list API options.
3. Keep Build 43 stable Video rendering.
4. Prototype infinite scroll with lazy mount, route-backed tabs, or another
   structure that avoids the launch crash.
5. Refresh policy update for Boot / Foreground / Push / Realtime.

Main risks:

- Realtime and Push should not force a full archive reload after pagination.
- Merge logic must preserve remote completed state even with partial pages.
- Future date and trick filters should be server-side filters.
- Build 41/42 indicate that `FlatList` inside the current pager scene may be a
  native launch-crash risk. Do not reintroduce it directly on master without
  device QA.

Build 43 QA result:

- Launch crash resolved.
- Home, Video, Pager/Haptic, Upload, Push/Realtime, and deletion passed.
- Server cursor API/helper and Boot first-page policy remain.
- Video infinite scroll UI remains deferred.

Build 48 pagination graduation checkpoint:

- Build 41/42 proved that archive pagination work needs device QA before
  adoption. Build 43 restored stability. Build 48 is now the graduation
  candidate after reintroducing infinite scroll through a safer lazy-mounted
  Video scene and a separated Video Archive Source.
- Important discovery:
  - Home should not be treated as the same data source as Video.
  - Home = Global Session Cache for dashboard/active state.
  - Video = Server Archive Source for ordered cursor pages.
  - Detail = Cache + Server, with a future single-Moment fetch still planned.
- Discovery path:
  - Problem: pagination could not be clearly seen on device.
  - Cause: local persisted sessions and remote page data were merged into the
    same visible Video list.
  - Options: add QA-only filtering, or formalize an archive-specific source.
  - Decision: formalize the Video Archive Source direction.
  - Result: Build 48 is being tested for first-entry spinner, page size 20,
    and `20 -> 40 -> 60` append behavior.
- Graduation condition:
  - no duplicate rows;
  - no missing rows;
  - stable order by `occurred_at desc` plus `id desc`;
  - Upload, Push, Realtime, Detail, and deletion unaffected.
- QA seed:
  - runId `pg-grad-20260622-182901`;
  - cleanup executed after Build 48 seed QA;
  - deleted rows: 99;
  - post-cleanup matched rows: 0;
  - child rows for `analysis_jobs`, `evidence_results`, and `upload_targets` stayed 0.

Part 2 priority after pagination graduation:

1. Auth / Ownership.
2. Compression Measurement.
3. Unread Analysis Badge.
4. Push Deep Link.

Decision records to carry forward:

- Cursor Pagination:
  - Problem: hundreds/thousands of Moments cannot rely on full-list reads.
  - Cause: date filters, trick filters, and growth history require stable
    ordered archive access.
  - Options: offset pagination, cursor pagination, or full-list client
    filtering.
  - Decision: cursor pagination based on `occurred_at desc` plus `id desc`.
  - Result: server/app cursor groundwork remains in Build 43.
  - TODO: UI infinite scroll is deferred until the archive scene is safe.
- FlatList Crash:
  - Problem: Build 41/42 crashed immediately on launch.
  - Cause: suspected `FlatList` scene inside TabView/PagerView; exact native
    stack was not captured.
  - Options: full pagination rollback, prop-only fix, or UI-scene rollback.
  - Decision: rollback only Video `FlatList` scene.
  - Result: Build 43 launch passed.
  - TODO: retry only in isolated prototype or safer route structure.
- Network Outage QA:
  - Problem: Build 40 looked like an upload regression.
  - Cause: physical device network was unavailable.
  - Decision: classify as network-failure QA, not Pager regression.
  - Result: app showed retry/failure messaging and recovered after network
    restoration.

Build 28 save point, 2026-06-21:

- Latest preview/internal buildNumber is `28`.
- EAS Build URL:
  `https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/0e95c278-e3d3-4c04-bebf-b16f163f0b9a`.
- Latest build commit is `773680c chore: prepare upload fallback qa build`.
- Build 28 should be treated as the current handoff build even if QA reveals
  more upload issues.
- Direct upload is instrumented but not validated. Latest evidence indicates
  direct upload/finalize fails with a source video size mismatch and the app
  must rely on multipart fallback.
- Multipart fallback is intentionally retained and restored to a 30 second
  timeout. Direct failure reporting is non-blocking so fallback can proceed.
- Next session should verify Build 28 on the physical iPhone, preserve DB rows,
  and inspect `upload_targets.failure_reason` plus latest Moment storage path.

Build 29 Direct Upload checkpoint, 2026-06-21:

Problem:

Direct Upload was the intended architecture, but Build 28 showed a finalize
failure caused by a 0 byte Storage object. The server compared the expected
draft file size with the actual downloaded Storage object size and rejected the
upload before Moment creation.

Cause:

The root cause was the client upload body path: `fetch(file://...).blob()` plus
Supabase `uploadToSignedUrl` did not reliably upload the real MOV bytes in
RN/Expo. The draft metadata and server validation were acting as useful guards,
not as the broken part.

Decision:

Do not switch the product back to multipart as the default. Keep Direct Upload,
keep multipart fallback, and replace the unstable body upload mechanism with a
native file upload path.

Implementation:

- Added direct `expo-file-system` dependency.
- Direct Upload uses `FileSystem.getInfoAsync` to validate local file
  existence and size before upload.
- Direct Upload uses `FileSystem.uploadAsync` with `PUT` and
  `BINARY_CONTENT` against the signed upload URL.
- Finalize mismatch messages include `expected` and `actual` sizes.

Result:

- Latest upload on Build 29 reached `upload_targets.status=finalized`.
- `uploaded_at` and `finalized_at` were recorded.
- Latest Moment used `users/.../uploads/{uploadId}/source.mov`, confirming the
  Direct Upload path rather than multipart fallback.
- Moment, AnalysisJob, EvidenceResult, Push, restore, and source cleanup all
  worked.
- A roughly 15.8 MB / 8 second MOV took about 8-10 seconds to upload/finalize,
  which is acceptable for now.

Insight:

Direct Upload is no longer blocked by the 0 byte object bug, but it should be
validated with several more real-device uploads. Local Draft Resume has been
removed from the current Part 1 flow because restored local URIs may expire or
become inaccessible. The current UX direction is to keep the rider on the
Upload screen until upload finishes and show clear step-based progress. Future
draft work should be server/upload-target based. Pre-upload video optimization
is a future investigation, not current implementation work.

Current refactor/TODO backlog:

```text
docs/TECH_DEBT_AND_REFACTOR_TODO.md
```

Current architectural priority:

The default durable analysis path is `POST /api/moments/from-source-video`. It should create/confirm a remote Moment only after the
source video is safely in temporary durable Storage. Uploading and analysis are
separate product states, not one generic "analysis in progress" state:

```text
uploading / upload_failed
queued / processing / completed / failed
```

Interrupted uploads should not leave remote Moments that look like stuck
analysis jobs. Legacy/fallback endpoints remain compatibility paths until the
source-video-first flow is validated through device QA.

2026-06-21 validation update: operating Render + Supabase verified the upload-first path. Fileless `POST /api/moments/from-source-video` returned 400 without DB row creation. Normal upload created Storage input first, then Moment, then AnalysisJob, then completed EvidenceResult and source cleanup. Upload UI now blocks on the upload phase and explicitly tells the user not to close the app before upload completion. A force-close immediately after tapping upload can still succeed if upload already reached the server or iOS briefly completed the request; that is not automatically a regression.

Upload close/kill interpretation:

- If the app closes before source upload completion, analysis may not start.
- If source upload completes first, server-side analysis should continue.
- Later copy should communicate risk more precisely: "업로드가 끝날 때까지 앱을 닫지 않는 것이 안전합니다." and "업로드가 완료되면 분석은 서버에서 계속됩니다."
- Follow-up TODOs: test before/after-upload termination, polish upload-state copy, collect analysis timing data, continue sample-based AI Calibration, revisit Detail structure, add Push deep link, and consider background upload as a long-term option.

Current product priority clarification:

The current priority is not improving AI accuracy first. The priority is making
one real video upload behave like a proper mobile app flow. Continue in this
order:

```text
1. Upload structure / UX completion
2. Mobile app screen structure
3. App-native gestures and return behavior
4. UX stabilization
5. AI Calibration
```

Upload structure includes upload-first behavior, signed/direct upload
evaluation, progress feasibility, blocking overlay, and timing logs. Mobile
screen structure now includes route-backed `MomentDetailScreen` and
`UploadScreen`. `UploadContent` was extracted from the old `UploadSheet` body,
so the route can later host Draft Upload Flow without changing the current
upload-first semantics. App-native return behavior includes native stack swipe back, Push
tap to Moment Detail, and foreground/background restore.

AI Calibration for toeside/heelside, Back Roll, and other trick-name accuracy
should wait until the upload/detail/navigation lifecycle feels stable.

The latest known project checkpoint is:

```text
fcbfb92 Document async analysis transition plan
```

At the time this checkpoint was updated, local `master` was pushed to
`origin/master`.

## Confirmed Working

- The app opens in Expo Go on the user's physical iPhone.
- The app has been installed and opened as a standalone iPhone app through EAS
  preview/internal distribution, without Expo Go.
- Tunnel mode was used successfully when LAN mode was unreliable.
- ActivityGroups are visible.
- Sessions are filtered by selected ActivityGroup.
- Add Session opens an input flow.
- Saving a session adds it to the local app state.
- Added Session state is now persisted on-device using AsyncStorage.
- A selected video can be attached to a Session.
- The local dev analysis server runs on port `8787`.
- The local dev analysis server keeps Gemini as the app-facing analysis path
  and exposes a parallel OpenAI GPT-5.5 wakeboard benchmark endpoint.
- The app now has a Session detail flow that can request Gemini coaching and
  GPT benchmark coaching for the same locally persisted Session/video.
- `/health` confirms `primaryProvider: "gemini"` and reports Gemini evidence
  plus OpenAI benchmark configuration.
- Real Gemini video analysis works.
- The OpenAI benchmark path works.
- GPT coaching/report quality improved after the benchmark path added
  motion-aware context.
- Gemini evidence extraction is implemented.
- User-confirmed trick flow is implemented, with the confirmed trick kept
  separate from the AI-estimated trick.
- Motion-aware dense sampling is implemented for the OpenAI benchmark path.
- Gemini Flash-Lite fallback is treated as degraded mode only and should not be
  used as a trick-recognition quality benchmark.
- Internally inconsistent evidence, such as heelside approach plus Front Roll
  classification, is flagged and routed to user confirmation before coaching.
- The user's iPhone can open `http://10.10.7.17:8787/health` from Safari on
  the same Wi-Fi.
- EAS preview has the public endpoint variable:
  `EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT=http://10.10.7.17:8787/api/analyze-session-video`.
- Render backend is deployed at `https://action-sports-journal-api.onrender.com`.
- Public HTTPS `/health` returns `ok: true`, `geminiConfigured: true`, and
  `geminiEvidence.configured: true`.
- EAS preview/internal distribution now uses:
  `https://action-sports-journal-api.onrender.com/api/analyze-session-video`.
- The app is installed on the user's iPhone as a standalone EAS internal
  distribution app, not Expo Go, TestFlight, or App Store.
- The installed app works without the local Mac server.
- Thumbnail generation uses the Render backend.
- Gemini evidence extraction works from the standalone app and evidence quality
  is currently good.
- Gemini API key rotation was completed in Render and local `.env.local`
  without exposing key values. The previous `API_KEY_INVALID` issue is fixed.
- Coaching requests reach the backend/AI path, but the current blocker is a
  structured parsing failure in the coaching response flow.
- Supabase Phase 1 preparation is scaffolded but not product-wired.
- Node standard is Node 22 LTS.
- Async analysis transition planning is documented.

## Today's Conclusions

## 2026-06-20 Analysis-first Product Strategy

Problem:

The project is building toward coaching, but coaching is not the next thing to
implement. The user first needs the analysis product loop to feel complete and
trustworthy.

Why it mattered:

The user must trust the basics before trusting advice:

- upload,
- async processing,
- analysis completion,
- result restore,
- result understanding.

If these are not clear, coaching will feel like decoration on top of an
uncertain system.

Decision:

Prioritize the product in this order:

```text
1. AI Analysis UX Completion
2. Analysis Trust
3. Coaching
```

Current stage:

```text
AI Analysis Product Completion
```

Scope of the current stage:

```text
video upload
-> async analysis
-> analysis completed
-> result restored
-> Rider-facing Summary
-> user-understandable result
```

Analysis Trust currently means improving:

- Evidence Extraction,
- ObservedFacts,
- Validators,
- CandidateTrace,
- KnowledgeRules,
- Rider-facing Summary,
- Calibration.

Result:

- AI Coach is not implemented.
- A second API call is not introduced.
- Coaching should later depend on previous session comparison, rider history,
  progression, and priority selection.
- Cold Start Loading is implemented. The app separates Loading State from Empty
  State and shows "기록을 불러오는 중입니다" while remote Moments are being restored.
- Durable Analysis Pipeline Phase 8 MVP is implemented. New evidence jobs can
  use Supabase Storage as temporary durable analysis input. Verified flow:
  source upload to `moment-videos`, path persistence on `moments` and
  `analysis_jobs`, server-side automatic analysis start after `/source-video`,
  Render Storage download, Gemini Evidence Extraction, `evidence_results`
  persistence, and completed restore.
- Build 14 QA exposed the reason queued jobs could linger: upload had become
  durable, but analysis start still required a second app request to
  `/analyze-stored-video`. `cf71b58 feat: start analysis automatically after
  storage upload` fixed this by starting the queued job on the server
  immediately after source-video upload succeeds. `/analyze-stored-video` is
  retained as legacy/fallback.
- Render + Gemini Pro E2E verified the fixed flow: `analysis_jobs.started_at`
  is recorded, the job reaches completed, `evidence_results` is inserted, and
  `source_video_storage_status=deleted` after cleanup.
- Storage policy is explicit: Supabase Storage is temporary durable
  analysis-input storage, not permanent source-video archive storage. App
  playback should use local video URI when available. If local video is no
  longer available, thumbnail plus EvidenceResult/Rider-facing Summary is still
  a valid restored state. Storage source objects should be deletable after
  successful analysis or after a short QA/retry retention window; reanalysis
  may require reuploading the original video.
- Source object cleanup after successful stored-video analysis is implemented
  as best-effort cleanup. Success records `source_video_storage_status=deleted`;
  failure records `delete_failed` without failing completed analysis.
- Stale queued/processing cleanup is implemented during `/api/moments` restore.
  Old jobs that cannot reasonably complete become failed, while completed
  evidence remains protected.
- App-facing progress language now separates `대기`, `분석중`, `완료`, and
  `실패`. Stale cleanup failures are not shown with technical job language.
- Direct multipart evidence upload remains as fallback.
- Push Notification MVP is implemented for analysis completion. App startup
  requests permission and registers an Expo push token; Render stores the token
  through `/api/push-tokens`; successful EvidenceResult persistence sends a
  best-effort Expo push. Push failures are warning-only.
- `supabase/phase9_device_push_tokens.sql` adds `device_push_tokens` and is
  assumed applied remotely for this checkpoint.
- Notification tap opens the app. Detail deep link navigation is still
  unimplemented.
- `expo-notifications` is a native plugin, so a fresh EAS iOS preview/internal
  build is required.

Build 22 closeout checkpoint:

Build 22 is ready for the next session's installation and QA. The current
session stops at build creation and upload-first validation; actual device
installation and QA continue in the next session.

Included in Build 22:

- Upload-first Moment creation through `POST /api/moments/from-source-video`.
- Source video reaches temporary durable Storage before Moment/AnalysisJob
  creation.
- Upload screen stays open during source upload and warns the rider not to
  close the app before upload completion.
- Durable analysis, Push, restore, deletion sync, Boot Loading, waiting copy,
  delete feedback, and Detail thumbnail fallback from the previous baseline.

Explicitly deferred:

- Detail gesture dismiss. The edge-swipe experiment is paused because it felt
  awkward in the current full-screen Detail layout.
- Navigation stack conversion. The app currently renders `HomeScreen` directly;
  Upload is an `isComposerOpen` modal and Detail is a `selectedSessionId`
  modal. React Navigation / Expo Router are not in use. Convert later only
  after Build 22 upload-first QA, starting with Detail as a route-backed screen.
- AI accuracy/calibration questions such as toeside vs heelside. These belong
  to the Calibration stage after real examples accumulate.

Next session starts with Build 22 QA:

1. Install Build 22.
2. Verify upload-first behavior on a real iPhone.
3. Verify interrupted upload does not leave an incomplete remote Moment.
4. Verify completed result restore.
5. Verify Push.
6. Verify thumbnail fallback, delete feedback, and analysis waiting copy.

Performance/bottleneck analysis should wait until completed QA rows accumulate.
The database must not be automatically cleared after builds anymore. Report
counts only unless the Founder explicitly asks for reset/initialization.

Next starting point:

Install Build 22 and run device QA. Verify upload-first behavior, interrupted
upload handling, completed result restore, Push delivery, thumbnail fallback,
delete feedback, and analysis waiting copy. Do not auto-clear DB data before or
after the QA unless explicitly requested.

Build 23 continuity update:

Build 23 is now the active real-device QA baseline. The first pass is broadly
successful:

- Boot Loading is not fixed-time decoration. It waits for local restore and
  `/api/moments` sync, with an 8 second timeout.
- Upload Overlay felt natural and clearly communicated that source upload must
  finish before server-side analysis can continue independently.
- A roughly 18.25 MB, 9 second test video produced a perceived 5-8 second
  upload wait.
- Directional timing: about 5.2 seconds from upload start estimate to server
  file/storage flow entry, about 3.9 seconds for server Storage/Moment creation
  work, about 1 second or less for job queue/start, and about 50.7 seconds for
  Gemini `started_at -> completed_at`.
- Push was received, perceived as more than 1 minute and less than 3 minutes.
- Result restore worked.
- Delete was not tested in this pass.

Next session should continue Build 23 QA, not reset DB data, and collect paired
iPhone `[upload_timing]` logs plus Render Dashboard `[source_video_timing]`
logs. Progress bar work is not mandatory until repeated timing samples show it
is needed.

Signed/direct upload architecture decision:

Signed/direct upload is implemented in code as the default upload path:

```text
app
-> POST /api/video-upload-targets
-> Supabase signed direct upload
-> POST /api/moments/from-uploaded-source
-> Storage verification
-> Moment and AnalysisJob
-> Gemini analysis starts
```

The previous Render multipart upload-first path remains as fallback through
`POST /api/moments/from-source-video`.

Upload target tracking is prepared through `supabase/phase10_upload_targets.sql`.
Lifecycle states are `issued`, `uploaded`, `finalized`, and `failed`. Orphan
candidates are old `issued`, `uploaded`, or `failed` rows. Automatic deletion
is not implemented. The phase10 migration is applied remotely and verified with
an empty `upload_targets` table before the next build. Tracking is best-effort
so upload should not fail solely because tracking has an issue.

Upload Draft decision:

Local Draft Resume is removed from the first app-native Level 1 upload
experience. The app still has an in-memory `UploadDraft` for the current
Upload screen, but it no longer stores `file://` local video URIs for resume
after app restart:

```text
video selected
-> in-memory upload draft
-> UploadScreen stays open
-> step-based upload progress
-> signed/direct upload
-> finalize
-> Moment and AnalysisJob
```

Current behavior:

- `UploadDraft` is local-only and in-memory.
- Selecting a video creates a draft without creating a remote Moment.
- App re-entry no longer asks whether to continue the previous upload.
- `UploadScreen` renders the currently selected video/draft only.
- Upload success clears the draft and closes the screen.
- Upload failure keeps retry possible while the screen is active.

Concept boundary: Draft is the user's selected upload work; signed/direct
upload is the transport; finalize turns uploaded media into a server-side
Moment; Moment means durable input exists and analysis can start. Orphan
cleanup automation remains unimplemented. Future multi-user design should
consider future `userId`, Storage path ownership, orphan cleanup, and path shape
`users/{userId}/uploads/{uploadId}/source.mov`.

Durable pipeline reference:

```text
docs/DURABLE_ANALYSIS_PIPELINE_PLAN.md
```

Cold Start Loading UX should be handled by separating:

```text
Loading State
```

from:

```text
Empty State
```

Expected future behavior:

```text
app starts
-> Loading State
-> Supabase query
-> data exists: show real data
-> no data: show Empty State
```

## 2026-06-20 Evidence Calibration Checkpoint

Problem:

The current app can already produce and display a rider-facing analysis, but
the team needs a disciplined way to decide what to tune next. Without that, the
project could overfit prompt/schema/validator changes to whichever clip was
tested most recently.

Why it mattered:

The current product stage is not AI Coach. It is still the foundation layer:
identify what happened, validate the evidence, preserve uncertainty, and make
the result readable. That foundation should be calibrated with multiple real
videos before adding coaching or a second AI call.

Decision:

- Keep the normal path at one Gemini Pro Evidence Extraction call per Moment.
- Treat Rider-facing Analysis Summary as post-processing, not final coaching.
- Keep AI Coach and second API call out of scope for now.
- Use the evidence calibration matrix as the next QA loop.
- Do not change prompt/schema/validators until repeated real-video patterns
  justify it.

Implementation result:

- Rider-facing Analysis Summary exists and uses conservative labels:
  `근거 충분`, `가능성 있음`, `확인 필요`.
- User-facing fallback copy no longer exposes internal storage names such as
  Supabase.
- Session sync restore work has been split into helpers and
  `useSyncRemoteMoments`.
- `docs/EVIDENCE_POSTPROCESSING_CALIBRATION_MATRIX.md` exists as the next QA
  artifact.
- Latest checkpoint: `cc01177`.

Next starting point:

```text
Run 5 to 10 real wakeboard clips through the current app, record the output in
the calibration matrix, and only then choose targeted post-processing changes.
```

## 2026-06-20 Evidence Analysis Boundary Checkpoint

Problem:

The app reached a point where real Gemini Pro evidence was available, but the
product still needed a clear boundary between analysis and coaching. Without
that boundary, the UI could imply a finished AI Coach even though the system is
still primarily identifying and validating what appears in the video.

Why it mattered:

The project is building toward an AI Coach, but coaching should not be layered
on top of weak or confusing analysis. A rider should first understand what the
system thinks happened in the clip, what is confirmed, and what still needs
review.

Decision:

- Keep the default upload flow at one Gemini Pro call per Moment.
- Use that call for Evidence Extraction.
- Keep validators, taxonomy gates, knowledge rules, candidate trace, and
  rider-facing summary as post-processing.
- Do not treat the current summary as the final AI Coach.
- Defer a separate AI Coach layer and likely separate AI call until the analysis
  stage is stable.

Implementation result:

- Rider-facing Analysis Summary exists and sits above detailed Gemini evidence.
- Evidence post-processing wording is more conservative.
- User-facing fallback text no longer exposes internal storage names.
- Latest checkpoint: `0c216eb`.

Next starting point:

```text
Run real videos through the current analysis summary and calibrate wording.
Only after that, design the AI Coach layer and decide whether it should use a
second AI call.
```

## 2026-06-20 Empty Baseline QA Checkpoint

Confirmed facts:

- The app is now prepared for a clean iPhone QA cycle with no seeded sample
  sessions.
- Supabase test Moment data was cleared.
- Hardcoded app seed sessions were removed.
- Latest `origin/master` includes:

```text
7cbe640 chore: bump iOS preview build number
b7eeb64 chore: remove seeded mock sessions
```

- EAS preview/internal iOS build number `6` succeeded:

```text
https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/aa0b7383-dadd-41a6-bb0b-bd39da229927
```

Current assumptions to validate on device:

- The installed build opens with empty-state UI when Supabase has no Moments.
- Uploading a first video creates the only visible Moment.
- Local thumbnail, Supabase restore, async status, and Gemini result copy still
  work after the baseline reset.

Next starting point:

```text
Install iOS build 6 and run one real wakeboard upload from a clean app/database
state.
```

## 2026-06-16 Async Analysis MVP Save Point

Confirmed facts:

- `origin/master` includes the Async Analysis MVP:

```text
0e9594e Implement async evidence analysis MVP
```

- `origin/master` includes the rate-limit / queued-state correction:

```text
7d83e7e Keep async evidence jobs queued on enqueue delay
```

- Render is deployed with the latest rate-limit behavior.
- `/health` returns 200 with `ok: true`, `geminiConfigured: true`, and
  `geminiEvidence.configured: true`.
- `/health` reports route-scoped rate limiting:
  - AI/video upload routes are rate limited.
  - Health, Moment list, and status polling are not counted.
- EAS standalone iOS internal build succeeded:

```text
Version: 1.0.0
Build Number: 5
URL: https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/66b48f3c-5564-4ddd-aa20-698f201e6204
```

- Founder verified the core Async MVP flow on the standalone iPhone app:

```text
video selected
-> queued
-> app closed immediately
-> wait 2-3 minutes
-> app relaunched
-> completed restored
```

What changed:

- Moment creation now returns quickly while evidence extraction is tracked by
  `analysis_jobs`.
- Supabase Moments and latest EvidenceResults are restored after app relaunch.
- UI state now stays aligned with Supabase job state when enqueue is delayed.
- A `429` or network-like enqueue failure no longer falsely marks the Moment
  `failed`.

Current boundary:

- This is still the short-path Async MVP.
- The video file is not stored durably in Supabase Storage or cloud storage.
- If Render restarts during in-process analysis, the current job may still need
  manual recovery or a future durable worker path.
- No Auth, Push, external queue, CDN, or production video storage exists.

Next starting point:

1. Recommended infrastructure next step: design/implement durable video storage
   for AnalysisJobs using Supabase Storage.
2. Product next step if infrastructure is paused: continue Detail Screen QA and
   Moment result UX.
3. AI next step if AI work resumes: continue Inversion Detection evidence
   validation before modifying trick classification again.

## 2026-06-15 End-of-Day Save Point

Current git state at wrap-up:

```text
origin/master includes:
91e8d7c Prepare Supabase phase 1 and standardize Node 22
fcbfb92 Document async analysis transition plan
```

What changed today:

- Supabase Phase 1 moved from planning to connection scaffolding.
- `.env.example` now documents Supabase env values.
- Supabase SDK dependencies are installed.
- Mobile Supabase client scaffold exists but is not wired into product UI.
- Supabase smoke test script exists.
- Initial Supabase SQL schema draft exists.
- Node standard is Node 22 LTS.
- Async analysis transition plan exists.

What remained intentionally not done at that Phase 1 checkpoint:

- No Auth UI.
- No Storage connection at that time.
- No Job Queue.
- No push notification at that time. Current status: analysis completion Push
  Notification MVP is implemented.
- No scoring.
- No coaching expansion.
- No mobile UX switch to async analysis yet.

Next recommended work:

1. Owner supplies Supabase env values.
2. Create local `.env.local` values and Render env values.
3. Run `npm run supabase:smoke`.
4. Apply `supabase/phase1_schema.sql` manually.
5. Add server-side DB write spike.
6. Convert synchronous evidence extraction into async job-backed analysis.

Primary guide:

```text
docs/ASYNC_ANALYSIS_PLAN.md
```

2026-06-14 clarified the current product definition:

```text
Action Sports Journal
=
Private Action Sports Moment Feed
+
AI Coach
```

The product should be Moment First, not Session First. Users want to revisit
their riding moments, not browse session records. Feed should beat dashboard,
content should beat data, and AI Coach should be a secondary layer over the
user's riding content.

Today's UX conclusions:

- The Moment Feed direction was validated.
- The Session Feed improved significantly.
- Thumbnail support and story rail direction were validated.
- Large thumbnails raised perceived product quality more than styling alone.
- Feed immersion matters more than card styling.
- Edge-to-edge content feels better than floating cards.
- Top dashboard/summary areas reduce immersion.
- Instagram-style personal action sports feed is a stronger product direction
  than a GoPro clone. GoPro / Red Bull remain visual inspiration only.
- Korean mobile product feel should be preferred over a pure US extreme-sports
  aesthetic.
- Current primary UX weakness is the Detail Screen.

AI remains a long-term continuous effort. Event Window Detection remains a core
future investment area. For wakeboarding, trick identity is primarily
determined around pop and rotation initiation, with setup and early airborne
mechanics as important context. Landing/crash is outcome evidence, not primary
trick identity evidence.

Current recommended AI architecture:

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

Current recommended model split:

```text
Gemini = primary video/motion/trick evidence extractor
GPT = coaching/reporting engine after confirmed rider intent
```

Current priorities:

- P1: Detail Screen UX, thumbnail experience, content-first experience.
- P2: Progression visibility, story / moment presentation.
- P3: Event Window Detection, trick recognition consistency.

## 2026-06-14 Wrap-Up

What changed:

- Home moved toward a private action sports Moment Feed.
- The feed became visual-first and content-first.
- Large thumbnails became the primary feed element.
- Story-style recent moments were introduced.
- Dashboard/stat summary UI was reduced because it weakened immersion.
- Edge-to-edge content replaced the earlier floating-card feeling.
- Local/dev thumbnail generation and local detail video playback were added.
- Detail Screen received a first pass, but it remains the main UX risk.
- Render backend deployment was completed.
- EAS internal distribution produced an installed standalone iPhone app.
- The app now uses a public HTTPS backend instead of the local Mac/LAN server.

Why it changed:

- iPhone QA showed the feed direction was significantly better once the app
  emphasized riding moments instead of session records.
- Real thumbnails improved perceived product quality more than styling.
- The product should make users want to open a riding moment, not read a
  report or browse a logbook.

Rejected for now:

- Dashboard-first home.
- Session database / report-first presentation.
- Pure GoPro clone or US extreme-sports media aesthetic.
- More AI system work during this UX pass.
- Database, cloud storage, backend streaming, or production video storage.

Validated:

- Moment Feed direction.
- Thumbnail support.
- Story rail direction.
- Feed immersion over card styling.
- Korean mobile product feel as the preferred polish direction.
- Standalone iPhone installation without Expo Go.
- Render-hosted backend health and Gemini configuration.
- Render-hosted thumbnail generation.
- Render-hosted Gemini evidence extraction.
- Local-first iPhone storage as the right short-term storage model.

## 2026-06-15 AI Evidence Checkpoint

Implementation stopped at a clean checkpoint after adding family-level and
approach temporal safeguards. Do not treat the remaining inversion issue as a
coaching problem.

Confirmed findings:

- Standalone iPhone app works.
- Render backend works.
- Gemini evidence extraction works.
- A clear Toeside Basic Jump was initially misclassified as Back Roll /
  Tantrum / Invert.
- Parsing and post-processing did not create the initial false positive.
- The root cause involved raw model hallucination plus missing wakeboard trick
  taxonomy structure.
- Wakeboard trick taxonomy was introduced.
- Wakeboard validation matrix was introduced.
- Taxonomy Gate was implemented.
- `ApproachObservedFacts` was implemented.
- `FinalApproachWindow` design and implementation were added.
- Toeside detection improved significantly.
- Invalid Tantrum classifications are now downgraded instead of confidently
  returned.

Open questions:

- Unknown: why Gemini still believes inversion exists in the test clip.
- Unknown: whether inversion detection is using incorrect visual cues.
- Unknown: whether inversion evidence is being inferred from airtime/body
  position rather than true inversion mechanics.

Next starting point:

```text
Inversion Detection
```

Next goal:

- Design and validate `InversionObservedFacts` before modifying trick
  classification again.
- Candidate fields: `bodyInverted`, `boardAboveHead`, `rollAxis`, `flipAxis`,
  `rotationInitiation`, and `inversionConfidence`.
- First collect and inspect raw inversion evidence paths so nonexistent
  inversion evidence can be explained before prompt or taxonomy changes.

Architecture status:

- Data remains local-first on the iPhone with AsyncStorage.
- Backend is a thin AI gateway plus thumbnail generation server.
- No user-facing database integration yet; Supabase Phase 1 scaffolding exists.
- No login yet.
- No cloud video storage yet.
- No CDN yet.
- AI keys live only in Render environment variables and local ignored env files.
- Future optimization: move thumbnail generation on-device if practical.

Open questions:

- Does the latest Detail Screen feel like reviewing a riding moment on iPhone?
- How should progression be visible without becoming a dashboard?
- Should detail analysis appear inline, behind a drawer, or as a separate coach
  review mode?
- What thumbnail frame best represents a wakeboard attempt?
- When should Event Window Detection become the active focus again?

## Implemented Locally

- Local-only ActivityGroup / Session prototype.
- Mock ActivityGroup data.
- Mock Session data.
- Session composer with title and notes.
- Save Session disabled until a title exists.
- Keyboard dismissal on save and through a Hide Keyboard button.
- iOS bundle identifier and build number in `app.json`.
- Android package and version code in `app.json`.
- Initial `eas.json` with preview and production profiles.
- `expo-image-picker` dependency for video selection.
- `@react-native-async-storage/async-storage` dependency for local on-device
  Session persistence.
- `src/services/ai/analyzeSessionVideo.ts` for the analysis request adapter.
- Remote-only analysis endpoint hook through `EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT`.
- Mobile mock analysis fallback removed.
- `dev-server/index.ts` keeps `/api/analyze-session-video` as the Gemini-backed
  endpoint and adds `/api/benchmarks/openai-wakeboard-video` for the OpenAI
  GPT-5.5 same-video benchmark.
- `dev-server/index.ts` adds `/api/extract-session-evidence` for normalized
  Gemini evidence extraction.
- Gemini evidence returns candidate trick, alternatives, family, approach,
  rotation, landing outcome, evidence windows, observations, confidence,
  uncertainty, model metadata, quality mode, confirmation requirement, and
  consistency warnings.
- `src/features/sessions/HomeScreen.tsx` shows AI-estimated trick evidence and
  lets the user confirm or correct the intended trick.
- Coaching requests prefer the user-confirmed trick when available.
- `docs/STAGE_3_VIDEO_ANALYSIS_PLAN.md` documents the mobile-to-server contract.
- Highlight scenes must be selected by server-side AI analysis, not guessed by the mobile app.
- Development API spend target is under KRW 10,000/month with conservative local server limits.
- Local OpenAI benchmark setup steps are documented in `docs/DEV_AI_ANALYSIS_SETUP.md`.
- Instagram-style personal Moment Feed first version.
- Story-style recent moments rail.
- Lightweight local video thumbnail support for feed/detail imagery.
- Lightweight local video playback from the Session detail screen.
- Detail screen first pass toward hero video/thumbnail first, moment first,
  AI second, long text last.

## Not Done Yet

- No user-facing database integration.
- No authentication.
- No production database/cloud storage.
- No production video upload or storage.
- No App Store Connect upload yet.
- No completed EAS production build yet.
- No completed EAS submit yet.
- Full GPT coaching pipeline after Gemini evidence plus user confirmation.
- Long-term Gemini availability and 503 reliability strategy.
- GPT vs Gemini quality decision after confirmed trick input.
- Evidence schema evolution.
- User progression analysis across Sessions.
- Coaching structured parsing failure investigation.

## Next Recommended Work

Do not add unrelated product features yet.

If returning tomorrow, continue here:

1. Design and validate `InversionObservedFacts`.
2. Investigate why nonexistent inversion evidence is being generated.
3. Investigate coaching structured parsing failure.
4. QA the Detail Screen on iPhone.
5. Improve the Detail Screen until it feels like reviewing a riding moment, not
   reading a report.
6. Review Progression UX.
7. Keep the Feed mostly frozen unless new iPhone QA identifies a specific issue.
8. Resume Event Window Detection and trick-recognition consistency after the
   core moment experience is stable.

## Current Priority

Current priority is AI evidence truthfulness plus standalone app reliability.

P1 is Inversion Detection evidence design. P2 is Detail Screen UX, thumbnail
experience, and content-first experience. AI systems should not be changed
broadly unless explicitly requested.
