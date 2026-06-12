# Current Stage

## Stage

Stage 1: Initial project setup complete.

Stage 2: Local-only ActivityGroup / Session prototype complete.

Stage 3: Standalone iPhone video-to-analysis prototype in progress.

## Current Status

The project has a new Expo React Native TypeScript app, initial docs, initial
domain folders, minimal domain types, an Expo SDK 54 setup, a Stage 1 review,
a working local Stage 2 prototype, and a successful standalone iPhone
preview/internal distribution path through EAS.

Stage 2 implementation is complete. The local ActivityGroup and Session
prototype works without backend, database, or authentication.

Stage 3 has moved from mock analysis to real server-mediated analysis. The
mobile app can select a video for a new Session, attach that video URI to the
Session, and request an analysis check through
`EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT`. The mobile mock analysis fallback has been
removed.

The app can render AI-provided highlight scene cards, but it does not infer highlight timestamps locally.

Development API usage should stay under KRW 10,000/month. The local dev server has conservative limits for file size, daily requests, rate limiting, and output tokens.

On 2026-06-12, the app was installed and opened on the user's iPhone as a
standalone EAS preview/internal distribution app, without Expo Go. The local
dev-server was confirmed reachable from the iPhone at:

```text
http://10.10.7.17:8787/health
```

The dev server reported:

```text
primaryProvider: gemini
geminiConfigured: false
openAiBenchmark.configured: false
openAiBenchmark.model: gpt-5.5
```

The server starts successfully with Gemini as the app-facing endpoint and OpenAI
as a parallel benchmark endpoint. Actual provider comparison still needs local
`GEMINI_API_KEY`, `OPENAI_API_KEY`, and the same wakeboard comparison video.

## What Exists

- Minimal home screen
- ActivityGroup, Session, AnalysisResult, and ShareResult types
- Feature folders for groups, sessions, analysis, and share
- Service folder for future AI integration
- Expo SDK 54 setup for physical iPhone Expo Go compatibility
- EAS preview/internal distribution setup for standalone iPhone installation
- Stage 1 review in `REVIEW.md`
- Cross-session handoff in `docs/HANDOFF.md`
- Stage 3 video analysis plan in `docs/STAGE_3_VIDEO_ANALYSIS_PLAN.md`
- Development AI setup notes in `docs/DEV_AI_ANALYSIS_SETUP.md`
- Video selection through `expo-image-picker`
- Local on-device Session persistence through AsyncStorage
- Remote-only AI analysis hook through `EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT`
- Local Gemini-backed dev server with a parallel OpenAI GPT-5.5 benchmark
  endpoint in `dev-server/index.ts`
- EAS preview environment variable for the dev analysis endpoint

## What Does Not Exist Yet

- Database
- Login or phone authentication
- Coupons or expenses
- Calendar
- RAG
- Production video upload and storage logic
- Production server-side AI analysis infrastructure
- End-to-end verification that the latest standalone iPhone build can upload a
  selected video to the local dev server and render real Gemini feedback
- Completed same-video comparison between Gemini and OpenAI GPT-5.5 benchmark output

## Next Recommended Step

Add local `GEMINI_API_KEY` and `OPENAI_API_KEY`, keep `npm run server:dev`
running, confirm `/health` reports both configured, then test `AI 체크하기`
with Gemini and the same wakeboard video through the OpenAI benchmark endpoint.
Review the saved JSON artifact under `dev-artifacts/openai-benchmarks/` before
making provider conclusions.

## Resume Notes

For a new Codex session, read `AGENTS.md`, `docs/HANDOFF.md`,
`docs/CONTINUITY_CHECKPOINT.md`, `docs/CURRENT_STAGE.md`, and
`docs/DEV_AI_ANALYSIS_SETUP.md` first.
