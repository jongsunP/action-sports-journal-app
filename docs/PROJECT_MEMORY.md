# Project Memory

## Purpose

This is the top-level permanent memory document and operating system for
Action Sports Journal.

Future GPT sessions, Codex sessions, new computers, and handoffs should read
this first, then follow references to the more detailed documents.

Use this document as the primary source of truth for project identity,
collaboration rules, product philosophy, AI architecture direction, wakeboard
domain constraints, current priorities, and recovery instructions.

Before adding new memory, search the existing approved read path for the same
idea. If the idea already exists, update or tighten the canonical section
instead of appending another similar rule. Duplicate memory makes future CTO and
development sessions drift, so durable notes should be merged into the existing
source-of-truth whenever possible. This applies to every ASJ-related agent and
session, including CTO, development, QA, and handoff sessions.

The Founder may express the same principle in different words across sessions.
Agents should normalize the intent, compare it with the existing canonical
rules, and maintain one updated operating rule instead of preserving repeated
phrasing as separate memories.

## Current Navigation Rule

This file is intentionally broad and permanent. Do not read it as a linear
chat log.

For current planning and "리스트업" answers:

1. Use the `Current stable workstream list` below for the full product
   workstream timeline.
2. Use `docs/CURRENT_STAGE.md` for active implementation, QA, build, and
   startup-performance state.
3. Use `docs/HANDOFF.md` for the newest next starting point.
4. Use `docs/TECH_DEBT_AND_REFACTOR_TODO.md` for deferred engineering
   follow-ups and optional later work.

If a new note updates current state, merge it into the appropriate current
section instead of appending a duplicate status block. If the Founder asks for
"리스트업", show the full canonical workstream list unless the scope is
explicitly narrowed.

## Project Identity

Project name:

```text
Action Sports Journal
```

Product vision:

```text
Private Action Sports Moment Feed
+
AI Coach
```

Action Sports Journal is an iOS-first React Native app for action sports
athletes. It is an Action Sports Life Log platform, not an AI-only analysis
tool and not a generic session database.

The current product direction is Moment First:

- Users should open the app to revisit riding moments.
- Riding clips and moments are the primary product surface.
- AI coaching supports the moment after the user is already engaged by the
  content.

Current stage:

```text
Stage 1 complete
Stage 2 local ActivityGroup / Session prototype complete
Stage 3 standalone iPhone video-to-analysis prototype in progress
```

Current infrastructure / pre-AI hardening:

- Detail/List thumbnail hydration follow-up is implemented without EAS build.
  Under summary-first boot, list thumbnails can still appear after first paint
  because `/api/moments?view=summary` intentionally skips thumbnail signed URL
  generation and `/api/moments?view=thumbnails` hydrates later. However,
  Detail-fetched thumbnail URIs were previously local to Detail, so a user
  could see an image in Detail while the list stayed skeleton-only. Detail now
  writes returned thumbnail URIs back to the shared list thumbnail map through
  the existing runtime bridge, identical thumbnail writes are no-ops, QA Debug
  Panel exposes safe thumbnail hydration status/counts/reason only, and Detail
  thumbnail images fade in briefly. Summary-first boot, thumbnail hydration API
  shape, Local-first Cache, completed-state priority, Upload/Push/Recovery/Auth
  flows, backend/DB settings, EAS build, local native build, and AI Calibration
  were not changed.
- Local-first Journal Cache P1 cache-hit loop was fixed after Founder QA found
  React `Maximum update depth exceeded` on app restart with a valid
  `local_snapshot` hit. The cause was `useBootSync`'s one-shot boot effect
  depending on `syncRemoteMoments`; applying cached rows updated session state,
  changed that callback identity, and could restart the same boot/cache-hit
  path before background remote summary completed. `useBootSync` now keeps the
  latest `syncRemoteMoments` in a ref and removes it from the boot effect
  dependency list, preserving one boot cycle while keeping the latest merge
  callback. Summary-first boot, background `/api/moments?view=summary`
  refresh, `remote_summary` replacement, `view=thumbnails` hydration,
  completed-state priority, and Upload/Recovery/Push/Detail state machines were
  not changed. `npm run typecheck` and `git diff --check` passed, and Expo Go
  Metro startup was confirmed with `npx expo start --clear --go --port 8099`;
  full Expo Go restart/cache-hit smoke remains the next confirmation.
- Full Local-first Journal Cache P1 is implemented as a small pre-AI
  foundation pass, with no build run yet. The app still restores the existing
  partial sessions/maps from `SESSION_STORAGE_KEY`, then uses a separate
  owner-bound recent journal snapshot cache for the first remote
  `/api/moments?view=summary` page. On cache hit, boot applies rows through the
  existing `syncRemoteMoments` and Video first-page paths, releases the boot
  screen, and continues the normal background summary refresh. Fresh remote
  summary results replace the cached first page and update the snapshot. Cache
  schema version is `1`, TTL is `24h`, owner and endpoint boundaries are hashed,
  and persisted snapshots strip `video`, `thumbnailUri`, `evidence`, and
  `session.videoUri` so signed URLs/raw storage paths are not durable truth.
  Delete success removes rows from the snapshot, auth owner changes clear the
  previous owner's snapshot, completed-state priority remains in
  `mergeMomentStatus`, and thumbnail hydration remains post-boot
  `view=thumbnails`. QA Debug Panel exposes only safe cache source/age/count/
  stale/refresh fields. `npm run typecheck` passed; no EAS/local native build,
  AI Calibration, DB/Render/Supabase/Auth setting change, Recovery change, or
  Upload/Push/Detail state-machine change was performed.
- Local/native Development Build was attempted once without EAS cloud usage and
  did not reach device install. `npx expo run:ios --device` generated a
  temporary ignored `ios/` prebuild output, but local prerequisites blocked the
  path: no physical iPhone was visible through `xcrun devicectl list devices`,
  CocoaPods CLI was missing, Gem install failed, and Homebrew CocoaPods install
  would have changed machine-level packages, so it was declined. Expo then only
  offered Simulator choices. Generated `ios/` output was removed, Expo's
  temporary package script rewrite was restored, and no EAS build, local EAS
  build, buildNumber change, device install, or AI Calibration was performed.
  Next local-first step is to connect/trust the physical iPhone and explicitly
  set up CocoaPods locally before retrying `npx expo run:ios --device`.
- Development Build P1 repo setup is complete as a no-build step.
  `expo-dev-client` is installed at `~6.0.21`, `package.json` has
  `start:dev-client`, and `eas.json` has a `development` profile with
  `developmentClient: true`, `distribution: internal`, and
  `EXPO_PUBLIC_ENABLE_UPLOAD_COMPRESSION_POC=true`. `app.json` was not changed,
  iOS buildNumber remains `106`, and no EAS/local/native build or device
  install was run. The first Development Build execution remains
  Founder/CTO-approval-gated. After approval, use either
  `npx eas-cli build --platform ios --profile development` for a cloud
  Development Build or `npx expo run:ios --device` for local/native device
  build, then `npm run start:dev-client -- --lan` for local Metro iteration.
- Pre-AI Development Build / Local Build Workflow investigation is complete as
  a no-build workflow step. Current repo is Expo SDK `~54.0.35`, managed-app
  style with no checked-in native directories, native/config-sensitive
  dependencies already present, no `expo-dev-client` dependency yet, and no
  `development` profile in `eas.json`. Readiness checks confirmed Expo CLI,
  EAS CLI command availability, Xcode, iOS Simulator, Singapore Render
  `/health`, and local dev-server `/health` on localhost/LAN. Recommendation:
  keep Expo Go + LAN as the first QA pass, then set up Development Build P1
  only after Founder approval to install `expo-dev-client`, add a development
  profile, and run the first native/signing/install step. Use Development Build
  for repeated native-sensitive QA; keep EAS preview/internal builds for final
  installed-app QA or native-runtime refreshes. Full Local-first Journal Cache
  remains design-only: consider only a small recent-journal cache + background
  refresh P1 after separate approval.
- Build 106 follow-up no-build UX polish addressed the remaining pre-AI
  polish items without a new EAS build. List/recent media previews now keep the
  film skeleton as the base layer so empty media boxes should not flash before
  thumbnail hydration; thumbnails fade in above that skeleton. Detail now
  separates remote detail/evidence/thumbnail loading from truly-empty
  no-evidence state, showing a skeleton state card during hydration and only
  showing the no-evidence copy after loading completes. Detail delete moved to
  a compact header-right trash action, while retry remains in the body action
  panel. Summary-first boot and `view=thumbnails` hydration paths were not
  changed. Build 106 QA also confirmed Upload -> Push -> Detail completed state
  remains normal; QA Debug Panel repeated checks can stop for this phase, with
  Store-before-release hide/gate policy left as follow-up.
- Build 106 QA follow-up found and fixed a small boot flicker without a new
  EAS build. Founder QA says app icon appears fixed and Upload -> Push ->
  Detail / completed-state stability / skeleton-fade-in / Detail polish have no
  major issue. The flicker was a one-render transition after Auth enabled remote
  sync: current props indicated remote sync was configured while
  `remoteMomentSyncStatus` still lagged as `not_configured`, allowing Home to
  appear before `waiting_for_storage` / `loading` returned the app to boot.
  `isLoadingInitialMoments` now treats configured + `not_configured` as loading.
  Summary-first boot, `view=summary`, `view=thumbnails`, Upload/Auth/Recovery/
  Push flows, Render/Supabase settings, DB, and AI Calibration were not changed.
- Push notification icon mismatch remains classified as a non-AI-blocking
  platform/cache visual follow-up. ASJ has only `./assets/icon.png` as the app
  icon in config and no separate iOS notification icon slot. Expo notification
  `icon` / `color` plugin options are Android notification settings, and APNs
  payloads do not provide an iOS app-icon override. If the old Push icon
  persists after reinstall/device cache refresh, treat it as platform rendering
  or installed-app cache behavior unless future evidence points to an asset
  generation issue.
- Pre-AI foundation and polish work is effectively complete from the CTO/PM
  standpoint as of 2026-07-06. AI Calibration has not started because the
  Founder has not yet prepared the reference video set. The next session should
  collect or define those AI Calibration reference videos first, then begin
  with TS/HS Evidence calibration. `9680d9b` boot flicker fix and `c0c4750`
  media/detail UX polish are post-Build-106 no-build-smoke-verified changes
  and should be included in the next standalone build only when a build is
  otherwise needed.
- Build 106 is complete and waiting for Founder standalone iPhone QA. It is a
  pre-AI final polish QA build, not an AI Calibration build. iOS `buildNumber`
  is `106`; build prep commit is `1290577`; EAS Build ID is
  `aaea033e-cd5e-401f-9772-24e388b50ed6`; build page is
  `https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/aaea033e-cd5e-401f-9772-24e388b50ed6`;
  IPA URL is
  `https://expo.dev/artifacts/eas/I4vLlCRWSszjsMODaxcHeO455sXdWYzbVB4Vg0bDwtE.ipa`.
  Build 106 includes list thumbnail lazy hydration (`f03d096`), no-build media
  loading polish (`83cb785`), film-only media placeholder icons (`3d372bb`),
  and the post-Build-105 app icon asset rework. Founder QA should verify
  summary-first boot, post-boot `view=thumbnails` hydration, film skeleton
  placeholders, thumbnail fade-in, Detail loading skeleton, updated app/Push
  icon appearance, and the existing Upload -> Push -> Detail completed-state
  stability.
- Post-Build-105 / pre-Build-106 no-build UX polish is implemented but not
  built. Build 105 QA showed normal Home boot / QA Debug Panel / Recovery
  surfaces, and revealed that recovered remote Video list rows still showed
  `CLIP` while Detail displayed the image. This was the intended summary-first
  tradeoff: `/api/moments?view=summary` skips thumbnail signed URL generation.
  A new `view=thumbnails` path now keeps evidence skipped but returns thumbnail
  signed URLs, and Home/Video performs one delayed post-boot thumbnail
  hydration without blocking startup. The follow-up polish replaces the strong
  `CLIP` text with a soft media skeleton/icon placeholder, fades thumbnails in
  after hydration, and shows a Detail media skeleton while full detail/thumbnail
  data is loading. `assets/icon.png` was also reworked to remove the
  pre-rounded inner icon plate. These changes require a later standalone build
  only if the Founder wants installed-app verification before AI Calibration.
- Build 105 is complete and waiting for Founder standalone iPhone QA. It is the
  final pre-AI offline physical-device QA baseline build, not an AI Calibration
  build. iOS `buildNumber` is `105`; build prep commit is `c0391dd`; EAS Build
  ID is `1db79d70-ee69-43ef-9a5b-571422297fd2`; build page is
  `https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/1db79d70-ee69-43ef-9a5b-571422297fd2`;
  IPA URL is
  `https://expo.dev/artifacts/eas/E26B5XmLFBEopsxDRz-s0a3VaO1EVi6v4h_KM_qGu5w.ipa`.
  Build 105 includes post-Build-104 hardening/docs and an attempted app icon
  white-border removal, and uses the Singapore Render analysis endpoint in the
  EAS preview environment. Founder home-screen capture showed the iOS app icon
  still feels like it has a white border in Build 105; a stronger asset fix was
  made after Build 105 and needs a later build to verify.
- Pre-AI Foundation Closeout is complete from the CTO/PM/QA standpoint.
- Next product work can start with AI Calibration, beginning at TS/HS Evidence
  stabilization. Use no-EAS Simulator / physical iPhone Expo Go first whenever
  possible, and reserve EAS or Development Build for standalone-only behavior.
- Build 104 user-facing Upload -> Push -> Detail QA is normal. Completed
  Moments stay completed, no stale upload-failure alert appears, and Video list
  does not downgrade the new Moment to processing/failed.
- DB verification confirmed the Build 103/104 upload issue was local UI/state
  conflict rather than remote upload/analysis failure.
- `559e94c fix: prevent completed moment status downgrade` is the user-facing
  completed-status regression fix verified by Build 104.
- `43e9eda fix: skip redundant completed moment evidence requests` is
  post-Build-104 pre-AI hardening that prevents completed Moment Detail open
  from triggering redundant evidence/source upload requests when session status
  or evidence is already completed.
- `67f67cb feat: add structured upload analysis summary logs` is
  post-Build-104 Render observability hardening for upload/analysis summary
  logs.
- Build 104 does not include `43e9eda` or `67f67cb`, but the user-facing upload
  blocker is already verified normal in Build 104.
- Startup/Region/Upload/Auth/Recovery have no known AI Calibration blocker.
- Local/physical-device test environment setup is complete and reduces EAS
  preview/internal build usage before the next phase.
- No-EAS physical-device testing was not newly unlocked; it was always possible
  through Expo Go. The reason recent QA used many EAS builds was that the
  active foundation work depended on standalone-only behavior such as Push,
  recovery deep-link return, installed env parity, and native
  upload/compression. Going forward, no-EAS Simulator / physical iPhone Expo Go
  checks are the default first QA path, and EAS builds should be reserved for
  behavior that truly needs an installed standalone or Development Build
  runtime.
- Local no-build environment was checked on 2026-07-03: typecheck passes,
  local backend `/health` works on localhost and Mac LAN IP, Singapore Render
  `/health` works, and Metro/iOS Simulator launch works in Expo Go mode.
  Physical iPhone + Expo Go LAN QR mode was also checked with
  `npx expo start --lan --clear`; current local `.env.local` points the public
  analysis endpoint at Singapore. Use local Mac backend mode only after
  overriding the endpoint before Metro starts.
- Founder physical iPhone Expo Go capture confirmed the no-EAS path works with
  Singapore Render: Home loads remote summary/read data, QA Debug Panel is
  visible, `view=summary`, evidence and thumbnail timings are `0ms`, response
  bytes are `48`, and `/api/moments` no longer 404s. This is a successful
  no-EAS physical-device read/sync smoke; Push/deep-link/native-runtime proof
  still belongs to standalone or Development Build QA.
- Build 104 is a focused pre-AI regression QA build for
  `559e94c fix: prevent completed moment status downgrade`. iOS `buildNumber`
  is `104`; build prep commit is `714e382`; EAS Build ID is
  `0d68f6e9-380f-4ba9-8b19-21435ef79ba7`. It should verify on a standalone
  iPhone that Upload -> Push -> Detail keeps completed state, does not downgrade
  to processing/failed, does not show the upload failure alert, does not show a
  failed badge in Video list, and does not show retry CTA or "already requesting
  analysis" copy for completed Moments.
- Build 103 QA found a completed Moment status downgrade regression: a newly
  uploaded Moment could show completed in Video list, then processing in Detail,
  then failed with an upload failure alert. The follow-up fix makes completed
  the highest-priority user-facing status across merge/local update/retry/action
  paths. This fix is after Build 103 and needs a later focused standalone QA
  build before AI Calibration.
- Build 103 is a focused pre-AI regression QA build, not an AI Calibration
  build. iOS `buildNumber` is `103`; build prep commit is `9887914`; EAS Build
  ID is `ee3b219d-4302-4a06-88de-81f0bf05bbcc`. It verifies the Email Recovery
  same-current-email no-op guard (`0c26ad3`) and Upload completed stale failure
  alert suppression (`49218e1`) on a standalone iPhone build.
- Render Singapore migration is prepared. A new Singapore Starter service is
  live at `https://action-sports-journal-api-sg.onrender.com`.
- EAS preview `EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT` now points to
  `https://action-sports-journal-api-sg.onrender.com/api/analyze-session-video`.
- iOS buildNumber `102` has been built. Build 102 EAS Build ID is
  `2f1620ae-1a9e-4323-a935-710803b0aeeb`, from commit `2584872 chore:
  prepare singapore endpoint qa build`.
- Founder confirmed Build 102 installs, launches, and sends real app logs to
  the Singapore Render service.
- Build 102 quantitative startup captures later confirmed:
  `view=summary`, `evidenceQueryMs=0`, `thumbnailSignedUrlWallMs=0`, 0-record
  response bytes `48`, 7-record response bytes about `7545`, boot/API generally
  about `0.6s-1.9s`, and server generally about `0.3s-1.7s`.
- Startup Performance / Region Alignment can pause before AI Calibration.
  Remaining variance is classified as Supabase/Auth/query/network variance, not
  an app-structure blocker.
- Email Recovery small fix after Build 102 blocks same-current-email no-op
  submission before `updateUser({ email })`, shows the already-connected state,
  and keeps the existing `email_exists` -> recovery sign-in fallback intact. This
  is not included in Build 102 until a later build is made.
- Detail upload-failure stale state fix after Build 102 prevents an async local
  upload failure from presenting "영상 업로드에 실패했습니다" or marking local state
  `upload_failed` when latest remote reconciliation already has the Moment. This
  is not included in Build 102 until a later build is made.
- Upload/Auth/Recovery regression smoke is still the final pre-AI foundation
  check.
- The previous Virginia Render service has been deleted. The only active Render
  Web Service is now `action-sports-journal-api-sg`, so the remaining Build 102
  QA should confirm the Singapore-only path is stable.

## Validation Cost / Build Policy

ASJ should validate product behavior through the cheapest trustworthy path
before spending build time, device QA time, or paid AI API calls.

This does not mean weakening validation or replacing the product with mock
data. The goal is to keep the real app and backend path intact while avoiding
unnecessary expensive steps.

Policy:

- Build only when a build is genuinely needed.
- If a behavior can be checked in the simulator, check it there first.
- If a physical iPhone must be used but an EAS build is not required, prefer
  the non-build path first.
- If native code/config must be tested repeatedly, consider an ASJ Development
  Build or Local EAS Build before continuing many cloud preview/internal builds.
  A Development Build is especially relevant after native dependencies such as
  Kakao deep links, Push, or `react-native-compressor` enter the project.
- When a build is genuinely needed, consider whether small, safe, already
  reviewed UI/copy fixes can ship with the same build. Do not bundle unrelated
  changes that would blur the QA purpose.
- For upload or analysis pipeline work, keep the real app -> backend API ->
  server flow whenever possible.
- To control cost, temporarily bypass only the paid AI provider call when the
  AI result content is not the test target.
- Do not confuse AI-provider bypass with mock-data testing. The backend should
  still receive real requests and return a realistic success response for the
  pipeline stage being tested.

Build cost retrospective:

- The high ASJ iOS build count was partly justified by real standalone-only
  validation needs: Kakao OAuth/deep links, Email Recovery link return, Push,
  app deletion/reinstall recovery, ownership continuity, and native compression.
- It was not perfectly optimized. Some later QA builds could likely have been
  reduced by grouping small UI/copy/state fixes and by moving earlier toward a
  Development Build / Local Build workflow once the native shell stabilized.
- Future policy: do not try to recover sunk cost. Improve the process from this
  point forward by treating EAS preview/internal builds as focused bundled QA
  checkpoints, not as the default check for every small change.

Principle:

```text
Validate like the real product, but spend build and AI cost only when they are
the best next move.
```

Short form:

```text
비용과 빌드는 아끼되, 검증의 현실성은 아끼지 않는다.
```

Cost is not the real enemy. If a paid build, paid AI call, or infrastructure
upgrade is the right move, ASJ should pay for it. First verify that the issue
is not product logic, unclear state handling, or an unintelligible UX flow.

Startup performance standard:

- ASJ is not being treated as a disposable MVP. If the current startup path is
  slower because the app has not yet adopted common production patterns, fix
  those patterns before moving on.
- Acceptable stopping points are:
  - the app follows a normal mobile production shape, and the remaining delay is
    infrastructure/network variance;
  - or further optimization would require a deliberate product tradeoff that the
    Founder accepts.
- Do not accept avoidable startup cost simply because the current app is still
  pre-release.
- Current accepted direction:
  - list/boot uses summary-first data;
  - detail uses full hydration;
  - logs and QA Debug Panel should expose safe timing values whenever possible;
  - secrets, raw tokens, emails, and full user ids must not be exposed.
Users can tolerate a process that is a little slow when the app explains what
is happening and recovers predictably; unexplained loading or broken-looking
behavior is a trust problem, not merely a cost problem.

## Reference-driven UI / UX Principle

ASJ should not try to invent a new UI/UX system for every surface. The product
can be original while using proven mobile patterns that users already
understand.

Reference sites such as uibowl can be used to study common structures for
account settings, recovery, connection methods, onboarding choices, media cards,
and share-ready presentations. These references are for information
architecture, interaction flow, hierarchy, and state handling. Do not copy a
specific design literally, and do not override ASJ's product tone, visual
language, or rider-journal context.

Instagram remains the highest-priority behavioral reference because ASJ's
survival depends heavily on media-native, Instagram-familiar riders. This does
not mean copying Instagram screens. It means borrowing validated user learning:
fast media entry, clear visual hierarchy, low-friction actions, share-worthy
outputs, a familiar sense of moving through media, and progressive disclosure
when technical detail is not the default rider experience.

Visible UI / UX Polish P1, completed 2026-06-30, applied this principle without
creating a new design system:

- User-facing prototype copy such as `Wake Board Loading...` was replaced with
  Korean product copy.
- Video Archive no longer promises future date/trick grouping in the header;
  the visible text now describes the current recent-record archive.
- Account Recovery method cards gained small primitive leading visuals for
  Kakao and Email so the recovery-method hub scans as a choice, not a dense
  settings list.
- Video empty/timeout/error states gained a small primitive film-frame cue.
- Completed Moment Detail keeps Share Preview and rider-facing analysis as the
  default, while technical evidence details are behind "세부 근거 보기".
- Upload debug/prototype compression metadata is hidden unless explicitly
  enabled with `EXPO_PUBLIC_ENABLE_UPLOAD_COMPRESSION_POC=true`.

This pass is UI/copy/visibility only. It does not change Auth, Upload,
Storage, API, DB, or AI Calibration behavior.

Visible UI / UX Polish P2, completed 2026-06-30, continued the same principle
at the app chrome and empty-state layer:

- Bottom tab primitive icons were refined without adding an icon package.
  Growth now uses progression bars instead of three dots, so it reads less like
  a generic "more" action.
- Home's primary upload action now uses a primitive film-plus mark, and the
  account entry uses a primitive profile mark instead of raw glyphs.
- Empty/error states and Upload copy were shortened toward rider-journal
  language.
- Moment Detail opened evidence copy now avoids model/provider language by
  default, and processing status copy no longer names Gemini.
- Account Recovery helper text was shortened while keeping the same Email/Kakao
  recovery behavior.

Future UI polish may still introduce an icon package after explicit Founder
approval, but P2 intentionally avoided package and design-system changes.

Icon Library feasibility, completed 2026-06-30, resolved that follow-up:

- ASJ uses `@expo/vector-icons` / Ionicons as the first icon-library path. It is
  Expo-standard, compatible with the current SDK, and lower risk than adding
  `lucide-react-native` for this stage.
- The package is now an explicit dependency so future installs do not rely on a
  transitive local install.
- The first implementation scope is intentionally small: Bottom tabs, Home
  upload CTA, Home account entry, Video empty/error cue, and Account Recovery
  method cards.
- Do not create a new ASJ brand symbol or recreate official Kakao branding.
  Kakao can use a generic chat/recovery visual inside the Kakao-colored method
  card.

Light/Dark mode was investigated but deferred. The app still has broad
hardcoded color usage across Home, Account Recovery, Detail, Upload, QA Debug,
and debug surfaces. The safe next step is a small theme-token layer for
background, surface, border, primary/secondary text, accent, success, warning,
and error before attempting full Appearance / `useColorScheme` support.

Theme Mode P1 later added that foundation without changing the visible product
surface:

- Theme preferences are `system`, `light`, and `dark`; default is `system`.
- Resolved mode is `light` or `dark`, derived from saved preference plus the
  platform color scheme.
- Core dark/light tokens now exist for background, surface, elevated surface,
  border, text primary/secondary/muted, accent, success, warning, error, and
  status bar style.
- Preference persistence uses AsyncStorage helpers, but no Settings UI exists
  yet.
- Do not put the theme selector into Account Recovery. Add it later with a real
  Settings/Profile surface.
- Do not attempt a one-shot app-wide light-mode conversion. Apply tokens
  screen-by-screen with visual QA.

Final Design / UI / UX Closeout Audit, completed 2026-06-30, closed the
pre-AI visible-surface review:

- The audit happened after Account Recovery UI IA P1, Visible UI / UX Polish
  P1/P2, Ionicons App Chrome pass, and Theme Mode P1 foundation.
- No additional small code polish was required before AI Calibration.
- Home empty state, bottom tabs/app chrome, Video empty state, and Account
  Recovery hub were spot-checked in Simulator and did not show a new blocker.
- Remaining design items are explicit backlog, not AI Calibration blockers:
  QA Debug Panel hide/gate policy before production, Settings/Profile theme
  selector, screen-by-screen theme-token rollout, full light-mode visual QA,
  completed Moment Detail sample QA, and later Media / Share export/share route
  work.
- Keep using proven mobile patterns adapted to ASJ's rider journal tone. Do not
  pause AI Calibration to invent a larger design system unless a Founder QA
  issue identifies a specific visible problem.

Theme Mode P2, completed 2026-06-30, made the theme foundation user-visible:

- The selectable modes are `system`, `light`, and `dark`, shown in Korean as
  `시스템`, `라이트`, and `다크`.
- The final access point is not a standalone Home header theme icon. Home keeps
  Upload as the primary action plus a single Profile/Settings entry.
- The temporary Home inline Profile/Settings hub was replaced with a standalone
  `Settings` stack screen after Founder feedback. Do not cover Home with a
  floating settings panel for normal settings behavior.
- `Settings` groups `계정 보호 / 복구`, `화면 모드`, and `QA 진단 패널` 안내.
  Theme selection lives inside Settings, and Account Recovery is opened through
  Home -> Settings -> `계정 보호 / 복구`.
- Settings rows were simplified after Founder simulator review. Do not add
  explanatory descriptions under every familiar menu item; use clear labels,
  selected states, and compact status only.
- Settings footer shows the app version as `Wake Board 1.0.0` from Expo config
  version metadata. Do not show git hash, build hash, env, or secret values in
  this user-facing footer.
- Light-mode Home Upload CTA was adjusted to use accent background + white icon
  so the primary action does not read as a black blob.
- The selected preference is saved in AsyncStorage and restored after app
  relaunch. `system` follows `useColorScheme()`.
- The app root, StatusBar, Home, Bottom tabs, Video Archive, Account Recovery,
  Upload basic surface, Moment Detail major surfaces, empty/error/loading
  states, and QA Debug Panel now have usable theme treatment.
- Light mode is not a raw inversion of dark mode. It uses separate background,
  surface, card, border, muted text, accent, warning, error, and tab treatments
  so hierarchy remains visible.
- Remaining work is polish, not foundation: QA real completed Moment Detail
  data, QA Debug Panel production hide/gate policy, and continued
  screen-by-screen hardcoded color cleanup.

User-facing app-name copy policy, added 2026-06-30:

- Visible app copy should not use `ASJ` or `Action Sports Journal`.
- If the app needs to name itself in user-facing UI, use `Wake Board`.
- Do not churn internal variables, docs, developer logs, or historical
  architecture notes just to remove ASJ from development context.

When a UI surface feels dense or confusing, first ask whether there is a
validated app pattern that should be adapted before inventing a custom
interaction. Prefer proven patterns adapted to ASJ over novelty for its own
sake.

## User Action Instruction Format

When any Codex or CTO session asks the user to do something, the instruction
must say exactly where to go and what to do there. Keep it concise, but do not
omit the location/context.
User-facing explanations should be brief and easy to scan. The Founder will
ask follow-up questions if more detail is needed.

Use this response format consistently:

- When asking another Codex/development session to do work, use a highly
  visible bold heading-style section header and a copyable prompt block:

```text
## **개발 세션에게**
<copyable prompt text>
```

- When asking the Founder/user to do work, use a highly visible bold
  heading-style section header. Write normal step-by-step explanation outside
  code blocks, and use code blocks only for exact copy/paste values or terminal
  commands:

```text
## **사용자에게**
<short, clear step-by-step explanation>

```text
<copyable value only when needed>
```
```

Only include an action section when there is an actual action owner. Do not add
unnecessary user/development-session sections when no action is needed.
If both the Founder/user and another development session have actions, include
both sections and state the order clearly.
Keep the work stream moving. Pause for explanation or questions only when a
decision is needed from the Founder or when the Founder explicitly asks a
question. Otherwise, provide only the next needed prompt/action for the
appropriate owner.
If the development session can proceed directly and the Founder does not need
to decide or act, do not add a user-facing action section.

When the Founder asks what remains or asks for current status, do not list only
recent chat items. Use the remote-backed grouped ASJ listup view below as the
canonical source. Do not improvise a new list structure per session. Show it
with these two sections:

```text
완료:
현재 남은 과제:
```

Keep this summary concise and easy to scan.
Unless the Founder explicitly asks for a summary, subset, or priority-only
answer, show the grouped canonical list. Do not shorten the completed section
to a partial list just because the immediate discussion is about the next task.
For workstream names, prefer paired labels in the form
`English term(한국어 설명)` when an English term is a known project term. Use
plain Korean only when there is no useful English project term. Do not force
awkward Korean translations for technical/product terms.
Keep backlog/workstream names stable across answers. If a workstream was once
named in the project memory or conversation, do not silently rename, merge, or
omit it just because it is not active today. Preserve the same list structure
so the Founder can recognize continuity over time. If an item is completed,
blocked, deferred, or split, keep the item visible and mark its status.
When showing the remaining work list, group items by intent instead of attaching
`필수`, `옵션`, or `QA` to every individual item. Distinguish unimplemented
product work from implemented-but-not-yet-QA-verified work at the group level.
QA waiting items are not product features; keep them under `QA / 검증 대기`.

Current grouped listup view:

```text
완료:
- Core Foundation(핵심 기반)
  - Auth / Anonymous Auth(인증 / 익명 인증)
  - Ownership / Realtime(소유권 / 실시간 동기화)
  - Push Registration / Delivery(푸시 등록 / 전달)
  - Kakao / Email Recovery(카카오 / 이메일 계정 복구)
  - Upload / Compression / Detail Stability(업로드 / 압축 / 상세 안정화)
  - Startup Performance / Region Alignment(부팅 성능 / 리전 정렬)
  - Summary-first Boot(요약 우선 부팅)
  - no-EAS Local Testing Path(EAS 없는 로컬/실기기 테스트 경로)
  - Full Local-first Journal Cache P1(완전한 로컬 우선 기록 캐시 1차)

- Product UX Foundation(제품 UX 기반)
  - Home / Journal UX(홈 / 기록 UX)
  - Upload Entry UX(업로드 진입 UX)
  - Analysis Trust UX(분석 신뢰 UX)
  - Detail Media State(상세 미디어 상태)
  - Media Placeholder Polish(미디어 로딩/스켈레톤 정리)
  - Theme Mode(시스템/라이트/다크 테마)
  - Visible UI Polish(가시 UI 정리)

- Operations Foundation(운영 기반)
  - Render Singapore Backend(렌더 싱가포르 단일 백엔드)
  - Render JSON Summary Logs(렌더 JSON 요약 로그)
  - QA Debug Panel(QA 디버그 패널)
  - Postico DB Read Path(Postico DB 조회 환경)

현재 남은 과제:
- AI 전 기반 정리 / 다음 진행
  - Development Build / Local Build Workflow(개발 빌드 / 로컬 빌드 워크플로우): EAS 빌드 의존도를 줄이기 위해 AI Calibration 전에 구축한다. Expo Go no-EAS 테스트는 이미 가능하지만, Push/deep link/native compression 같은 native/standalone 성격을 더 자주 확인할 수 있는 development build 또는 local native build 루틴은 아직 별도 정리되지 않았다.

- 필수 / 아직 미시작
  - AI Calibration(AI 캘리브레이션): TS/HS Evidence(TS/HS 근거) 안정화부터 시작
  - Reference Video Set(기준 영상 세트) 준비/정의
  - Trick-name Accuracy(트릭명 정확도 개선)
  - MediaPipe / Pose Landmark(미디어파이프 / 포즈 랜드마크)는 보조 근거로 검토

- 구현 완료 / 다음 빌드에 포함될 항목
  - Boot Flicker Fix(부팅 깜박임 방지)
  - Detail Loading UX Polish(상세 로딩 UX 정리)
  - Media Placeholder First Paint Fix(썸네일 전 빈 박스 방지)

- QA / 검증 대기
  - Email Recovery Standalone Deep-link(이메일 복구 standalone 딥링크)
  - Account Recovery Small-screen QA(계정 복구 작은 화면/취소/복귀)
  - 다음 standalone 빌드에서 post-Build-106 수정 확인

- Store 전 운영
  - QA Debug Panel Hide/Gate(QA 디버그 패널 숨김/차단)
  - Kakao/Supabase OAuth Review(카카오/슈파베이스 OAuth 표시/redirect/consent 점검)
  - Push Notification Icon Polish(푸시 알림 아이콘 정리)

- 옵션 / 나중
  - Postico Read-only DB User(Postico 읽기 전용 DB 사용자)
  - Custom Domain(커스텀 도메인)
  - Share Export / Native Share Sheet / ShareResult Route(공유 내보내기 / 네이티브 공유 / 공유 결과 경로)
  - Detail Representative Media Selection(상세 대표 미디어 선택)
  - Moment Memo / Rider Note(기록 메모 / 라이더 노트)
  - Legacy Thumbnail Backfill(기존 기록 썸네일 보강)
  - Apple Login(애플 로그인)
```

Detailed historical stable workstream list:

```text
완료:
- Upload Part 1(업로드 1차)
- Upload Reliability P0/P1(업로드 안정화)
- State Sync / Polling Removal(상태 동기화 / 폴링 제거)
- Thumbnail Persistence(썸네일 영속화)
- Auth Phase 1 / Phase 2(인증 1차 / 2차)
- Device-first Anonymous Auth(기기 우선 익명 인증)
- Ownership Boundary(사용자 소유권 경계)
- Private Realtime(사용자별 실시간 동기화)
- Push Registration / Delivery(푸시 등록 / 전송)
- Push Observability P2(푸시 관측성 2차)
- Account Linking(계정 연결)
- Kakao Recovery / Account Linking(카카오 복구 / 계정 연결)
- Kakao Recovery Sign-in P1(카카오 기존 기록 복구 로그인 1차)
- Foundation Safety Check(기반 안전 점검)
- Kakao Recovery Ownership Smoke(카카오 복구 소유권 스모크)
- External No-Token Finalization(외부 무토큰 경로 최종 정리)
- Push Token Account-switch Policy(푸시 토큰 계정 전환 정책)
- Product UX Baseline P1 - Unified User-Facing Status Resolver(사용자 표시 상태 통합)
- Detail Menu / Retry Eligibility Polish(상세 메뉴 / 재시도 가능 조건 정리)
- Home v2 / Journal UX First Slice(홈 v2 / 저널 UX 1차)
- Upload Entry UX Polish(업로드 진입 UX 정리)
- Analysis Trust UX(분석 신뢰 UX)
- Kakao Single CTA Recovery UX(카카오 단일 CTA 복구 UX)
- Initial Loading / Video Tab Spinner Observability P1(초기 로딩 / 영상 탭 스피너 관측성 1차)
- QA Debug Overlay / Panel P1(QA 디버그 오버레이 / 패널 1차)
- Real-use Loading Diagnosis / Auth Bootstrap Timeout & Remote Moment Sync P1(실사용 로딩 진단 / 인증 부트스트랩 타임아웃 / 원격 기록 동기화 관측성 1차)
- Auth Bootstrap Timeout / Observability(인증 부트스트랩 타임아웃 / 관측성): 구현 가능한 현재 범위 완료. `getSession` / `getUser` / anonymous sign-in 단계별 status, durationMs, reason을 QA Debug Panel에서 확인 가능
- Email Recovery Connection P1(이메일 복구 수단 연결 1차): Build 89 fresh-link QA 성공
- Email Recovery Sign-in P1(이메일 기존 기록 복구 로그인 1차): 코드 구현 완료. Build 92 피드백 후 UI는 Kakao처럼 single CTA로 정리됨. 사용자는 이메일 입력 후 `이메일로 계속하기`만 누르고, 내부에서는 `updateUser({ email })` current-account 연결을 먼저 시도한 뒤 이미 등록된 이메일이면 local-work guard 후 `signInWithOtp({ shouldCreateUser: false, emailRedirectTo })` recovery sign-in으로 이어감. Build 102 pre-AI smoke에서 발견된 same-current-email no-op pending 혼선은 이후 코드에서 차단했다. Standalone E2E QA는 다음 빌드 승인 후 확인 필요
- Compression / Upload Optimization POC(영상 압축 / 업로드 최적화 POC): Build 89 실기기 QA 성공
- Compression Upload Flow P1(압축 업로드 플로우 1차): Build 91 실기기 QA 성공. 압축된 영상 업로드 후 분석 완료까지 정상 확인
- Video no-records timeout UI fix(영상 탭 무기록 타임아웃 UI 보정): Build 91 실기기 QA 성공
- Media Preview Policy P1(미디어 미리보기 정책 1차): 구현 완료 / Build 92 피드백 반영. 원본 local video가 있으면 원본이 user-facing preview이고, completed + thumbnail + compressed local asset은 source storage status와 무관하게 Detail playback에서 제외되어 thumbnail-only로 전환됨. 새 compressed upload temp file은 서버 Moment 생성 성공 후 best-effort cleanup
- Media / Share UX P1(미디어 / 공유 경험 1차): 구현 완료. 외부 공유 기능이 아니라 Moment Detail의 completed evidence 아래 share-ready preview card 기반을 추가
- Future Media UX P1 - Detail Media State Polish(향후 미디어 UX 1차 - 상세 미디어 상태 정리): 구현 완료. Detail media hero에서 thumbnail-only 상태를 "대표 이미지"로 자연스럽게 표시하고, completed / non-completed missing media 문구를 분리
- Archive Card Visual Hierarchy P1(아카이브 카드 시각 위계 1차): 구현 완료. Video 탭 archive row를 파일 목록이 아니라 라이딩 기록 카드처럼 보이도록 journal label/date/title/status/state-aware description 위계로 정리
- AI Pre-build Hardening Pass(AI 전 빌드 전 최종 하드닝): 구현 완료. boot remote sync가 받은 `/api/moments?limit=20` first page를 Video Archive first page로 ref 기반 선반영하여 같은 렌더/effect 사이클의 중복 fetch 가능성을 줄였고, Video first-page in-flight ref로 동시 요청도 차단. `/health` prewarm은 추가하지 않았으며 Render Starter baseline + QA Debug Panel 진단 흐름을 유지
- Startup Performance Observability P1(시작 성능 관측성 1차): 구현 완료 / Build 94 관측 QA 대기. `/api/moments` server timing 로그와 client Video diagnostics를 추가했고, QA Debug가 Video `api/source` 및 `ui/norm/bootReuse/dupBlocked`를 표시한다. 목적은 최적화가 아니라 Build 93에서 보인 Video ready 4-6초의 원인 분해
- Startup Performance Observability P2(시작 성능 관측성 2차): 구현 완료 / Build 95 관측 QA 대기. `/api/moments`에 `resolveRequestUserMs`, `authGetUserMs`, `publicUserLookupMs`, `publicUserUpsertOrSyncMs`, `staleCleanupMs`, `responseBytes`, `serverTotalMs`, `requestId`를 추가했다. Build 95에서 앱 `apiMs`와 Render `serverTotalMs`를 비교한다
- Startup Performance Observability P2.1(시작 성능 관측성 2.1차): 구현 완료 / Build 96 관측 QA 대기. 앱 QA Debug Video 영역에 short `requestId`와 `serverTotalMs`를 표시해 앱 `apiMs`와 서버 handler total을 같은 화면에서 비교할 수 있게 했다
- Startup Performance Optimization P1(시작 성능 최적화 1차): Build 97 실기기 QA 통과 / 완료. `/api/moments` stale cleanup을 blocking path에서 분리했고, raw token 저장 없이 bearer token SHA-256 hash 기반 짧은 TTL cache로 `resolveRequestUser` 반복 비용을 줄였으며, thumbnail signed URL wall time 계측을 추가했다. Founder QA에서 개선 전보다 확실히 빨라졌고, 0개 계정 반복 실행은 `serverTotalMs`가 약 `0.66s`까지 내려가는 것을 확인했다
- Startup Performance Optimization P1.5(시작 성능 최적화 1.5차): 구현 완료 / Build 102 closeout 기준 AI blocker 아님. `/api/moments` list response를 compact evidence로 줄여 `raw_response_text`, temporal/evidence windows, observations, detailed observed-facts/validation payloads, approach v2 signal payloads를 list에서 제외했다. Moment Detail은 새 authenticated `GET /api/moments/:momentId`로 full evidence를 보강한다. P1.5 build 전 Detail fetch diagnostics(`detailFetchMs`, `detailServerTotalMs`, `detailRequestId`, `detailResponseBytes`)도 추가했다
- Startup Performance / Region Alignment Closeout(시작 성능 / 리전 정렬 마감): Build 102 기준 AI Calibration blocker 아님 / pause 가능. Singapore-only backend에서 `view=summary`, `evidenceQueryMs=0`, `thumbnailSignedUrlWallMs=0`, 0-record bytes `48`, 7-record bytes 약 `7545`, boot/API 대체로 `0.6s-1.9s`, server 대체로 `0.3s-1.7s`를 확인했다. local-first cache, stale-while-revalidate, custom domain, advanced infra tuning은 후속 backlog로 분리한다
- Pre-AI Design / Settings / Theme Closeout(AI 전 디자인 / 설정 / 테마 마감): 구현 완료. Settings 독립 스택, System/Light/Dark 선택, Ionicons app chrome, Wake Board 사용자-facing 명칭, Settings copy 축약, version footer, Video/Home 최신순 label, QA diagnostics footer, page-header 단순화까지 반영. Founder Simulator check는 "일단 패스" 상태

현재 남은 과제:
- Anonymous-first Guardrail(익명 사용자 우선 원칙 유지): 구현 과제가 아니라 앞으로도 유지해야 하는 제품 원칙
- Email Recovery Fresh-link Recheck(이메일 복구 fresh link 재확인): Build 89에서 `parksunl77@daum.net`으로 메일 링크 클릭 -> ASJ 앱 복귀 -> 수동 갱신 없는 "복구 준비 완료" 표시 -> 앱 완전 종료 후 재실행 연결 상태 유지까지 성공. 현재-account Email Recovery Connection P1은 완료
- QA Debug Panel Production Policy(QA 디버그 패널 정식 배포 전 숨김 / 제거 정책): Founder가 별도로 말하기 전까지 유지. App Store / 실서비스 배포 직전에 숨김/제거 정책 적용
- QA Debug Panel Observability Rule(QA 디버그 패널 관측성 원칙): 향후 성능/부팅/업로드/복구 QA에서 앱 화면에서 바로 판단해야 하는 non-secret 값은 가능하면 QA Debug Panel에 먼저 노출한다. Render 로그는 보조 확인 수단으로 두고, `view`, `serverTotalMs`, `evidenceQueryMs`, `thumbnailSignedUrlWallMs`, `cacheHit`, short request id처럼 민감정보가 아닌 값은 다음 관측성 작업 시 Panel 표시를 우선 검토한다. token, email, full user id, secret, full callback URL은 계속 표시 금지
- Recovery Attempt Observability P1(복구 시도 관측성 1차): 완료. `recovery_attempts` SQL 파일, `POST /api/recovery-attempts` BFF endpoint, client `recordRecoveryAttempt()` helper, Kakao/Email 주요 started/succeeded/failed/cancelled/dismissed/blocked 이벤트 연결 완료. Migration 적용 완료, authenticated insert smoke 완료, 개인정보 redaction 및 no-token 401 확인 완료
- Email Recovery Deep Link / Redirect Strategy(이메일 복구 딥링크 / 리다이렉트 전략)는 current-account email connection P1까지 구현 완료. 기존 기록 복구 sign-in은 별도 후속
- Render / Supabase Plan Upgrade Check(Render / Supabase 플랜 업그레이드 검증)는 Render Web Service Starter 전환부터 완료했다. 목적은 고성능이 아니라 Free plan cold start 변수를 제거하고, 이후 AI Calibration 중 업로드/분석 지연이 앱/백엔드 문제인지 인프라 sleep 문제인지 분리하는 것이다. 2026-06-30 확인에서 production Render `/health`는 2회 연속 HTTP 200, 약 334ms -> 244ms였고, `ok=true`, `primaryProvider=gemini`, `geminiConfigured=true`, `mockAi.enabled=false`였다. 코드/env/buildNumber/DB/Auth/Supabase 변경은 없었다.
- Upload Entry UX Bottom Sheet(업로드 진입 바텀시트)는 필요 시 후속 재검토
- Kakao display_name sync/fallback(카카오 이름 동기화 / fallback): 현재 범위 완료. 서버 authenticated user resolver는 `full_name` -> `name` -> `preferred_username` -> `user_name` -> email 순서로 `public.users.display_name`을 동기화
- 사용자 직접 display_name 편집 기능 도입 시 Kakao metadata overwrite 정책 재검토
- Media / Share UX Next Step(미디어 / 공유 경험 다음 단계): image export, native share sheet, ShareResult route 중 하나를 별도 승인 후 선택
- Future Media UX Next Step(향후 미디어 경험 다음 단계): image export/native share route 또는 ShareResult route를 별도 승인 후 선택. Archive Card Visual Hierarchy P1은 완료
- Future Detail UX Backlog(향후 상세 화면 UX 후속): 지금 구현하지 않는다.
  - Detail Representative Media Selection(상세 대표 미디어 선택): 영상 상세에서 원본 video / thumbnail / 향후 share preview / AI 결과 중 어떤 미디어를 대표로 볼지 또는 남길지 선택하는 기능. Media Preview Policy와 AI Calibration 이후 검토한다.
  - Moment Memo / Rider Note(순간 메모 / 라이더 노트): 사용자가 자기 영상에 직접 메모를 남기는 기능. ASJ의 journal 성격에 중요하지만 키보드 UX, 입력/수정/저장 흐름, Detail/Edit 위치, local/remote persistence 설계가 필요하므로 Detail UX / Journal UX 후속으로 검토한다.
- OAuth Step Reduction Investigation(외부 OAuth 진행 단계 축소 가능성 조사): 조사 완료. 앱 내부 Kakao Single CTA one-click은 충족했고, 남은 Kakao/iOS OAuth 계속 단계는 플랫폼/provider 인증 단계라 우회하지 않음. Store 전 Kakao/Supabase 표시/redirect/consent 설정 점검만 후속
- Email Recovery Sign-in Standalone E2E QA(이메일 기존 기록 복구 실기기 QA): single CTA 구현 완료 / 실기기 QA 대기. 실제 이메일 링크 클릭 -> ASJ 앱 복귀 -> 기존 email-linked Auth user session 전환 -> Home/Video/Detail reload는 standalone build와 fresh test email로 검증 필요
- Account Recovery UI Information Architecture P1(계정 복구 UI 정보구조 1차): 구현 완료 / 실기기 QA 대기. `AccountRecoveryScreen`은 Upload처럼 독립 스택 페이지를 유지하되, 첫 화면을 "기록 보호 방법 선택 허브"로 단순화했다. 첫 화면은 compact protection summary, 연결 수단 badge, Kakao/Email method card를 보여주고, Email/Kakao의 상세 pending/error/linked 상태는 선택 또는 진행 후 progressive disclosure로 보여준다. Auth/Supabase/Kakao/Email helper 로직은 변경하지 않았다.
- Build 96 Startup Performance Observability P2.1 QA(빌드 96 시작 성능 관측 2.1차 QA): EAS preview/internal build 완료 / Founder timing QA 대기. Build commit `4f8f4a2`, iOS buildNumber `96`, EAS Build ID `68b17987-b5f8-4a6f-9a06-7a2260c69708`. 다음 작업 재개 시 앱 QA Debug `apiMs`와 `serverTotalMs`를 먼저 비교한다
- Build 97 Startup Performance Optimization P1 QA(빌드 97 시작 성능 최적화 1차 QA): EAS preview/internal build 완료 / Founder QA 통과. Build commit `1bb347c`, iOS buildNumber `97`, EAS Build ID `a3693975-e234-4ae0-a169-373fd683cd3a`. Install page는 `https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/a3693975-e234-4ae0-a169-373fd683cd3a`, IPA URL은 `https://expo.dev/artifacts/eas/46cVuinLZ-VVowkdVFcw-iKcdjx-vvzG10RU4M7Vyx4.ipa`. Founder 판단은 "개선 전보다 확실히 체감 개선됨"이다. 0개 계정은 반복 실행 기준 `serverTotalMs`가 `672ms`, `661ms`, `661ms`까지 내려갔고, Build 96의 0개 계정 `1.9-2.6s` 대비 개선이 확인됐다. 7개 계정은 `1666-3728ms` 편차가 남아 있어 P1.5 후보로 evidence payload 축소, thumbnail signed URL lazy/cache, list/detail payload 분리를 보관한다
- Startup Performance Optimization P1 QA(시작 성능 최적화 1차 QA): Build 97 QA 통과 / 완료. Build 96에서 확인한 server-side 지연을 줄이기 위해 stale cleanup 비동기화, request user TTL cache, thumbnail wall timing 보정을 반영했고, Build 97에서 0개 계정 성능 개선을 확인했다
- Build 98 Startup Performance Optimization P1.5 QA(빌드 98 시작 성능 최적화 1.5차 QA): EAS preview/internal build 완료 / boot 및 Video readiness QA 결과 반영. Build commit `1a4f542`, iOS buildNumber `98`, EAS Build ID `506cf961-45d7-4e26-ac47-f3106ca1ec7f`. Install page는 `https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/506cf961-45d7-4e26-ac47-f3106ca1ec7f`, IPA URL은 `https://expo.dev/artifacts/eas/xfI0axoBndQ7i7YPGS2lpBbPhYCec9WDLSX1vgdnR1U.ipa`. Build 96/97 이전보다 개선 체감은 있으나 long-idle first access와 repeated access 차이가 남았다. 0-record anonymous는 첫 케이스 Boot/Video api 약 `3523ms`, server 약 `3053ms`에서 이후 Boot `1004-2092ms`, server `681-1715ms`까지 내려갔다. 7-record recovered는 Boot/Video api `1449-5273ms`, serverTotalMs `1162-3545ms`로 흔들림이 남았다. `source boot reuse`는 보이고 `dupBlocked`도 일부 발생하므로 reuse/guard는 동작 중이다. 다음 판단은 Render `[moments_timing]`의 `cacheHit`, `momentsQueryMs`, `evidenceQueryMs`, `thumbnailSignedUrlWallMs`, `responseBytes`, `normalizationMs`, `serverTotalMs`를 request id로 비교한 뒤 P1.6 후보를 선택한다
- Startup Performance Optimization P1.6(시작 성능 최적화 1.6차): 구현 완료 / Render 배포 완료 / Build 98로 관찰 대기. Build 98 Render timing 대조 결과 7-record 계정의 주요 후보가 `thumbnailSignedUrlWallMs`였으므로 `/api/moments`에 thumbnail signed URL short TTL in-memory cache를 추가했다. 기본값은 `THUMBNAIL_SIGNED_URL_CACHE_TTL_MS=600000`, `THUMBNAIL_SIGNED_URL_CACHE_MAX_ENTRIES=1000`이며 cache key는 storage bucket/path다. `/api/moments` 로그에 `thumbnailSignedUrlCacheHits`와 `thumbnailSignedUrlCacheMisses`가 추가됐다. Auth/user resolve와 public user sync는 security/ownership 경로라 이번에 약화하지 않았다. 서버 전용 변경이라 새 EAS Build 없이 Build 98 앱으로 반복 접속 후 Render `[moments_timing]`을 보면 된다
- Startup Performance Optimization P1.7(시작 성능 최적화 1.7차): 구현 완료 / 다음 Render 배포 후 Build 98로 관찰 대기. P1.6 후속 로그에서 thumbnail cache hit 케이스는 `serverTotalMs`가 약 `920-1322ms`까지 내려갔지만, 느린 케이스는 `resolveRequestUserMs`가 0-record 약 `2103ms`, 7-record 약 `1220-1684ms`로 남았다. SHA-256 bearer-token-hash 기반 request user cache의 기본 TTL을 `45s`에서 `5min`(`REQUEST_USER_CACHE_TTL_MS=300000`)으로 늘렸다. raw bearer token 저장, no-token/default-user 정책, ownership boundary, Auth/Recovery/Upload/AI flow는 변경하지 않았다. `/health`는 non-secret `performanceCaches` 설정값을 노출한다
- Startup Performance Optimization P1.8(시작 성능 최적화 1.8차): 구현 완료 / 다음 Render 배포 후 Build 98로 관찰 대기. P1.7 로그에서 5분 TTL은 정상 동작했지만 실사용 간격에는 짧았다. Cache hit 상태는 `serverTotalMs` 약 `867-1396ms`, `resolveRequestUserMs` 약 `0-1ms`, `thumbnailSignedUrlWallMs` 약 `0-1ms`로 충분히 빠른 반면 cache miss는 여전히 약 `2.8-4.0s`였다. 영구 cache는 하지 않고 서버 메모리 cache 기본 TTL만 30분으로 조정했다: `REQUEST_USER_CACHE_TTL_MS=1800000`, `THUMBNAIL_SIGNED_URL_CACHE_TTL_MS=1800000`. raw bearer token 저장, no-token/default-user 정책, ownership boundary, DB/Auth/Storage/API contract, AI flow는 변경하지 않았다
- Startup Performance Optimization P1.9(시작 성능 최적화 1.9차): 구현 완료 / 다음 Render 배포 후 Build 98로 관찰 대기. Auth 검증 제거가 아니라 verified auth 이후 public user resolve 비용과 list 후속 쿼리 직렬 비용을 줄이는 작업이다. `auth.getUser()`는 유지하고, verified `authUserId -> public.users.id` mapping을 30분 in-memory cache로 저장한다. 기존 public user profile sync는 deferred 처리하고 신규 public user insert는 blocking 유지한다. `/api/moments` moments query 이후 compact evidence lookup과 thumbnail signed URL generation을 병렬화했다. 새 로그 필드는 `authUserPublicUserCacheHit`, `publicUserSyncAction`, `evidenceIdsCount`이며 API response contract/UI/DB/Auth/Recovery/Upload/AI flow는 변경하지 않았다
- Startup Performance P2 Summary-first Boot(시작 성능 2차 summary-first 부팅): 구현 완료 / Build 99 standalone QA 대기. `/api/moments?view=summary`를 추가했고 기본 `/api/moments`는 full로 유지해 Build 98 호환을 보존했다. Summary view는 response shape를 유지하되 list evidence lookup과 thumbnail signed URL 생성을 생략한다. Boot sync, Video first page/pagination, remote refresh, upload reconciliation lookup은 summary view를 사용한다. Detail은 기존 `GET /api/moments/:momentId` full endpoint로 evidence/thumbnail을 보강한다. Auth/ownership/no-token/DB/Storage/Upload/Recovery/AI flow는 변경하지 않았다
- Build 99 Startup Performance P2 Summary-first Boot QA(빌드 99 시작 성능 2차 summary-first 부팅 QA): EAS preview/internal build 완료 / Founder 실기기 QA 대기. Build prep commit `18340e9`, base implementation commit `918e7a0`, iOS buildNumber `99`, EAS Build ID `ae567786-f3c7-4aa3-913d-4af033b1d4fd`. Install page는 `https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/ae567786-f3c7-4aa3-913d-4af033b1d4fd`, IPA URL은 `https://expo.dev/artifacts/eas/WoQMHBQB1QgD6w96ASPCNzqWRMypwtBWJ1X0OVB22MU.ipa`. QA 기준은 Home/Video boot/list가 `view=summary`를 쓰는지, summary 요청의 `evidenceQueryMs=0` 및 `thumbnailSignedUrlWallMs=0`가 보이는지, thumbnail 없는 list가 깨지지 않는지, Detail 진입 시 full evidence/thumbnail이 보강되는지다
- Build 99 Interim Founder Observation(빌드 99 중간 관찰): 설치 후 anonymous 상태에서 이전 계정 연결/복구 뒤 부팅 속도는 상당히 빨라진 것으로 체감됐다. 반면 이전에 보이던 list 썸네일이 보이지 않았는데, 이는 summary-first list에서 thumbnail signed URL 생성을 생략한 결과로 볼 수 있다. 아직 최종 통과/실패 판단은 아니며, 전체 캡쳐와 Render `[moments_timing]` 로그를 받은 뒤 P2 통과 여부와 thumbnail lazy-load 필요성을 판단한다
- Startup Performance P2.1 Auth Resolve Diagnostics(시작 성능 2.1차 Auth 진단): 구현 완료 / Render 배포 후 관찰 대기. Build 99 로그에서 summary path는 정상 동작했고 `evidenceQueryMs=0`, `thumbnailSignedUrlWallMs=0`, responseBytes 약 7545로 확인됐다. 남은 cold-path 후보는 thumbnail/evidence가 아니라 Auth verification, public user mapping, moments query다. 서버는 Supabase `getClaims()`를 먼저 시도하고 실패하면 `getUser()`로 fallback한다. `/api/moments`는 safe response headers로 `view`, `authVerificationMode`, `authClaimsMs`, `authGetUserMs`, `resolveRequestUserMs`, `publicUserLookupMs`, `momentsQueryMs`, `evidenceQueryMs`, `thumbnailSignedUrlWallMs`, `responseBytes`를 노출하고, QA Debug Panel도 이 값을 표시한다. raw token/email/full user id/signed URL/full callback URL은 노출하지 않는다. DB/Auth/Storage/Upload/Recovery/AI flow는 변경하지 않았고, buildNumber/EAS Build도 변경하지 않았다
- Startup Performance P2.1 Public User Lookup Cache(시작 성능 2.1차 public user lookup cache): 구현 완료 / Render 배포 후 Build 100으로 관찰 대기. Build 100 QA에서 `view=summary`, `evidenceQueryMs=0`, `thumbnailSignedUrlWallMs=0`, responseBytes 약 7545가 확인되어 list payload/thumbnail/evidence는 병목에서 제외됐다. 느린 케이스는 `authVerificationMode=claims`, `authClaimsMs` 약 880ms, `publicUserLookupMs` 약 918ms, `resolveRequestUserMs` 약 1799ms였고 빠른 케이스는 token/public user cache hit으로 `publicUserLookupMs=0`, `resolveRequestUserMs=0`이었다. `public.users.auth_user_id`는 schema상 `unique`라 index가 있어야 하고 lookup query도 `id, display_name, email`만 선택하므로, P2.1은 auth 검증을 우회하지 않고 verified `authUserId -> public.users.id` cache를 request token cache와 분리했다. `AUTH_USER_PUBLIC_USER_CACHE_TTL_MS` 기본값은 6시간, `AUTH_USER_PUBLIC_USER_CACHE_MAX_ENTRIES` 기본값은 500이며 `/health.performanceCaches`에 노출된다. raw bearer token 저장, no-token/default-user 정책, ownership filtering, Auth/Recovery/Upload/AI flow, DB schema, API contract, EAS build, buildNumber는 변경하지 않았다
- Build 101 Startup Performance P2.2 QA(빌드 101 시작 성능 2.2차 QA): EAS preview/internal build 완료 / Founder 실기기 QA 대기. Build prep commit `c939257`, base implementation commit `7ded0ba`, iOS buildNumber `101`, EAS Build ID `cda7e537-ed24-4365-b117-e7b5b0ac9061`. Install page는 `https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/cda7e537-ed24-4365-b117-e7b5b0ac9061`, IPA URL은 `https://expo.dev/artifacts/eas/WLDNFrq_Ti9CDD-kJXjkPu6Qtux0t6obSYjT_uoAGSQ.ipa`. Build 101은 summary-first boot/list, claims-first auth diagnostics, verified public-user cache separation, same-token in-flight request-user resolution dedupe, phase 14 moment list index migration file을 포함한다. Render latest deploy와 Supabase index SQL 적용은 사용자/CTO 세션에서 완료 확인됐다. QA 기준은 long-idle 첫 진입, 바로 재진입, QA panel의 auth mode/claims/resolve/query/server timing, Render `[moments_timing]` requestId 대조, Home/Video thumbnail placeholder, Detail full thumbnail/evidence 보강, Upload/Auth/Recovery 회귀 확인이다
- Build 102 Singapore Endpoint QA(빌드 102 싱가포르 엔드포인트 QA): EAS preview/internal build 완료 / endpoint 전환 및 정량 startup 확인 완료 / Upload/Auth/Recovery smoke 대기. Build commit `2584872`, iOS buildNumber `102`, EAS Build ID `2f1620ae-1a9e-4323-a935-710803b0aeeb`. Install page는 `https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/2f1620ae-1a9e-4323-a935-710803b0aeeb`, IPA URL은 `https://expo.dev/artifacts/eas/F40umop-OycaD0QSDvistiHn7rr0I5wbquhkuG7XhoA.ipa`. Founder가 설치/실행 정상과 Singapore Render 실제 앱 로그 유입을 확인했고, capture 기준 `view=summary`, `evidenceQueryMs=0`, `thumbnailSignedUrlWallMs=0`, 0-record bytes `48`, 7-record bytes 약 `7545`, boot/API 대체로 `0.6s-1.9s`, server 대체로 `0.3s-1.7s`를 확인했다. Startup Performance / Region Alignment는 AI blocker가 아니므로 pause 가능하다
- Startup Performance Optimization P1.5 QA(시작 성능 최적화 1.5차 QA): 구현 완료 / Build 98 QA 대기. list에서 compact evidence만 반환하고 Detail에서 full evidence를 별도 조회하는 최소 list/detail payload 분리를 적용했다. Moment Detail QA/debug에서 detail request id/server ms/fetch ms/response bytes를 볼 수 있다. Build 98에서 7개 계정 list `responseBytes`/`serverTotalMs`와 Detail fetch diagnostics를 Build 97 대비 확인한다
- Build 95 Startup Performance Observability P2 QA(빌드 95 시작 성능 관측 2차 QA): EAS preview/internal build 완료 / Founder timing QA 대기. Build commit `f49481e`, iOS buildNumber `95`, EAS Build ID `b45e226d-60f7-458d-ab2e-e814f33ca6c6`. 다음 작업 재개 시 앱 QA Debug `apiMs`와 Render `[moments_timing] serverTotalMs/requestId`를 먼저 비교한다
- Build 94 Startup Performance Observability QA(빌드 94 시작 성능 관측 QA): EAS preview/internal build 완료 / Founder multi-day 실사용 관측 대기. Build commit `880ed23`, iOS buildNumber `94`, EAS Build ID `9ee5a132-44c5-4760-95d6-f76c2e4b3a67`. 다음 작업 재개 시 Startup / Video ready QA Debug 값과 server `/api/moments` timing 로그를 먼저 확인한다
- Build 93 Pre-AI QA(빌드 93 AI 전 기준선 QA): EAS preview/internal build 완료. Build 94가 Startup Performance Observability P1을 추가한 최신 관측 빌드이므로, startup/video ready 판단은 Build 94 기준으로 이동했다
- Push Notification Icon Polish(푸시 알림 아이콘 정리): 급하지 않은 후속. 앱 내부 Ionicons 정리와 별개로, OS Push notification에 표시되는 앱/알림 아이콘이 기본값처럼 보이지 않도록 나중에 확인한다. Push delivery/observability 로직은 이미 완료된 영역이므로 이 항목은 비주얼/asset polish로만 다룬다
- Email Custom SMTP(이메일 발송 설정)
- Kakao Biz App / Email Permission(카카오 비즈 앱 / 이메일 권한 정리)
- Compression / Upload Optimization(영상 압축 / 업로드 최적화): Build 89 POC 성공 후 정식 upload submit path로 1차 승격. Build 90 read-only follow-up에서 약 25MB 원본이 `FullSizeRender.compressed.mp4` 12,776,723 bytes / 12.83 seconds / `video/mp4` 최종 파일로 업로드 target finalization 및 Gemini analysis completion까지 이어진 것을 확인. Build 91 실기기 QA에서 압축 영상 업로드 후 분석 완료까지 통과. Backend 정책은 계속 최종 파일 기준
- Build 90 Compression Flow QA(빌드 90 압축 업로드 플로우 QA): 기술 flow 검증 완료. `uploadProcessing`은 response/debug metadata로는 확인 가능하지만 DB에는 저장되지 않으므로, 원본/압축 비율의 사후 DB 관측이 필요하면 별도 upload observability 후속으로 분리
- Upload Selection Size Validation Fix(업로드 선택 단계 용량 검증 순서 보정): 코드 반영 완료. 30MB 초과 소스도 기본 video/URI/fileSize/duration/MIME 및 15초 제한을 통과하면 Upload 화면까지 허용하고, 30MB 정책은 압축/최적화 후 최종 업로드 파일 기준으로 적용
- Build 91 Upload/Compression Closeout QA(빌드 91 업로드/압축 마감 QA): 실기기 QA 통과. Upload Unified Progress UX, Upload Selection Size Validation Fix, Compression Upload Flow P1, Video no-records timeout UI fix가 모두 통과했고 압축된 영상 업로드 후 분석까지 정상 완료
- Render Plan Upgrade A/B Check(Render 플랜 업그레이드 A/B 확인): 완료. Render Web Service를 Starter($7/mo)로 전환했고, 앱 코드/env/build 변경 없이 `/health` 2회 200 응답과 sub-second latency를 확인했다. 이후에도 QA Debug Panel 값으로 첫 실행/Video sync/API 응답을 계속 본다.
- EverEx Reference for AI Motion Productization(EverEx 참고): EverEx는 의료/재활 중심이라 ASJ의 직접 경쟁사는 아니지만, AI motion analysis를 신뢰 가능한 개인 맞춤 피드백과 장기 변화 추적으로 제품화하는 참고 사례다. ASJ AI Develop 때는 의료/재활 포지션을 따라가지 말고, moment evidence, rider growth, readable next-step feedback, progress tracking 관점만 참고한다
- AI Calibration(AI 분석 정확도 보정): 첫 진입은 별도 과제가 아니라 TS/HS Evidence(토/힐 사이드 근거) 보정으로 시작한다. Gemini/GPT 분석만으로 밀지 말고, 실제 ASJ 샘플에서 MediaPipe Pose/Landmark가 보조 근거가 될 수 있는지 feasibility spike로 검증한다. MediaPipe는 단독 판정기가 아니라 Motion Evidence Extraction(동작 근거 추출)의 후보 신호다
- Apple Login(애플 로그인)
- Google Login(구글 로그인)
- Phone/SMS Recovery(전화번호 / 문자 복구)
- Anonymous Cleanup(익명 계정 정리)
```

Current remaining work classification:

```text
핵심 / 진행 순서:
- Account Recovery UI Information Architecture P1(계정 복구 UI 정보구조 1차): 구현 완료 / 실기기 QA 대기. 현재 상태, 복구 이메일, Kakao 상태가 한 화면에 모두 노출되던 구조를 독립 스택 유지 + 첫 화면 선택 허브 + 선택 후 Email/Kakao 세부 상태 progressive disclosure로 정리했다. 다음 QA에서는 첫 화면 정보 밀도, Email card 선택 후 입력 UI, Kakao card 진행/취소 상태, 작은 iPhone 줄바꿈을 확인한다.
- Media / Share UX(미디어 / 공유 경험): 실제 외부 공유 활성화는 AI 신뢰도 이후. 지금은 공유 가능한 Moment 표현력, 카드, detail/media presentation 기반을 준비하는 범위.
- Future Media UX(향후 미디어 경험): Detail Media State Polish와 Archive Card Visual Hierarchy P1은 완료. 다음 후보는 export/share route이며, 미디어 저장 정책이나 AI Calibration과 섞지 않는다.
- AI Calibration(AI 분석 정확도 보정): 다음 큰 제품 품질 작업. 첫 시작은 별도 과제가 아니라 TS/HS Evidence(토/힐 사이드 근거) 안정화이며, 이후 더 넓은 trick-name accuracy로 확장한다.

QA / 검증 대기:
- Pre-AI Foundation Regression Smoke(AI 전 기반 회귀 스모크): Build 102 / Singapore-only 경로에서 마지막으로 확인한다. Upload 선택 -> compression -> upload -> analysis request가 Singapore service에 찍히는지, Auth/session restore가 정상인지, Kakao Recovery 진입/취소/복귀 상태가 정상인지, Email Recovery 화면/CTA가 정상인지, QA Debug Panel에 token/refresh token/full user id/email/full callback URL/signed URL/secret/API key가 노출되지 않는지 확인한다.
- Build 98 Startup Performance Optimization P1.5 QA(빌드 98 시작 성능 최적화 1.5차 QA): EAS preview/internal build 완료 / boot 및 Video readiness QA 결과 반영. 개선은 확인됐지만 0-record와 7-record 차이, long-idle first access와 repeated access 차이가 남아 있다. 다음은 captured request id의 Render timing breakdown 확인이다.
- Startup Performance Optimization P1.6/P1.7/P1.8/P1.9 QA(시작 성능 최적화 1.6-1.9차 QA): Build 102 closeout으로 AI blocker에서 제외. 각 단계의 cache/timing 세부 검증은 historical evidence로 보관하고, 추가 최적화는 local-first cache / stale-while-revalidate / advanced infra tuning backlog로 분리한다.
- Startup Performance P2 Summary-first Boot QA(시작 성능 2차 summary-first 부팅 QA): Build 102 closeout으로 summary-first 정상 확인 완료. `view=summary`, `evidenceQueryMs=0`, `thumbnailSignedUrlWallMs=0`가 확인됐고, Detail full hydration은 기존 guardrail로 유지한다.
- Development Build / Local Build Workflow(개발 빌드 / 로컬 빌드 워크플로우): Build 98 결과가 충분하면 다음 시작점. 반복 EAS preview/internal build 비용을 줄이고, native dependency가 있는 기능도 더 빠르게 검증할 수 있는 workflow를 검토한다.
- Startup Performance Observability Legacy QA(시작 성능 관측 legacy QA): Build 94/95/96 및 P1.5 standalone QA 항목은 Build 102 closeout으로 superseded. 해당 build metadata와 판단 기준은 historical reference로 남기되, 현재 active pre-AI blocker는 아니다.
- Build 93 Pre-AI QA(빌드 93 AI 전 기준선 QA): EAS preview/internal build 완료. Build 94가 Startup Performance Observability P1을 추가한 최신 관측 빌드이므로, startup/video ready 판단은 Build 94 기준으로 이동했다.
- Build 92 AI Calibration Baseline QA(빌드 92 AI 전 기준선 QA): 이전 baseline build. Build 92 이후 피드백과 후속 수정이 많으므로 현재 검증 기준은 Build 93으로 이동했다.
- Email Recovery Sign-in Standalone E2E QA(이메일 기존 기록 복구 실기기 QA): Email Recovery Sign-in P1 코드는 구현 완료. 다음 standalone build에서 이메일 링크 -> ASJ 복귀 -> 기존 email-linked Auth user session 전환 -> Home/Video/Detail reload 확인.
- Media Preview Policy P1 Build QA(미디어 미리보기 정책 1차 빌드 QA): 별도 리스트 항목으로 유지하지 않고, 다음 빌드 때 QA 항목으로 언급. 큰 영상 업로드 -> 압축 -> 분석 완료 -> 원본이 있으면 원본 preview 유지 -> 원본 삭제 후 Detail thumbnail-only 확인 -> completed 후 compressed temp cleanup 회귀 없음 확인.
- Render Plan Upgrade A/B Check(Render 플랜 업그레이드 A/B 확인): 완료. Render Web Service Starter($7/mo) 전환 및 `/health` 확인 완료. Free cold start 변수는 다음 standalone QA baseline에서 제거된 것으로 본다. 이후에도 QA Debug Panel 값으로 앱/백엔드/인프라 문제를 분리한다.
- Render / Supabase Plan Upgrade Check(Render / Supabase 플랜 업그레이드 검증): Render Starter만 완료. Supabase 플랜은 별도 증거가 생기기 전까지 변경하지 않는다.

문서화 / 운영 전 정리:
- QA Debug Panel Production Policy(QA 디버그 패널 정식 배포 전 숨김 / 제거 정책): Founder가 별도로 말하기 전까지 유지. App Store / 실서비스 배포 직전에 숨김/제거.
- QA Debug Panel Observability Rule(QA 디버그 패널 관측성 원칙): 로그를 찾아야만 판단 가능한 상태를 줄이고, non-secret 서버/클라이언트 timing은 가능하면 QA Panel에 먼저 표시한다. 민감정보는 계속 금지.
- Anonymous-first Guardrail(익명 사용자 우선 원칙 유지): 구현 과제가 아니라 계속 유지할 제품 원칙.
- 사용자 직접 display_name 편집 기능 도입 시 Kakao metadata overwrite 정책 재검토.
- Kakao display_name sync/fallback(카카오 이름 동기화 / fallback): 현재 범위 완료. 사용자 직접 이름 편집 도입 전까지 metadata 기반 동기화 유지.
- Email Recovery Fresh-link Recheck(이메일 복구 fresh link 재확인): Build 89 성공으로 current-account Email Recovery Connection P1 완료.
- Recovery Attempt Observability P1(복구 시도 관측성 1차): 구현/마이그레이션/smoke 완료.
- Email Recovery Deep Link / Redirect Strategy(이메일 복구 딥링크 / 리다이렉트 전략): current-account email connection P1까지 구현 완료. 기존 기록 복구 sign-in은 P1 코드 구현 후 standalone QA 대기.
- Compression / Upload Optimization(영상 압축 / 업로드 최적화): Build 91 기준 핵심 flow 통과. 추가 observability가 필요하면 후속으로 분리.
- Build 90 Compression Flow QA(빌드 90 압축 업로드 플로우 QA): 기술 flow 검증 완료.
- Upload Selection Size Validation Fix(업로드 선택 단계 용량 검증 순서 보정): 코드 반영 완료.
- Build 91 Upload/Compression Closeout QA(빌드 91 업로드/압축 마감 QA): 실기기 QA 통과.

작은 후속 / 낮은 우선순위:
- OAuth Step Reduction Store Check(외부 OAuth 진행 단계 Store 전 점검): 구현 후보가 아니라 설정/표시 점검 후보. 앱 내부 one-click은 완료되어 있음.
- Push Notification Icon Polish(푸시 알림 아이콘 정리): OS Push 알림에 보이는 아이콘/asset 확인 및 필요 시 polish. Push 전송 로직 변경이 아니라 앱/알림 시각 요소 정리로 분리.
- Email Custom SMTP(이메일 발송 설정): 운영 품질/브랜딩 성격. 급하지 않음.
- Kakao Biz App / Email Permission(카카오 비즈 앱 / 이메일 권한 정리): Kakao 운영 설정 정리. 급하지 않음.

옵션 / 장기:
- Upload Entry UX Bottom Sheet(업로드 진입 바텀시트): 현재 업로드 진입 흐름이 안정적이므로 필수 과제가 아니라 장기 UX 옵션으로 유지.
- Apple Login(애플 로그인)
- Google Login(구글 로그인)
- Phone/SMS Recovery(전화번호 / 문자 복구)
- Anonymous Cleanup(익명 계정 정리)
```

When discussing whether to build, frame the answer around validation stages:

- If simulator/local verification remains, say that first and avoid a build.
- If simulator/local verification is complete and only standalone-device
  behavior remains, say clearly: "코드 구현과 시뮬레이터에서 가능한 확인은 끝났고,
  이제 실제 standalone 빌드로 실기기 E2E를 검증할 차례입니다."
- Do not describe this as "not working" when the actual meaning is "not yet
  verifiable without a build."

Default work rhythm:

```text
설계 단계
→ 구현
→ 커밋/푸시 등 코드 반영
→ 필요할 때만 빌드
```

Avoid bouncing too frequently between the CTO session and development session.
Group related development actions together, but do not ask a development
session to run all the way through irreversible decisions, external console
settings, or builds without CTO/user alignment. Pause only at meaningful
decision points, risk points, or when the user explicitly asks.

If the Founder asks a question after the CTO session drafts or proposes a
development-session prompt, treat that as a handoff break. The prompt is not
considered handed off until the Founder explicitly says it was passed to the
development session. During the break, answer the Founder first and provide a
revised final prompt only when the Founder asks to continue or requests the
prompt again.

If the CTO session shows a copyable development-session prompt and the Founder
asks a follow-up question before saying it was delivered, assume the prompt has
not been sent. Revise the task direction based on the discussion instead of
treating the earlier prompt as active.

Keep meta-collaboration settings separate from development task context.
Preferences about answer format, session workflow, handoff rhythm, memory, and
remote-push discipline are operating rules for Codex/CTO sessions. Record them
in project/personal docs when durable, but do not overload ordinary
development-session prompts with these meta rules. Development prompts should
include only the product, technical, QA, safety, and workflow details needed to
execute that development task.

After a development session reports that a build is complete, do not immediately
send a new development-session prompt. First give the Founder only the QA steps
needed for that build and wait for the Founder’s QA result. After the Founder
reports the result, then decide whether to send a development-session follow-up.
When presenting build QA to the Founder after a development session reports a
completed build, reply only with the EAS build page URL and the QA items to
check. Do not include the install/artifact URL, build metadata, summaries, or a
development-session follow-up prompt unless the Founder explicitly asks for
them.

Session closeout rule:

The Founder may continue work from another device, so completed work must be
available remotely. At the end of a work session, ensure committed changes are
pushed to origin unless there is a deliberate reason not to push. Do not leave
completed documentation/code work only on the local machine. If something
cannot be pushed, clearly report the reason and the exact local state.

When the Founder says to wrap up, close out, pause, finish, or "정리하자",
treat it as a remote-backed closeout request. Update durable project docs and,
when the change is a general workflow preference, the personal context
repository too. Commit and push safe documentation changes before ending the
session, and leave the next starting point clear.

Session start/resume rule:

When the Founder says to start, resume, continue, or "작업을 재개하자", the CTO
session must first synchronize remote-backed context. Pull
`codex-personal-context` and the ASJ project repository, then check every known
relevant source that is available: personal context, project `AGENTS.md`,
`docs/PROJECT_MEMORY.md`, `docs/CURRENT_STAGE.md`, `docs/HANDOFF.md`, and
relevant TODO/tech-debt documents. Treat remote Git-backed information as the
source of truth because prior work may have happened from another device or
session. At closeout, push durable decisions and handoff state back to remote.

For terminal tasks, always provide a copyable shell block that starts by
changing into the project directory.

Example:

```bash
cd ~/Repository/action-sports-journal-app
open -a TextEdit .env.local
```

## Founder Technical Background

The Founder is a web frontend developer. They think well in product structure,
screen flow, and implementation relationships. Database, infrastructure,
mobile build, and Supabase operational tasks should be presented through a
clear execution interface because they are outside the Founder's most familiar
daily workflow.

When asking the Founder to perform DB, infra, environment, build, or dashboard
actions, assume the task needs precise location/context and copyable commands
instead of shorthand. Do not lower the technical level of the explanation.
Adapt the action format so it maps to familiar web frontend development habits
such as navigating to the project, opening files, and running explicit
commands.

Explain from structure -> flow -> implementation, and prefer action-first
instructions over background-heavy explanations.

## 2026-06-24 Build 74 Push QA / Auth Phase 2 Closeout

Build 74 resolved the remaining Auth Phase 2 Push observation. Build 73 had
missed Push because token registration was late: analysis completed before the
anonymous user's Expo token was registered, so Render loaded `tokenCount=0` and
skipped sending. Build 74 moved push registration earlier and confirmed the full
send path.

Confirmed in Build 74:

- Push notification was received after analysis completion.
- Render logs showed `tokenCount: 1`.
- Send start was logged.
- Expo ticket result showed `okCount: 1`, `errorCount: 0`.
- A ticket id was produced.

Current milestone status:

- Upload Part 1 is closed.
- Auth Phase 1 is closed.
- Auth Phase 2 is closed for the device-first anonymous identity baseline.

Next product direction:

Start Email Recovery / account linking next. Keep Supabase Anonymous Sign-in as
the device-first identity baseline. Do not turn the no-token internal default
user fallback into an external user mode.

Push Observability P2 follow-up:

Build 74 delivery remains accepted. The follow-up implementation adds
diagnostics only:

- `analysis_push_delivery_attempts` stores analysis completion Push attempt
  status, token counts, Expo ticket ids, token-row mapping, and receipt results.
- The send path now records missing tokens, disabled-only tokens, enabled token
  counts, ticket errors, and receipt errors.
- `DeviceNotRegistered` disables the matching `device_push_tokens` row.
- Receipt checking starts as a manual/internal endpoint
  `POST /api/push-receipts/check-pending`, not a scheduler.

Do not reinterpret this as a Push redesign. Push remains user notification;
Realtime and `/api/moments` remain the foreground sync path.

## 2026-06-24 Email Recovery / Account Linking Start

Email Recovery implementation has started from the device-first anonymous
identity baseline. This is intentionally not a login wall. The first user-facing
surface is a recovery/account-linking screen opened from the Home header menu.

Implemented first pass:

- `AccountRecoveryScreen` lets an authenticated anonymous user request a
  recovery email connection through Supabase Auth `updateUser({ email })`.
- The OTP entry / `verifyOtp({ type: "email_change" })` UI was removed after
  confirming the active Supabase Change Email template is magic-link based.
  After `updateUser({ email })` succeeds, the screen shows a pending state and
  asks the user to click the email link, return to the app, and refresh session
  state.
- `AuthSessionProvider` exposes narrowly scoped recovery-email request and OTP
  verification helpers while keeping the existing anonymous session lifecycle.
- `resolveRequestUser(request)` now syncs changed Supabase Auth email/display
  name values into the existing `public.users` row for the same
  `auth_user_id`.

Current Email Recovery result:

- `parksunl88@nate.com` confirmed `updateUser({ email })` success and email
  receipt.
- The Change Email template is magic-link based.
- Final linking did not complete because the clicked link redirected to
  `http://localhost:3000/#error=access_denied&error_code=otp_expired...`.
- Email Recovery is no longer blocked by hosted sender rate limit or the
  previous already-registered-email test case, but productization needs a
  redirect URL / deep-link strategy and a QA pass within the link validity
  window.
- Reinstall/new-device recovery sign-in is not implemented yet. This first pass
  only links an email to the current anonymous user.

Email Recovery deep-link / redirect decision:

- Email send path exists, but productized deep-link completion is not done.
- `updateUser({ email })` is current-account recovery-method connection.
- Reinstall/new-device recovery needs a separate email sign-in flow, likely
  `signInWithOtp({ shouldCreateUser: false, emailRedirectTo })`.
- Email must separate "connect recovery method" from "recover existing records",
  matching the Kakao product split.
- Current Email path lacks callback helper, initial URL handler, and runtime URL
  listener.
- `updateUser({ email })` has no explicit redirect target, so it relies on
  Supabase Site URL / Email Template settings.
- Candidate redirects: `actionsportsjournal://auth/email`,
  `actionsportsjournal://auth/email/change`,
  `actionsportsjournal://auth/email/recovery`.
- Candidate allowlist: `actionsportsjournal://**` or
  `actionsportsjournal://auth/email/**`.
- Before implementation, confirm Supabase Site URL, Redirect URLs, Change Email
  template, and Magic Link template read-only.

Long-term recovery strategy:

Email Recovery is the current baseline recovery path because it is the smallest
way to validate ownership continuity and account-linking structure on top of
device-first anonymous identity. However, before broader distribution, Kakao
Account Linking / Kakao Recovery should remain a strong product candidate.
ASJ's likely Korean mobile user base and Instagram-centered inflow may make
Kakao or SMS feel more natural than email. Email may still have less friction
than Apple ID for this phase, but it is not automatically the best final
recovery UX for Korean riders.

Kakao Account Linking has now been implemented and verified as the first
successful recovery path. Do not implement SMS, Apple, Google, or Kakao Login
walls yet. Keep Email Recovery as a baseline/fallback and revisit Phone/SMS
during distribution-readiness planning.

Kakao recovery/linking decision:

Kakao should be treated as the strongest pre-distribution recovery candidate for
ASJ's Korean mobile audience and Instagram-centered inflow. This does not change
the identity strategy: ASJ remains Anonymous-first and Recovery-later, not
Apple-first, Auth-first, or Login-first. Kakao must not become a pre-upload
login wall. The intended product shape is linking Kakao to the existing
anonymous Supabase Auth user so the rider can preserve and recover the same
account later.

Kakao implementation is now in place through `linkIdentity`, not
`signInWithOAuth`, and Build 75 verified standalone iOS OAuth return. Read-only
Auth/DB checks confirmed the Kakao identity is linked to existing Auth user
`499d7e71-623c-4b4e-8653-267d72ac3ca6`, mapped to `public.users.id`
`6b03b289-a6aa-4f26-aa66-6730e1cca2fe`, with push-token owner and Realtime
basis preserved. The QA account had no existing Moments, so rerun Moment
ownership continuity later with a pre-existing Moment sample.

Upload Entry UX history:

The upload page / bottom-sheet discussion should remain in memory even if the
current implementation keeps a stack-style upload screen. The original product
question considered video + title + description before upload, and Instagram
was the reference because ASJ's target riders are likely Instagram-inflow users
who understand fast media creation patterns. Current product thinking has moved
to media selection -> upload/analyze -> optional note later, so a bottom sheet
is not mandatory. Preserve the reason for the exploration: make upload feel
fast, familiar, media-native, and clear before the rider commits a real video.

Kakao Recovery Sign-in decision:

Kakao Linking and Kakao Recovery Sign-in are separate product flows.
`linkIdentity` remains the mechanism for connecting Kakao as a recovery method
to the currently signed-in anonymous/device-first account. It belongs only in
the "복구 수단 연결" surface. It must not become the reinstall/new-device
restore mechanism.

The reinstall/new-device restore flow is "기존 기록 복구하기 -> Kakao로 복구".
That flow should use `signInWithOAuth` to sign into the existing Kakao-linked
Supabase Auth user and replace the current fresh anonymous session with that
recovered session. After the session switch, normal bearer-token requests should
resolve to the existing `public.users` row; Home, Video, and Detail should
refresh from the remote source of truth; Push token registration should move to
the recovered owner; and Realtime should resubscribe to
`analysis-updates:auth:{authUserId}` for the recovered Auth user.

P1 implementation scope:

1. Add a Kakao recovery sign-in helper separate from the existing Kakao linking
   helper.
2. Add a "기존 기록 복구하기" section to `AccountRecoveryScreen`.
3. Keep the current account-linking CTA and recovery sign-in CTA visually and
   semantically separate.
4. On recovery success, refresh and replace the Supabase session/user.
5. If unsynced/uploading local work exists, block or clearly warn before
   recovery so local work is not silently lost.
6. QA cancel/failure behavior in the Simulator first. Create standalone builds
   only after Founder/CTO approval.

P1 implementation status, 2026-06-25:

Kakao Recovery Sign-in P1 is implemented and Build 81 real-device QA passed.
The implementation added the separate sign-in helper, `recoverWithKakao` in
`AuthSessionProvider`, a distinct "기존 기록 복구하기" section in
`AccountRecoveryScreen`, and a local-work guard for unsynced/uploading work.
Simulator/UI gate passed for the screen path, CTA separation, and cancellation /
failure readiness, and standalone iPhone QA confirmed the recovery sign-in
flow.

Build 81:

- Build number: `81`.
- Build ID: `24ca707e-f248-4533-9953-2cc7912af651`.
- Install/log URL:
  `https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/24ca707e-f248-4533-9953-2cc7912af651`.
- IPA URL:
  `https://expo.dev/artifacts/eas/DtB9KwaaG4uMnPVBhRP5N3npU_VFFd4nEV4dNnVJoXk.ipa`.
- Basis implementation commit: `d22b83b feat: add kakao recovery sign-in flow`.
- Build prep commit: `754d4a5 chore: prepare kakao recovery sign-in qa build`.
- QA status: passed. The Founder installed/launched Build 81, started from a
  fresh anonymous state, entered the account/recovery screen, ran "카카오로 기존
  기록 복구", completed Kakao login/consent, returned to ASJ, and confirmed the
  existing Kakao-linked account was recovered.

Build 81 QA verified:

1. Fresh anonymous session after reinstall/new device.
2. "카카오로 기존 기록 복구" opens the Kakao recovery sign-in flow.
3. OAuth success switches to the existing Kakao-linked Auth user.
4. ASJ app return after Kakao login/consent.
5. User-visible recovery of the existing Kakao-linked account.

Remaining follow-up checks:

1. Ownership continuity with an account that already has Moments.
2. Push token owner re-registration and Realtime recovered-auth-channel evidence
   if additional DB/log confirmation is needed.
3. OAuth cancel/failure state.
4. Unsynced/uploading local-work guard clarity.

Non-goals for P1:

- Do not replace `linkIdentity` with `signInWithOAuth`.
- Do not refactor the whole Auth/session structure.
- Do not change DB schema.
- Do not automatically merge the fresh anonymous user's `public.users` row into
  the recovered account.
- Do not productize Email Recovery in this pass.
- Do not add Apple/Google recovery providers.
- Do not redesign Push or Realtime. Only verify token re-registration and
  channel resubscription after the session switch.

## 2026-06-25 Daily Wrap-up

Kakao Recovery / Account Linking is verified on Build 75 and is currently the
strongest recovery path for ASJ's Korean user context. Email Recovery passed the
send/magic-link receipt stage with `parksunl88@nate.com`, but final linking is
not complete because the link opened a localhost redirect after expiry. Email
Recovery remains a baseline/fallback until redirect/deep-link strategy is
settled.

Immediate next work:

1. Kakao display_name sync decision is complete: current Auth metadata and
   `public.users.display_name` already use the Kakao-name family. No immediate
   code implementation is needed.
2. Keep Journal / Analysis / Media UX expansion behind the foundation-hardening
   queue.

## 2026-06-26 Foundation Safety Check

Foundation Safety Check ran after Kakao Recovery Sign-in P1 / Build 81 passed.
The check found no current BLOCKED foundation item and no need for a large
refactor. The only code fix was Upload File-size Validation: known >20MB picker
assets are now blocked locally before upload submit, matching the current
storage/provider limit.

Current foundation readout:

- PASS: Push remains notification-only with Push Observability P2 in place;
  private Realtime/foreground refresh remain the sync source of truth; Kakao
  Account Linking and Kakao Recovery Sign-in P1 remain separated and verified.
- WATCH: source/orphan cleanup caution, optional recovery-attempt
  observability, and Email Recovery redirect/deep-link productization.
- FIXED: local upload policy guard. Current Upload File Handling Policy P1 uses
  final upload file metadata, not original-file metadata. Backend policy is
  30MB / 15 seconds / supported video MIME type for the file that will actually
  be uploaded.
- BLOCKED: none.

Follow-up QA update: the Founder completed an existing-Moment recovery smoke.
Scenario: fresh install -> Kakao reconnect -> upload video -> restart app and
confirm video exists -> delete app -> reinstall -> anonymous state has no video
-> Kakao reconnect -> previous video list appears. This closes the user-facing
Kakao Recovery ownership smoke. DB read-only verification can still be used
later if a low-level ownership audit is needed.

Next foundation hardening should move to optional recovery-attempt
observability or Email Recovery deep-link strategy if CTO/user alignment wants
to continue foundation work.

## 2026-06-26 External No-Token Finalization

External No-Token Finalization is complete for the current server/app boundary.
Normal app/API paths now require a Supabase bearer token and do not silently use
the internal default user. The internal default-user fallback is explicit-only:
server `ALLOW_INTERNAL_DEFAULT_USER=true` plus `APP_ENV=development` or
`APP_ENV=test`, and app `EXPO_PUBLIC_ALLOW_INTERNAL_DEFAULT_USER=true`.

Closed paths:

- Moment list/create/delete/status.
- Upload target create/failure report.
- Source upload/finalize and stored-video analysis.
- Gemini analysis/evidence extraction, OpenAI benchmark, remote thumbnail
  fallback, and Push token registration.

Additional ownership hardening:

- MomentId-based legacy routes now verify ownership against the resolved request
  user before writing or queueing work.
- Invalid bearer tokens return 401 `auth_required`.

Validation:

- `npm run typecheck` passed.
- Local server smoke used `MOCK_AI_ANALYSIS=true`; no paid AI calls.
- Health showed `internalDefaultUserFallbackAllowed=false`.
- No-token Moment list/upload target/push token requests returned 401.
- Invalid bearer upload target request returned 401.

## 2026-06-26 Push Token Account-switch Policy

Push Token Account-switch Policy is complete for the current Push boundary.
Push remains notification-only and does not become the source of truth for
Moment sync.

Policy:

- A device/expo push token belongs to the currently authenticated app owner.
- If a session switches from anonymous owner to Kakao recovered owner, the app
  must register the push token again under the recovered bearer token.
- `device_push_tokens.expo_push_token` stays unique, so server upsert moves the
  row to the new `public.users.id` instead of creating duplicate rows.
- The previous owner should not remain an enabled send target for the same
  physical device.
- `DeviceNotRegistered` disabling remains unchanged.

Implementation:

- `HomeScreen` now ensures push registration when the authenticated owner is
  ready.
- `HomeScreen` retries push registration on foreground while authenticated.
- Existing upload-start registration remains.
- No DB migration was needed.

Validation:

- `npm run typecheck` passed.
- Local/server smoke used two temporary anonymous Auth users and one fake Expo
  token.
- Owner A registration created one token row for owner A.
- Owner B registration with the same token moved the same row id to owner B and
  kept it `enabled=true`.
- Temporary Auth users, `public.users` rows, and token row were cleaned up.
- No actual Push send, EAS build, paid AI call, DB migration, or external
  console change was performed.

## 2026-06-24 Auth Phase 1 Server Ownership Closeout

Auth Phase 1 is complete for the server/BFF ownership boundary. The main
ownership-sensitive server routes now use `resolveRequestUser(request)` so
bearer-token requests resolve to a Supabase Auth-backed app user and no-token
requests remain an internal QA fallback. The access token used for smoke
testing was intentionally not recorded.

```text
JWT sub: e156164b-e810-4ab8-a949-9e14452fdd73
JWT email: parksunl88@gmail.com
JWT exp: 2026-06-24T03:50:39.000Z
Authenticated app userId: 91ab8b25-1adb-4a94-ade2-b00c50e38d22
Internal default app userId: 737deccd-7da9-49c5-854b-839b62fa417b
```

Confirmed:

- Server log resolved the bearer-token request as `authMode=authenticated`.
- Authenticated app `userId` and no-token internal default app `userId` are
  separate.
- Authenticated `GET /api/moments` returned `0` moments.
- No-token `GET /api/moments` returned `30` moments with `hasMore: true`.
- Default Moments were not exposed in the authenticated response.
- `users.auth_user_id` mapping did not exist before the authenticated GET and
  one `users` row was created by `resolveRequestUser()`.
- Authenticated `POST /api/video-upload-targets` created an `upload_targets`
  row owned by the authenticated app user.
- Authenticated direct upload -> finalize kept ownership consistent through
  upload target, source/thumbnail Storage paths, Moment, AnalysisJob, and
  EvidenceResult.
- Authenticated DELETE removed the smoke Moment rows and Storage objects while
  staying inside the authenticated user's `users/{userId}/...` prefix.

Current Auth implication:

No-token internal default data must remain explicit dev/test opt-in only.
Future authenticated paths should continue using request-scoped ownership and
must not merge default-user Moments into authenticated user responses.

Auth Phase 2 starts from:

- Login UI and app-side session lifecycle.
- Private/user-scoped Realtime instead of the current public MVP Broadcast.
- External no-token policy is finalized as explicit dev/test opt-in only.
- Push token account-switch policy is finalized for the current Push boundary.

## 2026-06-24 Auth Phase 2 Identity Strategy / Anonymous Smoke

Decision:

Device-first identity should use Supabase Anonymous Sign-in. Email recovery is
the next account-linking layer. Kakao, Google, and Apple should be treated as
secondary recovery/social options, not the first identity requirement.

Why:

Action Sports Journal should let a rider reach the first upload experience
without a login wall, while still giving every external user a real Supabase
Auth identity, Bearer token, user-owned API boundary, push-token owner, and
user-scoped Realtime channel. This avoids extending the no-token internal
default user into an external product mode.

Anonymous Sign-in smoke result:

- `signInAnonymously()` succeeded.
- An anonymous access token was issued. The token itself was intentionally not
  recorded.
- JWT/user metadata confirmed `is_anonymous=true`.
- The BFF resolved the request as `authMode=authenticated`.
- `public.users` mapping was created for the anonymous Supabase Auth user.
- Authenticated `GET /api/moments` returned `0` moments.
- Default-user Moments remained separate.

Cleanup candidates from the smoke:

```text
auth.users anonymous user id: b37f7d2f-199d-44f4-9718-a96d665f497f
public.users id: ff32ae87-5d69-43d3-ba9d-68c3d9bd8638
```

Do not clean these rows up without explicit approval. They are recorded so a
future cleanup can be precise.

Next implementation direction:

Add device-first anonymous session creation in the app session lifecycle, then
keep Email Recovery as the first user-facing account-linking path. Kakao,
Google, and Apple come after the device-first + email recovery baseline is
stable.

## 2026-06-24 Auth Phase 2 Build 72 QA

Problem:

Moving from the no-token internal default user to device-first anonymous Auth
introduced real mobile lifecycle races. Build 70/71 showed that first install
could stall on Boot Loading while anonymous session creation and initial remote
sync raced. Build 71 also showed that an auth boundary reset could invalidate
the selected video while a picker result still returned later, opening
UploadScreen with no selected video.

Why this mattered:

Device-first identity is the foundation for external ownership. It cannot feel
less reliable than the earlier internal QA default-user flow. First launch,
first upload, relaunch, analysis completion, and Home/Video convergence are the
minimum trust path.

Decision:

Keep Supabase Anonymous Sign-in as the device-first identity path. Do not add
Login UI yet. Do not re-enable external no-token default-user behavior. Fix the
first-launch and first-upload lifecycle races directly.

Implementation:

- Auth initialization now keeps `authLoading` until the initial
  `getSession -> signInAnonymously` flow completes.
- Initial Boot Sync can retry if an in-flight attempt is cleaned up before
  reaching a terminal `completed`, `failed`, or `timeout` state.
- Upload picker/open flow now has a generation guard so stale picker results
  cannot open an empty UploadScreen after an auth boundary reset.

Build 72 QA result:

- Fresh install passed.
- Anonymous session was automatically created.
- Home entered successfully.
- Upload succeeded.
- App relaunch preserved/restored state.
- Analysis completed.
- Home and Video reflected the completed Moment.
- Upload race blocker was confirmed fixed.
- Push was not confirmed in this QA pass.

Current Auth Phase 2 status:

The device-first anonymous-session baseline is validated for first launch,
upload, relaunch, analysis completion, and Home/Video sync. Push confirmation is
the remaining observation before declaring Auth Phase 2 fully closed, unless it
is intentionally carried forward as non-blocking observability. The next
product implementation after closeout should be Email Recovery / account
linking.

## 2026-06-23 Build 65 Upload Recovery Checkpoint

Latest current build:

```text
buildNumber: 65
feature commit: 13e95ff fix: expire unrecoverable local upload sessions
build commit: 5ca179a chore: prepare local upload cleanup qa build
EAS Build: https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/315d66c2-a390-4f63-8790-151d890f677f
```

Problem:

Part 1 upload QA moved beyond simple success/failure. Direct upload can
successfully place bytes in Storage while finalize/Moment creation is delayed
or ambiguous, and a separate class of local-only failures can occur before any
server upload target exists.

Decision:

Treat uploaded-source recovery and local-only cleanup as separate product
states:

- Recoverable: local session has `uploadId` and `storagePath`; retry finalize
  through `/api/moments/from-uploaded-source` before giving up.
- Unrecoverable: local session has no `uploadId/storagePath`; do not keep it as
  processing after a short TTL.

Result:

Build 64 added orphan uploaded-source recovery. Build 65 added expiry for
unrecoverable local-only upload sessions. Durable thumbnails, Detail thumbnail
fallback, foreground Toast-only completion, signed upload timeout stability,
and duplicate-push guards are already included in the current baseline.

Current unresolved QA item:

In the latest A-processing/B-upload test, B appeared to fail immediately while
A completed normally. Server inspection found no separate B upload target,
source object, Moment, job, or evidence. The next task should focus on
pre-target/early-client upload failure observability and terminal local cleanup
before starting Auth / Ownership.

## 2026-06-23 Part 1 Final Wrap-Up / Build 55

Part 1 Upload Experience is now closed for single-user internal QA. The current
final build marker is Build 55. Build 55 is not a new feature validation build;
it preserves the Build 54 state-sync behavior and adds Direct Upload
finalize/fallback diagnostics so the next suspicious upload can be traced from
logs.

Case summary:

- Problem: DB state alone could show `upload_targets.status=finalized` while
  the final Moment appeared to use a multipart-style `moments/{momentId}`
  Storage path.
- Why it mattered: without app/server path logs, the team could only infer
  whether direct finalize succeeded, returned an unexpected shape, or fell back
  afterward.
- Decision: do not change logic at the end of Part 1; add observability only.
- Result: Build 55 includes server `uploaded_source_finalize_response_sent`
  and app `direct_finalize_success`, direct failure/skip, `fallback_started`,
  and `fallback_success` logs.

Next main work:

Auth / Ownership is the next workstream. After Auth, convert public MVP
Realtime Broadcast to private/user-scoped Realtime. Then prioritize Thumbnail
Persistence for cross-device/reinstall previews. AI Calibration and Compression
Measurement remain follow-up workstreams after ownership and storage boundaries
are clearer.

## 2026-06-23 State Sync / Polling Removal Decision

Problem:

After pagination and Video Archive Source separation, Home and Video no longer
share the same source ownership. Home is the global session cache. Video is the
server-backed archive source. Build 52 showed that upload success, Push,
Realtime, foreground refresh, and active tab state all had to be treated as one
state synchronization architecture, not as separate bug fixes.

Why it mattered:

Auth / Ownership and Part 2 should not start while upload success can leave
Home, Video, or tab selection in different states. The app must first guarantee
that one uploaded video converges into the same remote Moment across Home,
Video, and Detail without relying on polling as the primary mechanism.

Decision:

- Pagination / Infinite Scroll and Video Archive Source are accepted.
- Build 53 QA resolved the Auth/Part 2 blocker: upload success now triggers an
  explicit `/api/moments` first-page refresh, Home and Video converge, and tab
  active state stays synchronized.
- Build 54 QA confirmed the polling-free version: active app completion updated
  through Realtime/refetch without tapping the Push notification.
- `Video = Server Archive Source` remains the rule. Do not revert Video to the
  full global sessions cache.
- Main sync paths are upload-success invalidate/refetch, Realtime Broadcast,
  Push response, and foreground refresh.
- Active moment polling has been removed. Polling must not be treated as the
  product's main or fallback synchronization strategy for Part 1.

Implementation:

- `upload_success` refresh reason refetches `/api/moments` first page.
- The same first page merges into global sessions and replaces Video Archive
  first-page source.
- Tab navigation now uses a helper that updates both `activeTab` and
  `activeTabRef`, preventing stale indicator state.
- Refresh requests that arrive during an in-flight refresh are queued instead
  of dropped, with `upload_success` taking priority.
- Render now emits a best-effort `moment_updated` Broadcast for Moment
  creation/queued, processing, completed, and failed transitions.
- The app treats `moment_updated` as an invalidation trigger only and refetches
  `/api/moments`; event payloads are not merged directly.
- The remaining queued/processing interval polling was removed.
- Home = Global Session Cache, Video = Server Archive Source, Detail = Cache +
  Server context.

Next:

Before Auth, keep sync changes scoped. If more lifecycle transitions are added
later, they should reuse the same `moment_updated` invalidation pattern while
keeping `/api/moments` as the source of truth. After Auth, move the public MVP
Realtime channel to a private/user-scoped channel.

Finalize latency note:

The next upload-experience investigation is not AI latency. It is the short
post-upload wait after Direct Upload reaches 100%. The current finalize path
waits for Render to validate the Storage object, download the uploaded source
video, compare file size, create the Moment, create the AnalysisJob, and mark
the upload target finalized. The likely optimization is to avoid downloading
the full source video during finalize if reliable Storage metadata can verify
size/content type.

## Part 1 Upload Experience Closeout - 2026-06-22

Problem:

Action Sports Journal's near-term product goal was to make one real video
upload behave like a proper mobile app flow before doing AI Calibration. The
pipeline had become technically capable, but the product still needed clear
answers for upload durability, foreground/background lifecycle, result sync,
progress feedback, and active-state completion awareness.

Why it mattered:

Users will not trust AI analysis or coaching if the upload/result loop feels
unclear. The first product contract is:

```text
select video
-> upload durable input
-> server owns analysis
-> result restores
-> user notices completion
```

Decision:

Part 1 is complete for single-user internal QA only. The chosen architecture is
Direct Upload + multipart fallback, not Direct Upload alone. Local Draft Resume
has been removed because persisted `file://` URIs are not dependable across app
lifecycle boundaries. `/api/moments` remains the source of truth. Push is for
background notification. Realtime Broadcast is for active-screen refresh.
Foreground refresh remains fallback.

Implementation:

- UploadScreen / UploadContent replaced the old sheet-centered flow.
- Direct Upload uses upload target, signed URL, `FileSystem.uploadAsync`, and
  finalize.
- The upload phase shows real byte progress when the file transfer is active.
- Moment and AnalysisJob are created only after durable Storage input exists.
- Boot Loading and Empty State are separated.
- Push, Realtime Broadcast, passive foreground refresh, and an in-app
  completion banner complete the result-awareness loop.
- `upload_targets` records issue/upload/finalize/failure diagnostics.

Result:

Build 36 is the latest Part 1 closeout build:

```text
buildNumber: 36
feature commit: fb42fde feat: show in-app banner for realtime analysis completion
build commit: cf80100 chore: prepare realtime completion banner build
EAS Build: https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/cefad9fb-2a43-4cf9-bfee-dd092e18dcf3
```

Remaining risks:

- Auth/User Ownership is required before external/multi-user release.
- `upload_targets` status semantics must be clarified before orphan cleanup.
- Direct Upload should continue collecting real-device samples; fallback stays.
- Realtime public Broadcast is acceptable for MVP internal QA but should be
  scoped/private after Auth.

Next:

Part 2 TODOs are server Draft/upload session, upload target/orphan cleanup,
pre-upload video optimization, Push deep link, Auth/User Ownership, and then AI
Calibration.

Navigation / Instagram UX decision:

Part 1 also closes with a product skeleton decision: Action Sports Journal
should value Instagram inflow and sharing. After real-device pager prototype
QA, Home / Video / Growth horizontal swipe is adopted as the Part 1 navigation
skeleton. Bottom Tabs remain visible, but swipe is now part of the intended
main navigation feel.

The product reason is that Instagram-inflow users may experience swipe as a
learned "next screen" pattern rather than as a strict media-feed behavior.
ASJ's concept can remain original while the UX borrows proven user learning
models where they reduce friction.

Instagram-style media interaction should be explored first in bounded
surfaces: Video tab media viewer, previous/next Moment Detail swipe,
ShareResult / Growth Card preview carousel, and Instagram share outputs.
Route-backed Bottom Tabs plus Stack remains a later structural refactor for
Push deep links, tab state restore, future ShareResult screens, and separate
screen lifecycles.

Pager adoption decision record:

- Problem: a conventional tab-only structure may underserve Instagram-inflow
  users who expect adjacent app surfaces to be swipeable.
- Cause: ASJ is not Instagram, but its growth and sharing model borrows heavily
  from Instagram user learning.
- Options: Bottom Tabs only; top-level pager only; Bottom Tabs plus swipe.
- Decision: adopt Bottom Tabs plus Home / Video / Growth horizontal swipe after
  prototype QA. Keep haptic feedback because it made transitions feel
  intentional on device.
- Result: Pager/Haptic passed QA and are part of Build 43.
- TODO: route-backed Bottom Tabs plus Stack remains a future structural
  refactor, not a Part 1 blocker.

Build 40 upload failure QA note - 2026-06-22:

Build 40 initially looked like an upload regression after Pager/Haptic adoption,
but follow-up QA confirmed the real cause was the physical device being offline.
The observed flow was:

```text
network unavailable
-> upload
-> app shows upload retry/fallback messaging
-> final failure alert
-> network restored
-> same upload flow succeeds
-> analysis runs
-> push notification arrives
-> completed result restores
```

This should not be classified as a Build 40 upload bug or Pager/Haptic
regression. It is a useful real network-failure QA case. It confirmed that
Direct Upload failure handling, fallback attempt messaging, final failure alert,
and recovery after network restoration do not crash the app or corrupt Moment
state. A later DB read-only check also showed a successful Build 40 direct
upload target finalized and the related Moment completed with a Gemini evidence
result.

Part 2 P1 Pagination / Infinite Scroll design:

The long-term structure is still cursor pagination plus an archive-oriented
Video surface, but the first Video `FlatList` / infinite scroll UI attempt was
rolled back after launch crashes in Build 41 and Build 42. Build 43 is now the
stable baseline.

Decision:

- Use cursor pagination, not offset pagination.
- Cursor should be based on `occurred_at desc` plus `id desc` for stable order.
- Home should load or derive only the latest N Moments needed for dashboard
  sections.
- Keep the server cursor API and app list helper groundwork.
- Keep Video on stable `ScrollView + map()` until the virtualized-list scene
  issue is isolated.
- Detail can keep using list payload data for now, but the structure should
  allow a future single-Moment fetch for Push deep links, restore, and direct
  navigation.

Recommended implementation order:

1. Add cursor parameters and `nextCursor` / `hasMore` to `/api/moments`.
2. Extend the app list API to accept `{ limit, cursor }`.
3. Preserve Build 43 as the launch-safe Video UI baseline.
4. Re-attempt infinite scroll only through a dedicated prototype or safer route
   architecture.
5. Rework refresh policy so Boot/Foreground refresh the first page, Push can
   refresh or fetch the target Moment, and Realtime upserts or refreshes only
   the affected first-page state.

Risks:

- Realtime and Push currently rely on whole-list refresh semantics.
- Local/remote merge must keep completed Moment precedence while only part of
  the list is loaded.
- Future date and trick filters should be server-query filters, not client-side
  filtering over a full list.
- `FlatList` inside the current TabView/PagerView scene is the main suspected
  Build 41/42 launch-crash cause. Removing `removeClippedSubviews` was
  insufficient, so do not assume a single prop fix is enough.

Build 43 QA record:

- Build URL:
  `https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/80e56cb7-385e-47a7-ba57-2e0dd2613562`
- Commits:
  `2665062 fix: rollback video archive flatlist scene`
  and `2a8249b chore: prepare video archive launch hotfix build`.
- QA passed: launch crash resolved; Home, Video, Pager/Haptic, Upload,
  Push/Realtime, and deletion are normal.
- Classify Video infinite scroll UI as deferred, not shipped.

Build 48 pagination graduation record:

Build 48 is the current Pagination graduation candidate on
`prototype/video-infinite-scroll-safe`.

```text
feature commit: 6e0f761 feat: finalize video archive source and pagination ux
build commit: 8f38aa5 chore: prepare pagination graduation build
buildNumber: 48
EAS Build: https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/f4f6fde7-1d5f-490a-94bc-ac29e25b3c29
```

Architecture discovery:

- Previous assumption: Video could use the same global merged sessions list as
  Home.
- Problem: pagination was not visually obvious because local persisted sessions
  and remote paged data were mixed.
- Cause: local restore, upload optimistic state, remote refresh, Push, and
  Realtime all merge into global sessions.
- Options: create QA-only filtering, or treat Video Archive as a separate
  product source.
- Decision: Video Archive Source separation is a long-term structure, not just
  QA code.
- Resulting model:
  - Home = Global Session Cache.
  - Video = Server Archive Source.
  - Detail = Cache + Server.

Graduation criteria:

- Physical iPhone confirms `20 -> 40 -> 60` while scrolling.
- Duplicate IDs = 0.
- Missing IDs = 0.
- Sort remains stable by `occurred_at desc` plus `id desc`.
- Upload, Push, Realtime, Detail, and deletion remain normal.

QA seed status:

- runId `pg-grad-20260622-182901`.
- Cleanup was executed after Build 48 seed QA.
- Deleted rows: 99.
- Post-cleanup matched rows: 0.
- Child rows stayed 0 for `analysis_jobs`, `evidence_results`, and
  `upload_targets`.

Part 2 priority after pagination graduation:

1. Auth / Ownership.
2. Compression Measurement.
3. Unread Analysis Badge.
4. Push Deep Link.

Compression measurement / benchmark record:

- Problem: ASJ uploads original video bytes today. That is correct for quality,
  but it can become expensive and slow as users upload more action-sports
  footage.
- Cause: current Direct Upload uses local file validation plus
  `FileSystem.uploadAsync` to send the selected file unchanged. No encode,
  bitrate reduction, resolution downscale, or proxy generation exists.
- Options: keep original-only, client compression, server compression, or
  hybrid.
- Decision: Compression is needed as a product investigation, but it should not
  be applied before measurement and AI quality comparison.
- Result to collect first: file size, duration, upload time, finalize time, and
  original-vs-compressed AI result deltas.
- Compression guardrails:
  - keep small/short videos original when the savings are not worth quality
    risk;
  - try conservative compression only for larger videos;
  - avoid excessive frame-rate reduction;
  - use a 1080p-oriented optimization candidate before lower-quality presets.
- Compression / Upload Optimization now has a conservative production-flow first
  pass using `react-native-compressor`. Build 89 confirmed the POC on real
  iPhone, then the normal upload submit path was updated to prepare the final file
  before requesting an upload target. The first rule is: keep <=20MB clips
  original, optimize >20MB clips with mild manual settings (`maxSize` 1080,
  bitrate 8Mbps), and keep backend policy based only on final `fileSize`,
  `durationMs`, and `mimeType`. The QA metadata action remains preview/internal
  only for now.
- AI quality comparison must cover edge load, approach, board angle, rope
  tension, pop, rotation axis, landing, and trick identification.
- Priority implication: run Compression measurement/benchmark before Auth if
  it is only instrumentation and analysis; defer production Compression MVP
  until the quality tradeoff is known, likely around Auth / Ownership work.

Build 41/42 FlatList failure decision record:

- Problem: Build 41 and Build 42 crashed immediately on app launch.
- Cause: no native stack was captured, but the strongest suspect is the Video
  `FlatList` scene mounted inside TabView/PagerView. Removing
  `removeClippedSubviews` alone did not help.
- Options: revert all pagination, keep debugging on a crashing baseline, or
  rollback only the Video archive UI scene.
- Decision: rollback only the `FlatList` scene to `ScrollView + map()`, while
  preserving cursor API/helper and Boot first-page policy.
- Result: Build 43 passed launch and product-flow QA.
- TODO: retry infinite scroll in a separate prototype using lazy mount,
  route-backed tabs, FlashList, or another isolated structure.

Cursor Pagination decision record:

- Problem: the archive will eventually hold hundreds/thousands of sessions.
- Cause: date filters, trick filters, and growth history need stable,
  server-side ordered access.
- Options: full-list reads, offset pagination, cursor pagination, or hybrid
  caching.
- Decision: cursor pagination based on `occurred_at desc` plus `id desc`;
  offset is not the primary strategy because inserts/deletes can shift pages.
- Result: server/app cursor groundwork remains in Build 43.
- TODO: UI infinite scroll is deferred until the scene architecture is safe.

## Build 28 Save Point - 2026-06-21

Current QA build:

```text
buildNumber: 28
EAS Build: https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/0e95c278-e3d3-4c04-bebf-b16f163f0b9a
latest build commit: 773680c chore: prepare upload fallback qa build
```

The current goal remains Level 1 upload experience completion before AI
Calibration. Build 28 contains the upload route, local Draft Upload Flow,
direct-upload target/finalize path, upload target tracking, delete blocking
overlay, Detail header spacing fix, and edge-only Detail swipe tuning.

Important QA finding: direct upload is not yet the successful path. The latest
instrumented QA showed `upload_targets.status=failed` with
`reason=Uploaded source video size does not match the draft` at finalize. The
actual successful upload path remains Render multipart fallback, which stores
the source under `moments/{momentId}/source.mov`. This is acceptable as a
fallback, but direct upload should not be considered validated yet.

Current decision: keep fallback multipart reliable and user-facing while direct
upload is diagnosed. Direct upload failure must not become a user upload
failure. The app should record `upload_targets.failure_reason`, then attempt
fallback multipart. Build 28 restored fallback timeout to 30 seconds and made
the failure report non-blocking so fallback is not delayed by diagnostics.

Next starting point:

1. Install Build 28 on the iPhone.
2. Upload one real video without deleting DB rows.
3. Check whether the user sees success through fallback.
4. Inspect latest `upload_targets.failure_reason` and latest Moment storage
   path.
5. If direct upload still fails with size mismatch, investigate RN/Expo signed
   upload body handling before further UX work.

Do not clear QA data by default. DB count should be reported only unless the
user explicitly asks to reset data.

Confirmed deployment state:

- Standalone iPhone app works through EAS preview/internal distribution.
- App is not Expo Go, TestFlight, or App Store.
- Render backend works at `https://action-sports-journal-api.onrender.com`.
- Public HTTPS backend is used instead of the local Mac/LAN server.
- Supabase-backed Moment persistence and latest Evidence restore are now wired
  into the standalone app.
- Async Analysis MVP is validated for personal iPhone usage.
- No login, cloud video storage, external queue, push, CDN, TestFlight, or App
  Store path exists yet.
- As of 2026-06-20, the latest iPhone QA baseline is a clean empty-state build:
  Supabase test Moments were cleared, bundled seeded sessions were removed, and
  EAS preview build number `6` was created for fresh real-video testing.

Current AI product boundary:

- Normal upload uses one Gemini Pro call per Moment for Evidence Extraction.
- The app is currently in the Evidence Extraction + Rider-facing Analysis
  Summary stage.
- The real AI Coach experience is not implemented yet.
- Current work is focused on identifying what the video is, validating that
  evidence, and turning it into rider-readable analysis.
- A future AI Coach layer should be designed separately after the analysis
  layer is trustworthy enough.
- The current confidence wording avoids the stronger "확실" label and uses
  `근거 충분`, `가능성 있음`, and `확인 필요`.
- User-facing fallback copy no longer exposes internal storage names such as
  Supabase.
- Session sync responsibilities have been split into focused patch helpers and
  `useSyncRemoteMoments` so the Home screen is less responsible for remote
  restore mechanics.
- The next validation loop is real-video calibration using
  `docs/EVIDENCE_POSTPROCESSING_CALIBRATION_MATRIX.md`.
- Latest checkpoint for this boundary: `cc01177`.

Analysis Trust work currently includes:

- Evidence Extraction
- ObservedFacts
- Validators
- CandidateTrace
- KnowledgeRules
- Rider-facing Summary
- Calibration

All of these serve one product question:

```text
Can the user trust what the app says this video is?
```

Coaching is the next product layer. It should depend on previous session
comparison, rider history, progression, and priority selection. It is not part
of the current implementation stage.

Detailed status documents:

- `docs/CURRENT_STAGE.md`
- `docs/HANDOFF.md`
- `docs/CONTINUITY_CHECKPOINT.md`
- `docs/DEPLOYMENT_READINESS_ROADMAP.md`
- `docs/TECH_DEBT_AND_REFACTOR_TODO.md`

## Current Refactor and Technical Debt Backlog

Current product direction remains Analysis First. The active technical debt
backlog is now recorded in `docs/TECH_DEBT_AND_REFACTOR_TODO.md`.

The most important architectural decision is that a remote Moment should not be
treated as analysis-ready until the source video has reached durable temporary
Storage. Upload state and analysis state must remain separate:

```text
uploading / upload_failed
queued / processing / completed / failed
```

Immediate focus:

- keep `POST /api/moments/from-source-video` as the preferred source-video-first upload path
- ensure incomplete uploads do not leave analysis-looking remote Moments
- keep legacy/fallback endpoints only while the new path is validated

2026-06-21 validation update:

- Upload screen remains open until source video upload completes.
- The app now warns users not to close the app during the upload phase.
- The upload screen closes only after upload succeeds and server-side analysis is accepted.
- Upload UI has been split into reusable `UploadContent` and a route-backed
  `UploadScreen`. The current route shape is `Home -> Upload -> MomentDetail`.
  This is the first structural step toward Draft Upload Flow, while preserving
  the existing upload-first behavior.
- Render + Supabase validation confirmed that fileless requests return 400 without creating rows.
- Normal upload validation confirmed `source_video_storage_uploaded_at -> moment.created_at -> analysis_jobs.queued_at` ordering.
- QA policy remains: do not auto-reset DB after builds; report counts only unless the Founder explicitly requests deletion.
- Simulator upload remains disallowed by default; real upload QA belongs on the physical iPhone.
- If the user force-closes the app immediately after tapping upload and analysis still succeeds, do not assume a bug. The file may have already reached the server, or iOS may have briefly allowed the network request to finish. The product rule is: closing before upload completion can fail; closing after upload completion should allow server-side analysis to continue.
- Upload-state copy should later move from an absolute warning toward risk-aware wording: "업로드가 끝날 때까지 앱을 닫지 않는 것이 안전합니다." and "업로드가 완료되면 분석은 서버에서 계속됩니다."
- Follow-up TODOs: deliberately test app termination before/after upload completion, refine upload-state copy, collect analysis timing data, continue sample-based AI Calibration, revisit Detail structure, add Push deep link later, and consider OS-level background upload as a long-term stability option.

Later work is grouped by stage:

- Upload structure and UX: upload-first path, signed/direct upload evaluation,
  Draft Upload Flow, upload progress feasibility, blocking overlay, and timing
  logs
- Mobile app screen structure: reduce Home-owned modal/conditional rendering,
  evaluate UploadScreen and MomentDetailScreen, and decide whether React
  Navigation or Expo Router is the right route layer
- App-native return/gesture behavior: native stack swipe back, Push tap to the
  relevant Moment Detail, and foreground/background restore polish
- UX stabilization: Boot Loading, Upload, Delete, Empty/Error states, and
  cross-device thumbnail fallback
- Calibration: timing/quality observation data and sample-based AI calibration
- Stabilization: legacy endpoint cleanup and thumbnail storage policy
- Product scale: auth/user ownership and background upload

Current product priority clarification:

The near-term goal is not to improve AI result accuracy first. The goal is that
even one uploaded video behaves like a proper mobile app experience:

```text
select video
-> upload clearly
-> secure durable input
-> transition into server-owned analysis
-> restore result
-> notify user
-> show understandable output
```

AI Calibration for toeside/heelside, Back Roll, and other trick-name accuracy
comes after Upload structure, mobile screen structure, app-native gestures /
return flows, and core UX states are stable. Do not tune prompts or validators
just because one QA sample feels surprising while the upload/detail/navigation
experience is still being settled.

## Mobile-First UX Development Principle

The Founder may describe product behavior with web-development analogies, but
Action Sports Journal is an iOS-first mobile app. Future implementation should
evaluate mobile app patterns before falling back to web-style conditional
rendering.

Principles:

- Do not default to web-style screen swaps or conditional rendering when a
  mobile navigation, lifecycle, or gesture pattern would be more natural.
- Consider common mobile app structure first for Upload, Detail, Push,
  foreground/background refresh, app lifecycle, and long-running upload flows.
- If the user describes a web-like approach but there is a more appropriate
  mobile app structure, propose the mobile-native option first.
- Treat "it works" as insufficient when the interaction does not feel natural
  in a real app.
- Prioritize whether the user perceives the flow as app-like, stable, and
  trustworthy.

## Roles

Founder / Product Owner / Domain Expert:

- Owns product direction.
- Owns wakeboard/action-sports domain judgment.
- Owns QA feedback from real iPhone usage.
- Decides priorities and what matters for the product.

GPT:

```text
CTO + Project Secretary + Project Historian
```

GPT helps with:

- Product and technical strategy.
- Architecture thinking.
- Decision records.
- Session summaries and continuity.
- Clear separation between known facts, hypotheses, recommendations, and
  unknowns.

Codex:

```text
Implementation Engineer
```

Codex helps with:

- Reading and modifying the codebase.
- Running tests and local verification.
- Creating and updating project documents.
- Committing and pushing checkpoints when requested.
- Preserving continuity in git-backed docs.

## Collaboration Rules

Truth over confidence.

When evidence is missing, say so. Do not sound certain just to be useful.

Use these labels when diagnosing or reporting:

- Confirmed Fact
- Observation
- Hypothesis
- Recommendation
- Unknown

Rules:

- Do not claim work is completed unless it was actually completed and verified.
- Do not imply implementation exists if it is only a design or document.
- Separate raw AI evidence from interpretation.
- Separate implementation from validation.
- Prefer "unknown yet" over premature conclusions.
- Diagnose with evidence before changing prompts or logic.
- Keep settings, memory, and important state remote-first whenever possible.

Save Point workflow:

1. Update continuity documents when a meaningful milestone is reached.
2. Record decisions, findings, open questions, and next starting point.
3. Run relevant verification such as `npm run typecheck`.
4. Confirm git status.
5. Verify no secrets are committed.
6. Commit and push one clean checkpoint.

## Product Philosophy

Moment First.

The product should feel like revisiting real riding moments, not managing a
database.

Core principles:

- Content > Data
- Feed > Dashboard
- Moment review > Report reading
- AI Coach as supporting layer
- Local-first is acceptable for early personal usage
- Korean mobile product polish is preferred over a pure US extreme-sports
  aesthetic

Current product priority:

```text
1. AI Analysis UX Completion
2. Analysis Trust
3. Coaching
```

Action Sports Journal is not being built as an AI Coach app first. It is an
AI-based Action Sports Analysis platform. Before coaching can matter, the rider
must trust the full analysis product loop:

```text
upload
-> async processing
-> analysis completed
-> result restored
-> result understood
```

The current stage is therefore AI Analysis Product Completion:

```text
video upload
-> async analysis
-> completed result
-> restored result
-> Rider-facing Summary
-> user-understandable analysis
```

Coaching comes after the rider can trust what the system says happened in the
video.

Analysis UX principle:

AI analysis takes time. The product does not need to pretend it is instant.
During analysis, the more important goal is that the user does not feel the app
has stopped, failed, or hit a bug.

Known Analysis Product UX observations:

1. Analysis Progress UX
2. Cold Start Loading UX
3. Push Notification
4. Durable Analysis Pipeline / video storage

Cold Start Loading UX:

The previous app startup could follow this path:

```text
app starts
-> no local restored state yet
-> Empty State appears
-> Supabase query finishes
-> real data appears
```

This was technically functioning, but the user could perceive it as a bug
because the app first said "there is no data" and then data appeared a moment
later.

The principle is:

```text
Loading State and Empty State must be separate.
```

Implemented direction:

```text
app starts
-> Loading State
-> Supabase query
-> if data exists: show real data
-> if no data exists: show Empty State
```

`a8caf86 feat: add analysis completion notifications and cold start loading`
implements this separation. Startup now shows "기록을 불러오는 중입니다" while
remote Moments are loading, and only shows the Empty State after the first
remote query completes with no data.

Durable Analysis Pipeline observation:

Build 8 confirmed that Gemini Pro analysis works, but it also exposed the
current async limitation. The app can create a durable Moment and queued
AnalysisJob before the backend has a durable copy of the video. If the app is
closed, the network fails, or the multipart evidence request does not complete,
the job can remain queued even though the backend has no video payload to
process later.

Current conclusion:

```text
Durable job record without durable video input is not true durable async.
```

The Phase 8 MVP path now uses Supabase Storage because the project already
uses Supabase for Moment, AnalysisJob, and EvidenceResult state. See
`docs/DURABLE_ANALYSIS_PIPELINE_PLAN.md` and
`docs/SUPABASE_STORAGE_ANALYSIS_PIPELINE_PLAN.md`.

Storage policy decision:

Supabase Storage is temporary durable analysis-input storage, not permanent
video archive storage. Original videos remain local-first. If the local video
URI is still available, the app should use it for playback. If the local video
URI is missing, the app should not treat that as a broken Moment; it should show
the thumbnail, EvidenceResult, and Rider-facing Summary. After analysis
completes, the Storage source object should be eligible for deletion
immediately or after a short QA/retry retention window. Reanalysis after source
deletion may require the rider to reupload the original video.

Implementation status:

Storage-backed evidence analysis path is implemented and pushed in
`306b3ca feat: add storage-backed evidence analysis path`. Local E2E verified:
source video upload to `moment-videos`, `moments.source_video_storage_*`
update, `analysis_jobs.input_video_storage_*` update, Storage download by
Render, Gemini Evidence Extraction, `evidence_results` persistence, and
completed Moment restore. Build 14 QA exposed that the first storage-backed
implementation still depended on the app making a second
`/analyze-stored-video` request after source upload. That was not durable
enough: the source object could be uploaded while the job stayed queued if the
second request failed. `cf71b58 feat: start analysis automatically after
storage upload` fixed this by making successful `/source-video` upload start
the queued job server-side. `/analyze-stored-video` remains only as
legacy/fallback. Real Render + Gemini Pro E2E verified `queued -> processing ->
completed`, `evidence_results` creation, and
`source_video_storage_status=deleted`. The direct multipart upload path remains
as fallback.

Durable Analysis / Analysis Progress completion:

- `a397584 feat: clean up analyzed source videos` deletes analyzed source
  videos on a best-effort basis after successful stored-video analysis.
- `source_video_storage_status` becomes `deleted` on cleanup success and
  `delete_failed` on cleanup failure.
- Cleanup failure is warning-only and does not turn completed analysis into
  failed analysis.
- `9bad25f fix: handle stale analysis jobs` marks old queued/processing jobs
  failed when they cannot reasonably complete.
- `f7488a8 refine: improve analysis progress messaging` improves app-facing
  status language: 대기, 분석중, 완료, 실패.

The current product objective is stable completion for one real uploaded video:
upload -> temporary durable input -> stored analysis -> completed restore.

Push Notification MVP:

Push Notification is now implemented as a first MVP capability for the async
analysis product:

```text
upload
-> close app
-> analysis completes
-> push notification
-> open result
```

`a8caf86 feat: add analysis completion notifications and cold start loading`
adds Expo notification registration in the app, `/api/push-tokens` on the
Render backend, and best-effort Expo Push API delivery after successful
EvidenceResult persistence. The notification text is:

```text
분석이 완료되었습니다
결과를 확인해보세요
```

`supabase/phase9_device_push_tokens.sql` defines `device_push_tokens`. The
phase9 migration is assumed applied on the remote Supabase project for this
checkpoint. Notification tapping opens the app; Detail deep link navigation is
not implemented yet. Because `expo-notifications` adds a native plugin, a new
EAS iOS preview/internal build is required before device QA.

Build 22 closeout:

Build 22 is the current preview/internal handoff build for the next QA session.
It includes the upload-first Moment creation refactor and the upload progress
UX needed to make the durable analysis flow understandable:

- The default upload path is `POST /api/moments/from-source-video`.
- The source video must reach temporary durable Storage before the server
  creates a Moment and AnalysisJob.
- The Upload screen stays open during source upload and warns the rider not to
  close the app before upload completion.
- After upload completion, server-side analysis owns the job and the app can be
  closed while analysis continues.
- Fileless upload-first requests return 400 and do not create DB rows.
- The force-close-after-upload case is interpreted carefully: success can mean
  upload already completed or iOS briefly finished the request.

The next session should start by installing Build 22 and verifying:

1. Upload screen remains visible while source video upload is in progress.
2. No incomplete remote Moment appears if upload is interrupted before the
   source video reaches Storage.
3. Normal upload creates Storage input first, then Moment, then AnalysisJob.
4. Completed analysis restores after app relaunch.
5. Push delivery still works after completed analysis.
6. Existing thumbnail fallback, delete feedback, and long-analysis waiting copy
   remain acceptable.

Performance timing and bottleneck analysis should wait until real QA data is
allowed to accumulate. Do not auto-clear QA data after builds. By default keep
`moments`, `analysis_jobs`, `evidence_results`, and `device_push_tokens` for
analysis-time measurement, calibration, and real usage pattern review. Only
delete QA data when the Founder explicitly requests "초기화" or "DB 비우기".

Build 23 real-device UX QA:

Build 23 passed the first real-device UX check. Boot Loading felt natural and is
confirmed to be data-readiness based, not a fixed decorative delay: Home waits
for local restore plus `/api/moments` remote sync, with an 8 second fail-open
timeout. The Upload Overlay also felt natural; the full-screen blocking state
made it clear that upload is separate from server-owned analysis.

The latest QA sample was about 18.25 MB and about 9 seconds long. Directional
timing from the DB and user observation:

- Upload start estimate to server file/storage flow entry: about 5.2 seconds.
- Server Storage/Moment creation side: about 3.9 seconds.
- Job queue/start: within roughly 1 second.
- Gemini `started_at -> completed_at`: about 50.7 seconds.
- Push was received; the perceived arrival was more than 1 minute and less than
  3 minutes.
- Result restore worked.
- Delete was intentionally not tested in this QA pass.

These numbers are not yet enough to justify upload architecture changes or a
progress bar. For exact bottleneck analysis, capture paired iPhone
`[upload_timing]` logs and Render Dashboard `[source_video_timing]` logs. Keep
Build 23 QA running and keep code changes paused until more samples accumulate.

Signed/direct upload architecture decision:

Signed/direct upload is implemented in code as the default app upload path,
with Render multipart relay retained as fallback:

```text
app
-> POST /api/video-upload-targets
-> Supabase signed direct upload
-> POST /api/moments/from-uploaded-source
-> Render verifies Storage object
-> Moment/AnalysisJob created
-> Gemini analysis starts
```

The legacy `POST /api/moments/from-source-video` multipart path remains in
place as fallback. If direct upload or finalize fails, the app falls back to
the existing multipart upload-first path.

Upload target tracking is prepared through `supabase/phase10_upload_targets.sql`.
The table tracks `issued -> uploaded -> finalized` and `failed` states. Orphan
candidates are old rows in `issued`, `uploaded`, or `failed`. Automatic cleanup
is not implemented yet. The phase10 migration has been applied remotely and
verified with `upload_targets` count at 0 before the next build. Server
tracking remains best-effort so upload should not fail solely because tracking
has an issue.

Draft Upload Flow architecture decision:

Local Draft Upload Flow is now implemented as the first Level 1 upload-work
layer:

```text
select video
-> local draft
-> app can close
-> continue previous draft / start new
-> signed/direct upload
-> finalize
-> Moment and AnalysisJob
```

Implementation status:

- `UploadDraft` is a local model with a UUID `draftId`, local video metadata,
  local thumbnail URI, timestamps, and `selected / ready_to_upload / uploading /
  upload_failed` status.
- Drafts are persisted through AsyncStorage and restored on app re-entry.
- Selecting a video creates a local draft and does not create a remote Moment.
- If a stored draft exists at app start, the app asks whether to continue the
  previous upload or start a new one.
- `UploadScreen` can render from the draft, not only transient runtime state.
- Successful upload clears the draft.
- Failed upload stores `upload_failed` and keeps the draft retryable.

Draft is still not a remote Moment. A Moment is created only after the source
video reaches durable Storage and finalize succeeds. Orphan cleanup remains
unimplemented. Future design should strengthen `uploadId`, future `userId`,
Storage path ownership, and cleanup, with a path shape like
`users/{userId}/uploads/{uploadId}/source.mov`.

Validated product decisions:

- Large real thumbnails improve perceived product quality.
- Edge-to-edge content is more immersive than floating cards.
- Story-style recent moments are useful.
- Top dashboard/stat blocks reduce immersion.
- Feed should remain mostly frozen unless iPhone QA reveals a specific issue.
- Current major UX risk remains the Detail Screen.

## AI Architecture

Current implemented reality:

```text
Video
↓
Gemini evidence extraction
↓
Wakeboard taxonomy / validation gates
↓
User confirmation where needed
↓
Gemini coaching path and OpenAI benchmark path
```

Current direction:

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

Why this direction exists:

- Single-pass video classification caused hallucinations.
- The model jumped from basic wake jumps into advanced invert tricks.
- Trick identity must be built from observable facts, not direct confident
  naming.
- Parent-family gates must pass before specific trick naming.

Implemented AI safeguards:

- Gemini evidence extraction endpoint: `/api/extract-session-evidence`.
- Wakeboard Trick Taxonomy Gate.
- Wakeboard Validation Matrix.
- `ApproachObservedFacts`.
- `FinalApproachWindow`.
- `InversionObservedFacts` v1.
- Debug capture for evidence analysis.
- Degraded mode handling for fallback model results.

Reference documents:

- `docs/AI_ANALYSIS_PIPELINE_DESIGN.md`
- `docs/AI_COACHING_PRINCIPLES.md`
- `docs/WAKEBOARD_TRICK_TAXONOMY_REFERENCE.md`
- `docs/WAKEBOARD_VALIDATION_MATRIX.md`
- `docs/OPENAI_BENCHMARK_REPORT.md`

## 2026-06-15 Infrastructure Checkpoint

Today's architecture direction shifted from synchronous evidence extraction
toward durable asynchronous analysis.

Completed planning and scaffolding:

- Supabase was selected as the Phase 1 infrastructure direction.
- Supabase SDK and React Native URL polyfill were added.
- `.env.example` now includes Supabase Phase 1 environment placeholders.
- `src/services/supabase/client.ts` exists as a guarded mobile client scaffold.
- Supabase env values are present locally.
- `scripts/smoke-test-supabase.mjs` confirms Supabase connectivity with the
  service role key and reports Phase 1 schema readiness separately.
- `supabase/phase1_schema.sql` drafts `users`, `moments`, `analysis_jobs`, and
  `evidence_results`.
- Current Supabase status: connection passes, Phase 1 tables exist, and
  service-role table grants are applied.
- `supabase/phase1_service_role_grants.sql` repairs existing projects where the
  tables were created before service-role grants were added.
- `npm run supabase:write-smoke` confirms server-side insert/update/delete
  across `users`, `moments`, `analysis_jobs`, and `evidence_results`.
- Gemini Evidence Extraction now attempts to persist an `evidence_results` row
  when an existing Moment is linked by `momentId` or UUID `sessionId`.
- Node standard was raised to Node 22 LTS through `.nvmrc`, `package.json`
  engines, and setup docs.
- Async analysis transition planning was documented in
  `docs/ASYNC_ANALYSIS_PLAN.md`.

Important current boundary:

- Supabase is prepared, not product-wired.
- Auth UI is not implemented.
- Storage is not connected.
- Job Queue is not implemented.
- The app still uses the current local/Render evidence extraction path.

Current next architecture target:

```text
Moment created
-> screen returns immediately
-> AnalysisJob runs in background
-> EvidenceResult is persisted
-> Moment becomes completed or failed
```

Recommended next starting point:

1. Correct the local Gemini API key before real linked Evidence Extraction
   verification.
2. Run a real Evidence Extraction request with a linked `momentId`.
3. Confirm the created `evidence_results` row and linked Moment latest IDs.

## 2026-06-16 Async Analysis MVP Checkpoint

Confirmed facts:

- Async Analysis MVP was implemented and pushed:

```text
0e9594e Implement async evidence analysis MVP
```

- Rate-limit and queued-state mismatch was fixed and pushed:

```text
7d83e7e Keep async evidence jobs queued on enqueue delay
```

- Render is deployed with the latest rate-limit behavior.
- `/health` returns `ok: true`, `geminiConfigured: true`, and
  `geminiEvidence.configured: true`.
- Route-scoped rate limiting is active. Health, Moment reads, and polling are
  not counted.
- Standalone iOS internal build `1.0.0 (5)` was created:

```text
https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/66b48f3c-5564-4ddd-aa20-698f201e6204
```

- Founder validated this standalone app flow:

```text
video selected
-> queued
-> app immediately closed
-> wait 2-3 minutes
-> app relaunched
-> completed restored
```

Implementation status:

- `POST /api/moments` creates a Moment and queued AnalysisJob, then returns
  quickly.
- `/api/extract-session-evidence` starts background evidence extraction for the
  queued job.
- Supabase stores `moments`, `analysis_jobs`, and `evidence_results`.
- Home restores Supabase Moments and latest Evidence after app relaunch.
- UI shows `queued`, `processing`, `completed`, and `failed`.
- A `429` or network-like enqueue failure does not falsely mark the Moment
  `failed`; the app keeps it `queued` unless the backend records a real job
  failure.

Important boundary:

- This is the short-path Async MVP, not a fully durable job system.
- The current worker still relies on the Render process retaining the uploaded
  video buffer after enqueue.
- If Render restarts during analysis, the current design may still lose the
  in-process work.
- Supabase Storage or another durable video store is not implemented yet.

## Wakeboard Domain Knowledge

Heelside and Toeside are approach / edge directions, not trick families.

Top-level trick families:

- Basic Air / Straight Air
- Surface Tricks
- Grabs
- Spins
- Inverts
- Raley-based tricks

Core taxonomy rules:

- Basic Air / Straight Air is separate from Inverts.
- A trick cannot enter Inverts unless visible inversion evidence exists.
- Inversion gate v1 allows Inverts only when `boardAboveHead`, `bodyInverted`,
  or `rollAxisObserved` is true.
- `boardAboveHead` is the primary inversion evidence. Do not define inversion
  only as head-below-hips.
- Back Roll belongs to invert / roll-axis family.
- Tantrum belongs to heel-side backflip / invert family.
- Tantrum cannot be high confidence from a toeside approach.
- Back Roll high requires heelside setup and roll-axis evidence.
- Toeside Basic Jump must not become Tantrum or Back Roll unless visible
  invert / roll-axis evidence exists.
- Do not infer advanced invert tricks from airtime alone.
- Parent-family gate must pass before specific trick naming.

Approach detection rules:

- Approach should not be directly labeled first.
- Extract observed facts first: stance, lead foot, board direction,
  wake-crossing path, edge direction evidence, handle position, body
  orientation.
- Chest/back visibility alone is not sufficient evidence for heelside/toeside.
- Approach must be anchored near wake crossing and takeoff through
  `FinalApproachWindow`.
- Earlier slalom/setup is context only unless explicitly inside the final
  approach window.

Known current classification state:

- Toeside Basic Jump was initially misclassified as Back Roll / Tantrum /
  Invert.
- Parsing and post-processing did not create the original false positive.
- Raw model evidence plus missing taxonomy structure caused the major error.
- Taxonomy Gate and approach-window safeguards improved the result.
- `InversionObservedFacts` v1 now records observed inversion evidence before
  family classification, including `bodyInverted`, `boardAboveHead`,
  `rollAxisObserved`, `flipAxisObserved`, `inversionDuration`,
  `inversionEvidenceCount`, and `antiInversionEvidence`.
- Invert Family is blocked unless `boardAboveHead`, `bodyInverted`, or
  `rollAxisObserved` is true.
- Invalid Tantrum classifications are now downgraded instead of confidently
  returned.

## Major Historical Decisions

Timeline:

- 2026-06-12: Priority shifted from Expo Go validation to standalone iPhone app
  installation through EAS preview/internal distribution.
- 2026-06-13: Real wakeboard-video AI architecture was validated with Gemini
  and OpenAI benchmark paths.
- 2026-06-14: Render backend was deployed and the standalone iPhone app was
  installed with the public HTTPS backend.
- 2026-06-14: Product direction shifted from Session First to Moment First.
- 2026-06-14: Gemini API key rotation was completed in Render and local env
  without exposing secrets.
- 2026-06-14 / 2026-06-15: Toeside Basic Jump false positive investigation
  showed raw model hallucination and missing taxonomy structure.
- 2026-06-15: Wakeboard taxonomy, validation matrix, Taxonomy Gate,
  `ApproachObservedFacts`, `FinalApproachWindow`, and `InversionObservedFacts`
  became the active AI quality direction.

Why key decisions were made:

- Standalone iPhone app was required because the product must work away from
  the local Mac/LAN server.
- Render was chosen as the simplest backend path for a single developer,
  early-stage product, low traffic, and personal usage first.
- Database and cloud video storage were intentionally deferred.
- Moment First was chosen because iPhone QA showed users respond to real riding
  content more than session records or dashboards.
- Taxonomy and observed-facts layers were introduced because prompt-only tuning
  could not reliably prevent family-jumping hallucinations.

## Current Priorities

Current active problem:

```text
Preview build and device QA for notification-enabled analysis UX
```

Next starting point:

- Install the new iOS preview/internal build that includes
  `expo-notifications`.
- Confirm notification permission, Expo push token registration, and completion
  push delivery after a real analysis.
- Confirm Cold Start Loading no longer flashes Empty State before remote restore.
- Detail deep link from notification remains a later enhancement.

Goal:

- Preserve the durable standalone iPhone analysis flow while making async
  waiting feel intentional rather than broken.

Secondary priorities:

- If AI work resumes, validate `InversionObservedFacts` v1 on the real test
  clip before modifying trick classification again.
- Continue Detail Screen QA.
- Review Progression UX.
- Keep Feed mostly frozen for now.
- Investigate coaching structured parsing failure after evidence truthfulness
  work.

## Open Problems

AI:

- Unknown: why Gemini still believes inversion exists in the Toeside Basic Jump
  test clip.
- Unknown: whether inversion detection is using incorrect visual cues.
- Unknown: whether inversion evidence is inferred from airtime/body position
  rather than true inversion mechanics.
- Coaching response flow has a structured parsing issue.
- Long-term Gemini availability / degraded mode strategy still needs work.

Product:

- Detail Screen still needs iPhone QA.
- Progression UX is not settled.
- Feed should remain mostly frozen unless QA finds a specific problem.

Architecture:

- Supabase Moment persistence and latest Evidence restore are wired for the
  Async MVP.
- No login yet.
- Supabase Storage is used as temporary durable analysis input, not a permanent
  video archive.
- Source-video cleanup is best-effort after successful stored-video analysis.
- Stale queued/processing cleanup is implemented during remote restore.
- No CDN yet.
- No production App Store/TestFlight path yet.
- Detail deep link for push notifications is not implemented yet.
- AI keys must remain only in Render environment variables and local ignored env
  files.

## Session Recovery Instructions

For a new GPT session:

1. Read the repository `README.md` first.
2. Follow the exact read order defined there.
3. If working on wakeboard AI, additionally read:
   - `docs/WAKEBOARD_TRICK_TAXONOMY_REFERENCE.md`
   - `docs/WAKEBOARD_VALIDATION_MATRIX.md`
   - `docs/AI_ANALYSIS_PIPELINE_DESIGN.md`
4. Use explicit uncertainty labels.
5. Do not propose implementation as completed work.

Recommended opening prompt for a new GPT session:

```text
Read README.md first and follow the exact ASJ read order defined there. Continue
from the current resume point. Use Confirmed Fact / Observation / Hypothesis /
Recommendation / Unknown labels when diagnosing. Do not imply anything is
implemented unless the docs or code confirm it.
```

For a new Codex session:

1. Pull `codex-personal-context`.
2. Pull the ASJ project repository.
3. Read `README.md` and follow the exact read order defined there.
4. Check git status before editing.
5. Do not print secrets.
6. Do not commit `.env.local` or any local secret file.
7. Prefer small focused commits and push important checkpoints to
   `origin/master`.

Recommended opening prompt for a new Codex session:

```text
Pull codex-personal-context and the ASJ project repository. Then open
~/Repository/action-sports-journal-app, read README.md, and follow the exact
read order defined there. Check git status before edits. Do not print secrets.
Continue from the current resume point and keep changes scoped.
```

Current resume instruction:

```text
Start from the validated Gemini one-call Evidence Extraction + Rider-facing
Analysis Summary stage. Do not implement AI Coach or add a second API call yet.
Upload and review 5 to 10 real wakeboard videos, record each result in
docs/EVIDENCE_POSTPROCESSING_CALIBRATION_MATRIX.md, and only change
prompt/schema/validators after repeated patterns appear.
```

## Save Point Procedure

When the Founder says any of these:

- "정리하자"
- "작업 정리"
- "오늘 마무리"
- "Save Point"
- "마무리하자"

Expected process:

1. Summarize findings.
   - Confirmed facts
   - Observations
   - Hypotheses
   - Recommendations
   - Unknowns

2. Record decisions.
   - Product decisions
   - Technical decisions
   - Rejected directions
   - Reasons decisions were made

3. Record current status.
   - What works
   - What changed
   - What was verified
   - What was not verified

4. Record open issues.
   - Bugs
   - AI uncertainty
   - Product questions
   - Deployment or environment risks

5. Record next starting point.
   - The exact next priority
   - The first task for the next session
   - What not to do yet

6. Update documentation.
   - Always update this file if the operating context changed.
   - Update `docs/HANDOFF.md`, `docs/CONTINUITY_CHECKPOINT.md`, and
     `docs/CURRENT_STAGE.md` when milestone status, current priority, or next
     starting point changes.
   - Update specialized docs when relevant, such as taxonomy, validation,
     deployment, or AI design docs.

7. Verify.
   - Run `npm run typecheck` when code or TypeScript-facing docs/config changed,
     or when the Founder requests it.
   - Check `git status`.
   - Verify no secrets are committed.
   - Verify `.env.local` and local secret files remain ignored when env files
     are involved.

8. Commit and push when requested.
   - Use one clean checkpoint commit.
   - Push to `origin/master`.
   - Report commit hash and final git status.

Save Point report format:

```text
Confirmed:
- ...

Unknown:
- ...

Changed:
- ...

Verified:
- ...

Commit:
- ...

Next starting point:
- ...
```
