# Handoff

## Purpose

This file exists so a new Codex session can continue work without relying on chat history.

Read this file after `AGENTS.md`, `docs/CURRENT_STAGE.md`, and `REVIEW.md`.

## Project

Action Sports Journal is an iOS-first React Native app for action sports athletes.

This is an Action Sports Life Log platform, not an AI-only analysis app.

## Current Status

Stage 2 is complete. Stage 3 video-to-analysis prototyping has started.

Latest known local project commit before this checkpoint:

```text
d81def4 Refresh handoff for App Store prep
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
- Expo SDK was downgraded to SDK 54 for compatibility with the user's current App Store Expo Go.
- The first screen shows the local Stage 2 ActivityGroup / Session prototype.
- ActivityGroups can be selected.
- Sessions are filtered by the selected ActivityGroup.
- A new local Session can be added and appears immediately.
- TypeScript validation passed.
- Expo dependency validation passed.
- Stage 1 review was added in `REVIEW.md`.
- Stage 2 planning was documented in `docs/STAGE_2_PLAN.md`.
- App Store build identifiers were added to `app.json`.
- EAS build/submit configuration was added in `eas.json`.
- `expo-image-picker` was added so the app can select a session video.
- The app can attach a selected video URI to a new Session.
- A first AI analysis request flow exists.
- If `EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT` is not configured, the app returns a local mock analysis result.

## Current Tech Versions

- Expo: `~54.0.35`
- React Native: `0.81.5`
- React: `19.1.0`
- TypeScript: `~5.9.2`

Use Node 20 or newer when running Expo locally.

## Key Files

- `AGENTS.md`: project rules and product philosophy
- `docs/PROJECT_CHARTER.md`: product charter
- `docs/MASTER_PLAN.md`: long-term plan
- `docs/CURRENT_STAGE.md`: current stage description
- `docs/CONTINUITY_CHECKPOINT.md`: latest cross-session status checkpoint
- `docs/STAGE_2_PLAN.md`: Stage 2 plan and scope
- `REVIEW.md`: Stage 1 repository review
- `App.tsx`: app entry
- `src/features/sessions/HomeScreen.tsx`: current first screen
- `src/services/ai/analyzeSessionVideo.ts`: analysis request adapter with mock fallback
- `src/types/index.ts`: initial domain types

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

- OpenAI integration
- Database
- Authentication
- Phone login
- Coupons
- Expense tracking
- Calendar
- RAG
- Video processing
- Backend implementation

Do not put OpenAI API keys in the mobile app. Real AI analysis should go through a server/BFF endpoint.

## How To Resume In A New Terminal Codex Session

```bash
cd /Users/parkjongsun/Repository/action-sports-journal-app
codex
```

Suggested first prompt:

```text
AGENTS.md, docs/HANDOFF.md, docs/CURRENT_STAGE.md, docs/CONTINUITY_CHECKPOINT.md, and REVIEW.md를 먼저 읽고 Stage 2 완료 및 App Store 준비 상태에서 이어서 진행해줘.
```

## How To Run Locally

```bash
cd /Users/parkjongsun/Repository/action-sports-journal-app
npm install
npx expo start --tunnel --port 8082
```

Scan the QR code with the iPhone Camera app or Expo Go. Use tunnel mode if LAN discovery is unreliable.

## Recommended Next Step

Continue the video-to-analysis prototype next:

- run the app on the physical iPhone
- select a video while adding a Session
- confirm the saved Session shows `Video attached`
- tap `Request AI Check`
- confirm the mock result appears
- then add a minimal server/BFF endpoint for real OpenAI analysis

Do not jump into database, authentication, phone login, storage, or production backend architecture work.

## Related Personal Context Repo

The user also has a private Codex context repository:

```text
/Users/parkjongsun/Repository/codex-personal-context
https://github.com/jongsunP/codex-personal-context
```

That repository stores non-secret context for cross-session continuity.
