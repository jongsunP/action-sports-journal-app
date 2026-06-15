# Data Model

## Purpose

This document proposes a future data model for Action Sports Journal's
Moment-first, AI-first architecture.

This is a design document only. It does not describe implemented tables or
implemented TypeScript types.

## Model Summary

Recommended durable domain:

```text
User
↓
ActivityGroup
↓
Session
↓
Moment
↓
AnalysisJob
↓
EvidenceResult
```

Related future outputs:

```text
Moment
↓
ShareResult
```

## User

Purpose:

The user owns all private moments, media, sessions, analysis jobs, and evidence
results.

Recommended schema:

```ts
export type User = {
  id: ID;
  authProviderUserId: string;
  displayName?: string;
  email?: string;
  locale?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};
```

Recommended DB table:

```sql
users (
  id uuid primary key,
  auth_user_id uuid unique not null,
  display_name text,
  email text,
  locale text default 'ko-KR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

Notes:

- If using Supabase Auth, `auth_user_id` should reference `auth.users.id`.
- App-level user profile data should stay separate from auth identity data.
- Do not store API keys or private credentials.

## ActivityGroup

Purpose:

Represents a sport or activity group.

Current MVP can keep only Wakeboard active, but the data model should not block
future sports.

Recommended schema:

```ts
export type ActivityGroup = {
  id: ID;
  userId: ID;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};
```

Recommended DB table:

```sql
activity_groups (
  id uuid primary key,
  user_id uuid not null references users(id),
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

## Session

Purpose:

Session is a riding context container.

Session should not be the primary feed entity in the future. Moment should be
the primary feed entity.

Recommended schema:

```ts
export type Session = {
  id: ID;
  userId: ID;
  activityGroupId: ID;
  title: string;
  notes?: string;
  startedAt: ISODateString;
  endedAt?: ISODateString;
  locationName?: string;
  status: 'active' | 'completed' | 'archived';
  createdAt: ISODateString;
  updatedAt: ISODateString;
};
```

Recommended DB table:

```sql
sessions (
  id uuid primary key,
  user_id uuid not null references users(id),
  activity_group_id uuid not null references activity_groups(id),
  title text not null,
  notes text,
  started_at timestamptz not null,
  ended_at timestamptz,
  location_name text,
  status text not null default 'completed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

Recommended indexes:

```sql
create index sessions_user_started_at_idx on sessions (user_id, started_at desc);
create index sessions_activity_group_idx on sessions (activity_group_id);
```

## Moment

Purpose:

Moment is the core product entity.

A Moment represents one user-relevant clip, attempt, scene, or highlight.

Recommended schema:

```ts
export type MomentStatus =
  | 'draft'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'archived';

export type Moment = {
  id: ID;
  userId: ID;
  sessionId?: ID;
  activityGroupId: ID;
  title: string;
  notes?: string;
  status: MomentStatus;
  source: 'user_selected_video' | 'manual_entry' | 'future_auto_detected';
  occurredAt: ISODateString;
  media: {
    sourceVideoUri?: string;
    thumbnailUri?: string;
    durationMs?: number;
    fileName?: string;
    mimeType?: string;
    fileSize?: number;
  };
  timing?: {
    startSeconds?: number;
    endSeconds?: number;
    takeoffSeconds?: number;
    representativeFrameSeconds?: number;
  };
  userContext?: {
    intendedTrick?: string;
    userConfirmedTrick?: string;
    riderNotes?: string;
  };
  latestEvidenceResultId?: ID;
  latestAnalysisJobId?: ID;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};
```

Recommended DB table:

```sql
moments (
  id uuid primary key,
  user_id uuid not null references users(id),
  session_id uuid references sessions(id),
  activity_group_id uuid not null references activity_groups(id),
  title text not null,
  notes text,
  status text not null default 'draft',
  source text not null default 'user_selected_video',
  occurred_at timestamptz not null,
  source_video_uri text,
  thumbnail_uri text,
  duration_ms integer,
  file_name text,
  mime_type text,
  file_size integer,
  start_seconds numeric,
  end_seconds numeric,
  takeoff_seconds numeric,
  representative_frame_seconds numeric,
  intended_trick text,
  user_confirmed_trick text,
  latest_evidence_result_id uuid,
  latest_analysis_job_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

Recommended indexes:

```sql
create index moments_user_occurred_at_idx on moments (user_id, occurred_at desc);
create index moments_session_idx on moments (session_id);
create index moments_activity_group_idx on moments (activity_group_id, occurred_at desc);
create index moments_status_idx on moments (status);
```

Status meaning:

- `draft`: Moment exists but no analysis is running.
- `processing`: primary evidence extraction is running.
- `completed`: primary evidence extraction completed.
- `failed`: primary evidence extraction failed.
- `archived`: hidden from normal feed.

## AnalysisJob

Purpose:

AnalysisJob represents durable work to be done.

The app should create a job when a Moment needs AI evidence extraction. The job
then moves through queued, processing, completed, or failed states.

Recommended schema:

```ts
export type AnalysisJobKind = 'evidence_extraction' | 'coaching' | 'benchmark';
export type AnalysisJobStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AnalysisJob = {
  id: ID;
  userId: ID;
  momentId: ID;
  kind: AnalysisJobKind;
  status: AnalysisJobStatus;
  provider: 'gemini' | 'openai';
  model?: string;
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  queuedAt: ISODateString;
  startedAt?: ISODateString;
  completedAt?: ISODateString;
  failedAt?: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};
```

Recommended DB table:

```sql
analysis_jobs (
  id uuid primary key,
  user_id uuid not null references users(id),
  moment_id uuid not null references moments(id),
  kind text not null,
  status text not null default 'queued',
  provider text not null,
  model text,
  attempts integer not null default 0,
  max_attempts integer not null default 2,
  last_error text,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

Recommended indexes:

```sql
create index analysis_jobs_status_queued_at_idx on analysis_jobs (status, queued_at);
create index analysis_jobs_moment_idx on analysis_jobs (moment_id);
create index analysis_jobs_user_created_at_idx on analysis_jobs (user_id, created_at desc);
```

## EvidenceResult

Purpose:

EvidenceResult is the durable output of evidence extraction.

It should store both the app-facing summary and the observed facts needed for
debugging model quality.

Recommended schema:

```ts
export type EvidenceResult = {
  id: ID;
  userId: ID;
  momentId: ID;
  analysisJobId: ID;
  provider: 'gemini';
  model?: string;
  status: 'completed' | 'failed';
  qualityMode?: 'standard' | 'degraded';
  predictedTrick?: string;
  family?: string;
  confidence?: EvidenceConfidence;
  needsReview: boolean;
  consistencyStatus?: 'valid' | 'inconsistent' | 'needs_review';
  consistencyWarnings: string[];
  approachObservedFacts?: ApproachObservedFacts;
  inversionObservedFacts?: InversionObservedFacts;
  temporalWindows?: EvidenceTemporalWindows;
  evidenceWindows?: EvidenceWindow[];
  observations?: MotionObservation[];
  rawResponseText?: string;
  errorMessage?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};
```

Recommended DB table:

```sql
evidence_results (
  id uuid primary key,
  user_id uuid not null references users(id),
  moment_id uuid not null references moments(id),
  analysis_job_id uuid not null references analysis_jobs(id),
  provider text not null default 'gemini',
  model text,
  status text not null,
  quality_mode text,
  predicted_trick text,
  family text,
  confidence text,
  needs_review boolean not null default false,
  consistency_status text,
  consistency_warnings jsonb not null default '[]',
  approach_observed_facts jsonb,
  inversion_observed_facts jsonb,
  temporal_windows jsonb,
  evidence_windows jsonb,
  observations jsonb,
  raw_response_text text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

Recommended indexes:

```sql
create index evidence_results_moment_created_at_idx on evidence_results (moment_id, created_at desc);
create index evidence_results_user_created_at_idx on evidence_results (user_id, created_at desc);
create index evidence_results_needs_review_idx on evidence_results (needs_review);
```

Why JSONB for observed facts:

- The evidence shape is still evolving.
- Gemini output structure may change while the product is learning.
- JSONB keeps raw explainability without over-normalizing too early.

Later, frequently queried facts can be promoted into columns or a separate
`evidence_facts` table.

## Ownership And RLS Direction

Every user-owned table should include `user_id`.

Minimum ownership rule:

```text
authenticated user can only select / insert / update / delete rows where
row.user_id equals auth.uid mapped app user id
```

Recommended early approach:

- Keep all writes through API/BFF while schema stabilizes.
- Enable RLS before exposing direct client access.
- Do not allow mobile clients to write EvidenceResult directly.
- Let mobile clients create Moment only after auth rules are clear.

## MVP Mapping

Current local state:

```text
Session.videoUri
geminiEvidenceBySessionId
extractingEvidenceBySessionId
```

Future mapping:

```text
Session.videoUri -> Moment.source_video_uri
geminiEvidenceBySessionId[session.id] -> EvidenceResult by moment_id
extractingEvidenceBySessionId[session.id] -> Moment.status + AnalysisJob.status
```

## Initial Migration Strategy

Do not migrate all existing local data first.

Recommended first migration:

1. Create Supabase project.
2. Create minimal tables:
   - `users`
   - `moments`
   - `analysis_jobs`
   - `evidence_results`
3. Keep Sessions local or create a default Session per user.
4. Keep media local until storage is needed.
5. Use the existing Render backend to write job and result rows.

## Open Questions

- Should Moment require Session immediately, or allow `session_id` to be null
  during MVP?
- Should `Moment.status = completed` mean evidence completed, media uploaded,
  or both?
- Should user-confirmed trick be stored on Moment, EvidenceResult review, or
  both?
- How long should raw response text be retained?
- Should failed EvidenceResult rows appear in the main feed or only in debug
  views?
