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
Evidence-first AI architecture validated with a real wakeboard video
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
- The app now has a Session detail flow that can request Gemini coaching and
  GPT benchmark coaching for the same locally persisted Session/video.
- `/health` confirms `primaryProvider: "gemini"` and reports Gemini evidence
  plus OpenAI benchmark configuration.
- Real Gemini video analysis works.
- The OpenAI benchmark path works.
- GPT coaching/report quality improved after the benchmark path added
  motion-aware context.
- Gemini evidence extraction is implemented.
- User-confirmed trick flow is implemented, with the confirmed trick kept
  separate from the AI-estimated trick.
- Motion-aware dense sampling is implemented for the OpenAI benchmark path.
- Gemini Flash-Lite fallback is treated as degraded mode only and should not be
  used as a trick-recognition quality benchmark.
- Internally inconsistent evidence, such as heelside approach plus Front Roll
  classification, is flagged and routed to user confirmation before coaching.
- The user's iPhone can open `http://10.10.7.17:8787/health` from Safari on
  the same Wi-Fi.
- EAS preview has the public endpoint variable:
  `EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT=http://10.10.7.17:8787/api/analyze-session-video`.

## Today's Conclusions

2026-06-13 validated the current AI architecture direction.

- AI coaching quality and exact trick recognition are separate problems.
- GPT is strong at coaching/report generation.
- Gemini is currently stronger for video/motion evidence extraction.
- User confirmation is necessary because exact trick recognition is not yet
  reliable.
- Motion-aware analysis is significantly better than uniform frame sampling.
- Evidence extraction was unstable when Gemini JSON responses were truncated,
  but raising `GEMINI_EVIDENCE_MAX_OUTPUT_TOKENS` to `6000` restored complete
  structured output in the latest test.
- Repeated tests with the same Back Roll video now produce plausible Back
  Roll/Tantrum-family classifications instead of clearly unrelated tricks.
  Exact trick naming still requires user confirmation.
- The evidence prompt now tells Gemini to classify the trick from motion
  mechanics before landing outcome: approach, edge pattern, takeoff mechanics,
  shoulder/hip movement, rotation axis, and inverted body orientation. This
  improved the repeated Back Roll evidence results. Landing/crash is secondary
  because a failed landing does not change the trick identity.

Current recommended architecture:

```text
Video
↓
Gemini Evidence Extraction
↓
User Confirmation
↓
Coaching Engine
↓
Stored Session Intelligence
```

Current recommended model split:

```text
Gemini = primary video/motion/trick evidence extractor
GPT = coaching/reporting engine after confirmed rider intent
```

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
- `dev-server/index.ts` adds `/api/extract-session-evidence` for normalized
  Gemini evidence extraction.
- Gemini evidence returns candidate trick, alternatives, family, approach,
  rotation, landing outcome, evidence windows, observations, confidence,
  uncertainty, model metadata, quality mode, confirmation requirement, and
  consistency warnings.
- `src/features/sessions/HomeScreen.tsx` shows AI-estimated trick evidence and
  lets the user confirm or correct the intended trick.
- Coaching requests prefer the user-confirmed trick when available.
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
- Full GPT coaching pipeline after Gemini evidence plus user confirmation.
- Long-term Gemini availability and 503 reliability strategy.
- GPT vs Gemini quality decision after confirmed trick input.
- Evidence schema evolution.
- User progression analysis across Sessions.

## Next Recommended Work

The user has shifted priority to proving this loop:

```text
iPhone standalone app
↓
selected Session video
↓
local dev-server on Mac
↓
Gemini evidence extraction
↓
user trick confirmation
↓
coaching engine
↓
stored Session intelligence
```

Next work:

1. Run `npm run server:dev`.
2. Confirm `/health` returns Gemini configured, Gemini evidence configured, and
   OpenAI benchmark configured.
3. Add or reuse the same wakeboard comparison video Session in the app.
4. Run `Gemini 근거 추출`.
5. Confirm or correct the intended trick.
6. Compare GPT vs Gemini coaching quality after confirmed trick input.
7. If it fails, inspect the dev-server terminal error first.

## Current Priority

The priority is first-pass feature validation, not UI/UX polish.

The user is comfortable handling UI/UX later. The hard parts are native app
behavior, EAS preview installation, video selection, local-server reachability,
and the server-mediated AI analysis path.
