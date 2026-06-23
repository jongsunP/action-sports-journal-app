import type {
  CandidateTrace,
  EvidenceConfidence,
  GeminiEvidenceResult,
  MomentStatus,
  PersistedMomentStatus,
  Session,
} from '../../types';
import type { SessionVideoAsset } from '../ai';
import * as FileSystem from 'expo-file-system/legacy';

type CreateMomentResponse = {
  momentId?: unknown;
  status?: unknown;
};

type UpdateMomentStatusResponse = {
  status?: unknown;
};

type UploadMomentSourceVideoResponse = {
  storageProvider?: unknown;
  storageBucket?: unknown;
  storagePath?: unknown;
  analysisJobId?: unknown;
  analysisJobStatus?: unknown;
  analysisStarted?: unknown;
  uploadedAt?: unknown;
};

type UploadTargetResponse = {
  uploadId?: unknown;
  draftId?: unknown;
  provider?: unknown;
  bucket?: unknown;
  storagePath?: unknown;
  signedUploadToken?: unknown;
  signedUploadUrl?: unknown;
  expiresInSeconds?: unknown;
  fileName?: unknown;
  mimeType?: unknown;
  fileSize?: unknown;
  durationMs?: unknown;
  thumbnailTarget?: unknown;
};

type DeleteMomentResponse = {
  ok?: unknown;
  storageCleanupFailed?: unknown;
};

export type RequestUploadTargetInput = {
  draftId: string;
  fileName?: string | null;
  fileSize?: number;
  mimeType?: string | null;
  durationMs?: number | null;
};

export type VideoUploadTarget = {
  uploadId: string;
  draftId: string;
  provider: string;
  bucket: string;
  storagePath: string;
  signedUploadToken: string;
  signedUploadUrl?: string;
  expiresInSeconds?: number;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  durationMs?: number;
  thumbnailTarget?: ThumbnailUploadTarget;
  uploadedThumbnail?: UploadedThumbnailReference;
};

export type ThumbnailUploadTarget = {
  provider: string;
  bucket: string;
  storagePath: string;
  signedUploadToken: string;
  signedUploadUrl?: string;
};

export type UploadedThumbnailReference = {
  storageProvider: string;
  storageBucket: string;
  storagePath: string;
};

export type SignedUploadProgress = {
  percent?: number;
  totalBytesExpectedToSend?: number;
  totalBytesSent: number;
};

export type FinalizeUploadedSourceVideoInput = {
  draftId: string;
  uploadId: string;
  storageProvider: string;
  storageBucket: string;
  storagePath: string;
  session: Session;
  video?: SessionVideoAsset | null;
  thumbnailStorageProvider?: string | null;
  thumbnailStorageBucket?: string | null;
  thumbnailStoragePath?: string | null;
};

export type UploadedMomentSourceVideo = {
  storageProvider: string;
  storageBucket: string;
  storagePath: string;
  analysisJobId?: string;
  analysisJobStatus?: 'queued' | 'processing';
  analysisStarted: boolean;
  uploadedAt?: string;
};

export type RemoteMomentRecord = {
  remoteMomentId: string;
  session: Session;
  video?: SessionVideoAsset;
  thumbnailUri?: string;
  evidence?: GeminiEvidenceResult;
};

type RemoteErrorResponse = {
  error?: unknown;
};

type RemoteMomentListResponse = {
  hasMore?: unknown;
  moments?: unknown;
  nextCursor?: unknown;
};

export type ListMomentsOptions = {
  cursor?: string | null;
  limit?: number;
};

export type RemoteMomentPage = {
  hasMore: boolean;
  moments: RemoteMomentRecord[];
  nextCursor: string | null;
};

const analysisEndpoint = process.env.EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT;
const momentsEndpoint = analysisEndpoint?.replace(
  /\/api\/analyze-session-video$/,
  '/api/moments',
);
const uploadTargetsEndpoint = analysisEndpoint?.replace(
  /\/api\/analyze-session-video$/,
  '/api/video-upload-targets',
);
const SIGNED_UPLOAD_FILE_READ_TIMEOUT_MS = 5000;
const SIGNED_UPLOAD_REQUEST_TIMEOUT_MS = 8000;
const UPLOADED_SOURCE_FINALIZE_TIMEOUT_MS = 18000;

export type ReportUploadTargetFailureInput = {
  uploadId: string;
  reason: string;
  blobSize?: number;
  stage?: string;
  storagePath?: string;
  videoUriScheme?: string;
};

export function hasConfiguredSupabaseMoments() {
  return Boolean(momentsEndpoint);
}

export async function requestUploadTarget(
  input: RequestUploadTargetInput,
): Promise<VideoUploadTarget | undefined> {
  if (!uploadTargetsEndpoint) {
    return undefined;
  }

  const response = await fetch(uploadTargetsEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      draftId: input.draftId,
      fileName: input.fileName ?? null,
      fileSize: input.fileSize ?? null,
      mimeType: input.mimeType ?? null,
      durationMs:
        typeof input.durationMs === 'number' && Number.isFinite(input.durationMs)
          ? Math.round(input.durationMs)
          : null,
    }),
  });

  if (!response.ok) {
    const message = await readRemoteErrorMessage(response);

    throw new Error(
      message ?? `Upload target creation failed with ${response.status}`,
    );
  }

  const data = (await response.json()) as UploadTargetResponse;
  const uploadId = asString(data.uploadId);
  const draftId = asString(data.draftId);
  const provider = asString(data.provider);
  const bucket = asString(data.bucket);
  const storagePath = asString(data.storagePath);
  const signedUploadToken = asString(data.signedUploadToken);

  if (
    !uploadId ||
    !draftId ||
    !provider ||
    !bucket ||
    !storagePath ||
    !signedUploadToken
  ) {
    throw new Error('Upload target response returned invalid data.');
  }

  return {
    uploadId,
    draftId,
    provider,
    bucket,
    storagePath,
    signedUploadToken,
    signedUploadUrl: asString(data.signedUploadUrl),
    expiresInSeconds: asNumber(data.expiresInSeconds),
    fileName: asString(data.fileName),
    mimeType: asString(data.mimeType),
    fileSize: asNumber(data.fileSize),
    durationMs: asNumber(data.durationMs),
    thumbnailTarget: normalizeThumbnailUploadTarget(data.thumbnailTarget),
  };
}

export async function uploadThumbnailToSignedTarget(
  target: ThumbnailUploadTarget,
  thumbnailUri: string,
): Promise<UploadedThumbnailReference> {
  if (!target.signedUploadUrl) {
    throw new Error('Thumbnail upload target did not include a signed URL.');
  }

  const fileInfo = await withTimeout(
    FileSystem.getInfoAsync(thumbnailUri),
    SIGNED_UPLOAD_FILE_READ_TIMEOUT_MS,
    'Timed out while checking thumbnail for signed upload.',
  );

  if (!fileInfo.exists) {
    throw new Error('Thumbnail file was not found for signed upload.');
  }

  const uploadTask = FileSystem.createUploadTask(
    target.signedUploadUrl,
    thumbnailUri,
    {
      headers: {
        'cache-control': 'max-age=31536000',
        'content-type': 'image/jpeg',
        'x-upsert': 'false',
      },
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    },
  );
  const uploadResult = await withTimeout(
    uploadTask.uploadAsync(),
    SIGNED_UPLOAD_REQUEST_TIMEOUT_MS,
    'Timed out while uploading thumbnail to signed target.',
  );

  if (!uploadResult) {
    throw new Error('Thumbnail upload did not return a result.');
  }

  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new Error(
      `Thumbnail upload failed with ${uploadResult.status}: ${uploadResult.body}`,
    );
  }

  return {
    storageProvider: target.provider,
    storageBucket: target.bucket,
    storagePath: target.storagePath,
  };
}

function normalizeThumbnailUploadTarget(
  value: unknown,
): ThumbnailUploadTarget | undefined {
  const record = asRecord(value);

  if (!record) {
    return undefined;
  }

  const provider = asString(record.provider);
  const bucket = asString(record.bucket);
  const storagePath = asString(record.storagePath);
  const signedUploadToken = asString(record.signedUploadToken);

  if (!provider || !bucket || !storagePath || !signedUploadToken) {
    return undefined;
  }

  return {
    provider,
    bucket,
    storagePath,
    signedUploadToken,
    signedUploadUrl: asString(record.signedUploadUrl),
  };
}

export async function uploadVideoToSignedTarget(
  target: VideoUploadTarget,
  video: SessionVideoAsset,
  options?: {
    onUploadProgress?: (progress: SignedUploadProgress) => void;
  },
) {
  if (!target.signedUploadUrl) {
    throw new Error('Signed upload target did not include a signed URL.');
  }

  const fileInfo = await withTimeout(
    FileSystem.getInfoAsync(video.uri),
    SIGNED_UPLOAD_FILE_READ_TIMEOUT_MS,
    'Timed out while checking source video for signed upload.',
  );

  if (!fileInfo.exists) {
    throw new Error('Source video file was not found for signed upload.');
  }

  const contentType = video.mimeType ?? target.mimeType ?? 'video/quicktime';
  const localFileSize =
    typeof fileInfo.size === 'number' && Number.isFinite(fileInfo.size)
      ? fileInfo.size
      : undefined;
  const expectedFileSize =
    typeof video.fileSize === 'number' && Number.isFinite(video.fileSize)
      ? video.fileSize
      : target.fileSize;

  console.info('[upload_timing]', {
    expectedFileSize,
    event: 'direct_upload_file_info',
    localFileSize,
    storagePath: target.storagePath,
    uploadId: target.uploadId,
    videoUriScheme: video.uri.split(':', 1)[0],
  });

  if (!localFileSize || localFileSize <= 0) {
    throw new Error('Signed upload source file is empty.');
  }

  if (
    typeof expectedFileSize === 'number' &&
    Number.isFinite(expectedFileSize) &&
    expectedFileSize > 0 &&
    localFileSize !== expectedFileSize
  ) {
    throw new Error(
      `Signed upload source file size mismatch before upload. expected=${expectedFileSize}; actual=${localFileSize}`,
    );
  }

  const uploadOptions = {
    headers: {
      'cache-control': 'max-age=3600',
      'content-type': contentType,
      'x-upsert': 'false',
    },
    httpMethod: 'PUT' as const,
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
  };
  const uploadTask = FileSystem.createUploadTask(
    target.signedUploadUrl,
    video.uri,
    uploadOptions,
    ({ totalBytesExpectedToSend, totalBytesSent }) => {
      options?.onUploadProgress?.({
        percent: calculateUploadPercent({
          totalBytesExpectedToSend,
          totalBytesSent,
        }),
        totalBytesExpectedToSend,
        totalBytesSent,
      });
    },
  );
  const uploadResult = await withTimeout(
    uploadTask.uploadAsync(),
    SIGNED_UPLOAD_REQUEST_TIMEOUT_MS,
    'Timed out while uploading source video to signed target.',
  );

  if (!uploadResult) {
    throw new Error('Signed source video upload did not return a result.');
  }

  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new Error(
      `Signed source video upload failed with ${uploadResult.status}: ${uploadResult.body}`,
    );
  }

  console.info('[upload_timing]', {
    event: 'direct_upload_success',
    localFileSize,
    responseStatus: uploadResult.status,
    storagePath: target.storagePath,
    uploadId: target.uploadId,
  });

  return uploadResult;
}

function calculateUploadPercent({
  totalBytesExpectedToSend,
  totalBytesSent,
}: {
  totalBytesExpectedToSend: number;
  totalBytesSent: number;
}) {
  if (
    !Number.isFinite(totalBytesExpectedToSend) ||
    totalBytesExpectedToSend <= 0 ||
    !Number.isFinite(totalBytesSent) ||
    totalBytesSent < 0
  ) {
    return undefined;
  }

  return (totalBytesSent / totalBytesExpectedToSend) * 100;
}

export async function reportUploadTargetFailure({
  blobSize,
  reason,
  stage,
  storagePath,
  uploadId,
  videoUriScheme,
}: ReportUploadTargetFailureInput) {
  if (!uploadTargetsEndpoint) {
    return;
  }

  try {
    const response = await fetch(`${uploadTargetsEndpoint}/${uploadId}/failure`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        blobSize: typeof blobSize === 'number' ? blobSize : null,
        reason,
        stage: stage ?? null,
        storagePath: storagePath ?? null,
        videoUriScheme: videoUriScheme ?? null,
      }),
    });

    if (!response.ok) {
      const message = await readRemoteErrorMessage(response);
      console.warn(
        'Upload target failure report failed:',
        message ?? response.status,
      );
    }
  } catch (error) {
    console.warn(
      'Upload target failure report failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}

export async function finalizeUploadedSourceVideo(
  input: FinalizeUploadedSourceVideoInput,
): Promise<UploadedMomentSourceVideo & { momentId: string } | undefined> {
  if (!momentsEndpoint) {
    return undefined;
  }

  const abortController = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    timeoutId = setTimeout(() => {
      abortController.abort();
    }, UPLOADED_SOURCE_FINALIZE_TIMEOUT_MS);

    const response = await fetch(`${momentsEndpoint}/from-uploaded-source`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: abortController.signal,
      body: JSON.stringify({
        draftId: input.draftId,
        uploadId: input.uploadId,
        storageProvider: input.storageProvider,
        storageBucket: input.storageBucket,
        storagePath: input.storagePath,
        sessionId: input.session.id,
        activityGroupId: input.session.activityGroupId,
        title: input.session.title ?? null,
        notes: input.session.notes ?? null,
        occurredAt: input.session.occurredAt,
        sourceVideoUri: input.session.videoUri ?? input.video?.uri ?? null,
        thumbnailStorageProvider: input.thumbnailStorageProvider ?? null,
        thumbnailStorageBucket: input.thumbnailStorageBucket ?? null,
        thumbnailStoragePath: input.thumbnailStoragePath ?? null,
        fileName: input.video?.fileName ?? null,
        mimeType: input.video?.mimeType ?? null,
        fileSize: input.video?.fileSize ?? null,
        durationMs:
          typeof input.video?.duration === 'number' &&
          Number.isFinite(input.video.duration)
            ? Math.round(input.video.duration)
            : null,
      }),
    });

    if (!response.ok) {
      const message = await readRemoteErrorMessage(response);

      throw new Error(
        message ?? `Uploaded source finalize failed with ${response.status}`,
      );
    }

    const data = (await response.json()) as UploadMomentSourceVideoResponse &
      CreateMomentResponse;
    const momentId = asString(data.momentId);
    const storageProvider = asString(data.storageProvider);
    const storageBucket = asString(data.storageBucket);
    const storagePath = asString(data.storagePath);
    const analysisJobId = asString(data.analysisJobId);
    const analysisJobStatus = asQueuedAnalysisJobStatus(data.analysisJobStatus);

    if (!momentId || !storageProvider || !storageBucket || !storagePath) {
      throw new Error('Uploaded source finalize returned invalid data.');
    }

    console.info('[upload_timing]', {
      analysisJobId,
      analysisJobStatus,
      event: 'direct_finalize_success',
      momentId,
      storagePath,
      uploadId: input.uploadId,
    });

    return {
      momentId,
      storageProvider,
      storageBucket,
      storagePath,
      analysisJobId,
      analysisJobStatus,
      analysisStarted: data.analysisStarted === true,
      uploadedAt: asString(data.uploadedAt),
    };
  } catch (error) {
    if (abortController.signal.aborted) {
      throw new Error('Uploaded source finalize timed out.');
    }

    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
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
      title: session.title ?? null,
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

export async function uploadMomentSourceVideo(
  momentId: string,
  video: SessionVideoAsset,
): Promise<UploadedMomentSourceVideo | undefined> {
  if (!momentsEndpoint) {
    return undefined;
  }

  const formData = new FormData();
  formData.append('video', {
    uri: video.uri,
    name: video.fileName ?? `${momentId}.mov`,
    type: video.mimeType ?? 'video/quicktime',
  } as unknown as Blob);

  const response = await fetch(`${momentsEndpoint}/${momentId}/source-video`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const message = await readRemoteErrorMessage(response);

    throw new Error(
      message ?? `Moment source video upload failed with ${response.status}`,
    );
  }

  const data = (await response.json()) as UploadMomentSourceVideoResponse;
  const storageProvider = asString(data.storageProvider);
  const storageBucket = asString(data.storageBucket);
  const storagePath = asString(data.storagePath);

  if (!storageProvider || !storageBucket || !storagePath) {
    throw new Error('Moment source video upload returned invalid storage data.');
  }

  return {
    storageProvider,
    storageBucket,
    storagePath,
    analysisJobId: asString(data.analysisJobId),
    analysisJobStatus: asQueuedAnalysisJobStatus(data.analysisJobStatus),
    analysisStarted: data.analysisStarted === true,
    uploadedAt: asString(data.uploadedAt),
  };
}

export async function createMomentFromSourceVideo(
  session: Session,
  video: SessionVideoAsset,
  options?: {
    thumbnailStorageProvider?: string | null;
    thumbnailStorageBucket?: string | null;
    thumbnailStoragePath?: string | null;
  },
): Promise<UploadedMomentSourceVideo & { momentId: string } | undefined> {
  if (!momentsEndpoint) {
    return undefined;
  }

  const formData = new FormData();
  formData.append('sessionId', session.id);
  formData.append('activityGroupId', session.activityGroupId);
  formData.append('occurredAt', session.occurredAt);
  formData.append('sourceVideoUri', session.videoUri ?? video.uri);

  if (session.title) {
    formData.append('title', session.title);
  }

  if (session.notes) {
    formData.append('notes', session.notes);
  }

  if (typeof video.duration === 'number' && Number.isFinite(video.duration)) {
    formData.append('durationMs', String(Math.round(video.duration)));
  }

  formData.append('video', {
    uri: video.uri,
    name: video.fileName ?? `${session.id}.mov`,
    type: video.mimeType ?? 'video/quicktime',
  } as unknown as Blob);

  if (options?.thumbnailStorageProvider) {
    formData.append('thumbnailStorageProvider', options.thumbnailStorageProvider);
  }

  if (options?.thumbnailStorageBucket) {
    formData.append('thumbnailStorageBucket', options.thumbnailStorageBucket);
  }

  if (options?.thumbnailStoragePath) {
    formData.append('thumbnailStoragePath', options.thumbnailStoragePath);
  }

  const response = await fetch(`${momentsEndpoint}/from-source-video`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const message = await readRemoteErrorMessage(response);

    throw new Error(
      message ?? `Stored Moment source video upload failed with ${response.status}`,
    );
  }

  const data = (await response.json()) as UploadMomentSourceVideoResponse &
    CreateMomentResponse;
  const momentId = asString(data.momentId);
  const storageProvider = asString(data.storageProvider);
  const storageBucket = asString(data.storageBucket);
  const storagePath = asString(data.storagePath);

  if (!momentId || !storageProvider || !storageBucket || !storagePath) {
    throw new Error('Stored Moment source upload returned invalid data.');
  }

  return {
    momentId,
    storageProvider,
    storageBucket,
    storagePath,
    analysisJobId: asString(data.analysisJobId),
    analysisJobStatus: asQueuedAnalysisJobStatus(data.analysisJobStatus),
    analysisStarted: data.analysisStarted === true,
    uploadedAt: asString(data.uploadedAt),
  };
}

export async function updateMomentStatus(
  momentId: string,
  status: PersistedMomentStatus,
) {
  if (!momentsEndpoint) {
    return undefined;
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

  const data = (await response.json()) as UpdateMomentStatusResponse;

  return asMomentStatus(data.status);
}

export async function deleteMoment(momentId: string) {
  if (!momentsEndpoint) {
    return undefined;
  }

  const response = await fetch(`${momentsEndpoint}/${momentId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const message = await readRemoteErrorMessage(response);

    throw new Error(message ?? `Moment delete failed with ${response.status}`);
  }

  const data = (await response.json()) as DeleteMomentResponse;

  return {
    ok: data.ok === true,
    storageCleanupFailed: data.storageCleanupFailed === true,
  };
}

export async function listMomentsPage(
  options: ListMomentsOptions = {},
): Promise<RemoteMomentPage> {
  if (!momentsEndpoint) {
    return {
      hasMore: false,
      moments: [],
      nextCursor: null,
    };
  }

  const query = new URLSearchParams();

  if (typeof options.limit === 'number' && Number.isFinite(options.limit)) {
    query.set('limit', String(Math.max(1, Math.round(options.limit))));
  }

  if (options.cursor) {
    query.set('cursor', options.cursor);
  }

  const url = query.toString()
    ? `${momentsEndpoint}?${query.toString()}`
    : momentsEndpoint;
  const response = await fetch(url);

  if (!response.ok) {
    const message = await readRemoteErrorMessage(response);

    throw new Error(message ?? `Moment list failed with ${response.status}`);
  }

  const data = (await response.json()) as RemoteMomentListResponse;

  if (!Array.isArray(data.moments)) {
    return {
      hasMore: false,
      moments: [],
      nextCursor: null,
    };
  }

  return {
    hasMore: data.hasMore === true,
    moments: data.moments
      .map(normalizeRemoteMoment)
      .filter((moment): moment is RemoteMomentRecord => Boolean(moment)),
    nextCursor: asString(data.nextCursor) ?? null,
  };
}

export async function listMoments(options: ListMomentsOptions = {}) {
  const page = await listMomentsPage(options);

  return page.moments;
}

async function readRemoteErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as RemoteErrorResponse;

    return typeof data.error === 'string' ? data.error : undefined;
  } catch {
    return undefined;
  }
}

function normalizeRemoteMoment(value: unknown): RemoteMomentRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const moment = value as Record<string, unknown>;
  const remoteMomentId = asString(moment.id);

  if (!remoteMomentId) {
    return null;
  }

  const now = new Date().toISOString();
  const occurredAt = asString(moment.occurredAt) ?? now;
  const sourceVideoUri = asString(moment.sourceVideoUri);
  const durationMs = asNumber(moment.durationMs);
  const rawStatus = asPersistedMomentStatus(moment.status);
  const fileName = asString(moment.fileName);
  const fileSize = asNumber(moment.fileSize);
  const latestEvidenceResult = asRecord(moment.latestEvidenceResult);
  const latestAnalysisJobId = asString(moment.latestAnalysisJobId);
  const sourceVideoStorageStatus = asString(moment.sourceVideoStorageStatus);
  const sourceVideoStoragePath = asString(moment.sourceVideoStoragePath);
  const status = deriveRemoteMomentStatus({
    latestAnalysisJobId,
    latestEvidenceResult,
    rawStatus,
    sourceVideoStoragePath,
    sourceVideoStorageStatus,
  });

  if (
    isIncompleteQueuedMoment({
      status,
      sourceVideoUri,
      fileName,
      fileSize,
      durationMs,
      latestEvidenceResult,
    })
  ) {
    return null;
  }

  const sessionId = asString(moment.sessionId) ?? remoteMomentId;
  const session: Session = {
    id: sessionId,
    activityGroupId: normalizeActivityGroupId(asString(moment.activityGroupId)),
    title: asString(moment.title),
    notes: asString(moment.notes),
    occurredAt,
    videoUri: sourceVideoUri,
    momentStatus: status,
    shareResultIds: [],
    createdAt: asString(moment.createdAt) ?? occurredAt,
    updatedAt: asString(moment.updatedAt) ?? occurredAt,
  };
  const video = sourceVideoUri
    ? {
        uri: sourceVideoUri,
        fileName,
        fileSize,
        mimeType: asString(moment.mimeType),
        duration: typeof durationMs === 'number' ? durationMs : null,
      }
    : undefined;
  const evidence = normalizeRemoteEvidenceResult(
    latestEvidenceResult,
    session.id,
  );

  return {
    remoteMomentId,
    session,
    video,
    thumbnailUri: asString(moment.thumbnailUri),
    evidence,
  };
}

function normalizeRemoteEvidenceResult(
  value: unknown,
  sessionId: string,
): GeminiEvidenceResult | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const evidence = value as Record<string, unknown>;
  const createdAt = asString(evidence.created_at) ?? new Date().toISOString();
  const confidence = asConfidence(evidence.confidence) ?? 'low';
  const predictedTrick = asString(evidence.predicted_trick) ?? '확인 필요';
  const family = asString(evidence.family) ?? '확인 필요';
  const errorMessage = asString(evidence.error_message);
  const approachObservedFacts = asRecord(evidence.approach_observed_facts) as
    | GeminiEvidenceResult['approachObservedFacts']
    | undefined;
  const approachObservedFactsV2 = asRecord(evidence.approach_observed_facts_v2) as
    | GeminiEvidenceResult['approachObservedFactsV2']
    | undefined;
  const approachDecisionV2 = asRecord(evidence.approach_decision_v2) as
    | GeminiEvidenceResult['approachDecisionV2']
    | undefined;
  const popObservedFacts = asRecord(evidence.pop_observed_facts) as
    | GeminiEvidenceResult['popObservedFacts']
    | undefined;
  const popValidation = asRecord(evidence.pop_validation) as
    | GeminiEvidenceResult['popValidation']
    | undefined;
  const rotationObservedFacts = asRecord(evidence.rotation_observed_facts) as
    | GeminiEvidenceResult['rotationObservedFacts']
    | undefined;
  const rotationValidation = asRecord(evidence.rotation_validation) as
    | GeminiEvidenceResult['rotationValidation']
    | undefined;
  const grabObservedFacts = asRecord(evidence.grab_observed_facts) as
    | GeminiEvidenceResult['grabObservedFacts']
    | undefined;
  const grabValidation = asRecord(evidence.grab_validation) as
    | GeminiEvidenceResult['grabValidation']
    | undefined;
  const landingObservedFacts = asRecord(evidence.landing_observed_facts) as
    | GeminiEvidenceResult['landingObservedFacts']
    | undefined;
  const landingValidation = asRecord(evidence.landing_validation) as
    | GeminiEvidenceResult['landingValidation']
    | undefined;
  const inversionObservedFacts = asRecord(evidence.inversion_observed_facts) as
    | GeminiEvidenceResult['inversionObservedFacts']
    | undefined;
  const candidateTrace = deriveRestoredCandidateTrace({
    predictedTrick,
    family,
    confidence,
    needsReview: evidence.needs_review === true,
    approachDecisionV2,
    popObservedFacts,
    rotationObservedFacts,
    rotationValidation,
    inversionObservedFacts,
  });

  return {
    id: asString(evidence.id) ?? `evidence-${Date.now()}`,
    sessionId,
    status: evidence.status === 'failed' ? 'failed' : 'completed',
    provider: 'gemini',
    model: asString(evidence.model),
    qualityMode:
      evidence.quality_mode === 'degraded' || evidence.quality_mode === 'standard'
        ? evidence.quality_mode
        : undefined,
    requiresUserConfirmation: evidence.needs_review === true,
    consistencyStatus: asConsistencyStatus(evidence.consistency_status),
    consistencyWarnings: asStringArray(evidence.consistency_warnings),
    rawResponseText: asString(evidence.raw_response_text),
    primaryCandidate: {
      name: predictedTrick,
      confidence,
      evidence: errorMessage ?? '저장된 분석 결과를 불러왔습니다.',
    },
    alternativeCandidates: [],
    family: {
      value: family,
      confidence,
      evidence: '저장된 계열 분석 결과입니다.',
    },
    temporalWindows: asRecord(evidence.temporal_windows) as
      | GeminiEvidenceResult['temporalWindows']
      | undefined,
    approachObservedFacts,
    approachObservedFactsV2,
    popObservedFacts,
    popValidation,
    rotationObservedFacts,
    rotationValidation,
    grabObservedFacts,
    grabValidation,
    landingObservedFacts,
    landingValidation,
    inversionObservedFacts,
    approachDecisionV2,
    candidateTrace,
    approachType: {
      value: '확인 필요',
      confidence: 'low',
      evidence: '저장된 approachType 요약은 아직 별도 컬럼으로 보관하지 않습니다.',
    },
    rotationType: {
      value: '확인 필요',
      confidence: 'low',
      evidence: '저장된 rotationType 요약은 아직 별도 컬럼으로 보관하지 않습니다.',
    },
    landingOutcome: {
      value: '확인 필요',
      confidence: 'low',
      evidence: '저장된 landingOutcome 요약은 아직 별도 컬럼으로 보관하지 않습니다.',
    },
    confidence,
    evidence: errorMessage ?? '저장된 분석 결과를 불러왔습니다.',
    evidenceWindows: asArray(evidence.evidence_windows) as
      GeminiEvidenceResult['evidenceWindows'],
    observations: asArray(evidence.observations) as GeminiEvidenceResult['observations'],
    uncertainty: {
      level: confidence,
      reasons: errorMessage ? [errorMessage] : [],
    },
    createdAt,
  };
}

function normalizeActivityGroupId(value?: string) {
  if (!value || value === 'wakeboard') {
    return 'group-wakeboard';
  }

  return value;
}

function deriveRestoredCandidateTrace({
  predictedTrick,
  family,
  confidence,
  needsReview,
  approachDecisionV2,
  popObservedFacts,
  rotationObservedFacts,
  rotationValidation,
  inversionObservedFacts,
}: {
  predictedTrick: string;
  family: string;
  confidence: EvidenceConfidence;
  needsReview: boolean;
  approachDecisionV2?: GeminiEvidenceResult['approachDecisionV2'];
  popObservedFacts?: GeminiEvidenceResult['popObservedFacts'];
  rotationObservedFacts?: GeminiEvidenceResult['rotationObservedFacts'];
  rotationValidation?: GeminiEvidenceResult['rotationValidation'];
  inversionObservedFacts?: GeminiEvidenceResult['inversionObservedFacts'];
}): CandidateTrace | undefined {
  const observedSignals = compactStrings([
    approachDecisionV2?.value &&
    approachDecisionV2.value !== 'unknown' &&
    approachDecisionV2.value !== 'ambiguous'
      ? `approach=${approachDecisionV2.value}/${approachDecisionV2.confidence}`
      : undefined,
    popObservedFacts
      ? `pop=${[popObservedFacts.popType, popObservedFacts.timing, popObservedFacts.intensity]
          .filter(Boolean)
          .join('/')}/${popObservedFacts.confidence}`
      : undefined,
    rotationObservedFacts?.rotationAxis
      ? `rotationAxis=${rotationObservedFacts.rotationAxis}/${rotationObservedFacts.confidence}`
      : undefined,
    rotationObservedFacts?.inversionDetected !== undefined
      ? `inversionDetected=${String(rotationObservedFacts.inversionDetected)}`
      : undefined,
    inversionObservedFacts?.boardAboveHead === true
      ? 'boardAboveHead=true'
      : undefined,
    inversionObservedFacts?.bodyInverted === true
      ? 'bodyInverted=true'
      : undefined,
    inversionObservedFacts?.rollAxisObserved === true
      ? 'rollAxisObserved=true'
      : undefined,
  ]);
  const isUnknownTopLevel =
    predictedTrick === '확인 필요' ||
    predictedTrick.toLowerCase().includes('unknown');
  const hasBackRollSignals =
    approachDecisionV2?.value === 'heelside' &&
    rotationObservedFacts?.rotationAxis === 'roll_axis' &&
    rotationObservedFacts.inversionDetected === true &&
    (inversionObservedFacts?.boardAboveHead === true ||
      inversionObservedFacts?.bodyInverted === true ||
      inversionObservedFacts?.rollAxisObserved === true);

  if (!isUnknownTopLevel || !hasBackRollSignals) {
    return undefined;
  }

  return {
    safePredictedTrick: predictedTrick,
    safeFamily: family,
    observedSignals,
    downgradedBy: compactStrings([
      needsReview ? 'persisted evidence result requires review' : undefined,
      rotationValidation?.needsReview
        ? 'rotationValidation requires review'
        : undefined,
    ]),
    needsReview: true,
    displayLabel: '관찰된 가능성: 백롤 계열 · 확인 필요',
    confidence,
  };
}

function compactStrings(values: Array<string | undefined>) {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => Boolean(value && value.trim()))
        .map((value) => value.trim()),
    ),
  );
}

function isIncompleteQueuedMoment({
  status,
  sourceVideoUri,
  fileName,
  fileSize,
  durationMs,
  latestEvidenceResult,
}: {
  status?: MomentStatus;
  sourceVideoUri?: string;
  fileName?: string;
  fileSize?: number;
  durationMs?: number;
  latestEvidenceResult?: Record<string, unknown>;
}) {
  if (status !== 'queued') {
    return false;
  }

  if (latestEvidenceResult) {
    return false;
  }

  return (
    !sourceVideoUri &&
    !fileName &&
    !isPositiveNumber(fileSize) &&
    !isPositiveNumber(durationMs)
  );
}

function deriveRemoteMomentStatus({
  latestAnalysisJobId,
  latestEvidenceResult,
  rawStatus,
  sourceVideoStoragePath,
  sourceVideoStorageStatus,
}: {
  latestAnalysisJobId?: string;
  latestEvidenceResult?: Record<string, unknown>;
  rawStatus?: PersistedMomentStatus;
  sourceVideoStoragePath?: string;
  sourceVideoStorageStatus?: string;
}): MomentStatus | undefined {
  if (
    rawStatus === 'queued' &&
    !latestEvidenceResult &&
    !latestAnalysisJobId &&
    !sourceVideoStoragePath &&
    (sourceVideoStorageStatus === 'pending_upload' || !sourceVideoStorageStatus)
  ) {
    return 'upload_failed';
  }

  return rawStatus;
}

function isPositiveNumber(value?: number) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function asMomentStatus(value: unknown): MomentStatus | undefined {
  if (value === 'uploading' || value === 'upload_failed') {
    return value;
  }

  return asPersistedMomentStatus(value);
}

function asPersistedMomentStatus(value: unknown): PersistedMomentStatus | undefined {
  if (
    value === 'queued' ||
    value === 'processing' ||
    value === 'completed' ||
    value === 'failed'
  ) {
    return value;
  }

  return undefined;
}

function asQueuedAnalysisJobStatus(value: unknown): 'queued' | 'processing' | undefined {
  if (value === 'queued' || value === 'processing') {
    return value;
  }

  return undefined;
}

function asConsistencyStatus(
  value: unknown,
): GeminiEvidenceResult['consistencyStatus'] {
  if (
    value === 'valid' ||
    value === 'inconsistent' ||
    value === 'needs_review'
  ) {
    return value;
  }

  return undefined;
}

function asConfidence(value: unknown): EvidenceConfidence | undefined {
  if (value === 'high' || value === 'medium' || value === 'low') {
    return value;
  }

  return undefined;
}

function asString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise
      .then(resolve, reject)
      .finally(() => {
        clearTimeout(timeout);
      });
  });
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown) {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}
