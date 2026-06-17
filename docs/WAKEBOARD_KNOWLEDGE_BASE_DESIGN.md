# Wakeboard Knowledge Base Design

This document defines the first design for the Action Sports Journal Wakeboard
Knowledge Base.

The product goal is not a generic AI Video Analyzer. The product goal is a
Wakeboard Knowledge System where AI-observed facts are interpreted through
wakeboard domain rules before coaching, progression, or confidence decisions
are made.

This is a design document only. It does not change code, database schema,
prompts, UI, or deployment architecture.

## Current ObservedFacts Context

Confirmed Fact:

The current evidence pipeline already produces these observed-facts layers:

```text
ApproachObservedFacts
EdgeLoadObservedFacts
PopObservedFacts
RotationObservedFacts
GrabObservedFacts
LandingObservedFacts
```

Current operating flow:

```text
Video
↓
Moment
↓
AnalysisJob
↓
Gemini Pro
↓
ObservedFacts
↓
Validators
↓
EvidenceResult
↓
Knowledge Rules
↓
Coaching / Progression
```

Important principle:

```text
ObservedFacts describe what is visible.
Knowledge Rules interpret what those facts may mean.
Coaching turns interpreted knowledge into rider-facing guidance.
```

## Purpose

The Knowledge Base should encode wakeboard domain knowledge in a way that is:

- inspectable,
- conservative,
- rule-first,
- grounded in observed facts,
- useful for coaching,
- useful for progression planning,
- not dependent on the model sounding confident.

The Knowledge Base should help answer questions like:

- What does weak edge load imply about pop?
- What does late handle pull imply about rotation stability?
- When does a stable landing increase trick completion confidence?
- When does a grab attempt show air awareness even if actual contact is not
  confirmed?

The Knowledge Base should not replace ObservedFacts or Validators. It should
sit after them.

## Relationship To ObservedFacts

ObservedFacts are raw or normalized visual observations:

- stance,
- edge load,
- pop timing,
- rotation axis,
- hand-to-board contact,
- landing outcome.

Knowledge Rules interpret combinations of those facts:

- Edge load affects pop quality.
- Handle position affects rotation and landing control.
- Rotation facts constrain trick-family confidence.
- Grab attempts can indicate air awareness.
- Landing control affects completion confidence.

Knowledge Rules must not invent facts that the evidence layer did not observe.

Example:

```text
Observed:
edgeLoadObservedFacts.edgeLoadVisible = false
popObservedFacts.popType = weak_or_unknown

Allowed Knowledge Interpretation:
EdgeLoad 부족이 Pop 약화와 관련 있을 수 있다.

Forbidden:
The rider definitely failed because of bad edge load.
```

## Knowledge Rule Definition

A Knowledge Rule is a small domain rule that reads validated observed facts and
produces an interpretation, warning, coaching implication, or progression
signal.

MVP v1 rule shape:

```ts
type WakeboardKnowledgeRule = {
  id: string;
  title: string;
  category:
    | 'approach'
    | 'edge_load'
    | 'pop'
    | 'rotation'
    | 'grab'
    | 'landing'
    | 'completion'
    | 'progression';
  inputFacts: string[];
  condition: string;
  output:
    | 'observation'
    | 'warning'
    | 'coaching_cue'
    | 'progression_signal'
    | 'confidence_adjustment';
  severity: 'info' | 'low' | 'medium' | 'high';
  confidencePolicy: 'preserve' | 'downgrade_if_uncertain' | 'requires_review';
  messageTemplate: string;
  antiEvidence?: string[];
};
```

This is a documentation shape, not a final implementation requirement. The MVP
should start with plain TypeScript objects/functions, not a DSL.

## KnowledgeInsight Type Draft

MVP v1 should return `KnowledgeInsight[]`.

```ts
type KnowledgeInsight = {
  id: string;
  ruleId: string;
  category:
    | 'approach'
    | 'edge_load'
    | 'pop'
    | 'rotation'
    | 'grab'
    | 'landing'
    | 'completion'
    | 'progression'
    | 'review';
  message: string;
  sourceFacts: string[];
  confidence: 'low' | 'medium' | 'high';
  severity: 'info' | 'low' | 'medium' | 'high';
  requiresReview: boolean;
  coachingSafe: boolean;
};
```

Field rules:

- `id`: unique insight id for this run, usually `${ruleId}:${index}`.
- `ruleId`: stable rule id, including version suffix.
- `category`: the skill area or review category affected by the rule.
- `message`: short internal insight message, not necessarily final UI copy.
- `sourceFacts`: exact observed-facts paths used by the rule.
- `confidence`: confidence in the rule interpretation, not confidence in the
  original Gemini output.
- `severity`: importance of the insight.
- `requiresReview`: true when the rule is useful but evidence quality is weak.
- `coachingSafe`: true only when the insight can be passed to the coaching layer
  without overclaiming.

## Rule Expression

MVP rules should use explicit conditions instead of a general abstract rule
language.

Recommended MVP expression:

```ts
{
  id: 'edge-load-weak-pop-risk',
  inputFacts: [
    'edgeLoadObservedFacts',
    'popObservedFacts'
  ],
  when: ({ edgeLoadObservedFacts, popObservedFacts }) => {
    return edgeLoadObservedFacts.edgeLoadVisible !== true
      && popObservedFacts.intensity !== 'strong';
  },
  then: {
    output: 'coaching_cue',
    message: 'Edge load may be limiting pop height.',
    confidence: 'medium'
  }
}
```

Do not build a complex DSL in the first version. Plain functions are easier to
test, review, and calibrate.

## MVP v1 Rule Set

MVP v1 is fixed to these six rules:

```text
weak_edge_load_limits_pop.v1
strong_pop_supports_rotation.v1
late_handle_pull_destabilizes_rotation.v1
clean_landing_supports_completion.v1
grab_attempt_indicates_air_awareness.v1
low_confidence_facts_require_review.v1
```

Do not add more rules in v1 unless one of these rules cannot be implemented
without splitting it. The goal is a small, auditable rule set.

### weak_edge_load_limits_pop.v1

Rule intent:

Weak or unclear edge load can explain weak pop, especially when the rider does
not appear to maintain pressure through the wake.

Inputs:

- `edgeLoadObservedFacts`
- `popObservedFacts`
- `temporalWindows.finalApproachWindow`

Trigger condition:

```text
edgeLoadObservedFacts indicates edge load is absent, unclear, or low confidence
and
popObservedFacts indicates weak/early/late/unknown pop or low pop confidence
```

Output KnowledgeInsight:

```text
category: edge_load
message: Weak or unclear edge load may be limiting pop.
sourceFacts:
  - edgeLoadObservedFacts
  - popObservedFacts
confidence: low | medium
severity: medium
requiresReview: true if final approach or takeoff window is unreliable
coachingSafe: true only when source facts include visible edge/pop evidence
```

Confidence calculation:

- Medium when both edge load and pop evidence are visible.
- Low when either edge load or takeoff is obscured.
- No strong conclusion when final approach window is unreliable.

Overreach guard:

- Do not say edge load definitely caused weak pop.
- Do not use this rule when pop is strong or when edge load evidence is missing
  only because the final approach window is not visible.
- Do not infer toeside/heelside approach from this rule.

Coaching wording example:

```text
Your pop may be limited by edge pressure into the wake. Review whether you held
a progressive edge all the way through takeoff.
```

### strong_pop_supports_rotation.v1

Rule intent:

Strong, well-timed pop can support stable rotation because the rider has more
airtime and cleaner takeoff mechanics.

Input ObservedFacts:

- `popObservedFacts`
- `rotationObservedFacts`
- `landingObservedFacts`

Trigger condition:

```text
popObservedFacts.popType is progressive_pop or trip_pop
and popObservedFacts.timing is on_wake
and popObservedFacts.intensity is moderate or strong
and rotationObservedFacts does not show major contradiction
```

Output KnowledgeInsight:

```text
category: pop
message: The takeoff quality may support controlled rotation or air position.
sourceFacts:
  - popObservedFacts
  - rotationObservedFacts
confidence: low | medium
severity: info
requiresReview: true if rotation facts are low confidence
coachingSafe: true when pop evidence has visible wake/release support
```

Confidence calculation:

- Medium when pop evidence cites wake release, rider extension, or upward
  trajectory and has medium/high confidence.
- Low when pop is visible but rotation is unknown or landing is obscured.
- Never high in v1. This rule is supportive, not decisive.

Overreach guard:

- Do not infer a rotation trick from strong pop.
- Do not say strong pop proves good technique.
- Do not apply when pop evidence is label-only.

Coaching wording example:

```text
The takeoff gives you a useful platform. Keep that wake-timed pop while you
work on controlling the rotation shape.
```

### late_handle_pull_destabilizes_rotation.v1

Rule intent:

Late handle movement can destabilize spin or off-axis rotation.

Input ObservedFacts:

- `rotationObservedFacts`
- `landingObservedFacts`
- `approachObservedFacts`
- future handle-specific facts if added later

Current limitation:

The current MVP does not yet have a dedicated `HandleObservedFacts` layer.
Until then, this rule should use existing handle fields conservatively:

- `approachObservedFacts.handlePosition`
- `landingObservedFacts.handlePosition`
- `rotationObservedFacts.handlePassObserved`
- text evidence only when explicit.

Trigger condition:

```text
rotationObservedFacts indicates unstable/off-axis/late rotation
or landingObservedFacts indicates poor recovery
and explicit evidence mentions late handle movement, handle away from body, or
handle pass timing
```

Output KnowledgeInsight:

```text
category: rotation
message: Late or loose handle movement may be affecting rotation control.
sourceFacts:
  - rotationObservedFacts
  - landingObservedFacts
  - approachObservedFacts.handlePosition
confidence: low
severity: medium
requiresReview: true
coachingSafe: false by default in v1 unless handle evidence is explicit
```

Confidence calculation:

- Low by default until dedicated handle observations exist.
- Requires review if based only on evidence text.
- Medium is allowed only if evidence explicitly references handle timing and
  rotation/landing instability together.

Overreach guard:

- Do not use this rule when handle evidence is absent.
- Do not invent "late handle pull" from a failed landing alone.
- Do not present this as the primary cause unless future HandleObservedFacts
  supports it.

Coaching wording example:

```text
There may be a handle-timing issue. If the handle is drifting away from your
body, bring it back toward your lead hip earlier to stabilize the rotation.
```

### clean_landing_supports_completion.v1

Rule intent:

A visible ride-away landing increases confidence that the attempted movement was
completed, but it must not change the trick identity.

Input ObservedFacts:

- `landingObservedFacts`
- `rotationObservedFacts`
- `grabObservedFacts`

Trigger condition:

```text
landingVisible = true
landingOutcome = rides_away or clean
balanceRecovery = controlled or stable
```

Output KnowledgeInsight:

```text
category: completion
message: Visible controlled landing supports completion confidence.
sourceFacts:
  - landingObservedFacts
confidence: medium
severity: info
requiresReview: false when landing evidence is clear
coachingSafe: true
```

Forbidden:

```text
Do not infer Back Roll, Tantrum, Spin, or Grab from a stable landing.
```

Confidence calculation:

- Medium when landing is visible and evidence text supports ride-away.
- Low when landing is partly obscured by splash/camera crop.
- Never high in v1 because completion confidence still depends on trick-family
  facts.

Overreach guard:

- Do not increase trick identity confidence.
- Do not convert a failed trick classification into a completed trick.
- Do not use landing outcome to override RotationObservedFacts or
  GrabObservedFacts.

Coaching wording example:

```text
The ride-away looks controlled, so the completion side of this attempt is
credible. Keep that landing control while refining the earlier mechanics.
```

### grab_attempt_indicates_air_awareness.v1

Rule intent:

An attempted reach can indicate developing air awareness even when a real grab
is not confirmed.

Input ObservedFacts:

- `grabObservedFacts`
- `popObservedFacts`
- `landingObservedFacts`

Trigger condition:

```text
grabDetected is false or unknown
and
grabDuration = attempted_reach
or evidenceText describes a visible reach toward the board without contact
```

Output KnowledgeInsight:

```text
category: grab
message: A visible grab attempt may indicate developing air awareness.
sourceFacts:
  - grabObservedFacts
  - popObservedFacts
confidence: low | medium
severity: info
requiresReview: true if contact is not visible
coachingSafe: true only as an attempt, not as a completed grab
```

Important distinction:

```text
Attempted reach is not a completed grab.
It can be useful for progression without becoming a trick label.
```

Confidence calculation:

- Low/medium depending on visibility.
- Do not report a positive grab unless `contactVisible=true` and contact point
  is visible.
- Medium only when the reach is visible and not confused with knee tuck, handle
  movement, or board poke.

Overreach guard:

- Do not call it Indy, Melon, Stalefish, or any grab name.
- Do not say "you grabbed the board" unless contact is visible.
- Do not use overlap or occlusion as positive grab evidence.

Coaching wording example:

```text
There may be an early grab attempt here. Treat it as air-awareness progress,
not as a completed grab yet.
```

### low_confidence_facts_require_review.v1

Rule intent:

Low-confidence or validator-adjusted facts should be surfaced as review context
instead of being hidden behind polished coaching.

Input ObservedFacts:

- all observed-facts validation results
- `approachDecisionV2`
- taxonomy warnings or gate failures when present

Trigger condition:

```text
any critical observed-facts layer has low confidence
or any validator has needsReview=true
or any rule depends on facts that were downgraded by validation
```

Critical layers for v1:

```text
Approach
EdgeLoad
Pop
Rotation
Grab
Landing
```

Output KnowledgeInsight:

```text
category: review
message: Some evidence is uncertain and should be reviewed before giving firm coaching.
sourceFacts:
  - validation result paths that caused the review
confidence: high
severity: medium
requiresReview: true
coachingSafe: true only if phrased as uncertainty
```

Confidence calculation:

- High when the trigger is a deterministic validator flag.
- Medium when only raw confidence fields are low without validator flags.

Overreach guard:

- Do not turn review state into a negative rider judgment.
- Do not block all coaching; instead, require uncertainty-preserving coaching.
- Do not use this as a substitute for fixing bad ObservedFacts.

Coaching wording example:

```text
Some parts of the analysis are uncertain, so treat the next cue as a review
point rather than a firm diagnosis.
```

## Rule Engine MVP Structure

MVP flow:

```text
EvidenceResult
↓
normalizeKnowledgeInput
↓
applyKnowledgeRules
↓
KnowledgeInsights[]
↓
debug / evidence response
↓
Coaching Layer (later)
↓
Progression Layer (later)
```

MVP v1 output:

```ts
type KnowledgeInsight = {
  id: string;
  ruleId: string;
  category: string;
  message: string;
  sourceFacts: string[];
  confidence: 'low' | 'medium' | 'high';
  severity: 'info' | 'low' | 'medium' | 'high';
  requiresReview: boolean;
  coachingSafe: boolean;
};
```

MVP implementation guidance:

- Keep rules as a small array of plain TypeScript objects/functions.
- Run rules after evidence validators.
- Include only rules that can cite source facts.
- Return multiple small insights instead of one broad coaching paragraph.
- Keep rule output separate from raw evidence.
- Expose v1 through debug/evidence response only.
- Do not persist v1 rule output.
- Do not add UI in v1.
- Do not connect to final rider-facing coaching until rule outputs are reviewed.

## MVP v1 Scope

In scope:

- Define `KnowledgeInsight`.
- Add deterministic rule functions for the six fixed v1 rules.
- Run rules after existing observed-facts validators.
- Return `knowledgeInsights` in backend debug/evidence response.
- Include `sourceFacts`, `requiresReview`, and `coachingSafe` on every insight.
- Add fixture-style tests or scripts against known evidence JSON if useful.

Out of scope for v1:

- Database migration.
- New Supabase table.
- `evidence_results.knowledge_insights` persistence.
- UI rendering.
- Push notifications.
- Auth.
- RAG.
- Vector search.
- A generic rule DSL.
- Final coaching prompt integration.
- Progression timeline UI.

Exit criteria for v1:

- The six rules run deterministically from an `EvidenceResult`.
- Each insight cites source facts.
- Low-confidence facts produce review-oriented insights.
- No rule changes trick identity.
- No rule invents a fact not present in ObservedFacts.

## Coaching Layer Connection

The Coaching Layer should consume `KnowledgeInsights`, not raw model guesses.

Recommended structure:

```text
ObservedFacts
↓
Validators
↓
KnowledgeInsights
↓
CoachingPromptContext
↓
Coach response
```

Coaching prompt context should include:

- stable facts,
- uncertain facts,
- active knowledge rules,
- rejected high-confidence claims,
- rider-facing cue candidates.

Example:

```text
KnowledgeInsight:
Edge load may be limiting pop height.

Coach output:
Try holding progressive edge pressure a little longer into the wake before
standing tall.
```

Important:

The coach may explain and phrase, but it should not override rule confidence or
invent the observed mechanics.

MVP sequencing:

```text
v1: expose KnowledgeInsights in debug/evidence response only
v2: pass reviewed KnowledgeInsights into coaching context
v3: tune coaching language based on real rider-facing output
```

## Progression Layer Connection

The Progression Layer should use KnowledgeInsights over time.

Possible progression signals:

- consistent approach direction,
- stable edge load,
- improved pop timing,
- reduced unwanted rotation,
- cleaner ride-away landings,
- grab attempts progressing toward confirmed contact.

MVP progression output:

```ts
type ProgressionSignal = {
  id: string;
  sourceRuleId: string;
  skillArea: 'approach' | 'edge_load' | 'pop' | 'rotation' | 'grab' | 'landing';
  direction: 'improving' | 'regressing' | 'stable' | 'unknown';
  evidenceResultIds: string[];
  summary: string;
};
```

Progression should not require a dashboard first. It can initially appear as
small trend statements in the Moment detail or coaching context.

## Storage Draft

MVP v1 storage decision:

```text
Do not store KnowledgeInsights in DB in v1.
```

Generate KnowledgeInsights at read time or response time only. This keeps the
rule layer easy to change while the first six rules are being calibrated.

Future storage options:

### Option A: Derived At Read Time

Store no new table initially. Generate KnowledgeInsights from the latest
EvidenceResult whenever the app/backend needs them.

Pros:

- No migration.
- Rules can change without backfilling data.
- Best for MVP iteration.

Cons:

- Historical rule output changes when rules change.
- Harder to audit exactly what the user saw earlier.

Recommendation:

Use Option A for v1.

### Option B: Store Rule Outputs On EvidenceResult

Add a JSONB column later:

```text
evidence_results.knowledge_insights jsonb
```

Pros:

- Auditable.
- Easier to show exactly what was generated at analysis time.

Cons:

- Requires migration.
- Rule changes may require reprocessing or versioning.

### Option C: Dedicated Table

Future table:

```text
knowledge_insights
```

Possible columns:

```text
id
moment_id
analysis_job_id
evidence_result_id
rule_id
rule_version
category
confidence
severity
message
source_facts
requires_review
created_at
```

Use this only after the rule set stabilizes.

## Rule Versioning

MVP rule ids should be stable:

```text
weak_edge_load_limits_pop.v1
strong_pop_supports_rotation.v1
late_handle_pull_destabilizes_rotation.v1
clean_landing_supports_completion.v1
grab_attempt_indicates_air_awareness.v1
low_confidence_facts_require_review.v1
```

Do not overbuild versioning yet. Include version in `ruleId` if outputs are
stored.

## Implementation Order

Recommended MVP order:

1. Define `KnowledgeInsight` type.
2. Add a small rule file with the six fixed v1 rules.
3. Implement `applyWakeboardKnowledgeRules(evidenceResult)`.
4. Add unit-style fixtures using known no-grab Basic Air and current
   `ts_regular_1` outputs.
5. Return insights from backend debug or evidence response only.
6. Review actual insight output before coaching integration.
7. Feed insights into coaching prompt context only after review.
8. Add persistence only after rule output is useful.
9. Add UI display only after coaching/progression value is proven.

Do not begin with a database table or a UI.

## Risks

### Rule Overreach

Risk:

Rules may start making claims stronger than the observed facts support.

Mitigation:

- Always include source facts.
- Prefer "may indicate" language.
- Use `requiresReview=true` when source facts are weak.
- Keep `coachingSafe=false` when the rule output is useful internally but not
  safe for rider-facing coaching yet.

### Confidence Inflation

Risk:

Rules may make medium-confidence facts feel more certain by combining several
weak signals.

Mitigation:

- Rule confidence cannot exceed the weakest critical source fact unless the rule
  is a deterministic review rule.
- Supportive rules such as `strong_pop_supports_rotation.v1` should not return
  high confidence in v1.
- Completion support from landing should not increase trick identity
  confidence.

### False Coaching Certainty

Risk:

The coach may turn a low-confidence KnowledgeInsight into a confident
instruction.

Mitigation:

- Pass confidence and uncertainty explicitly to the coaching prompt.
- Require the coach to preserve uncertainty.

### Hidden AI Reintroduction

Risk:

The Knowledge Base could become another AI prompt instead of a rule layer.

Mitigation:

- Start with deterministic rules.
- Let AI phrase coaching after rules run, not decide the rule itself.
- Do not ask Gemini to choose which Knowledge Rules apply in v1.
- Do not embed the Knowledge Base as a broad natural-language prompt and treat
  the response as the rule engine.

### Low Quality ObservedFacts Propagation

Risk:

Bad ObservedFacts can create bad KnowledgeInsights.

Mitigation:

- Run Knowledge Rules after validators only.
- Include validator warnings and `needsReview` in rule inputs.
- `low_confidence_facts_require_review.v1` should surface uncertainty before
  coaching.
- If a fact was downgraded by validation, rules depending on it should either
  return low confidence or `requiresReview=true`.

### Schema And Storage Overbuild

Risk:

Adding a new table too early will slow iteration.

Mitigation:

- Derive insights at read time first.
- Persist only once rules prove useful.

## Recommendation

Recommendation:

Start with a deterministic rule engine that reads validated ObservedFacts and
returns `KnowledgeInsights`.

Do not build RAG or a complex ontology yet. The first Knowledge Base should be a
small, explicit set of six wakeboard rules that:

- cites observed facts,
- preserves uncertainty,
- feeds coaching,
- later supports progression.

This keeps the system aligned with the current product direction:

```text
Observed Facts -> Domain Rules -> Coaching / Progression
```
