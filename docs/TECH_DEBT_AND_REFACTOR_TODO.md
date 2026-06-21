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
Screen structure includes reducing Home-owned modal/conditional rendering and
evaluating UploadScreen, MomentDetailScreen, React Navigation, or Expo Router.
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

### Signed / Direct Upload Architecture

Current judgment:

The current Render multipart relay is working for Build 23 QA. The app uploads
to:

```text
app
-> Render POST /api/moments/from-source-video multipart
-> Render receives file
-> Render uploads to Supabase Storage
-> Moment created
-> AnalysisJob created
-> Gemini analysis
```

Build 23 real-device QA validated the surrounding product flow:

- upload-first structure works,
- blocking Upload Overlay felt natural,
- Push was received,
- completed result restore worked,
- about 18.25 MB / 9 second video produced a perceived upload wait of about
  5-8 seconds.

Decision:

Do not implement signed/direct upload immediately. Keep the current path for
Build 23 QA and collect more timing data first. However, because video upload
is the product's core action, signed/direct upload remains a P1 architecture
backlog item.

Long-term recommended shape:

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

Required design before implementation:

- finalize endpoint,
- orphan object cleanup for uploaded-but-not-finalized files,
- user ownership and path validation,
- file size and content type limits,
- signed URL/token expiry behavior,
- Auth/RLS-backed Storage policy when the project moves beyond single-user QA.

Switching criteria:

Revisit signed/direct upload if any of these repeat:

- 25-50 MB+ videos become common,
- upload wait is frequently over 10 seconds,
- Render memory or bandwidth becomes a bottleneck,
- upload failures increase,
- progress percentage becomes product-critical,
- multi-user or concurrent upload QA starts.

Recommended order:

1. Continue Build 23 QA.
2. Collect 5-10 paired iPhone `[upload_timing]` and Render
   `[source_video_timing]` samples.
3. Compare upload time by file size.
4. Finalize signed/direct upload design only after repeated evidence.
5. Implement `POST /api/video-upload-targets` and
   `POST /api/moments/from-uploaded-source` if the criteria are met.

### Draft Upload Flow Architecture

Product need:

The Level 1 product goal is that even one uploaded video behaves like a proper
mobile app. Draft Upload Flow is closer to Instagram/TikTok-style mobile upload
UX than the current one-shot picker -> upload button flow. A rider should be
able to select a video, leave the app, and later choose whether to continue the
previous upload work or start a new one.

Current decision:

Do not implement Draft Upload Flow immediately. Build 23 upload-first behavior,
blocking overlay, restore, and Push should remain the active QA focus. Keep
Draft Upload Flow as a P1 structure backlog item.

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
-> create local draft
-> app can close
-> app re-entry offers continue previous draft / start new
-> request upload target
-> signed/direct upload
-> finalize endpoint
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

Risks if implemented too early:

- increases `HomeScreen` complexity,
- may add more conditional rendering before UploadScreen exists,
- local video URI persistence after app relaunch needs verification,
- Draft and remote Moment boundaries can become confusing,
- could destabilize the just-validated upload-first path.

Recommended order:

1. Continue Build 23 QA.
2. Collect upload timing data.
3. Clarify UploadScreen / DetailScreen structure.
4. Finalize Draft Upload Flow design.
5. Implement local-only Draft persistence.
6. Implement signed/direct upload and finalize endpoint.
7. Implement orphan cleanup.
8. Strengthen ownership during Auth/RLS work.

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
