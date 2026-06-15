# Infrastructure Plan

## Purpose

This document proposes the minimum infrastructure path for Action Sports
Journal's next phase.

Goal:

```text
Prepare DB/Auth/Job architecture for an AI-first product
without implementing it yet.
```

## Recommendation

Recommended platform:

```text
Supabase
```

Recommended near-term runtime:

```text
Supabase Postgres + Supabase Auth + existing Render worker/API
```

Recommended later additions:

```text
Supabase Storage
Supabase Queues
Supabase Realtime
Supabase Edge Functions for lightweight orchestration only
```

## Why Supabase

Action Sports Journal is becoming a relational AI product:

- User owns Moments.
- Moments belong to Sessions.
- Moments create AnalysisJobs.
- AnalysisJobs produce EvidenceResults.
- EvidenceResults must preserve raw observed facts.
- Future history/progression queries will need relational filtering.

Supabase is a good fit because it gives:

- Postgres
- Auth
- Row Level Security
- Storage
- Realtime
- Queues
- Cron
- Edge Functions

in one ecosystem.

## Why Not Neon First

Neon is a strong Postgres choice, especially for branching and custom backend
workflows.

But this project needs more than a database soon:

- Auth
- user-owned media
- row-level access
- job tracking
- possibly realtime status updates

Neon can support this with additional tools, but Supabase reduces assembly work
for the next product phase.

## Why Not Firebase First

Firebase is strong for mobile apps, auth, realtime, offline sync, and Cloud
Functions.

However, the Action Sports Journal domain is becoming relational and
analysis-heavy:

- Moment history
- Session grouping
- Analysis job history
- Evidence result debugging
- Future progression queries

Postgres is a better default for this shape than a document-first Firestore
model.

## Target Architecture

```text
Expo App
  ↓
API / BFF
  ↓
Supabase Auth
  ↓
Supabase Postgres
  ↓
AnalysisJob queue/table
  ↓
Render worker or future queue consumer
  ↓
Gemini Evidence Extraction
  ↓
EvidenceResult
  ↓
Moment status update
  ↓
App polling or realtime subscription
```

## Phase 0: Current State

Already exists:

- Expo app.
- AsyncStorage local data.
- Render backend.
- Gemini evidence endpoint.
- Evidence capture artifacts.
- Moment-like UI.
- Processing/completed/failed status in UI.

Do not disturb this while planning infrastructure.

## Phase 1: Supabase Project Preparation

No app integration yet.

Tasks:

1. Create Supabase project.
2. Record project URL and anon key locally only.
3. Keep service role key server-only.
4. Enable Auth but do not build login UI yet.
5. Create SQL migration drafts for:
   - `users`
   - `moments`
   - `analysis_jobs`
   - `evidence_results`
6. Decide whether the app will create a default Session later or allow
   `moments.session_id` to be nullable during MVP.

Done when:

- Empty Supabase project exists.
- Schema can be created manually in SQL editor.
- No mobile app code depends on Supabase yet.

## Phase 2: Server-Side DB Write Spike

Goal:

Prove the existing Render backend can write a Moment, AnalysisJob, and
EvidenceResult.

Tasks:

1. Add server-only Supabase client to the backend.
2. Add a development-only endpoint or script to create a test Moment.
3. Add AnalysisJob row with `queued` status.
4. Run existing Gemini evidence extraction.
5. Write EvidenceResult.
6. Update Moment status.

Important:

The mobile app should not change in this phase unless explicitly requested.

Done when:

- One test Moment and EvidenceResult can be written from the backend.
- No client secrets are exposed.

## Phase 3: Auth Boundary

Goal:

Prepare ownership before user-facing cloud data.

Tasks:

1. Enable Supabase Auth providers.
2. Decide first auth method:
   - email magic link
   - Apple login
   - email/password
3. Create app-level `users` row after auth signup.
4. Draft RLS policies.
5. Ensure server-side writes can map authenticated user to `users.id`.

Recommendation:

Do not start with phone auth. It adds product and compliance complexity before
Moment behavior is fully validated.

Done when:

- Auth identity can map to app user row.
- RLS policy draft exists.
- Login UI is still optional.

## Phase 4: Job Table Before Queue

Goal:

Introduce durable analysis state without adding queue complexity too early.

Tasks:

1. Create `analysis_jobs` table.
2. When Moment is created, insert a job with `queued`.
3. Existing backend worker polls `queued` jobs.
4. Worker updates status:
   - `processing`
   - `completed`
   - `failed`
5. Store retry metadata.

Why before queues:

- Easier to debug.
- Easier to inspect in SQL.
- Good enough for one-user or small private testing.
- Avoids queue consumer complexity before the domain is stable.

Done when:

- A job can survive process restart.
- A failed job remains inspectable.
- Manual retry can create a new job or reset the old job.

## Phase 5: Queue Introduction

Goal:

Move from polling to durable queued processing when job volume or reliability
requires it.

Recommended option:

```text
Supabase Queues
```

Tasks:

1. Enable Supabase Queues.
2. Create an `analysis_jobs` queue.
3. Enqueue job ID after AnalysisJob insert.
4. Worker consumes queue message.
5. Worker claims job in DB transaction.
6. Worker deletes or archives queue message only after DB update succeeds.

Keep AnalysisJob table even with queues.

The queue delivers work. The table remains product truth.

## Phase 6: Storage

Goal:

Persist source videos and thumbnails only when local-first behavior is no
longer enough.

Tasks:

1. Create private storage bucket.
2. Add storage path convention:

```text
users/{user_id}/moments/{moment_id}/source.{ext}
users/{user_id}/moments/{moment_id}/thumbnail.jpg
```

3. Create signed upload/download flow.
4. Add storage RLS policies.
5. Keep video upload behind explicit product need.

Do not start here. Storage increases cost, upload failure cases, and privacy
responsibility.

## Phase 7: Realtime Or Polling

Start with polling.

Polling is enough for MVP:

```text
GET /moments/:id/status
```

Move to Supabase Realtime only when:

- Analysis regularly takes long enough to justify live updates.
- Multiple devices need sync.
- Polling becomes noisy.

## Background Analysis Design

### Job Creation

```text
POST /moments
  create moment(status = processing)
  create analysis_job(status = queued, kind = evidence_extraction)
  return moment
```

### Worker Claim

```text
select next queued job
mark status = processing
increment attempts
```

### Worker Success

```text
insert evidence_result
update analysis_job status = completed
update moment status = completed
set moment.latest_evidence_result_id
```

### Worker Failure

```text
if attempts < max_attempts:
  set analysis_job status = queued
  store last_error
else:
  set analysis_job status = failed
  update moment status = failed
  insert failed evidence_result if useful
```

### Manual Retry

Recommended:

```text
create new AnalysisJob
keep old failed job for history
set Moment.status = processing
```

Do not overwrite failed job history.

## Security Rules

Minimum rules:

- Mobile app never receives service role key.
- Mobile app never receives Gemini or OpenAI API keys.
- Users can only read their own rows.
- Users cannot write EvidenceResult directly.
- EvidenceResult writes happen through server/worker only.
- Storage paths must include user ID and Moment ID.
- Raw AI responses may contain sensitive media-derived text and should be
  private by default.

## Cost Controls

Keep the current development budget mindset.

Recommended controls:

- Per-user daily analysis limit.
- Max video size.
- Max video duration.
- Max queued jobs per user.
- Retry limit.
- Provider timeout.
- Store raw artifacts only in debug mode.
- Delete or archive debug artifacts intentionally.

## Minimal Implementable Step

The smallest real implementation later should be:

```text
Supabase Postgres only
server-side write only
no login UI
no storage
no queue
```

Concrete first implementation later:

1. Install server-side Supabase client.
2. Add env vars on Render.
3. Create `moments`, `analysis_jobs`, `evidence_results`.
4. Add backend-only function to insert a Moment and EvidenceResult for a test
   request.
5. Keep mobile app unchanged.

This proves persistence without turning the product into an infrastructure
project.

## Stop Conditions

Do not proceed to the next phase if:

- Evidence extraction accuracy is still the primary uncertainty.
- Moment UX has not stabilized.
- The user is still validating one-person local-first usage.
- Cloud storage privacy/cost has not been accepted.
- Auth would slow down the learning loop.

## Current Recommendation

Prepare Supabase, but do not integrate it into the app yet.

The next product implementation should still prioritize:

```text
Wakeboard Moment
↓
Evidence Extraction
↓
Observed Facts
↓
Reviewable Result
```

Infrastructure should support this loop, not distract from it.
