import * as VideoThumbnails from 'expo-video-thumbnails';

import type { SessionVideoAsset } from '../ai';

type ThumbnailResponse = {
  imageUri?: unknown;
};

type RemoteErrorResponse = {
  error?: unknown;
};

const analysisEndpoint = process.env.EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT;
const thumbnailEndpoint = analysisEndpoint?.replace(
  /\/api\/analyze-session-video$/,
  '/api/create-session-thumbnail',
);

export function hasConfiguredVideoThumbnailEndpoint() {
  return true;
}

export async function createSessionVideoThumbnail(
  video: SessionVideoAsset,
  options?: {
    allowRemoteFallback?: boolean;
    timeoutMs?: number;
  },
) {
  const allowRemoteFallback = options?.allowRemoteFallback ?? true;

  try {
    return await withTimeout(
      createLocalSessionVideoThumbnail(video),
      options?.timeoutMs,
    );
  } catch (error) {
    console.warn(
      'Local video thumbnail creation failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
  }

  if (!allowRemoteFallback) {
    throw new Error('로컬 영상 썸네일 생성에 실패했습니다.');
  }

  return createRemoteSessionVideoThumbnail(video);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs?: number) {
  if (!timeoutMs || timeoutMs <= 0) {
    return promise;
  }

  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Local thumbnail timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]);
}

async function createLocalSessionVideoThumbnail(video: SessionVideoAsset) {
  const durationMs =
    typeof video.duration === 'number' && Number.isFinite(video.duration)
      ? video.duration
      : undefined;
  const time = Math.round(
    durationMs
      ? Math.min(Math.max(durationMs * 0.2, 500), Math.max(durationMs - 250, 0))
      : 1000,
  );

  const thumbnail = await VideoThumbnails.getThumbnailAsync(video.uri, {
    quality: 0.72,
    time,
  });

  if (!thumbnail.uri) {
    throw new Error('로컬 영상 썸네일 응답에 이미지가 없습니다.');
  }

  return thumbnail.uri;
}

async function createRemoteSessionVideoThumbnail(video: SessionVideoAsset) {
  if (!thumbnailEndpoint) {
    throw new Error('영상 썸네일 엔드포인트가 설정되지 않았습니다.');
  }

  const formData = new FormData();

  formData.append('video', {
    uri: video.uri,
    name: video.fileName ?? 'session-video.mov',
    type: video.mimeType ?? 'video/quicktime',
  } as unknown as Blob);

  const response = await fetch(thumbnailEndpoint, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const message = await readRemoteErrorMessage(response);

    throw new Error(message ?? `Thumbnail request failed with ${response.status}`);
  }

  const data = (await response.json()) as ThumbnailResponse;

  if (typeof data.imageUri !== 'string' || data.imageUri.length === 0) {
    throw new Error('영상 썸네일 응답에 이미지가 없습니다.');
  }

  return data.imageUri;
}

async function readRemoteErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as RemoteErrorResponse;

    return typeof data.error === 'string' ? data.error : undefined;
  } catch {
    return undefined;
  }
}
