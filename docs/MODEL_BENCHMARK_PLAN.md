# Model Benchmark Plan

## Purpose

This benchmark exists to answer one narrow question:

Can current native video understanding models reliably distinguish toe edge from heel edge in wakeboard footage?

The benchmark is not a product feature. It must remain isolated from the app-facing analysis flow.

## Current Decision

Phase 1 will benchmark native video understanding models only.

OpenAI frame extraction is moved to Phase 2 because wakeboard edge judgment depends on short, variable moments. Preselecting frames can introduce frame selection bias and may test the frame picker more than the model.

## Phase 1 Model Priority

### 1. Gemini 2.5 Flash

Use as the current baseline.

Reason:

- Already close to the current production/dev evidence extraction path.
- Native video understanding is available.
- Good speed and cost baseline.

Model id:

```text
gemini-2.5-flash
```

### 2. Gemini 2.5 Pro

Use as the quality comparison model.

Reason:

- Higher-capability Gemini model.
- Native video understanding is available.
- Better candidate for difficult temporal and visual reasoning.

Model id:

```text
gemini-2.5-pro
```

### 3. Available Gemini Native Video Alternative

Use only if available in the current API account and official model list.

Candidates to check at runtime:

- latest stable Gemini video-capable model in the account
- Gemini Flash alternative if listed as native video capable
- Gemini Pro alternative if listed as native video capable

Do not use text-only, image-only, TTS, image generation, or Live API audio models for this benchmark.

## Phase 2: OpenAI Frame-Based Benchmark

OpenAI frame-based vision benchmark is useful, but not part of Phase 1.

Reason:

- OpenAI API vision flow is image/frame based for this project.
- Extracted frames introduce frame selection bias.
- Wakeboard edge loading can happen in a very short, video-specific window.
- A wrong frame sampler can make a good model look bad or a bad model look good.

Phase 2 should run only after Phase 1 answers whether native video models can solve the task.

## Dataset

Start small and controlled.

Required clips:

- `ts short`: edge ground truth toe-side clip
- `hs short`: edge ground truth heel-side clip

Recommended expansion:

- 3 toe-edge short clips
- 3 heel-edge short clips
- 2 ambiguous or hard clips

Ground Truth Dataset v1:

```text
dev-artifacts/benchmark-videos/
```

Included clips:

- `ts_regular_1.mov` ~ `ts_regular_3.mov`
- `ts_goofy_1.mov` ~ `ts_goofy_3.mov`
- `hs_regular_1.mov` ~ `hs_regular_3.mov`
- `hs_goofy_1.mov` ~ `hs_goofy_3.mov`

Total:

```text
12 clips
```

The dataset is intentionally small enough to commit to the repository. The
current total size is about 16.9MB and the clips do not contain known sensitive
information.

Each clip should have a human label:

```ts
type EdgeGroundTruth = {
  clipId: string;
  expectedEdge: 'toe' | 'heel' | 'unknown';
  labelConfidence: 'high' | 'medium' | 'low';
  labelNotes: string;
};
```

## Benchmark Output Shape

Each model run should produce a normalized result independent of product analysis.

```ts
type EdgeBenchmarkResult = {
  clipId: string;
  expectedEdge: 'toe' | 'heel' | 'unknown';
  provider: 'gemini';
  model: string;
  runIndex: number;
  predictedEdge: 'toe' | 'heel' | 'unknown' | 'ambiguous';
  confidence: 'high' | 'medium' | 'low';
  edgeDirectionEvidence: {
    value: string;
    confidence: 'high' | 'medium' | 'low';
    evidence: string;
  };
  edgeLoadObservedFacts: {
    toeEdgeLoaded: unknown;
    heelEdgeLoaded: unknown;
    edgeLoadVisible: unknown;
    edgeLoadTiming: unknown;
    boardTiltDirection: unknown;
    sprayDirection: unknown;
    riderWeightOverEdge: unknown;
    edgeLoadConfidence: 'high' | 'medium' | 'low';
    edgeLoadEvidenceText: string;
    antiEdgeLoadEvidence: string[];
  };
  validation: {
    rejectedHighConfidenceReasons: string[];
    hallucinationFlags: string[];
    visibleEvidenceCount: number;
  };
  latencyMs: number;
  estimatedCost: number | null;
  rawResponseArtifactPath: string;
};
```

## Evaluation Metrics

### Toe/Heel Accuracy

Primary metric:

```text
correct predictedEdge / total clips
```

Track separately:

- toe clips accuracy
- heel clips accuracy
- ambiguous/unknown rate

### High-Confidence Error Rate

Most important safety metric:

```text
wrong predictions with confidence=high
```

High-confidence wrong answers are worse than unknown.

### Evidence Quality

Score each run:

- board tilt described with timestamp
- spray tied to a specific board edge
- rider weight described as visible, not inferred
- body orientation not used as edge load proof
- anti evidence populated when uncertain

### Hallucination Frequency

Flag:

- timestamp exists but does not match visible evidence
- spray described without visible edge source
- board tilt described from travel direction only
- rider weight inferred from chest/back orientation
- edge label repeated across multiple fields without independent details

### Confidence Reliability

Check whether confidence matches evidence quality:

- high requires timestamped physical evidence
- medium requires at least one visible physical clue
- low for label-only or inferred claims

### Cost

Estimate per provider/model from logged token usage when available.

If exact token usage is unavailable, record:

- input video duration
- model
- response tokens
- API reported usage if present
- estimated cost as null until reliable

### Latency

Measure server-side request duration:

```text
Date.now() before model call
Date.now() after model response parsed
```

## Minimal Implementation Plan

Keep this dev-only.

### Step 1: Benchmark Prompt

Create a separate prompt that asks only for edge judgment.

Do not ask for:

- trick name
- family
- coaching
- session summary
- share cards
- taxonomy gate

Prompt should ask:

- toe or heel edge
- visible physical evidence
- timing
- anti evidence
- uncertainty

### Step 2: Dev-Only Runner

Add one isolated endpoint or script.

Implemented dev-only endpoint:

```text
POST /debug/benchmarks/edge-native-video
```

Rules:

- disabled in production
- requires debug token if debug capture is enabled
- accepts multipart video
- accepts `expectedEdge`
- accepts `clipId`
- accepts `benchmarkMode` or `mode`
- accepts `models[]` or comma-separated `models`
- `benchmarkMode=smoke` runs 1 repeat
- `benchmarkMode=full` runs 3 repeats
- defaults to `gemini-2.5-flash,gemini-2.5-pro`
- writes only local artifacts under `dev-artifacts/model-benchmarks/`

Alternative lower-risk first step:

```text
scripts/run-edge-model-benchmark.mjs
```

The product analysis flow remains untouched; the benchmark route is isolated
under `/debug`.

### Step 3: Gemini Runner

Use existing Gemini upload and request helpers where possible.

Run:

- `gemini-2.5-flash`
- `gemini-2.5-pro`
- optional native video model discovered from env/config

Do not change the app-facing Gemini evidence extraction path.

### Step 4: Artifact Storage

Store local-only output:

```text
dev-artifacts/model-benchmarks/
```

One file per model run:

```text
YYYY-MM-DD-HH-mm-ss-{benchmarkMode}-{clipId}-{model}-run-{n}.json
```

Summary file:

```text
summary-{YYYY-MM-DD-HH-mm-ss}-{benchmarkMode}-{clipId}.json
```

### Step 5: Summary Script

Create a simple summary command:

```text
npm run benchmark:edge:summary
```

It should compute:

- smoke/full grouping
- accuracy by model
- high-confidence wrong count
- unknown/ambiguous rate
- average latency
- hallucination flags count
- average evidence quality score

Example request:

```bash
curl -X POST http://127.0.0.1:8787/debug/benchmarks/edge-native-video \
  -F "video=@/absolute/path/to/clip.mov" \
  -F "clipId=ts-short" \
  -F "expectedEdge=toe" \
  -F "benchmarkMode=smoke" \
  -F "models=gemini-2.5-flash"
```

Full example:

```bash
curl -X POST http://127.0.0.1:8787/debug/benchmarks/edge-native-video \
  -F "video=@/absolute/path/to/clip.mov" \
  -F "clipId=ts-short" \
  -F "expectedEdge=toe" \
  -F "benchmarkMode=full" \
  -F "runCount=3" \
  -F "models=gemini-2.5-flash,gemini-2.5-pro"
```

## Benchmark Modes

### Smoke

Use smoke mode before full mode.

```text
benchmarkMode=smoke
runCount=1
```

Total:

```text
12 clips x 1 run = 12 requests per model
```

This fits under the current Gemini 2.5 Flash free tier daily request limit of 20
requests, assuming no other same-day Flash calls have already consumed the
quota.

### Full

Use full mode only after smoke mode is useful.

```text
benchmarkMode=full
runCount=3
```

Total:

```text
12 clips x 3 runs = 36 requests per model
```

This cannot complete in one day on the current Gemini 2.5 Flash free tier daily
limit of 20 requests. Split across days or use a key/project with higher quota.

## Recommended Dataset Smoke Run

Run all 12 Ground Truth Dataset v1 clips with Gemini 2.5 Flash first.

Example shell loop:

```bash
for clip in \
  ts_regular_1 ts_regular_2 ts_regular_3 \
  ts_goofy_1 ts_goofy_2 ts_goofy_3 \
  hs_regular_1 hs_regular_2 hs_regular_3 \
  hs_goofy_1 hs_goofy_2 hs_goofy_3
do
  expectedEdge=toe
  case "$clip" in hs_*) expectedEdge=heel ;; esac

  curl -X POST http://127.0.0.1:8787/debug/benchmarks/edge-native-video \
    -F "video=@dev-artifacts/benchmark-videos/${clip}.mov;type=video/quicktime" \
    -F "clipId=${clip}" \
    -F "expectedEdge=${expectedEdge}" \
    -F "benchmarkMode=smoke" \
    -F "models=gemini-2.5-flash"

  sleep 15
done
```

The `sleep 15` keeps the run below the observed Gemini Flash free tier
per-minute limit.

## Decision Rules

### Model Passes Phase 1

A model is viable for edge extraction if:

- no high-confidence wrong answers on the first ground-truth set
- accuracy is meaningfully above current baseline
- anti evidence appears when confidence is low
- timestamped evidence is plausible

### Model Fails Phase 1

A model is not viable if:

- it flips `ts short` and `hs short`
- it produces high-confidence wrong edge labels
- it invents board tilt/spray evidence repeatedly
- confidence remains high despite validation warnings

## Current Recommendation

Run Phase 1 with Gemini native video models first.

Do not spend more time tuning OpenAI frame extraction until native video model limits are understood.

If Gemini 2.5 Pro also fails short ground-truth clips, the next bottleneck is likely not prompt wording. It is either:

- model-level visual limitation for wakeboard edge interpretation
- ambiguous camera angle / insufficient video quality
- need for human-labeled frame references
- need for a specialized vision pipeline instead of general VLM-only extraction

## Non-Goals

Do not change:

- app-facing analysis flow
- Moment status logic
- taxonomy gate
- Supabase schema
- UI
- production backend behavior
- OpenAI frame benchmark implementation

## Sources

- Gemini model list: https://ai.google.dev/gemini-api/docs/models
- Gemini video understanding: https://developers.googleblog.com/en/gemini-2-5-video-understanding/
- Gemini API pricing: https://ai.google.dev/gemini-api/docs/pricing
- OpenAI Responses API overview: https://developers.openai.com/api/reference/responses/overview/
- OpenAI video understanding cookbook using frames: https://developers.openai.com/cookbook/examples/gpt_with_vision_for_video_understanding
