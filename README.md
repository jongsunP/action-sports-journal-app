# Action Sports Journal

iOS-first action sports journal app for recording riding sessions, AI-assisted
analysis, recovery, and long-term growth history.

## Start Here

For humans and AI agents, this repository has many historical design documents.
Do not try to reconstruct the current state by reading every `.md` file.

When starting from any device or any new AI/Codex session, first pull and read
the personal context repository. This project expects the cross-project Codex
workflow rules to be loaded before ASJ-specific docs.

ASJ follows the portable workspace principle: if a device has pulled both
`codex-personal-context` and this project repo, agents should apply the same
recorded communication style, workflow rules, and project source-of-truth
structure on that device.

Full read order:

1. `~/repository/codex-personal-context/AGENTS.md`
2. `~/repository/codex-personal-context/SESSION_WORKFLOW.md`
3. `~/repository/codex-personal-context/projects/action-sports-journal-app.md`
4. `README.md`
5. `AGENTS.md`
6. `docs/PROJECT_MEMORY.md`
7. `docs/CURRENT_STAGE.md`
8. `docs/HANDOFF.md`
9. `docs/TECH_DEBT_AND_REFACTOR_TODO.md`

Do not skip or reorder these unless a file is genuinely missing.

Within this project repository, the key docs are:

1. `AGENTS.md` - collaboration rules, response format, and session workflow.
2. `docs/PROJECT_MEMORY.md` - canonical ASJ product memory, stable workstream
   list, durable decisions, and backlog.
3. `docs/CURRENT_STAGE.md` - current implementation/QA stage details.
4. `docs/HANDOFF.md` - latest cross-session handoff and next starting point.
5. `docs/TECH_DEBT_AND_REFACTOR_TODO.md` - follow-up technical debt and
   refactor backlog.

Other docs under `docs/` are supporting references, historical plans, audits,
or focused design notes. Read them only when the active task points to them.

## Canonical Status

The canonical ASJ workstream list lives in:

```text
docs/PROJECT_MEMORY.md
```

When asked for the project list, use the `Current stable workstream list`
section from that file and keep the two-section format:

```text
완료:
남은 것:
```

Do not treat build numbers, typecheck, simulator QA, or temporary development
session checkpoints as standalone product workstreams.

## Where To Write

Use these write locations. Do not create a new `.md` or duplicate the same
state elsewhere unless the Founder explicitly asks for a separate artifact.

Recorded rules are treated as source-of-truth. If a rule exists in the approved
read path, follow it. If it is wrong or outdated, update the canonical location
instead of adding a conflicting copy somewhere else.

- `docs/PROJECT_MEMORY.md`: canonical product memory, durable decisions,
  stable workstream list, and backlog.
- `docs/CURRENT_STAGE.md`: current implementation and QA state.
- `docs/HANDOFF.md`: latest next-session handoff and immediate starting point.
- `docs/TECH_DEBT_AND_REFACTOR_TODO.md`: technical debt, refactor tasks, and
  deferred engineering follow-ups.
- `AGENTS.md`: project-specific agent behavior and collaboration rules.
- `README.md`: documentation entry point and source-of-truth map only.

For cross-project Codex working rules, update `codex-personal-context`.
For ASJ product state, update this project repository, not personal context.

## Personal Context Boundary

Cross-project Codex working rules live in:

```text
~/repository/codex-personal-context
```

That repository should point back to this project for ASJ-specific product
status. ASJ product state should not be duplicated there as a second source of
truth.
