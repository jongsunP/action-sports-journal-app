# Current Stage

`docs/PROJECT_MEMORY.md` is the primary source of truth and project operating
system. Read it first for top-level project memory, collaboration rules,
product philosophy, AI architecture direction, and current resume point.

## Stage

Stage 1: Initial project setup complete.

Stage 2: Local-only ActivityGroup / Session prototype complete.

Stage 3: Standalone iPhone video-to-analysis prototype in progress.

## Current Status

Build 94 Startup Performance Observability QA build complete / Founder
multi-day observation pending, 2026-06-30:

- Build commit is `880ed23 chore: bump ios build number to 94`.
- iOS buildNumber is `94`.
- EAS Build ID is `9ee5a132-44c5-4760-95d6-f76c2e4b3a67`.
- Install page:
  `https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/9ee5a132-44c5-4760-95d6-f76c2e4b3a67`.
- IPA URL:
  `https://expo.dev/artifacts/eas/d-BUTLamUVWmSAK1Lmz7PvuLrvCQ7478Extr_tOyoSM.ipa`.
- Purpose: observation build only. Build 93 showed Home boot around 1-2 seconds
  while Video ready could take 4-6 seconds; Build 94 adds diagnostics to split
  that time before making optimization changes.
- Included Startup Performance Observability P1:
  - Server `/api/moments` timing logs: `totalMs`, `momentsQueryMs`,
    `evidenceQueryMs`, `thumbnailSignedUrlMs`, `normalizationMs`,
    `momentCount`, `includeThumbnailCount`, `includeEvidenceCount`, and
    `limit`.
  - Client Video diagnostics: `apiMs`, `source`, `bootPageReused`,
    `duplicateVideoFetchBlocked`, and `clientNormalizeMs`.
  - QA Debug Video line now shows `api/source`, plus `ui/norm/bootReuse/
    dupBlocked`.
- Next start point: observe Build 94 over the next few days and compare QA
  Debug values with server logs before deciding whether to optimize `/api/
  moments`, thumbnail signed URLs, archive fetch reuse, or client rendering.

Startup Performance Observability P2 implemented after Build 94 QA feedback,
2026-07-01:

- `/api/moments` timing logs now include `requestId`, `resolveRequestUserMs`,
  `authGetUserMs`, `publicUserLookupMs`, `publicUserUpsertOrSyncMs`,
  `staleCleanupMs`, `responseBytes`, and `serverTotalMs`.
- `totalMs` remains as the legacy server total alias; compare it with
  `serverTotalMs` and the app QA Debug `apiMs`.
- `X-ASJ-Request-Id` is returned so device screenshots and Render logs can be
  matched more easily.
- No endpoint optimization, API contract split, DB migration, Render setting,
  or external console change was made.
- Next build should verify whether app `apiMs` is close to server `serverTotalMs`
  or whether time is being lost outside the server handler.

Build 95 Startup Performance Observability P2 QA build complete, 2026-07-01:

- Build commit is `f49481e chore: bump ios build number to 95`.
- iOS buildNumber is `95`.
- EAS Build ID is `b45e226d-60f7-458d-ab2e-e814f33ca6c6`.
- Install page:
  `https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/b45e226d-60f7-458d-ab2e-e814f33ca6c6`.
- IPA URL:
  `https://expo.dev/artifacts/eas/DP8-ZCgYSgzIFm1KnPRst7kmiJ3Ld_TCvzlHyTekFoY.ipa`.
- Purpose: observation build only. Verify P2 `/api/moments` timing fields on
  the real iPhone + Render + Supabase/Auth/Storage path.
- Next start point: check Build 95 P2 timing QA results, especially app QA
  Debug `apiMs` versus Render `[moments_timing] serverTotalMs`.

Startup Performance Observability P2.1 implemented, 2026-07-01:

- Server now returns `X-ASJ-Server-Total-Ms` with `/api/moments` responses in
  addition to the existing `X-ASJ-Request-Id`.
- Client reads both headers from `listMomentsPage()` and carries them through
  boot reuse and archive fetch diagnostics.
- QA Debug Video area now shows a short request id and server total line:
  `Video req {shortId} · server {ms}ms`.
- No performance optimization, API payload contract change, DB migration, EAS
  build, paid AI call, or external console change was made.

Build 96 Startup Performance Observability P2.1 QA build complete, 2026-07-01:

- Build commit is `4f8f4a2 chore: bump ios build number to 96`.
- iOS buildNumber is `96`.
- EAS Build ID is `68b17987-b5f8-4a6f-9a06-7a2260c69708`.
- Install page:
  `https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/68b17987-b5f8-4a6f-9a06-7a2260c69708`.
- IPA URL:
  `https://expo.dev/artifacts/eas/JgPGyJ5Y3njSGS6-Q6MFc7zdpwjNFqmA6StePZzUssQ.ipa`.
- Purpose: observation build only. It should show app QA Debug `apiMs`,
  `serverTotalMs`, and short `requestId` together.
- Next start point: check Build 96 P2.1 timing QA results before deciding on
  endpoint optimization or Development Build / Local Build Workflow.

Build 93 pre-AI QA build complete / Founder QA pending, 2026-06-30:

- Build prep commit is `47f75ea chore: prepare pre-ai calibration qa build`.
- iOS buildNumber is `93`.
- EAS Build ID is `c944b65e-deec-4c6a-9f12-b5f43ea7fd82`.
- Install page:
  `https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/c944b65e-deec-4c6a-9f12-b5f43ea7fd82`.
- IPA URL:
  `https://expo.dev/artifacts/eas/SD62MoyuGy2qrl2C9Wg6HwQ1Z0QyjoZmIzP0PcN-1yU.ipa`.
- This build is intended as the post-UI/UX/theme/settings and Render Starter
  baseline QA build before AI Calibration.
- The Founder will use the build slowly over the next few days and report QA
  feedback in the next session.
- Treat Build 93 QA as pending until Founder real-use feedback is received.
- Expected QA scope:
  - Home / Video / Settings / Account Recovery visible polish.
  - System / Light / Dark theme selection and persistence.
  - Upload CTA and Settings footer/version behavior.
  - Email/Kakao recovery entry through Settings.
  - Upload / Compression regression.
  - Media Preview original-vs-thumbnail policy.
  - Detail Share Preview / Evidence disclosure with real completed samples.
  - Boot first-page / Video first-page duplicate-request guard.
  - Render Starter startup and Video sync behavior.
  - QA Debug Panel remains useful for QA and does not expose sensitive values.

AI pre-build hardening pass, 2026-06-30:

- Boot first page / Video first page duplicate request guard P1 is implemented.
- The app still does not issue an internal `/health` prewarm request on boot.
  Render Starter removes the Free-plan sleep variable, but app startup remains
  driven by auth bootstrap, boot remote moment sync, and screen-level data
  loading.
- Video Archive now treats a boot-loaded `/api/moments?limit=20` first page as
  already loaded synchronously through refs before React state updates settle.
  This prevents the Video tab effect from firing a same-page fetch in the same
  render/effect cycle.
- A separate in-flight ref also blocks duplicate Video first-page requests while
  the first request is pending.
- Owner/session cache resets clear the new refs together with the existing
  Video Archive state, so account recovery or owner switch can still load a
  fresh first page.
- User-facing app-name search was rechecked. Visible app-name copy remains
  `Wake Board`; remaining `ASJ`, `Action Sports Journal`, `Wakeboard`, payload,
  and token-related matches are docs, internal type names, logs, backend/auth
  helpers, or gated QA/debug paths rather than default user-facing UI.
- Upload compression POC remains hidden unless
  `EXPO_PUBLIC_ENABLE_UPLOAD_COMPRESSION_POC=true`. QA Debug Panel remains
  intentionally visible for preview/internal QA and must still be hidden or
  gated before production distribution.
- This pass is the final small hardening step before the next standalone QA
  build. No `/health` prewarm, Auth/DB/API/Upload core, AI, package, or build
  number change was made.
- Last pre-build Simulator UI feedback was applied after this pass:
  - Settings `화면 모드` options are now icon-only centered chips with
    accessibility labels preserved.
  - Account Recovery removed remaining default description/helper copy from the
    first view and method cards; only title, state, CTA, and necessary
    pending/error/completion messages remain.
  - Home, Settings, Account Recovery, Video, Growth, boot loading, and related
    placeholder headers now avoid decorative English/brand eyebrows above the
    main Korean page title. Settings version copy is positioned as a lower
    footer rather than normal content.

Render Starter baseline, 2026-06-30:

- Render Web Service was changed from Free to Starter in the Render Dashboard
  before AI Calibration to remove the free-plan sleep/cold-start variable.
- No app code, environment variable, build number, DB, Auth, or Supabase setting
  changed for this step.
- Current app analysis endpoint still points to the production Render service
  host. The endpoint was checked without printing tokens/secrets.
- `GET /health` on the Render production service passed twice:
  - First call: HTTP 200, about 334 ms curl total time.
  - Second call: HTTP 200, about 244 ms curl total time.
  - Non-secret health summary: `ok=true`, `primaryProvider=gemini`,
    `geminiConfigured=true`, `mockAi.enabled=false`.
- Interpretation: the Free cold-start variable has been removed for the next
  standalone QA baseline. Continue using QA Debug Panel values if first launch
  or Video sync latency reappears; do not treat this as proof that all startup
  latency is solved.

Theme Mode P2 - User Selectable System / Light / Dark, 2026-06-30:

- Implemented user-facing theme selection before AI Calibration.
- Access point:
  - Home header keeps the primary Upload CTA and a single Profile/Settings
    entry.
  - The former Home inline Profile/Settings hub was replaced with a standalone
    `Settings` stack screen because floating over Home felt like a QA/dev
    convenience instead of a service pattern.
  - `Settings` groups `계정 보호 / 복구`, `화면 모드`, and `QA 진단 패널` 안내.
  - Theme selection lives on `Settings` as `시스템`, `라이트`, and `다크`.
  - Account Recovery remains its own stack page, but the user path is now
    Home -> Settings -> `계정 보호 / 복구` -> Account Recovery.
  - User-facing app naming now avoids `ASJ` / `Action Sports Journal`; visible
    app-name copy uses `Wake Board` when a name is needed. Internal docs,
    variables, logs, and developer-only references can still use ASJ.
  - Settings copy was simplified after Founder review. Menu rows avoid
    excessive descriptions because the patterns are familiar; the screen keeps
    labels/status only where useful.
  - Settings footer shows the app version as `Wake Board 1.0.0` via Expo config
    version metadata, without git hash, build hash, env, or secret values.
  - Light-mode Home Upload CTA uses an accent background with a white icon so it
    does not appear as a black blob.
- Behavior:
  - Uses existing `ThemePreference = system | light | dark`.
  - Preference is saved to AsyncStorage and restored on app restart.
  - `system` resolves from the OS color scheme through `useColorScheme()`.
  - App root background and StatusBar now use the resolved theme.
- Visible rollout scope:
  - Home shell, header actions, theme selector, Journal Snapshot, Recent
    Insight, Recent Sessions empty/card surfaces.
  - Bottom tab active/inactive states and icon colors.
  - Video Archive header, empty/error/list surfaces.
  - Account Recovery protection hub, method cards, Email/Kakao detailed states,
    input, badges, success/warning/error states.
  - Upload entry/basic surface through shared Home styles.
  - Moment Detail major surfaces through shared detail styles: media fallback,
    thumbnail-only state, review/analysis/evidence panels, share preview, and
    debug surfaces.
  - QA Debug Panel light/dark surface and text colors.
- Simulator verification:
  - Header structure: Home now reads as Upload + Profile/Settings only, not
    Upload + Theme + Account and not an inline settings overlay.
  - Settings stack screen opens from the Home profile/settings icon.
  - Light mode: Home, Video empty state, Account Recovery hub, and QA Debug
    Panel were visually checked for text contrast, card boundaries, CTA weight,
    and tab active/inactive states.
  - Dark mode: ASJ dark-first tone, recent icon polish, card hierarchy, and tab
    weight remained intact.
  - System mode: resolved to the simulator OS theme and changed with the stored
    preference path.
  - Restart persistence: selected dark mode survived Expo Go termination and
    relaunch through the existing project entry.
- Remaining theme backlog:
  - Full real-data Moment Detail QA with completed evidence / media sample.
  - Upload selected-video and progress states need the next device/simulator QA
    with an allowed media picker.
  - Further token cleanup can remove hardcoded colors over time, but the main
    user-visible surfaces now support usable System / Light / Dark modes.
  - Before production distribution, re-check QA Debug Panel visibility and any
    other debug-only surfaces.

Final Design / UI / UX Closeout Audit, 2026-06-30:

- Final read-only audit completed after Account Recovery UI IA P1, Visible UI /
  UX Polish P1/P2, Ionicons App Chrome pass, and Theme Mode P1 foundation.
- Overall judgment: no additional visible design/UI/UX blocker remains before
  AI Calibration. The current app still has deliberate pre-production traits:
  dark-first styling, visible QA Debug Panel, and theme tokens that are not yet
  rolled out screen-by-screen.
- Immediate polish result: no code polish was needed in this closeout pass.
  Remaining `Gemini`, payload, and POC terms found in source are internal names,
  logs, or explicitly gated debug/POC surfaces rather than default rider-facing
  UI.
- Simulator spot check covered Home empty state, app chrome / bottom tabs,
  Video empty state, and Account Recovery protection hub. These surfaces are
  ready for the next bundled standalone QA pass.
- Remaining design backlog is non-blocking for AI Calibration:
  - Hide or gate QA Debug Panel before production distribution.
  - Continue screen-by-screen hardcoded color cleanup as touched.
  - Verify completed Moment Detail / Share Preview with real standalone sample
    data.
  - Verify Upload selected-video/progress surfaces with real media picker access.
  - Choose a later Media / Share step: image export, native share sheet, or
    ShareResult route.

Theme Mode P1 - System / Light / Dark Foundation, 2026-06-30:

- Feasibility result:
  - Full light/dark rollout is not a small safe change today. Home, Video,
    Detail, Upload, Account Recovery, QA Debug, and debug viewers still contain
    many hardcoded colors.
  - ASJ already reads `useColorScheme()` in Home for limited dark styling, but
    this is not a real app-wide theme system.
  - No shared theme/color token file existed before this pass.
- Implemented low-risk foundation only:
  - Added `ThemePreference = system | light | dark`.
  - Added `ResolvedThemeMode = light | dark`.
  - Added dark and light token objects for the core color categories:
    background, surface, elevated surface, border, text primary/secondary/muted,
    accent, success, warning, error, and status bar style.
  - Added AsyncStorage-backed preference helpers with default `system`.
  - Added `useAppTheme()` hook that resolves saved preference + system
    color scheme.
- Not implemented in P1:
  - No Settings/Profile UI for choosing theme mode.
  - No app-wide color replacement.
  - No forced light-mode visual rollout.
  - No Auth / DB / API / Upload / AI behavior change.
- Next safe step:
  - Add a Settings/Profile surface later and expose System / Light / Dark there.
  - Apply tokens screen-by-screen, starting with App container, Home shell, and
    Account Recovery, after visual QA of the light palette.

Icon Library + Light/Dark Theme Feasibility, 2026-06-30:

- Feasibility result:
  - Chose `@expo/vector-icons` / Ionicons for the current scope.
  - `lucide-react-native` was not adopted because it would add a new runtime
    dependency path, while Expo already supports `@expo/vector-icons` and the
    package was present in the local install tree.
  - Added `@expo/vector-icons` as an explicit package dependency via
    `npx expo install @expo/vector-icons` so future installs do not rely on a
    transitive dependency.
  - This is an icon/font asset dependency, not an Auth, DB, API, Upload, AI, or
    native module behavior change. A normal standalone QA build is still useful
    before product decisions, but no EAS build was run for this change.
- Implemented low-risk App Chrome icon pass:
  - Bottom tabs now use Ionicons for Home, Video, and Growth. Growth uses
    `trending-up` so it reads as progress, not a generic "more" tab.
  - Home upload CTA uses a video camera icon, and the account entry uses a
    person-circle icon.
  - Video empty/timeout/error visual cue uses film / cloud-offline icons.
  - Account Recovery method cards use a generic chat bubble for Kakao and mail
    icon for Email. No official Kakao logo or new brand symbol was created.
- Light/Dark theme result:
  - Deferred to a separate design/token pass. The app still has many hardcoded
    colors across Home, Account Recovery, Detail, Upload, QA Debug, and debug
    viewers.
  - Recommended next theme step is not full light mode immediately, but a small
    `theme/colors` token layer for background, surface, border, text primary /
    secondary, accent, success, warning, and error.
  - Full Appearance / `useColorScheme` support should be a separate scoped task
    after the token layer exists.

Visible UI / UX Polish P2 - App Chrome & Empty States, 2026-06-30:

- Implemented as the next no-build polish pass after P1. This remains a
  View/Text primitive polish only: no new icon library, no `package.json`
  change, no brand-symbol work, and no Auth / DB / API / Upload pipeline / AI
  behavior change.
- App chrome:
  - Bottom tab primitive icons were tightened. Home now reads more like a
    journal/card, Video like a film frame, and Growth now uses rising bars
    instead of three dots so it no longer looks like a generic "more" tab.
  - Active tab visual weight was increased with a subtle selected background
    and stronger icon opacity.
  - Home upload CTA is now a brighter primary action with a small primitive
    film-plus mark instead of a plain `+` glyph.
  - Home account/menu entry now uses a primitive profile mark instead of the
    `☰` placeholder.
- Empty/error/copy:
  - Video empty / delayed / timeout / error copy was shortened toward rider
    journal language and away from raw empty-data explanation.
  - Upload no-selected and selected-video copy now reads more like creating a
    riding record instead of only running an upload pipeline.
  - Missing-media Detail copy was softened for completed records and
    non-completed states.
- Analysis/detail:
  - Opened evidence detail copy now says "분석 신호" instead of model/provider
    language such as "AI 근거 · 일반 분석".
  - User-facing status copy no longer names Gemini in processing state.
  - Developer endpoint text was removed from the Moment Detail user surface.
- Account Recovery:
  - Helper text under the method hub was shortened without changing Email/Kakao
    recovery behavior.
- Next standalone QA should include a quick visual check of bottom tabs, Home
  upload/account actions, Video empty/error states, Upload selected/progress
  copy, Detail evidence disclosure opened state, and Account Recovery density.

Visible UI / UX Polish P1, 2026-06-30:

- Implemented as the last small polish pass before the next standalone QA build
  and before AI Calibration. This is a visible UI/copy pass only, not a logic,
  Auth, DB, API, Storage, or AI behavior change.
- Visible copy polish:
  - Removed future-feature wording from the Video Archive header. The archive
    now says it is showing recent records instead of promising date/trick
    grouping that does not exist yet.
  - Replaced remaining user-facing `Wake Board Loading...` prototype copy with
    Korean loading copy.
  - Tightened Home empty copy so it points to the actual left-top `+` upload
    entry instead of a vague "top upload button".
- Account Recovery method cards now have small primitive leading visuals:
  yellow `K` chip for Kakao and muted blue `@` chip for Email. No new icon
  library, custom logo, or Auth behavior was introduced.
- Video empty/timeout/error states now include a small primitive film-frame cue
  and keep retry copy/button visible when retry is available.
- Moment Detail keeps Share Preview and rider-facing analysis as the default
  completed experience. Technical Gemini evidence is now behind a
  "세부 근거 보기" disclosure, and developer endpoint copy is not visible by
  default.
- Upload debug surface was checked. The upload compression POC panel now renders
  only when `EXPO_PUBLIC_ENABLE_UPLOAD_COMPRESSION_POC=true`, so QA/debug terms
  such as payload/meta/upload target do not appear in the normal dev or
  preview/internal user-facing upload surface.
- Next standalone QA should include a quick visual pass for Home empty copy,
  Video empty/error states, Account Recovery method cards, completed Moment
  Detail evidence disclosure, and Upload debug-surface absence.

Account Recovery UI Information Architecture P1, 2026-06-30:

- Founder direction: ASJ UI/UX should rely on proven mobile patterns rather than
  inventing novel interaction systems. uibowl and similar reference libraries
  may be used to study structures such as account settings, connect account,
  recovery, and auth-method choice. References should inform hierarchy and flow,
  not be copied visually.
- Instagram remains the strongest behavioral reference because ASJ's target
  riders are media-native and Instagram-familiar. This is a product-learning
  reference, not a mandate to copy Instagram screens.
- `AccountRecoveryScreen` should remain a stack-style independent page like
  Upload because recovery has its own cancel/pending/error/success states.
- The current problem is information density: current account state, Email
  Recovery, Kakao Recovery, pending/error/linked explanations, and technical
  "anonymous device account" language are visible together.
- Implemented P1 direction: keep the independent page, but turn the first view
  into a compact protection-method hub. The first view now shows a short
  protection summary, connected-method badges, and method cards such as
  "카카오로 계속하기" and "이메일로 계속하기". Email/Kakao detailed state is shown only
  after the user selects or starts that method.
- Kakao one-click recovery and Email single CTA behavior are preserved. This is
  an information architecture/UI exposure change only, not an Auth/Supabase,
  DB, ownership, or recovery-helper change.
- Not recommended for P1: tabs, because they make Email/Kakao feel like
  competing settings; bottom sheets, because OAuth/email-link flows can outgrow
  the sheet and conflict with background/foreground lifecycle; immediate nested
  stack split, because progressive disclosure inside the current screen is
  safer first.
- Simulator/local QA is still needed before this is bundled into a standalone
  QA build.

Build 92 baseline QA build complete / Founder QA pending, 2026-06-29:

- Build prep commit is `e96e0b7 chore: prepare ai calibration baseline qa build`.
- iOS buildNumber is `92`.
- EAS Build ID: `83730ee0-dae1-4073-9db8-a1c779c09fb9`.
- EAS build page:
  `https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/83730ee0-dae1-4073-9db8-a1c779c09fb9`.
- Install/archive URL:
  `https://expo.dev/artifacts/eas/dAL0Ya7FtxSRWeB1_x7QxDEknsn7F2mGIx2j3hKDADs.ipa`.
- Build 92 is the AI Calibration baseline QA build. It should verify the
  completed pre-AI foundation/media work before ASJ moves into AI Calibration.
- Build 92 QA produced two UX/policy fixes that are now implemented after the
  build and need a follow-up standalone QA build: Email Recovery single CTA and
  completed-media compressed preview priority cleanup. Build 92 itself does not
  include those follow-up fixes.
- After Build 92 QA, the Render Web Service was upgraded from Free to Starter
  ($7/mo). `/health` now responds normally on repeated calls, so the next
  standalone QA build can use a more stable backend baseline before AI
  Calibration.

Build 91 closeout, 2026-06-29:

- iOS preview/internal Build 91 completed successfully.
- Build number: `91`.
- Build commit: `4775fab chore: bump ios build number to 91`.
- EAS build page:
  `https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/1a54b6f7-6c95-4c5c-9d78-09035306360b`.
- Install/archive URL:
  `https://expo.dev/artifacts/eas/DVcaOrdwyk6f-8WEneGF1xY8wcmuQLzZpM695elWf1I.ipa`.
- Build 91 includes Upload Unified Progress UX, Upload Selection Size Validation
  Fix, Compression Upload Flow P1, and Video no-records timeout UI fix.
- Build 91 real-device QA passed for Upload Unified Progress UX, Upload
  Selection Size Validation Fix, Compression Upload Flow P1, Video no-records
  timeout UI fix, and compressed-video upload through completed analysis.
- User feedback after Build 91:
  - First launch can still feel slow after idle time, while later opens are
    acceptable once the backend is awake. New decision: after the current
    AI-before-baseline build QA, upgrade the Render Web Service to Starter
    ($7/mo) before AI Calibration so the free-plan cold start variable is
    removed during upload/analysis debugging.
  - After deleting the original iOS Photos video, a compressed-video preview can
    still play. Read-only investigation shows the completed Moment source
    Storage object is deleted, thumbnails remain in `moment-thumbnails`, and DB
    `source_video_uri` still points to a local `file:` URI. Current likely source
    is the app-local compressed temp file / persisted local video asset, not the
    deleted Photos original and not the Supabase source object. Treat this as a
    product-policy follow-up: keep playable local compressed previews, or clear
    local compressed video after completion and rely on thumbnail-only preview.
- AI Calibration note from follow-up discussion: when ASJ returns to analysis
  accuracy work, the first calibration slice should be TS/HS Evidence rather
  than broad trick-name tuning. MediaPipe may be evaluated as a feasibility spike
  for Motion Evidence Extraction, but only as a candidate support signal after
  real ASJ sample validation. EverEx is a useful adjacent reference for later AI
  development: not a direct competitor because it is healthcare/rehab focused,
  but it shows how AI motion analysis can be productized around trust,
  personalized feedback, and long-term progress tracking. ASJ should translate
  that lesson into action-sports language: moment evidence, rider growth, and
  readable next-step feedback rather than medical/rehab positioning.

Media Preview Policy P1 implementation / Build 92 feedback tightening,
2026-06-29:

- Implemented in commit `a395d37 fix: prefer thumbnails for completed compressed
  previews`.
- Build 92 QA showed that compressed local video could still outrank original
  or thumbnail display. The tightened policy is: original local video stays the
  user-facing preview when available; completed Moments with thumbnail available
  should not use compressed local upload assets as Detail playback; if only a
  compressed completed asset is available, Detail falls back to thumbnail-only.
- Uploading/queued/processing/failed states can still use compressed preview so
  the rider can confirm the just-selected upload while the Moment is still
  converging.
- New uploads keep the original local video as the user-facing asset while the
  compressed asset is used only as the final upload file.
- After a compressed upload successfully creates a server Moment, the compressed
  temp file is best-effort deleted. This does not change server source-video
  cleanup policy and does not migrate old persisted data.
- Standalone Build QA is still needed in the next approved build.

Auth Bootstrap Timeout / Observability and Email Recovery Sign-in P1,
2026-06-29:

- Auth bootstrap observability is complete for the current implementable scope.
  `AuthSessionProvider` now records bootstrap status/stage/duration/reason for
  `getSession`, `getUser`, and anonymous sign-in, and the QA Debug Panel exposes
  this without tokens, email, or full user ids.
- The goal is not to guarantee backend cold starts disappear. The goal is to
  prevent permanent app loading and make slow Supabase/session bootstrap
  distinguishable from boot remote sync and Video archive first-page loading.
- Email Recovery Sign-in P1 is implemented but not standalone-E2E verified yet.
  Build 92 feedback removed the separate Email connection/recovery CTA choice
  from the UI. The screen now uses one "이메일로 계속하기" CTA: it first tries
  current-account connection with `updateUser({ email })`, and only if the email
  is already registered does it continue into recovery sign-in with
  `signInWithOtp({ shouldCreateUser: false, emailRedirectTo })`.
- Selected recovery redirect path:
  `actionsportsjournal://auth/email/recovery`.
- The app handles initial/runtime email recovery callback URLs, accepts code
  exchange or hash session payloads, refreshes with `getSession` + `getUser`,
  and treats callback error / missing payload / missing session as not
  completed rather than success.
- `AccountRecoveryScreen` keeps the local unsynced/uploading work guard before
  requesting a recovery sign-in email. The user no longer has to choose between
  "connect" and "recover" for Email.
- No EAS build or buildNumber change was performed in this pass. Next required
  QA is standalone iPhone E2E with a suitable test email: request recovery link
  -> tap email link -> ASJ app return -> session switches to existing
  email-linked user -> Home/Video/Detail reload under that owner.

Media / Share UX P1 implementation, 2026-06-29:

- Media / Share UX P1 is implemented as a share-ready presentation foundation,
  not an external sharing feature.
- Completed Moments with visible evidence now show a "공유 미리보기" card in
  Moment Detail, directly below the media area and above the rider-facing
  analysis card.
- The preview uses the existing thumbnail when available, with a text fallback
  when no thumbnail exists. It includes date/session title, rider-facing
  analysis title, confidence label, one-line summary, up to two confirmed
  signals, and light ASJ branding.
- No Instagram/Kakao direct share, image export, native share sheet, server
  share page, public feed, ShareResult persistence, ShareResult route, AI
  calibration, or MediaPipe work was added.
- Next candidates remain image export, native share sheet, or ShareResult route,
  but those need separate product/QA approval and likely standalone build
  validation.

Future Media UX P1 - Detail Media State Polish, 2026-06-29:

- Implemented as a Detail-only media hero polish on top of Media Preview Policy
  P1 and Media / Share UX P1.
- Video playback is unchanged when a valid user-facing video exists.
- Thumbnail-only Detail states now render as a representative image with a
  compact "대표 이미지" overlay, so completed records feel intentional rather
  than broken when compressed local playback is suppressed.
- Missing-media fallback copy now separates completed records from
  non-completed states: completed Moments explain that analysis and journal
  results remain available, while processing/failed/non-completed states explain
  that video access or preview preparation is still needed.
- No Home, Video Archive, SharePreviewCard, export/share, storage cleanup,
  storage policy, DB schema, AI calibration, or MediaPipe work was added.
- Next media UX candidates remain Archive Card Visual Hierarchy, image export,
  native share sheet, or ShareResult route, each requiring separate approval.

Archive Card Visual Hierarchy P1, 2026-06-29:

- Implemented as the final Media UX polish candidate before AI Calibration.
- Video tab archive rows now read more like rider journal records than raw
  video file rows: the card separates journal label, date, title, status, and a
  short state-aware description.
- Description fallback is now journal-oriented. Completed evidence says the
  analysis summary is available, review-needed evidence says the analysis record
  needs confirmation, running states say analysis is being prepared, failed
  states say the record can be retried, and no-video states say the record has no
  video.
- Session notes still take priority when present.
- The card intentionally does not expose primary trick names, confidence scores,
  raw evidence text, image export, native share, public feed, routes, schema,
  storage, or AI Calibration changes.
- With Media Preview Policy P1, Detail Media State Polish, Media / Share UX P1,
  and Archive Card Visual Hierarchy P1 complete, the next major product-quality
  candidate can move to AI Calibration, starting with TS/HS Evidence.

Kakao display_name fallback and OAuth step reduction closeout, 2026-06-29:

- Kakao display_name fallback is implemented in the authenticated server user
  resolver. `public.users.display_name` now uses `full_name`, `name`,
  `preferred_username`, `user_name`, then email when syncing metadata from the
  authenticated Supabase user.
- This remains safe for the current product because ASJ does not yet expose
  user-edited display names. When user-custom display names are introduced, the
  metadata overwrite policy must be revisited.
- OAuth Step Reduction Investigation is complete for the current scope. The ASJ
  app already keeps Kakao continue one-click inside the app, but the remaining
  Kakao/iOS web-auth "continue" prompts are platform/provider OAuth steps rather
  than an ASJ internal second CTA.
- No OAuth bypass, no redirect flow rewrite, no Supabase/Kakao dashboard
  mutation, and no `signInWithOAuth` / `linkIdentity` semantics change was
  made.
- Store-before-release follow-up: review Kakao/Supabase app display, redirect,
  and consent settings, but do not try to bypass ASWebAuthenticationSession or
  provider consent prompts.

Daily wrap-up, 2026-06-25:

Kakao Recovery / Account Linking is the verified recovery path as of Build 75.
Supabase Kakao provider, Manual Identity Linking, anonymous sign-ins, Kakao
Developers redirect URI, and the `actionsportsjournal` app scheme are in place.
Build 75 confirmed standalone iOS OAuth return and connected-state UX. Read-only
Auth/DB checks confirmed Kakao identity
`9aaaf219-bdf9-4fe5-91df-1a59ec57d558` is attached to existing Auth user
`499d7e71-623c-4b4e-8653-267d72ac3ca6`; no separate new Auth user was observed;
`public.users.id` `6b03b289-a6aa-4f26-aa66-6730e1cca2fe`, push token owner,
and Realtime channel basis
`analysis-updates:auth:499d7e71-623c-4b4e-8653-267d72ac3ca6` stayed consistent.
The QA user had no existing Moments, so Moment ownership continuity should be
rechecked later with a pre-existing Moment sample.

Kakao Linking UI follow-up is now closed beyond Build 75: false success is
blocked, linked-state copy is clearer, and cleanup confirmed the same Kakao
account can be linked to a fresh anonymous user after the old test account is
removed. The remaining product gap moved from linking to reinstall/new-device
recovery sign-in. `linkIdentity` stays scoped to connecting Kakao as a recovery
method for the current anonymous/device-first account. The separate "기존 기록
복구하기 -> Kakao로 복구" flow now uses `signInWithOAuth` to switch the app
session to the existing Kakao-linked Auth user, then expects ownership, Push
token registration, Realtime subscription, and Home/Video/Detail refresh to
converge under that recovered user.

Kakao Recovery Sign-in P1 is complete after Build 81 standalone iPhone QA. P1
includes a separate Kakao recovery sign-in helper, `recoverWithKakao` in
`AuthSessionProvider`, a distinct "기존 기록 복구하기" section in
`AccountRecoveryScreen`, and a local-work guard for unsynced/uploading work.
Simulator/UI gate passed for the screen path and copy separation, and Build 81
confirmed the real-device flow: fresh anonymous state -> account/recovery screen
-> "카카오로 기존 기록 복구" -> Kakao login/consent -> ASJ app return -> existing
Kakao-linked account recovered. Build 81 used build number `81`, EAS Build ID
`24ca707e-f248-4533-9953-2cc7912af651`, and install/log URL
`https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/24ca707e-f248-4533-9953-2cc7912af651`.

Email Recovery Connection P1 is implemented and has partial Build 87 standalone
iPhone QA coverage. The flow remains scoped to connecting a recovery email to
the current anonymous/device-first account. It does not implement reinstall/new
device email recovery sign-in. The app passes an explicit redirect target for
`updateUser({ email })`: `actionsportsjournal://auth/email/change`, listens for
initial/runtime email-change callback URLs, handles code exchange or hash
session payloads, and refreshes session/user state with `getSession` +
`getUser` after callback completion.

Build 87 QA confirmed that entering an already registered email returns the
expected `A user with this email address has already been registered.` style
error. This supports that Supabase Auth is enforcing existing email ownership.
Fresh-email confirmation-link QA could not be completed in this pass because
the hosted email sender hit rate limits. This is not an immediate next task.
Keep the remaining fresh email link click -> ASJ app return -> connected state
-> relaunch persistence check as a later backlog item, and do not keep
repeating `updateUser({ email })` attempts while rate-limited.

Build 87 follow-up closeout, 2026-06-27:

- Real-use Loading Diagnosis P1 was checked after Build 87 and the user reported
  no issue. Keep QA Debug observation available, but this is not an active
  blocker.
- Recovery Attempt Observability P1 has its `recovery_attempts` migration
  applied and authenticated insert smoke completed. The smoke confirmed
  `user_id` / `auth_user_id` linkage, sanitized metadata, no raw email/token/code
  persistence, and no-token 401.
- Upload File Handling Policy P1 is complete for the current build-prep scope:
  30MB / 15 seconds final-file policy, FE basic validation, backend policy
  authority, error-code mapping, and simulator/local UI check are complete.
- Compression / Upload Optimization POC reached successful Build 89 real-device
  QA: the QA-only compression action was visible, compression ran, file size
  decreased, and final-file metadata / sanitized `uploadProcessing` could be
  inspected.
- Email Recovery fresh-link QA reached successful Build 89 real-device QA with
  `parksunl77@daum.net`: ASJ app return, no-manual-refresh linked state, and
  relaunch persistence all passed.

Build 88/89 Email Recovery fresh-link QA follow-up, 2026-06-27:

- Fresh-link QA with `parksunl77@daum.net` confirmed backend/Auth success:
  Auth email is linked, `new_email` is null, `email_confirmed_at` exists,
  `public.users.email` is synchronized, and the same app user has one push token.
- User-facing issue: after the email link returned to ASJ, the screen did not
  automatically switch to "복구 준비 완료"; manual "연결 상태 새로고침" showed the
  correct linked state, and app relaunch could look disconnected.
- Minimal fix applied: initial Auth session restore and auth-state changes now
  refresh `getUser()` into `session.user`; AccountRecoveryScreen rebuilds linked
  UI state whenever `user.email` is present; callback results with a refreshed
  email are normalized as succeeded for recovery attempt observability.
- Build 89 QA completed the fresh-link flow with `parksunl77@daum.net`: the email
  link returned to ASJ, the screen showed "복구 준비 완료" without manual refresh,
  and the linked state persisted after full app relaunch. Email Recovery
  Connection P1 is complete for current-account recovery-method connection.

Build 89 Compression / Upload Optimization POC QA, 2026-06-27:

- Build 89 exposed the QA-only "QA 압축 메타 확인" action in the iOS
  preview/internal app.
- Real-device QA confirmed local compression execution, reduced file size after
  compression, preserved/available duration and MIME information, a compressed
  local URI, final-file upload target payload, and sanitized `uploadProcessing`
  metadata.
- The POC is successful as a measurement/proof path. It is not yet promoted to
  the normal upload flow, and actual Storage upload / AI analysis remains outside
  this POC unless explicitly approved.

Build QA Video tab loading-state follow-up, 2026-06-27:

- Build QA screenshots showed a no-records case where boot remote Moment sync
  timed out around 8 seconds and the Video tab could still show the
  "Wake Board Loading..." card even with home/archive/shown counts at 0.
- Root cause: `VideoArchiveList` already supported timeout/error states, but
  `HomeScreen` could still pass a user-facing `loading` state while boot sync
  was already `timeout` / `failed` and no fallback sessions existed.
- Minimal fix: Video tab now derives a separate UI load state. If boot sync is
  delayed and there are no visible Video rows, it shows a retryable delayed-sync
  empty state instead of an indefinite loading card. QA Debug still keeps the
  underlying Boot/Video diagnostics and now also shows the actual Video UI state.
- Validation: `npm run typecheck` passed. Next standalone QA should verify that
  timeout + count 0 shows "영상 기록 동기화가 지연 중입니다" rather than
  "Wake Board Loading...". This fix is commit
  `aa89f14 fix: avoid indefinite video loading after sync timeout`; it was not
  included in Build 89 and is a next-build verification candidate. The Video tab
  loading issue did not reproduce during Build 89 QA.

Email Recovery deep-link / redirect status, 2026-06-26:

- Email Recovery send path exists and current-account email connection
  completion is now implemented for standalone QA.
- `updateUser({ email })` should be treated as "connect an email recovery
  method to the current anonymous/device-first account".
- App delete/reinstall or new-device recovery requires a separate email
  recovery sign-in flow, likely based on
  `signInWithOtp({ shouldCreateUser: false, emailRedirectTo })`.
- Email needs the same product separation as Kakao: recovery-method connection
  versus existing-record recovery.
- The current Email connection path now has an app callback handler, initial URL
  handler, and runtime URL listener for `actionsportsjournal://auth/email/change`.
- `updateUser({ email })` now passes an explicit `emailRedirectTo` so it should
  no longer fall back to Supabase Site URL / localhost for this connection flow.
- The previous localhost / `otp_expired` smoke remains useful history, but
  Build 86 is the first standalone QA build for the fixed redirect path.
- The app scheme `actionsportsjournal` already exists and is verified by Kakao
  standalone OAuth E2E.
- The selected P1 redirect is `actionsportsjournal://auth/email/change`.
- Candidate Supabase allowlist values are `actionsportsjournal://**` or
  `actionsportsjournal://auth/email/**`.
- The callback handler accepts code exchange and hash access/refresh token
  payloads; error/expired/missing-payload callbacks do not show success.
- Fresh email link-validity QA is deferred to a later backlog item because the
  hosted sender is rate-limited. App delete/reinstall email recovery sign-in
  remains out of scope.

Email Recovery Connection P1, 2026-06-26:

- Current-account recovery email connection is implemented for the preview QA
  path.
- `updateUser({ email })` now passes an explicit app redirect target for the
  Email Change flow: `actionsportsjournal://auth/email/change`.
- The app handles both initial URL and runtime URL callbacks for the Email
  Change path, then refreshes session/user state with the existing auth provider.
- AccountRecoveryScreen copy was polished so this P1 reads as "connect a
  recovery email to the current device-first account", not as reinstall/new
  device recovery.
- Build 86 was created for standalone iPhone QA because Expo Go cannot validate
  the ASJ custom scheme email callback E2E. QA is pending from the Founder.
- Build 86 details: build number `86`, EAS Build ID
  `c7527f7e-d122-4f80-a743-c0a4560670f5`, implementation commit
  `5a66ce3 feat: complete email recovery linking redirect`, build commit
  `473c131 chore: prepare email recovery qa build`.
- This build only validates current-account Email Recovery Connection. Email
  Recovery Sign-in after reinstall/new-device remains a separate follow-up.

Foundation Safety Check, 2026-06-26:

Foundation Safety Check has run against the current code/docs/QA baseline before
adding more Journal UX, Analysis UX, or Media UX. This was not a large refactor.
The check classified the current foundation as usable with several watch items:

- Upload Reliability: WATCH. The target -> source upload -> finalize Moment ->
  analysis start path, recoverable orphan path, and local-only failure
  separation are in place. A small fix now blocks known >20MB videos in the
  picker before upload submit, matching the current storage/provider limit.
  If a platform does not expose `asset.fileSize`, server/storage validation
  remains the final guard.
- State Sync / Realtime / Push: PASS with WATCH follow-up. Private
  Realtime/foreground refresh remain the source of truth, Push stays
  notification-only, and Push Observability P2 still records token counts,
  Expo ticket mapping, receipt results, and `DeviceNotRegistered` token
  disabling.
- Identity / Ownership: WATCH. Authenticated API calls preserve the Supabase
  Auth -> `public.users` boundary, and core rows remain anchored on
  `public.users.id`. External No-Token Finalization is now complete; the
  internal default-user fallback is explicit dev/test opt-in only.
- Storage / Cleanup: WATCH. Uploaded-source metadata keeps provider, bucket,
  path, and upload target context for recovery/finalize. Source cleanup is
  explicit after completed analysis, while orphan cleanup remains a future
  careful item.
- Observability: WATCH. Upload, analysis, sync, Push, and recovery have enough
  logs/rows for current QA, and Push observability does not duplicate raw Expo
  tokens. Recovery Attempt Observability P1 now has a proposed
  `recovery_attempts` migration SQL, BFF endpoint, and client event helper, but
  the DB migration has not been applied yet.
- Recovery / Account Linking: PASS with WATCH follow-up. Kakao Account Linking
  and Kakao Recovery Sign-in P1 have passed real-device QA without splitting
  known ownership. Email Recovery remains baseline/fallback and still needs
  redirect/deep-link productization before completion.

Follow-up QA update: existing-Moment Kakao Recovery smoke passed from the
Founder side. The tested path was fresh install -> Kakao reconnect -> upload
video -> app restart confirms video exists -> delete app -> reinstall ->
anonymous state has no video -> Kakao reconnect -> previous video list appears.
This closes the user-facing ownership continuity concern for Kakao Recovery
Sign-in. DB read-only verification remains optional for a later low-level audit.

External No-Token Finalization, 2026-06-26:

External no-token/default-user fallback is now closed for normal app/API paths.
The server no longer allows the internal default user unless it is explicitly
enabled with `ALLOW_INTERNAL_DEFAULT_USER=true` and `APP_ENV=development` or
`APP_ENV=test`. The app-side fallback is also explicit-only through
`EXPO_PUBLIC_ALLOW_INTERNAL_DEFAULT_USER=true`; otherwise API calls require a
Supabase bearer token from the Anonymous Auth / recovered Kakao session.

Blocked no-token paths include Moment list/create/delete/status, upload target
creation/failure, source upload/finalize, stored-video analysis, legacy Gemini
analysis/evidence extraction, OpenAI benchmark, remote thumbnail fallback, and
Push token registration. Legacy momentId-based source/status/analysis routes
now verify that the Moment belongs to the resolved request user before writing
or queueing work. `GET /health` and explicitly internal/debug endpoints remain
separate from user-owned app data.

Local smoke used `MOCK_AI_ANALYSIS=true` and no paid AI calls. Confirmed:
`GET /health` returns `internalDefaultUserFallbackAllowed=false`, no-token
`GET /api/moments` returns 401, no-token
`POST /api/video-upload-targets` returns 401, invalid bearer returns 401, and
no-token `POST /api/push-tokens` returns 401. `npm run typecheck` passed.

Push Token Account-switch Policy, 2026-06-26:

Push token ownership policy is now explicit: the same device/expo push token
belongs to the currently authenticated app owner. The existing DB schema already
supports this because `device_push_tokens.expo_push_token` is unique and
`POST /api/push-tokens` upserts on `expo_push_token`, moving the token row to
the resolved request user's `public.users.id` when ownership changes. This
keeps old owners from receiving duplicate future analysis-completion pushes
after Kakao Recovery Sign-in.

The app now re-runs push token registration when an authenticated owner becomes
ready and on foreground retry, in addition to the existing upload-start ensure.
This covers anonymous -> Kakao recovered session switches without redesigning
Push delivery. Push remains notification-only and does not become a source of
truth for Moment sync.

Local/server smoke used two temporary anonymous Supabase Auth users and one fake
Expo token. Owner A registered the token, then owner B registered the same
token. The same `device_push_tokens.id` moved from owner A's `public.users.id`
to owner B's `public.users.id`, stayed `enabled=true`, and cleanup removed the
temporary Auth users, public user rows, and token row. No actual Push send, EAS
build, paid AI call, DB migration, or external console change was performed.
`npm run typecheck` passed.

No BLOCKED foundation item was found. The next foundation follow-ups are
Email Recovery deep-link strategy and applying the recovery-attempt migration
after user/CTO confirmation.
Kakao display-name sync has been investigated. Current Auth metadata provides
Kakao name candidates and the current `public.users.display_name` is already a
Kakao-name value, so immediate implementation is not needed. Keep only
`preferred_username` / `user_name` fallback and future user-edit overwrite
policy as low-priority follow-up.

Post-foundation Product UX Next-Step Review, 2026-06-26:

Foundation hardening is closed enough to restart product UX work. The
recommended first product task is Product UX Baseline P1: Unified User-Facing
Status Resolver. Treat this as a Journal / Analysis / Upload shared UX baseline,
not a backend status redesign.

Decision:

- Do this before a full Home v2 layout pass, Upload bottom sheet, Trick Review
  bottom sheet, visual gauges, or Media / Share work.
- Keep backend job/status semantics unchanged.
- Map user-visible Moment states consistently across Home, Recent Sessions,
  Primary Insight, Journal Timeline, Video list, and Detail.
- Visible state should stay simple: `진행중`, `완료`, `실패`.
- Validate in simulator/local UI first; no EAS build is needed for the first
  status-consistency pass.

Reasoning:

- Upload UX is stable enough after the 20MB pre-upload guard; compression and
  upload optimization remain separate later work.
- Kakao Recovery UX has a follow-up candidate: user-facing UI should eventually
  show one simple Kakao action instead of exposing internal "link" versus
  "recover" concepts. Internally the app can still branch between
  `linkIdentity` and recovery `signInWithOAuth`, guarded by local unsynced work
  and account state.
- Analysis UX needs trust improvements, but evidence/confidence/review surfaces
  should be built on top of consistent status language first.
- Journal UX is the right next product direction because ASJ must feel like a
  life log, not only an analysis or gallery app. A unified visible-status layer
  is the smallest safe slice that prepares Home v2 and Moment Detail.
- Media / Share UX remains important for Instagram-led growth, but it should
  wait until the app has stronger journal/detail cards worth sharing.

Implementation result:

- Product UX Baseline P1 is implemented.
- `src/features/sessions/momentStatus.ts` now exposes a UI-facing status
  presentation that maps Moment state to `진행중`, `완료`, or `실패` without
  changing backend status semantics.
- Home Primary Insight, Recent Sessions, Video Archive rows, and Moment Detail
  header now use the same visible status language.
- `queued`, `processing`, and `uploading` map to `진행중`; `completed` maps to
  `완료`; `failed` and `upload_failed` map to `실패`.
- Detailed state copy remains more specific where useful, such as upload
  guidance or analysis progress explanation.
- `npm run typecheck` passed. No EAS build, paid AI call, DB migration, or
  external console change was performed.

Kakao Single CTA Recovery UX, 2026-06-26:

The account/recovery screen now presents Kakao as one user-facing action instead
of separate "connect" and "recover" blocks. The visible CTA is centered on
"카카오로 계속하기" and the copy explains that Kakao can either protect the
current record or return the rider to an existing Kakao-linked record.

Internal ownership boundaries remain separate:

- Default path starts with `linkIdentity` to protect the current anonymous
  account and its existing local/remote records.
- If Kakao appears to be linked to another account, the same CTA now continues
  directly into the existing `recoverWithKakao` / `signInWithOAuth` recovery
  path instead of exposing a recover-ready intermediate app state.
- The local unsynced/uploading work guard still runs before recovery session
  switching.
- Already-linked users see a protected/connected state instead of another
  recovery action.

`npm run typecheck` passed. There was no EAS build, paid AI call, DB migration,
or external console change. Simulator UI was not launched in this pass because
no Metro/Expo session or booted simulator was active; OAuth/deep-link E2E still
requires a later standalone-device QA pass when a build is intentionally
scheduled.

Simulator UI check follow-up:

- Expo Go / iPhone 17 Simulator launched successfully from `npm run ios`.
- Home opened normally and the account/recovery screen was reachable from the
  Home header menu.
- The account/recovery screen showed one Kakao section only. The previous
  separate "카카오 복구 수단" and "기존 기록 복구하기" blocks were not visible.
- The default CTA centered on "카카오로 계속하기" and the copy fit without
  visible overflow or button clipping.
- Pressing the CTA showed the in-app "진행 중" state, opened the iOS OAuth
  confirmation prompt for `kauth.kakao.com`, and canceling returned to ASJ with
  the "카카오 진행이 취소됨" / "미완료" state.
- No actual Kakao login/deep-link completion was performed. Standalone OAuth
  E2E remains a later intentional build/QA item.

Build 84 real-device QA result:

- Build 84 passed the Kakao one-click recovery QA on the user's iPhone.
- Inside ASJ, one press on `카카오로 계속하기` successfully recovered the
  existing Kakao-linked account.
- The app did not expose the previous intermediate `확인 필요` state or
  `기존 기록으로 계속하기` second CTA during this path.
- Home, Video, and Detail restored under the existing account's remote data.
- Relaunching the app preserved the recovered state.
- The user still perceived two `계속` actions in the Kakao/iOS OAuth layer, but
  the app-internal one-click goal is met.
- Whether the OAuth-layer perceived steps can be reduced remains a separate
  backlog item, not a blocker for the ASJ one-click CTA requirement.

Build 85 Startup / Video Loading Observability QA result:

- Build 85 passed real-device QA for Startup / Video Tab Loading
  Observability P1 and the QA Debug Overlay/Panel.
- The QA button is visible in the preview/internal build and does not
  materially block the main tab interactions.
- The QA panel exposes auth/bootstrap, boot remote sync, and Video archive
  first-page state directly on device.
- Boot sync status, durationMs, count, hasMore, reason, and update time are
  visible.
- Video first-page status, durationMs, count, hasMore, reason, retry count, and
  update time are visible.
- The Video tab no longer appears trapped in an indefinite spinner for the
  tested path; timeout/error states now have a retryable UI path.
- No sensitive values are shown in the panel: no access token, refresh token,
  full callback URL, email/name, or full user id.

Current follow-up:

- If slow startup or Video spinner behavior recurs, capture the QA panel values
  first and classify whether the cause is app state, network latency, Render
  cold start, or Supabase latency.
- Render/Supabase plan upgrade should only be considered after QA panel values
  point to infrastructure latency.
- Auth bootstrap timeout/observability remains a later backlog item.
- QA Debug Panel should remain available during current testing because it is
  useful for timing/network-dependent issues. Hide/remove policy should be
  applied right before real service production distribution, not during current
  QA.

Real-use Loading Diagnosis / Auth Bootstrap Timeout & Remote Moment Sync P1
minimum fix, 2026-06-26:

- Build 85/86 QA logs showed Auth was healthy while boot remote Moment sync hit
  the 8 second timeout. Home could still show existing sessions later, while
  the Video tab could appear loading/empty because it used a separate archive
  first-page order.
- The app now records retry/recovery success after a boot timeout as
  `recovered_after_timeout` in boot diagnostics instead of leaving QA Debug
  stuck on the original timeout.
- Video tab now falls back to Home session summaries when archive first-page
  data has not loaded yet but Home already has sessions. The header labels this
  as "홈 기록 기준, 아카이브 동기화 중" so the user is not shown an empty archive
  while records exist elsewhere.
- QA Debug now separates counts as home / archive / shown so future captures
  can distinguish Home data from Video archive first-page data.
- `npm run typecheck` and `git diff --check` passed. Simulator UI verification
  could not run in this session because local `xcrun simctl` did not respond.
  No EAS build, paid AI call, DB/schema change, or external console change was
  performed.
- Build 87 real-device QA found no issue in this path. Treat the P1 fix as
  complete for now, but continue monitoring through the QA Debug panel because
  the original symptom depended on timing/network conditions.

Detail Menu / Retry Eligibility Polish, 2026-06-26:

Moment Detail now exposes a clearer action area instead of relying on a small
header delete icon and failure-only inline retry. The Detail surface keeps
backend status semantics unchanged and uses the existing retry eligibility
helper to explain what the user can do.

Implemented:

- Added a `작업` action panel under the video in Moment Detail.
- `분석 다시 시도` is always visible when retry is available from the screen
  contract, but it is disabled unless `getRetryEligibility()` allows retry.
- The panel shows the retry reason, such as "이미 정상 완료된 분석입니다." or
  "이미 분석 요청을 진행하고 있습니다."
- `삭제` is shown in the same action panel, keeping deletion visible without
  turning it into a hidden header-only affordance.
- Completed results prioritize viewing the result; retry is disabled.
- Running/uploading analysis keeps retry disabled and explains that work is in
  progress.
- Failed or upload-failed states still use the existing retry eligibility path
  and require a local/source video when needed.

Validation:

- `npm run typecheck` passed.
- `git diff --check` passed.
- Expo Go / iPhone 17 Simulator confirmed completed and running Detail states:
  completed state showed disabled retry, delete, and "이미 정상 완료된 분석입니다.";
  running state showed disabled retry, delete, and "이미 분석 요청을 진행하고
  있습니다."
- No EAS build, paid AI call, DB migration, or external console change was
  performed. A stale local sample emitted an upload warning during simulator
  refresh, but no upload or AI flow was intentionally started for this QA.

Home v2 / Journal UX First Slice, 2026-06-26:

Home's first screen now starts to read as a riding journal without changing the
data model or backend status semantics. This is a first slice only, not the
full Home v2 redesign.

Implemented:

- Added a compact `Journal Snapshot` band using existing Moment/session data:
  total records, completed records, in-progress records, and latest completed
  analysis date.
- Updated Home header copy from session/gallery framing toward journal record
  framing.
- Updated Primary Insight empty state to invite the rider to start a riding
  record, not just upload a video.
- Renamed the recent rail from "최근 세션" to "최근 기록" while preserving the
  existing horizontal rail and Detail navigation.
- Reused the existing UI-facing status resolver so Home continues to show
  `진행중`, `완료`, and `실패` consistently.
- Kept the upload CTA, Video Archive tab, and Moment Detail entry flow intact.

Validation:

- `npm run typecheck` passed.
- `git diff --check` passed.
- Expo Go / iPhone 17 Simulator confirmed the Home screen renders with Journal
  Snapshot, recent insight, and recent record rail. The Video tab still opens.
- Current local samples covered completed and failed records; empty-state copy
  was verified by code path/typecheck rather than a clean data reset.
- No EAS build, paid AI call, DB migration, or external console change was
  performed.

Upload Entry UX Polish, 2026-06-26:

Upload entry now stays with the existing route-backed/full-screen Upload flow
instead of moving to a bottom sheet. The current product direction is fast
media selection first: video pick -> selected video confirmation -> upload and
server analysis. There is no meaningful pre-submit choice that needs a bottom
sheet yet, and moving the flow into a sheet could make it look like the user
must fill in title/description before starting.

Implemented:

- Kept the Home upload CTA, picker, route-backed `UploadScreen`, selected-video
  confirmation, upload progress, failure/retry, and pre-upload validation
  flows intact.
- Added a clear Upload header: "새 기록 만들기" with short copy that explains
  the fast video-to-analysis path.
- Reframed selected video metadata as "선택한 라이딩 영상".
- Added a compact step strip: "영상 확인 -> 업로드 -> 분석 시작".
- Added short helper copy that analysis starts without a memo/title step and
  that the current upload limit is 30MB / 15 seconds.
- Updated the primary action copy to "업로드하고 분석 시작".
- Kept the upload safety message: upload can continue to server analysis after
  upload finishes, but the app should not be closed during the upload step.

Validation:

- `npm run typecheck` passed.
- `git diff --check` passed.
- Expo Go / iPhone 17 Simulator confirmed Home upload CTA opens the iOS video
  picker from a populated Home state.
- The selected-video Upload screen rendering was verified by code path and
  typecheck; the simulator picker did not complete selection during this pass.
- This section was later superseded by Upload File Handling Policy P1, which
  makes the current final-file policy 30MB / 15 seconds.
- No EAS build, paid AI call, DB migration, or external console change was
  performed.

Upload File Handling Policy P1, 2026-06-27:

Upload policy is now explicit: the backend does not try to know whether a file
is the user's original video or a future FE-compressed/downsized version. It only
evaluates the final file metadata that the app is about to upload. If ASJ later
adds local compression, that processing must happen before requesting a signed
upload URL, and the app must send the final file's `fileSize`, `duration`, and
`mimeType` to the backend.

Implemented:

- FE picker validation now requires a video asset with URI, supported MIME type,
  positive file size, and positive duration before opening UploadScreen.
- The current product upload policy is 30MB / 15 seconds for the final upload
  file.
- Backend upload target creation is the authority for final policy decisions:
  max size 30MB, max duration 15 seconds, and allowed MIME type.
- Backend policy violations now return clear `code` values:
  `too_large`, `too_long`, `unsupported_type`, `empty_file`, and
  `invalid_duration`.
- FE maps those backend codes to rider-facing Korean copy instead of showing a
  generic upload failure.
- Upload screen copy now says the current development/QA limit is 30MB / 15
  seconds.
- Compression / Upload Optimization POC is now implemented as a QA-only
  development path with `react-native-compressor`. It is not connected to the
  production upload path.
- The POC records original size, compressed size, reduction ratio, duration,
  MIME type, compressed URI, and the upload-target payload that would be sent
  for the final compressed file.
- Upload target request types now allow optional `uploadProcessing` metadata for
  observation only. Backend policy decisions still use only the final upload
  `fileSize`, `durationMs`, and `mimeType`; `uploadProcessing` is sanitized and
  is not persisted to DB in this step.
- Build 89 real-device QA confirmed that the QA compression action is visible,
  compression executes, compressed file size decreases, duration / MIME /
  compressed URI are available, and final-file upload target payload plus
  sanitized `uploadProcessing` metadata are visible.
- Compression POC is successful and has now been promoted into the normal upload
  submit path for conservative first use. When the selected final-file candidate
  is over 20MB, the app attempts local optimization before requesting an upload
  target; 20MB or smaller clips upload as the original. The backend still judges
  only the final upload file metadata.
- The first production-flow setting is deliberately mild: manual compression,
  `maxSize` 1080, bitrate 8Mbps, and no compression for files at or below 20MB.
  If optimization fails, the original file can still upload when it satisfies
  the 30MB / 15 seconds policy. The QA compression metadata button remains
  preview/internal only for now.
- Build 90 real-device QA/read-only follow-up confirmed the promoted compression
  upload flow works for an over-20MB short clip. A user-uploaded roughly 25MB
  original produced `FullSizeRender.compressed.mp4`; the final uploaded metadata
  stored on `moments` / `upload_targets` was 12,776,723 bytes, 12.83 seconds,
  `video/mp4`, and the upload target was finalized. Analysis continued through a
  completed Gemini job/evidence result. The source video object had already been
  deleted by retention/cleanup when checked, so Storage object size could not be
  re-read. `uploadProcessing` remains response/debug metadata only and is not
  persisted to DB; persist it later only if upload observability needs it.
- Upload Selection Size Validation Fix is complete in code: source files over
  30MB are no longer blocked only because of source size at picker time. The
  picker still validates basic video shape, MIME, positive file size, positive
  duration, and the 15 second duration limit. The 30MB size policy is enforced
  after optimization against the final upload file.
- Occasional first-open slowness now looks more like Render free cold start than
  local app cache when it only appears after idle time. This is still an
  observation, not proof. The Video tab infinite-loading symptom was a separate
  UI state bug and has already been fixed; later, consider a short Render plan
  A/B check if cold-start evidence remains important.

Analysis Trust UX, 2026-06-26:

Analysis result UI now makes the trust level easier to understand without
changing backend/model/schema semantics or running new AI analysis.

Implemented:

- Added a short rider-facing trust explanation to the top Analysis Summary
  card.
- Kept the visible trust states simple: `근거 충분`, `가능성 있음`, `확인 필요`.
- Added distinct badge tones for strong, possible, and review-needed analysis.
- Renamed "확인된 신호" to "판단 근거" so the user reads evidence as the basis
  for the result, not as an absolute truth claim.
- Kept "확인할 점" as the place for low-confidence / needs-review / ambiguous
  evidence notes.
- Updated the detailed evidence panel from technical English labels to more
  rider-facing Korean labels: "판단 근거 상세", "추정 기술", "확신 수준",
  "검토", "스탠스", "앞발", "웨이크 경로", and related confidence labels.
- Mapped raw confidence values to simple Korean levels: `높음`, `중간`, `낮음`.
- Preserved the internal debug viewer and existing evidence data. No result
  value is rewritten.

Validation:

- `npm run typecheck` passed.
- `git diff --check` passed.
- Expo Go / iPhone 17 Simulator confirmed a completed/needs-review Detail shows
  the new trust explanation, judgment evidence list, review-needed badge, and
  Korean detailed evidence labels.
- Simulator also confirmed an in-progress/data-not-ready Detail keeps the
  existing status card and retry-disabled explanation.
- No EAS build, paid AI call, DB migration, external console change, AI prompt
  change, schema change, or new analysis execution was performed.

Build 82 Post-foundation UX QA, 2026-06-26:

Build 82 is ready for Founder real-device QA. This is the first standalone
iOS preview/internal build after the post-foundation UX polish set.

Build details:

- buildNumber: `82`
- build commit: `16b44a9 chore: prepare post-foundation ux qa build`
- EAS build page:
  `https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/c0effa32-29cb-49e6-9baf-e0642c480b68`
- install/build URL:
  `https://expo.dev/artifacts/eas/ttWHXF2SLddnDWq0NG0TV3r3e3LKRGDgg0Lgi-jsbQA.ipa`

Included QA surface:

- Product UX Baseline P1 - Unified User-Facing Status Resolver
- Kakao Single CTA Recovery UX
- Detail Menu / Retry Eligibility Polish
- Home v2 / Journal UX First Slice
- Upload Entry UX Polish
- Analysis Trust UX

Current follow-up status:

Build 82 led to the Kakao Single CTA recovery routing work that was completed
through Build 84. Build 85 then completed Startup / Video Tab Loading
Observability P1 for the current preview/internal QA scope. Initial loading and
Video spinner issues should now be triaged from QA panel values before changing
product code or infrastructure.

Build 74 Push QA / milestone closeout, 2026-06-24:

Build 74 confirmed the remaining Auth Phase 2 Push observation. The Build 73
failure was not a provider-delivery problem; it was push token registration
timing. Analysis completed before the anonymous user's token row existed, so
Render loaded `tokenCount=0` and skipped sending Push. Build 74 moved
registration earlier through auth-owner readiness, foreground retry, and an
upload-start best-effort ensure.

Build 74 QA confirmed:

- Push notification was received after analysis completion.
- Render logs showed `tokenCount: 1`.
- `analysis_push_send_started` was observed.
- Expo ticket result showed `okCount: 1`, `errorCount: 0`.
- A ticket id was produced.
- Home and Video state still converged normally.
- The app icon asset currently points at `./assets/icon.png` and is committed
  for future builds.

Push Observability P2 implementation, 2026-06-24:

Build 74 already confirmed Push delivery, so the P2 work keeps the Push send
path intact and adds persistent diagnostics only. New migration
`supabase/phase12_push_delivery_attempts.sql` records analysis completion Push
attempts, token counts, Expo ticket mapping, and later receipt results. The
server now distinguishes missing tokens, disabled-token-only users, enabled
token counts, send request errors, ticket errors, and receipt errors. Receipt
checks are manual/internal through `POST /api/push-receipts/check-pending`
instead of a scheduler.

Push Observability P2 smoke QA is complete. The smoke ran through the backend
API with `MOCK_AI_ANALYSIS=true`, so paid AI calls were skipped while the
server persistence and Push send path stayed active. Confirmed cases:

- `receipt_ok`: real enabled iOS token created an attempt row, ticket id, token
  mapping, and receipt result.
- `ticket_error`: fake Expo token produced `DeviceNotRegistered` and disabled
  the matching `device_push_tokens` row.
- `skipped_disabled_only`: a user with only disabled token rows was recorded
  without sending.
- `skipped_no_tokens`: a user with no push token rows was recorded.
- `skipped_no_valid_tokens`: an enabled but invalid token row was recorded with
  `invalid_token_count=1`.

During smoke, Expo ticket/receipt error payloads were found to include raw push
tokens, so the observability writer now masks Expo tokens before storing error
messages/details. Raw Expo tokens are not duplicated into
`analysis_push_delivery_attempts`.

Milestone status:

- Upload Part 1: closed.
- Auth Phase 1: closed.
- Auth Phase 2: closed for the device-first anonymous identity baseline.

Next product step:

Start Email Recovery / account linking next. Do not reopen the no-token default
user path as an external user mode. Push Observability P2 is complete for the
current internal/dev scope; a receipt scheduler remains a later operational
follow-up only.

Email Recovery first implementation note, 2026-06-24:

The first recovery/account-linking surface has been added. Home's header menu
now opens `AccountRecoveryScreen`, where the current authenticated anonymous
user can request a recovery email link. The initial OTP entry /
`verifyOtp({ type: "email_change" })` UI has been removed because the current
Supabase Change Email template is magic-link based. After `updateUser({ email
})` succeeds, the screen now enters a magic-link pending state and asks the user
to click the email link, return to the app, and use `refreshSession()` to check
whether the email is connected. Anonymous sign-in remains the device-first
baseline.

Server-side, `resolveRequestUser(request)` now updates the existing
`public.users` profile email/display name when the bearer-token Supabase Auth
user changes, instead of creating a new app user. QA still needs to verify the
email template/OTP behavior and confirm ownership continuity after linking.

Kakao display_name sync policy, 2026-06-26:

- Supabase Auth `user_metadata` currently includes Kakao name candidates:
  `name`, `full_name`, `preferred_username`, and `user_name`.
- The current `public.users.display_name` is already synchronized to a
  Kakao-name value, not an email fallback.
- `AccountRecoveryScreen` reads Kakao display copy from Auth `user_metadata`,
  not from `public.users.display_name`.
- `resolveRequestUser(request)` syncs `user_metadata.full_name` / `name` into
  `public.users.display_name` on authenticated API requests.
- Therefore no immediate code implementation is needed.
- `preferred_username` / `user_name` fallback is a low-priority follow-up.
- If ASJ later adds user-editable display names, Kakao metadata must not
  blindly overwrite a user-customized value.
- Kakao email is optional and must not be required for display_name sync.
- Supabase admin `listUsers` did not reliably expose `identities[]` in the
  read-only check, so `user_metadata` is the safer sync source than
  `identity_data`.

Email Recovery E2E blocker, 2026-06-24:

After the cooldown wait, Email Recovery E2E was retried once with
`parksunl7@naver.com`. `updateUser({ email })` was called exactly once, no
alternate email was used, and no repeated retry was made. Supabase again
returned `over_email_send_rate_limit` / HTTP 429. The QA seed Auth user,
`public.users` row, Moment, and push token were cleaned up.

Email Recovery's code, ownership-sync structure, and magic-link pending UI
remain the baseline, but E2E completion is blocked on the Supabase hosted email
rate limit. Do not continue repeated `updateUser({ email })` attempts without a
rate-limit/custom-SMTP decision.

Final Email Recovery smoke retry, 2026-06-24:

At the user's request, Email Recovery was retried one final time with the same
test email, `parksunl7@naver.com`. A fresh anonymous QA seed session was
created and `updateUser({ email })` was called exactly once. The result was not
the previous hosted email rate limit; Supabase returned `email_exists` / HTTP
422 with `A user with this email address has already been registered`. This
matches the current post-Kakao QA state, where `parksunl7@naver.com` is already
registered on Auth user `499d7e71-623c-4b4e-8653-267d72ac3ca6` and mapped to
`public.users.id` `6b03b289-a6aa-4f26-aa66-6730e1cca2fe`. No email was sent,
so magic-link click/session refresh could not be tested. The temporary QA seed
Auth user `68747ded-ee58-4406-8d4f-3037a3c91be4` was cleaned up.

Current Email Recovery status: code/UI baseline remains, but this E2E path is
not closed as a successful recovery smoke. The agreed test email is no longer a
valid fresh-linking target because it is already owned by the successful Kakao
QA account. Do not repeat `updateUser({ email })` with this email.

Email Recovery latest magic-link smoke, 2026-06-24:

A fresh Email Recovery smoke used the owner-approved new test email
`parksunl88@nate.com`. `updateUser({ email })` was called exactly once and
succeeded. The Auth user stayed anonymous with `email` still empty,
`new_email=parksunl88@nate.com`, and `is_anonymous=true`; Supabase sent the
Change Email email, confirming the current template is magic-link based. The
user received the email, but clicking the link opened a browser redirect to
`http://localhost:3000/#error=access_denied&error_code=otp_expired...`, so final
email attachment was not completed. Email Recovery is no longer blocked by the
hosted sender rate limit or the previously registered email, but full E2E still
needs a production/deep-link redirect strategy and a QA pass within the link
validity window. Kakao Recovery remains the already-verified recovery path from
Build 75; Email Recovery remains a baseline/fallback path.

Kakao Account Linking preparation, 2026-06-24:

Supabase/Kakao provider setup is now ready for implementation planning.
Supabase Kakao provider is enabled, REST API Key and Client Secret Code are
entered, and "Allow users without an email" is enabled. Manual Identity Linking
is enabled under Authentication -> Sign In / Providers -> User Signups, and
anonymous sign-ins remain enabled. Kakao Developers has the Supabase callback
Redirect URI registered:
`https://ambpdhpeaewdvfvqzmkz.supabase.co/auth/v1/callback`.

Kakao consent state: nickname enabled, profile image disabled, email disabled /
unavailable.

Kakao Account Linking first implementation is complete. The app now uses
`linkIdentity` for Kakao account linking; `signInWithOAuth` is not used. The
baseline adds `scheme: "actionsportsjournal"`, the Kakao linking helper,
AuthSessionProvider exposure, and a Kakao recovery-method section inside
`AccountRecoveryScreen`.

Local/simulator check passed in Expo Go on iPhone 17 Simulator. Confirmed app
launch, AccountRecoveryScreen entry, existing Email Recovery section rendering,
Kakao recovery-method section rendering, Kakao button loading state, iOS OAuth
confirmation prompt for `kauth.kakao.com`, and cancel return with the in-app
"카카오 연결이 취소되었습니다." message. Deep-link E2E is not verified yet.

Build 75 Kakao Account Linking E2E QA passed on iOS standalone/internal
distribution after Kakao Developers consent settings were corrected. Initial
QA hit Kakao `KOE205` because `account_email` and `profile_image` were requested
without matching consent availability; after `profile_image` was enabled and
Kakao account email became available, the OAuth flow returned to ASJ and
`AccountRecoveryScreen` showed recovery linked state. Confirmed values:

- Auth user id: `499d7e71-623c-4b4e-8653-267d72ac3ca6`.
- Kakao identity id: `9aaaf219-bdf9-4fe5-91df-1a59ec57d558`.
- Kakao provider id: `4960498960`.
- `public.users.id`: `6b03b289-a6aa-4f26-aa66-6730e1cca2fe`.
- `public.users.email`: `parksunl7@naver.com`.
- `device_push_tokens` count for the app user: `1`.
- Realtime channel basis:
  `analysis-updates:auth:499d7e71-623c-4b4e-8653-267d72ac3ca6`.

Read-only Supabase Auth/Admin and public table checks confirmed the Kakao
identity is attached to the existing Auth user, no separate new Auth user was
observed for the QA window, `public.users.id` stayed mapped to that Auth user,
push token ownership stayed on the same `public.users.id`, and the app code
continues to derive Realtime from `analysis-updates:auth:{authUserId}`. This QA
user had `moments` count `0`, so existing Moment preservation was structurally
verified by ownership boundaries but not with a real pre-existing Moment sample.

Auth Phase 1 server ownership closeout, 2026-06-24:

Auth Phase 1 is complete for the server-side ownership boundary. The BFF now
routes the main ownership-sensitive API paths through `resolveRequestUser(request)`
instead of letting handlers call the internal default user helper directly. The
no-token internal QA fallback remains available, but authenticated requests are
scoped to `users.auth_user_id` mappings and must not see default-user data.

Completed Auth Phase 1 work:

- `resolveRequestUser(request)` exists on the Render/BFF server.
- No-token requests still resolve to the existing internal default user.
- Bearer-token requests are prepared to resolve through Supabase Auth and
  `users.auth_user_id`.
- Server API handlers no longer call `getOrCreateDefaultSupabaseUser()`
  directly; the remaining default-user call is the intended fallback inside
  `resolveRequestUser()`.
- The converted server paths include Moment list, push token registration,
  upload target creation, direct finalize, multipart fallback upload, legacy
  Moment creation, and Moment deletion.

Authenticated smoke results, 2026-06-24:

```text
Route: GET /api/moments
JWT sub: e156164b-e810-4ab8-a949-9e14452fdd73
JWT email: parksunl88@gmail.com
JWT exp: 2026-06-24T03:50:39.000Z
Authenticated app userId: 91ab8b25-1adb-4a94-ade2-b00c50e38d22
Internal default app userId: 737deccd-7da9-49c5-854b-839b62fa417b
```

Confirmed:

- Server log resolved the bearer-token request as `authMode=authenticated`.
- The authenticated app `userId` is separate from the no-token internal default
  `userId`.
- Authenticated `GET /api/moments` returned `0` moments.
- No-token `GET /api/moments` returned `30` moments with `hasMore: true`.
- No default Moment IDs overlapped with the authenticated response.
- `users.auth_user_id` mapping did not exist before the authenticated GET and
  one `users` row was created for the Supabase Auth user by
  `resolveRequestUser()`.
- The access token was intentionally not recorded.
- Authenticated `POST /api/video-upload-targets` created an `upload_targets`
  row owned by the authenticated app `userId`, not the default user.
- Authenticated direct upload -> finalize created a Moment and AnalysisJob
  with the same authenticated `userId`; EvidenceResult later completed with
  the same owner.
- Source and thumbnail paths used `users/{authenticatedUserId}/...` prefixes.
- Authenticated `DELETE /api/moments/:momentId` deleted only the authenticated
  user's test Moment, AnalysisJob, EvidenceResult, source object, and thumbnail
  object. Cleanup stayed inside the authenticated user prefix.

Remaining Auth TODO:

- Push token account-switch policy is finalized for the current Push boundary:
  the same Expo token moves to the current authenticated owner.
- External no-token policy is finalized: default-user fallback is explicit
  dev/test opt-in only and must not become an external user mode.

Auth Phase 2 entry condition:

Proceed to Auth Phase 2 only after accepting that the server ownership boundary
is now request-scoped, and then focus on app login/session UX plus private
Realtime and push-token ownership behavior. Do not merge default-user content
into authenticated sessions.

Auth Phase 2 identity strategy update, 2026-06-24:

Device-first identity should use Supabase Anonymous Sign-in. The smoke test
confirmed that `signInAnonymously()` can issue an anonymous access token, the
JWT/user is anonymous, the BFF resolves the request as
`authMode=authenticated`, and `public.users` mapping is created through
`resolveRequestUser()`. Authenticated `/api/moments` returned `0` moments, so
default-user Moments stayed separate. The access token was not recorded.

Cleanup candidates from the smoke:

```text
auth.users anonymous user id: b37f7d2f-199d-44f4-9718-a96d665f497f
public.users id: ff32ae87-5d69-43d3-ba9d-68c3d9bd8638
```

Current identity direction:

- Device-first = Supabase Anonymous Sign-in.
- Email Recovery = first follow-up account-linking path.
- Kakao / Google / Apple = secondary recovery/social options.
- No-token default user remains internal QA only.

Auth Phase 2 QA build checklist:

- Fresh install creates/restores an anonymous Supabase session.
- Home starts from the anonymous authenticated user, not the internal default
  user's existing Moment list.
- BFF logs `/api/moments` as `authMode=authenticated`.
- Upload target, finalize, Moment, AnalysisJob, and EvidenceResult share the
  same anonymous app `user_id`.
- Push token registration stores the anonymous owner.
- Realtime uses `analysis-updates:auth:{authUserId}` for authenticated
  anonymous users.
- Delete cleanup remains inside the current owner boundary.
- No-token default fallback remains internal QA only and is not the external
  identity path.

Auth Phase 2 Build 72 QA result, 2026-06-24:

Problem:

Build 70/71 exposed the first real Auth Phase 2 app-side lifecycle risks:
fresh install could stall on Boot Loading while anonymous session creation and
Boot Sync raced, and Build 71 could open UploadScreen after an auth boundary
reset with no selected video.

Why it mattered:

Device-first anonymous identity is only acceptable if first launch and first
upload feel boring and reliable. A login-free app that stalls at boot or loses
the selected video would make the anonymous identity path less trustworthy than
the old internal default-user QA path.

Decision and implementation:

- Keep Device-first = Supabase Anonymous Sign-in.
- Keep Login UI out of this phase.
- Prevent `onAuthStateChange(null)` from dropping the app out of
  `authLoading` before `getSession -> signInAnonymously` completes.
- Make Boot Sync retryable if an initial remote sync attempt is invalidated by
  cleanup/race before reaching `completed`, `failed`, or `timeout`.
- Add an upload-flow generation guard so a picker result that returns after an
  auth boundary reset cannot open an empty UploadScreen.

Build 72 QA confirmed:

- Fresh install passes Boot Loading.
- Anonymous session is created automatically.
- Home opens successfully under the anonymous authenticated owner.
- Upload succeeds.
- App relaunch preserves/restores state.
- Analysis completes.
- Home and Video both reflect the completed Moment.
- The Upload race blocker is resolved.
- Push was not confirmed in this pass.

Current Auth Phase 2 status:

Auth Phase 2 is closeable for the device-first anonymous-session baseline once
Push is either confirmed in a follow-up QA pass or explicitly carried as an open
observability item. The next product step remains Email Recovery / account
linking, not a return to no-token default-user behavior.

Build 65 upload recovery checkpoint, 2026-06-23:

Build 65 is the latest prepared iOS QA build and supersedes the older Build 55
wrap-up baseline for current resume purposes.

```text
buildNumber: 65
feature commit: 13e95ff fix: expire unrecoverable local upload sessions
build commit: 5ca179a chore: prepare local upload cleanup qa build
EAS Build: https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/315d66c2-a390-4f63-8790-151d890f677f
```

Current upload state:

- Durable thumbnails are persisted to Storage and restored after reinstall.
- Detail falls back to persisted thumbnail when local video playback is not
  available.
- Foreground completion uses in-app Toast only; background uses OS Push.
- Direct upload target context is preserved early enough for finalize recovery.
- Orphan uploaded source sessions can retry
  `/api/moments/from-uploaded-source`.
- Local-only sessions without `uploadId` / `storagePath` are not recoverable
  and expire to `upload_failed` after a short TTL.

Current blocker before Auth:

Build 65 QA found that a second upload attempted while the first Moment was
processing can still fail before a new `upload_targets` row exists. The latest
server state showed the first upload completed normally; no distinct second
upload target/source/moment existed. Treat the next task as pre-target /
early-client upload failure observability and cleanup, not as a server
pagination, Push, Realtime, or AI issue.

Build 68/69 open observations:

These are not classified as P1 blockers.

- Push observation: in Build 69, the first upload completed while the app was
  foregrounded and the in-app completion notice was observed. The second upload
  completed while the app was closed/backgrounded, but the user did not clearly
  see an OS Push notification. On re-entry, the Moment was already completed and
  evidence was present. DB rows and the enabled push token looked normal, but
  the current system does not persist Expo Push ticket results, so actual
  provider delivery cannot be confirmed from DB alone. Current judgment:
  observability gap, not a confirmed Push bug.
- List reflection timing: Build 68 showed A appearing slightly later and B
  appearing immediately. Build 69 showed both A and B appearing immediately.
  Home/Video/Detail convergence remained normal. Current judgment: not a bug,
  cause unconfirmed, recheck only if delayed reflection repeatedly affects
  trust or convergence.

Upload Reliability P1 status:

Build 68 completed the P0 terminal Alert gate fix. Build 69 promoted the
previously implicit `remote_reconcile_pending` and `recoverable_orphan` upload
states into named code-level classifications without introducing a reducer or
changing UI behavior.

Current confirmed Alert policy:

- `request_upload_target` failures before any upload target exists may show an
  upload failure Alert.
- true local file access failures may show an Alert.
- `fallback_upload` failures are recoverable/ambiguous and must not show an
  immediate failure Alert.
- failures with an `uploadId` after target issuance are treated as
  `recoverable_orphan` and must not show an immediate failure Alert.
- existing or newly matched remote Moments suppress failure Alerts and converge
  through `/api/moments` reconciliation.

P1 is not complete yet. Before closing P1, settle the remaining policy details
around `request_upload_target` retry behavior, the exact boundary of local file
access failures, and when a pending/recoverable upload becomes a terminal
`upload_failed` state.

Upload Reliability P1 closeout, 2026-06-24:

Problem:

The upload pipeline had become functionally capable but still carried a trust
risk: server-side success could be misread by the client as a terminal failure,
and recovery/reconciliation states were implicit in scattered conditions.

Why it mattered:

For Action Sports Journal, upload is not a convenience feature. It is the trust
boundary of the product. If a rider is told that upload failed while the server
later completes analysis successfully, Auth, AI Calibration, or compression
work would be built on an unreliable foundation.

Decision:

Close P0 first by preventing false failure Alerts, then close P1 by naming the
minimum recovery states without introducing a large reducer/state-machine
rewrite.

Implementation:

- P0: Build 68 suppresses false failure Alerts for ambiguous fallback failures.
- P1: Build 69 introduces explicit upload recovery classifications:
  `remote_reconcile_pending` and `recoverable_orphan`.
- The Failure Outcome Matrix and Alert policy are documented in
  `docs/TECH_DEBT_AND_REFACTOR_TODO.md`.

Result:

Build 68/69 QA passed for the current Upload Reliability scope. False failure
Alerts did not recur, A/B uploads converged, and Home/Video/Detail reached the
same remote state. Open observations around Push delivery visibility and list
reflection timing are recorded as non-blocking observability items.

Insight:

The product does not need a full reducer yet. The immediate reliability gain
came from naming the ambiguous states and making Alert eligibility terminal-only
instead of treating every thrown error as user-visible failure.

Current Upload Reliability status:

P1 is closed for the current internal QA scope. Continue to treat upload
pipeline reliability as the gate before Auth/Ownership, but the next upload
work should be P2 hardening rather than P1 blocker repair.

Part 1 final wrap-up checkpoint, 2026-06-23:

Part 1 Upload Experience is closed for single-user internal QA. Build 55 is the
current final wrap-up build. It is not a new feature validation build; it exists
to carry Direct Upload finalize/fallback diagnostics into the installed app and
Render logs. The added observation points are:

- server `uploaded_source_finalize_response_sent`;
- app `direct_finalize_success`;
- app direct failure/skip markers before fallback;
- app `fallback_started` and `fallback_success`.

Current product baseline:

- Direct Upload + multipart fallback remains the upload architecture.
- `/api/moments` remains the source of truth for result sync.
- Build 54 validated polling-free state convergence through
  `upload_success`, `moment_updated` Realtime, Push response, and foreground
  refresh.
- Build 55 preserves that behavior and only improves observability if a future
  upload appears to finalize directly and then also fall back.

Next starting point:

Auth / Ownership is the next main workstream. After Auth, move the current
public Realtime Broadcast channel to private/user-scoped Realtime. After that,
prioritize Thumbnail Persistence so reinstall/new-build experiences keep
cross-device previews. AI Calibration and Compression Measurement remain later
workstreams after the app foundation is owned and scoped.

State Sync / Pagination graduation checkpoint, 2026-06-23:

Problem:

Pagination and Video Archive Source separation made the app more scalable, but
also exposed a state consistency risk. Home is a global session cache, while
Video is a server archive source. Build 52 showed that upload success, Push,
Realtime, foreground refresh, and active tab state needed one invalidation
policy before Auth / Part 2 could begin.

Decision:

Build 53 QA resolved the blocker, and Build 54 confirmed the polling-free
version. Upload success now invalidates/refetches `/api/moments` first page,
then applies the same remote first page to both global sessions and Video
Archive first-page source. Tab activation now uses a single helper path so
`activeTab` and `activeTabRef` stay synchronized.

Current sync policy:

- POST/finalize upload success is the primary invalidation point.
- Realtime Broadcast, Push response, and foreground refresh are event/fallback
  refresh paths.
- Active moment polling has been removed; queued/processing updates now rely on
  `moment_updated` Broadcast plus the existing refresh paths.
- Video remains a Server Archive Source; do not use all global sessions as the
  Video source.
- Home = Global Session Cache, Video = Server Archive Source, Detail = Cache +
  Server context.

Next:

Auth remains the next major product/architecture topic. The state sync blocker
is now resolved without active polling: `moment_updated` is a refresh trigger,
and `/api/moments` remains source of truth. After Auth, convert the current
public Realtime Broadcast channel to a private/user-scoped channel.

Finalize latency investigation, 2026-06-23:

Direct Upload itself is working, but the app still waits after byte upload
reaches 100%. Current finalize is synchronous: the app calls
`POST /api/moments/from-uploaded-source`; Render validates the upload target,
inspects the Storage object, downloads the uploaded source video, compares the
downloaded file size with the draft size, creates the Moment, creates/links the
AnalysisJob, marks the upload target finalized, then returns. The Storage
download/arrayBuffer step is the likely 2-4 second perceived wait after upload
completion. Investigate replacing full download validation with reliable
Storage metadata validation if Supabase can provide object size/content type.

Part 1 Upload Experience closeout, 2026-06-22:

Problem:

The app's core product promise is not AI Calibration yet. The immediate
question is whether one real wakeboard video can be uploaded, handed to the
server, analyzed, restored, and understood in a way that feels like a proper
iPhone app. Earlier builds exposed several failure modes: Moment rows could be
created before durable video input existed, Direct Upload could create 0 byte
objects, foreground/result sync could show stale state, and active users could
miss analysis completion even after Realtime was added.

Why it mattered:

If the upload-to-result loop feels unreliable, later AI coaching and trick-name
calibration will sit on an untrusted product foundation. Riders need to believe
that upload, progress, analysis start, completion, restore, and notification
states are coherent before they judge the AI's sporting accuracy.

Options:

- Keep Render multipart as the main path and defer Direct Upload.
- Use Direct Upload as the preferred path with multipart fallback.
- Keep Local Draft Resume for app restarts.
- Remove Local Draft Resume and require the rider to stay on the Upload screen
  until durable upload completes.

Decision:

Close Part 1 for single-user internal QA on the Direct Upload + multipart
fallback architecture. Remove Local Draft Resume because long-lived
`file://` video URI reuse is not reliable enough. Keep `/api/moments` as the
source of truth for result state. Keep Push for background notification,
Realtime Broadcast for active-screen refresh, and foreground refresh as a
fallback.

Implementation:

- Direct Upload now uses `FileSystem.uploadAsync` against the signed upload URL
  and reports real byte progress during the video transfer stage.
- Multipart upload remains as fallback if Direct Upload fails.
- Upload UI keeps the user on the Upload screen until upload/finalize finishes.
- Local Draft Resume and "continue previous upload" UX were removed.
- Boot Loading and Empty State are separated so Empty State appears only after
  remote sync has actually resolved to no records.
- Push, Realtime Broadcast, foreground refresh, and an in-app completion banner
  work together to communicate analysis completion.
- `upload_targets` tracks target issue/upload/finalize/failure state for
  diagnostics and future cleanup.

Result:

Part 1 is complete for a single-user internal QA build. A real Build 29 upload
confirmed `upload_targets.status=finalized`, Moment/AnalysisJob/EvidenceResult
creation, Push, result restore, and source cleanup. Build 36 adds active-state
completion awareness through an in-app banner after Realtime-triggered refresh
has actually reflected a completed Moment in local state.

Remaining risks:

- External or multi-user launch still requires Auth/User Ownership. The current
  default-user model is not acceptable for broader release.
- `upload_targets` state semantics need cleanup before automated orphan
  deletion. A failed Direct Upload followed by successful multipart fallback
  can leave a failed target row while the user upload succeeded.
- Direct Upload should keep collecting real-device samples; fallback remains
  necessary.
- Realtime Broadcast is public MVP and should become scoped/private after Auth.

Next stage:

Part 2 should focus on upload architecture hardening, not AI Calibration first:
server-side draft/upload session, upload target/orphan cleanup policy,
pre-upload video optimization investigation, Push deep link, and Auth/user
ownership. AI Calibration follows once the app-like upload loop stays stable.

Part 1 navigation / Instagram UX decision:

Action Sports Journal should keep Instagram inflow and sharing as important
product strategy. After real-device pager prototype QA, Home / Video / Growth
horizontal swipe is adopted as the Part 1 navigation skeleton. Bottom Tabs
remain visible, but the main tab surfaces can also be reached through
Instagram-like horizontal swipe.

Instagram-style interaction is still valuable, but it should be limited to
media-heavy surfaces: Video tab media viewer, previous/next Moment Detail
swipe, ShareResult / Growth Card preview carousel, and Instagram share
outputs. The adopted pager keeps this philosophy at the app skeleton level:
ASJ's product idea remains original while the UX borrows a proven user learning
model. Route-backed Bottom Tabs plus Stack remains a later structural
refactor, not a blocker for adopting the current pager skeleton.

Decision record:

- Problem: Instagram-inflow users may expect major surfaces to feel like a
  continuous swipeable app, not separate developer-defined screens.
- Cause: Home, Video, and Growth are different information surfaces, but the
  user acquisition model depends on Instagram-learned interaction patterns.
- Options: keep Bottom Tabs only; use a full Instagram-style pager; or keep
  Bottom Tabs while adding horizontal swipe between the main surfaces.
- Decision: adopt Bottom Tab + Swipe coexistence for Part 1. Keep haptic
  feedback because real-device QA made tab changes feel intentional.
- Result: Pager, Bottom Tabs, and Haptic were positive in QA and remain in the
  stable Build 43 baseline.
- Remaining TODO: later evaluate route-backed Bottom Tabs plus Stack for Push
  deep links, tab state restore, ShareResult routes, and clearer screen
  lifecycles.

Part 2 P1 pagination / infinite scroll target:

The next structural step should prepare the Moment archive for scale before
date filters, trick filters, and growth views make the dataset larger. The
server list API now has cursor pagination groundwork, but the Video archive UI
is intentionally back on the stable `ScrollView + map()` rendering path after
Build 41/42 launch crashes. Treat Build 43 as the current stability baseline.

Decision:

- Use cursor pagination as the final list architecture.
- Do not use offset pagination as the primary structure.
- Home should use only the latest N Moments needed for dashboard sections.
- Video should eventually become the cursor-paginated archive surface with
  infinite scroll, but the first `FlatList` attempt inside the TabView/PagerView
  scene is paused.
- Detail can keep using the selected Moment payload now, while leaving room for
  a future `/api/moments/:id` style single-Moment fetch for Push deep links and
  restore.

Implementation order:

1. Add cursor/limit support to `/api/moments`.
2. Extend the app `listMoments` API to accept cursor options.
3. Keep the stable Video `ScrollView + map()` UI until the launch-crash cause
   is isolated.
4. Re-attempt infinite scroll in a safer structure: lazy-mounted scene,
   route-backed Bottom Tabs, or a bounded prototype branch.
5. Revisit Boot, Foreground, Push, and Realtime refresh policy so they do not
   require whole-list refetches.

Risks:

- Push and Realtime currently depend on whole-list refresh behavior.
- Local/remote merge rules must keep completed remote Moments from being
  downgraded even when only the first page is loaded.
- Future date/trick filters must be server-side query filters, not client-side
  filtering over a full in-memory archive.
- Build 41 and Build 42 crashed immediately on launch after the Video
  `FlatList` scene was introduced. Removing `removeClippedSubviews` alone did
  not fix it, so the root suspicion is the mounted `FlatList` scene interacting
  with TabView/PagerView or render-time assumptions in that scene.

Build 43 stable baseline:

- `2665062 fix: rollback video archive flatlist scene`
- `2a8249b chore: prepare video archive launch hotfix build`
- Build URL:
  `https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/80e56cb7-385e-47a7-ba57-2e0dd2613562`
- QA result: launch crash resolved; Home, Video, Pager/Haptic, Upload,
  Push/Realtime, and deletion all passed.
- Keep server cursor API, `listMomentsPage`, and Boot first-page policy.
- Keep Video infinite scroll UI deferred until the scene architecture is
  re-tested safely.

Build 48 pagination graduation QA in progress:

- Problem: Cursor pagination worked at the API level, but user-visible
  infinite scroll was hard to verify because Video originally rendered from the
  same global merged `sessions` cache as Home.
- Cause: local restore, remote refresh, upload optimistic state, Realtime, and
  Push refresh all merged into one `sessions` array. That is useful for Home
  and Detail, but it hides whether Video is loading page 1, page 2, and page 3
  as a server archive.
- Options: treat the split as QA-only instrumentation, or recognize a product
  architecture boundary between dashboard cache and archive source.
- Decision: adopt the boundary as a long-term structure:
  - Home = Global Session Cache.
  - Video = Server Archive Source.
  - Detail = Cache + Server.
- Result: Video Archive now owns paged order through `videoArchiveSessionIds`,
  `videoArchiveNextCursor`, `hasMoreVideoArchiveMoments`, and
  `isLoadingMoreVideoArchiveMoments`. Global sessions remain the cache/detail
  source. Build 48 is the graduation QA build for this structure.
- Build 48 URL:
  `https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/f4f6fde7-1d5f-490a-94bc-ac29e25b3c29`
- Graduation condition:
  - user confirms `20 -> 40 -> 60` on a physical iPhone;
  - duplicate IDs = 0;
  - missing IDs = 0;
  - `occurred_at desc` plus `id desc` order remains stable;
  - Upload, Push, Realtime, Detail, and deletion remain normal.
- QA seed:
  - runId `pg-grad-20260622-182901`;
  - cleanup executed after Build 48 seed QA;
  - deleted rows: 99;
  - post-cleanup matched rows: 0;
  - no `analysis_jobs`, `evidence_results`, or `upload_targets` impact.

Part 2 entry checkpoint:

- Problem: Build 41/42 showed that the archive scalability work can destabilize
  launch when UI virtualization is combined with the current pager scene.
- Cause: The root stack was not captured, but `FlatList` inside the mounted
  TabView/PagerView scene is the strongest suspect. The prop-only Build 42
  fix did not resolve launch crash.
- Options: rollback all pagination; rollback only the Video `FlatList` scene;
  or keep shipping a crashing build while investigating.
- Decision: keep cursor API/helper groundwork and rollback only Video infinite
  scroll UI. Build 43 is the current stable baseline.
- Result: Build 43 QA passed launch, Home, Video, Pager/Haptic, Upload,
  Push/Realtime, and deletion.
- Remaining TODO priority after pagination graduation:
  1. Auth / Ownership.
  2. Compression measurement / benchmark.
  3. Unread Analysis Badge.
  4. Push Deep Link.

Compression measurement / benchmark decision:

- Problem: current uploads send the original selected video bytes. This works,
  but long-term upload time, mobile network use, and Supabase Storage cost can
  become user-facing and operational bottlenecks.
- Cause: there is no pre-upload encode, resize, bitrate optimization, or
  compression step. Metadata is collected, but the media body is unchanged.
- Options: upload original only; compress on the client before upload; compress
  on the server after upload; or use a hybrid strategy.
- Decision: Compression is likely necessary, but do not apply it immediately.
  First measure upload behavior and compare AI output on original versus
  compressed copies.
- Result expected before implementation: record file size, video duration,
  upload time, finalize time, and AI analysis differences.
- Compression principles:
  - small/short videos may stay original;
  - only large videos should enter conservative compression candidates;
  - do not aggressively reduce frame rate;
  - start with a conservative 1080p optimization candidate.
- AI quality comparison must include edge load, approach, board angle, rope
  tension, pop, rotation axis, landing, and trick identification.
- Remaining TODO: design and run a measurement/benchmark pass before deciding
  whether Compression MVP ships before or after Auth / Ownership.

Failure cases to preserve:

- Network outage QA: Build 40 upload failure was not a Pager/Haptic regression.
  The device was offline; failure messaging, fallback attempt, final alert, and
  recovery after network restoration behaved correctly.
- FlatList crash QA: Build 41 crashed on launch after Video `FlatList` /
  infinite scroll. Build 42 removed `removeClippedSubviews` but still crashed.
  Build 43 rollback confirmed the stable path.

Update on 2026-06-20, Analysis-first Product Strategy:

Build 29 Direct Upload checkpoint, 2026-06-21:

Problem:

Build 28 proved that the upload architecture was structurally close, but Direct
Upload could create a 0 byte Storage object. The app then reached finalize and
failed with a source video size mismatch before Moment creation.

Cause:

The failing path used `fetch(file://...).blob()` with Supabase
`uploadToSignedUrl`. In RN/Expo this combination did not reliably send the real
MOV file body. `draft.fileSize` and server finalize validation were not the
root problem; the Storage object itself was empty.

Investigation:

The latest failing `upload_targets` row had a normal draft size, no
`uploaded_at`, no `finalized_at`, and a Storage object that downloaded as
0 bytes. The server finalize check compared the expected draft size against the
actual downloaded Storage object size and correctly rejected the upload.

Decision:

Keep Direct Upload as the intended product path. Do not make multipart the
default workaround. Replace only the unstable file-body upload mechanism while
keeping `upload_targets`, finalize, and multipart fallback.

Implementation:

- Build 29 uses `expo-file-system/legacy`.
- The app checks the local source file with `FileSystem.getInfoAsync`.
- The app rejects 0 byte or size-mismatched local files before signed upload.
- The app uploads the actual file body to `signedUploadUrl` with
  `FileSystem.uploadAsync(..., httpMethod: "PUT", BINARY_CONTENT)`.
- Finalize size mismatch errors now include `expected` and `actual` sizes.

Result:

- Build 29 EAS URL:
  `https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/16f8d05e-d375-4539-b9fa-1addbffb0227`.
- Latest Build 29 QA upload reached `upload_targets.status=finalized`.
- `uploaded_at` and `finalized_at` were recorded.
- The new Moment used an `uploads/{uploadId}` Storage path, confirming Direct
  Upload rather than multipart fallback.
- Moment, AnalysisJob, and EvidenceResult were created and completed.
- Push and result restore remained normal.
- The source object was cleaned up after analysis (`source_video_storage_status
  = deleted`).
- A roughly 15.8 MB / 8 second MOV took about 8-10 seconds to upload/finalize.
  Treat this as acceptable for now, not a bug.

Insight:

The current Level 1 upload experience is now functionally sound for a real
single-video flow. The next product decision is to remove Local Draft Resume:
persisting `file://` local video URIs across app restarts is not reliable
enough for an app-like upload experience. The chosen Part 1 behavior is to keep
the rider on the Upload screen until upload finishes, show clear step-based
progress, and only then let server-side analysis continue. Future draft work
should be server/upload-target based rather than local URI resume based.
Pre-upload video optimization, such as Instagram/TikTok-style re-encoding or
analysis proxy generation, is recorded as a later final-product investigation,
not current priority.

Build 28 save point, 2026-06-21:

- Current preview/internal QA build is buildNumber `28`.
- Build URL:
  `https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/0e95c278-e3d3-4c04-bebf-b16f163f0b9a`.
- Build 28 is a Level 1 upload UX follow-up build, not an AI Calibration build.
- It includes edge-only Detail swipe behavior, Detail header spacing cleanup,
  delete blocking overlay, upload diagnostics, direct upload failure reporting,
  and restored 30 second multipart fallback timeout.
- Direct upload remains unvalidated. The latest diagnostic failure was
  finalize size mismatch: Storage object size did not match the draft file
  size. Keep Render multipart fallback as the reliable user path.
- Next QA should use one real iPhone upload, preserve DB rows, and inspect the
  latest `upload_targets` and Moment path afterward.

Current refactor backlog:

```text
docs/TECH_DEBT_AND_REFACTOR_TODO.md
```

Current architecture cleanup priority:

```text
POST /api/moments/from-source-video
-> source video reaches temporary durable Storage
-> Moment is created
-> AnalysisJob is created
-> server starts Gemini analysis
```

This replaces the earlier problematic shape where a Moment could exist before
the source video upload completed. The app-facing state model must keep upload
and analysis separate:

```text
uploading / upload_failed
queued / processing / completed / failed
```

Next QA should validate that interrupted uploads do not create remote Moments
that look like stuck analysis jobs.

Mobile-first UX principle for this stage:

Do not judge Upload, Detail, Push, foreground refresh, app lifecycle, or
long-running upload flows only by whether they technically work. The UI should
feel like a mobile app. Prefer app-native navigation, lifecycle, gesture, and
foreground/background patterns over web-style conditional rendering when the
mobile pattern better matches user expectation.

2026-06-21 validation update:

- Fileless upload-first request returns HTTP 400 and leaves DB counts unchanged.
- Normal upload creates durable Storage input before Moment/AnalysisJob creation.
- Verified order: `source_video_storage_uploaded_at -> moment.created_at -> analysis_jobs.queued_at`.
- The Upload screen now remains visible until upload completion and includes the explicit "do not close the app" warning.
- If an immediate force-close test still completes, treat it as likely upload completion before termination or iOS briefly finishing the network request. The key distinction is upload-before-completion can fail; upload-after-completion should continue server-side.
- Upload copy should later be refined toward "업로드가 끝날 때까지 앱을 닫지 않는 것이 안전합니다." and "업로드가 완료되면 분석은 서버에서 계속됩니다."
- Follow-up TODOs: verify app termination before/after upload completion, polish upload-state copy, collect timing data, continue AI Calibration from repeated sample patterns, revisit Detail structure, add Push deep link later, and consider background upload long-term.
- Simulator upload is not part of default QA. Physical iPhone QA should verify the same flow after the next preview/internal build.
- DB auto-initialization is disabled; build reports should include counts only.

Problem:

The product vision includes AI Coach, but making coaching the next immediate
build target would skip the product foundation. A rider first needs to trust
that upload, async processing, analysis completion, result restore, and result
understanding all work as one coherent experience.

Why it mattered:

Action Sports Journal is an AI-based Action Sports Analysis platform before it
is an AI Coach app. If coaching appears before the rider trusts the analysis,
coaching will feel like confident advice built on uncertain ground.

Decision:

Use this product priority order:

```text
1. AI Analysis UX Completion
2. Analysis Trust
3. Coaching
```

Current stage:

```text
AI Analysis Product Completion
```

This means completing the loop:

```text
video upload
-> async analysis
-> analysis completed
-> result restored
-> Rider-facing Summary
-> user-understandable result
```

Result:

- AI Coach remains out of scope.
- A second API call remains out of scope.
- Current work stays focused on Evidence Extraction, ObservedFacts,
  Validators, CandidateTrace, KnowledgeRules, Rider-facing Summary, and
  Calibration.
- Push Notification MVP is implemented for analysis completion. The app
  registers an Expo push token, Render stores it through `/api/push-tokens`,
  and completed EvidenceResult persistence triggers a best-effort Expo Push API
  notification. Push failure is warning-only.
- Cold Start Loading is implemented. The app now separates Loading State from
  Empty State and shows "기록을 불러오는 중입니다" while remote Moments are loading.
- Durable Analysis Pipeline Phase 8 MVP is implemented. New evidence jobs can
  use Supabase Storage as temporary durable analysis input: upload source video
  to `moment-videos`, store paths on `moments` and `analysis_jobs`, let Render
  download the stored object, run Gemini Evidence Extraction, and restore the
  completed EvidenceResult.
- Build 14 QA found that storage upload could succeed while the job remained
  queued because analysis start still depended on the app calling
  `/analyze-stored-video` after upload. The durable pipeline now starts
  analysis automatically after source-video upload.
- Build 15/16/17/18 QA found that upload completion, foreground refresh, and
  boot loading all need to behave like mobile lifecycle features, not web
  refresh patterns.
- The durable pipeline starts analysis server-side immediately after
  `/source-video` succeeds. The
  `/analyze-stored-video` endpoint remains as legacy/fallback.
- Real Render + Gemini Pro E2E succeeded after the change: the job recorded
  `started_at`, moved through processing to completed, created an
  EvidenceResult, and cleaned up the source object with
  `source_video_storage_status=deleted`.
- Storage policy is explicit: Supabase Storage is temporary durable
  analysis-input storage, not permanent video archive storage. Local video URI
  remains the playback source when available. If local video is unavailable,
  the app should still present thumbnail and analysis results rather than
  trying to replay the Storage source object. Source objects should be deleted
  after successful analysis or after a short QA/retry retention window.
- Source object cleanup after successful stored-video analysis is implemented
  as best-effort cleanup. Success records `source_video_storage_status=deleted`;
  failure records `delete_failed` without failing completed analysis.
- Stale queued/processing cleanup is implemented during `/api/moments` restore.
  Old jobs that cannot reasonably complete become failed, while completed
  evidence remains protected.
- App-facing progress language now separates `대기`, `분석중`, `완료`, and
  `실패`.
- Direct multipart upload remains as fallback.
- Build 23 QA confirmed that Boot Loading and Upload Overlay are now acceptable
  for the first real-device pass.
- `supabase/phase9_device_push_tokens.sql` is the DB migration for push token
  storage and is assumed applied remotely for this checkpoint.
- Notification tap currently opens the app only. Detail deep link navigation is
  not implemented yet.
- Because `expo-notifications` adds a native plugin, the next iOS
  preview/internal build is required before device QA.

2026-06-21 app-first UX priority update:

The immediate product objective is not better AI accuracy. The immediate
objective is making the core upload-to-analysis loop feel like a real mobile
app even if the user uploads only one video.

Prioritize in this order:

```text
1. Upload structure / UX completion
2. Mobile app screen structure
3. App-native gestures and foreground/background return behavior
4. UX stabilization
5. AI Calibration
```

Upload work includes the upload-first structure, signed/direct upload
evaluation, upload progress feasibility, blocking overlay, and timing logs.
Screen-structure work now includes route-backed screens: `MomentDetailScreen`
and `UploadScreen` exist, with `UploadContent` extracted from the old
`UploadSheet` body. This reduces Home-owned modal/conditional rendering while
keeping the existing upload-first behavior. App-native behavior includes native
stack swipe back, Push tap to the
relevant Moment Detail, and foreground/background restore flow.

AI Calibration remains important, but it starts after these mobile app
foundations are stable. Do not prioritize toeside/heelside, Back Roll, or
similar trick-name tuning ahead of Upload, Detail, Push return, and core UX
stability.

Build 22 status:

Build 22 is created and is the next device QA starting point. This build should
be installed and checked before any new feature work.

Build 22 includes:

- The upload-first Moment creation refactor.
- Default upload endpoint: `POST /api/moments/from-source-video`.
- Source video reaches temporary durable Storage before Moment/AnalysisJob
  creation.
- Upload screen remains open during source upload and warns the rider not to
  close the app before upload completion.
- Build 19/20 durable analysis, push, restore, deletion sync, long-analysis
  waiting copy, delete feedback, and Detail thumbnail fallback.

Deferred:

- Detail edge-swipe dismiss. The first implementation worked mechanically but
  felt unnatural in the current full-screen detail structure, so it is paused
  until a later Detail navigation/gesture pass.
- Navigation stack conversion. Current structure is `App.tsx -> HomeScreen`;
  Upload is an `isComposerOpen` modal and Detail is a `selectedSessionId`
  modal. Do not convert during Build 22 QA. Later, move Detail to a route-backed
  screen first, then connect Push deep link, then consider Upload screen
  extraction.
- AI accuracy issues such as toeside/heelside calibration remain in the
  Calibration stage, not in this Build 22 UX handoff.

QA data policy:

Preview/Internal build creation no longer implies automatic database reset.
Keep DB records by default so analysis timing, performance trends, calibration,
and real usage patterns can be reviewed. Only clear data when explicitly
requested by the Founder. Build reports should include counts for `moments`,
`analysis_jobs`, `evidence_results`, and `device_push_tokens`.

Next stage:

```text
Install Build 22, then verify upload-first behavior, interrupted upload
handling, completed result restore, Push delivery, thumbnail fallback, delete
feedback, and analysis waiting copy on the device.
```

Build 23 QA status:

Build 23 is now the active QA baseline. The first real-device pass was
successful at the UX/product-flow level:

- Boot Loading felt natural and is confirmed to wait for local restore plus
  `/api/moments` remote sync, with an 8 second timeout.
- Upload Overlay felt natural and clearly blocked the UI while source upload
  was still in progress.
- The latest QA sample was about 18.25 MB and about 9 seconds long.
- User-perceived upload wait was about 5-8 seconds.
- Directional timing suggests about 5.2 seconds before server file/storage flow
  entry, about 3.9 seconds around server Storage/Moment creation, job queue and
  start within about 1 second, and Gemini analysis around 50.7 seconds.
- Push was received after more than 1 minute and before 3 minutes by user
  perception.
- Result restore worked.
- Delete was not tested in this pass.

Current decision:

Do not implement a progress bar or upload architecture change yet. Continue
Build 23 QA, preserve QA rows, and collect iPhone `[upload_timing]` plus Render
Dashboard `[source_video_timing]` logs before making the next change.

Signed/direct upload decision:

Signed/direct upload is implemented in code as the default upload path:

```text
app
-> POST /api/video-upload-targets
-> Supabase signed direct upload
-> POST /api/moments/from-uploaded-source
-> Render verifies Storage object
-> Moment/AnalysisJob
-> Gemini
```

The Render multipart relay remains as fallback through
`POST /api/moments/from-source-video`. If direct upload or finalize fails, the
app can still use the previous upload-first path.

Upload target tracking is prepared through `supabase/phase10_upload_targets.sql`
and is applied to remote Supabase. The `upload_targets` table was verified at
0 rows before the next build. Server tracking is best-effort: tracking issues
should warn, not block upload.

Upload Draft decision:

Local Draft Resume is removed from the current product path. The app still uses
a short-lived in-memory `UploadDraft` while the Upload screen is open, but it no
longer persists selected `file://` videos to AsyncStorage for app re-entry.

```text
select video
-> in-memory upload draft
-> upload screen stays open
-> signed/direct upload
-> finalize
-> Moment/AnalysisJob
```

Current implementation:

- `UploadDraft` is local-only and in-memory for the active Upload screen.
- Video selection creates a draft without creating a remote Moment.
- App re-entry no longer prompts to resume a local draft.
- Upload progress is step-based: preparing, upload target creation, video
  upload, upload verification, and analysis request.
- Upload success clears the local draft and closes the Upload screen.
- Upload failure keeps the current screen state retryable while encouraging
  selecting the video again when local file access fails.

Do not create remote Moments for Drafts. A Draft is local selected upload work;
a Moment is created only after upload makes the video analysis-ready.
Signed/direct upload and finalize are implemented, while orphan cleanup
automation is not. Future draft design should use a server-side upload session
or upload target rather than long-lived local URI persistence. It should include
future `userId`, stronger Storage path ownership, orphan cleanup, and a path
convention like `users/{userId}/uploads/{uploadId}/source.mov`.

Durable analysis reference:

```text
docs/DURABLE_ANALYSIS_PIPELINE_PLAN.md
```

Cold Start behavior:

```text
app starts
-> Loading State
-> Supabase query
-> data exists: show real data
-> no data: show Empty State
```

This is now implemented as part of the async analysis UX baseline.

Update on 2026-06-20, Evidence Calibration Checkpoint:

Problem:

The app now shows a rider-facing analysis summary, but the product should not
keep tuning prompts, schemas, or validators from a single surprising result.
One-off fixes can make the system look better on one clip while making the
overall wakeboard analysis less trustworthy.

Decision:

Treat the current product as a Gemini one-call Evidence Extraction system with
post-processing:

```text
one uploaded Moment
-> one Gemini Pro Evidence Extraction call
-> ObservedFacts
-> Validators / Taxonomy / CandidateTrace / KnowledgeRules
-> Rider-facing Analysis Summary
```

Do not implement AI Coach yet. Do not introduce a second API call yet. Gather
real-video calibration evidence first.

Current result:

- Rider-facing Analysis Summary is implemented.
- Confidence wording has been made more conservative:
  `근거 충분`, `가능성 있음`, `확인 필요`.
- User-facing fallback text no longer exposes internal storage names such as
  Supabase.
- Session sync restore logic has been split into focused patch helpers and
  `useSyncRemoteMoments`.
- Evidence calibration matrix exists at
  `docs/EVIDENCE_POSTPROCESSING_CALIBRATION_MATRIX.md`.
- Latest checkpoint: `cc01177`.

Next stage:

```text
Upload and analyze 5 to 10 real wakeboard videos.
Record the results in the calibration matrix.
Only then decide whether wording, validators, prompt, or schema need changes.
```

Update on 2026-06-20, Rider-facing Analysis:

The current AI stage is not "AI Coach" yet.

Problem:

The system can extract detailed Gemini evidence, but raw evidence and internal
pipeline labels are not the same as rider-facing product value.

Decision:

Treat the current production path as a one-call Evidence Extraction flow:

```text
one uploaded Moment
-> one Gemini Pro Evidence Extraction call
-> local/server post-processing
-> Rider-facing Analysis Summary
```

The real AI Coach layer is deferred. It should be designed later as a separate
layer after the analysis summary is readable, conservative, and reliable.

Current result:

- Evidence post-processing has been improved.
- Rider-facing summary wording is more conservative.
- Internal storage wording is no longer exposed in restored evidence fallback
  copy.
- Latest checkpoint: `0c216eb`.

Next stage:

```text
Calibrate Evidence post-processing with real videos.
Then design AI Coach as a separate layer.
Do not add a second AI call just to make coaching sound finished.
```

Update on 2026-06-20:

The current standalone iPhone QA baseline is an empty app state backed by
Supabase and Render.

- Supabase test Moment data was cleared.
- Bundled mock session seed data was removed from the app.
- The app should no longer show seeded placeholder sessions when the database
  is empty.
- EAS preview/internal iOS build number `6` was created from this baseline:

```text
https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/aa0b7383-dadd-41a6-bb0b-bd39da229927
```

Current next task:

```text
Install build 6 on the iPhone, confirm the empty baseline, then upload one real
wakeboard video and verify the full Render + Supabase + Gemini Pro flow.
```

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
- Phase 1 tables exist in Supabase.
- Service-role table grants are applied.
- `npm run supabase:smoke` reports `schemaReady: true`.
- `npm run supabase:write-smoke` confirms server-side insert/update/delete
  across `users`, `moments`, `analysis_jobs`, and `evidence_results`.
- Gemini Evidence Extraction can now persist an `evidence_results` row when an
  existing Moment is linked by `momentId` or UUID `sessionId`; no UI behavior is
  changed.
- The next architecture direction is synchronous analysis to asynchronous
  background analysis.
- Async transition plan exists at `docs/ASYNC_ANALYSIS_PLAN.md`.

Async Analysis MVP milestone on 2026-06-16:

- Async Analysis MVP is implemented and pushed.
- `POST /api/moments` creates a Moment and queued AnalysisJob, then returns
  quickly.
- Evidence extraction runs through an AnalysisJob-backed background path.
- Moment status can move through `queued`, `processing`, `completed`, and
  `failed`.
- Supabase Moment restore and latest Evidence restore are wired into the Home
  screen.
- The app polls `/api/moments` while active queued/processing Moments exist.
- A bug was fixed where `/api/extract-session-evidence` 429/network failures
  made the app show `failed` while the DB job remained `queued`.
- Rate limiting is now route-scoped to expensive upload/AI routes only.
  `/health`, `/api/moments`, and status polling are not counted.
- Render has the latest backend deploy with the rate-limit fix.
- Standalone iOS internal build `1.0.0 (5)` was created:

```text
https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/66b48f3c-5564-4ddd-aa20-698f201e6204
```

- Founder validated the target flow on the standalone app:

```text
video selected
-> queued
-> app immediately closed
-> wait 2-3 minutes
-> app relaunched
-> completed restored
```

Current infrastructure boundary:

- The Async MVP is validated for personal iPhone use.
- The worker still depends on the Render process retaining the uploaded video
  buffer after enqueue. It is not yet durable across Render restart/sleep during
  analysis.
- No Supabase Storage, cloud video storage, external queue, Auth, Push, or CDN
  exists yet.

UX and model benchmark milestone on 2026-06-16:

- Gemini native video model benchmark runner exists for dev-only edge judgment
  experiments.
- Ground Truth Dataset v1 is committed under
  `dev-artifacts/benchmark-videos/`.
- Dataset composition is 12 short clips:
  - Toe 6 / Heel 6
  - Regular 6 / Goofy 6
  - Regular Toe 3 / Regular Heel 3
  - Goofy Toe 3 / Goofy Heel 3
- Benchmark modes are available:
  - `smoke`: 1 run per clip
  - `full`: 3 runs per clip
- Flash vs Pro smoke benchmark report exists at
  `docs/MODEL_BENCHMARK_REPORT_2026_06_16.md`.
- Smoke benchmark conclusion:
  - Gemini 2.5 Flash: 10/12, 83.3%, with 1 high-confidence wrong and 1 invalid
    JSON/unknown result.
  - Gemini 2.5 Pro: 12/12, 100%, with 0 high-confidence wrong on this dataset.
  - Flash is faster, but Goofy clips exposed reliability risk.
  - Pro is slower, but currently stronger for edge-critical decisions.
- Home UI was simplified away from Instagram feed / bottom sheet structure.
- Current Home is now an iOS Photos-style personal gallery:
  - 2-column square Moment grid
  - minimal date/status badge on each tile
  - no story rail
  - no feed card structure
  - no bottom sheet for details
- Detail UI is now a full-screen modal:
  - video first
  - Moment metadata next
  - analysis/evidence text below in a normal vertical ScrollView
  - no bottom-sheet clipping behavior
- Latest EAS preview/internal distribution build for iPhone UI QA:

```text
https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/d015ec0b-0c0f-4862-8e94-429faaa9442d
```

- Latest pushed UI checkpoint:

```text
c1ed80a Simplify home to gallery layout
```

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

2026-06-16 end-of-day conclusion:

- Personal gallery UX is now a better fit than SNS feed UX for the current
  product stage because the app is primarily for reviewing the user's own
  Moments.
- Bottom Sheet detail UI caused clipping and poor scrolling, so it was replaced
  by a full-screen detail modal.
- Gemini 2.5 Pro is the current quality leader for wakeboard Toe/Heel edge
  native video judgment on the smoke dataset.
- Gemini 2.5 Flash remains useful for speed/cost, but should be treated as
  risky for high-confidence edge decisions unless validated or routed through
  a stronger model.

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

1. Verify a real Gemini Evidence Extraction request with a linked `momentId`
   after the local Gemini API key is corrected.
2. Confirm the created `evidence_results` row and linked `moments` latest IDs.
3. Use `docs/ASYNC_ANALYSIS_PLAN.md` as the implementation guide for
   synchronous to asynchronous analysis.
4. If returning to AI truthfulness, run the real test clip through
   `InversionObservedFacts` v1 before modifying trick classification again.
5. Investigate the coaching structured parsing failure.
6. Review Detail Screen on iPhone.
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
