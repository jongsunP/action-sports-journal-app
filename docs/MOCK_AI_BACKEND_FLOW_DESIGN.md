# Mock AI Backend Flow Design

## Purpose

Design a dev-only mock AI flow that keeps the real app/backend integration path
intact while replacing only the external AI provider calls.

Goal:

```text
iPhone app
-> real video picker
-> real multipart/form-data upload
-> existing backend endpoint
-> real response normalization
-> real UI display
```

Mocked part only:

```text
Backend external AI provider call
```

This is a design document only. No implementation is included here.

## Non-Goals

- Do not create a frontend-only mock.
- Do not add new app screens.
- Do not bypass `/api/analyze-session-video` or `/api/extract-session-evidence`.
- Do not change Supabase schema for the first version.
- Do not change taxonomy gates, validators, or coaching rules.
- Do not enable mock behavior in production.

## Current Real Flow

### App Upload Flow

Current source:

- `src/features/sessions/HomeScreen.tsx`
- `src/services/ai/analyzeSessionVideo.ts`
- `src/services/moments/supabaseMoments.ts`

Flow:

```text
User selects video
-> ImagePicker returns local video asset
-> HomeScreen creates local Session
-> POST /api/moments creates Supabase Moment
-> HomeScreen calls queueSessionEvidenceExtractionWithGemini
-> requestRemoteJson builds multipart/form-data
-> video file is uploaded to backend
-> backend returns queued/processing job
-> app polls /api/moments
-> latestEvidenceResult is normalized
-> gallery/detail modal displays result
```

The app already logs configured endpoints in development through
`getConfiguredAiEndpoints`.

### `/api/extract-session-evidence`

Current source:

- `dev-server/index.ts`

Current async evidence flow:

```text
POST /api/extract-session-evidence
-> multer parses multipart video
-> request metadata is read
-> getOrCreateQueuedEvidenceAnalysisJob
-> response 202 queued/processing
-> setImmediate processQueuedEvidenceAnalysisJob
-> markEvidenceAnalysisJobProcessing
-> runGeminiEvidenceExtraction
-> uploadVideoForGemini
-> buildGeminiEvidencePrompt
-> generateGeminiContentWithResilience
-> parseGeminiEvidence
-> markEvidenceAsDegraded if fallback model
-> applyWakeboardTaxonomyGates
-> applyGeminiEvidenceConsistency
-> captureEvidenceDebug
-> persistEvidenceResultForLinkedMoment
-> writeEvidenceCaptureArtifact in non-production
-> app polling reads /api/moments
```

Important current behavior:

- The endpoint already requires a linked Moment.
- The app receives a queued job first, not the final evidence body.
- Final UI state comes from `/api/moments` polling and Supabase
  `latestEvidenceResult`.
- Evidence capture JSON is already dev-only.

### `/api/analyze-session-video`

Current source:

- `dev-server/index.ts`
- `src/services/ai/analyzeSessionVideo.ts`

Flow:

```text
POST /api/analyze-session-video
-> multer parses multipart video
-> uploadVideoForGemini
-> buildGeminiAnalysisPrompt
-> generateGeminiContentWithResilience
-> parseGeminiAnalysis
-> response normalized by normalizeRemoteAnalysis
```

This path is older coaching-style analysis. The current app's primary flow is
the async evidence extraction path, but the endpoint should still be covered by
mock design because it is part of the configured backend contract.

### Other Related Backend Paths

- `/api/moments`: real Supabase persistence and polling. Do not mock.
- `/api/create-session-thumbnail`: video thumbnail utility. Do not mock.
- `/api/benchmarks/openai-wakeboard-video`: benchmark-only path. Keep outside
  the first mock AI product flow unless a separate benchmark mock is needed.

## Recommended Mock Injection Point

Use provider-boundary mocking inside the backend, after request parsing and job
state creation, but before any external AI provider call.

Recommended boundary:

```text
runGeminiEvidenceExtraction
  if mock enabled:
    return fixture raw JSON through the same parse/gate/consistency/persistence path
  else:
    uploadVideoForGemini + generateGeminiContentWithResilience
```

For `/api/analyze-session-video`:

```text
POST /api/analyze-session-video route
  if mock enabled:
    use mock raw analysis JSON before uploadVideoForGemini
  else:
    uploadVideoForGemini + generateGeminiContentWithResilience
```

Why this boundary:

- App still uploads a real file.
- Backend still receives multipart/form-data.
- Existing endpoint paths stay unchanged.
- Async job state transitions are still tested.
- Supabase persistence can still be tested.
- Parser, taxonomy gates, consistency checks, response normalization, polling,
  and UI display all continue to run.
- Gemini Files API and Gemini/OpenAI generation calls are avoided in mock mode.

Do not mock at the app service layer. That would skip the integration path this
mode is meant to verify.

## AI Calls To Replace

In mock mode, these calls must not happen:

- `uploadVideoForGemini`
- `client.files.upload`
- `client.files.get`
- `generateGeminiContentWithResilience`
- `client.models.generateContent`
- Any OpenAI client call if the route being tested uses OpenAI

For the current app flow, the first required replacement is:

```text
runGeminiEvidenceExtraction
-> uploadVideoForGemini
-> generateGeminiContentWithResilience
```

The second replacement is:

```text
/api/analyze-session-video
-> uploadVideoForGemini
-> generateGeminiContentWithResilience
```

OpenAI benchmark mocking should be separate and lower priority because it is not
part of the main app upload -> evidence -> display flow.

## Dev-Only Env Flags

Recommended env:

```bash
MOCK_AI_ANALYSIS=true
MOCK_AI_FIXTURE=auto
MOCK_AI_LATENCY_MS=300
MOCK_AI_FAILURE_MODE=off
```

Meanings:

- `MOCK_AI_ANALYSIS=true`: enable backend AI provider mock.
- `MOCK_AI_FIXTURE=auto`: choose fixture from title/file name/user confirmed
  trick when possible.
- `MOCK_AI_FIXTURE=basic_air|back_roll|grab|failed_landing`: force one fixture.
- `MOCK_AI_LATENCY_MS`: optional artificial delay for UI state testing.
- `MOCK_AI_FAILURE_MODE=off|parse_error|provider_error|timeout_like`: optional
  future failure simulation.

Production rule:

```text
MOCK_AI_ANALYSIS is honored only when NODE_ENV !== "production".
```

If `NODE_ENV === "production"` and `MOCK_AI_ANALYSIS=true`, the server should
either ignore the flag with a loud startup warning or fail fast. Failing fast is
safer.

## Fixture Response Shape

Prefer fixtures at the raw provider response boundary.

That means an evidence fixture should look like the JSON Gemini would have
returned, not like the final app response. The fixture should then pass through:

```text
parseGeminiEvidence
-> taxonomy gates
-> consistency validation
-> evidence response builder
-> Supabase persistence
-> /api/moments normalization
-> app display
```

Recommended evidence fixture type:

```ts
type MockEvidenceFixture = {
  id: 'basic_air' | 'back_roll' | 'grab' | 'failed_landing';
  label: string;
  provider: 'mock';
  model: 'mock-gemini-evidence-v1';
  rawGeminiResponse: GeminiEvidencePayload;
  notes: string[];
};
```

Recommended analysis fixture type:

```ts
type MockAnalysisFixture = {
  id: 'basic_air' | 'back_roll' | 'grab' | 'failed_landing';
  label: string;
  provider: 'mock';
  model: 'mock-gemini-analysis-v1';
  rawGeminiResponse: GeminiAnalysisPayload;
  notes: string[];
};
```

When implemented, `rawGeminiResponse` can be stored as TypeScript objects and
serialized with `JSON.stringify` before entering the existing parser.

## Fixture Candidates

### Basic Air

Purpose:

- Happy-path wake jump.
- No inversion.
- No grab.
- Clean or stable landing.
- Basic Air family should pass.
- Invert family should be blocked by existing gate rules.

Useful UI states:

- completed
- medium/high confidence
- standard quality

### Back Roll

Purpose:

- Invert-family fixture.
- Includes clear `boardAboveHead`, roll axis, and inversion duration evidence.
- Tests InversionObservedFacts and family gate behavior.

Useful UI states:

- completed
- high family confidence only if required inversion evidence exists

### Grab

Purpose:

- Airborne trick with visible hand-to-board contact.
- Tests grab-specific evidence without requiring invert classification.

Useful UI states:

- completed
- evidence windows include grab timing

### Failed Landing

Purpose:

- Valid trick attempt with crash/unstable landing.
- Tests failed outcome copy and retry/status UI.
- Should still produce completed evidence if parsing succeeds.

Useful UI states:

- completed evidence with landing outcome failed/crash
- optional low confidence or needs_review

## Fixture Selection

Initial selection can be simple:

```text
1. MOCK_AI_FIXTURE forced value
2. userConfirmedTrick if present
3. session title keywords
4. uploaded file name keywords
5. fallback to basic_air
```

Example keyword mapping:

- `basic`, `air`, `jump`, `ts`, `hs` -> `basic_air`
- `backroll`, `back roll`, `invert` -> `back_roll`
- `grab`, `indy`, `mute` -> `grab`
- `fail`, `crash`, `fall` -> `failed_landing`

This selection must be deterministic so repeated tests are comparable.

## Supabase Persistence Recommendation

Recommendation:

```text
Persist mock evidence_results in development, but mark them clearly as mock.
```

Reason:

- The goal is to test real app/backend integration.
- The app currently displays completed async analysis through `/api/moments`.
- If mock evidence is not persisted, the main polling/restore path is not
  fully tested.

Required safeguards:

- Only persist when `NODE_ENV !== "production"`.
- Store `model = "mock-gemini-evidence-v1"` or similar.
- Include mock metadata in `raw_response_text`.
- Include mock marker in dev evidence capture artifacts.
- Consider `provider = "gemini"` for schema compatibility in v1, but put the
  mock marker in `model` and response metadata. A later migration can add
  `provider = "mock"` if the schema and app types are ready.

Do not persist mock results in production.

## Response Mock Marker

The server response and capture artifact should make mock mode obvious.

Recommended response addition:

```ts
mockInfo?: {
  enabled: true;
  fixtureId: string;
  providerCallsSkipped: Array<'gemini_files_upload' | 'gemini_generate_content'>;
};
```

For the current app type compatibility, this can be additive. Existing
normalizers will ignore unknown fields until the UI chooses to show them.

Recommended model fields:

```text
provider: "gemini" for current compatibility
model: "mock-gemini-evidence-v1/basic_air"
qualityMode: "standard"
```

In development UI, a small `MOCK` badge in the detail view may be useful later,
but it is not required for the first backend mock implementation.

## Production Safety

Required rules:

- Default is off.
- `MOCK_AI_ANALYSIS=true` works only when `NODE_ENV !== "production"`.
- Production startup should fail if mock mode is enabled.
- Mock fixture files should live under a dev-only path.
- Server `/health` should expose mock mode only in development.
- Evidence capture should include `mockInfo`.
- Mock results should have obvious model names.
- CI or smoke test should verify that production env does not allow mock mode.

Recommended guard helper:

```ts
function isMockAiAnalysisEnabled() {
  return process.env.NODE_ENV !== 'production' &&
    process.env.MOCK_AI_ANALYSIS === 'true';
}
```

Recommended provider-call guard:

```ts
function assertExternalAiAllowed(operation: string) {
  if (isMockAiAnalysisEnabled()) {
    throw new Error(`${operation} must not call external AI in mock mode.`);
  }
}
```

Use this guard inside `uploadVideoForGemini`,
`generateGeminiContentWithResilience`, and any OpenAI provider wrapper.

## Verification Plan

### Verify Real Integration Still Runs

Run local server with:

```bash
MOCK_AI_ANALYSIS=true npm run dev-server
```

Then use the iPhone app normally:

```text
select video
-> add to gallery
-> app uploads real multipart video
-> /api/extract-session-evidence returns queued
-> /api/moments polling returns completed
-> detail modal displays mock evidence as normal evidence
```

### Verify No External AI Call Happened

Use one or more checks:

- Temporarily remove or invalidate `GEMINI_API_KEY`; mock flow should still
  complete.
- Server logs should include `[Mock AI] fixture=...`.
- Server logs should not include Gemini file upload or Gemini retry messages.
- `mockInfo.providerCallsSkipped` should include Gemini Files upload and
  generate content.
- Dev capture JSON should show `capture.kind = "mock-gemini-evidence"`.
- Daily Gemini usage counters should not increment in mock mode.

### Verify Supabase State

Inspect latest rows:

- `moments.status = completed`
- `analysis_jobs.status = completed`
- `evidence_results.status = completed`
- `evidence_results.model` starts with `mock-gemini-evidence-v1`
- `evidence_results.raw_response_text` contains fixture/mock metadata

### Verify UI

Check:

- Gallery card moves from queued/processing to completed.
- Detail modal shows prediction/family/confidence.
- Retry still creates or reuses backend job according to current job rules.
- App relaunch restores the mock result from `/api/moments`.

## Expected Implementation Files

Likely files:

- `dev-server/index.ts`
  - env flag parsing
  - mock guard
  - evidence mock branch
  - analysis mock branch
  - health/debug metadata
- `dev-server/mockAiFixtures.ts`
  - evidence fixtures
  - analysis fixtures
  - fixture selector
- `src/types/index.ts`
  - optional future `mockInfo` type if UI should display it
- `src/services/ai/analyzeSessionVideo.ts`
  - optional future normalizer support for `mockInfo`
- `docs/MOCK_AI_BACKEND_FLOW_DESIGN.md`
  - this design

The first implementation can avoid app changes if the mock marker is encoded in
`model` and unknown response fields are additive.

## Risks

- Mock mode will not test Gemini Files API upload compatibility.
- Mock fixtures can make the UI look more stable than real model output.
- Supabase can accumulate mock data unless the model/mock marker is clear.
- Validators may accidentally become tuned to fixture shapes.
- Async timing may be too fast unless artificial latency is included.
- Production safety must be explicit because the same endpoint paths are used.
- Fixture selection by title/file name is useful but can hide mismatch between
  actual video content and displayed result.

## Recommendation

Start with the async evidence path only:

```text
/api/extract-session-evidence
-> runGeminiEvidenceExtraction mock branch
-> existing parse/gate/consistency/persistence path
```

Then add the older `/api/analyze-session-video` mock branch using the same
fixture selector.

Do not mock `/api/moments`, app normalization, Supabase persistence, or UI. The
value of this mode is that those parts remain real.
