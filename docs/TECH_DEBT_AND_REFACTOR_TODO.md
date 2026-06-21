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

1. Upload completion before Moment creation.
2. Upload state and analysis state separation.

### Later UX Stage

3. Moment Detail screen structure.
9. Push notification deep link.

### Calibration Stage

4. Analysis timing and quality observation data.
5. AI calibration system.

### Stabilization Cleanup

6. Legacy/fallback endpoint cleanup.
7. Thumbnail storage policy.

### Multi-user / Product Stage

8. Auth and user model.

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
