export type DevicePushTokenRow = {
  id: string;
  enabled: boolean | null;
  expo_push_token: string | null;
};

export type ValidDevicePushTokenRow = DevicePushTokenRow & {
  expo_push_token: string;
};

export type PushTokenResult = {
  details?: unknown;
  maskedExpoPushToken: string;
  message?: string;
  status: "ok" | "error" | "unknown";
  ticketId?: string;
  tokenId: string;
};

export type PushReceiptResult = {
  details?: unknown;
  maskedExpoPushToken?: string;
  message?: string;
  status: "ok" | "error" | "unknown";
  ticketId: string;
  tokenId?: string;
};

export function isExpoPushToken(value: string) {
  return /^Expo(nent)?PushToken\[[^\]]+\]$/.test(value);
}

export function maskExpoPushToken(token: string) {
  if (token.length <= 12) {
    return "***";
  }

  return `${token.slice(0, 8)}...${token.slice(-4)}`;
}

export function summarizeExpoPushTickets(
  value: unknown,
  tokenRows: ValidDevicePushTokenRow[],
): {
  errorCount: number;
  errors: string[];
  okCount: number;
  ticketIds: string[];
  tokenResults: PushTokenResult[];
} {
  if (!value || typeof value !== "object") {
    const tokenResults: PushTokenResult[] = tokenRows.map((row) => ({
      maskedExpoPushToken: maskExpoPushToken(row.expo_push_token),
      status: "unknown",
      tokenId: row.id,
    }));

    return {
      errorCount: 0,
      errors: [],
      okCount: 0,
      ticketIds: [],
      tokenResults,
    };
  }

  const response = value as Record<string, unknown>;
  const tickets = Array.isArray(response.data) ? response.data : [];
  const errors: string[] = [];
  const ticketIds: string[] = [];
  const tokenResults: PushTokenResult[] = [];
  let okCount = 0;
  let errorCount = 0;

  for (const [index, ticket] of tickets.entries()) {
    const tokenRow = tokenRows[index];

    if (!ticket || typeof ticket !== "object") {
      if (tokenRow) {
        tokenResults.push({
          maskedExpoPushToken: maskExpoPushToken(tokenRow.expo_push_token),
          status: "unknown",
          tokenId: tokenRow.id,
        });
      }
      continue;
    }

    const item = ticket as Record<string, unknown>;

    if (item.status === "ok") {
      okCount += 1;
      const ticketId = nullableString(item.id);

      if (ticketId) {
        ticketIds.push(ticketId);
      }
      if (tokenRow) {
        tokenResults.push({
          maskedExpoPushToken: maskExpoPushToken(tokenRow.expo_push_token),
          status: "ok",
          ticketId: ticketId ?? undefined,
          tokenId: tokenRow.id,
        });
      }
      continue;
    }

    if (item.status === "error") {
      errorCount += 1;
      const message = sanitizeExpoPushText(
        nullableString(item.message) ?? "unknown Expo push ticket error",
      );
      errors.push(message);
      if (tokenRow) {
        tokenResults.push({
          details: sanitizeExpoPushDetails(item.details),
          maskedExpoPushToken: maskExpoPushToken(tokenRow.expo_push_token),
          message,
          status: "error",
          tokenId: tokenRow.id,
        });
      }
    }
  }

  return {
    errorCount,
    errors,
    okCount,
    ticketIds,
    tokenResults,
  };
}

export function summarizeExpoPushReceipts({
  requestedTicketIds,
  tokenResults,
  value,
}: {
  requestedTicketIds: string[];
  tokenResults: PushTokenResult[];
  value: unknown;
}) {
  const receiptResults: PushReceiptResult[] = [];
  const errors: string[] = [];
  let okCount = 0;
  let errorCount = 0;
  let missingCount = 0;

  const data =
    value && typeof value === "object" && typeof (value as Record<string, unknown>).data === "object"
      ? ((value as Record<string, unknown>).data as Record<string, unknown>)
      : {};
  const tokenResultByTicketId = new Map(
    tokenResults
      .filter((result) => result.ticketId)
      .map((result) => [result.ticketId as string, result]),
  );

  for (const ticketId of requestedTicketIds) {
    const receipt = data[ticketId];
    const tokenResult = tokenResultByTicketId.get(ticketId);

    if (!receipt || typeof receipt !== "object") {
      missingCount += 1;
      receiptResults.push({
        maskedExpoPushToken: tokenResult?.maskedExpoPushToken,
        status: "unknown" as const,
        ticketId,
        tokenId: tokenResult?.tokenId,
      });
      continue;
    }

    const item = receipt as Record<string, unknown>;

    if (item.status === "ok") {
      okCount += 1;
      receiptResults.push({
        maskedExpoPushToken: tokenResult?.maskedExpoPushToken,
        status: "ok" as const,
        ticketId,
        tokenId: tokenResult?.tokenId,
      });
      continue;
    }

    errorCount += 1;
    const message = sanitizeExpoPushText(
      nullableString(item.message) ?? "unknown Expo push receipt error",
    );
    errors.push(message);
    receiptResults.push({
      details: sanitizeExpoPushDetails(item.details),
      maskedExpoPushToken: tokenResult?.maskedExpoPushToken,
      message,
      status: "error" as const,
      ticketId,
      tokenId: tokenResult?.tokenId,
    });
  }

  return {
    errorCount,
    errors,
    missingCount,
    okCount,
    receiptResults,
    status:
      errorCount > 0
        ? ("receipt_error" as const)
        : missingCount > 0
          ? ("receipt_missing" as const)
          : ("receipt_ok" as const),
  };
}

export function readPushTokenResults(value: unknown): PushTokenResult[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): PushTokenResult | null => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const tokenId = nullableString(record.tokenId);
      const maskedExpoPushToken = nullableString(record.maskedExpoPushToken);
      const status = record.status;

      if (
        !tokenId ||
        !maskedExpoPushToken ||
        (status !== "ok" && status !== "error" && status !== "unknown")
      ) {
        return null;
      }

      return {
        details: readRecordValue(record.details),
        maskedExpoPushToken,
        message: nullableString(record.message) ?? undefined,
        status,
        ticketId: nullableString(record.ticketId) ?? undefined,
        tokenId,
      };
    })
    .filter((item): item is PushTokenResult => item !== null);
}

export function readExpoPushErrorCode(details: unknown) {
  if (!details || typeof details !== "object") {
    return null;
  }

  return nullableString((details as Record<string, unknown>).error);
}

function readRecordValue(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

export function sanitizeExpoPushText(value: string) {
  return value.replace(/Expo(?:nent)?PushToken\[[^\]]+\]/g, (token) =>
    maskExpoPushToken(token),
  );
}

function sanitizeExpoPushDetails(value: unknown) {
  const record = readRecordValue(value);

  if (!record) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => [
      key,
      typeof entry === "string" ? sanitizeExpoPushText(entry) : entry,
    ]),
  );
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}
