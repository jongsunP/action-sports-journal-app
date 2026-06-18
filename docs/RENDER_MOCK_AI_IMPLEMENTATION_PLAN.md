# Render Mock AI Implementation Plan

Date: 2026-06-19

Purpose:

Define the implementation plan for a Render-based Mock AI preview environment.
This document is implementation planning only. It does not change code,
environment variables, Render settings, EAS settings, or build output.

Reference:

- `docs/DEV_AND_QA_ENVIRONMENT_STRATEGY.md`

## Confirmed Current State

Confirmed facts from the current codebase:

- There is no active `MOCK_AI_ANALYSIS` implementation.
- There is no active `MOCK_AI_FIXTURE` implementation.
- Mobile-side mock AI fallback has been removed.
- The app derives backend routes from `EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT`.
- The server currently requires real AI keys for Gemini/OpenAI-backed routes.
- `/health` does not yet expose mock AI mode because mock mode does not exist.

Important route behavior today:

- `POST /api/analyze-session-video` fails if `GEMINI_API_KEY` is missing.
- `POST /api/extract-session-evidence` fails if `GEMINI_API_KEY` is missing.
- `POST /api/benchmarks/openai-wakeboard-video` fails if `OPENAI_API_KEY` is
  missing.

## Target Architecture

Default QA should use:

```text
Simulator / standalone iPhone app
-> Render preview backend
-> Moment creation
-> AnalysisJob creation
-> Supabase persistence
-> polling / restore
-> UI rendering
-> Mock AI fixture instead of external Gemini/OpenAI
```

This is Mock AI, not Mock Backend.

Do not skip:

- upload request,
- Express route handling,
- Moment insert,
- AnalysisJob status transitions,
- Supabase writes,
- app polling,
- app restore,
- candidateTrace,
- DebugResultViewer,
- KnowledgeInsights,
- CoachingInsightContext.

Only replace:

```text
external AI API call
```

## Environment Contract

Server-only Render preview/mock env:

```text
NODE_ENV must not be production
APP_ENV=preview
MOCK_AI_ANALYSIS=true
MOCK_AI_ANALYSIS_ALLOW_REMOTE=true
MOCK_AI_FIXTURE=basic_air_default
```

Optional server-only env:

```text
MOCK_AI_LATENCY_MS=800
MOCK_AI_FAILURE_RATE=0
MOCK_AI_FORCE_STATUS=completed
MOCK_AI_MODEL=mock-gemini-2.5-pro
```

Real production Render env:

```text
APP_ENV=production
MOCK_AI_ANALYSIS=false
```

or omit all mock env values.

Production must never run with:

```text
APP_ENV=production
MOCK_AI_ANALYSIS=true
```

## Production Fail-Fast Rules

Server startup should fail before listening if:

```text
APP_ENV=production
AND MOCK_AI_ANALYSIS=true
```

Server startup should also fail if:

```text
MOCK_AI_ANALYSIS=true
AND APP_ENV is not preview/development/test
```

Server startup should fail for remote mock mode if:

```text
MOCK_AI_ANALYSIS=true
AND APP_ENV=preview
AND MOCK_AI_ANALYSIS_ALLOW_REMOTE is not true
```

Server startup should fail if:

```text
MOCK_AI_ANALYSIS=true
AND MOCK_AI_FIXTURE is empty
```

Recommendation:

Use `APP_ENV` for product environment, but keep `NODE_ENV` non-production for
the Render preview/mock service. The implemented safety guard forbids Mock AI
whenever `NODE_ENV=production` or `APP_ENV=production`.

## Health Endpoint Design

`GET /health` should expose non-secret mock state.

Preview/mock example:

```json
{
  "ok": true,
  "appEnv": "preview",
  "mockAi": {
    "enabled": true,
    "allowRemote": true,
    "fixture": "basic_air_default",
    "model": "mock-gemini-2.5-pro"
  },
  "geminiConfigured": false,
  "geminiEvidence": {
    "configured": true,
    "model": "mock-gemini-2.5-pro"
  }
}
```

Production example:

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

Do not expose:

- API keys,
- Supabase service role key,
- debug capture token,
- raw env values beyond safe booleans and fixture names.

## Mock Evidence Fixture Path

Evidence extraction should mock the Gemini evidence call, then continue through
the existing app pipeline.

Recommended implementation path:

```text
POST /api/extract-session-evidence
-> validate request
-> create Moment if needed
-> create AnalysisJob
-> return queued response
-> background processing starts
-> if mock enabled, load fixture raw Gemini evidence JSON
-> parseGeminiEvidence
-> taxonomy gates
-> validators
-> candidateTrace
-> KnowledgeInsights
-> CoachingInsightContext
-> evidence_results insert
-> analysis_jobs completed/failed
-> moments latest IDs/status update
```

The fixture should mimic Gemini structured output closely enough that the
existing parser and validators are exercised.

Recommended fixtures:

```text
basic_air_default
backroll_review
failed_analysis
low_confidence_review
```

Recommended model naming:

```text
mock-gemini-evidence-basic-air
mock-gemini-evidence-backroll-review
mock-gemini-evidence-low-confidence
```

The evidence result should make mock origin visible through the model prefix.

## Mock Short Analysis Path

Short analysis should mock only the Gemini short coaching analysis call.

Recommended implementation path:

```text
POST /api/analyze-session-video
-> validate multipart request
-> if mock enabled, load short analysis fixture
-> parseGeminiAnalysis
-> return existing response shape
```

The response must preserve the current JSON schema expected by the app.

Recommended model naming:

```text
mock-gemini-short-analysis-basic-air
mock-gemini-short-analysis-review
```

Important:

The short analysis mock should not affect the async evidence extraction path
unless the request explicitly hits that route.

## OpenAI Benchmark Mock Scope

OpenAI benchmark mocking is lower priority for the Render preview QA path.

Recommended MVP:

- implement Gemini evidence mock,
- implement Gemini short analysis mock,
- leave OpenAI benchmark real-key behavior unchanged initially.

Future optional phase:

- add `MOCK_OPENAI_BENCHMARK=true`,
- return benchmark-specific fixtures,
- keep the endpoint disabled or guarded in production.

## Render Service Configuration

Recommended service:

```text
action-sports-journal-api-preview
```

Render settings:

```text
Repository: jongsunP/action-sports-journal-app
Branch: master
Service type: Web Service
Runtime: Node
Build command: npm install
Start command: npm run server:start
Health check path: /health
```

Required env for preview/mock:

```text
APP_ENV=preview
MOCK_AI_ANALYSIS=true
MOCK_AI_ANALYSIS_ALLOW_REMOTE=true
MOCK_AI_FIXTURE=basic_air_default
HOST=0.0.0.0
MAX_VIDEO_MB=20
DAILY_ANALYSIS_LIMIT=3
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=3
SUPABASE_SERVICE_ROLE_KEY=<server-only secret>
EXPO_PUBLIC_SUPABASE_URL=<public Supabase URL>
```

Optional env:

```text
MOCK_AI_LATENCY_MS=800
MOCK_AI_FAILURE_RATE=0
MOCK_AI_MODEL=mock-gemini-2.5-pro
DEBUG_CAPTURE_TOKEN=<server-only secret>
```

AI keys should not be required for the preview/mock service when
`MOCK_AI_ANALYSIS=true`.

Production service:

- keep current real Render backend,
- keep real Gemini/OpenAI env,
- keep `APP_ENV=production`,
- do not set mock env.

## EAS Preview Endpoint Strategy

EAS preview internal distribution should point to the Render preview/mock
service:

```text
EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT=https://action-sports-journal-api-preview.onrender.com/api/analyze-session-video
```

This endpoint is public and safe for installed iPhone QA because it does not
depend on a local Mac or LAN IP.

Real AI preview or production QA can use:

```text
EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT=https://action-sports-journal-api.onrender.com/api/analyze-session-video
```

Local backend endpoints are allowed only for backend route debugging:

```text
EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT=http://127.0.0.1:8787/api/analyze-session-video
```

or a LAN IP when intentionally testing a physical phone against a local server.

Local IP endpoints must not be the default preview build configuration.

## Supabase Mock Row Distinction Policy

MVP recommendation:

- use the same Supabase project initially,
- do not add DB columns,
- do not add migrations,
- distinguish mock rows through model naming.

Expected values:

```text
analysis_jobs.model starts with mock-
evidence_results.model starts with mock-
```

Optional manual QA convention:

```text
Moment title or file name includes Mock QA
```

Do not change stored `predicted_trick` or `family` just because a result is
mocked. Mock identity should be visible through model/debug metadata, not by
corrupting product fields.

Future option if QA data becomes noisy:

- separate Supabase project for preview/mock,
- or add a dedicated `analysis_environment` column.

Do not do this in MVP.

## Implementation File Candidates

Likely files to modify when implementation begins:

- `dev-server/index.ts`
  - env parsing,
  - production fail-fast,
  - `/health` mock state,
  - `/api/analyze-session-video` mock branch,
  - `/api/extract-session-evidence` mock branch,
  - background job mock branch before Gemini upload/generate call.

Recommended optional server helper:

- `dev-server/mockAiFixtures.ts`
  - fixture registry,
  - fixture loading,
  - fixture validation,
  - mock model naming.

Possible type updates:

- `src/types/index.ts`
  - only if app-facing response metadata needs a typed mock marker.

Files that should usually not need code changes:

- `src/services/ai/analyzeSessionVideo.ts`
- `src/services/moments/supabaseMoments.ts`
- `src/services/video/createSessionVideoThumbnail.ts`

Reason:

The app already derives related backend routes from
`EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT`. If EAS points to the Render preview/mock
backend, the mobile code should not need a separate mock path.

Docs to update after implementation:

- `docs/DEV_AND_QA_ENVIRONMENT_STRATEGY.md`
- `docs/RENDER_MOCK_AI_IMPLEMENTATION_PLAN.md`
- `docs/PROJECT_STATUS_2026_06_17.md`
- `docs/CTO_HANDOFF_2026_06_17.md`

## Implementation Order

### Step 1: Add Env Parsing And Guards

Implement a small env helper:

```text
appEnv
mockAiEnabled
mockAiAllowRemote
mockAiFixture
mockAiModel
```

Add fail-fast checks before `app.listen`.

### Step 2: Add Fixture Registry

Create a fixture registry for:

```text
basic_air_default
backroll_review
failed_analysis
low_confidence_review
```

Each fixture should expose:

- evidence raw JSON,
- short analysis raw JSON,
- mock model name,
- optional forced failure.

### Step 3: Wire Evidence Mock

In the background evidence job path, branch before the external Gemini call:

```text
if mockAiEnabled:
  use fixture raw evidence JSON
else:
  call Gemini
```

Then reuse existing parse/normalize/validate/persist flow.

### Step 4: Wire Short Analysis Mock

In `POST /api/analyze-session-video`, branch before Gemini client creation:

```text
if mockAiEnabled:
  use fixture short analysis JSON
else:
  call Gemini
```

Then reuse `parseGeminiAnalysis`.

### Step 5: Expose Health State

Extend `/health` with:

```text
appEnv
mockAi.enabled
mockAi.allowRemote
mockAi.fixture
mockAi.model
```

### Step 6: Render Preview Service

Create separate Render service and set preview/mock env.

Do not modify production Render mock env.

### Step 7: EAS Preview Endpoint

Point EAS preview env to the Render preview/mock endpoint and rebuild only when
the user asks for a new preview build.

## Verification Order

### Local Code Verification

Run:

```bash
npm run typecheck
git diff --check
```

### Local Server Mock Verification

Run local server with mock env:

```bash
APP_ENV=preview \
MOCK_AI_ANALYSIS=true \
MOCK_AI_ANALYSIS_ALLOW_REMOTE=true \
MOCK_AI_FIXTURE=basic_air_default \
npm run server:start
```

Verify:

```text
GET /health
mockAi.enabled=true
mockAi.fixture=basic_air_default
```

### Local Evidence Route Verification

Submit one known sample video to:

```text
POST /api/extract-session-evidence
```

Expected:

- request accepted,
- Moment row created,
- AnalysisJob row created,
- job completes,
- evidence_results row created,
- model starts with `mock-`,
- no Gemini key is required,
- no Gemini request is made.

### Render Preview Verification

After deploying preview/mock Render service:

```text
GET https://action-sports-journal-api-preview.onrender.com/health
```

Expected:

- `ok=true`,
- `appEnv=preview`,
- `mockAi.enabled=true`,
- fixture visible,
- no secret values printed.

Required Render preview setting:

- do not set `NODE_ENV=production` on the preview/mock service.

### Simulator QA Verification

With local Expo app pointing at Render preview/mock:

- upload video,
- verify queued/processing/completed flow,
- verify Supabase restore,
- verify result display,
- verify DebugResultViewer if enabled.

### iPhone Standalone QA Verification

With EAS preview build pointing at Render preview/mock:

- install app,
- upload video away from local Mac,
- close app immediately,
- wait,
- reopen,
- completed result restores.

### Production Safety Verification

Verify production Render:

```text
GET https://action-sports-journal-api.onrender.com/health
```

Expected:

- `mockAi.enabled=false`,
- real Gemini model still visible,
- production service did not receive mock env.

## Rollback Plan

If preview/mock behavior breaks QA:

1. Remove mock env from the preview Render service.
2. Redeploy preview service.
3. Point EAS preview back to real Render only for real AI QA.
4. Do not modify production Render.

If production ever reports `mockAi.enabled=true`:

1. Treat it as a release blocker.
2. Remove mock env values immediately.
3. Redeploy production.
4. Verify `/health` returns `mockAi.enabled=false`.

## Risks

### Mock Data Pollutes Real QA Interpretation

Risk:

Mock rows in Supabase may be mistaken for real AI results.

Mitigation:

- require `model` prefix `mock-`,
- show mock state in `/health`,
- optionally use `Mock QA` naming convention.

### Mock Fixture Drifts From Real Schema

Risk:

Fixtures may pass while real Gemini output fails.

Mitigation:

- route fixtures through the same parser/validators,
- keep fixtures close to real debug artifacts,
- update fixtures when schema changes.

### Production Mock Accident

Risk:

Production returns mock analysis.

Mitigation:

- separate Render service,
- `APP_ENV` fail-fast,
- `/health` visibility,
- no mock env on production.

### False Confidence In AI Quality

Risk:

Mock QA proves app flow, not AI quality.

Mitigation:

- label mock mode clearly,
- keep separate real AI quality verification mode,
- do not use mock results as evidence quality benchmark.

### Same Supabase Project Noise

Risk:

Mock and real QA rows coexist.

Mitigation:

- use mock model prefix for MVP,
- consider separate Supabase preview project later if needed.

### Full Evidence Persistence Not Yet Verified

Risk:

The mock evidence branch has been verified up to route entry and key bypass, but
full `POST /api/extract-session-evidence` persistence with a real linked Moment
still needs verification before Render preview QA is considered complete.

Mitigation:

- create or reuse a linked Moment,
- submit a sample video to the mock evidence route,
- verify AnalysisJob status reaches `completed`,
- verify `evidence_results.model` starts with `mock-`,
- verify the app restores the mock result after restart.

## Recommendation

Proceed with a separate Render preview/mock service first.

Do not reintroduce mobile-side mock logic. Keep the app pointed at a public
Render endpoint, and mock only the external AI call inside the server. This
preserves the product-critical path while making everyday Simulator and iPhone
QA independent from the local Mac and external AI spend.
