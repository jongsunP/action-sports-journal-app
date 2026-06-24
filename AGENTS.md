# Action Sports Journal

An iOS-first React Native application for action sports athletes.

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

When the user asks what remains or asks for current status, answer in time
order and include both the full remaining list and the immediate next work:

```text
과거:
현재:
가까운 미래:
먼 미래:
바로 앞 작업:
```

Keep this summary concise and easy to scan.

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

After a development session reports that a build is complete, do not immediately
send a new development-session prompt. First give the Founder only the QA steps
needed for that build and wait for the Founder’s QA result. After the Founder
reports the result, then decide whether to send a development-session follow-up.

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
