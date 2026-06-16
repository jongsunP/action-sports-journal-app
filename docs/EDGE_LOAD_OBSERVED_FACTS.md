# EdgeLoadObservedFacts

## Purpose

EdgeLoadObservedFacts의 목표는 `edgeDirectionEvidence` 안에 섞여 있는 두 가지 정보를 분리하는 것입니다.

1. Toeside / Heelside처럼 보인다는 라벨 추측
2. 실제 toe edge / heel edge에 하중이 실린 물리적 관찰 근거

현재 ApproachObservedFacts v2는 `edgeDirectionEvidence`를 가장 중요한 signal로 사용합니다. 이 방향은 맞지만, Gemini가 라벨을 잘못 붙이면 v2도 그 라벨을 따라갈 수 있습니다. 특히 실제 Toeside 영상에서 `edgeDirectionEvidence = Heelside`로 추출되면 최종 결과가 `heelside / low`로 내려가는 문제가 있습니다.

EdgeLoadObservedFacts는 라벨보다 물리 관찰을 우선하기 위한 다음 단계 설계입니다.

이 문서는 설계 문서입니다. 코드 변경은 포함하지 않습니다.

## Design Principles

- 기존 `edgeDirectionEvidence`는 유지합니다.
- 새 `EdgeLoadObservedFacts`를 병렬로 추가합니다.
- label-only evidence와 physical edge-load evidence를 명확히 분리합니다.
- "Heelside로 보임", "Toeside approach" 같은 라벨 echo는 weak evidence로만 처리합니다.
- 실제 toe/heel edge loading이 보일 때만 ApproachObservedFacts v2 confidence를 medium 이상으로 올립니다.
- edge load가 보이지 않으면 wake path, stance, leadFoot, bodyOrientation만으로 high confidence를 허용하지 않습니다.
- trick name, expected family, rotation direction, landing result에서 edge load를 역추론하지 않습니다.

## Problem

현재 `edgeDirectionEvidence`는 다음 역할을 동시에 가집니다.

- 모델이 생각한 approach label
- edge 사용 여부
- edge loading에 대한 관찰 설명
- rider posture에 대한 해석

이 구조에서는 다음과 같은 응답이 모두 같은 수준으로 취급될 수 있습니다.

```json
{
  "edgeDirectionEvidence": {
    "value": "Heelside",
    "confidence": "high",
    "evidence": "Heelside로 접근하는 것으로 보입니다."
  }
}
```

```json
{
  "edgeDirectionEvidence": {
    "value": "Heelside edge loaded",
    "confidence": "high",
    "evidence": "The rider leans back and visibly weights the heel edge before takeoff."
  }
}
```

첫 번째는 라벨 추측입니다. 두 번째는 물리 근거입니다. 둘을 분리해야 합니다.

## Proposed Type

```ts
type EdgeLoadObservedFacts = {
  toeEdgeLoaded: EvidenceFact;
  heelEdgeLoaded: EvidenceFact;
  edgeLoadVisible: EvidenceFact;
  edgeLoadTiming: EvidenceFact;
  boardTiltDirection: EvidenceFact;
  sprayDirection: EvidenceFact;
  lineTensionDirection: EvidenceFact;
  riderWeightOverEdge: EvidenceFact;
  edgeLoadConfidence: EvidenceConfidence;
  edgeLoadEvidenceText: string;
  antiEdgeLoadEvidence: string[];
};
```

### toeEdgeLoaded

Whether the rider visibly loads the toe edge.

Strong evidence examples:

- rider weight over toeside edge
- board tipped toward toe edge
- spray generated from toe edge during cut
- body stacked against line tension while toe edge holds

Weak or invalid evidence:

- "toeside approach"
- "looks toeside"
- trick name includes TS
- rider chest faces camera

### heelEdgeLoaded

Whether the rider visibly loads the heel edge.

Strong evidence examples:

- rider weight over heelside edge
- board tipped toward heel edge
- spray generated from heel edge during cut
- hips/back leaning against line tension while heel edge holds

Weak or invalid evidence:

- "heelside approach"
- "looks heelside"
- trick name includes HS
- rider back faces camera

### edgeLoadVisible

Whether edge loading is visually observable at all.

Recommended values:

- `true`: board tilt, spray, rider weight, or line tension clearly shows edge load
- `false`: rider is flat, video angle hides the board, or edge load cannot be seen
- `unknown`: footage is unclear

This field should not decide Toeside / Heelside by itself. It only says whether the video contains usable edge-load evidence.

### edgeLoadTiming

When the observed edge load occurs.

Recommended values:

- `finalApproach`
- `takeoff`
- `earlierSetup`
- `landing`
- `unknown`

Only `finalApproach` and late pre-takeoff observations should influence approach confidence. Earlier setup and landing should be recorded but not used as primary approach evidence.

### boardTiltDirection

Observed board tilt relative to toe/heel edge, not screen left/right.

Good evidence:

- board tipped onto toe edge
- board tipped onto heel edge
- board appears flat

Bad evidence:

- board points left
- board points right
- board travels toward center

Left/right direction belongs to path analysis, not edge load.

### sprayDirection

Water spray can support edge load only when it is tied to the edge contact.

Useful:

- spray comes from toe edge during cut
- spray comes from heel edge during cut

Not enough:

- spray visible behind board
- large spray at landing
- spray direction described only as left/right

### lineTensionDirection

Line tension can support edge load when paired with rider lean and board hold.

Useful:

- rider leans against rope tension while maintaining toe edge
- rider leans back against rope tension while holding heel edge

Not enough:

- rope is tight
- handle is in front
- handle points left/right

### riderWeightOverEdge

Records whether rider mass is visibly committed over toe or heel edge.

Useful:

- knees/hips/torso stacked over toe edge
- hips back and weight over heels
- rider resists line tension through a loaded edge

Not enough:

- chest facing camera
- back facing camera
- regular/goofy stance alone

### edgeLoadConfidence

Aggregate confidence for physical edge-load evidence.

Recommended rule:

- `high`: at least two physical indicators agree, and timing is finalApproach/takeoff
- `medium`: one clear physical indicator, or multiple weaker indicators
- `low`: label-only evidence, unclear board angle, or timing uncertainty

### edgeLoadEvidenceText

Short free-text summary of the physical evidence only.

Should include:

- what edge is loaded
- what visual clue proves it
- when it happens

Should not include:

- trick classification
- expected approach for the trick
- label-only wording without visual evidence

### antiEdgeLoadEvidence

Evidence that blocks or lowers edge-load confidence.

Examples:

- board is flat before takeoff
- edge is hidden by spray/camera angle
- only body orientation is visible
- no clear toe/heel tilt
- evidence occurs after takeoff or during landing
- label says Heelside but physical edge evidence is not visible

## Label-Only vs Physical Evidence

### Label-Only Evidence

Label-only evidence repeats a conclusion without visual proof.

Examples:

- "Heelside approach"
- "Toeside로 보임"
- "HS Back Roll"
- "The rider approaches toeside"

Handling:

- Keep it in `edgeDirectionEvidence`
- Add it to v2 signals as weak at most
- Do not allow medium/high confidence from this alone
- If physical edge load is missing, final confidence should stay low

### Physical Edge-Load Evidence

Physical evidence describes what is visible in the frame.

Examples:

- "weighting the heelside edge"
- "board is tipped onto the toe edge"
- "spray comes off the heel edge during the cut"
- "rider leans against line tension while holding toe edge"

Handling:

- Store in `EdgeLoadObservedFacts`
- Use as the main approach signal
- Allow medium confidence when one side is visible
- Allow high confidence only when multiple physical indicators agree and there is no cross-side conflict

## Connection To ApproachObservedFacts v2

ApproachObservedFacts v2 should keep the existing fields:

- `edgeDirectionEvidence`
- `wakeCrossingPath`
- `stance`
- `leadFoot`
- `boardDirection`
- `bodyOrientation`

Then add:

```ts
type ApproachObservedFactsV2 = {
  // existing v2 fields
  edgeLoadObservedFacts?: EdgeLoadObservedFacts;
};
```

Recommended decision order:

1. Read `EdgeLoadObservedFacts`.
2. If physical toe edge load is visible, create a Toeside signal.
3. If physical heel edge load is visible, create a Heelside signal.
4. If both toe and heel load appear in the same finalApproach window, return `ambiguous`.
5. Use `edgeDirectionEvidence` label as weak support only.
6. Use wake path, stance, leadFoot, boardDirection, and bodyOrientation as context only unless they are tied to edge-load evidence.

## Confidence Rules

Recommended v2 confidence rules after EdgeLoadObservedFacts is added:

### high

Allow only when:

- exactly one of `toeEdgeLoaded` or `heelEdgeLoaded` is physically supported
- `edgeLoadVisible = true`
- `edgeLoadTiming` is `finalApproach` or late pre-takeoff
- at least two physical indicators agree, such as board tilt + spray, or board tilt + rider weight
- no cross-side conflict exists

### medium

Allow when:

- exactly one of `toeEdgeLoaded` or `heelEdgeLoaded` is physically supported
- at least one clear physical indicator exists
- timing is not contradicted
- label evidence does not conflict with physical evidence

### low

Use when:

- only label evidence exists
- physical edge load is unclear
- wake path is the main evidence
- body orientation is the main evidence
- edge label and physical clues conflict

### ambiguous

Use when:

- toe edge and heel edge are both physically supported in the same finalApproach window
- label says one side but physical evidence supports the other
- camera/boat/rider frame makes the edge-load interpretation unstable

### unknown

Use when:

- no edge-load evidence is visible
- video angle hides board/edge contact
- all edge-related facts are missing or low quality

## Prompt Guidance

The extraction prompt should ask for observed facts only.

Recommended prompt rules:

- Do not infer edge load from trick name.
- Do not infer edge load from expected approach type.
- Do not infer edge load from rotation direction.
- Do not infer edge load from wake crossing direction alone.
- Describe physical signs of edge loading: board tilt, spray, rider weight, line tension.
- If only a label is visible in the model's reasoning, mark physical edge load as unknown.
- If board tilt or spray cannot be seen, say unknown.
- If evidence is after takeoff or landing, record it but do not use it as final approach evidence.

## Example Outcomes

### Label-only Heelside

```json
{
  "edgeDirectionEvidence": {
    "value": "Heelside",
    "confidence": "high",
    "evidence": "Heelside로 접근하는 것으로 보입니다."
  },
  "edgeLoadObservedFacts": {
    "toeEdgeLoaded": { "value": "unknown", "confidence": "low", "evidence": "No physical toe edge load is visible." },
    "heelEdgeLoaded": { "value": "unknown", "confidence": "low", "evidence": "No physical heel edge load is visible." },
    "edgeLoadVisible": { "value": "unknown", "confidence": "low", "evidence": "The board edge is not clearly visible." },
    "edgeLoadConfidence": "low",
    "edgeLoadEvidenceText": "",
    "antiEdgeLoadEvidence": ["Only a Heelside label is provided without board tilt, spray, or rider weight evidence."]
  }
}
```

Expected decision:

- `value`: `unknown` or weak label direction
- `confidence`: `low`

### Physical Heelside Load

```json
{
  "edgeLoadObservedFacts": {
    "heelEdgeLoaded": {
      "value": "true",
      "confidence": "high",
      "evidence": "The rider leans back against the rope and visibly weights the heel edge before takeoff."
    },
    "boardTiltDirection": {
      "value": "heel edge",
      "confidence": "high",
      "evidence": "The board is tipped onto the heel edge during the final cut."
    },
    "sprayDirection": {
      "value": "heel edge spray",
      "confidence": "medium",
      "evidence": "Spray comes from the heel edge during the cut."
    },
    "edgeLoadConfidence": "high",
    "edgeLoadEvidenceText": "Heel edge load is visible through rider lean, board tilt, and spray during final approach.",
    "antiEdgeLoadEvidence": []
  }
}
```

Expected decision:

- `value`: `heelside`
- `confidence`: `high` if no conflict exists

## Migration Strategy

Recommended incremental rollout:

1. Keep existing `edgeDirectionEvidence`.
2. Add `edgeLoadObservedFacts` to capture JSON only.
3. Compare TS/HS test videos without changing taxonomy gate.
4. Persist `edgeLoadObservedFacts` to Supabase once capture output is stable.
5. Connect `EdgeLoadObservedFacts` to `ApproachDecisionV2`.
6. Only after repeated tests, consider using it in taxonomy gate or UI review hints.

## Non-Goals

Do not implement in this design step:

- taxonomy gate changes
- UI changes
- database migration
- Gemini prompt change
- Supabase persistence
- automatic correction of historical rows

## Open Questions

- Should `toeEdgeLoaded` and `heelEdgeLoaded` be booleans, enum facts, or EvidenceFact values?
- Should `edgeLoadTiming` use seconds/windows instead of labels?
- Should board tilt and spray be weighted equally?
- Should label-only `edgeDirectionEvidence` be allowed to choose a value at all, or only add review context?
- Should `EdgeLoadObservedFacts` eventually replace `edgeDirectionEvidence`, or remain a stricter companion field?
