import AsyncStorage from '@react-native-async-storage/async-storage';

import type { RemoteMomentPage, RemoteMomentRecord } from '../../services/moments';

export const JOURNAL_SNAPSHOT_CACHE_SCHEMA_VERSION = 1;
export const JOURNAL_SNAPSHOT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const JOURNAL_SNAPSHOT_CACHE_KEY_PREFIX =
  'action-sports-journal:journal-snapshot';
const analysisEndpoint = process.env.EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT ?? '';

export type JournalSnapshotCacheOwnerKey =
  | 'internalFallback'
  | 'loginRequired'
  | `authenticated:${string}`;

export type JournalSnapshotCacheHit = {
  ageMs: number;
  hasMore: boolean;
  moments: RemoteMomentRecord[];
  nextCursor: string | null;
  snapshotCount: number;
};

export type JournalSnapshotCacheLoadResult =
  | {
      hit: true;
      reason: 'hit';
      snapshot: JournalSnapshotCacheHit;
    }
  | {
      hit: false;
      reason:
        | 'corrupt'
        | 'empty'
        | 'expired'
        | 'missing_owner'
        | 'schema_mismatch';
    };

type PersistedJournalSnapshotCache = {
  endpointKey: string;
  fetchedAt: number;
  hasMore: boolean;
  moments: RemoteMomentRecord[];
  nextCursor: string | null;
  ownerKeyHash: string;
  schemaVersion: number;
};

export function getJournalSnapshotCacheOwnerKeyHash(
  ownerKey: JournalSnapshotCacheOwnerKey | null,
) {
  return ownerKey ? hashValue(ownerKey) : null;
}

export async function loadRecentJournalSnapshot(
  ownerKey: JournalSnapshotCacheOwnerKey | null,
): Promise<JournalSnapshotCacheLoadResult> {
  const cacheKey = getJournalSnapshotCacheKey(ownerKey);

  if (!cacheKey) {
    return { hit: false, reason: 'missing_owner' };
  }

  const rawValue = await AsyncStorage.getItem(cacheKey);

  if (!rawValue) {
    return { hit: false, reason: 'empty' };
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<PersistedJournalSnapshotCache>;
    const expectedOwnerKeyHash = getJournalSnapshotCacheOwnerKeyHash(ownerKey);

    if (
      parsed.schemaVersion !== JOURNAL_SNAPSHOT_CACHE_SCHEMA_VERSION ||
      parsed.ownerKeyHash !== expectedOwnerKeyHash ||
      parsed.endpointKey !== getEndpointKey()
    ) {
      return { hit: false, reason: 'schema_mismatch' };
    }

    if (
      typeof parsed.fetchedAt !== 'number' ||
      !Number.isFinite(parsed.fetchedAt) ||
      !Array.isArray(parsed.moments)
    ) {
      return { hit: false, reason: 'corrupt' };
    }

    const ageMs = Date.now() - parsed.fetchedAt;

    if (ageMs < 0 || ageMs > JOURNAL_SNAPSHOT_CACHE_TTL_MS) {
      return { hit: false, reason: 'expired' };
    }

    return {
      hit: true,
      reason: 'hit',
      snapshot: {
        ageMs,
        hasMore: parsed.hasMore === true,
        moments: parsed.moments,
        nextCursor: typeof parsed.nextCursor === 'string' ? parsed.nextCursor : null,
        snapshotCount: parsed.moments.length,
      },
    };
  } catch {
    return { hit: false, reason: 'corrupt' };
  }
}

export async function saveRecentJournalSnapshot({
  ownerKey,
  page,
}: {
  ownerKey: JournalSnapshotCacheOwnerKey | null;
  page: Pick<RemoteMomentPage, 'hasMore' | 'moments' | 'nextCursor'>;
}) {
  const cacheKey = getJournalSnapshotCacheKey(ownerKey);
  const ownerKeyHash = getJournalSnapshotCacheOwnerKeyHash(ownerKey);

  if (!cacheKey || !ownerKeyHash) {
    return;
  }

  const snapshot: PersistedJournalSnapshotCache = {
    endpointKey: getEndpointKey(),
    fetchedAt: Date.now(),
    hasMore: page.hasMore,
    moments: page.moments.map(sanitizeRemoteMomentForSnapshot),
    nextCursor: page.nextCursor,
    ownerKeyHash,
    schemaVersion: JOURNAL_SNAPSHOT_CACHE_SCHEMA_VERSION,
  };

  await AsyncStorage.setItem(cacheKey, JSON.stringify(snapshot));
}

export async function removeMomentFromRecentJournalSnapshot({
  localSessionId,
  ownerKey,
  remoteMomentId,
}: {
  localSessionId: string;
  ownerKey: JournalSnapshotCacheOwnerKey | null;
  remoteMomentId?: string;
}) {
  const cacheKey = getJournalSnapshotCacheKey(ownerKey);

  if (!cacheKey) {
    return;
  }

  const rawValue = await AsyncStorage.getItem(cacheKey);

  if (!rawValue) {
    return;
  }

  try {
    const parsed = JSON.parse(rawValue) as PersistedJournalSnapshotCache;

    if (!Array.isArray(parsed.moments)) {
      await AsyncStorage.removeItem(cacheKey);
      return;
    }

    const moments = parsed.moments.filter(
      (moment) =>
        moment.remoteMomentId !== remoteMomentId &&
        moment.session.id !== localSessionId,
    );

    if (moments.length === parsed.moments.length) {
      return;
    }

    await AsyncStorage.setItem(
      cacheKey,
      JSON.stringify({
        ...parsed,
        fetchedAt: Date.now(),
        hasMore: parsed.hasMore,
        moments,
      }),
    );
  } catch {
    await AsyncStorage.removeItem(cacheKey);
  }
}

export async function clearRecentJournalSnapshot(
  ownerKey: JournalSnapshotCacheOwnerKey | null,
) {
  const cacheKey = getJournalSnapshotCacheKey(ownerKey);

  if (!cacheKey) {
    return;
  }

  await AsyncStorage.removeItem(cacheKey);
}

function getJournalSnapshotCacheKey(ownerKey: JournalSnapshotCacheOwnerKey | null) {
  const ownerKeyHash = getJournalSnapshotCacheOwnerKeyHash(ownerKey);

  if (!ownerKeyHash) {
    return null;
  }

  return [
    JOURNAL_SNAPSHOT_CACHE_KEY_PREFIX,
    `v${JOURNAL_SNAPSHOT_CACHE_SCHEMA_VERSION}`,
    getEndpointKey(),
    ownerKeyHash,
  ].join(':');
}

function sanitizeRemoteMomentForSnapshot(
  remoteMoment: RemoteMomentRecord,
): RemoteMomentRecord {
  return {
    remoteMomentId: remoteMoment.remoteMomentId,
    session: {
      ...remoteMoment.session,
      videoUri: undefined,
    },
    sourceVideoStorageStatus: remoteMoment.sourceVideoStorageStatus,
  };
}

function getEndpointKey() {
  return hashValue(analysisEndpoint);
}

function hashValue(value: string) {
  let hash = 5381;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }

  return (hash >>> 0).toString(36);
}
