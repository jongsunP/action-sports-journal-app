# Action Sports Journal

An iOS-first React Native application for action sports athletes.

Examples:

- Wakeboard
- Waterski
- Snowboard
- Ground Tricks
- Skateboard
- Surfing

Users define their own Activity Groups.

## Expo Version Guidance

Expo has changed. This project currently uses Expo SDK 54 for compatibility with the user's App Store version of Expo Go on a physical iPhone.

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing Expo-specific code.

## Current Local Setup

- Local path: `/Users/parkjongsun/Repository/action-sports-journal-app`
- GitHub remote: `https://github.com/jongsunP/action-sports-journal-app`
- Expo SDK: `~54.0.35`
- React Native: `0.81.5`
- React: `19.1.0`
- Stage 1 status: complete
- Stage 2 status: complete
- Stage 3 status: standalone iPhone video-to-analysis prototype in progress
- Latest checkpoint commit: `001ea88 Persist local sessions on device`
- The app has been confirmed visible on the user's physical iPhone through Expo Go.
- The app has also been installed and opened on the user's physical iPhone as a
  standalone EAS preview/internal distribution app, without Expo Go.
- First visible screen: `src/features/sessions/HomeScreen.tsx`
- Root entry: `App.tsx`
- Cross-session handoff: `docs/HANDOFF.md`

## Product Philosophy

This is not an AI analysis app.

This is an Action Sports Life Log platform.

AI analysis is only one feature.

The long-term goal is helping users track growth, sessions, expenses, activity history, and progress over time.

## Core Domain Model

```text
ActivityGroup
↓
Session
↓
AnalysisResult
↓
ShareResult
```

Session is the center of the system.

Do not design features that bypass Session.

## Current Development Stage

Stage 1: Initial Setup complete.

Current goals:

- Keep standalone iPhone preview/internal distribution working.
- Validate selected video upload from the standalone app to the local dev server.
- Return real Gemini-backed Korean feedback through the server-mediated path.
- Keep local Session state persisted on-device until a real database exists.

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

If unsure, keep the implementation simple.

## Architecture Principles

- Prefer simple solutions.
- Avoid over-engineering.
- Avoid premature abstractions.
- Avoid creating generic frameworks.
- Create only what is required for the current stage.

## Share Strategy

Sharing is a core product requirement.

Users are expected to share growth and achievements through Instagram and social media.

Future result structures should consider:

- Best scene
- Highlight scene
- AI comment
- Growth comparison
- Share card

Do not implement sharing yet.

Only keep future extensibility in mind.

## Technology Stack

- React Native
- Expo
- TypeScript
- Node.js
- Next.js API Routes (future BFF)
- Gemini API through server-side code only
- Vercel (future)

## Expected Coding Style

- Strong TypeScript typing
- Small focused files
- Clear naming
- Minimal dependencies
- Simple folder structure
