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

Mobile-first UX principle:

The Founder may use web-development analogies, but this project should be
implemented as a mobile app first. Before using web-style conditional rendering
or screen swaps, consider app-native navigation, lifecycle, gesture,
foreground/background, Push, and upload patterns. If the user's web analogy
points to a working but awkward mobile interaction, propose the more app-like
structure first. A feature being technically functional is not enough; it
should feel natural on iPhone.

Validation cost principle:

Use the cheapest trustworthy validation path first. Do not run a new build just
because building is possible; build only when the behavior cannot be validated
well enough through the simulator, local dev path, Expo/dev-client path, or
another lower-cost route. If physical-device behavior is required, still prefer
non-build verification when it is technically sufficient.

For upload and analysis work, do not replace the product path with mock data.
The app should still call the backend API and exercise the real server flow.
When the test target is not AI quality itself, it is acceptable to temporarily
bypass only the paid AI provider call and return a realistic server-side OK
result so the pipeline can be tested without unnecessary AI cost.

User action instruction format:

When asking the user to do something, say where to go and what to do there. For
terminal work, always provide a copyable command block that starts from the
project directory, for example:

```bash
cd ~/repository/action-sports-journal-app
open -a TextEdit .env.local
```

When giving work to another Codex/development session, use:

```text
## **개발 세션에게**
<copyable prompt text>
```

When giving work directly to the Founder/user, use:

```text
## **사용자에게**
<short, clear step-by-step explanation>

```text
<copyable value only when needed>
```
```

User-facing explanations should be brief and easy to scan. The Founder will
ask follow-up questions if more detail is needed.

Only include sections for real action owners. Avoid adding a user or development
session block when there is no action for that owner.
If both the Founder/user and another development session have actions, include
both sections and state the order clearly.
Keep the work stream moving. Pause for explanation or questions only when a
decision is needed from the Founder or when the Founder explicitly asks a
question. Otherwise, provide only the next needed prompt/action for the
appropriate owner.
If the development session can proceed directly and the Founder does not need
to decide or act, do not add a user-facing action section.

When the Founder asks what remains or asks for current status, answer in time
order and include both the full remaining list and the immediate next work:

```text
과거:
현재:
가까운 미래:
먼 미래:
바로 앞 작업:
```

Keep this summary concise and easy to scan.

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

After a development session reports that a build is complete, do not immediately
send a new development-session prompt. First give the Founder only the QA steps
needed for that build and wait for the Founder’s QA result. After the Founder
reports the result, then decide whether to send a development-session follow-up.

Founder technical context:

The Founder is a web frontend developer. They understand structure, flow, UI,
and implementation relationships well. Do not lower the technical level.
Instead, adapt DB, infra, mobile build, Supabase, and deployment instructions
to a familiar execution interface: exact locations, exact files, and copyable
commands from the project directory. Do not give vague infra instructions.
Give concise, exact actions.

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

Build 74 Push QA / current handoff, 2026-06-24:

Build 74 closes the last known Auth Phase 2 QA observation. Push delivery was
confirmed after analysis completion. Render logs showed the expected lifecycle:
`tokenCount: 1`, send started, Expo ticket result `okCount: 1`, `errorCount: 0`,
and a ticket id.

Root cause of the Build 73 Push miss:

Push token registration happened after the analysis had already completed. At
completion time Render loaded zero tokens and logged
`analysis_push_skipped_no_tokens`. Build 74 fixed the timing by ensuring push
registration when the auth owner becomes available, retrying eligible failures
on foreground, and best-effort ensuring registration at upload start. Upload
continues even if registration fails.

Current milestone status:

- Upload Part 1 is closed.
- Auth Phase 1 is closed.
- Auth Phase 2 is closed for the device-first anonymous identity baseline.
- Push Observability P2 is complete for internal/dev smoke QA.
- Current `master` is 3 commits ahead of `origin/master`.
- Next main product work should be Email Recovery / Account Linking QA.

Push Observability P2, 2026-06-24:

Push was not redesigned. Build 74's delivery behavior remains the accepted
baseline. The server now adds a persistent observability record around analysis
completion Push:

- `analysis_push_delivery_attempts` migration in
  `supabase/phase12_push_delivery_attempts.sql`;
- all user push tokens are loaded so missing tokens and disabled-only tokens
  are distinguishable;
- Expo ticket results are mapped to `device_push_tokens.id` plus masked token
  only;
- `DeviceNotRegistered` disables the matching token;
- receipt checks are exposed as an internal/dev endpoint:
  `POST /api/push-receipts/check-pending`.

Smoke QA passed after the phase12 migration was applied. Confirmed statuses:
`receipt_ok`, `ticket_error` with `DeviceNotRegistered`,
`skipped_disabled_only`, `skipped_no_tokens`, and `skipped_no_valid_tokens`.
Ticket/receipt error messages and details are masked before being stored, so
raw Expo tokens are not duplicated into the observability table.

No automatic scheduler was added. That remains a later P2/operational
follow-up if manual/internal receipt checks become insufficient. The next
starting point is Email Recovery / Account Linking QA.

Email Recovery implementation start, 2026-06-24:

The first account-linking pass is now in code. It adds an
`AccountRecoveryScreen` opened from the Home header menu, plus auth-provider
helpers for requesting a recovery email. The OTP input / `verifyOtp` screen
flow was removed after confirming the current Supabase Change Email template is
magic-link based. After `updateUser({ email })` succeeds, the UI now shows a
magic-link pending state and lets the user refresh the app session after
clicking the email link. This treats recovery as a way to preserve the current
anonymous rider account, not as a pre-upload login wall.

Server ownership behavior was also tightened: when `resolveRequestUser(request)`
resolves an existing `users.auth_user_id`, it now syncs changed Supabase Auth
email/display name fields into that existing app user row. This is meant to
preserve Moment ownership while allowing the anonymous Supabase Auth user to
become email-recoverable.

Next QA/start point:

- Email Recovery E2E is blocked by Supabase hosted email rate limits. The
  post-cooldown single retry with `parksunl7@naver.com` returned
  `over_email_send_rate_limit` / HTTP 429 again. Do not call
  `updateUser({ email })` again in the next session unless the user explicitly
  decides to change Supabase Auth email rate-limit policy or configure custom
  SMTP.
- Next Email Recovery decision: inspect Supabase Auth email rate-limit/project
  policy, or evaluate custom SMTP before any more E2E attempts.
- Final Email Recovery smoke retry, 2026-06-24: at the user's request, a fresh
  anonymous QA seed session called `updateUser({ email })` exactly once with
  `parksunl7@naver.com`. The result was `email_exists` / HTTP 422,
  `A user with this email address has already been registered`, not the previous
  hosted email rate limit. This is expected after the successful Kakao QA:
  `parksunl7@naver.com` is already registered on Auth user
  `499d7e71-623c-4b4e-8653-267d72ac3ca6` and `public.users.id`
  `6b03b289-a6aa-4f26-aa66-6730e1cca2fe`. No email was sent, so magic-link
  receipt/click/session refresh was not testable. Temporary QA seed Auth user
  `68747ded-ee58-4406-8d4f-3037a3c91be4` was cleaned up. Do not retry
  `updateUser({ email })` with this already-registered email.
- Rate-limit judgment: Supabase's built-in Auth email sender is currently a
  low-limit demo sender. Official docs list email-triggering endpoints,
  including `/auth/v1/user` for email updates, at 2 emails/hour project-wide
  with the built-in provider. This limit is adjustable only with custom SMTP.
  Do not assume a Free -> Pro upgrade alone resolves the blocker.
- Custom SMTP is not urgent unless ASJ commits to email recovery as a
  distribution path. If pursued, evaluate Resend, Postmark, AWS SES, SendGrid,
  Brevo, or Mailtrap for sandbox testing, then configure sender domain,
  SPF/DKIM/DMARC, SMTP credentials, Supabase custom SMTP, rate limits, and
  provider delivery logs.
- Latest Email Recovery smoke with `parksunl88@nate.com`: `updateUser({ email
  })` was called exactly once and succeeded. The Auth user remained anonymous
  with empty `email`, `new_email=parksunl88@nate.com`, and `is_anonymous=true`.
  The email was received and confirmed the Supabase Change Email template is
  magic-link based. Clicking the link redirected the browser to
  `http://localhost:3000/#error=access_denied&error_code=otp_expired...`, so
  final email linking did not complete. Email Recovery is no longer blocked by
  hosted sender rate limits or the previous `email_exists` case, but it still
  needs redirect URL/deep-link strategy and a QA pass within the link validity
  window. Kakao Recovery is already verified on Build 75 and remains the
  stronger current recovery path; keep Email Recovery as baseline/fallback.
- Link an email on a fresh anonymous Build and verify the same Auth user/app
  user/Moment/Push/Realtime ownership continues after linking.
- Implement actual reinstall/new-device recovery sign-in only after the current
  account-linking path is verified.

Long-term recovery caution:

Do not implement Kakao, Phone/SMS, Apple, Google, or other social account
providers in the current pass. Email Recovery is the baseline recovery path for
validating ownership continuity and account linking first. Kakao Account
Linking / Kakao Recovery remains a strong candidate before distribution because
ASJ targets Korean mobile riders and has Instagram-centered inflow, where Kakao
or SMS may feel more natural than email. Revisit Kakao / Phone after Email
Recovery is stable. Because Email Recovery E2E is blocked on hosted email rate
limits, keep Kakao Account Linking / Recovery as a parallel candidate for Korean
user recovery UX planning.

Kakao implementation caution:

Do not implement Kakao yet, and do not use `signInWithOAuth` to create a new
login wall or a new Supabase user. The target flow is linking Kakao to the
currently authenticated anonymous Supabase Auth user, likely through
`linkIdentity({ provider: "kakao" })` after dashboard setup is confirmed.

Before any Kakao code work, verify:

1. Supabase Kakao provider can be configured for the active project.
   Done: provider is enabled with REST API Key and Client Secret Code entered.
   "Allow users without an email" is enabled.
2. Manual Identity Linking can be enabled.
   Done: Authentication -> Sign In / Providers -> User Signups contains "Allow
   manual linking", and it is enabled. "Allow anonymous sign-ins" is also
   enabled.
3. Kakao Developers REST API key and Kakao Login Client Secret are ready.
   Done: REST API Key and Client Secret Code are ready; Kakao Login is enabled;
   Supabase callback URL is registered.
4. App scheme candidate `actionsportsjournal` is acceptable.
5. Supabase Redirect URLs and native deep-link handling are designed.
6. A smoke plan exists to confirm `linkIdentity` preserves the existing
   anonymous `auth_user_id`, `public.users.id`, Moment ownership, push token
   ownership, and user-scoped Realtime basis.

Next start point:

Prepare an EAS preview build only when ready to run Kakao deep-link E2E. The
local/Simulator check passed: Expo Go on iPhone 17 Simulator launched the app,
entered `AccountRecoveryScreen`, rendered the existing Email Recovery section
and the Kakao recovery-method section, opened the iOS OAuth confirmation prompt
for `kauth.kakao.com`, and returned to the app with the cancel message after
cancel. Deep-link completion is still unverified.

Remaining Kakao E2E checks:

1. `actionsportsjournal://` deep-link return works in iOS standalone/EAS
   preview.
2. Kakao OAuth completes and returns to the app.
3. Existing anonymous Supabase Auth user id is preserved.
4. Existing `public.users.id` is preserved.
5. Moment ownership is preserved.
6. Push token ownership is preserved.
7. User-scoped Realtime channel basis remains tied to the same Auth user id.
8. No new Supabase Auth user is created.

Build 75 Kakao Account Linking E2E closeout:

Build 75 confirmed the standalone iOS Kakao account-linking path. Initial QA
hit Kakao `KOE205` because Kakao OAuth requested consent scopes that were not
available/configured; after the Kakao Developers consent settings were corrected
for the requested scopes, OAuth completed, ASJ reopened through the
`actionsportsjournal` scheme, and `AccountRecoveryScreen` showed the recovery
method connected state.

Read-only ownership checks:

- Auth user id: `499d7e71-623c-4b4e-8653-267d72ac3ca6`.
- Kakao identity id: `9aaaf219-bdf9-4fe5-91df-1a59ec57d558`.
- Kakao provider id: `4960498960`.
- `public.users.id`: `6b03b289-a6aa-4f26-aa66-6730e1cca2fe`.
- `public.users.email`: `parksunl7@naver.com`.
- `device_push_tokens` count for the app user: `1`.
- Realtime channel basis:
  `analysis-updates:auth:499d7e71-623c-4b4e-8653-267d72ac3ca6`.

Kakao identity is attached to the existing Auth user, no separate new Auth user
was observed for the QA window, `public.users.id` remained mapped to the same
Auth user, push token ownership remained on that `public.users.id`, and
Realtime remains scoped by the same Auth user id. The QA user had `moments`
count `0`, so run a future continuity smoke with a pre-existing Moment sample
before treating Moment preservation as empirically covered.

Kakao follow-ups:

- Improve the connected/error/cancel states so success and failure are more
  explicit to the user.
- Decide whether Kakao `name` / `full_name` should update
  `public.users.display_name`; the QA identity contained `박종선`, while
  `public.users.display_name` currently stayed as `parksunl7@naver.com`.
- Re-check ownership continuity on an account that already has Moments.

Kakao linkIdentity implementation plan:

- Implementation readiness check: current dependencies do not include
  `expo-web-browser`, `expo-auth-session`, or `expo-linking`. Add only the
  packages actually needed for the chosen OAuth/deep-link handling path.
  `app.json` currently has no `scheme`; adding `scheme: "actionsportsjournal"`
  is required for standalone deep-link return and will affect native app config.
- Recommended screen structure: extend the existing `AccountRecoveryScreen` for
  the first pass. It is already opened from the Home header menu, already framed
  as account preservation rather than login, and already has access to
  `useAuthSession()`. Avoid creating a separate login screen. Later, if the
  account surface grows, split it into an `AccountLinkingScreen`.
- Add a Kakao account-linking section below the Email Recovery baseline. The
  button copy should be recovery-oriented, such as "카카오로 복구 수단 연결",
  not "카카오 로그인".
- Add a narrow auth helper, likely `src/services/auth/kakaoLinking.ts`, that
  calls `supabase.auth.linkIdentity({ provider: "kakao", options: { redirectTo,
  skipBrowserRedirect: true } })`. Use `signInWithOAuth` only if a later
  recovery sign-in flow is explicitly designed; do not use it for linking the
  current anonymous account.
- Add Expo OAuth/deep-link dependencies only if needed by implementation:
  `expo-web-browser` and `expo-linking` / `expo-auth-session` style redirect
  helpers. Supabase's native mobile docs use app deep links and session/token
  handling after OAuth redirects; `linkIdentity` supports PKCE, so the
  implementation should be prepared to exchange the returned code or set the
  returned session depending on the redirect payload.
- Add `scheme: "actionsportsjournal"` to `app.json` only when implementation
  starts. Also add the matching Supabase Redirect URL
  `actionsportsjournal://**` before smoke.
- After the browser returns, call `refreshSession()` and `supabase.auth.getUser()`
  or `getUserIdentities()` to confirm Kakao identity is attached to the same
  Auth user. Then call a normal BFF endpoint so `resolveRequestUser(request)`
  can sync display metadata into the existing `public.users` row.
- `resolveRequestUser(request)` already syncs `email` and display name from
  `user_metadata.full_name` / `name`. Kakao without email should leave
  `public.users.email` null. If Kakao nickname appears under a different
  metadata key, update the server sync narrowly after smoke evidence identifies
  the exact key.
- For no-email Kakao, UI should show "카카오 연결됨" and nickname if available.
  Do not imply email recovery when Kakao does not provide `account_email`.
- Ownership continuity smoke must verify: Supabase Auth user id unchanged,
  `public.users.id` unchanged, Moment `user_id` unchanged, push token `user_id`
  unchanged, Realtime channel basis still `analysis-updates:auth:{authUserId}`,
  and no new Supabase Auth user was created.

Kakao without email:

Email is not required for ASJ ownership continuity if `linkIdentity` preserves
the existing anonymous Supabase Auth user id. Recovery UX can show Kakao as a
linked recovery method using provider identity and nickname metadata while
`public.users.email` remains null. The smoke must verify that Supabase accepts
the Kakao flow with "Allow users without an email" and that no new Auth user is
created.

Auth Phase 1 server ownership closeout, 2026-06-24:

Auth Phase 1 is complete for the BFF/server ownership boundary. The main
ownership-sensitive API routes now resolve a request-scoped user with
`resolveRequestUser(request)`. No-token requests still use the internal default
user for QA, but bearer-token requests resolve to a Supabase Auth-backed
`users.auth_user_id` mapping. The access token used for smoke testing was not
recorded.

```text
JWT sub: e156164b-e810-4ab8-a949-9e14452fdd73
JWT email: parksunl88@gmail.com
JWT exp: 2026-06-24T03:50:39.000Z
Authenticated app userId: 91ab8b25-1adb-4a94-ade2-b00c50e38d22
Internal default app userId: 737deccd-7da9-49c5-854b-839b62fa417b
```

Confirmed results:

- Server log resolved the bearer-token request as `authMode=authenticated`.
- Authenticated `userId` and no-token internal default `userId` are separate.
- Authenticated `GET /api/moments` returned `0` moments.
- No-token `GET /api/moments` returned `30` moments with `hasMore: true`.
- No default Moment IDs were visible in the authenticated response.
- `users.auth_user_id` mapping did not exist before the authenticated GET and
  one `users` row was created by `resolveRequestUser()`.
- Authenticated `POST /api/video-upload-targets` created an upload target owned
  by the authenticated app user and storage paths under
  `users/{authenticatedUserId}/...`.
- Authenticated direct upload and finalize created a Moment, AnalysisJob, and
  EvidenceResult with the same authenticated `user_id`.
- Authenticated DELETE removed the smoke Moment, AnalysisJob, EvidenceResult,
  source object, and thumbnail object while staying inside the authenticated
  user storage prefix.

Auth Phase 1 remaining TODO:

- Convert public MVP Realtime Broadcast to private/user-scoped Realtime after
  app auth sessions exist.
- Implement Login UI and app-side authenticated session lifecycle.
- Decide external no-token behavior. The current default user path is internal
  QA only.
- Define push token account-switch policy for shared/reused devices.

Next Auth starting point:

Start Auth Phase 2 from app login/session wiring and user-scoped realtime/push
behavior. Do not treat the internal default user's Moments as authenticated
content.

Auth Phase 2 identity strategy update, 2026-06-24:

Use Supabase Anonymous Sign-in as the device-first identity path. A smoke test
successfully created an anonymous Supabase Auth user, issued an access token
(not recorded), confirmed anonymous JWT/user metadata, called BFF
`GET /api/moments` as `authMode=authenticated`, and created a matching
`public.users.auth_user_id` row. The authenticated anonymous user saw `0`
Moments, confirming separation from the internal default user's Moments.

Cleanup candidates from the smoke:

```text
auth.users anonymous user id: b37f7d2f-199d-44f4-9718-a96d665f497f
public.users id: ff32ae87-5d69-43d3-ba9d-68c3d9bd8638
```

Next Auth implementation should create/restore an anonymous session on first
launch, then treat Email Recovery as the first account-linking feature. Kakao,
Google, and Apple remain secondary recovery/social options.

Auth Phase 2 Build 72 QA result, 2026-06-24:

Problem:

The first app-side anonymous-session builds found two lifecycle blockers:
Build 70/71 fresh install could remain on Boot Loading while anonymous auth and
Boot Sync raced, and Build 71 could show UploadScreen with "선택된 영상이
없습니다" after an auth boundary reset invalidated the selected video state.

Decision:

Keep the device-first anonymous identity path, but harden the first-launch and
first-upload lifecycle before adding any Login UI or recovery provider.

Implementation now on `master`:

- `AuthSessionProvider` keeps `authLoading` until the initial
  `getSession -> signInAnonymously` flow finishes, so a transient null auth
  event cannot fall through to internal fallback during first launch.
- `useBootSync` can retry if an initial remote sync attempt is cleaned up before
  reaching a terminal `completed`, `failed`, or `timeout` state.
- `useUploadMoment` uses an upload-flow generation guard so a stale picker
  result cannot open an empty UploadScreen after `resetUploadFlow()`.

Build 72 QA confirmed:

- Fresh install passed.
- Anonymous session was created automatically.
- Home entered successfully.
- Upload succeeded.
- App relaunch preserved/restored state.
- Analysis completed.
- Home/Video reflected the result.
- Upload race blocker was resolved.
- Push was not confirmed in this pass and remains an observation for the next
  QA pass.

Current Auth Phase 2 handoff:

The device-first anonymous-session baseline is functionally validated for
launch, upload, relaunch, analysis, and Home/Video sync. Before calling Auth
Phase 2 fully closed, either confirm Push on Build 72+ or explicitly carry Push
confirmation as a non-blocking open observation. The next implementation step
after closeout should be Email Recovery/account linking.

Build 65 upload recovery checkpoint, 2026-06-23:

Build 65 is the latest prepared iOS QA build.

```text
buildNumber: 65
feature commit: 13e95ff fix: expire unrecoverable local upload sessions
build commit: 5ca179a chore: prepare local upload cleanup qa build
EAS Build: https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/315d66c2-a390-4f63-8790-151d890f677f
```

What changed after the Build 55 diagnostics baseline:

- Build 56 added durable thumbnail persistence through the existing
  `moments.thumbnail_uri` field and the private `moment-thumbnails` bucket.
- Build 57 added Detail thumbnail fallback and duplicate completed-push guards.
- Build 58 suppressed foreground OS Push so foreground completion uses the
  in-app Toast only.
- Build 59 increased signed upload timeout from 8s to 30s and cancels timed
  out source/thumbnail upload tasks.
- Build 61/63 preserved direct upload target context so a successful Storage
  upload can still be finalized/recovered after timeout or ambiguous failure.
- Build 62/64 added optimistic-upload reconciliation and orphan uploaded source
  recovery.
- Build 65 separates recoverable uploads from unrecoverable local-only uploads.

Current upload recovery rule:

- `uploadId` + `storagePath` present: treat the local optimistic session as a
  recoverable uploaded-source candidate and retry finalize for up to about
  three minutes.
- `uploadId` / `storagePath` missing: treat it as local-only and unrecoverable;
  it should expire to `upload_failed` after about 45 seconds instead of living
  forever as processing.

Latest QA finding:

Build 65 still needs one follow-up investigation/fix before starting Auth. In
the latest A-processing/B-upload scenario, the newest server row showed A
successfully finalized/completed, but no distinct B `upload_targets` row was
created. That means B likely failed before upload target creation or in an
early client-side stage. The next work should improve pre-target failure
observability and ensure the terminal local failure path is clear, without
restarting upload architecture.

Part 1 final wrap-up checkpoint, 2026-06-23:

Part 1 Upload Experience is complete for the current single-user internal QA
scope. Build 55 is the latest prepared build and should be treated as a
diagnostics build, not as a feature expansion. It includes the Build 54
state-sync baseline plus Direct Upload finalize/fallback observation logs.

Build 55 records:

- Render finalize response boundary:
  `uploaded_source_finalize_response_sent`.
- App direct finalize success:
  `direct_finalize_success`.
- App direct skip/failure/empty-result paths before fallback.
- Multipart fallback start/success:
  `fallback_started`, `fallback_success`.

Use Build 55 if a future upload again appears to produce a finalized
`upload_targets` row while the final Moment path looks like multipart fallback.
The next investigation should compare Render `upload_timing` logs with the app
`upload_timing` sequence before changing upload logic again.

Next main workstream:

Start Auth / Ownership next. Do not start Compression or AI Calibration first.
After Auth, convert the current public MVP Realtime Broadcast channel into a
private/user-scoped channel. Then address Thumbnail Persistence so stored
analysis results keep a visual preview after reinstall/new build. AI
Calibration and Compression Measurement remain follow-up work after ownership
and storage boundaries are clearer.

State Sync / Video Archive Source checkpoint, 2026-06-23:

Problem:

After pagination, Video Archive became a separate server source. Build 52
confirmed that the remaining blocker was not pagination itself, but state
invalidation: upload success, Push, Realtime, foreground refresh, and tab
selection had to converge Home and Video without using polling as the main
solution.

Decision:

Build 53 QA passed this blocker, and Build 54 confirmed the polling-free
version. Upload success now behaves like a mutation success: it explicitly
refreshes `/api/moments` first page. That first page is merged into the global
session cache and also replaces the Video Archive first-page source. Tab
selection is routed through a helper so `activeTab` and `activeTabRef` stay in
sync.

Current implementation status:

- Pagination / Infinite Scroll is accepted.
- Video Archive Source is accepted.
- `upload_success` invalidate/refetch is accepted.
- Push / Realtime / foreground remain event/fallback refresh paths.
- Active moment polling has been removed.
- `moment_updated` Broadcast now covers queued/processing/completed/failed
  status transitions as a refetch trigger.
- Build 54 QA confirmed active app completion without polling.
- Home = Global Session Cache; Video = Server Archive Source; Detail = Cache +
  Server context.

Next:

Auth / Ownership is the next major workstream. Do not start Compression yet.
`moment_updated` should remain a trigger for `/api/moments` refresh rather than
a direct state merge payload. After Auth, convert the public Realtime Broadcast
channel to private/user-scoped Realtime.

Finalize latency note:

After Direct Upload reaches 100%, the app still waits for
`/api/moments/from-uploaded-source`. Render currently inspects the Storage
object and downloads the uploaded source video to verify size before creating
the Moment and AnalysisJob. This is likely the perceived 2-4 second finalize
wait. A future optimization should check whether reliable Storage metadata can
replace the full download in finalize.

Stage 2 is complete. Stage 3 video-to-analysis prototyping is active.

Part 1 Upload Experience closeout, 2026-06-22:

Problem:

The team needed to decide whether the upload experience was good enough to
move on from Part 1. This was not a generic UI polish question. The launch
question was whether a rider can upload one real video and understand exactly
what is happening before the app asks them to trust AI analysis.

Why it mattered:

Earlier iterations mixed upload and analysis states, depended on local draft
URIs across app restarts, showed stale processing after background/Push
transitions, and did not clearly notify active users when Realtime completed a
result. Those issues make a technically working pipeline feel broken.

Options:

- Treat multipart fallback as final and defer signed Direct Upload.
- Make Direct Upload the preferred architecture while keeping fallback.
- Preserve Local Draft Resume.
- Remove Local Draft Resume and keep the rider in an explicit upload flow until
  durable input exists.

Decision:

Part 1 is closed for single-user internal QA with Direct Upload + multipart
fallback. Local Draft Resume is removed. `/api/moments` is the result source of
truth. Push, Realtime Broadcast, foreground refresh, and in-app banner have
separate roles instead of competing UI responsibilities.

Implementation:

- Direct Upload uses upload target -> signed URL -> `FileSystem.uploadAsync`
  -> finalize -> Moment/AnalysisJob.
- Fallback multipart remains available.
- Upload progress shows real byte percent during video transfer and
  user-facing stage copy elsewhere.
- Boot Loading and Empty State are separated.
- Active app completion now shows an in-app banner only after Realtime-triggered
  refresh has reflected a completed Moment locally.
- Push remains for background notification.

Result:

Current build:

```text
buildNumber: 36
feature commit: fb42fde
build commit: cf80100
EAS Build: https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/cefad9fb-2a43-4cf9-bfee-dd092e18dcf3
```

Single-user internal QA can proceed from this baseline. Do not represent this
as external-user ready.

Remaining risks:

- Auth/User Ownership is required before external or multi-user use.
- `upload_targets` needs status semantics cleanup before orphan cleanup.
- Direct Upload still needs repeated device samples; fallback remains part of
  the reliability strategy.
- Push deep link, server Draft/upload session, and pre-upload optimization are
  Part 2 items.
- AI Calibration is after Part 1, not part of Part 1.

Navigation / Instagram UX decision:

Treat this as part of the Part 1 product skeleton closeout. Instagram inflow
and sharing are strategically important. After real-device pager prototype QA,
Home / Video / Growth horizontal swipe is adopted as the Part 1 navigation
skeleton. Bottom Tabs remain, so users can either tap explicit navigation or
swipe between the major surfaces.

The product reason is that Instagram-inflow users may not classify Home,
Video, and Growth as separate developer-defined surfaces; they may simply
learn that swiping moves to the next major screen. ASJ can be original in
product concept while using proven interaction models where user learning is
already strong.

Instagram-style interactions should still be explored first in media-heavy
zones: Video tab media viewer, previous/next Moment Detail swipe, ShareResult /
Growth Card preview carousel, and Instagram share outputs. The current pager
adoption is not the final route architecture: later Home / Video / Growth
should still be evaluated as real Bottom Tab Navigator routes for Push deep
links, tab state restore, ShareResult screens, and screen lifecycle management.

Part 1 navigation handoff:

- Problem: Bottom Tabs alone did not fully capture the Instagram-learned
  navigation feel that likely users may bring into ASJ.
- Cause: ASJ depends on Instagram inflow and sharing, while Home / Video /
  Growth are top-level surfaces users may treat as adjacent screens.
- Options: keep Bottom Tabs only; switch to pager-only; combine Bottom Tabs and
  horizontal swipe.
- Decision: adopt Bottom Tab + Swipe coexistence for the Part 1 skeleton.
- Result: real-device QA was positive; Pager/Haptic remain in Build 43.
- Remaining TODO: move to route-backed Bottom Tabs plus Stack later if Push
  deep links, tab state restore, or ShareResult routes need stronger route
  semantics.

Part 2 P1 handoff - Pagination / Infinite Scroll:

Do not scale the app around a permanent full-list Moment fetch. Cursor
pagination groundwork is now present in the server/app list layer, but the
Video infinite scroll UI is deliberately deferred after Build 41/42 launch
crashes.

Recommended architecture:

- Cursor pagination for `/api/moments`.
- Home uses the latest N Moments for dashboard sections.
- Video remains on the stable `ScrollView + map()` surface for now.
- Video should re-attempt infinite scroll only after isolating the
  TabView/PagerView plus virtualized-list launch crash.
- Detail can continue using selected list payloads now, but should not block a
  later single-Moment fetch for Push deep links or direct restore.

Recommended implementation order:

1. Add server `limit` / `cursor` query support and return `nextCursor` /
   `hasMore`.
2. Extend the app `listMoments` wrapper to accept pagination options.
3. Keep Build 43 as the stable archive UI baseline.
4. Re-test infinite scroll in a controlled branch using lazy scene mount,
   route-backed Bottom Tabs, or another safer containment strategy.
5. Reconcile Boot, Foreground, Push response, and Realtime refresh behavior so
   only the needed page or Moment is refreshed.

Do not implement date filters, trick filters, growth summaries, or route-backed
tab conversion as part of the first pagination pass.

Build 43 stable baseline:

- Build 41 introduced pagination plus Video `FlatList` / infinite scroll and
  crashed immediately on launch.
- Build 42 removed `removeClippedSubviews`, but still crashed on launch.
- Build 43 rolled back only the Video archive `FlatList` scene to
  `ScrollView + map()` while preserving cursor API/helper groundwork.
- Build 43 QA passed: launch, Home, Video, Pager/Haptic, Upload,
  Push/Realtime, and deletion.
- Treat `2a8249b` / buildNumber `43` as the current stable handoff point.

Build 48 pagination graduation QA:

Build 43 remains the stable rollback baseline, but the current pagination
graduation candidate is Build 48 on `prototype/video-infinite-scroll-safe`.
This build should be evaluated as the first real Video Archive Source build,
not as QA-only instrumentation.

```text
feature commit: 6e0f761 feat: finalize video archive source and pagination ux
build commit: 8f38aa5 chore: prepare pagination graduation build
buildNumber: 48
EAS Build: https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/f4f6fde7-1d5f-490a-94bc-ac29e25b3c29
```

Architecture discovery:

- Previous assumption: Video can render from the same global merged `sessions`
  source as Home.
- Discovery: Video is an archive, while Home is a dashboard/cache surface.
- Decision:
  - Home = Global Session Cache.
  - Video = Server Archive Source.
  - Detail = Cache + Server.
- Result: Video owns paged order via archive-specific state while global
  sessions remain the cache/detail source.

Pagination graduation condition:

- Physical iPhone confirms `20 -> 40 -> 60` as the user scrolls.
- Duplicate IDs = 0.
- Missing IDs = 0.
- Stable order remains `occurred_at desc` plus `id desc`.
- Upload, Push, Realtime, Detail, and deletion continue to pass.
- QA seed runId `pg-grad-20260622-182901` was cleaned up after the
  graduation seed QA cycle: 99 rows deleted, 0 rows remain, and child rows for
  `analysis_jobs`, `evidence_results`, and `upload_targets` stayed 0.

Part 2 priority order after pagination graduation:

1. Auth / Ownership.
2. Compression Measurement.
3. Unread Analysis Badge.
4. Push Deep Link.

Compression handoff:

- Problem: upload currently sends the original selected video unchanged.
- Cause: Direct Upload validates local file size and uploads bytes through
  `FileSystem.uploadAsync`, but there is no encode/compression pipeline.
- Options: keep original-only upload; add client-side compression; add
  server-side compression; or use a hybrid where large videos get conservative
  client optimization and the server can later generate proxy media.
- Decision: do not implement Compression yet. Start with measurement and AI
  benchmark because wakeboarding analysis depends on small visual details.
- Result needed before implementation:
  - upload file size;
  - video duration;
  - upload time;
  - finalize time;
  - original versus compressed AI result comparison.
- Candidate policy:
  - small/short videos can stay original;
  - large videos are candidates for conservative compression;
  - avoid aggressive frame-rate reduction;
  - test a 1080p-oriented conservative preset first.
- AI comparison fields: edge load, approach, board angle, rope tension, pop,
  rotation axis, landing, and trick identification.
- Next handoff action: create a benchmark plan or instrumentation pass before
  deciding whether to ship Compression MVP.

Failure records:

- Network outage QA:
  - Problem: upload looked broken in Build 40.
  - Cause: the test device was offline.
  - Decision: record as network-failure QA, not a Pager/Haptic or upload
    regression.
  - Result: failure alert/retry path was exercised and normal upload recovered
    after network restoration.
- FlatList launch crash:
  - Problem: Build 41 and Build 42 crashed immediately on launch.
  - Cause: suspected `FlatList` mounted inside TabView/PagerView scene.
  - Decision: rollback only the Video `FlatList` scene, preserving cursor
    API/helper work.
  - Result: Build 43 became the stable baseline.
  - TODO: retry infinite scroll through lazy mount, route-backed tabs, FlashList
    prototype, or another isolated device-QA path.

Build 29 Direct Upload checkpoint, 2026-06-21:

Problem -> Cause -> Decision:

Build 28 showed that Direct Upload could create a 0 byte Storage object and
then fail finalize with `Uploaded source video size does not match the draft`.
The issue was not `draft.fileSize` or the server validation itself. The
unstable point was RN/Expo `fetch(file://...).blob()` combined with Supabase
`uploadToSignedUrl`, which did not reliably upload the real MOV file body.
The decision was to keep Direct Upload as the intended product path and replace
only the file upload mechanism, while retaining multipart fallback.

Implementation:

- `src/services/moments/supabaseMoments.ts` now uses
  `expo-file-system/legacy`.
- Direct Upload checks the local file with `FileSystem.getInfoAsync`.
- The app blocks signed upload if the local file is missing, 0 bytes, or a
  different size from the draft metadata.
- The actual file is uploaded to the signed URL with
  `FileSystem.uploadAsync(..., httpMethod: "PUT", BINARY_CONTENT)`.
- `dev-server/index.ts` now includes expected/actual sizes in finalize mismatch
  errors.

Result:

- Latest commit: `3e4b26b fix: upload signed source files with file system`.
- Build 29 URL:
  `https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/16f8d05e-d375-4539-b9fa-1addbffb0227`.
- Build 29 real-device QA confirmed Direct Upload success:
  `upload_targets.status=finalized`, `uploaded_at` present, `finalized_at`
  present, and the latest Moment Storage path used `uploads/{uploadId}` rather
  than `moments/{momentId}`.
- Moment, AnalysisJob, and EvidenceResult were created and completed.
- Push and result restore remained normal.
- The temporary source video was deleted after analysis.
- The upload/finalize wait for a roughly 15.8 MB / 8 second MOV was about
  8-10 seconds. This is acceptable for now.

Next:

Keep Build 29 as the current QA baseline. Continue gathering a few more
real-device uploads before declaring Direct Upload fully stable. Local Draft
Resume has been removed from the Part 1 path because long-lived `file://`
video URI reuse is not reliable enough. The current choice is upload-screen
waiting with clear step-based progress. Future draft work should be
server/upload-target based. Pre-upload video optimization similar to
Instagram/TikTok is recorded as a later TODO, after Direct Upload stability is
confirmed.

Build 28 save point, 2026-06-21:

- Latest QA build is buildNumber `28`.
- EAS Build URL:
  `https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/0e95c278-e3d3-4c04-bebf-b16f163f0b9a`.
- Latest build commit is `773680c chore: prepare upload fallback qa build`.
- Build 28 includes UploadScreen, local UploadDraft restore, direct upload
  target/finalize/tracking, delete blocking overlay, Detail top-spacing fix,
  and edge-only Detail swipe tuning.
- Direct upload is not validated. The latest diagnostic row reached
  `upload_targets.status=failed` during finalize with `Uploaded source video
  size does not match the draft`.
- The successful production path is still multipart fallback through Render.
  This fallback must remain reliable until direct upload is fixed.
- Do not treat direct upload failure as user upload failure. The app should log
  failure to `upload_targets.failure_reason`, then attempt fallback.
- Next session should install Build 28, upload one real video, and compare
  latest `upload_targets` with latest Moment storage path.

Current refactor/TODO source of truth:

```text
docs/TECH_DEBT_AND_REFACTOR_TODO.md
```

The key current architectural cleanup is upload-before-Moment creation. The
product should not show a remote Moment as analysis-ready until the source video
has reached durable temporary Storage and the server can own the AnalysisJob.
Upload state and analysis state are separate concepts:

```text
uploading / upload_failed
queued / processing / completed / failed
```

The default upload endpoint is `POST /api/moments/from-source-video`. Do not treat legacy/fallback endpoints as final architecture. Keep them only
while the source-video-first path is being validated.

2026-06-21 validation update: the upload-first path has been verified on operating Render + Supabase. Fileless `POST /api/moments/from-source-video` returns 400 without creating `moments`, `analysis_jobs`, or `evidence_results`. A normal source upload created the Storage object first, then created the Moment, then created the AnalysisJob, then completed Gemini analysis and cleaned up the source video. The Upload screen now stays open until upload completion and tells the user not to close the app during that phase. If a force-close test still succeeds, interpret it carefully: the upload may already have completed, or iOS may have briefly finished the request. This is not automatically a bug.

Upload close/kill interpretation:

- Closing before source upload completion can fail because the server does not yet have durable input.
- Closing after source upload completion should allow server-side analysis to continue.
- Improve the upload copy later from "이 단계에서는 앱을 닫지 마세요." toward "업로드가 끝날 때까지 앱을 닫지 않는 것이 안전합니다." and "업로드가 완료되면 분석은 서버에서 계속됩니다."
- Follow-up TODOs: test before/after-upload app termination deliberately, refine upload-state copy, collect analysis timing data, continue sample-based AI Calibration, revisit Detail structure, add Push deep link later, and consider background upload as a long-term option.

Current product priority clarification:

The next product goal is not AI accuracy tuning. It is making one uploaded
video feel like a complete mobile app flow. Prioritize:

```text
1. Upload structure / UX completion
2. Mobile app screen structure
3. App-native gestures and return/deep-link behavior
4. UX stabilization
5. AI Calibration
```

This means upload-first behavior, signed/direct upload evaluation, progress
feasibility, blocking overlay, and timing logs come before prompt/evidence
tuning. Home-owned modal/conditional rendering is being reduced through
route-backed screens: `MomentDetailScreen` exists, and `UploadScreen` now wraps
the extracted `UploadContent` while preserving the existing upload-first flow.
AI Calibration for
toeside/heelside, Back Roll, and other trick-name accuracy should wait until
the mobile app loop itself feels stable.

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
fcbfb92 Document async analysis transition plan
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
- Supabase Phase 1 preparation is scaffolded but not product-wired.
- Node standard is Node 22 LTS.
- Async analysis transition planning is documented.

## Today's Conclusions

## 2026-06-20 Analysis-first Product Strategy

Problem:

The project name and long-term vision include AI Coach, but the immediate
product risk is not lack of coaching. The risk is that a rider uploads a video
and does not yet fully trust the analysis experience: whether the upload worked,
whether async analysis is progressing, whether the result restores correctly,
and whether the summary is understandable.

Why it mattered:

Action Sports Journal should not become an app that gives advice before the
rider believes its analysis. Coaching built on unclear or untrusted analysis
would make the product sound more advanced while making it less credible.

Decision:

Develop in this order:

```text
1. AI Analysis UX Completion
2. Analysis Trust
3. Coaching
```

The current stage is AI Analysis Product Completion, not AI Coach.

Implementation boundary:

```text
video upload
-> async analysis
-> analysis completed
-> result restored
-> Rider-facing Summary
-> user-understandable result
```

Current Analysis Trust work:

- Evidence Extraction
- ObservedFacts
- Validators
- CandidateTrace
- KnowledgeRules
- Rider-facing Summary
- Calibration

Result:

- AI Coach remains unimplemented.
- A second API call remains out of scope.
- Prompt/schema/validator changes should wait until real-video calibration
  shows repeated patterns.
- Cold Start Loading is implemented. Startup now separates Loading State from
  Empty State and shows "기록을 불러오는 중입니다" while remote Moments are being
  restored.
- Durable Analysis Pipeline Phase 8 MVP is implemented. Supabase Storage now
  provides temporary durable analysis input for new evidence jobs. The verified
  path is: source video upload -> `moment-videos` object -> `moments`
  storage columns -> `analysis_jobs` input storage columns -> server-side
  automatic job start from `/source-video` -> Render Storage download -> Gemini
  Evidence Extraction -> `evidence_results` persistence -> completed restore.
- Build 14 QA exposed a durability gap: storage upload succeeded, but analysis
  start still depended on the app's second `/analyze-stored-video` request.
  `cf71b58 feat: start analysis automatically after storage upload` removed
  that dependency. `/analyze-stored-video` remains as legacy/fallback only.
- Real Render + Gemini Pro E2E after `cf71b58` verified `queued -> processing ->
  completed`, `analysis_jobs.started_at`, `evidence_results` creation, and
  `source_video_storage_status=deleted`.
- Supabase Storage must be treated as temporary durable analysis-input storage,
  not permanent video archive storage. The app should play local video when a
  local URI exists. If the local video is gone, the Moment can still be valid
  with thumbnail, EvidenceResult, and Rider-facing Summary only. After analysis
  completes, the source object should be deletable immediately or after a short
  QA/retry retention window. Reanalysis may require reuploading the original
  video.
- The direct multipart evidence upload path remains as fallback/debug path.
- Source video cleanup after successful stored-video analysis is implemented as
  best-effort cleanup. Success sets `source_video_storage_status=deleted`;
  failure sets `delete_failed` and logs a warning without failing the completed
  analysis.
- Stale queued/processing cleanup is implemented during `/api/moments` restore.
  Old jobs that cannot reasonably complete are marked failed while completed
  evidence remains protected.
- App-facing progress language was updated to separate `대기`, `분석중`,
  `완료`, and `실패`. Stale cleanup failures are shown as normal failed
  analysis without exposing technical job terms.
- Push Notification MVP is implemented:

```text
upload
-> close app
-> analysis completes
-> push notification
-> open result
```

Implementation notes:

- App startup requests notification permission and registers an Expo push token.
- Render exposes `/api/push-tokens` and sends a best-effort Expo push after
  successful EvidenceResult persistence.
- Push failure is warning-only and must not fail analysis.
- `supabase/phase9_device_push_tokens.sql` adds the `device_push_tokens` table.
  For this checkpoint, the remote Supabase phase9 migration is assumed applied.
- Notification tapping opens the app. Detail deep link navigation is not
  implemented yet.
- `expo-notifications` is now a native plugin, so a new EAS iOS
  preview/internal build is required for device QA.

Build 22 handoff:

Build 22 has been created as the next preview/internal QA build. It is the
handoff point for the next session; do not start additional implementation
before installing and checking it on the device.

Included status:

- Build 22 includes the upload-first Moment creation refactor. The app now uses
  `POST /api/moments/from-source-video` as the default upload path.
- The source video must reach temporary durable Storage before the server
  creates a Moment and AnalysisJob.
- The Upload screen remains open during source upload and warns the rider not
  to close the app before upload completion.
- After upload completion, server-side analysis owns the job and can continue
  after app close.
- Fileless upload-first requests return 400 without creating `moments`,
  `analysis_jobs`, or `evidence_results`.
- Build 19/20 validated durable analysis, Push, completed restore, deletion
  sync, app boot loading, thumbnail fallback, and delete feedback remain part of
  the baseline.
- Navigation stack investigation: the app currently renders `HomeScreen`
  directly from `App.tsx`; Upload is an `isComposerOpen`-driven `UploadSheet`
  modal, and Detail is a `selectedSessionId`-driven `MomentDetailModal`.
  React Navigation / Expo Router are not in use.
- Detail edge-swipe dismiss remains paused. Detail should likely become the
  first route-backed screen later, but not before Build 22 upload-first QA.

Next session QA checklist:

1. Install Build 22.
2. Upload a real video on the iPhone and confirm the Upload screen stays open
   until source upload completes.
3. Confirm interrupted upload does not leave an incomplete remote Moment that
   looks like a stuck analysis job.
4. Confirm completed analysis restores after app relaunch.
5. Confirm Push delivery.
6. Confirm thumbnail fallback and delete-in-progress feedback did not regress.

QA data policy:

Do not automatically reset the database after preview/internal builds. Keep QA
data by default for analysis-time measurement, calibration, and usage-pattern
review. During build reports, report counts only:
`moments`, `analysis_jobs`, `evidence_results`, and `device_push_tokens`.
Delete only when the Founder explicitly requests reset/initialization.

Build 23 real-device QA update:

Build 23's first real-device UX pass is broadly successful. Boot Loading is
confirmed to be based on local restore plus `/api/moments` remote sync, with an
8 second timeout; it is not a fixed loading splash. The blocking Upload Overlay
felt natural and made the upload-before-analysis phase understandable. The
tested upload was about 18.25 MB and about 9 seconds long, with a perceived
upload wait of about 5-8 seconds.

Directional timing from the latest QA row:

- Upload start estimate to server file/storage flow entry: about 5.2 seconds.
- Server Storage/Moment creation side: about 3.9 seconds.
- Job queue/start: within roughly 1 second.
- Gemini `started_at -> completed_at`: about 50.7 seconds.
- Push was received, perceived as arriving after more than 1 minute and before
  3 minutes.
- Result restore worked.
- Delete was intentionally not tested so QA data/logs could remain available.

Progress percentage is not required immediately. The next timing step is to
capture paired iPhone `[upload_timing]` logs and Render Dashboard
`[source_video_timing]` logs before changing upload architecture.

Signed/direct upload architecture decision:

Signed/direct upload is now implemented in code as the default upload path,
with Render multipart retained as fallback:

```text
app
-> POST /api/video-upload-targets
-> Supabase signed direct upload
-> POST /api/moments/from-uploaded-source
-> Storage object verification
-> Moment/AnalysisJob
-> Gemini analysis
```

The legacy `POST /api/moments/from-source-video` path remains available. The
app first attempts direct upload + finalize, then falls back to multipart if
the direct path fails.

Upload target tracking is prepared in `supabase/phase10_upload_targets.sql`.
The target lifecycle is `issued -> uploaded -> finalized`, with `failed` for
finalize/create failures. Orphan candidates are old `issued`, `uploaded`, or
`failed` rows. Automatic deletion is not implemented. The migration is applied
remotely and verified with an empty `upload_targets` table before the next
build. Server tracking remains best-effort and should not break upload if
tracking fails.

Upload Draft decision:

Local Draft Resume is removed from the current P1 upload path. The app still
uses a short-lived in-memory `UploadDraft` while the Upload screen is open, but
it no longer persists selected local videos for app re-entry.

```text
video selected
-> in-memory upload draft
-> UploadScreen stays open
-> step-based upload progress
-> signed/direct upload
-> finalize
-> Moment/AnalysisJob
```

Implementation status:

- `UploadDraft` is local-only and in-memory for the active Upload screen.
- Video selection creates a draft without creating a remote Moment.
- App re-entry no longer prompts the rider to resume a previous local draft.
- `UploadScreen` renders from the current selected video / in-memory draft.
- Upload success clears the draft and closes the Upload screen.
- Upload failure keeps retry possible within the current screen.

The concepts remain separate: Draft is user work in progress, signed/direct
upload is the transport method, finalize turns uploaded media into a Moment,
and Moment means the server has durable input and can analyze. Orphan cleanup
automation remains unimplemented. Future multi-user draft design should be
server-side upload-session based and should account for future `userId`,
stronger user-scoped Storage policies, ownership validation, and cleanup
automation.

Next stage:

Continue Build 23 device QA. Verify more real uploads, collect timing logs,
keep DB data, and avoid code changes until repeated bottleneck or UX patterns
are visible.

Navigation refactor direction:

Keep the current modal/conditional-rendering structure during Build 22 QA.
Later, split HomeScreen state ownership, move Detail toward a route-backed
`MomentDetailScreen`, connect Push deep link to Moment Detail, then consider
moving Upload to an `UploadScreen`. Evaluate React Navigation or Expo Router
only after the screen model is clear.

Durable analysis design:

```text
docs/DURABLE_ANALYSIS_PIPELINE_PLAN.md
```

## 2026-06-20 Evidence Calibration Save Point

Problem:

The product reached a useful analysis stage: one Gemini Pro call can create
EvidenceResult data, validators can downgrade risky interpretations, and the
Detail screen can show a rider-facing summary. The remaining risk is that
future changes could be driven by a single clip instead of a repeated pattern.

Why it mattered:

Action Sports Journal is trying to become a trustworthy wakeboard knowledge
system, not a demo that sounds confident. If prompt/schema/validator changes
are made from one isolated result, the analysis may improve for that one video
while regressing for other real riding clips.

Decision:

Keep the default upload path inside the Gemini one-call Evidence Extraction
boundary. Do not implement AI Coach and do not add a second API call yet. Use
real-video calibration as the next product loop.

Implementation:

- Rider-facing Analysis Summary is implemented above detailed evidence.
- Confidence wording is conservative:
  - `근거 충분`
  - `가능성 있음`
  - `확인 필요`
- User-facing fallback text no longer exposes internal storage names such as
  Supabase.
- Session restore/sync code is separated into focused patch helpers and
  `useSyncRemoteMoments`.
- `docs/EVIDENCE_POSTPROCESSING_CALIBRATION_MATRIX.md` now defines the QA table
  for real-video analysis calibration.

Result:

- Latest checkpoint: `cc01177`.
- Current stage: Evidence Extraction -> post-processing -> Rider-facing
  Analysis Summary.
- AI Coach is still not implemented.
- A second API call is still not part of the default upload flow.

Next stage:

```text
Upload 5 to 10 real wakeboard videos.
Record raw candidate, ObservedFacts, Validator result, CandidateTrace, and
Rider-facing Summary in the calibration matrix.
Only improve prompt/schema/validators after repeated patterns appear.
```

## 2026-06-20 Rider-facing Analysis Checkpoint

Problem:

The app could already extract rich Gemini evidence, but the Detail screen still
felt too close to raw model output and infrastructure/debug language. That made
the result harder for a rider to understand and risked making review-level
signals sound like final coaching.

Why it mattered:

Action Sports Journal is not trying to become a generic AI video analyzer. The
product needs to first tell the rider what appears to be happening in the clip,
with clear uncertainty, before offering coaching. If the analysis layer is not
trustworthy and readable, a later AI Coach layer will amplify weak assumptions.

Decision:

Keep the current normal analysis cost profile at one Gemini Pro call per
uploaded Moment. Treat that call as Evidence Extraction, not full coaching.
Improve post-processing and rider-facing wording first. Defer the real AI Coach
to a separate future layer and likely a separate AI call.

Implementation:

- Added a Rider-facing Analysis Summary layer over the existing EvidenceResult.
- Tightened confidence labels from strong-sounding labels to:
  - `근거 충분`
  - `가능성 있음`
  - `확인 필요`
- Kept raw Gemini/Evidence details available below the summary.
- Removed user-facing internal storage wording from restored evidence fallback
  text.
- Continued refactoring HomeScreen sync code without changing UI behavior.

Result:

- Latest checkpoint: `0c216eb`.
- The current stage is Evidence Extraction + Rider-facing Analysis Summary.
- Real AI Coach is not implemented yet.
- Normal upload still uses one Gemini Pro request per Moment unless the user
  retries analysis.
- OpenAI benchmark and future coach paths are not part of the default upload
  flow.

Next stage boundary:

```text
Current:
Video -> Gemini Evidence Extraction -> Validators/Knowledge -> Rider-facing Summary

Future:
Stable Analysis Summary -> AI Coach layer -> personalized coaching/progression
```

Recommended next step:

Run a few real videos through the current post-processing and calibrate the
rider-facing language. Do not add a second coaching API call until the analysis
summary is consistently understandable and conservative.

## 2026-06-20 Empty Baseline iPhone QA Save Point

Confirmed facts:

- Supabase test Moment data was cleared for a clean personal QA baseline.
- Bundled seeded mock sessions were removed from the app.
- When Supabase has no Moments, the app now starts from empty-state UI instead
  of showing placeholder sessions such as "저녁 케이블 파크 세션" or
  "아침 도크 스타트".
- The latest EAS preview/internal iOS build includes the empty baseline.

Latest commits:

```text
7cbe640 chore: bump iOS preview build number
b7eeb64 chore: remove seeded mock sessions
```

Latest build:

```text
Version: 1.0.0
iOS Build Number: 6
Build ID: aa0b7383-dadd-41a6-bb0b-bd39da229927
Build URL: https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/aa0b7383-dadd-41a6-bb0b-bd39da229927
```

Current EAS preview endpoint:

```text
https://action-sports-journal-api.onrender.com/api/analyze-session-video
```

Current Render mode:

```text
mockAi.enabled=false
geminiEvidence.model=gemini-2.5-pro
```

Next starting point:

```text
Install build 6 on iPhone.
Confirm empty baseline.
Upload one real wakeboard video.
Verify thumbnail, Moment creation, Supabase restore, async analysis, and real
Gemini result wording.
```

## 2026-06-16 Gallery UX and Model Benchmark Wrap-Up

Latest confirmed checkpoint:

```text
c1ed80a Simplify home to gallery layout
```

Latest EAS preview/internal distribution build:

```text
Profile: preview
Platform: iOS
Build URL: https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/d015ec0b-0c0f-4862-8e94-429faaa9442d
```

Confirmed repository state at wrap-up:

```text
local HEAD = origin/master = c1ed80a
git status = clean
```

What changed today:

- Added dev-only native video edge benchmark runner.
- Added Ground Truth Dataset v1 under `dev-artifacts/benchmark-videos/`.
- Added benchmark smoke/full modes.
- Ran and documented Gemini 2.5 Flash vs Gemini 2.5 Pro smoke benchmark.
- Simplified Home from Instagram-style feed/story/bottom-sheet UX to a private
  iOS Photos-style Moment gallery.
- Replaced bottom sheet detail UI with a full-screen detail modal so content
  scrolls naturally and does not clip at the bottom.
- Created an EAS preview build for real iPhone QA of the new gallery/detail UI.

Important benchmark documents:

```text
docs/MODEL_BENCHMARK_PLAN.md
docs/MODEL_BENCHMARK_FLASH_PARTIAL_REPORT.md
docs/MODEL_BENCHMARK_REPORT_2026_06_16.md
```

Benchmark conclusions:

- Ground Truth Dataset v1 has 12 clips:
  - Toe 6 / Heel 6
  - Regular 6 / Goofy 6
  - Regular Toe 3 / Regular Heel 3
  - Goofy Toe 3 / Goofy Heel 3
- Gemini 2.5 Flash smoke result:
  - 10/12 correct, 83.3%.
  - 1 high-confidence wrong.
  - 1 unknown/invalid JSON case.
  - Goofy clips exposed reliability risk.
- Gemini 2.5 Pro smoke result:
  - 12/12 correct, 100%.
  - 0 high-confidence wrong.
  - 0 hallucination flags.
  - About 2x slower than Flash.
- Product implication:
  - Flash is fast and cheaper but risky for edge-critical high-confidence
    decisions.
  - Pro is slower but currently much more reliable on the smoke dataset.
  - Next model strategy should consider full benchmark or hybrid routing.

UX conclusions:

- The app currently fits a personal gallery model better than an SNS feed model.
- Users are primarily reviewing their own riding Moments.
- Story rail and feed card structure added visual noise for the current product
  stage.
- Bottom Sheet detail UI was not appropriate because analysis/evidence content
  can be long and needs natural vertical scrolling.

Next starting point:

1. Install/open the latest EAS preview build on the registered iPhone.
2. QA Home gallery:
   - 2-column square tiles
   - thumbnail framing
   - status badge readability
   - add Moment flow
3. QA full-screen detail modal:
   - video playback at top
   - evidence text scrolling
   - no bottom clipping
   - retry/delete controls
4. If UI feels acceptable, decide next:
   - run full benchmark (`benchmarkMode=full`) for Flash/Pro, or
   - design hybrid routing for edge-critical cases, or
   - harden async analysis with durable video storage.

Do not start new backend/Auth/storage/product expansion before iPhone QA of the
new gallery/detail UI unless the user explicitly changes priority.

## 2026-06-16 Async Analysis MVP Validation Wrap-Up

Latest confirmed checkpoint:

```text
7d83e7e Keep async evidence jobs queued on enqueue delay
```

Confirmed facts:

- `origin/master` includes `0e9594e` for the Async Analysis MVP.
- `origin/master` includes `7d83e7e` for route-scoped rate limiting and queued
  state preservation on evidence enqueue delay.
- Render backend is redeployed with the rate-limit fix.
- Render `/health` returns `ok: true`, `geminiConfigured: true`, and
  `geminiEvidence.configured: true`.
- Render `/health` also reports that only upload/AI routes are rate limited.
  Health, Moment reads, and status polling are not counted.
- A new standalone iOS EAS preview/internal distribution build was created for
  validation:

```text
Version: 1.0.0
Build Number: 5
Build URL: https://expo.dev/accounts/jspark88/projects/action-sports-journal/builds/66b48f3c-5564-4ddd-aa20-698f201e6204
```

- The build was installed and tested by the Founder.
- The validation flow works:

```text
video selected
-> queued
-> app immediately closed
-> wait 2-3 minutes
-> app relaunched
-> completed restored
```

Technical decisions:

- Do not mark a Moment failed when `/api/extract-session-evidence` enqueue
  fails because of `429`, `408`, `503`, or network-like errors.
- Keep the app-facing state aligned with the durable Supabase job state.
- A job should become `failed` only when the backend records an actual job
  failure.
- Route-scoped rate limiting is appropriate for the Async MVP. Global rate
  limiting is not appropriate because it can block polling and status reads.

Current boundary:

- Async Analysis MVP is validated for personal standalone iPhone usage.
- The current worker is still an in-process Render background task that uses the
  uploaded request buffer. It is good enough for MVP validation, but not a
  durable queue/storage architecture.
- No Auth, Push, Supabase Storage, CDN, or external queue has been added.

Next starting point:

1. Decide whether to harden Async Analysis next with durable video storage
   before broader usage.
2. Recommended hardening path: Supabase Storage video object + AnalysisJob
   references storage path + worker can retry after process restart.
3. If not hardening infrastructure next, resume iPhone QA on Detail Screen and
   Moment result UX.

## 2026-06-15 Infrastructure Wrap-Up

Today closed with two pushed commits:

```text
91e8d7c Prepare Supabase phase 1 and standardize Node 22
fcbfb92 Document async analysis transition plan
```

What changed:

- Supabase Phase 1 setup guide was added.
- Supabase client scaffold was added for future mobile use.
- Supabase connection smoke test script was added.
- Initial SQL schema draft was added for `users`, `moments`,
  `analysis_jobs`, and `evidence_results`.
- Node project standard was changed to Node 22 LTS.
- Async analysis transition plan was added.

Current architecture direction:

```text
Moment created
-> immediate UI return
-> AnalysisJob tracks background analysis
-> EvidenceResult stores Gemini evidence output
-> Moment status becomes completed or failed
```

Important boundaries:

- No Auth UI yet.
- No Storage integration yet.
- No Job Queue yet.
- Supabase env values are present locally but are not committed.
- Supabase connection smoke test passes with the service role key.
- Phase 1 tables exist and service-role table grants are applied.
- `npm run supabase:smoke` reports `schemaReady: true`.
- `npm run supabase:write-smoke` proves server-side insert/update/delete.
- Gemini Evidence Extraction now attempts to persist an `evidence_results` row
  when an existing Moment is linked by `momentId` or UUID `sessionId`.
- The app still uses the current evidence extraction flow until async
  implementation begins.

Next starting point:

1. Switch local shell to Node 22 LTS with `nvm install && nvm use`.
2. Correct the local Gemini API key before real linked Evidence Extraction
   verification.
3. Run a real Evidence Extraction request with a linked `momentId`.
4. Confirm the created `evidence_results` row and linked Moment latest IDs.
5. Then implement async analysis using `docs/ASYNC_ANALYSIS_PLAN.md`.

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
- `InversionObservedFacts` v1 was implemented with observed-only fields:
  `bodyInverted`, `boardAboveHead`, `rollAxisObserved`, `flipAxisObserved`,
  `inversionDuration`, `inversionEvidenceCount`, and
  `antiInversionEvidence`.
- Invert Family is now blocked unless `boardAboveHead`, `bodyInverted`, or
  `rollAxisObserved` is true.
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

- Validate `InversionObservedFacts` v1 on the real test clip before modifying
  trick classification again.
- V1 facts: `bodyInverted`, `boardAboveHead`, `rollAxisObserved`,
  `flipAxisObserved`, `inversionDuration`, `inversionEvidenceCount`, and
  `antiInversionEvidence`.
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
- No user-facing database integration yet; Supabase Phase 1 scaffolding exists.
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

Use Node 22 LTS when running Expo locally.

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
- `docs/SUPABASE_PHASE_1_SETUP.md`: Supabase Phase 1 project and connection setup
- `docs/ASYNC_ANALYSIS_PLAN.md`: synchronous to asynchronous analysis transition plan
- `supabase/phase1_schema.sql`: initial Supabase schema draft
- `scripts/smoke-test-supabase.mjs`: Supabase connection smoke test
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

- User-facing database integration
- Authentication UI
- Phone login
- Coupons
- Expense tracking
- Calendar
- RAG
- Production video upload or storage
- Production database/cloud storage implementation
- Background job queue

Do not put Gemini or OpenAI API keys in the mobile app. Real AI analysis should go through a server/BFF endpoint.

## How To Resume In A New Terminal Codex Session

```bash
cd /Users/parkjongsun/Repository/action-sports-journal-app
codex
```

Suggested first prompt:

```text
AGENTS.md, docs/PROJECT_MEMORY.md, docs/HANDOFF.md, docs/CURRENT_STAGE.md, docs/CONTINUITY_CHECKPOINT.md, docs/SUPABASE_PHASE_1_SETUP.md, docs/ASYNC_ANALYSIS_PLAN.md를 먼저 읽고, Supabase Phase 1 smoke test와 동기 분석 -> 비동기 분석 전환 작업을 이어서 진행해줘.
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

Do not add unrelated product features yet. Continue from the current Supabase
Phase 1 and async analysis transition work unless the user explicitly switches
back to AI evidence truthfulness or UX QA.

1. Correct the local Gemini API key before real linked Evidence Extraction
   verification.
2. Run a real Evidence Extraction request with a linked `momentId`.
3. Confirm the created `evidence_results` row and linked Moment latest IDs.
4. Use `docs/ASYNC_ANALYSIS_PLAN.md` to start the async analysis transition.
5. Keep Auth UI, Storage, Push, Queue, scoring, and coaching expansion out of
   scope until explicitly requested.

## Related Personal Context Repo

The user also has a private Codex context repository:

```text
/Users/parkjongsun/Repository/codex-personal-context
https://github.com/jongsunP/codex-personal-context
```

That repository stores non-secret context for cross-session continuity.
