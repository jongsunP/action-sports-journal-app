# Handoff

## Purpose

This file exists so a new Codex session can continue work without relying on chat history.

Read this file after `AGENTS.md`, `docs/CURRENT_STAGE.md`, and `REVIEW.md`.

## Project

Action Sports Journal is an iOS-first React Native app for action sports athletes.

This is an Action Sports Life Log platform, not an AI-only analysis app.

## Current Status

Stage 2 is complete.

Latest project commit:

```text
72699fb Prepare App Store build configuration
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
- `docs/STAGE_2_PLAN.md`: Stage 2 plan and scope
- `REVIEW.md`: Stage 1 repository review
- `App.tsx`: app entry
- `src/features/sessions/HomeScreen.tsx`: current first screen
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

## How To Resume In A New Terminal Codex Session

```bash
cd /Users/parkjongsun/Repository/action-sports-journal-app
codex
```

Suggested first prompt:

```text
AGENTS.md, docs/HANDOFF.md, docs/CURRENT_STAGE.md, and REVIEW.md를 먼저 읽고 Stage 1 완료 상태에서 이어서 진행해줘.
```

## How To Run Locally

```bash
cd /Users/parkjongsun/Repository/action-sports-journal-app
npm install
npx expo start --tunnel --port 8082
```

Scan the QR code with the iPhone Camera app or Expo Go. Use tunnel mode if LAN discovery is unreliable.

## Recommended Next Step

Prepare App Store / TestFlight delivery next:

- keep the codebase minimal
- use EAS Build for binaries
- use EAS Submit for store uploads
- avoid new UX work until the release path is ready

Do not jump into backend, AI, auth, or database work.

## Related Personal Context Repo

The user also has a private Codex context repository:

```text
/Users/parkjongsun/Repository/codex-personal-context
https://github.com/jongsunP/codex-personal-context
```

That repository stores non-secret context for cross-session continuity.
