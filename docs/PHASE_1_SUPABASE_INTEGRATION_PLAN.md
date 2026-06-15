# Phase 1 Supabase Integration Plan

## Purpose

This document is a pre-implementation checklist for Phase 1 Supabase
integration.

Goal:

```text
Prepare Supabase Project, Postgres, Auth, Storage, initial tables, and RLS
strategy before writing application code.
```

This document does not authorize implementation by itself.

Do not change app code, server code, auth flow, or storage behavior until the
user explicitly asks for implementation.

## Scope

Included in Phase 1 planning:

- Supabase Project creation.
- Required service checklist.
- Initial table checklist:
  - `users`
  - `moments`
  - `analysis_jobs`
  - `evidence_results`
- RLS strategy.
- Impacted app areas.
- Minimum implementation order.

Not included in Phase 1:

- Login UI.
- Production video upload.
- Push notifications.
- Background queue implementation.
- Supabase Realtime subscription.
- Scoring.
- Coaching expansion.
- OpenAI benchmark integration.

## Current Baseline

Current app state:

- Expo React Native app.
- Local-first data through AsyncStorage.
- Moment is currently a product/UI concept.
- Wakeboard Evidence Extraction MVP is active.
- Moment status is currently derived from local request state and
  `GeminiEvidenceResult.status`.
- Existing backend is Render-hosted Node/Express.
- Gemini API keys are server-side only.
- No production database exists.
- No auth exists.
- No storage bucket exists.
- No durable background job queue exists.

Phase 1 must preserve this baseline until persistence is intentionally wired.

## 1. Supabase Project Creation Procedure

### Step 1: Create Project

Create a new Supabase project for Action Sports Journal.

Recommended naming:

```text
action-sports-journal
```

Recommended environment split later:

```text
action-sports-journal-dev
action-sports-journal-prod
```

For Phase 1, one development project is enough.

### Step 2: Record Project Metadata

Record these values in local secure notes or `.env.local` only:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Rules:

- Do not commit keys.
- `SUPABASE_SERVICE_ROLE_KEY` must never be shipped to the mobile app.
- Mobile app may eventually use `SUPABASE_ANON_KEY`, but not before RLS is
  ready.
- Render backend may use service role key only through server-side env vars.

### Step 3: Confirm Region

Choose the region closest to the expected user location when possible.

Phase 1 decision:

```text
Prefer low latency for Korea/Japan mobile usage if available.
```

If the available region choice is unclear, choose the closest stable region and
record it in the eventual infra handoff.

### Step 4: Confirm Project Defaults

Before creating tables:

- Confirm database is reachable from Supabase SQL editor.
- Confirm project API URL is visible.
- Confirm anon key and service role key exist.
- Confirm Auth is enabled.
- Confirm Storage is available but has no public bucket by default.

## 2. Required Services

### Postgres

Required in Phase 1.

Purpose:

- Durable Moment state.
- Durable AnalysisJob state.
- Durable EvidenceResult history.
- Future Session and progression queries.

Phase 1 Postgres work:

- Create initial tables.
- Add indexes.
- Draft constraints.
- Enable RLS.
- Avoid adding stored procedures unless needed.

### Auth

Required as a prepared service, but not necessarily exposed in the app during
Phase 1.

Purpose:

- Map cloud records to a durable user.
- Enable per-user RLS.
- Prepare future multi-device state.

Phase 1 Auth work:

- Enable Supabase Auth.
- Decide first auth provider later.
- Use `auth.users.id` as the root external identity.
- Create app-level `users` table mapping.

Recommended first auth options later:

1. Apple login for iOS-first app.
2. Email magic link for lowest-friction testing.
3. Email/password only if necessary.

Do not start with phone auth in Phase 1.

### Storage

Required as a prepared service, but not necessarily used immediately.

Purpose:

- Future source videos.
- Future thumbnails.
- Future derived clips.
- Optional debug artifacts if explicitly approved.

Phase 1 Storage work:

- Plan bucket structure.
- Do not upload production videos yet.
- Do not expose public video URLs.
- Keep buckets private by default.
- Draft RLS/storage policy strategy.

Recommended future bucket:

```text
moment-media
```

Recommended future paths:

```text
users/{user_id}/moments/{moment_id}/source.{ext}
users/{user_id}/moments/{moment_id}/thumbnail.jpg
users/{user_id}/moments/{moment_id}/derived/{artifact_id}.{ext}
```

## 3. Initial Tables

Phase 1 should create only the minimum durable model needed for the AI-first
Moment loop.

### `users`

Purpose:

App-level user profile row mapped to Supabase Auth.

Required columns:

```sql
id uuid primary key
auth_user_id uuid unique not null
display_name text
email text
locale text default 'ko-KR'
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Notes:

- `auth_user_id` should map to `auth.users.id`.
- Do not store private credentials.
- Keep profile fields minimal.

### `moments`

Purpose:

Core product entity.

Required columns:

```sql
id uuid primary key
user_id uuid not null references users(id)
session_id uuid null
activity_group_id text not null default 'wakeboard'
title text not null
notes text
status text not null default 'draft'
source text not null default 'user_selected_video'
occurred_at timestamptz not null
source_video_uri text
thumbnail_uri text
duration_ms integer
file_name text
mime_type text
file_size integer
start_seconds numeric
end_seconds numeric
takeoff_seconds numeric
representative_frame_seconds numeric
intended_trick text
user_confirmed_trick text
latest_evidence_result_id uuid
latest_analysis_job_id uuid
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Recommended status values:

```text
draft
processing
completed
failed
archived
```

Phase 1 decision:

Allow `session_id` to be nullable until Session becomes a durable DB entity.

Recommended indexes:

```sql
create index moments_user_occurred_at_idx on moments (user_id, occurred_at desc);
create index moments_status_idx on moments (status);
create index moments_latest_analysis_job_idx on moments (latest_analysis_job_id);
```

### `analysis_jobs`

Purpose:

Durable work record for AI analysis.

Required columns:

```sql
id uuid primary key
user_id uuid not null references users(id)
moment_id uuid not null references moments(id)
kind text not null
status text not null default 'queued'
provider text not null
model text
attempts integer not null default 0
max_attempts integer not null default 2
last_error text
queued_at timestamptz not null default now()
started_at timestamptz
completed_at timestamptz
failed_at timestamptz
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Recommended `kind` values:

```text
evidence_extraction
coaching
benchmark
```

Phase 1 active kind:

```text
evidence_extraction
```

Recommended `status` values:

```text
queued
processing
completed
failed
cancelled
```

Recommended indexes:

```sql
create index analysis_jobs_status_queued_at_idx on analysis_jobs (status, queued_at);
create index analysis_jobs_moment_idx on analysis_jobs (moment_id);
create index analysis_jobs_user_created_at_idx on analysis_jobs (user_id, created_at desc);
```

### `evidence_results`

Purpose:

Durable output of Gemini evidence extraction.

Required columns:

```sql
id uuid primary key
user_id uuid not null references users(id)
moment_id uuid not null references moments(id)
analysis_job_id uuid not null references analysis_jobs(id)
provider text not null default 'gemini'
model text
status text not null
quality_mode text
predicted_trick text
family text
confidence text
needs_review boolean not null default false
consistency_status text
consistency_warnings jsonb not null default '[]'
approach_observed_facts jsonb
inversion_observed_facts jsonb
temporal_windows jsonb
evidence_windows jsonb
observations jsonb
raw_response_text text
error_message text
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Recommended status values:

```text
completed
failed
```

Recommended indexes:

```sql
create index evidence_results_moment_created_at_idx on evidence_results (moment_id, created_at desc);
create index evidence_results_user_created_at_idx on evidence_results (user_id, created_at desc);
create index evidence_results_needs_review_idx on evidence_results (needs_review);
```

## 4. RLS Strategy

RLS must be part of Phase 1 planning before the mobile app reads or writes
directly to Supabase.

### Core Principle

Every app-owned table should include `user_id`.

Every user-facing policy should restrict access to rows owned by the current
authenticated user.

### User Mapping

Supabase Auth identity:

```text
auth.uid()
```

App user row:

```text
users.auth_user_id = auth.uid()
```

Recommended helper concept:

```text
current app user id = users.id where users.auth_user_id = auth.uid()
```

### Table Policy Direction

`users`

- User can select own app user row.
- User can update limited profile fields on own row.
- Insert should be controlled by server or signup trigger later.

`moments`

- User can select own Moments.
- User can insert own Moments only after auth flow is ready.
- User can update own Moment metadata.
- User should not set arbitrary `latest_evidence_result_id` unless server
  validates ownership.

`analysis_jobs`

- User can select own jobs.
- User may create an `evidence_extraction` job for own Moment.
- User should not directly mark jobs as completed or failed.
- Worker/server should update job status.

`evidence_results`

- User can select own EvidenceResults.
- User should not insert or update EvidenceResults directly.
- Worker/server writes EvidenceResults.

### Phase 1 RLS Posture

Recommended safest Phase 1 posture:

```text
Mobile direct writes: disabled
Server-side writes: allowed with service role
Mobile direct reads: disabled until auth UI exists
```

This means Phase 1 can safely create schema before exposing anything to the app.

### Later RLS Expansion

When app integration begins:

1. Enable Auth.
2. Create app user row.
3. Allow authenticated user to select own rows.
4. Allow Moment insert only for own `user_id`.
5. Keep EvidenceResult writes server-only.
6. Keep Storage private with signed URLs.

## 5. Current App Impact

Phase 1 should not change current app behavior.

Areas that will be affected in later implementation:

### `HomeScreen.tsx`

Current:

- Reads local Sessions.
- Derives Moment-like feed from Session.
- Stores local evidence by Session ID.
- Derives processing/completed/failed status locally.

Future:

- Read Moments from API or Supabase-backed backend.
- Render `Moment.status`.
- Show latest EvidenceResult by `moment.latest_evidence_result_id`.
- Create AnalysisJob through API.

### `src/types/index.ts`

Current:

- `Session` is still the core local entity.
- `MomentStatus` exists but Moment is not yet a durable type.
- `GeminiEvidenceResult` acts as local evidence result shape.

Future:

- Add durable `Moment`.
- Add `AnalysisJob`.
- Add `EvidenceResult`.
- Keep `GeminiEvidenceResult` as API normalization or migrate into
  `EvidenceResult`.

### `src/services/ai/analyzeSessionVideo.ts`

Current:

- Calls server endpoint directly for evidence extraction.
- Derives `/api/extract-session-evidence` from analysis endpoint.

Future:

- Should not call Gemini evidence endpoint directly from a Moment screen.
- Should create an AnalysisJob or call a BFF endpoint that creates one.
- Should poll/read job and EvidenceResult status.

### `dev-server/index.ts`

Current:

- Synchronously handles video upload and Gemini evidence extraction.
- Keeps evidence capture artifact behavior.

Future:

- Can become worker/API hybrid.
- Should create or process AnalysisJob.
- Should write EvidenceResult.
- Should update Moment status.

### AsyncStorage

Current:

- Source of truth for local sessions and evidence.

Future:

- Can remain a cache.
- Should not be durable product truth after Supabase integration.

## 6. Minimum Implementation Order

Do not start with full app integration.

Recommended order:

### Step 1: Create Supabase Project

Checklist:

- Project created.
- Region selected.
- Project URL copied to local secure env.
- Anon key copied to local secure env.
- Service role key copied only to server-side env storage.
- No app code changed.

### Step 2: Create Schema Draft

Checklist:

- SQL file drafted but not yet wired to app.
- Tables included:
  - `users`
  - `moments`
  - `analysis_jobs`
  - `evidence_results`
- Indexes included.
- Timestamp fields included.
- No media bucket usage yet.

### Step 3: Enable RLS In Locked-Down Mode

Checklist:

- RLS enabled on user-owned tables.
- No permissive public policies.
- EvidenceResult direct client writes blocked.
- AnalysisJob status updates blocked for normal client role.
- Service role remains server-only.

### Step 4: Backend-Only Connectivity Check

Checklist:

- Add Supabase env vars to local `.env.local`.
- Add Supabase env vars to Render only when implementation starts.
- Backend can connect with service role.
- No mobile app Supabase SDK yet.

This is the first step that would require code later.

### Step 5: Server-Side Write Spike

Checklist:

- Create test user mapping.
- Insert test Moment.
- Insert queued AnalysisJob.
- Run current Gemini evidence extraction.
- Insert EvidenceResult.
- Update Moment status.

Keep this backend-only.

### Step 6: App Read Integration

Only after backend write spike works:

- App reads Moment list.
- App reads Moment status.
- App reads EvidenceResult.
- App still does not write EvidenceResult.

### Step 7: Auth UI

Only after cloud data shape is proven:

- Add login UI.
- Map Supabase Auth user to `users`.
- Re-check RLS with real authenticated mobile requests.

### Step 8: Storage

Only after Moment DB flow is stable:

- Add private bucket.
- Add signed upload flow.
- Store source video path on Moment.
- Keep raw videos private.

## Phase 1 Done Criteria

Phase 1 planning is complete when:

- Supabase project creation checklist is clear.
- Required services are identified.
- Initial table plan is documented.
- RLS strategy is documented.
- App impact is documented.
- Minimum implementation order is documented.
- No production code has been changed.

Phase 1 implementation is complete later when:

- Supabase project exists.
- Initial tables exist.
- RLS is enabled in safe mode.
- No client app can access private data without auth.
- Server-only credentials are stored outside git.
- The existing local MVP still works unchanged.

## Stop Conditions

Stop before implementation if:

- Wakeboard evidence accuracy is still the primary blocker.
- Moment UX is still being validated locally.
- Storage cost/privacy has not been accepted.
- Auth would slow down one-user testing.
- RLS policy behavior has not been reviewed.

## Related Documents

- `docs/FUTURE_ARCHITECTURE.md`
- `docs/DATA_MODEL.md`
- `docs/INFRA_PLAN.md`
- `docs/MOMENT_DOMAIN_DESIGN.md`
