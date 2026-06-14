# AI Coaching Principles

## Product Philosophy

Users are impressed when AI understands rider intent.

Scores alone have little value. Explanation and evidence matter more than raw
ratings.

The product should optimize for:

```text
AI understood what I was trying to do.
```

not:

```text
AI generated a score.
```

## Coaching Architecture

```text
Video
-> Event Window Detection
-> Evidence Extraction
-> User Confirmation
-> Coaching
-> Progression Tracking
```

AI coaching should not jump directly from video to advice. The system first
needs to find the important event window, extract visible evidence, and let the
user confirm intent before coaching or tracking progression.

Wakeboard trick evidence should also follow the taxonomy reference in
`docs/WAKEBOARD_TRICK_TAXONOMY_REFERENCE.md`: classify the parent trick family
before naming a specific trick.

## Wakeboard Domain Insights

Trick identity is not determined by landing.

Trick identity is mostly determined by:

- stance
- edge
- approach
- takeoff
- pop
- rotation initiation
- early airborne rotation axis

Landing and crash are outcome signals. They matter for `landingOutcome`,
confidence, and coaching, but they should not override setup, initiation, and
airborne mechanics when determining trick identity.

## Event Window Principle

The goal is not to find highlight frames.

The goal is to find the event window where trick identity is established.

For wakeboarding, decisive evidence is phase-weighted rather than frame-based.
The model should evaluate setup, initiation, airborne mechanics, and outcome
signals separately, then explain which phases drove the conclusion.

## AI Trust Principle

Keep these separate:

```text
Observation
-> Pattern Recognition
-> Inference
```

Observation is what is directly visible. Pattern recognition is the movement
pattern across time. Inference is the coaching interpretation grounded in those
observations and patterns.

When evidence conflicts, the system should return candidate tricks with reasons
and confidence instead of forcing one answer.

When parent-family evidence is missing, prefer `Unknown`, `needs_review`, or
the safer Basic Air / Straight Air family over a high-confidence advanced
invert trick.
