export type RecoveryAttemptProvider = "email" | "kakao";

export type RecoveryAttemptFlow =
  | "email_callback"
  | "email_connection"
  | "link"
  | "recovery_sign_in";

export type RecoveryAttemptStatus =
  | "blocked"
  | "cancelled"
  | "dismissed"
  | "failed"
  | "started"
  | "succeeded";

export function isRecoveryAttemptProvider(
  value: string | null,
): value is RecoveryAttemptProvider {
  return value === "email" || value === "kakao";
}

export function isRecoveryAttemptFlow(
  value: string | null,
): value is RecoveryAttemptFlow {
  return (
    value === "email_callback" ||
    value === "email_connection" ||
    value === "link" ||
    value === "recovery_sign_in"
  );
}

export function isRecoveryAttemptStatus(
  value: string | null,
): value is RecoveryAttemptStatus {
  return (
    value === "blocked" ||
    value === "cancelled" ||
    value === "dismissed" ||
    value === "failed" ||
    value === "started" ||
    value === "succeeded"
  );
}

export function sanitizeRecoveryAttemptMetadata(
  value: unknown,
): Record<string, unknown> {
  const sanitized = sanitizeRecoveryAttemptMetadataValue(value, 0);

  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? (sanitized as Record<string, unknown>)
    : {};
}

function sanitizeRecoveryAttemptMetadataValue(
  value: unknown,
  depth: number,
): unknown {
  if (depth > 3) {
    return null;
  }

  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return sanitizeRecoveryAttemptMetadataString(value);
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 20)
      .map((item) => sanitizeRecoveryAttemptMetadataValue(item, depth + 1))
      .filter((item) => item !== null && item !== undefined);
  }

  if (typeof value !== "object") {
    return null;
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
    if (isForbiddenRecoveryAttemptMetadataKey(key)) {
      continue;
    }

    if (key === "maskedEmail") {
      const maskedEmail = nullableString(entryValue);

      if (maskedEmail?.includes("*") && !maskedEmail.includes("://")) {
        sanitized[key] = maskedEmail.slice(0, 120);
      }
      continue;
    }

    if (key === "emailDomain") {
      const emailDomain = nullableString(entryValue);

      if (emailDomain && !emailDomain.includes("@") && !emailDomain.includes("/")) {
        sanitized[key] = emailDomain.slice(0, 120).toLowerCase();
      }
      continue;
    }

    const sanitizedValue = sanitizeRecoveryAttemptMetadataValue(
      entryValue,
      depth + 1,
    );

    if (sanitizedValue !== null && sanitizedValue !== undefined) {
      sanitized[key.slice(0, 80)] = sanitizedValue;
    }
  }

  return sanitized;
}

function isForbiddenRecoveryAttemptMetadataKey(key: string) {
  const normalized = key.toLowerCase();

  return (
    normalized.includes("token") ||
    normalized.includes("code") ||
    normalized.includes("url") ||
    normalized.includes("callback") ||
    normalized === "email" ||
    normalized === "rawemail"
  );
}

function sanitizeRecoveryAttemptMetadataString(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (
    trimmed.includes("://") ||
    trimmed.includes("access_token") ||
    trimmed.includes("refresh_token") ||
    looksLikeRawEmail(trimmed)
  ) {
    return "[redacted]";
  }

  return trimmed.slice(0, 500);
}

function looksLikeRawEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
