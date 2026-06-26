import { authenticatedFetch } from './authenticatedFetch';

type RecoveryAttemptProvider = 'email' | 'kakao';
type RecoveryAttemptFlow =
  | 'email_callback'
  | 'email_connection'
  | 'link'
  | 'recovery_sign_in';
type RecoveryAttemptStatus =
  | 'blocked'
  | 'cancelled'
  | 'dismissed'
  | 'failed'
  | 'started'
  | 'succeeded';

type RecoveryAttemptInput = {
  errorCode?: string | null;
  event: string;
  flow: RecoveryAttemptFlow;
  metadata?: Record<string, unknown>;
  provider: RecoveryAttemptProvider;
  reasonCode?: string | null;
  status: RecoveryAttemptStatus;
};

const analysisEndpoint = process.env.EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT;
const recoveryAttemptsEndpoint = analysisEndpoint?.replace(
  /\/api\/analyze-session-video$/,
  '/api/recovery-attempts',
);

export function maskRecoveryEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const [localPart, domain] = normalizedEmail.split('@');

  if (!localPart || !domain) {
    return null;
  }

  const visiblePrefix = localPart.slice(0, 1);

  return `${visiblePrefix}***@${domain}`;
}

export function getRecoveryEmailDomain(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const domain = normalizedEmail.split('@')[1];

  return domain && !domain.includes('/') ? domain : null;
}

export function getRecoveryErrorCode(error: unknown) {
  const maybeError = error as { code?: unknown; name?: unknown; status?: unknown };

  if (typeof maybeError?.code === 'string' && maybeError.code.trim()) {
    return maybeError.code.trim();
  }

  if (typeof maybeError?.status === 'number') {
    return String(maybeError.status);
  }

  if (error instanceof Error && error.name) {
    return error.name;
  }

  return null;
}

export function getRecoveryReasonCode(error: unknown) {
  const code = getRecoveryErrorCode(error)?.toLowerCase() ?? '';
  const message =
    error instanceof Error && error.message ? error.message.toLowerCase() : '';
  const detail = `${code} ${message}`;

  if (detail.includes('email_exists') || detail.includes('already')) {
    return 'email_exists';
  }

  if (
    detail.includes('rate_limit') ||
    detail.includes('over_email_send_rate_limit') ||
    detail.includes('429')
  ) {
    return 'rate_limited';
  }

  if (detail.includes('expired')) {
    return 'expired';
  }

  if (detail.includes('access_denied')) {
    return 'access_denied';
  }

  return code || 'unknown_error';
}

export async function recordRecoveryAttempt(input: RecoveryAttemptInput) {
  if (!recoveryAttemptsEndpoint) {
    return false;
  }

  try {
    const response = await authenticatedFetch(recoveryAttemptsEndpoint, {
      body: JSON.stringify({
        errorCode: input.errorCode ?? undefined,
        event: input.event,
        flow: input.flow,
        metadata: sanitizeRecoveryAttemptMetadata(input.metadata ?? {}),
        provider: input.provider,
        reasonCode: input.reasonCode ?? undefined,
        status: input.status,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    if (!response.ok) {
      console.warn('[recovery_observability] record failed', {
        event: input.event,
        status: response.status,
      });
      return false;
    }

    return true;
  } catch (error) {
    console.warn('[recovery_observability] record failed', {
      event: input.event,
      message: error instanceof Error ? error.message : 'unknown error',
    });
    return false;
  }
}

function sanitizeRecoveryAttemptMetadata(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, entryValue] of Object.entries(value)) {
    if (isForbiddenRecoveryMetadataKey(key)) {
      continue;
    }

    if (key === 'maskedEmail') {
      const maskedEmail =
        typeof entryValue === 'string' && entryValue.includes('*')
          ? entryValue
          : null;

      if (maskedEmail) {
        sanitized[key] = maskedEmail.slice(0, 120);
      }
      continue;
    }

    if (key === 'emailDomain') {
      const domain =
        typeof entryValue === 'string' &&
        !entryValue.includes('@') &&
        !entryValue.includes('/')
          ? entryValue
          : null;

      if (domain) {
        sanitized[key] = domain.slice(0, 120).toLowerCase();
      }
      continue;
    }

    if (typeof entryValue === 'string') {
      sanitized[key] = sanitizeRecoveryMetadataString(entryValue);
    } else if (
      typeof entryValue === 'boolean' ||
      typeof entryValue === 'number' ||
      entryValue === null
    ) {
      sanitized[key] = entryValue;
    }
  }

  return sanitized;
}

function isForbiddenRecoveryMetadataKey(key: string) {
  const normalized = key.toLowerCase();

  return (
    normalized.includes('token') ||
    normalized.includes('code') ||
    normalized.includes('url') ||
    normalized.includes('callback') ||
    normalized === 'email' ||
    normalized === 'rawemail'
  );
}

function sanitizeRecoveryMetadataString(value: string) {
  const trimmed = value.trim();

  if (
    trimmed.includes('://') ||
    trimmed.includes('access_token') ||
    trimmed.includes('refresh_token') ||
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
  ) {
    return '[redacted]';
  }

  return trimmed.slice(0, 500);
}
