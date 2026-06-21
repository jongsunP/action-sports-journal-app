import { useCallback, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { supabase } from '../../services/supabase/client';

const ANALYSIS_REALTIME_CHANNEL = 'analysis-updates';
const ANALYSIS_COMPLETED_EVENT = 'analysis_completed';
const REALTIME_REFRESH_DEBOUNCE_MS = 350;

type AnalysisCompletedPayload = {
  analysisJobId?: string;
  momentId?: string;
  status?: string;
};

export function useAnalysisRealtimeSync({
  enabled,
  onAnalysisCompleted,
}: {
  enabled: boolean;
  onAnalysisCompleted: () => void;
}) {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const onAnalysisCompletedRef = useRef(onAnalysisCompleted);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onAnalysisCompletedRef.current = onAnalysisCompleted;
  }, [onAnalysisCompleted]);

  const scheduleRefresh = useCallback((payload: AnalysisCompletedPayload) => {
    if (payload.status && payload.status !== 'completed') {
      return;
    }

    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }

    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      onAnalysisCompletedRef.current();
    }, REALTIME_REFRESH_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    if (!enabled || !supabase) {
      return;
    }

    const client = supabase;
    let channel: ReturnType<typeof client.channel> | null = null;

    const unsubscribe = () => {
      if (!channel) {
        return;
      }

      const currentChannel = channel;
      channel = null;
      void client.removeChannel(currentChannel);
    };

    const subscribe = () => {
      if (channel || appStateRef.current !== 'active') {
        return;
      }

      channel = client
        .channel(ANALYSIS_REALTIME_CHANNEL, {
          config: {
            broadcast: {
              ack: false,
              self: false,
            },
          },
        })
        .on('broadcast', { event: ANALYSIS_COMPLETED_EVENT }, (message) => {
          const payload = normalizeAnalysisCompletedPayload(message);
          console.info('[moment_sync]', {
            event: 'analysis_realtime_received',
            momentId: payload.momentId,
            analysisJobId: payload.analysisJobId,
          });
          scheduleRefresh(payload);
        });

      channel.subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[moment_sync] analysis realtime subscription issue:', status);
        }
      });
    };

    subscribe();

    const appStateSubscription = AppState.addEventListener(
      'change',
      (nextAppState) => {
        appStateRef.current = nextAppState;

        if (nextAppState === 'active') {
          subscribe();
          return;
        }

        unsubscribe();
      },
    );

    return () => {
      appStateSubscription.remove();
      unsubscribe();

      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [enabled, scheduleRefresh]);
}

function normalizeAnalysisCompletedPayload(
  message: unknown,
): AnalysisCompletedPayload {
  if (!message || typeof message !== 'object') {
    return {};
  }

  const record = message as Record<string, unknown>;
  const payload =
    record.payload && typeof record.payload === 'object'
      ? (record.payload as Record<string, unknown>)
      : record;

  return {
    analysisJobId: asString(payload.analysisJobId),
    momentId: asString(payload.momentId),
    status: asString(payload.status),
  };
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}
