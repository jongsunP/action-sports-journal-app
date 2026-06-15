# Supabase Phase 1 Setup

## Purpose

This guide starts the real Phase 1 Supabase setup for Action Sports Journal.

Goal:

```text
App <-> Supabase connection succeeds
```

Out of scope:

- Auth UI
- Storage integration
- Job Queue
- Production video upload
- EvidenceResult writes from mobile

## 1. Create Supabase Project

1. Open Supabase Dashboard.
2. Create a new project.
3. Recommended development project name:

```text
action-sports-journal-dev
```

4. Choose the closest stable region for Korea/Japan usage if available.
5. Wait until the Postgres database is ready.
6. Open Project Settings and copy:

```text
Project URL
Publishable key
Service role key
```

## 2. Local Environment

Add these values to `.env.local`.

```text
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

Rules:

- Do not commit `.env.local`.
- `EXPO_PUBLIC_SUPABASE_*` values are public mobile config and must rely on
  RLS for safety.
- `SUPABASE_SERVICE_ROLE_KEY` is server/smoke-test only.
- Never expose service role key to Expo app code.

## 3. Required Services

Enable or confirm these services:

- Postgres
- Auth
- Storage

Phase 1 uses Postgres immediately.

Auth and Storage are prepared but not wired into the app yet.

## 4. Create Initial Tables

Run this SQL manually in the Supabase SQL editor:

```text
supabase/phase1_schema.sql
```

Initial tables:

- `users`
- `moments`
- `analysis_jobs`
- `evidence_results`

RLS posture:

- RLS is enabled.
- Authenticated client policies are intentionally not opened yet.
- Service role remains server-only.

## 5. Install SDK

Installed packages:

```text
@supabase/supabase-js
react-native-url-polyfill
```

Mobile client file:

```text
src/services/supabase/client.ts
```

The app client is configured but not wired into UI yet.

## 6. Connection Smoke Test

After `.env.local` is populated and `supabase/phase1_schema.sql` has been run:

```bash
npm run supabase:smoke
```

Use Node 22 LTS for the smoke test.

Expected output:

```text
Supabase connection smoke test passed.
```

The script first checks whether Supabase is reachable using the service role
key when available. It then reports whether the Phase 1 tables are present.

If `schemaReady` is `false`, connection is working but
`supabase/phase1_schema.sql` still needs to be applied in the Supabase SQL
editor.

If `schemaApplied` is `true` and `grantsReady` is `false`, the tables exist but
the server-side service role cannot access them yet. Run this repair SQL in the
Supabase SQL editor:

```text
supabase/phase1_service_role_grants.sql
```

## 7. Current App Impact

No product UI behavior should change in Phase 1.

Current behavior remains:

- Local AsyncStorage-backed Moment-like feed.
- Gemini evidence extraction through the existing backend endpoint.
- No Auth UI.
- No Storage upload.
- No Job Queue.

## 8. Next Implementation Gate

Only after the smoke test passes:

1. Add backend-only Supabase write spike.
2. Insert test user.
3. Insert test Moment.
4. Insert test AnalysisJob.
5. Insert test EvidenceResult.
6. Keep mobile app unchanged until server-side persistence is verified.

Use this command to run the write spike:

```bash
npm run supabase:write-smoke
```

By default the script deletes the smoke-test user at the end, which cascades to
the inserted Moment, AnalysisJob, and EvidenceResult. Pass `-- --keep` if a
manual database inspection row is needed.

## References

- Supabase JavaScript client: https://supabase.com/docs/reference/javascript/initializing
- Supabase Expo quickstart: https://supabase.com/docs/guides/getting-started/quickstarts/expo-react-native
- Supabase API keys: https://supabase.com/docs/guides/getting-started/api-keys
