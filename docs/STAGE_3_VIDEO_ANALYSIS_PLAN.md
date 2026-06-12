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
9. The dev-server currently samples frames from the uploaded video and sends
   those image inputs to OpenAI for the GPT-5.5 wakeboard benchmark.
10. Render the returned `AnalysisResult`.

## Current Implementation

- Video picker: `expo-image-picker`
- Screen: `src/features/sessions/HomeScreen.tsx`
- Analysis adapter: `src/services/ai/analyzeSessionVideo.ts`
- Local persistence: `@react-native-async-storage/async-storage`
- Required endpoint env var for analysis: `EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT`
- Local analysis server: `dev-server/index.ts`
- Server-side benchmark provider: OpenAI Responses API through `openai`

The mobile app must not contain OpenAI or Gemini API keys. Keys belong only in
the server-side `.env.local`.

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

## Current OpenAI Benchmark Shape

The intended server-side flow is:

1. Receive the uploaded video from the mobile app.
2. Extract evenly spaced frames across the video with `ffmpeg-static`.
3. Send the sampled frames plus session metadata to GPT-5.5 through the OpenAI
   Responses API.
4. Ask for strict structured JSON with observations, pattern recognition,
   inferences, confidence, and self-critique.
5. Return the mobile-compatible `AnalysisResult` fields and preserve benchmark
   diagnostics for comparison.

The OpenAI API key must stay on the server. The mobile app only sends
video/session data to the BFF endpoint.

## Development Cost Guardrails

During solo development, keep the target API spend under KRW 10,000/month.

The development server defaults are intentionally conservative:

- `MAX_VIDEO_MB=50`
- `DAILY_ANALYSIS_LIMIT=3`
- `RATE_LIMIT_MAX_REQUESTS=3`
- `OPENAI_MAX_OUTPUT_TOKENS=3200`
- `OPENAI_REQUEST_TIMEOUT_MS=240000`
- `OPENAI_VIDEO_FRAME_COUNT=18`
- `OPENAI_VIDEO_FRAME_WIDTH=1536`

Also set account-level billing safeguards where available. The app/server
guardrails reduce accidental spend, but account-level billing controls are the
final protection.

This OpenAI path is an explicit benchmark exception: it uses server-side frame
sampling because the current implementation is testing whether API-based
OpenAI image reasoning can reproduce useful wakeboard coaching quality before
making provider conclusions.

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

1. Add `OPENAI_API_KEY` to local `.env.local`.
2. Restart `npm run server:dev`.
3. Confirm `/health` returns `provider: "openai"`, `model: "gpt-5.5"`, and
   `openaiConfigured: true`.
4. Test from the standalone iPhone app with the same wakeboard comparison video.
5. Confirm real Korean feedback renders in the app.
6. Review the saved benchmark artifact under `dev-artifacts/openai-benchmarks/`.
7. Only after that, decide how to persist Sessions, videos, and AnalysisResults
   beyond local device storage.
