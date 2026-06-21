# Mobile App UX Audit - Build 23

## Purpose

Audit the current Action Sports Journal app after Build 23 from a mobile-first
UX perspective. This document identifies where the app still feels like
web-style conditional rendering or prototype state management, and separates
near-term UX fixes from later structural refactors.

This is an investigation and planning document only. It does not include code
changes, build changes, database changes, or upload QA.

## Build 23 Real Device QA Findings

Build 23 real-device UX QA passed at the product-flow level.

Observed behavior:

- Boot Loading felt natural on the device.
- Boot Loading is not a fixed decorative delay. It waits for local restore and
  `/api/moments` remote sync, with an 8 second timeout as fail-open protection.
- Upload Overlay felt natural. The full-screen blocking state and centered
  spinner made it clear that upload is a separate step before analysis.
- Upload wait time felt roughly 5-8 seconds for the tested video.
- The tested file was about 18.25 MB and about 9 seconds long.
- Estimated upload start to server file/storage flow entry was about 5.2
  seconds.
- Estimated server Storage/Moment creation work was about 3.9 seconds.
- Job queue/start was within roughly 1 second.
- Gemini `started_at -> completed_at` took about 50.7 seconds.
- Push notification was received successfully.
- Push arrival was perceived as more than 1 minute and less than 3 minutes.
- Result restore worked after returning to the app.
- Delete was intentionally not tested in this QA pass so logs and data could be
  preserved.

Timing interpretation:

The current numbers are useful directional estimates, but not enough for an
architecture change. To identify the exact bottleneck, the next timing review
must capture both:

- iPhone `[upload_timing]` logs.
- Render Dashboard `[source_video_timing]` logs.

Progress bar decision:

A progress bar is not mandatory for the current MVP. The blocking overlay is
acceptable for the observed 5-8 second upload wait. Progress percentage should
be reconsidered only after multiple real-device timing samples show that users
regularly wait long enough to need more granular feedback.

Current decision:

Continue Build 23 QA and keep code changes paused. Do not tune upload
architecture, progress UI, or analysis logic from a single successful QA run.

## Current Context

Build 23 includes:

- upload-first Moment creation
- blocking upload overlay
- upload timing logs
- durable analysis and source cleanup
- Push completion notification
- foreground refresh and remote restore
- Detail thumbnail fallback
- delete feedback

Current product principle:

```text
Mobile app feel matters more than simply making the feature work.
```

The app should prefer mobile-native navigation, lifecycle, gesture, pending,
and foreground/background behavior over web-style conditional rendering.

## Reviewed Areas

- Boot Loading
- Home
- Upload flow
- Analysis status
- Moment list
- Moment Detail
- Delete flow
- Push after app return
- Empty state
- Error state
- Cross-device sync
- Navigation / modal / page structure
- Gesture / back behavior
- Loading / disabled / pending states

## Summary Judgment

The core Build 23 flow is structurally stronger than before:

```text
source upload
-> Moment creation
-> AnalysisJob creation
-> server-owned analysis
-> restore/completed display
```

The biggest remaining app-feel issues are not AI analysis logic. They are:

1. Navigation is not yet stack-based.
2. Detail is still a modal-like conditional surface.
3. Upload is still a Home-owned modal instead of a route-backed upload page.
4. Some loading and empty surfaces still show prototype-style copy.
5. Push opens the app but does not deep link to the completed Moment.

## Area Findings

### 1. Boot Loading

Current structure:

- `App.tsx` renders `HomeScreen` directly.
- `HomeScreen` blocks Home while local restore and remote moment sync are
  pending.
- The boot screen is not only decorative; it is tied to data readiness.

Current behavior:

```text
local restore
-> remote /api/moments sync or timeout/failure
-> Home
```

Assessment:

- Mobile-app direction is mostly correct.
- Loading and empty state are separated better than before.
- If remote sync times out or fails, Home can still open and data may appear
  later through foreground/polling behavior. This is acceptable as fail-open
  behavior, but the user does not yet see a clear "sync delayed" hint.

Priority:

P2.

Recommendation:

Keep current boot loading. Later add a quiet sync-delayed state if QA shows the
empty-to-data transition still feels like a bug.

### 2. Home

Current structure:

- Home owns almost all app state.
- Home coordinates tabs, upload, detail, sync, deletion, thumbnails, local
  persistence, and evidence display.

Assessment:

- The visual Home direction is acceptable for current QA.
- The technical responsibility is too broad for long-term maintenance.
- The broad state ownership makes route-backed Detail/Upload harder.

Priority:

P2 now, P1 before route refactor.

Recommendation:

Do not redesign Home before Build 23 QA. Later split state ownership into hooks
or a session controller before moving Detail/Upload into route-backed screens.

### 3. Upload Flow

Current structure:

- Upload is `UploadSheet`.
- It is opened by `HomeScreen` through `isComposerOpen`.
- It is a full-screen `Modal`, not a stack screen.
- Build 23 adds a blocking upload overlay while `isSubmitting` is true.

Assessment:

- Near-term UX is acceptable for Build 23 QA.
- The new blocking overlay correctly communicates that upload is a distinct
  phase before analysis.
- Structurally, Upload still belongs to Home and behaves more like a modal
  composer than a mobile app page.

Priority:

P1 for Build 23 QA validation, P2 for later stack conversion.

Recommendation:

Continue Build 23 real-device QA. Do not move Upload to a stack screen until
upload-first stability and timing data are confirmed across more samples.

Later:

- Convert to `UploadScreen`.
- Preserve the upload-first invariant.
- Consider upload progress only after collecting timing logs.

### 4. Analysis Status

Current structure:

- Internal statuses include:

```text
uploading
upload_failed
queued
processing
completed
failed
```

- User-facing resolver maps these into running/completed/failed surfaces.
- Upload and analysis states are now separated.

Assessment:

- This is much better than the earlier "everything is analysis중" issue.
- The copy is mostly mobile-appropriate.
- A few status labels remain compact or technical around queued/failed, but not
  blocking.

Priority:

P2.

Recommendation:

Keep current model for Build 23. After QA, review whether users understand:

- upload in progress
- upload complete / analysis can continue after app close
- long Gemini analysis can take 1-5 minutes
- failed vs upload_failed

### 5. Moment List

Current structure:

- Recent rail and video archive both render from the same session summaries.
- Thumbnails are shown when available.
- Status dot overlays are shown.

Assessment:

- App-feel is acceptable.
- The status dot alone may be too subtle when an item is active or failed.
- Cross-device thumbnail fallback is now present but still depends on available
  thumbnail metadata.

Priority:

P2.

Recommendation:

Do not redesign list now. Later consider a clearer active/failed state treatment
in list rows, especially for long-running analysis.

### 6. Moment Detail

Current structure:

- Detail is `MomentDetailModal`.
- It opens from `HomeScreen` through `selectedSessionId`.
- It is a full-screen `Modal`, not a navigation stack route.
- The earlier edge-swipe dismiss was removed/paused because it felt unnatural.

Assessment:

- This is the largest remaining mobile-app structural issue.
- Detail behaves like a page visually, but technically it is a modal owned by
  Home.
- This explains why native-feeling swipe back was awkward.

Priority:

P1 after Build 23 upload-first QA.

Recommendation:

Do not re-add gesture patches to the current modal. Later convert Detail first:

```text
Home/List
-> MomentDetailScreen
```

Then connect:

- iOS native swipe back
- Push deep link to Moment Detail
- cleaner deletion and retry surfaces

### 7. Delete Flow

Current structure:

- Detail delete uses a native `Alert` confirmation.
- Delete button shows disabled/deleting feedback.
- Remote delete is called when a remote Moment ID exists.

Assessment:

- Functionally acceptable.
- Native confirmation is reasonable on iOS.
- The delete action still lives inside modal Detail rather than a route-backed
  screen.

Priority:

P3 unless QA reports confusion.

Recommendation:

Keep current delete flow for Build 23. Revisit after Detail becomes a route.

### 8. Push After App Return

Current structure:

- App registers Expo push token when enabled.
- Push opens the app.
- Foreground refresh reloads remote moments on app active.
- No deep link to specific Moment Detail yet.

Assessment:

- Functional MVP is acceptable.
- From an app-feel perspective, notification tap should eventually land on the
  completed Moment.

Priority:

P2 after Detail route exists.

Recommendation:

Do not implement Push deep link before route-backed Detail. Deep link should
target `MomentDetailScreen`.

### 9. Empty State

Current structure:

- Empty states exist for recent sessions and video archive.
- During boot, a full-screen loading screen appears before Home.
- Some component-level fallback copy still says `Wake Board Loading...`.

Assessment:

- Functionally okay.
- `Wake Board Loading...` is still prototype-like and inconsistent with the
  more polished Korean copy.

Priority:

P1 small polish.

Recommendation:

Replace prototype loading strings with Korean app copy later:

```text
기록을 불러오는 중입니다
라이딩 기록과 분석 결과를 준비하고 있습니다
```

### 10. Error State

Current structure:

- Errors often use `Alert`.
- Upload failure and analysis failure copy exist.
- Delete failure has an Alert.

Assessment:

- Alerts are acceptable for hard failures.
- Repeated Alert-based handling can feel abrupt if used for recoverable states.

Priority:

P2.

Recommendation:

Keep hard failure Alerts for now. Later consider inline recovery cards for:

- upload_failed
- failed analysis
- sync delayed

### 11. Cross-Device Sync

Current structure:

- Remote moments are restored into local session state.
- Local/remote mapping has been stabilized.
- Local video URI is preserved if available.
- Remote thumbnail fallback is used when local video is missing.

Assessment:

- Direction is correct for this stage.
- The product policy is clear: original video is not permanent; thumbnail and
  analysis result may remain.

Priority:

P2.

Recommendation:

Keep current behavior. After more QA rows accumulate, verify:

- same Moment does not duplicate across devices
- completed results attach to the correct card
- deleted remote Moment does not return after foreground refresh

### 12. Navigation / Modal / Page Structure

Current structure:

- No React Navigation.
- No Expo Router.
- `App.tsx -> HomeScreen`.
- Upload and Detail are Home-owned modals.

Assessment:

- This is the main web-like/prototype-like structure.
- It is acceptable temporarily because the current priority is upload-first
  durability.
- It should not be treated as final architecture.

Priority:

P1 structural backlog after Build 23 QA.

Recommendation:

Migration order:

1. Keep Build 23 structure for QA.
2. Split HomeScreen state ownership.
3. Convert Detail to route-backed `MomentDetailScreen`.
4. Connect Push deep link to Detail.
5. Convert Upload to `UploadScreen`.
6. Evaluate React Navigation vs Expo Router.

### 13. Gesture / Back Behavior

Current structure:

- Detail uses a custom back button inside a modal.
- No native iOS swipe back.
- Edge swipe dismiss is paused.

Assessment:

- Correct decision to pause gesture patching.
- Gesture should come from route structure, not another modal hack.

Priority:

P2 after Detail route conversion.

Recommendation:

Do not patch gestures again until Detail is a route-backed screen.

### 14. Loading / Disabled / Pending States

Current structure:

- Upload disables close/change/upload while submitting.
- Blocking upload overlay now makes the pending state obvious.
- Delete shows `삭제 중...` feedback.
- Boot blocks Home until initial data readiness or timeout.

Assessment:

- This is now mostly acceptable.
- The biggest remaining small issue is inconsistent loading copy in lower
  surfaces.

Priority:

P1 small polish for copy, P2 for deeper pending-state system.

Recommendation:

Near-term: clean prototype loading strings.
Later: standardize pending-state copy and visuals across Boot, Upload, list,
Detail, and sync.

## Priority Matrix

### No Immediate Problem

- Boot Loading structure.
- Upload-first architecture.
- Delete disabled/deleting feedback.
- Cross-device thumbnail fallback.
- Foreground refresh concept.

### Fix Soon

1. Replace remaining `Wake Board Loading...` prototype copy.
2. Continue Build 23 upload overlay QA on real iPhone.
3. Use timing logs to separate upload bottlenecks before changing architecture.
4. Review upload_failed / failed copy after real failed cases.

### Later Structural Improvements

1. Split HomeScreen state ownership.
2. Convert Detail to route-backed `MomentDetailScreen`.
3. Connect Push deep link to Moment Detail.
4. Convert Upload to `UploadScreen`.
5. Evaluate React Navigation or Expo Router.
6. Add native-style swipe back after route conversion.

## Recommended Work Order

1. Continue Build 23 real iPhone QA.
2. Collect upload timing logs from one or more real uploads.
3. Small copy polish for remaining prototype loading strings.
4. Continue upload-first and restore QA until stable.
5. Start Detail route planning.
6. Implement route-backed Detail only after the current durable flow is stable.

## Current Decision

Do not start navigation stack conversion immediately. Build 23's upload-first
UX passed the first real-device check, but the next highest value is continuing
QA and collecting paired iPhone/Render timing logs. Route-backed Detail is the
first recommended structural refactor after that validation.
