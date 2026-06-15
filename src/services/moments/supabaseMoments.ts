import type { MomentStatus, Session } from '../../types';
import type { SessionVideoAsset } from '../ai';

type CreateMomentResponse = {
  momentId?: unknown;
  status?: unknown;
};

type RemoteErrorResponse = {
  error?: unknown;
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

async function readRemoteErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as RemoteErrorResponse;

    return typeof data.error === 'string' ? data.error : undefined;
  } catch {
    return undefined;
  }
}
