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
  "highlightScenes": [
    {
      "id": "highlight-001",
      "timestampLabel": "0:12",
      "title": "Best edge control",
      "description": "The rider holds a cleaner edge through the turn.",
      "imageUri": "https://example.com/highlights/session-123-001.jpg"
    }
  ],
  "suggestions": ["Actionable improvement"],
  "createdAt": "2026-06-12T00:00:00.000Z"
}
```

The app normalizes missing or malformed optional fields so a partial server response does not immediately break the UI.

## Highlight Rule

The mobile app must not guess the highlight timestamp.

Users can start or stop recording at different moments, so a fixed timestamp such as "first frame" or "12 seconds in" is not meaningful. Highlight selection should be produced by the server-side AI analysis pipeline and returned through `highlightScenes`.

`highlightScenes` should represent scenes selected by analysis, not scenes assumed by the app.

## OpenAI Analysis Shape

The intended server-side flow is:

1. Receive the uploaded video from the mobile app.
2. Extract a small set of candidate frames or short scene intervals on the server.
3. Send the relevant frames/images plus session metadata to OpenAI.
4. Ask for structured output matching the `AnalysisResult` shape.
5. Return summary, highlights, suggestions, and AI-selected `highlightScenes`.

The OpenAI API key must stay on the server. The mobile app only sends video/session data to the BFF endpoint.

## Development Cost Guardrails

During solo development, keep the target OpenAI API spend under KRW 10,000/month.

The development server defaults are intentionally conservative:

- `MAX_VIDEO_MB=20`
- `DAILY_ANALYSIS_LIMIT=3`
- `RATE_LIMIT_MAX_REQUESTS=3`
- `OPENAI_MAX_OUTPUT_TOKENS=600`
- `OPENAI_REQUEST_TIMEOUT_MS=120000`

Also set a monthly budget in the OpenAI Platform billing settings. The app/server guardrails reduce accidental spend, but the platform budget is the final account-level protection.

For cost control, do not send every full-length video to an expensive model by default. The next production-minded version should extract a small number of candidate frames or short intervals on the server, then send only those analysis inputs to OpenAI.

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
4. Add server-side video frame extraction for AI-selected highlight candidates.
5. Return the `AnalysisResult` JSON shape above, including `highlightScenes` when available.
6. Only after that, decide how to persist Sessions, videos, and AnalysisResults.
