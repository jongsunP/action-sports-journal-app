import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';

import {
  DEFAULT_THEME_PREFERENCE,
  getThemeColors,
  resolveThemeMode,
  type AppThemeColors,
  type ResolvedThemeMode,
  type ThemePreference,
} from './colors';
import {
  loadThemePreference,
  saveThemePreference,
} from './themePreferenceStorage';

export type AppTheme = {
  colors: AppThemeColors;
  isLoadingPreference: boolean;
  mode: ResolvedThemeMode;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => Promise<void>;
};

const AppThemeContext = createContext<AppTheme | undefined>(undefined);

function useAppThemeValue(): AppTheme {
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

  const handleSetPreference = useCallback(
    async (nextPreference: ThemePreference) => {
      setPreference(nextPreference);
      await saveThemePreference(nextPreference);
    },
    [],
  );

  const mode = resolveThemeMode(preference, systemColorScheme);

  return useMemo(
    () => ({
      colors: getThemeColors(mode),
      isLoadingPreference,
      mode,
      preference,
      setPreference: handleSetPreference,
    }),
    [handleSetPreference, isLoadingPreference, mode, preference],
  );
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const value = useAppThemeValue();

  return createElement(AppThemeContext.Provider, { value }, children);
}

export function useAppTheme(): AppTheme {
  const value = useContext(AppThemeContext);

  if (!value) {
    throw new Error('useAppTheme must be used within AppThemeProvider.');
  }

  return value;
}
