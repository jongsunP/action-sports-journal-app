# Action Sports Journal UX Vision

## Purpose

Action Sports Journal should feel less like a video upload utility and more
like an Apple-style personal sports journal.

Current product behavior is still important:

```text
Upload video
-> backend analysis
-> evidence result
-> session detail
```

But the long-term product feeling should be:

```text
Open app
-> understand today's riding story
-> see recent progress
-> know what to practice next
-> revisit sessions as meaningful journal entries
```

This document defines UX direction and information architecture only. It does
not include UI implementation or Figma-level design.

## Current HomeScreen Structure

Current source:

- `src/features/sessions/HomeScreen.tsx`

Current information flow:

```text
Home
-> Wakeboard Moments header
-> Add button
-> optional new moment composer
-> 2-column gallery grid
-> square thumbnail cards
-> status badge
-> tap card
-> full-screen detail modal
-> video
-> session summary
-> evidence result
-> retry/delete/debug actions
```

Current data shown on Home:

- Session title
- Thumbnail or fallback clip tile
- Date
- queued / processing / completed / failed status
- Minimal card title derived from evidence or session title

Current data shown in detail:

- Video
- Date and status
- Session title and notes
- Gemini evidence result
- AI prediction, family, confidence, facts, warnings, debug viewer

The app already has the correct technical backbone:

- real video upload
- async backend job
- Supabase persistence
- polling/restore
- full-screen detail view

The UX opportunity is to change the meaning of the Home screen.

## Current UX Problems

### Home Is Still File-Oriented

The 2-column square grid makes the app feel like a clip browser. This is useful
for checking that upload and thumbnails work, but it makes the product feel
closer to Photos or a media picker than a sports journal.

### Analysis Is Hidden Behind Video Cards

The most valuable user-facing output is not the uploaded file. It is the
interpreted result:

- what happened
- what improved
- what needs review
- what to try next

Currently those answers mostly live in the detail modal, so the Home screen does
not yet communicate progress at a glance.

### Status Is Operational

`queued`, `processing`, `completed`, and `failed` are useful backend states, but
they are not the emotional center of the app.

For users, the more meaningful states are:

- new insight ready
- needs review
- keep practicing this
- best recent attempt
- landing improved
- approach still unclear

### The Visual Tone Is Dark and Technical

The current dark gallery with green accents has a debugging/prototype energy.
It is functional, but the long-term target should feel more like a polished iOS
content app:

- white and black foundation
- calm accent color
- generous spacing
- precise typography
- card-based content
- horizontal sections
- readable summaries

## Limits Of Gallery-Centered UX

A gallery answers:

```text
Which videos do I have?
```

A journal should answer:

```text
What did I do?
What did I learn?
What is changing over time?
What should I practice next?
```

The gallery should remain available, but it should not be the primary mental
model. Videos are evidence attached to Sessions. They are not the product
itself.

## Journal-Centered UX Direction

The Home screen should become a personal dashboard for a user's action sports
life log.

Core principle:

```text
Session is the center.
Analysis is attached to Session.
Video is supporting evidence.
```

Recommended Home feeling:

- calm, white-first iOS surface
- black text and subtle gray hierarchy
- cards with soft borders or light fills
- large but not decorative typography
- horizontal content rails
- concise insight copy
- video thumbnails as supporting media, not the primary grid

The app should feel closer to:

- Apple Fitness summary cards
- Apple Health trend cards
- App Store editorial cards
- Journal entries
- Apple Developer clean navigation and typography

## Proposed Home Information Architecture

Recommended v2 Home hierarchy:

```text
Home
-> Today / current ActivityGroup header
-> Primary insight card
-> Recent Sessions horizontal rail
-> Progression / practicing now section
-> Next Practice Points
-> Journal timeline or compact session list
```

### 1. Header

Purpose:

- Identify the current sport/activity context.
- Make the app feel personal and current.

Example content:

```text
Wakeboard
오늘의 라이딩 저널
```

Optional metadata:

- session count this month
- latest completed analysis date
- current focus trick

Avoid:

- endpoint/debug language
- upload-first messaging
- large marketing hero

### 2. Primary Insight Card

Purpose:

- Show the most meaningful latest result.
- Make analysis feel like the value of the app.

Example card:

```text
오늘의 인사이트
Toeside Basic Air
어프로치에서 toe edge load가 안정적으로 보입니다.
다음에는 takeoff 직전 handle position을 더 가까이 유지해보세요.
```

Possible states:

- No analysis yet: "첫 세션을 추가해 인사이트를 만들어보세요."
- Processing: "최근 세션을 분석하고 있습니다."
- Needs review: "AI가 기술명을 확신하지 못했습니다. 확인이 필요합니다."
- Completed: latest insight summary

### 3. Recent Sessions

Purpose:

- Keep the existing Moment list, but make it feel like journal entries.
- Use thumbnails as small context, not as dominant square tiles.

Recommended layout:

```text
최근 세션
[ horizontal cards ]
```

Card content:

- date
- detected trick or session title
- one-line evidence summary
- small status badge
- thumbnail as compact media

Card should answer:

```text
What happened in this session?
```

not:

```text
What file is this?
```

### 4. Progression / Practicing Now

Purpose:

- Introduce the long-term product layer.
- Help users see that the app tracks growth, not just one-off analysis.

Example content:

```text
진행 중인 기술
Heelside Back Roll
최근 3회 중 2회: edge load 안정
아직 확인 필요: landing timing
```

This section can be static or derived later. It does not need full progression
logic in the first UI pass.

### 5. Next Practice Points

Purpose:

- Turn analysis into action.
- Make the app useful before the user opens a detail view.

Example content:

```text
다음 연습 포인트
1. takeoff 전 handle을 몸 가까이에 유지
2. final approach에서 edge pressure를 끊지 않기
3. landing 직전 board direction 확인
```

Source priority:

1. Latest completed evidence/coaching result
2. Needs-review warnings
3. Default activity-specific practice prompts

### 6. Journal Timeline

Purpose:

- Preserve history.
- Provide a scannable archive after insight cards.

This can replace the current 2-column gallery grid with a vertical list or
compact grouped sections:

```text
6월 18일
  Toeside Basic Air
  Heelside Back Roll

6월 16일
  Edge benchmark test
```

The timeline can include small thumbnails, but the primary text should be:

- trick/result
- summary
- date
- status

## Card Structure Examples

### Insight Card

```text
Label: 오늘의 인사이트
Title: Toeside Basic Air
Body: toe edge load가 final approach에서 안정적으로 보입니다.
Footer: 분석 완료 · 6월 18일
Action: 자세히 보기
```

### Session Card

```text
Date: 6월 18일
Title: Heelside Back Roll
Subtitle: boardAboveHead와 roll-axis evidence 확인
Badge: 분석 완료
Thumbnail: small rounded video still
```

### Practice Point Card

```text
Title: 다음 연습 포인트
Item 1: final approach edge load 유지
Item 2: takeoff 직전 handle close
Item 3: landing timing review
```

### Progression Card

```text
Title: 진행 중인 기술
Focus: Back Roll
Metric: 최근 세션 4개
Signal: inversion evidence stable, landing still variable
```

## Recommended Layout

Initial v2 Home layout:

```text
SafeAreaView
  ScrollView
    Header
    Primary Insight Card
    Recent Sessions horizontal ScrollView
    Practicing Now Card
    Next Practice Points Card
    Journal Timeline
```

On iPhone:

- use one-column vertical rhythm
- use horizontal rails only for small repeated cards
- avoid dense debug text
- keep cards 8-16px radius depending on existing style direction
- use generous section spacing

The detail screen should remain full-screen and scrollable. It should become
the place for:

- video playback
- full evidence
- debug details in dev
- retry/delete actions

Home should show summaries and direction, not raw analysis internals.

## Apple-Style Reference Patterns

Use these as pattern references, not literal copies.

### Apple Fitness

- Summary-first.
- Progress and activity are grouped into clear cards.
- Data is visual, but copy remains concise.

Useful for:

- current focus
- weekly/monthly riding summary
- streak/session count later

### Apple Health

- Trend cards explain what changed.
- The UI turns data into plain-language meaning.

Useful for:

- "landing consistency improved"
- "approach remains unclear"
- "edge load confidence increased"

### App Store

- Editorial cards make content feel curated.
- Horizontal sections help discovery without feeling like a file browser.

Useful for:

- recent sessions
- best moments
- recommended practice themes

### Journal

- Entries feel personal.
- Date, title, note, and media support reflection.

Useful for:

- user notes
- session summaries
- long-term activity history

### Apple Developer

- Clean typography and restrained navigation.
- Dense technical concepts are presented calmly.

Useful for:

- evidence/debug screens
- advanced analysis details

## Visual Direction

Preferred tone:

- white / near-white background
- black or near-black primary text
- gray secondary text
- restrained accent color
- soft cards
- subtle dividers
- iOS-native spacing

Avoid:

- dark prototype dashboard as the default
- neon-heavy sports styling
- feed UI that feels like social media
- thumbnail-only gallery as the primary screen
- long evidence/debug text on Home

## Connection To Progression Layer

The v2 Home structure prepares for Progression without implementing it yet.

Future data sources:

- Sessions
- AnalysisResults
- EvidenceResults
- trick family
- approach facts
- edge load facts
- inversion facts
- landing facts
- user-confirmed trick labels

Future Progression concepts:

- current focus trick
- recent attempts
- consistency signals
- known weaknesses
- best evidence result
- next practice point
- comparison between sessions

The Home screen should eventually answer:

```text
What am I working on?
What improved?
What should I do next?
Which sessions prove that?
```

## Implementation Priority

### Priority 1: Home Information Reorder

Keep existing data and logic, but change the order:

```text
Insight first
Recent sessions second
Timeline/gallery later
```

No new backend needed.

### Priority 2: Session Summary Cards

Create reusable cards from existing `GeminiEvidenceResult`:

- detected trick
- evidence summary
- status
- date
- thumbnail

### Priority 3: Next Practice Points

Derive a small list from existing evidence/coaching fields.

Fallback when no result:

- show default wakeboard prompts

### Priority 4: Progression Placeholder

Add a simple "진행 중인 기술" section using latest completed evidence and
session titles. Do not build a full progression engine yet.

### Priority 5: Detail Screen Refinement

Move debug-heavy content lower in the detail screen and make user-facing
analysis easier to read first.

## Summary

The next UX direction should not remove video. It should demote video from
"main product object" to "evidence attached to a journal entry."

The app should open on meaning:

```text
latest insight
recent sessions
current practice focus
next action
```

That is the difference between a video gallery and an action sports journal.
