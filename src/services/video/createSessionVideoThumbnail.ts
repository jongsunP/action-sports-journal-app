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
  return Boolean(thumbnailEndpoint);
}

export async function createSessionVideoThumbnail(video: SessionVideoAsset) {
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
