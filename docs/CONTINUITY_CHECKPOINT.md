# Continuity Checkpoint

## Purpose

This file records the current handoff state after the prior Codex account/session became unavailable.

Use this file together with:

- `AGENTS.md`
- `docs/HANDOFF.md`
- `docs/CURRENT_STAGE.md`
- `REVIEW.md`

## Current Project State

The project is in this state:

```text
Stage 1 complete
Stage 2 local ActivityGroup / Session prototype complete
App Store / TestFlight preparation started
Standalone iPhone EAS preview/internal distribution validated
Stage 3 real video-to-analysis prototype in progress
```

The latest known project checkpoint is:

```text
802bd94 Benchmark OpenAI wakeboard analysis
```

At the time this checkpoint was updated, local `master` was pushed to
`origin/master`.

## Confirmed Working

- The app opens in Expo Go on the user's physical iPhone.
- The app has been installed and opened as a standalone iPhone app through EAS
  preview/internal distribution, without Expo Go.
- Tunnel mode was used successfully when LAN mode was unreliable.
- ActivityGroups are visible.
- Sessions are filtered by selected ActivityGroup.
- Add Session opens an input flow.
- Saving a session adds it to the local app state.
- Added Session state is now persisted on-device using AsyncStorage.
- A selected video can be attached to a Session.
- The local dev analysis server runs on port `8787`.
- The local dev analysis server keeps Gemini as the app-facing analysis path
  and exposes a parallel OpenAI GPT-5.5 wakeboard benchmark endpoint.
- `/health` confirms `primaryProvider: "gemini"` and reports OpenAI benchmark
  configuration. Actual provider comparison still requires local
  `GEMINI_API_KEY`, `OPENAI_API_KEY`, and the same wakeboard comparison video.
- The user's iPhone can open `http://10.10.7.17:8787/health` from Safari on
  the same Wi-Fi.
- EAS preview has the public endpoint variable:
  `EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT=http://10.10.7.17:8787/api/analyze-session-video`.

The next validation step is to run the same wakeboard comparison video through
Gemini and the OpenAI benchmark endpoint with real local API keys, then compare
the saved OpenAI JSON artifact against the Gemini output.

## Implemented Locally

- Local-only ActivityGroup / Session prototype.
- Mock ActivityGroup data.
- Mock Session data.
- Session composer with title and notes.
- Save Session disabled until a title exists.
- Keyboard dismissal on save and through a Hide Keyboard button.
- iOS bundle identifier and build number in `app.json`.
- Android package and version code in `app.json`.
- Initial `eas.json` with preview and production profiles.
- `expo-image-picker` dependency for video selection.
- `@react-native-async-storage/async-storage` dependency for local on-device
  Session persistence.
- `src/services/ai/analyzeSessionVideo.ts` for the analysis request adapter.
- Remote-only analysis endpoint hook through `EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT`.
- Mobile mock analysis fallback removed.
- `dev-server/index.ts` keeps `/api/analyze-session-video` as the Gemini-backed
  endpoint and adds `/api/benchmarks/openai-wakeboard-video` for the OpenAI
  GPT-5.5 same-video benchmark.
- `docs/STAGE_3_VIDEO_ANALYSIS_PLAN.md` documents the mobile-to-server contract.
- Highlight scenes must be selected by server-side AI analysis, not guessed by the mobile app.
- Development API spend target is under KRW 10,000/month with conservative local server limits.
- Local OpenAI benchmark setup steps are documented in `docs/DEV_AI_ANALYSIS_SETUP.md`.

## Not Done Yet

- No database.
- No authentication.
- No production backend.
- No production video upload or storage.
- No App Store Connect upload yet.
- No completed EAS production build yet.
- No completed EAS submit yet.
- End-to-end real Gemini feedback from an iPhone-uploaded video still needs a
  final installed-app test with a real local `GEMINI_API_KEY`.
- The OpenAI GPT-5.5 benchmark still needs the same video and a real local
  `OPENAI_API_KEY`.

## Next Recommended Work

The user has shifted priority to proving this loop:

```text
iPhone standalone app
↓
selected Session video
↓
local dev-server on Mac
↓
Gemini analysis plus OpenAI GPT-5.5 benchmark
↓
Korean feedback rendered in app
```

Next work:

1. Add local `.env.local` with `GEMINI_API_KEY` and `OPENAI_API_KEY`.
2. Run `npm run server:dev`.
3. Confirm `/health` returns `geminiConfigured: true` and OpenAI benchmark
   `configured: true`.
4. Add the same wakeboard comparison video Session in the standalone app.
5. Tap `AI 체크하기`.
6. Confirm Gemini feedback renders in the app.
7. Run the same video through `/api/benchmarks/openai-wakeboard-video`.
8. Review `dev-artifacts/openai-benchmarks/` for the saved GPT-5.5 JSON output.
9. Compare the GPT-5.5 output with the Gemini result.
10. If it fails, inspect the dev-server terminal error first.

## Current Priority

The priority is first-pass feature validation, not UI/UX polish.

The user is comfortable handling UI/UX later. The hard parts are native app
behavior, EAS preview installation, video selection, local-server reachability,
and the server-mediated AI analysis path.
