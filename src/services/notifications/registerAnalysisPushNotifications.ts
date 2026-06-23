import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { requestAnalysisNotificationRefresh } from './analysisNotificationRefreshEvents';

type RegisterPushTokenResponse = {
  ok?: unknown;
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

export async function registerForAnalysisPushNotifications() {
  registerAnalysisNotificationResponseRefresh();

  if (!pushTokenEndpoint) {
    return {
      registered: false,
      reason: 'push token endpoint is not configured',
    };
  }

  if (!Device.isDevice) {
    return {
      registered: false,
      reason: 'push notifications require a physical device',
    };
  }

  const existingPermission = await Notifications.getPermissionsAsync();
  let finalStatus = existingPermission.status;

  if (finalStatus !== 'granted') {
    const requestedPermission = await Notifications.requestPermissionsAsync();
    finalStatus = requestedPermission.status;
  }

  if (finalStatus !== 'granted') {
    return {
      registered: false,
      reason: 'notification permission was not granted',
    };
  }

  const projectId =
    Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId;

  if (!projectId) {
    return {
      registered: false,
      reason: 'EAS project id is missing',
    };
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId });

  const response = await fetch(pushTokenEndpoint, {
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

  return {
    registered: data.ok === true,
  };
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
