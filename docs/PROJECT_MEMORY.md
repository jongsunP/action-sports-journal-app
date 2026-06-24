# Project Memory

## Purpose

This is the top-level permanent memory document and operating system for
Action Sports Journal.

Future GPT sessions, Codex sessions, new computers, and handoffs should read
this first, then follow references to the more detailed documents.

Use this document as the primary source of truth for project identity,
collaboration rules, product philosophy, AI architecture direction, wakeboard
domain constraints, current priorities, and recovery instructions.

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

No-token internal default data must remain an internal QA fallback only. Future
authenticated paths should continue using request-scoped ownership and must
not merge default-user Moments into authenticated user responses.

Auth Phase 2 starts from:

- Login UI and app-side session lifecycle.
- Private/user-scoped Realtime instead of the current public MVP Broadcast.
- External no-token policy.
- Push token account-switch policy.

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

1. Read this file first.
2. Read `docs/CURRENT_STAGE.md`.
3. Read `docs/HANDOFF.md`.
4. Read `docs/CONTINUITY_CHECKPOINT.md`.
5. If working on wakeboard AI, read:
   - `docs/WAKEBOARD_TRICK_TAXONOMY_REFERENCE.md`
   - `docs/WAKEBOARD_VALIDATION_MATRIX.md`
   - `docs/AI_ANALYSIS_PIPELINE_DESIGN.md`
6. Use explicit uncertainty labels.
7. Do not propose implementation as completed work.

Recommended opening prompt for a new GPT session:

```text
Read docs/PROJECT_MEMORY.md as the primary source of truth for Action Sports
Journal. Then read docs/CURRENT_STAGE.md, docs/HANDOFF.md, and
docs/CONTINUITY_CHECKPOINT.md. Continue from the current resume point. Use
Confirmed Fact / Observation / Hypothesis / Recommendation / Unknown labels
when diagnosing. Do not imply anything is implemented unless the docs or code
confirm it.
```

For a new Codex session:

1. Sync the personal context repository if required by local instructions.
2. Open the project repository:
   `~/repository/action-sports-journal-app`
3. Read this file first.
4. Read `AGENTS.md` if present, then:
   - `docs/CURRENT_STAGE.md`
   - `docs/HANDOFF.md`
   - `docs/CONTINUITY_CHECKPOINT.md`
5. Check git status before editing.
6. Do not print secrets.
7. Do not commit `.env.local` or any local secret file.
8. Prefer small focused commits and push important checkpoints to
   `origin/master`.

Recommended opening prompt for a new Codex session:

```text
Open ~/repository/action-sports-journal-app. Read docs/PROJECT_MEMORY.md first
as the primary source of truth, then read AGENTS.md if present,
docs/CURRENT_STAGE.md, docs/HANDOFF.md, and docs/CONTINUITY_CHECKPOINT.md.
Check git status before edits. Do not print secrets. Continue from the current
resume point and keep changes scoped.
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
