import { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { AppState, StyleSheet, View } from 'react-native';

import { AccountRecoveryScreen } from './src/features/account/AccountRecoveryScreen';
import { HomeScreen } from './src/features/sessions/HomeScreen';
import { MomentDetailScreen } from './src/features/sessions/MomentDetailScreen';
import { UploadScreen } from './src/features/sessions/UploadScreen';
import type { RootStackParamList } from './src/navigation/types';
import {
  AuthSessionProvider,
  useAuthSession,
} from './src/services/auth/AuthSessionProvider';

const ENABLE_ANALYSIS_PUSH_NOTIFICATIONS =
  process.env.EXPO_PUBLIC_ENABLE_ANALYSIS_PUSH_NOTIFICATIONS === 'true';
const Stack = createNativeStackNavigator<RootStackParamList>();

function AnalysisPushRegistration() {
  const { authMode, user } = useAuthSession();
  const authOwnerKey =
    authMode === 'authenticated' && user?.id
      ? `authenticated:${user.id}`
      : authMode === 'internalFallback'
        ? 'internalFallback'
        : null;

  useEffect(() => {
    if (
      !ENABLE_ANALYSIS_PUSH_NOTIFICATIONS ||
      !authOwnerKey
    ) {
      return;
    }

    let isDisposed = false;
    let isRegistering = false;
    let latestStatus: string | undefined;
    let previousAppState = AppState.currentState;

    const shouldRetryRegistration = () =>
      !latestStatus ||
      latestStatus === 'failed' ||
      latestStatus === 'skipped_permission';

    const runRegistration = (source: string) => {
      if (isRegistering) {
        return;
      }

      isRegistering = true;

      import('./src/services/notifications/registerAnalysisPushNotifications')
        .then(({ registerForAnalysisPushNotifications }) =>
          registerForAnalysisPushNotifications({ source }),
        )
        .then((result) => {
          if (isDisposed) {
            return;
          }

          latestStatus = result.status;
          console.info('[push_registration]', {
            authOwnerKey,
            event: 'analysis_push_registration_owner_result',
            reason: result.reason,
            registered: result.registered,
            source,
            status: result.status,
          });
        })
        .catch((error) => {
          if (isDisposed) {
            return;
          }

          latestStatus = 'failed';
          console.warn(
            'Push notification registration failed:',
            error instanceof Error ? error.message : 'Unknown error',
          );
        })
        .finally(() => {
          isRegistering = false;
        });
    };

    runRegistration('auth_owner_ready');

    const appStateSubscription = AppState.addEventListener(
      'change',
      (nextAppState) => {
        const wasBackgrounded =
          previousAppState === 'background' ||
          previousAppState === 'inactive';
        previousAppState = nextAppState;

        if (
          nextAppState === 'active' &&
          wasBackgrounded &&
          shouldRetryRegistration()
        ) {
          runRegistration('foreground_retry');
        }
      },
    );

    return () => {
      isDisposed = true;
      appStateSubscription.remove();
    };
  }, [authOwnerKey]);

  return null;
}

export default function App() {
  return (
    <AuthSessionProvider>
      <View style={styles.container}>
        <AnalysisPushRegistration />
        <NavigationContainer>
          <Stack.Navigator
            screenOptions={{
              contentStyle: styles.container,
              headerShown: false,
            }}
          >
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen
              name="AccountRecovery"
              component={AccountRecoveryScreen}
              options={{
                animation: 'slide_from_right',
                gestureEnabled: true,
                headerShown: false,
                presentation: 'card',
              }}
            />
            <Stack.Screen
              name="Upload"
              component={UploadScreen}
              options={{
                animation: 'slide_from_right',
                gestureEnabled: true,
                headerShown: false,
                presentation: 'card',
              }}
            />
            <Stack.Screen
              name="MomentDetail"
              component={MomentDetailScreen}
              options={{
                animation: 'slide_from_right',
                animationMatchesGesture: true,
                fullScreenGestureEnabled: false,
                gestureEnabled: true,
                gestureDirection: 'horizontal',
                gestureResponseDistance: { start: 44 },
                headerShown: false,
                presentation: 'card',
              }}
            />
          </Stack.Navigator>
        </NavigationContainer>
        <StatusBar backgroundColor="#0b0d12" style="light" />
      </View>
    </AuthSessionProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0d12',
  },
});
