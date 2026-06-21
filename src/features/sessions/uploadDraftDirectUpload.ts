import {
  requestUploadTarget,
  uploadVideoToSignedTarget,
  type VideoUploadTarget,
} from '../../services/moments';
import {
  getVideoFromUploadDraft,
  updateUploadDraft,
  type UploadDraft,
} from './uploadDraftStorage';

export async function uploadDraftSourceVideoDirectly(
  draft: UploadDraft,
): Promise<VideoUploadTarget | undefined> {
  const video = getVideoFromUploadDraft(draft);

  await updateUploadDraft({ status: 'uploading' });

  try {
    const uploadTarget = await requestUploadTarget({
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
    throw error;
  }
}
