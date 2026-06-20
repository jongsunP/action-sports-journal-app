# AI Coach Layer Plan

## Purpose

Action Sports Journal is moving from "AI can analyze a clip" toward "AI can
help a rider decide what to work on next."

The current product should not call itself a finished AI Coach yet. It can
extract wakeboard evidence, validate that evidence, and summarize the result in
rider-facing language. The Coach layer should come after that boundary, once
the system has enough reliable context to suggest training focus without
overstating what the video proves.

## Problem

The current analysis stack is strong enough to identify and explain many riding
moments, but analysis and coaching are different product jobs.

Analysis answers:

```text
What does this clip appear to show?
Which evidence is strong?
Which parts need review?
```

Coaching should answer:

```text
What should the rider focus on next?
Why does that focus matter?
How should the rider practice it?
```

If the product jumps from a single EvidenceResult directly into advice, it can
turn uncertain observations into overconfident coaching. That would damage user
trust, especially in wakeboarding where a small visual mistake can change the
meaning of the trick.

## Decision

Keep the current default upload path as an Evidence Extraction path.

```text
Moment upload
-> Gemini Pro evidence extraction
-> ObservedFacts
-> validators / taxonomy / knowledge rules
-> Rider-facing Analysis Summary
```

Design the AI Coach as a separate layer that consumes stable analysis outputs,
not raw Gemini output.

The Coach should not decide what happened in the video. The Coach should turn
validated evidence, rider-facing summary, and rider history into careful
practice guidance.

## Current Evidence Stage

The current normal upload flow uses one Gemini Pro call per Moment.

That call is responsible for:

- extracting visible wakeboard evidence from the video,
- producing ObservedFacts such as approach, edge load, pop, rotation, landing,
  and grab facts,
- supporting trick-family and candidate interpretation,
- feeding validators, taxonomy gates, candidate trace, knowledge rules, and the
  Rider-facing Analysis Summary.

That call is not responsible for:

- building a personalized training plan,
- comparing this rider against long-term progression,
- choosing the next drill sequence,
- adapting coaching to the rider's history,
- producing paid-grade expert coaching.

Current implementation result:

- Evidence post-processing quality has been improved.
- Rider-facing summary now sits above detailed Gemini/evidence information.
- Internal storage names such as Supabase are no longer exposed in restored
  user-facing fallback copy.
- Latest checkpoint before this plan: `0c216eb`.

## Evidence Stage vs Coach Stage

### Evidence Stage

Primary product question:

```text
What happened in this clip, and how sure are we?
```

Inputs:

- uploaded video,
- Gemini evidence output,
- ObservedFacts,
- validators,
- taxonomy gates,
- candidate trace,
- knowledge rules.

Outputs:

- safe predicted trick / family where possible,
- review candidates when not certain,
- rider-facing analysis summary,
- confirmed signals,
- review notes,
- basic next-practice hints grounded in the current clip.

### Coach Stage

Primary product question:

```text
Given this analysis and this rider's context, what should the rider do next?
```

Inputs should include the Evidence stage output, not bypass it.

The Coach can be more useful when it has:

- `EvidenceResult`,
- Rider-facing Analysis Summary,
- recent rider history,
- previous sessions for comparison,
- trick-specific progression state,
- repeated failure patterns,
- rider-confirmed intent,
- optional user notes.

Outputs should be coaching guidance, not another raw classification.

## Additional Inputs Needed For Coach

### EvidenceResult

The Coach needs validated analysis facts:

- observed approach,
- edge load,
- pop,
- rotation,
- landing,
- grab,
- candidate trace,
- validation warnings,
- knowledge insights.

The Coach should treat low-confidence facts as uncertain context, not truth.

### Rider-facing Summary

The current summary already converts technical evidence into rider-readable
language. The Coach should reuse this as a concise "what we think happened"
context block.

This prevents the Coach from rebuilding the entire interpretation from raw
schema fields.

### User History

Coaching becomes meaningfully different when the system knows:

- what the rider has been practicing,
- which tricks repeat,
- which weaknesses recur,
- which clips were successful,
- which clips needed review.

Without history, coaching should stay session-specific and modest.

### Previous Session Comparison

Comparison is useful only after enough moments exist.

Example:

```text
Your edge load looked more stable than the previous attempt, but the handle
still drifted away during takeoff.
```

This should not be part of the first Coach MVP unless restored historical
evidence is reliable.

### Trick Progression

Progression connects a trick to a practice ladder.

Example:

```text
Toeside Basic Air
-> consistent toeside edge
-> wake-to-wake control
-> grab attempt
-> toeside 180
```

This needs a domain progression model before it becomes product-facing.

## Should Coach Be A Second API Call?

The Coach should become a separate second call when at least one of these is
true:

- the output needs personalized wording beyond deterministic formatting,
- the input includes multiple Moments or rider history,
- the Coach must choose between multiple possible practice priorities,
- the product needs a conversational explanation,
- static rule-based text starts feeling repetitive or shallow.

The Coach should not become a second call yet if:

- the current Rider-facing Summary can explain the clip clearly enough,
- the only goal is to rephrase the same EvidenceResult,
- there is not enough history to personalize advice,
- uncertainty is still high in the Evidence stage,
- the extra cost would only make the product sound more confident.

Recommended MVP decision:

Use deterministic formatting and rule-based guidance first. Add a second AI
Coach call only when the product has enough stable evidence and historical
context to make the call meaningfully better.

## MVP Coach Output Shape

Draft app-facing structure:

```ts
type AiCoachMvp = {
  mainFeedback: string;
  whyItMatters: string;
  nextFocus: string;
  practiceCue: string;
  progressionHint: string | null;
  caution: string | null;
};
```

### `mainFeedback`

The main coaching message for this clip.

It should be grounded in validated evidence and avoid pretending uncertain
facts are confirmed.

Example:

```text
Your takeoff looks organized enough to keep working on the same basic-air
pattern, but the clip still needs review before naming a more advanced trick.
```

### `whyItMatters`

Explains why the focus affects riding.

Example:

```text
Holding the edge through the wake gives the pop a cleaner direction and makes
the landing easier to control.
```

### `nextFocus`

One focused thing to work on next.

Example:

```text
Focus on carrying the edge all the way through the wake rather than flattening
off early.
```

### `practiceCue`

A short cue the rider can remember on the water.

Example:

```text
Edge through the top, then stand tall.
```

### `progressionHint`

Optional. Only use when the system has enough confidence to connect this clip
to a progression.

Example:

```text
Once this jump is consistent, the next useful progression may be adding a
simple grab or a controlled 180.
```

### `caution`

Optional. Use when evidence is uncertain or the advice should stay conservative.

Example:

```text
The clip does not clearly show the handle position, so avoid over-reading the
rotation mechanics from this attempt.
```

## What Not To Implement Yet

Do not implement these in the first Coach layer:

- personalized training plans,
- long-term growth analytics,
- multi-video comparison,
- paid-grade advanced coaching,
- full progression scoring,
- automatic weekly plans,
- social sharing,
- coach chat,
- injury or safety diagnosis,
- model-to-model debate.

Those may become useful later, but they require more rider history, more
validated examples, and stronger product confidence.

## Implementation Boundary

The first Coach implementation should be constrained:

```text
EvidenceResult
+ Rider-facing Summary
+ optional KnowledgeInsights / CoachingInsightContext
-> Coach MVP output
```

It should not:

- reclassify the trick,
- override validators,
- hide uncertainty,
- create new ObservedFacts,
- weaken taxonomy gates,
- invent progression history.

## Required Decisions Before Implementation

Before writing Coach code, decide:

1. Should Coach v1 be deterministic/rule-based or a second Gemini call?
2. If it is a second call, what cost budget is acceptable per Moment?
3. Should Coach run automatically after Evidence, or only when the rider opens
   the detail screen?
4. Should Coach output be stored in Supabase, or generated on demand?
5. What is the first supported scope: Basic Air only, all wakeboard clips, or
   review-needed clips excluded?
6. Should user notes and rider intent be required before coaching?
7. What wording standard prevents Coach from sounding too certain?
8. What UI space should Coach occupy relative to the current Analysis Summary?

## Recommended Next Step

Do not add the second AI call immediately.

First, run more real clips through the current Evidence + Rider-facing Summary
path and identify where users still ask, "So what should I do next?"

Then implement a small Coach MVP that turns already-validated analysis into one
or two concrete practice cues. The first Coach should feel like a careful
riding note from a knowledgeable assistant, not a full training program.
