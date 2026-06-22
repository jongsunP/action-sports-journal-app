import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

const DEFAULT_USER_EMAIL = 'standalone-app@action-sports-journal.invalid';
const QA_TITLE_PREFIX = '[QA_PAGINATION:';

type CliOptions = {
  runId: string;
  expectedCount: number | null;
  dryRun: boolean;
  apply: boolean;
};

type MatchedMoment = {
  id: string;
  title: string | null;
  occurred_at: string;
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
  const matchedMoments = await findSeedMoments(options.runId, userId);
  const momentIds = matchedMoments.map((moment) => moment.id);
  const childCounts = await countChildRows(options.runId, momentIds);

  if (
    options.expectedCount !== null &&
    matchedMoments.length !== options.expectedCount
  ) {
    fail(
      `Expected ${options.expectedCount} rows for runId ${options.runId}, but found ${matchedMoments.length}. Refusing to continue.`,
    );
  }

  const summary = {
    mode: options.apply ? 'apply' : 'dry-run',
    writesEnabled: options.apply,
    targetUser: {
      email: DEFAULT_USER_EMAIL,
      id: userId,
    },
    runId: options.runId,
    expectedCount: options.expectedCount,
    matchedMoments: matchedMoments.length,
    childRows: childCounts,
    safeToCleanup:
      childCounts.analysis_jobs === 0 &&
      childCounts.evidence_results === 0 &&
      childCounts.upload_targets === 0,
    sampleRows: matchedMoments.slice(0, 5).map((moment) => ({
      id: moment.id,
      title: moment.title,
      occurred_at: moment.occurred_at,
    })),
  };

  if (!summary.safeToCleanup) {
    console.log(JSON.stringify(summary, null, 2));
    fail(
      'Matched QA rows have child rows. This cleanup script only deletes isolated moment seeds.',
    );
  }

  if (options.dryRun) {
    console.log('QA pagination cleanup dry-run complete. No DB writes were made.');
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (matchedMoments.length === 0) {
    console.log('QA pagination cleanup apply complete. No rows matched.');
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const deleteParams = new URLSearchParams({
    id: `in.(${momentIds.join(',')})`,
  });
  await requestSupabase(`moments?${deleteParams.toString()}`, {
    method: 'DELETE',
    headers: {
      Prefer: 'return=minimal',
    },
  });

  console.log('QA pagination cleanup apply complete.');
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

  const expectedCount =
    countValue === undefined ? null : Number.parseInt(countValue, 10);

  if (
    expectedCount !== null &&
    (!Number.isInteger(expectedCount) || expectedCount < 0)
  ) {
    fail('--count must be a non-negative integer when provided.');
  }

  if (dryRun === apply) {
    fail('Pass exactly one of --dry-run or --apply.');
  }

  return {
    runId,
    expectedCount,
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
      `Default user ${DEFAULT_USER_EMAIL} was not found. Cleanup script does not create users.`,
    );
  }

  return data[0].id;
}

async function findSeedMoments(runId: string, userId: string) {
  const searchParams = new URLSearchParams({
    select: 'id,title,occurred_at',
    user_id: `eq.${userId}`,
    title: `like.${QA_TITLE_PREFIX}${runId}]%`,
    order: 'occurred_at.desc',
    limit: '500',
  });
  return await requestSupabase<MatchedMoment[]>(
    `moments?${searchParams.toString()}`,
  );
}

async function countChildRows(runId: string, momentIds: string[]) {
  if (momentIds.length === 0) {
    return {
      analysis_jobs: 0,
      evidence_results: 0,
      upload_targets: 0,
    };
  }

  const [analysisJobs, evidenceResults, uploadTargets] = await Promise.all([
    countRowsByMomentIds('analysis_jobs', momentIds),
    countRowsByMomentIds('evidence_results', momentIds),
    countUploadTargetsByRunId(runId),
  ]);

  return {
    analysis_jobs: analysisJobs,
    evidence_results: evidenceResults,
    upload_targets: uploadTargets,
  };
}

async function countRowsByMomentIds(tableName: string, momentIds: string[]) {
  const searchParams = new URLSearchParams({
    select: 'id',
    moment_id: `in.(${momentIds.join(',')})`,
  });
  const { count } = await requestSupabaseCount(
    `${tableName}?${searchParams.toString()}`,
  );

  return count;
}

async function countUploadTargetsByRunId(runId: string) {
  const searchParams = new URLSearchParams({
    select: 'upload_id',
    file_name: `like.qa-pagination-${runId}-%`,
  });
  const { count } = await requestSupabaseCount(
    `upload_targets?${searchParams.toString()}`,
  );

  return count;
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
