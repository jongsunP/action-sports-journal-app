# GrabObservedFacts Design

## Purpose

This document designs `GrabObservedFacts` before implementation.

It is documentation only. It does not change code, prompts, schema, migrations,
or UI.

Goal:

- Add a small observable grab layer to the wakeboard evidence pipeline.
- Record visible hand-to-board contact facts before any grab trick naming.
- Avoid false grab labels from style, knee tuck, body shape, or trick name.
- Keep the MVP schema flat, following `PopObservedFacts`,
  `RotationObservedFacts`, and `LandingObservedFacts`.
- Account for Gemini structured schema complexity by allowing a JSON string
  carrier if direct object schema becomes too complex.

## Existing Pattern Review

### ApproachObservedFacts

Current role:

- Extract stance, lead foot, board direction, wake crossing path, edge
  direction evidence, handle position, and body orientation.
- Derive heelside / toeside / switch only after observed facts are collected.

Pattern:

- Rich structured object.
- Several fields use `{ value, confidence, evidence }`.
- Approach decision is derived after normalization.
- Final approach window is important; earlier setup is context only.
- Debug capture preserves raw facts and derived app-facing result.

Grab design lesson:

- Do not ask Gemini to jump straight to a grab trick name.
- Ask for visible hand/board facts first, then allow later classifier stages to
  use those facts.

### EdgeLoadObservedFacts

Current role:

- Separate inferred edge labels from physical toe/heel edge-load evidence.

Pattern:

- More detailed than Pop/Rotation.
- Uses multiple physical evidence fields.
- Has explicit `antiEdgeLoadEvidence`.
- Validator downgrades label-only or body-orientation-only evidence.

Grab design lesson:

- "Looks like a grab" is not enough.
- Physical hand-to-board contact must be separated from inferred grab labels.

### PopObservedFacts

Current role:

- Describe takeoff/pop mechanics without naming tricks.

Current flat pattern:

```ts
type PopObservedFacts = {
  popType: string | null;
  timing: string | null;
  intensity: string | null;
  evidenceText: string | null;
  confidence: 'high' | 'medium' | 'low';
  antiEvidence: string[];
};
```

Validation pattern:

- One aggregate confidence.
- One evidence text.
- One anti-evidence array.
- High confidence requires visible physical indicators.
- Medium confidence is allowed when evidence is meaningful but incomplete.

Grab design lesson:

- Use one aggregate confidence for the grab object.
- Do not add per-field confidence objects in the MVP.

### RotationObservedFacts

Current role:

- Describe airborne rotation mechanics without naming Back Roll, Tantrum, or
  other tricks.

Current flat pattern:

```ts
type RotationObservedFacts = {
  rotationAxis: string | null;
  rotationDirection: string | null;
  inversionDetected: true | false | 'unknown';
  spinDegrees: string | null;
  handlePassObserved: true | false | 'unknown';
  evidenceText: string | null;
  confidence: 'high' | 'medium' | 'low';
  antiEvidence: string[];
};
```

Validation pattern:

- Clear absence of rotation can be valid evidence for Basic Jump cases.
- Rotation trick confidence remains strict.
- Validator reports before/after, adjusted, needsReview, independent evidence
  count, rules applied, and rejected high-confidence reasons.

Grab design lesson:

- Clear absence of grab can be valid evidence.
- A non-grab Basic Air should not be marked for review simply because no grab is
  present, if the evidence clearly says both hands stayed on the handle or no
  contact was visible.

### LandingObservedFacts

Current role:

- Describe landing/recovery outcome without changing trick identity.

Current flat pattern:

```ts
type LandingObservedFacts = {
  landingVisible: true | false | 'unknown';
  landingOutcome: string | null;
  boardContact: string | null;
  edgeOnLanding: string | null;
  handlePosition: string | null;
  balanceRecovery: string | null;
  evidenceText: string | null;
  confidence: 'high' | 'medium' | 'low';
  antiEvidence: string[];
};
```

Important implementation lesson:

- Direct Gemini object schema for `landingObservedFacts` increased structured
  schema complexity.
- The working MVP uses a compact JSON string carrier for Landing, then parses
  and normalizes server-side.

Grab design lesson:

- Prefer a flat object conceptually.
- Be prepared to implement `grabObservedFacts` as a JSON string carrier in the
  Gemini response schema to avoid another `400 INVALID_ARGUMENT` schema
  complexity failure.

## Pipeline Position

Current evidence pipeline direction:

```text
Video
-> Moment
-> AnalysisJob
-> Gemini Pro
-> ApproachObservedFacts
-> EdgeLoadObservedFacts
-> PopObservedFacts
-> RotationObservedFacts
-> LandingObservedFacts
-> Validator
-> EvidenceResult
```

Recommended future position:

```text
Video
-> Moment
-> AnalysisJob
-> Gemini Pro
-> ApproachObservedFacts
-> EdgeLoadObservedFacts
-> PopObservedFacts
-> RotationObservedFacts
-> GrabObservedFacts
-> LandingObservedFacts
-> Validator
-> EvidenceResult
```

Rationale:

- Grab observations happen during the airborne phase.
- Rotation and pop facts provide context for when the rider is airborne.
- Landing should remain after airborne observations because it describes
  recovery rather than trick identity.

## Trick Identity Separation Rules

`GrabObservedFacts` must not decide:

- primary trick name
- parent trick family
- approach type
- spin degrees
- invert classification
- coaching conclusion

It may provide evidence for later stages:

- whether a Grab family candidate is allowed,
- whether a specific grab name is plausible,
- whether coaching can mention releasing the handle or reaching for the board.

MVP rule:

- Do not classify grab trick names in `GrabObservedFacts`.
- Do not output `indy`, `melon`, `mute`, `stalefish`, `method`, `tail grab`,
  or `nose grab` as a final trick label from this layer.
- Record only:
  - hand,
  - board zone,
  - timing,
  - duration,
  - visibility,
  - evidence and anti-evidence.

Do not allow:

```text
predicted_trick=Indy -> grabDetected=true
family=Grabs -> contactVisible=true
stylish tucked jump -> mute grab
knees pulled up -> indy grab
hand near knee -> board contact
board poke/style -> grabDetected=true
arm swing -> contactVisible=true
handle movement -> board contact
```

Allowed direction:

```text
visible hand touches board -> grabDetected=true
visible rear hand touches toe-side edge between bindings -> indy candidate allowed
visible hand never leaves handle -> grabDetected=false
hand moves toward board but contact hidden -> grabDetected=unknown or low
hand reaches toward board without contact -> grabDuration=attempted_reach, not actual grab
```

## Observable Grab Elements

The MVP should ask for only the facts needed to answer:

- Was any hand-to-board contact visible?
- Which hand appeared to contact the board?
- Which broad board zone was contacted?
- When did contact occur in the airborne phase?
- Was contact held or only momentary?
- What visible evidence supports or contradicts the claim?

Observable visual elements:

- hand leaves handle,
- hand reaches toward board,
- hand visibly touches board,
- contact point on board edge/zone,
- contact happens while airborne,
- contact is held across more than one frame/moment,
- both hands remain on handle,
- contact is hidden by body, board, spray, camera crop, or resolution.

## MVP Field Draft

Recommended flat MVP type:

```ts
type GrabObservedFacts = {
  grabDetected: true | false | 'unknown';
  contactVisible: true | false | 'unknown';
  grabbingHand: string | null;
  grabbedBoardZone: string | null;
  grabTiming: string | null;
  grabDuration: string | null;
  evidenceText: string | null;
  confidence: 'high' | 'medium' | 'low';
  antiEvidence: string[];
};
```

Matching validation result:

```ts
type GrabValidationResult = {
  before: GrabObservedFacts;
  after: GrabObservedFacts;
  adjusted: boolean;
  needsReview: boolean;
  independentGrabEvidenceCount: number;
  rulesApplied: string[];
  rejectedHighConfidenceReasons: string[];
};
```

Why not include detailed grab taxonomy in MVP:

- Specific grab labels are visually hard to distinguish from a single mobile
  video.
- Large enums increase schema complexity.
- The first product goal is truthfulness and uncertainty calibration, not
  complete grab taxonomy.

## Controlled Vocabulary

Use strings in the Gemini schema, but constrain values in the prompt and
normalizer.

### grabDetected

Allowed values:

```text
true
false
unknown
```

Use `true` only when:

- actual hand-to-board contact is visible,
- the hand/finger and board contact point is visible,
- the contact occurs before water landing,
- contact is not inferred from body style, knee tuck, expected trick name, or
  handle movement.

`grabDetected=true` means actual grab, not attempted reach.

Do not use `true` for:

- hand passing near board,
- hand reaching downward with contact hidden,
- hand/board overlap without a visible contact point,
- board poked toward hand,
- knees tucked near chest,
- arm swing after takeoff,
- rope/handle movement near board,
- contact blocked by crop, spray, body overlap, or low resolution.

Use `false` when:

- no hand-to-board contact is visible,
- hands remain on the handle,
- hands remain away from the board,
- the clip clearly shows the airborne phase and no contact occurs.

Clear no-grab evidence is useful evidence. It may support medium or high
confidence for `grabDetected=false` when the relevant hand/board area is visible
through the airborne phase.

Use `unknown` when:

- the hand moves toward the board but contact is obscured,
- video quality is too low,
- board or hand is cropped,
- splash/body/rope blocks contact.
- only attempted reach is visible.

High confidence is prohibited when:

- `grabDetected=true` and `contactVisible` is not `true`,
- evidenceText does not describe actual contact,
- evidenceText does not identify a visible hand/finger-board contact point,
- the positive claim is based on a grab name or style cue.

### contactVisible

Allowed values:

```text
true
false
unknown
```

Use `true` only when hand-to-board contact itself is visible.

Stricter MVP rule:

- The visible contact point between hand/fingers and board must be observable.
- Hand near board, hand/board overlap, body occlusion, board poke/style, and
  "appears to grab" language are not enough.

Use `false` when:

- the video clearly shows no contact,
- both hands stay on the handle,
- the hand/board area is visible enough to reject contact.

Use `unknown` when the hand/board area is not visible enough.

Validator rule:

- `grabDetected=true` with `contactVisible=false` is invalid and should be
  downgraded.
- `grabDetected=true` with `contactVisible=unknown` cannot be high confidence.
- `contactVisible=true` with `grabDetected=false` is a conflict unless
  evidenceText explains that visible contact was accidental/non-grab after
  landing.
- `contactVisible=false` with clear no-grab evidence may be medium/high
  confidence for a negative grab result.

### grabbingHand

Allowed values:

```text
front_hand
rear_hand
both_hands
unknown
none
```

Use `none` when no grab is visible.

Use `unknown` when contact may exist but hand identity is unclear.

Do not infer front/rear hand from expected trick name.

High confidence is prohibited when:

- `grabbingHand` is `front_hand`, `rear_hand`, or `both_hands`, but
  `contactVisible` is not `true`,
- hand identity is inferred from grab name rather than visible hand position.

### grabbedBoardZone

Allowed values:

```text
toe_edge_between_bindings
heel_edge_between_bindings
nose
tail
frontside_edge
backside_edge
center_board
unknown_zone
none
```

Notes:

- These are broad observed zones, not final grab names.
- `toe_edge_between_bindings` plus `rear_hand` may later support an Indy
  candidate, but `GrabObservedFacts` itself should not name Indy as the trick.
- `heel_edge_between_bindings` plus `front_hand` may later support Melon.
- `frontside_edge` / `backside_edge` are allowed only when camera/rider frame
  makes toe/heel edge uncertain but the side is visibly contacted.

Use `none` when no contact is visible.

Use `unknown_zone` when contact is visible but the exact zone is hidden.

High confidence is prohibited when:

- a specific board zone is named but contact is not visible,
- board zone is inferred from Indy/Melon/Mute/Stalefish naming,
- board zone is guessed from camera angle or board poke/style.

### grabTiming

Allowed values:

```text
takeoff
rising
peak_air
descent
landing
unknown
none
```

Use `landing` only if hand-board contact happens at or after water contact; it
should not support a grab trick high confidence.

Use `none` when no grab is visible.

Use `unknown` when contact may exist but the moment is not visible.

High confidence is allowed only when the contact moment is visible and occurs
during `rising`, `peak_air`, or `descent`.

### grabDuration

Allowed values:

```text
momentary
held
attempted_reach
none
unknown
```

Use `attempted_reach` when the hand reaches toward the board but contact is not
visible.

Use `held` only when contact is visible across a meaningful portion of the
airborne phase.

Use `momentary` when a single visible contact moment exists but the hold is not
clearly sustained.

Use `none` when no contact attempt or contact is visible.

High confidence is prohibited for `held` unless contact is visible across
multiple frames/moments or the video clearly shows a sustained hold.

### evidenceText

Free text, but must describe visible mechanics.

Good examples:

```text
rear hand visibly leaves handle and touches toe-side edge between bindings near peak air
front hand reaches toward board, but the actual contact point is hidden by the rider's body
both hands remain on handle throughout the jump; no hand-board contact is visible
```

Bad examples:

```text
looks like an Indy
stylish grab
grab trick
probably grabbed because knees are tucked
```

### confidence

Allowed values:

```text
high
medium
low
```

One aggregate confidence for the whole GrabObservedFacts object.

No per-field confidence objects in the MVP.

### antiEvidence

String array.

Expected examples:

```text
no visible hand-board contact
both hands remain on handle
hand near board but contact is obscured
board zone hidden by body
camera crop hides hand and board contact
low resolution prevents confirming contact
spray obscures board edge
contact only inferred from trick label
```

## Confidence Rules

### High

Allow high only when all are true:

- `contactVisible=true`
- `grabDetected=true`
- hand-to-board contact occurs during airborne phase
- evidenceText describes visible contact mechanics
- at least two independent indicators are present:
  - hand leaves handle,
  - hand visibly touches board,
  - contacted board zone visible,
  - contact occurs before landing,
  - contact is held or visible across more than one moment.

### Medium

Allow medium when:

- contact is visible but hand or board zone is partly unclear,
- hand identity is visible but board zone is hidden,
- board zone is visible but contact duration is unclear,
- contact is likely visible but video quality limits certainty.

Medium is also acceptable for clear no-grab evidence:

```text
grabDetected=false
contactVisible=false
grabbingHand=none
grabbedBoardZone=none
evidenceText says both hands remained on handle or no hand-board contact is visible
```

### Low

Use low when:

- contact is not visible,
- hand only moves near the board,
- evidence is label-only,
- camera crop hides the relevant area,
- low resolution prevents confirmation,
- body/board overlap hides contact,
- contact is inferred from trick name, style, or knee tuck.

## False Positive Prevention

The following cues are not sufficient for `grabDetected=true`:

- knee tuck,
- arm swing,
- handle movement,
- handle pass attempt,
- board poke,
- stylish body position,
- hand passing near board,
- hand/board overlap without visible contact point,
- rider looking down at board,
- hand near knee or boot,
- body/board overlap,
- occlusion,
- camera crop,
- low resolution,
- spray/splash,
- a predicted grab trick name.

Allowed interpretations:

```text
hand passes near board, contact hidden
-> grabDetected=unknown
-> contactVisible=unknown
-> grabDuration=attempted_reach
-> confidence=low

knees tuck up, both hands remain on handle
-> grabDetected=false
-> contactVisible=false
-> confidence=medium or high if clearly visible

board poke/style without hand contact
-> grabDetected=false or unknown
-> antiEvidence includes board style without hand-board contact

arm swings after takeoff
-> not grab evidence unless hand touches board

handle moves near board
-> not grab evidence unless hand leaves handle and touches board
```

Hard rule:

```text
No visible hand-to-board contact
-> no positive grab high confidence

No visible hand/finger-board contact point
-> no positive grab result
-> use unknown or attempted_reach
```

## Anti-Evidence Rules

Gemini should actively write anti-evidence when:

- both hands stay on the handle,
- hand moves toward board but contact is hidden,
- board edge/zone is hidden,
- rider body blocks the hand-board area,
- camera crop hides hand or board,
- resolution is too low,
- spray or wake obscures contact,
- the claim is based on a grab label rather than visible contact,
- contact would only be visible after landing or during crash.

Validator should add post-validation anti-evidence when:

- confidence is high but contact is not visible,
- confidence is high but evidenceText is missing,
- grabDetected is true but contactVisible is false,
- a board zone is named while contactVisible is false/unknown,
- grabbingHand is front/rear/both while grabDetected is false,
- grab timing is landing but confidence is high,
- evidenceText is label-only.

## Validator Rules

MVP validator should follow the Pop/Rotation/Landing shape.

Required rules:

1. `grabDetected=true` requires `contactVisible=true` for high confidence.
2. `contactVisible=false` prohibits high confidence for a positive grab.
3. `contactVisible=unknown` prohibits high confidence.
4. Missing `evidenceText` prohibits high confidence.
5. Label-only evidence such as "Indy grab" or "grab trick" is downgraded.
6. Knee tuck, stylish body position, or board near hand cannot produce high
   confidence without visible contact.
7. `grabbedBoardZone` must be `none` or `unknown_zone` when no contact is
   visible.
8. `grabbingHand` must be `none` or `unknown` when no contact is visible.
9. `grabTiming=landing` cannot support grab high confidence.
10. Clear no-grab evidence should not automatically trigger `needsReview`.
11. `grabDuration=held` requires multiple-frame or sustained-contact evidence.
12. `grabTiming` can be high confidence only when the contact moment is visible.
13. `attempted_reach` must not be normalized into a positive grab.
14. Clear no-grab evidence may keep `confidence=high` when the airborne phase,
    hands, and board are visible enough to reject contact.
15. `grabDetected=true + contactVisible=true` is still downgraded if
    evidenceText only says near/overlap/appears/likely/close or does not name a
    visible hand/finger-board contact point.

Recommended independent evidence count:

```text
hand leaves handle
hand touches board
board zone visible
contact happens airborne
contact is held / persists across visible moments
both hands remain on handle as clear anti-grab evidence
```

High confidence positive grab:

- requires at least 2 positive independent grab indicators.

Medium confidence positive grab:

- allowed with 1 strong positive indicator and no contradiction.

Clear negative no-grab:

- may be medium confidence if evidenceText explicitly says no contact or hands
  stayed on handle.
- may be high confidence if:
  - the airborne phase is visible,
  - both hands are visible,
  - board/hand contact area is visible,
  - evidenceText explicitly says no hand-board contact or both hands remained on
    the handle.

`needsReview=true` is appropriate when:

- grabDetected true but contactVisible unknown/false,
- specific board zone is named without visible contact,
- evidence is label-only,
- confidence was downgraded from high due to missing contact mechanics,
- antiEvidence contradicts the positive grab claim.
- `grabDuration=held` lacks sustained-contact evidence,
- `grabTiming` claims a precise airborne moment without visible contact timing,
- attempted reach was reported as an actual grab.

`needsReview=false` is appropriate when:

- no grab is clearly visible and facts consistently say no contact,
- grab is visible with medium/high evidence and no contradictions,
- unknown is used honestly because the hand/board area is cropped or obscured.

Suggested downgrade matrix:

```text
grabDetected=true + contactVisible=false
-> after.grabDetected=unknown or false
-> after.confidence=low
-> needsReview=true

grabDetected=true + contactVisible=unknown
-> after.confidence <= medium
-> needsReview=true if evidenceText implies a specific grab

grabDetected=true + evidenceText label-only
-> after.confidence=low
-> needsReview=true

grabDetected=true + contactVisible=true + no explicit contact point
-> after.grabDetected=unknown
-> after.contactVisible=unknown
-> after.grabDuration=attempted_reach or unknown
-> after.confidence=low
-> needsReview=true

grabDuration=held + no sustained-contact evidence
-> after.grabDuration=momentary or unknown
-> after.confidence <= medium

grabTiming precise + contact moment not visible
-> after.grabTiming=unknown
-> high rejected

clear no-grab evidence
-> grabDetected=false
-> contactVisible=false
-> confidence may remain high
-> needsReview=false
```

## Calibration Case - ts_regular_1 False Positive

Date:

```text
2026-06-17
```

Source:

```text
dev-artifacts/benchmark-videos/ts_regular_1.mov
```

Operating Gemini Pro output before calibration:

```text
grabDetected: true
contactVisible: true
grabbingHand: rear_hand
grabbedBoardZone: toe_edge_between_bindings
grabDuration: held
confidence: medium after validator downgrade
```

Gemini evidence text:

```text
뒷손(오른손)이 핸들에서 떨어져 보드의 토우 엣지 중앙을 잡는 것이 1.50초부터 명확히 보임.
```

Manual visual check artifacts:

```text
dev-artifacts/grab-validation/ts_regular_1_2026-06-17/frame_1_50s_crop.jpg
dev-artifacts/grab-validation/ts_regular_1_2026-06-17/frame_1_65s_crop.jpg
```

Observation:

- The rider and board overlap visually around 1.50s-1.65s.
- Clear hand/finger-board contact point is not confirmed.
- The model likely interpreted hand/board proximity or overlap as a grab.

Design decision:

- `contactVisible=true` must require a visible contact point, not just a
  plausible grab posture.
- "잡는 것이 보임" without explicit contact-point evidence should be treated as
  weak positive evidence.
- Validator should downgrade/review positive grab claims that do not describe a
  visible hand/finger-board contact point.

## DB Schema Draft

Do not create this migration yet.

Future draft:

```sql
alter table public.evidence_results
  add column if not exists grab_observed_facts jsonb,
  add column if not exists grab_validation jsonb;
```

Persistence should follow existing observed-facts columns:

```text
evidence.grabObservedFacts -> evidence_results.grab_observed_facts
evidence.grabValidation -> evidence_results.grab_validation
```

If DB columns are not applied yet, server fallback should omit these columns
without breaking evidence insertion, matching the current schema-evolution
style.

## Gemini Prompt Strategy

Add Grab instructions after Rotation and before Landing.

Prompt should say:

```text
grabObservedFacts는 공중 동작 중 손과 보드의 실제 접촉 관찰 사실만
기록하세요.
트릭명, family, 스타일, 무릎 접힘, 예상 grab 이름에서 grab을 추론하지
마세요.
grabObservedFacts는 단순 schema로 작성하세요:
grabDetected, contactVisible, grabbingHand, grabbedBoardZone, grabTiming,
grabDuration, evidenceText, confidence, antiEvidence.
confidence는 GrabObservedFacts 전체에 대해 하나만 쓰고, 각 필드별
confidence 객체를 만들지 마세요.
grabDetected와 contactVisible은 true, false, unknown 중 하나로 쓰세요.
grabbingHand는 front_hand, rear_hand, both_hands, unknown, none 중 하나
또는 null로 쓰세요.
grabbedBoardZone은 toe_edge_between_bindings, heel_edge_between_bindings,
nose, tail, frontside_edge, backside_edge, center_board, unknown_zone, none 중
하나 또는 null로 쓰세요.
grabTiming은 takeoff, rising, peak_air, descent, landing, unknown, none 중
하나 또는 null로 쓰세요.
grabDuration은 momentary, held, attempted_reach, none, unknown 중 하나 또는
null로 쓰세요.
contactVisible=true는 손이 보드에 닿는 장면이 실제로 보일 때만 쓰세요.
손이 보드 근처에 있거나 무릎을 접은 것만으로 grabDetected=true를 쓰지
마세요.
Indy, Melon, Mute 같은 grab 이름만 반복하고 hand-board contact 근거가
없으면 confidence=low로 쓰고 antiEvidence에 label-only grab claim을
기록하세요.
손/보드 접촉이 crop, spray, body overlap, low resolution 때문에 안 보이면
unknown 또는 low로 쓰고 antiEvidence에 이유를 기록하세요.
grabObservedFacts는 primaryCandidate, family, approachType,
rotationType을 직접 변경하는 근거가 아닙니다. 이후 분류 단계에서만 참고될
수 있습니다.
```

Also update the required extraction list:

```text
- grabObservedFacts: airborne hand-to-board contact 관찰 사실.
  grabDetected, contactVisible, grabbingHand, grabbedBoardZone, grabTiming,
  grabDuration, evidenceText, confidence, antiEvidence
```

## Gemini Schema Strategy

Default implementation strategy:

- Use JSON string carrier for Gemini structured output.
- Keep the app-facing/server-facing result as a normalized object.
- Do not expose the JSON string carrier to app UI or Supabase consumers.

Reason:

- Landing direct object schema already hit Gemini structured schema complexity
  risk.
- Grab has several controlled vocabulary fields.
- Adding another object schema may increase constraint-state complexity again.
- JSON string carrier keeps the top-level Gemini schema stable while preserving
  typed normalized output after server parsing.

Recommended Gemini response schema:

```ts
grabObservedFacts: { type: Type.STRING, nullable: true }
```

Gemini should return a compact JSON string with this shape:

```json
{
  "grabDetected": "unknown",
  "contactVisible": "unknown",
  "grabbingHand": "unknown",
  "grabbedBoardZone": "unknown_zone",
  "grabTiming": "unknown",
  "grabDuration": "unknown",
  "evidenceText": null,
  "confidence": "low",
  "antiEvidence": []
}
```

Server should parse and normalize into:

```ts
type GrabObservedFacts = {
  grabDetected: true | false | 'unknown';
  contactVisible: true | false | 'unknown';
  grabbingHand: string | null;
  grabbedBoardZone: string | null;
  grabTiming: string | null;
  grabDuration: string | null;
  evidenceText: string | null;
  confidence: 'high' | 'medium' | 'low';
  antiEvidence: string[];
};
```

Conceptual direct object schema, only if later proven safe:

```ts
const geminiGrabObservedFactsSchema = {
  type: Type.OBJECT,
  properties: {
    grabDetected: geminiObservedBooleanSchema,
    contactVisible: geminiObservedBooleanSchema,
    grabbingHand: { type: Type.STRING, nullable: true },
    grabbedBoardZone: { type: Type.STRING, nullable: true },
    grabTiming: { type: Type.STRING, nullable: true },
    grabDuration: { type: Type.STRING, nullable: true },
    evidenceText: { type: Type.STRING, nullable: true },
    confidence: {
      type: Type.STRING,
      enum: ['high', 'medium', 'low'],
    },
    antiEvidence: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: [
    'grabDetected',
    'contactVisible',
    'grabbingHand',
    'grabbedBoardZone',
    'grabTiming',
    'grabDuration',
    'evidenceText',
    'confidence',
    'antiEvidence',
  ],
};
```

- Prompt Gemini to return a compact JSON string with the fields above.
- Parse with the existing `parseJsonObjectString` helper.
- Normalize invalid values to `unknown`, `none`, or `null`.
- Keep response/debug/persistence as normalized object.

Recommendation:

- Use JSON string carrier for Grab from the start.
- Switch to direct object schema only if schema complexity is measured and
  confirmed safe after implementation pressure decreases.

Reason:

- Landing direct object schema already triggered schema complexity risk.
- Grab has several controlled vocabulary fields.
- JSON string carrier keeps the top-level structured schema stable.

## Normalization Plan

Expected helpers:

```text
normalizeGrabObservedFacts
normalizeGrabHand
normalizeGrabBoardZone
normalizeGrabTiming
normalizeGrabDuration
validateGrabObservedFacts
cloneGrabObservedFacts
addPostValidationAntiGrabEvidence
countIndependentGrabEvidence
grabEvidenceIsLabelOnly
hasPositiveGrabContactEvidence
hasClearNoGrabEvidence
```

Normalization behavior:

- Unknown or invalid `grabDetected` -> `unknown`.
- Unknown or invalid `contactVisible` -> `unknown`.
- Invalid `grabbingHand` -> `unknown`.
- Invalid `grabbedBoardZone` -> `unknown_zone`.
- Invalid `grabTiming` -> `unknown`.
- Invalid `grabDuration` -> `unknown`.
- Missing evidenceText -> `null`.
- Missing confidence -> `low`.
- Missing antiEvidence -> `[]`.

## Persistence and Restore Plan

Expected implementation files later:

- `dev-server/index.ts`
  - parse partial support
  - normalization
  - `validateGrabObservedFacts`
  - debug capture fields
  - response fields
  - persistence insert/fallback
  - `/api/moments` evidence select list
- `src/types/index.ts`
  - `GrabObservedFacts`
  - `GrabValidationResult`
  - `GeminiEvidenceResult` optional fields
- `src/services/ai/analyzeSessionVideo.ts`
  - remote response typing
  - normalization helpers
- `src/services/moments/supabaseMoments.ts`
  - restore `grab_observed_facts`
  - restore `grab_validation`
- `supabase/phase1_schema.sql`
  - future schema documentation only
- future migration file
  - do not create until implementation begins

Possible UI file later:

- `src/features/sessions/HomeScreen.tsx`

Do not update UI in the first server/data implementation unless explicitly
requested.

## Implementation Order Recommendation

1. Add TypeScript types.
2. Add prompt instructions.
3. Add Gemini schema carrier, preferably JSON string.
4. Normalize `grabObservedFacts`.
5. Add MVP validator.
6. Include fields in debug capture and response.
7. Add Supabase columns only when migration is explicitly requested.
8. Persist and restore from Supabase after remote DB is migrated.
9. Run `npm run typecheck` and `git diff --check`.
10. Validate on:
    - one Basic Jump with no grab,
    - one possible grab clip if available,
    - one low-visibility clip where grab should remain unknown/low.

## Risks Before Implementation

### Schema Complexity

Confirmed project risk:

- Gemini structured response schema can fail when nested observed-facts layers
  accumulate.

Mitigation:

- Keep Grab flat.
- Avoid nested confidence objects.
- Use string fields instead of strict large enum schema.
- Prefer JSON string carrier from the start.

### False Positive Grab Labels

Risk:

- Model may call a tucked stylish air an Indy/Melon/Mute without visible
  contact.

Mitigation:

- Prompt and validator must require visible hand-board contact.
- Label-only grab claims should be downgraded or rejected.

### Hand and Board Zone Ambiguity

Risk:

- Wakeboard videos often have low resolution, camera crop, rope/handle overlap,
  or body occlusion.

Mitigation:

- Allow `unknown` honestly.
- Do not force specific grab names.
- Use broad board zones, not final trick names.

### Trick Identity Contamination

Risk:

- A predicted trick name may cause GrabObservedFacts to invent contact.

Mitigation:

- Explicitly prohibit deriving grab facts from `primaryCandidate`, `family`, or
  expected trick.
- Later trick naming may use GrabObservedFacts, but not the reverse.

### Negative Evidence Calibration

Risk:

- Validator may over-review every no-grab Basic Jump.

Mitigation:

- Clear no-grab evidence should be acceptable and not automatically
  `needsReview=true`.
- Treat absence of grab as useful evidence when visible.

## Implementation Decision Summary

Recommended MVP:

```ts
type GrabObservedFacts = {
  grabDetected: true | false | 'unknown';
  contactVisible: true | false | 'unknown';
  grabbingHand: string | null;
  grabbedBoardZone: string | null;
  grabTiming: string | null;
  grabDuration: string | null;
  evidenceText: string | null;
  confidence: 'high' | 'medium' | 'low';
  antiEvidence: string[];
};
```

Recommended schema carrier:

```ts
grabObservedFacts: { type: Type.STRING, nullable: true }
```

Recommended first validation target:

- Basic Jump sample with no grab:
  - expect `grabDetected=false`
  - expect `contactVisible=false` or `unknown`
  - expect `confidence=medium` if both hands/no contact are visible
  - expect no false Grab family promotion

Second validation target:

- Known grab sample, only if available:
  - expect contact visible before any specific grab naming
  - do not require exact Indy/Melon/Mute name in MVP
