# ApproachObservedFacts v2

## Purpose

ApproachObservedFacts v2의 목표는 wakeboard 영상에서 Toeside / Heelside 접근 판정 품질을 개선하는 것입니다.

이 문서는 설계 문서입니다. 코드 변경은 포함하지 않습니다.

핵심 원칙:

- 관찰 사실을 먼저 수집하고, 접근 라벨은 나중에 결정합니다.
- trick name, expected family, rotation result에서 approach를 역추론하지 않습니다.
- finalApproachWindow 안의 근거만 approach 판정의 직접 근거로 사용합니다.
- evidence가 충돌하면 강제로 Toeside / Heelside를 고르지 않고 ambiguous 또는 unknown으로 낮춥니다.

## Current Structure

현재 TypeScript 구조는 다음 필드를 사용합니다.

```ts
type ApproachObservedFacts = {
  stance: EvidenceFact;
  leadFoot: EvidenceFact;
  boardDirection: EvidenceFact;
  wakeCrossingPath: {
    startPosition: string;
    takeoffPosition: string;
    landingPosition: string;
    direction: string;
    confidence: EvidenceConfidence;
    evidence: string;
  };
  edgeDirectionEvidence: EvidenceFact;
  handlePosition: EvidenceFact;
  bodyOrientation: EvidenceFact;
};
```

별도로 `ApproachDecision`이 존재합니다.

```ts
type ApproachDecision = {
  value: 'heelside' | 'toeside' | 'switch' | 'unknown';
  confidence: EvidenceConfidence;
  derivedFrom: string[];
  reasoning: string[];
  rejectedAlternatives: Array<{
    value: 'heelside' | 'toeside' | 'switch';
    reason: string;
  }>;
  uncertainty: string[];
};
```

현재 서버 후처리는 `approachObservedFacts`를 normalize한 뒤 `deriveApproachDecision`에서 `approachType`을 다시 파생합니다.

## Current Evidence Usage

### stance

현재 역할:

- supporting fact로 카운트됩니다.
- high confidence 허용 조건 중 하나입니다.
- 단독으로 Toeside / Heelside를 결정하지 않습니다.

위험:

- regular/goofy 판정이 틀리면 leadFoot, boardDirection 해석도 함께 흔들릴 수 있습니다.
- 현재는 stance가 어떤 방향 판정에 어떻게 기여했는지 구조화되어 있지 않습니다.

### leadFoot

현재 역할:

- supporting fact로 카운트됩니다.
- high confidence 허용 조건 중 하나입니다.

위험:

- 카메라 좌우 반전, 후방/측면 촬영, 몸 회전 구간에서 leadFoot이 잘못 잡히면 approach도 흔들립니다.
- leadFoot과 boardDirection의 관계 검증이 없습니다.

### boardDirection

현재 역할:

- supporting fact로 카운트됩니다.
- high confidence 허용 조건 중 하나입니다.

위험:

- board nose direction과 rider travel direction이 섞일 수 있습니다.
- takeoff 직전 보드가 열리거나 닫히는 순간을 approach 전체 방향으로 오해할 수 있습니다.

### wakeCrossingPath

현재 역할:

- startPosition, takeoffPosition, landingPosition, direction, confidence, evidence를 가집니다.
- supporting fact로 카운트됩니다.
- timestamp가 finalApproachWindow 밖이면 high confidence를 막습니다.

위험:

- path direction 자체는 wake의 어느 쪽에서 어느 쪽으로 이동했는지를 말할 뿐, toe edge / heel edge를 직접 증명하지 않습니다.
- 카메라 기준 left/right와 보트 기준 inside/outside가 섞이면 Toeside / Heelside가 뒤집힐 수 있습니다.

### edgeDirectionEvidence

현재 역할:

- 현재 v1의 최종 approach value는 사실상 이 필드에서 파생됩니다.
- `edgeDirectionEvidence` 텍스트에 toeside/toe edge/토사이드 또는 heelside/heel edge/힐사이드가 포함되면 후보가 됩니다.
- 이 필드가 부족하면 raw approachType이 high여도 unknown으로 낮춥니다.

장점:

- trick label에서 approach를 역추론하는 문제를 어느 정도 막습니다.
- edge 근거가 없으면 high confidence를 막는 보수적 구조입니다.

위험:

- 모델이 `edgeDirectionEvidence.value = heelside`처럼 라벨만 반복해도 문자열 기반으로 후보가 될 수 있습니다.
- stance, leadFoot, boardDirection, wakePath가 반대 방향을 지지해도 edgeDirectionEvidence가 우선됩니다.
- edgeDirectionEvidence 자체가 잘못 관찰되면 최종 approach가 바로 틀릴 가능성이 큽니다.

### bodyOrientation

현재 역할:

- 보조 근거로만 사용됩니다.
- bodyOrientation만 있을 경우 uncertainty가 추가됩니다.

장점:

- 가슴/등이 보인다는 사실만으로 Toeside / Heelside를 확정하지 않게 되어 있습니다.

위험:

- 실제로는 handle/body relation이 useful할 수 있지만, 현재 구조에서는 판정 기여도가 낮고 충돌 검증도 약합니다.

## Current Misclassification Risks

### 1. Edge Label Overweight

현재 `ApproachDecision.value`는 `edgeDirectionEvidence`에서 먼저 파생됩니다.

문제:

- edgeDirectionEvidence가 틀리면 다른 evidence가 많아도 최종 value가 틀릴 수 있습니다.
- stance/leadFoot/boardDirection/wakePath는 confidence 조절에는 쓰이지만 value voting에는 충분히 쓰이지 않습니다.

예상 실패:

- 실제 Toeside인데 edgeDirectionEvidence가 Heelside라고 쓰이면 Heelside로 결정될 수 있습니다.
- 실제 Heelside인데 toe edge 라벨이 잘못 들어가면 Toeside로 결정될 수 있습니다.

### 2. Camera Direction Confusion

left/right, near/far, inside/outside, boat direction, camera direction이 분리되어 있지 않습니다.

문제:

- wakeCrossingPath의 direction이 카메라 기준인지 보트/라이더 기준인지 불명확합니다.
- boardDirection도 nose direction인지 travel direction인지 불명확합니다.

### 3. Final Approach vs Earlier Setup

프롬프트는 finalApproachWindow만 쓰라고 요구하지만, 모델 응답은 earlier setup/slalom 정보를 섞을 수 있습니다.

현재 방어:

- timestamp가 finalApproachWindow 밖이면 high confidence를 막습니다.

남은 위험:

- timestamp가 없거나 모호한 문장인데도 edge label이 들어가면 medium으로 살아남을 수 있습니다.

### 4. Stance Chain Not Validated

Toeside / Heelside는 단일 관찰이 아니라 stance, leadFoot, board travel, edge load의 관계입니다.

현재 약점:

- stance와 leadFoot이 서로 맞는지 검증하지 않습니다.
- leadFoot과 boardDirection이 같은 움직임을 설명하는지 검증하지 않습니다.
- wakeCrossingPath와 edgeDirectionEvidence가 같은 takeoff moment를 설명하는지 검증하지 않습니다.

### 5. Label Echo

현재 `approachEvidenceOnlyRepeatsLabel`이 라벨 반복을 경고하지만, 라벨 반복을 완전히 차단하지는 않습니다.

예:

```text
edgeDirectionEvidence.value = "heelside"
edgeDirectionEvidence.evidence = "힐사이드 접근으로 보입니다."
```

이 경우 실제 시각 근거가 부족해도 edgeCandidate가 생길 수 있습니다.

## Current Conflict Handling

현재 충돌 처리는 다음 방식입니다.

- `edgeDirectionEvidence`가 없으면 final value는 `unknown`으로 유지합니다.
- supporting facts가 2개 미만이면 high confidence를 금지합니다.
- stance, leadFoot, boardDirection, edgeDirectionEvidence 중 하나라도 부족하면 high confidence를 금지합니다.
- bodyOrientation만 있으면 uncertainty를 추가합니다.
- timestamp가 finalApproachWindow 밖이면 high confidence를 금지합니다.
- approach high와 toeside mention이 함께 있으면 consistency warning을 만들 수 있습니다.

한계:

- 충돌하는 evidence를 정량적으로 세지 않습니다.
- Toeside 지지 근거와 Heelside 지지 근거를 분리해 비교하지 않습니다.
- 최종 값에 `ambiguous`가 없어, 충돌 상황이 `unknown` 또는 낮은 confidence의 특정 label로 흐를 수 있습니다.

## Need For Ambiguous

`unknown`과 `ambiguous`는 분리하는 것이 좋습니다.

### unknown

의미:

- 관찰 근거가 부족합니다.
- 핵심 필드가 보이지 않거나 timestamp가 없습니다.
- 판단 재료 자체가 없습니다.

예:

- edgeDirectionEvidence가 unknown입니다.
- finalApproachWindow가 low confidence입니다.
- wakeCrossingPath가 보이지 않습니다.

### ambiguous

의미:

- 관찰 근거는 있지만 서로 충돌합니다.
- Toeside와 Heelside를 각각 지지하는 evidence가 동시에 존재합니다.
- 카메라/좌우 기준 때문에 방향 변환이 불확실합니다.

예:

- edgeDirectionEvidence는 heelside인데 wakeCrossingPath와 boardDirection은 toeside를 지지합니다.
- stance/leadFoot은 regular로 보이지만 boardDirection evidence는 goofy/switch처럼 해석됩니다.
- bodyOrientation은 toeside처럼 보이나 edge load는 heel edge처럼 보입니다.

권장:

- v2의 `ApproachDecision.value`에는 `ambiguous`를 추가하는 것이 좋습니다.
- UI에서는 `확인 필요`로 보여주되, 디버그 JSON에는 `ambiguous`를 보존합니다.

## ApproachObservedFacts v2 Design

v2는 기존 필드를 유지하면서, evidence를 decision-ready 형태로 보강하는 방향이 좋습니다.

### Proposed Type

```ts
type ApproachSide = 'heelside' | 'toeside' | 'switch' | 'unknown' | 'ambiguous';

type DirectionFrame = 'boat' | 'camera' | 'rider' | 'unknown';

type ApproachEvidenceSignal = {
  supports: 'heelside' | 'toeside' | 'switch' | 'unknown';
  strength: 'primary' | 'supporting' | 'weak';
  confidence: EvidenceConfidence;
  evidence: string;
  timestampSeconds?: number | null;
};

type ApproachObservedFactsV2 = {
  stance: EvidenceFact;
  leadFoot: EvidenceFact;
  boardDirection: EvidenceFact & {
    frameOfReference: DirectionFrame;
    noseDirection?: string;
    travelDirection?: string;
  };
  wakeCrossingPath: {
    startPosition: string;
    takeoffPosition: string;
    landingPosition: string;
    direction: string;
    frameOfReference: DirectionFrame;
    confidence: EvidenceConfidence;
    evidence: string;
  };
  edgeDirectionEvidence: EvidenceFact & {
    loadedEdge: 'toe_edge' | 'heel_edge' | 'unknown';
  };
  handlePosition: EvidenceFact;
  bodyOrientation: EvidenceFact;
  signals: ApproachEvidenceSignal[];
  conflictSummary: {
    hasConflict: boolean;
    toesideSignals: number;
    heelsideSignals: number;
    conflictFields: string[];
    reason: string;
  };
};
```

### Proposed Decision

```ts
type ApproachDecisionV2 = {
  value: 'heelside' | 'toeside' | 'switch' | 'unknown' | 'ambiguous';
  confidence: EvidenceConfidence;
  primaryEvidence: string[];
  supportingEvidence: string[];
  conflictingEvidence: string[];
  rejectedAlternatives: Array<{
    value: 'heelside' | 'toeside' | 'switch';
    reason: string;
  }>;
  uncertainty: string[];
};
```

## Decision Rules v2

### Rule 1: Edge Is Primary But Not Absolute

`edgeDirectionEvidence.loadedEdge`는 primary evidence입니다.

하지만 다음 경우에는 단독 결정 금지:

- evidence가 label echo입니다.
- timestamp가 finalApproachWindow 밖입니다.
- stance/leadFoot/boardDirection/wakeCrossingPath 중 2개 이상이 반대 방향을 지지합니다.
- loadedEdge가 unknown입니다.

### Rule 2: Vote By Directional Signals

각 필드는 `supports`를 생성합니다.

권장 가중치:

| Field | Weight |
|---|---:|
| edgeDirectionEvidence | 3 |
| wakeCrossingPath | 2 |
| boardDirection | 2 |
| stance + leadFoot relation | 2 |
| handlePosition | 1 |
| bodyOrientation | 1 |

최종 판정:

- 한쪽 점수가 충분히 높고 반대쪽 점수가 낮으면 해당 side.
- 양쪽 점수가 비슷하거나 primary evidence가 충돌하면 ambiguous.
- 총점 자체가 낮으면 unknown.

### Rule 3: Require FinalApproachWindow Alignment

high confidence 조건:

- takeoffTimestamp 존재
- finalApproachWindow confidence가 medium 이상
- edgeDirectionEvidence 또는 wakeCrossingPath가 finalApproachWindow 안 timestamp를 포함
- primary + supporting evidence가 같은 side를 지지

### Rule 4: Separate Camera Direction From Rider Direction

v2는 direction의 기준계를 명시해야 합니다.

- camera frame: 화면 좌/우, 앞/뒤
- boat frame: boat 기준 inside/outside, wake direction
- rider frame: toe edge / heel edge, frontside/backside orientation

Toeside / Heelside 최종 판정은 rider frame의 edge load를 우선합니다.

### Rule 5: Label Echo Guard

다음과 같은 evidence는 약한 신호로만 처리합니다.

```text
"힐사이드로 보입니다."
"toe edge approach"
"toeside wake approach"
```

강한 신호가 되려면 다음 중 하나 이상을 포함해야 합니다.

- 어느 edge가 물에 로드됐는지
- 어느 발이 앞인지
- 보드 nose/travel direction
- wake 기준 시작/이륙 위치
- timestamp 또는 finalApproachWindow 내부 구간

### Rule 6: Ambiguous Before Wrong

충돌이 있으면 틀린 확정보다 ambiguous가 낫습니다.

권장:

- `edgeDirectionEvidence`와 2개 이상 supporting facts가 충돌하면 `ambiguous`.
- `stance/leadFoot` chain이 불확실하면 high 금지.
- `bodyOrientation`과 edge evidence만 충돌하면 confidence를 낮추고, bodyOrientation은 보조로 유지합니다.

## Prompt Changes v2

프롬프트는 다음 질문을 더 명확히 해야 합니다.

```text
1. finalApproachWindow 안에서 라이더가 실제로 로드한 edge는 toe edge인가 heel edge인가?
2. 그 edge 판단은 어떤 시각 사실에서 왔는가?
3. stance와 leadFoot은 무엇이며, 이 둘이 boardDirection과 일치하는가?
4. boardDirection은 nose direction인가 travel direction인가?
5. wakeCrossingPath의 left/right는 camera 기준인가 boat/rider 기준인가?
6. Toeside를 지지하는 근거와 Heelside를 지지하는 근거를 각각 분리하면 무엇인가?
7. 두 방향 근거가 충돌하면 approachDecision.value를 ambiguous로 반환하라.
```

추가 금지 규칙:

```text
- edgeDirectionEvidence에 라벨만 쓰지 말 것.
- boardDirection과 wakeCrossingPath만으로 toe/heel edge를 확정하지 말 것.
- bodyOrientation만으로 approach를 확정하지 말 것.
- Back Roll/Tantrum/Front Roll 같은 후보명에서 approach를 역추론하지 말 것.
```

## Migration Plan

### Step 1: Add v2 fields without removing v1

기존 앱 표시와 저장 호환성을 위해 `approachObservedFacts` v1은 유지합니다.

추가 후보:

- `approachObservedFactsV2`
- `approachDecisionV2`

### Step 2: Capture More Debug Evidence

evidence capture JSON에 다음을 명시적으로 남깁니다.

- Toeside supporting signals
- Heelside supporting signals
- conflictSummary
- final decision reason

### Step 3: Update Prompt First

코드 판정 로직보다 prompt/schema를 먼저 업데이트해 raw evidence 품질을 올립니다.

### Step 4: Add Conservative Decision Logic

v2 decision은 다음 순서로 결정합니다.

```text
collect directional signals
-> filter weak label echo
-> validate finalApproachWindow
-> score toeside vs heelside
-> detect conflict
-> return heelside/toeside/ambiguous/unknown
```

### Step 5: Use v2 For Gates

taxonomy gate는 v2가 안정화된 뒤 다음 기준으로 교체합니다.

- Back Roll / Tantrum high는 `approachDecisionV2.value = heelside`와 primary edge evidence 필요
- Toeside Basic Jump gate는 `approachDecisionV2.value = toeside` 또는 toeside primary evidence 필요
- `ambiguous`인 경우 invert-specific trick high 금지

## Acceptance Criteria

v2는 다음을 만족해야 합니다.

- 실제 Toeside를 Heelside로 단정하는 사례가 줄어듭니다.
- 실제 Heelside를 Toeside로 단정하는 사례가 줄어듭니다.
- edge label 하나만으로 high confidence가 나오지 않습니다.
- conflicting evidence가 있으면 `ambiguous` 또는 low confidence로 내려갑니다.
- finalApproachWindow 밖 evidence는 high confidence에 기여하지 않습니다.
- capture JSON만 봐도 왜 Toeside/Heelside가 나왔는지 사람이 추적할 수 있습니다.

## Non-Goals

이번 v2 설계에서 하지 않을 것:

- trick family 재분류
- InversionObservedFacts 변경
- Coach/Judge 호출 재활성화
- UI 변경
- DB schema 즉시 변경
- 실제 영상 재분석 자동 실행
