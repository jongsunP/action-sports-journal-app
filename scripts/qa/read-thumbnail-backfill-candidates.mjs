import crypto from 'node:crypto';
import process from 'node:process';

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
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
  'source_video_storage_bucket',
  'source_video_storage_path',
  'source_video_storage_status',
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

const owners = ownerIds.map((ownerId) => {
  const ownerMoments = groupedMoments.get(ownerId) ?? [];
  const missingThumbnailRows = ownerMoments.filter((moment) => !moment.thumbnail_uri);
  const likelyBackfillable = missingThumbnailRows.filter(hasUsableStoredSource);
  const deletedSource = missingThumbnailRows.filter(
    (moment) => moment.source_video_storage_status === 'deleted',
  );
  const needsManualReview = missingThumbnailRows.filter((moment) => {
    return !hasUsableStoredSource(moment) && moment.source_video_storage_status !== 'deleted';
  });

  return {
    ownerHash: hashValue(ownerId),
    moments: {
      total: ownerMoments.length,
      thumbnailsPresent: ownerMoments.filter((moment) => Boolean(moment.thumbnail_uri)).length,
      thumbnailsMissing: missingThumbnailRows.length,
      statuses: countBy(ownerMoments, (moment) => moment.status ?? 'unknown'),
      sourceVideoStorageStatuses: countBy(
        ownerMoments,
        (moment) => moment.source_video_storage_status ?? 'unknown',
      ),
    },
    backfill: {
      likelyBackfillableFromStoredSource: likelyBackfillable.length,
      notBackfillableDeletedSource: deletedSource.length,
      needsManualReview: needsManualReview.length,
      recommendation:
        likelyBackfillable.length > 0
          ? 'approval_required_for_storage_read_and_db_write'
          : missingThumbnailRows.length > 0
            ? 'keep_placeholder_or_require_source_reupload'
            : 'no_backfill_needed',
      sampleMissingMomentIds: missingThumbnailRows.slice(0, 8).map((moment) => shortId(moment.id)),
      sampleBackfillableMomentIds: likelyBackfillable
        .slice(0, 8)
        .map((moment) => shortId(moment.id)),
    },
  };
});

const totals = owners.reduce(
  (acc, owner) => {
    acc.ownersMatched += 1;
    acc.moments += owner.moments.total;
    acc.thumbnailsPresent += owner.moments.thumbnailsPresent;
    acc.thumbnailsMissing += owner.moments.thumbnailsMissing;
    acc.likelyBackfillableFromStoredSource +=
      owner.backfill.likelyBackfillableFromStoredSource;
    acc.notBackfillableDeletedSource += owner.backfill.notBackfillableDeletedSource;
    acc.needsManualReview += owner.backfill.needsManualReview;
    return acc;
  },
  {
    likelyBackfillableFromStoredSource: 0,
    moments: 0,
    needsManualReview: 0,
    notBackfillableDeletedSource: 0,
    ownersMatched: 0,
    thumbnailsMissing: 0,
    thumbnailsPresent: 0,
  },
);

console.log(
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      mode: 'read_only_thumbnail_backfill_candidates',
      filters: {
        limit,
        matchCount,
      },
      totals,
      owners,
      safety: {
        noDbWrites: true,
        noStorageWrites: true,
        noRawUserIds: true,
        noStoragePaths: true,
        noSignedUrls: true,
      },
    },
    null,
    2,
  ),
);

function hasUsableStoredSource(moment) {
  return (
    !moment.thumbnail_uri &&
    Boolean(moment.source_video_storage_bucket) &&
    Boolean(moment.source_video_storage_path) &&
    moment.source_video_storage_status !== 'deleted'
  );
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
