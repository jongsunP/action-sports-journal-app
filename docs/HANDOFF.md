# Handoff

## Purpose

This file exists so a new Codex session can continue work without relying on chat history.

Read this file after `AGENTS.md`, `docs/CURRENT_STAGE.md`, and `REVIEW.md`.

## Project

Action Sports Journal is an iOS-first React Native app for action sports athletes.

This is an Action Sports Life Log platform, not an AI-only analysis app.

## Current Status

Stage 2 is complete. Stage 3 video-to-analysis prototyping is active.

On 2026-06-12, the priority changed from Expo Go validation to installing and
running Action Sports Journal as a standalone iPhone app through an EAS
preview/internal distribution build.

On 2026-06-13, the project validated the core AI analysis architecture with a
real wakeboard video. The recommended direction is:

```text
Video
↓
Gemini Evidence Extraction
↓
User Confirmation
↓
Coaching Engine
↓
Stored Session Intelligence
```

Latest known project checkpoint:

```text
699457b Add setup audit guide
```

Repository:

```text
https://github.com/jongsunP/action-sports-journal-app
```

Local path:

```text
/Users/parkjongsun/Repository/action-sports-journal-app
```

## Confirmed Working

- The app runs with Expo Go on the user's physical iPhone.
- The app has also been installed and opened as a standalone iPhone app through
  an EAS preview/internal distribution build, without Expo Go.
- Expo SDK was downgraded to SDK 54 for compatibility with the user's current App Store Expo Go.
- The first screen shows the local Stage 2 ActivityGroup / Session prototype.
- ActivityGroups can be selected.
- Sessions are filtered by the selected ActivityGroup.
- A new local Session can be added and appears immediately.
- Locally added Session state now persists on-device with AsyncStorage.
- TypeScript validation passed.
- Expo dependency validation passed.
- Stage 1 review was added in `REVIEW.md`.
- Stage 2 planning was documented in `docs/STAGE_2_PLAN.md`.
- App Store build identifiers were added to `app.json`.
- EAS build/submit configuration was added in `eas.json`.
- `expo-image-picker` was added so the app can select a session video.
- `@react-native-async-storage/async-storage` was added for local on-device
  Session persistence before a real database exists.
- The app can attach a selected video URI to a new Session.
- A first real AI analysis request flow exists.
- The mobile mock AI analysis fallback was removed. If
  `EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT` is not configured, analysis is disabled or
  fails with a clear configuration error rather than returning fake feedback.
- The app can display AI-provided highlight scenes with image, timestamp, and description.
- The mobile app must not guess highlight timestamps; highlight selection belongs to server-side AI analysis.
- Development API spend target is under KRW 10,000/month.
- The dev analysis server uses conservative request, file-size, and output-token limits.
- The dev analysis server keeps Gemini as the app-facing endpoint at
  `/api/analyze-session-video`.
- A parallel OpenAI GPT-5.5 wakeboard benchmark endpoint exists at
  `/api/benchmarks/openai-wakeboard-video`. It first samples broad frames, asks
  GPT-5.5 to scout candidate highlight windows, then samples focused frames
  inside those windows for the final coaching response.
- The app has a Session detail flow that can request Gemini coaching and GPT
  benchmark coaching for the same locally persisted Session/video.
- `/health` reports `primaryProvider: "gemini"` plus OpenAI benchmark
  configuration.
- Real Gemini video analysis is working through the local server-mediated path.
- The OpenAI GPT benchmark path is working for same-video comparison.
- GPT coaching/report quality improved after the benchmark pipeline moved to
  richer motion context.
- Gemini evidence extraction is implemented at `/api/extract-session-evidence`.
- The app supports a user-confirmed trick flow, stored separately from the
  AI-estimated trick.
- Motion-aware dense sampling is implemented for the OpenAI benchmark path:
  broad scan first, then focused frame extraction around the action window.
- Gemini evidence now reports model quality mode and requires user confirmation
  when Flash-Lite fallback, partial recovery, low confidence, or internal
  consistency warnings are present.
- A lightweight domain consistency validation layer flags obvious contradictions
  such as heelside approach plus Front Roll classification before coaching.
- The user's iPhone could open `http://10.10.7.17:8787/health` from Safari on
  the same Wi-Fi, confirming LAN access from iPhone to the Mac dev server.
- EAS preview environment variable was created:
  `EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT=http://10.10.7.17:8787/api/analyze-session-video`.

## Today's Conclusions

2026-06-13 was an architecture validation day.

- AI coaching quality and exact trick recognition are separate problems.
- GPT is strong at coaching/report generation when it receives enough motion
  context and rider intent.
- Gemini is currently stronger for real video/motion evidence extraction.
- Exact trick recognition is not reliable enough to trust without user
  confirmation.
- Motion-aware analysis is significantly better than uniform frame sampling for
  wakeboard clips because the important evidence is concentrated from edge load
  and takeoff through airborne rotation and landing.
- Flash-Lite fallback is availability/degraded mode only, not a quality
  benchmark for trick recognition.
- After increasing `GEMINI_EVIDENCE_MAX_OUTPUT_TOKENS` to `6000`, Gemini
  evidence JSON completed normally again (`finishReason=STOP`) and the UI
  showed all structured fields.
- Repeated tests with the same intended Back Roll video now tend to classify
  within the plausible Back Roll / Tantrum neighborhood rather than producing
  obviously unrelated tricks. Exact Back Roll vs Tantrum distinction is still
  not reliable enough to bypass user confirmation.
- Evidence prompt was adjusted to prioritize trick mechanics over landing
  outcome: approach, edge pattern, takeoff mechanics, shoulder/hip movement,
  rotation axis, and body orientation during inversion. This made the repeated
  Back Roll tests noticeably better. Landing/crash is now treated as secondary
  evidence because a failed landing does not change the intended trick identity.

Recommended next direction:

```text
Gemini = primary video/motion/trick evidence extractor
GPT = coaching/reporting engine after evidence and rider intent are confirmed
```

Do not invest further in GPT-only trick recognition for now.

## Current Tech Versions

- Expo: `~54.0.35`
- React Native: `0.81.5`
- React: `19.1.0`
- TypeScript: `~5.9.2`
- AsyncStorage: `2.2.0`

Use Node 20 or newer when running Expo locally.

## Key Files

- `AGENTS.md`: project rules and product philosophy
- `docs/PROJECT_CHARTER.md`: product charter
- `docs/MASTER_PLAN.md`: long-term plan
- `docs/CURRENT_STAGE.md`: current stage description
- `docs/CONTINUITY_CHECKPOINT.md`: latest cross-session status checkpoint
- `docs/STAGE_2_PLAN.md`: Stage 2 plan and scope
- `docs/STAGE_3_VIDEO_ANALYSIS_PLAN.md`: video-to-analysis scope and API contract
- `docs/DEV_AI_ANALYSIS_SETUP.md`: local Gemini/OpenAI setup and spend guardrails
- `docs/OPENAI_BENCHMARK_REPORT.md`: OpenAI vs Gemini benchmark procedure and pending report
- `REVIEW.md`: Stage 1 repository review
- `App.tsx`: app entry
- `src/features/sessions/HomeScreen.tsx`: current first screen
- `src/services/ai/analyzeSessionVideo.ts`: remote analysis request adapter
- `dev-server/index.ts`: local Gemini analysis server plus parallel OpenAI GPT-5.5 benchmark endpoint
- `src/types/index.ts`: initial domain types
- `eas.json`: EAS preview/internal and production profiles
- `app.json`: native identifiers, EAS project ID, iOS encryption metadata

## Domain Rule

Session is the center of the system.

```text
ActivityGroup
↓
Session
↓
AnalysisResult
↓
ShareResult
```

Do not design features that bypass Session.

## Do Not Implement Yet

- Database
- Authentication
- Phone login
- Coupons
- Expense tracking
- Calendar
- RAG
- Production video upload or storage
- Production backend implementation

Do not put Gemini or OpenAI API keys in the mobile app. Real AI analysis should go through a server/BFF endpoint.

## How To Resume In A New Terminal Codex Session

```bash
cd /Users/parkjongsun/Repository/action-sports-journal-app
codex
```

Suggested first prompt:

```text
AGENTS.md, docs/HANDOFF.md, docs/CURRENT_STAGE.md, docs/CONTINUITY_CHECKPOINT.md, docs/STAGE_3_VIDEO_ANALYSIS_PLAN.md, docs/DEV_AI_ANALYSIS_SETUP.md, docs/OPENAI_BENCHMARK_REPORT.md를 먼저 읽고, Gemini는 유지한 상태에서 OpenAI GPT-5.5 wakeboard benchmark를 이어서 진행해줘.
```

## How To Run Locally For AI Analysis

```bash
cd /Users/parkjongsun/Repository/action-sports-journal-app
npm install
npm run server:dev
```

Then on the iPhone, open:

```text
http://YOUR_COMPUTER_LAN_IP:8787/health
```

For the 2026-06-12 session, the working LAN IP was:

```text
http://10.10.7.17:8787/health
```

If the iPhone cannot open `/health`, the installed app cannot reach the local
AI server either. Check that the iPhone and Mac are on the same Wi-Fi and that
the endpoint IP matches the current Mac LAN IP.

## How To Build Standalone iPhone Preview

Use EAS preview/internal distribution:

```bash
npx eas-cli@latest build --platform ios --profile preview
```

The user's Expo account is `jspark88`. The EAS project ID is:

```text
f6e1a90a-62fb-4485-9434-ca92a756b8f4
```

The registered iPhone device:

```text
Name: iphone12 mini
UDID: 00008101-000404943640001E
Apple Team ID: L339A3KKLC
```

For a different Mac/session, verify EAS auth and environment variables:

```bash
npx eas-cli@latest whoami
npx eas-cli@latest env:list --environment preview
```

The preview environment must include:

```text
EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT=http://10.10.7.17:8787/api/analyze-session-video
```

If the Mac LAN IP changes, update this EAS preview variable and rebuild.

## Recommended Next Step

Before adding product features, continue validating the evidence-first loop:

1. Run the same wakeboard video through Gemini evidence extraction when the
   primary Gemini model is available.
2. Confirm or correct the intended trick in the app.
3. Compare Gemini vs GPT coaching quality after both receive the confirmed
   trick intent.
4. Preserve evidence, confidence, uncertainty, model, and user-confirmed trick
   as future Session intelligence.

Open questions:

- Long-term Gemini availability and 503 reliability.
- GPT vs Gemini coaching quality after confirmed trick input.
- How the evidence schema should evolve without becoming a hard-coded trick DB.
- How to turn stored Session intelligence into user progression analysis.

Finish validating the Gemini result against the OpenAI GPT-5.5 wakeboard benchmark:

1. Add a local `.env.local` with `GEMINI_API_KEY` and `OPENAI_API_KEY`.
2. Keep `npm run server:dev` running on the Mac.
3. Confirm `/health` returns `primaryProvider: "gemini"`,
   `geminiConfigured: true`, and OpenAI benchmark `configured: true`.
4. Open the standalone Action Sports Journal app.
5. Add a Session, select the same wakeboard comparison video, and save it.
6. Open the Session detail and tap `Gemini 코칭 받기`.
7. Confirm the app shows real Korean feedback from Gemini.
8. Tap `GPT 코칭 받기` for the same Session/video.
9. Review the saved JSON under `dev-artifacts/openai-benchmarks/`.
10. Compare it with the Gemini result before deciding whether OpenAI should be
    abandoned for this workflow.

Do not jump into authentication, phone login, production storage, or production
backend architecture until this real analysis loop is confirmed end to end.

## Related Personal Context Repo

The user also has a private Codex context repository:

```text
/Users/parkjongsun/Repository/codex-personal-context
https://github.com/jongsunP/codex-personal-context
```

That repository stores non-secret context for cross-session continuity.
