# Current Stage

`docs/PROJECT_MEMORY.md` is the primary source of truth and project operating
system. Read it first for top-level project memory, collaboration rules,
product philosophy, AI architecture direction, and current resume point.

## Stage

Stage 1: Initial project setup complete.

Stage 2: Local-only ActivityGroup / Session prototype complete.

Stage 3: Standalone iPhone video-to-analysis prototype in progress.

## Current Status

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

Email Recovery is no longer blocked at the email-send/rate-limit step. The fresh
test email `parksunl88@nate.com` confirmed `updateUser({ email })` success,
email receipt, and magic-link template behavior. Final linking did not complete
because the clicked link landed on
`http://localhost:3000/#error=access_denied&error_code=otp_expired...`. Email
Recovery remains a baseline/fallback path and needs redirect URL / deep-link
strategy plus a link-validity-window QA pass before productization.

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
  tokens. Recovery attempts do not yet have a dedicated structured DB row.
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
optional recovery-attempt observability and Email Recovery deep-link strategy.
Kakao display-name sync remains low urgency.

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
