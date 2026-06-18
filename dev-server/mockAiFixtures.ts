type EvidenceConfidence = "high" | "medium" | "low";

type SessionMetadata = {
  sessionId: string;
  momentId: string;
  activityGroupName: string;
  title: string;
  notes: string;
  occurredAt: string;
  userConfirmedTrick: string;
};

type MockFixtureId = "basic_air" | "back_roll" | "back_roll_review";

type MockAiFixture = {
  id: MockFixtureId;
  label: string;
  evidenceModel: string;
  analysisModel: string;
  evidencePayload: Record<string, unknown>;
  analysisPayload: Record<string, unknown>;
};

const confidence = (value: EvidenceConfidence) => value;

const basicAirFixture: MockAiFixture = {
  id: "basic_air",
  label: "Basic Air",
  evidenceModel: "mock-gemini-evidence-v1/basic_air",
  analysisModel: "mock-gemini-analysis-v1/basic_air",
  evidencePayload: {
    primaryCandidate: {
      name: "Toeside Basic Air",
      confidence: confidence("medium"),
      evidence:
        "MOCK: final approach에서 toe edge load가 보이고, takeoff 이후 inversion이나 grab 없이 wake jump 형태로 공중에 떠 있습니다.",
    },
    alternativeCandidates: [
      {
        name: "Straight Air",
        confidence: confidence("low"),
        evidence:
          "MOCK: 회전이나 grab은 보이지 않지만 approach edge가 toeside 쪽으로 기록되어 Straight Air보다 Toeside Basic Air가 더 적합합니다.",
      },
    ],
    family: {
      value: "basic_air",
      confidence: confidence("medium"),
      evidence:
        "MOCK: boardAboveHead, roll axis, flip axis, grab evidence가 없고 기본 wake jump evidence만 있습니다.",
    },
    temporalWindows: {
      takeoffTimestamp: {
        timestampSeconds: 2.4,
        confidence: confidence("medium"),
        evidence: "MOCK: wake lip을 지나며 board가 수면에서 떨어지는 시점입니다.",
      },
      finalApproachWindow: {
        startSeconds: 0.8,
        endSeconds: 2.4,
        confidence: confidence("medium"),
        reasonWindowWasChosen:
          "MOCK: takeoff 직전 edge load와 handle position이 가장 잘 보이는 구간입니다.",
      },
      ignoredSetupWindows: [
        {
          startSeconds: 0,
          endSeconds: 0.8,
          reason: "MOCK: setup 진입 전이라 edge load 판단 근거로 쓰지 않습니다.",
        },
      ],
      approachWindowConfidence: confidence("medium"),
    },
    approachObservedFacts: {
      stance: {
        value: "regular",
        confidence: confidence("low"),
        evidence: "MOCK: stance는 명확하지 않아 낮은 confidence로만 기록합니다.",
      },
      leadFoot: {
        value: "left",
        confidence: confidence("low"),
        evidence: "MOCK: lead foot은 영상 각도상 확정하지 않습니다.",
      },
      boardDirection: {
        value: "across wake",
        confidence: confidence("medium"),
        evidence: "MOCK: rider가 wake 방향으로 접근하는 movement가 보입니다.",
      },
      wakeCrossingPath: {
        startPosition: "outside wake",
        takeoffPosition: "wake lip",
        landingPosition: "opposite wake transition",
        direction: "across wake",
        confidence: confidence("low"),
        evidence:
          "MOCK: camera/boat/rider frame이 완전히 명확하지 않아 wake path는 약한 근거로만 기록합니다.",
      },
      edgeDirectionEvidence: {
        value: "toeside",
        confidence: confidence("medium"),
        evidence: "MOCK: final approach에서 toe edge pressure가 직접 보입니다.",
      },
      handlePosition: {
        value: "low and close to front hip",
        confidence: confidence("medium"),
        evidence: "MOCK: takeoff 전 handle이 몸 가까이에 유지됩니다.",
      },
      bodyOrientation: {
        value: "neutral",
        confidence: confidence("low"),
        evidence:
          "MOCK: body orientation alone is not used as directional edge evidence.",
      },
    },
    edgeLoadObservedFacts: {
      toeEdgeLoaded: {
        value: "true",
        confidence: confidence("medium"),
        evidence:
          "MOCK: 1.4s-2.2s final approach에서 board tilt와 rider weight가 toe edge 쪽으로 보입니다.",
      },
      heelEdgeLoaded: {
        value: "false",
        confidence: confidence("medium"),
        evidence: "MOCK: heel edge load를 보여주는 spray나 weight shift는 보이지 않습니다.",
      },
      edgeLoadVisible: {
        value: "true",
        confidence: confidence("medium"),
        evidence: "MOCK: takeoff 직전 edge load가 짧게 보입니다.",
      },
      edgeLoadTiming: {
        startSec: 1.4,
        endSec: 2.2,
        observedMoment: "final approach before takeoff",
        evidenceFrameDescription:
          "MOCK: board tilt and rider weight over toe edge are visible before wake lip.",
      },
      boardTiltDirection: {
        value: "toe edge down",
        confidence: confidence("medium"),
        evidence: "MOCK: board edge angle is visible during final approach.",
      },
      sprayDirection: {
        value: "light spray from toe-side edge",
        confidence: confidence("low"),
        evidence: "MOCK: spray is present but not strong enough for high confidence.",
      },
      lineTensionDirection: {
        value: "stable line tension",
        confidence: confidence("low"),
        evidence: "MOCK: line tension is visible but not a primary edge-load signal.",
      },
      riderWeightOverEdge: {
        value: "weight over toe edge",
        confidence: confidence("medium"),
        evidence: "MOCK: hips and knees appear stacked toward toe edge during load.",
      },
      edgeLoadConfidence: confidence("medium"),
      edgeLoadEvidenceText:
        "MOCK: timed finalApproachWindow includes visible toe-edge board tilt and rider weight over edge.",
      antiEdgeLoadEvidence: [
        "MOCK: no independent heel-edge spray evidence.",
        "MOCK: body orientation is not counted as edge-load proof.",
      ],
    },
    inversionObservedFacts: {
      bodyInverted: "false",
      boardAboveHead: "false",
      rollAxisObserved: "false",
      flipAxisObserved: "false",
      inversionDuration: {
        seconds: 0,
        confidence: confidence("medium"),
        evidence: "MOCK: board never rises above rider head and body remains upright.",
      },
      inversionEvidenceCount: 0,
      antiInversionEvidence: [
        "MOCK: board is never above rider head.",
        "MOCK: no roll-axis or flip-axis rotation is visible.",
      ],
    },
    approachType: {
      value: "toeside",
      confidence: confidence("medium"),
      evidence: "MOCK: toe edge load is visible in the final approach window.",
    },
    rotationType: {
      value: "none",
      confidence: confidence("medium"),
      evidence: "MOCK: no meaningful yaw, roll, or flip rotation is observed.",
    },
    landingOutcome: {
      value: "stable",
      confidence: confidence("medium"),
      evidence: "MOCK: rider returns to water without a simulated crash signal.",
    },
    confidence: confidence("medium"),
    evidence:
      "MOCK: Basic Air fixture used. Parser, gates, validators, persistence, and app polling should treat this as a normal evidence payload.",
    evidenceWindows: [
      {
        startSeconds: 1.4,
        endSeconds: 2.2,
        label: "edge_load",
        evidence: "MOCK: toe edge load visible before wake lip.",
        confidence: confidence("medium"),
      },
      {
        startSeconds: 2.3,
        endSeconds: 2.8,
        label: "takeoff_airborne",
        evidence: "MOCK: board leaves wake with no grab or inversion.",
        confidence: confidence("medium"),
      },
    ],
    observations: [
      {
        timestampLabel: "1.4s-2.2s",
        label: "Edge load",
        detail: "MOCK: toe edge load is visible in the final approach.",
        confidence: confidence("medium"),
      },
      {
        timestampLabel: "2.3s-2.8s",
        label: "Airborne",
        detail: "MOCK: basic wake jump without inversion.",
        confidence: confidence("medium"),
      },
    ],
    uncertainty: {
      level: confidence("medium"),
      reasons: [
        "MOCK: fixture is deterministic and not derived from real video content.",
      ],
    },
  },
  analysisPayload: {
    summary:
      "MOCK: 기본 점프 흐름은 안정적입니다. takeoff 전 edge load와 handle position을 일정하게 유지하는 것이 다음 개선 포인트입니다.",
    highlights: [
      "MOCK: final approach에서 edge load가 유지됩니다.",
      "MOCK: takeoff 후 큰 회전이나 inversion은 없습니다.",
      "MOCK: landing은 안정적인 편입니다.",
    ],
    highlightScenes: [
      {
        id: "mock-basic-air-edge",
        timestampLabel: "1.4s-2.2s",
        title: "Edge load",
        description: "MOCK: takeoff 직전 toe edge load가 보이는 구간입니다.",
        imageUri: null,
      },
    ],
    suggestions: [
      "MOCK: handle을 몸 가까이에 유지하세요.",
      "MOCK: takeoff 직전 edge pressure를 일정하게 가져가세요.",
      "MOCK: 다음 영상에서는 final approach를 더 길게 담아보세요.",
    ],
  },
};

const backRollFixture: MockAiFixture = {
  id: "back_roll",
  label: "Back Roll",
  evidenceModel: "mock-gemini-evidence-v1/back_roll",
  analysisModel: "mock-gemini-analysis-v1/back_roll",
  evidencePayload: {
    primaryCandidate: {
      name: "Heelside Back Roll",
      confidence: confidence("high"),
      evidence:
        "MOCK: heelside edge load 이후 boardAboveHead와 rollAxisObserved가 보이며 Back Roll 형태의 invert evidence가 있습니다.",
    },
    alternativeCandidates: [
      {
        name: "Heelside Invert",
        confidence: confidence("medium"),
        evidence:
          "MOCK: inversion과 roll-axis evidence는 명확하지만 fixture는 Back Roll로 고정되어 있습니다.",
      },
    ],
    family: {
      value: "invert",
      confidence: confidence("high"),
      evidence:
        "MOCK: boardAboveHead=true, bodyInverted=true, rollAxisObserved=true로 invert gate를 통과합니다.",
    },
    temporalWindows: {
      takeoffTimestamp: {
        timestampSeconds: 2.1,
        confidence: confidence("high"),
        evidence: "MOCK: rider leaves wake lip at the start of the roll.",
      },
      finalApproachWindow: {
        startSeconds: 0.7,
        endSeconds: 2.1,
        confidence: confidence("medium"),
        reasonWindowWasChosen:
          "MOCK: heelside edge load and release into roll are visible before takeoff.",
      },
      ignoredSetupWindows: [
        {
          startSeconds: 0,
          endSeconds: 0.7,
          reason: "MOCK: initial setup is before final approach.",
        },
      ],
      approachWindowConfidence: confidence("medium"),
    },
    approachObservedFacts: {
      stance: {
        value: "regular",
        confidence: confidence("low"),
        evidence: "MOCK: stance is not the primary basis for approach classification.",
      },
      leadFoot: {
        value: "left",
        confidence: confidence("low"),
        evidence: "MOCK: lead foot is visible but not used alone for directional proof.",
      },
      boardDirection: {
        value: "across wake",
        confidence: confidence("medium"),
        evidence: "MOCK: rider travels across the wake into takeoff.",
      },
      wakeCrossingPath: {
        startPosition: "outside wake",
        takeoffPosition: "wake lip",
        landingPosition: "opposite side after rotation",
        direction: "across wake",
        confidence: confidence("low"),
        evidence:
          "MOCK: wake path is recorded but not used alone for high confidence.",
      },
      edgeDirectionEvidence: {
        value: "heelside",
        confidence: confidence("medium"),
        evidence:
          "MOCK: final approach shows heel edge pressure before the invert initiation.",
      },
      handlePosition: {
        value: "close to lead hip",
        confidence: confidence("medium"),
        evidence: "MOCK: handle stays near the body during takeoff.",
      },
      bodyOrientation: {
        value: "opens into roll after takeoff",
        confidence: confidence("medium"),
        evidence:
          "MOCK: body orientation changes after takeoff and is not used as edge-load proof.",
      },
    },
    edgeLoadObservedFacts: {
      toeEdgeLoaded: {
        value: "false",
        confidence: confidence("medium"),
        evidence: "MOCK: toe edge load is not visible in the final approach.",
      },
      heelEdgeLoaded: {
        value: "true",
        confidence: confidence("medium"),
        evidence:
          "MOCK: timed final approach shows heel-side board tilt and rider weight over heel edge.",
      },
      edgeLoadVisible: {
        value: "true",
        confidence: confidence("medium"),
        evidence: "MOCK: edge load is visible before takeoff.",
      },
      edgeLoadTiming: {
        startSec: 1.1,
        endSec: 2.0,
        observedMoment: "final approach before invert takeoff",
        evidenceFrameDescription:
          "MOCK: board tilt and rider weight over heel edge are visible before wake lip.",
      },
      boardTiltDirection: {
        value: "heel edge down",
        confidence: confidence("medium"),
        evidence: "MOCK: board tilt is visible during final approach.",
      },
      sprayDirection: {
        value: "spray from heel-side edge",
        confidence: confidence("medium"),
        evidence: "MOCK: spray follows the heel-side edge load before takeoff.",
      },
      lineTensionDirection: {
        value: "loaded line through takeoff",
        confidence: confidence("low"),
        evidence: "MOCK: line tension is visible but secondary.",
      },
      riderWeightOverEdge: {
        value: "weight over heel edge",
        confidence: confidence("medium"),
        evidence: "MOCK: rider weight is stacked over heel edge before release.",
      },
      edgeLoadConfidence: confidence("medium"),
      edgeLoadEvidenceText:
        "MOCK: timed finalApproachWindow includes heel-edge board tilt, spray, and rider weight over edge.",
      antiEdgeLoadEvidence: [
        "MOCK: no toe-edge physical load evidence in final approach.",
        "MOCK: body orientation is excluded from edge-load proof.",
      ],
    },
    inversionObservedFacts: {
      bodyInverted: "true",
      boardAboveHead: "true",
      rollAxisObserved: "true",
      flipAxisObserved: "false",
      inversionDuration: {
        seconds: 0.7,
        confidence: confidence("high"),
        evidence:
          "MOCK: during peak air, board rises above rider head and body rotates around roll axis.",
      },
      inversionEvidenceCount: 3,
      antiInversionEvidence: [],
    },
    approachType: {
      value: "heelside",
      confidence: confidence("medium"),
      evidence: "MOCK: heel edge load is visible during final approach.",
    },
    rotationType: {
      value: "roll",
      confidence: confidence("high"),
      evidence: "MOCK: roll-axis rotation is visible after takeoff.",
    },
    landingOutcome: {
      value: "ride away",
      confidence: confidence("medium"),
      evidence: "MOCK: fixture assumes a completed ride-away landing.",
    },
    confidence: confidence("high"),
    evidence:
      "MOCK: Back Roll fixture used. Invert gate should pass from boardAboveHead/bodyInverted/rollAxisObserved evidence.",
    evidenceWindows: [
      {
        startSeconds: 1.1,
        endSeconds: 2.0,
        label: "heelside_edge_load",
        evidence: "MOCK: heel edge load before takeoff.",
        confidence: confidence("medium"),
      },
      {
        startSeconds: 2.1,
        endSeconds: 3.0,
        label: "roll_axis_inversion",
        evidence: "MOCK: board above head and roll-axis inversion.",
        confidence: confidence("high"),
      },
    ],
    observations: [
      {
        timestampLabel: "1.1s-2.0s",
        label: "Edge load",
        detail: "MOCK: heel edge load appears during final approach.",
        confidence: confidence("medium"),
      },
      {
        timestampLabel: "2.1s-3.0s",
        label: "Inversion",
        detail: "MOCK: boardAboveHead and rollAxisObserved are true.",
        confidence: confidence("high"),
      },
    ],
    uncertainty: {
      level: confidence("low"),
      reasons: [
        "MOCK: fixture is deterministic and not derived from real video content.",
      ],
    },
  },
  analysisPayload: {
    summary:
      "MOCK: Heelside Back Roll의 핵심 구간은 takeoff 직전 edge load와 roll-axis initiation입니다. handle을 몸 가까이에 유지하면 회전 축이 더 안정됩니다.",
    highlights: [
      "MOCK: final approach에서 heel edge load가 보입니다.",
      "MOCK: peak air에서 boardAboveHead와 roll-axis inversion이 보입니다.",
      "MOCK: landing은 ride-away로 처리했습니다.",
    ],
    highlightScenes: [
      {
        id: "mock-back-roll-invert",
        timestampLabel: "2.1s-3.0s",
        title: "Roll-axis inversion",
        description: "MOCK: boardAboveHead와 roll-axis evidence가 있는 구간입니다.",
        imageUri: null,
      },
    ],
    suggestions: [
      "MOCK: takeoff 직전 heel edge load를 유지하세요.",
      "MOCK: handle이 몸에서 멀어지지 않게 관리하세요.",
      "MOCK: roll initiation 직후 시선과 어깨가 과하게 열리지 않게 확인하세요.",
    ],
  },
};

const backRollReviewFixture: MockAiFixture = {
  ...backRollFixture,
  id: "back_roll_review",
  label: "Back Roll Review Candidate",
  evidenceModel: "mock-gemini-evidence-v1/back_roll_review",
  analysisModel: "mock-gemini-analysis-v1/back_roll_review",
  evidencePayload: {
    ...backRollFixture.evidencePayload,
    primaryCandidate: {
      name: "확인 필요",
      confidence: confidence("low"),
      evidence:
        "MOCK REVIEW: do not persist Heelside Back Roll as confirmed. Heelside edge, roll-axis airtime, and boardAboveHead are visible, so Back Roll remains a review candidate only.",
    },
    alternativeCandidates: [
      {
        name: "Heelside Back Roll",
        confidence: confidence("medium"),
        evidence:
          "MOCK REVIEW: Back Roll is kept as a raw review candidate from visible heelside, roll_axis, inversionDetected, and boardAboveHead signals.",
      },
    ],
    family: {
      value: "확인 필요",
      confidence: confidence("low"),
      evidence:
        "MOCK REVIEW: invert evidence is visible through boardAboveHead, bodyInverted, and rollAxisObserved, but the safe top-level family remains review-only.",
    },
    temporalWindows: {
      takeoffTimestamp: {
        timestampSeconds: 2.1,
        confidence: confidence("medium"),
        evidence: "MOCK REVIEW: rider leaves the wake lip near this moment.",
      },
      finalApproachWindow: {
        startSeconds: 0.7,
        endSeconds: 2.1,
        confidence: confidence("medium"),
        reasonWindowWasChosen:
          "MOCK REVIEW: heelside edge load is visible before takeoff, but takeoff mechanics remain incomplete.",
      },
      ignoredSetupWindows: [
        {
          startSeconds: 0,
          endSeconds: 0.7,
          reason: "MOCK REVIEW: initial setup is before final approach.",
        },
      ],
      approachWindowConfidence: confidence("medium"),
    },
    approachObservedFacts: {
      ...(backRollFixture.evidencePayload.approachObservedFacts as Record<
        string,
        unknown
      >),
      handlePosition: {
        value: "close to body",
        confidence: confidence("medium"),
        evidence:
          "MOCK REVIEW: handle stays close to the body, but this is not treated as enough to confirm the exact trick.",
      },
      bodyOrientation: {
        value: "changes during airborne roll",
        confidence: confidence("low"),
        evidence:
          "MOCK REVIEW: body orientation changes in the air, but this is not enough to confirm the exact trick.",
      },
    },
    edgeLoadObservedFacts: {
      ...(backRollFixture.evidencePayload.edgeLoadObservedFacts as Record<
        string,
        unknown
      >),
      riderWeightOverEdge: {
        value: "weight over heel edge",
        confidence: confidence("medium"),
        evidence:
          "MOCK REVIEW: rider weight appears stacked over heel edge before release.",
      },
      edgeLoadEvidenceText:
        "MOCK REVIEW: timed finalApproachWindow includes heel-edge board tilt, spray, and rider weight over edge.",
    },
    popObservedFacts: {
      popType: "wake_pop",
      timing: "takeoff_window",
      intensity: "medium",
      evidenceText:
        "MOCK REVIEW: pop is visible at the wake, but the next motion cue is incomplete.",
      confidence: confidence("medium"),
      antiEvidence: [
        "MOCK REVIEW: exact takeoff mechanics are not independently confirmed.",
      ],
    },
    rotationObservedFacts: {
      rotationAxis: "roll_axis",
      rotationDirection: "unknown",
      inversionDetected: true,
      spinDegrees: "unknown",
      handlePassObserved: false,
      evidenceText:
        "MOCK REVIEW: airborne roll_axis and inversionDetected are visible after takeoff; exact takeoff cue is not independently confirmed.",
      confidence: confidence("medium"),
      antiEvidence: [
        "MOCK REVIEW: no independent takeoff rotation-start cue is visible.",
      ],
    },
    inversionObservedFacts: {
      bodyInverted: true,
      boardAboveHead: true,
      rollAxisObserved: true,
      flipAxisObserved: false,
      inversionDuration: {
        seconds: 0.7,
        confidence: confidence("high"),
        evidence:
          "MOCK REVIEW: board rises above rider head and body is inverted during the airborne roll.",
      },
      inversionEvidenceCount: 3,
      antiInversionEvidence: [],
    },
    rotationType: {
      value: "확인 필요",
      confidence: confidence("low"),
      evidence:
        "MOCK REVIEW: roll-axis evidence exists, but the safe top-level rotation label remains review-only.",
    },
    landingOutcome: {
      value: "unknown",
      confidence: confidence("low"),
      evidence: "MOCK REVIEW: landing is not used to confirm this candidate.",
    },
    confidence: confidence("low"),
    evidence:
      "MOCK REVIEW: Heelside Back Roll should appear only as a review candidate because the safe top-level result is 확인 필요.",
    evidenceWindows: [
      {
        startSeconds: 1.1,
        endSeconds: 2.0,
        label: "heelside_edge_load",
        evidence: "MOCK REVIEW: heel edge load before takeoff.",
        confidence: confidence("medium"),
      },
      {
        startSeconds: 2.1,
        endSeconds: 3.0,
        label: "roll_axis_inversion",
        evidence:
          "MOCK REVIEW: board above head and roll-axis inversion are visible after takeoff.",
        confidence: confidence("high"),
      },
    ],
    observations: [
      {
        timestampLabel: "1.1s-2.0s",
        label: "Edge load",
        detail: "MOCK REVIEW: heel edge load appears during final approach.",
        confidence: confidence("medium"),
      },
      {
        timestampLabel: "2.1s-3.0s",
        label: "Inversion",
        detail: "MOCK REVIEW: boardAboveHead and rollAxisObserved are true.",
        confidence: confidence("high"),
      },
    ],
    uncertainty: {
      level: confidence("high"),
      reasons: [
        "MOCK REVIEW: exact takeoff rotation-start proof is intentionally absent.",
      ],
    },
  },
  analysisPayload: {
    ...backRollFixture.analysisPayload,
    summary:
      "MOCK REVIEW: 백롤 가능성은 보이지만 확정하지 않고 검토 후보로만 표시해야 하는 fixture입니다.",
  },
};

const fixtures = [
  basicAirFixture,
  backRollFixture,
  backRollReviewFixture,
] satisfies MockAiFixture[];

export function getMockAiFixture(metadata: SessionMetadata) {
  const forcedFixture = normalizeFixtureId(process.env.MOCK_AI_FIXTURE);

  if (forcedFixture) {
    return findFixture(forcedFixture);
  }

  const searchText = [
    metadata.userConfirmedTrick,
    metadata.title,
    metadata.notes,
  ]
    .join(" ")
    .toLowerCase();

  if (
    searchText.includes("back roll review") ||
    searchText.includes("backroll review") ||
    searchText.includes("candidate review")
  ) {
    return backRollReviewFixture;
  }

  if (
    searchText.includes("back roll") ||
    searchText.includes("backroll") ||
    searchText.includes("invert")
  ) {
    return backRollFixture;
  }

  return basicAirFixture;
}

export function stringifyMockAiPayload(payload: Record<string, unknown>) {
  return JSON.stringify(payload);
}

function normalizeFixtureId(value: unknown): MockFixtureId | null {
  if (
    value === "basic_air" ||
    value === "back_roll" ||
    value === "back_roll_review"
  ) {
    return value;
  }

  return null;
}

function findFixture(id: MockFixtureId) {
  return fixtures.find((fixture) => fixture.id === id) ?? basicAirFixture;
}
