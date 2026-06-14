# AI Analysis Pipeline Design

## Purpose

The current evidence extraction path relies too much on a single Gemini pass.
That single pass tries to perform approach detection, event window detection,
inversion detection, trick family classification, and specific trick naming at
the same time.

This creates hallucinations, cross-family jumps, and overconfident labels.

Target direction:

```text
Video
-> Multi-stage AI Pipeline
-> Stable classification
-> Coaching
```

This is architecture design only. It is not an implementation plan for the
current commit.

## Current Single-Pass Design

Current app-facing evidence flow:

```text
Video
-> Gemini evidence extraction
-> primaryCandidate / family / approachType / rotationType
-> app-facing evidence result
```

Problems:

- One model pass performs too many jobs.
- Approach can be inferred from trick hypothesis instead of setup evidence.
- Family can jump from Basic Air to Invert too early.
- Specific trick names can appear before parent-family evidence is stable.
- Confidence can become high even when visible evidence is weak.
- Post-processing can downgrade some failures, but it cannot fully recover
  missing intermediate reasoning.

The clearest failure mode:

```text
Toeside Basic Jump
-> hallucinated Heelside / Tantrum / Back Roll / Invert
```

The taxonomy layer helps reduce symptoms, but the deeper fix is to separate
the reasoning stages.

## Proposed Multi-Stage Pipeline

```text
Video
-> Stage 1: Observed Facts Extraction
-> Stage 2: Trick Family Classification
-> Stage 3: Specific Trick Classification
-> Stage 4: Judge AI
-> Stage 5: Coaching
```

## Stage 1: Observed Facts Extraction

Goal:

Extract visible facts only. No trick naming is allowed.

Inputs:

- Original video or sampled frames.
- Session metadata.
- Optional taxonomy reference, but only for naming the fact fields.

Outputs:

```ts
type ObservedFacts = {
  approachDirection: {
    value: 'heelside' | 'toeside' | 'switch' | 'unknown';
    confidence: 'high' | 'medium' | 'low';
    visibleEvidence: string[];
    uncertaintyReasons: string[];
  };
  wakeCrossingDirection: {
    value: 'left_to_right' | 'right_to_left' | 'toward_wake' | 'away_from_wake' | 'unknown';
    confidence: 'high' | 'medium' | 'low';
    visibleEvidence: string[];
  };
  popDetected: {
    value: boolean;
    confidence: 'high' | 'medium' | 'low';
    visibleEvidence: string[];
  };
  rotationDetected: {
    value: boolean;
    axis: 'yaw' | 'roll' | 'pitch' | 'unknown' | 'none';
    confidence: 'high' | 'medium' | 'low';
    visibleEvidence: string[];
  };
  inversionDetected: {
    value: boolean;
    confidence: 'high' | 'medium' | 'low';
    visibleEvidence: string[];
  };
  grabDetected: {
    value: boolean;
    confidence: 'high' | 'medium' | 'low';
    visibleEvidence: string[];
  };
  raleyExtensionDetected: {
    value: boolean;
    confidence: 'high' | 'medium' | 'low';
    visibleEvidence: string[];
  };
  landingOutcome: {
    value: 'clean' | 'unstable' | 'crash' | 'unknown';
    confidence: 'high' | 'medium' | 'low';
    visibleEvidence: string[];
  };
  eventWindows: Array<{
    phase: 'setup' | 'edge_load' | 'takeoff' | 'pop' | 'airborne' | 'peak_air' | 'descent' | 'landing' | 'crash_recovery';
    startSeconds: number;
    endSeconds: number;
    confidence: 'high' | 'medium' | 'low';
    evidence: string;
  }>;
};
```

Rules:

- Do not output `Back Roll`, `Tantrum`, `Basic Jump`, or any trick name.
- Do not infer approach from final trick hypothesis.
- Do not infer inversion from airtime alone.
- Do not infer roll axis from crash posture.
- If the camera angle makes edge direction ambiguous, use `unknown` or low
  confidence.

## Stage 2: Trick Family Classification

Goal:

Classify only the parent trick family using Stage 1 facts.

Candidate families:

- Basic Air
- Surface
- Grab
- Spin
- Invert
- Raley
- Unknown

Inputs:

- Stage 1 ObservedFacts.
- `docs/WAKEBOARD_TRICK_TAXONOMY_REFERENCE.md`.

Output:

```ts
type FamilyClassification = {
  family: 'basic_air' | 'surface' | 'grab' | 'spin' | 'invert' | 'raley' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  entryGateEvidence: string[];
  missingGateEvidence: string[];
  rejectedFamilies: Array<{
    family: string;
    reason: string;
  }>;
};
```

Rules:

- If no visible inversion exists, family cannot be `invert` high.
- If no visible roll axis exists, Back Roll-specific classification remains
  blocked.
- If no grab is visible, family cannot be `grab` high.
- If no yaw rotation is visible, family cannot be `spin` high.
- If no raley extension is visible, family cannot be `raley` high.
- If the clip is a wake jump with no advanced-family evidence, use
  `basic_air`.

## Stage 3: Specific Trick Classification

Goal:

Name a specific trick only inside the selected family.

Inputs:

- Stage 1 ObservedFacts.
- Stage 2 FamilyClassification.
- Taxonomy reference.

Output:

```ts
type SpecificTrickClassification = {
  trickName: string;
  family: FamilyClassification['family'];
  confidence: 'high' | 'medium' | 'low';
  requiredFamilyGatePassed: boolean;
  evidence: string[];
  alternatives: Array<{
    trickName: string;
    confidence: 'high' | 'medium' | 'low';
    reason: string;
  }>;
};
```

Allowed examples:

```text
Family: Invert
-> Back Roll
-> Tantrum
-> Front Roll
```

```text
Family: Basic Air
-> Toeside Wake Jump
-> Heelside Wake Jump
-> Straight Air
```

Rules:

- If Stage 2 family is `basic_air`, do not output Tantrum or Back Roll.
- If Stage 2 family is not `invert`, do not output invert-specific tricks.
- If Stage 2 family is `invert` but missing gate evidence, output `unknown
  invert` or low confidence.
- Specific trick names must cite Stage 1 facts, not new invented evidence.

## Stage 4: Judge AI

Goal:

Challenge the classification before it reaches the app or coaching stage.

Inputs:

- Stage 1 ObservedFacts.
- Stage 2 FamilyClassification.
- Stage 3 SpecificTrickClassification.
- Wakeboard taxonomy reference.

Responsibilities:

- Challenge contradictions.
- Detect family jumps.
- Downgrade hallucinated classifications.
- Require separate evidence for approach and rotation.
- Produce final confidence.
- Decide whether user confirmation is required.

Output:

```ts
type JudgedEvidence = {
  acceptedFamily: string;
  acceptedTrickName: string;
  confidence: 'high' | 'medium' | 'low';
  userConfirmationRequired: boolean;
  warnings: string[];
  rejectedClaims: Array<{
    claim: string;
    reason: string;
  }>;
};
```

Judge examples:

```text
Stage 1: no inversion, no roll axis, toeside approach
Stage 3: Tantrum
Judge: reject Tantrum, accept Basic Air / Toeside Wake Jump, low/medium confidence
```

```text
Stage 1: visible inversion, roll axis, heelside setup
Stage 3: Back Roll
Judge: accept Back Roll if evidence is independent and consistent
```

## Stage 5: Coaching

Goal:

Provide coaching only after classification is stable enough.

Inputs:

- JudgedEvidence.
- Stage 1 visible facts.
- User-confirmed trick intent if available.

Rules:

- Do not coach from raw model guesses.
- If classification is unstable, coach visible mechanics and ask for user
  confirmation.
- Coaching should explain uncertainty instead of pretending trick identity is
  solved.

## Comparison: Multi-Stage Vs Current Single-Pass

| Dimension | Current single-pass Gemini | Multi-stage pipeline |
| --- | --- | --- |
| Approach detection | Mixed with trick naming | Isolated in Stage 1 |
| Event window detection | Model decides implicitly | Explicit Stage 1 output |
| Family classification | Happens alongside trick naming | Stage 2 only, facts-only |
| Specific trick naming | Can happen too early | Stage 3 only after family gate |
| Contradiction handling | Post-processing only | Dedicated Judge AI |
| Debuggability | Hard to locate failure | Failure localized by stage |
| Hallucination risk | Higher | Lower |
| Latency | Lower | Higher |
| Cost | Lower | Higher |
| Implementation complexity | Lower | Higher |

## Complexity Estimate

### Minimal version

- Stage 1 and Stage 2 are separate prompts.
- Stage 3 and Stage 4 can initially be code validation plus one judge prompt.
- Stage 5 reuses current coaching path.

Complexity: medium.

Expected work:

- New schemas.
- New endpoint pipeline orchestration.
- Debug artifact per stage.
- More UI states later, but not required initially.

### Full version

- Separate model call per stage.
- Frame sampling and event-window extraction.
- Persistent job state.
- Async queue.
- Stored intermediate artifacts.

Complexity: high.

## Expected Accuracy Improvement

Expected gains:

- Large reduction in Basic Air -> Invert false positives.
- Better isolation of approach errors.
- Better confidence calibration.
- Better debugging because each failed stage has inspectable output.

Expected remaining issues:

- Approach detection may still fail if camera angle is poor.
- Stage 1 fact extraction remains the hardest visual problem.
- If Stage 1 facts are wrong, later stages may still inherit the error.

Estimated improvement:

```text
Family-level accuracy: meaningful improvement
Specific trick accuracy: moderate improvement
Coaching trust: meaningful improvement
```

## Cost Estimate

Relative to current one-pass Gemini evidence extraction:

```text
Stage 1 only: about 1x current evidence cost
Stage 1 + Stage 2 + Stage 3: about 2x to 3x
Stage 1 + Stage 2 + Stage 3 + Judge: about 3x to 4x
Full pipeline plus coaching: about 4x+ depending on model choices
```

Cost control options:

- Run full pipeline only when video analysis is requested.
- Use cheaper model for Stage 1 facts if quality is acceptable.
- Use Judge AI only when confidence is high but gates are suspicious.
- Cache intermediate stage outputs per local Session.
- Keep daily request limits during development.

## Model Recommendation

### Gemini-only pipeline

Pros:

- Simpler provider setup.
- Direct video input remains useful.
- Lower integration complexity.

Cons:

- Same model may repeat the same hallucination across stages.
- Judge step may be less independent if it uses the same model.

Best use:

- Stage 1 visual facts extraction.
- Event windows from video.

### GPT as Judge AI

Pros:

- Independent reasoning pass.
- Strong structured critique and contradiction detection.
- Can use taxonomy reference as text context effectively.

Cons:

- Needs either sampled frames, extracted facts, or both.
- Higher cost if images/frames are included.
- More orchestration complexity.

Best use:

- Stage 4 Judge AI over structured facts and taxonomy.
- Coaching after user confirmation or stable classification.

### Mixed-model architecture

Recommended direction:

```text
Gemini = video facts and event windows
Code taxonomy gate = deterministic family constraints
GPT = Judge AI and coaching/reporting
```

Why:

- Gemini is useful for direct video observation.
- Code gates are reliable for parent-family impossibilities.
- GPT is strong at contradiction review and explanation.

Initial implementation can be:

```text
Gemini Stage 1
Code Stage 2 taxonomy gate
Code Stage 3 safe candidate selection
GPT Stage 4 Judge only when needed
Gemini or GPT Stage 5 Coaching after stable classification
```

## Recommended Implementation Order

1. Define Stage 1 ObservedFacts schema.
2. Add debug capture for Stage 1 outputs.
3. Build Stage 2 family classifier from Stage 1 facts and taxonomy gates.
4. Keep Stage 3 specific trick classification conservative.
5. Add Judge AI only after Stage 1/2 outputs are stable enough to evaluate.
6. Move coaching behind JudgedEvidence.

## Non-Goals

- Do not build database storage as part of this pipeline.
- Do not build cloud video storage as part of this pipeline.
- Do not redesign UI for this design step.
- Do not add a full trick database yet.
- Do not optimize for one Toeside Basic Jump clip only.

## Decision

The current single-pass Gemini design has reached the limit of prompt tuning.

The next architecture should separate:

```text
facts
family
specific trick
judge
coaching
```

This should prevent the model from jumping directly from wake jump/basic air to
advanced invert-specific tricks.
