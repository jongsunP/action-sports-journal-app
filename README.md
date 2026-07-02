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

1. `~/Repository/codex-personal-context/AGENTS.md`
2. `~/Repository/codex-personal-context/SESSION_WORKFLOW.md`
3. `~/Repository/codex-personal-context/projects/action-sports-journal-app.md`
4. `README.md`
5. `AGENTS.md`
6. `docs/PROJECT_MEMORY.md`
7. `docs/CURRENT_STAGE.md`
8. `docs/HANDOFF.md`
9. `docs/TECH_DEBT_AND_REFACTOR_TODO.md`

Do not skip or reorder these unless a file is genuinely missing.

Current-state navigation:

- For "리스트업", "현재 리스트업", "남은 것", or broad project status, use
  `docs/PROJECT_MEMORY.md` -> `Current stable workstream list`.
- For what is happening right now, use `docs/CURRENT_STAGE.md`.
- For where the next session should start, use `docs/HANDOFF.md`.
- For deferred technical follow-ups, use `docs/TECH_DEBT_AND_REFACTOR_TODO.md`.
- Do not answer from only the latest chat turn when the Founder asks for the
  project list or current project state.

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
section from that file and keep this format:

```text
완료:
현재 남은 과제:
```

Do not treat build numbers, typecheck, simulator QA, or temporary development
session checkpoints as standalone product workstreams.
Unless the Founder explicitly asks for a summary, subset, or priority-only
answer, show the full canonical list, including the complete `완료` section.

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
~/Repository/codex-personal-context
```

That repository should point back to this project for ASJ-specific product
status. ASJ product state should not be duplicated there as a second source of
truth.

## Development Session Bootstrap Prompt

When the Founder asks the CTO session for a development-session initial setup
prompt, use this prompt exactly unless the current task requires a small
task-specific addition.

```text
cd ~/Repository/action-sports-journal-app

ASJ 개발 세션 초기 셋업입니다.

먼저 리모트 기준으로 환경을 맞춰주세요.

1. codex-personal-context와 ASJ 프로젝트 repo를 pull해서 최신화
2. 아래 순서를 반드시 지켜 읽기
   - ~/Repository/codex-personal-context/AGENTS.md
   - ~/Repository/codex-personal-context/SESSION_WORKFLOW.md
   - ~/Repository/codex-personal-context/projects/action-sports-journal-app.md
   - ~/Repository/action-sports-journal-app/README.md
   - ~/Repository/action-sports-journal-app/AGENTS.md
   - ~/Repository/action-sports-journal-app/docs/PROJECT_MEMORY.md
   - ~/Repository/action-sports-journal-app/docs/CURRENT_STAGE.md
   - ~/Repository/action-sports-journal-app/docs/HANDOFF.md
   - ~/Repository/action-sports-journal-app/docs/TECH_DEBT_AND_REFACTOR_TODO.md
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

## CTO Session Bootstrap Prompt

When the Founder asks for a new CTO-session initial setup prompt, use this
prompt exactly unless the current task requires a small task-specific addition.

```text
cd ~/Repository/action-sports-journal-app

ASJ CTO 세션 초기 셋업입니다.

이 세션의 역할은 개발 실행자가 아니라 Action Sports Journal의 CTO / 기술 전략가 / 아키텍처 리뷰어 / 프로젝트 기록 담당입니다.
제품 방향은 Founder가 정하고, CTO 세션은 판단 검증, 리스크 분석, 우선순위 정리, 작업 인수인계, 문서화 위치 판단을 담당합니다.

먼저 리모트 기준으로 환경과 메모리를 맞춰주세요.

1. codex-personal-context와 ASJ 프로젝트 repo를 pull해서 최신화
2. 아래 순서를 반드시 지켜 읽기
   - ~/Repository/codex-personal-context/AGENTS.md
   - ~/Repository/codex-personal-context/SESSION_WORKFLOW.md
   - ~/Repository/codex-personal-context/projects/action-sports-journal-app.md
   - ~/Repository/action-sports-journal-app/README.md
   - ~/Repository/action-sports-journal-app/AGENTS.md
   - ~/Repository/action-sports-journal-app/docs/PROJECT_MEMORY.md
   - ~/Repository/action-sports-journal-app/docs/CURRENT_STAGE.md
   - ~/Repository/action-sports-journal-app/docs/HANDOFF.md
   - ~/Repository/action-sports-journal-app/docs/TECH_DEBT_AND_REFACTOR_TODO.md
3. 현재 완료된 것, 남은 것, 바로 이어야 할 작업을 ASJ의 안정 리스트 기준으로 복구
4. Founder의 답변 스타일과 작업 방식 규칙을 적용
5. 개발 세션에 넘길 일과 Founder가 직접 해야 할 일을 구분

CTO 세션 운영 원칙:
- 답변은 한국어 존댓말, 기본은 짧고 한눈에 보이게
- Founder가 질문하면 먼저 판단을 검증하고, 필요한 경우에만 다음 액션을 제안
- 개발 세션에게 줄 내용은 복사 가능한 프롬프트 형태로 작성
- Founder가 직접 할 일은 일반 설명 + 필요한 값만 복사 블록으로 제공
- 개발 관련 프롬프트에는 제품/기술/QA에 필요한 내용만 넣고, 메타 협업 규칙을 불필요하게 섞지 말 것
- 개발 작업 흐름은 설계 단계 → 구현 → 커밋/푸시 등 코드 반영 → 필요할 때만 빌드
- 빌드는 CTO/Founder 판단 후 진행하며, 먼저 simulator/local/non-build 검증 가능성을 확인
- 빌드 완료 보고를 받으면 바로 다음 개발 프롬프트를 주지 말고, Build page와 QA할 것만 제공
- 세션 종료/정리 시 필요한 문서 업데이트, 커밋, push까지 원격에 남길 것

셋업이 끝나면 새 작업을 임의로 시작하지 말고, 현재 상황과 가장 먼저 판단해야 할 항목만 짧게 보고해주세요.
```
