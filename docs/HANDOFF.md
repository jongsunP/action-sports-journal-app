# Handoff

## Purpose

This file exists so a new Codex session can continue work without relying on chat history.

`docs/PROJECT_MEMORY.md` is the primary source of truth and project operating
system. Read it first. Then read this file after `AGENTS.md`,
`docs/CURRENT_STAGE.md`, and `REVIEW.md`.

## Project

Action Sports Journal is an iOS-first React Native app for action sports athletes.

This is an Action Sports Life Log platform, not an AI-only analysis app.

## Collaboration Model

The user is the Product Owner / Founder / Domain Expert.

Codex is the Implementation Engineer.

ChatGPT is treated as CTO + Project Secretary + Project Historian.

Do not assume the user is acting as a developer requesting arbitrary code
changes. The user owns product direction, domain knowledge, QA feedback, and
priorities. Codex owns implementation, technical execution, code changes, and
documentation updates.

When the user asks for "today's wrap-up", "정리", or "handoff", include product
continuity as well as technical continuity:

- decisions made
- discoveries
- validated assumptions
- rejected directions
- current priorities
- next starting point
- technical status
- changed files and commit candidates

## Current Status

Stage 2 is complete. Stage 3 video-to-analysis prototyping is active.

On 2026-06-12, the priority changed from Expo Go validation to installing and
running Action Sports Journal as a standalone iPhone app through an EAS
preview/internal distribution build.

On 2026-06-13, the project validated the core AI analysis architecture with a
real wakeboard video. The recommended direction is:

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

Latest known project checkpoint:

```text
4807a10 Create permanent project memory system
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
- The app has also been installed and opened as a standalone iPhone app through
  an EAS preview/internal distribution build, without Expo Go.
- Expo SDK was downgraded to SDK 54 for compatibility with the user's current App Store Expo Go.
- The first screen shows the local Stage 2 ActivityGroup / Session prototype.
- ActivityGroups can be selected.
- Sessions are filtered by the selected ActivityGroup.
- A new local Session can be added and appears immediately.
- Locally added Session state now persists on-device with AsyncStorage.
- TypeScript validation passed.
- Expo dependency validation passed.
- Stage 1 review was added in `REVIEW.md`.
- Stage 2 planning was documented in `docs/STAGE_2_PLAN.md`.
- App Store build identifiers were added to `app.json`.
- EAS build/submit configuration was added in `eas.json`.
- `expo-image-picker` was added so the app can select a session video.
- `@react-native-async-storage/async-storage` was added for local on-device
  Session persistence before a real database exists.
- The app can attach a selected video URI to a new Session.
- A first real AI analysis request flow exists.
- The mobile mock AI analysis fallback was removed. If
  `EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT` is not configured, analysis is disabled or
  fails with a clear configuration error rather than returning fake feedback.
- The app can display AI-provided highlight scenes with image, timestamp, and description.
- The mobile app must not guess highlight timestamps; highlight selection belongs to server-side AI analysis.
- Development API spend target is under KRW 10,000/month.
- The dev analysis server uses conservative request, file-size, and output-token limits.
- The dev analysis server keeps Gemini as the app-facing endpoint at
  `/api/analyze-session-video`.
- A parallel OpenAI GPT-5.5 wakeboard benchmark endpoint exists at
  `/api/benchmarks/openai-wakeboard-video`. It first samples broad frames, asks
  GPT-5.5 to scout candidate highlight windows, then samples focused frames
  inside those windows for the final coaching response.
- The app has a Session detail flow that can request Gemini coaching and GPT
  benchmark coaching for the same locally persisted Session/video.
- `/health` reports `primaryProvider: "gemini"` plus OpenAI benchmark
  configuration.
- Real Gemini video analysis is working through the local server-mediated path.
- The OpenAI GPT benchmark path is working for same-video comparison.
- GPT coaching/report quality improved after the benchmark pipeline moved to
  richer motion context.
- Gemini evidence extraction is implemented at `/api/extract-session-evidence`.
- The app supports a user-confirmed trick flow, stored separately from the
  AI-estimated trick.
- Motion-aware dense sampling is implemented for the OpenAI benchmark path:
  broad scan first, then focused frame extraction around the action window.
- Gemini evidence now reports model quality mode and requires user confirmation
  when Flash-Lite fallback, partial recovery, low confidence, or internal
  consistency warnings are present.
- A lightweight domain consistency validation layer flags obvious contradictions
  such as heelside approach plus Front Roll classification before coaching.
- The user's iPhone could open `http://10.10.7.17:8787/health` from Safari on
  the same Wi-Fi, confirming LAN access from iPhone to the Mac dev server.
- EAS preview environment variable was created:
  `EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT=http://10.10.7.17:8787/api/analyze-session-video`.
- Render backend is deployed and alive at:
  `https://action-sports-journal-api.onrender.com`.
- Public HTTPS health check passes with `ok: true`, `geminiConfigured: true`,
  and `geminiEvidence.configured: true`.
- EAS preview/internal distribution now points the installed app at:
  `https://action-sports-journal-api.onrender.com/api/analyze-session-video`.
- The app has been installed on the user's iPhone as a standalone EAS internal
  distribution app, not Expo Go, TestFlight, or App Store.
- The standalone app works without the local Mac server and uses the Render
  backend for thumbnail generation and Gemini evidence/coaching requests.
- Gemini API key rotation was completed in Render and local `.env.local`
  without exposing key values. The previous `API_KEY_INVALID` issue is fixed.
- Evidence extraction works from the standalone app, and evidence quality was
  judged good in iPhone QA.
- Coaching requests reach the backend/AI path, but the current next issue is a
  structured parsing failure in the coaching response flow.

## Today's Conclusions

## 2026-06-15 AI Evidence Checkpoint

Today's implementation is stopped at a clean checkpoint. The next work should
not modify coaching or UI first. Continue from the AI evidence layer.

Confirmed findings:

- The standalone iPhone app works.
- The Render backend works.
- Gemini evidence extraction works from the installed standalone app.
- A clear Toeside Basic Jump was initially misclassified as Back Roll /
  Tantrum / Invert with high confidence.
- The root cause was not JSON parsing or app-side post-processing.
- The false positives originated in raw model evidence, with missing wakeboard
  taxonomy structure and insufficient family gates.
- A wakeboard trick taxonomy reference was introduced.
- A wakeboard validation matrix was introduced.
- A Taxonomy Gate was implemented to prevent direct jumps from basic air into
  advanced invert tricks when parent-family evidence is missing.
- `ApproachObservedFacts` was implemented so the model must first report
  stance, lead foot, board direction, wake path, edge evidence, handle
  position, and body orientation.
- `FinalApproachWindow` design and implementation were added so approach
  detection is anchored near wake crossing and takeoff rather than inferred
  from the whole clip.
- Toeside detection improved significantly in QA.
- Invalid Tantrum classifications are now downgraded instead of confidently
  returned as app-facing results.

Open questions:

- Unknown: why Gemini still believes inversion exists in the test clip.
- Unknown: whether inversion detection is using incorrect visual cues.
- Unknown: whether inversion evidence is being inferred from airtime/body
  position rather than true inversion mechanics.

Current AI architecture direction:

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

Next starting point:

```text
Inversion Detection
```

Next goal:

- Design and validate `InversionObservedFacts` before modifying trick
  classification again.
- Candidate facts: `bodyInverted`, `boardAboveHead`, `rollAxis`, `flipAxis`,
  `rotationInitiation`, and `inversionConfidence`.
- First understand why nonexistent inversion evidence is being generated.

2026-06-14 clarified the product identity.

Action Sports Journal is now defined as:

```text
Private Action Sports Moment Feed
+
AI Coach
```

The product direction moved from Session First to Moment First. Users should
feel they are revisiting riding moments, not browsing session records. Feed is
more important than dashboard, content is more important than data, and riding
moments are the primary product. AI Coach is a secondary layer that adds
meaning, evidence, and coaching after the user is already engaged by the clip.

Major product/design conclusions:

- The Moment Feed direction was validated in iPhone QA.
- An Instagram-style personal action sports feed is a stronger direction than a
  GoPro clone. GoPro / Red Bull remain visual inspiration only.
- Korean mobile product feel should be preferred over a pure US extreme-sports
  aesthetic.
- Large real thumbnails significantly improve perceived product quality.
- Feed immersion matters more than card styling.
- Edge-to-edge content feels better than floating cards.
- Top dashboard/summary areas reduce immersion.
- Users want to open the app to relive riding moments, not to read reports.

Current UX status:

- Session Feed improved significantly.
- Moment Feed direction is validated.
- Thumbnail support is validated.
- Story rail direction is validated.
- Current primary UX weakness is the Detail Screen.

AI remains a long-term continuous effort. Event Window Detection is still a
core future investment area. Wakeboard trick identity should be judged with
phase-weighted evidence: stance, edge, approach, takeoff/pop, rotation
initiation, early airborne rotation axis, peak-air body orientation, descent
setup, and landing outcome. Landing/crash is outcome evidence and coaching
context, not the primary source of trick identity.

Current priorities:

- P1: Detail Screen UX, thumbnail experience, content-first experience.
- P2: Progression visibility, story / moment presentation.
- P3: Event Window Detection, trick recognition consistency.

## 2026-06-14 Project History

What changed today:

- The app direction shifted from a Session list/database to a private Moment
  Feed.
- The feed became visual-first with larger video-derived thumbnails.
- A story-style recent moments rail was added.
- The top dashboard/summary area was reduced because it weakened immersion.
- Feed cards were moved toward edge-to-edge content instead of floating boxes.
- Lightweight local video thumbnail generation was added for local/dev use.
- Lightweight local video playback was added to the detail screen.
- The detail screen received a first pass toward hero video/thumbnail first,
  moment first, AI second, long text last.
- End-of-day product knowledge was captured in
  `docs/AI_COACHING_PRINCIPLES.md`.
- Deployment readiness moved from planning to a working standalone milestone:
  Render now hosts the backend, EAS internal distribution installs the iPhone
  app, and the app no longer depends on the local Mac/LAN server.

Why it changed:

- iPhone QA showed that real thumbnails improved perceived product quality more
  than visual styling alone.
- The app felt too much like a database, note app, or session log.
- Users should want to relive riding moments, not read another report.
- AI coaching is valuable only after the user feels the AI understands the
  riding moment.

What was rejected:

- A pure GoPro / Red Bull clone direction.
- A dashboard-first home screen.
- Large top summary/stat blocks.
- Floating record-style session cards.
- Treating AI score/report output as the main product.
- Continuing AI system work during this UX/product pass.
- Adding database, cloud storage, backend streaming, or production video
  storage.

What was validated:

- Moment Feed product direction.
- Story rail as a useful navigation/presentation layer.
- Large real thumbnails as a major quality lever.
- Edge-to-edge content as more immersive than card styling.
- Korean mobile product polish should guide the product more than US
  extreme-sports media aesthetics.
- Thumbnail generation and local detail playback are good enough for local/dev
  evaluation.
- Public HTTPS backend access from the installed standalone app.
- Render-hosted thumbnail generation.
- Render-hosted Gemini evidence extraction after API key rotation.
- Local-first iPhone storage remains sufficient for personal early usage.

Architecture status:

- Data remains local-first on the iPhone through AsyncStorage.
- Backend is a thin AI gateway plus thumbnail generation server.
- No database yet.
- No login yet.
- No cloud video storage yet.
- No CDN yet.
- AI keys live only in Render environment variables and local ignored env files.
- Future optimization: move thumbnail generation on-device if practical.

## If I Return Tomorrow

Start here:

1. Investigate the coaching structured parsing failure now that requests reach
   the Render backend and AI successfully.
2. Do not redesign the feed unless new iPhone QA explicitly asks for it.
3. QA the Detail Screen on iPhone first.
4. Decide whether the detail screen feels like reviewing a riding moment or
   still feels like reading an analysis report.
5. If it still feels report-like, improve only Detail Screen UX:
   hero media first, moment context second, AI coach third, long text last.
6. Review Progression UX without turning the app back into a dashboard.
7. Keep AI logic untouched unless the user explicitly switches back to AI work.
8. After Detail Screen is acceptable, work on progression visibility without
   turning the app back into a dashboard.

Open questions for tomorrow:

- Does the current Detail Screen hero feel immersive enough on iPhone?
- Should the detail screen behave more like an Instagram post, a Reels detail,
  or a coach review drawer?
- How should progression be shown without reintroducing dashboard/database
  feeling?
- Which local thumbnail frame is most representative for wakeboarding clips?
- When should Event Window Detection become the next primary AI investment?

## Current Tech Versions

- Expo: `~54.0.35`
- React Native: `0.81.5`
- React: `19.1.0`
- TypeScript: `~5.9.2`
- AsyncStorage: `2.2.0`

Use Node 20 or newer when running Expo locally.

## Key Files

- `AGENTS.md`: project rules and product philosophy
- `docs/PROJECT_CHARTER.md`: product charter
- `docs/MASTER_PLAN.md`: long-term plan
- `docs/CURRENT_STAGE.md`: current stage description
- `docs/CONTINUITY_CHECKPOINT.md`: latest cross-session status checkpoint
- `docs/STAGE_2_PLAN.md`: Stage 2 plan and scope
- `docs/STAGE_3_VIDEO_ANALYSIS_PLAN.md`: video-to-analysis scope and API contract
- `docs/DEV_AI_ANALYSIS_SETUP.md`: local Gemini/OpenAI setup and spend guardrails
- `docs/DEPLOYMENT_READINESS_ROADMAP.md`: Render/EAS internal distribution deployment path
- `docs/OPENAI_BENCHMARK_REPORT.md`: OpenAI vs Gemini benchmark procedure and pending report
- `REVIEW.md`: Stage 1 repository review
- `App.tsx`: app entry
- `src/features/sessions/HomeScreen.tsx`: current first screen
- `src/services/ai/analyzeSessionVideo.ts`: remote analysis request adapter
- `dev-server/index.ts`: local Gemini analysis server plus parallel OpenAI GPT-5.5 benchmark endpoint
- `src/types/index.ts`: initial domain types
- `eas.json`: EAS preview/internal and production profiles
- `app.json`: native identifiers, EAS project ID, iOS encryption metadata

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

- Database
- Authentication
- Phone login
- Coupons
- Expense tracking
- Calendar
- RAG
- Production video upload or storage
- Production database/cloud storage implementation

Do not put Gemini or OpenAI API keys in the mobile app. Real AI analysis should go through a server/BFF endpoint.

## How To Resume In A New Terminal Codex Session

```bash
cd /Users/parkjongsun/Repository/action-sports-journal-app
codex
```

Suggested first prompt:

```text
AGENTS.md, docs/HANDOFF.md, docs/CURRENT_STAGE.md, docs/CONTINUITY_CHECKPOINT.md, docs/STAGE_3_VIDEO_ANALYSIS_PLAN.md, docs/DEV_AI_ANALYSIS_SETUP.md, docs/OPENAI_BENCHMARK_REPORT.md를 먼저 읽고, Gemini는 유지한 상태에서 OpenAI GPT-5.5 wakeboard benchmark를 이어서 진행해줘.
```

## How To Run Locally For AI Analysis

```bash
cd /Users/parkjongsun/Repository/action-sports-journal-app
npm install
npm run server:dev
```

Then on the iPhone, open:

```text
http://YOUR_COMPUTER_LAN_IP:8787/health
```

For the 2026-06-12 session, the working LAN IP was:

```text
http://10.10.7.17:8787/health
```

If the iPhone cannot open `/health`, the installed app cannot reach the local
AI server either. Check that the iPhone and Mac are on the same Wi-Fi and that
the endpoint IP matches the current Mac LAN IP.

## How To Build Standalone iPhone Preview

Use EAS preview/internal distribution:

```bash
npx eas-cli@latest build --platform ios --profile preview
```

The user's Expo account is `jspark88`. The EAS project ID is:

```text
f6e1a90a-62fb-4485-9434-ca92a756b8f4
```

The registered iPhone device:

```text
Name: iphone12 mini
UDID: 00008101-000404943640001E
Apple Team ID: L339A3KKLC
```

For a different Mac/session, verify EAS auth and environment variables:

```bash
npx eas-cli@latest whoami
npx eas-cli@latest env:list --environment preview
```

The preview environment currently points at Render:

```text
EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT=https://action-sports-journal-api.onrender.com/api/analyze-session-video
```

If the backend URL changes, update this EAS preview variable and rebuild.

## Recommended Next Step

Do not add unrelated product features yet. Continue from the current Moment
First UX work:

1. Investigate the coaching structured parsing failure.
2. Continue Detail Screen QA on iPhone.
3. Review Progression UX.
4. Keep Feed mostly frozen unless QA finds a specific issue.
5. Keep database/auth/cloud video storage/CDN out of scope.

## Related Personal Context Repo

The user also has a private Codex context repository:

```text
/Users/parkjongsun/Repository/codex-personal-context
https://github.com/jongsunP/codex-personal-context
```

That repository stores non-secret context for cross-session continuity.
