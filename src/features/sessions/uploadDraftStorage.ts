import type { SessionVideoAsset } from '../../services/ai';
import type {
  ThumbnailUploadTarget,
  UploadedThumbnailReference,
  UploadProcessingMetadata,
} from '../../services/moments';

export type UploadDraftStatus =
  | 'selected'
  | 'ready_to_upload'
  | 'uploading'
  | 'uploaded'
  | 'upload_failed';

export type UploadDraft = {
  draftId: string;
  localVideoUri: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  durationMs?: number;
  localThumbnailUri?: string;
  thumbnailTarget?: ThumbnailUploadTarget;
  uploadedThumbnail?: UploadedThumbnailReference;
  createdAt: string;
  updatedAt: string;
  status: UploadDraftStatus;
  uploadId?: string;
  storageProvider?: string;
  storageBucket?: string;
  storagePath?: string;
  uploadedAt?: string;
  uploadProcessing?: UploadProcessingMetadata;
};

export function createUploadDraftFromVideo(
  video: SessionVideoAsset,
  localThumbnailUri?: string | null,
  uploadProcessing?: UploadProcessingMetadata | null,
): UploadDraft {
  const now = new Date().toISOString();

  return {
    draftId: createDraftId(),
    localVideoUri: video.uri,
    fileName: normalizeOptionalString(video.fileName),
    fileSize: video.fileSize,
    mimeType: normalizeOptionalString(video.mimeType),
    durationMs: video.duration ?? undefined,
    localThumbnailUri: localThumbnailUri ?? undefined,
    createdAt: now,
    updatedAt: now,
    status: 'ready_to_upload',
    uploadProcessing: uploadProcessing ?? undefined,
  };
}

export function getVideoFromUploadDraft(
  draft: UploadDraft,
): SessionVideoAsset {
  return {
    uri: draft.localVideoUri,
    fileName: draft.fileName,
    fileSize: draft.fileSize,
    mimeType: draft.mimeType,
    duration: draft.durationMs,
  };
}

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}


function createDraftId() {
  const randomUuid = globalThis.crypto?.randomUUID?.();

  if (randomUuid) {
    return randomUuid;
  }

  const randomHex = () =>
    Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .slice(1);

  return [
    `${randomHex()}${randomHex()}`,
    randomHex(),
    `4${randomHex().slice(1)}`,
    `${(8 + Math.floor(Math.random() * 4)).toString(16)}${randomHex().slice(1)}`,
    `${randomHex()}${randomHex()}${randomHex()}`,
  ].join('-');
}
