# Wakeboard Trick Taxonomy Reference

## Purpose

This document is a reference source for AI evidence extraction. It exists to
prevent the AI from confusing parent trick families before naming a specific
wakeboard trick.

The core rule:

```text
Classify the parent trick family first.
Name a specific trick only after that family gate passes.
```

## Approach Is Not A Trick Family

Heelside and Toeside are approach or edge directions.

They are not trick families.

Examples:

- Heelside Basic Jump is still Basic Air / Straight Air.
- Toeside Basic Jump is still Basic Air / Straight Air.
- Heelside approach alone does not imply Back Roll or Tantrum.
- Toeside approach alone does not imply Front Roll, Scarecrow, or any advanced trick.

Approach can support a trick classification, but it cannot replace family
evidence.

## Top-Level Trick Families

### Basic Air / Straight Air

Definition:

A wake jump or straight air where the rider leaves the water, travels through
the air, and lands or attempts to land without visible spin, grab, roll-axis,
inversion, or raley-style extension.

Required visual evidence:

- Wake jump, pop, or straight-air movement.
- No visible roll axis.
- No visible inverted body/board relationship.
- No visible hand-board grab.
- No visible raley-style extension.

Common examples:

- Heelside Basic Jump
- Toeside Basic Jump
- Wake-to-wake Straight Air
- One-wake Jump
- Ollie / small pop

Forbidden cross-family jumps:

- Do not classify a Basic Air as Back Roll because the board rises high.
- Do not classify a Basic Air as Tantrum because the rider leans back.
- Do not classify a Basic Air as Invert without visible inversion.
- Do not classify a Basic Air as Spin without visible yaw rotation.

### Surface Tricks

Definition:

Tricks performed on or near the water surface, often with board direction
changes, slides, butter-style movement, presses, or surface 180s.

Required visual evidence:

- Board remains on or close to the water.
- Movement occurs primarily on the surface rather than as an aerial wake jump.
- Direction change, slide, press, or butter movement is visible.

Forbidden cross-family jumps:

- Do not classify surface movement as an aerial invert.
- Do not classify a surface 180 as an invert or raley.

### Grabs

Definition:

Aerial tricks where the rider visibly grabs the board.

Required visual evidence:

- Clear hand-to-board contact.
- The hand-board contact must be visible, not inferred from style or body shape.

Common examples:

- Indy Grab
- Tail Grab
- Nose Grab
- Method Grab
- Mute Grab

Forbidden cross-family jumps:

- Do not classify a stylish straight air as Grab without visible hand-board contact.
- Do not classify Grab as Invert unless inversion is independently visible.
- Do not classify Grab as Spin unless yaw rotation is independently visible.

### Spins

Definition:

Tricks where the rider rotates around a vertical/yaw axis, such as 180s or
360s.

Required visual evidence:

- Visible yaw rotation.
- Board/rider direction change across takeoff, airborne phase, and landing.
- Landing direction alone is not enough for high confidence.

Common examples:

- Heelside 180
- Toeside 180
- Heelside 360
- Toeside 360

Forbidden cross-family jumps:

- Do not classify Spin as Invert unless visible inversion exists.
- Do not classify ambiguous landing direction as Spin high confidence.

### Inverts

Definition:

Tricks where the rider and board visibly invert, roll, flip, or rotate through
an inverted body/board relationship.

Required visual evidence:

- Visible inverted body/board relationship.
- Visible rotation initiation.
- Trick-specific rotation or flip mechanics.
- Specific trick naming only after Invert family gate passes.

Common examples:

- Back Roll
- Tantrum
- Front Roll
- Scarecrow
- Roll to Revert

Forbidden cross-family jumps:

- Do not classify a wake jump as Invert from airtime alone.
- Do not classify a board rising above the rider as Invert unless the
  body/board relationship is clearly inverted.
- Do not classify crash posture as Invert.
- Do not classify Basic Air as Tantrum or Back Roll unless Invert gates pass.

### Raley-Based Tricks

Definition:

Tricks based on a raley-style extension pattern where the rider's body extends
away from the board under line tension.

Required visual evidence:

- Raley-style body extension.
- Strong line tension.
- Board/body extension pattern consistent with raley mechanics.

Common examples:

- Raley
- Krypt
- Hoochie Glide
- S-Bend
- Batwing

Forbidden cross-family jumps:

- Do not classify a big straight air as Raley without extension evidence.
- Do not classify Raley as Back Roll or Tantrum unless roll/invert gates also
  pass.

## Basic Air Vs Invert Gates

Basic Air / Straight Air is the safe family when:

- The rider jumps or pops from the wake.
- No visible inversion exists.
- No visible roll axis exists.
- No clear spin, grab, or raley evidence exists.

Invert family is allowed only when:

- Visible inverted body/board relationship exists.
- Rotation initiation is visible.
- The evidence is more than airtime, camera angle, board height, landing crash,
  or body lean.

If inversion is ambiguous, use:

```text
Family: Basic Air / Straight Air or Unknown
Confidence: low or medium
User confirmation: required
```

## Tantrum Gate

Tantrum belongs to the heelside backflip / invert family.

Required visual evidence:

- Invert family gate passes.
- Heelside setup is visible.
- Trip-flip or backflip-like mechanics are visible.
- Rotation initiation is visible.

Forbidden:

- Do not classify Toeside Basic Jump as Tantrum.
- Do not classify any toeside approach as Tantrum high confidence.
- Do not classify a straight air or crash as Tantrum.
- Do not classify Tantrum high if visible inversion is missing.

## Back Roll Gate

Back Roll belongs to the invert / roll-axis family.

Required visual evidence:

- Invert family gate passes.
- Heelside setup is visible.
- Roll-axis evidence is visible.
- Rotation initiation is visible.
- Inverted body/board relationship is visible.

Forbidden:

- Do not classify Back Roll high without roll-axis evidence.
- Do not classify Back Roll high without visible inversion.
- Do not classify Back Roll high from airtime, board height, or crash alone.
- Do not classify Toeside Basic Jump as Back Roll unless visible invert and
  roll-axis evidence clearly contradict the basic-air read.

## Toeside Basic Jump Gate

Toeside Basic Jump belongs to Basic Air / Straight Air.

Required visual evidence:

- Toeside approach or toe-edge wake approach.
- Wake jump / straight-air pop.
- No visible inversion.
- No visible roll axis.
- No visible back-roll mechanics.
- No clear spin, grab, or raley evidence.

Expected output:

```text
Family: Basic Air / Straight Air
Approach: Toeside
Rotation: No roll axis
Invert: No
Specific trick: Toeside Basic Jump or Basic Air / Straight Air
```

Forbidden:

- Do not classify Toeside Basic Jump as Tantrum.
- Do not classify Toeside Basic Jump as Back Roll.
- Do not classify Toeside Basic Jump as Invert high.

## Do Not Infer Advanced Invert Tricks From Airtime Alone

Airtime is not inversion.

Board height is not inversion.

A rider leaning back is not Tantrum.

A board appearing above the rider from camera perspective is not enough for
Back Roll.

Crash or landing failure is outcome evidence. It must not create trick
identity.

Advanced invert tricks require explicit visual evidence of the parent family
gate plus trick-specific mechanics.

## Parent-Family Gate Must Pass Before Specific Trick Naming

The AI must follow this order:

```text
Visible facts
-> parent family gate
-> family confidence
-> specific trick candidate
-> trick confidence
```

Do not allow:

```text
wake jump
-> Tantrum
```

Do not allow:

```text
wake jump
-> Back Roll
```

Allowed:

```text
wake jump
-> Basic Air / Straight Air
```

Allowed only with visible inversion and roll/flip evidence:

```text
wake jump
-> Invert
-> Back Roll / Tantrum / Front Roll / Scarecrow
```

When unsure, prefer:

```text
Basic Air / Straight Air
or
Unknown / needs_review
```

over a wrong high-confidence advanced trick name.
