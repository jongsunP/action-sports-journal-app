# Action Sports Journal

iOS-first action sports journal app for recording riding sessions, AI-assisted
analysis, recovery, and long-term growth history.

## Start Here

For humans and AI agents, this repository has many historical design documents.
Do not try to reconstruct the current state by reading every `.md` file.

Read these first, in order:

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

## Personal Context Boundary

Cross-project Codex working rules live in:

```text
~/repository/codex-personal-context
```

That repository should point back to this project for ASJ-specific product
status. ASJ product state should not be duplicated there as a second source of
truth.
