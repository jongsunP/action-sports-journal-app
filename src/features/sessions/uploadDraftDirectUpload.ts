import {
  finalizeUploadedSourceVideo,
  reportUploadTargetFailure,
  requestUploadTarget,
  uploadThumbnailToSignedTarget,
  uploadVideoToSignedTarget,
  type ThumbnailUploadTarget,
  type VideoUploadTarget,
} from '../../services/moments';
import type { Session } from '../../types';
import {
  getVideoFromUploadDraft,
  type UploadDraft,
} from './uploadDraftStorage';
import type { UploadProgressHandler } from './uploadProgress';

export async function uploadDraftSourceVideoDirectly(
  draft: UploadDraft,
  options?: {
    onProgress?: UploadProgressHandler;
  },
): Promise<VideoUploadTarget | undefined> {
  const video = getVideoFromUploadDraft(draft);
  let uploadTarget: VideoUploadTarget | undefined;

  try {
    options?.onProgress?.('creating_target');
    uploadTarget = await requestUploadTarget({
      draftId: draft.draftId,
      fileName: draft.fileName,
      fileSize: draft.fileSize,
      mimeType: draft.mimeType,
      durationMs: draft.durationMs,
    });

    if (!uploadTarget) {
      return undefined;
    }

    const uploadedThumbnail = await uploadDraftThumbnailIfPossible(
      draft,
      uploadTarget,
    );

    options?.onProgress?.('uploading_video');
    await uploadVideoToSignedTarget(uploadTarget, video, {
      onUploadProgress: ({ percent }) => {
        options?.onProgress?.('uploading_video', percent);
      },
    });

    return {
      ...uploadTarget,
      uploadedThumbnail,
    };
  } catch (error) {
    if (uploadTarget) {
      void reportUploadTargetFailure({
        reason: error instanceof Error ? error.message : 'unknown',
        stage: 'signed_upload',
        storagePath: uploadTarget.storagePath,
        uploadId: uploadTarget.uploadId,
        videoUriScheme: video.uri.split(':', 1)[0],
      });
    }
    throw error;
  }
}

export async function finalizeUploadedDraftSource(
  draft: UploadDraft,
  session: Session,
  options?: {
    onProgress?: UploadProgressHandler;
  },
) {
  if (
    draft.status !== 'uploaded' ||
    !draft.uploadId ||
    !draft.storageProvider ||
    !draft.storageBucket ||
    !draft.storagePath
  ) {
    throw new Error('Upload draft is not ready to finalize.');
  }

  const video = getVideoFromUploadDraft(draft);
  let finalizedMoment;

  try {
    options?.onProgress?.('finalizing_upload');
    finalizedMoment = await finalizeUploadedSourceVideo({
      draftId: draft.draftId,
      uploadId: draft.uploadId,
      storageProvider: draft.storageProvider,
      storageBucket: draft.storageBucket,
      storagePath: draft.storagePath,
      session,
      video,
      thumbnailStorageProvider: draft.uploadedThumbnail?.storageProvider,
      thumbnailStorageBucket: draft.uploadedThumbnail?.storageBucket,
      thumbnailStoragePath: draft.uploadedThumbnail?.storagePath,
    });
  } catch (error) {
    await reportUploadTargetFailure({
      reason: error instanceof Error ? error.message : 'unknown',
      stage: 'finalize',
      storagePath: draft.storagePath,
      uploadId: draft.uploadId,
      videoUriScheme: video.uri.split(':', 1)[0],
    });
    throw error;
  }

  return finalizedMoment;
}

async function uploadDraftThumbnailIfPossible(
  draft: UploadDraft,
  target: VideoUploadTarget,
) {
  const thumbnailTarget: ThumbnailUploadTarget | undefined = target.thumbnailTarget;

  if (!draft.localThumbnailUri || !thumbnailTarget) {
    return undefined;
  }

  try {
    return await uploadThumbnailToSignedTarget(
      thumbnailTarget,
      draft.localThumbnailUri,
    );
  } catch (error) {
    console.warn(
      'Thumbnail durable upload failed; continuing without server thumbnail:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return undefined;
  }
}
