# Home v2 Implementation Plan

## Purpose

Define the MVP scope for implementing Home v2.

References:

- `docs/ACTION_SPORTS_JOURNAL_UX_VISION.md`
- `docs/HOME_V2_WIREFRAME.md`

This document is implementation planning only. It does not include code changes.

## MVP Goal

Home v2 should make the app feel less like a video gallery and more like an
Apple-style sports journal, while keeping the current hero feature clear:

```text
Upload video
-> start AI analysis
-> review evidence/insight
```

The MVP should focus on:

- making AI analysis entry obvious
- presenting the latest insight before the gallery
- keeping recent sessions easy to access
- preserving the full journal history
- avoiding fake progression claims

## Product Principles

- Gallery is not the main screen concept.
- Video is evidence attached to a Session.
- Session remains the center of the product.
- AI analysis CTA should act as the top hero action.
- Home should show meaning first, media second.
- Do not invent Progression data that does not exist yet.
- Mock AI backend flow should allow fast UI iteration without external AI cost.

## MVP Sections To Implement

Recommended Home v2 MVP order:

```text
Header
New Analysis CTA
Primary Insight Card
Recent Sessions Rail
Journal Timeline
```

### 1. Header

Purpose:

- Set current ActivityGroup context.
- Make the screen feel like a personal journal.

What to show:

```text
Wakeboard
오늘의 라이딩 저널
```

Optional MVP metadata:

- recent session count
- latest completed analysis date

Data source:

- `selectedGroup`
- `visibleSessions`
- `geminiEvidenceBySessionId`

Implementation note:

- Replace current "Wakeboard Moments / 내 라이딩 갤러리" framing with journal
  language.
- Keep add/start action visually accessible.

### 2. New Analysis CTA

Purpose:

- Preserve the current MVP's core value: start AI video analysis.
- Make upload/analyze feel like the primary action, not a hidden composer.

What to show:

```text
새 분석 시작
라이딩 영상을 추가하면 세션에 AI 근거 분석을 연결합니다.
```

Possible actions:

- open current composer
- pick video
- save session
- queue evidence extraction

Data source:

- existing `isComposerOpen`
- `title`
- `notes`
- `selectedVideo`
- `handlePickVideo`
- `handleAddSession`
- `handleExtractEvidence`

Implementation note:

- Reuse current composer flow first.
- The CTA can wrap or reveal the existing composer.
- Do not create a separate upload path.
- The backend path must remain real:

```text
app -> /api/moments -> /api/extract-session-evidence -> Supabase -> polling
```

### 3. Primary Insight Card

Purpose:

- Show the latest meaningful analysis result before the user opens a session.
- Make Home feel insight-led instead of media-led.

What to show:

Completed state:

```text
오늘의 인사이트
Toeside Basic Air
toe edge load가 final approach에서 안정적으로 보입니다.
분석 완료 · 6월 18일
```

Processing state:

```text
분석 중
최근 세션에서 어프로치와 랜딩 근거를 확인하고 있습니다.
```

Empty state:

```text
첫 인사이트를 만들어보세요
새 분석을 시작하면 이곳에 요약이 표시됩니다.
```

Needs-review state:

```text
확인이 필요한 분석
AI가 기술명 또는 근거를 확신하지 못했습니다.
```

Data source:

- latest completed `GeminiEvidenceResult`
- `primaryCandidate.name`
- `evidence`
- `confidence`
- `requiresUserConfirmation`
- `consistencyStatus`
- `Session.occurredAt`
- `momentStatus`

Implementation note:

- Select latest completed evidence by `Session.occurredAt`.
- If no completed evidence exists, show processing or empty state.
- Tapping the card should open the relevant `MomentDetailModal`.

### 4. Recent Sessions Rail

Purpose:

- Keep recent Moments accessible without making the whole screen a gallery.
- Show Sessions as journal entries, not files.

What to show:

- horizontal cards
- date
- detected trick or session title
- one-line evidence summary
- status badge
- small thumbnail

Data source:

- `visibleSessions`
- `thumbnailsBySessionId`
- `geminiEvidenceBySessionId`
- `getMomentStatus`
- `getMomentStatusLabel`
- `getSessionCardPresentation`

Implementation note:

- Reuse current card presentation helpers where possible.
- Change layout from 2-column grid to horizontal rail.
- Tapping a card opens `MomentDetailModal`.

### 5. Journal Timeline

Purpose:

- Preserve full session history below the more curated Home sections.
- Keep archive access without making it the first screen experience.

What to show:

```text
저널
6월 18일
  Toeside Basic Air
  Heelside Back Roll

6월 16일
  Edge benchmark test
```

Data source:

- `visibleSessions`
- `Session.occurredAt`
- `Session.title`
- `GeminiEvidenceResult.primaryCandidate.name`
- `GeminiEvidenceResult.evidence`
- `momentStatus`
- optional thumbnail

Implementation note:

- Start with a simple vertical list.
- Grouping by date is useful but can be added after the first pass.
- Rows should be text-led, not thumbnail-led.

## Sections To Defer

### Practicing Now

Reason to defer:

- Current data can infer recent trick names, but cannot reliably know the
  user's active focus.

Future requirement:

- user-selected focus trick
- repeated attempts grouped by trick
- user confirmation

MVP fallback:

- Do not show this section yet, or show it only as a placeholder in later
  design work.

### Progression

Reason to defer:

- No first-class Progression model exists yet.
- Cross-session improvement claims would be speculative.

Future requirement:

- structured attempts
- confirmed trick labels
- trend calculations
- progression milestones

MVP fallback:

- Avoid language like "improved", "more consistent", or "best attempt" unless
  backed by explicit data.

### Advanced Next Practice Points

Reason to defer:

- Current evidence can support simple hints, but not a full coaching plan.

Future requirement:

- coaching result persistence
- progression context
- repeated weakness detection

MVP fallback:

- If included later, use conservative static or rule-based prompts.
- Do not make it a top MVP requirement.

## Existing HomeScreen Pieces To Reuse

Current file:

- `src/features/sessions/HomeScreen.tsx`

Reusable state and logic:

- `visibleSessions`
- `selectedSession`
- `selectedSessionId`
- `selectedSessionVideo`
- `geminiEvidenceBySessionId`
- `videosBySessionId`
- `thumbnailsBySessionId`
- `remoteMomentIdsBySessionId`
- `extractingEvidenceBySessionId`
- `handlePickVideo`
- `handleAddSession`
- `handleExtractEvidence`
- `openEvidenceSheet`
- `syncRemoteMoments`
- `persistMomentToSupabase`

Reusable helpers:

- `getMomentStatus`
- `getMomentStatusLabel`
- `getMomentStatusStyle`
- `getMomentStatusMessage`
- `getCompletedMomentEvidence`
- `getSessionCardPresentation`
- `formatSessionDateTime`
- `formatShortSessionDate`
- `compactCardText`

Reusable components:

- `MomentDetailModal`
- `GeminiEvidenceView`
- `LocalSessionVideoPlayer`
- `DebugResultViewer`

## New Component Candidates

Keep components local to `HomeScreen.tsx` at first unless the file becomes too
large.

Candidate components:

- `HomeHeader`
- `NewAnalysisCard`
- `PrimaryInsightCard`
- `RecentSessionsRail`
- `RecentSessionCard`
- `JournalTimeline`
- `JournalTimelineRow`

Do not introduce a new design system or navigation framework for this MVP.

## Expected Implementation Files

Likely first pass:

- `src/features/sessions/HomeScreen.tsx`

Possible later split:

- `src/features/sessions/components/HomeHeader.tsx`
- `src/features/sessions/components/PrimaryInsightCard.tsx`
- `src/features/sessions/components/RecentSessionsRail.tsx`
- `src/features/sessions/components/JournalTimeline.tsx`

No backend changes should be required for Home v2 MVP.

## Implementation Order

### Step 1: Derive Home Summary Data

Add local derived values:

- latest completed evidence session
- latest active/processing session
- recent sessions list
- timeline sessions list

No visual redesign yet.

### Step 2: Add Header And New Analysis CTA

Replace gallery framing with journal framing.

Keep existing composer behavior, but present it as:

```text
새 분석 시작
```

### Step 3: Add Primary Insight Card

Use latest completed evidence if available.

Fallback order:

1. latest processing/queued session
2. latest session without completed evidence
3. empty state

### Step 4: Convert Gallery To Recent Sessions Rail

Reuse existing session card presentation logic.

Change visual hierarchy:

```text
square grid
-> horizontal recent session cards
```

### Step 5: Add Journal Timeline

Add full history below the rail.

Start simple:

- one vertical row per session
- no complex grouping required for MVP

### Step 6: Keep Detail Modal Unchanged

The detail modal already supports:

- video
- summary
- evidence result
- retry
- delete
- debug

Do not redesign detail in the Home v2 MVP unless the Home changes break it.

## Mock AI Backend Flow Usage

Home v2 MVP should be tested with:

```bash
MOCK_AI_ANALYSIS=true
```

Why:

- app still uploads a real video
- backend endpoint remains real
- async job still runs
- Supabase persistence still runs
- polling/restore still runs
- UI iteration avoids external AI cost and wait time

Test fixtures:

- `basic_air`
- `back_roll`

Recommended UI checks:

- empty Home
- processing state
- completed Primary Insight Card
- Recent Sessions Rail after mock completion
- Journal Timeline restore after app relaunch

## Risks

### Home Becomes Too Busy

Risk:

- Adding many sections at once can make the first screen feel cluttered.

Mitigation:

- Keep MVP sections short.
- Put only one primary insight on top.
- Keep timeline lower on the page.

### Progression-Like Claims Without Progression

Risk:

- UI might imply improvement or trends without enough data.

Mitigation:

- Defer Practicing Now and Progression.
- Use conservative language.

### Analysis CTA Gets Hidden

Risk:

- Journal direction may accidentally make upload/analyze harder to find.

Mitigation:

- Keep New Analysis CTA near the top.
- Treat it as the hero action.

### Detail Modal Mismatch

Risk:

- Home becomes polished while detail remains debug-heavy.

Mitigation:

- Accept this for MVP.
- Keep debug content lower in future detail refinement.

### Horizontal Rail Ergonomics

Risk:

- Too many horizontal sections can feel awkward.

Mitigation:

- Use only one horizontal rail in MVP: Recent Sessions.

## MVP Definition Of Done

Home v2 MVP is done when:

- Home no longer opens as a 2-column gallery-first screen.
- A user can immediately start a new AI analysis.
- Latest completed analysis appears as a Primary Insight Card.
- Recent sessions are accessible through a horizontal rail.
- Full history remains accessible through a Journal Timeline.
- Existing upload/backend/async/Supabase/polling/detail flow still works.
- No Progression claims are shown without real Progression data.

## Summary

Implement now:

- Header
- New Analysis CTA
- Primary Insight Card
- Recent Sessions Rail
- Journal Timeline

Defer:

- Practicing Now
- Progression
- advanced Next Practice Points

This MVP keeps the current AI analysis product value visible while moving the
app toward the long-term Apple-style sports journal direction.
