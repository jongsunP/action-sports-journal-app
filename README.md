# Action Sports Journal

iOS-first action sports journal app for recording riding sessions, AI-assisted
analysis, recovery, and long-term growth history.

## Start Here

For humans and AI agents, this repository has many historical design documents.
Do not try to reconstruct the current state by reading every `.md` file.

When starting from any device or any new AI/Codex session, first pull and read
the personal context repository. This project expects the cross-project Codex
workflow rules to be loaded before ASJ-specific docs.

ASJ follows the Codex Working Environment as Code principle. If a device has
pulled both `codex-personal-context` and this project repo, agents should apply
the same recorded communication style, workflow rules, read/write order, and
project source-of-truth structure on that device.

Expected loop:

```text
pull personal context
pull project repo
read in the documented order
apply recorded rules
write only to canonical locations
commit and push durable changes
```

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

## Development Session Bootstrap Prompt

When the Founder asks the CTO session for a development-session initial setup
prompt, use this prompt exactly unless the current task requires a small
task-specific addition.

```text
cd ~/repository/action-sports-journal-app

ASJ 개발 세션 초기 셋업입니다.

먼저 리모트 기준으로 환경을 맞춰주세요.

1. codex-personal-context와 ASJ 프로젝트 repo를 pull해서 최신화
2. 아래 순서를 반드시 지켜 읽기
   - ~/repository/codex-personal-context/AGENTS.md
   - ~/repository/codex-personal-context/SESSION_WORKFLOW.md
   - ~/repository/codex-personal-context/projects/action-sports-journal-app.md
   - ~/repository/action-sports-journal-app/README.md
   - ~/repository/action-sports-journal-app/AGENTS.md
   - ~/repository/action-sports-journal-app/docs/PROJECT_MEMORY.md
   - ~/repository/action-sports-journal-app/docs/CURRENT_STAGE.md
   - ~/repository/action-sports-journal-app/docs/HANDOFF.md
   - ~/repository/action-sports-journal-app/docs/TECH_DEBT_AND_REFACTOR_TODO.md
3. git status와 현재 branch / origin 동기화 상태 확인
4. 현재 완료된 것, 남은 것, 바로 이어야 할 작업을 짧게 복구
5. 개발 작업을 시작하기 전 필요한 확인 사항이나 blocker만 보고

주의:
- ASJ 상태/리스트/QA/기술 결정은 프로젝트 repo 문서를 기준으로 판단
- 개인 설정/세션 운영 규칙은 codex-personal-context를 적용만 하고, 개발 프롬프트에 불필요하게 섞지 말 것
- 새 .md를 만들기보다 README의 "Where To Write" 위치를 따를 것
- 빌드는 CTO/Founder 승인 전까지 시작하지 말 것
- 가능하면 simulator/local/non-build 검증을 먼저 할 것
- paid AI 호출은 AI 품질 검증이 목적일 때만 사용하고, 그 외에는 실제 플로우를 유지한 채 비용 발생 지점만 최소화할 것
- 작업 완료/정리 시 필요한 문서 업데이트, 커밋, push까지 원격에 남길 것

셋업만 끝나면 새 작업을 임의로 시작하지 말고, 현재 시작점과 필요한 다음 액션을 보고해주세요.
```
