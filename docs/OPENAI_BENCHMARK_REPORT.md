# OpenAI Wakeboard Benchmark Report

## Purpose

Determine whether earlier OpenAI wakeboard analysis quality was limited by:

- Prompt quality
- Model selection
- API usage
- Video input implementation
- ChatGPT internal orchestration differences

Do not conclude that OpenAI is inferior until the same wakeboard video has been
tested through the current benchmark path and compared against the Gemini result.

## Current Architecture

The app architecture remains unchanged:

```text
Session
↓
Video
↓
AnalysisResult
```

The mobile app still calls:

```text
POST /api/analyze-session-video
```

That endpoint remains the Gemini-backed development analysis path.

The OpenAI benchmark is parallel and isolated:

```text
POST /api/benchmarks/openai-wakeboard-video
```

The benchmark stores local JSON artifacts under:

```text
dev-artifacts/openai-benchmarks/
```

That directory is intentionally ignored by Git because it may contain private
session/video-derived analysis.

## OpenAI Benchmark Method

The benchmark:

1. Receives the same uploaded wakeboard video as multipart form data.
2. Samples evenly spaced frames with `ffmpeg-static`.
3. Sends those frames to GPT-5.5 through the OpenAI Responses API.
4. Uses a world-class wakeboard coaching prompt.
5. Requires structured JSON and human-readable coaching output.

The prompt explicitly requires:

- Observation: what is actually visible
- Pattern Recognition: repeated visible movement patterns
- Inference: coaching interpretation grounded in observation/patterns
- Confidence values and reasons
- Self-critique
- No uncertain conclusion presented as fact

## Current Status

Implementation is ready for a real benchmark run, but the run has not been
completed in this workspace because the exact comparison video and real local
API keys are not present in Git.

Required local-only inputs:

- `.env.local` with `GEMINI_API_KEY`
- `.env.local` with `OPENAI_API_KEY`
- The exact same wakeboard video previously used for Gemini comparison
- The current Gemini output or a fresh Gemini run of that exact video

## How To Run

Start the server:

```bash
npm run server:dev
```

Confirm health:

```bash
curl http://127.0.0.1:8787/health
```

Expected shape:

```json
{
  "ok": true,
  "primaryProvider": "gemini",
  "geminiConfigured": true,
  "openAiBenchmark": {
    "configured": true,
    "model": "gpt-5.5"
  }
}
```

Run Gemini through the app or by posting the same multipart fields to:

```text
/api/analyze-session-video
```

Run OpenAI benchmark by posting the same multipart fields and same video to:

```text
/api/benchmarks/openai-wakeboard-video
```

## Comparison Criteria

Compare the Gemini output and GPT-5.5 output on:

- Specificity of visible observations
- Whether movement patterns are identified across time
- Whether inference is grounded in evidence
- Whether uncertainty is clearly marked
- Coaching usefulness for the next session
- Wakeboard-specific terminology and cues
- Structured data usefulness for future session comparison

## Recommendation Pending Benchmark

No provider decision should be made yet.

The next decision point is after the exact same video is run through both
Gemini and GPT-5.5 with the current benchmark prompt and saved artifacts are
reviewed side by side.
