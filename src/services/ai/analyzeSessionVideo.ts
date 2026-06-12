import type { AnalysisResult, GeminiEvidenceResult, Session } from '../../types';

export type SessionVideoAsset = {
  uri: string;
  fileName?: string | null;
  fileSize?: number;
  mimeType?: string | null;
  duration?: number | null;
};

export type AnalyzeSessionVideoInput = {
  session: Session;
  activityGroupName: string;
  video: SessionVideoAsset;
  userConfirmedTrick?: string;
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
  rawResponseText?: unknown;
  primaryCandidate?: unknown;
  alternativeCandidates?: unknown;
  family?: unknown;
  approachType?: unknown;
  rotationType?: unknown;
  landingOutcome?: unknown;
  confidence?: unknown;
  evidence?: unknown;
  evidenceWindows?: unknown;
  observations?: unknown;
  uncertainty?: unknown;
  createdAt?: unknown;
};

type RemoteErrorResponse = {
  error?: unknown;
};

const analysisEndpoint = process.env.EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT;
const geminiEvidenceEndpoint = analysisEndpoint?.replace(
  /\/api\/analyze-session-video$/,
  '/api/extract-session-evidence',
);
const openAiBenchmarkEndpoint = analysisEndpoint?.replace(
  /\/api\/analyze-session-video$/,
  '/api/benchmarks/openai-wakeboard-video',
);

export function hasConfiguredAnalysisEndpoint() {
  return Boolean(analysisEndpoint);
}

export async function analyzeSessionVideo({
  session,
  activityGroupName,
  video,
  userConfirmedTrick,
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
  });
}

export function hasConfiguredGeminiEvidenceEndpoint() {
  return Boolean(geminiEvidenceEndpoint);
}

export async function extractSessionEvidenceWithGemini({
  session,
  activityGroupName,
  video,
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
    userConfirmedTrick,
  });

  return normalizeRemoteEvidence(data as RemoteEvidenceResponse, session.id);
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
}: AnalyzeSessionVideoInput & { endpoint: string }): Promise<AnalysisResult> {
  const data = await requestRemoteJson({
    endpoint,
    session,
    activityGroupName,
    video,
    userConfirmedTrick,
  });

  return normalizeRemoteAnalysis(data as RemoteAnalysisResponse, session.id);
}

async function requestRemoteJson({
  endpoint,
  session,
  activityGroupName,
  video,
  userConfirmedTrick,
}: AnalyzeSessionVideoInput & { endpoint: string }): Promise<unknown> {
  const formData = new FormData();

  formData.append('sessionId', session.id);
  formData.append('activityGroupName', activityGroupName);
  formData.append('title', session.title);
  formData.append('notes', session.notes ?? '');
  formData.append('occurredAt', session.occurredAt);
  if (typeof userConfirmedTrick === 'string' && userConfirmedTrick.trim()) {
    formData.append('userConfirmedTrick', userConfirmedTrick.trim());
  }
  formData.append('video', {
    uri: video.uri,
    name: video.fileName ?? `${session.id}.mov`,
    type: video.mimeType ?? 'video/quicktime',
  } as unknown as Blob);

  const response = await fetch(endpoint, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const message = await readRemoteErrorMessage(response);

    throw new Error(message ?? `Analysis request failed with ${response.status}`);
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
    rawResponseText: asString(data.rawResponseText),
    primaryCandidate: asTrickCandidate(data.primaryCandidate),
    alternativeCandidates: asTrickCandidates(data.alternativeCandidates),
    family: asEvidenceFact(data.family),
    approachType: asEvidenceFact(data.approachType),
    rotationType: asEvidenceFact(data.rotationType),
    landingOutcome: asEvidenceFact(data.landingOutcome),
    confidence: asConfidenceLevel(data.confidence) ?? 'low',
    evidence: asString(data.evidence) ?? 'AI 추정 근거가 충분히 제공되지 않았습니다.',
    evidenceWindows: asEvidenceWindows(data.evidenceWindows),
    observations: asMotionObservations(data.observations),
    uncertainty: asEvidenceUncertainty(data.uncertainty),
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

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is string => typeof item === 'string' && item.length > 0,
  );
}
