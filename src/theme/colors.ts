export type ThemePreference = 'dark' | 'light' | 'system';

export type ResolvedThemeMode = 'dark' | 'light';

export type SystemColorScheme = ResolvedThemeMode | null | undefined;

export type AppThemeColors = {
  accent: string;
  background: string;
  border: string;
  error: string;
  statusBarStyle: 'dark' | 'light';
  success: string;
  surface: string;
  surfaceElevated: string;
  textMuted: string;
  textPrimary: string;
  textSecondary: string;
  warning: string;
};

export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';

export const THEME_PREFERENCE_STORAGE_KEY = '@asj/theme-preference';

export const APP_THEME_COLORS: Record<ResolvedThemeMode, AppThemeColors> = {
  dark: {
    accent: '#03c75a',
    background: '#050507',
    border: 'rgba(255, 255, 255, 0.1)',
    error: '#fb7185',
    statusBarStyle: 'light',
    success: '#86efac',
    surface: '#0f1117',
    surfaceElevated: '#14161c',
    textMuted: '#9ca3af',
    textPrimary: '#f9fafb',
    textSecondary: '#cbd5e1',
    warning: '#fbbf24',
  },
  light: {
    accent: '#0f766e',
    background: '#f8fafc',
    border: '#e2e8f0',
    error: '#be123c',
    statusBarStyle: 'dark',
    success: '#15803d',
    surface: '#ffffff',
    surfaceElevated: '#f1f5f9',
    textMuted: '#64748b',
    textPrimary: '#0f172a',
    textSecondary: '#334155',
    warning: '#b45309',
  },
};

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function resolveThemeMode(
  preference: ThemePreference,
  systemColorScheme: SystemColorScheme,
): ResolvedThemeMode {
  if (preference === 'light' || preference === 'dark') {
    return preference;
  }

  return systemColorScheme === 'light' ? 'light' : 'dark';
}

export function getThemeColors(mode: ResolvedThemeMode): AppThemeColors {
  return APP_THEME_COLORS[mode];
}
