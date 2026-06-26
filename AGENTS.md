# Action Sports Journal

An iOS-first React Native application for action sports athletes.

## Documentation Entry Point

For current project understanding, first pull and read
`~/repository/codex-personal-context` according to this project's `README.md`.
Then read `README.md` and continue in the exact order listed there. The
canonical ASJ status and stable workstream list live in
`docs/PROJECT_MEMORY.md`. Historical or focused docs under `docs/` are
references and should be opened only when the current task needs them.

For documentation edits, follow the `README.md` "Where To Write" map. Do not
write ASJ product state into personal context, duplicate the stable workstream
list, or create a new `.md` for status/handoff information when an existing
canonical document applies.

## Collaboration Response Format

Always answer in Korean honorifics.

When giving action instructions, use highly visible section headers and include
only sections that have an actual action owner.

- For work that another Codex/development session should do, use:

```text
## **개발 세션에게**
<copyable prompt text>
```

- For work that the user should do directly, use:

```text
## **사용자에게**
<short, clear explanation>

```text
<copyable value only when needed>
```
```

For user-facing explanations, be brief and easy to scan. The user will ask
follow-up questions if more detail is needed. Use copyable blocks for terminal
commands, exact values, or prompts only. If both the user and development
session have actions, show both sections and state the order.

Keep the work stream moving. Pause for explanation or questions only when a
decision is needed from the user or when the user explicitly asks a question.
If the development session can proceed directly and the user does not need to
act, do not add a user-facing action section.

For terminal tasks, always provide commands from the project directory:

```bash
cd ~/repository/action-sports-journal-app
<command>
```

When the user asks what remains or asks for current status, do not list only
recent chat items. Use the remote-backed stable ASJ workstream list as the
canonical source. Do not improvise a new list structure per session. Show it in
this format:

```text
완료:
현재 남은 과제:
```

Keep this summary concise and easy to scan.
For workstream names, prefer paired labels in the form
`English term(한국어 설명)` when an English term is a known project term. Use
plain Korean only when there is no useful English project term. Do not force
awkward Korean translations for technical/product terms.
Keep backlog/workstream names stable across answers. If a workstream was once
named in the project memory or conversation, do not silently rename, merge, or
omit it just because it is not active today. Preserve the same list structure
so the Founder can recognize continuity over time. If an item is completed,
blocked, deferred, or split, keep the item visible and mark its status.

When discussing whether to build, frame the answer around validation stages:

- If simulator/local verification remains, say that first and avoid a build.
- If simulator/local verification is complete and only standalone-device
  behavior remains, say clearly: "코드 구현과 시뮬레이터에서 가능한 확인은 끝났고,
  이제 실제 standalone 빌드로 실기기 E2E를 검증할 차례입니다."
- Do not describe this as "not working" when the actual meaning is "not yet
  verifiable without a build."

Default work rhythm:

```text
설계 단계
→ 구현
→ 커밋/푸시 등 코드 반영
→ 필요할 때만 빌드
```

Avoid bouncing too frequently between the CTO session and development session.
Group related development actions together, but do not ask a development
session to run all the way through irreversible decisions, external console
settings, or builds without CTO/user alignment. Pause only at meaningful
decision points, risk points, or when the user explicitly asks.

If the Founder asks a question after the CTO session drafts or proposes a
development-session prompt, treat that as a handoff break. The prompt is not
considered handed off until the Founder explicitly says it was passed to the
development session. During the break, answer the Founder first and provide a
revised final prompt only when the Founder asks to continue or requests the
prompt again.

Keep meta-collaboration settings separate from development task context.
Preferences about answer format, session workflow, handoff rhythm, memory, and
remote-push discipline are operating rules for Codex/CTO sessions. Record them
in project/personal docs when durable, but do not overload ordinary
development-session prompts with these meta rules. Development prompts should
include only the product, technical, QA, safety, and workflow details needed to
execute that development task.
When the Founder discusses both development and setup/workflow topics, first
classify the turn. Apply development context to product/technical work, and
apply setup/workflow context to session behavior, memory, formatting, syncing,
or documentation rules.

After a development session reports that a build is complete, do not immediately
send a new development-session prompt. First give the Founder only the QA steps
needed for that build and wait for the Founder’s QA result. After the Founder
reports the result, then decide whether to send a development-session follow-up.
When presenting build QA to the Founder, show the install/build link separately
first, then provide the QA checklist.

Session start/resume rule:

When the Founder says to start, resume, continue, or "작업을 재개하자", begin
from remote-backed state. Pull `codex-personal-context` and this project repo,
then follow the exact read order defined in `codex-personal-context/
SESSION_WORKFLOW.md` and this repository's `README.md`. Do not skip, reorder,
or rely only on local chat memory, because previous work may have happened from
another device or session.

Session closeout rule:

The Founder may continue work from another device, so completed work must be
available remotely. At the end of a work session, ensure committed changes are
pushed to origin unless there is a deliberate reason not to push. Do not leave
completed documentation/code work only on the local machine. If something
cannot be pushed, clearly report the reason and the exact local state.
When the Founder says to wrap up, close out, pause, finish, or "정리하자",
treat it as a remote-backed closeout request: update durable project docs and
personal context when needed, commit and push safe changes, and leave the next
starting point clear.

Examples:

- Wakeboard
- Waterski
- Snowboard
- Ground Tricks
- Skateboard
- Surfing

Users define their own Activity Groups.

## Expo Version Guidance

Expo has changed. This project currently uses Expo SDK 54 for compatibility with the user's App Store version of Expo Go on a physical iPhone.

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing Expo-specific code.

## Current Local Setup

- Local path: `/Users/parkjongsun/Repository/action-sports-journal-app`
- GitHub remote: `https://github.com/jongsunP/action-sports-journal-app`
- Expo SDK: `~54.0.35`
- React Native: `0.81.5`
- React: `19.1.0`
- Stage 1 status: complete
- Stage 2 status: complete
- Stage 3 status: standalone iPhone video-to-analysis prototype in progress
- Latest checkpoint commit: `001ea88 Persist local sessions on device`
- The app has been confirmed visible on the user's physical iPhone through Expo Go.
- The app has also been installed and opened on the user's physical iPhone as a
  standalone EAS preview/internal distribution app, without Expo Go.
- First visible screen: `src/features/sessions/HomeScreen.tsx`
- Root entry: `App.tsx`
- Cross-session handoff: `docs/HANDOFF.md`

## Product Philosophy

This is not an AI analysis app.

This is an Action Sports Life Log platform.

AI analysis is only one feature.

The long-term goal is helping users track growth, sessions, expenses, activity history, and progress over time.

## Core Domain Model

```text
ActivityGroup
↓
Session
↓
AnalysisResult
↓
ShareResult
```

Session is the center of the system.

Do not design features that bypass Session.

## Current Development Stage

Stage 1: Initial Setup complete.

Current goals:

- Keep standalone iPhone preview/internal distribution working.
- Validate selected video upload from the standalone app to the local dev server.
- Return real Gemini-backed Korean feedback through the server-mediated path.
- Keep local Session state persisted on-device until a real database exists.

## Do Not Implement Yet

- Database
- Authentication
- Phone login
- Coupons
- Expense tracking
- Calendar
- RAG
- Production video upload or storage
- Production backend implementation

If unsure, keep the implementation simple.

## Architecture Principles

- Prefer simple solutions.
- Avoid over-engineering.
- Avoid premature abstractions.
- Avoid creating generic frameworks.
- Create only what is required for the current stage.

## Share Strategy

Sharing is a core product requirement.

Users are expected to share growth and achievements through Instagram and social media.

Future result structures should consider:

- Best scene
- Highlight scene
- AI comment
- Growth comparison
- Share card

Do not implement sharing yet.

Only keep future extensibility in mind.

## Technology Stack

- React Native
- Expo
- TypeScript
- Node.js
- Next.js API Routes (future BFF)
- Gemini API through server-side code only
- Vercel (future)

## Expected Coding Style

- Strong TypeScript typing
- Small focused files
- Clear naming
- Minimal dependencies
- Simple folder structure
