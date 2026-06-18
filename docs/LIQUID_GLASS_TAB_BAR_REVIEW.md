# Liquid Glass Tab Bar Review

## Purpose

Review how close the current floating tab bar is to Apple iOS 26 / Liquid Glass
direction, and define an Expo-friendly MVP improvement path.

This document is research and planning only. It does not include
implementation.

## Sources Checked

Primary Apple references:

- Apple Human Interface Guidelines: Tab bars
  - `https://developer.apple.com/design/human-interface-guidelines/tab-bars`
- Apple Developer Documentation: Liquid Glass
  - `https://developer.apple.com/documentation/technologyoverviews/liquid-glass`
- Apple Developer Documentation: Adopting Liquid Glass
  - `https://developer.apple.com/documentation/TechnologyOverviews/adopting-liquid-glass`
- Apple Human Interface Guidelines: Materials
  - `https://developer.apple.com/design/human-interface-guidelines/materials`
- Apple Newsroom: new software design
  - `https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/`

## Apple Direction Summary

Apple's current direction for iOS 26 tab bars can be summarized as:

- Tab bars float above content at the bottom of the screen.
- Tab items sit on a Liquid Glass background.
- Content underneath should remain perceptible through the navigation layer.
- Navigation elements belong in a distinct floating layer above app content.
- Tab bars may shrink or recede while scrolling, keeping navigation accessible
  while giving more focus to content.
- Liquid Glass is not just opacity. It is a system material with adaptive
  translucency, blur, refraction-like behavior, lighting, and platform-managed
  legibility.

Important design implication:

```text
Liquid Glass is a navigation/control layer.
It should feel above content, not like a normal opaque footer.
```

## Current Implementation

Current source:

- `src/features/sessions/HomeScreen.tsx`

Current tab bar structure:

```text
SafeAreaView
-> ScrollView content
-> absolute bottom tab bar
```

Current visual properties:

- floating inset from left/right
- rounded capsule shape
- dark translucent-looking background using `rgba`
- border
- shadow
- selected item highlight
- content padding at bottom to avoid overlap

Current style direction is already closer to iOS 26 than the previous
full-width footer because it:

- floats above the content
- is inset from screen edges
- has a capsule-like shape
- lets content visually continue behind it

## Current Gap vs Apple Liquid Glass

| Area | Apple Liquid Glass Direction | Current App |
| --- | --- | --- |
| Surface | System material with blur/refraction | Semi-transparent dark `View` |
| Content peeking through | Actual blur/translucency over content | Mostly tinted overlay effect |
| Shape | Floating, rounded, adaptive | Floating rounded capsule |
| Behavior | Can shrink/recede on scroll | Static size |
| Safe area | System-managed | Manual `bottom: 12` and padding |
| Selected state | Native tab item behavior | Custom text + highlight |
| Accessibility | System adapts contrast/transparency | Manual color choices |

The biggest gap is not shape. The biggest gap is material behavior.

## Expo / React Native Feasibility

### Possible Without New Dependencies

These are possible with the current stack:

- Improve capsule shape and spacing.
- Increase translucency carefully.
- Add layered border and shadow.
- Make selected state look more contained.
- Add a subtle inner highlight using nested views.
- Adjust bottom inset and content padding.
- Make tab bar visually float more clearly above scrolling content.
- Optionally hide tab hints to reduce density.

This gives a Liquid Glass-inspired look, but not real Liquid Glass.

### Possible With Expo Blur

Using `expo-blur`, the app can get closer:

- `BlurView` behind the tab items
- iOS native blur effect
- content visibly softened underneath
- better approximation of glass material

Likely package:

```text
expo-blur
```

Possible component shape:

```tsx
<View style={styles.floatingTabOuter}>
  <BlurView intensity={35} tint="dark" style={styles.floatingTabBlur}>
    <View style={styles.floatingTabTint}>
      {tabs}
    </View>
  </BlurView>
</View>
```

This is the most practical Expo MVP for a glass-like tab bar.

### Difficult In Expo / React Native

Hard or unrealistic to fully match Apple Liquid Glass:

- true iOS 26 Liquid Glass material APIs
- refraction-like distortion
- dynamic specular highlights
- system-managed adaptive material changes
- native TabView minimization on scroll
- exact Apple tab bar physics
- platform-level accessibility adaptation for Reduce Transparency

React Native can approximate the surface, but not fully reproduce Apple's
native material pipeline.

## Current HomeScreen Comparison

Current implementation is a good first step:

```text
bottom: 12
left/right: 16
borderRadius: 28
rgba dark background
shadow
selected tab background
```

What works:

- capsule is visible
- app no longer feels like a web footer
- dark theme supports the floating effect
- selected tab is readable

What still feels less Apple-like:

- no real blur
- selected state is blocky compared to system controls
- tab hints make the capsule taller and denser
- opacity is high, so content does not really peek through
- manual safe area handling may be fragile across devices

## MVP Improvement Recommendation

### MVP A: No New Dependency

Use this if avoiding dependencies is the priority.

Changes:

1. Make the capsule slightly more glass-like:
   - background: `rgba(28, 30, 36, 0.72)`
   - border: `rgba(255, 255, 255, 0.16)`
   - stronger shadow but softer opacity

2. Reduce tab density:
   - consider hiding second-line hints
   - or show hints only for selected tab

3. Soften selected state:
   - selected background: `rgba(255,255,255,0.18)`
   - radius close to capsule inner radius
   - avoid looking like a rectangular button

4. Improve safe area:
   - use larger bottom spacing if needed
   - keep `scrollContent.paddingBottom` large enough

Pros:

- no dependency
- low risk
- quick visual improvement

Cons:

- still not real blur
- content does not truly show through

### MVP B: Expo BlurView

Recommended if the goal is to move meaningfully toward Liquid Glass.

Changes:

1. Add `expo-blur`.
2. Wrap the floating tab surface in `BlurView`.
3. Keep a dark translucent tint overlay for legibility.
4. Keep selected state simple and readable.
5. Keep current tab structure and labels.

Recommended starting values:

```text
BlurView intensity: 30-45
tint: dark
overlay background: rgba(20, 22, 28, 0.46)
border: rgba(255,255,255,0.16)
selected background: rgba(255,255,255,0.18)
```

Pros:

- closer to iOS material behavior
- content can actually blur underneath
- still small implementation

Cons:

- adds dependency
- Android behavior may differ
- performance should be checked on device
- reduced transparency accessibility is not automatic

## Content Overlay Behavior

The current tab bar is already overlaid with absolute positioning. To make the
effect more Apple-like:

- keep ScrollView content extending behind the tab bar
- keep bottom padding enough so final content is still reachable
- avoid placing a solid footer behind the tab bar
- let timeline/recent content visually pass behind the capsule during scroll

This supports the feeling that navigation floats above content.

## Safe Area Handling

Current implementation uses manual bottom spacing.

Better future direction:

- use a safe-area helper such as `react-native-safe-area-context`
- position the floating tab relative to bottom inset
- keep scroll padding as `tabHeight + bottomInset + extraSpacing`

Current project does not appear to use that package yet. For MVP, manual
spacing is acceptable, but physical device QA is required.

## Selected State Direction

For a Liquid Glass-inspired tab bar:

- selected state should be clear but not heavy
- avoid bright solid blocks
- use a subtle translucent pill
- make selected label high contrast
- keep unselected labels muted

Recommended:

```text
Selected pill: translucent white
Selected label: near white
Unselected label: muted gray
Hint text: remove or selected-only
```

## Recommended Next Step

Recommended path:

```text
MVP B: Expo BlurView
```

Reason:

- Current shape is already close enough.
- The main missing quality is real material blur.
- `expo-blur` is the smallest practical step toward Liquid Glass in Expo.

Implementation scope should remain limited:

- add `expo-blur`
- replace tab bar background with `BlurView`
- keep current tabs
- keep current navigation logic
- no Detail changes
- no API/DB changes
- no icon system yet

## QA Checklist

After implementation, check on physical iPhone:

- tab bar remains readable over bright and dark content
- content visibly moves behind/under the capsule
- selected tab remains clear
- bottom safe area feels correct
- no scroll content is blocked
- no performance stutter while scrolling
- dark-mode Home still feels calm, not noisy

## Non-Goals

- Do not implement native iOS Liquid Glass APIs.
- Do not redesign navigation structure.
- Do not add icons yet.
- Do not implement scroll shrink/minimize behavior yet.
- Do not change Detail Layout v2 in the same pass.
- Do not touch API, DB, AI, or persistence logic.
