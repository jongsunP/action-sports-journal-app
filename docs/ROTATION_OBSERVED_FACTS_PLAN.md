# RotationObservedFacts Plan

## Purpose

RotationObservedFacts is the next Wakeboard Observed Facts V3 layer after:

```text
ApproachObservedFacts
EdgeLoadObservedFacts
PopObservedFacts
```

Goal:

- Describe visible rotation mechanics before naming a trick.
- Prevent the model from jumping from airtime or body posture directly to an
  advanced trick label.
- Separate rotation facts from trick family and specific trick classification.
- Provide a safer foundation for distinguishing Back Roll, Tantrum, Front Roll,
  KGB, Crow Mobe, spins, and basic airs.

This is a design document only. It does not change code, prompts, schema, or UI.

## Position In The Pipeline

Current direction:

```text
Video
-> TemporalWindows
-> ApproachObservedFacts
-> EdgeLoadObservedFacts
-> PopObservedFacts
-> RotationObservedFacts
-> InversionObservedFacts
-> Trick Family Gates
-> Specific Trick Candidate
-> Judge / Validation
-> Coach
```

RotationObservedFacts should not output "Back Roll", "Tantrum", "KGB", or
"Crow Mobe" directly. It should describe the visible mechanics those tricks
require.

## Observed Facts Contract

RotationObservedFacts should answer:

- Is rotation visible?
- Which axis is visible?
- Which direction is visible?
- Is inversion present or absent?
- Is there a spin/yaw component?
- Is there a handle pass?
- What does the body axis do?
- What path does the board take?
- What evidence argues against rotation?

Unknown is a valid result. Missing rotation evidence is useful evidence.

## Draft Schema

Initial implementation should stay small enough for Gemini structured response
limits. A simple schema is preferred over deeply nested confidence objects.

```ts
type RotationObservedFacts = {
  rotationAxis:
    | 'roll_axis'
    | 'flip_axis'
    | 'spin_yaw_axis'
    | 'off_axis'
    | 'none'
    | 'unknown';
  rotationDirection:
    | 'frontside'
    | 'backside'
    | 'left'
    | 'right'
    | 'none'
    | 'unknown';
  inversionDetected: true | false | 'unknown';
  spinDegrees: '0' | '180' | '360' | '540' | 'unknown';
  handlePassObserved: true | false | 'unknown';
  bodyAxisEvidence: string | null;
  boardPathEvidence: string | null;
  evidenceText: string | null;
  confidence: 'high' | 'medium' | 'low';
  antiEvidence: string[];
};
```

Implementation note:

- Avoid per-field confidence objects at first.
- Keep one overall confidence field.
- If later accuracy requires more detail, add fields incrementally after
  measuring schema size and model reliability.

## rotationAxis

### roll_axis

Definition:

- Rider rotates around a head-to-toe / longitudinal body axis.
- The board and body roll sideways relative to the travel direction.

Visible evidence:

- Shoulder and hip line starts rolling over one side.
- Board path arcs around the rider's longitudinal axis.
- Body rolls laterally rather than pitching straight forward/backward.

Used for:

- Back Roll family
- Front Roll family
- Some off-axis mobes

Anti-evidence:

- Rider remains upright.
- Board stays below the body with no lateral roll.
- Only a small shoulder twist is visible.
- Airtime occurs without body/board rolling.

### flip_axis

Definition:

- Rider rotates around a side-to-side / pitch axis.
- The body flips forward or backward.

Visible evidence:

- Head and feet trade vertical positions through a forward/backward flip.
- Board rises above or around the rider in a pitch-flip path.
- Rotation is driven by a trip/pop pattern rather than a pure roll.

Used for:

- Tantrum
- Front flip / front roll-like mechanics, depending on approach and direction

Anti-evidence:

- No visible pitching of head/feet.
- Board never approaches above-head relationship.
- Body only yaws or drifts.

### spin_yaw_axis

Definition:

- Rider rotates around a vertical axis.
- Board and shoulders turn horizontally.

Visible evidence:

- Board nose/tail changes facing direction in the air.
- Rider rotates 180/360/540 around vertical orientation.
- Handle path supports horizontal spin mechanics.

Used for:

- 180s
- 360s
- 540s
- Mobe components when combined with inversion and handle pass

Anti-evidence:

- Board direction stays mostly unchanged.
- Rotation is only a roll/flip, not horizontal yaw.
- Camera movement creates apparent turn but board direction is stable.

### off_axis

Definition:

- Rotation combines roll/flip/yaw in a tilted or mixed axis.

Visible evidence:

- Rider is neither cleanly upright spin nor pure roll/flip.
- Board path and body axis show tilted rotation.
- Often appears in advanced invert/spin combinations.

Used for:

- KGB
- Crow Mobe
- Some mobe variants

Anti-evidence:

- Single clean axis is visible.
- Body remains upright.
- Axis cannot be separated from camera angle.

### unknown

Use when:

- Rotation is not visible.
- Takeoff is visible but airborne phase is obscured.
- Camera angle or crop prevents axis identification.
- The model only infers from trick name or airtime.

## rotationDirection

Allowed values:

```text
frontside
backside
left
right
none
unknown
```

Guidance:

- Use frontside/backside only when wakeboard context supports it.
- Use left/right when screen/body direction is visible but frontside/backside
  cannot be confidently mapped.
- Use none for Basic Air / Straight Air when no rotation is visible.
- Use unknown when apparent direction may be caused by camera movement, crop, or
  body twist without real rotation.

Visible evidence:

- Shoulder opening direction.
- Hip rotation direction.
- Board nose path.
- Handle path.
- Landing board direction compared with takeoff.

Anti-evidence:

- Rider lands in the same direction with no clear turn.
- Only arms/shoulders twist briefly.
- Board path is hidden.

## inversionDetected

Allowed values:

```text
true
false
unknown
```

This should align with InversionObservedFacts but remain independently useful
inside rotation analysis.

True requires visible evidence such as:

- Board above the rider's head.
- Body/board relationship clearly inverted.
- Head and hips/feet show actual inverted relationship.

False is appropriate when:

- Rider stays upright through the aerial phase.
- Board remains below body.
- No roll/flip axis is visible.

Unknown is appropriate when:

- Peak-air frames are missing.
- Rider is obscured by spray, crop, or distance.
- Camera angle makes inversion ambiguous.

Important:

- Do not infer inversion from airtime alone.
- Do not infer inversion from a predicted trick name.

## spinDegrees

Allowed values:

```text
0
180
360
540
unknown
```

Guidance:

- `0`: no meaningful horizontal spin/yaw rotation.
- `180`: board/rider changes direction by about half turn.
- `360`: full horizontal rotation.
- `540`: one and a half horizontal rotations.
- `unknown`: spin cannot be measured.

Evidence should compare:

- Board direction at takeoff.
- Board direction at peak air.
- Board direction at landing.
- Handle pass or handle path when visible.

Anti-evidence:

- Board direction at landing matches takeoff.
- Rotation is roll/flip only.
- Camera pan causes apparent change.

## handlePassObserved

Allowed values:

```text
true
false
unknown
```

True requires:

- Handle visibly changes hands behind or around the body.
- Handle path supports spin/mobe mechanics.

False is appropriate when:

- Handle stays in both hands or same hand position.
- No behind-the-back pass is visible.
- The trick does not require a handle pass.

Unknown is appropriate when:

- Hands are obscured.
- Handle is out of frame.
- Video resolution is too low.

Used for:

- Distinguishing straight spins from handle-pass spins.
- Separating Back Roll from KGB-like variants.
- Separating Crow / Crow Mobe variants when combined with spin and invert facts.

## bodyAxisEvidence

Purpose:

- Describe how the rider's body axis moves.

Examples:

- "Shoulders initiate a lateral roll over the rider's lead side."
- "Body pitches backward with head and feet changing vertical relationship."
- "Torso remains mostly upright; only small shoulder twist is visible."
- "Body yaws horizontally while staying upright."

Rules:

- Must describe visible mechanics.
- Should not contain trick names as primary evidence.
- Should mention uncertainty when spray/crop hides the body.

## boardPathEvidence

Purpose:

- Describe how the board travels relative to the rider and wake.

Examples:

- "Board stays below the rider through the aerial phase."
- "Board rises above shoulder/head line during rotation."
- "Board nose rotates about 180 degrees before landing."
- "Board path arcs sideways around a roll axis."

Rules:

- Board path should be separate from body orientation.
- Board above head is stronger inversion evidence than head position alone.
- If the board path is hidden, say so.

## antiEvidence

antiEvidence should record missing or contradictory evidence.

Examples:

- "No visible roll axis."
- "No board-above-head relationship."
- "Board direction remains unchanged from takeoff to landing."
- "Handle pass is not visible."
- "Only body twist is visible; board path does not rotate."
- "Peak-air phase is cropped or obscured."
- "Camera pan may create apparent rotation."

antiEvidence is required when:

- confidence is high.
- an advanced invert/spin candidate is being considered.
- rotationAxis is unknown but trick family wants Invert or Spin.

## Confidence Rules

### High

High confidence requires:

- Clear takeoff and airborne window.
- Visible rotation axis.
- Visible body axis evidence.
- Visible board path evidence.
- No major contradiction in antiEvidence.

For advanced inverts/spins, high confidence should require at least two
independent visual indicators, such as:

- body axis movement,
- board path,
- handle path,
- takeoff/initiation direction,
- landing orientation compared with takeoff.

### Medium

Medium confidence is appropriate when:

- Rotation is visible but one key cue is partially obscured.
- Axis is likely but not definitive.
- Direction is visible but exact degrees are uncertain.
- One independent visual indicator is strong and others are supportive.

### Low

Low confidence is required when:

- Rotation is inferred from trick name.
- Rotation is inferred from airtime only.
- Axis is not visible.
- Board path is hidden.
- Camera movement could explain apparent rotation.
- antiEvidence contradicts the candidate.

## Validation Ideas

### Axis Gate

- If `rotationAxis=roll_axis`, require bodyAxisEvidence or boardPathEvidence
  containing lateral roll mechanics.
- If `rotationAxis=flip_axis`, require board/body pitch mechanics or
  board-above-head/inversion support.
- If `rotationAxis=spin_yaw_axis`, require board direction change, handle path,
  or landing direction change.

### Inversion Consistency

- If `inversionDetected=false`, Invert family cannot be high.
- If `inversionDetected=true`, require supporting InversionObservedFacts:
  boardAboveHead, bodyInverted, or flip/roll axis.
- If RotationObservedFacts says invert but InversionObservedFacts blocks invert,
  downgrade family/trick confidence.

### Spin Degree Consistency

- If `spinDegrees=0`, spin-specific tricks cannot be high.
- If `spinDegrees=180/360/540`, require board direction or landing orientation
  evidence.
- If handle pass is required by a candidate and `handlePassObserved=false`, the
  candidate cannot be high.

### Anti-Evidence Guard

- Advanced trick high confidence should be blocked when antiEvidence contains:
  no roll axis, no board-above-head, no handle pass, no yaw rotation, or board
  path hidden.

## Trick Differentiation Usage

RotationObservedFacts should not name these tricks directly, but it should make
their required evidence inspectable.

### Back Roll

Expected observed facts:

- approach: usually heelside
- pop: progressive wake-driven pop
- rotationAxis: roll_axis
- inversionDetected: true
- spinDegrees: 0 or unknown, unless variant
- handlePassObserved: usually false
- bodyAxisEvidence: lateral roll over a roll axis
- boardPathEvidence: board/body roll through an inverted relationship

Validation:

- Back Roll high requires roll-axis evidence and inversion evidence.
- If no roll axis, Back Roll cannot be high.
- If no board/body inversion relationship, Back Roll cannot be high.

### Tantrum

Expected observed facts:

- approach: typically heelside
- pop: trip-pop-like takeoff is important
- rotationAxis: flip_axis
- inversionDetected: true
- spinDegrees: 0
- handlePassObserved: false
- bodyAxisEvidence: backflip/trip-flip style pitch rotation
- boardPathEvidence: board follows flip path, not lateral roll path

Validation:

- Tantrum high requires flip-axis/trip-flip mechanics.
- Tantrum should not be high from toeside approach.
- Tantrum should not be high when only airtime/basic jump is visible.

### Front Roll

Expected observed facts:

- approach: often toeside/frontside context, depending on variant
- rotationAxis: roll_axis or flip_axis depending on observed mechanics
- inversionDetected: true
- bodyAxisEvidence: forward/front roll mechanics
- boardPathEvidence: board and body rotate forward through inversion

Validation:

- Requires visible inversion and forward rotation mechanics.
- If direction is unknown and no axis is visible, Front Roll cannot be high.

### KGB

Expected observed facts:

- base: Back Roll-like invert mechanics
- rotationAxis: roll_axis plus spin_yaw_axis or off_axis
- inversionDetected: true
- spinDegrees: usually 360 component
- handlePassObserved: true or at least strongly supported
- bodyAxisEvidence: invert plus backside spin component
- boardPathEvidence: roll path plus spin/yaw change

Validation:

- KGB high requires invert + spin component + handle pass evidence.
- If handle pass is not visible, KGB should be medium or low.
- If spinDegrees is 0, KGB cannot be high.

### Crow Mobe

Expected observed facts:

- base: Crow/front-roll-like invert mechanics
- rotationAxis: flip/roll/off-axis plus spin_yaw_axis
- inversionDetected: true
- spinDegrees: usually 360 component
- handlePassObserved: true or strongly supported
- bodyAxisEvidence: frontside/off-axis invert plus spin
- boardPathEvidence: invert path plus horizontal rotation component

Validation:

- Crow Mobe high requires invert + spin/yaw + handle pass evidence.
- If handle pass is not visible, downgrade.
- If inversionDetected=false, Crow Mobe cannot be high.

## Implementation Plan

1. Add `RotationObservedFacts` type with a simple schema.
2. Add Gemini prompt instructions that forbid trick names inside rotation facts.
3. Add normalization with safe defaults:
   - axis unknown,
   - direction unknown,
   - inversion unknown,
   - spinDegrees unknown,
   - confidence low.
4. Add validator:
   - high confidence requires axis + bodyAxisEvidence + boardPathEvidence.
   - invert/spin candidates are downgraded when rotation facts do not support
     them.
5. Add debug capture fields.
6. Persist to Supabase only after schema size is verified.
7. Test against:
   - Basic Air,
   - Toeside Basic Jump,
   - Back Roll,
   - Tantrum,
   - 180/360 spin,
   - known mobe examples when available.

## Open Questions

- Should `inversionDetected` live in RotationObservedFacts, or only in
  InversionObservedFacts?
- Should `spinDegrees` be string enum or number/null in the final schema?
- Should left/right direction be camera-relative, rider-relative, or
  boat-relative?
- How much handle-pass uncertainty is acceptable for advanced mobe candidates?
- Should RotationObservedFacts be extracted in the same Gemini pass or a
  dedicated Stage 1/Stage 2 pipeline later?

