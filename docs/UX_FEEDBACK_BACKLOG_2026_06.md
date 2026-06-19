# UX Feedback Backlog - 2026-06

## Context

This backlog is based on Simulator and Render Mock AI QA feedback.

The current app direction is good enough to continue, but several UX details need to be prioritized before deeper feature work.

This document is planning only. Do not implement from this document without a follow-up implementation task.

## Prioritization Rules

Priority is based on:

- User friction in the current core flow
- Frequency of exposure
- Risk of confusing analysis state or AI trust
- Implementation complexity
- Dependency on new UI primitives such as bottom sheets or local notifications

Priority levels:

- P1: High impact, near-term UX blocker or repeated QA friction
- P2: Important polish or trust improvement, but not blocking the current flow
- P3: Exploratory, lower urgency, or dependent on larger design decisions

## P1

### 1. Unified User-Facing Status Resolver

Problem:

The user should only see three states everywhere:

- 진행중
- 완료
- 실패

Current status concepts such as queued, processing, completed, and failed are useful internally, but the visible UX should be simpler and consistent.

Decision direction:

Create one user-facing status resolver used by all surfaces.

Apply to:

- Home
- Recent Sessions
- Primary Insight
- Journal Timeline
- Video list
- Detail

Recommended mapping:

- queued -> 진행중
- processing -> 진행중
- completed -> 완료
- failed -> 실패

Impact:

High. This directly affects trust and reduces confusion across the app.

Difficulty:

Medium.

Dependencies:

- Review current local/remote moment status resolver
- Avoid changing backend status semantics
- UI-only resolver should not break async job logic

Notes:

The same moment id should always resolve to the same visible status across every screen.

### 2. Upload Entry UX: Replace Duplicate Home CTA with Upload Bottom Sheet

Problem:

Home currently has both a top plus button and a large "새 분석 시작" card. This duplicates the same action and makes the first screen feel heavier.

Desired direction:

Keep one upload entry point in the top area as an upload icon button.

When tapped, open a bottom sheet:

- Title: 영상 업로드
- Description: 라이딩 영상을 AI로 분석합니다.
- Inputs:
  - 제목
  - 설명
- Buttons:
  - 영상 선택
  - 업로드

Remove the large "새 분석 시작" card after the bottom sheet is ready.

Impact:

High. This simplifies the Home first screen and makes upload feel like a native app action.

Difficulty:

Medium to high.

Dependencies:

- Bottom sheet primitive
- Existing composer logic
- Existing video picker and upload flow

Notes:

Do not change backend upload logic. This should reorganize the existing composer UX.

### 3. Detail More Menu Behavior

Problem:

The current more menu uses a native alert/action menu pattern that shows a cancel button and may not match the desired "tap outside to dismiss" behavior.

Desired direction:

- Remove visible cancel button
- Dismiss on outside tap
- Keep menu simple
- Always show "분석 다시 시도" and "삭제"
- "분석 다시 시도" should be disabled unless retry is actually needed

Impact:

High. This is visible in Detail and affects perceived polish.

Difficulty:

Medium.

Dependencies:

- Lightweight custom overlay menu or bottom sheet/menu primitive
- Retry eligibility resolver

Notes:

Native Alert may not be enough because it usually includes explicit cancel behavior. A custom modal menu may be needed.

### 4. Retry Eligibility Resolver

Problem:

"분석 다시 시도" is currently too available. Users may not understand why they should retry when a result is already complete.

Desired direction:

The menu item is always visible, but disabled by default.

Enable retry only when:

- status is failed
- analysis is stale or incomplete
- evidence is missing but video exists
- processing/queued appears stuck beyond a defined threshold

Impact:

High. This prevents unnecessary repeated analysis and improves user trust.

Difficulty:

Medium.

Dependencies:

- Clear retry eligibility rules
- Moment status resolver
- Possibly stale analysis threshold

Notes:

Do not change API behavior first. Start with UI eligibility rules.

## P2

### 5. Trick Review Bottom Sheet

Problem:

The current "기술 검토" card exposes only a simple confirmation action. The real desired flow requires reviewing AI candidates and optionally entering a custom trick name.

Desired direction:

The full "기술 검토" card should be clickable.

Tap opens a bottom sheet with an Instagram comment-sheet-like feel:

- AI candidate list
- Candidate confidence or review label
- Direct input field
- Ability to select a candidate
- Ability to type a custom value
- Confirm action

Impact:

Medium to high. Important for AI trust and review workflows, but not required for basic viewing.

Difficulty:

High.

Dependencies:

- Bottom sheet primitive
- Candidate Trace data
- User-confirmed trick persistence decision
- Whether confirmation is local-only or saved to Supabase

Notes:

Do not put this inside the more menu. It belongs directly under the video preview as a review action.

### 6. AI Result Visual Summary Gauges

Problem:

AI result detail is currently text-heavy. Users need a quick visual scan before reading detailed evidence.

Desired direction:

Add a "한눈에 보는 요약" section above detailed explanation.

Example:

- 팝: ██████
- 로테이션: ████
- 랜딩: █

Then show detailed explanation below.

Impact:

Medium. Improves comprehension and makes results feel more productized.

Difficulty:

Medium.

Dependencies:

- Define which dimensions are supported
- Map existing evidence to visual scores conservatively
- Avoid pretending to measure exact performance if the evidence is weak

Notes:

Start with conservative, qualitative bars. Do not imply exact scoring yet.

### 7. Detail Information Hierarchy Polish

Problem:

Detail is now much improved, but the final hierarchy around video, review action, note, summary, and evidence still needs real-device QA.

Desired direction:

Maintain current structure:

Header
↓
Video
↓
Trick Review if needed
↓
User note/description if present
↓
Visual summary
↓
Detailed evidence

Impact:

Medium.

Difficulty:

Low to medium.

Dependencies:

- P2 visual summary
- P2 trick review bottom sheet

Notes:

Avoid adding more cards unless they clarify scan behavior.

## P3

### 8. Analysis Complete Notification

Problem:

Async analysis may complete after the user has left the screen. The app may need a way to tell users when analysis is done.

Options to investigate:

- In-app notification or toast
- Local push notification
- Polling-driven status update only
- Future remote push notification

Impact:

Medium, but not urgent while QA is active and the app is open.

Difficulty:

Unknown to high.

Dependencies:

- Notification permission flow
- Local notification support
- App foreground/background behavior
- Async job completion reliability

Notes:

This needs investigation before implementation. Do not implement until the notification strategy is clear.

### 9. Icon Quality Upgrade

Problem:

Current bottom navigation icons are simple manually drawn shapes. Direction is acceptable, but final quality will eventually need better icons.

Desired direction:

Replace with a consistent icon set when dependency policy allows it.

Impact:

Low to medium.

Difficulty:

Low, if an icon library is approved.

Dependencies:

- Decision on icon library
- Visual design pass

Notes:

Do not add a new icon library only for this unless broader UI polish work justifies it.

## Recommended Implementation Order

### Step 1: Status Resolver

Implement the unified visible status resolver first.

Reason:

It affects every screen and reduces confusion immediately.

Scope:

- UI-only status mapping
- Shared helper
- Apply to Home, Recent Sessions, Journal, Video list, Detail

### Step 2: Detail Menu and Retry Eligibility

Improve the Detail more menu and retry state next.

Reason:

It is a direct QA issue and a small but visible trust improvement.

Scope:

- Custom dismissible menu or lightweight overlay
- Always show "분석 다시 시도"
- Disable unless retry is needed
- Keep "삭제"

### Step 3: Upload Bottom Sheet

Replace the duplicate Home CTA with one upload entry point and bottom sheet.

Reason:

This improves the first screen and aligns the app with iOS-style interaction.

Scope:

- Upload icon button in header
- Bottom sheet composer
- Reuse existing upload flow
- Remove "새 분석 시작" card only after sheet is working

### Step 4: Trick Review Bottom Sheet

Build the trick review workflow after the bottom sheet primitive exists.

Reason:

It depends on the bottom sheet pattern and has product/data implications.

Scope:

- Full card tap
- AI candidate list
- Direct input
- Confirm action
- Decide local vs persisted confirmation

### Step 5: AI Visual Summary

Add visual summary gauges after the main flow is stable.

Reason:

It improves comprehension but must be carefully mapped to avoid false precision.

Scope:

- "한눈에 보는 요약"
- Conservative gauge labels
- Detailed evidence remains below

## Non-Goals For Immediate Implementation

- Do not change API contracts.
- Do not change Supabase schema.
- Do not change AI prompts.
- Do not add push notifications yet.
- Do not add new icon libraries yet.
- Do not implement full progression or scoring systems from this backlog alone.
