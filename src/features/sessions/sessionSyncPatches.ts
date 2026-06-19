import type { RemoteMomentRecord } from '../../services/moments';
import type { Session } from '../../types';
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
  remoteMoments,
  sessionIdByRemoteMomentId,
}: {
  current: Session[];
  remoteMoments: RemoteMomentRecord[];
  sessionIdByRemoteMomentId: Map<string, string>;
}) {
  const nextSessionsById = new Map(
    current.map((session) => [session.id, session]),
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
