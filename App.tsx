import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';

import { HomeScreen } from './src/features/sessions/HomeScreen';
import { registerForAnalysisPushNotifications } from './src/services/notifications/registerAnalysisPushNotifications';

export default function App() {
  useEffect(() => {
    registerForAnalysisPushNotifications().catch((error) => {
      console.warn(
        'Push notification registration failed:',
        error instanceof Error ? error.message : 'Unknown error',
      );
    });
  }, []);

  return (
    <View style={styles.container}>
      <HomeScreen />
      <StatusBar backgroundColor="#0b0d12" style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0d12',
  },
});
