import { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';

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

    import('./src/services/notifications/registerAnalysisPushNotifications')
      .then(({ registerForAnalysisPushNotifications }) =>
        registerForAnalysisPushNotifications(),
      )
      .catch((error) => {
        console.warn(
          'Push notification registration failed:',
          error instanceof Error ? error.message : 'Unknown error',
        );
      });
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
