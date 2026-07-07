import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { InteractionManager } from 'react-native';

import {
  getMomentDetail,
  type RemoteMomentRecord,
} from '../../services/moments';
import { getVisibleMomentStatus } from './momentStatus';
import {
  listMomentPageWithTimeout,
  type RemoteMomentSyncStatus,
} from './useBootSync';
import type { SessionSummary } from './sessionComponents';

const MOMENT_LIST_PAGE_SIZE = 20;
const LIST_THUMBNAIL_HYDRATION_DELAY_MS = 500;
const LIST_THUMBNAIL_HYDRATION_MAX_PAGES = 3;
const DETAIL_THUMBNAIL_FALLBACK_CONCURRENCY = 3;
const DETAIL_THUMBNAIL_FALLBACK_MAX_MOMENTS = 30;

export type ThumbnailHydrationDiagnostics = {
  fallbackResponseCount: number | null;
  reason: string | null;
  responseCount: number | null;
  status: 'empty' | 'error' | 'idle' | 'loading' | 'ready';
  targetCount: number;
  updatedAt: number | null;
};

type ThumbnailHydrationResult = {
  fallbackResponseCount: number | null;
  reason: string;
  remoteMoments: RemoteMomentRecord[];
};

type UseThumbnailHydrationParams = {
  canUseRemoteApi: boolean;
  isRemoteMomentSyncLoaded: boolean;
  isStorageLoaded: boolean;
  remoteMomentIdsBySessionId: Record<string, string>;
  remoteMomentSyncStatus: RemoteMomentSyncStatus;
  syncRemoteMoments: (remoteMoments: RemoteMomentRecord[]) => void;
  thumbnailsBySessionId: Record<string, string>;
  visibleVideoArchiveSessionSummaries: SessionSummary[];
};

export function useThumbnailHydration({
  canUseRemoteApi,
  isRemoteMomentSyncLoaded,
  isStorageLoaded,
  remoteMomentIdsBySessionId,
  remoteMomentSyncStatus,
  syncRemoteMoments,
  thumbnailsBySessionId,
  visibleVideoArchiveSessionSummaries,
}: UseThumbnailHydrationParams) {
  const [diagnostics, setDiagnostics] = useState<ThumbnailHydrationDiagnostics>({
    fallbackResponseCount: null,
    reason: null,
    responseCount: null,
    status: 'idle',
    targetCount: 0,
    updatedAt: null,
  });
  const lastHydrationKeyRef = useRef<string | null>(null);
  const isHydratingRef = useRef(false);

  const targetSessionIds = useMemo(
    () =>
      visibleVideoArchiveSessionSummaries
        .filter(
          (summary) =>
            getVisibleMomentStatus(summary.momentStatus) !== 'running' &&
            !thumbnailsBySessionId[summary.session.id],
        )
        .map((summary) => summary.session.id),
    [
      thumbnailsBySessionId,
      visibleVideoArchiveSessionSummaries,
    ],
  );
  const hydrationKey =
    targetSessionIds.length > 0 ? targetSessionIds.join('|') : null;

  const fetchThumbnailPages = useCallback(async () => {
    const moments: RemoteMomentRecord[] = [];
    let cursor: string | null = null;
    let pageCount = 0;
    let hasMore = true;

    while (hasMore && pageCount < LIST_THUMBNAIL_HYDRATION_MAX_PAGES) {
      const page = await listMomentPageWithTimeout({
        cursor: cursor ?? undefined,
        limit: MOMENT_LIST_PAGE_SIZE,
        view: 'thumbnails',
      });

      moments.push(...page.moments);
      cursor = page.nextCursor;
      hasMore = page.hasMore && Boolean(cursor);
      pageCount += 1;
    }

    return moments;
  }, []);

  const fetchDetailThumbnailFallback = useCallback(async (
    excludedRemoteMomentIds: Set<string> = new Set(),
  ) => {
    const targetRemoteMomentIds = targetSessionIds
      .map((sessionId) => remoteMomentIdsBySessionId[sessionId])
      .filter((remoteMomentId): remoteMomentId is string =>
        Boolean(remoteMomentId) && !excludedRemoteMomentIds.has(remoteMomentId),
      )
      .slice(0, DETAIL_THUMBNAIL_FALLBACK_MAX_MOMENTS);

    if (targetRemoteMomentIds.length === 0) {
      return [];
    }

    const remoteMoments: RemoteMomentRecord[] = [];
    let nextIndex = 0;

    async function worker() {
      while (nextIndex < targetRemoteMomentIds.length) {
        const remoteMomentId = targetRemoteMomentIds[nextIndex];
        nextIndex += 1;

        try {
          const result = await getMomentDetail(remoteMomentId);

          if (result.moment?.thumbnailUri) {
            remoteMoments.push(result.moment);
          }
        } catch {
          // Detail fallback is best-effort and should not block list rendering.
        }
      }
    }

    await Promise.all(
      Array.from({
        length: Math.min(
          DETAIL_THUMBNAIL_FALLBACK_CONCURRENCY,
          targetRemoteMomentIds.length,
        ),
      }).map(() => worker()),
    );

    return remoteMoments;
  }, [remoteMomentIdsBySessionId, targetSessionIds]);

  useEffect(() => {
    if (
      isHydratingRef.current ||
      !hydrationKey ||
      lastHydrationKeyRef.current === hydrationKey ||
      !canUseRemoteApi ||
      !isStorageLoaded ||
      !isRemoteMomentSyncLoaded ||
      remoteMomentSyncStatus !== 'completed'
    ) {
      return;
    }

    let isCancelled = false;
    const timeoutId = setTimeout(() => {
      InteractionManager.runAfterInteractions(() => {
        if (isCancelled) {
          return;
        }

        lastHydrationKeyRef.current = hydrationKey;
        isHydratingRef.current = true;
        setDiagnostics({
          fallbackResponseCount: null,
          reason: 'view=thumbnails',
          responseCount: null,
          status: 'loading',
          targetCount: targetSessionIds.length,
          updatedAt: Date.now(),
        });

        fetchThumbnailPages()
          .then((remoteMoments):
            | Promise<ThumbnailHydrationResult | undefined>
            | ThumbnailHydrationResult
            | undefined => {
            if (isCancelled) {
              return;
            }

            const thumbnailMoments = remoteMoments.filter((moment) =>
              Boolean(moment.thumbnailUri),
            );

            if (thumbnailMoments.length >= targetSessionIds.length) {
              syncRemoteMoments(remoteMoments);

              return {
                fallbackResponseCount: null,
                reason: 'view=thumbnails',
                remoteMoments,
              };
            }

            const thumbnailRemoteMomentIds = new Set(
              thumbnailMoments.map((moment) => moment.remoteMomentId),
            );

            setDiagnostics({
              fallbackResponseCount: null,
              reason: 'detail_thumbnail_fallback',
              responseCount: thumbnailMoments.length,
              status: 'loading',
              targetCount: targetSessionIds.length,
              updatedAt: Date.now(),
            });

            return fetchDetailThumbnailFallback(thumbnailRemoteMomentIds).then(
              (fallbackMoments) => {
                const mergedRemoteMoments = [...remoteMoments, ...fallbackMoments];

                if (mergedRemoteMoments.length > 0) {
                  syncRemoteMoments(mergedRemoteMoments);
                }

                if (fallbackMoments.length > 0) {
                  return {
                    fallbackResponseCount: fallbackMoments.length,
                    reason: 'detail_thumbnail_fallback',
                    remoteMoments: mergedRemoteMoments,
                  };
                }

                return {
                  fallbackResponseCount: 0,
                  reason: 'detail_thumbnail_fallback',
                  remoteMoments: mergedRemoteMoments,
                };
              },
            );
          })
          .then((result) => {
            if (isCancelled) {
              return;
            }

            if (!result) {
              return;
            }

            const { fallbackResponseCount, reason, remoteMoments } = result;
            setDiagnostics({
              fallbackResponseCount,
              reason,
              responseCount: remoteMoments.filter((moment) =>
                Boolean(moment.thumbnailUri),
              ).length,
              status: remoteMoments.some((moment) =>
                Boolean(moment.thumbnailUri),
              )
                ? 'ready'
                : 'empty',
              targetCount: targetSessionIds.length,
              updatedAt: Date.now(),
            });
          })
          .catch((error) => {
            lastHydrationKeyRef.current = null;
            setDiagnostics({
              fallbackResponseCount: null,
              reason: 'request_failed',
              responseCount: null,
              status: 'error',
              targetCount: targetSessionIds.length,
              updatedAt: Date.now(),
            });
            console.warn(
              'Video archive thumbnail hydration failed:',
              error instanceof Error ? error.message : 'Unknown error',
            );
          })
          .finally(() => {
            isHydratingRef.current = false;
          });
      });
    }, LIST_THUMBNAIL_HYDRATION_DELAY_MS);

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [
    canUseRemoteApi,
    isRemoteMomentSyncLoaded,
    isStorageLoaded,
    fetchDetailThumbnailFallback,
    fetchThumbnailPages,
    remoteMomentSyncStatus,
    syncRemoteMoments,
    hydrationKey,
    targetSessionIds.length,
  ]);

  const resetThumbnailHydration = useCallback(() => {
    lastHydrationKeyRef.current = null;
    isHydratingRef.current = false;
  }, []);

  return {
    thumbnailHydrationDiagnostics: diagnostics,
    thumbnailHydrationTargetIds: targetSessionIds,
    resetThumbnailHydration,
  };
}
