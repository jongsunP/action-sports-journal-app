import { useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import {
  DEFAULT_THEME_PREFERENCE,
  getThemeColors,
  resolveThemeMode,
  type AppThemeColors,
  type ResolvedThemeMode,
  type ThemePreference,
} from './colors';
import { loadThemePreference } from './themePreferenceStorage';

export type AppTheme = {
  colors: AppThemeColors;
  isLoadingPreference: boolean;
  mode: ResolvedThemeMode;
  preference: ThemePreference;
};

export function useAppTheme(): AppTheme {
  const systemColorScheme = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>(
    DEFAULT_THEME_PREFERENCE,
  );
  const [isLoadingPreference, setIsLoadingPreference] = useState(true);

  useEffect(() => {
    let isDisposed = false;

    loadThemePreference()
      .then((storedPreference) => {
        if (!isDisposed) {
          setPreference(storedPreference);
        }
      })
      .catch(() => {
        if (!isDisposed) {
          setPreference(DEFAULT_THEME_PREFERENCE);
        }
      })
      .finally(() => {
        if (!isDisposed) {
          setIsLoadingPreference(false);
        }
      });

    return () => {
      isDisposed = true;
    };
  }, []);

  const mode = resolveThemeMode(preference, systemColorScheme);

  return useMemo(
    () => ({
      colors: getThemeColors(mode),
      isLoadingPreference,
      mode,
      preference,
    }),
    [isLoadingPreference, mode, preference],
  );
}
