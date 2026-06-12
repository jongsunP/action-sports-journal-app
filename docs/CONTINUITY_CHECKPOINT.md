# Continuity Checkpoint

## Purpose

This file records the current handoff state after the prior Codex account/session became unavailable.

Use this file together with:

- `AGENTS.md`
- `docs/HANDOFF.md`
- `docs/CURRENT_STAGE.md`
- `REVIEW.md`

## Current Project State

The project is in this state:

```text
Stage 1 complete
Stage 2 local ActivityGroup / Session prototype complete
App Store / TestFlight preparation started
Stage 3 video-to-analysis prototype started
```

The latest known local commit before this checkpoint was:

```text
d81def4 Refresh handoff for App Store prep
```

At the time this checkpoint was written, the local `master` branch was ahead of `origin/master` by 8 commits.

## Confirmed Working

- The app opens in Expo Go on the user's physical iPhone.
- Tunnel mode was used successfully when LAN mode was unreliable.
- ActivityGroups are visible.
- Sessions are filtered by selected ActivityGroup.
- Add Session opens an input flow.
- Saving a session adds it to the current in-memory list.
- A selected video can be attached to a new in-memory Session.
- A first analysis request flow exists with a local mock fallback.

Added sessions are not persisted after app reload. This is expected because Stage 2 intentionally uses mock data and React state only.

## Implemented Locally

- Local-only ActivityGroup / Session prototype.
- Mock ActivityGroup data.
- Mock Session data.
- Session composer with title and notes.
- Save Session disabled until a title exists.
- Keyboard dismissal on save and through a Hide Keyboard button.
- iOS bundle identifier and build number in `app.json`.
- Android package and version code in `app.json`.
- Initial `eas.json` with preview and production profiles.
- `expo-image-picker` dependency for video selection.
- `src/services/ai/analyzeSessionVideo.ts` for the analysis request adapter.
- Optional analysis endpoint hook through `EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT`.

## Not Done Yet

- No database or persistence.
- No authentication.
- No backend.
- No real server-side OpenAI analysis yet.
- No production video upload or storage.
- No App Store Connect upload yet.
- No completed EAS production build yet.
- No completed EAS submit yet.

## Next Recommended Work

The user has shifted priority from release-path validation to a first feature prototype for video-based AI checking.

Next work should focus on validating the current local flow before adding infrastructure:

1. Run the app on the physical iPhone.
2. Add a Session.
3. Select a video.
4. Save the Session.
5. Tap `Request AI Check`.
6. Confirm the mock analysis result appears.
7. Add a minimal server/BFF endpoint for real OpenAI analysis.

## Current Priority

The priority is now first-pass feature validation, not UI/UX polish.

The user is comfortable handling UI/UX later. The hard parts are native app behavior, video selection, and the future server-mediated AI analysis path.
