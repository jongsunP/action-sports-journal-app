# Stale Queued Moment Cleanup

Date: 2026-06-17

Purpose:

Define and implement the MVP handling for incomplete queued Moment rows that can
appear in the app after an interrupted upload/create flow.

This document covers design and MVP behavior. It does not authorize DB deletion,
migrations, or server-side cleanup in this step.

## Problem

Observed recent behavior:

- The user intentionally uploaded/analyzed 2 videos.
- The database created 3 Moment rows.
- One extra row had:
  - `status = queued`
  - `file_name = null`
  - `file_size = 0`
  - `duration_ms = 0`
  - no `source_video_uri`
  - `latest_evidence_result_id = null`
  - linked `analysis_jobs.status = queued`
  - `analysis_jobs.attempts = 0`

User-facing impact:

The app may show this as a normal "waiting" Moment even though there is no
usable video payload and no evidence result. It looks like a video the user did
not intentionally upload.

## Current Flow

Current creation flow:

```text
App creates local Session
-> POST /api/moments
-> server inserts moments row
-> server creates analysis_jobs row with queued status
-> app uploads video to evidence endpoint
-> server processes evidence and updates Moment/job/result
```

If the flow stops after `POST /api/moments` but before the evidence upload, a
durable queued row can remain.

Relevant files:

- `dev-server/index.ts`
  - `POST /api/moments`
  - `createQueuedEvidenceAnalysisJob`
  - `getOrCreateQueuedEvidenceAnalysisJob`
- `src/services/moments/supabaseMoments.ts`
  - `insertMoment`
  - `listMoments`
  - `normalizeRemoteMoment`
- `src/features/sessions/HomeScreen.tsx`
  - remote Moment sync/merge into Home state

## Definitions

### Normal Queued Moment

A queued Moment can be valid if it still has enough identity to represent a real
video attempt:

- has `source_video_uri`, or
- has `file_name`, or
- has positive `file_size`, or
- has positive `duration_ms`.

Even if it is old, MVP should not hide it automatically yet, because it may be a
real upload that needs retry/status handling.

### Incomplete Queued Moment

For MVP, a queued Moment is considered incomplete only when all of these are
true:

```text
status = queued
latest evidence result is missing
source video uri is missing
file name is missing
file size is missing or <= 0
duration is missing or <= 0
```

This is intentionally strict. It targets rows that have no meaningful video
metadata at all.

### Stale Queued Moment

A stale queued Moment is broader:

```text
status = queued
latest evidence result is missing
created_at older than grace period
job attempts = 0 or job never started
```

MVP does not implement this broader server cleanup because it needs job metadata
and a clear grace-period policy.

## Grace Period

For the MVP app-side filter, no time grace period is required for the narrow
incomplete condition.

Reason:

If a queued row has no video URI, no file name, no positive file size, no
positive duration, and no evidence result, the app cannot do anything useful
with it as a normal Moment.

For future server cleanup, use a grace period:

- 10 minutes minimum before marking queued jobs failed/abandoned.
- Longer if uploads may happen on slow mobile networks.

## MVP Behavior

MVP implementation:

- Do not delete DB rows.
- Do not mutate remote status.
- Do not add migrations.
- Do not implement server cleanup.
- In `listMoments()` restore path, return `null` for incomplete queued Moments.
- The row remains in Supabase for audit/debug.
- The row does not enter HomeScreen's normal Moment list.

This keeps the product UI clean while preserving the data for investigation.

## App Hiding Criteria

Use this exact conservative condition:

```text
moment.status === queued
AND latestEvidenceResult is absent
AND sourceVideoUri is absent
AND fileName is absent
AND fileSize is not positive
AND durationMs is not positive
```

Do not hide:

- `processing` rows,
- `completed` rows,
- `failed` rows,
- queued rows with any video identity,
- queued rows with evidence,
- queued rows with positive file size or duration.

## Failed / Abandoned Status Policy

MVP:

- Do not change status.

Future server cleanup:

- Prefer `failed` if the current enum remains:
  - `analysis_jobs.status = failed`
  - `moments.status = failed`
  - `analysis_jobs.last_error = stale queued job: video payload was not received`
- Consider adding `abandoned` later only if the domain model needs a distinct
  non-error upload-cancelled state.

Recommendation:

Do not silently delete rows. Failed/abandoned cleanup should be auditable.

## Server Cleanup Recommendation

Not implemented in MVP.

Future options:

1. Token-guarded debug endpoint:
   - scans stale queued jobs,
   - marks them failed,
   - returns count and row ids.

2. Lightweight cleanup during `GET /api/moments`:
   - only if it remains fast and safe.

3. Scheduled cleanup:
   - later, if infrastructure grows.

Preferred first server cleanup:

```text
POST /debug/cleanup/stale-queued-moments
```

Guard it with `DEBUG_CAPTURE_TOKEN` or a separate admin token.

## Validation Plan

Use the known incomplete row:

```text
status = queued
file_name = null
file_size = 0
duration_ms = 0
source_video_uri missing
latest_evidence_result_id = null
```

Expected:

- DB row remains untouched.
- `/api/moments` may still return it.
- `listMoments()` filters it out.
- HomeScreen does not render it as a normal Moment after remote restore.

Also verify:

- queued rows with real file metadata still restore.
- completed rows still restore.
- failed rows still restore.

## Risks

- If a platform returns file metadata late, this filter could hide a Moment before
  retry. The current condition is narrow enough to reduce that risk.
- The hidden row still exists in DB, so developer tools should eventually expose
  it for cleanup.
- This does not solve old queued rows with file metadata but no runnable payload.
  That needs server/job cleanup design.

## Next Steps

1. Implement the app-side filter in `normalizeRemoteMoment`.
2. Verify typecheck and `git diff --check`.
3. Verify the known incomplete queued row is hidden by local normalization logic.
4. Later, implement server-side stale cleanup as a separate task.
