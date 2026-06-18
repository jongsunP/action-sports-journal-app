# Portfolio Case Studies

## Purpose

Action Sports Journal can be used later as a portfolio project that shows product thinking, engineering judgment, and iteration quality.

This document defines how to record case studies while the product evolves.

The goal is not to keep a daily work log. The goal is to preserve the decisions that made the product better.

## Recording Principles

Write each case study as a decision record.

Use this flow:

Problem -> Decision -> Implementation -> Result -> Insight

Good case studies should explain:

- What problem existed
- Why the problem mattered
- What options were considered
- Why one direction was chosen
- What was actually implemented
- What changed after implementation
- What was learned for future product or engineering decisions

Avoid writing:

- A chronological task log
- A list of commits
- A feature checklist without context
- Internal-only implementation details that do not explain product judgment

## Current Candidate Cases

### Home v2: Gallery to Journal

Potential story:

The app started with a video-gallery-like Home, but the product goal was not a file browser. The Home experience shifted toward an Apple-style sports journal where AI analysis is the entry point, and recent sessions become part of a personal riding record.

Why it matters:

- Shows product positioning
- Shows information architecture decisions
- Shows how UI changed from media-first to journal-first

### Mock AI Backend Flow

Potential story:

The app needed realistic upload -> backend -> async job -> Supabase -> polling -> UI validation without paying AI cost or waiting for model latency. A backend mock mode was added at the AI call boundary while preserving the real integration path.

Why it matters:

- Shows practical engineering leverage
- Shows separation between product flow and external AI dependency
- Shows dev-only safety thinking

### Detail v2 UX Redesign

Potential story:

The detail screen originally had too many boxes, bottom actions, and duplicated information. It was redesigned into a darker, more continuous reading flow with floating top controls, video-first layout, status dots, and reduced text density.

Why it matters:

- Shows mobile UX iteration from real QA
- Shows simplification without changing backend behavior
- Shows how action placement affects perceived quality

### Candidate Trace

Potential story:

The system needed a way to show likely trick candidates without falsely presenting them as confirmed results. Candidate Trace allows the UI to surface a review candidate while keeping the persisted result conservative.

Why it matters:

- Shows trust-aware AI UX
- Shows handling of uncertainty
- Shows a distinction between observed facts, safe output, and review candidates

### Status Sync Improvement

Potential story:

The app had moments where list and detail status felt inconsistent, and queued/processing states were hard for users to understand. Status presentation was unified so the same state language appears across surfaces.

Why it matters:

- Shows state modeling for async UX
- Shows how small wording and visual decisions affect trust
- Shows how product UI can reduce confusion without backend changes

### Knowledge to Coaching Structure

Potential story:

The project separates observed evidence and domain knowledge from coaching output. This keeps AI analysis grounded in what was visible and avoids jumping directly from raw model output to user-facing coaching.

Why it matters:

- Shows AI product architecture
- Shows safety against hallucinated coaching
- Shows long-term extensibility for sport-specific knowledge

## Case Study Template

Use this template for each portfolio-ready story.

### Title

Short, specific case title.

Example:

Home v2: From Video Gallery to Riding Journal

### Problem

What was wrong, unclear, slow, risky, or mismatched?

Keep it user-facing or product-facing when possible.

### Background

What was the product context?

What stage was the app in?

What constraints mattered?

Examples:

- iOS-first app
- Expo / React Native
- AI analysis as one feature, not the whole product
- No large backend changes allowed
- Mock QA needed before spending AI calls

### Options

What alternatives were considered?

Include tradeoffs, not just the final choice.

Examples:

- Keep gallery layout
- Move to feed layout
- Shift to journal dashboard

### Final Decision

What direction was chosen?

Why was it chosen?

State the decision clearly.

### Implementation

What was changed?

Keep this concise and high-level.

Mention important files, components, APIs, or data structures only when they help explain the decision.

### Result

What improved after the change?

Use concrete observations when available.

Examples:

- QA feedback improved
- UI became easier to scan
- Integration testing became faster
- AI cost was avoided during UI iteration

### Learned

What insight should carry into future work?

This is the most important section for portfolio value.

Good learned points are reusable beyond this project.

## Writing Rules

- Write in clear product and engineering language.
- Keep each case understandable without reading the whole repository.
- Prefer screenshots, before/after notes, or short diagrams when useful.
- Do not expose secrets, API keys, private user data, or real personal footage.
- Do not overstate results. If something is a hypothesis or early QA signal, say so.
- Keep AI claims conservative and grounded in actual product behavior.
