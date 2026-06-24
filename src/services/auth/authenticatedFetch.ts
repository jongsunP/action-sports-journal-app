import { allowsInternalDefaultUser } from './authPolicy';
import { supabase } from '../supabase/client';

type AuthenticatedFetchInit = RequestInit & {
  headers?: HeadersInit;
};

export class AuthRequiredError extends Error {
  constructor(message = 'Authentication is required for this request.') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

export async function getAuthHeaders(headers?: HeadersInit) {
  const mergedHeaders = new Headers(headers);

  if (!supabase) {
    if (!allowsInternalDefaultUser()) {
      throw new AuthRequiredError();
    }

    return mergedHeaders;
  }

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.warn(
      'Supabase auth header lookup failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    if (!allowsInternalDefaultUser()) {
      throw new AuthRequiredError();
    }

    return mergedHeaders;
  }

  const accessToken = data.session?.access_token;

  if (accessToken) {
    mergedHeaders.set('Authorization', `Bearer ${accessToken}`);
    return mergedHeaders;
  }

  if (!allowsInternalDefaultUser()) {
    throw new AuthRequiredError();
  }

  return mergedHeaders;
}

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: AuthenticatedFetchInit = {},
) {
  const headers = await getAuthHeaders(init.headers);

  return fetch(input, {
    ...init,
    headers,
  });
}
