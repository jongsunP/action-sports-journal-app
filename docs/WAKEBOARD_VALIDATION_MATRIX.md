# Wakeboard Validation Matrix

## Purpose

Validate whether the wakeboard trick taxonomy layer generalizes beyond the
single Toeside Basic Jump false-positive case.

This matrix is for coverage testing only. Do not use it as a hard-coded trick
database in product logic yet.

Use `docs/WAKEBOARD_TRICK_TAXONOMY_REFERENCE.md` as the parent-family reference
for these validation cases.

## Validation Goal

The system should classify the trick family first, then classify the specific
trick only if the family gate is satisfied.

Core rule:

```text
wake jump/basic air
must not jump directly to
invert-specific trick
```

## Output Fields To Check

For every test clip, record:

- raw Gemini primaryCandidate
- raw Gemini family
- raw Gemini approachType
- raw Gemini rotationType
- raw Gemini confidence
- raw Gemini evidenceWindows
- taxonomy safeFamilyCandidate
- taxonomy gateFailures
- app-facing primaryCandidate
- app-facing family
- app-facing rotationType
- app-facing confidence
- whether user confirmation is required

## Family Matrix

### Basic Airs

Expected family gate:

```text
Family: Basic Air / Straight Air
Invert: no
Roll axis: no
Spin axis: no, unless visible 180/360
Grab: no, unless visible hand-board contact
```

Representative tricks:

| Trick | Expected family | Expected approach | Expected rotation | Must not classify as |
| --- | --- | --- | --- | --- |
| Heelside Basic Jump | Basic Air / Straight Air | Heelside | No roll axis | Back Roll, Tantrum, Invert |
| Toeside Basic Jump | Basic Air / Straight Air | Toeside | No roll axis | Tantrum, Back Roll, Invert |
| Wake-to-wake Straight Air | Basic Air / Straight Air | Heelside or Toeside | No roll axis | Any invert-specific trick |
| One-wake Jump | Basic Air / Straight Air | Heelside or Toeside | No roll axis | Invert, Spin, Raley |
| Ollie / small pop | Basic Air / Straight Air | N/A or uncertain | No roll axis | Invert, Spin, Raley |

Pass criteria:

- `safeFamilyCandidate` is `basic_air` or equivalent.
- `family` is not `Invert high`.
- `rotationType` is not `Back Roll high`, `Tantrum high`, or any roll trick.
- If raw Gemini says invert, taxonomy gate downgrades it.

### Grabs

Expected family gate:

```text
Family: Grab or Basic Air with grab modifier
Invert: no unless inversion is independently visible
Roll axis: no unless roll axis is independently visible
Grab evidence: visible hand-board contact
```

Representative tricks:

| Trick | Expected family | Expected approach | Expected rotation | Must not classify as |
| --- | --- | --- | --- | --- |
| Indy Grab | Grab | Heelside or Toeside | No roll axis | Invert, Back Roll, Tantrum |
| Tail Grab | Grab | Heelside or Toeside | No roll axis | Invert, Spin without board direction change |
| Nose Grab | Grab | Heelside or Toeside | No roll axis | Invert, Raley |
| Method Grab | Grab | Heelside or Toeside | No roll axis unless visible | Back Roll unless roll axis visible |
| Mute Grab | Grab | Heelside or Toeside | No roll axis | Invert-specific trick |

Pass criteria:

- System requires visible hand-board contact before high-confidence grab.
- A stylish straight air with no visible grab should remain Basic Air.
- Grab does not automatically imply spin or invert.

### Spins

Expected family gate:

```text
Family: Spin
Invert: no unless inversion is independently visible
Spin evidence: yaw rotation and board/rider direction change
Roll axis: no unless visible roll axis
```

Representative tricks:

| Trick | Expected family | Expected approach | Expected rotation | Must not classify as |
| --- | --- | --- | --- | --- |
| Heelside 180 | Spin | Heelside | 180 yaw rotation | Back Roll, Tantrum |
| Toeside 180 | Spin | Toeside | 180 yaw rotation | Tantrum, Back Roll |
| Heelside 360 | Spin | Heelside | 360 yaw rotation | Invert without inversion |
| Toeside 360 | Spin | Toeside | 360 yaw rotation | Tantrum |
| Surface 180 | Surface Trick or Spin | Surface/toeside/heelside | 180 yaw rotation | Aerial invert |

Pass criteria:

- Spin high confidence requires visible yaw rotation.
- Landing direction alone is not enough for high-confidence spin.
- Spin should not be promoted to invert unless inversion gate passes.

### Inverts

Expected family gate:

```text
Family: Invert
Invert evidence: visible inverted body/board relationship
Rotation initiation: visible
Specific trick: only after Invert family gate passes
```

Representative tricks:

| Trick | Expected family | Expected approach | Expected rotation | Must not classify as |
| --- | --- | --- | --- | --- |
| Back Roll | Invert | Heelside | Roll axis present | Tantrum without trip-flip evidence |
| Tantrum | Invert | Heelside | Trip-flip/backflip mechanics | Toeside Basic Jump |
| Front Roll | Invert | Toeside or trick-specific setup | Front roll axis | Heelside Back Roll |
| Scarecrow | Invert + frontside rotation | Toeside | Front roll/frontside mechanics | Tantrum |
| Roll to Revert | Invert + spin | Heelside | Roll axis plus revert | Basic Air |

Pass criteria:

- Invert high requires visible inversion.
- Back Roll high requires heelside setup and roll-axis evidence.
- Tantrum high requires heelside setup and trip-flip/backflip mechanics.
- Toeside approach should block Tantrum high unless expert-confirmed evidence
  clearly contradicts the approach read.
- If inversion is ambiguous, confidence should be medium or low and user
  confirmation should be required.

### Raley Family

Expected family gate:

```text
Family: Raley-based
Raley evidence: stretched body extension away from board, line tension, board
behind/under body pattern depending on camera angle
Invert: not automatically
Roll axis: not automatically
```

Representative tricks:

| Trick | Expected family | Expected approach | Expected rotation | Must not classify as |
| --- | --- | --- | --- | --- |
| Raley | Raley-based | Usually heelside | No roll axis unless added | Back Roll, Tantrum |
| Krypt | Raley-based + 180 | Heelside | Raley extension plus 180 | Basic Air |
| Hoochie Glide | Raley-based + grab | Heelside | Raley extension plus grab | Back Roll |
| S-Bend | Raley-based + rotation | Heelside | Raley plus roll/spin mechanics | Basic Air |
| Batwing | Raley-based + grab/invert-like extension | Heelside | Raley-style extension | Tantrum unless trip-flip evidence |

Pass criteria:

- Raley family requires visible raley-style extension.
- A big straight air should not become Raley without extension evidence.
- Raley should not become Back Roll/Tantrum unless roll/invert gates pass.

## Cross-Family Contradiction Tests

Use these as regression tests after every taxonomy/prompt change.

| Clip reality | Bad output to catch | Expected taxonomy behavior |
| --- | --- | --- |
| Toeside Basic Jump | Tantrum high | Downgrade to Basic Air / Straight Air or needs_review |
| Toeside Basic Jump | Back Roll high | Downgrade to Basic Air / Straight Air or needs_review |
| Heelside Basic Jump | Back Roll high | Downgrade unless visible inversion + roll axis exist |
| Straight Air with grab style but no hand contact | Grab high | Downgrade grab confidence |
| 180 spin | Invert high | Downgrade invert if no visible inversion |
| Big air with board above rider due to camera angle | Invert high | Downgrade unless body/board inversion is explicit |
| Crash after straight air | Invert high | Do not let crash/outcome create trick identity |

## Test Plan

### Phase 1: Known Clips

Collect at least one known clip for each group:

- Toeside Basic Jump
- Heelside Basic Jump
- Back Roll
- Tantrum
- Heelside 180 or Toeside 180
- One grab
- One Raley-family example if available

For each clip:

1. Add a fresh local Session in the standalone iPhone app.
2. Attach the clip.
3. Run Gemini evidence extraction.
4. Retrieve the latest debug capture from `/debug/evidence-captures`.
5. Record raw Gemini output and taxonomy-gated safe output.
6. Mark pass/fail against the family matrix.

### Phase 2: False Positive Regression

Re-run clips that previously failed:

- Toeside Basic Jump misclassified as Back Roll / Invert.
- Toeside Basic Jump misclassified as Tantrum / Invert.

Pass condition:

- Raw Gemini may still be wrong.
- App-facing safe result must not remain `Invert high`, `Back Roll high`, or
  `Tantrum high` unless family gates pass.

### Phase 3: False Negative Check

Run known real invert clips.

Pass condition:

- Back Roll and Tantrum should still be allowed when visible family gates pass.
- Taxonomy should not over-block true inverts.

### Phase 4: Confidence Calibration

For each clip, assign:

```text
high = visible independent evidence satisfies family gate
medium = plausible but one key gate weak
low = ambiguous, missing gate evidence, or cross-family contradiction
```

The system should prefer `medium/low + user confirmation` over a wrong
high-confidence trick name.

## Recording Template

```text
Clip:
Known reality:
Expected family:
Expected approach:
Expected rotation:
Expected negative gates:

Raw primaryCandidate:
Raw family:
Raw approachType:
Raw rotationType:
Raw confidence:

Safe primaryCandidate:
Safe family:
Safe rotationType:
Safe confidence:
Taxonomy warnings:
Gate failures:

Pass/fail:
Notes:
```

## Current Priority

Measure generalization before adding more trick-specific rules.

Do not optimize only for the Toeside Basic Jump false positive. The taxonomy
layer should protect family-level classification first, then allow
trick-specific classification only after the family gate is satisfied.
