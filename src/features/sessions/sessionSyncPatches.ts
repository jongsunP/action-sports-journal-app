import type { RemoteMomentRecord } from '../../services/moments';
import type { SessionVideoAsset } from '../../services/ai';
import type { GeminiEvidenceResult, Session } from '../../types';
import {
  mergeMomentStatus,
  resolveLocalSessionForRemoteMoment,
  type RemoteMomentSessionResolution,
  type UploadReconciliationCandidate,
} from './sessionMerge';

export function buildRemoteMomentSessionIdMap({
  remoteMomentIdsBySessionId,
  remoteMoments,
  sessions,
  uploadReconciliationCandidatesBySessionId,
}: {
  remoteMomentIdsBySessionId: Record<string, string>;
  remoteMoments: RemoteMomentRecord[];
  sessions: Session[];
  uploadReconciliationCandidatesBySessionId?: Record<
    string,
    UploadReconciliationCandidate
  >;
}) {
  return new Map(
    remoteMoments.map((moment) => {
      const resolution = resolveLocalSessionForRemoteMoment(
        moment,
        remoteMomentIdsBySessionId,
        sessions,
        uploadReconciliationCandidatesBySessionId,
      );

      return [moment.remoteMomentId, resolution] as const;
    }),
  );
}

export function applyRemoteSessions({
  current,
  remoteMoments,
  sessionResolutionByRemoteMomentId,
}: {
  current: Session[];
  remoteMoments: RemoteMomentRecord[];
  sessionResolutionByRemoteMomentId: Map<string, RemoteMomentSessionResolution>;
}) {
  const nextSessionsById = new Map(
    current.map((session) => [session.id, session]),
  );

  for (const remoteMoment of remoteMoments) {
    const sessionId =
      sessionResolutionByRemoteMomentId.get(remoteMoment.remoteMomentId)
        ?.sessionId ??
      remoteMoment.session.id;
    const existingSession = nextSessionsById.get(sessionId);

    nextSessionsById.set(sessionId, {
      ...existingSession,
      ...remoteMoment.session,
      id: sessionId,
      momentStatus: mergeMomentStatus(
        existingSession?.momentStatus,
        remoteMoment.session.momentStatus,
      ),
      videoUri: existingSession?.videoUri ?? remoteMoment.session.videoUri,
      shareResultIds: existingSession?.shareResultIds ?? [],
    });
  }

  return Array.from(nextSessionsById.values()).sort((left, right) =>
    right.occurredAt.localeCompare(left.occurredAt),
  );
}

export function applyRemoteMomentIds({
  current,
  remoteMoments,
  sessionResolutionByRemoteMomentId,
}: {
  current: Record<string, string>;
  remoteMoments: RemoteMomentRecord[];
  sessionResolutionByRemoteMomentId: Map<string, RemoteMomentSessionResolution>;
}) {
  const next = { ...current };

  for (const remoteMoment of remoteMoments) {
    const sessionId =
      sessionResolutionByRemoteMomentId.get(remoteMoment.remoteMomentId)
        ?.sessionId ??
      remoteMoment.session.id;

    next[sessionId] = remoteMoment.remoteMomentId;
  }

  return next;
}

export function applyRemoteVideos({
  current,
  remoteMoments,
  sessionResolutionByRemoteMomentId,
}: {
  current: Record<string, SessionVideoAsset>;
  remoteMoments: RemoteMomentRecord[];
  sessionResolutionByRemoteMomentId: Map<string, RemoteMomentSessionResolution>;
}) {
  const next = { ...current };

  for (const remoteMoment of remoteMoments) {
    if (!remoteMoment.video) {
      continue;
    }

    const sessionId =
      sessionResolutionByRemoteMomentId.get(remoteMoment.remoteMomentId)
        ?.sessionId ??
      remoteMoment.session.id;

    next[sessionId] = current[sessionId] ?? remoteMoment.video;
  }

  return next;
}

export function applyRemoteEvidence({
  current,
  remoteMoments,
  sessionResolutionByRemoteMomentId,
}: {
  current: Record<string, GeminiEvidenceResult>;
  remoteMoments: RemoteMomentRecord[];
  sessionResolutionByRemoteMomentId: Map<string, RemoteMomentSessionResolution>;
}) {
  const next = { ...current };

  for (const remoteMoment of remoteMoments) {
    if (!remoteMoment.evidence) {
      continue;
    }

    const sessionId =
      sessionResolutionByRemoteMomentId.get(remoteMoment.remoteMomentId)
        ?.sessionId ??
      remoteMoment.session.id;

    next[sessionId] = {
      ...remoteMoment.evidence,
      sessionId,
    };
  }

  return next;
}

export function applyRemoteThumbnails({
  current,
  remoteMoments,
  sessionResolutionByRemoteMomentId,
}: {
  current: Record<string, string>;
  remoteMoments: RemoteMomentRecord[];
  sessionResolutionByRemoteMomentId: Map<string, RemoteMomentSessionResolution>;
}) {
  const next = { ...current };

  for (const remoteMoment of remoteMoments) {
    if (!remoteMoment.thumbnailUri) {
      continue;
    }

    const sessionId =
      sessionResolutionByRemoteMomentId.get(remoteMoment.remoteMomentId)
        ?.sessionId ??
      remoteMoment.session.id;

    next[sessionId] = current[sessionId] ?? remoteMoment.thumbnailUri;
  }

  return next;
}
