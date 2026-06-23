import type { RemoteMomentRecord } from '../../services/moments';
import type { MomentStatus, Session } from '../../types';

export type UploadReconciliationCandidate = {
  createdAt: string;
  draftId?: string;
  durationMs?: number | null;
  fileName?: string | null;
  fileSize?: number | null;
  localSessionId: string;
  occurredAt: string;
  recoveryAttemptedAt?: string;
  storageBucket?: string;
  sourceVideoUri?: string | null;
  storageProvider?: string;
  storagePath?: string;
  thumbnailStorageBucket?: string;
  thumbnailStoragePath?: string;
  thumbnailStorageProvider?: string;
  uploadId?: string;
};

export type RemoteMomentSessionResolution = {
  matchReason: string;
  sessionId: string;
};

export function resolveLocalSessionIdForRemoteMoment(
  remoteMoment: RemoteMomentRecord,
  remoteMomentIdsBySessionId: Record<string, string>,
  sessions: Session[],
  uploadReconciliationCandidatesBySessionId: Record<
    string,
    UploadReconciliationCandidate
  > = {},
) {
  return resolveLocalSessionForRemoteMoment(
    remoteMoment,
    remoteMomentIdsBySessionId,
    sessions,
    uploadReconciliationCandidatesBySessionId,
  ).sessionId;
}

export function resolveLocalSessionForRemoteMoment(
  remoteMoment: RemoteMomentRecord,
  remoteMomentIdsBySessionId: Record<string, string>,
  sessions: Session[],
  uploadReconciliationCandidatesBySessionId: Record<
    string,
    UploadReconciliationCandidate
  > = {},
): RemoteMomentSessionResolution {
  const existingLocalSessionId = Object.entries(remoteMomentIdsBySessionId).find(
    ([, remoteMomentId]) => remoteMomentId === remoteMoment.remoteMomentId,
  )?.[0];

  if (existingLocalSessionId) {
    return {
      matchReason: 'remote_moment_id',
      sessionId: existingLocalSessionId,
    };
  }

  const exactSessionId = sessions.find(
    (session) => session.id === remoteMoment.session.id,
  )?.id;

  if (exactSessionId) {
    return {
      matchReason: 'session_id',
      sessionId: exactSessionId,
    };
  }

  const videoMatchedSessionId = sessions.find(
    (session) =>
      remoteMoment.session.videoUri &&
      session.videoUri === remoteMoment.session.videoUri,
  )?.id;

  if (videoMatchedSessionId) {
    return {
      matchReason: 'source_video_uri',
      sessionId: videoMatchedSessionId,
    };
  }

  const uploadCandidateMatch = findUploadReconciliationCandidateMatch({
    remoteMoment,
    uploadReconciliationCandidatesBySessionId,
  });

  if (uploadCandidateMatch) {
    return uploadCandidateMatch;
  }

  const createdMomentSessionId = sessions.find(
    (session) =>
      session.title === remoteMoment.session.title &&
      session.occurredAt === remoteMoment.session.occurredAt,
  )?.id;

  if (createdMomentSessionId) {
    return {
      matchReason: 'title_occurred_at',
      sessionId: createdMomentSessionId,
    };
  }

  return {
    matchReason: 'remote_session_id',
    sessionId: remoteMoment.session.id,
  };
}

export function mergeMomentStatus(
  localStatus?: MomentStatus,
  remoteStatus?: MomentStatus,
): MomentStatus | undefined {
  if (remoteStatus === 'completed') {
    return 'completed';
  }

  if (remoteStatus === 'processing' || remoteStatus === 'queued') {
    return remoteStatus;
  }

  if (localStatus === 'uploading' && remoteStatus === 'upload_failed') {
    return 'uploading';
  }

  return remoteStatus ?? localStatus;
}

function findUploadReconciliationCandidateMatch({
  remoteMoment,
  uploadReconciliationCandidatesBySessionId,
}: {
  remoteMoment: RemoteMomentRecord;
  uploadReconciliationCandidatesBySessionId: Record<
    string,
    UploadReconciliationCandidate
  >;
}): RemoteMomentSessionResolution | null {
  const candidates = Object.values(uploadReconciliationCandidatesBySessionId);
  let bestMatch: {
    distanceMs: number;
    reason: string;
    sessionId: string;
  } | null = null;

  for (const candidate of candidates) {
    const fileSizeMatches =
      isSamePositiveNumber(candidate.fileSize, remoteMoment.video?.fileSize);
    const durationMatches = isNearbyDuration(
      candidate.durationMs,
      remoteMoment.video?.duration,
    );
    const occurredDistanceMs = Math.abs(
      Date.parse(candidate.occurredAt) -
        Date.parse(remoteMoment.session.occurredAt),
    );
    const occurredAtMatches =
      Number.isFinite(occurredDistanceMs) && occurredDistanceMs <= 5 * 60_000;
    const videoUriMatches =
      Boolean(candidate.sourceVideoUri) &&
      candidate.sourceVideoUri === remoteMoment.session.videoUri;
    const exactRemoteSessionMatches =
      candidate.localSessionId === remoteMoment.session.id;

    if (
      exactRemoteSessionMatches &&
      (fileSizeMatches || durationMatches || occurredAtMatches)
    ) {
      const distanceMs = Number.isFinite(occurredDistanceMs)
        ? occurredDistanceMs
        : Number.MAX_SAFE_INTEGER;

      if (!bestMatch || distanceMs < bestMatch.distanceMs) {
        bestMatch = {
          distanceMs,
          reason: 'upload_context_session_id',
          sessionId: candidate.localSessionId,
        };
      }

      continue;
    }

    if (videoUriMatches && (fileSizeMatches || durationMatches)) {
      const distanceMs = Number.isFinite(occurredDistanceMs)
        ? occurredDistanceMs
        : Number.MAX_SAFE_INTEGER;

      if (!bestMatch || distanceMs < bestMatch.distanceMs) {
        bestMatch = {
          distanceMs,
          reason: 'upload_context_video_uri',
          sessionId: candidate.localSessionId,
        };
      }

      continue;
    }

    if (fileSizeMatches && durationMatches && occurredAtMatches) {
      if (!bestMatch || occurredDistanceMs < bestMatch.distanceMs) {
        bestMatch = {
          distanceMs: occurredDistanceMs,
          reason: 'upload_context_file_duration_occurred_at',
          sessionId: candidate.localSessionId,
        };
      }
    }
  }

  return bestMatch
    ? {
        matchReason: bestMatch.reason,
        sessionId: bestMatch.sessionId,
      }
    : null;
}

function isSamePositiveNumber(left?: number | null, right?: number | null) {
  return (
    typeof left === 'number' &&
    typeof right === 'number' &&
    Number.isFinite(left) &&
    Number.isFinite(right) &&
    left > 0 &&
    right > 0 &&
    Math.round(left) === Math.round(right)
  );
}

function isNearbyDuration(left?: number | null, right?: number | null) {
  return (
    typeof left === 'number' &&
    typeof right === 'number' &&
    Number.isFinite(left) &&
    Number.isFinite(right) &&
    left > 0 &&
    right > 0 &&
    Math.abs(Math.round(left) - Math.round(right)) <= 1_000
  );
}
