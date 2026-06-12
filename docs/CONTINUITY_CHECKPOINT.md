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

## Not Done Yet

- No database or persistence.
- No authentication.
- No backend.
- No OpenAI or AI analysis integration.
- No video upload.
- No App Store Connect upload yet.
- No completed EAS production build yet.
- No completed EAS submit yet.

## Next Recommended Work

Do not add product features yet.

Next work should focus on making the current app deliverable through TestFlight / App Store:

1. Push local project commits to GitHub.
2. Confirm Expo account login with EAS CLI.
3. Confirm Apple Developer Program membership and App Store Connect access.
4. Create or verify the App Store Connect app record for `com.jongsunp.actionsportsjournal`.
5. Run an iOS production build with EAS.
6. Submit the build to App Store Connect / TestFlight.

## Current Priority

The priority is release-path validation, not UI/UX polish.

The user is comfortable handling UI/UX later. The hard part for now is the native app release path.
