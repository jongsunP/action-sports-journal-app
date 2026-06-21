import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SessionVideoAsset } from '../../services/ai';

const UPLOAD_DRAFT_STORAGE_KEY = 'action-sports-journal.uploadDraft.v1';

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
  createdAt: string;
  updatedAt: string;
  status: UploadDraftStatus;
  uploadId?: string;
  storageProvider?: string;
  storageBucket?: string;
  storagePath?: string;
  uploadedAt?: string;
};

export function createUploadDraftFromVideo(
  video: SessionVideoAsset,
  localThumbnailUri?: string | null,
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

export async function saveUploadDraft(draft: UploadDraft) {
  await AsyncStorage.setItem(
    UPLOAD_DRAFT_STORAGE_KEY,
    JSON.stringify({
      ...draft,
      updatedAt: new Date().toISOString(),
    }),
  );
}

export async function loadUploadDraft(): Promise<UploadDraft | null> {
  const rawDraft = await AsyncStorage.getItem(UPLOAD_DRAFT_STORAGE_KEY);

  if (!rawDraft) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawDraft);

    return parseUploadDraft(parsed);
  } catch {
    await clearUploadDraft();
    return null;
  }
}

export async function clearUploadDraft() {
  await AsyncStorage.removeItem(UPLOAD_DRAFT_STORAGE_KEY);
}

export async function updateUploadDraft(
  updater: Partial<UploadDraft> | ((current: UploadDraft) => UploadDraft),
): Promise<UploadDraft | null> {
  const current = await loadUploadDraft();

  if (!current) {
    return null;
  }

  const nextDraft =
    typeof updater === 'function'
      ? updater(current)
      : {
          ...current,
          ...updater,
        };
  const nextDraftWithTimestamp = {
    ...nextDraft,
    updatedAt: new Date().toISOString(),
  };

  await AsyncStorage.setItem(
    UPLOAD_DRAFT_STORAGE_KEY,
    JSON.stringify(nextDraftWithTimestamp),
  );

  return nextDraftWithTimestamp;
}

function parseUploadDraft(value: unknown): UploadDraft | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const draft = value as Partial<UploadDraft>;

  if (
    typeof draft.draftId !== 'string' ||
    typeof draft.localVideoUri !== 'string' ||
    typeof draft.createdAt !== 'string' ||
    typeof draft.updatedAt !== 'string' ||
    !isUploadDraftStatus(draft.status)
  ) {
    return null;
  }

  return {
    draftId: draft.draftId,
    localVideoUri: draft.localVideoUri,
    fileName: normalizeOptionalString(draft.fileName),
    fileSize: typeof draft.fileSize === 'number' ? draft.fileSize : undefined,
    mimeType: normalizeOptionalString(draft.mimeType),
    durationMs:
      typeof draft.durationMs === 'number' ? draft.durationMs : undefined,
    localThumbnailUri: normalizeOptionalString(draft.localThumbnailUri),
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    status: draft.status,
    uploadId: normalizeOptionalString(draft.uploadId),
    storageProvider: normalizeOptionalString(draft.storageProvider),
    storageBucket: normalizeOptionalString(draft.storageBucket),
    storagePath: normalizeOptionalString(draft.storagePath),
    uploadedAt: normalizeOptionalString(draft.uploadedAt),
  };
}

function isUploadDraftStatus(value: unknown): value is UploadDraftStatus {
  return (
    value === 'selected' ||
    value === 'ready_to_upload' ||
    value === 'uploading' ||
    value === 'uploaded' ||
    value === 'upload_failed'
  );
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
