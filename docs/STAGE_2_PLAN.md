# Stage 2 Plan

## Goal

Build a local-only prototype that makes the core domain flow visible:

```text
ActivityGroup
↓
Session
```

This stage is for validating the product shape, not for adding production infrastructure.

## Scope

- Show a small set of mock `ActivityGroup` records.
- Show mock `Session` records tied to each `ActivityGroup`.
- Let the user switch between groups and inspect the sessions for the selected group.
- Allow creating a new local `Session` in memory only.
- Keep the existing domain types as the starting point unless a real gap appears.

## Proposed User Flow

1. Open the app on the home screen.
2. See a small list or selector of ActivityGroups.
3. Select one group.
4. View the sessions for that group.
5. Add a new session with minimal fields.
6. See the new session appear immediately in the current run.

## Minimal Session Fields For The Prototype

- `title`
- `notes` optional
- `occurredAt` defaulted to now
- `activityGroupId`

Keep the following untouched for now:

- `videoUri`
- `analysisResultId`
- `shareResultIds`

## Non-Goals

- Backend or API work
- Database or persistence
- Authentication or phone login
- OpenAI integration
- AI analysis UI
- Video upload or processing
- Calendar, coupons, expenses, or RAG
- Sharing implementation

## Suggested Local Structure

- `src/features/groups/mockActivityGroups.ts`
- `src/features/sessions/mockSessions.ts`
- `src/features/sessions/HomeScreen.tsx`

Keep the implementation small and reversible.

## State Management Approach

Use local React state only, most likely `useState`.

Avoid introducing:

- Redux
- Zustand
- Context for global app state
- AsyncStorage
- navigation libraries

## Success Criteria

- The app still opens on the existing first screen.
- ActivityGroups are visible without network access.
- Sessions are clearly scoped to the selected ActivityGroup.
- A new Session can be created locally and appears in the list.
- No external services are required.

## Notes

- Session remains the center of the system.
- ActivityGroup should lead into Session, not bypass it.
- This stage is intentionally narrow so later AI or sharing work can plug into a stable domain shape.
