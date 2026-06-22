import crypto from 'node:crypto';

import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

const DEFAULT_USER_EMAIL = 'standalone-app@action-sports-journal.invalid';
const QA_TITLE_PREFIX = '[QA_PAGINATION:';
const DEFAULT_FILE_SIZE = 16_000_000;
const DEFAULT_DURATION_MS = 8_000;

type CliOptions = {
  runId: string;
  count: number;
  dryRun: boolean;
  apply: boolean;
};

type MomentSeedRow = {
  user_id: string;
  session_id: string;
  activity_group_id: string;
  title: string;
  notes: string;
  status: 'completed';
  source: 'user_selected_video';
  occurred_at: string;
  file_name: string;
  mime_type: 'video/quicktime';
  file_size: number;
  duration_ms: number;
  created_at: string;
  updated_at: string;
};

const options = parseArgs(process.argv.slice(2));
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  fail('Missing EXPO_PUBLIC_SUPABASE_URL.');
}

if (!serviceRoleKey) {
  fail('Missing SUPABASE_SERVICE_ROLE_KEY.');
}

void main();

async function main() {
  const userId = await findDefaultUserId();
  const existingCount = await countSeedMoments(options.runId);
  const rows = buildSeedRows({
    count: options.count,
    runId: options.runId,
    userId,
  });

  const summary = {
    mode: options.apply ? 'apply' : 'dry-run',
    writesEnabled: options.apply,
    targetUser: {
      email: DEFAULT_USER_EMAIL,
      id: userId,
    },
    runId: options.runId,
    requestedRows: options.count,
    existingRowsWithRunId: existingCount,
    rowsToInsert: rows.length,
    firstOccurredAt: rows[0]?.occurred_at ?? null,
    lastOccurredAt: rows.at(-1)?.occurred_at ?? null,
    tablesToWrite: {
      moments: options.apply ? rows.length : 0,
      analysis_jobs: 0,
      evidence_results: 0,
      upload_targets: 0,
      storage_objects: 0,
    },
    sampleRows: rows.slice(0, 3).map((row) => ({
      session_id: row.session_id,
      title: row.title,
      status: row.status,
      occurred_at: row.occurred_at,
      file_name: row.file_name,
    })),
  };

  if (options.dryRun) {
    console.log('QA pagination seed dry-run complete. No DB writes were made.');
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (existingCount > 0) {
    fail(
      `Run ID ${options.runId} already has ${existingCount} moment rows. Cleanup or use a new --run-id before applying.`,
    );
  }

  await requestSupabase('moments', {
    method: 'POST',
    body: JSON.stringify(rows),
    headers: {
      Prefer: 'return=minimal',
      'Content-Type': 'application/json',
    },
  });

  console.log('QA pagination seed apply complete.');
  console.log(JSON.stringify(summary, null, 2));
}

function parseArgs(args: string[]): CliOptions {
  const runId = getOptionValue(args, '--run-id');
  const countValue = getOptionValue(args, '--count');
  const dryRun = args.includes('--dry-run');
  const apply = args.includes('--apply');

  if (!runId) {
    fail('Missing --run-id.');
  }

  if (!/^[a-zA-Z0-9._-]+$/.test(runId)) {
    fail('--run-id may only contain letters, numbers, dot, underscore, and hyphen.');
  }

  if (!countValue) {
    fail('Missing --count.');
  }

  const count = Number.parseInt(countValue, 10);

  if (!Number.isInteger(count) || count <= 0) {
    fail('--count must be a positive integer.');
  }

  if (count > 500) {
    fail('--count is capped at 500 for pagination QA seeds.');
  }

  if (dryRun === apply) {
    fail('Pass exactly one of --dry-run or --apply.');
  }

  return {
    runId,
    count,
    dryRun,
    apply,
  };
}

function getOptionValue(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function findDefaultUserId() {
  const searchParams = new URLSearchParams({
    select: 'id',
    email: `eq.${DEFAULT_USER_EMAIL}`,
    limit: '1',
  });
  const data = await requestSupabase<{ id: string }[]>(
    `users?${searchParams.toString()}`,
  );

  if (!data[0]?.id) {
    fail(
      `Default user ${DEFAULT_USER_EMAIL} was not found. Seed script does not create users.`,
    );
  }

  return data[0].id;
}

async function countSeedMoments(runId: string) {
  const searchParams = new URLSearchParams({
    select: 'id',
    title: `like.${QA_TITLE_PREFIX}${runId}]%`,
  });
  const { count } = await requestSupabaseCount(
    `moments?${searchParams.toString()}`,
  );

  return count;
}

function buildSeedRows({
  count,
  runId,
  userId,
}: {
  count: number;
  runId: string;
  userId: string;
}): MomentSeedRow[] {
  const now = new Date();

  return Array.from({ length: count }, (_, index) => {
    const ordinal = index + 1;
    const occurredAt = new Date(now.getTime() - index * 60_000).toISOString();
    const timestamp = new Date().toISOString();

    return {
      user_id: userId,
      session_id: crypto.randomUUID(),
      activity_group_id: 'wakeboard',
      title: `${QA_TITLE_PREFIX}${runId}] ${String(ordinal).padStart(3, '0')}`,
      notes: `QA pagination seed. Safe to delete. runId=${runId}`,
      status: 'completed',
      source: 'user_selected_video',
      occurred_at: occurredAt,
      file_name: `qa-pagination-${runId}-${String(ordinal).padStart(3, '0')}.mov`,
      mime_type: 'video/quicktime',
      file_size: DEFAULT_FILE_SIZE,
      duration_ms: DEFAULT_DURATION_MS,
      created_at: timestamp,
      updated_at: timestamp,
    };
  });
}

async function requestSupabase<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    fail(`Supabase REST request failed (${response.status}): ${body}`);
  }

  const text = await response.text();

  if (response.status === 204 || !text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

async function requestSupabaseCount(path: string) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method: 'HEAD',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: 'count=exact',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    fail(`Supabase REST count request failed (${response.status}): ${body}`);
  }

  return {
    count: parseContentRangeCount(response.headers.get('content-range')),
  };
}

function parseContentRangeCount(contentRange: string | null) {
  const rawCount = contentRange?.split('/')[1];
  const count = rawCount ? Number.parseInt(rawCount, 10) : 0;
  return Number.isFinite(count) ? count : 0;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
