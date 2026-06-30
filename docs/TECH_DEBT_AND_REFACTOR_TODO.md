# Technical Debt and Refactor TODO

## Purpose

This document records known temporary implementations, compatibility paths, and
future refactor candidates for Action Sports Journal.

The goal is not to treat every item as urgent. The goal is to keep technical
debt visible so future Codex/GPT sessions do not mistake temporary structure
for final product architecture.

## Current Principle

Action Sports Journal is currently in the AI Analysis Product Completion phase.
The immediate product goal is:

```text
one real video upload
-> durable input secured
-> analysis starts server-side
-> result completes
-> result restores
-> rider understands the result
```

Do not start AI Coach, progression, or broad UI redesign work until this loop
feels stable.

## Foundation Safety Check

### Problem

ASJ is ready to add more Journal UX, Analysis UX, and Media UX, but those layers
will only feel trustworthy if the foundation under them is stable. Upload,
Sync, Ownership, Recovery, and cleanup paths have grown through real-device QA,
so future feature work needs a short safety gate before adding more surface
area.

### Why it matters

Riders will judge the product by whether their real videos, results, history,
and recovery paths survive normal mobile conditions. A beautiful Journal or
Analysis screen cannot compensate for lost uploads, stale sync, mismatched
ownership, orphaned storage, missing observability, or account-linking that
splits the rider's history.

### Decision

Before major UX expansion, run a Foundation Safety Check. This is not a new
architecture project and should not block small copy or polish changes. It is a
structured review/smoke checklist for the current foundation so future work does
not accidentally build on unstable assumptions.

### Scope

- Upload Reliability
- State Sync / Realtime / Push
- Identity / Ownership
- Storage / Cleanup
- Observability
- Recovery / Account Linking

### Check matrix

| Area | Check | Expected baseline |
| --- | --- | --- |
| Upload Reliability | Fresh upload creates target, uploads source, finalizes Moment, starts analysis, and restores result. | One real-device upload can complete without local/remote divergence. |
| Upload Reliability | Consecutive uploads while another Moment is processing do not create false failure alerts. | Upload target/finalize remain tolerant; AI throttling does not break upload UX. |
| Upload Reliability | Recoverable orphan and local-only failure paths are distinguishable. | Recoverable rows retry finalize; unrecoverable local-only drafts expire clearly. |
| State Sync / Realtime / Push | Completed analysis reaches the app through private Realtime or foreground refresh. | User-scoped channel stays private and does not depend on public broadcast. |
| State Sync / Realtime / Push | Push delivery failure is diagnosable. | `analysis_push_delivery_attempts` distinguishes missing/disabled/invalid tokens, ticket errors, and receipt errors. |
| State Sync / Realtime / Push | Push remains notification-only. | Push does not become the source of truth for Moment sync. |
| Identity / Ownership | Bearer-token requests resolve to the current Supabase Auth-backed `public.users` row. | `resolveRequestUser(request)` preserves the `auth_user_id` boundary. |
| Identity / Ownership | No-token default user remains internal QA only. | External app flows must not silently use the default user. |
| Identity / Ownership | Moment, upload target, evidence, and push token rows stay scoped to the same app user. | `public.users.id` remains the durable ownership anchor. |
| Storage / Cleanup | Source video retention and cleanup behavior are explicit. | Cleanup does not delete data still needed for retry, recovery, or QA interpretation. |
| Storage / Cleanup | Uploaded-source recovery has enough metadata to finalize safely. | Bucket/provider/path and target context are preserved before recovery attempts. |
| Observability | Upload, analysis, sync, push, and recovery failures have enough structured logs/rows to classify cause. | Debugging does not rely only on user screenshots or generic alerts. |
| Observability | Raw sensitive tokens are not duplicated into logs or analysis tables. | Push tokens and auth values are masked or referenced by row id. |
| Recovery / Account Linking | Email Recovery smoke is not called repeatedly while Supabase email rate limit is cooling down. | `updateUser({ email })` is retried once with the agreed email only. |
| Recovery / Account Linking | Linking a recovery method preserves existing ownership. | Supabase Auth user id, `public.users.id`, Moments, push tokens, and Realtime scope remain continuous. |
| Recovery / Account Linking | Kakao remains account linking/recovery, not a login wall. | `linkIdentity`-style flow is prepared before any Kakao implementation. |

### When to run

- Before starting a major Journal UX, Analysis UX, or Media UX expansion.
- Before adding a new recovery provider such as Kakao or Phone/SMS.
- After Auth, Upload, Realtime, Push, or Storage changes that touch ownership or
  restoration.
- Before preparing a new EAS build intended to validate a broader product
  surface.
- After any QA report that suggests lost media, missing results, stale sync,
  wrong owner data, or account recovery confusion.

### Execution result - 2026-06-26

Foundation Safety Check ran after Kakao Recovery Sign-in P1 / Build 81 passed
and before new Journal / Analysis / Media UX work. This pass was a code/docs/QA
baseline inspection plus a small local safety fix. No EAS build, paid AI call,
external console change, or DB migration was performed.

PASS:

- Push remains notification-only. Private Realtime plus foreground refresh
  remain the source of truth for completed analysis state.
- Push Observability P2 still covers missing tokens, disabled-only users,
  invalid token rows, Expo ticket mapping, receipt checks, and
  `DeviceNotRegistered` token disabling without duplicating raw Expo tokens in
  analysis attempt rows.
- Kakao Account Linking and Kakao Recovery Sign-in P1 remain separated:
  `linkIdentity` connects a recovery method to the current account, while the
  recovery sign-in path is isolated for reinstall/new-device recovery.
- Core ownership tables continue to use `public.users.id` as the durable app
  owner anchor.

WATCH:

- `resolveRequestUser(request)` preserves the Supabase Auth ->
  `public.users` boundary for bearer-token requests. External No-Token
  Finalization is now complete: normal app/API paths require a bearer token,
  and default-user fallback is explicit dev/test opt-in only.
- Moment ownership continuity after Kakao Recovery Sign-in has passed a
  user-facing existing-Moment smoke. The Founder tested fresh install -> Kakao
  reconnect -> upload video -> restart app and confirm video exists -> delete
  app -> reinstall -> anonymous state has no video -> Kakao reconnect ->
  previous video list appears. DB read-only verification remains optional later
  if a low-level ownership audit is needed.
- Uploaded-source recovery has enough provider/bucket/path/upload-target
  metadata to finalize safely, but automatic orphan cleanup should remain
  deferred until retry/recovery semantics are rechecked.
- Source video cleanup after completed analysis is explicit, but QA/debugging
  expectations must account for cleaned-up source objects.
- Recovery Attempt Observability P1 has a dedicated `recovery_attempts`
  migration SQL file, authenticated BFF endpoint, and client helper. The SQL has
  been applied, authenticated insert smoke passed, metadata redaction was
  confirmed, and no-token requests still return 401.
- Email Recovery remains a baseline/fallback path. It is no longer blocked by
  sender rate limits, but redirect URL / deep-link strategy and link-validity QA
  are still needed before productization.
- The new upload size guard depends on `asset.fileSize`; when the platform does
  not expose file size, server/storage validation remains the final guard.

FIX NEEDED:

- Fixed in this pass: Upload File-size Validation now blocks known >20MB video
  picker assets before upload submit, matching the current storage/provider
  limit and avoiding a confusing post-selection upload failure.

Needs separate CTO/user alignment before implementation:

1. Apply `recovery_attempts` migration after user/CTO confirmation, then run
   authenticated write smoke.
2. Email Recovery redirect/deep-link productization.

BLOCKED:

- No blocker was found in this safety pass. The remaining items are deliberate
  watch/follow-up items, not current blockers for continuing foundation
  hardening.

## Post-foundation Product UX Next-Step Review - 2026-06-26

Foundation hardening is closed enough to move into product UX. The recommended
next task is Product UX Baseline P1: Unified User-Facing Status Resolver.

### Reference-driven UI / UX rule

Founder direction as of 2026-06-30:

- ASJ should not invent new UI/UX systems just to be original.
- Prefer proven app patterns that many services already use, adapted to ASJ's
  rider-journal context.
- uibowl and similar reference libraries may be used to find comparable
  patterns for account settings, connection methods, recovery, onboarding
  choice, media cards, and share-ready presentation.
- These references are for structure, hierarchy, and flow. Do not copy exact
  screens, colors, or branding.
- Instagram remains the strongest behavioral reference because ASJ's target
  users are likely media-native and Instagram-familiar. Borrow validated user
  learning, not Instagram's exact UI.

### Decision

Start with a UI-only user-facing status resolver before larger Journal,
Analysis, Upload, or Media surface work.

Rules:

- Keep backend status/job semantics unchanged.
- Use one visible-state mapping across Home, Recent Sessions, Primary Insight,
  Journal Timeline, Video list, and Detail.
- Keep rider-facing state language simple: `진행중`, `완료`, `실패`.
- Do not combine this first pass with Home v2 layout, Upload bottom sheet,
  Trick Review, visual gauges, Share, DB migration, or build work.

### Candidate comparison

Upload UX:

- Current state: Upload pipeline is stable enough after Foundation Safety Check
  and the 20MB pre-upload guard.
- Do soon: Upload Entry UX Polish can refine CTA/copy/selection constraints
  without assuming a bottom sheet.
- History: Upload page/bottom-sheet exploration came from two earlier product
  ideas. First, the app originally considered collecting video + title +
  description before upload. Second, Instagram was used as a reference because
  ASJ's likely users are Instagram-inflow riders who already understand fast
  media creation flows. This is a product-behavior reference, not a requirement
  to copy Instagram's exact caption/share screen.
- Current product judgment: because upload no longer requires pre-submit title
  or description, the current stack-style upload screen may be safer than a
  bottom sheet. The preferred flow is media selection -> upload/analyze ->
  optional note later. Instagram remains an important UX reference for
  media-native speed, but ASJ should not copy Instagram's caption/share
  pre-submit step unless the product actually needs that input.
- Wait: Compression / Upload Optimization is a separate technical/product
  decision and should not be bundled into immediate UX polish.

Analysis UX:

- Current state: Result screens are functional but can feel dense and technical.
- Do soon: Evidence, confidence, and needs-review presentation should become
  easier to review.
- Wait: Trick Review bottom sheet and visual summary gauges have data/persistence
  decisions and should build on consistent status language first.

Journal UX:

- Current state: Home v2 planning exists and ASJ needs to feel more like a life
  log than a video gallery.
- Do now: Status consistency is the smallest safe Journal/Analysis shared slice
  and prepares Primary Insight, Recent Sessions, and Journal Timeline.
- Wait: Do not invent progression metrics or broader journal data that does not
  exist yet.

Kakao Recovery UX:

- Current state: Kakao linking and Kakao recovery sign-in are technically
  separate and both verified, but exposing both as separate user choices can
  feel unnecessarily complex.
- Implemented: one user-facing Kakao section/CTA now internally branches between
  connecting the current anonymous account and recovering an existing
  Kakao-linked account.
- Guardrail: keep local unsynced/uploading work protection and do not blur the
  internal ownership distinction between `linkIdentity` and recovery
  `signInWithOAuth`.

Account Recovery UI information architecture:

- Current state: Email and Kakao are now both single-CTA flows, and the
  `AccountRecoveryScreen` P1 information architecture has been simplified so
  account status, Email, Kakao, pending/error/linked details, and technical
  anonymous account language are no longer all exposed on first view.
- Decision: keep Account Recovery as an independent stack page like Upload.
  Recovery has its own pending/error/cancel/success states and should not be
  hidden in a tab or transient bottom sheet.
- Implemented P1: first view is a compact protection-method hub. It shows a
  short protection summary and method cards such as "카카오로 계속하기" and
  "이메일로 계속하기". Email/Kakao detailed panels are revealed only after the user
  selects or starts that method.
- Not recommended: tabs, because they make recovery methods look like competing
  settings; bottom sheets, because OAuth/email-link flows and app backgrounding
  can outgrow the sheet; immediate nested stack, because current-screen
  progressive disclosure is safer before adding navigation surface.
- Implementation scope: `AccountRecoveryScreen.tsx` information structure only.
  Supabase Auth, Kakao/Email helpers, DB, and ownership semantics were not
  changed. Standalone QA should confirm first-view density, Email method
  expansion, Kakao progress/cancel states, and small-device layout.
- Visible UI / UX Polish P1 added small primitive method visuals to the Kakao
  and Email cards after the IA pass. These are not a new icon system or official
  provider logos; they are lightweight scan cues for the method hub.
- Visible UI / UX Polish P2 shortened the method-hub helper copy while keeping
  the same Email/Kakao single-CTA flows and recovery semantics.

Media / Share UX:

- Current state: Instagram-led growth remains strategically important, but share
  surfaces should start from share-worthy Moment presentation, not direct social
  integration.
- Media / Share UX P1 is implemented as a Moment Detail share-ready preview
  card for completed evidence. It intentionally does not add Instagram/Kakao
  direct share, image export, native share sheet, server share pages, public
  feeds, ShareResult persistence, or ShareResult routes.
- Future Media UX P1 - Detail Media State Polish is implemented for Moment
  Detail only. Thumbnail-only states now look like intentional representative
  images, and missing-media copy is softer for completed records while still
  making non-completed video-access needs clear.
- Archive Card Visual Hierarchy P1 is implemented for Video tab rows only. It
  keeps thumbnail and row navigation intact while making archive cards read as
  rider journal records through label/date/title/status/description hierarchy
  and state-aware copy.
- Visible UI / UX Polish P1 is implemented as the last small pre-AI visual pass:
  remaining prototype/future-feature copy was removed from visible surfaces,
  Video empty/error states gained a primitive film-frame cue, and completed
  Moment Detail now hides technical evidence details behind "세부 근거 보기".
- Visible UI / UX Polish P2 is implemented for app chrome and empty states:
  bottom tab primitive icons, Home upload/account actions, Video empty copy,
  Upload record-creation copy, Detail opened-evidence copy, and missing-media
  copy were tightened without a new icon library or package change.
- Icon Library feasibility is now complete. ASJ adopted
  `@expo/vector-icons` / Ionicons as an explicit dependency for the first
  App Chrome icon pass because it is Expo-standard and lower-risk than adding
  `lucide-react-native` at this stage. Bottom tabs, Home upload/account entry,
  Video empty/error cue, and Account Recovery method cards are covered. This
  does not create a new brand symbol or official Kakao logo.
- Light/Dark mode is not implemented yet. The app still has broad hardcoded
  color usage, so the next safe step is a small theme-token layer before full
  Appearance / `useColorScheme` support.
- Theme Mode P1 implemented that token foundation without changing visible
  screen colors. `system | light | dark` preference types, dark/light token
  objects, AsyncStorage helpers, and a `useAppTheme()` resolver now exist.
  Remaining work is UI exposure and screen-by-screen token adoption.
- Final Design / UI / UX Closeout Audit is closed for the current pre-AI
  Calibration scope. No further small visible polish blocker was found. Treat
  the remaining design work as follow-up backlog, not a calibration blocker:
  QA Debug Panel production hide policy, Settings/Profile theme selector,
  screen-by-screen token rollout, full light-mode QA, completed Moment Detail
  sample QA, and later Media / Share export/share route decisions.
- Theme Mode P2 moved the selector from backlog to implemented baseline. Home
  now keeps only the primary Upload CTA plus a Profile/Settings entry, not a
  standalone Home header theme icon. The temporary Home inline hub was replaced
  with a standalone `Settings` stack screen because floating over Home felt like
  a QA/dev convenience rather than a service pattern. `Settings` contains
  `계정 보호 / 복구`, `화면 모드`, and `QA 진단 패널` 안내. Account Recovery is
  entered through Home -> Settings -> `계정 보호 / 복구`. Selection persists,
  and major visible surfaces support usable light/dark treatment. Remaining
  theme debt:
  - Continue removing hardcoded colors as screens are touched.
  - QA selected-video Upload state and completed Moment Detail real-data state.
  - Re-check QA Debug Panel production hide/gate policy before any public build.
- User-facing app-name copy policy is set: visible UI should not use `ASJ` or
  `Action Sports Journal`; use `Wake Board` when an app name is needed.
  Internal variables, docs, historical notes, and developer-only logs can keep
  ASJ.
- Upload compression POC/debug metadata remains available only by explicit env
  opt-in. Before production distribution, re-check QA Debug Panel visibility and
  any other debug-only surfaces.
- Do next only after product approval: choose one of image export, native share
  sheet, ShareResult route, or a theme-token adoption pass.

### Minimum next implementation scope

1. Create or consolidate a shared UI-facing status resolver.
2. Map internal states to visible states:
   - queued -> `진행중`
   - processing -> `진행중`
   - completed -> `완료`
   - failed -> `실패`
3. Apply the resolver to the currently visible Home / list / detail surfaces.
4. Keep retry eligibility, upload bottom sheet, Home v2 layout, and analysis
   trust widgets as separate follow-up work.

### Validation

- Run `npm run typecheck`.
- Use simulator/local UI to confirm the same Moment shows the same visible state
  across Home, Video list, and Detail.
- No EAS build is needed for this first status-consistency pass.

### Execution result - 2026-06-26

Product UX Baseline P1 is implemented.

Implemented:

- Added a UI-facing Moment status presentation helper in `momentStatus.ts`.
- Preserved backend/internal `MomentStatus` semantics.
- Mapped visible labels as:
  - `uploading`, `queued`, `processing` -> `진행중`
  - `completed` -> `완료`
  - `failed`, `upload_failed` -> `실패`
- Applied visible labels to Home Primary Insight, Recent Sessions, Video Archive
  rows, and Moment Detail header.
- Kept detailed explanatory copy for upload/progress/failure states so users
  still get useful context after seeing the simplified label.

Validation:

- `npm run typecheck` passed.
- No EAS build, paid AI call, DB migration, or external console change was
  performed.

Follow-up:

- Detail Menu / Retry Eligibility Polish remains the recommended next UX
  backlog item.
- Home v2 / Journal UX first slice, Upload Entry bottom sheet, Analysis trust
  UX, and Media / Share UX remain separate follow-up work.

## Detail Menu / Retry Eligibility Polish - 2026-06-26

### Decision

Moment Detail actions should be visible and explainable without changing backend
status semantics. Retry is an eligibility-driven UI action, not a generic
"run again anytime" command.

### Implemented scope

- Added a `작업` panel under the Detail video.
- Removed the tiny header-only delete affordance from `MomentDetailContent`.
- Kept `삭제` visible in the action panel and preserved the existing delete
  confirmation/API behavior.
- Kept `분석 다시 시도` visible when the Detail screen has an `onRetry` handler,
  but disabled it unless `getRetryEligibility()` returns `canRetry=true`.
- Shows the retry reason below the action buttons.
- Preserved backend/internal Moment status semantics.

### Retry policy

- Running states (`uploading`, `queued`, `processing`) keep retry disabled and
  explain that upload/analysis is already in progress.
- Completed state keeps retry disabled and prioritizes result review.
- Failed and upload-failed states can retry only when the existing eligibility
  helper allows it, including local/source video availability.
- Missing-video/source-unavailable states explain why retry cannot run.

### Validation

- `npm run typecheck` passed.
- `git diff --check` passed.
- Expo Go / iPhone 17 Simulator confirmed:
  - completed Detail: disabled retry, visible delete, completed reason copy
  - running Detail: disabled retry, visible delete, in-progress reason copy
- Failed-state rendering was verified by code path/typecheck only because the
  currently visible local samples did not include a failed Moment.
- No EAS build, paid AI call, DB migration, or external console change was
  performed.

## Home v2 / Journal UX First Slice - 2026-06-26

### Decision

Start Home v2 with a narrow journal-feel slice before broader layout,
progression, media/share, or new data-model work.

### Implemented scope

- Added `Journal Snapshot` to Home using existing Moment/session data only.
- Shows total records, completed records, in-progress records, and latest
  completed analysis date.
- Shifted header, Primary Insight empty state, and recent rail copy toward
  riding-record/journal language.
- Renamed the recent rail to "최근 기록" / `JOURNAL`.
- Preserved upload CTA visibility, Video Archive navigation, Moment Detail
  navigation, backend status semantics, and existing data model.

### Validation

- `npm run typecheck` passed.
- `git diff --check` passed.
- Expo Go / iPhone 17 Simulator confirmed the Home screen renders the snapshot,
  recent insight, and recent record rail; Video tab still opens.
- Empty-state copy was verified by code path/typecheck only because the current
  simulator had existing local/remote samples.
- No EAS build, paid AI call, DB migration, or external console change was
  performed.

### Follow-up

- Upload Entry UX Polish remains the recommended next product UX slice. Do not
  assume bottom sheet conversion; keep the current stack-style upload flow if
  it better matches the no-required-input upload philosophy.
- Analysis Trust UX can follow after upload entry and journal framing are more
  stable.
- A deeper Home v2 timeline/progression pass should wait until it can reuse
  existing data honestly without inventing progression metrics.

## Upload Entry UX Polish - 2026-06-26

### Decision

Keep the current route-backed/full-screen Upload flow. Do not convert to a
bottom sheet yet.

Reasoning:

- Current product direction is fast media selection first.
- The app no longer needs a pre-submit title/description/caption step for this
  slice.
- A bottom sheet could imply there is extra form work before upload, which would
  work against the desired Instagram-like quick media creation feel.
- The existing Upload screen already gives enough room for selected-video
  confirmation, upload safety copy, progress, and failure state.

### Implemented scope

- Added "새 기록 만들기" header copy to `UploadContent`.
- Reframed selected-video metadata as "선택한 라이딩 영상".
- Added a compact "영상 확인 -> 업로드 -> 분석 시작" step strip.
- Added helper copy that analysis can start without a memo step and that the
  current limit is 30MB / 15 seconds.
- Updated the primary action to "업로드하고 분석 시작".
- Preserved picker, upload submit, upload progress, upload failure alert/retry,
  route-backed `UploadScreen`, and existing pre-upload validation.

### Validation

- `npm run typecheck` passed.
- `git diff --check` passed.
- Expo Go / iPhone 17 Simulator confirmed Home upload CTA opens the iOS video
  picker.
- Selected-video Upload screen rendering was verified by code path/typecheck
  because the simulator picker did not complete selection during this pass.
- No EAS build, paid AI call, DB migration, or external console change was
  performed.

### Follow-up

- Upload Entry Bottom Sheet remains deferred until the product has a real
  pre-submit choice that benefits from a sheet.
- Compression / Upload Optimization remains a separate later workstream.

## Analysis Trust UX - 2026-06-26

### Decision

Improve trust comprehension in the existing Analysis Detail UI without changing
the AI pipeline, prompts, schemas, stored results, or backend status semantics.

The goal is not to make the AI result look more certain. The goal is to help
the rider understand:

- what the AI thinks it saw;
- why it reached that interpretation;
- whether the result should be treated as confirmed, possible, or needing
  review.

### Implemented scope

- Added `trustDescription` to the rider-facing analysis view model.
- Added a "신뢰 안내" box to the Analysis Summary card.
- Kept trust labels simple:
  - `근거 충분`
  - `가능성 있음`
  - `확인 필요`
- Added distinct visual tones for each trust label.
- Renamed "확인된 신호" to "판단 근거".
- Kept "확인할 점" as the low-confidence / ambiguous-evidence section.
- Changed detailed evidence labels from technical English toward rider-facing
  Korean labels.
- Mapped raw confidence values to `높음`, `중간`, and `낮음`.
- Kept internal debug data behind the existing dev/debug viewer gate.

### Validation

- `npm run typecheck` passed.
- `git diff --check` passed.
- Expo Go / iPhone 17 Simulator confirmed:
  - completed/needs-review Detail shows trust explanation, review badge, and
    judgment evidence list;
  - detailed evidence labels render in Korean;
  - in-progress/data-not-ready Detail keeps existing status and retry-disabled
    behavior.
- No EAS build, paid AI call, DB migration, external console change, prompt
  change, schema change, or new analysis execution was performed.

### Follow-up

- Trick Review Bottom Sheet remains a later P2 trust workflow for confirming or
  correcting the detected trick.
- Visual Summary Gauges remain later; do not add score-like gauges before the
  evidence/review workflow is stable.
- Raw debug viewer layout can be improved later for internal QA, but should not
  become rider-facing UI.

## Kakao Single CTA Recovery UX - 2026-06-26

### Decision

User-facing Kakao recovery/account protection should be one action, not two
separate product concepts. The user should not need to decide between "connect"
and "recover"; the app can guide the branch while keeping internal ownership
semantics explicit.

### Implemented scope

- `AccountRecoveryScreen` now shows one Kakao section with a single CTA.
- Default CTA path runs `linkKakaoIdentity` first, preserving the current
  anonymous/device-first account and protecting its records.
- If link returns a not-linked result that implies the Kakao identity may
  already belong to another account, the same CTA now continues directly into
  the existing `recoverWithKakao` / `signInWithOAuth` path.
- The existing `checkRecoveryLocalWorkGuard()` remains in front of recovery
  session switching, so local unsynced/uploading work is still protected.
- Separate Email Recovery UI remains baseline/fallback and was not expanded.

### Validation

- `npm run typecheck` passed.
- No EAS build, paid AI call, DB migration, or external console change was
  performed.
- Simulator UI was not launched because no Metro/Expo session or booted
  simulator was active.
- Build 84 real-device QA passed for the app-internal one-click goal:
  `카카오로 계속하기` recovered the existing Kakao-linked account without
  exposing the previous recover-ready state or second CTA, and Home / Video /
  Detail restored under the recovered account.

### Follow-up

- OAuth Step Reduction Investigation is closed for the current app scope.
  Kakao/iOS may still feel like two external `계속` actions, but ASJ's internal
  CTA is already one-click. Treat the remaining steps as provider/platform
  OAuth prompts and do not bypass them. Store-before-release follow-up is limited
  to Kakao/Supabase display, redirect, and consent-setting review.

## Startup / Video Tab Loading Observability P1 - 2026-06-26

Status: complete for the current P1 preview/internal QA scope. Build 85
real-device QA passed.

### Problem

After time passes or the user changes location/network, startup can feel slow
and the Video/List tab can appear to keep spinning. This may be acceptable
Render/Supabase/free-plan cold start or network latency, but it may also reveal
an app-side missing timeout, missing error state, missing empty state, or
infinite loading bug.

### Investigation scope

- Auth/session/bootstrap loading.
- Local persisted session restore.
- Initial remote Moment page sync.
- Video Archive first-page loading.
- Foreground, Push response, Realtime, and manual refresh effects on the same
  state.
- User-facing loading, empty, timeout, and error states.

### Known starting points

- `AuthSessionProvider` controls initial auth loading and anonymous session
  creation.
- `useBootSync` controls local storage restore and first remote Moment sync,
  with an 8 second remote Moment list timeout.
- `HomeScreen` blocks the initial app surface while auth or initial Moment sync
  is loading.
- `VideoArchiveList` shows an ActivityIndicator when its first page is loading,
  but current copy does not distinguish slow infrastructure, empty archive,
  timeout, or request failure.

### Desired outcome

Separate infrastructure latency from app bugs by adding or confirming
observability before changing UX. P0/P1 fixes should focus on preventing
indefinite loading, showing a clear retry/error/empty state, and logging enough
reason data to classify the failure path.

### Build 85 QA result

- Build 85 passed real-device QA for Startup / Video Tab Loading
  Observability P1 and the QA Debug Overlay/Panel.
- QA button visibility confirmed.
- QA panel shows auth/bootstrap, boot remote sync, and Video archive first-page
  state.
- Boot sync displays status, durationMs, count, hasMore, reason, and updated
  time.
- Video first page displays status, durationMs, count, hasMore, reason, retry
  count, and updated time.
- Video tab did not remain trapped in an indefinite spinner on the tested path.
- Timeout/error states have a retryable UI path instead of endless loading.
- QA panel did not materially block major tab interactions.
- Sensitive information was not exposed: no access token, refresh token, full
  callback URL, email/name, or full user id.

### Remaining follow-up

1. If slow startup or Video spinner behavior recurs, collect QA panel values
   before changing code or infrastructure.
2. Consider Render/Supabase plan upgrade only if QA panel values point to
   infrastructure latency.
3. Auth bootstrap timeout/observability remains a later backlog item.
4. QA Debug Panel should stay available during current testing and be hidden or
   removed right before real service production distribution.

### Real-use Loading Diagnosis P1 minimum fix - 2026-06-26

Build 85/86 real-use logs showed a case where Auth was healthy, boot remote
Moment sync timed out around 8 seconds, Home later showed existing sessions, and
the Video tab could still look loading/empty because archive first-page state is
separate from the Home sessions cache.

Implemented minimum fix:

- Boot diagnostics now mark successful retry/recovery after timeout as
  `recovered_after_timeout` instead of leaving QA Debug stuck on the original
  timeout state.
- Video archive uses Home session summaries as a temporary display fallback
  when archive first-page data has not loaded yet but Home already has records.
- Video header copy indicates this fallback as "홈 기록 기준, 아카이브 동기화 중".
- QA Debug now shows home / archive / shown counts so future screenshots can
  identify whether the issue is data absence, archive ordering, or display
  fallback.

Validation:

- `npm run typecheck` passed.
- `git diff --check` passed.
- Simulator UI verification was attempted but local `xcrun simctl` did not
  respond in this session, so the remaining UI confirmation should happen in
  the next simulator/device QA pass.
- Build 87 real-device QA found no issue. Keep observing via QA Debug because
  the original symptom depends on timing/network conditions, but do not keep it
  as an active blocker.

### Video no-records timeout UI follow-up - 2026-06-27

Build QA later found a narrower no-records case: after cleanup, home/archive/
shown counts could all be 0 while boot remote Moment sync timed out, and the
Video tab could still show the "Wake Board Loading..." card. This made a normal
empty archive plus slow network look like an infinite loading bug.

Implemented minimum fix:

- `HomeScreen` now computes a separate Video UI load state instead of passing
  request loading through directly.
- If boot remote sync is `timeout` / `failed` and there are no visible Video
  rows, the Video tab shows a retryable delayed-sync empty state rather than the
  loading spinner.
- `VideoArchiveList` has a dedicated `delayed` state with user-facing copy:
  "영상 기록 동기화가 지연 중입니다".
- QA Debug now shows both Video request diagnostics and the actual Video UI
  state, so future screenshots can distinguish `Video loading` from `ui delayed`.

Validation:

- `npm run typecheck` passed.
- `git diff --check` passed.
- Simulator no-data Video tab should be rechecked in the next local/device QA
  pass; no EAS build was run for this fix.

## Email Recovery / Account Linking QA - 2026-06-24

The first implementation links a recovery email to the current authenticated
anonymous Supabase user. Email Recovery Sign-in P1 now adds the separate
reinstall/new-device recovery path in code, but standalone E2E QA is still
pending.

Current P1 status:

1. Email Recovery Connection P1 is implemented and Build 89 standalone iPhone QA
   passed. The latest implementation passes explicit
   `emailRedirectTo=actionsportsjournal://auth/email/change` to
   `updateUser({ email })`.
2. The app handles initial and runtime email-change callback URLs, supports code
   exchange and hash session payloads, refreshes session/user state after
   callback completion, and does not treat expired/error/missing-payload
   callbacks as success.
3. Build 87 confirmed the already-registered email guard path:
   `A user with this email address has already been registered.` Fresh email
   confirmation-link QA was later retried with an owner-approved fresh email.
   Build 88 later confirmed Auth/public DB success with
   `parksunl77@daum.net`, but UI state did not automatically recover after link
   return/relaunch. A minimal session restore/UI state fix was implemented.
   Build 89 then confirmed email link return to ASJ, "복구 준비 완료" without manual
   refresh, and linked-state persistence after full app relaunch.
4. Do not run more repeated `updateUser({ email })` tests with
   `parksunl7@naver.com`; it is no longer a valid fresh Email Recovery target.
   Any future Email Recovery E2E must use an owner-approved fresh email and run
   within the magic-link validity window.
5. Current-account email recovery-method connection is complete.
6. Email Recovery Sign-in P1 now uses a single user-facing CTA after Build 92
   feedback. The UI no longer asks the rider to choose between "connect email"
   and "recover existing records". Internally, ASJ first tries
   `updateUser({ email })` for current-account connection; if Supabase reports
   the email already exists, it uses the existing
   `signInWithOtp({ shouldCreateUser: false, emailRedirectTo })` recovery path
   and `actionsportsjournal://auth/email/recovery` callback after the local-work
   guard passes.
7. Next standalone E2E QA must confirm existing Moments, upload targets, push
   tokens, and Realtime channel ownership stay under the recovered user after
   email verification/sign-in.
8. Keep no-token default user fallback internal-only throughout this work.

Current blocker:

Email Recovery Connection P1 is no longer blocked at the code/redirect strategy,
hosted sender, or fresh-link QA step. Build 89 closed the current-account
connection path. Keep Email Recovery as a baseline/fallback path while Kakao
Recovery remains the stronger verified path for Korean-market UX.

Deep-link / redirect investigation result:

- Status: investigated and current-account connection P1 implemented.
- The send path exists, and productized app deep-link completion is now ready
  for standalone QA.
- `updateUser({ email })` is the current-account email recovery-method
  connection path, not reinstall/new-device recovery sign-in.
- Reinstall/new-device recovery now has a P1 code path using
  `signInWithOtp({ shouldCreateUser: false, emailRedirectTo })`; standalone
  E2E QA remains pending.
- Email must follow the same product separation as Kakao: connect a recovery
  method versus recover existing records.
- Current Email connection path now has a callback helper, initial URL handler,
  and runtime URL listener.
- `updateUser({ email })` now passes explicit
  `emailRedirectTo=actionsportsjournal://auth/email/change`.
- App scheme `actionsportsjournal` exists and is verified by Kakao standalone
  OAuth E2E.
- Selected P1 app redirect: `actionsportsjournal://auth/email/change`.
- Candidate Supabase redirect allowlist: `actionsportsjournal://**` or narrower
  `actionsportsjournal://auth/email/**`.
- The callback handler accepts both `code` exchange and hash access/refresh
  token payloads; token values must never be logged.
- Email QA requires a fresh test email, link-validity-window execution, and
  awareness of hosted email rate limits.
- Next action: Build 86 real-device QA. App delete/reinstall email recovery
  sign-in remains a separate backlog item.

Email Recovery Connection P1 implementation checkpoint, 2026-06-26:

- Status: implemented, Build 86 QA pending.
- Product meaning: connect a recovery email to the current device-first account.
  This is not reinstall/new-device Email Recovery Sign-in.
- Email Change redirect target is explicit:
  `actionsportsjournal://auth/email/change`.
- Email callback handling covers initial URL and runtime URL events.
- Callback completion refreshes session/user state.
- AccountRecoveryScreen copy was reduced so users do not read this as
  reinstall/new-device recovery.
- Build 86 was created for standalone email-link callback QA:
  - build number: `86`
  - EAS Build ID: `c7527f7e-d122-4f80-a743-c0a4560670f5`
  - implementation commit: `5a66ce3 feat: complete email recovery linking redirect`
  - build commit: `473c131 chore: prepare email recovery qa build`
- QA pending:
  1. Send recovery email from AccountRecoveryScreen with a fresh email if
     possible.
  2. Open the received confirmation link from Mail/Gmail.
  3. Confirm the link opens ASJ rather than localhost.
  4. Confirm Email section converges to the connected/recovery-ready state.
  5. Confirm Kakao recovery state is not broken.
  6. Confirm relaunch preserves the email-connected state.
- Follow-up: Email Recovery Sign-in for reinstall/new-device recovery and Site
  URL / production fallback policy remain separate.

Fresh-email magic-link smoke result:

- Test email: `parksunl88@nate.com`.
- `updateUser({ email })` call count: `1`.
- Result: success.
- Auth user state after request: `email` empty,
  `new_email=parksunl88@nate.com`, `is_anonymous=true`.
- Email receipt: confirmed.
- Template behavior: Supabase Change Email is magic-link based.
- Link click result:
  `http://localhost:3000/#error=access_denied&error_code=otp_expired...`.
- Final email linking: not completed because the link was expired and the
  redirect target is still localhost.
- `public.users.email` sync and ownership continuity after email verification:
  not verified because final linking did not complete.

Earlier final smoke result:

- Test email: `parksunl7@naver.com`.
- `updateUser({ email })` call count: `1`.
- Result: `email_exists` / HTTP 422,
  `A user with this email address has already been registered`.
- Existing registered Auth user:
  `499d7e71-623c-4b4e-8653-267d72ac3ca6`.
- Existing `public.users.id`:
  `6b03b289-a6aa-4f26-aa66-6730e1cca2fe`.
- No email was sent, so magic-link click/session refresh and
  `public.users.email` sync were not retested.
- Temporary QA seed Auth user
  `68747ded-ee58-4406-8d4f-3037a3c91be4` was cleaned up.

Supabase email rate-limit / custom SMTP judgment:

Supabase's built-in Auth email provider is not a production recovery path for
ASJ. Official docs describe the built-in sender as a low-limit demonstration
service, currently limited to 2 email-triggering requests per hour project-wide
for endpoints including `/auth/v1/user` when updating a user's email address.
That is exactly the Email Recovery `updateUser({ email })` path. The email-send
limit is only adjustable with custom SMTP; upgrading plan alone should not be
treated as the fix unless Supabase support explicitly confirms otherwise.

Custom SMTP would move sending to ASJ's chosen email provider and starts with a
low Supabase-side limit, then can be adjusted in Auth Rate Limits. Minimum setup
items:

1. Auth sending domain or subdomain.
2. SMTP provider account, host, port, username, and password.
3. From address and sender name.
4. SPF, DKIM, and DMARC records.
5. Supabase Auth custom SMTP configuration.
6. Auth Rate Limits value aligned with the provider's allowed sending volume.
7. Auth logs plus provider delivery logs for E2E smoke.

Candidate services to evaluate: Resend, Postmark, AWS SES, SendGrid, Brevo, or
Mailtrap for sandbox-only testing. For ASJ's current stage, do not rush custom
SMTP solely to finish one smoke test. Keep Email Recovery as the baseline
account-linking structure, evaluate Kakao Recovery in parallel for Korean user
fit, and add custom SMTP only when email recovery is selected as a real
distribution path or repeated QA needs reliable email delivery.

Future recovery backlog:

- Keep Email Recovery as the current baseline for validating account
  preservation, ownership continuity, and account-linking structure.
- Keep Kakao Account Linking / Kakao Recovery as a strong candidate before
  distribution, because ASJ's Korean mobile users and Instagram-centered inflow
  may find Kakao or SMS more natural than email.
- Email may be lower-friction than Apple ID for early recovery, but do not treat
  it as the final Korean-market recovery UX by default.
- Do not implement Kakao, Phone/SMS, Apple, Google, or Kakao Login during the
  current Email Recovery pass.
- Revisit Kakao / Phone only after Email Recovery is stable and the app is
  preparing for broader distribution.

Kakao Account Linking / Recovery backlog:

Treat Kakao as an account-linking/recovery candidate for the existing anonymous
Supabase Auth user, not as a new login wall. Before implementation, prepare and
verify:

1. Supabase Kakao provider can be enabled for the project.
   Status: done. Provider is enabled with REST API Key and Client Secret Code
   entered. "Allow users without an email" is enabled.
2. Manual Identity Linking can be enabled and used from the current anonymous
   session.
   Status: "Allow manual linking" was found under Authentication -> Sign In /
   Providers -> User Signups and is enabled. "Allow anonymous sign-ins" is also
   enabled.
3. Supabase Redirect URLs include the app deep-link scheme.
4. Kakao Developers app exists with REST API key and Kakao Login Client Secret.
   Status: done. REST API Key and Client Secret Code are ready, Kakao Login is
   enabled, and the Supabase callback Redirect URI is registered.
5. Kakao Login is enabled and required consent items are configured.
   Status: nickname consent is enabled; profile image is disabled; email is
   disabled / unavailable.
6. App scheme is selected, with `actionsportsjournal` as the current candidate.
7. The linking smoke plan verifies that `linkIdentity` preserves the existing
   Supabase Auth user id, `public.users.id`, Moment ownership, push token
   ownership, and user-scoped Realtime channel.

Setup checklist detail:

- `app.json` currently has no Expo `scheme`; Kakao/Supabase OAuth deep linking
  will require adding one before implementation.
- Current scheme candidate: `actionsportsjournal`.
- Supabase Redirect URLs should include `actionsportsjournal://**` after the
  scheme is confirmed.
- Kakao Developers and Supabase provider setup are ready for implementation
  planning. Kakao email remains unavailable, so the first smoke is a no-email
  provider-identity linking smoke.
- Email is not required for ownership continuity if `linkIdentity` preserves the
  existing anonymous Auth user id. If `account_email` remains unavailable,
  first Kakao recovery UX should treat Kakao provider identity + nickname as the
  linked recovery signal and leave `public.users.email` null.
- Minimum pre-smoke settings: Supabase Kakao provider has REST API Key + Client
  Secret Code entered, "Allow users without an email" enabled, Manual Identity
  Linking remains enabled, and the app scheme / Redirect URL plan is ready.
- Adding the native app scheme will likely require a new iOS standalone/EAS
  preview build to verify deep-link return behavior after implementation. Do
  not create that build during planning.

Implementation plan:

1. Screen structure:
   - Use the existing `AccountRecoveryScreen` for the first implementation.
   - Keep the page framed as account preservation / recovery.
   - Add a Kakao linking section below Email Recovery.
   - Avoid a new login wall or broad Auth screen.
2. Auth helper:
   - Add a focused Kakao linking helper that calls
     `supabase.auth.linkIdentity({ provider: "kakao", options: { redirectTo,
     skipBrowserRedirect: true } })`.
   - Keep `signInWithOAuth` out of this path unless a future reinstall/new-device
     recovery sign-in flow is explicitly designed.
3. Deep link/session handling:
   - Add `scheme: "actionsportsjournal"` to `app.json` when implementation
     starts.
   - Add `actionsportsjournal://**` to Supabase Redirect URLs before smoke.
   - Use Expo browser/deep-link handling (`expo-web-browser` with
     `expo-linking` or `expo-auth-session` redirect helpers) to open the OAuth
     URL and capture the app return.
   - After return, refresh the Supabase session and verify identities with
     `getUser()` / `getUserIdentities()`. Because `linkIdentity` supports PKCE,
     be prepared to exchange a returned code if the redirect payload requires it.
4. Server profile sync:
   - `resolveRequestUser(request)` already syncs email and display name from
     Supabase Auth metadata.
   - Kakao without `account_email` should leave `public.users.email` null.
   - Only add Kakao-specific nickname metadata mapping after smoke shows the
     exact metadata key Supabase receives from Kakao.
5. No-email UI:
   - Show Kakao as connected using provider identity and nickname metadata.
   - Do not describe the Kakao-linked state as email recovery if Kakao email is
     unavailable.
6. Ownership continuity smoke:
   - Supabase Auth user id stays the same.
   - `public.users.id` stays the same.
   - Existing Moment `user_id` stays the same.
   - Existing `device_push_tokens.user_id` stays the same.
   - Realtime channel basis remains `analysis-updates:auth:{authUserId}`.
   - No separate Supabase Auth user is created.
7. Build timing:
   - Local/static implementation and typecheck can happen before a build.
   - Deep-link return on iOS standalone/EAS preview likely requires a new build
     after `app.json` scheme changes.
   - Do not create the EAS build until the implementation is ready for a focused
     Kakao linking QA pass.

Local/simulator check:

Kakao Account Linking first implementation passed local/Simulator smoke in Expo
Go on iPhone 17 Simulator. Confirmed app launch, AccountRecoveryScreen entry,
Email Recovery rendering, Kakao recovery-method rendering, Kakao button loading
state, iOS OAuth confirmation prompt for `kauth.kakao.com`, and cancel return
with in-app cancel message.

Remaining EAS preview E2E:

1. `actionsportsjournal://` deep-link return works in standalone iOS.
2. Kakao OAuth completion returns to the app.
3. `linkIdentity` preserves the existing anonymous Auth user id.
4. `public.users.id` remains unchanged.
5. Moment ownership remains unchanged.
6. `device_push_tokens.user_id` remains unchanged.
7. Realtime channel basis remains `analysis-updates:auth:{authUserId}`.
8. No separate Supabase Auth user is created.

Build 75 E2E closeout:

Build 75 passed Kakao Account Linking E2E after Kakao consent configuration was
corrected. The app returned through `actionsportsjournal`, showed Kakao recovery
method connected state, and read-only DB/Auth checks confirmed:

- Auth user id `499d7e71-623c-4b4e-8653-267d72ac3ca6`.
- Kakao identity id `9aaaf219-bdf9-4fe5-91df-1a59ec57d558`.
- Kakao provider id `4960498960`.
- `public.users.id` `6b03b289-a6aa-4f26-aa66-6730e1cca2fe`.
- `public.users.email` `parksunl7@naver.com`.
- `device_push_tokens` count `1`.
- Realtime channel basis
  `analysis-updates:auth:499d7e71-623c-4b4e-8653-267d72ac3ca6`.

Follow-up backlog:

- Kakao linking UX: make connected, failed, and cancelled states more explicit.
- Kakao metadata sync: investigated on 2026-06-26 and completed for the current
  scope. Auth `user_metadata` contains Kakao name candidates and
  `resolveRequestUser(request)` now syncs `full_name`, `name`,
  `preferred_username`, `user_name`, then email to `public.users.display_name`.
- Moment ownership continuity: rerun with a user that already has Moments. The
  Build 75 QA user had `moments` count `0`, so preservation was verified by
  ownership structure, not by a real existing Moment sample.
- Kakao recovery sign-in: current Kakao work links a recovery method to the
  current anonymous-first account. App delete/reinstall clears the local
  Supabase session and starts a new anonymous session; a separate "recover
  existing account with Kakao" sign-in flow is still required before the UI can
  promise reinstall/new-device recovery.

Kakao Recovery Sign-in P1 status:

This is the recovery gap after successful Kakao account linking. Keep
`linkIdentity` and `signInWithOAuth` separate:

- `linkIdentity`: connect Kakao to the currently signed-in anonymous/device-first
  account. This is the "복구 수단 연결" path.
- `signInWithOAuth`: recover an existing Kakao-linked Auth user after
  reinstall/new-device. This is the "기존 기록 복구하기" path.

P1 implementation status, 2026-06-25:

P1 is implemented and Build 81 standalone iPhone QA passed.

Implemented:

1. `kakaoRecoverySignIn` helper separate from the current linking helper.
2. `recoverWithKakao` path in `AuthSessionProvider`.
3. Distinct "기존 기록 복구하기" section in `AccountRecoveryScreen`.
4. Linking CTA and recovery sign-in CTA separated in copy and layout.
5. Recovery success refreshes/replaces the Supabase session and user.
6. Local-work guard blocks recovery when unsynced/uploading local work exists.

Build 81 QA verified:

1. Reinstall/new-device anonymous session can recover the existing Kakao-linked
   Auth user.
2. The account/recovery screen opens from fresh anonymous state.
3. "카카오로 기존 기록 복구" opens Kakao login/consent.
4. OAuth success returns to ASJ.
5. The existing Kakao-linked account is recovered from the user's perspective.

Remaining follow-up checks:

1. Kakao display_name sync/fallback is complete for the current scope. Revisit
   only when user-editable display names are introduced.
2. Keep Realtime recovered-auth-channel verification in the ownership continuity
   follow-up if additional DB/log evidence is needed.

Kakao display_name sync policy:

- Use Auth `user_metadata` as the safer source for Kakao display names.
  Supabase admin `listUsers` did not reliably expose `identities[]` in the
  read-only check.
- Current observed metadata includes `name`, `full_name`, `preferred_username`,
  and `user_name`.
- `AccountRecoveryScreen` already reads Kakao display copy from Auth
  `user_metadata`, not from `public.users.display_name`.
- `resolveRequestUser(request)` syncs `user_metadata.full_name`, `name`,
  `preferred_username`, `user_name`, then email to `public.users.display_name`
  on authenticated API requests.
- Kakao email is optional; do not require email for display_name sync.
- If ASJ later adds user-editable display names, revisit overwrite policy so
  Kakao metadata does not blindly replace a user-customized value.

Risks / QA gates:

- Wrong-account merge: do not automatically merge the fresh anonymous
  `public.users` row into the recovered account in P1.
- Local work loss: do not silently discard drafts, uploading sessions, or
  local-only Moments during recovery.
- No-token/default-user regression: recovered-session API calls must carry the
  recovered bearer token.
- Push owner mismatch: device token should be registered to the recovered app
  user after session switch.
- Realtime mismatch: the app should leave the old auth channel and subscribe to
  `analysis-updates:auth:{authUserId}` for the recovered Auth user.
- UI confusion: "복구 수단 연결" and "기존 기록 복구하기" must not look like the same
  action.

Non-goals:

- No Auth-wide refactor.
- No DB schema change.
- No automatic `public.users` merge.
- No Email Recovery productization.
- No Apple/Google provider expansion.
- No Push/Realtime redesign beyond verification after session switch.

## Build 65 Upload Recovery / Local-only Failure Follow-up - 2026-06-23

Current baseline:

Build 65 separates recoverable orphan uploads from unrecoverable local-only
sessions.

- Recoverable: local optimistic session has `uploadId` and `storagePath`; retry
  finalize for up to about three minutes.
- Unrecoverable: no `uploadId/storagePath`; expire to `upload_failed` after
  about 45 seconds and remove the Video pending entry.

Remaining risk:

The latest A-processing/B-upload QA found an immediate failure Alert for B while
server data only showed A completing normally. No distinct B `upload_targets`
row existed. This points to a pre-target or early client-side failure path.

Policy update:

Upload target issuance should not be the normal place where user-facing
concurrency is enforced. A rider should be able to upload B while A is already
processing. Network upload concurrency may still be one at a time, but within
the allowed product limits target/finalize requests should be accepted. If the
product later needs an active processing/upload cap, block entry at the upload
CTA before the user starts an upload, not through a mid-flow 429 Alert.

Implementation note:

Upload/finalize routes use a separate, relaxed upload rate limit from AI
analysis requests. During upload pipeline QA, target/finalize should be
effectively non-blocking so consecutive uploads can validate target issuance,
Storage upload, finalize, and Moment creation without AI-route throttling
interference. The 429 upload target UX remains only as a defensive fallback,
not as expected QA behavior.

TODO before Auth:

1. Add clearer pre-target upload failure observability:
   `localSessionId`, `draftId`, file name, file size, duration, stage, and
   error message.
2. Make request-upload-target/local-file-access failures distinguishable from
   recoverable signed upload/finalize failures.
3. If active upload/processing count limits are needed, design an upload-entry
   guard before submit instead of relying on server 429s mid-upload.
4. Keep ambiguous uploaded-source recovery behavior separate from terminal
   local-only failure.
5. Continue avoiding DB cleanup jobs until upload target semantics are fully
   settled.

## Open Observations Before Upload Reliability P1 - 2026-06-24

These items are intentionally recorded as observations, not confirmed bugs.
They should not block P1 unless they become reproducible or start affecting
upload trust.

### Push Delivery Observability

Observation history:

- Build 69 first upload completed while the app was foregrounded; the in-app
  completion notice was observed.
- Build 69 second upload completed while the app was closed/backgrounded; the
  user did not clearly see an OS Push notification.
- Re-entering the app showed the Moment completed normally.
- DB state showed completed Moment, completed AnalysisJob, EvidenceResult, and
  an enabled Expo push token for the user.
- Build 73 missed Push because the anonymous user's push token registration
  happened after analysis completion. Render loaded `tokenCount=0` and logged
  `analysis_push_skipped_no_tokens`.
- Build 74 confirmed Push delivery after registration timing was fixed. Render
  logs showed `tokenCount: 1`, send started, Expo ticket result `okCount: 1`,
  `errorCount: 0`, and a ticket id.

Current judgment:

The Build 73 issue was a registration timing bug, not a confirmed Expo/APNs
delivery failure. Build 74 resolves the immediate Push QA blocker. The current
backend now logs enough Render-side lifecycle information to distinguish:
tokens missing, send started, ticket accepted, and ticket error.

Priority:

Not a current Auth Phase 2 blocker. Persisted push ticket / receipt tracking is
P2 observability only.

P2 implementation update, 2026-06-24:

Push delivery observability now has a minimum persistent path without changing
the delivery behavior:

- `supabase/phase12_push_delivery_attempts.sql` adds
  `analysis_push_delivery_attempts`.
- Analysis completion Push now loads all of the user's device token rows, not
  only enabled rows, so it can distinguish:
  - no registered tokens;
  - disabled-token-only users;
  - enabled token count;
  - invalid token rows.
- Expo ticket results are stored with `device_push_tokens.id` and masked token
  values only. Raw Expo push tokens are not duplicated into the observability
  table.
- `DeviceNotRegistered` from ticket or receipt details disables the matching
  token row.
- Receipt checks are intentionally manual/internal first through
  `POST /api/push-receipts/check-pending`; no scheduler has been introduced.

This is still observability, not a Push redesign. The send payload and
foreground/background notification policy remain unchanged.

Smoke QA closeout:

- `receipt_ok` confirmed with a real enabled iOS token.
- `ticket_error` confirmed with a fake Expo token returning
  `DeviceNotRegistered`; the matching token row was set to `enabled=false`.
- `skipped_disabled_only`, `skipped_no_tokens`, and
  `skipped_no_valid_tokens` were confirmed with controlled smoke rows.
- Expo ticket/receipt error messages and details are masked before persistence
  because Expo can echo a raw token in error payloads.
- The intended current receipt-check mechanism is the internal/dev endpoint
  `POST /api/push-receipts/check-pending`.

Remaining later item:

Do not add a scheduler yet. Automatic receipt polling, retention policy, and
operator dashboards/alerts remain future operational work after manual
internal/dev checks prove useful.

Recheck condition:

If background completed analyses repeatedly produce no visible OS Push while
Render logs show `okCount > 0`, add persisted push delivery diagnostics or
query Expo receipts.

### List Reflection Timing

Observation:

- Build 68: A reflected in the list slightly later; B reflected immediately.
- Build 69: A and B both reflected immediately.
- In both builds, Home/Video/Detail eventually converged correctly.

Current judgment:

Not classified as a bug. The cause is unconfirmed, but convergence is normal
and the behavior was not reproduced in Build 69.

Priority:

P2 observation only.

Recheck condition:

Revisit if delayed reflection becomes consistent, affects user trust, or causes
Home/Video/Detail divergence after upload success, Push, or Realtime events.

## Upload Reliability P1 - Failure Outcome Matrix - 2026-06-24

Purpose:

Build 68 fixed the P0 false failure Alert issue. Build 69 names the previously
implicit recovery states without changing behavior:

- `remote_reconcile_pending`
- `recoverable_orphan`

The following matrix records the current Build 68/69 behavior as the source of
truth. It is not a new reducer/state-machine implementation.

### Failure Outcome Matrix

| Case | Stage | Upload ID | Storage path | Remote Moment | Remote refetch | Final state | Alert | Recovery | Reconciliation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Upload target request fails before target exists | `request_upload_target` | no | no | no | not attempted | `target_not_issued` | allowed | no | no |
| True local file access failure | `local_video_access` | usually no | usually no | no | may run, usually unmatched | `local_only_failure` | allowed | no | limited |
| Direct upload fails before fallback | `upload` / direct upload stage | maybe | maybe | no | first-page refetch | `remote_reconcile_pending` or `recoverable_orphan` | suppressed | if target context exists | yes |
| Finalize timeout/failure after target | `finalize` / `stored_moment` | yes | yes | no | first-page refetch | `recoverable_orphan` | suppressed | yes | yes |
| Multipart fallback failure/timeout | `fallback_upload` | maybe/no | maybe/no | no | first-page refetch | `remote_reconcile_pending` | suppressed | if target context exists | yes |
| Upload target exists but no remote Moment yet | any post-target stage | yes | usually yes | no | unmatched | `recoverable_orphan` | suppressed | yes | yes |
| Remote Moment match succeeds | any post-target stage | maybe | maybe | yes | matched | remote success | suppressed | complete | complete |
| Remote Moment already linked locally | any stage | any | any | yes | not required | remote success | suppressed | complete | complete |
| Source uploaded but finalize response unclear | `finalize` / `stored_moment` | yes | yes | no | pending | `recoverable_orphan` | suppressed | yes | yes |
| Local optimistic session only | pre-target/local-only | no | no | no | unmatched after TTL | `local_only_failure` -> `upload_failed` | limited | no | expires |
| Failure while app inactive | any stage | any | any | any | stage-dependent | pending/suppressed | suppressed | stage-dependent | stage-dependent |

### Confirmed Alert Policy

- Show an Alert only when the failure is terminal enough for the user to act.
- Suppress Alerts for `remote_reconcile_pending` and `recoverable_orphan`.
- Suppress Alerts for `fallback_upload`, even when `uploadId` is missing,
  because fallback failure is ambiguous and may still converge remotely.
- Suppress Alerts when a remote Moment already exists or can be found through
  `/api/moments` first-page reconciliation.
- Allow Alerts for pre-target `request_upload_target` failure and true local
  file access failure.

### Ambiguous Cases

1. `request_upload_target` failure is currently Alert-eligible, but a transient
   network failure before target issuance may still be recoverable. P1 should
   decide whether this remains terminal or becomes a retry/backoff state.
2. `local_video_access` currently includes some messages that can also be
   fallback/timeout related. The policy should separate true local URI/file
   access failure from ambiguous network/fallback timeout.
3. `uploadId` exists but `storagePath` is missing. This is not a full
   `recoverable_orphan` because finalize recovery needs bucket/provider/path.
   Define whether this is `remote_reconcile_pending`, a partial target context,
   or terminal after TTL.
4. `upload_targets.status=failed` can coexist with a successful multipart
   fallback Moment. User outcome is success, but upload target observability can
   look failed. This is a tracking semantics issue, not a user-facing P1
   blocker.

### P1 Policy Decisions Remaining

Before closing Upload Reliability P1, decide:

1. Whether `request_upload_target` failure remains immediately Alert-eligible.
2. The exact definition of true `local_only_failure`.
3. The minimum required fields for `recoverable_orphan`
   (`uploadId`, `storagePath`, `storageProvider`, `storageBucket`).
4. The terminal `upload_failed` criteria:
   - remote refetch unmatched after retry,
   - recovery TTL expired,
   - local-only TTL expired,
   - true local file access failure.
5. Whether terminal user messaging should collapse toward a single
   network-oriented message such as "네트워크가 끊어졌습니다".

### P2 Items

- Persist or query Expo Push ticket/receipt diagnostics if background Push
  delivery remains unclear.
- Clean up `upload_targets` status semantics when Direct Upload fails but
  multipart fallback succeeds.
- Design pre-upload CTA gating if the product later limits active uploads or
  active processing count.
- Consider a fuller reducer/state-machine only after P1 policy names and
  outcomes are stable.

## Upload Reliability P1 Closeout - 2026-06-24

Problem:

Upload Reliability P0 fixed the user-facing false failure Alert, but the code
still expressed recovery and reconciliation through scattered conditions. That
made it too easy for future changes to accidentally treat recoverable upload
states as terminal failures again.

Why it mattered:

The app's upload path is the product trust boundary. A technically successful
server-side upload/analysis that appears as a failed upload in the app is worse
than a slow upload because it teaches the user not to trust the system.

Options:

1. Introduce a full reducer/state machine immediately.
2. Keep the P0 patch and move on.
3. Minimally name the recovery states, document the failure outcome matrix, and
   defer larger state-machine refactoring until there is evidence it is needed.

Decision:

Choose option 3. P1 should be small and explicit:

- name `remote_reconcile_pending`;
- name `recoverable_orphan`;
- keep the existing runtime behavior;
- document which failures may show an Alert and which must remain quiet.

Implementation:

- Build 68: false failure Alerts from ambiguous fallback failures are
  suppressed.
- Build 69: recovery state classification is explicit in code without adding a
  reducer.
- The Failure Outcome Matrix above records the current source-of-truth policy.
- Push and list reflection observations are recorded as open observations, not
  blockers.

Result:

Upload Reliability P1 is closed for internal QA. The current accepted behavior:

- target pre-issue failures and true local file failures may be user-visible;
- `fallback_upload` and post-target failures are not immediately user-visible;
- remote reconciliation can suppress failure;
- `recoverable_orphan` remains eligible for finalize recovery;
- Home, Video, and Detail converge through `/api/moments`.

Insight:

The highest-value reliability improvement was not adding more UI or more
polling. It was separating terminal user-visible failure from recoverable
intermediate states. A full state-machine reducer is still optional, not a P1
requirement.

P2 handoff:

- Push delivery observability: persist Expo ticket/receipt results or add a
  separate diagnostics path if background Push remains uncertain.
- Upload target semantics: make `upload_targets` reflect final user outcome
  when Direct Upload fails but multipart fallback succeeds.
- Upload entry gating: if the app introduces an active upload/processing limit,
  block before upload starts rather than through mid-flow 429s.
- Terminal messaging: collapse upload failure copy toward a minimal
  network-oriented message only after terminal policy is fully stable.
- Full reducer/state machine: revisit only if future changes again produce
  scattered transition logic.

Next candidate work:

Auth / Ownership may resume after this closeout, unless a fresh Upload
Reliability regression appears in QA.

## Part 1 Final Wrap-Up / Build 55 Diagnostics - 2026-06-23

Part 1 Upload Experience is closed for single-user internal QA. Build 55 is the
current wrap-up build and should be treated as a diagnostics build, not as a
new feature build.

What Build 55 adds:

- Render log before `/api/moments/from-uploaded-source` response:
  `uploaded_source_finalize_response_sent`.
- App log after direct finalize response parsing:
  `direct_finalize_success`.
- App direct skip/failure/empty-result markers that state fallback will run.
- App multipart fallback boundary logs:
  `fallback_started` and `fallback_success`.

Why this exists:

Recent investigation found cases where `upload_targets` reached `finalized`
but the final Moment path appeared to be multipart-style. The code path was not
changed at closeout because the product baseline is otherwise stable. Instead,
Build 55 creates enough telemetry to determine whether direct finalize really
returned successfully, whether the FE interpreted it correctly, and whether
fallback still ran.

Next TODO order:

1. Auth / Ownership.
2. Private/user-scoped Realtime after Auth.
3. Thumbnail Persistence.
4. AI Calibration.
5. Compression Measurement / upload optimization.

## State Sync / Polling Removal - 2026-06-23

Problem:

Once Video became a Server Archive Source, state could not rely on the global
session cache alone. Build 52 showed that upload success, Push, Realtime,
foreground refresh, active tab state, and polling needed a clear invalidation
policy before Auth / Ownership work.

Decision:

Build 53 established the invalidation policy, and the follow-up removed the
remaining active Moment polling:

- Upload success is the primary invalidation point and refetches
  `/api/moments` first page.
- The first page updates global sessions and Video Archive first-page source.
- Realtime, Push response, and foreground refresh are event/fallback refresh
  paths.
- Active moment polling is removed.
- `moment_updated` Broadcast covers queued/processing/completed/failed status
  transitions as a refetch trigger.

Current fallback:

Foreground refresh and Push response remain the non-Realtime fallbacks. The app
does not run interval polling for queued/processing Moments.

Realtime event shape:

A single server Broadcast event named `moment_updated` is enough for the current
Part 1 state sync model if it fires for:

- Moment created/finalized after upload.
- Analysis queued/processing/completed/failed.
- Moment deleted should use the same pattern when delete-specific realtime
  feedback becomes necessary; current delete UX already removes local state
  after the server delete succeeds.

The app should treat `moment_updated` as an invalidation trigger only. It
should not merge event payloads directly; `/api/moments` remains the source of
truth. Build 54 confirmed active app completion without polling. After Auth,
move this public MVP channel to a scoped/private channel.

## Direct Upload Finalize Latency - 2026-06-23

Problem:

Users can understand Gemini taking about a minute, but the wait after the
Direct Upload byte progress reaches 100% still feels like an extra backend
pause. This is not the AI inference phase; it is the finalize phase before the
app receives the server Moment/AnalysisJob response.

Current flow:

1. App uploads the video directly to Supabase Storage.
2. App calls `POST /api/moments/from-uploaded-source`.
3. Render validates provider/bucket/path/mime type.
4. Render inspects the Storage object.
5. Render downloads the uploaded source video from Storage.
6. Render compares downloaded file size with the draft file size.
7. Render creates the Moment.
8. Render creates and links the AnalysisJob.
9. Render marks `upload_targets.status=finalized`.
10. Render responds to the app.

Likely bottleneck:

The full Storage download/arrayBuffer during finalize is the most suspicious
2-4 second cost. It is code structure, not primarily AI latency. Render plan and
network distance can amplify it, but the backend currently asks Storage for the
whole source video before responding.

Recommended investigation:

- Check whether Supabase Storage metadata can provide reliable object size and
  content type without downloading the object.
- If metadata is reliable, make finalize perform metadata validation only,
  create Moment/AnalysisJob, and return faster.
- Move the full video download to the asynchronous analysis worker path, where
  it is already expected that the server needs video bytes for Gemini.
- Keep client API shape stable if possible; this should likely be a backend-only
  optimization.

## Part 1 Upload Experience Closeout - 2026-06-22

Problem:

Part 1's risk was not only upload failure. The larger risk was shipping a flow
where upload, analysis, result restore, Push, Realtime, and completion feedback
all technically existed but did not feel like one coherent mobile experience.

Why it mattered:

Upload is the front door of the product. If the user cannot tell whether the
video is still uploading, whether analysis has moved server-side, or whether a
result has completed while the app is active, then later AI Calibration work
will not repair the trust problem.

Decision:

Part 1 is closed for single-user internal QA with the following boundary:

```text
Direct Upload preferred
+ multipart fallback retained
+ /api/moments source of truth
+ Push for background notification
+ Realtime Broadcast for active refresh
+ in-app banner for active completion awareness
```

Local Draft Resume is removed. Future draft work must be server/upload-session
based, not a persisted `file://` URI retry.

Implementation:

- UploadScreen keeps the user in flow until upload/finalize completes.
- Direct Upload uses signed URL and `FileSystem.uploadAsync`.
- Real upload percentage is shown only during actual file transfer.
- Boot Loading and Empty State are separated.
- Result sync uses `/api/moments`; Realtime payloads trigger refresh only.
- In-app completion banner appears after local state reflects completed.

Result:

Part 1 is acceptable for founder/internal single-user QA. It is not an
external-user release baseline until ownership and cleanup boundaries are fixed.

Remaining risks:

- Auth/User Ownership: Part 1 blocker for external users.
- `upload_targets` semantics: Part 2 cleanup prerequisite. A failed Direct
  Upload followed by successful multipart fallback can leave a failed target
  even though the user upload succeeded.
- Direct Upload sample size: continue measuring direct vs fallback outcomes.
- Realtime privacy: public Broadcast is internal QA MVP only.

Part 2 TODOs:

1. Server Draft / upload session.
2. Upload target / orphan cleanup policy.
3. Auth and user ownership.
4. Realtime private/scoped channel.
5. Push deep link to Moment Detail.
6. Upload pre-processing investigation: Instagram/TikTok-style client
   re-encoding, resolution downscale, bitrate tuning, proxy video generation,
   and AI-analysis quality impact.
7. Source cleanup monitoring and retry policy.
8. AI Calibration after upload experience remains stable.

## Part 2 P1 - Moment List Pagination / Infinite Scroll

Problem:

The Moment archive still needs a scalable UI path. Cursor pagination groundwork
exists, but the first Video `FlatList` / infinite scroll implementation caused
launch crashes in Build 41 and Build 42, so Build 43 rolled back only the
Video archive scene to `ScrollView + map()`.

Target architecture:

- Use cursor pagination for Moment list reads.
- Base the cursor on stable descending archive order:
  `occurred_at desc` plus `id desc`.
- Home should read or derive only the latest N Moments needed for dashboard
  sections.
- Video should eventually become a paginated archive, but do not reintroduce a
  mounted `FlatList` scene inside the current pager without isolated QA.
- Detail should keep using the selected Moment payload initially, while leaving
  room for a future single-Moment fetch.

Implementation order:

1. Add `limit` and `cursor` support to `/api/moments`.
2. Return `nextCursor` and `hasMore`.
3. Extend the app `listMoments` wrapper with pagination options.
4. Keep Build 43 stable Video rendering while the crash cause is investigated.
5. Re-attempt infinite scroll through one of these safer paths:
   - lazy-mount the Video scene after first render;
   - move Video to route-backed Bottom Tabs before retrying;
   - prototype FlashList or FlatList outside the pager scene;
   - keep `ScrollView` and use server pagination only for refresh/search
     boundaries until the archive size forces a virtualized list.
6. Update refresh policy:
   - Boot loads the first page.
   - Foreground refreshes the first page silently.
   - Push response can refresh/fetch the target Moment instead of the entire
     archive.
   - Realtime completion should upsert the affected Moment or refresh the first
     page, not force a full archive reload.

Risks:

- Partial pages can expose merge bugs that whole-list refresh currently hides.
- Completed remote state must still win over local queued/processing state.
- Deletion can create gaps in the loaded page and may require a follow-up page
  fill.
- Future date and trick filters should be implemented as server-side query
  filters, not client-side filtering over all Moments.

Build 43 stability note:

- Build 41: pagination plus Video `FlatList` / infinite scroll launched and the
  app crashed immediately.
- Build 42: removed `removeClippedSubviews`, but launch crash remained.
- Build 43: rolled back the Video `FlatList` scene to `ScrollView + map()`;
  server cursor API/helper and Boot first-page policy stayed in place.
- Build 43 QA passed launch, Home, Video, Pager/Haptic, Upload,
  Push/Realtime, and deletion.
- Treat infinite scroll as Part 2 follow-up, not as part of the current stable
  baseline.

Build 48 pagination graduation note:

The infinite scroll work has been re-attempted in
`prototype/video-infinite-scroll-safe` and should now be evaluated as Video
Archive Source work, not QA-only code.

- Build 48 uses page size 20.
- Video first-entry loading shows a spinner instead of an empty-feeling screen.
- Video owns archive paged order through `videoArchiveSessionIds` and cursor
  state.
- Global sessions remain the cache/detail source for Home, Upload, Push,
  Realtime, and Detail.

Architecture decision:

- Home = Global Session Cache.
- Video = Server Archive Source.
- Detail = Cache + Server.

Graduation condition:

- Physical iPhone confirms `20 -> 40 -> 60`.
- Duplicate IDs = 0.
- Missing IDs = 0.
- Stable order by `occurred_at desc` plus `id desc`.
- Upload, Push, Realtime, Detail, and deletion remain unaffected.

Remaining technical debt after graduation:

- Extract Video Archive Source into a dedicated hook only after graduation QA,
  not before.
- Keep date/trick filters server-side when they are introduced.
- Add single-Moment fetch support before Push deep link becomes product work.

Priority after pagination graduation:

The Part 2 priority order should become:

1. Auth / Ownership.
2. Compression Measurement.
3. Unread Analysis Badge.
4. Push Deep Link.

Decision record:

- Problem: Moment archive scale requires pagination, but the first UI
  virtualization attempt destabilized launch.
- Cause: suspected `FlatList` scene mounted inside TabView/PagerView; exact
  stack unavailable.
- Options: full rollback, keep crashing baseline, or keep cursor API while
  rolling back only the risky UI scene.
- Decision: keep cursor API/helper and rollback Video `FlatList` UI.
- Result: Build 43 passed QA and is the stable Part 2 entry baseline.
- TODO: retry through lazy mount, route-backed tabs, FlashList prototype, or
  ScrollView-plus-server-pagination boundaries.

Cursor Pagination rationale:

- Problem: full-list reads will not scale to hundreds/thousands of Moments.
- Cause: future date/trick filters and growth history require stable server
  ordering and queryable windows.
- Options: offset, cursor, or full-list client filtering.
- Decision: cursor pagination with `occurred_at desc` plus `id desc`.
- Result: better stability under inserts/deletes and future filters than
  offset-based paging.

## Part 2 P2 - Video Compression / Upload Optimization

Problem:

Current upload sends the original selected video bytes. This preserves analysis
quality, but it can increase upload time, mobile network use, Supabase Storage
cost, and user friction as ASJ grows.

Related near-term UX guard:

`Upload File Handling Policy P1` is in place as of 2026-06-27. The app now
validates the selected video before UploadScreen when possible, and the backend
is the authority for the final file that will actually be uploaded:

- max final upload file size: 30MB;
- max final upload duration: 15 seconds;
- allowed MIME types: MP4/MOV family;
- backend error codes: `too_large`, `too_long`, `unsupported_type`,
  `empty_file`, `invalid_duration`.

Important policy decision: the backend does not need to know whether the file is
the original camera video or a future FE-compressed/downsized file. If FE
compression is implemented later, it must happen before requesting a signed
upload URL, and the signed upload request must send the final file's size,
duration, and MIME type.

Cause:

Direct Upload validates the local file and sends it through
`FileSystem.uploadAsync` as binary content. The app records metadata such as
file size, MIME type, and duration, but it does not re-encode, resize, compress,
or generate a separate analysis proxy before upload.

Options:

- Keep original-only upload.
- Compress before upload on device.
- Upload original first and compress on the server.
- Use a hybrid: only large videos get conservative client optimization, while
  the server can later generate playback/share proxies.

Expo / React Native / iOS standalone compression investigation, 2026-06-27:

- Expo SDK 54's current built-in upload stack can pick videos and report
  metadata, but ASJ does not currently have an Expo-managed video compression
  API in use.
- `react-native-compressor` is the most plausible client-side candidate to
  investigate later because it targets image/video compression on React Native,
  but it is a native dependency. Expect a config plugin/prebuild/dev-client or
  standalone EAS build path rather than Expo Go-only validation.
- FFmpeg-based mobile options are powerful but heavier and higher-risk for app
  size, native build complexity, iOS performance, and processing time.
- Server-side compression remains possible, but it does not solve the initial
  upload bandwidth/wait problem because the original bytes would still need to
  reach the server first.
- Required future checks before implementation: output file URI readability,
  MIME type, duration, file size re-read after compression, processing time on
  real iPhone, cancellation/failure copy, and whether compression preserves
  enough visual detail for later AI quality validation.
- Expo Go should not be considered enough for a real compression POC if the
  candidate requires native modules. A standalone/dev-client build would likely
  be needed.

POC implementation status, 2026-06-27:

- `react-native-compressor@2.0.2` and `react-native-nitro-modules@0.35.10`
  are installed.
- `app.json` includes the `react-native-compressor` config plugin.
- `src/features/sessions/uploadCompressionPoc.ts` dynamically imports
  `react-native-compressor` so the native dependency is only touched when the
  QA-only POC action is pressed.
- UploadScreen shows the QA/debug-gated action "QA 압축 메타 확인" after a video is
  selected. Build 88 hid it because the first gate used `__DEV__` only; the gate
  now also allows `EXPO_PUBLIC_ENABLE_DEBUG_VIEWER=true` or
  `EXPO_PUBLIC_ENABLE_UPLOAD_COMPRESSION_POC=true` for preview/internal QA.
- The POC records:
  - original file size;
  - compressed file size;
  - reduction ratio;
  - duration carried into final metadata;
  - inferred uploadable MIME type;
  - compressed URI;
  - example `POST /api/video-upload-targets` payload for the compressed final
    file.
- It intentionally does not submit the upload target request, upload to Storage,
  run analysis, or call paid AI.
- `POST /api/video-upload-targets` now accepts optional sanitized
  `uploadProcessing` metadata for observation/debug response only. Policy
  decisions still use only the final file `fileSize`, `durationMs`, and
  `mimeType`; no raw URI/token values are accepted and the metadata is not
  persisted to DB in this step.
- Build 89 real-device QA succeeded: the QA action was visible in the
  preview/internal build, compression executed, compressed file size decreased,
  duration / MIME / compressed URI were visible, and the upload-target payload
  plus sanitized `uploadProcessing` metadata reflected the compressed final file.
- Status: POC successful and promoted into the normal upload submit path as a
  conservative first pass. The app now prepares the final upload file before
  requesting `/api/video-upload-targets`.
- Automatic rule: 20MB or smaller clips upload as the original. Clips over 20MB
  attempt local optimization before upload target creation. The current picker and
  backend policy still cap final uploads at 30MB / 15 seconds.
- Compression settings were softened from the Build 89 auto POC: normal upload
  uses manual compression with `maxSize` 1080 and bitrate 8Mbps.
- Failure policy: if optimization fails, upload the original only when it still
  satisfies the 30MB / 15 seconds / MIME policy. Final file policy violations are
  blocked with the existing user-facing copy.
- The upload target payload uses the final upload file's `fileSize`,
  `durationMs`, and `mimeType`. Optional sanitized `uploadProcessing` metadata
  carries original/compressed size, compression ratio, compression duration, and
  source for observation only; backend policy does not use it.
- The QA metadata action remains temporarily available in preview/internal builds
  and hidden from production by default.
- Build 90 real-device QA/read-only follow-up verified the promoted compression
  flow with a real iPhone clip: an approximately 25MB original became
  `FullSizeRender.compressed.mp4` with final stored metadata of 12,776,723 bytes,
  12.83 seconds, and `video/mp4`; the upload target finalized and Gemini
  analysis completed. This is technical upload/metadata/analysis-continuation
  validation, not AI quality acceptance.
- Remaining observability gap: `uploadProcessing` is sanitized and returned on
  the upload-target response/debug path, but is not persisted to DB. If later
  operations need after-the-fact original/compressed ratio auditing, add a small
  upload observability persistence path instead of changing backend policy
  semantics.
- Upload Selection Size Validation Fix is complete in code. Source clips over
  30MB are no longer blocked only because of source size at picker time; the
  picker keeps basic video / URI / positive file size / positive duration / MIME
  checks plus the 15 second duration limit. The 30MB limit is enforced after
  optimization on the final upload file.
- Build 91 real-device QA passed for Upload Unified Progress UX, Upload
  Selection Size Validation Fix, Compression Upload Flow P1, Video no-records
  timeout UI fix, and compressed-video upload through completed analysis.
- Media Preview Policy P1 is implemented and tightened after Build 92 QA.
  Read-only DB/Storage checks showed recent completed Moments with deleted
  source video Storage objects, existing `moment-thumbnails` objects, and local
  `file:` `source_video_uri` values. The likely playable source was the
  app-local compressed temp / persisted video asset. The tightened policy keeps
  the original local video as the user-facing asset when available, prevents
  completed + thumbnail + compressed local asset from being selected as Detail
  playback, and best-effort deletes newly created compressed upload temp files
  after a server Moment is successfully created.
- Media Preview Policy P1 still does not migrate old AsyncStorage state, change
  Supabase Storage policy, or add remote video playback. Standalone iPhone QA is
  still needed later, but it can be bundled into the next relevant build rather
  than run immediately.
- Media / Share UX P1 is implemented as a presentation-only share-ready card in
  Moment Detail. Completed Moments with visible evidence now have a "공유
  미리보기" card below the media area and above the rider-facing analysis card.
  It uses thumbnail, date/session title, rider-facing analysis title,
  confidence label, short summary, up to two confirmed signals, and Wake Board
  branding.
  External sharing/export remains a separate future scope.
- Future Media UX P1 - Detail Media State Polish is implemented on top of Media
  Preview Policy P1. It does not change Home, Video Archive, SharePreviewCard,
  storage cleanup, storage policy, DB schema, or AI analysis.
- Archive Card Visual Hierarchy P1 is implemented as the final pre-AI
  Calibration Media UX polish candidate. Video tab rows now use journal-oriented
  state descriptions without exposing primary trick names, confidence scores,
  raw evidence text, routes, schema, storage, or sharing/export features. The
  remaining Media / Share next steps are image export, native share sheet, or
  ShareResult route after separate product approval.
- Kakao display_name fallback and OAuth Step Reduction Investigation are closed
  for the current pre-AI Calibration scope. Display name sync now includes
  `preferred_username` and `user_name`; OAuth prompt reduction should not bypass
  provider/platform authentication prompts and is only a Store-before-release
  settings review item.
- Visible UI / UX Polish P1 is closed for the current pre-AI Calibration scope.
  It was intentionally limited to copy, primitive visual cues, Detail evidence
  progressive disclosure, and upload debug-surface gating. No new UI system,
  icon library, Auth/DB/API/AI logic, or build was introduced.
- Visible UI / UX Polish P2 is closed for the current pre-AI Calibration scope.
- Icon Library App Chrome pass is closed for the current pre-AI Calibration
  scope. `@expo/vector-icons` / Ionicons is now the selected icon path.
- Theme Mode P1 foundation is closed for the current pre-AI Calibration scope.
  Light/Dark visual rollout remains a separate screen-by-screen adoption task,
  and the System / Light / Dark selector should wait for a Settings/Profile
  surface.

## Render Free Cold Start Watch

Founder observation: the app feels slow mainly on the first open after a long
idle period, then becomes faster on later opens. That pattern fits Render free
cold start better than local app cache alone, but this is not proven.

Build 91 update: the same pattern was observed again. Core upload/compression
flows passed, and after later AI-before-baseline cleanup the Founder decided to
remove the Render free-plan cold-start variable before AI Calibration.

Decision:

- After the current AI-before-baseline build QA, upgrade the Render Web Service
  from Free to Starter ($7/mo) before AI Calibration. The goal is not more CPU
  first; it is to remove the free-plan sleep/cold-start variable while debugging
  upload and analysis behavior.
- Treat Video tab infinite loading as a separate UI state bug; that path has
  already been fixed with delayed/retry state instead of an indefinite loading
  card.
- App code, app env, and EAS build settings should not need to change for this
  plan upgrade. Render may restart the service once when the instance type
  changes.

Decision:

Compression is likely needed and now has a conservative first upload-flow
implementation, but broader rollout should still wait for measurement and AI
quality comparison. Action-sports AI analysis depends on visual details such as
edge load, board angle, rope tension, pop, rotation axis, and landing. A stronger
compression MVP could reduce upload cost while silently harming evidence quality.

Measurement requirements:

- Upload file size.
- Video duration.
- Upload time.
- Finalize time.
- Original versus compressed AI result comparison.

Compression guardrails:

- Small or short videos may stay original.
- Large videos are the first compression candidates.
- Do not aggressively lower frame rate.
- Start with a conservative 1080p optimization candidate.

AI quality comparison:

- edge load
- approach
- board angle
- rope tension
- pop
- rotation axis
- landing
- trick identification

Recommended order:

1. Add or collect measurement for current uploads.
2. Define conservative compression presets without enabling them by default.
3. Run original-vs-compressed AI benchmark on representative clips.
4. Decide whether Compression MVP should ship before, alongside, or after Auth
   / Ownership.

Priority:

Compression measurement and benchmark should happen early in Part 2. Production
Compression MVP should wait until the quality tradeoff is known.

## Build 29 Direct Upload Case Study - 2026-06-21

Build 29 is the current upload architecture QA build:

```text
buildNumber: 29
EAS Build: https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/16f8d05e-d375-4539-b9fa-1addbffb0227
build commit: 3e4b26b fix: upload signed source files with file system
```

Problem:

Build 28 reached the correct Direct Upload architecture but failed at finalize.
The Storage object produced by signed upload downloaded as 0 bytes, while the
draft file size was a normal MOV size. The server rejected it with source video
size mismatch before creating a Moment.

Cause:

The unstable point was the client file body: RN/Expo `fetch(file://...).blob()`
combined with Supabase `uploadToSignedUrl` did not reliably upload the actual
MOV bytes. `draft.fileSize` and finalize validation were useful guards, not the
broken pieces.

Investigation:

The team compared `upload_targets.file_size`, downloaded Storage object size,
Moment Storage path, and finalize status. Failed targets showed `failed` with
no `uploaded_at` or `finalized_at`; the object was present but 0 bytes.

Decision:

Do not abandon Direct Upload and do not make multipart the default workaround.
Use a native file upload path while preserving multipart fallback.

Implementation:

- Add `expo-file-system`.
- Check the local file with `FileSystem.getInfoAsync`.
- Fail before signed upload if the local file is missing, 0 bytes, or does not
  match the draft file size.
- Upload the real file body with `FileSystem.uploadAsync` to the signed URL
  using `PUT` and `BINARY_CONTENT`.
- Include `expected` and `actual` byte counts in finalize mismatch errors.

Result:

- Build 29 real-device QA confirmed `upload_targets.status=finalized`.
- `uploaded_at` and `finalized_at` were recorded.
- The latest Moment Storage path used `uploads/{uploadId}`, confirming Direct
  Upload instead of multipart fallback.
- Moment, AnalysisJob, EvidenceResult, Push, restore, and source cleanup all
  worked.
- A roughly 15.8 MB / 8 second MOV took about 8-10 seconds to upload/finalize.
  Treat this as acceptable for now.

Next:

Validate Direct Upload with several more real-device uploads. Local Draft
Resume is removed from the Part 1 path because restored `file://`
`localVideoUri` values may not remain accessible after app restart. The current
UX choice is to keep the rider on the Upload screen until upload completes and
show step-based progress. Future draft work should be server/upload-target
based rather than local URI resume based.

Current product priority:

The immediate priority is not AI result accuracy. It is making the core
upload-to-analysis flow behave like a proper mobile app. Rank work in this
order:

```text
1. Upload structure / UX completion
2. Mobile app screen structure
3. App-native gestures / return flows
4. UX stabilization
5. AI Calibration
```

Upload structure includes the upload-first flow, signed/direct upload
evaluation, upload progress feasibility, blocking overlay, and timing logs.
Screen structure now includes route-backed `MomentDetailScreen` and
`UploadScreen`; `UploadContent` was extracted from the old `UploadSheet` body
so the route can become the future Draft screen without changing upload-first
semantics.
App-native return flows include native stack swipe back, Push tap to the
relevant Moment Detail, and foreground/background restore behavior. UX
stabilization includes Boot Loading, Upload, Delete, Empty/Error states, and
cross-device thumbnail fallback.

AI Calibration remains a later stage. Do not prioritize toeside/heelside, Back
Roll, or other trick-name tuning before the app's upload, screen, lifecycle,
and recovery flows feel stable.

Mobile-first UX development principle:

The Founder may frame requests with web-development analogies, but Action
Sports Journal should be judged as an iOS-first mobile app. For Upload,
Detail, Push, foreground/background refresh, lifecycle behavior, and long
running upload flows, evaluate common mobile app patterns before using
web-style conditional rendering or screen swaps.

Guidelines:

- Prefer app-native navigation and lifecycle patterns when they better match
  the user's expectation.
- Do not treat "the feature works" as complete if the flow feels unlike a
  normal mobile app.
- If a web-style implementation would be simpler but awkward on iPhone, record
  the tradeoff and propose the mobile-first structure.
- Use this principle when deciding whether to keep modal/conditional UI,
  introduce route-backed screens, support gestures, or handle foreground and
  background transitions.

## Priority Groups

### Now

1. Upload structure / UX completion.
2. Upload completion before Moment creation.
3. Upload state and analysis state separation.
4. Signed/direct upload evaluation.
5. Draft Upload Flow architecture.
6. Upload timing logs and progress feasibility.

### Later UX Stage

7. Mobile app screen structure.
8. Moment Detail screen structure.
9. Push notification deep link.
10. Native stack gesture / return behavior.

### Calibration Stage

11. Analysis timing and quality observation data.
12. AI calibration system.

### Stabilization Cleanup

13. Legacy/fallback endpoint cleanup.
14. Thumbnail storage policy.

### Multi-user / Product Stage

15. Auth and user model.

### Long-term Stability

10. Background upload.

## TODO Items

### 1. Upload Completion Before Moment Creation

Problem:

The correct durable-analysis architecture is to create a remote Moment and
AnalysisJob only after the source video has been durably stored.

Why it matters:

If a Moment row exists before the actual source video upload completes, the app
can show an analysis state for a video that the server cannot analyze. This
creates stale queued rows and makes the product feel broken.

Current direction:

```text
app selects video
-> app shows local uploading state
-> server receives source video
-> server writes source video to temporary durable Storage
-> server creates Moment
-> server creates AnalysisJob
-> server starts Gemini analysis
```

Status:

Implemented as the preferred direction through the source-video-first endpoint `POST /api/moments/from-source-video`.
Continue validating this as the default path before creating the next QA build.

Do not regress to:

```text
create Moment first
-> upload source video later
```

except for legacy/fallback paths.

### 2. Upload State and Analysis State Separation

Problem:

The old status model only had:

```text
queued / processing / completed / failed
```

That was not enough because uploading and analysis are different phases.

Decision:

Use app-facing status concepts:

```text
uploading
upload_failed
queued
processing
completed
failed
```

Meaning:

- `uploading`: source video is still being sent to the server. User should not
  close the app yet.
- `upload_failed`: source video did not reach durable input storage. Analysis
  did not start.
- `queued`: upload is complete and analysis has been accepted by the server.
- `processing`: AI analysis is running.
- `completed`: EvidenceResult is ready.
- `failed`: analysis failed after upload was accepted.

DB note:

The persisted Moment status can remain narrower while the app uses additional
UI states. Do not force DB schema changes unless the product needs these states
for cross-device history.

### 3. Moment Detail Screen Structure

Problem:

The app does not currently use a navigation stack. `App.tsx` renders
`HomeScreen` directly, and React Navigation / Expo Router are not installed or
used.

Current screen structure:

- Upload is `UploadSheet`, opened from `HomeScreen` through `isComposerOpen`.
- Detail is `MomentDetailModal`, opened from `HomeScreen` through
  `selectedSessionId`.
- Both are modal/conditional-rendering flows owned by `HomeScreen`, not real
  stack screens.

The Detail screen therefore mixes modal and page behavior. The earlier
edge-swipe dismiss worked mechanically but felt unnatural because the screen
does not behave like a true iOS navigation route.

Decision:

Do not convert to a navigation stack during the Build 22 QA cycle. Keep the
current close/back button, upload overlay, and deletion UX stable while
upload-first behavior is validated.

Longer term, Detail should likely become the first route-backed screen because
it unlocks the highest-value UX improvements:

- native iOS swipe back
- more natural Detail gestures
- Push deep link to a specific Moment Detail
- clearer separation from HomeScreen state

Future candidates:

- Keep current structure and validate Upload overlay first.
- Split HomeScreen state ownership before moving screens.
- Move `MomentDetailModal` toward `MomentDetailScreen` first.
- Connect Push tap / deep link to the route-backed Moment Detail.
- Move Upload toward `UploadScreen` later.
- Evaluate React Navigation or Expo Router after the route model is clear.

Risks if done too early:

- breaking upload-first flow
- breaking remote Moment sync
- breaking deletion sync
- breaking thumbnail fallback
- breaking Push restore / future deep link behavior
- expanding QA scope before Build 22 upload-first validation

Do not patch gestures repeatedly without first deciding the screen model.

Route-backed first pass update:

`MomentDetailScreen` now exists behind React Navigation native stack, while
`MomentDetailContent` is shared with the legacy modal wrapper. The Detail route
explicitly enables horizontal iOS gestures, full-screen gesture handling, and a
transparent native header so the route can behave more like an app-native iOS
screen.

Remaining QA note:

Simulator-based touch verification was inconclusive after the route option
update: button navigation worked, but automated drag input did not reliably
trigger either horizontal swipe back or ordinary vertical scroll. Treat native
swipe back as requiring physical-device QA before calling the Detail route
transition fully complete. Do not add another custom gesture layer unless the
native-stack gesture fails on device.

### 4. Navigation / Instagram UX Direction - Part 1 Skeleton Decision

Decision:

Adopt Instagram-style horizontal swipe between Home, Video, and Growth as the
Part 1 navigation skeleton after real-device prototype QA. Keep Bottom Tabs
visible as explicit navigation; the adopted behavior is Bottom Tabs plus swipe,
not swipe-only navigation.

Product structure:

The current accepted implementation uses `react-native-tab-view` inside
`HomeScreen` while preserving the existing Bottom Tabs. Home, Video, and Growth
should still eventually become real route-backed Bottom Tab Navigator routes.
The current pager adoption validates the product feel, not the final routing
architecture.

What was confirmed:

- Horizontal swipe between Home, Video, and Growth is technically possible.
- The current structure uses `activeTab` inside `HomeScreen`, so a proper
  gesture implementation would require structural changes rather than a small
  visual patch.
- The common app industry standard for top-level areas is bottom tab button
  navigation, so Bottom Tabs plus Stack remains the default architecture
  candidate.
- Instagram UX is a proven user learning model, not only a taste preference.
  Instagram-inflow users may perceive horizontal swipe as "the next screen"
  even when developers classify Home, Video, and Growth as different surfaces.
- Action Sports Journal still has long-term reason to revisit this because
  Instagram inflow, sharing, and media-native expectations are important to the
  product strategy.
- Home / Video / Growth are not one continuous content surface. Home is a
  dashboard, Video is an archive, and Growth is a progression surface.
- ASJ is a record, analysis, and growth app, not primarily a passive media
  consumption app.
- ASJ's product idea can be original while still using validated UX patterns
  where they reduce friction.
- Real-device QA found the pager feel, haptic feedback, and Video List gesture
  guard positive enough to adopt the pager skeleton.

Remaining risks:

- Top-level horizontal swipe can conflict with Detail edge-swipe back,
  vertical scroll, horizontal media rails, and upload-related flows.
- Video List gesture guards reduce accidental row opens, but should keep being
  tested with larger data sets.
- The current implementation is still not paginated and does not use FlatList;
  data-scale work remains a Part 2 TODO.
- The current implementation is not yet route-backed Bottom Tabs.

Where Instagram-style interaction belongs:

- Video tab internal media viewer.
- Previous/next Moment Detail swipe.
- ShareResult / Growth Card preview carousel.
- Instagram share outputs and result-card generation.

Part 2+ structure TODO:

- Introduce route-backed Bottom Tabs for Home / Video / Growth.
- Support Push deep link and tab state restore.
- Design ShareResult screens as first-class routes.
- Prototype Instagram-style gestures first in media-heavy surfaces.
- Add pagination / infinite scroll and FlatList for data-scale safety.

Future experiment:

Future experiments should focus on media-heavy surfaces: Video tab media
viewer, previous/next Moment Detail swipe, ShareResult / Growth Card preview
carousel, and Instagram share outputs. Do not use those experiments to reopen
the Part 1 decision unless real users report navigation confusion.

### Signed / Direct Upload Architecture

Current judgment:

Direct Upload is now the intended default path and was validated once in Build
29. The current Render multipart relay remains as fallback, not the preferred
product path. Multipart still uploads to:

```text
app
-> Render POST /api/moments/from-source-video multipart
-> Render receives file
-> Render uploads to Supabase Storage
-> Moment created
-> AnalysisJob created
-> Gemini analysis
```

Build 23 real-device QA validated the surrounding fallback product flow:

- upload-first structure works,
- blocking Upload Overlay felt natural,
- Push was received,
- completed result restore worked,
- about 18.25 MB / 9 second video produced a perceived upload wait of about
  5-8 seconds.

Decision:

Signed/direct upload is implemented as the default path. Build 29 proved the
`issued -> uploaded -> finalized` happy path once after switching from
`fetch(file://).blob()` to `FileSystem.uploadAsync`. Keep multipart fallback
until repeated device QA confirms the Direct path is stable.

Implemented shape:

```text
app
-> request upload target
-> Render issues signed upload URL / token
-> app uploads directly to Supabase Storage
-> app calls finalize endpoint
-> Render verifies Storage object
-> Moment created
-> AnalysisJob created
-> Gemini analysis
```

Expected endpoints:

```text
POST /api/video-upload-targets
POST /api/moments/from-uploaded-source
```

Advantages:

- reduces Render file relay bandwidth and memory pressure,
- scales better for larger files and concurrent uploads,
- makes upload progress more feasible,
- better matches video upload as a core product capability,
- creates a cleaner path toward resumable upload later.

Remaining requirements:

- orphan object cleanup for uploaded-but-not-finalized files,
- user ownership and path validation,
- file size and content type limits,
- signed URL/token expiry behavior,
- Auth/RLS-backed Storage policy when the project moves beyond single-user QA.

Switching criteria:

Revisit and harden signed/direct upload if any of these repeat:

- 25-50 MB+ videos become common,
- upload wait is frequently over 10 seconds,
- Render memory or bandwidth becomes a bottleneck,
- upload failures increase,
- progress percentage becomes product-critical,
- multi-user or concurrent upload QA starts.

Current tracking state:

`supabase/phase10_upload_targets.sql` adds `upload_targets` for target
lifecycle tracking:

```text
issued
-> uploaded
-> finalized
```

Failures are recorded as `failed`. Orphan candidates are old rows in `issued`,
`uploaded`, or `failed`. Automatic deletion is intentionally not implemented
yet. The phase10 migration is applied remotely and verified with an empty
`upload_targets` table before the next build. Server tracking is best-effort so
tracking issues should log a warning and should not block upload.

Recommended order:

1. Repeat `issued -> uploaded -> finalized` tracking during device QA.
2. Keep multipart fallback until direct path is validated repeatedly.
3. Record upload timing and path for several file sizes.
4. Add cleanup automation only after orphan candidates are observable.

### Pre-upload Video Optimization Review

Status:

This is a future product/architecture investigation, not an active bug fix.
Build 29 QA showed that Direct Upload can work end-to-end. A roughly 15.8 MB /
8 second MOV took about 8-10 seconds to upload/finalize, then Gemini analysis
continued server-side. Treat that as acceptable for now, not as a regression.

Why this matters later:

Action Sports Journal's core action is video upload -> AI analysis. Even if the
current Direct Upload path is stable, the product should eventually evaluate
Instagram/TikTok-style client-side upload optimization so riders do not feel
blocked by large source videos.

Investigation items:

- whether client-side re-encoding before upload is practical,
- resolution downscale strategies,
- bitrate optimization strategies,
- thumbnail and proxy-video generation,
- keeping the original locally while uploading a lighter analysis copy,
- whether a lightweight analysis copy harms Gemini evidence extraction quality,
- Expo / React Native implementation options,
- expected size reduction and upload-time savings by file size and duration.

Important guardrails:

- Do not implement this before Direct Upload stability is confirmed over
  repeated real-device QA.
- Do not add quick MVP compression that silently harms analysis quality.
- Evaluate AI accuracy impact together with UX speed impact.
- Keep this as a final-product investigation, not a temporary workaround.

### Upload Draft Flow Architecture

Product need:

The Level 1 product goal is that even one uploaded video behaves like a proper
mobile app. The app should keep the rider informed during the pre-analysis
upload phase rather than making upload feel frozen. Long-lived local resume is
not currently reliable because selected `file://` videos may not remain
accessible after app restart.

Current decision:

Local Draft Resume is removed from the current Part 1 flow. The app keeps a
short-lived in-memory `UploadDraft` only while the Upload screen is open. Future
draft/resume behavior should be built around server-side upload sessions or
upload targets, not persisted local video URIs.

Current implementation:

- `UploadDraft` contains `draftId`, local video URI, file metadata, local
  thumbnail URI, timestamps, and `selected / ready_to_upload / uploading /
  upload_failed` status.
- Selecting a video creates a local draft and navigates to `UploadScreen`.
- Drafts are not persisted for app re-entry.
- App re-entry no longer prompts to resume a previous local draft.
- `UploadScreen` renders from the current selected video / in-memory draft.
- Upload progress is stage-based rather than fake percent-based.
- Upload success clears the draft.
- Upload failure stores `upload_failed` in memory and keeps retry possible while
  the screen is active.

Concept boundaries:

- Draft: the user's selected upload work in progress.
- Signed/direct upload: the technical method for sending a Draft's source video
  to Storage.
- Finalize endpoint: the server step that turns an uploaded Draft source into a
  Moment and AnalysisJob.
- Moment: the server-side object that exists only after upload is complete and
  the video is analysis-ready.

Recommended long-term flow:

```text
select video
-> create in-memory upload draft
-> keep UploadScreen open
-> show stage-based progress
-> signed/direct upload
-> finalize endpoint
-> Moment created
-> AnalysisJob created
-> Gemini analysis starts
```

Fallback flow:

```text
local draft
-> Render multipart /api/moments/from-source-video
-> Moment created
-> AnalysisJob created
-> Gemini analysis starts
```

Future multi-user assumptions:

Do not implement Auth/User now, but design Draft around future ownership:

- `draftId`: local app UUID.
- `uploadId`: server-issued upload target id.
- future `userId`: owner.
- `storagePath`: future user-scoped path.
- ownership: finalize must verify that the upload target belongs to the user.
- orphan cleanup: uploaded-but-not-finalized objects must expire or be removed.

Preferred path shape:

```text
users/{userId}/uploads/{uploadId}/source.mov
```

Remaining risks:

- local video URI persistence after app relaunch needs verification,
- Draft and remote Moment boundaries can become confusing,
- signed/direct upload and finalize need device QA,
- phase10 upload target tracking needs device QA before full confidence,
- orphan cleanup automation is still missing,
- retry behavior after `upload_failed` needs real-device QA.

Recommended order:

1. Device QA the local Draft flow without DB auto-reset.
2. Verify draft resume prompt after app restart.
3. Verify `upload_failed` retry behavior.
4. Collect upload timing data.
5. Verify phase10 tracking during direct upload QA.
6. Implement orphan cleanup.
7. Strengthen ownership during Auth/RLS work.

### 4. Analysis Timing and Quality Observation Data

Problem:

AI analysis time and quality vary. The project needs evidence before tuning
infrastructure, prompts, validators, or copy.

Record for real videos:

- video length
- file size
- queued -> started duration
- started -> completed duration
- AI candidate
- observed facts summary
- rider-expected trick/context
- whether result felt trustworthy
- whether push arrived
- whether restore felt immediate

Use this data to distinguish:

- Storage upload bottleneck
- Gemini file processing bottleneck
- Gemini inference bottleneck
- Render/backend bottleneck
- app restore/polling UX bottleneck

#### Upload Timing Log Collection Procedure

Purpose:

The next real-device upload QA should separate the time spent in client upload,
server-side Storage write, Moment creation, and AnalysisJob creation. Do not
guess the bottleneck from the total time alone.

Client log location:

```text
src/features/sessions/HomeScreen.tsx
```

Filter for:

```text
[upload_timing]
```

Expected client events:

- `upload_start`: emitted immediately before `createMomentFromSourceVideo`.
- `upload_success`: emitted after the server response resolves and before the
  Upload screen closes.
- `upload_failure`: emitted when the upload promise rejects or returns no stored
  Moment.

Client fields to record:

- `localSessionId`
- `fileSize`
- `elapsedMs`
- `momentId` if available
- `nextMomentStatus` if available
- failure `reason` if available

Server log location:

```text
dev-server/index.ts
```

Filter Render logs for:

```text
[source_video_timing]
```

Expected server events:

- `from_source_video_request_received`: request reached `/api/moments/from-source-video`.
- `multipart_file_received`: multer finished receiving the uploaded file.
- `storage_upload_completed`: Supabase Storage write completed.
- `moment_inserted`: `moments` row was created.
- `analysis_job_queued`: `analysis_jobs` row was created and linked to Storage input.
- `response_sent`: server response returned to the app.

Server fields to record:

- `elapsedMs`
- `fileSize`
- `mimeType`
- `storagePath`
- `momentId`
- `analysisJobId`

Derived measurements:

- Real app wait time: client `upload_success.elapsedMs`.
- Client-to-server transfer time: server `multipart_file_received.elapsedMs`.
- Storage save time: `storage_upload_completed.elapsedMs - multipart_file_received.elapsedMs`.
- Moment creation time: `moment_inserted.elapsedMs - storage_upload_completed.elapsedMs`.
- Job creation time: `analysis_job_queued.elapsedMs - moment_inserted.elapsedMs`.
- Server response overhead: `response_sent.elapsedMs - analysis_job_queued.elapsedMs`.

Build 23 QA timing note:

The first Build 23 real-device QA pass produced useful directional estimates,
but not final bottleneck proof. The tested video was about 18.25 MB and about 9
seconds long. User-perceived upload wait was about 5-8 seconds. DB timestamps
and user observation suggest:

- Upload start estimate to server file/storage flow entry: about 5.2 seconds.
- Server Storage/Moment creation work: about 3.9 seconds.
- Job queue/start: within roughly 1 second.
- Gemini `started_at -> completed_at`: about 50.7 seconds.
- Push was received after more than 1 minute and before 3 minutes by user
  perception.

This is enough to say the Build 23 Upload Overlay is acceptable for now. It is
not enough to add a progress bar, switch to direct upload, or redesign the
upload architecture. Before making those changes, collect the actual iPhone
`[upload_timing]` and Render Dashboard `[source_video_timing]` lines for the
same upload.

QA procedure:

1. Use a physical iPhone, not simulator upload, unless explicitly requested.
2. Upload one real wakeboard video.
3. Capture the app log lines containing `[upload_timing]`.
4. Capture Render log lines containing `[source_video_timing]` for the same
   upload.
5. Match logs by `momentId`, `analysisJobId`, approximate timestamp, and file
   size.
6. Record the derived measurements before changing upload architecture,
   progress UI, or server behavior.

Do not:

- infer progress percentages from these logs
- auto-clear DB rows before timing review
- use one single slow upload as enough evidence for architectural change

### 5. AI Calibration System

Problem:

Toeside/heelside, Back Roll, Tantrum, Basic Air, grab, and invert judgments
should not be tuned from one surprising result.

Decision:

Use sample-based calibration. Do not make emotional one-off prompt edits.

Calibration references:

- `docs/EVIDENCE_POSTPROCESSING_CALIBRATION_MATRIX.md`
- `docs/WAKEBOARD_TRICK_TAXONOMY_REFERENCE.md`
- `docs/WAKEBOARD_VALIDATION_MATRIX.md`
- EverEx (`https://www.everex.kr/`) as an adjacent productization reference:
  AI motion analysis -> trustable feedback -> personalized guidance -> progress
  tracking. Treat it as a healthcare/rehab reference, not a direct competitive
  model or product-positioning target for ASJ.

AI Calibration P1 direction:

- First target: TS/HS Evidence(토/힐 사이드 근거 보정), not full trick-name
  accuracy.
- Goal: stabilize Toe-side / Heel-side judgment with confidence and explicit
  evidence before tuning Back Roll, Tantrum, grabs, or broader trick identity.
- Treat MediaPipe Feasibility Spike(미디어파이프 가능성 검증) as a candidate input
  to Motion Evidence Extraction(동작 근거 추출), not as a standalone judge.
- Evaluate MediaPipe on real ASJ wakeboard samples before adoption because
  rider size, water spray, rope/board occlusion, fast rotation, camera shake, and
  blur may make landmarks unreliable.
- If useful, MediaPipe pose/landmark signals can support body orientation,
  shoulder/hip direction, edge approach, takeoff posture, and rotation-initiation
  evidence for Gemini/GPT post-processing or validator logic.
- If landmarks are unstable on actual samples, keep the idea documented but do
  not ship it into the product path.
- Product framing reference: EverEx-like motion-analysis products are useful
  because they make analysis feel trustworthy through evidence, personalization,
  and long-term change tracking. ASJ should adapt that framing to action sports:
  rider moments, trick evidence, growth history, and next-session suggestions.
  Do not copy medical/rehab language or turn ASJ into a healthcare workflow.

Rule:

Only repeated failure patterns across multiple real videos should become prompt,
schema, validator, or KnowledgeRule changes.

### 6. Legacy/Fallback Endpoint Cleanup

Current compatibility paths:

- `/api/moments`
- `/api/moments/:momentId/source-video`
- `/api/moments/:momentId/analyze-stored-video`
- direct multipart evidence upload fallback

Why they exist:

They supported earlier pipeline stages and provide fallback while the
source-video-first path is being validated.

Cleanup direction:

After the source-video-first path is proven stable, decide which endpoints are:

- retained for explicit retry/fallback
- made internal-only
- deprecated
- removed

Do not remove fallback until Build QA confirms uploads, restore, deletion,
push, and Storage cleanup are stable.

### 7. Thumbnail Storage Policy

Policy so far:

- Source video Storage is temporary durable analysis input, not permanent video
  archive storage.
- Local video URI is used for playback when available.
- If local video URI is unavailable, thumbnail plus analysis result is still a
  valid restored state.
- Build 56 prep moves thumbnail fallback toward durable preview assets:
  app-generated thumbnails are uploaded to the private `moment-thumbnails`
  Storage bucket when available, and `moments.thumbnail_uri` stores a
  `supabase://moment-thumbnails/...` reference that `/api/moments` resolves to a
  signed URL for Home/Video.

Open decision:

Should thumbnails become cross-device preview assets with their own durable
storage policy?

Recommendation:

Treat thumbnail persistence separately from source video persistence. A
thumbnail is product presentation metadata; the source video is temporary AI
input unless the product later becomes a cloud video library. After
Auth/User Ownership, tighten thumbnail access and cleanup policies around
per-user scopes and RLS.

### 8. Auth and User Model

Current state:

The app is personal/QA-oriented and historically used a default user pattern
for no-token internal QA. Auth Phase 1 is now complete for the server/BFF
ownership boundary: the main ownership-sensitive API handlers resolve
ownership through `resolveRequestUser(request)`.

External No-Token Finalization status, 2026-06-26:

- Complete for the current server/app boundary.
- Normal app/API paths require a Supabase bearer token.
- The internal default-user fallback is disabled by default and only opens when
  the server has `ALLOW_INTERNAL_DEFAULT_USER=true` plus
  `APP_ENV=development` or `APP_ENV=test`.
- The app-side fallback is also explicit-only through
  `EXPO_PUBLIC_ALLOW_INTERNAL_DEFAULT_USER=true`.
- No-token Moment, upload, analysis, thumbnail fallback, Push token, and
  benchmark routes return 401 instead of using the default user.
- Invalid bearer tokens return 401 `auth_required`.
- Legacy momentId-based write/queue routes verify ownership against the
  resolved request user.

Auth Phase 1 verified smoke coverage:

- Authenticated `GET /api/moments` returns the authenticated user's data only;
  the no-token internal default user's Moments are not exposed.
- Authenticated `POST /api/video-upload-targets` creates `upload_targets` and
  Storage paths under `users/{authenticatedUserId}/...`.
- Authenticated direct upload -> finalize preserves the same owner through
  `upload_targets`, `moments`, `analysis_jobs`, and `evidence_results`.
- Authenticated DELETE removes only the authenticated user's Moment rows and
  source/thumbnail Storage objects inside the authenticated user's prefix.

Future work:

- Login UI and app-side session lifecycle.
- Private/user-scoped Realtime channel; public Broadcast is still MVP-only.
- RLS and ownership rules once service-role BFF boundaries are settled.
- Token cleanup, account deletion implications, and multi-device data
  consistency.

Do not start broad social/sharing work before the user ownership boundary,
session lifecycle, and private realtime behavior are settled.

Auth Phase 2 Identity Strategy, 2026-06-24:

Device-first identity should be implemented with Supabase Anonymous Sign-in,
not with the no-token default user. The anonymous smoke test succeeded:

- `signInAnonymously()` issued an anonymous access token.
- JWT/user metadata confirmed `is_anonymous=true`.
- The BFF resolved the request as `authMode=authenticated`.
- `public.users.auth_user_id` mapping was created.
- Authenticated `/api/moments` returned `0` moments.
- Default-user Moments stayed separate.
- The access token was intentionally not recorded.

Cleanup candidates:

```text
auth.users anonymous user id: b37f7d2f-199d-44f4-9718-a96d665f497f
public.users id: ff32ae87-5d69-43d3-ba9d-68c3d9bd8638
```

Identity roadmap:

1. Device-first: Supabase Anonymous Sign-in.
2. Recovery: Email linking / magic-link style recovery.
3. Secondary social recovery: Kakao, then Google, then Apple.

Technical debt to track:

- Anonymous user cleanup/retention policy.
- Recovery identity linking and conflict handling.
- Social provider linking order and App Store Sign in with Apple implications.
- External no-token default-user fallback is disabled by default and must remain
  explicit dev/test opt-in only.

Auth Phase 2 Build 72 QA follow-up:

Build 72 validated the device-first anonymous-session baseline for fresh
install, automatic anonymous session creation, Home entry, upload, relaunch,
analysis completion, Home/Video sync, and the fixed Upload picker/auth-boundary
race. Push was not confirmed in this pass.

Keep the following as Auth Phase 2 closeout / follow-up items:

- Confirm Push delivery/handling on a Build 72+ QA pass.
- Decide whether missing Push confirmation is a blocker or an open
  observability item, given that Home/Video state convergence passed.
- Add better Push send/delivery observability before treating Push misses as
  product bugs.
- Continue to keep no-token default-user fallback explicit dev/test opt-in only;
  external users should enter through anonymous Auth.

### Push Token Account-switch Policy - 2026-06-26

Status: complete for the current Push boundary.

Policy:

- Push remains notification-only.
- A device/expo push token belongs to the currently authenticated app owner.
- After anonymous -> Kakao recovered session switch, the app should register the
  push token again with the recovered bearer token.
- `device_push_tokens.expo_push_token` remains unique. Server upsert on
  `expo_push_token` moves the existing row to the new `public.users.id` instead
  of creating a duplicate enabled send target.
- `DeviceNotRegistered` ticket/receipt handling still disables the matching
  token row and is not changed by this policy.

Implementation:

- `HomeScreen` ensures push registration at `auth_owner_ready`.
- `HomeScreen` retries push registration on foreground while authenticated.
- Existing `upload_start` registration remains.
- No DB migration was needed.

Validation:

- `npm run typecheck` passed.
- Local/server smoke used `MOCK_AI_ANALYSIS=true`.
- A temporary owner A registered a fake Expo token.
- A temporary owner B registered the same fake Expo token.
- The same `device_push_tokens.id` moved from owner A's `public.users.id` to
  owner B's `public.users.id` and stayed `enabled=true`.
- Temporary Auth users, `public.users` rows, and token row were cleaned up.
- No actual Push send, EAS build, paid AI call, DB migration, or external
  console change was performed.

### 9. Push Deep Link

Current state:

Push notification opens the app.

Future work:

Push should eventually deep link to the completed Moment Detail:

```text
upload
-> app closed
-> analysis completed
-> push
-> tap
-> specific Moment Detail
```

Keep out of current scope unless the analysis loop is otherwise stable.

### 10. Background Upload

Current state:

The app tells the user not to close the app during source video upload.

Why:

Without OS-level background upload, the multipart request can be interrupted
when the app is killed or suspended.

Future option:

Investigate iOS background upload support if uploads become long or users
regularly close the app immediately.

Decision for now:

Use clear UX copy and source-video-first architecture. Background upload is a
long-term stability candidate, not the current MVP requirement.

## Current Do / Do Not

Do:

- keep source-video-first upload as the preferred path
- keep upload and analysis status distinct
- collect real timing and quality data
- preserve fallback paths until QA proves the new path

Do not:

- start AI Coach yet
- tune prompts from one clip
- treat Supabase Storage as permanent video library
- auto-clear QA data after every build
- hide architectural debt in chat only

## 2026-06-21 Upload-first Validation

Confirmed fact:

The source-video-first path is implemented and verified against operating Render
+ Supabase.

Default endpoint:

```text
POST /api/moments/from-source-video
```

Validation results:

- Fileless request returned HTTP 400: `video file is required`.
- Fileless request did not change `moments`, `analysis_jobs`, or
  `evidence_results` counts.
- Normal upload created a source object in Storage.
- Moment row was created only after the source upload succeeded.
- AnalysisJob row was created after the Moment row.
- Verified timestamp order:

```text
source_video_storage_uploaded_at
-> moment.created_at
-> analysis_jobs.queued_at
-> analysis_jobs.started_at
-> analysis_jobs.completed_at
```

- Completed analysis created an EvidenceResult.
- Successful analysis cleaned up the source object and set
  `source_video_storage_status=deleted`.

UX update:

- The Upload screen remains open until source video upload completes.
- During upload, the app says the video is being uploaded to the server and that
  the user should not close the app.
- Only after upload completion does the app move into analysis/queued state where
  the user may close the app.

QA policy reminder:

- Do not auto-clear DB data after preview/internal builds.
- Report DB counts only unless the Founder explicitly requests reset/deletion.
- Simulator upload is not part of default QA. Use simulator for UI/sync/delete
  checks; use physical iPhone for real upload, Push, quality, and calibration.

## 2026-06-21 Upload Close/Kill Interpretation

Observation:

The user force-closed the app immediately after starting an upload, but the
analysis still completed successfully.

Interpretation:

Do not classify this as a bug by itself. Two explanations are possible:

1. The source video upload had already completed before the app was terminated.
2. iOS briefly allowed the in-flight network request to finish after the user
   perceived the app as closed.

Product rule:

- If the app closes before source upload completion, analysis may not start.
- If source upload completes first, server-side analysis should continue even if
  the app closes.

Copy improvement candidate:

Current copy:

```text
이 단계에서는 앱을 닫지 마세요.
```

More precise copy candidates:

```text
업로드가 끝날 때까지 앱을 닫지 않는 것이 안전합니다.
업로드가 완료되면 분석은 서버에서 계속됩니다.
```

Follow-up TODO:

- Test app termination before and after source upload completion more deliberately.
- Refine upload-state copy so it communicates risk rather than absolute failure.
- Add a server-side stale `upload_targets.status=issued` orphan cleanup policy
  after upload target semantics are finalized. Do not mutate these rows during
  Build 58/59 upload stability work.
- Continue collecting analysis timing data.
- Continue AI Calibration only from repeated sample patterns.
- Revisit Moment Detail structure in a later UX phase.
- Add Push deep link later.
- Consider OS-level background upload as a long-term stability option.
