# Handoff

## Purpose

This file exists so a new Codex session can continue work without relying on chat history.

Read this file after `AGENTS.md`, `docs/CURRENT_STAGE.md`, and `REVIEW.md`.

## Project

Action Sports Journal is an iOS-first React Native app for action sports athletes.

This is an Action Sports Life Log platform, not an AI-only analysis app.

## Current Status

Stage 1 is complete.

Latest Stage 1 commit:

```text
8d44d7b Add Stage 1 repository review
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
- The first screen shows `Action Sports Journal` and a `Select Video` button.
- TypeScript validation passed.
- Expo dependency validation passed.
- Stage 1 review was added in `REVIEW.md`.

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
npx expo start --lan
```

Scan the QR code with the iPhone Camera app or Expo Go.

## Recommended Next Step

Do not jump into backend, AI, auth, or database work.

When the user asks to continue product work, start Stage 2 as a local-only prototype:

- review the current folder and type structure
- add mock ActivityGroups only if needed
- add a small local-only Session concept
- keep everything simple and reversible

## Related Personal Context Repo

The user also has a private Codex context repository:

```text
/Users/parkjongsun/Repository/codex-personal-context
https://github.com/jongsunP/codex-personal-context
```

That repository stores non-secret context for cross-session continuity.
