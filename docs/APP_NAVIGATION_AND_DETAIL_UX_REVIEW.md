# App Navigation and Detail UX Review

## Purpose

Document UX findings from standalone iPhone QA after Home v2 and define the
next design direction for navigation, status sync, and detail layout.

This is a planning document only. It does not include implementation, API
changes, database changes, or prompt changes.

## QA Context

The current app can run the real user flow:

```text
Select video
-> upload to backend endpoint
-> async analysis job
-> Supabase persistence
-> polling / restore
-> Home and Detail display
```

The latest QA goal was to use backend mock AI mode so the app can validate real
upload, backend, persistence, polling, and UI behavior without Gemini/OpenAI
cost.

## Current Home v2 Remaining UX Problems

Home v2 correctly moved the product away from a pure gallery. However, several
MVP-level issues remain:

- Navigation is still one-screen-heavy.
- Videos, analysis results, status, and detail actions all compete inside Home.
- Upload state can look stuck on `queued` even when the user expects analysis to
  be actively running.
- List status and Detail status can appear inconsistent when polling or restore
  data updates at different moments.
- Detail still feels too much like a debug/result container instead of a smooth
  journal entry.
- The lower action area in Detail adds visual weight and can be merged into the
  top menu.

## Bottom Navigation Direction

Recommended bottom tabs:

```text
Home
Video
Flow
Profile
```

Korean UI labels can be:

```text
홈
영상
흐름
개인정보
```

The bottom navigation should make the product feel like an iOS app with clear
areas instead of a single prototype screen.

### Tab Roles

| Tab | Role | Primary Question |
| --- | --- | --- |
| Home | Dashboard summary across the app | What should I look at now? |
| Video | Session/video archive and filters | Which clips and sessions do I have? |
| Flow | Progression, practice flow, trends | How am I changing over time? |
| Profile | User settings and account-like area | Who am I and what is configured? |

### Home

Home should remain the dashboard. It should not become another list tab.

Home should show:

- start new analysis CTA
- latest insight
- active analysis status
- recent sessions rail
- short journal timeline
- lightweight links into Video and Flow

Home should avoid:

- showing every video as the main content
- becoming a full filter/search screen
- exposing backend/debug terminology

### Video

Video is the focused archive tab.

It should show:

- all Moments/Sessions with thumbnails
- date grouping
- status badges
- future filters by date and trick
- failed or incomplete uploads that need user attention

This is the right place for stronger gallery behavior.

### Flow

Flow is the future progression tab.

It should eventually show:

- practiced tricks
- recent focus
- improvement signals
- repeated review candidates
- next practice points
- trend-style summaries

For MVP, Flow can start as a simple placeholder or conservative list of recent
analysis themes. It should not invent progression claims before data exists.

### Profile

Profile is the general My Page area.

It can eventually include:

- user profile
- ActivityGroups
- app preferences
- privacy/export settings
- subscription or account settings if needed later

For the current stage, it can remain minimal.

## Status Display Policy

Status should be user-facing and consistent across Home, Video, and Detail.

| Backend State | User Label | Meaning | UX Treatment |
| --- | --- | --- | --- |
| `queued` | 준비 중 | Upload accepted, waiting for worker/job start | Very short-lived if possible |
| `processing` | 분석 중 | Backend is actively extracting evidence | Show active progress state |
| `completed` | 분석 완료 | Evidence result exists and Moment can be reviewed | Show result summary |
| `failed` | 분석 실패 | Job failed without usable result | Show retry/support path |

### Queued

`queued` should not feel like a stuck state.

Recommended rule:

- Immediately after upload, local UI can optimistically show `processing`.
- If the backend explicitly returns only `queued`, the card can say `준비 중`
  briefly.
- If `queued` lasts too long, show a calm message such as:

```text
서버가 분석을 시작할 준비를 하고 있습니다.
```

But the normal user expectation after upload is:

```text
업로드 완료 -> 분석 중
```

### Processing

`processing` should be the main active state after upload.

Recommended copy:

```text
분석 중
영상에서 어프로치와 회전 근거를 확인하고 있습니다.
```

In mock mode, this should quickly move to `completed` unless the backend itself
fails.

### Completed

`completed` means a usable evidence result exists.

If the result needs review, the badge can still be `분석 완료`, but the result
copy should clearly say:

```text
확인 필요
검토 후보: 백롤 계열
```

Do not make review candidates look like confirmed trick labels.

### Failed

`failed` should mean the backend flow failed and no usable result was saved.

Recommended copy:

```text
분석 실패
다시 시도할 수 있습니다.
```

If a completed EvidenceResult already exists, a later retry failure should not
overwrite the Moment into a misleading failed state.

## Mock Mode Expected Status Flow

Mock AI mode should preserve the real app/backend flow while skipping only
external AI calls.

Expected flow:

```text
Upload selected
-> Moment created
-> UI shows processing
-> backend mock fixture runs
-> evidence_results row inserted
-> Moment completed
-> polling restores completed result
-> Home and Detail show same status/result
```

Mock mode should not:

- call Gemini
- call OpenAI
- bypass multipart upload
- bypass backend endpoint routing
- bypass persistence
- bypass response normalization

If mock mode stays on `queued`, investigate:

- whether the app is calling the expected endpoint
- whether the local mock server is reachable from iPhone
- whether polling is loading the latest remote Moment
- whether Moment status and AnalysisJob status diverged

## List and Detail Status Sync Principles

The same Moment should never feel different between list and detail.

Recommended principles:

1. Use one status resolver shared by list cards and detail header.
2. Prefer EvidenceResult existence for completed display.
3. Treat `needs_review` as result quality, not as backend failure.
4. Keep operational status and result confidence visually separate.
5. Do not derive confirmed trick names from filenames when result says
   `확인 필요`.

Recommended display hierarchy:

```text
Moment.status / active local request
-> EvidenceResult.status
-> EvidenceResult.needs_review / confidence
-> candidateTrace
```

Example:

```text
분석 완료
확인 필요
검토 후보: 백롤 계열
```

This is better than:

```text
HS 백롤 시도
분석 완료
```

when the persisted result is not confirmed.

## Detail Screen v2 Direction

Detail should feel like a single journal entry, not a stack of debug panels.

Current rough structure:

```text
Top menu
Video
Content sections
Bottom buttons
```

Recommended v2 structure:

```text
Top bar
-> Close
-> More menu

Video

Result summary
-> status
-> confirmed result or review candidate
-> short explanation

Observed facts
-> approach
-> edge load
-> inversion / rotation

Journal notes
-> user title
-> notes
-> date
```

### Top Menu and Bottom Button Consolidation

Move bottom actions into the top menu or a compact action row near the header.

Candidate actions:

- retry analysis
- delete moment
- share later
- debug viewer in dev only

Recommended approach:

- Keep primary close/back action visible.
- Use a top-right menu for secondary actions.
- Avoid a persistent bottom button area unless there is one strong primary
  action.

### Reduce Internal Boxes

The content after video should feel connected.

Recommended style:

- fewer nested cards
- section dividers instead of boxed panels
- typography hierarchy over borders
- compact badges for status/confidence
- debug-only blocks hidden unless explicitly enabled

Avoid:

- card inside card
- heavy bordered result boxes
- repeated status blocks
- debug model details in normal user view

## Filter and Classification UX Draft

Filtering belongs mainly in Video and later Flow.

Initial filter candidates:

- date
- trick / candidate trick
- status
- needs review
- ActivityGroup

### Video Tab Filters

Video tab can support:

```text
All
Completed
Needs Review
Failed
```

Then later:

```text
Date
Trick
Edge direction
Landing outcome
```

### Flow Tab Filters

Flow should focus less on raw filters and more on progression views:

- tricks practiced recently
- most repeated candidates
- review-heavy areas
- landing outcome over time

This requires more reliable historical data, so it should remain later-stage.

## Dark and Light Theme Strategy

User preference is Apple-style, following device light/dark mode if practical.

Recommended direction:

- support system color scheme eventually
- use semantic colors instead of hardcoded black/white
- keep high contrast and readable typography
- avoid debug-looking neon accents
- keep cards subtle in both modes

Short-term option:

- keep dark-first if full theming is too large
- clean up spacing, typography, and card hierarchy first

Long-term target:

```text
System theme
-> light mode: white / near-white surfaces
-> dark mode: black / near-black surfaces
-> shared semantic accent
```

## Implementation Priority

### Priority 1: Status Clarity

Fix the upload/analysis state experience first.

Goals:

- upload should quickly look like `processing`
- mock mode should complete unless backend fails
- Home/list/detail should show the same status
- completed review candidates should not look confirmed

### Priority 2: Bottom Navigation Shell

Add the app-level structure:

```text
홈 / 영상 / 흐름 / 개인정보
```

Keep each tab minimal at first.

### Priority 3: Detail v2 Simplification

Refactor Detail presentation:

- top menu actions
- simpler content flow after video
- fewer internal boxes
- clearer review candidate section

### Priority 4: Video Tab Filters

Move heavier gallery/filter behavior into Video:

- date grouping
- status filters
- needs-review filter

### Priority 5: Theme System

Introduce semantic color tokens and device color-scheme support.

Do this after navigation/status structure is stable so theming does not hide
product flow issues.

## Immediate Fix Candidates

These are the most urgent UX fixes before larger redesign:

1. After upload, show `분석 중` instead of lingering on `분석 대기` when the app
   has already queued extraction.
2. Make list and detail use the same status resolver.
3. Ensure `확인 필요` results never show a confirmed trick as the main card title.
4. Simplify Detail action placement by moving bottom actions toward the top menu.
5. Hide Debug Viewer in standalone QA unless explicitly enabled.

## Non-Goals For Next Implementation Pass

- No new database schema.
- No new AI prompt changes.
- No new model routing.
- No full visual redesign.
- No advanced Progression claims.
- No complex filter engine.

The next pass should make the current real flow feel reliable and coherent
before adding more product surface.
