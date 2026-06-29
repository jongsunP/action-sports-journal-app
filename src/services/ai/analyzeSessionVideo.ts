import type {
  AnalysisResult,
  CoachingInsightContext,
  GeminiEvidenceResult,
  Session,
} from '../../types';
import { authenticatedFetch } from '../auth/authenticatedFetch';

export type SessionVideoAsset = {
  uri: string;
  fileName?: string | null;
  fileSize?: number;
  mimeType?: string | null;
  duration?: number | null;
  previewSource?: 'original' | 'compressed' | 'remote';
};

export type AnalyzeSessionVideoInput = {
  session: Session;
  activityGroupName: string;
  video: SessionVideoAsset;
  momentId?: string;
  userConfirmedTrick?: string;
  coachingInsightContext?: CoachingInsightContext[];
};

export type QueuedEvidenceAnalysisJob = {
  id: string;
  sessionId: string;
  momentId?: string;
  status: 'queued' | 'processing';
  momentStatus: 'queued' | 'processing';
  provider: 'gemini';
  model?: string;
  createdAt: string;
};

type RemoteAnalysisResponse = {
  id?: unknown;
  sessionId?: unknown;
  status?: unknown;
  summary?: unknown;
  rawResponseText?: unknown;
  humanReadableAnalysis?: unknown;
  detectedTrick?: unknown;
  confidence?: unknown;
  highlights?: unknown;
  highlightScenes?: unknown;
  strengths?: unknown;
  improvements?: unknown;
  coachingObservations?: unknown;
  observations?: unknown;
  patternRecognition?: unknown;
  inferences?: unknown;
  selfCritique?: unknown;
  suggestions?: unknown;
  createdAt?: unknown;
};

type RemoteEvidenceResponse = {
  id?: unknown;
  sessionId?: unknown;
  status?: unknown;
  provider?: unknown;
  model?: unknown;
  qualityMode?: unknown;
  recoveredFromPartial?: unknown;
  requiresUserConfirmation?: unknown;
  consistencyStatus?: unknown;
  consistencyWarnings?: unknown;
  rawFamilyCandidate?: unknown;
  safeFamilyCandidate?: unknown;
  taxonomyWarnings?: unknown;
  gateFailures?: unknown;
  candidateTrace?: unknown;
  rawResponseText?: unknown;
  primaryCandidate?: unknown;
  alternativeCandidates?: unknown;
  family?: unknown;
  temporalWindows?: unknown;
  rawApproachType?: unknown;
  approachObservedFacts?: unknown;
  approachObservedFactsV2?: unknown;
  edgeLoadObservedFacts?: unknown;
  edgeLoadValidation?: unknown;
  popObservedFacts?: unknown;
  popValidation?: unknown;
  rotationObservedFacts?: unknown;
  rotationValidation?: unknown;
  grabObservedFacts?: unknown;
  grabValidation?: unknown;
  landingObservedFacts?: unknown;
  landingValidation?: unknown;
  inversionObservedFacts?: unknown;
  approachDecision?: unknown;
  approachDecisionV2?: unknown;
  approachWarnings?: unknown;
  approachType?: unknown;
  rotationType?: unknown;
  landingOutcome?: unknown;
  confidence?: unknown;
  evidence?: unknown;
  evidenceWindows?: unknown;
  observations?: unknown;
  uncertainty?: unknown;
  knowledgeInsights?: unknown;
  coachingInsightContext?: unknown;
  createdAt?: unknown;
};

type RemoteErrorResponse = {
  error?: unknown;
};

export class RemoteRequestError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'RemoteRequestError';
    this.status = status;
  }
}

const analysisEndpoint = process.env.EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT;
const geminiEvidenceEndpoint = analysisEndpoint?.replace(
  /\/api\/analyze-session-video$/,
  '/api/extract-session-evidence',
);
const momentsEndpoint = analysisEndpoint?.replace(
  /\/api\/analyze-session-video$/,
  '/api/moments',
);
const openAiBenchmarkEndpoint = analysisEndpoint?.replace(
  /\/api\/analyze-session-video$/,
  '/api/benchmarks/openai-wakeboard-video',
);

if (__DEV__) {
  console.log('[Action Sports Journal] AI endpoints', {
    analysisEndpoint,
    geminiEvidenceEndpoint,
    momentsEndpoint,
    openAiBenchmarkEndpoint,
  });
}

export function hasConfiguredAnalysisEndpoint() {
  return Boolean(analysisEndpoint);
}

export function getConfiguredAiEndpoints() {
  return {
    analysisEndpoint,
    geminiEvidenceEndpoint,
    openAiBenchmarkEndpoint,
  };
}

export async function analyzeSessionVideo({
  session,
  activityGroupName,
  video,
  userConfirmedTrick,
  coachingInsightContext,
}: AnalyzeSessionVideoInput): Promise<AnalysisResult> {
  if (!analysisEndpoint) {
    throw new Error('AI 분석 서버 엔드포인트가 설정되지 않았습니다.');
  }

  return requestRemoteAnalysis({
    endpoint: analysisEndpoint,
    session,
    activityGroupName,
    video,
    userConfirmedTrick,
    coachingInsightContext,
    includeCoachingInsightContext: true,
  });
}

export function hasConfiguredGeminiEvidenceEndpoint() {
  return Boolean(geminiEvidenceEndpoint);
}

export async function extractSessionEvidenceWithGemini({
  session,
  activityGroupName,
  video,
  momentId,
  userConfirmedTrick,
}: AnalyzeSessionVideoInput): Promise<GeminiEvidenceResult> {
  if (!geminiEvidenceEndpoint) {
    throw new Error('Gemini 근거 추출 엔드포인트가 설정되지 않았습니다.');
  }

  const data = await requestRemoteJson({
    endpoint: geminiEvidenceEndpoint,
    session,
    activityGroupName,
    video,
    momentId,
    userConfirmedTrick,
  });

  return normalizeRemoteEvidence(data as RemoteEvidenceResponse, session.id);
}

export async function queueSessionEvidenceExtractionWithGemini({
  session,
  activityGroupName,
  video,
  momentId,
  userConfirmedTrick,
}: AnalyzeSessionVideoInput): Promise<QueuedEvidenceAnalysisJob> {
  if (!geminiEvidenceEndpoint) {
    throw new Error('Gemini 근거 추출 엔드포인트가 설정되지 않았습니다.');
  }

  const data = await requestRemoteJson({
    endpoint: geminiEvidenceEndpoint,
    session,
    activityGroupName,
    video,
    momentId,
    userConfirmedTrick,
  });

  return normalizeQueuedEvidenceAnalysisJob(data, session.id);
}

export async function queueStoredSessionEvidenceExtractionWithGemini({
  session,
  activityGroupName,
  momentId,
  userConfirmedTrick,
}: Omit<AnalyzeSessionVideoInput, 'video'> & {
  momentId: string;
}): Promise<QueuedEvidenceAnalysisJob> {
  if (!momentsEndpoint) {
    throw new Error('저장된 영상 분석 엔드포인트가 설정되지 않았습니다.');
  }

  const response = await authenticatedFetch(`${momentsEndpoint}/${momentId}/analyze-stored-video`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId: session.id,
      activityGroupName,
      title: session.title?.trim() || '라이딩 영상',
      notes: session.notes ?? '',
      occurredAt: session.occurredAt,
      userConfirmedTrick:
        typeof userConfirmedTrick === 'string' && userConfirmedTrick.trim()
          ? userConfirmedTrick.trim()
          : undefined,
    }),
  });

  if (!response.ok) {
    const message = await readRemoteErrorMessage(response);

    throw new RemoteRequestError(
      message ?? `Stored analysis request failed with ${response.status}`,
      response.status,
    );
  }

  const data = await response.json();

  return normalizeQueuedEvidenceAnalysisJob(data, session.id);
}

export function hasConfiguredOpenAiBenchmarkEndpoint() {
  return Boolean(openAiBenchmarkEndpoint);
}

export async function benchmarkSessionVideoWithOpenAi({
  session,
  activityGroupName,
  video,
  userConfirmedTrick,
}: AnalyzeSessionVideoInput): Promise<AnalysisResult> {
  if (!openAiBenchmarkEndpoint) {
    throw new Error('OpenAI 벤치마크 엔드포인트가 설정되지 않았습니다.');
  }

  return requestRemoteAnalysis({
    endpoint: openAiBenchmarkEndpoint,
    session,
    activityGroupName,
    video,
    userConfirmedTrick,
  });
}

async function requestRemoteAnalysis({
  endpoint,
  session,
  activityGroupName,
  video,
  userConfirmedTrick,
  coachingInsightContext,
  includeCoachingInsightContext = false,
}: AnalyzeSessionVideoInput & {
  endpoint: string;
  includeCoachingInsightContext?: boolean;
}): Promise<AnalysisResult> {
  const data = await requestRemoteJson({
    endpoint,
    session,
    activityGroupName,
    video,
    userConfirmedTrick,
    coachingInsightContext: includeCoachingInsightContext
      ? coachingInsightContext
      : undefined,
  });

  return normalizeRemoteAnalysis(data as RemoteAnalysisResponse, session.id);
}

async function requestRemoteJson({
  endpoint,
  session,
  activityGroupName,
  video,
  momentId,
  userConfirmedTrick,
  coachingInsightContext,
}: AnalyzeSessionVideoInput & { endpoint: string }): Promise<unknown> {
  const formData = new FormData();

  formData.append('sessionId', session.id);
  if (momentId) {
    formData.append('momentId', momentId);
  }
  formData.append('activityGroupName', activityGroupName);
  formData.append('title', session.title?.trim() || '라이딩 영상');
  formData.append('notes', session.notes ?? '');
  formData.append('occurredAt', session.occurredAt);
  if (typeof userConfirmedTrick === 'string' && userConfirmedTrick.trim()) {
    formData.append('userConfirmedTrick', userConfirmedTrick.trim());
  }
  if (coachingInsightContext && coachingInsightContext.length > 0) {
    formData.append(
      'coachingInsightContext',
      JSON.stringify(coachingInsightContext),
    );
  }
  formData.append('video', {
    uri: video.uri,
    name: video.fileName ?? `${session.id}.mov`,
    type: video.mimeType ?? 'video/quicktime',
  } as unknown as Blob);

  const response = await authenticatedFetch(endpoint, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const message = await readRemoteErrorMessage(response);

    throw new RemoteRequestError(
      message ?? `Analysis request failed with ${response.status}`,
      response.status,
    );
  }

  return response.json();
}

function normalizeRemoteAnalysis(
  data: RemoteAnalysisResponse,
  sessionId: string,
): AnalysisResult {
  const now = new Date().toISOString();

  return {
    id: asString(data.id) ?? `analysis-${Date.now()}`,
    sessionId: asString(data.sessionId) ?? sessionId,
    status: data.status === 'failed' ? 'failed' : 'completed',
    summary: asString(data.summary) ?? '분석이 완료되었습니다.',
    rawResponseText: asString(data.rawResponseText),
    humanReadableAnalysis: asString(data.humanReadableAnalysis),
    detectedTrick: asString(data.detectedTrick),
    confidence: asConfidence(data.confidence),
    highlights: asStringArray(data.highlights),
    highlightScenes: asHighlightScenes(data.highlightScenes),
    strengths: asStringArray(data.strengths),
    improvements: asStringArray(data.improvements),
    coachingObservations: asCoachingObservations(data.coachingObservations),
    observations: asCoachingObservations(data.observations),
    patternRecognition: asCoachingObservations(data.patternRecognition),
    inferences: asCoachingObservations(data.inferences),
    selfCritique: asSelfCritique(data.selfCritique),
    suggestions: asStringArray(data.suggestions),
    createdAt: asString(data.createdAt) ?? now,
  };
}

function normalizeQueuedEvidenceAnalysisJob(
  data: unknown,
  sessionId: string,
): QueuedEvidenceAnalysisJob {
  const response =
    data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const rawStatus = asString(response.status);
  const status = rawStatus === 'processing' ? 'processing' : 'queued';
  const rawMomentStatus = asString(response.momentStatus);
  const momentStatus = rawMomentStatus === 'processing' ? 'processing' : 'queued';

  return {
    id: asString(response.id) ?? `analysis-job-${Date.now()}`,
    sessionId: asString(response.sessionId) ?? sessionId,
    momentId: asString(response.momentId),
    status,
    momentStatus,
    provider: 'gemini',
    model: asString(response.model),
    createdAt: asString(response.createdAt) ?? new Date().toISOString(),
  };
}

function normalizeRemoteEvidence(
  data: RemoteEvidenceResponse,
  sessionId: string,
): GeminiEvidenceResult {
  const now = new Date().toISOString();

  return {
    id: asString(data.id) ?? `evidence-${Date.now()}`,
    sessionId: asString(data.sessionId) ?? sessionId,
    status: data.status === 'failed' ? 'failed' : 'completed',
    provider: 'gemini',
    model: asString(data.model),
    qualityMode: asQualityMode(data.qualityMode),
    recoveredFromPartial: data.recoveredFromPartial === true,
    requiresUserConfirmation: data.requiresUserConfirmation === true,
    consistencyStatus: asConsistencyStatus(data.consistencyStatus),
    consistencyWarnings: asStringArray(data.consistencyWarnings),
    rawFamilyCandidate: asString(data.rawFamilyCandidate),
    safeFamilyCandidate: asString(data.safeFamilyCandidate),
    taxonomyWarnings: asStringArray(data.taxonomyWarnings),
    gateFailures: asStringArray(data.gateFailures),
    candidateTrace: asCandidateTrace(data.candidateTrace),
    rawResponseText: asString(data.rawResponseText),
    primaryCandidate: asTrickCandidate(data.primaryCandidate),
    alternativeCandidates: asTrickCandidates(data.alternativeCandidates),
    family: asEvidenceFact(data.family),
    temporalWindows: asEvidenceTemporalWindows(data.temporalWindows),
    rawApproachType: asOptionalEvidenceFact(data.rawApproachType),
    approachObservedFacts: asApproachObservedFacts(data.approachObservedFacts),
    approachObservedFactsV2: asApproachObservedFactsV2(
      data.approachObservedFactsV2,
    ),
    edgeLoadObservedFacts: asEdgeLoadObservedFacts(data.edgeLoadObservedFacts),
    edgeLoadValidation: asEdgeLoadValidation(data.edgeLoadValidation),
    popObservedFacts: asPopObservedFacts(data.popObservedFacts),
    popValidation: asPopValidation(data.popValidation),
    rotationObservedFacts: asRotationObservedFacts(data.rotationObservedFacts),
    rotationValidation: asRotationValidation(data.rotationValidation),
    grabObservedFacts: asGrabObservedFacts(data.grabObservedFacts),
    grabValidation: asGrabValidation(data.grabValidation),
    landingObservedFacts: asLandingObservedFacts(data.landingObservedFacts),
    landingValidation: asLandingValidation(data.landingValidation),
    inversionObservedFacts: asInversionObservedFacts(data.inversionObservedFacts),
    approachDecision: asApproachDecision(data.approachDecision),
    approachDecisionV2: asApproachDecisionV2(data.approachDecisionV2),
    approachWarnings: asStringArray(data.approachWarnings),
    approachType: asEvidenceFact(data.approachType),
    rotationType: asEvidenceFact(data.rotationType),
    landingOutcome: asEvidenceFact(data.landingOutcome),
    confidence: asConfidenceLevel(data.confidence) ?? 'low',
    evidence: asString(data.evidence) ?? 'AI 추정 근거가 충분히 제공되지 않았습니다.',
    evidenceWindows: asEvidenceWindows(data.evidenceWindows),
    observations: asMotionObservations(data.observations),
    uncertainty: asEvidenceUncertainty(data.uncertainty),
    knowledgeInsights: asKnowledgeInsights(data.knowledgeInsights),
    coachingInsightContext: asCoachingInsightContext(
      data.coachingInsightContext,
    ),
    createdAt: asString(data.createdAt) ?? now,
  };
}

function asTrickCandidate(
  value: unknown,
): GeminiEvidenceResult['primaryCandidate'] {
  if (!value || typeof value !== 'object') {
    return {
      name: '확인 필요',
      confidence: 'low',
      evidence: '트릭 시도 근거를 충분히 읽지 못했습니다.',
    };
  }

  const candidate = value as Record<string, unknown>;

  return {
    name: asString(candidate.name) ?? '확인 필요',
    confidence: asConfidenceLevel(candidate.confidence) ?? 'low',
    evidence: asString(candidate.evidence) ?? '트릭 시도 근거가 부족합니다.',
  };
}

function asTrickCandidates(
  value: unknown,
): GeminiEvidenceResult['alternativeCandidates'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(asTrickCandidate).filter((candidate) => candidate.name !== '확인 필요');
}

function asEvidenceFact(value: unknown): GeminiEvidenceResult['approachType'] {
  if (!value || typeof value !== 'object') {
    return {
      value: '확인 필요',
      confidence: 'low',
      evidence: '영상 근거를 충분히 읽지 못했습니다.',
    };
  }

  const candidate = value as Record<string, unknown>;

  return {
    value: asString(candidate.value) ?? '확인 필요',
    confidence: asConfidenceLevel(candidate.confidence) ?? 'low',
    evidence: asString(candidate.evidence) ?? '근거가 부족합니다.',
  };
}

function asOptionalEvidenceFact(
  value: unknown,
): GeminiEvidenceResult['rawApproachType'] {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  return asEvidenceFact(value);
}

function asEvidenceTemporalWindows(
  value: unknown,
): GeminiEvidenceResult['temporalWindows'] {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const temporal = value as Record<string, unknown>;
  const takeoff =
    temporal.takeoffTimestamp && typeof temporal.takeoffTimestamp === 'object'
      ? (temporal.takeoffTimestamp as Record<string, unknown>)
      : {};
  const finalApproach =
    temporal.finalApproachWindow &&
    typeof temporal.finalApproachWindow === 'object'
      ? (temporal.finalApproachWindow as Record<string, unknown>)
      : {};
  const timestampSeconds = Number(takeoff.timestampSeconds);

  return {
    takeoffTimestamp: {
      timestampSeconds: Number.isFinite(timestampSeconds)
        ? timestampSeconds
        : null,
      confidence: asConfidenceLevel(takeoff.confidence) ?? 'low',
      evidence:
        asString(takeoff.evidence) ??
        'takeoff/pop timestamp 근거를 충분히 읽지 못했습니다.',
    },
    finalApproachWindow: {
      startSeconds: asNumber(finalApproach.startSeconds) ?? 0,
      endSeconds: asNumber(finalApproach.endSeconds) ?? 0,
      confidence: asConfidenceLevel(finalApproach.confidence) ?? 'low',
      reasonWindowWasChosen:
        asString(finalApproach.reasonWindowWasChosen) ??
        'final approach window 근거를 충분히 읽지 못했습니다.',
    },
    ignoredSetupWindows: asIgnoredSetupWindows(temporal.ignoredSetupWindows),
    approachWindowConfidence:
      asConfidenceLevel(temporal.approachWindowConfidence) ?? 'low',
  };
}

function asIgnoredSetupWindows(
  value: unknown,
): NonNullable<GeminiEvidenceResult['temporalWindows']>['ignoredSetupWindows'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const candidate = item as Record<string, unknown>;
      const startSeconds = asNumber(candidate.startSeconds);
      const endSeconds = asNumber(candidate.endSeconds);

      if (startSeconds === undefined || endSeconds === undefined) {
        return null;
      }

      return {
        startSeconds,
        endSeconds,
        reason:
          asString(candidate.reason) ??
          'final approach window 이전 setup/slalom 구간입니다.',
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function asApproachObservedFacts(
  value: unknown,
): GeminiEvidenceResult['approachObservedFacts'] {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const facts = value as Record<string, unknown>;
  const wakeCrossingPath =
    facts.wakeCrossingPath && typeof facts.wakeCrossingPath === 'object'
      ? (facts.wakeCrossingPath as Record<string, unknown>)
      : {};

  return {
    stance: asEvidenceFact(facts.stance),
    leadFoot: asEvidenceFact(facts.leadFoot),
    boardDirection: asEvidenceFact(facts.boardDirection),
    wakeCrossingPath: {
      startPosition: asString(wakeCrossingPath.startPosition) ?? 'unknown',
      takeoffPosition: asString(wakeCrossingPath.takeoffPosition) ?? 'unknown',
      landingPosition: asString(wakeCrossingPath.landingPosition) ?? 'unknown',
      direction: asString(wakeCrossingPath.direction) ?? 'unknown',
      confidence: asConfidenceLevel(wakeCrossingPath.confidence) ?? 'low',
      evidence:
        asString(wakeCrossingPath.evidence) ??
        '웨이크 경로 근거를 충분히 읽지 못했습니다.',
    },
    edgeDirectionEvidence: asEvidenceFact(facts.edgeDirectionEvidence),
    handlePosition: asEvidenceFact(facts.handlePosition),
    bodyOrientation: asEvidenceFact(facts.bodyOrientation),
  };
}

function asApproachObservedFactsV2(
  value: unknown,
): GeminiEvidenceResult['approachObservedFactsV2'] {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const facts = value as Record<string, unknown>;
  const boardDirection =
    facts.boardDirection && typeof facts.boardDirection === 'object'
      ? (facts.boardDirection as Record<string, unknown>)
      : {};
  const wakeCrossingPath =
    facts.wakeCrossingPath && typeof facts.wakeCrossingPath === 'object'
      ? (facts.wakeCrossingPath as Record<string, unknown>)
      : {};
  const edgeDirectionEvidence =
    facts.edgeDirectionEvidence && typeof facts.edgeDirectionEvidence === 'object'
      ? (facts.edgeDirectionEvidence as Record<string, unknown>)
      : {};
  const conflictSummary =
    facts.conflictSummary && typeof facts.conflictSummary === 'object'
      ? (facts.conflictSummary as Record<string, unknown>)
      : {};

  return {
    stance: asEvidenceFact(facts.stance),
    leadFoot: asEvidenceFact(facts.leadFoot),
    boardDirection: {
      ...asEvidenceFact(facts.boardDirection),
      frameOfReference: asDirectionFrame(boardDirection.frameOfReference),
      noseDirection: asString(boardDirection.noseDirection),
      travelDirection: asString(boardDirection.travelDirection),
    },
    wakeCrossingPath: {
      startPosition: asString(wakeCrossingPath.startPosition) ?? 'unknown',
      takeoffPosition: asString(wakeCrossingPath.takeoffPosition) ?? 'unknown',
      landingPosition: asString(wakeCrossingPath.landingPosition) ?? 'unknown',
      direction: asString(wakeCrossingPath.direction) ?? 'unknown',
      frameOfReference: asDirectionFrame(wakeCrossingPath.frameOfReference),
      confidence: asConfidenceLevel(wakeCrossingPath.confidence) ?? 'low',
      evidence:
        asString(wakeCrossingPath.evidence) ??
        '웨이크 경로 근거를 충분히 읽지 못했습니다.',
    },
    edgeDirectionEvidence: {
      ...asEvidenceFact(facts.edgeDirectionEvidence),
      loadedEdge: asLoadedEdge(edgeDirectionEvidence.loadedEdge),
    },
    handlePosition: asEvidenceFact(facts.handlePosition),
    bodyOrientation: asEvidenceFact(facts.bodyOrientation),
    signals: asApproachEvidenceSignals(facts.signals),
    conflictSummary: {
      hasConflict: conflictSummary.hasConflict === true,
      toesideSignals: asNumber(conflictSummary.toesideSignals) ?? 0,
      heelsideSignals: asNumber(conflictSummary.heelsideSignals) ?? 0,
      switchSignals: asNumber(conflictSummary.switchSignals) ?? 0,
      conflictFields: asStringArray(conflictSummary.conflictFields),
      reason:
        asString(conflictSummary.reason) ??
        'v2 approach conflict summary가 제공되지 않았습니다.',
    },
  };
}

function asPopObservedFacts(
  value: unknown,
): GeminiEvidenceResult['popObservedFacts'] {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const facts = value as Record<string, unknown>;

  return {
    popType: asString(facts.popType) ?? null,
    timing: asString(facts.timing) ?? null,
    intensity: asString(facts.intensity) ?? null,
    evidenceText: asString(facts.evidenceText) ?? null,
    confidence: asConfidenceLevel(facts.confidence) ?? 'low',
    antiEvidence: asStringArray(facts.antiEvidence),
  };
}

function asEdgeLoadObservedFacts(
  value: unknown,
): GeminiEvidenceResult['edgeLoadObservedFacts'] {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const facts = value as Record<string, unknown>;
  const timing =
    facts.edgeLoadTiming && typeof facts.edgeLoadTiming === 'object'
      ? (facts.edgeLoadTiming as Record<string, unknown>)
      : {};

  return {
    toeEdgeLoaded: asEvidenceFact(facts.toeEdgeLoaded),
    heelEdgeLoaded: asEvidenceFact(facts.heelEdgeLoaded),
    edgeLoadVisible: asEvidenceFact(facts.edgeLoadVisible),
    edgeLoadTiming: {
      startSec: asNumber(timing.startSec) ?? null,
      endSec: asNumber(timing.endSec) ?? null,
      observedMoment: asString(timing.observedMoment) ?? 'unknown',
      evidenceFrameDescription:
        asString(timing.evidenceFrameDescription) ??
        'edge load timing 근거를 충분히 읽지 못했습니다.',
    },
    boardTiltDirection: asEvidenceFact(facts.boardTiltDirection),
    sprayDirection: asEvidenceFact(facts.sprayDirection),
    lineTensionDirection: asEvidenceFact(facts.lineTensionDirection),
    riderWeightOverEdge: asEvidenceFact(facts.riderWeightOverEdge),
    edgeLoadConfidence: asConfidenceLevel(facts.edgeLoadConfidence) ?? 'low',
    edgeLoadEvidenceText: asString(facts.edgeLoadEvidenceText) ?? '',
    antiEdgeLoadEvidence: asStringArray(facts.antiEdgeLoadEvidence),
  };
}

function asEdgeLoadValidation(
  value: unknown,
): GeminiEvidenceResult['edgeLoadValidation'] {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const validation = value as Record<string, unknown>;
  const before = asEdgeLoadObservedFacts(validation.before);
  const after = asEdgeLoadObservedFacts(validation.after);

  if (!before || !after) {
    return undefined;
  }

  return {
    before,
    after,
    adjusted: validation.adjusted === true,
    needsReview: validation.needsReview === true,
    independentPhysicalEvidenceCount:
      asNumber(validation.independentPhysicalEvidenceCount) ?? 0,
    rulesApplied: asStringArray(validation.rulesApplied),
    rejectedHighConfidenceReasons: asStringArray(
      validation.rejectedHighConfidenceReasons,
    ),
  };
}

function asPopValidation(
  value: unknown,
): GeminiEvidenceResult['popValidation'] {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const validation = value as Record<string, unknown>;
  const before = asPopObservedFacts(validation.before);
  const after = asPopObservedFacts(validation.after);

  if (!before || !after) {
    return undefined;
  }

  return {
    before,
    after,
    adjusted: validation.adjusted === true,
    needsReview: validation.needsReview === true,
    independentPhysicalEvidenceCount:
      asNumber(validation.independentPhysicalEvidenceCount) ?? 0,
    rulesApplied: asStringArray(validation.rulesApplied),
    rejectedHighConfidenceReasons: asStringArray(
      validation.rejectedHighConfidenceReasons,
    ),
  };
}

function asRotationObservedFacts(
  value: unknown,
): GeminiEvidenceResult['rotationObservedFacts'] {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const facts = value as Record<string, unknown>;

  return {
    rotationAxis: asString(facts.rotationAxis) ?? null,
    rotationDirection: asString(facts.rotationDirection) ?? null,
    inversionDetected: asObservedBoolean(facts.inversionDetected),
    spinDegrees:
      typeof facts.spinDegrees === 'number'
        ? String(facts.spinDegrees)
        : (asString(facts.spinDegrees) ?? null),
    handlePassObserved: asObservedBoolean(facts.handlePassObserved),
    evidenceText: asString(facts.evidenceText) ?? null,
    confidence: asConfidenceLevel(facts.confidence) ?? 'low',
    antiEvidence: asStringArray(facts.antiEvidence),
  };
}

function asRotationValidation(
  value: unknown,
): GeminiEvidenceResult['rotationValidation'] {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const validation = value as Record<string, unknown>;
  const before = asRotationObservedFacts(validation.before);
  const after = asRotationObservedFacts(validation.after);

  if (!before || !after) {
    return undefined;
  }

  return {
    before,
    after,
    adjusted: validation.adjusted === true,
    needsReview: validation.needsReview === true,
    independentRotationEvidenceCount:
      asNumber(validation.independentRotationEvidenceCount) ?? 0,
    rulesApplied: asStringArray(validation.rulesApplied),
    rejectedHighConfidenceReasons: asStringArray(
      validation.rejectedHighConfidenceReasons,
    ),
  };
}

function asGrabObservedFacts(
  value: unknown,
): GeminiEvidenceResult['grabObservedFacts'] {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const facts = value as Record<string, unknown>;

  return {
    grabDetected: asObservedBoolean(facts.grabDetected),
    contactVisible: asObservedBoolean(facts.contactVisible),
    grabbingHand: asString(facts.grabbingHand) ?? null,
    grabbedBoardZone: asString(facts.grabbedBoardZone) ?? null,
    grabTiming: asString(facts.grabTiming) ?? null,
    grabDuration: asString(facts.grabDuration) ?? null,
    evidenceText: asString(facts.evidenceText) ?? null,
    confidence: asConfidenceLevel(facts.confidence) ?? 'low',
    antiEvidence: asStringArray(facts.antiEvidence),
  };
}

function asGrabValidation(
  value: unknown,
): GeminiEvidenceResult['grabValidation'] {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const validation = value as Record<string, unknown>;
  const before = asGrabObservedFacts(validation.before);
  const after = asGrabObservedFacts(validation.after);

  if (!before || !after) {
    return undefined;
  }

  return {
    before,
    after,
    adjusted: validation.adjusted === true,
    needsReview: validation.needsReview === true,
    independentGrabEvidenceCount:
      asNumber(validation.independentGrabEvidenceCount) ?? 0,
    rulesApplied: asStringArray(validation.rulesApplied),
    rejectedHighConfidenceReasons: asStringArray(
      validation.rejectedHighConfidenceReasons,
    ),
  };
}

function asLandingObservedFacts(
  value: unknown,
): GeminiEvidenceResult['landingObservedFacts'] {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const facts = value as Record<string, unknown>;

  return {
    landingVisible: asObservedBoolean(facts.landingVisible),
    landingOutcome: asString(facts.landingOutcome) ?? null,
    boardContact: asString(facts.boardContact) ?? null,
    edgeOnLanding: asString(facts.edgeOnLanding) ?? null,
    handlePosition: asString(facts.handlePosition) ?? null,
    balanceRecovery: asString(facts.balanceRecovery) ?? null,
    evidenceText: asString(facts.evidenceText) ?? null,
    confidence: asConfidenceLevel(facts.confidence) ?? 'low',
    antiEvidence: asStringArray(facts.antiEvidence),
  };
}

function asLandingValidation(
  value: unknown,
): GeminiEvidenceResult['landingValidation'] {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const validation = value as Record<string, unknown>;
  const before = asLandingObservedFacts(validation.before);
  const after = asLandingObservedFacts(validation.after);

  if (!before || !after) {
    return undefined;
  }

  return {
    before,
    after,
    adjusted: validation.adjusted === true,
    needsReview: validation.needsReview === true,
    independentLandingEvidenceCount:
      asNumber(validation.independentLandingEvidenceCount) ?? 0,
    rulesApplied: asStringArray(validation.rulesApplied),
    rejectedHighConfidenceReasons: asStringArray(
      validation.rejectedHighConfidenceReasons,
    ),
  };
}

function asInversionObservedFacts(
  value: unknown,
): GeminiEvidenceResult['inversionObservedFacts'] {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const facts = value as Record<string, unknown>;
  const duration =
    facts.inversionDuration && typeof facts.inversionDuration === 'object'
      ? (facts.inversionDuration as Record<string, unknown>)
      : {};

  return {
    bodyInverted: asObservedBoolean(facts.bodyInverted),
    boardAboveHead: asObservedBoolean(facts.boardAboveHead),
    rollAxisObserved: asObservedBoolean(facts.rollAxisObserved),
    flipAxisObserved: asObservedBoolean(facts.flipAxisObserved),
    inversionDuration: {
      seconds: asNumber(duration.seconds) ?? null,
      confidence: asConfidenceLevel(duration.confidence) ?? 'low',
      evidence:
        asString(duration.evidence) ??
        '인버전 지속 시간 근거를 충분히 읽지 못했습니다.',
    },
    inversionEvidenceCount:
      asNumber(facts.inversionEvidenceCount) ??
      countPositiveInversionFacts(facts),
    antiInversionEvidence: asStringArray(facts.antiInversionEvidence),
  };
}

function asObservedBoolean(value: unknown): true | false | 'unknown' {
  if (value === true || value === 'true') {
    return true;
  }

  if (value === false || value === 'false') {
    return false;
  }

  return 'unknown';
}

function countPositiveInversionFacts(facts: Record<string, unknown>) {
  return [
    facts.bodyInverted,
    facts.boardAboveHead,
    facts.rollAxisObserved,
    facts.flipAxisObserved,
  ].filter((value) => asObservedBoolean(value) === true).length;
}

function asApproachDecision(
  value: unknown,
): GeminiEvidenceResult['approachDecision'] {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const decision = value as Record<string, unknown>;
  const rawValue = asString(decision.value);
  const approachValue =
    rawValue === 'heelside' ||
    rawValue === 'toeside' ||
    rawValue === 'switch' ||
    rawValue === 'unknown'
      ? rawValue
      : 'unknown';

  return {
    value: approachValue,
    confidence: asConfidenceLevel(decision.confidence) ?? 'low',
    derivedFrom: asStringArray(decision.derivedFrom),
    reasoning: asStringArray(decision.reasoning),
    rejectedAlternatives: asRejectedApproachAlternatives(
      decision.rejectedAlternatives,
    ),
    uncertainty: asStringArray(decision.uncertainty),
  };
}

function asApproachDecisionV2(
  value: unknown,
): GeminiEvidenceResult['approachDecisionV2'] {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const decision = value as Record<string, unknown>;

  return {
    value: asApproachSide(decision.value),
    confidence: asConfidenceLevel(decision.confidence) ?? 'low',
    primaryEvidence: asStringArray(decision.primaryEvidence),
    supportingEvidence: asStringArray(decision.supportingEvidence),
    conflictingEvidence: asStringArray(decision.conflictingEvidence),
    rejectedAlternatives: asRejectedApproachAlternatives(
      decision.rejectedAlternatives,
    ),
    uncertainty: asStringArray(decision.uncertainty),
  };
}

function asApproachEvidenceSignals(
  value: unknown,
): NonNullable<GeminiEvidenceResult['approachObservedFactsV2']>['signals'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const signal = item as Record<string, unknown>;

      return {
        field: asString(signal.field) ?? 'unknown',
        supports: asSignalSupport(signal.supports),
        strength: asSignalStrength(signal.strength),
        confidence: asConfidenceLevel(signal.confidence) ?? 'low',
        evidence:
          asString(signal.evidence) ??
          'approach v2 signal 근거가 제공되지 않았습니다.',
        timestampSeconds: asNumber(signal.timestampSeconds) ?? null,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function asRejectedApproachAlternatives(
  value: unknown,
): NonNullable<GeminiEvidenceResult['approachDecision']>['rejectedAlternatives'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const candidate = item as Record<string, unknown>;
      const rawValue = asString(candidate.value);

      if (
        rawValue !== 'heelside' &&
        rawValue !== 'toeside' &&
        rawValue !== 'switch'
      ) {
        return null;
      }

      return {
        value: rawValue as 'heelside' | 'toeside' | 'switch',
        reason: asString(candidate.reason) ?? '근거가 부족합니다.',
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function asApproachSide(
  value: unknown,
): NonNullable<GeminiEvidenceResult['approachDecisionV2']>['value'] {
  return value === 'heelside' ||
    value === 'toeside' ||
    value === 'switch' ||
    value === 'unknown' ||
    value === 'ambiguous'
    ? value
    : 'unknown';
}

function asSignalSupport(
  value: unknown,
): NonNullable<
  GeminiEvidenceResult['approachObservedFactsV2']
>['signals'][number]['supports'] {
  return value === 'heelside' ||
    value === 'toeside' ||
    value === 'switch' ||
    value === 'unknown'
    ? value
    : 'unknown';
}

function asDirectionFrame(
  value: unknown,
): NonNullable<
  GeminiEvidenceResult['approachObservedFactsV2']
>['boardDirection']['frameOfReference'] {
  return value === 'boat' ||
    value === 'camera' ||
    value === 'rider' ||
    value === 'unknown'
    ? value
    : 'unknown';
}

function asLoadedEdge(
  value: unknown,
): NonNullable<
  GeminiEvidenceResult['approachObservedFactsV2']
>['edgeDirectionEvidence']['loadedEdge'] {
  return value === 'toe_edge' || value === 'heel_edge' || value === 'unknown'
    ? value
    : 'unknown';
}

function asSignalStrength(
  value: unknown,
): NonNullable<
  GeminiEvidenceResult['approachObservedFactsV2']
>['signals'][number]['strength'] {
  return value === 'primary' || value === 'supporting' || value === 'weak'
    ? value
    : 'weak';
}

function asEvidenceWindows(value: unknown): GeminiEvidenceResult['evidenceWindows'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const candidate = item as Record<string, unknown>;
      const startSeconds = Number(candidate.startSeconds);
      const endSeconds = Number(candidate.endSeconds);

      if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) {
        return null;
      }

      return {
        startSeconds,
        endSeconds,
        label: asString(candidate.label) ?? '근거 구간',
        evidence: asString(candidate.evidence) ?? '해당 구간에 동작 근거가 있습니다.',
        confidence: asConfidenceLevel(candidate.confidence) ?? 'low',
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function asMotionObservations(value: unknown): GeminiEvidenceResult['observations'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const candidate = item as Record<string, unknown>;

      return {
        timestampLabel: asString(candidate.timestampLabel) ?? '확인 필요',
        label: asString(candidate.label) ?? `관찰 ${index + 1}`,
        detail: asString(candidate.detail) ?? '관찰 내용을 읽지 못했습니다.',
        confidence: asConfidenceLevel(candidate.confidence) ?? 'low',
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function asEvidenceUncertainty(
  value: unknown,
): GeminiEvidenceResult['uncertainty'] {
  if (!value || typeof value !== 'object') {
    return {
      level: 'medium',
      reasons: ['불확실성 정보가 충분히 제공되지 않았습니다.'],
    };
  }

  const candidate = value as Record<string, unknown>;

  return {
    level: asConfidenceLevel(candidate.level) ?? 'medium',
    reasons: asStringArray(candidate.reasons),
  };
}

function asQualityMode(value: unknown): GeminiEvidenceResult['qualityMode'] {
  return value === 'standard' || value === 'degraded' ? value : undefined;
}

function asKnowledgeInsights(
  value: unknown,
): GeminiEvidenceResult['knowledgeInsights'] {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const insights = value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const candidate = item as Record<string, unknown>;
      const confidence = asConfidenceLevel(candidate.confidence);
      const category = asString(candidate.category);
      const severity = asString(candidate.severity);

      if (!confidence || !category || !severity) {
        return null;
      }

      return {
        id: asString(candidate.id) ?? `knowledge-${Date.now()}`,
        ruleId: asString(candidate.ruleId) ?? 'unknown-rule',
        category: category as NonNullable<
          GeminiEvidenceResult['knowledgeInsights']
        >[number]['category'],
        message: asString(candidate.message) ?? '',
        sourceFacts: asStringArray(candidate.sourceFacts),
        confidence,
        severity: severity as NonNullable<
          GeminiEvidenceResult['knowledgeInsights']
        >[number]['severity'],
        requiresReview: candidate.requiresReview === true,
        coachingSafe: candidate.coachingSafe === true,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return insights.length > 0 ? insights : undefined;
}

function asCandidateTrace(
  value: unknown,
): GeminiEvidenceResult['candidateTrace'] {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  const safePredictedTrick = asString(candidate.safePredictedTrick);
  const safeFamily = asString(candidate.safeFamily);
  const confidence = asConfidenceLevel(candidate.confidence);

  if (!safePredictedTrick || !safeFamily || !confidence) {
    return undefined;
  }

  return {
    rawCandidateName: asString(candidate.rawCandidateName),
    rawFamily: asString(candidate.rawFamily),
    rawRotationType: asString(candidate.rawRotationType),
    safePredictedTrick,
    safeFamily,
    observedSignals: asStringArray(candidate.observedSignals),
    downgradedBy: asStringArray(candidate.downgradedBy),
    needsReview: candidate.needsReview === true,
    displayLabel: asString(candidate.displayLabel),
    confidence,
  };
}

function asCoachingInsightContext(
  value: unknown,
): GeminiEvidenceResult['coachingInsightContext'] {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const contexts = value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const candidate = item as Record<string, unknown>;
      const mode = asCoachingInsightMode(candidate.mode);
      const category = asString(candidate.category);
      const confidence = asConfidenceLevel(candidate.confidence);
      const severity = asString(candidate.severity);

      if (!mode || !category || !confidence || !severity) {
        return null;
      }

      return {
        mode,
        sourceRuleId: asString(candidate.sourceRuleId) ?? 'unknown-rule',
        category: category as NonNullable<
          GeminiEvidenceResult['coachingInsightContext']
        >[number]['category'],
        message: asString(candidate.message) ?? '',
        confidence,
        severity: severity as NonNullable<
          GeminiEvidenceResult['coachingInsightContext']
        >[number]['severity'],
        requiresReview: candidate.requiresReview === true,
        coachingSafe: candidate.coachingSafe === true,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return contexts.length > 0 ? contexts : undefined;
}

function asCoachingInsightMode(
  value: unknown,
): NonNullable<GeminiEvidenceResult['coachingInsightContext']>[number]['mode'] | undefined {
  if (
    value === 'direct_cue' ||
    value === 'review_context' ||
    value === 'internal_only'
  ) {
    return value;
  }

  return undefined;
}

function asConsistencyStatus(
  value: unknown,
): GeminiEvidenceResult['consistencyStatus'] {
  return value === 'valid' || value === 'inconsistent' || value === 'needs_review'
    ? value
    : undefined;
}

function asSelfCritique(value: unknown): AnalysisResult['selfCritique'] {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;

  return {
    limitations: asStringArray(candidate.limitations),
    whatWouldImproveAnalysis: asStringArray(candidate.whatWouldImproveAnalysis),
  };
}

function asHighlightScenes(value: unknown): AnalysisResult['highlightScenes'] {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .map((item, index) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const scene = item as Record<string, unknown>;

      return {
        id: asString(scene.id) ?? `highlight-${index}`,
        timestampLabel: asString(scene.timestampLabel) ?? '0:00',
        title: asString(scene.title) ?? '하이라이트',
        description: asString(scene.description) ?? '장면 설명이 준비되었습니다.',
        imageUri: asString(scene.imageUri),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function asConfidence(value: unknown): AnalysisResult['confidence'] {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  const level = candidate.level;

  if (level !== 'high' && level !== 'medium' && level !== 'low') {
    return undefined;
  }

  return {
    level,
    reason: asString(candidate.reason),
  };
}

function asCoachingObservations(
  value: unknown,
): AnalysisResult['coachingObservations'] {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const observations = value
    .map((item, index) => {
      if (typeof item === 'string') {
        return {
          label: `관찰 ${index + 1}`,
          detail: item,
        };
      }

      if (!item || typeof item !== 'object') {
        return null;
      }

      const candidate = item as Record<string, unknown>;
      const confidence = asConfidenceLevel(candidate.confidence);

      return {
        label:
          asString(candidate.label) ??
          asString(candidate.pattern) ??
          asString(candidate.inference) ??
          asString(candidate.timestampLabel) ??
          `관찰 ${index + 1}`,
        detail:
          asString(candidate.detail) ??
          asString(candidate.evidence) ??
          asString(candidate.impact) ??
          asString(candidate.coachingImplication) ??
          asString(candidate.coachingRelevance) ??
          '',
        confidence,
      };
    })
    .filter((item): item is NonNullable<typeof item> =>
      Boolean(item && item.detail),
    );

  return observations.length > 0 ? observations : undefined;
}

function asConfidenceLevel(value: unknown): 'high' | 'medium' | 'low' | undefined {
  return value === 'high' || value === 'medium' || value === 'low'
    ? value
    : undefined;
}

async function readRemoteErrorMessage(response: Response): Promise<string | undefined> {
  try {
    const data = (await response.json()) as RemoteErrorResponse;

    return asString(data.error);
  } catch {
    return undefined;
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined;
}

function asNumber(value: unknown): number | undefined {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is string => typeof item === 'string' && item.length > 0,
  );
}
