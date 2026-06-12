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

This stage is for proving that a user can attach a video to a Session and
request an AI check from a standalone iPhone preview build. It is not the final
storage, backend, or AI architecture.

## Current App Flow

The mobile app can now:

1. Select an ActivityGroup.
2. Open Add Session.
3. Enter title and notes.
4. Select one video from the photo library.
5. Save a local Session with `videoUri`.
6. Persist added Session state on-device with AsyncStorage.
7. Tap `AI 체크하기`.
8. Send the selected video file to the local dev-server through
   `EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT`.
9. The dev-server sends the uploaded video file to Gemini Video Understanding.
10. Render the returned `AnalysisResult`.

## Current Implementation

- Video picker: `expo-image-picker`
- Screen: `src/features/sessions/HomeScreen.tsx`
- Analysis adapter: `src/services/ai/analyzeSessionVideo.ts`
- Local persistence: `@react-native-async-storage/async-storage`
- Required endpoint env var for analysis: `EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT`
- Local analysis server: `dev-server/index.ts`
- Server-side video model provider: Gemini API through `@google/genai`

The mobile app must not contain a Gemini API key. The key belongs only in the
server-side `.env.local`.

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

The app normalizes missing or malformed optional fields so a partial server
response does not immediately break the UI.

## Highlight Rule

The mobile app must not guess the highlight timestamp.

Users can start or stop recording at different moments, so a fixed timestamp such as "first frame" or "12 seconds in" is not meaningful. Highlight selection should be produced by the server-side AI analysis pipeline and returned through `highlightScenes`.

`highlightScenes` should represent scenes selected by analysis, not scenes assumed by the app.

## Gemini Analysis Shape

The intended server-side flow is:

1. Receive the uploaded video from the mobile app.
2. Upload the original video file to Gemini Files API.
3. Send the uploaded video reference plus session metadata to Gemini Video
   Understanding.
4. Ask for structured JSON output matching the `AnalysisResult` shape.
5. Return summary, highlights, suggestions, and AI-selected `highlightScenes`.

The Gemini API key must stay on the server. The mobile app only sends
video/session data to the BFF endpoint.

## Development Cost Guardrails

During solo development, keep the target Gemini API spend under KRW 10,000/month.

The development server defaults are intentionally conservative:

- `MAX_VIDEO_MB=20`
- `DAILY_ANALYSIS_LIMIT=3`
- `RATE_LIMIT_MAX_REQUESTS=3`
- `GEMINI_MAX_OUTPUT_TOKENS=600`
- `GEMINI_REQUEST_TIMEOUT_MS=120000`

Also set account-level billing safeguards in Google AI Studio / Google Cloud
where available. The app/server guardrails reduce accidental spend, but
account-level billing controls are the final protection.

The product requirement for this stage is to avoid arbitrary local frame
extraction. The server should pass the uploaded video file to a provider that
officially supports video understanding.

## Not In Scope Yet

- Database-backed Session storage
- Production video storage
- User accounts
- Authentication
- Long-running job queue
- Push notifications
- Share cards
- Detailed trick detection
- Multi-video analysis

## Next Work

1. Add `GEMINI_API_KEY` to local `.env.local`.
2. Restart `npm run server:dev`.
3. Confirm `/health` returns `geminiConfigured: true`.
4. Test from the standalone iPhone app with a short under-20MB video.
5. Confirm real Korean feedback renders in the app.
6. If `video/quicktime` fails with Gemini, test `video/mp4` next. This is a
   container compatibility issue, not a frame-selection change.
7. Only after that, decide how to persist Sessions, videos, and AnalysisResults
   beyond local device storage.
