import type {
  EvidenceConfidence,
  GeminiEvidenceResult,
  MomentStatus,
  Session,
} from '../../types';
import type { SessionVideoAsset } from '../ai';

type CreateMomentResponse = {
  momentId?: unknown;
  status?: unknown;
};

export type RemoteMomentRecord = {
  remoteMomentId: string;
  session: Session;
  video?: SessionVideoAsset;
  thumbnailUri?: string;
  evidence?: GeminiEvidenceResult;
};

type RemoteErrorResponse = {
  error?: unknown;
};

type RemoteMomentListResponse = {
  moments?: unknown;
};

const analysisEndpoint = process.env.EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT;
const momentsEndpoint = analysisEndpoint?.replace(
  /\/api\/analyze-session-video$/,
  '/api/moments',
);

export function hasConfiguredSupabaseMoments() {
  return Boolean(momentsEndpoint);
}

export async function insertMoment(session: Session, video?: SessionVideoAsset | null) {
  if (!momentsEndpoint) {
    return undefined;
  }

  const response = await fetch(momentsEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId: session.id,
      activityGroupId: session.activityGroupId,
      title: session.title,
      notes: session.notes ?? null,
      occurredAt: session.occurredAt,
      sourceVideoUri: session.videoUri ?? video?.uri ?? null,
      fileName: video?.fileName ?? null,
      mimeType: video?.mimeType ?? null,
      fileSize: video?.fileSize ?? null,
      durationMs:
        typeof video?.duration === 'number' && Number.isFinite(video.duration)
          ? Math.round(video.duration)
          : null,
      status: session.momentStatus ?? 'queued',
    }),
  });

  if (!response.ok) {
    const message = await readRemoteErrorMessage(response);

    throw new Error(message ?? `Moment insert failed with ${response.status}`);
  }

  const data = (await response.json()) as CreateMomentResponse;

  return typeof data.momentId === 'string' ? data.momentId : undefined;
}

export async function updateMomentStatus(
  momentId: string,
  status: MomentStatus,
) {
  if (!momentsEndpoint) {
    return;
  }

  const response = await fetch(`${momentsEndpoint}/${momentId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status }),
  });

  if (!response.ok) {
    const message = await readRemoteErrorMessage(response);

    throw new Error(message ?? `Moment status update failed with ${response.status}`);
  }
}

export async function listMoments() {
  if (!momentsEndpoint) {
    return [];
  }

  const response = await fetch(momentsEndpoint);

  if (!response.ok) {
    const message = await readRemoteErrorMessage(response);

    throw new Error(message ?? `Moment list failed with ${response.status}`);
  }

  const data = (await response.json()) as RemoteMomentListResponse;

  if (!Array.isArray(data.moments)) {
    return [];
  }

  return data.moments
    .map(normalizeRemoteMoment)
    .filter((moment): moment is RemoteMomentRecord => Boolean(moment));
}

async function readRemoteErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as RemoteErrorResponse;

    return typeof data.error === 'string' ? data.error : undefined;
  } catch {
    return undefined;
  }
}

function normalizeRemoteMoment(value: unknown): RemoteMomentRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const moment = value as Record<string, unknown>;
  const remoteMomentId = asString(moment.id);

  if (!remoteMomentId) {
    return null;
  }

  const now = new Date().toISOString();
  const occurredAt = asString(moment.occurredAt) ?? now;
  const sourceVideoUri = asString(moment.sourceVideoUri);
  const durationMs = asNumber(moment.durationMs);
  const sessionId = asString(moment.sessionId) ?? remoteMomentId;
  const session: Session = {
    id: sessionId,
    activityGroupId: normalizeActivityGroupId(asString(moment.activityGroupId)),
    title: asString(moment.title) ?? 'Untitled moment',
    notes: asString(moment.notes),
    occurredAt,
    videoUri: sourceVideoUri,
    momentStatus: asMomentStatus(moment.status),
    shareResultIds: [],
    createdAt: asString(moment.createdAt) ?? occurredAt,
    updatedAt: asString(moment.updatedAt) ?? occurredAt,
  };
  const video = sourceVideoUri
    ? {
        uri: sourceVideoUri,
        fileName: asString(moment.fileName),
        fileSize: asNumber(moment.fileSize),
        mimeType: asString(moment.mimeType),
        duration: typeof durationMs === 'number' ? durationMs : null,
      }
    : undefined;
  const evidence = normalizeRemoteEvidenceResult(
    moment.latestEvidenceResult,
    session.id,
  );

  return {
    remoteMomentId,
    session,
    video,
    thumbnailUri: asString(moment.thumbnailUri),
    evidence,
  };
}

function normalizeRemoteEvidenceResult(
  value: unknown,
  sessionId: string,
): GeminiEvidenceResult | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const evidence = value as Record<string, unknown>;
  const createdAt = asString(evidence.created_at) ?? new Date().toISOString();
  const confidence = asConfidence(evidence.confidence) ?? 'low';
  const predictedTrick = asString(evidence.predicted_trick) ?? '확인 필요';
  const family = asString(evidence.family) ?? '확인 필요';
  const errorMessage = asString(evidence.error_message);

  return {
    id: asString(evidence.id) ?? `evidence-${Date.now()}`,
    sessionId,
    status: evidence.status === 'failed' ? 'failed' : 'completed',
    provider: 'gemini',
    model: asString(evidence.model),
    qualityMode:
      evidence.quality_mode === 'degraded' || evidence.quality_mode === 'standard'
        ? evidence.quality_mode
        : undefined,
    requiresUserConfirmation: evidence.needs_review === true,
    consistencyStatus: asConsistencyStatus(evidence.consistency_status),
    consistencyWarnings: asStringArray(evidence.consistency_warnings),
    rawResponseText: asString(evidence.raw_response_text),
    primaryCandidate: {
      name: predictedTrick,
      confidence,
      evidence: errorMessage ?? 'Supabase에 저장된 최신 evidence result입니다.',
    },
    alternativeCandidates: [],
    family: {
      value: family,
      confidence,
      evidence: 'Supabase에 저장된 최신 family result입니다.',
    },
    temporalWindows: asRecord(evidence.temporal_windows) as
      | GeminiEvidenceResult['temporalWindows']
      | undefined,
    approachObservedFacts: asRecord(evidence.approach_observed_facts) as
      | GeminiEvidenceResult['approachObservedFacts']
      | undefined,
    approachObservedFactsV2: asRecord(evidence.approach_observed_facts_v2) as
      | GeminiEvidenceResult['approachObservedFactsV2']
      | undefined,
    popObservedFacts: asRecord(evidence.pop_observed_facts) as
      | GeminiEvidenceResult['popObservedFacts']
      | undefined,
    popValidation: asRecord(evidence.pop_validation) as
      | GeminiEvidenceResult['popValidation']
      | undefined,
    inversionObservedFacts: asRecord(evidence.inversion_observed_facts) as
      | GeminiEvidenceResult['inversionObservedFacts']
      | undefined,
    approachDecisionV2: asRecord(evidence.approach_decision_v2) as
      | GeminiEvidenceResult['approachDecisionV2']
      | undefined,
    approachType: {
      value: '확인 필요',
      confidence: 'low',
      evidence: '저장된 approachType 요약은 아직 별도 컬럼으로 보관하지 않습니다.',
    },
    rotationType: {
      value: '확인 필요',
      confidence: 'low',
      evidence: '저장된 rotationType 요약은 아직 별도 컬럼으로 보관하지 않습니다.',
    },
    landingOutcome: {
      value: '확인 필요',
      confidence: 'low',
      evidence: '저장된 landingOutcome 요약은 아직 별도 컬럼으로 보관하지 않습니다.',
    },
    confidence,
    evidence: errorMessage ?? 'Supabase에서 복원한 최신 evidence result입니다.',
    evidenceWindows: asArray(evidence.evidence_windows) as
      GeminiEvidenceResult['evidenceWindows'],
    observations: asArray(evidence.observations) as GeminiEvidenceResult['observations'],
    uncertainty: {
      level: confidence,
      reasons: errorMessage ? [errorMessage] : [],
    },
    createdAt,
  };
}

function normalizeActivityGroupId(value?: string) {
  if (!value || value === 'wakeboard') {
    return 'group-wakeboard';
  }

  return value;
}

function asMomentStatus(value: unknown): MomentStatus | undefined {
  if (
    value === 'queued' ||
    value === 'processing' ||
    value === 'completed' ||
    value === 'failed'
  ) {
    return value;
  }

  return undefined;
}

function asConsistencyStatus(
  value: unknown,
): GeminiEvidenceResult['consistencyStatus'] {
  if (
    value === 'valid' ||
    value === 'inconsistent' ||
    value === 'needs_review'
  ) {
    return value;
  }

  return undefined;
}

function asConfidence(value: unknown): EvidenceConfidence | undefined {
  if (value === 'high' || value === 'medium' || value === 'low') {
    return value;
  }

  return undefined;
}

function asString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown) {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}
