# Development Video Analysis Setup

## Goal

Enable local Gemini-backed video analysis and a parallel OpenAI GPT-5.5
wakeboard benchmark during solo development while keeping API spend intentional
and limited.

## User-Owned Setup

These steps must be done in the user's Gemini and OpenAI API accounts:

1. Create or select a Gemini API key for the app-facing development endpoint.
2. Create or select an OpenAI API key for the parallel benchmark endpoint.
3. Check Gemini/OpenAI pricing and billing before repeated video tests.
4. Keep the solo-development monthly spend target around KRW 10,000 while testing.
5. Store the key only in local `.env.local`.

Do not paste API keys into chat, source files, docs, GitHub, or Expo public env vars.

## Local `.env.local`

Create this file locally:

```bash
cp .env.example .env.local
```

Then fill:

```text
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_ANALYSIS_MODEL=gemini-2.5-flash
GEMINI_FALLBACK_MODEL=gemini-2.5-flash-lite
OPENAI_API_KEY=your_api_key_here
OPENAI_ANALYSIS_MODEL=gpt-5.5
PORT=8787
MAX_VIDEO_MB=20
OPENAI_MAX_VIDEO_MB=50
DAILY_ANALYSIS_LIMIT=30
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=3
GEMINI_MAX_OUTPUT_TOKENS=1200
GEMINI_EVIDENCE_MAX_OUTPUT_TOKENS=6000
GEMINI_REQUEST_TIMEOUT_MS=120000
GEMINI_EVIDENCE_REQUEST_TIMEOUT_MS=240000
GEMINI_FILE_PROCESSING_TIMEOUT_MS=120000
GEMINI_FILE_PROCESSING_POLL_MS=2000
OPENAI_MAX_OUTPUT_TOKENS=8000
OPENAI_REQUEST_TIMEOUT_MS=240000
OPENAI_VIDEO_FRAME_COUNT=18
OPENAI_FOCUSED_VIDEO_FRAME_COUNT=24
OPENAI_VIDEO_FRAME_WIDTH=1536
OPENAI_REASONING_EFFORT=medium
EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT=http://YOUR_COMPUTER_LAN_IP:8787/api/analyze-session-video
```

`EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT` is not secret. `GEMINI_API_KEY` and
`OPENAI_API_KEY` are secret.

For the 2026-06-12 iPhone standalone preview test, the working local endpoint
was:

```text
EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT=http://10.10.7.17:8787/api/analyze-session-video
```

This IP is machine/network specific. On another computer, find the current LAN
IP and update both `.env.local` and the EAS preview environment variable before
building a new standalone app.

## Run

Use one terminal for the dev analysis server:

```bash
npm run server:dev
```

Confirm from the Mac:

```bash
curl http://127.0.0.1:8787/health
```

Confirm from the iPhone on the same Wi-Fi by opening:

```text
http://YOUR_COMPUTER_LAN_IP:8787/health
```

The response should include:

```json
{
  "ok": true,
  "primaryProvider": "gemini",
  "geminiConfigured": true,
  "geminiModel": "gemini-3.5-flash",
  "openAiBenchmark": {
    "configured": true,
    "model": "gpt-5.5"
  }
}
```

The standalone iPhone app must be rebuilt after changing
`EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT`, because Expo public environment variables
are embedded at build time.

## EAS Preview Environment

For EAS preview/internal distribution builds, verify:

```bash
npx eas-cli@latest env:list --environment preview
```

Set or update the public endpoint if needed:

```bash
npx eas-cli@latest env:create --name EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT --value http://YOUR_COMPUTER_LAN_IP:8787/api/analyze-session-video --environment preview --visibility plaintext
```

If the variable already exists, use the EAS CLI or Expo dashboard to update it
rather than creating a duplicate.

Build a standalone iPhone preview app:

```bash
npx eas-cli@latest build --platform ios --profile preview
```

For the user's current iPhone registration:

```text
Device: iphone12 mini
UDID: 00008101-000404943640001E
Apple Team ID: L339A3KKLC
Expo account: jspark88
EAS project ID: f6e1a90a-62fb-4485-9434-ca92a756b8f4
```

## Current Server Guardrails

The development server applies these limits by default:

- Gemini max video size: 20 MB
- OpenAI benchmark max video size: 50 MB
- Daily analysis limit: 3 requests
- Rate limit: 3 requests per minute
- Gemini max model output: 1200 tokens
- Gemini request timeout: 120 seconds
- OpenAI max model output: 8000 tokens
- OpenAI request timeout: 240 seconds
- OpenAI broad sampled video frames: 18
- OpenAI focused sampled video frames: 24
- OpenAI sampled frame width: 1536 px
- OpenAI reasoning effort: medium
- Allowed MIME types: `video/mp4`, `video/quicktime`, `video/x-m4v`, `video/mov`

These limits are local development safeguards. Account-level billing controls
are still the final spend protection.

## Current Mobile Behavior

- The mobile app does not contain Gemini or OpenAI API keys.
- The mobile app only calls `EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT`.
- The mobile mock AI analysis fallback has been removed.
- If the endpoint is missing from the app build, coaching requests are disabled or
  returns a configuration error.
- Added Sessions are persisted on-device with AsyncStorage until a real database
  is introduced.
- `/api/analyze-session-video` remains the Gemini-backed app-facing endpoint.
- `/api/benchmarks/openai-wakeboard-video` is the parallel OpenAI GPT-5.5
  wakeboard benchmark endpoint.
- The OpenAI benchmark first samples broad frames from the uploaded video, asks
  GPT-5.5 to identify candidate trick/highlight windows, then samples focused
  frames inside those windows for the coaching response.
- Successful OpenAI benchmark responses are saved locally under
  `dev-artifacts/openai-benchmarks/`, which is ignored by Git.
- The current app UI can request and persist Gemini coaching and GPT benchmark
  coaching per local Session so the two results can be compared on-device.

## Test Procedure

1. Start `npm run server:dev`.
2. Confirm iPhone Safari can open `/health` on the Mac LAN IP.
3. Install the latest EAS preview build.
4. Open the standalone app, not Expo Go.
5. Add a Session with a short video under 20 MB.
6. Save the Session.
7. Open the Session detail.
8. Tap `Gemini 코칭 받기`.
9. Confirm the app renders Gemini-backed Korean feedback.
10. Tap `GPT 코칭 받기` for the same saved Session/video.
11. Compare the app-rendered GPT result and the saved OpenAI JSON artifact with
   the Gemini result.
12. If it fails, inspect the dev-server terminal first. The server logs provider
   request failures with the error message.

## Product Rule

The app must not guess highlight timestamps.

Highlight scenes should be selected by server-side AI analysis and returned as `highlightScenes`.
