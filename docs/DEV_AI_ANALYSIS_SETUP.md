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
OPENAI_ANALYSIS_MODEL=gpt-5.4-mini
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

## Run

Use one terminal for the dev analysis server:

```bash
npm run server:dev
```

Use another terminal for Expo:

```bash
npx expo start --tunnel --port 8082
```

Restart Expo after changing `EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT`.

## Current Server Guardrails

The development server applies these limits by default:

- Max video size: 20 MB
- Daily analysis limit: 3 requests
- Rate limit: 3 requests per minute
- Max model output: 600 tokens
- Request timeout: 120 seconds
- Allowed MIME types: `video/mp4`, `video/quicktime`, `video/x-m4v`, `video/mov`

These limits are local development safeguards. The OpenAI Platform monthly budget is still the account-level protection.

## Product Rule

The app must not guess highlight timestamps.

Highlight scenes should be selected by server-side AI analysis and returned as `highlightScenes`.
