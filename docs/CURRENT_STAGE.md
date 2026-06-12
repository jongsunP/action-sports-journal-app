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
Session, and request analysis through `EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT`. The
mobile mock analysis fallback has been removed.

The app can render AI-provided highlight scene cards, but it does not infer
highlight timestamps locally.

Development API usage should stay under KRW 10,000/month. The local dev server has conservative limits for file size, daily requests, rate limiting, and output tokens.

On 2026-06-12, the app was installed and opened on the user's iPhone as a
standalone EAS preview/internal distribution app, without Expo Go. The local
dev-server was confirmed reachable from the iPhone at:

```text
http://10.10.7.17:8787/health
```

Earlier validation without local keys reported:

```text
primaryProvider: gemini
geminiConfigured: false
openAiBenchmark.configured: false
openAiBenchmark.model: gpt-5.5
```

The server starts successfully with Gemini as the app-facing endpoint and OpenAI
as a parallel benchmark endpoint. The current local workspace can report both
`geminiConfigured: true` and OpenAI benchmark `configured: true` when
`.env.local` is present. Do not commit or paste those local keys.

On 2026-06-13, the real wakeboard-video architecture was validated:

- Gemini real video analysis works.
- OpenAI benchmark analysis works.
- GPT coaching/report quality improved after richer motion-aware sampling.
- Gemini evidence extraction is implemented.
- User-confirmed trick flow is implemented.
- Motion-aware dense sampling is implemented for the OpenAI benchmark path.
- Gemini Flash-Lite fallback is treated as degraded mode only.
- Domain consistency warnings now prevent internally inconsistent AI estimates
  from proceeding as reliable coaching facts.

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

## Today's Conclusions

AI coaching quality and exact trick recognition are separate problems. GPT is
strong at coaching/report generation, but Gemini is currently stronger for
video and motion evidence extraction. User confirmation is required because
exact trick recognition is not yet reliable enough to trust automatically.
Motion-aware analysis is significantly better than uniform frame sampling for
wakeboard clips because the decisive sequence is usually edge load, takeoff,
pop, airborne rotation, and landing.

The latest repeated Back Roll video tests show a better failure mode: Gemini
now generally stays in the plausible Back Roll/Tantrum-family range instead of
returning obviously unrelated tricks. However, exact trick naming is still not
reliable enough to skip user confirmation. After setting
`GEMINI_EVIDENCE_MAX_OUTPUT_TOKENS=6000`, the latest evidence response completed
normally and the app displayed all structured evidence fields.

The evidence prompt was then tightened to classify trick identity from motion
mechanics before landing outcome: approach, edge pattern, takeoff mechanics,
shoulder/hip movement, rotation axis, and body orientation during inversion.
The user reported this made the Back Roll evidence result much better.
Landing/crash is now explicitly secondary because a crashed HS Back Roll is
still an HS Back Roll attempt.

Future evaluation should use this domain rule: wakeboard trick identity is
primarily determined by stance, edge, approach, takeoff, pop, and rotation
initiation. Landing and crash are outcomes, not primary trick-classification
evidence.

The recommended split is:

```text
Gemini = primary video/motion/trick evidence extractor
GPT = coaching/reporting engine after confirmed rider intent
```

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
- Gemini evidence endpoint at `/api/extract-session-evidence`
- User confirmation UI for AI-estimated trick candidates
- Normalized evidence fields for trick candidate, approach, rotation, landing,
  evidence windows, observations, confidence, uncertainty, model, quality mode,
  and consistency warnings
- Motion-aware dense sampling in the OpenAI benchmark path
- EAS preview environment variable for the dev analysis endpoint
- In-app Session detail flow for requesting Gemini coaching and GPT benchmark
  coaching against the same locally persisted Session/video

## What Does Not Exist Yet

- Database
- Login or phone authentication
- Coupons or expenses
- Calendar
- RAG
- Production video upload and storage logic
- Production server-side AI analysis infrastructure
- Production-quality AI pipeline from confirmed Gemini evidence into GPT
  coaching
- Long-term model availability strategy for Gemini 503/high-demand periods
- Evidence schema evolution beyond the current lightweight prototype
- Stored user progression analysis across Sessions

## Next Recommended Step

Do not add unrelated product features yet. The next technical step is to test
the evidence-first coaching loop:

1. Run Gemini evidence extraction on the same wakeboard video with the primary
   Gemini model, not Flash-Lite degraded mode.
2. Confirm or correct the intended trick in the app.
3. Compare GPT vs Gemini coaching quality after the confirmed trick is supplied.
4. Decide the first stored Session intelligence shape from evidence,
   confirmation, coaching, confidence, and uncertainty.

Open questions:

- Long-term Gemini availability and 503 reliability.
- GPT vs Gemini quality after confirmed trick input.
- Evidence schema evolution without a hard-coded full trick database.
- User progression analysis across repeated Sessions.

## Resume Notes

For a new Codex session, read `AGENTS.md`, `docs/HANDOFF.md`,
`docs/CONTINUITY_CHECKPOINT.md`, `docs/CURRENT_STAGE.md`, and
`docs/DEV_AI_ANALYSIS_SETUP.md` first.
