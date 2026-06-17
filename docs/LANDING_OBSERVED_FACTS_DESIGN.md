# LandingObservedFacts Design

## Purpose

This document designs `LandingObservedFacts` before implementation.

It is documentation only. It does not change code, prompts, schema, migrations,
or UI.

Goal:

- Add a small, observable landing layer to the wakeboard evidence pipeline.
- Keep the schema flat, following `PopObservedFacts` and
  `RotationObservedFacts`.
- Support coaching and validation without letting landing outcome override
  trick identity.
- Avoid Gemini structured schema complexity by starting with the smallest MVP
  field set.

## Existing Pattern Review

### ApproachObservedFacts

Current role:

- Extract stance, lead foot, board direction, wake crossing path, edge
  direction evidence, handle position, and body orientation before deriving
  heelside/toeside/switch.

Pattern:

- Richer structured object.
- Several fields use `{ value, confidence, evidence }`.
- Approach decision is derived after normalization.
- Body orientation is supporting evidence only.
- Final approach window matters; earlier setup is context, not direct approach
  proof.

Implementation pattern:

- Gemini prompt asks for observed facts before labels.
- Server normalizes raw facts.
- Server derives app-facing decision.
- Debug capture keeps raw and derived results.
- Supabase persists observed facts as JSONB.

### EdgeLoadObservedFacts

Current role:

- Separate inferred edge labels from physical toe/heel edge-load evidence.

Pattern:

- More detailed than Pop/Rotation.
- Uses multiple `EvidenceFact`-style fields plus one aggregate
  `edgeLoadConfidence`.
- Has explicit `antiEdgeLoadEvidence`.
- Validator checks independent physical indicators and timing inside
  `finalApproachWindow`.

Validation lessons:

- Label-only evidence is weak.
- Body orientation alone is not edge load.
- High confidence requires at least two independent visible physical
  indicators.
- Anti-evidence is expected when confidence is high or visibility is limited.

### PopObservedFacts

Current role:

- Describe takeoff/pop mechanics without naming tricks.

Current flat schema:

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

Pattern:

- One aggregate `confidence`.
- No nested per-field confidence objects.
- Short string fields instead of large enum-heavy nested objects.
- Validator uses evidence text vocabulary and physical indicators.
- Supabase persists `pop_observed_facts` and `pop_validation` JSONB columns.

Validation lessons:

- Do not infer pop quality from trick name or airtime alone.
- High confidence requires visible physical pop evidence near takeoff.
- Medium confidence is allowed for plausible physical evidence even when not
  enough for high.
- Anti-evidence should record obscured takeoff, unclear line tension, unclear
  leg extension, and label-only claims.

### RotationObservedFacts

Current role:

- Describe airborne rotation mechanics without naming Back Roll, Tantrum, KGB,
  or other specific tricks.

Current flat schema:

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

Pattern:

- One aggregate `confidence`.
- One `evidenceText`.
- One `antiEvidence` array.
- Validator produces:
  - `before`
  - `after`
  - `adjusted`
  - `needsReview`
  - independent evidence count
  - `rulesApplied`
  - `rejectedHighConfidenceReasons`
- Supabase persists `rotation_observed_facts` and `rotation_validation`.

Validation lessons:

- Rotation high confidence requires visible rotation mechanics.
- For non-rotation Basic Jump cases, clear absence of rotation is valid
  evidence.
- Back Roll / Tantrum / Invert cases still require stricter visible axis,
  inversion, and body/board mechanics.

## Shared Implementation Pattern To Preserve

Landing should follow the Pop/Rotation MVP pattern:

```text
Gemini flat schema
↓
normalization
↓
validator
↓
debug capture
↓
response field
↓
Supabase JSONB persistence
↓
app restore
```

Shared design rules:

- Keep the schema flat.
- Use one aggregate `confidence`.
- Do not add nested confidence objects.
- Use `antiEvidence: string[]`.
- Add a matching `LandingValidationResult`.
- Preserve raw Gemini result through debug capture.
- Produce app-facing safe normalized result.
- Store as JSONB in Supabase after the schema is stable.

## Pipeline Position

Current pipeline:

```text
Video
↓
Moment
↓
AnalysisJob
↓
Gemini Pro
↓
ApproachObservedFacts
↓
EdgeLoadObservedFacts
↓
PopObservedFacts
↓
RotationObservedFacts
↓
Validator
↓
EvidenceResult
```

Proposed pipeline after Landing:

```text
Video
↓
Moment
↓
AnalysisJob
↓
Gemini Pro
↓
ApproachObservedFacts
↓
EdgeLoadObservedFacts
↓
PopObservedFacts
↓
RotationObservedFacts
↓
LandingObservedFacts
↓
Validator
↓
EvidenceResult
```

Important rule:

Landing is an outcome and coaching layer. It should not be the primary source
for trick identity.

## LandingObservedFacts Purpose

`LandingObservedFacts` should answer:

- Is the landing visible?
- Did the board contact water cleanly?
- Did the rider ride away, butt check, edge catch, lose handle, or crash?
- Was the handle controlled at landing?
- Was the rider balanced after contact?
- Was recovery visible?
- What evidence argues against a confident landing judgment?

It should not answer:

- What trick was performed?
- Was the trick an invert?
- Was the approach heelside or toeside?
- Did the rider perform a Back Roll or Tantrum?

## Trick Identity Isolation Rules

LandingObservedFacts must be isolated from trick naming.

Confirmed design rule:

```text
Landing outcome can affect coaching and review status.
Landing outcome must not create or override trick identity.
```

Allowed uses:

- Support coaching on handle control, edge catch, absorption, recovery, and
  ride-away quality.
- Add uncertainty when landing evidence contradicts claimed completion.
- Help explain whether the rider completed, recovered, or crashed.

Forbidden uses:

- Do not classify `Back Roll`, `Tantrum`, `Spin`, `Grab`, or `Basic Jump` from
  landing shape.
- Do not promote `family=Invert` because the rider crashed hard.
- Do not promote `rotationType` because the rider lands sideways.
- Do not change `approachType` because the landing edge appears toe/heel.
- Do not use clean landing to increase trick-name confidence if takeoff and
  airborne evidence are weak.
- Do not use crash outcome to lower a valid trick identity into `unknown`.

Examples:

```text
Allowed:
The rider attempted/was classified as Back Roll, but landingObservedFacts says
crash because the rider did not ride away.

Forbidden:
The rider crashed, so primaryCandidate becomes Back Roll.
```

```text
Allowed:
The rider has Basic Jump evidence and landingObservedFacts says clean.

Forbidden:
The rider rode away cleanly, so confidence in trick identity becomes high even
though pop/rotation facts are weak.
```

## MVP Field Proposal

Use this as the first implementation target:

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

Controlled vocabulary should be normalized server-side, not enforced as a large
Gemini enum in the first structured schema. This keeps the Gemini schema flat
while still giving the validator a strict target.

### landingVisible

Allowed values:

```text
true
false
unknown
```

Purpose:

- Say whether the actual water contact and immediate outcome are visible.

Use `true` when:

- Board contact and rider outcome are both visible.
- The water-contact frame or immediate landing result is visible enough to
  inspect.

Use `false` when:

- The clip ends before landing.
- The rider is fully out of frame during landing.
- The camera loses the rider before board-water contact.

Use `unknown` when:

- The landing area is partially visible but splash, crop, or blur prevents a
  reliable call.
- Only the aftermath is visible and it is unclear whether landing itself was
  seen.

Gemini must not guess:

- Do not set `landingVisible=true` because the rider is airborne and must
  eventually land.
- Do not infer visible landing from the trick name or from a completed
  `landingOutcome` label.

Anti-evidence examples:

- `video ends before landing`
- `landing out of frame`
- `splash obscures landing`
- `camera loses rider`

Validator reject conditions:

- If `landingVisible=false`, confidence cannot be high or medium unless the
  only claim is a low-confidence absence statement.
- If `landingVisible=unknown`, confidence cannot be high.
- If `landingVisible=false/unknown`, specific outcome values such as `clean`,
  `butt_check`, `edge_catch`, or `crash` require downgrade and review unless
  `evidenceText` explains that only aftermath was visible.

### landingOutcome

Allowed values:

```text
clean
butt_check
edge_catch
handle_loss
over_rotated
under_rotated
crash
rides_away
not_visible
unknown
```

MVP guidance:

- Keep as string, not strict enum, to reduce Gemini schema rigidity.
- Normalize known values server-side.
- Unknown is valid.

Meaning:

- `clean`: board contacts water and rider continues riding with control.
- `butt_check`: hips/butt touch or skim water, but rider may partially recover.
- `edge_catch`: visible edge dig, abrupt stop, or fall caused by edge contact.
- `handle_loss`: handle is dropped or pulled away.
- `over_rotated`: landing direction or body continues past control point.
- `under_rotated`: rider does not complete expected body/board position before
  water contact.
- `crash`: rider falls or cannot continue.
- `rides_away`: rider continues after landing, but landing quality may still
  need more detail.
- `not_visible`: landing is not visible enough to judge outcome.
- `unknown`: landing is visible or partially visible, but the outcome cannot be
  classified safely.

Use `null` when:

- Gemini cannot produce any outcome field due to malformed/partial response.
- Normalization receives an unrecognized empty value.

Gemini must not guess:

- Do not infer `clean` from trick confidence or from a polished-looking takeoff.
- Do not infer `crash` from a failed trick label or from a splash alone.
- Do not infer `butt_check` unless hips/butt contact or water skim is visible.
- Do not use `over_rotated` or `under_rotated` unless landing body/board
  position is visible enough to compare against the intended direction.
- Do not use landing outcome to rename the trick.

Anti-evidence conditions:

- landing not visible
- only aftermath visible
- splash hides hips/board
- rider exits frame before recovery
- outcome inferred from trick name

Validator reject conditions:

- `clean` requires visible board contact plus ride-away or stable recovery.
- `butt_check` requires visible hip/butt water contact or skim.
- `edge_catch` requires visible edge dig, abrupt stop, or fall tied to edge
  contact.
- `crash` requires visible fall/loss of riding continuation, not just a large
  splash.
- `handle_loss` requires dropped handle or handle pulled away visibly.
- Specific outcome with `landingVisible=false` should be downgraded to
  `not_visible` or `unknown`.

### boardContact

Allowed values:

```text
clean_contact
tail_first
nose_first
flat
edge_contact
hard_impact
not_contacted_visible
not_visible
unknown
```

Purpose:

- Capture visible board-water contact, not inferred landing success.

Evidence examples:

- board lands flat and continues
- nose catches first
- tail contacts first
- edge digs into water
- splash hides board

Use `not_visible` when:

- Board-water contact is off frame or hidden by splash.

Use `unknown` when:

- Board contact is partially visible but the exact contact type is unclear.

Use `null` when:

- The field is missing or cannot be normalized.

Gemini must not guess:

- Do not infer board contact from `landingOutcome`.
- Do not infer `flat` from a clean-looking ride-away unless the board-water
  contact is visible.
- Do not infer `edge_contact` from approach edge or landing direction.

Anti-evidence conditions:

- splash obscures board contact
- board out of frame
- contact happens behind wake spray
- camera blur during water contact

Validator reject conditions:

- `clean_contact`, `flat`, `tail_first`, `nose_first`, `edge_contact`, and
  `hard_impact` require `landingVisible=true`.
- High confidence is rejected if boardContact is `not_visible`, `unknown`, or
  null.
- `landingOutcome=clean` with `boardContact=edge_contact` or `hard_impact`
  should be marked `needsReview=true` unless evidenceText explains a stable
  recovery.

### edgeOnLanding

Allowed values:

```text
toe_edge
heel_edge
flat
edge_catch
not_visible
unknown
```

Purpose:

- Describe landing edge only if it is visible.

Rule:

- Do not infer landing edge from approach edge.
- Do not infer landing edge from trick name.
- Do not infer landing edge from screen left/right or boat left/right.

Use `not_visible` when:

- The board edge at water contact is not visible.

Use `unknown` when:

- The board is visible but the edge relationship is ambiguous.

Use `null` when:

- The field is missing or cannot be normalized.

Anti-evidence conditions:

- board angle hidden by spray
- camera angle does not show toe/heel edge
- board cropped at landing
- edge inferred from approach only

Validator reject conditions:

- `toe_edge`, `heel_edge`, `flat`, and `edge_catch` require visible board
  orientation at landing.
- `edge_catch` must have evidence of edge dig, abrupt deceleration, or fall.
- If edgeOnLanding conflicts with boardContact, mark `needsReview=true`.
- Landing edge must not override `ApproachObservedFacts` or
  `EdgeLoadObservedFacts`.

### handlePosition

Allowed values:

```text
controlled
near_lead_hip
away_from_body
high
dropped
pulled_out
two_hands_visible
one_hand_visible
not_visible
unknown
```

Purpose:

- Support coaching about handle control on landing.

Rule:

- Handle position can support landing quality but should not rename the trick.

Use `not_visible` when:

- Handle is cropped, hidden by body, or outside the frame at landing.

Use `unknown` when:

- Handle is partially visible but position/control cannot be judged.

Use `null` when:

- The field is missing or cannot be normalized.

Gemini must not guess:

- Do not infer controlled handle from a clean ride-away unless the handle is
  visible.
- Do not infer dropped handle from crash unless the handle leaving the rider is
  visible.
- Do not infer handle position from trick type.

Anti-evidence conditions:

- handle out of frame
- hands obscured by body/spray
- camera blur at landing
- only rope direction visible

Validator reject conditions:

- `controlled`, `near_lead_hip`, `away_from_body`, `high`, `dropped`,
  `pulled_out`, `two_hands_visible`, and `one_hand_visible` require handle or
  hands to be visible.
- `landingOutcome=handle_loss` requires `handlePosition=dropped` or
  `pulled_out`, or explicit evidenceText describing visible handle loss.
- Handle position alone cannot produce high landing confidence.

### balanceRecovery

Allowed values:

```text
rides_away
recovers
unstable
falls
butt_check_recovery
no_recovery
not_visible
unknown
```

Purpose:

- Capture the immediate post-contact outcome.

Rule:

- Recovery after landing can inform coaching and confidence, but it should not
  override takeoff/rotation facts for trick classification.

Use `not_visible` when:

- The clip cuts or camera loses the rider before immediate recovery is visible.

Use `unknown` when:

- Some post-contact frames are visible but outcome is ambiguous.

Use `null` when:

- The field is missing or cannot be normalized.

Gemini must not guess:

- Do not infer `rides_away` from a clean-looking board contact if the ride-away
  frames are missing.
- Do not infer `falls` from splash alone.
- Do not infer `recovers` from landingOutcome without visible post-contact
  frames.

Anti-evidence conditions:

- recovery cut off
- rider leaves frame
- splash obscures body
- only water impact visible
- no post-landing frames

Validator reject conditions:

- `rides_away`, `recovers`, `unstable`, `falls`, `butt_check_recovery`, and
  `no_recovery` require immediate post-contact frames.
- `landingOutcome=clean` conflicts with `falls`, `no_recovery`, or `unstable`.
- `landingOutcome=crash` conflicts with `rides_away` unless evidenceText
  explains a crash after a brief ride-away.
- `landingOutcome=butt_check` should pair with `butt_check_recovery`,
  `unstable`, `recovers`, or visible hips/butt evidence.

### evidenceText

One short sentence summarizing visible landing evidence.

Good examples:

```text
Board contacts flat and the rider continues riding away.
Rider's hips touch the water before partial recovery.
Landing is obscured by spray, so board contact is unclear.
```

Bad examples:

```text
It was a Back Roll landing.
The trick looks hard, so landing was unstable.
The rider probably landed toeside because the approach was toeside.
```

### confidence

One aggregate confidence for the whole LandingObservedFacts object.

Allowed values:

```text
high
medium
low
```

### antiEvidence

Array of missing, contradictory, or uncertainty reasons.

Examples:

```text
landing out of frame
video ends before landing
splash obscures board contact
handle not visible
only aftermath visible
camera pan hides recovery
landing inferred from trick name
```

## Confidence Rules

### High

Allow high only when:

- `landingVisible=true`,
- board contact is visible,
- rider outcome/recovery is visible,
- evidenceText names direct visual landing evidence,
- at least two independent landing indicators agree.

Independent indicators:

- board-water contact
- rider balance/recovery
- handle position/control
- visible edge contact/catch
- ride-away or fall outcome

Reject high when:

- landingVisible is false or unknown,
- evidenceText is missing,
- boardContact is `not_visible`, `unknown`, or null,
- balanceRecovery is `not_visible`, `unknown`, or null,
- the only evidence is an outcome label such as `clean`, `crash`, or
  `butt_check`,
- camera crop, splash, or video end prevents direct landing inspection.

### Medium

Allow medium when:

- landing is visible, but one major detail is obscured,
- board contact is visible but handle is not,
- rider rides away but board contact is partly hidden by spray,
- crash/fall is visible but the cause is unclear.
- landingVisible is true and evidenceText provides at least one direct physical
  landing indicator.

### Low

Use low when:

- landing is off camera,
- video ends before landing,
- only aftermath is visible,
- landing outcome is inferred from trick name,
- splash/crop makes board contact and recovery unclear.
- landingVisible is false or unknown and the model gives a specific outcome.
- evidenceText is label-only.

## Validation Rules

Initial validator should be conservative and small.

Recommended result type:

```ts
type LandingValidationResult = {
  before: LandingObservedFacts;
  after: LandingObservedFacts;
  adjusted: boolean;
  needsReview: boolean;
  independentLandingEvidenceCount: number;
  rulesApplied: string[];
  rejectedHighConfidenceReasons: string[];
};
```

Recommended rules:

1. If `landingVisible=false`, confidence cannot be high.
2. If `landingVisible=unknown`, confidence cannot be high.
3. If `evidenceText` is missing, confidence cannot be high.
4. If evidenceText only repeats `clean`, `crash`, or `butt_check` without
   visible mechanics, mark as label-only and downgrade.
5. High confidence requires at least two independent landing indicators.
6. If `landingOutcome=clean` but `balanceRecovery` is `falls` or `unstable`,
   mark `needsReview=true`.
7. If `landingOutcome=crash` but `balanceRecovery=rides_away`, mark
   `needsReview=true`.
8. If landing is not visible but an outcome is specific, downgrade to low and
   add anti-evidence.
9. Do not let landing outcome change `primaryCandidate`, `family`,
   `approachType`, or `rotationType`.

MVP validator detail:

```text
landingVisible=false:
  - confidence must be low
  - boardContact should be not_visible or unknown
  - edgeOnLanding should be not_visible or unknown
  - handlePosition should be not_visible or unknown unless visible before cut
  - balanceRecovery should be not_visible or unknown
  - landingOutcome should be not_visible or unknown

landingVisible=unknown:
  - confidence must be medium or low
  - high is rejected
  - specific outcomes require evidenceText and antiEvidence

landingVisible=true:
  - confidence may be high only with at least two independent indicators
```

Specific outcome validation:

```text
clean:
  requires boardContact clean_contact/flat or visible stable board contact
  requires balanceRecovery rides_away/recovers
  reject if balanceRecovery falls/no_recovery/unstable without explanation

butt_check:
  requires visible hips/butt water contact or skim
  reject label-only butt_check

edge_catch:
  requires edgeOnLanding=edge_catch or boardContact=edge_contact
  requires abrupt deceleration/fall/instability evidence

handle_loss:
  requires handlePosition=dropped/pulled_out or explicit handle-loss evidence

crash:
  requires visible fall, loss of board control, or no recovery
  reject if balanceRecovery=rides_away unless evidenceText explains sequence

over_rotated / under_rotated:
  requires visible landing direction/body-board position mismatch
  reject if inferred only from trick name or rotation type
```

Label-only rejection:

Reject or downgrade when evidenceText only says:

```text
clean landing
crash landing
butt check
edge catch
landed clean
fell
깨끗한 착지
크래시
엉덩방아
```

without direct visual mechanics such as:

```text
board contacts water
rides away
hips touch water
edge digs
handle drops
falls after contact
board stays flat
splash hides contact
```

Visibility-driven downgrade:

```text
camera crop:
  high rejected; usually low unless enough board/recovery frames remain

splash obscures board contact:
  boardContact -> not_visible or unknown
  confidence high rejected

video ends before landing:
  landingVisible=false
  landingOutcome=not_visible
  confidence=low

only aftermath visible:
  landingVisible=unknown or false
  confidence=low
  antiEvidence includes only aftermath visible
```

## Anti-Evidence Rules

Ask Gemini to actively write anti-evidence when:

- the landing is out of frame,
- board contact is hidden by spray,
- handle is not visible,
- recovery is cut off,
- only crash aftermath is visible,
- landing is inferred from trick name or expectation,
- camera pan creates uncertainty.

Validator should add post-validation anti-evidence when:

- confidence is high but landing visibility is not true,
- confidence is high but evidenceText is missing,
- confidence is high but independent evidence count is below 2,
- specific outcome is given while landing is not visible.

## DB Schema Draft

Do not create this migration yet.

Future draft:

```sql
alter table public.evidence_results
  add column if not exists landing_observed_facts jsonb,
  add column if not exists landing_validation jsonb;
```

Persistence should follow the Pop/Rotation pattern:

```text
evidence.landingObservedFacts -> evidence_results.landing_observed_facts
evidence.landingValidation -> evidence_results.landing_validation
```

If DB columns are not applied yet, server fallback should omit these columns
without breaking evidence insertion, matching the current Pop/Rotation fallback
style.

## Gemini Prompt Direction

Add Landing instructions after Rotation and before Inversion or before the
existing `landingOutcome` prompt lines.

Prompt should say:

```text
landingObservedFacts는 착지와 즉시 회복에 대한 관찰 사실만 기록하세요.
트릭명, family, 접근 방향, 회전 타입에서 착지 결과를 추론하지 마세요.
landingObservedFacts는 단순 schema로 작성하세요:
landingVisible, landingOutcome, boardContact, edgeOnLanding, handlePosition,
balanceRecovery, evidenceText, confidence, antiEvidence.
confidence는 LandingObservedFacts 전체에 대해 하나만 쓰고, 각 필드별
confidence 객체를 만들지 마세요.
landingOutcome은 clean, butt_check, edge_catch, handle_loss, over_rotated,
under_rotated, crash, rides_away, not_visible, unknown 중 하나 또는 null로
쓰세요.
boardContact는 clean_contact, tail_first, nose_first, flat, edge_contact,
hard_impact, not_contacted_visible, not_visible, unknown 중 하나 또는 null로
쓰세요.
edgeOnLanding은 toe_edge, heel_edge, flat, edge_catch, not_visible, unknown
중 하나 또는 null로 쓰세요.
handlePosition은 controlled, near_lead_hip, away_from_body, high, dropped,
pulled_out, two_hands_visible, one_hand_visible, not_visible, unknown 중 하나
또는 null로 쓰세요.
balanceRecovery는 rides_away, recovers, unstable, falls,
butt_check_recovery, no_recovery, not_visible, unknown 중 하나 또는 null로
쓰세요.
confidence=high는 board contact, rider balance/recovery, handle control,
edge contact/catch, ride-away/fall outcome 중 독립적인 visible indicators가
최소 2개 이상 있을 때만 허용하세요.
landing이 out of frame, splash obscured, video ends before landing, handle not
visible, only aftermath visible이면 antiEvidence에 기록하세요.
landingOutcome은 코칭과 outcome 판단에는 사용하되 primaryCandidate,
family, approachType, rotationType을 뒤집는 근거로 사용하지 마세요.
clean/crash/butt_check 같은 라벨만 쓰고 board contact, hips/butt contact,
edge dig, handle loss, ride-away/fall 같은 관찰 근거가 없으면 confidence를
low로 쓰고 antiEvidence에 label-only landing claim을 기록하세요.
```

Also update the required extraction list:

```text
- landingObservedFacts: landing/recovery 관찰 사실. landingVisible,
  landingOutcome, boardContact, edgeOnLanding, handlePosition,
  balanceRecovery, evidenceText, confidence, antiEvidence
```

Keep existing `landingOutcome` for backward compatibility at first.

## Gemini Structured Schema Draft

Keep flat:

```ts
const geminiLandingObservedFactsSchema = {
  type: Type.OBJECT,
  properties: {
    landingVisible: geminiObservedBooleanSchema,
    landingOutcome: { type: Type.STRING, nullable: true },
    boardContact: { type: Type.STRING, nullable: true },
    edgeOnLanding: { type: Type.STRING, nullable: true },
    handlePosition: { type: Type.STRING, nullable: true },
    balanceRecovery: { type: Type.STRING, nullable: true },
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
    'landingVisible',
    'landingOutcome',
    'boardContact',
    'edgeOnLanding',
    'handlePosition',
    'balanceRecovery',
    'evidenceText',
    'confidence',
    'antiEvidence',
  ],
};
```

Do not add per-field confidence in the first implementation.

## Controlled Vocabulary Summary

Final MVP allowed values:

```text
landingVisible:
  true | false | unknown

landingOutcome:
  clean | butt_check | edge_catch | handle_loss | over_rotated |
  under_rotated | crash | rides_away | not_visible | unknown | null

boardContact:
  clean_contact | tail_first | nose_first | flat | edge_contact |
  hard_impact | not_contacted_visible | not_visible | unknown | null

edgeOnLanding:
  toe_edge | heel_edge | flat | edge_catch | not_visible | unknown | null

handlePosition:
  controlled | near_lead_hip | away_from_body | high | dropped |
  pulled_out | two_hands_visible | one_hand_visible | not_visible |
  unknown | null

balanceRecovery:
  rides_away | recovers | unstable | falls | butt_check_recovery |
  no_recovery | not_visible | unknown | null

confidence:
  high | medium | low
```

Implementation note:

- Gemini schema may keep these fields as nullable strings.
- Server normalization should map unknown strings to `unknown` or null.
- Validator should enforce the controlled vocabulary behavior.

## Implementation File Map

When implementation starts, likely files to edit:

- `dev-server/index.ts`
  - payload types
  - Gemini prompt text
  - Gemini response schema
  - `GeminiEvidencePayload`
  - parse partial support
  - normalization
  - `validateLandingObservedFacts`
  - debug capture fields
  - response fields
  - persistence insert/fallback
  - `/api/moments` evidence select list
- `src/types/index.ts`
  - `LandingObservedFacts`
  - `LandingValidationResult`
  - `GeminiEvidenceResult` optional fields
- `src/services/ai/analyzeSessionVideo.ts`
  - remote response typing
  - normalization helpers
- `src/services/moments/supabaseMoments.ts`
  - restore `landing_observed_facts`
  - restore `landing_validation`
- `supabase/phase1_schema.sql`
  - future schema documentation only
- future migration file
  - do not create until implementation begins

Possible UI file later:

- `src/features/sessions/HomeScreen.tsx`

Do not update UI in the first server/data implementation unless explicitly
requested.

## Implementation Order Recommendation

1. Add types and flat Gemini schema.
2. Add prompt instructions.
3. Normalize `landingObservedFacts`.
4. Add simple validator.
5. Include fields in debug capture and response.
6. Persist to Supabase only after migration is applied or fallback exists.
7. Restore from Supabase.
8. Run typecheck and `git diff --check`.
9. Validate on Basic Jump and at least one clip with visible unstable landing
   or crash.

## Risks Before Implementation

### Schema Complexity

Confirmed risk:

Gemini structured response schema has already failed when schema complexity
became too high.

Mitigation:

- Keep Landing flat.
- Do not add nested confidence objects.
- Use strings over strict large enums.
- Add fields incrementally.

### Landing Can Bias Trick Identity

Risk:

The model may use crash shape or ride-away outcome to rename the trick.

Mitigation:

- Prompt must state landing is outcome/coaching evidence.
- Validator should not allow landing to override family/trick identity.

### Camera / Splash Visibility

Risk:

Landing often happens with splash, crop, camera pan, or the rider exiting frame.

Mitigation:

- Make `landingVisible` explicit.
- Require anti-evidence for obscured landing.
- Keep high confidence rare.

### Outcome vs Mechanics

Risk:

`clean`, `crash`, and `butt_check` labels can become label-only evidence.

Mitigation:

- Require `evidenceText` with board contact, balance, handle, edge, or
  recovery mechanics.

### Need For Test Videos

Risk:

Validation requires clips with visible clean landings, butt checks, edge
catches, and crashes.

Mitigation:

- Start with Basic Jump clips.
- Add one unstable/crash sample before tuning high/medium/low thresholds.

## MVP Decision

Recommendation:

Implement `LandingObservedFacts` after this design using the flat MVP schema.

Do not implement `GrabObservedFacts` at the same time.

Do not redesign UI.

Do not change trick classification behavior based on landing in the first
implementation.
