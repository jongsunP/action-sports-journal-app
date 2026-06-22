# Technical Debt and Refactor TODO

## Purpose

This document records known temporary implementations, compatibility paths, and
future refactor candidates for Action Sports Journal.

The goal is not to treat every item as urgent. The goal is to keep technical
debt visible so future Codex/GPT sessions do not mistake temporary structure
for final product architecture.

## Current Principle

Action Sports Journal is currently in the AI Analysis Product Completion phase.
The immediate product goal is:

```text
one real video upload
-> durable input secured
-> analysis starts server-side
-> result completes
-> result restores
-> rider understands the result
```

Do not start AI Coach, progression, or broad UI redesign work until this loop
feels stable.

## Part 1 Upload Experience Closeout - 2026-06-22

Problem:

Part 1's risk was not only upload failure. The larger risk was shipping a flow
where upload, analysis, result restore, Push, Realtime, and completion feedback
all technically existed but did not feel like one coherent mobile experience.

Why it mattered:

Upload is the front door of the product. If the user cannot tell whether the
video is still uploading, whether analysis has moved server-side, or whether a
result has completed while the app is active, then later AI Calibration work
will not repair the trust problem.

Decision:

Part 1 is closed for single-user internal QA with the following boundary:

```text
Direct Upload preferred
+ multipart fallback retained
+ /api/moments source of truth
+ Push for background notification
+ Realtime Broadcast for active refresh
+ in-app banner for active completion awareness
```

Local Draft Resume is removed. Future draft work must be server/upload-session
based, not a persisted `file://` URI retry.

Implementation:

- UploadScreen keeps the user in flow until upload/finalize completes.
- Direct Upload uses signed URL and `FileSystem.uploadAsync`.
- Real upload percentage is shown only during actual file transfer.
- Boot Loading and Empty State are separated.
- Result sync uses `/api/moments`; Realtime payloads trigger refresh only.
- In-app completion banner appears after local state reflects completed.

Result:

Part 1 is acceptable for founder/internal single-user QA. It is not an
external-user release baseline until ownership and cleanup boundaries are fixed.

Remaining risks:

- Auth/User Ownership: Part 1 blocker for external users.
- `upload_targets` semantics: Part 2 cleanup prerequisite. A failed Direct
  Upload followed by successful multipart fallback can leave a failed target
  even though the user upload succeeded.
- Direct Upload sample size: continue measuring direct vs fallback outcomes.
- Realtime privacy: public Broadcast is internal QA MVP only.

Part 2 TODOs:

1. Server Draft / upload session.
2. Upload target / orphan cleanup policy.
3. Auth and user ownership.
4. Realtime private/scoped channel.
5. Push deep link to Moment Detail.
6. Upload pre-processing investigation: Instagram/TikTok-style client
   re-encoding, resolution downscale, bitrate tuning, proxy video generation,
   and AI-analysis quality impact.
7. Source cleanup monitoring and retry policy.
8. AI Calibration after upload experience remains stable.

## Build 29 Direct Upload Case Study - 2026-06-21

Build 29 is the current upload architecture QA build:

```text
buildNumber: 29
EAS Build: https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/16f8d05e-d375-4539-b9fa-1addbffb0227
build commit: 3e4b26b fix: upload signed source files with file system
```

Problem:

Build 28 reached the correct Direct Upload architecture but failed at finalize.
The Storage object produced by signed upload downloaded as 0 bytes, while the
draft file size was a normal MOV size. The server rejected it with source video
size mismatch before creating a Moment.

Cause:

The unstable point was the client file body: RN/Expo `fetch(file://...).blob()`
combined with Supabase `uploadToSignedUrl` did not reliably upload the actual
MOV bytes. `draft.fileSize` and finalize validation were useful guards, not the
broken pieces.

Investigation:

The team compared `upload_targets.file_size`, downloaded Storage object size,
Moment Storage path, and finalize status. Failed targets showed `failed` with
no `uploaded_at` or `finalized_at`; the object was present but 0 bytes.

Decision:

Do not abandon Direct Upload and do not make multipart the default workaround.
Use a native file upload path while preserving multipart fallback.

Implementation:

- Add `expo-file-system`.
- Check the local file with `FileSystem.getInfoAsync`.
- Fail before signed upload if the local file is missing, 0 bytes, or does not
  match the draft file size.
- Upload the real file body with `FileSystem.uploadAsync` to the signed URL
  using `PUT` and `BINARY_CONTENT`.
- Include `expected` and `actual` byte counts in finalize mismatch errors.

Result:

- Build 29 real-device QA confirmed `upload_targets.status=finalized`.
- `uploaded_at` and `finalized_at` were recorded.
- The latest Moment Storage path used `uploads/{uploadId}`, confirming Direct
  Upload instead of multipart fallback.
- Moment, AnalysisJob, EvidenceResult, Push, restore, and source cleanup all
  worked.
- A roughly 15.8 MB / 8 second MOV took about 8-10 seconds to upload/finalize.
  Treat this as acceptable for now.

Next:

Validate Direct Upload with several more real-device uploads. Local Draft
Resume is removed from the Part 1 path because restored `file://`
`localVideoUri` values may not remain accessible after app restart. The current
UX choice is to keep the rider on the Upload screen until upload completes and
show step-based progress. Future draft work should be server/upload-target
based rather than local URI resume based.

Current product priority:

The immediate priority is not AI result accuracy. It is making the core
upload-to-analysis flow behave like a proper mobile app. Rank work in this
order:

```text
1. Upload structure / UX completion
2. Mobile app screen structure
3. App-native gestures / return flows
4. UX stabilization
5. AI Calibration
```

Upload structure includes the upload-first flow, signed/direct upload
evaluation, upload progress feasibility, blocking overlay, and timing logs.
Screen structure now includes route-backed `MomentDetailScreen` and
`UploadScreen`; `UploadContent` was extracted from the old `UploadSheet` body
so the route can become the future Draft screen without changing upload-first
semantics.
App-native return flows include native stack swipe back, Push tap to the
relevant Moment Detail, and foreground/background restore behavior. UX
stabilization includes Boot Loading, Upload, Delete, Empty/Error states, and
cross-device thumbnail fallback.

AI Calibration remains a later stage. Do not prioritize toeside/heelside, Back
Roll, or other trick-name tuning before the app's upload, screen, lifecycle,
and recovery flows feel stable.

Mobile-first UX development principle:

The Founder may frame requests with web-development analogies, but Action
Sports Journal should be judged as an iOS-first mobile app. For Upload,
Detail, Push, foreground/background refresh, lifecycle behavior, and long
running upload flows, evaluate common mobile app patterns before using
web-style conditional rendering or screen swaps.

Guidelines:

- Prefer app-native navigation and lifecycle patterns when they better match
  the user's expectation.
- Do not treat "the feature works" as complete if the flow feels unlike a
  normal mobile app.
- If a web-style implementation would be simpler but awkward on iPhone, record
  the tradeoff and propose the mobile-first structure.
- Use this principle when deciding whether to keep modal/conditional UI,
  introduce route-backed screens, support gestures, or handle foreground and
  background transitions.

## Priority Groups

### Now

1. Upload structure / UX completion.
2. Upload completion before Moment creation.
3. Upload state and analysis state separation.
4. Signed/direct upload evaluation.
5. Draft Upload Flow architecture.
6. Upload timing logs and progress feasibility.

### Later UX Stage

7. Mobile app screen structure.
8. Moment Detail screen structure.
9. Push notification deep link.
10. Native stack gesture / return behavior.

### Calibration Stage

11. Analysis timing and quality observation data.
12. AI calibration system.

### Stabilization Cleanup

13. Legacy/fallback endpoint cleanup.
14. Thumbnail storage policy.

### Multi-user / Product Stage

15. Auth and user model.

### Long-term Stability

10. Background upload.

## TODO Items

### 1. Upload Completion Before Moment Creation

Problem:

The correct durable-analysis architecture is to create a remote Moment and
AnalysisJob only after the source video has been durably stored.

Why it matters:

If a Moment row exists before the actual source video upload completes, the app
can show an analysis state for a video that the server cannot analyze. This
creates stale queued rows and makes the product feel broken.

Current direction:

```text
app selects video
-> app shows local uploading state
-> server receives source video
-> server writes source video to temporary durable Storage
-> server creates Moment
-> server creates AnalysisJob
-> server starts Gemini analysis
```

Status:

Implemented as the preferred direction through the source-video-first endpoint `POST /api/moments/from-source-video`.
Continue validating this as the default path before creating the next QA build.

Do not regress to:

```text
create Moment first
-> upload source video later
```

except for legacy/fallback paths.

### 2. Upload State and Analysis State Separation

Problem:

The old status model only had:

```text
queued / processing / completed / failed
```

That was not enough because uploading and analysis are different phases.

Decision:

Use app-facing status concepts:

```text
uploading
upload_failed
queued
processing
completed
failed
```

Meaning:

- `uploading`: source video is still being sent to the server. User should not
  close the app yet.
- `upload_failed`: source video did not reach durable input storage. Analysis
  did not start.
- `queued`: upload is complete and analysis has been accepted by the server.
- `processing`: AI analysis is running.
- `completed`: EvidenceResult is ready.
- `failed`: analysis failed after upload was accepted.

DB note:

The persisted Moment status can remain narrower while the app uses additional
UI states. Do not force DB schema changes unless the product needs these states
for cross-device history.

### 3. Moment Detail Screen Structure

Problem:

The app does not currently use a navigation stack. `App.tsx` renders
`HomeScreen` directly, and React Navigation / Expo Router are not installed or
used.

Current screen structure:

- Upload is `UploadSheet`, opened from `HomeScreen` through `isComposerOpen`.
- Detail is `MomentDetailModal`, opened from `HomeScreen` through
  `selectedSessionId`.
- Both are modal/conditional-rendering flows owned by `HomeScreen`, not real
  stack screens.

The Detail screen therefore mixes modal and page behavior. The earlier
edge-swipe dismiss worked mechanically but felt unnatural because the screen
does not behave like a true iOS navigation route.

Decision:

Do not convert to a navigation stack during the Build 22 QA cycle. Keep the
current close/back button, upload overlay, and deletion UX stable while
upload-first behavior is validated.

Longer term, Detail should likely become the first route-backed screen because
it unlocks the highest-value UX improvements:

- native iOS swipe back
- more natural Detail gestures
- Push deep link to a specific Moment Detail
- clearer separation from HomeScreen state

Future candidates:

- Keep current structure and validate Upload overlay first.
- Split HomeScreen state ownership before moving screens.
- Move `MomentDetailModal` toward `MomentDetailScreen` first.
- Connect Push tap / deep link to the route-backed Moment Detail.
- Move Upload toward `UploadScreen` later.
- Evaluate React Navigation or Expo Router after the route model is clear.

Risks if done too early:

- breaking upload-first flow
- breaking remote Moment sync
- breaking deletion sync
- breaking thumbnail fallback
- breaking Push restore / future deep link behavior
- expanding QA scope before Build 22 upload-first validation

Do not patch gestures repeatedly without first deciding the screen model.

Route-backed first pass update:

`MomentDetailScreen` now exists behind React Navigation native stack, while
`MomentDetailContent` is shared with the legacy modal wrapper. The Detail route
explicitly enables horizontal iOS gestures, full-screen gesture handling, and a
transparent native header so the route can behave more like an app-native iOS
screen.

Remaining QA note:

Simulator-based touch verification was inconclusive after the route option
update: button navigation worked, but automated drag input did not reliably
trigger either horizontal swipe back or ordinary vertical scroll. Treat native
swipe back as requiring physical-device QA before calling the Detail route
transition fully complete. Do not add another custom gesture layer unless the
native-stack gesture fails on device.

### 4. Navigation / Instagram UX Direction - Part 1 Skeleton Decision

Decision:

Adopt Instagram-style horizontal swipe between Home, Video, and Growth as the
Part 1 navigation skeleton after real-device prototype QA. Keep Bottom Tabs
visible as explicit navigation; the adopted behavior is Bottom Tabs plus swipe,
not swipe-only navigation.

Product structure:

The current accepted implementation uses `react-native-tab-view` inside
`HomeScreen` while preserving the existing Bottom Tabs. Home, Video, and Growth
should still eventually become real route-backed Bottom Tab Navigator routes.
The current pager adoption validates the product feel, not the final routing
architecture.

What was confirmed:

- Horizontal swipe between Home, Video, and Growth is technically possible.
- The current structure uses `activeTab` inside `HomeScreen`, so a proper
  gesture implementation would require structural changes rather than a small
  visual patch.
- The common app industry standard for top-level areas is bottom tab button
  navigation, so Bottom Tabs plus Stack remains the default architecture
  candidate.
- Instagram UX is a proven user learning model, not only a taste preference.
  Instagram-inflow users may perceive horizontal swipe as "the next screen"
  even when developers classify Home, Video, and Growth as different surfaces.
- Action Sports Journal still has long-term reason to revisit this because
  Instagram inflow, sharing, and media-native expectations are important to the
  product strategy.
- Home / Video / Growth are not one continuous content surface. Home is a
  dashboard, Video is an archive, and Growth is a progression surface.
- ASJ is a record, analysis, and growth app, not primarily a passive media
  consumption app.
- ASJ's product idea can be original while still using validated UX patterns
  where they reduce friction.
- Real-device QA found the pager feel, haptic feedback, and Video List gesture
  guard positive enough to adopt the pager skeleton.

Remaining risks:

- Top-level horizontal swipe can conflict with Detail edge-swipe back,
  vertical scroll, horizontal media rails, and upload-related flows.
- Video List gesture guards reduce accidental row opens, but should keep being
  tested with larger data sets.
- The current implementation is still not paginated and does not use FlatList;
  data-scale work remains a Part 2 TODO.
- The current implementation is not yet route-backed Bottom Tabs.

Where Instagram-style interaction belongs:

- Video tab internal media viewer.
- Previous/next Moment Detail swipe.
- ShareResult / Growth Card preview carousel.
- Instagram share outputs and result-card generation.

Part 2+ structure TODO:

- Introduce route-backed Bottom Tabs for Home / Video / Growth.
- Support Push deep link and tab state restore.
- Design ShareResult screens as first-class routes.
- Prototype Instagram-style gestures first in media-heavy surfaces.
- Add pagination / infinite scroll and FlatList for data-scale safety.

Future experiment:

Future experiments should focus on media-heavy surfaces: Video tab media
viewer, previous/next Moment Detail swipe, ShareResult / Growth Card preview
carousel, and Instagram share outputs. Do not use those experiments to reopen
the Part 1 decision unless real users report navigation confusion.

### Signed / Direct Upload Architecture

Current judgment:

Direct Upload is now the intended default path and was validated once in Build
29. The current Render multipart relay remains as fallback, not the preferred
product path. Multipart still uploads to:

```text
app
-> Render POST /api/moments/from-source-video multipart
-> Render receives file
-> Render uploads to Supabase Storage
-> Moment created
-> AnalysisJob created
-> Gemini analysis
```

Build 23 real-device QA validated the surrounding fallback product flow:

- upload-first structure works,
- blocking Upload Overlay felt natural,
- Push was received,
- completed result restore worked,
- about 18.25 MB / 9 second video produced a perceived upload wait of about
  5-8 seconds.

Decision:

Signed/direct upload is implemented as the default path. Build 29 proved the
`issued -> uploaded -> finalized` happy path once after switching from
`fetch(file://).blob()` to `FileSystem.uploadAsync`. Keep multipart fallback
until repeated device QA confirms the Direct path is stable.

Implemented shape:

```text
app
-> request upload target
-> Render issues signed upload URL / token
-> app uploads directly to Supabase Storage
-> app calls finalize endpoint
-> Render verifies Storage object
-> Moment created
-> AnalysisJob created
-> Gemini analysis
```

Expected endpoints:

```text
POST /api/video-upload-targets
POST /api/moments/from-uploaded-source
```

Advantages:

- reduces Render file relay bandwidth and memory pressure,
- scales better for larger files and concurrent uploads,
- makes upload progress more feasible,
- better matches video upload as a core product capability,
- creates a cleaner path toward resumable upload later.

Remaining requirements:

- orphan object cleanup for uploaded-but-not-finalized files,
- user ownership and path validation,
- file size and content type limits,
- signed URL/token expiry behavior,
- Auth/RLS-backed Storage policy when the project moves beyond single-user QA.

Switching criteria:

Revisit and harden signed/direct upload if any of these repeat:

- 25-50 MB+ videos become common,
- upload wait is frequently over 10 seconds,
- Render memory or bandwidth becomes a bottleneck,
- upload failures increase,
- progress percentage becomes product-critical,
- multi-user or concurrent upload QA starts.

Current tracking state:

`supabase/phase10_upload_targets.sql` adds `upload_targets` for target
lifecycle tracking:

```text
issued
-> uploaded
-> finalized
```

Failures are recorded as `failed`. Orphan candidates are old rows in `issued`,
`uploaded`, or `failed`. Automatic deletion is intentionally not implemented
yet. The phase10 migration is applied remotely and verified with an empty
`upload_targets` table before the next build. Server tracking is best-effort so
tracking issues should log a warning and should not block upload.

Recommended order:

1. Repeat `issued -> uploaded -> finalized` tracking during device QA.
2. Keep multipart fallback until direct path is validated repeatedly.
3. Record upload timing and path for several file sizes.
4. Add cleanup automation only after orphan candidates are observable.

### Pre-upload Video Optimization Review

Status:

This is a future product/architecture investigation, not an active bug fix.
Build 29 QA showed that Direct Upload can work end-to-end. A roughly 15.8 MB /
8 second MOV took about 8-10 seconds to upload/finalize, then Gemini analysis
continued server-side. Treat that as acceptable for now, not as a regression.

Why this matters later:

Action Sports Journal's core action is video upload -> AI analysis. Even if the
current Direct Upload path is stable, the product should eventually evaluate
Instagram/TikTok-style client-side upload optimization so riders do not feel
blocked by large source videos.

Investigation items:

- whether client-side re-encoding before upload is practical,
- resolution downscale strategies,
- bitrate optimization strategies,
- thumbnail and proxy-video generation,
- keeping the original locally while uploading a lighter analysis copy,
- whether a lightweight analysis copy harms Gemini evidence extraction quality,
- Expo / React Native implementation options,
- expected size reduction and upload-time savings by file size and duration.

Important guardrails:

- Do not implement this before Direct Upload stability is confirmed over
  repeated real-device QA.
- Do not add quick MVP compression that silently harms analysis quality.
- Evaluate AI accuracy impact together with UX speed impact.
- Keep this as a final-product investigation, not a temporary workaround.

### Upload Draft Flow Architecture

Product need:

The Level 1 product goal is that even one uploaded video behaves like a proper
mobile app. The app should keep the rider informed during the pre-analysis
upload phase rather than making upload feel frozen. Long-lived local resume is
not currently reliable because selected `file://` videos may not remain
accessible after app restart.

Current decision:

Local Draft Resume is removed from the current Part 1 flow. The app keeps a
short-lived in-memory `UploadDraft` only while the Upload screen is open. Future
draft/resume behavior should be built around server-side upload sessions or
upload targets, not persisted local video URIs.

Current implementation:

- `UploadDraft` contains `draftId`, local video URI, file metadata, local
  thumbnail URI, timestamps, and `selected / ready_to_upload / uploading /
  upload_failed` status.
- Selecting a video creates a local draft and navigates to `UploadScreen`.
- Drafts are not persisted for app re-entry.
- App re-entry no longer prompts to resume a previous local draft.
- `UploadScreen` renders from the current selected video / in-memory draft.
- Upload progress is stage-based rather than fake percent-based.
- Upload success clears the draft.
- Upload failure stores `upload_failed` in memory and keeps retry possible while
  the screen is active.

Concept boundaries:

- Draft: the user's selected upload work in progress.
- Signed/direct upload: the technical method for sending a Draft's source video
  to Storage.
- Finalize endpoint: the server step that turns an uploaded Draft source into a
  Moment and AnalysisJob.
- Moment: the server-side object that exists only after upload is complete and
  the video is analysis-ready.

Recommended long-term flow:

```text
select video
-> create in-memory upload draft
-> keep UploadScreen open
-> show stage-based progress
-> signed/direct upload
-> finalize endpoint
-> Moment created
-> AnalysisJob created
-> Gemini analysis starts
```

Fallback flow:

```text
local draft
-> Render multipart /api/moments/from-source-video
-> Moment created
-> AnalysisJob created
-> Gemini analysis starts
```

Future multi-user assumptions:

Do not implement Auth/User now, but design Draft around future ownership:

- `draftId`: local app UUID.
- `uploadId`: server-issued upload target id.
- future `userId`: owner.
- `storagePath`: future user-scoped path.
- ownership: finalize must verify that the upload target belongs to the user.
- orphan cleanup: uploaded-but-not-finalized objects must expire or be removed.

Preferred path shape:

```text
users/{userId}/uploads/{uploadId}/source.mov
```

Remaining risks:

- local video URI persistence after app relaunch needs verification,
- Draft and remote Moment boundaries can become confusing,
- signed/direct upload and finalize need device QA,
- phase10 upload target tracking needs device QA before full confidence,
- orphan cleanup automation is still missing,
- retry behavior after `upload_failed` needs real-device QA.

Recommended order:

1. Device QA the local Draft flow without DB auto-reset.
2. Verify draft resume prompt after app restart.
3. Verify `upload_failed` retry behavior.
4. Collect upload timing data.
5. Verify phase10 tracking during direct upload QA.
6. Implement orphan cleanup.
7. Strengthen ownership during Auth/RLS work.

### 4. Analysis Timing and Quality Observation Data

Problem:

AI analysis time and quality vary. The project needs evidence before tuning
infrastructure, prompts, validators, or copy.

Record for real videos:

- video length
- file size
- queued -> started duration
- started -> completed duration
- AI candidate
- observed facts summary
- rider-expected trick/context
- whether result felt trustworthy
- whether push arrived
- whether restore felt immediate

Use this data to distinguish:

- Storage upload bottleneck
- Gemini file processing bottleneck
- Gemini inference bottleneck
- Render/backend bottleneck
- app restore/polling UX bottleneck

#### Upload Timing Log Collection Procedure

Purpose:

The next real-device upload QA should separate the time spent in client upload,
server-side Storage write, Moment creation, and AnalysisJob creation. Do not
guess the bottleneck from the total time alone.

Client log location:

```text
src/features/sessions/HomeScreen.tsx
```

Filter for:

```text
[upload_timing]
```

Expected client events:

- `upload_start`: emitted immediately before `createMomentFromSourceVideo`.
- `upload_success`: emitted after the server response resolves and before the
  Upload screen closes.
- `upload_failure`: emitted when the upload promise rejects or returns no stored
  Moment.

Client fields to record:

- `localSessionId`
- `fileSize`
- `elapsedMs`
- `momentId` if available
- `nextMomentStatus` if available
- failure `reason` if available

Server log location:

```text
dev-server/index.ts
```

Filter Render logs for:

```text
[source_video_timing]
```

Expected server events:

- `from_source_video_request_received`: request reached `/api/moments/from-source-video`.
- `multipart_file_received`: multer finished receiving the uploaded file.
- `storage_upload_completed`: Supabase Storage write completed.
- `moment_inserted`: `moments` row was created.
- `analysis_job_queued`: `analysis_jobs` row was created and linked to Storage input.
- `response_sent`: server response returned to the app.

Server fields to record:

- `elapsedMs`
- `fileSize`
- `mimeType`
- `storagePath`
- `momentId`
- `analysisJobId`

Derived measurements:

- Real app wait time: client `upload_success.elapsedMs`.
- Client-to-server transfer time: server `multipart_file_received.elapsedMs`.
- Storage save time: `storage_upload_completed.elapsedMs - multipart_file_received.elapsedMs`.
- Moment creation time: `moment_inserted.elapsedMs - storage_upload_completed.elapsedMs`.
- Job creation time: `analysis_job_queued.elapsedMs - moment_inserted.elapsedMs`.
- Server response overhead: `response_sent.elapsedMs - analysis_job_queued.elapsedMs`.

Build 23 QA timing note:

The first Build 23 real-device QA pass produced useful directional estimates,
but not final bottleneck proof. The tested video was about 18.25 MB and about 9
seconds long. User-perceived upload wait was about 5-8 seconds. DB timestamps
and user observation suggest:

- Upload start estimate to server file/storage flow entry: about 5.2 seconds.
- Server Storage/Moment creation work: about 3.9 seconds.
- Job queue/start: within roughly 1 second.
- Gemini `started_at -> completed_at`: about 50.7 seconds.
- Push was received after more than 1 minute and before 3 minutes by user
  perception.

This is enough to say the Build 23 Upload Overlay is acceptable for now. It is
not enough to add a progress bar, switch to direct upload, or redesign the
upload architecture. Before making those changes, collect the actual iPhone
`[upload_timing]` and Render Dashboard `[source_video_timing]` lines for the
same upload.

QA procedure:

1. Use a physical iPhone, not simulator upload, unless explicitly requested.
2. Upload one real wakeboard video.
3. Capture the app log lines containing `[upload_timing]`.
4. Capture Render log lines containing `[source_video_timing]` for the same
   upload.
5. Match logs by `momentId`, `analysisJobId`, approximate timestamp, and file
   size.
6. Record the derived measurements before changing upload architecture,
   progress UI, or server behavior.

Do not:

- infer progress percentages from these logs
- auto-clear DB rows before timing review
- use one single slow upload as enough evidence for architectural change

### 5. AI Calibration System

Problem:

Toeside/heelside, Back Roll, Tantrum, Basic Air, grab, and invert judgments
should not be tuned from one surprising result.

Decision:

Use sample-based calibration. Do not make emotional one-off prompt edits.

Calibration references:

- `docs/EVIDENCE_POSTPROCESSING_CALIBRATION_MATRIX.md`
- `docs/WAKEBOARD_TRICK_TAXONOMY_REFERENCE.md`
- `docs/WAKEBOARD_VALIDATION_MATRIX.md`

Rule:

Only repeated failure patterns across multiple real videos should become prompt,
schema, validator, or KnowledgeRule changes.

### 6. Legacy/Fallback Endpoint Cleanup

Current compatibility paths:

- `/api/moments`
- `/api/moments/:momentId/source-video`
- `/api/moments/:momentId/analyze-stored-video`
- direct multipart evidence upload fallback

Why they exist:

They supported earlier pipeline stages and provide fallback while the
source-video-first path is being validated.

Cleanup direction:

After the source-video-first path is proven stable, decide which endpoints are:

- retained for explicit retry/fallback
- made internal-only
- deprecated
- removed

Do not remove fallback until Build QA confirms uploads, restore, deletion,
push, and Storage cleanup are stable.

### 7. Thumbnail Storage Policy

Policy so far:

- Source video Storage is temporary durable analysis input, not permanent video
  archive storage.
- Local video URI is used for playback when available.
- If local video URI is unavailable, thumbnail plus analysis result is still a
  valid restored state.

Open decision:

Should thumbnails become cross-device preview assets with their own durable
storage policy?

Recommendation:

Treat thumbnail persistence separately from source video persistence. A
thumbnail is product presentation metadata; the source video is temporary AI
input unless the product later becomes a cloud video library.

### 8. Auth and User Model

Current state:

The app is personal/QA-oriented and effectively single-user. The backend uses a
default user pattern.

Future work:

- real user identity
- RLS and ownership rules
- device token ownership
- token cleanup
- account deletion implications
- multi-device data consistency

Do not overbuild this before the personal analysis loop is stable.

### 9. Push Deep Link

Current state:

Push notification opens the app.

Future work:

Push should eventually deep link to the completed Moment Detail:

```text
upload
-> app closed
-> analysis completed
-> push
-> tap
-> specific Moment Detail
```

Keep out of current scope unless the analysis loop is otherwise stable.

### 10. Background Upload

Current state:

The app tells the user not to close the app during source video upload.

Why:

Without OS-level background upload, the multipart request can be interrupted
when the app is killed or suspended.

Future option:

Investigate iOS background upload support if uploads become long or users
regularly close the app immediately.

Decision for now:

Use clear UX copy and source-video-first architecture. Background upload is a
long-term stability candidate, not the current MVP requirement.

## Current Do / Do Not

Do:

- keep source-video-first upload as the preferred path
- keep upload and analysis status distinct
- collect real timing and quality data
- preserve fallback paths until QA proves the new path

Do not:

- start AI Coach yet
- tune prompts from one clip
- treat Supabase Storage as permanent video library
- auto-clear QA data after every build
- hide architectural debt in chat only

## 2026-06-21 Upload-first Validation

Confirmed fact:

The source-video-first path is implemented and verified against operating Render
+ Supabase.

Default endpoint:

```text
POST /api/moments/from-source-video
```

Validation results:

- Fileless request returned HTTP 400: `video file is required`.
- Fileless request did not change `moments`, `analysis_jobs`, or
  `evidence_results` counts.
- Normal upload created a source object in Storage.
- Moment row was created only after the source upload succeeded.
- AnalysisJob row was created after the Moment row.
- Verified timestamp order:

```text
source_video_storage_uploaded_at
-> moment.created_at
-> analysis_jobs.queued_at
-> analysis_jobs.started_at
-> analysis_jobs.completed_at
```

- Completed analysis created an EvidenceResult.
- Successful analysis cleaned up the source object and set
  `source_video_storage_status=deleted`.

UX update:

- The Upload screen remains open until source video upload completes.
- During upload, the app says the video is being uploaded to the server and that
  the user should not close the app.
- Only after upload completion does the app move into analysis/queued state where
  the user may close the app.

QA policy reminder:

- Do not auto-clear DB data after preview/internal builds.
- Report DB counts only unless the Founder explicitly requests reset/deletion.
- Simulator upload is not part of default QA. Use simulator for UI/sync/delete
  checks; use physical iPhone for real upload, Push, quality, and calibration.

## 2026-06-21 Upload Close/Kill Interpretation

Observation:

The user force-closed the app immediately after starting an upload, but the
analysis still completed successfully.

Interpretation:

Do not classify this as a bug by itself. Two explanations are possible:

1. The source video upload had already completed before the app was terminated.
2. iOS briefly allowed the in-flight network request to finish after the user
   perceived the app as closed.

Product rule:

- If the app closes before source upload completion, analysis may not start.
- If source upload completes first, server-side analysis should continue even if
  the app closes.

Copy improvement candidate:

Current copy:

```text
이 단계에서는 앱을 닫지 마세요.
```

More precise copy candidates:

```text
업로드가 끝날 때까지 앱을 닫지 않는 것이 안전합니다.
업로드가 완료되면 분석은 서버에서 계속됩니다.
```

Follow-up TODO:

- Test app termination before and after source upload completion more deliberately.
- Refine upload-state copy so it communicates risk rather than absolute failure.
- Continue collecting analysis timing data.
- Continue AI Calibration only from repeated sample patterns.
- Revisit Moment Detail structure in a later UX phase.
- Add Push deep link later.
- Consider OS-level background upload as a long-term stability option.
