# Durable Analysis Pipeline Plan

## Purpose

This document evaluates whether Action Sports Journal needs durable video
input storage to make the analysis pipeline reliable.

Important product decision:

Action Sports Journal is not a permanent source-video archive. The purpose of
video input storage is analysis reliability, not long-term video hosting. The
source video should be treated as temporary durable input that allows Render to
finish or retry Gemini Evidence Extraction after the app upload phase.

It is a design document only. It does not create infrastructure, change code,
add migrations, or modify environment variables.

## Problem

Build 8 proves that the current Render + Supabase + Gemini Pro analysis flow can
work:

```text
iPhone app
-> Render backend
-> Supabase Moment / AnalysisJob
-> Gemini Evidence Extraction
-> EvidenceResult
-> app polling / restore
```

But the current implementation is not fully durable.

Today the backend can only analyze a video after the app sends the video file
directly to Render through `/api/extract-session-evidence`. The queued
`analysis_jobs` row is durable, but the video payload is not.

That creates this failure mode:

```text
Moment row created
-> AnalysisJob row queued
-> app closes, network fails, rate limit happens, or file upload request does
   not complete
-> queued job remains
-> backend cannot independently process it because it has no durable video file
```

From the user's perspective this can look like:

```text
upload
-> analyzing
-> app restart
-> still analyzing
-> later maybe completed, maybe stuck
```

This is not an AI quality issue. It is a pipeline durability issue.

## Why It Matters

Action Sports Journal is currently in the AI Analysis Product Completion stage.

Before coaching, the user needs to trust:

```text
upload
-> async processing
-> analysis completed
-> result restored
-> result understood
```

If a queued job can exist without a retrievable video, the system cannot
guarantee that async analysis will eventually finish.

The product can tolerate Gemini taking time. It should not make the user wonder
whether the app broke.

## Current Pipeline

### App Upload Flow

The app currently derives backend endpoints from:

```text
EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT
```

The app creates a Moment through the Render `/api/moments` endpoint and sends
video evidence through the Render `/api/extract-session-evidence` endpoint.

### Moment Creation

`POST /api/moments`:

- inserts a `moments` row,
- inserts an `analysis_jobs` row with `status = queued`,
- links `latest_analysis_job_id`,
- returns quickly.

The Moment and job records are durable in Supabase.

### Evidence Extraction Request

`POST /api/extract-session-evidence`:

- receives the multipart video file,
- finds or creates a queued evidence job for the Moment,
- passes the received file buffer into an in-process background task,
- returns `202`,
- the server process calls Gemini and updates Supabase.

This makes the API feel async to the app, but the video itself is only available
inside the request/server process that received it.

### Render Endpoint

Render currently acts as:

- API server,
- analysis job runner,
- Gemini gateway,
- Supabase service-role writer.

It is not yet a durable worker that can later fetch a stored video by path.

### Supabase Restore

Supabase stores:

- `moments`,
- `analysis_jobs`,
- `evidence_results`.

The app can restore completed results from Supabase. This part is durable.

### Stale Queued Risk

Stale queued jobs can occur when:

- Moment creation succeeds but evidence upload fails,
- app is closed before the evidence request completes,
- network drops during multipart upload,
- Render restarts after receiving the request but before processing finishes,
- rate limit or request error leaves the Moment queued,
- an old queued job has file metadata but no runnable video payload.

The current app can hide only the narrowest incomplete queued rows with no file
metadata. It cannot solve queued rows that look like real files but have no
durable media available to the backend.

## Core Questions

### Can the current structure alone become stable durable async?

No, not fully.

It can be improved with better retry, cleanup, polling, and user messaging, but
those changes cannot make the backend analyze a video it cannot retrieve.

### Can this be solved without video storage?

Only partially.

Without video storage, the app can:

- retry failed upload requests,
- keep local pending upload state,
- show better progress UI,
- mark stale queued jobs as abandoned,
- allow user-initiated retry while the local video is still available.

But the server cannot independently retry after the app is gone.

### Is video storage effectively required?

Yes, for a real durable analysis pipeline.

The durable unit of work cannot just be:

```text
analysis_jobs.id
```

It must include a durable media reference:

```text
analysis_jobs.id
+ storage_path
```

or:

```text
moments.source_video_storage_path
```

### Why temporary input storage is required

Gemini needs access to the actual video bytes. If the app is closed and the
server has no stored copy or retrievable URL, there is nothing to analyze.

Durable async requires:

```text
job record
+ retrievable input
+ retryable worker
+ durable output
```

The project already has durable job records and durable outputs. It is missing
the durable input.

This does not mean the product should keep source videos forever. The durable
input only needs to survive long enough for analysis to complete, fail safely,
or be retried within the MVP retention window.

## Options

## Option 1: Supabase Storage

### Summary

Use Supabase Storage as the first temporary durable analysis-input store. The
app uploads the source video to a private bucket, then Render processes jobs by
reading the stored object.

### Implementation Difficulty

Medium.

The project already uses Supabase for Moment, AnalysisJob, and EvidenceResult
state. Adding Storage keeps the product data model in one platform, but upload
and signed URL policies still need careful work.

### Cost

Good for MVP if video volume is low. Storage and bandwidth can grow with video
size, so retention policy matters.

### Expo / iOS Fit

Good.

Expo can upload files to signed URLs or to a backend endpoint that creates a
signed upload target. The app should not receive service-role credentials.

### Render Backend Fit

Good.

Render already has the Supabase service-role key and can download objects
server-side for Gemini processing.

### Supabase Consistency

Strong.

The same platform would own:

- Moment rows,
- AnalysisJob rows,
- EvidenceResult rows,
- temporary source video input objects.

### Security / RLS / Permissions

Manageable but important.

For the current no-auth personal MVP, server-mediated upload is simplest. Later,
with auth, use private buckets, signed upload URLs, and RLS/storage policies.

### MVP Fit

Best fit.

It solves the durable input problem without introducing another vendor.

### Long-term Fit

Good enough until video volume, cost, CDN needs, or multi-region performance
become important.

## Option 2: AWS S3

### Summary

Use S3 as the durable media store.

### Implementation Difficulty

Medium to high.

S3 is mature, but it adds AWS credentials, bucket policy, signed URL logic,
region choices, and another operational surface.

### Cost

Potentially efficient at scale, but not the lowest-friction option for a single
developer MVP.

### Expo / iOS Fit

Good with presigned upload URLs.

### Render Backend Fit

Good.

Render can use AWS SDK or signed URLs to fetch video.

### Supabase Consistency

Medium.

Database state remains in Supabase while video lives in AWS. That is normal at
scale, but it is extra complexity now.

### Security / RLS / Permissions

Strong but more manual.

IAM policy needs to be correct. Mistakes can expose media or block processing.

### MVP Fit

Not recommended for the immediate MVP unless Supabase Storage is blocked.

### Long-term Fit

Strong.

S3 is a good long-term option if the product grows into serious video volume or
needs mature storage lifecycle policies.

## Option 3: Cloudflare R2

### Summary

Use R2 as S3-compatible object storage.

### Implementation Difficulty

Medium.

It has S3-compatible APIs, but still adds another vendor and upload/signing
surface.

### Cost

Attractive for bandwidth-sensitive products, especially later. For this MVP,
complexity matters more than optimizing storage economics.

### Expo / iOS Fit

Good through signed URLs or backend-mediated upload.

### Render Backend Fit

Good with S3-compatible client configuration.

### Supabase Consistency

Medium.

Product state stays in Supabase, objects live in R2.

### Security / RLS / Permissions

Good but separate from Supabase auth/RLS. Permissions must be designed outside
the existing data model.

### MVP Fit

Possible, but not first choice.

### Long-term Fit

Good if bandwidth cost becomes a major concern.

## Option 4: Render Disk / Temporary Local Storage

### Summary

Store uploaded video on Render local disk or temporary filesystem.

### Implementation Difficulty

Low to medium.

The code could save the multipart file before launching a background task.

### Cost

Low initially.

### Expo / iOS Fit

No change from current upload path.

### Render Backend Fit

Partial.

It only works as long as the same Render instance retains the file and the
process/disk survives.

### Supabase Consistency

Weak.

The database would say a job is queued, but the actual file might exist only on
a transient machine.

### Security / RLS / Permissions

Simpler than public object storage, but retention/cleanup and instance
durability become hidden risks.

### MVP Fit

Not recommended as a durable solution.

It can reduce immediate request fragility, but it does not solve true retry
after restart or instance replacement.

### Long-term Fit

Poor.

## Option 5: Current Structure + Retry / Cleanup Only

### Summary

Keep the direct app-to-Render multipart upload flow and add:

- better app retry,
- clearer progress UI,
- stale queued cleanup,
- manual retry,
- timeout rules.

### Implementation Difficulty

Low.

### Cost

Lowest.

### Expo / iOS Fit

Good.

### Render Backend Fit

Good.

### Supabase Consistency

Medium.

It can keep DB state cleaner, but cannot make queued jobs independently
processable.

### Security / RLS / Permissions

Simple.

### MVP Fit

Good only as a temporary hardening step.

### Long-term Fit

Insufficient.

It does not solve the durable input problem.

## Recommendation

## MVP Recommendation

Use Supabase Storage when the project is ready to make analysis durability a
product priority.

Storage policy:

- local video URI remains the preferred playback source when it is available on
  the device,
- Supabase Storage source video is for Gemini/worker input, not default app
  playback,
- after analysis completes, the source object should be eligible for deletion
  immediately or after a short QA retention window,
- long-term source-video archive behavior is not part of the default product
  policy.

Recommended MVP architecture:

```text
iPhone app
-> request upload target from Render
-> upload video to private Supabase Storage bucket
-> Render creates / updates Moment
-> Render creates AnalysisJob with storage_path
-> Render worker claims queued job
-> Render downloads video from Supabase Storage
-> Gemini Evidence Extraction
-> evidence_results insert
-> moments latest_evidence_result_id update
-> app polling / restore
-> later: push notification
```

Why Supabase Storage first:

- the project already uses Supabase as the durable source of truth,
- it keeps Moment, Job, Evidence, and media references in one mental model,
- it is likely the fastest reliable path for a single-developer MVP,
- it avoids adding AWS/R2 complexity before product need proves it,
- it directly solves the current missing durable input problem.

## Long-term Recommendation

Stay with Supabase Storage until one of these becomes true:

- storage/bandwidth cost becomes clearly painful,
- video delivery/CDN needs become important,
- lifecycle policies become complex,
- multi-sport/multi-user video volume grows materially,
- the project needs advanced object storage operations.

Then evaluate AWS S3 or Cloudflare R2.

## What Not To Do Now

Do not:

- add S3 or R2 before Supabase Storage is proven insufficient,
- rely on Render temporary disk as the durable source of video truth,
- implement push notifications before the durable analysis input exists,
- add a full external queue before the basic storage-backed worker is designed,
- start with complex auth/RLS unless the product is ready for login,
- keep tuning AI prompts to solve what is actually a job durability problem.

## Decision Criteria Before Implementation

Before implementing storage, decide:

1. Should the app upload directly to Supabase Storage through signed URLs, or
   should Render receive and forward the upload?
2. What is the private bucket name?
3. What is the storage path convention?
4. How long should source videos be retained during MVP?
5. Should local thumbnails remain local, or should generated thumbnails also be
   stored?
6. What stale queued timeout should mark a job abandoned or failed?
7. Should a failed job be retryable only while the source video exists?
8. Should old test videos be deleted manually or through lifecycle rules?

Default product answer:

Source videos are temporary inputs. The MVP may choose either:

```text
analysis completed -> delete source object
```

or:

```text
analysis completed -> keep briefly for QA/retry -> delete source object
```

Permanent source-video retention should require a separate product decision.
If reanalysis is needed after deletion, the rider may need to upload/select the
original video again.

## Proposed Minimal Implementation Order

1. Add storage design fields to the data model proposal.
2. Create a private Supabase Storage bucket in a controlled setup step.
3. Add a server endpoint to create an upload target/path.
4. Update the app upload flow:
   - upload video to storage,
   - create Moment with `storage_path`,
   - create AnalysisJob.
5. Update Render worker:
   - claim queued job,
   - download video by `storage_path`,
   - call Gemini,
   - persist EvidenceResult.
6. Add stale queued cleanup:
   - no storage path after grace period -> abandoned/failed,
   - storage path exists but processing fails -> retryable failed state.
7. Keep polling first.
8. Add push notification later.

## Current Decision

Storage is not required to continue calibration QA today.

Storage is required before the product can honestly claim durable async
analysis.

The immediate next step should be:

```text
Complete real-video calibration QA
-> decide whether Analysis Progress UX or durable video storage is the next
   implementation priority
```

If more stuck queued jobs appear during QA, Supabase Storage should move from
"next architecture step" to "near-term product infrastructure."
