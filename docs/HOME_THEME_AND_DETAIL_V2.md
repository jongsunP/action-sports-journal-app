# Home Theme and Detail v2

## Purpose

Document the next UX direction after real-device QA of the latest standalone
preview build.

This document focuses on:

1. Home background and theme direction
2. Detail Layout v2
3. Detail action placement
4. Floating Bottom Navigation

This is a design and implementation-planning document only. It does not include
code changes.

## Current Problems

### Home Background Feels Unfinished

The current Home v2 information structure is closer to the intended sports
journal direction, but the visual surface still feels transitional.

Observed issues:

- Light background can feel less aligned with the user's actual dark-mode
  device expectation.
- The app does not yet feel like it fully follows system theme.
- Dark mode currently affects the bottom tab shell more than the whole Home
  visual system.
- Cards and sections are still styled as separate surfaces instead of one calm
  iOS journal surface.

### Detail Still Feels Boxed

The current Detail view works functionally, but it feels like a stack of result
containers.

Observed issues:

- Video, summary, status, evidence, warnings, and actions feel separated into
  too many boxes.
- The area after the video has too much framed-panel energy.
- The user should feel they are reading one journal entry, not inspecting a
  technical report.

### Detail Actions Are Too Low

The lower action area adds visual weight and competes with the content.

Actions such as retry, delete, or debug should not dominate the bottom of the
detail flow. They are secondary controls and can move toward the top menu.

### Bottom Navigation Is Functional But Not Yet Native-Feeling

The current Bottom Navigation shell establishes the information architecture,
but it is still a simple full-width bar.

The desired direction is closer to modern iOS floating controls:

- visually detached from content
- rounded capsule or soft floating surface
- respects safe area
- does not feel like a heavy web footer

## Home Dark Mode Strategy

### Direction

Home should follow the device theme eventually.

Recommended long-term direction:

```text
System theme
-> Light mode: white / near-white journal surface
-> Dark mode: black / near-black journal surface
-> Shared semantic accents
```

However, given current QA priority, the next implementation should focus on
dark-mode polish first because the user's actual test device appears to be in
dark mode.

### Short-Term Target

If full theme tokenization is too large, implement a dark-first Home pass:

```text
App background: near black
Primary text: near white
Secondary text: muted gray
Cards: dark elevated surfaces
Borders: subtle dark separators
Accent: restrained, not neon
```

Recommended color character:

- background: near black
- card surface: charcoal
- text: white / gray hierarchy
- status badges: existing semantic colors, slightly softened
- tab surface: floating translucent dark capsule

### What Not To Do Yet

- Do not redesign the whole product theme system in one pass.
- Do not introduce many new brand colors.
- Do not create heavy gradients or decorative backgrounds.
- Do not make every card the same black rectangle without hierarchy.

## System Theme Follow Strategy

The app already can read system color scheme through React Native.

Recommended next step:

1. Define minimal semantic colors inside `HomeScreen.tsx` or a tiny local helper.
2. Apply them first to Home background, tab bar, and core cards.
3. Avoid broad refactors until the visual direction feels right on iPhone.
4. Later extract shared theme tokens if multiple screens need them.

MVP theme scope:

- Home container
- Header text
- Analysis CTA card
- Primary Insight Card
- Recent Sessions Rail cards
- Timeline rows
- Bottom Navigation

Out of scope for first theme pass:

- all detail evidence subcomponents
- image modal
- debug viewer
- full typography system

## Black Background Layout Direction

For dark-mode Home, the layout should feel like a single iOS dashboard.

Recommended structure:

```text
Black app background
-> Header directly on background
-> Primary CTA as elevated dark surface
-> Insight card as stronger dark surface
-> Recent rail cards as compact dark tiles
-> Journal rows as simple dark list rows
-> Floating tab bar above safe area
```

The black background should not mean everything is visually heavy. Use spacing,
type weight, and subtle surfaces to make hierarchy.

## Detail Layout v2

### Goal

Detail should become a clean journal entry for one Moment.

It should answer:

```text
What did I upload?
What did the app observe?
Is this confirmed or needs review?
What should I check next?
```

It should not feel like:

```text
Debug panel
AI report dump
Stack of boxed cards
```

### Recommended Structure

```text
Top bar
-> Close
-> Title/date
-> More menu

Video

Result summary
-> status badge
-> confirmed trick OR 확인 필요
-> candidate trace if present
-> short evidence summary

Observed facts
-> Approach
-> Edge load
-> Rotation / inversion

Journal notes
-> user title
-> notes
-> recorded date

Dev-only debug
-> hidden unless explicitly enabled
```

### Detail Content Tone

Use user-facing language first:

- `확인 필요`
- `검토 후보`
- `분석 완료`
- `어프로치`
- `회전/인버전 근거`

Keep technical labels secondary:

- model name
- raw evidence
- validation details
- debug response

## Box Removal Strategy

Current Detail should reduce framed containers.

Recommended approach:

- Keep the video visually distinct.
- Use one main content flow below the video.
- Replace repeated card boxes with section headings and dividers.
- Use badges for status/confidence instead of separate status panels.
- Show review warning as inline text, not a large error-like box unless the
  result truly failed.

Preferred visual structure:

```text
Video
Spacing
Title / status / date
Divider
Summary
Divider
Observed facts
Divider
Notes
```

Avoid:

- card inside card
- multiple bordered boxes back-to-back
- large debug-looking panels in normal mode
- bottom-heavy action blocks

## Top Action Structure

Move secondary actions into the top area.

Recommended controls:

```text
Left: Close
Center: Moment title or short date
Right: More
```

More menu candidates:

- retry analysis
- delete moment
- share later
- debug viewer, dev-only

For MVP, if a real menu component is too much, a simple top action row is
acceptable:

```text
닫기      다시 분석   삭제
```

But the long-term direction should be a compact top-right action menu.

## Floating Tab Bar Direction

The current bottom navigation proves the information structure.

Next visual direction:

```text
Floating rounded tab bar
-> horizontally centered
-> inset from left/right edges
-> above iOS safe area
-> translucent or elevated dark surface
-> selected tab clearly visible
```

Recommended MVP shape:

- rounded rectangle or capsule
- 16px horizontal margin
- subtle border
- dark translucent surface in dark mode
- light translucent surface in light mode
- compact text labels first

Icons can be added later. The first priority is positioning, spacing, and
native-feeling containment.

## Implementation Priority

### Priority 1: Home Dark Theme Pass

Reason:

- It is the first thing users see.
- It affects perceived product quality immediately.
- It aligns with actual iPhone QA feedback.

Scope:

- Home background
- main Home cards
- text hierarchy
- bottom tab surface

### Priority 2: Floating Bottom Navigation

Reason:

- Bottom Navigation exists functionally, but visual polish will make it feel
  more iOS-native.
- It is visible across all tabs.

Scope:

- inset floating container
- safe-area-aware spacing
- selected tab contrast
- dark/light surface treatment

### Priority 3: Detail Layout v2

Reason:

- Detail is the main review surface after upload.
- Current layout works but feels too boxed.

Scope:

- top actions
- video-first layout
- fewer boxed sections
- clearer result summary and review candidate display

### Priority 4: Detail Action Placement

Reason:

- Detail action placement should be adjusted as part of the Detail v2 pass.

Scope:

- move retry/delete/debug away from bottom-heavy layout
- top menu or compact action row

## Immediate Implementation Recommendation

Recommended next implementation pass:

```text
Home dark theme + floating tab bar
```

Do this before Detail v2 because it is smaller, highly visible, and validates
the overall app shell on iPhone.

After that:

```text
Detail Layout v2 + top action structure
```

Keep both passes UI-only. Do not touch:

- API
- database
- AI prompts
- validation logic
- Progression logic
- Settings implementation

## Non-Goals

- No new product features.
- No Progression implementation.
- No Settings implementation.
- No database or API changes.
- No AI result logic changes.
- No full design system extraction unless the local theme pass becomes too
  repetitive.
