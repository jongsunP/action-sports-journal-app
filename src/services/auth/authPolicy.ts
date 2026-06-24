export type AuthMode =
  | 'authLoading'
  | 'authenticated'
  | 'internalFallback'
  | 'loginRequired';

export function allowsInternalDefaultUser() {
  return process.env.EXPO_PUBLIC_ALLOW_INTERNAL_DEFAULT_USER !== 'false';
}

export function getAuthMode({
  hasAccessToken,
  isLoading,
}: {
  hasAccessToken: boolean;
  isLoading: boolean;
}): AuthMode {
  if (isLoading) {
    return 'authLoading';
  }

  if (hasAccessToken) {
    return 'authenticated';
  }

  return allowsInternalDefaultUser() ? 'internalFallback' : 'loginRequired';
}
