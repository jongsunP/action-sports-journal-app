import type { RemoteMomentRecord } from '../../services/moments';
import type { SessionVideoAsset } from '../../services/ai';
import type { GeminiEvidenceResult, Session } from '../../types';
import {
  mergeMomentStatus,
  resolveLocalSessionIdForRemoteMoment,
} from './sessionMerge';

export function buildRemoteMomentSessionIdMap({
  remoteMomentIdsBySessionId,
  remoteMoments,
  sessions,
}: {
  remoteMomentIdsBySessionId: Record<string, string>;
  remoteMoments: RemoteMomentRecord[];
  sessions: Session[];
}) {
  return new Map(
    remoteMoments.map((moment) => [
      moment.remoteMomentId,
      resolveLocalSessionIdForRemoteMoment(
        moment,
        remoteMomentIdsBySessionId,
        sessions,
      ),
    ]),
  );
}

export function applyRemoteSessions({
  current,
  remoteMomentIdsBySessionId,
  remoteMoments,
  sessionIdByRemoteMomentId,
}: {
  current: Session[];
  remoteMomentIdsBySessionId: Record<string, string>;
  remoteMoments: RemoteMomentRecord[];
  sessionIdByRemoteMomentId: Map<string, string>;
}) {
  const remoteBackedSessionIds = new Set(sessionIdByRemoteMomentId.values());
  const nextSessionsById = new Map(
    current
      .filter((session) =>
        shouldKeepLocalSessionAfterRemoteSync({
          remoteBackedSessionIds,
          remoteMomentIdsBySessionId,
          session,
        }),
      )
      .map((session) => [session.id, session]),
  );

  for (const remoteMoment of remoteMoments) {
    const sessionId =
      sessionIdByRemoteMomentId.get(remoteMoment.remoteMomentId) ??
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
  sessionIdByRemoteMomentId,
}: {
  current: Record<string, string>;
  remoteMoments: RemoteMomentRecord[];
  sessionIdByRemoteMomentId: Map<string, string>;
}) {
  const remoteMomentIds = new Set(
    remoteMoments.map((remoteMoment) => remoteMoment.remoteMomentId),
  );
  const next = Object.fromEntries(
    Object.entries(current).filter(([, remoteMomentId]) =>
      remoteMomentIds.has(remoteMomentId),
    ),
  );

  for (const remoteMoment of remoteMoments) {
    const sessionId =
      sessionIdByRemoteMomentId.get(remoteMoment.remoteMomentId) ??
      remoteMoment.session.id;

    next[sessionId] = remoteMoment.remoteMomentId;
  }

  return next;
}

function shouldKeepLocalSessionAfterRemoteSync({
  remoteBackedSessionIds,
  remoteMomentIdsBySessionId,
  session,
}: {
  remoteBackedSessionIds: Set<string>;
  remoteMomentIdsBySessionId: Record<string, string>;
  session: Session;
}) {
  if (remoteBackedSessionIds.has(session.id)) {
    return true;
  }

  if (remoteMomentIdsBySessionId[session.id]) {
    return false;
  }

  return (
    session.momentStatus === 'uploading' ||
    session.momentStatus === 'queued' ||
    session.momentStatus === 'processing'
  );
}

export function applyRemoteVideos({
  current,
  remoteMoments,
  sessionIdByRemoteMomentId,
}: {
  current: Record<string, SessionVideoAsset>;
  remoteMoments: RemoteMomentRecord[];
  sessionIdByRemoteMomentId: Map<string, string>;
}) {
  const next = { ...current };

  for (const remoteMoment of remoteMoments) {
    if (!remoteMoment.video) {
      continue;
    }

    const sessionId =
      sessionIdByRemoteMomentId.get(remoteMoment.remoteMomentId) ??
      remoteMoment.session.id;

    next[sessionId] = current[sessionId] ?? remoteMoment.video;
  }

  return next;
}

export function applyRemoteEvidence({
  current,
  remoteMoments,
  sessionIdByRemoteMomentId,
}: {
  current: Record<string, GeminiEvidenceResult>;
  remoteMoments: RemoteMomentRecord[];
  sessionIdByRemoteMomentId: Map<string, string>;
}) {
  const next = { ...current };

  for (const remoteMoment of remoteMoments) {
    if (!remoteMoment.evidence) {
      continue;
    }

    const sessionId =
      sessionIdByRemoteMomentId.get(remoteMoment.remoteMomentId) ??
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
  sessionIdByRemoteMomentId,
}: {
  current: Record<string, string>;
  remoteMoments: RemoteMomentRecord[];
  sessionIdByRemoteMomentId: Map<string, string>;
}) {
  const next = { ...current };

  for (const remoteMoment of remoteMoments) {
    if (!remoteMoment.thumbnailUri) {
      continue;
    }

    const sessionId =
      sessionIdByRemoteMomentId.get(remoteMoment.remoteMomentId) ??
      remoteMoment.session.id;

    next[sessionId] = current[sessionId] ?? remoteMoment.thumbnailUri;
  }

  return next;
}
