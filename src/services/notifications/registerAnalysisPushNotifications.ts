import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { authenticatedFetch } from '../auth/authenticatedFetch';
import { requestAnalysisNotificationRefresh } from './analysisNotificationRefreshEvents';

type RegisterPushTokenResponse = {
  ok?: unknown;
};

export type AnalysisPushRegistrationStatus =
  | 'failed'
  | 'registered'
  | 'skipped_missing_endpoint'
  | 'skipped_missing_project_id'
  | 'skipped_not_device'
  | 'skipped_permission';

export type AnalysisPushRegistrationResult = {
  reason?: string;
  registered: boolean;
  source: string;
  status: AnalysisPushRegistrationStatus;
};

type RegisterAnalysisPushNotificationsOptions = {
  source?: string;
};

const analysisEndpoint = process.env.EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT;
const pushTokenEndpoint = analysisEndpoint?.replace(
  /\/api\/analyze-session-video$/,
  '/api/push-tokens',
);

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowAlert: false,
    shouldShowBanner: false,
    shouldShowList: false,
  }),
});

let notificationResponseSubscription:
  | ReturnType<typeof Notifications.addNotificationResponseReceivedListener>
  | undefined;
let lastHandledNotificationResponseId: string | undefined;
let inFlightRegistration:
  | Promise<AnalysisPushRegistrationResult>
  | undefined;

export function registerForAnalysisPushNotifications(
  options: RegisterAnalysisPushNotificationsOptions = {},
) {
  if (!inFlightRegistration) {
    inFlightRegistration = registerForAnalysisPushNotificationsInternal(options)
      .finally(() => {
        inFlightRegistration = undefined;
      });
  }

  return inFlightRegistration;
}

async function registerForAnalysisPushNotificationsInternal({
  source = 'app',
}: RegisterAnalysisPushNotificationsOptions): Promise<AnalysisPushRegistrationResult> {
  registerAnalysisNotificationResponseRefresh();

  if (!pushTokenEndpoint) {
    return logPushRegistrationResult({
      registered: false,
      reason: 'push token endpoint is not configured',
      source,
      status: 'skipped_missing_endpoint',
    });
  }

  if (!Device.isDevice) {
    return logPushRegistrationResult({
      registered: false,
      reason: 'push notifications require a physical device',
      source,
      status: 'skipped_not_device',
    });
  }

  try {
    const existingPermission = await Notifications.getPermissionsAsync();
    let finalStatus = existingPermission.status;

    if (finalStatus !== 'granted') {
      const requestedPermission = await Notifications.requestPermissionsAsync();
      finalStatus = requestedPermission.status;
    }

    if (finalStatus !== 'granted') {
      return logPushRegistrationResult({
        registered: false,
        reason: 'notification permission was not granted',
        source,
        status: 'skipped_permission',
      });
    }

    const projectId =
      Constants.easConfig?.projectId ??
      Constants.expoConfig?.extra?.eas?.projectId;

    if (!projectId) {
      return logPushRegistrationResult({
        registered: false,
        reason: 'EAS project id is missing',
        source,
        status: 'skipped_missing_project_id',
      });
    }

    const token = await Notifications.getExpoPushTokenAsync({ projectId });

    const response = await authenticatedFetch(pushTokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expoPushToken: token.data,
        platform: Platform.OS,
        deviceId: Constants.sessionId ?? null,
        appVersion: Constants.expoConfig?.version ?? null,
      }),
    });

    if (!response.ok) {
      throw new Error(`Push token registration failed with ${response.status}`);
    }

    const data = (await response.json()) as RegisterPushTokenResponse;

    return logPushRegistrationResult({
      registered: data.ok === true,
      source,
      status: data.ok === true ? 'registered' : 'failed',
      reason: data.ok === true ? undefined : 'push token endpoint returned ok=false',
    });
  } catch (error) {
    return logPushRegistrationResult({
      registered: false,
      reason: error instanceof Error ? error.message : 'Unknown error',
      source,
      status: 'failed',
    });
  }
}

function logPushRegistrationResult(
  result: AnalysisPushRegistrationResult,
): AnalysisPushRegistrationResult {
  const logPayload = {
    event: 'analysis_push_registration_result',
    reason: result.reason,
    registered: result.registered,
    source: result.source,
    status: result.status,
  };

  if (result.status === 'failed') {
    console.warn('[push_registration]', logPayload);
  } else {
    console.info('[push_registration]', logPayload);
  }

  return result;
}

function registerAnalysisNotificationResponseRefresh() {
  if (!notificationResponseSubscription) {
    notificationResponseSubscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        handleNotificationResponseRefresh(
          response.notification.request.identifier,
          'notification_response',
        );
      });
  }

  try {
    const lastResponse = Notifications.getLastNotificationResponse();

    if (lastResponse) {
      handleNotificationResponseRefresh(
        lastResponse.notification.request.identifier,
        'last_notification_response',
      );
    }
  } catch (error) {
    console.warn(
      'Last notification response lookup failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}

function handleNotificationResponseRefresh(
  notificationRequestId: string,
  source: 'last_notification_response' | 'notification_response',
) {
  if (lastHandledNotificationResponseId === notificationRequestId) {
    return;
  }

  lastHandledNotificationResponseId = notificationRequestId;
  requestAnalysisNotificationRefresh(source);
}
