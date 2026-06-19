import type {
  CandidateTrace,
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

type UpdateMomentStatusResponse = {
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
      title: session.title ?? null,
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
    return undefined;
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

  const data = (await response.json()) as UpdateMomentStatusResponse;

  return asMomentStatus(data.status);
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
  const status = asMomentStatus(moment.status);
  const fileName = asString(moment.fileName);
  const fileSize = asNumber(moment.fileSize);
  const latestEvidenceResult = asRecord(moment.latestEvidenceResult);

  if (
    isIncompleteQueuedMoment({
      status,
      sourceVideoUri,
      fileName,
      fileSize,
      durationMs,
      latestEvidenceResult,
    })
  ) {
    return null;
  }

  const sessionId = asString(moment.sessionId) ?? remoteMomentId;
  const session: Session = {
    id: sessionId,
    activityGroupId: normalizeActivityGroupId(asString(moment.activityGroupId)),
    title: asString(moment.title),
    notes: asString(moment.notes),
    occurredAt,
    videoUri: sourceVideoUri,
    momentStatus: status,
    shareResultIds: [],
    createdAt: asString(moment.createdAt) ?? occurredAt,
    updatedAt: asString(moment.updatedAt) ?? occurredAt,
  };
  const video = sourceVideoUri
    ? {
        uri: sourceVideoUri,
        fileName,
        fileSize,
        mimeType: asString(moment.mimeType),
        duration: typeof durationMs === 'number' ? durationMs : null,
      }
    : undefined;
  const evidence = normalizeRemoteEvidenceResult(
    latestEvidenceResult,
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
  const approachObservedFacts = asRecord(evidence.approach_observed_facts) as
    | GeminiEvidenceResult['approachObservedFacts']
    | undefined;
  const approachObservedFactsV2 = asRecord(evidence.approach_observed_facts_v2) as
    | GeminiEvidenceResult['approachObservedFactsV2']
    | undefined;
  const approachDecisionV2 = asRecord(evidence.approach_decision_v2) as
    | GeminiEvidenceResult['approachDecisionV2']
    | undefined;
  const popObservedFacts = asRecord(evidence.pop_observed_facts) as
    | GeminiEvidenceResult['popObservedFacts']
    | undefined;
  const popValidation = asRecord(evidence.pop_validation) as
    | GeminiEvidenceResult['popValidation']
    | undefined;
  const rotationObservedFacts = asRecord(evidence.rotation_observed_facts) as
    | GeminiEvidenceResult['rotationObservedFacts']
    | undefined;
  const rotationValidation = asRecord(evidence.rotation_validation) as
    | GeminiEvidenceResult['rotationValidation']
    | undefined;
  const grabObservedFacts = asRecord(evidence.grab_observed_facts) as
    | GeminiEvidenceResult['grabObservedFacts']
    | undefined;
  const grabValidation = asRecord(evidence.grab_validation) as
    | GeminiEvidenceResult['grabValidation']
    | undefined;
  const landingObservedFacts = asRecord(evidence.landing_observed_facts) as
    | GeminiEvidenceResult['landingObservedFacts']
    | undefined;
  const landingValidation = asRecord(evidence.landing_validation) as
    | GeminiEvidenceResult['landingValidation']
    | undefined;
  const inversionObservedFacts = asRecord(evidence.inversion_observed_facts) as
    | GeminiEvidenceResult['inversionObservedFacts']
    | undefined;
  const candidateTrace = deriveRestoredCandidateTrace({
    predictedTrick,
    family,
    confidence,
    needsReview: evidence.needs_review === true,
    approachDecisionV2,
    popObservedFacts,
    rotationObservedFacts,
    rotationValidation,
    inversionObservedFacts,
  });

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
    approachObservedFacts,
    approachObservedFactsV2,
    popObservedFacts,
    popValidation,
    rotationObservedFacts,
    rotationValidation,
    grabObservedFacts,
    grabValidation,
    landingObservedFacts,
    landingValidation,
    inversionObservedFacts,
    approachDecisionV2,
    candidateTrace,
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

function deriveRestoredCandidateTrace({
  predictedTrick,
  family,
  confidence,
  needsReview,
  approachDecisionV2,
  popObservedFacts,
  rotationObservedFacts,
  rotationValidation,
  inversionObservedFacts,
}: {
  predictedTrick: string;
  family: string;
  confidence: EvidenceConfidence;
  needsReview: boolean;
  approachDecisionV2?: GeminiEvidenceResult['approachDecisionV2'];
  popObservedFacts?: GeminiEvidenceResult['popObservedFacts'];
  rotationObservedFacts?: GeminiEvidenceResult['rotationObservedFacts'];
  rotationValidation?: GeminiEvidenceResult['rotationValidation'];
  inversionObservedFacts?: GeminiEvidenceResult['inversionObservedFacts'];
}): CandidateTrace | undefined {
  const observedSignals = compactStrings([
    approachDecisionV2?.value &&
    approachDecisionV2.value !== 'unknown' &&
    approachDecisionV2.value !== 'ambiguous'
      ? `approach=${approachDecisionV2.value}/${approachDecisionV2.confidence}`
      : undefined,
    popObservedFacts
      ? `pop=${[popObservedFacts.popType, popObservedFacts.timing, popObservedFacts.intensity]
          .filter(Boolean)
          .join('/')}/${popObservedFacts.confidence}`
      : undefined,
    rotationObservedFacts?.rotationAxis
      ? `rotationAxis=${rotationObservedFacts.rotationAxis}/${rotationObservedFacts.confidence}`
      : undefined,
    rotationObservedFacts?.inversionDetected !== undefined
      ? `inversionDetected=${String(rotationObservedFacts.inversionDetected)}`
      : undefined,
    inversionObservedFacts?.boardAboveHead === true
      ? 'boardAboveHead=true'
      : undefined,
    inversionObservedFacts?.bodyInverted === true
      ? 'bodyInverted=true'
      : undefined,
    inversionObservedFacts?.rollAxisObserved === true
      ? 'rollAxisObserved=true'
      : undefined,
  ]);
  const isUnknownTopLevel =
    predictedTrick === '확인 필요' ||
    predictedTrick.toLowerCase().includes('unknown');
  const hasBackRollSignals =
    approachDecisionV2?.value === 'heelside' &&
    rotationObservedFacts?.rotationAxis === 'roll_axis' &&
    rotationObservedFacts.inversionDetected === true &&
    (inversionObservedFacts?.boardAboveHead === true ||
      inversionObservedFacts?.bodyInverted === true ||
      inversionObservedFacts?.rollAxisObserved === true);

  if (!isUnknownTopLevel || !hasBackRollSignals) {
    return undefined;
  }

  return {
    safePredictedTrick: predictedTrick,
    safeFamily: family,
    observedSignals,
    downgradedBy: compactStrings([
      needsReview ? 'persisted evidence result requires review' : undefined,
      rotationValidation?.needsReview
        ? 'rotationValidation requires review'
        : undefined,
    ]),
    needsReview: true,
    displayLabel: '관찰된 가능성: 백롤 계열 · 확인 필요',
    confidence,
  };
}

function compactStrings(values: Array<string | undefined>) {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => Boolean(value && value.trim()))
        .map((value) => value.trim()),
    ),
  );
}

function isIncompleteQueuedMoment({
  status,
  sourceVideoUri,
  fileName,
  fileSize,
  durationMs,
  latestEvidenceResult,
}: {
  status?: MomentStatus;
  sourceVideoUri?: string;
  fileName?: string;
  fileSize?: number;
  durationMs?: number;
  latestEvidenceResult?: Record<string, unknown>;
}) {
  if (status !== 'queued') {
    return false;
  }

  if (latestEvidenceResult) {
    return false;
  }

  return (
    !sourceVideoUri &&
    !fileName &&
    !isPositiveNumber(fileSize) &&
    !isPositiveNumber(durationMs)
  );
}

function isPositiveNumber(value?: number) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
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
