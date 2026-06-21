export type AnalysisNotificationRefreshSource =
  | 'last_notification_response'
  | 'notification_response';

export type AnalysisNotificationRefreshRequest = {
  id: number;
  requestedAt: string;
  source: AnalysisNotificationRefreshSource;
};

type AnalysisNotificationRefreshListener = (
  request: AnalysisNotificationRefreshRequest,
) => void;

let latestRefreshRequest: AnalysisNotificationRefreshRequest | null = null;
let nextRefreshRequestId = 1;

const listeners = new Set<AnalysisNotificationRefreshListener>();

export function requestAnalysisNotificationRefresh(
  source: AnalysisNotificationRefreshSource,
) {
  latestRefreshRequest = {
    id: nextRefreshRequestId,
    requestedAt: new Date().toISOString(),
    source,
  };
  nextRefreshRequestId += 1;

  listeners.forEach((listener) => listener(latestRefreshRequest!));
}

export function subscribeToAnalysisNotificationRefresh(
  listener: AnalysisNotificationRefreshListener,
) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function getLatestAnalysisNotificationRefreshRequest() {
  return latestRefreshRequest;
}
