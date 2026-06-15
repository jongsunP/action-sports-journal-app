# Current Stage

`docs/PROJECT_MEMORY.md` is the primary source of truth and project operating
system. Read it first for top-level project memory, collaboration rules,
product philosophy, AI architecture direction, and current resume point.

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

On 2026-06-14, the backend was deployed to Render and the standalone iPhone app
was installed through EAS preview/internal distribution using the public HTTPS
Render endpoint:

```text
https://action-sports-journal-api.onrender.com/api/analyze-session-video
```

The installed app is not Expo Go, TestFlight, or App Store. It runs as a
standalone iPhone app and no longer depends on the local Mac/LAN server.

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

Wakeboard taxonomy reference:

```text
docs/WAKEBOARD_TRICK_TAXONOMY_REFERENCE.md
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

Deployment milestone:

- Render backend is live at `https://action-sports-journal-api.onrender.com`.
- `/health` returns `ok: true`, `geminiConfigured: true`, and
  `geminiEvidence.configured: true`.
- Gemini API key rotation was completed in Render and local `.env.local`
  without exposing key values.
- The previous `API_KEY_INVALID` issue is fixed.
- Thumbnail generation works through the Render backend.
- Evidence extraction works from the standalone app and evidence quality is
  good.
- Coaching requests reach the backend/AI path, but the current next issue is a
  structured parsing failure in the coaching response flow.

Infrastructure milestone on 2026-06-15:

- Supabase Phase 1 preparation is documented and scaffolded.
- Node standard is now Node 22 LTS.
- Initial schema draft exists for `users`, `moments`, `analysis_jobs`, and
  `evidence_results`.
- Supabase SDK client scaffold exists, but the app is not product-wired to
  Supabase yet.
- Supabase env values are present locally.
- `npm run supabase:smoke` confirms Supabase connection with service role.
- Phase 1 schema is not applied yet: `users`, `moments`, `analysis_jobs`, and
  `evidence_results` are still missing in Supabase.
- The next architecture direction is synchronous analysis to asynchronous
  background analysis.
- Async transition plan exists at `docs/ASYNC_ANALYSIS_PLAN.md`.

AI evidence checkpoint:

- Gemini evidence extraction works from the standalone app.
- A clear Toeside Basic Jump was initially misclassified as Back Roll /
  Tantrum / Invert.
- The initial false positive was not caused by parsing or app-side
  post-processing.
- The root cause involved raw model hallucination plus missing wakeboard trick
  taxonomy structure.
- Wakeboard trick taxonomy and validation matrix documents exist.
- A Taxonomy Gate is implemented to block invalid parent-family jumps.
- `ApproachObservedFacts` is implemented so approach is derived from observed
  facts instead of a raw heelside/toeside label when possible.
- `FinalApproachWindow` is implemented so approach evidence is anchored near
  wake crossing and takeoff, not inferred from the whole clip.
- `InversionObservedFacts` v1 is implemented so inversion evidence is captured
  as observed facts before family classification.
- Invert Family is allowed only when `boardAboveHead`, `bodyInverted`, or
  `rollAxisObserved` is true.
- Toeside detection improved significantly.
- Invalid Tantrum classifications are now downgraded instead of confidently
  returned.

Current AI unknowns:

- Unknown: whether `InversionObservedFacts` v1 will correctly report no
  `boardAboveHead` / no roll-axis on the real test clip.
- Unknown: whether inversion detection is using incorrect visual cues.
- Unknown: whether inversion evidence is inferred from airtime/body position
  rather than true inversion mechanics.

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
- Wakeboard Trick Taxonomy Gate for family-level classification safety
- `ApproachObservedFacts` and `FinalApproachWindow` fields in the evidence path
- `InversionObservedFacts` v1 fields in the evidence path
- Motion-aware dense sampling in the OpenAI benchmark path
- EAS preview environment variable for the dev analysis endpoint
- EAS preview environment variable for the Render analysis endpoint
- In-app Session detail flow for requesting Gemini coaching and GPT benchmark
  coaching against the same locally persisted Session/video
- Render-hosted thin AI gateway plus thumbnail generation server
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
- Database-backed production persistence
- Production-quality AI pipeline from confirmed Gemini evidence into GPT
  coaching
- Long-term model availability strategy for Gemini 503/high-demand periods
- Stored user progression analysis across Sessions

## Next Recommended Step

Do not add unrelated product features yet.

If returning tomorrow, continue here:

1. Apply `supabase/phase1_schema.sql` in the Supabase SQL editor.
2. Re-run `npm run supabase:smoke` and confirm `schemaReady: true`.
3. Start the server-side DB write spike before changing mobile UX.
4. Use `docs/ASYNC_ANALYSIS_PLAN.md` as the implementation guide for
   synchronous to asynchronous analysis.
5. If returning to AI truthfulness, run the real test clip through
   `InversionObservedFacts` v1 before modifying trick classification again.
6. Investigate the coaching structured parsing failure.
7. Review Detail Screen on iPhone.
8. Keep Feed mostly frozen unless new iPhone QA identifies a specific issue.

Open questions:

- Long-term Gemini availability and 503 reliability.
- GPT vs Gemini quality after confirmed trick input.
- InversionObservedFacts design without overfitting one clip.
- Evidence schema evolution without a hard-coded full trick database.
- User progression analysis across repeated Sessions.
- Detail Screen product feel.
- Best way to show progression without turning the app back into a dashboard.

## Resume Notes

For a new Codex session, read `AGENTS.md`, `docs/HANDOFF.md`,
`docs/CONTINUITY_CHECKPOINT.md`, `docs/CURRENT_STAGE.md`, and
`docs/ASYNC_ANALYSIS_PLAN.md` first. Read `docs/DEV_AI_ANALYSIS_SETUP.md` when
working on the AI backend or model behavior.
