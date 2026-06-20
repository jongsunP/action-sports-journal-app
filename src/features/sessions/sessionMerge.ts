import type { RemoteMomentRecord } from '../../services/moments';
import type { MomentStatus, Session } from '../../types';

export function resolveLocalSessionIdForRemoteMoment(
  remoteMoment: RemoteMomentRecord,
  remoteMomentIdsBySessionId: Record<string, string>,
  sessions: Session[],
) {
  const existingLocalSessionId = Object.entries(remoteMomentIdsBySessionId).find(
    ([, remoteMomentId]) => remoteMomentId === remoteMoment.remoteMomentId,
  )?.[0];

  if (existingLocalSessionId) {
    return existingLocalSessionId;
  }

  const exactSessionId = sessions.find(
    (session) => session.id === remoteMoment.session.id,
  )?.id;

  if (exactSessionId) {
    return exactSessionId;
  }

  const videoMatchedSessionId = sessions.find(
    (session) =>
      remoteMoment.session.videoUri &&
      session.videoUri === remoteMoment.session.videoUri,
  )?.id;

  if (videoMatchedSessionId) {
    return videoMatchedSessionId;
  }

  const createdMomentSessionId = sessions.find(
    (session) =>
      session.title === remoteMoment.session.title &&
      session.occurredAt === remoteMoment.session.occurredAt,
  )?.id;

  return createdMomentSessionId ?? remoteMoment.session.id;
}

export function mergeMomentStatus(
  localStatus?: MomentStatus,
  remoteStatus?: MomentStatus,
): MomentStatus | undefined {
  return remoteStatus ?? localStatus;
}
