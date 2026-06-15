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
7. Open the Session detail.
8. Tap `Gemini 코칭 받기`.
8. Send the selected video file to the local dev-server through
   `EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT`.
9. The app-facing dev-server endpoint sends the uploaded video to Gemini.
10. A separate benchmark endpoint can send sampled frames to OpenAI GPT-5.5 for
    same-video comparison.
11. Tap `GPT 코칭 받기` to run the same Session/video through the benchmark path.
12. Render and persist the returned `AnalysisResult` objects locally for
    side-by-side review.

## Current Implementation

- Video picker: `expo-image-picker`
- Screen: `src/features/sessions/HomeScreen.tsx`
- Analysis adapter: `src/services/ai/analyzeSessionVideo.ts`
- Local persistence: `@react-native-async-storage/async-storage`
- Required endpoint env var for analysis: `EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT`
- Local analysis server: `dev-server/index.ts`
- App-facing provider: Gemini API through `@google/genai`
- Parallel benchmark provider: OpenAI Responses API through `openai`

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

## Current Analysis Shape

The app-facing server-side flow is:

1. Receive the uploaded video from the mobile app.
2. Upload the original video file to Gemini.
3. Ask Gemini for a concise mobile-compatible `AnalysisResult`.
4. Return summary, highlights, suggestions, and AI-selected `highlightScenes`.

The parallel OpenAI benchmark flow is:

1. Receive the same uploaded video through `/api/benchmarks/openai-wakeboard-video`.
2. Extract broad evenly spaced frames across the video with `ffmpeg-static`.
3. Ask GPT-5.5 to scout phase-weighted trick evidence windows.
4. Extract focused frames around the selected setup, initiation, airborne, and
   outcome evidence windows.
5. Send the focused frames plus session metadata to GPT-5.5 through the OpenAI
   Responses API.
6. Ask for strict structured JSON and human-readable coaching output with
   observations, pattern recognition, inferences, confidence, and self-critique.
7. Save the benchmark artifact locally for Gemini comparison.

Gemini and OpenAI API keys must stay on the server. The mobile app only sends
video/session data to the BFF endpoint.

## Development Cost Guardrails

During solo development, keep the target API spend under KRW 10,000/month.

The development server defaults are intentionally conservative:

- `MAX_VIDEO_MB=20`
- `OPENAI_MAX_VIDEO_MB=50`
- `DAILY_ANALYSIS_LIMIT=30`
- `RATE_LIMIT_MAX_REQUESTS=3`
- `OPENAI_MAX_OUTPUT_TOKENS=8000`
- `OPENAI_REQUEST_TIMEOUT_MS=240000`
- `OPENAI_VIDEO_FRAME_COUNT=18`
- `OPENAI_FOCUSED_VIDEO_FRAME_COUNT=24`
- `OPENAI_VIDEO_FRAME_WIDTH=1536`
- `OPENAI_REASONING_EFFORT=medium`

Also set account-level billing safeguards where available. The app/server
guardrails reduce accidental spend, but account-level billing controls are the
final protection.

The OpenAI path is an explicit benchmark exception: it uses server-side frame
sampling because the current implementation is testing whether API-based OpenAI
image reasoning can reproduce useful wakeboard coaching quality before making
provider conclusions. This does not replace the Gemini app-facing endpoint.

The goal is not to classify tricks from isolated frames. The benchmark should
find and weight the correct wakeboarding evidence windows: static setup,
initiation, airborne mechanics, and outcome. Trick identity should be determined
primarily from setup + initiation + airborne mechanics. Peak-to-landing should
not be ignored, but landing/crash should not override trick identity.

The next AI architecture direction is documented in
`docs/AI_ANALYSIS_PIPELINE_DESIGN.md`. The key shift is from one Gemini pass to
a staged pipeline: observed facts, family classification, specific trick
classification, judge AI, then coaching.

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

1. Add `GEMINI_API_KEY` and `OPENAI_API_KEY` to local `.env.local`.
2. Restart `npm run server:dev`.
3. Confirm `/health` returns `primaryProvider: "gemini"`,
   `geminiConfigured: true`, and OpenAI benchmark `configured: true`.
4. Test from the standalone iPhone app with the same wakeboard comparison video.
5. Confirm real Gemini-backed Korean feedback renders in the app.
6. Run the same saved Session/video through the GPT benchmark button.
7. Review the app-rendered GPT result and the saved benchmark artifact under
   `dev-artifacts/openai-benchmarks/`.
8. Only after that, decide how to persist Sessions, videos, and AnalysisResults
   beyond local device storage.
