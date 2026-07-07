import type { Response } from "express";

export const allowedVideoMimeTypes = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-m4v",
  "video/mov",
]);

export type UploadPolicyErrorCode =
  | "empty_file"
  | "invalid_duration"
  | "too_large"
  | "too_long"
  | "unsupported_type";

export type UploadPolicyConfig = {
  maxDurationMs: number;
  maxVideoBytes: number;
};

export class UploadPolicyError extends Error {
  code: UploadPolicyErrorCode;
  status: number;

  constructor(
    code: UploadPolicyErrorCode,
    config: UploadPolicyConfig,
    status = 400,
  ) {
    super(getUploadPolicyErrorMessage(code, config));
    this.name = "UploadPolicyError";
    this.code = code;
    this.status = status;
  }
}

export function sendUploadPolicyError(
  response: Response,
  status: number,
  code: UploadPolicyErrorCode,
  config: UploadPolicyConfig,
) {
  response.status(status).json({
    code,
    error: getUploadPolicyErrorMessage(code, config),
    maxDurationMs: config.maxDurationMs,
    maxSizeBytes: config.maxVideoBytes,
  });
}

export function sendUploadPolicyErrorResponse(
  response: Response,
  error: unknown,
  config: UploadPolicyConfig,
) {
  if (!(error instanceof UploadPolicyError)) {
    return false;
  }

  sendUploadPolicyError(response, error.status, error.code, config);
  return true;
}

export function getUploadPolicyErrorMessage(
  code: UploadPolicyErrorCode,
  config: UploadPolicyConfig,
) {
  switch (code) {
    case "empty_file":
      return "Video file size must be greater than 0 bytes.";
    case "invalid_duration":
      return "Video duration must be greater than 0 seconds.";
    case "too_large":
      return `Video is too large. Max size is ${Math.round(config.maxVideoBytes / 1024 / 1024)}MB.`;
    case "too_long":
      return `Video is too long. Max duration is ${Math.round(config.maxDurationMs / 1000)} seconds.`;
    case "unsupported_type":
      return "Unsupported or missing video type.";
  }
}

export function assertUploadFilePolicy(
  {
    durationMs,
    fileSize,
    mimeType,
  }: {
    durationMs: number;
    fileSize: number;
    mimeType: string | null;
  },
  config: UploadPolicyConfig,
) {
  if (!mimeType || !allowedVideoMimeTypes.has(mimeType)) {
    throw new UploadPolicyError("unsupported_type", config);
  }

  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    throw new UploadPolicyError("empty_file", config);
  }

  if (fileSize > config.maxVideoBytes) {
    throw new UploadPolicyError("too_large", config, 413);
  }

  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new UploadPolicyError("invalid_duration", config);
  }

  if (durationMs > config.maxDurationMs) {
    throw new UploadPolicyError("too_long", config);
  }
}
