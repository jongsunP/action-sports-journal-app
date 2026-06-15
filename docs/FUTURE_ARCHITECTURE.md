# Future Architecture

## Purpose

This document prepares the next infrastructure direction for Action Sports
Journal as an AI-first, Moment-first product.

This is a design document only.

Do not implement from this document until the user explicitly asks for code
changes.

## Current State

Confirmed current implementation:

- Expo React Native iOS-first app.
- Local-first mobile state through AsyncStorage.
- Render-hosted Node/Express dev backend.
- Gemini evidence extraction endpoint.
- OpenAI benchmark code still exists in the server, but the current MVP UI is
  focused on Wakeboard evidence extraction.
- No production database.
- No login/auth.
- No push notifications.
- No background job queue.
- No production media storage.

Current product direction:

```text
Moment First
Wakeboard Evidence Extraction MVP
AI-first product architecture later
```

## Architecture Goal

Prepare for this future flow:

```text
User
↓
Auth
↓
Moment upload / create
↓
AnalysisJob enqueue
↓
Background worker
↓
Gemini evidence extraction
↓
EvidenceResult persisted
↓
Moment status updated
↓
Mobile app reads result
```

The key shift:

```text
Current: Moment status is UI-derived
Future: Moment status is durable product state
```

## DB/Auth Candidate Analysis

### Supabase

Supabase provides Postgres, Auth, Storage, Row Level Security, Realtime, Edge
Functions, Cron, and Queues in one platform.

Strengths for Action Sports Journal:

- Native Postgres fits Moment, Session, AnalysisJob, and EvidenceResult
  relationships.
- Supabase Auth integrates naturally with row-level ownership.
- Row Level Security can enforce per-user data isolation.
- Storage can hold future source videos, thumbnails, and derived clips.
- Queues provide a Postgres-native path for durable background work.
- Cron can trigger scheduled worker polling or cleanup.
- Realtime can later update the app when analysis status changes.
- React Native and Expo support are directly documented.

Risks:

- Edge Functions have execution limits, so long video analysis should not rely
  on a single synchronous Edge Function.
- Queue consumers still need careful worker design.
- Storage policies require deliberate RLS setup.

Best fit:

Supabase is the best default for the next architecture phase because it gives
one coherent path for DB, Auth, Storage, RLS, and job state without forcing the
project into a custom backend too early.

### Neon / Postgres

Neon is a strong serverless Postgres option with branching and autoscaling.

Strengths:

- Excellent Postgres foundation.
- Good developer workflow with branching.
- Strong fit if the app wants to keep a custom backend and choose separate Auth,
  Storage, and Job tools.
- Good long-term portability because it is plain Postgres.

Risks:

- Auth, storage, functions, and job orchestration are less proven as one stable
  app platform for this project than Supabase.
- The current app needs product infrastructure, not only a database.
- More integration decisions are required up front.

Best fit:

Neon is attractive if the project later wants a custom backend-first stack.
For the immediate next step, it creates more assembly work than necessary.

### Firebase

Firebase provides Auth, Firestore, Storage, and Cloud Functions. Firestore has
excellent mobile SDKs, realtime sync, and offline behavior.

Strengths:

- Strong mobile-first developer experience.
- Firebase Auth is mature.
- Firestore supports realtime and offline sync.
- Cloud Functions can respond to Firebase and Google Cloud events.
- Storage and mobile upload flows are well-established.

Risks:

- Firestore is document-first, while this product is moving toward a relational
  domain: User, Session, Moment, AnalysisJob, EvidenceResult, ShareResult.
- Evidence debugging and analysis history are easier to query in Postgres.
- Relational joins and constraints matter for explainability.
- SQL is better for future progression/history queries.

Best fit:

Firebase is strong for mobile apps, but less aligned with the evidence-rich,
relational, analysis-history model this product is developing.

## Recommendation

Recommended infrastructure direction:

```text
Supabase
```

Recommended initial role:

- Supabase Postgres for durable product data.
- Supabase Auth for user identity.
- Supabase Storage for future media files.
- Supabase RLS for per-user data boundaries.
- Supabase Queues for AnalysisJob durability.
- Existing Render backend or a small worker service for long-running Gemini
  processing.

Important nuance:

Supabase Edge Functions should not be the only long-running video analysis
worker. They can be used for lightweight orchestration, webhooks, or short
tasks. For long Gemini video analysis, keep a dedicated worker option open.

## Target Components

### Mobile App

Responsibilities:

- Authenticate user.
- Create Moment.
- Upload or reference media.
- Create AnalysisJob.
- Subscribe to Moment / AnalysisJob / EvidenceResult state.
- Render processing, completed, and failed states.

The mobile app must not hold Gemini or OpenAI API keys.

### API / BFF

Responsibilities:

- Validate user session.
- Create signed upload URLs or storage paths.
- Create Moment records.
- Create AnalysisJob records.
- Enqueue jobs.
- Return safe, user-owned data.

This can start as the existing Render backend and later move or split.

### Job Worker

Responsibilities:

- Claim queued AnalysisJob.
- Fetch media.
- Call Gemini evidence extraction.
- Persist EvidenceResult.
- Persist raw debug artifacts when enabled.
- Update AnalysisJob and Moment status.
- Retry recoverable failures.

### Database

Responsibilities:

- Store users, sessions, moments, jobs, evidence, and artifacts.
- Enforce ownership.
- Preserve analysis history.
- Support feed queries.
- Support future progression queries.

### Storage

Responsibilities:

- Source videos.
- Thumbnails.
- Derived clips.
- Debug artifacts if intentionally persisted.

Do not introduce production video storage until the local-first MVP behavior is
validated.

## Background Analysis Flow

Recommended future flow:

```text
1. User creates Moment in app.
2. App uploads or references video.
3. API creates Moment with status = processing.
4. API creates AnalysisJob with status = queued.
5. API enqueues job message.
6. Worker claims job.
7. Worker sets AnalysisJob.status = processing.
8. Worker calls Gemini evidence extraction.
9. Worker writes EvidenceResult.
10. Worker sets AnalysisJob.status = completed.
11. Worker sets Moment.status = completed.
12. App receives updated state by polling or realtime subscription.
```

Failure flow:

```text
1. Worker catches failure.
2. Worker stores error message and retry metadata.
3. Worker sets AnalysisJob.status = failed or queued for retry.
4. Worker sets Moment.status = failed if no more retries remain.
5. App shows 분석 실패 and manual retry.
```

## Why Jobs Matter

Video analysis can be slow and failure-prone.

Synchronous HTTP is fragile because:

- Mobile connection may drop.
- AI provider may take too long.
- Backend function may timeout.
- User may leave the screen.
- Retry handling becomes unclear.

Durable jobs make analysis explainable:

- The Moment exists before analysis completes.
- The app can show processing state.
- Failures are stored.
- Retries are explicit.
- Evidence history can be audited.

## Minimal Implementation Path

Do not introduce the full architecture at once.

Recommended smallest path:

1. Add schema documents and keep local MVP unchanged.
2. Introduce Supabase project manually.
3. Create only `users`, `moments`, `analysis_jobs`, and `evidence_results`.
4. Keep media local or temporary until upload behavior is validated.
5. Add Auth only when multi-device or user-owned cloud state is needed.
6. Add job table before adding a queue.
7. Poll queued jobs from the existing Render backend.
8. Add Supabase Queues only after the job table flow works.
9. Add Storage only when media persistence is truly needed.

## Non-Goals

Not part of the next implementation unless explicitly requested:

- Production DB migration
- Login UI
- Phone auth
- Push notifications
- Background job queue implementation
- Production video storage
- Scoring
- Payment
- Social features

## External References Checked

- Supabase docs: https://supabase.com/docs
- Supabase Edge Function scheduling: https://supabase.com/docs/guides/functions/schedule-functions
- Supabase Queues: https://supabase.com/docs/guides/queues
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Storage access control: https://supabase.com/docs/guides/storage/security/access-control
- Supabase Edge Function limits: https://supabase.com/docs/guides/functions/limits
- Neon product docs: https://neon.com
- Firebase Firestore docs: https://firebase.google.com/docs/firestore
- Firebase Cloud Functions docs: https://firebase.google.com/docs/functions
