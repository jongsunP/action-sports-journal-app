# Current Stage

## Stage

Stage 1: Initial project setup complete.

Stage 2: Local-only ActivityGroup / Session prototype complete.

Stage 3: Video-to-analysis prototype started.

## Current Status

The project has a new Expo React Native TypeScript app, initial docs, initial domain folders, minimal domain types, an Expo Go compatible SDK 54 setup, a Stage 1 review, and a working local Stage 2 prototype.

Stage 2 implementation is complete. The local-only ActivityGroup and Session prototype works in Expo Go without backend, database, authentication, AI, or persistence.

Stage 3 has started with a minimal video selection and analysis request flow. The mobile app can select a video for a new Session, attach that video URI to the Session, and request an analysis check. If no backend endpoint is configured, the app returns a local mock analysis result.

The app can render AI-provided highlight scene cards, but it does not infer highlight timestamps locally.

Development API usage should stay under KRW 10,000/month. The local dev server has conservative limits for file size, daily requests, rate limiting, and output tokens.

## What Exists

- Minimal home screen
- ActivityGroup, Session, AnalysisResult, and ShareResult types
- Feature folders for groups, sessions, analysis, and share
- Service folder for future AI integration
- Expo SDK 54 setup for physical iPhone Expo Go compatibility
- Stage 1 review in `REVIEW.md`
- Cross-session handoff in `docs/HANDOFF.md`
- Stage 3 video analysis plan in `docs/STAGE_3_VIDEO_ANALYSIS_PLAN.md`
- Development AI setup notes in `docs/DEV_AI_ANALYSIS_SETUP.md`
- Video selection through `expo-image-picker`
- Local mock AI analysis result flow
- Optional server endpoint hook through `EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT`

## What Does Not Exist Yet

- OpenAI API integration
- Database
- Login or phone authentication
- Coupons or expenses
- Calendar
- RAG
- Production video upload and storage logic
- Real server-side OpenAI video analysis

## Next Recommended Step

Validate the new video selection and mock analysis flow on the physical iPhone, then add a minimal server/BFF endpoint for real OpenAI analysis when ready.

## Resume Notes

For a new Codex session, read `AGENTS.md`, `docs/HANDOFF.md`, and `REVIEW.md` first.
