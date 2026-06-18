# Home v2 Wireframe

## Purpose

Define the information structure for the next Home screen of Action Sports
Journal.

This document is based on:

- `docs/ACTION_SPORTS_JOURNAL_UX_VISION.md`
- current `src/features/sessions/HomeScreen.tsx`

This is not an implementation task. It does not define exact spacing, colors,
Figma frames, or code changes.

## Product Direction

Home v2 should move from:

```text
video gallery
```

to:

```text
Apple-style sports journal dashboard
```

The Home screen should answer:

```text
What happened recently?
What did the app learn?
What am I practicing?
What should I do next?
Where is my session history?
```

Video remains important, but video is supporting evidence attached to a
Session. The Home screen should lead with meaning, not file thumbnails.

## Full Screen Structure

Recommended order:

```text
SafeAreaView
  ScrollView
    Header
    Primary Insight Card
    Practicing Now
    Next Practice Points
    Recent Sessions Rail
    Journal Timeline
```

Why this order:

1. Header sets personal context.
2. Primary Insight gives immediate value.
3. Practicing Now frames long-term growth.
4. Next Practice Points turns analysis into action.
5. Recent Sessions keeps recency and media access.
6. Journal Timeline preserves history.

Recent Sessions can move above Practice Points in early MVP if implementation
is easier, but the long-term Home should not open as a thumbnail grid.

## Display Priority

Priority from highest to lowest:

1. Latest meaningful insight
2. Current practice focus
3. Next recommended action
4. Recent completed or processing sessions
5. Full session history
6. Debug/raw analysis detail

Debug and raw evidence should stay in the detail screen or internal debug view,
not on Home.

## Data Sources

Already available:

- `sessions`
- `geminiEvidenceBySessionId`
- `videosBySessionId`
- `thumbnailsBySessionId`
- `remoteMomentIdsBySessionId`
- `momentStatus`
- `Session.title`
- `Session.notes`
- `Session.occurredAt`
- `GeminiEvidenceResult.primaryCandidate`
- `GeminiEvidenceResult.family`
- `GeminiEvidenceResult.confidence`
- `GeminiEvidenceResult.evidence`
- `GeminiEvidenceResult.approachObservedFacts`
- `GeminiEvidenceResult.edgeLoadObservedFacts`
- `GeminiEvidenceResult.inversionObservedFacts`
- `GeminiEvidenceResult.landingOutcome`
- `GeminiEvidenceResult.requiresUserConfirmation`
- `GeminiEvidenceResult.consistencyStatus`

Partially available:

- coaching-style suggestions
- progression signals across multiple sessions
- practice focus
- best attempt
- trend language

Not yet available as durable first-class data:

- user-selected focus trick
- progression model
- weekly/monthly activity stats
- user-confirmed skill goal
- structured practice plan
- human-readable trend summaries

## Section 1: Header

### Purpose

Set the current sport/activity context and make the screen feel personal.

### What It Shows

Example:

```text
Wakeboard
오늘의 라이딩 저널
```

Optional metadata:

```text
최근 세션 12개
마지막 분석 6월 18일
```

### Data Used

Current MVP:

- active ActivityGroup name
- visible session count
- latest session date

Future:

- selected ActivityGroup
- current season/month
- current focus trick
- activity summary

### MVP Feasibility

Yes.

Current data is enough:

- `mockActivityGroups`
- `selectedGroup`
- `visibleSessions`

### Progression Connection

Later, Header can show:

- current focus trick
- weekly session count
- recent improvement streak

Do not implement that logic in the first Home v2 pass.

## Section 2: Primary Insight Card

### Purpose

Give the user immediate value when opening the app.

This should be the strongest signal that the app is a journal and coaching
companion, not a file browser.

### What It Shows

State: completed evidence exists

```text
오늘의 인사이트
Toeside Basic Air
toe edge load가 final approach에서 안정적으로 보입니다.
분석 완료 · 6월 18일
```

State: processing

```text
분석 중
최근 세션에서 어프로치와 랜딩 근거를 확인하고 있습니다.
```

State: no evidence

```text
첫 인사이트를 만들어보세요
라이딩 영상을 추가하면 세션별 동작 근거를 정리합니다.
```

State: needs review

```text
확인이 필요한 분석
AI가 기술명 또는 approach를 확신하지 못했습니다.
```

### Data Used

Current MVP:

- latest completed `GeminiEvidenceResult`
- `primaryCandidate.name`
- `evidence`
- `confidence`
- `requiresUserConfirmation`
- `consistencyStatus`
- `createdAt`
- linked `Session.occurredAt`

Fallback:

- latest processing/queued Session
- empty state copy

### MVP Feasibility

Yes.

Can be derived from current in-memory and restored data.

No backend change required.

### Progression Connection

Later, this card can become:

- latest improvement
- best recent attempt
- "you are getting more consistent at X"
- "landing is still the limiting factor"

This requires cross-session progression logic, but the card slot can exist
before that logic is ready.

## Section 3: Practicing Now

### Purpose

Introduce the long-term growth layer.

This section answers:

```text
What am I currently working on?
```

### What It Shows

MVP example:

```text
진행 중인 기술
Heelside Back Roll
최근 세션에서 가장 자주 분석된 기술입니다.
```

Better future example:

```text
진행 중인 기술
Heelside Back Roll
최근 4회 시도 · edge load 안정 · landing timing 확인 필요
```

### Data Used

Current MVP:

- recent completed evidence
- most recent `primaryCandidate.name`
- repeated candidate names from recent sessions
- session titles as fallback

Future:

- user-selected focus trick
- confirmed trick labels
- grouped attempts by trick
- progression metrics
- consistency signals

### MVP Feasibility

Partially.

Simple MVP is possible:

- use latest completed detected trick
- or count repeated `primaryCandidate.name` in recent completed sessions

But true "practicing now" needs a user-confirmed focus or progression model.

### Progression Connection

Strong.

This section is the main entry point for future Progression Layer:

- focus trick
- attempts over time
- skill-specific signals
- next milestone

## Section 4: Next Practice Points

### Purpose

Convert analysis into an action.

This section answers:

```text
What should I try next time?
```

### What It Shows

MVP example:

```text
다음 연습 포인트
1. final approach에서 edge pressure 유지
2. takeoff 직전 handle을 몸 가까이에 유지
3. landing 직전 board direction 확인
```

State: no evidence

```text
다음 연습 포인트
1. 트릭 전후가 모두 보이도록 3~5초 길게 촬영
2. 라이더와 웨이크가 화면 안에 들어오게 촬영
3. 세션 제목에 시도한 기술을 짧게 기록
```

### Data Used

Current MVP:

- `GeminiEvidenceResult.evidence`
- `landingOutcome`
- `approachObservedFacts`
- `edgeLoadObservedFacts`
- `inversionObservedFacts`
- `uncertainty.reasons`
- `consistencyWarnings`
- session notes

Fallback:

- static wakeboard practice prompts

Future:

- coaching result suggestions
- progression model
- repeated weakness detection
- user goal

### MVP Feasibility

Partially.

Can start with rule-based extraction from existing evidence:

- if `requiresUserConfirmation`, suggest review
- if low confidence, suggest better filming
- if edge load evidence exists, suggest maintaining edge pressure
- if landing outcome is unstable/failed, suggest landing timing review

The first version should avoid pretending to be a full coach.

### Progression Connection

Strong.

Later, practice points should be generated from:

- repeated evidence patterns
- failed landing trends
- trick-specific progression stage
- prior attempts

## Section 5: Recent Sessions Rail

### Purpose

Keep fast access to recent Moments without making the whole Home screen a
gallery.

This section answers:

```text
What did I do recently?
```

### What It Shows

Horizontal cards:

```text
[6월 18일]
Toeside Basic Air
toe edge load 확인
분석 완료
small thumbnail
```

Each card should show:

- date
- detected trick or session title
- one-line evidence summary
- status badge
- small thumbnail

### Data Used

Current MVP:

- `visibleSessions`
- `thumbnailsBySessionId`
- `geminiEvidenceBySessionId`
- `momentStatus`
- `getSessionCardPresentation`
- `getMomentStatusLabel`

### MVP Feasibility

Yes.

Current gallery data can be reused. The main change is presentation:

```text
2-column square grid
-> horizontal journal cards
```

### Progression Connection

Medium.

Later, recent cards can include:

- personal best badge
- improvement marker
- repeated issue marker
- comparison to prior session

## Section 6: Journal Timeline

### Purpose

Preserve the user's full history in a calm, scannable way.

This section answers:

```text
What is my riding history?
```

### What It Shows

Grouped timeline:

```text
6월 18일
  Toeside Basic Air
  Heelside Back Roll

6월 16일
  Edge benchmark test
```

Each row:

- date or grouped date
- title/detected trick
- short result summary
- status
- optional small thumbnail

### Data Used

Current MVP:

- `visibleSessions`
- `Session.occurredAt`
- `Session.title`
- `GeminiEvidenceResult.primaryCandidate.name`
- `GeminiEvidenceResult.evidence`
- `momentStatus`
- thumbnail if available

### MVP Feasibility

Yes.

Can replace or supplement current gallery grid using the same data.

### Progression Connection

Medium to strong.

Later timeline rows can support:

- session comparison
- trick grouping
- monthly summaries
- progression milestones

## MVP Implementation Matrix

| Section | MVP possible now | Current data enough | Needs Progression |
| --- | --- | --- | --- |
| Header | Yes | Yes | No |
| Primary Insight Card | Yes | Yes | Later enhancement |
| Practicing Now | Partial | Partially | Yes |
| Next Practice Points | Partial | Partially | Yes for best version |
| Recent Sessions Rail | Yes | Yes | No |
| Journal Timeline | Yes | Yes | Later enhancement |

## Recommended MVP Cut

First Home v2 implementation should include:

1. Header
2. Primary Insight Card
3. Recent Sessions Rail
4. Basic Next Practice Points
5. Journal Timeline

Defer:

- true Practicing Now logic
- progression metrics
- trend summaries
- best attempt detection
- monthly stats

Reason:

The app already has enough data to make Home feel more like a journal without
building the full Progression Layer.

## Current Data Gaps

### User-Confirmed Focus

The app does not yet have a durable "I am practicing Back Roll" concept.

Impact:

- Practicing Now can only infer from recent evidence.

### Cross-Session Progression

The app does not yet compute repeated patterns across sessions.

Impact:

- No reliable trend statements yet.
- Avoid claims like "improved 20%" or "more consistent" until progression logic
  exists.

### Coaching Suggestions

Evidence extraction has rich observed facts, but not all results include a
clean user-facing coaching plan.

Impact:

- Next Practice Points should start as conservative rule-based prompts.

### User Confirmation

AI-detected trick names may be uncertain.

Impact:

- Home should surface needs-review state instead of over-presenting uncertain
  predictions.

## Wireframe Text Skeleton

```text
Wakeboard
오늘의 라이딩 저널

[Primary Insight Card]
오늘의 인사이트
Toeside Basic Air
toe edge load가 final approach에서 안정적으로 보입니다.
분석 완료 · 6월 18일

[Practicing Now]
진행 중인 기술
Back Roll
최근 세션 기준으로 추정 중

[Next Practice Points]
다음 연습 포인트
- final approach edge pressure 유지
- handle close
- landing timing 확인

[Recent Sessions Rail]
최근 세션
[card] [card] [card]

[Journal Timeline]
저널
6월 18일
  Toeside Basic Air
  Heelside Back Roll
```

## Implementation Notes For Later

- Keep Home user-facing and summary-oriented.
- Keep raw evidence and debug viewer inside detail/dev views.
- Do not remove the full-screen detail modal.
- Do not introduce a new backend dependency for first Home v2.
- Use existing restored Moment data before designing new APIs.
- Avoid saying "progress improved" until the Progression Layer exists.

## Summary

Home v2 should be built around:

```text
Insight
Practice
Recent Sessions
Journal History
```

The MVP can be implemented mostly from current data. The main missing layer is
true Progression, which should be introduced later as a first-class product
feature rather than faked in the UI.
