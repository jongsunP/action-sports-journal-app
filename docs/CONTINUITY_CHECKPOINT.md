# Continuity Checkpoint

## Purpose

This file records the current handoff state after the prior Codex account/session became unavailable.

`docs/PROJECT_MEMORY.md` is the primary source of truth and project operating
system. Use this file together with:

- `docs/PROJECT_MEMORY.md`
- `AGENTS.md`
- `docs/HANDOFF.md`
- `docs/CURRENT_STAGE.md`
- `REVIEW.md`

## Collaboration Model

- User: Product Owner / Founder / Domain Expert.
- Codex: Implementation Engineer.
- ChatGPT: CTO + Project Secretary + Project Historian.

Wrap-ups and handoffs must preserve product continuity, not only code
continuity. Include decisions, discoveries, validated assumptions, rejected
directions, next starting point, technical status, and commit candidates.

## Current Project State

The project is in this state:

```text
Stage 1 complete
Stage 2 local ActivityGroup / Session prototype complete
App Store / TestFlight preparation started
Standalone iPhone EAS preview/internal distribution validated
Stage 3 real video-to-analysis prototype in progress
Evidence-first AI architecture validated with a real wakeboard video
Product direction shifted from Session First to Moment First
Private action sports moment feed + AI Coach direction validated
Render backend deployed and standalone iPhone app working without Expo Go
```

The latest known project checkpoint is:

```text
fcbfb92 Document async analysis transition plan
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
- Render backend is deployed at `https://action-sports-journal-api.onrender.com`.
- Public HTTPS `/health` returns `ok: true`, `geminiConfigured: true`, and
  `geminiEvidence.configured: true`.
- EAS preview/internal distribution now uses:
  `https://action-sports-journal-api.onrender.com/api/analyze-session-video`.
- The app is installed on the user's iPhone as a standalone EAS internal
  distribution app, not Expo Go, TestFlight, or App Store.
- The installed app works without the local Mac server.
- Thumbnail generation uses the Render backend.
- Gemini evidence extraction works from the standalone app and evidence quality
  is currently good.
- Gemini API key rotation was completed in Render and local `.env.local`
  without exposing key values. The previous `API_KEY_INVALID` issue is fixed.
- Coaching requests reach the backend/AI path, but the current blocker is a
  structured parsing failure in the coaching response flow.
- Supabase Phase 1 preparation is scaffolded but not product-wired.
- Node standard is Node 22 LTS.
- Async analysis transition planning is documented.

## Today's Conclusions

## 2026-06-16 Async Analysis MVP Save Point

Confirmed facts:

- `origin/master` includes the Async Analysis MVP:

```text
0e9594e Implement async evidence analysis MVP
```

- `origin/master` includes the rate-limit / queued-state correction:

```text
7d83e7e Keep async evidence jobs queued on enqueue delay
```

- Render is deployed with the latest rate-limit behavior.
- `/health` returns 200 with `ok: true`, `geminiConfigured: true`, and
  `geminiEvidence.configured: true`.
- `/health` reports route-scoped rate limiting:
  - AI/video upload routes are rate limited.
  - Health, Moment list, and status polling are not counted.
- EAS standalone iOS internal build succeeded:

```text
Version: 1.0.0
Build Number: 5
URL: https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/66b48f3c-5564-4ddd-aa20-698f201e6204
```

- Founder verified the core Async MVP flow on the standalone iPhone app:

```text
video selected
-> queued
-> app closed immediately
-> wait 2-3 minutes
-> app relaunched
-> completed restored
```

What changed:

- Moment creation now returns quickly while evidence extraction is tracked by
  `analysis_jobs`.
- Supabase Moments and latest EvidenceResults are restored after app relaunch.
- UI state now stays aligned with Supabase job state when enqueue is delayed.
- A `429` or network-like enqueue failure no longer falsely marks the Moment
  `failed`.

Current boundary:

- This is still the short-path Async MVP.
- The video file is not stored durably in Supabase Storage or cloud storage.
- If Render restarts during in-process analysis, the current job may still need
  manual recovery or a future durable worker path.
- No Auth, Push, external queue, CDN, or production video storage exists.

Next starting point:

1. Recommended infrastructure next step: design/implement durable video storage
   for AnalysisJobs using Supabase Storage.
2. Product next step if infrastructure is paused: continue Detail Screen QA and
   Moment result UX.
3. AI next step if AI work resumes: continue Inversion Detection evidence
   validation before modifying trick classification again.

## 2026-06-15 End-of-Day Save Point

Current git state at wrap-up:

```text
origin/master includes:
91e8d7c Prepare Supabase phase 1 and standardize Node 22
fcbfb92 Document async analysis transition plan
```

What changed today:

- Supabase Phase 1 moved from planning to connection scaffolding.
- `.env.example` now documents Supabase env values.
- Supabase SDK dependencies are installed.
- Mobile Supabase client scaffold exists but is not wired into product UI.
- Supabase smoke test script exists.
- Initial Supabase SQL schema draft exists.
- Node standard is Node 22 LTS.
- Async analysis transition plan exists.

What remains intentionally not done:

- No Auth UI.
- No Storage connection.
- No Job Queue.
- No push notification.
- No scoring.
- No coaching expansion.
- No mobile UX switch to async analysis yet.

Next recommended work:

1. Owner supplies Supabase env values.
2. Create local `.env.local` values and Render env values.
3. Run `npm run supabase:smoke`.
4. Apply `supabase/phase1_schema.sql` manually.
5. Add server-side DB write spike.
6. Convert synchronous evidence extraction into async job-backed analysis.

Primary guide:

```text
docs/ASYNC_ANALYSIS_PLAN.md
```

2026-06-14 clarified the current product definition:

```text
Action Sports Journal
=
Private Action Sports Moment Feed
+
AI Coach
```

The product should be Moment First, not Session First. Users want to revisit
their riding moments, not browse session records. Feed should beat dashboard,
content should beat data, and AI Coach should be a secondary layer over the
user's riding content.

Today's UX conclusions:

- The Moment Feed direction was validated.
- The Session Feed improved significantly.
- Thumbnail support and story rail direction were validated.
- Large thumbnails raised perceived product quality more than styling alone.
- Feed immersion matters more than card styling.
- Edge-to-edge content feels better than floating cards.
- Top dashboard/summary areas reduce immersion.
- Instagram-style personal action sports feed is a stronger product direction
  than a GoPro clone. GoPro / Red Bull remain visual inspiration only.
- Korean mobile product feel should be preferred over a pure US extreme-sports
  aesthetic.
- Current primary UX weakness is the Detail Screen.

AI remains a long-term continuous effort. Event Window Detection remains a core
future investment area. For wakeboarding, trick identity is primarily
determined around pop and rotation initiation, with setup and early airborne
mechanics as important context. Landing/crash is outcome evidence, not primary
trick identity evidence.

Current recommended AI architecture:

```text
Video
↓
Observed Facts
↓
Trick Family
↓
Specific Trick
↓
Judge
↓
Coach
```

Current recommended model split:

```text
Gemini = primary video/motion/trick evidence extractor
GPT = coaching/reporting engine after confirmed rider intent
```

Current priorities:

- P1: Detail Screen UX, thumbnail experience, content-first experience.
- P2: Progression visibility, story / moment presentation.
- P3: Event Window Detection, trick recognition consistency.

## 2026-06-14 Wrap-Up

What changed:

- Home moved toward a private action sports Moment Feed.
- The feed became visual-first and content-first.
- Large thumbnails became the primary feed element.
- Story-style recent moments were introduced.
- Dashboard/stat summary UI was reduced because it weakened immersion.
- Edge-to-edge content replaced the earlier floating-card feeling.
- Local/dev thumbnail generation and local detail video playback were added.
- Detail Screen received a first pass, but it remains the main UX risk.
- Render backend deployment was completed.
- EAS internal distribution produced an installed standalone iPhone app.
- The app now uses a public HTTPS backend instead of the local Mac/LAN server.

Why it changed:

- iPhone QA showed the feed direction was significantly better once the app
  emphasized riding moments instead of session records.
- Real thumbnails improved perceived product quality more than styling.
- The product should make users want to open a riding moment, not read a
  report or browse a logbook.

Rejected for now:

- Dashboard-first home.
- Session database / report-first presentation.
- Pure GoPro clone or US extreme-sports media aesthetic.
- More AI system work during this UX pass.
- Database, cloud storage, backend streaming, or production video storage.

Validated:

- Moment Feed direction.
- Thumbnail support.
- Story rail direction.
- Feed immersion over card styling.
- Korean mobile product feel as the preferred polish direction.
- Standalone iPhone installation without Expo Go.
- Render-hosted backend health and Gemini configuration.
- Render-hosted thumbnail generation.
- Render-hosted Gemini evidence extraction.
- Local-first iPhone storage as the right short-term storage model.

## 2026-06-15 AI Evidence Checkpoint

Implementation stopped at a clean checkpoint after adding family-level and
approach temporal safeguards. Do not treat the remaining inversion issue as a
coaching problem.

Confirmed findings:

- Standalone iPhone app works.
- Render backend works.
- Gemini evidence extraction works.
- A clear Toeside Basic Jump was initially misclassified as Back Roll /
  Tantrum / Invert.
- Parsing and post-processing did not create the initial false positive.
- The root cause involved raw model hallucination plus missing wakeboard trick
  taxonomy structure.
- Wakeboard trick taxonomy was introduced.
- Wakeboard validation matrix was introduced.
- Taxonomy Gate was implemented.
- `ApproachObservedFacts` was implemented.
- `FinalApproachWindow` design and implementation were added.
- Toeside detection improved significantly.
- Invalid Tantrum classifications are now downgraded instead of confidently
  returned.

Open questions:

- Unknown: why Gemini still believes inversion exists in the test clip.
- Unknown: whether inversion detection is using incorrect visual cues.
- Unknown: whether inversion evidence is being inferred from airtime/body
  position rather than true inversion mechanics.

Next starting point:

```text
Inversion Detection
```

Next goal:

- Design and validate `InversionObservedFacts` before modifying trick
  classification again.
- Candidate fields: `bodyInverted`, `boardAboveHead`, `rollAxis`, `flipAxis`,
  `rotationInitiation`, and `inversionConfidence`.
- First collect and inspect raw inversion evidence paths so nonexistent
  inversion evidence can be explained before prompt or taxonomy changes.

Architecture status:

- Data remains local-first on the iPhone with AsyncStorage.
- Backend is a thin AI gateway plus thumbnail generation server.
- No user-facing database integration yet; Supabase Phase 1 scaffolding exists.
- No login yet.
- No cloud video storage yet.
- No CDN yet.
- AI keys live only in Render environment variables and local ignored env files.
- Future optimization: move thumbnail generation on-device if practical.

Open questions:

- Does the latest Detail Screen feel like reviewing a riding moment on iPhone?
- How should progression be visible without becoming a dashboard?
- Should detail analysis appear inline, behind a drawer, or as a separate coach
  review mode?
- What thumbnail frame best represents a wakeboard attempt?
- When should Event Window Detection become the active focus again?

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
- Instagram-style personal Moment Feed first version.
- Story-style recent moments rail.
- Lightweight local video thumbnail support for feed/detail imagery.
- Lightweight local video playback from the Session detail screen.
- Detail screen first pass toward hero video/thumbnail first, moment first,
  AI second, long text last.

## Not Done Yet

- No user-facing database integration.
- No authentication.
- No production database/cloud storage.
- No production video upload or storage.
- No App Store Connect upload yet.
- No completed EAS production build yet.
- No completed EAS submit yet.
- Full GPT coaching pipeline after Gemini evidence plus user confirmation.
- Long-term Gemini availability and 503 reliability strategy.
- GPT vs Gemini quality decision after confirmed trick input.
- Evidence schema evolution.
- User progression analysis across Sessions.
- Coaching structured parsing failure investigation.

## Next Recommended Work

Do not add unrelated product features yet.

If returning tomorrow, continue here:

1. Design and validate `InversionObservedFacts`.
2. Investigate why nonexistent inversion evidence is being generated.
3. Investigate coaching structured parsing failure.
4. QA the Detail Screen on iPhone.
5. Improve the Detail Screen until it feels like reviewing a riding moment, not
   reading a report.
6. Review Progression UX.
7. Keep the Feed mostly frozen unless new iPhone QA identifies a specific issue.
8. Resume Event Window Detection and trick-recognition consistency after the
   core moment experience is stable.

## Current Priority

Current priority is AI evidence truthfulness plus standalone app reliability.

P1 is Inversion Detection evidence design. P2 is Detail Screen UX, thumbnail
experience, and content-first experience. AI systems should not be changed
broadly unless explicitly requested.
