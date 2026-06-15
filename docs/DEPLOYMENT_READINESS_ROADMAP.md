# Deployment Readiness Roadmap

## Goal

Make Action Sports Journal usable as a standalone installed iPhone app outside
the local Mac/LAN development environment.

The product does not need to be complete. It must be usable.

Status as of 2026-06-14: this milestone has been reached for the preview
internal-distribution path.

## Recommended Path

```text
iOS app: EAS preview internal distribution
Backend: Render Web Service
AI keys: Render environment variables only
App config: public HTTPS backend endpoint only
Storage: AsyncStorage for now
Database/cloud video storage: not yet
```

This is the shortest path from:

```text
works on my computer
```

to:

```text
installed and usable on my iPhone anywhere
```

## Current Architecture Audit

### Frontend

- Expo React Native app.
- First screen: `src/features/sessions/HomeScreen.tsx`.
- Local sessions, selected videos, AI results, user-confirmed tricks, and
  thumbnail URIs are persisted with AsyncStorage.
- Video selection uses `expo-image-picker`.
- Detail video playback uses `expo-video`.
- The app reads one public endpoint:
  `EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT`.
- The app derives related endpoints from that value:
  - `/api/analyze-session-video`
  - `/api/extract-session-evidence`
  - `/api/create-session-thumbnail`
  - `/api/benchmarks/openai-wakeboard-video`

### Backend

- Current server entry: `dev-server/index.ts`.
- Runtime: Express + TypeScript through `tsx`.
- Deployed Render URL:
  `https://action-sports-journal-api.onrender.com`.
- Required app-facing endpoints:
  - `GET /health`
  - `POST /api/analyze-session-video`
  - `POST /api/extract-session-evidence`
  - `POST /api/create-session-thumbnail`
- Development benchmark endpoint:
  - `POST /api/benchmarks/openai-wakeboard-video`
- Server accepts video uploads through multipart form data.
- Gemini video analysis uploads the received video to Gemini from server-side
  code.
- Thumbnail generation and OpenAI benchmark frame extraction depend on
  `ffmpeg-static`.
- The server uses in-memory rate and daily usage limits. This is acceptable for
  personal early testing, but not enough for production abuse protection.

### AI Keys

- Gemini and OpenAI keys must exist only on the backend host.
- Do not put AI keys in Expo public env vars, `app.json`, source files, docs,
  GitHub, or the mobile app bundle.
- Gemini API key was rotated and updated in Render and local `.env.local`
  without exposing key values.
- The previous `API_KEY_INVALID` issue is fixed.

### Storage

- Current persistence is local-only AsyncStorage on the iPhone.
- This is acceptable for personal early usage.
- Limitations:
  - no cross-device sync
  - no backup after app deletion
  - no cloud video archive
  - no server-side user history

### Database And Cloud Video Storage

Not required for the first standalone usable app.

Add later only when the product needs:

- account identity
- multi-device sync
- historical backup
- cloud video replay
- shareable links
- server-side progression history

## What Prevents Independent Usage Today

Historical blocker: the standalone build could run on the iPhone, but AI and
thumbnail features depended on a local Mac/LAN endpoint such as:

```text
http://YOUR_COMPUTER_LAN_IP:8787/api/analyze-session-video
```

That works only when:

- the Mac is on
- the dev server is running
- the iPhone is on the same network
- the LAN IP has not changed

Resolved: the EAS preview build now points to a stable public HTTPS Render
backend.

## Render Web Service Plan

Use Render as the first backend host.

### Service Type

```text
Render Web Service
```

### Source

```text
GitHub repository: jongsunP/action-sports-journal-app
Branch: master
```

### Runtime

Node.

### Build Command

```bash
npm install
```

### Start Command

```bash
npm run server:start
```

### Health Check Path

```text
/health
```

Current health URL:

```text
https://action-sports-journal-api.onrender.com/health
```

Confirmed:

```text
ok: true
geminiConfigured: true
geminiEvidence.configured: true
```

### Port

Render provides `PORT`. The server reads `process.env.PORT`.

The server also defaults to:

```text
HOST=0.0.0.0
```

so it can receive external traffic in hosted environments.

## Required Render Environment Variables

Minimum required for app-facing Gemini analysis:

```text
GEMINI_API_KEY=
GEMINI_ANALYSIS_MODEL=gemini-2.5-flash
GEMINI_FALLBACK_MODEL=gemini-2.5-flash-lite
HOST=0.0.0.0
MAX_VIDEO_MB=20
DAILY_ANALYSIS_LIMIT=30
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=3
GEMINI_MAX_OUTPUT_TOKENS=1200
GEMINI_EVIDENCE_MAX_OUTPUT_TOKENS=6000
GEMINI_REQUEST_TIMEOUT_MS=120000
GEMINI_EVIDENCE_REQUEST_TIMEOUT_MS=240000
GEMINI_FILE_PROCESSING_TIMEOUT_MS=120000
GEMINI_FILE_PROCESSING_POLL_MS=2000
```

Optional development benchmark variables:

```text
OPENAI_API_KEY=
OPENAI_ANALYSIS_MODEL=gpt-5.5
OPENAI_MAX_VIDEO_MB=50
OPENAI_MAX_OUTPUT_TOKENS=8000
OPENAI_REQUEST_TIMEOUT_MS=240000
OPENAI_VIDEO_FRAME_COUNT=18
OPENAI_FOCUSED_VIDEO_FRAME_COUNT=24
OPENAI_VIDEO_FRAME_WIDTH=1536
OPENAI_REASONING_EFFORT=medium
```

For the first standalone usable app, OpenAI benchmark can remain unset.

## EAS Preview Endpoint Configuration

EAS preview is configured with:

```text
EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT=https://action-sports-journal-api.onrender.com/api/analyze-session-video
```

This value is public. It is safe to be embedded in the mobile app.

AI keys are not public and must not use the `EXPO_PUBLIC_` prefix.

Check current EAS preview environment variables:

```bash
npx eas-cli@latest env:list --environment preview
```

Create or update the endpoint if it ever changes:

```bash
npx eas-cli@latest env:create \
  --name EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT \
  --value https://action-sports-journal-api.onrender.com/api/analyze-session-video \
  --environment preview \
  --visibility plaintext
```

If the variable already exists, update it in the Expo dashboard or with the
current EAS CLI workflow instead of creating a duplicate.

## EAS Preview Build

Build the standalone iPhone app:

```bash
npx eas-cli@latest build --platform ios --profile preview
```

Install the internal distribution build on the registered iPhone.

The installed app should be tested outside the local Mac/LAN environment.

Confirmed installed app state:

- Installed through EAS preview/internal distribution.
- Not Expo Go.
- Not TestFlight.
- Not App Store.
- Runs without the local Mac server.
- Uses Render for thumbnail generation and Gemini evidence/coaching requests.

## Validation Checklist

### Local Baseline

```bash
git status --short --branch
npm run typecheck
```

### Backend

```bash
npm run server:start
curl http://127.0.0.1:8787/health
```

After Render deploy:

```bash
curl https://YOUR-RENDER-SERVICE.onrender.com/health
```

Expected:

```text
ok: true
geminiConfigured: true
```

Also verify:

```text
geminiEvidence.configured: true
```

### iPhone

1. Install the EAS preview internal distribution app.
2. Turn off the local Mac dev server.
3. Leave the local Wi-Fi or test on cellular.
4. Open Action Sports Journal.
5. Add a new moment.
6. Select a short video under the configured size limit.
7. Save the moment.
8. Reopen the app and confirm the moment remains through AsyncStorage.
9. Open detail.
10. Confirm thumbnail generation works when the backend is reachable.
11. Request Gemini evidence/coaching.
12. Confirm Korean AI feedback renders in the app.

Current validation notes:

- Thumbnail generation works through Render.
- Evidence extraction works from the standalone app and evidence quality is
  good.
- Coaching request reaches backend/AI, but structured parsing currently needs
  investigation.

## What Remains Manual

- Creating the Render account/service.
- Connecting GitHub to Render.
- Entering Render environment variables.
- Entering or updating the EAS preview endpoint.
- Running the EAS iOS preview build.
- Installing the internal distribution build on the iPhone.
- Checking provider billing limits in Gemini/OpenAI accounts.
- Updating rotated AI keys in Render and local ignored env files when needed.

## Not In This Deployment Step

- Database.
- Authentication.
- Phone login.
- Cloud video storage.
- Production video CDN.
- Share links.
- Calendar.
- Expense tracking.
- RAG.
- UI redesign.
- AI behavior changes.

## Current Architecture Status

- Data remains local-first on the iPhone with AsyncStorage.
- Backend is a thin AI gateway plus thumbnail generation server.
- No database yet.
- No login yet.
- No cloud video storage yet.
- No CDN yet.
- AI keys live only in Render environment variables and local ignored env files.
- Future optimization: move thumbnail generation on-device if practical.

## Next Starting Point

1. Investigate the coaching structured parsing failure.
2. Continue Detail Screen QA.
3. Review Progression UX.
4. Keep Feed mostly frozen unless new iPhone QA finds a specific issue.

## Future Database Direction

When local-only storage becomes limiting, add persistence in this order:

1. Server-side Session records.
2. AnalysisResult records.
3. Object storage for original videos and generated thumbnails.
4. User identity/authentication.
5. Multi-device sync and backup.

Until then, AsyncStorage is the simplest correct storage for personal early use.
