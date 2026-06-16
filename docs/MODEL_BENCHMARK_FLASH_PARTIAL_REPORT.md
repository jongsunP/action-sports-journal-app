# Gemini 2.5 Flash Edge Benchmark Partial Report

## Scope

This report records the partial Gemini 2.5 Flash native video benchmark run for
the wakeboard Toe/Heel edge ground truth dataset.

Date:

```text
2026-06-16
```

Artifact directory:

```text
dev-artifacts/model-benchmarks/flash-ground-truth-2026-06-16/
```

Model:

```text
gemini-2.5-flash
```

Runner:

```text
POST /debug/benchmarks/edge-native-video
```

The product analysis flow was not changed. Results were written only to
`dev-artifacts`.

## Execution Range

Completed:

| Clip | Expected Edge | Runs |
| --- | --- | ---: |
| `ts_short_1.mov` | toe | 3 |
| `ts_short_2.mov` | toe | 3 |
| `ts_short_3.mov` | toe | 3 |
| `ts_short_4.mov` | toe | 3 |

Not completed:

| Clip | Expected Edge | Reason |
| --- | --- | --- |
| `hs_short_1.mov` | heel | Gemini Flash daily quota reached |
| `hs_short_2.mov` | heel | Gemini Flash daily quota reached |
| `hs_short_3.mov` | heel | Gemini Flash daily quota reached |
| `hs_short_4.mov` | heel | Gemini Flash daily quota reached |

The remaining heel clips were not executed because the API returned:

```text
429 RESOURCE_EXHAUSTED
GenerateRequestsPerDayPerProjectPerModel-FreeTier
model: gemini-2.5-flash
limit: 20
```

## Toe Results

| Clip | Runs | Correct | Accuracy | Predictions | High-Confidence Wrong |
| --- | ---: | ---: | ---: | --- | ---: |
| `ts_short_1` | 3 | 1 | 33.3% | `heel/high`, `heel/high`, `toe/high` | 2 |
| `ts_short_2` | 3 | 3 | 100% | `toe/high`, `toe/high`, `toe/high` | 0 |
| `ts_short_3` | 3 | 0 | 0% | `heel/high`, `heel/high`, `heel/high` | 3 |
| `ts_short_4` | 3 | 2 | 66.7% | `heel/high`, `toe/high`, `toe/high` | 1 |

## Partial Summary

| Metric | Result |
| --- | ---: |
| Total completed runs | 12 |
| Toe completed runs | 12 |
| Heel completed runs | 0 |
| Overall accuracy on completed runs | 50% |
| Toe accuracy | 50% |
| High-confidence wrong count | 6 |
| Unknown or ambiguous count | 0 |
| Hallucination flag count | 0 |
| Average latency | 6037ms |

Heel accuracy was not measured in this run because `hs_short_1~4` were blocked
by quota before successful execution.

Regular and Goofy accuracy were also not measured because the dataset directory
does not currently include a stance manifest.

## Confidence Reliability

The completed run shows a clear confidence reliability problem.

All 12 completed predictions returned `confidence = high`, but only 6 of 12 were
correct. The model did not use `unknown`, `ambiguous`, `medium`, or `low` even
when the final prediction was wrong.

This means high confidence is not currently reliable enough to use as a product
decision signal for Toe/Heel edge classification.

## Evidence Quality Concern

`hallucinationFlags` were always empty.

However, the evidence text itself is suspicious in the wrong runs. The model
often described physical evidence such as:

- board tilted onto the heel edge
- spray from the heel side
- body leaning back
- rider weight over the heel edge

Those claims were produced even when the ground truth was toe edge. In practice,
the model appears to convert its edge label into confident-looking physical
evidence without marking the uncertainty as hallucination risk.

This is especially visible in `ts_short_3`, where all 3 runs predicted
`heel/high` and all 3 were wrong.

## Current Interpretation

Gemini 2.5 Flash can sometimes identify toe edge correctly, but the partial
dataset shows instability across similar short clips.

The main issue is not only accuracy. The more serious issue is that wrong
predictions are frequently high-confidence wrong predictions.

For this benchmark, a high-confidence wrong answer is worse than `unknown` or
`ambiguous` because it would make downstream product logic trust a false edge
reading.

## Remaining Work

1. Run `hs_short_1~4` after Gemini Flash quota resets.
2. Add a stance manifest so Regular / Goofy accuracy can be measured.
3. Secure Gemini 2.5 Pro quota and rerun the same dataset for direct Flash vs
   Pro comparison.
4. After heel clips are complete, recompute:
   - overall accuracy
   - toe accuracy
   - heel accuracy
   - Regular accuracy
   - Goofy accuracy
   - high-confidence wrong rate
   - confidence reliability
   - hallucination and suspicious-evidence patterns
