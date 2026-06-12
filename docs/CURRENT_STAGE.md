# Current Stage

## Stage

Stage 1: Initial project setup complete.

Stage 2: Local-only ActivityGroup / Session prototype complete.

## Current Status

The project has a new Expo React Native TypeScript app, initial docs, initial domain folders, minimal domain types, an Expo Go compatible SDK 54 setup, a Stage 1 review, and a working local Stage 2 prototype.

Stage 2 implementation is complete. The local-only ActivityGroup and Session prototype works in Expo Go without backend, database, authentication, AI, or persistence.

## What Exists

- Minimal home screen
- ActivityGroup, Session, AnalysisResult, and ShareResult types
- Feature folders for groups, sessions, analysis, and share
- Service folder for future AI integration
- Expo SDK 54 setup for physical iPhone Expo Go compatibility
- Stage 1 review in `REVIEW.md`
- Cross-session handoff in `docs/HANDOFF.md`

## What Does Not Exist Yet

- OpenAI API integration
- Database
- Login or phone authentication
- Coupons or expenses
- Calendar
- RAG
- Real video upload logic

## Next Recommended Step

Prepare the App Store / TestFlight build pipeline with EAS Build and App Store identifiers before adding more product features.

## Resume Notes

For a new Codex session, read `AGENTS.md`, `docs/HANDOFF.md`, and `REVIEW.md` first.
