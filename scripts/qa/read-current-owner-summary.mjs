import crypto from 'node:crypto';
import process from 'node:process';

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const endpoint = process.env.EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT;
const args = parseArgs(process.argv.slice(2));
const limit = Number(args.limit ?? 10);
const matchCount = args['match-count'] ? Number(args['match-count']) : null;

if (!supabaseUrl) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL.');
  process.exit(1);
}

if (!serviceRoleKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

if (!Number.isFinite(limit) || limit <= 0 || limit > 50) {
  console.error('Invalid --limit. Use a number from 1 to 50.');
  process.exit(1);
}

if (matchCount !== null && (!Number.isFinite(matchCount) || matchCount < 0)) {
  console.error('Invalid --match-count. Use a non-negative number.');
  process.exit(1);
}

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const moments = await readAllRows('moments', [
  'id',
  'user_id',
  'status',
  'created_at',
  'thumbnail_uri',
  'source_video_storage_status',
  'latest_analysis_job_id',
  'latest_evidence_result_id',
]);

const groupedMoments = groupBy(moments, (moment) => moment.user_id);
let ownerIds = [...groupedMoments.keys()]
  .filter(Boolean)
  .sort((left, right) => {
    const leftCount = groupedMoments.get(left)?.length ?? 0;
    const rightCount = groupedMoments.get(right)?.length ?? 0;
    return rightCount - leftCount;
  });

if (matchCount !== null) {
  ownerIds = ownerIds.filter((ownerId) => {
    return (groupedMoments.get(ownerId)?.length ?? 0) === matchCount;
  });
}

ownerIds = ownerIds.slice(0, limit);

const [users, pushTokens, recoveryAttempts, analysisJobs, evidenceResults] =
  await Promise.all([
    readRowsByUserIds('users', ownerIds, [
      'id',
      'created_at',
      'updated_at',
      'display_name',
      'locale',
    ]),
    readRowsByUserIds('device_push_tokens', ownerIds, [
      'user_id',
      'platform',
      'enabled',
      'last_registered_at',
      'updated_at',
    ]),
    readRowsByUserIds('recovery_attempts', ownerIds, [
      'user_id',
      'provider',
      'flow',
      'event',
      'status',
      'reason_code',
      'error_code',
      'created_at',
    ]),
    readRowsByUserIds('analysis_jobs', ownerIds, [
      'user_id',
      'status',
      'kind',
      'provider',
      'created_at',
    ]),
    readRowsByUserIds('evidence_results', ownerIds, [
      'user_id',
      'status',
      'provider',
      'quality_mode',
      'created_at',
    ]),
  ]);

const usersById = new Map(users.map((user) => [user.id, user]));
const pushTokensByOwner = groupBy(pushTokens, (token) => token.user_id);
const recoveryByOwner = groupBy(recoveryAttempts, (attempt) => attempt.user_id);
const jobsByOwner = groupBy(analysisJobs, (job) => job.user_id);
const evidenceByOwner = groupBy(evidenceResults, (result) => result.user_id);

const owners = ownerIds.map((ownerId) => {
  const ownerMoments = groupedMoments.get(ownerId) ?? [];
  const user = usersById.get(ownerId);
  const ownerPushTokens = pushTokensByOwner.get(ownerId) ?? [];
  const ownerRecoveryAttempts = recoveryByOwner.get(ownerId) ?? [];
  const ownerJobs = jobsByOwner.get(ownerId) ?? [];
  const ownerEvidence = evidenceByOwner.get(ownerId) ?? [];

  return {
    ownerHash: hashValue(ownerId),
    userProfilePresent: Boolean(user),
    displayNamePresent: Boolean(user?.display_name),
    locale: user?.locale ?? null,
    userCreatedAt: user?.created_at ?? null,
    userUpdatedAt: user?.updated_at ?? null,
    moments: summarizeMoments(ownerMoments),
    pushTokens: {
      total: ownerPushTokens.length,
      enabled: ownerPushTokens.filter((token) => token.enabled).length,
      platforms: countBy(ownerPushTokens, (token) => token.platform ?? 'unknown'),
      latestRegisteredAt: maxIso(
        ownerPushTokens.map((token) => token.last_registered_at ?? token.updated_at),
      ),
    },
    recoveryAttempts: {
      total: ownerRecoveryAttempts.length,
      providers: countBy(ownerRecoveryAttempts, (attempt) => attempt.provider ?? 'unknown'),
      statuses: countBy(ownerRecoveryAttempts, (attempt) => attempt.status ?? 'unknown'),
      latestAt: maxIso(ownerRecoveryAttempts.map((attempt) => attempt.created_at)),
    },
    analysisJobs: {
      total: ownerJobs.length,
      statuses: countBy(ownerJobs, (job) => job.status ?? 'unknown'),
      kinds: countBy(ownerJobs, (job) => job.kind ?? 'unknown'),
      providers: countBy(ownerJobs, (job) => job.provider ?? 'unknown'),
      latestAt: maxIso(ownerJobs.map((job) => job.created_at)),
    },
    evidenceResults: {
      total: ownerEvidence.length,
      statuses: countBy(ownerEvidence, (result) => result.status ?? 'unknown'),
      providers: countBy(ownerEvidence, (result) => result.provider ?? 'unknown'),
      qualityModes: countBy(ownerEvidence, (result) => result.quality_mode ?? 'unknown'),
      latestAt: maxIso(ownerEvidence.map((result) => result.created_at)),
    },
  };
});

console.log(
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      mode: 'read_only_sanitized',
      endpointHash: hashValue(endpoint ?? 'missing'),
      filters: {
        limit,
        matchCount,
      },
      totals: {
        momentsRead: moments.length,
        ownersMatched: owners.length,
      },
      owners,
      safety: {
        noRawUserIds: true,
        noAuthUserIds: true,
        noEmails: true,
        noTokens: true,
        noStoragePaths: true,
        noSignedUrls: true,
      },
    },
    null,
    2,
  ),
);

function parseArgs(rawArgs) {
  return rawArgs.reduce((acc, arg) => {
    if (!arg.startsWith('--')) {
      return acc;
    }

    const [key, value = 'true'] = arg.slice(2).split('=');
    acc[key] = value;
    return acc;
  }, {});
}

async function readAllRows(tableName, columns, pageSize = 1000, maxRows = 5000) {
  const rows = [];

  for (let from = 0; from < maxRows; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await client
      .from(tableName)
      .select(columns.join(','))
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(`Failed to read ${tableName}: ${error.message}`);
    }

    rows.push(...(data ?? []));

    if (!data || data.length < pageSize) {
      break;
    }
  }

  return rows;
}

async function readRowsByUserIds(tableName, userIds, columns) {
  if (userIds.length === 0) {
    return [];
  }

  const chunks = chunk(userIds, 100);
  const rows = [];

  for (const userIdChunk of chunks) {
    const userIdColumn = tableName === 'users' ? 'id' : 'user_id';
    const { data, error } = await client
      .from(tableName)
      .select(columns.join(','))
      .in(userIdColumn, userIdChunk);

    if (error) {
      throw new Error(`Failed to read ${tableName}: ${error.message}`);
    }

    rows.push(...(data ?? []));
  }

  return rows;
}

function summarizeMoments(momentsForOwner) {
  return {
    total: momentsForOwner.length,
    statuses: countBy(momentsForOwner, (moment) => moment.status ?? 'unknown'),
    thumbnails: momentsForOwner.filter((moment) => Boolean(moment.thumbnail_uri)).length,
    missingThumbnails: momentsForOwner.filter((moment) => !moment.thumbnail_uri).length,
    sourceVideoStorageStatuses: countBy(
      momentsForOwner,
      (moment) => moment.source_video_storage_status ?? 'unknown',
    ),
    withLatestAnalysisJob: momentsForOwner.filter((moment) =>
      Boolean(moment.latest_analysis_job_id),
    ).length,
    withLatestEvidenceResult: momentsForOwner.filter((moment) =>
      Boolean(moment.latest_evidence_result_id),
    ).length,
    latestAt: maxIso(momentsForOwner.map((moment) => moment.created_at)),
    oldestAt: minIso(momentsForOwner.map((moment) => moment.created_at)),
    sampleMomentIds: momentsForOwner.slice(0, 5).map((moment) => shortId(moment.id)),
  };
}

function groupBy(items, getKey) {
  return items.reduce((acc, item) => {
    const key = getKey(item);
    if (!key) {
      return acc;
    }

    const group = acc.get(key) ?? [];
    group.push(item);
    acc.set(key, group);
    return acc;
  }, new Map());
}

function countBy(items, getKey) {
  return items.reduce((acc, item) => {
    const key = getKey(item);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function minIso(values) {
  const validValues = values.filter(Boolean).sort();
  return validValues[0] ?? null;
}

function maxIso(values) {
  const validValues = values.filter(Boolean).sort();
  return validValues.at(-1) ?? null;
}

function chunk(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function shortId(value) {
  if (!value) {
    return null;
  }

  const text = String(value);
  return text.length <= 8 ? text : text.slice(0, 8);
}

function hashValue(value) {
  return crypto
    .createHash('sha256')
    .update(String(value ?? ''))
    .digest('hex')
    .slice(0, 12);
}
