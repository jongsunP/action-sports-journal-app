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
provider: openai
model: gpt-5.5
openaiConfigured: false
```

The OpenAI benchmark server starts successfully, but actual GPT-5.5 analysis
still needs a local `OPENAI_API_KEY` and the same wakeboard comparison video.

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
- Local OpenAI GPT-5.5 benchmark dev server in `dev-server/index.ts`
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
  selected video to the local dev server and render real OpenAI benchmark feedback

## Next Recommended Step

Add a local `OPENAI_API_KEY`, keep `npm run server:dev` running, confirm
`/health` returns `openaiConfigured: true`, then test `AI 체크하기` with the
same wakeboard comparison video. Review the saved JSON artifact under
`dev-artifacts/openai-benchmarks/` before comparing with Gemini.

## Resume Notes

For a new Codex session, read `AGENTS.md`, `docs/HANDOFF.md`,
`docs/CONTINUITY_CHECKPOINT.md`, `docs/CURRENT_STAGE.md`, and
`docs/DEV_AI_ANALYSIS_SETUP.md` first.
