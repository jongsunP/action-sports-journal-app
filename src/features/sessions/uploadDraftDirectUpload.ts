import {
  finalizeUploadedSourceVideo,
  reportUploadTargetFailure,
  requestUploadTarget,
  uploadVideoToSignedTarget,
  type VideoUploadTarget,
} from '../../services/moments';
import type { Session } from '../../types';
import {
  clearUploadDraft,
  getVideoFromUploadDraft,
  updateUploadDraft,
  type UploadDraft,
} from './uploadDraftStorage';

export async function uploadDraftSourceVideoDirectly(
  draft: UploadDraft,
): Promise<VideoUploadTarget | undefined> {
  const video = getVideoFromUploadDraft(draft);
  let uploadTarget: VideoUploadTarget | undefined;

  await updateUploadDraft({ status: 'uploading' });

  try {
    uploadTarget = await requestUploadTarget({
      draftId: draft.draftId,
      fileName: draft.fileName,
      fileSize: draft.fileSize,
      mimeType: draft.mimeType,
      durationMs: draft.durationMs,
    });

    if (!uploadTarget) {
      await updateUploadDraft({ status: 'upload_failed' });
      return undefined;
    }

    await updateUploadDraft({
      uploadId: uploadTarget.uploadId,
      storageProvider: uploadTarget.provider,
      storageBucket: uploadTarget.bucket,
      storagePath: uploadTarget.storagePath,
    });

    await uploadVideoToSignedTarget(uploadTarget, video);

    await updateUploadDraft({
      status: 'uploaded',
      uploadedAt: new Date().toISOString(),
      uploadId: uploadTarget.uploadId,
      storageProvider: uploadTarget.provider,
      storageBucket: uploadTarget.bucket,
      storagePath: uploadTarget.storagePath,
    });

    return uploadTarget;
  } catch (error) {
    await updateUploadDraft({ status: 'upload_failed' });
    if (uploadTarget) {
      await reportUploadTargetFailure({
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
    finalizedMoment = await finalizeUploadedSourceVideo({
      draftId: draft.draftId,
      uploadId: draft.uploadId,
      storageProvider: draft.storageProvider,
      storageBucket: draft.storageBucket,
      storagePath: draft.storagePath,
      session,
      video,
      thumbnailUri: draft.localThumbnailUri,
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

  if (finalizedMoment) {
    await clearUploadDraft();
  }

  return finalizedMoment;
}
