import * as FileSystem from 'expo-file-system/legacy';

import type { SessionVideoAsset } from '../../services/ai';
import type { UploadProcessingMetadata } from '../../services/moments/supabaseMoments';

type ReactNativeCompressorModule = {
  Video?: {
    compress: (
      uri: string,
      options?: {
        bitrate?: number;
        compressionMethod?: 'auto' | 'manual';
        maxSize?: number;
        minimumFileSizeForCompress?: number;
        progressDivider?: number;
      },
      onProgress?: (progress: number) => void,
    ) => Promise<string>;
  };
};

const AUTO_OPTIMIZE_THRESHOLD_BYTES = 20 * 1024 * 1024;
const CONSERVATIVE_VIDEO_MAX_SIZE = 1080;
const CONSERVATIVE_VIDEO_BITRATE = 8_000_000;

export type UploadCompressionPocPayload = {
  draftId: string;
  durationMs: number | null;
  fileName: string;
  fileSize: number | null;
  mimeType: string;
  uploadProcessing: UploadProcessingMetadata;
};

export type UploadCompressionPocResult = {
  backendUploadTargetPayload: UploadCompressionPocPayload;
  compressed: {
    fileSize: number | null;
    mimeType: string;
    uri: string;
  };
  durationPreserved: boolean | null;
  original: {
    durationMs: number | null;
    fileSize: number | null;
    mimeType: string | null;
    uri: string;
  };
  reductionRatio: number | null;
};

export type PreparedUploadVideo = {
  compressionAttempted: boolean;
  compressionUsed: boolean;
  originalFileSize: number | null;
  uploadProcessing: UploadProcessingMetadata;
  video: SessionVideoAsset;
};

export async function runUploadCompressionPoc(
  video: SessionVideoAsset,
): Promise<UploadCompressionPocResult> {
  const originalFileInfo = await FileSystem.getInfoAsync(video.uri);
  const originalFileSize = readFileSize(originalFileInfo);
  const compressor = await importReactNativeCompressor();
  const compressionStartedAt = Date.now();
  const compressedUri = await compressor.Video.compress(video.uri, {
    bitrate: CONSERVATIVE_VIDEO_BITRATE,
    compressionMethod: 'manual',
    maxSize: CONSERVATIVE_VIDEO_MAX_SIZE,
    minimumFileSizeForCompress: 0,
    progressDivider: 10,
  });
  const compressionDurationMs = Date.now() - compressionStartedAt;
  const compressedFileInfo = await FileSystem.getInfoAsync(compressedUri);
  const compressedFileSize = readFileSize(compressedFileInfo);
  const compressedMimeType = inferUploadableVideoMimeType({
    fallbackMimeType: video.mimeType,
    uri: compressedUri,
  });
  const durationMs =
    typeof video.duration === 'number' && Number.isFinite(video.duration)
      ? Math.round(video.duration)
      : null;

  return {
    backendUploadTargetPayload: {
      draftId: 'compression-poc-final-file',
      durationMs,
      fileName: inferCompressedFileName(
        video.fileName ?? undefined,
        compressedMimeType,
      ),
      fileSize: compressedFileSize,
      mimeType: compressedMimeType,
      uploadProcessing: {
        compressedFileSize,
        compressionDurationMs,
        compressionRatio: calculateCompressionRatio({
          compressedFileSize,
          originalFileSize: originalFileSize ?? video.fileSize ?? null,
        }),
        originalFileSize: originalFileSize ?? video.fileSize ?? null,
        source: 'compressed',
      },
    },
    compressed: {
      fileSize: compressedFileSize,
      mimeType: compressedMimeType,
      uri: compressedUri,
    },
    durationPreserved: durationMs === null ? null : true,
    original: {
      durationMs,
      fileSize: originalFileSize ?? video.fileSize ?? null,
      mimeType: video.mimeType ?? null,
      uri: video.uri,
    },
    reductionRatio: calculateReductionRatio({
      compressedFileSize,
      originalFileSize: originalFileSize ?? video.fileSize ?? null,
    }),
  };
}

export async function prepareUploadVideoForUpload(
  video: SessionVideoAsset,
  options?: {
    onProgress?: (progress: number) => void;
  },
): Promise<PreparedUploadVideo> {
  const originalFileInfo = await FileSystem.getInfoAsync(video.uri);
  const originalFileSize = readFileSize(originalFileInfo) ?? video.fileSize ?? null;

  if (!shouldOptimizeUploadVideo(originalFileSize)) {
    return buildOriginalUploadVideoResult(video, originalFileSize);
  }

  const compressor = await importReactNativeCompressor();
  const compressionStartedAt = Date.now();

  try {
    const compressedUri = await compressor.Video.compress(
      video.uri,
      {
        bitrate: CONSERVATIVE_VIDEO_BITRATE,
        compressionMethod: 'manual',
        maxSize: CONSERVATIVE_VIDEO_MAX_SIZE,
        minimumFileSizeForCompress: 0,
        progressDivider: 10,
      },
      options?.onProgress,
    );
    const compressionDurationMs = Date.now() - compressionStartedAt;
    const compressedFileInfo = await FileSystem.getInfoAsync(compressedUri);
    const compressedFileSize = readFileSize(compressedFileInfo);

    if (
      typeof compressedFileSize !== 'number' ||
      !Number.isFinite(compressedFileSize) ||
      compressedFileSize <= 0 ||
      (typeof originalFileSize === 'number' && compressedFileSize >= originalFileSize)
    ) {
      return buildOriginalUploadVideoResult(video, originalFileSize, true);
    }

    const compressedMimeType = inferUploadableVideoMimeType({
      fallbackMimeType: video.mimeType,
      uri: compressedUri,
    });

    return {
      compressionAttempted: true,
      compressionUsed: true,
      originalFileSize,
      uploadProcessing: {
        compressedFileSize,
        compressionDurationMs,
        compressionRatio: calculateCompressionRatio({
          compressedFileSize,
          originalFileSize,
        }),
        originalFileSize,
        source: 'compressed',
      },
      video: {
        ...video,
        fileName: inferCompressedFileName(video.fileName ?? undefined, compressedMimeType),
        fileSize: compressedFileSize,
        mimeType: compressedMimeType,
        uri: compressedUri,
      },
    };
  } catch (error) {
    console.warn(
      'Upload video optimization failed; falling back to original when policy allows:',
      error instanceof Error ? error.message : 'Unknown error',
    );

    return buildOriginalUploadVideoResult(video, originalFileSize, true);
  }
}

export function shouldOptimizeUploadVideo(fileSize?: number | null) {
  return (
    typeof fileSize === 'number' &&
    Number.isFinite(fileSize) &&
    fileSize > AUTO_OPTIMIZE_THRESHOLD_BYTES
  );
}

async function importReactNativeCompressor() {
  const module = (await import(
    'react-native-compressor'
  )) as ReactNativeCompressorModule;

  if (!module.Video?.compress) {
    throw new Error(
      'react-native-compressor Video.compress is not available in this runtime. A dev-client or standalone build is required.',
    );
  }

  return {
    Video: module.Video,
  };
}

function buildOriginalUploadVideoResult(
  video: SessionVideoAsset,
  originalFileSize: number | null,
  compressionAttempted = false,
): PreparedUploadVideo {
  return {
    compressionAttempted,
    compressionUsed: false,
    originalFileSize,
    uploadProcessing: {
      compressedFileSize: null,
      compressionDurationMs: null,
      compressionRatio: null,
      originalFileSize,
      source: 'original',
    },
    video,
  };
}

function readFileSize(fileInfo: FileSystem.FileInfo) {
  return fileInfo.exists &&
    typeof fileInfo.size === 'number' &&
    Number.isFinite(fileInfo.size)
    ? fileInfo.size
    : null;
}

function calculateCompressionRatio({
  compressedFileSize,
  originalFileSize,
}: {
  compressedFileSize: number | null;
  originalFileSize: number | null;
}) {
  if (
    typeof compressedFileSize !== 'number' ||
    !Number.isFinite(compressedFileSize) ||
    typeof originalFileSize !== 'number' ||
    !Number.isFinite(originalFileSize) ||
    originalFileSize <= 0
  ) {
    return null;
  }

  return compressedFileSize / originalFileSize;
}

function calculateReductionRatio({
  compressedFileSize,
  originalFileSize,
}: {
  compressedFileSize: number | null;
  originalFileSize: number | null;
}) {
  if (
    typeof originalFileSize !== 'number' ||
    originalFileSize <= 0 ||
    typeof compressedFileSize !== 'number' ||
    compressedFileSize < 0
  ) {
    return null;
  }

  return Math.round((1 - compressedFileSize / originalFileSize) * 1000) / 10;
}

function inferUploadableVideoMimeType({
  fallbackMimeType,
  uri,
}: {
  fallbackMimeType?: string | null;
  uri: string;
}) {
  const lowerUri = uri.toLowerCase();

  if (lowerUri.endsWith('.mp4') || lowerUri.includes('.mp4?')) {
    return 'video/mp4';
  }

  if (
    lowerUri.endsWith('.mov') ||
    lowerUri.endsWith('.qt') ||
    lowerUri.includes('.mov?')
  ) {
    return 'video/quicktime';
  }

  if (
    fallbackMimeType === 'video/mp4' ||
    fallbackMimeType === 'video/quicktime' ||
    fallbackMimeType === 'video/x-m4v' ||
    fallbackMimeType === 'video/mov'
  ) {
    return fallbackMimeType;
  }

  return 'video/mp4';
}

function inferCompressedFileName(
  originalFileName: string | undefined,
  mimeType: string,
) {
  const extension = mimeType === 'video/quicktime' ? 'mov' : 'mp4';
  const baseName = originalFileName?.replace(/\.[^.]+$/, '') || 'asj-video';

  return `${baseName}.compressed.${extension}`;
}
