# Wakeboard Observed Facts V3 Plan

## Purpose

Wakeboard Observed Facts v3 extends the current evidence architecture beyond
approach and edge loading.

Current implemented / planned layers:

```text
ApproachObservedFacts
EdgeLoadObservedFacts
```

Next domain decomposition layers:

```text
PopObservedFacts
RotationObservedFacts
GrabObservedFacts
LandingObservedFacts
```

Goal:

- Improve truthfulness by asking the model to observe wakeboard mechanics before
  naming a trick.
- Reduce direct jumps from video to trick label.
- Give validation and coaching separate, inspectable evidence layers.
- Keep trick taxonomy and coaching grounded in visible facts.

This is a design document. It does not change code or prompts.

## Current Structure Connection

The current direction is:

```text
Video
-> TemporalWindows
-> ApproachObservedFacts
-> EdgeLoadObservedFacts
-> InversionObservedFacts
-> Trick Family Gates
-> Specific Trick Candidate
-> Validation / Judge
-> Coach
```

Observed Facts v3 should extend this into:

```text
Video
-> TemporalWindows
-> ApproachObservedFacts
-> EdgeLoadObservedFacts
-> PopObservedFacts
-> RotationObservedFacts
-> GrabObservedFacts
-> LandingObservedFacts
-> InversionObservedFacts
-> Trick Family Gates
-> Specific Trick Candidate
-> Validation / Judge
-> Coach
```

Important principle:

```text
Observed facts do not name the trick.
Observed facts describe what is visible.
Trick family and trick name come later.
```

## Existing Observed Facts

### ApproachObservedFacts

Purpose:

- Detect stance, lead foot, board direction, wake crossing path, handle
  position, and body orientation.
- Derive toeside / heelside / switch only after observed facts are collected.

Known issue:

- `ApproachDecisionV2` can remain low confidence even when raw model evidence is
  high because the validator is intentionally conservative.

### EdgeLoadObservedFacts

Purpose:

- Separate "looks toeside/heelside" from physical edge-load facts.
- Record toe edge loaded, heel edge loaded, board tilt, spray direction, line
  tension, and rider weight over edge.

Known issue:

- High raw edge confidence still needs validation against independent physical
  evidence and anti-evidence.

## Proposed V3 Types

Draft aggregate:

```ts
type WakeboardObservedFactsV3 = {
  temporalWindows: EvidenceTemporalWindows;
  approachObservedFacts: ApproachObservedFacts;
  edgeLoadObservedFacts: EdgeLoadObservedFacts;
  popObservedFacts: PopObservedFacts;
  rotationObservedFacts: RotationObservedFacts;
  grabObservedFacts: GrabObservedFacts;
  landingObservedFacts: LandingObservedFacts;
  inversionObservedFacts: InversionObservedFacts;
};
```

The implementation should not require all fields to be high confidence. Missing
or uncertain facts are useful evidence and should be represented explicitly.

## 1. PopObservedFacts

### Purpose

PopObservedFacts describes how the rider leaves the wake or water.

This layer should answer:

- Was there a visible pop?
- Did the rider release from the wake progressively, abruptly, late, or early?
- Was the pop wake-driven, trip-flip-like, ollie-like, or unclear?
- Did the pop support a Basic Air, Spin, Invert, Raley, or no aerial family?

PopObservedFacts should not name tricks. It should not say "Tantrum" or "Back
Roll." It should describe takeoff mechanics.

### Draft Type

```ts
type PopObservedFacts = {
  popDetected: EvidenceFact;
  popTiming: {
    value: 'early_release' | 'on_wake' | 'late_pop' | 'no_clear_pop' | 'unknown';
    confidence: EvidenceConfidence;
    evidence: string;
    timestampSeconds: number | null;
  };
  popType: {
    value:
      | 'progressive_pop'
      | 'trip_pop'
      | 'ollie_pop'
      | 'flat_release'
      | 'early_release'
      | 'late_pop'
      | 'unknown';
    confidence: EvidenceConfidence;
    evidence: string;
  };
  wakeContactAtRelease: EvidenceFact;
  boardReleaseAngle: EvidenceFact;
  lineTensionAtPop: EvidenceFact;
  riderExtensionAtPop: EvidenceFact;
  upwardTrajectory: EvidenceFact;
  antiPopEvidence: string[];
};
```

### Observable Facts

Strong pop evidence:

- Board reaches the wake lip and releases upward.
- Rider extends through knees/hips at or near the wake.
- Wake lip visibly redirects the board/rider upward.
- Line tension is maintained through takeoff.
- Board leaves water cleanly from the wake or from a clear ollie motion.

Weak pop evidence:

- Rider is airborne, but takeoff moment is not visible.
- Camera cuts directly to peak air.
- Body rises but board/wake contact is obscured.

Invalid pop evidence:

- Landing splash.
- Crash posture.
- Trick name.
- Assumption from airtime alone.

### Pop Examples

#### progressive pop

Definition:

- Rider builds edge and line tension into the wake.
- Release happens through the wake with visible upward trajectory.

Expected facts:

```text
popDetected: true
popType: progressive_pop
lineTensionAtPop: visible
riderExtensionAtPop: visible
```

#### trip pop

Definition:

- Edge catches or trips at the wake, redirecting the rider into a flip-like
  takeoff.

Expected facts:

```text
popDetected: true
popType: trip_pop
boardReleaseAngle: abrupt upward/over edge
rotation initiation: may follow immediately
```

Important:

- Trip pop alone does not prove Tantrum.
- Invert family must still pass inversion/rotation gates.

#### late pop

Definition:

- Rider releases after the ideal wake lip moment or after absorbing too much
  wake energy.

Expected facts:

```text
popTiming: late_pop
upwardTrajectory: reduced or delayed
riderExtensionAtPop: late or incomplete
```

#### early release

Definition:

- Rider flattens or releases before the wake can provide full lift.

Expected facts:

```text
popTiming: early_release
wakeContactAtRelease: before wake lip
lineTensionAtPop: reduced or lost
```

### Confidence Rules

High confidence:

- Takeoff timestamp is visible.
- Board-wake contact and release are visible.
- At least two independent physical facts agree:
  - wake contact
  - rider extension
  - board release angle
  - line tension
  - upward trajectory

Medium confidence:

- Takeoff is visible, but one key physical fact is obscured.
- Pop type is plausible but not fully visible.

Low confidence:

- Only airborne phase is visible.
- Takeoff window is missing.
- Pop type is inferred from trick candidate or landing outcome.

### Anti-Evidence

Anti-pop evidence should include:

- "takeoff moment not visible"
- "board/wake contact obscured"
- "rider already airborne before visible window"
- "flat water release, no visible wake lip interaction"
- "camera angle hides board release"

### Validation Ideas

- Pop high confidence requires a visible takeoff timestamp.
- Trip pop cannot be high unless board release angle or wake-trip contact is
  visible.
- Progressive pop cannot be high unless edge load continues into the wake.
- Late pop / early release should not be inferred from landing crash alone.
- Pop type should not be copied from trick family.

### Coaching Use

PopObservedFacts can support coaching on:

- edge continuation into the wake
- standing tall at takeoff
- releasing too early
- absorbing the wake
- maintaining line tension
- distinguishing basic air pop from trip-flip mechanics

## 2. RotationObservedFacts

### Purpose

RotationObservedFacts describes if and how the rider rotates.

This layer should separate:

- yaw spin
- roll axis
- flip axis
- off-axis movement
- no meaningful rotation
- crash-induced body movement

RotationObservedFacts should not name specific tricks. It should not say "Back
Roll," "Tantrum," or "360" directly. It should describe visible axis movement.

### Draft Type

```ts
type RotationObservedFacts = {
  rotationDetected: EvidenceFact;
  yawRotation: EvidenceFact;
  rollAxisRotation: EvidenceFact;
  flipAxisRotation: EvidenceFact;
  offAxisRotation: EvidenceFact;
  spinDirection: {
    value:
      | 'frontside'
      | 'backside'
      | 'clockwise'
      | 'counterclockwise'
      | 'unknown'
      | 'none';
    confidence: EvidenceConfidence;
    evidence: string;
  };
  rotationDegreesEstimate: {
    value: 0 | 90 | 180 | 270 | 360 | 540 | 720 | 'unknown';
    confidence: EvidenceConfidence;
    evidence: string;
  };
  rotationInitiationTiming: {
    value: 'pre_takeoff' | 'at_takeoff' | 'airborne' | 'landing_crash' | 'unknown';
    confidence: EvidenceConfidence;
    evidence: string;
    timestampSeconds: number | null;
  };
  handleContribution: EvidenceFact;
  boardRiderRelationshipDuringRotation: EvidenceFact;
  antiRotationEvidence: string[];
};
```

### Observable Facts

Strong rotation evidence:

- Rider/board orientation changes across takeoff, air, and landing.
- Axis is visible and continuous.
- Rotation begins before or during airborne phase, not only during crash.
- Board and shoulders/hips change orientation together or in a describable
  sequence.

Weak rotation evidence:

- Single frame appears tilted.
- Landing direction changes but takeoff direction is unclear.
- Camera movement creates apparent rotation.

Invalid rotation evidence:

- Crash tumble after failed landing.
- Board kicked sideways by water impact.
- Trick name.
- Body lean without axis change.

### Rotation Examples

#### roll axis

Definition:

- Rider rotates around a front-to-back axis, commonly relevant to Back Roll
  style mechanics.

Expected facts:

```text
rollAxisRotation: true
rotationInitiationTiming: at_takeoff or airborne
boardRiderRelationshipDuringRotation: changes through roll path
```

#### flip axis

Definition:

- Rider rotates forward/backward through a flip-like pitch axis, relevant to
  tantrum/front-flip-style mechanics.

Expected facts:

```text
flipAxisRotation: true
rollAxisRotation: false or secondary
rotationInitiationTiming: at_takeoff
```

#### off-axis

Definition:

- Rotation is neither clean yaw nor clean roll/flip, or combines axes.

Expected facts:

```text
offAxisRotation: true
axis evidence mixed
confidence often medium unless very clear
```

#### spin direction

Definition:

- Yaw rotation direction, such as frontside/backside or clockwise/counterclockwise.

Expected facts:

```text
yawRotation: true
rotationDegreesEstimate: 180/360/etc.
spinDirection: visible through board/rider orientation change
```

### Confidence Rules

High confidence:

- Rotation starts before landing/crash.
- Axis is visible across multiple moments or a clear window.
- Start and end orientation are both visible.
- The model names physical axis evidence, not a trick label.

Medium confidence:

- Rotation is visible but axis is partially obscured.
- Start or end orientation is unclear.

Low confidence:

- Only landing/crash movement shows rotation.
- Only a single tilted posture is visible.
- Axis is inferred from family/trick name.

### Anti-Evidence

Anti-rotation evidence should include:

- "no yaw direction change visible"
- "no roll axis visible"
- "no flip axis visible"
- "apparent rotation occurs only after water contact"
- "camera movement may explain apparent rotation"
- "airborne posture remains straight"

### Validation Ideas

- Spin family cannot be high without yawRotation medium/high.
- Back Roll cannot be high without rollAxisRotation medium/high and invert gate.
- Tantrum cannot be high without flipAxisRotation medium/high and invert gate.
- Rotation that begins only at landing/crash cannot support trick naming.
- Rotation degrees high confidence requires takeoff and landing orientation.

### Coaching Use

RotationObservedFacts can support coaching on:

- handle timing
- shoulder/hip initiation
- under-rotation or over-rotation
- off-axis drift
- separating takeoff mechanics from crash mechanics
- whether the rider initiated rotation too early or too late

## 3. GrabObservedFacts

### Purpose

GrabObservedFacts describes visible hand-to-board contact.

This layer prevents the model from calling a stylish air a grab without seeing
actual contact.

GrabObservedFacts should not infer grab type from style, knee tuck, or trick
name. It should require visible hand-board interaction.

### Draft Type

```ts
type GrabObservedFacts = {
  grabDetected: EvidenceFact;
  grabbingHand: {
    value: 'front_hand' | 'rear_hand' | 'both_hands' | 'unknown' | 'none';
    confidence: EvidenceConfidence;
    evidence: string;
  };
  grabbedBoardZone: {
    value:
      | 'indy'
      | 'melon'
      | 'mute'
      | 'nose'
      | 'tail'
      | 'stalefish'
      | 'method'
      | 'unknown_zone'
      | 'none';
    confidence: EvidenceConfidence;
    evidence: string;
  };
  contactVisible: EvidenceFact;
  grabTiming: {
    value: 'takeoff' | 'rising' | 'peak_air' | 'descent' | 'landing' | 'unknown' | 'none';
    confidence: EvidenceConfidence;
    evidence: string;
    timestampSeconds: number | null;
  };
  grabDuration: {
    value: 'brief' | 'held' | 'unknown' | 'none';
    confidence: EvidenceConfidence;
    evidence: string;
  };
  kneesOrBoardPosition: EvidenceFact;
  antiGrabEvidence: string[];
};
```

### Observable Facts

Strong grab evidence:

- Hand visibly contacts board.
- Contact occurs while airborne.
- Board zone is visible.
- Hand remains near board for more than one moment, or contact is clear in a
  high-quality frame.

Weak grab evidence:

- Hand moves toward board but contact is obscured.
- Knees tuck upward and hand is near board.
- Contact zone is partially hidden.

Invalid grab evidence:

- Stylish tucked position without visible hand-board contact.
- Hand near knee, handle, or rope.
- Trick label.
- Board close to hand because of camera angle.

### Grab Examples

#### indy

Common definition:

- Rear hand grabs the toe-side edge between bindings.

Observed facts should include:

```text
grabbingHand: rear_hand
grabbedBoardZone: indy
contactVisible: true
```

#### melon

Common definition:

- Front hand grabs heel-side edge, often between bindings.

Observed facts should include:

```text
grabbingHand: front_hand
grabbedBoardZone: melon
contactVisible: true
```

#### mute

Common definition:

- Front hand grabs toe-side edge.

Observed facts should include:

```text
grabbingHand: front_hand
grabbedBoardZone: mute
contactVisible: true
```

#### nose / tail

Observed facts should include:

```text
grabbedBoardZone: nose or tail
contactVisible: true
hand-to-board contact at board end
```

### Confidence Rules

High confidence:

- Hand-to-board contact is visible.
- Hand and board zone are visible.
- Contact occurs during airborne phase.

Medium confidence:

- Contact is likely, but board zone or hand identity is partially obscured.

Low confidence:

- Hand only moves near the board.
- Contact not visible.
- Grab type inferred from style or body shape.

### Anti-Evidence

Anti-grab evidence should include:

- "no visible hand-board contact"
- "hands remain on handle"
- "hand near board but contact obscured"
- "board zone hidden"
- "camera angle prevents hand/board confirmation"

### Validation Ideas

- Grab family cannot be high without `contactVisible` medium/high.
- Specific grab name cannot be high without grabbedBoardZone medium/high.
- If both hands stay on handle, grabDetected must be false or low.
- Knee tuck alone cannot produce Grab high confidence.
- Grab should not override Basic Air, Spin, or Invert family unless contact is
  independently visible.

### Coaching Use

GrabObservedFacts can support coaching on:

- whether the rider released the handle
- timing of grab
- knees-up body position
- grab duration
- handle control after grab
- style progression without falsely naming grabs

## 4. LandingObservedFacts

### Purpose

LandingObservedFacts describes how the rider returns to the water and recovers.

Landing is an outcome and coaching layer. It should not be the primary source
for trick identity unless takeoff/airborne facts are missing and the output is
low confidence.

LandingObservedFacts should separate:

- clean landing
- unstable landing
- butt check
- edge catch
- handle loss
- crash
- recovery

### Draft Type

```ts
type LandingObservedFacts = {
  landingVisible: EvidenceFact;
  landingOutcome: {
    value:
      | 'clean'
      | 'butt_check'
      | 'edge_catch'
      | 'handle_pass_missed'
      | 'handle_loss'
      | 'over_rotated'
      | 'under_rotated'
      | 'crash'
      | 'unknown';
    confidence: EvidenceConfidence;
    evidence: string;
  };
  boardContactAtLanding: EvidenceFact;
  landingEdge: {
    value: 'toe_edge' | 'heel_edge' | 'flat' | 'edge_catch' | 'unknown';
    confidence: EvidenceConfidence;
    evidence: string;
  };
  handlePositionAtLanding: EvidenceFact;
  lineTensionAtLanding: EvidenceFact;
  riderBalanceRecovery: EvidenceFact;
  directionAfterLanding: EvidenceFact;
  antiLandingEvidence: string[];
};
```

### Observable Facts

Strong landing evidence:

- Board contacts water visibly.
- Rider maintains or loses balance visibly.
- Handle position is visible.
- Edge engagement or catch is visible.
- Rider rides away, butt checks, or crashes clearly.

Weak landing evidence:

- Landing partly off camera.
- Splash obscures board.
- Rider exits frame immediately.

Invalid landing evidence:

- Trick identity inferred from crash shape.
- Rotation inferred only from water impact.
- Landing outcome used to override takeoff/airborne facts.

### Landing Examples

#### clean

Expected facts:

```text
landingOutcome: clean
boardContactAtLanding: visible and stable
riderBalanceRecovery: rides away
handlePositionAtLanding: controlled
```

#### butt check

Expected facts:

```text
landingOutcome: butt_check
rider hips/butt touch or skim water
board continues enough for partial recovery
```

#### handle position

Useful observations:

```text
handle close to lead hip
handle pulled away from body
handle dropped
handle too high
```

#### edge recovery

Expected facts:

```text
landingEdge: toe_edge / heel_edge / flat / edge_catch
riderBalanceRecovery: recovered or not recovered
```

### Confidence Rules

High confidence:

- Landing frame/window is visible.
- Board contact and rider outcome are both visible.
- Handle or balance recovery evidence supports the outcome.

Medium confidence:

- Landing is visible, but splash or camera angle obscures board/edge details.

Low confidence:

- Landing not visible.
- Only aftermath is visible.
- Outcome inferred from trick name or earlier airborne posture.

### Anti-Evidence

Anti-landing evidence should include:

- "landing out of frame"
- "splash obscures board contact"
- "video ends before landing"
- "camera loses rider at landing"
- "only crash aftermath visible"

### Validation Ideas

- Landing outcome should not determine trick family by itself.
- Crash posture cannot create Invert or Rotation high confidence.
- Clean landing cannot rescue uncertain trick identity.
- Landing edge can support coaching, but should not override approach edge.
- Handle loss should influence coaching, not parent-family classification.

### Coaching Use

LandingObservedFacts can support coaching on:

- spotting the landing
- handle position on landing
- absorbing impact
- landing on edge vs flat
- butt check recovery
- over-rotation / under-rotation clues
- whether the rider rode away or lost line tension

## Cross-Layer Validation

ObservedFacts v3 should make contradictions explicit.

Examples:

```text
Basic Air high + rollAxisRotation high = conflict
Grab high + contactVisible false = invalid
Back Roll high + rollAxisRotation low = invalid
Tantrum high + flipAxisRotation low = invalid
Spin high + yawRotation low = invalid
Clean landing high + landingVisible false = invalid
Progressive pop high + edgeLoadVisible false = needs review
```

Recommended validation output:

```ts
type ObservedFactsValidation = {
  status: 'valid' | 'needs_review' | 'invalid';
  warnings: string[];
  gateFailures: string[];
  missingEvidence: string[];
  contradictionEvidence: string[];
};
```

## Connection To Trick Family Gates

### Basic Air / Straight Air

Required:

- popDetected medium/high
- no yawRotation medium/high
- no rollAxisRotation medium/high
- no flipAxisRotation medium/high
- grabDetected false/low
- no raley extension

### Spin

Required:

- yawRotation medium/high
- rotationDegreesEstimate medium/high for specific spin naming
- landing or airborne direction change visible

### Grab

Required:

- grabDetected medium/high
- contactVisible medium/high
- grabbedBoardZone for specific grab naming

### Invert

Required:

- inversion gate passes
- rollAxisRotation or flipAxisRotation medium/high depending on specific trick
- rotation initiation visible before crash/landing

### Raley

Future layer:

- Requires raley-style extension facts.
- Should not be inferred from airtime or straight body posture alone.

## Connection To Coaching

Coaching should use observed facts in this order:

```text
1. What happened visibly
2. What the rider intended or likely attempted
3. What mechanical issue limited the result
4. What the rider should try next
```

Examples:

- Pop facts coach takeoff timing and line tension.
- Rotation facts coach handle/shoulder timing and axis control.
- Grab facts coach handle release, timing, and body position.
- Landing facts coach edge recovery, handle control, and impact absorption.

Coaching must not invent missing facts. If a layer is unknown, coaching should
say it is unknown and focus on visible layers.

## Implementation Order Recommendation

Recommended order:

1. `PopObservedFacts`
2. `RotationObservedFacts`
3. `LandingObservedFacts`
4. `GrabObservedFacts`

Reason:

- Pop and rotation affect family gates most directly.
- Landing is essential for coaching but should remain outcome-focused.
- Grab detection is important, but it requires visible hand-board contact and
  can be added after the core family gates are more stable.

## Non-Goals

Do not implement in this stage:

- Full trick database.
- RaleyObservedFacts, unless Raley samples become the active validation target.
- Scoring system.
- Progression model.
- Automatic coaching changes.
- UI redesign.
- Model provider switch.

## Open Questions

Unknown:

- Whether Gemini 2.5 Pro can reliably separate progressive pop from trip pop on
  real user clips.
- Whether rotation axis can be extracted reliably from short phone videos.
- Whether grab type requires frame extraction or native video is enough.
- Whether landing edge can be detected without overfitting to camera angle.

Recommendation:

- Add one observed-facts layer at a time.
- Validate each layer on a small labeled clip set before using it to change
  trick naming or coaching.
- Prefer `unknown` and `needs_review` over confident but unsupported labels.

