import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

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
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForAnalysisPushNotifications() {
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
