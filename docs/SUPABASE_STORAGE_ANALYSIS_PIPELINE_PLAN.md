# Supabase Storage Analysis Pipeline Plan

## Purpose

This document turns the durable analysis pipeline decision into an
implementation-ready plan for Supabase Storage.

It does not implement code, run migrations, create buckets, change
infrastructure, or modify environment variables.

## Problem

Build 8 confirmed that real Gemini Pro analysis works, but it also showed the
current async weakness:

```text
Moment row and AnalysisJob row can exist before the backend has durable access
to the video file.
```

The current pipeline is only durable after the app successfully sends the video
file to Render and Render finishes the in-process background task. If the app
closes, network fails, or the multipart evidence request never completes, the
queued job can remain in Supabase even though Render has no video payload to
process later.

## Current Upload Flow

### 1. Video Selection

The iOS app uses Expo image picker to select a local video asset.

The selected asset is represented as `SessionVideoAsset`:

```text
uri
fileName
fileSize
mimeType
duration
```

### 2. Local Thumbnail Generation

The app attempts local thumbnail generation first through
`expo-video-thumbnails`.

Current behavior:

```text
selected local video
-> local thumbnail extraction
-> fallback to Render thumbnail endpoint only if local generation fails
```

This thumbnail is display-oriented. It is not the video input for Gemini
analysis.

### 3. Moment Creation

`insertMoment(session, video)` calls Render `/api/moments`.

Render:

- inserts a `moments` row,
- stores file metadata such as name, size, mime type, and duration,
- creates an `analysis_jobs` row with `status = queued`,
- links `latest_analysis_job_id`,
- returns quickly.

### 4. Evidence Extraction Request

The app then calls `/api/extract-session-evidence` through
`queueSessionEvidenceExtractionWithGemini`.

This request sends the local video as multipart form data:

```text
FormData video field
-> Render memory upload
-> setImmediate background task
-> Gemini Evidence Extraction
```

### 5. Result Restore

When analysis completes:

- Render inserts `evidence_results`,
- updates `analysis_jobs`,
- updates `moments`,
- app polling/restore reads `/api/moments`,
- Rider-facing Summary displays the restored result.

## Current Failure Points

Stale or delayed queued jobs can happen when:

- `/api/moments` succeeds but `/api/extract-session-evidence` does not run,
- the app closes before the evidence upload finishes,
- network drops during multipart upload,
- Render restarts while the file buffer is only in process memory,
- rate limiting or request error prevents evidence upload,
- a queued row has file metadata but no retrievable media input.

The durable database state exists, but the durable video input does not.

## Supabase Storage Target Architecture

Target structure:

```text
iPhone app
-> upload video to Supabase Storage
-> store storage_path
-> create Moment
-> create AnalysisJob

Render
-> query queued AnalysisJob
-> read storage_path
-> download video from Supabase Storage
-> Gemini Evidence Extraction
-> evidence_results insert
-> moments latest_evidence_result_id update
-> app polling / restore
```

This changes the durable unit of work from:

```text
analysis_job_id only
```

to:

```text
analysis_job_id + storage_path
```

## Change Impact

## App Changes

### Upload Flow

The app will need a new storage upload step before analysis can be queued as
durable work.

Recommended MVP app flow:

```text
select video
-> create local thumbnail
-> request upload target from Render
-> upload video to Supabase Storage target
-> create Moment with storage_path and file metadata
-> show queued/processing UI
-> poll /api/moments
```

### Endpoint Usage

The app should stop depending on immediate multipart upload to
`/api/extract-session-evidence` for normal analysis.

It may keep the current endpoint temporarily for:

- local debugging,
- emergency fallback,
- migration period.

### Local Thumbnail

Local thumbnail generation can remain unchanged for MVP.

Do not block Supabase Storage adoption on thumbnail storage. The thumbnail is a
display feature, while source video storage is required for durable analysis.

Future option:

```text
Store generated thumbnails in Supabase Storage after source video durability is
working.
```

## Render Changes

### Upload Target Endpoint

Add an endpoint that creates a storage target for the app.

Possible contract:

```text
POST /api/video-upload-targets

input:
  fileName
  mimeType
  fileSize
  durationMs

output:
  bucket
  storagePath
  signedUploadUrl or uploadToken
```

For the no-auth personal MVP, Render can create a deterministic path and return
a signed upload URL. The app must not receive Supabase service-role credentials.

### Moment Creation

`POST /api/moments` should accept:

```text
source_video_storage_bucket
source_video_storage_path
source_video_storage_provider
```

or a compact equivalent.

### Analysis Job Creation

`analysis_jobs` should know where the video is.

Two possible designs:

1. Store video path on `moments`, and jobs read through `moment_id`.
2. Store video path snapshot on `analysis_jobs`.

MVP recommendation:

```text
moments.source_video_storage_path
analysis_jobs.input_video_storage_path
```

Reason:

- `moments` owns the source media identity,
- `analysis_jobs` owns the exact input used for this run,
- future reanalysis can refer to the same source or a derived clip.

### Worker

Render worker/API should:

```text
select queued job
-> claim processing
-> read input_video_storage_path
-> download video from Supabase Storage
-> call Gemini
-> persist EvidenceResult
-> update AnalysisJob and Moment
```

The worker can start inside the current Render Web Service for MVP. A separate
Render Background Worker can be evaluated later if in-process work becomes
unstable.

## Supabase Changes

### Storage Bucket

Create a private bucket for source videos.

Recommended bucket:

```text
moment-videos
```

Alternative:

```text
asj-moment-videos
```

Use one bucket first. Do not split by sport or environment until needed.

### Storage Path Convention

Recommended MVP path:

```text
users/{user_id}/moments/{moment_id}/source.{ext}
```

Examples:

```text
users/{user_id}/moments/{moment_id}/source.mov
users/{user_id}/moments/{moment_id}/source.mp4
```

If the app needs to upload before Moment creation, use a temporary upload id:

```text
users/{user_id}/uploads/{upload_id}/source.{ext}
```

Then move/copy or record that path when the Moment is created.

MVP recommendation:

```text
Create Moment first as upload_pending, then upload to:
users/{user_id}/moments/{moment_id}/source.{ext}
```

This keeps paths stable and easy to reason about.

## DB Schema Impact

Migration is likely required.

Phase 8 migration draft:

```text
supabase/phase8_storage_backed_analysis.sql
```

This migration is intentionally additive:

- nullable columns only,
- no enum type,
- no `not null`,
- no public Moment status expansion,
- legacy Moments and AnalysisJobs remain valid.

Recommended new `moments` columns:

```sql
source_video_storage_provider text
source_video_storage_bucket text
source_video_storage_path text
source_video_storage_uploaded_at timestamptz
source_video_storage_status text
```

Recommended `source_video_storage_status` values:

```text
pending
uploaded
missing
deleted
```

Recommended new `analysis_jobs` columns:

```sql
input_video_storage_bucket text
input_video_storage_path text
input_video_storage_provider text
```

Optional later columns:

```sql
input_video_bytes integer
input_video_mime_type text
input_video_checksum text
```

### Why Both Moment And Job May Need Storage Fields

Moment-level fields represent the canonical source video.

Job-level fields represent the exact input used for an analysis attempt.

This matters later for:

- retries,
- reanalysis,
- derived clips,
- future multi-stage pipelines,
- audit/debug.

### Status Constraints

The current `moments.status` values can remain:

```text
draft
queued
processing
completed
failed
archived
```

MVP can avoid adding a new public Moment status by using storage-specific
columns. If a new status is needed later, consider:

```text
uploading
upload_failed
```

But avoid expanding user-visible status too early.

## Security / RLS Minimum

### Current No-auth MVP

The current app does not have real user auth yet.

Minimum safe approach:

- private bucket,
- app never receives service-role key,
- Render creates signed upload URLs,
- Render writes Moment/Job rows with service role,
- Render downloads video with service role,
- signed URLs are short-lived,
- path includes server-owned `user_id` and `moment_id`.

### Later Auth-aware Model

When auth exists:

- private bucket remains,
- user can upload only to their own prefix,
- RLS/storage policies enforce ownership,
- Render still uses service role for analysis worker,
- signed download URLs are only created for authorized users.

### Do Not Do

Do not:

- make source video bucket public,
- store service-role keys in the app,
- use client-generated arbitrary paths without server validation,
- rely on local iPhone URI as a server-readable media reference.

## Phase 8 MVP Scope

The first implementation should be the smallest storage-backed analysis path
that proves durable input works.

Included in Phase 8 MVP:

- private `moment-videos` bucket,
- storage reference columns on `moments`,
- input storage reference columns on `analysis_jobs`,
- server-issued upload target/path,
- app uploads source video to Storage before analysis is queued,
- Render worker downloads video from Storage,
- current polling/restore flow remains,
- current local thumbnail flow remains.

Excluded from Phase 8 MVP:

- AI Coach,
- second AI API call,
- push notification,
- auth UI,
- public video playback,
- CDN delivery,
- permanent video archive product,
- thumbnail storage migration,
- S3/R2 migration,
- separate external queue.

## Bucket Creation

Supabase Storage buckets can be created through the Dashboard, client
libraries, or SQL. The Phase 8 migration draft includes an idempotent
`storage.buckets` insert for:

```text
bucket: moment-videos
public: false
file size limit: 20 MiB
allowed MIME types: video/mp4, video/quicktime, video/mov, video/x-m4v
```

Manual Dashboard creation is still acceptable if the team wants to avoid
executing bucket setup through SQL during the first rollout. If created
manually, match the same bucket name and keep it private.

Source:

```text
https://supabase.com/docs/guides/storage/buckets/creating-buckets
```

## Legacy Compatibility

Existing Moments and AnalysisJobs do not have storage paths.

The app and backend must support both generations:

```text
legacy row:
  no storage path
  may still depend on direct multipart evidence upload or completed evidence

phase8 row:
  storage path exists
  backend can retry from durable video input
```

During migration, do not assume every queued job is retryable. A queued job is
retryable only when it has an input storage path or the app can still upload
the local video.

## Minimum Implementation Path

### Phase 1: Schema Design

Use the Phase 8 migration draft:

```text
supabase/phase8_storage_backed_analysis.sql
```

Do not apply until reviewed.

### Phase 2: Bucket Setup Plan

Prepare a manual setup checklist:

- create private `moment-videos` bucket,
- confirm upload limit,
- confirm signed URL behavior,
- confirm service-role download path,
- document retention policy.

### Phase 3: Upload Target Endpoint

Add Render endpoint:

```text
POST /api/video-upload-targets
```

It should return a signed upload target and storage path.

### Phase 4: App Upload Step

Update app upload flow:

```text
select video
-> local thumbnail
-> create Moment or upload target
-> upload video to Storage
-> mark storage uploaded
-> queue analysis
```

### Phase 5: Worker Reads Storage

Change analysis processing:

```text
queued job
-> download storage object
-> Gemini Evidence Extraction
-> EvidenceResult
```

### Phase 6: Stale Job Rules

Add cleanup policy:

- queued with no storage path after grace period -> failed/abandoned,
- queued with storage path -> retryable,
- processing past timeout -> retryable or failed based on attempts.

### Phase 7: UX Alignment

Update UI copy/status after backend durability exists:

- upload pending,
- upload complete,
- analysis queued,
- analysis processing,
- completed,
- failed/retryable.

Do not over-design this before storage-backed jobs work.

## Recommended MVP Decision

Use Supabase Storage, private bucket, server-issued upload targets, and
storage-backed AnalysisJobs.

Keep the current direct multipart evidence endpoint only as a temporary
fallback/debug path during migration.

## Expected Difficulty

Medium.

The hard part is not one API call. The hard part is preserving correct state
across:

- app upload,
- storage upload,
- Moment creation,
- job creation,
- worker claim,
- Gemini processing,
- result restore,
- stale/retry cases.

This should be implemented in small phases.

## Risks

### Upload UX Complexity

Adding Storage introduces a real upload phase before analysis. The UI must not
make this feel like the app is stuck.

### Partial State

New failure states appear:

- storage upload succeeded but Moment creation failed,
- Moment exists but storage upload failed,
- storage exists but job was not queued,
- job queued but storage object missing,
- storage object deleted before retry.

### Cost / Retention

Source videos can become expensive if retained forever.

MVP needs a retention decision:

```text
keep source videos for QA period
or delete after analysis completes
or keep only user-favorited clips
```

### Privacy

Wakeboard videos are personal media. Buckets must stay private.

### Schema Compatibility

Existing Moments will not have storage paths. The app and backend must support
legacy rows.

### Worker Reliability

In-process Render worker may still be enough for MVP, but if volume grows or
long-running jobs become unstable, move worker processing to a separate Render
Background Worker.

## What Not To Implement Yet

Do not implement:

- public video sharing,
- CDN playback,
- permanent video archive product,
- multi-user auth-driven storage policies,
- push notification,
- separate queue service,
- S3/R2 migration,
- thumbnail storage migration,
- AI Coach.

## Source Notes

The recommendation is based on current project architecture and official
provider documentation:

- Supabase Storage/pricing documentation indicates Storage is part of the
  existing Supabase platform and bills by storage/egress beyond plan quotas.
- AWS S3 pricing is usage-based across storage, requests, retrieval, and data
  transfer.
- Cloudflare R2 charges by stored data and operations and does not charge
  egress bandwidth for standard storage.
- Render local filesystem is ephemeral by default; persistent disks exist but
  are attached to paid services and are not a good object-store replacement for
  this product.
