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

Latest known local project commit before this checkpoint:

```text
001ea88 Persist local sessions on device
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
- Development Gemini API spend target is under KRW 10,000/month.
- The dev analysis server uses conservative request, file-size, and output-token limits.
- The dev analysis server was confirmed running on port `8787` with
  `/health` returning `geminiConfigured: true` and model `gemini-3.5-flash`.
- The user's iPhone could open `http://10.10.7.17:8787/health` from Safari on
  the same Wi-Fi, confirming LAN access from iPhone to the Mac dev server.
- EAS preview environment variable was created:
  `EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT=http://10.10.7.17:8787/api/analyze-session-video`.

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
- `docs/DEV_AI_ANALYSIS_SETUP.md`: local Gemini API setup and spend guardrails
- `REVIEW.md`: Stage 1 repository review
- `App.tsx`: app entry
- `src/features/sessions/HomeScreen.tsx`: current first screen
- `src/services/ai/analyzeSessionVideo.ts`: remote analysis request adapter
- `dev-server/index.ts`: local Gemini-backed analysis server
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

Do not put Gemini API keys in the mobile app. Real AI analysis should go through a server/BFF endpoint.

## How To Resume In A New Terminal Codex Session

```bash
cd /Users/parkjongsun/Repository/action-sports-journal-app
codex
```

Suggested first prompt:

```text
AGENTS.md, docs/HANDOFF.md, docs/CURRENT_STAGE.md, docs/CONTINUITY_CHECKPOINT.md, docs/STAGE_3_VIDEO_ANALYSIS_PLAN.md, docs/DEV_AI_ANALYSIS_SETUP.md를 먼저 읽고, iPhone standalone preview build와 local Gemini dev-server 연결 상태에서 이어서 진행해줘.
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

Finish validating the actual Gemini video analysis flow:

1. Install the latest EAS preview build that includes commit `001ea88`.
2. Keep `npm run server:dev` running on the Mac.
3. Confirm iPhone Safari can open `http://10.10.7.17:8787/health`.
4. Open the standalone Action Sports Journal app.
5. Add a Session, select a short video under 20 MB, and save it.
6. Tap `AI 체크하기`.
7. Confirm the app shows real Korean feedback from the Gemini-backed dev server.
8. If it fails, read the dev-server terminal error first.

Do not jump into authentication, phone login, production storage, or production
backend architecture until this real analysis loop is confirmed end to end.

## Related Personal Context Repo

The user also has a private Codex context repository:

```text
/Users/parkjongsun/Repository/codex-personal-context
https://github.com/jongsunP/codex-personal-context
```

That repository stores non-secret context for cross-session continuity.
