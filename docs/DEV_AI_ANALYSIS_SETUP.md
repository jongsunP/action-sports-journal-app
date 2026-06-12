# Development AI Analysis Setup

## Goal

Enable real OpenAI-backed analysis during solo development while keeping API spend under KRW 10,000/month.

## User-Owned Setup

These steps must be done in the user's OpenAI Platform account:

1. Open `https://platform.openai.com/usage` to monitor API usage.
2. Open `https://platform.openai.com/settings/organization/billing` to manage API billing.
3. Set a monthly API budget around `$5-$7` while testing alone.
4. Create an API key in OpenAI Platform.
5. Store the key only in local `.env.local`.

Do not paste API keys into chat, source files, docs, GitHub, or Expo public env vars.

## Local `.env.local`

Create this file locally:

```bash
cp .env.example .env.local
```

Then fill:

```text
OPENAI_API_KEY=your_api_key_here
OPENAI_ANALYSIS_MODEL=gpt-5-mini
PORT=8787
MAX_VIDEO_MB=20
DAILY_ANALYSIS_LIMIT=3
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=3
OPENAI_MAX_OUTPUT_TOKENS=600
OPENAI_REQUEST_TIMEOUT_MS=120000
EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT=http://YOUR_COMPUTER_LAN_IP:8787/api/analyze-session-video
```

`EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT` is not secret. `OPENAI_API_KEY` is secret.

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
  "openAiConfigured": true
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

- Max video size: 20 MB
- Daily analysis limit: 3 requests
- Rate limit: 3 requests per minute
- Max model output: 600 tokens
- Request timeout: 120 seconds
- Allowed MIME types: `video/mp4`, `video/quicktime`, `video/x-m4v`, `video/mov`

These limits are local development safeguards. The OpenAI Platform monthly budget is still the account-level protection.

## Current Mobile Behavior

- The mobile app does not contain the OpenAI API key.
- The mobile app only calls `EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT`.
- The mobile mock AI analysis fallback has been removed.
- If the endpoint is missing from the app build, `AI 체크하기` is disabled or
  returns a configuration error.
- Added Sessions are persisted on-device with AsyncStorage until a real database
  is introduced.

## Test Procedure

1. Start `npm run server:dev`.
2. Confirm iPhone Safari can open `/health` on the Mac LAN IP.
3. Install the latest EAS preview build.
4. Open the standalone app, not Expo Go.
5. Add a Session with a short video under 20 MB.
6. Save the Session.
7. Tap `AI 체크하기`.
8. Confirm the app renders Korean feedback.
9. If it fails, inspect the dev-server terminal first. The server logs
   `Analysis request failed:` with the error message.

## Product Rule

The app must not guess highlight timestamps.

Highlight scenes should be selected by server-side AI analysis and returned as `highlightScenes`.
