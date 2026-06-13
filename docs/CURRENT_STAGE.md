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

On 2026-06-14, the product direction was refined through iPhone QA:

```text
Action Sports Journal
=
Private Action Sports Moment Feed
+
AI Coach
```

The product is no longer being treated as a Session database. The current
direction is Moment First: users should open the app to revisit riding moments,
not browse session records. Riding moments are the primary product. AI Coach is
a secondary layer that explains, confirms, and coaches after the user is
already engaged by the clip.

## Today's Conclusions

Today's product conclusion: Session First became Moment First.

- Feed > Dashboard.
- Content > Data.
- Users want to revisit riding moments, not browse session records.
- The Instagram-style personal action sports feed direction is stronger than a
  GoPro clone. GoPro / Red Bull remain visual inspiration only.
- Korean mobile product feel should be preferred over a pure US extreme-sports
  aesthetic.
- Large thumbnails significantly improve perceived product quality.
- Feed immersion matters more than card styling.
- Edge-to-edge content feels better than floating cards.
- Top dashboard/summary areas reduce immersion.
- Session Feed, Moment Feed direction, thumbnail support, and story rail
  direction are validated.
- Current primary UX weakness is the Detail Screen.

AI development remains a long-term continuous effort. Event Window Detection is
still a core future investment area. For wakeboarding, trick identity is
primarily determined around pop and rotation initiation, with setup and early
airborne mechanics as important context. Landing/crash is outcome evidence and
coaching context, not primary trick identity evidence.

The current AI split remains:

```text
Gemini = primary video/motion/trick evidence extractor
GPT = coaching/reporting engine after confirmed rider intent
```

Current priorities:

- P1: Detail Screen UX, thumbnail experience, content-first experience.
- P2: Progression visibility, story / moment presentation.
- P3: Event Window Detection, trick recognition consistency.

## 2026-06-14 Product History

Today changed the product framing more than the architecture.

Changed:

- The app moved from Session First to Moment First.
- Feed became the primary experience; dashboard/stat UI moved down in priority.
- Session cards became moment/content tiles.
- Real video-derived thumbnails became a core UX requirement.
- Story rail became part of the product direction.
- Detail Screen started moving from report view toward moment review.

Why:

- iPhone QA showed users respond to their riding content first.
- The app felt too much like a database, note-taking app, or session log.
- Real thumbnails and edge-to-edge content made the app feel more like a
  commercial mobile product than styling alone.

Rejected:

- Pure GoPro clone direction.
- US extreme-sports media aesthetic as the main identity.
- Dashboard-first home screen.
- Floating session-record cards.
- AI-first product framing.
- New AI/backend/database work during this UX pass.

Validated:

- Private action sports Moment Feed + AI Coach.
- Instagram-style personal action sports feed direction.
- Large thumbnails.
- Story-style recent moments.
- Feed immersion and edge-to-edge content.
- AI Coach as secondary layer.

Open questions:

- Whether the latest Detail Screen pass is good enough on iPhone.
- How to show progression without returning to a dashboard.
- How to make AI evidence accessible without making the screen feel like a
  report.
- Whether local thumbnail generation should choose a smarter representative
  frame later.
- When to resume Event Window Detection as the primary AI track.

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
- Instagram-style personal Moment Feed first version
- Story-style recent moments rail
- Lightweight video-derived thumbnail support
- Lightweight local video playback from Session detail
- First pass Detail Screen UX with hero video/thumbnail first, moment first,
  AI second, long text last

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

Do not add unrelated product features yet.

If returning tomorrow, continue here:

1. Review Detail Screen on iPhone.
2. Decide whether the Detail Screen now feels like reviewing a riding moment
   rather than reading a report.
3. Continue improving thumbnail experience and content-first presentation.
4. Then improve progression visibility and story/moment presentation.
5. Resume Event Window Detection and trick-recognition consistency after the
   primary moment experience is stable.

Open questions:

- Long-term Gemini availability and 503 reliability.
- GPT vs Gemini quality after confirmed trick input.
- Evidence schema evolution without a hard-coded full trick database.
- User progression analysis across repeated Sessions.
- Detail Screen product feel.
- Best way to show progression without turning the app back into a dashboard.

## Resume Notes

For a new Codex session, read `AGENTS.md`, `docs/HANDOFF.md`,
`docs/CONTINUITY_CHECKPOINT.md`, `docs/CURRENT_STAGE.md`, and
`docs/DEV_AI_ANALYSIS_SETUP.md` first.
