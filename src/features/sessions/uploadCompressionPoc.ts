import * as FileSystem from 'expo-file-system/legacy';

import type { SessionVideoAsset } from '../../services/ai';

type ReactNativeCompressorModule = {
  Video?: {
    compress: (
      uri: string,
      options?: {
        compressionMethod?: 'auto' | 'manual';
        maxSize?: number;
        minimumFileSizeForCompress?: number;
      },
      onProgress?: (progress: number) => void,
    ) => Promise<string>;
  };
};

export type UploadCompressionPocPayload = {
  draftId: string;
  durationMs: number | null;
  fileName: string;
  fileSize: number | null;
  mimeType: string;
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

export async function runUploadCompressionPoc(
  video: SessionVideoAsset,
): Promise<UploadCompressionPocResult> {
  const originalFileInfo = await FileSystem.getInfoAsync(video.uri);
  const originalFileSize = readFileSize(originalFileInfo);
  const compressor = await importReactNativeCompressor();
  const compressedUri = await compressor.Video.compress(video.uri, {
    compressionMethod: 'auto',
    minimumFileSizeForCompress: 0,
  });
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

function readFileSize(fileInfo: FileSystem.FileInfo) {
  return fileInfo.exists &&
    typeof fileInfo.size === 'number' &&
    Number.isFinite(fileInfo.size)
    ? fileInfo.size
    : null;
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
