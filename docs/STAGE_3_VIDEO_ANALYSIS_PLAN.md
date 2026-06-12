# Stage 3 Video Analysis Plan

## Goal

Create the first usable flow for:

```text
Session
↓
Video
↓
AnalysisResult
```

This stage is for proving that a user can attach a video to a Session and request an AI check. It is not the final storage, backend, or AI architecture.

## Current App Flow

The mobile app can now:

1. Select an ActivityGroup.
2. Open Add Session.
3. Enter title and notes.
4. Select one video from the photo library.
5. Save a local in-memory Session with `videoUri`.
6. Tap `Request AI Check`.
7. Show a mock `AnalysisResult` when no server endpoint is configured.

## Current Implementation

- Video picker: `expo-image-picker`
- Screen: `src/features/sessions/HomeScreen.tsx`
- Analysis adapter: `src/services/ai/analyzeSessionVideo.ts`
- Optional endpoint env var: `EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT`

The mobile app must not contain an OpenAI API key.

## Server Endpoint Contract

When `EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT` is configured, the app sends a `multipart/form-data` `POST` request.

Expected form fields:

- `sessionId`
- `activityGroupName`
- `title`
- `notes`
- `occurredAt`
- `video`

Expected JSON response:

```json
{
  "id": "analysis-123",
  "sessionId": "session-123",
  "status": "completed",
  "summary": "Short analysis summary",
  "highlights": ["Notable moment"],
  "suggestions": ["Actionable improvement"],
  "createdAt": "2026-06-12T00:00:00.000Z"
}
```

The app normalizes missing or malformed optional fields so a partial server response does not immediately break the UI.

## Not In Scope Yet

- Persistent Session storage
- Production video storage
- User accounts
- Authentication
- Long-running job queue
- Push notifications
- Share cards
- Detailed trick detection
- Multi-video analysis

## Next Work

1. Validate the current mock analysis flow on the physical iPhone.
2. Add a tiny server/BFF endpoint that accepts the same multipart contract.
3. Keep the OpenAI API key only on the server.
4. Return the `AnalysisResult` JSON shape above.
5. Only after that, decide how to persist Sessions, videos, and AnalysisResults.
