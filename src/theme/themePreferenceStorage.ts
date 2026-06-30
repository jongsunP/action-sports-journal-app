import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_THEME_PREFERENCE,
  THEME_PREFERENCE_STORAGE_KEY,
  isThemePreference,
  type ThemePreference,
} from './colors';

export async function loadThemePreference(): Promise<ThemePreference> {
  const value = await AsyncStorage.getItem(THEME_PREFERENCE_STORAGE_KEY);

  return isThemePreference(value) ? value : DEFAULT_THEME_PREFERENCE;
}

export async function saveThemePreference(
  preference: ThemePreference,
): Promise<void> {
  await AsyncStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, preference);
}

export async function clearThemePreference(): Promise<void> {
  await AsyncStorage.removeItem(THEME_PREFERENCE_STORAGE_KEY);
}
