import { createHash } from "node:crypto";

export type SummaryLogFields = Record<string, unknown>;

type SanitizedLogError = {
  errorCategory: string;
  errorCode: string;
  statusCode: number | null;
};

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function isUploadPolicyLikeError(error: unknown): error is {
  code: string;
  name: string;
  status: number;
} {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as Record<string, unknown>;

  return (
    record.name === "UploadPolicyError" &&
    typeof record.code === "string" &&
    typeof record.status === "number"
  );
}

export function shortId(id: unknown) {
  const value = nullableString(id);

  if (!value) {
    return null;
  }

  return value.length <= 12
    ? value
    : `${value.slice(0, 8)}...${value.slice(-6)}`;
}

export function hashValue(value: unknown) {
  const text = nullableString(value);

  if (!text) {
    return null;
  }

  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

export function sanitizeLogError(error: unknown): SanitizedLogError {
  if (isUploadPolicyLikeError(error)) {
    return {
      errorCategory: "upload_policy",
      errorCode: error.code,
      statusCode: error.status,
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (normalized.includes("timeout") || normalized.includes("timed out")) {
    return {
      errorCategory: "timeout",
      errorCode: "timeout",
      statusCode: null,
    };
  }

  if (normalized.includes("rate limit") || normalized.includes("limit reached")) {
    return {
      errorCategory: "rate_limit",
      errorCode: "rate_limited",
      statusCode: 429,
    };
  }

  if (normalized.includes("auth") || normalized.includes("bearer")) {
    return {
      errorCategory: "auth",
      errorCode: "auth_required",
      statusCode: 401,
    };
  }

  if (normalized.includes("storage")) {
    return {
      errorCategory: "storage",
      errorCode: "storage_error",
      statusCode: null,
    };
  }

  if (normalized.includes("gemini") || normalized.includes("evidence")) {
    return {
      errorCategory: "analysis",
      errorCode: "analysis_error",
      statusCode: null,
    };
  }

  return {
    errorCategory: "unknown",
    errorCode: "unknown",
    statusCode: null,
  };
}

export function logSummary(event: string, fields: SummaryLogFields = {}) {
  const blockedKeyPattern =
    /(token|email|secret|signed|callback|storagepath|storage_path|userid|authuserid|auth_user_id|(?:^|_)?(?:moment|analysisjob|evidenceresult|upload|attempt|authuser|user)id$)/i;
  const safeMetricKeyPattern = /(count|ms|bytes|size)$/i;
  const { tag, ...fieldEntries } = fields;
  const safeFields = Object.fromEntries(
    Object.entries(fieldEntries).filter(([key, value]) => {
      if (
        value === undefined ||
        (blockedKeyPattern.test(key) && !safeMetricKeyPattern.test(key))
      ) {
        return false;
      }

      if (
        value !== null &&
        typeof value !== "boolean" &&
        typeof value !== "number" &&
        typeof value !== "string"
      ) {
        return false;
      }

      if (
        typeof value === "string" &&
        (/^https?:\/\//i.test(value) || value.includes("supabase://"))
      ) {
        return false;
      }

      return true;
    }),
  );

  console.info(
    JSON.stringify({
      tag: typeof tag === "string" && tag.trim().length > 0 ? tag : "asj_summary",
      event,
      ...safeFields,
    }),
  );
}
