# Model Benchmark Report 2026-06-16

## Purpose

Compare Gemini 2.5 Flash and Gemini 2.5 Pro on native video Toe/Heel edge
classification for the wakeboard Ground Truth Dataset v1.

This benchmark is dev-only. It does not affect the product analysis flow and
does not write to Supabase.

## Execution Conditions

Mode:

```text
smoke
```

Runs:

```text
1 run per clip
```

Models:

```text
gemini-2.5-flash
gemini-2.5-pro
```

Artifacts:

```text
dev-artifacts/model-benchmarks/flash-smoke-ground-truth-2026-06-16/
dev-artifacts/model-benchmarks/pro-smoke-ground-truth-2026-06-16/
```

Summary command:

```bash
MODEL_BENCHMARK_ARTIFACT_DIR=dev-artifacts/model-benchmarks/flash-smoke-ground-truth-2026-06-16 npm run benchmark:edge:summary
MODEL_BENCHMARK_ARTIFACT_DIR=dev-artifacts/model-benchmarks/pro-smoke-ground-truth-2026-06-16 npm run benchmark:edge:summary
```

## Dataset

Location:

```text
dev-artifacts/benchmark-videos/
```

Composition:

| Group | Clips |
| --- | ---: |
| Total | 12 |
| Toe | 6 |
| Heel | 6 |
| Regular | 6 |
| Goofy | 6 |
| Regular Toe | 3 |
| Regular Heel | 3 |
| Goofy Toe | 3 |
| Goofy Heel | 3 |

Clip groups:

- `ts_regular_1.mov` ~ `ts_regular_3.mov`
- `ts_goofy_1.mov` ~ `ts_goofy_3.mov`
- `hs_regular_1.mov` ~ `hs_regular_3.mov`
- `hs_goofy_1.mov` ~ `hs_goofy_3.mov`

## Flash Results

Model:

```text
gemini-2.5-flash
```

| Metric | Result |
| --- | ---: |
| Overall accuracy | 10/12 (83.3%) |
| Toe accuracy | 5/6 (83.3%) |
| Heel accuracy | 5/6 (83.3%) |
| Regular accuracy | 6/6 (100.0%) |
| Goofy accuracy | 4/6 (66.7%) |
| Regular Toe accuracy | 3/3 (100.0%) |
| Regular Heel accuracy | 3/3 (100.0%) |
| Goofy Toe accuracy | 2/3 (66.7%) |
| Goofy Heel accuracy | 2/3 (66.7%) |
| High-confidence wrong | 1 |
| Unknown or ambiguous | 1 |
| Hallucination flags | 1 |
| Average latency | 6377ms |
| Average evidence quality score | 3.75 |

Flash failed or degraded on two Goofy clips:

| Clip | Expected | Predicted | Confidence | Notes |
| --- | --- | --- | --- | --- |
| `ts_goofy_3` | toe | unknown | low | Invalid JSON response, counted as hallucination flag |
| `hs_goofy_2` | heel | toe | high | High-confidence wrong |

## Pro Results

Model:

```text
gemini-2.5-pro
```

| Metric | Result |
| --- | ---: |
| Overall accuracy | 12/12 (100.0%) |
| Toe accuracy | 6/6 (100.0%) |
| Heel accuracy | 6/6 (100.0%) |
| Regular accuracy | 6/6 (100.0%) |
| Goofy accuracy | 6/6 (100.0%) |
| Regular Toe accuracy | 3/3 (100.0%) |
| Regular Heel accuracy | 3/3 (100.0%) |
| Goofy Toe accuracy | 3/3 (100.0%) |
| Goofy Heel accuracy | 3/3 (100.0%) |
| High-confidence wrong | 0 |
| Unknown or ambiguous | 0 |
| Hallucination flags | 0 |
| Average latency | 12688ms |
| Average evidence quality score | 4.42 |

Pro was 100% accurate on this smoke dataset.

## Flash vs Pro

| Metric | Gemini 2.5 Flash | Gemini 2.5 Pro |
| --- | ---: | ---: |
| Overall accuracy | 83.3% | 100.0% |
| Toe accuracy | 83.3% | 100.0% |
| Heel accuracy | 83.3% | 100.0% |
| Regular accuracy | 100.0% | 100.0% |
| Goofy accuracy | 66.7% | 100.0% |
| Regular Toe accuracy | 100.0% | 100.0% |
| Regular Heel accuracy | 100.0% | 100.0% |
| Goofy Toe accuracy | 66.7% | 100.0% |
| Goofy Heel accuracy | 66.7% | 100.0% |
| High-confidence wrong | 1 | 0 |
| Unknown or ambiguous | 1 | 0 |
| Hallucination flags | 1 | 0 |
| Average latency | 6377ms | 12688ms |

## High-Confidence Wrong

Flash produced one high-confidence wrong answer:

```text
hs_goofy_2
expected: heel
predicted: toe
confidence: high
```

This is the most important safety issue in the Flash result. A high-confidence
wrong edge label is more dangerous than an `unknown` result because downstream
analysis could trust the incorrect edge direction.

Pro produced no high-confidence wrong answers in this smoke run.

## Latency

| Model | Average Latency |
| --- | ---: |
| Gemini 2.5 Flash | 6377ms |
| Gemini 2.5 Pro | 12688ms |

Pro was about 2x slower than Flash on this dataset.

## Goofy Stability

Flash was stable on Regular clips but weaker on Goofy clips.

| Model | Regular Accuracy | Goofy Accuracy |
| --- | ---: | ---: |
| Gemini 2.5 Flash | 100.0% | 66.7% |
| Gemini 2.5 Pro | 100.0% | 100.0% |

Flash issues:

- `ts_goofy_3`: invalid JSON response, returned `unknown/low`
- `hs_goofy_2`: predicted `toe/high` for a heel clip

This suggests stance and camera/rider frame interpretation may still be a
failure point for Flash.

## Product Implications

Flash is fast and cheaper, but this benchmark shows an edge classification risk.
It may be acceptable for low-stakes draft extraction, but it should not be the
only source for user-visible or persisted high-confidence Toe/Heel claims.

Pro is slower, but it was clearly stronger on this smoke dataset. It reached
100% accuracy across Toe, Heel, Regular, and Goofy clips with no
high-confidence wrong answers.

Potential product routing:

- Use Flash for fast first-pass extraction when speed/cost matters.
- Escalate to Pro when edge evidence is central to the result.
- Escalate to Pro for Goofy clips or whenever Flash returns low confidence,
  invalid JSON, ambiguous/unknown, or high-impact edge-dependent analysis.
- Keep validation rules that downgrade or review high-confidence edge claims
  when physical evidence is weak.

## Conclusion

Flash is fast and cost-efficient, but edge judgment still has reliability risk.
The main concern is not only lower accuracy; it is the presence of a
high-confidence wrong answer.

Pro is slower, but its edge judgment reliability was excellent on this smoke
dataset. The next step is either:

1. run the full benchmark with 3 runs per clip, or
2. design a hybrid routing strategy where Flash handles low-risk cases and Pro
   handles edge-critical or uncertain cases.
