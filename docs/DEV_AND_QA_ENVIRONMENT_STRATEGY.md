# Development And QA Environment Strategy

Date: 2026-06-19

Purpose:

Define the default development and QA environment strategy for Action Sports
Journal, and design a future Render-based Mock AI mode that preserves the real
upload/job/Supabase/UI flow while avoiding external AI API calls.

This document is investigation and design only. It does not implement code,
change environment variables, trigger builds, or modify Render/EAS settings.

## Core Principle

The app and Simulator should default to a public Render backend, not a local Mac
endpoint.

The QA target is:

```text
App / Simulator
-> Render backend
-> Moment creation
-> AnalysisJob
-> Supabase persistence
-> polling / restore
-> UI
```

Only the external AI call should be mocked:

```text
Render backend
-> Mock AI result
```

This is Mock AI, not Mock Backend.

## Why This Matters

The old local setup was useful for early development:

```text
App / Simulator
-> local Mac server
-> Mock or real local analysis behavior
```

But it is not the desired default QA structure because:

- it depends on a specific Mac being awake,
- it depends on a LAN IP,
- installed preview builds can silently point at stale local endpoints,
- real phone QA no longer matches hosted app behavior,
- Supabase/job/polling/restore flow may be skipped or distorted.

Default QA should test the real hosted product path. The only expensive or
variable part should be replaceable: Gemini/OpenAI.

## Environment Modes

### 1. UI Development

Default:

```text
Simulator + local Expo
-> Render backend
-> Mock AI
-> Supabase
```

Use when:

- adjusting UI layout,
- validating status messages,
- checking Moment restore,
- testing candidateTrace display,
- testing incomplete queued Moment hiding,
- testing polling and result rendering.

Do not use a local backend by default.

### 2. iPhone QA

Default:

```text
iOS standalone preview build
-> Render backend
-> Mock AI
-> Supabase
```

Use when:

- testing installed app behavior,
- testing camera/photo picker/video upload UX,
- testing background/close/reopen flows,
- testing Supabase restoration,
- checking whether preview builds work away from the Mac.

The preview build endpoint must be a public HTTPS Render endpoint.

### 3. Backend Development / Debugging

Allowed exception:

```text
App / curl / local script
-> local backend
-> local env
```

Use only when:

- debugging Express routes,
- inspecting request parsing,
- reproducing local server errors,
- developing server-side code before deploying to Render.

Local backend endpoints are not the default for app QA.

### 4. Real AI Quality Verification

Default:

```text
App / local script
-> Render backend
-> real Gemini/OpenAI
-> Supabase
```

Use when:

- validating actual evidence quality,
- checking wakeboard domain behavior,
- benchmarking Flash vs Pro,
- verifying coaching wording with real AI output.

This mode intentionally spends external AI tokens.

## Current Architecture Investigation

### Mobile App Endpoint

Current app services derive every backend endpoint from:

```text
EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT
```

Relevant files:

- `src/services/ai/analyzeSessionVideo.ts`
- `src/services/moments/supabaseMoments.ts`
- `src/services/video/createSessionVideoThumbnail.ts`

Derived routes:

```text
POST /api/analyze-session-video
POST /api/extract-session-evidence
POST /api/benchmarks/openai-wakeboard-video
POST /api/create-session-thumbnail
GET  /api/moments
PATCH /api/moments/:id/status
```

Observation:

The app has one public endpoint root. If that endpoint points at a local Mac IP,
the installed build is tied to that device/network. If it points at Render, the
installed build can run anywhere.

### Current Mock AI State

Confirmed from code search:

- No active `MOCK_AI_ANALYSIS` implementation was found.
- No active `MOCK_AI_FIXTURE` implementation was found.
- Mobile mock AI fallback has been removed.
- The server currently checks for `GEMINI_API_KEY` before Gemini-backed routes.
- OpenAI benchmark route checks `OPENAI_API_KEY`.

Relevant docs already say:

- mobile mock analysis fallback was removed,
- the app calls `EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT`,
- EAS preview should point to Render.

### APP_ENV Production Guard

Current behavior:

- `dailyUsageLimitEnabled = process.env.NODE_ENV === "production"`.
- Some debug/benchmark routes are disabled in production.
- Render Node.js services can run with `NODE_ENV=production`.
- Mock AI safety must be based on `APP_ENV`, not `NODE_ENV` alone.

Design requirement:

Mock AI must not accidentally run on the real production service.

### EAS Preview Environment

Current app build behavior:

- Expo public env values are embedded at build time.
- A preview build must be rebuilt after endpoint changes.
- Previous local-LAN endpoint guidance exists in older docs, but the desired
  current principle is that preview builds point to Render.

Required public EAS env:

```text
EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT=https://<render-service>/api/analyze-session-video
EXPO_PUBLIC_SUPABASE_URL=<public supabase url>
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<public anon/publishable key>
```

Do not put AI keys in EAS public env.

### Render Environment

Current real AI Render service requires:

```text
GEMINI_API_KEY
GEMINI_ANALYSIS_MODEL
GEMINI_FALLBACK_MODEL
SUPABASE_SERVICE_ROLE_KEY
EXPO_PUBLIC_SUPABASE_URL
HOST
PORT
```

For real OpenAI benchmark:

```text
OPENAI_API_KEY
OPENAI_ANALYSIS_MODEL
```

Mock AI should live in Render env, not the mobile app.

## Recommended Render Mock AI Structure

### Recommendation: Separate Render Preview Service

Create a separate Render Web Service for QA/mock AI:

```text
action-sports-journal-api-preview
```

or:

```text
action-sports-journal-api-mock
```

This service should:

- deploy the same codebase,
- use the same Supabase project initially unless data isolation becomes painful,
- use the same Moment/AnalysisJob/EvidenceResult path,
- not call Gemini/OpenAI when Mock AI is enabled,
- clearly report mock mode in `/health`,
- use model names with a mock prefix.

Example endpoint:

```text
https://action-sports-journal-api-preview.onrender.com/api/analyze-session-video
```

Why separate service:

- avoids accidentally enabling mock mode on the real production backend,
- allows EAS preview builds to target a stable public mock backend,
- keeps backend behavior close to production while reducing AI spend,
- makes QA independent from a local Mac.

### Alternative: Same Render Service With Guarded Mock Mode

Possible but not recommended as the first default.

It would require very strict guards:

```text
MOCK_AI_ANALYSIS=true
MOCK_AI_ANALYSIS_ALLOW_REMOTE=true
MOCK_AI_FIXTURE=basic_air
MOCK_AI_ENVIRONMENT=preview
```

Production service must reject mock mode unless every explicit guard is present
and the service is clearly marked non-production.

Risk:

One mistaken env setting could make production return mock results.

### Production Safety Recommendation

Production Render service:

```text
APP_ENV=production
MOCK_AI_ANALYSIS must be absent or false
MOCK_AI_ANALYSIS_ALLOW_REMOTE must be absent or false
```

On boot, production should fail fast if:

```text
APP_ENV=production
AND MOCK_AI_ANALYSIS=true
```

Preview/mock Render service:

```text
APP_ENV=preview
MOCK_AI_ANALYSIS=true
MOCK_AI_ANALYSIS_ALLOW_REMOTE=true
MOCK_AI_FIXTURE=basic_air_default
```

Important:

Render may provide `NODE_ENV=production` for Node.js services. This must not
block the preview/mock service. The guard should allow mock mode when
`APP_ENV=preview`, `MOCK_AI_ANALYSIS=true`, and
`MOCK_AI_ANALYSIS_ALLOW_REMOTE=true`.

## Proposed Mock AI Env Contract

Server-only env:

```text
APP_ENV=preview
MOCK_AI_ANALYSIS=true
MOCK_AI_ANALYSIS_ALLOW_REMOTE=true
MOCK_AI_FIXTURE=basic_air_default
MOCK_AI_LATENCY_MS=800
MOCK_AI_FAILURE_RATE=0
```

Optional:

```text
MOCK_AI_FORCE_STATUS=completed
MOCK_AI_MODEL=mock-gemini-pro
```

Production forbidden:

```text
APP_ENV=production
MOCK_AI_ANALYSIS=true
```

If this combination appears, server should fail to start.

## Mock Model Naming

Use a visible model prefix:

```text
mock-gemini-2.5-pro
mock-gemini-evidence-basic-air
mock-openai-benchmark
```

Evidence rows should clearly show:

```text
provider = gemini
model = mock-gemini-2.5-pro
quality_mode = standard
```

or, if types are expanded later:

```text
provider = mock
model = mock-gemini-2.5-pro
```

MVP recommendation:

Keep `provider = gemini` if changing enum/storage is risky, but make `model`
start with `mock-`.

## Mock AI Behavior

Mock AI should replace only the external AI call.

It should not skip:

- video upload request,
- Moment creation,
- AnalysisJob creation,
- queued/processing/completed states,
- Supabase write,
- app polling,
- app restore,
- candidateTrace display,
- DebugResultViewer.

Mock output should still pass through:

- parse/normalization,
- taxonomy gates,
- validators,
- KnowledgeInsights,
- CoachingInsightContext,
- persistence.

This preserves product pipeline behavior.

## Fixture Strategy

Start with a tiny fixture set:

```text
basic_air_default
backroll_review
failed_analysis
low_confidence_review
```

### basic_air_default

Purpose:

- happy path,
- completed status,
- no invert,
- no grab,
- clean or unknown landing.

### backroll_review

Purpose:

- raw candidate resembles Back Roll,
- observed facts include roll axis/inversion,
- final top-level may remain review-safe,
- candidateTrace shows "관찰된 가능성".

### failed_analysis

Purpose:

- simulate failure path,
- verify failed status UI,
- verify retry messaging.

### low_confidence_review

Purpose:

- validate `needs_review`,
- validate cautious wording.

## App Endpoint Strategy

### Default UI Development

Simulator `.env.local` should point to Render mock/preview:

```text
EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT=https://action-sports-journal-api-preview.onrender.com/api/analyze-session-video
```

### Default iPhone QA

EAS preview env should point to Render mock/preview:

```text
EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT=https://action-sports-journal-api-preview.onrender.com/api/analyze-session-video
```

### Real AI QA

Use a separate EAS profile or update preview env intentionally:

```text
EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT=https://action-sports-journal-api.onrender.com/api/analyze-session-video
```

Do this only when the goal is real AI quality validation.

### Backend Debugging

Local `.env.local` may temporarily point to:

```text
EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT=http://127.0.0.1:8787/api/analyze-session-video
```

or a LAN IP only when testing from a physical phone against a local backend.

This is an exception, not the default.

## EAS Build Profile Strategy

Current `eas.json` has:

```json
{
  "build": {
    "preview": {
      "distribution": "internal"
    }
  }
}
```

Recommended future profiles:

```json
{
  "build": {
    "preview": {
      "distribution": "internal",
      "env": {
        "APP_PUBLIC_ENV": "preview"
      }
    },
    "preview-real-ai": {
      "distribution": "internal",
      "env": {
        "APP_PUBLIC_ENV": "real-ai"
      }
    }
  }
}
```

However, endpoint values should still be managed carefully through EAS env or
Expo dashboard, not committed secrets.

## Health Endpoint Requirements

Render mock/preview `/health` should expose non-secret mode info:

```json
{
  "ok": true,
  "appEnv": "preview",
  "mockAi": {
    "enabled": true,
    "fixture": "basic_air_default",
    "allowRemote": true
  },
  "geminiConfigured": false,
  "geminiEvidence": {
    "model": "mock-gemini-2.5-pro"
  }
}
```

Production `/health` should expose:

```json
{
  "ok": true,
  "appEnv": "production",
  "mockAi": {
    "enabled": false
  },
  "geminiConfigured": true
}
```

Do not expose secrets.

## Implementation Plan

### Phase 1: Server Mock AI Guard

Add server env parsing:

- `APP_ENV`
- `MOCK_AI_ANALYSIS`
- `MOCK_AI_ANALYSIS_ALLOW_REMOTE`
- `MOCK_AI_FIXTURE`

Add fail-fast:

- if `APP_ENV=production` and `MOCK_AI_ANALYSIS=true`, throw on boot.

### Phase 2: Mock Evidence Extraction

In `/api/extract-session-evidence`:

- keep upload validation,
- keep Moment/job creation,
- keep queued response,
- in background processing, route external Gemini call through:

```text
if mock enabled -> fixture raw evidence response
else -> Gemini API
```

Then continue through:

- parse,
- taxonomy,
- validators,
- Knowledge rules,
- persistence.

### Phase 3: Mock Short Analysis

In `/api/analyze-session-video`:

- keep multipart/video handling,
- if mock enabled, return fixture coaching response,
- include `model = mock-gemini-short-analysis`.

### Phase 4: Health And Debug Visibility

Expose:

- app env,
- mock enabled,
- fixture,
- model prefix.

### Phase 5: Render Preview Service

Create separate Render service:

```text
action-sports-journal-api-preview
```

Set:

```text
APP_ENV=preview
MOCK_AI_ANALYSIS=true
MOCK_AI_ANALYSIS_ALLOW_REMOTE=true
MOCK_AI_FIXTURE=basic_air_default
```

Point EAS preview builds to this service.

## What Not To Do

Do not:

- reintroduce mobile-side mock analysis fallback,
- point default preview builds at a local Mac IP,
- mock the entire backend,
- skip Supabase writes in QA,
- skip AnalysisJob states in QA,
- enable mock mode on the production Render service,
- store AI keys in Expo public env.

## Current Gaps

Confirmed gaps:

- No `MOCK_AI_ANALYSIS` implementation exists yet.
- No `MOCK_AI_FIXTURE` implementation exists yet.
- `/health` does not report mock mode because no mock mode exists.
- Older docs still include local-LAN endpoint examples for historical dev setup.
- EAS preview env must be manually checked to ensure it does not point to a
  local IP.

Unknown:

- Whether the user wants a separate Supabase project for mock QA data.
- Whether preview/mock should use the same `moments` tables or a separate
  namespace/user.

Recommendation:

Use the same Supabase project initially, but use clearly named test Moment
titles and model prefix `mock-*`. Split Supabase later only if QA data becomes
too noisy.

## Acceptance Criteria For Future Implementation

For Simulator UI development:

- app points at Render preview/mock endpoint,
- upload request reaches Render,
- Moment row is created,
- AnalysisJob row is created,
- mock evidence result is stored,
- polling/restore updates UI,
- no Gemini/OpenAI request is made.

For iPhone QA:

- standalone preview build works away from the Mac,
- backend URL is public HTTPS Render,
- mock AI result appears with `model` beginning `mock-`,
- Supabase restore works after app restart.

For production:

- mock AI cannot be enabled accidentally,
- production health reports `mockAi.enabled=false`,
- real Gemini/OpenAI paths remain unchanged.

## Current Recommendation

Recommended path:

1. Add server-side Mock AI guards and fixtures.
2. Create a separate Render preview/mock service.
3. Point EAS preview internal builds to the Render preview/mock service.
4. Keep production Render on real Gemini/OpenAI.
5. Use local backend only for backend debugging.

This gives the user the desired default:

```text
Simulator or installed app
-> Render
-> Supabase/job/polling/UI real flow
-> AI call mocked only
```
