# EdgeLoadObservedFacts Prompt Review

## Purpose

EdgeLoadObservedFacts 구조는 `edgeDirectionEvidence`의 라벨 추측과 실제 edge load 물리 근거를 분리하기 위해 추가되었습니다.

최근 테스트에서는 구조 자체는 유용했지만, Gemini가 다음 필드를 실제 물리 증거 없이 high confidence로 채우는 문제가 확인되었습니다.

- `toeEdgeLoaded`
- `heelEdgeLoaded`
- `boardTiltDirection`
- `riderWeightOverEdge`

이 문서는 현재 prompt의 문제를 분석하고, EdgeLoadObservedFacts v2 Prompt 방향을 제안합니다.

코드 변경은 포함하지 않습니다.

## Current Prompt Review

현재 prompt에는 EdgeLoadObservedFacts 관련 규칙이 있습니다.

핵심 문장:

```text
edgeLoadObservedFacts는 edgeDirectionEvidence의 라벨 추측과 실제 edge load 물리 근거를 분리해서 작성하세요.
toeEdgeLoaded/heelEdgeLoaded는 toe edge 또는 heel edge에 실제 하중이 실린 물리 근거가 보일 때만 true로 쓰고, 라벨만 있으면 unknown으로 쓰세요.
edge load 물리 근거는 board tilt, spray, line tension, rider weight over edge 같은 보이는 사실만 사용하세요.
Heelside로 보임, Toeside approach 같은 라벨 echo는 edgeLoadEvidenceText의 물리 근거가 될 수 없습니다.
실제 toe/heel edge loading이 보이지 않으면 edgeLoadConfidence는 low로 쓰세요.
```

방향은 맞습니다. 하지만 모델이 실제로 따라야 할 판정 gate가 충분히 구체적이지 않습니다.

## 1. Current High Confidence Conditions

현재 prompt의 high confidence 조건은 명시적으로 구조화되어 있지 않습니다.

실제로는 다음과 같이 읽힐 수 있습니다.

- board tilt가 보이면 high 가능
- spray가 보이면 high 가능
- line tension이 보이면 high 가능
- rider weight over edge가 보이면 high 가능

문제는 각 필드가 독립 검증 없이 서로를 강화할 수 있다는 점입니다.

예:

```text
heelEdgeLoaded = true
boardTiltDirection = heel edge
sprayDirection = heel edge
riderWeightOverEdge = true
edgeLoadConfidence = high
```

이런 결과가 나와도 실제로는 모두 같은 추정에서 파생된 문장일 수 있습니다. 즉, 독립 물리 근거 4개가 아니라 하나의 라벨 추측이 4개 필드로 복제될 수 있습니다.

## 2. BodyOrientation Leakage

현재 prompt는 `bodyOrientation`을 직접 edge load 근거로 쓰지 말라고 충분히 강하게 금지하지 않습니다.

현재 금지에 가까운 문장:

```text
bodyOrientation은 보조 근거입니다. 가슴/등이 보인다는 사실만으로 힐사이드/토사이드를 확정하지 마세요.
```

이 문장은 Approach 판단에는 효과가 있지만, EdgeLoadObservedFacts에는 부족합니다.

실패 가능성:

- back visible
- facing away
- chest facing boat
- hips toward boat
- body facing direction of travel

이런 bodyOrientation 표현이 모델 내부에서 다음 필드로 새어 들어갈 수 있습니다.

- `heelEdgeLoaded`
- `toeEdgeLoaded`
- `riderWeightOverEdge`
- `boardTiltDirection`

즉, 모델이 "등이 보이니 heelside일 것이다" 또는 "가슴이 보이니 toeside일 것이다"를 edge load 물리 근거처럼 포장할 수 있습니다.

## 3. High Confidence Allowance Problem

현재 prompt는 `edgeLoadConfidence = high`를 허용하는 최소 조건을 세지 않습니다.

필요한 조건:

- board edge contact가 보여야 함
- board tilt가 toe/heel edge 기준으로 보여야 함
- spray가 어느 edge에서 나오는지 보여야 함
- rider weight가 실제로 어느 edge 위에 있는지 보여야 함
- 이 근거들이 finalApproachWindow 안에 있어야 함

현재 prompt는 "보이는 사실만 사용"이라고 말하지만, 다음을 명확히 요구하지 않습니다.

- 보이지 않으면 `unknown`
- 추정이면 `unknown`
- 라벨에서 파생했으면 `low`
- body orientation에서 파생했으면 `antiEdgeLoadEvidence`
- high는 독립 물리 근거 2개 이상 필요

## 4. antiEdgeLoadEvidence Usage

현재 `antiEdgeLoadEvidence`는 prompt에서 적극적으로 사용되지 않습니다.

이 필드는 false positive를 줄이는 핵심입니다.

현재 문제:

- 모델은 true 근거를 채우는 데 집중합니다.
- 보이지 않는 근거를 `antiEdgeLoadEvidence`에 기록하지 않습니다.
- "board tilt is not visible" 같은 부정 근거가 거의 생성되지 않습니다.

원하는 동작:

- board edge가 안 보이면 anti evidence에 기록
- spray가 edge-specific하지 않으면 anti evidence에 기록
- line tension은 보이나 edge load와 연결되지 않으면 anti evidence에 기록
- body orientation만 있으면 anti evidence에 기록
- toe/heel label만 있고 물리 근거가 없으면 anti evidence에 기록

## 5. False Positive Causes

### Cause A: Label Echo Expansion

`edgeDirectionEvidence` 또는 `approachType`의 label이 EdgeLoadObservedFacts 세부 필드로 확장됩니다.

예:

```text
Heelside edge
```

가 다음으로 확장됩니다.

```text
heelEdgeLoaded = true
boardTiltDirection = heel edge
sprayDirection = heel edge
riderWeightOverEdge = true
```

하지만 실제 영상에서 이 네 가지가 독립적으로 보였다는 보장은 없습니다.

### Cause B: Body Orientation As Hidden Proxy

몸이 어느 방향을 향하는지가 edge load로 변환됩니다.

예:

- facing away -> heel edge loaded
- chest facing boat -> toe edge loaded

이 변환은 금지해야 합니다.

### Cause C: Generic Spray Overuse

물보라가 보인다는 사실이 어느 edge에서 발생했는지까지 증명하지 못할 수 있습니다.

`spray visible`은 edge load visible의 약한 근거일 수 있지만, `toeEdgeLoaded=true` 또는 `heelEdgeLoaded=true`의 strong evidence는 아닙니다.

### Cause D: Line Tension Overuse

라인 텐션은 대부분의 접근에서 존재합니다.

라인이 팽팽하다는 사실만으로 toe/heel edge load를 판단할 수 없습니다. 라인 텐션은 board tilt 또는 rider weight와 함께 있을 때만 보조 근거가 됩니다.

### Cause E: Missing Timing Gate

edge load는 finalApproachWindow 또는 takeoff 직전이어야 합니다.

현재 구현 타입에는 `edgeLoadTiming`이 포함되지 않았습니다. prompt에서도 edge load field별 timing을 강제하지 않습니다.

## EdgeLoadObservedFacts v2 Prompt Goals

v2 Prompt의 목표는 다음 두 문장을 분리하는 것입니다.

### Visible

영상에서 직접 보이는 사실입니다.

예:

- board is tilted onto the toe edge
- spray comes from the heel edge during the final cut
- rider's weight is visibly stacked over the heel edge

### Inferred

라벨, 자세, trick expectation, path direction에서 추론한 내용입니다.

예:

- looks heelside
- probably toe edge
- facing away from camera
- moving from right wake to center
- HS Back Roll usually uses heelside

v2에서는 inferred evidence를 EdgeLoadObservedFacts의 true/high 근거로 쓰면 안 됩니다.

## Proposed EdgeLoadObservedFacts v2 Prompt

아래 문장을 기존 prompt의 EdgeLoadObservedFacts 섹션에 추가하는 것을 제안합니다.

```text
EdgeLoadObservedFacts v2 rules:

Separate visible evidence from inferred labels.

For toeEdgeLoaded and heelEdgeLoaded:
- Use true only when the actual board edge contact/load is visible.
- Do not use true from approach label, trick name, expected trick family, body orientation, wake crossing path, or stance.
- If the evidence is "looks toeside/heelside" or only repeats a label, return unknown.
- If the rider's chest/back/hips orientation is the main clue, return unknown and add antiEdgeLoadEvidence.

For boardTiltDirection:
- Describe toe/heel board tilt only if the board edge angle is directly visible.
- Do not convert screen left/right, boat left/right, rider left/right, or travel direction into toe/heel tilt.
- If only the board travel direction is visible, return unknown.

For sprayDirection:
- Use toe/heel spray only if the spray can be tied to a specific board edge during final approach.
- Generic spray, landing spray, or wake spray is not enough.
- If spray is visible but edge source is unclear, return unknown or low.

For lineTensionDirection:
- Rope tension alone is not edge load evidence.
- Use it only as support when paired with visible board tilt or rider weight over a visible edge.
- If rope is simply taut, return unknown.

For riderWeightOverEdge:
- Use true only if rider mass is visibly stacked over a specific toe/heel edge.
- Do not infer riderWeightOverEdge from chest/back orientation alone.
- Do not infer from regular/goofy stance alone.

For edgeLoadConfidence:
- high requires at least two independent visible physical indicators in finalApproachWindow.
- medium requires one clear visible physical indicator.
- low when evidence is label-only, inferred, timing-unclear, or camera-obscured.
- If toeEdgeLoaded and heelEdgeLoaded conflict, set edgeLoadConfidence low and explain in antiEdgeLoadEvidence.

For antiEdgeLoadEvidence:
- Always list missing or blocking evidence.
- Add "board edge angle not visible" if tilt cannot be seen.
- Add "spray not tied to a specific edge" if spray source is unclear.
- Add "body orientation only, not edge load" when chest/back/hips direction is the main clue.
- Add "label-only edge claim" when the evidence repeats Toeside/Heelside without physical proof.
```

## Proposed Output Behavior

### Label-only case

Input-like observation:

```text
Rider appears heelside.
```

Expected:

```json
{
  "toeEdgeLoaded": {
    "value": "unknown",
    "confidence": "low",
    "evidence": "No visible toe edge load."
  },
  "heelEdgeLoaded": {
    "value": "unknown",
    "confidence": "low",
    "evidence": "Heelside is label-only; physical heel edge load is not visible."
  },
  "edgeLoadVisible": {
    "value": "unknown",
    "confidence": "low",
    "evidence": "Board edge contact is not clearly visible."
  },
  "boardTiltDirection": {
    "value": "unknown",
    "confidence": "low",
    "evidence": "Toe/heel board tilt is not visible."
  },
  "sprayDirection": {
    "value": "unknown",
    "confidence": "low",
    "evidence": "Spray is not tied to a specific edge."
  },
  "lineTensionDirection": {
    "value": "unknown",
    "confidence": "low",
    "evidence": "Rope tension alone does not identify edge load."
  },
  "riderWeightOverEdge": {
    "value": "unknown",
    "confidence": "low",
    "evidence": "Rider weight over toe/heel edge is not directly visible."
  },
  "edgeLoadConfidence": "low",
  "edgeLoadEvidenceText": "",
  "antiEdgeLoadEvidence": [
    "label-only edge claim",
    "board edge angle not visible",
    "body orientation is not edge load evidence"
  ]
}
```

### Physical heel edge load case

Expected:

```json
{
  "toeEdgeLoaded": {
    "value": "false",
    "confidence": "medium",
    "evidence": "Toe edge load is not visible in final approach."
  },
  "heelEdgeLoaded": {
    "value": "true",
    "confidence": "high",
    "evidence": "Board is visibly tipped onto heel edge and spray comes from that edge during final approach."
  },
  "edgeLoadVisible": {
    "value": "true",
    "confidence": "high",
    "evidence": "Board tilt and edge-specific spray are visible before takeoff."
  },
  "boardTiltDirection": {
    "value": "heel edge",
    "confidence": "high",
    "evidence": "The board edge angle is visibly on the heel edge."
  },
  "sprayDirection": {
    "value": "heel edge spray",
    "confidence": "medium",
    "evidence": "Spray appears from the heel edge during final cut."
  },
  "lineTensionDirection": {
    "value": "supporting only",
    "confidence": "medium",
    "evidence": "Rope tension supports the visible heel-edge cut but does not decide it alone."
  },
  "riderWeightOverEdge": {
    "value": "heel edge",
    "confidence": "medium",
    "evidence": "Rider mass appears stacked against the loaded heel edge."
  },
  "edgeLoadConfidence": "high",
  "edgeLoadEvidenceText": "Heel edge load is supported by visible board tilt and edge-specific spray in final approach.",
  "antiEdgeLoadEvidence": []
}
```

## Recommendation

The next prompt iteration should be stricter, not broader.

Recommended changes:

1. Add explicit "visible vs inferred" rules.
2. Ban bodyOrientation as a source for edge load fields.
3. Ban wake path and stance as sources for edge load fields.
4. Require independent physical indicators for `edgeLoadConfidence=high`.
5. Require `antiEdgeLoadEvidence` whenever confidence is low or evidence is inferred.
6. Treat spray and line tension as support only unless tied to a visible board edge.
7. Add timing language so edge load evidence must come from finalApproachWindow.

## Open Question

The current implemented type does not include `edgeLoadTiming`, although the design document proposed it.

If false positives continue, adding `edgeLoadTiming` may be necessary so the model must state whether the physical edge-load evidence occurs in:

- finalApproach
- takeoff
- earlierSetup
- landing
- unknown

This would make it easier to reject edge load evidence that happens outside the approach window.
