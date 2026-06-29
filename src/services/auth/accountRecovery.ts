import * as Linking from 'expo-linking';
import type { Session, User } from '@supabase/supabase-js';

import { supabase } from '../supabase/client';

const EMAIL_CHANGE_REDIRECT_PATH = 'auth/email/change';
const EMAIL_RECOVERY_REDIRECT_PATH = 'auth/email/recovery';
const EMAIL_SCHEME = 'actionsportsjournal';

export type RecoveryEmailCompletionResult =
  | {
      status: 'completed';
      flow: 'connection' | 'recovery';
      session: Session;
      user: User;
    }
  | {
      status: 'notCompleted';
      flow: 'connection' | 'recovery';
      reason: 'callback_error' | 'missing_auth_payload' | 'missing_session';
      message: string;
      session: Session | null;
      user: User | null;
    };

export class AccountRecoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountRecoveryError';
  }
}

export function getRecoveryEmailChangeRedirectUrl() {
  return Linking.createURL(EMAIL_CHANGE_REDIRECT_PATH, {
    scheme: EMAIL_SCHEME,
  });
}

export function getRecoveryEmailSignInRedirectUrl() {
  return Linking.createURL(EMAIL_RECOVERY_REDIRECT_PATH, {
    scheme: EMAIL_SCHEME,
  });
}

export function isRecoveryEmailChangeUrl(url: string) {
  return isRecoveryEmailUrlForPath(url, EMAIL_CHANGE_REDIRECT_PATH);
}

export function isRecoveryEmailSignInUrl(url: string) {
  return isRecoveryEmailUrlForPath(url, EMAIL_RECOVERY_REDIRECT_PATH);
}

function isRecoveryEmailUrlForPath(url: string, path: string) {
  try {
    const parsedUrl = new URL(url);
    const hostAndPath = `${parsedUrl.host}${parsedUrl.pathname}`;

    return hostAndPath.includes(path);
  } catch {
    return false;
  }
}

function readHashParams(url: URL) {
  const params = new URLSearchParams(
    url.hash.startsWith('#') ? url.hash.slice(1) : url.hash,
  );

  return {
    accessToken: params.get('access_token'),
    error: params.get('error'),
    errorCode: params.get('error_code'),
    errorDescription: params.get('error_description'),
    refreshToken: params.get('refresh_token'),
  };
}

function getRecoveryEmailFailureMessage({
  error,
  errorCode,
  errorDescription,
}: {
  error: string | null;
  errorCode: string | null;
  errorDescription: string | null;
}) {
  const detail = `${error ?? ''} ${errorCode ?? ''} ${
    errorDescription ?? ''
  }`.toLowerCase();

  if (detail.includes('expired')) {
    return '이메일 확인 링크가 만료되었습니다. 이메일을 다시 보내주세요.';
  }

  if (detail.includes('access_denied')) {
    return '이메일 확인이 완료되지 않았습니다. 필요하면 다시 시도해주세요.';
  }

  return '이메일 확인을 완료하지 못했습니다. 다시 시도해주세요.';
}

async function readCurrentRecoverySession() {
  if (!supabase) {
    return { session: null, user: null };
  }

  const [{ data: sessionData }, { data: userData }] = await Promise.all([
    supabase.auth.getSession(),
    supabase.auth.getUser(),
  ]);

  return {
    session: sessionData.session ?? null,
    user: userData.user ?? null,
  };
}

export function normalizeRecoveryEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function requestRecoveryEmailLink(email: string) {
  if (!supabase) {
    throw new AccountRecoveryError('Supabase client is not configured.');
  }

  const normalizedEmail = normalizeRecoveryEmail(email);

  if (!normalizedEmail) {
    throw new AccountRecoveryError('Recovery email is required.');
  }

  const { data, error } = await supabase.auth.updateUser(
    {
      email: normalizedEmail,
    },
    {
      emailRedirectTo: getRecoveryEmailChangeRedirectUrl(),
    },
  );

  if (error) {
    throw error;
  }

  return data.user;
}

export async function requestRecoveryEmailSignInLink(email: string) {
  if (!supabase) {
    throw new AccountRecoveryError('Supabase client is not configured.');
  }

  const normalizedEmail = normalizeRecoveryEmail(email);

  if (!normalizedEmail) {
    throw new AccountRecoveryError('Recovery email is required.');
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      emailRedirectTo: getRecoveryEmailSignInRedirectUrl(),
      shouldCreateUser: false,
    },
  });

  if (error) {
    throw error;
  }
}

export async function verifyRecoveryEmailOtp({
  email,
  token,
}: {
  email: string;
  token: string;
}) {
  if (!supabase) {
    throw new AccountRecoveryError('Supabase client is not configured.');
  }

  const normalizedEmail = normalizeRecoveryEmail(email);
  const normalizedToken = token.trim();

  if (!normalizedEmail || !normalizedToken) {
    throw new AccountRecoveryError('Recovery email and code are required.');
  }

  const { data, error } = await supabase.auth.verifyOtp({
    email: normalizedEmail,
    token: normalizedToken,
    type: 'email_change',
  });

  if (error) {
    throw error;
  }

  return data.session;
}

export async function completeRecoveryEmailChangeFromUrl(
  url: string,
): Promise<RecoveryEmailCompletionResult> {
  return completeRecoveryEmailCallbackFromUrl(url, 'connection');
}

export async function completeRecoveryEmailSignInFromUrl(
  url: string,
): Promise<RecoveryEmailCompletionResult> {
  return completeRecoveryEmailCallbackFromUrl(url, 'recovery');
}

async function completeRecoveryEmailCallbackFromUrl(
  url: string,
  flow: 'connection' | 'recovery',
): Promise<RecoveryEmailCompletionResult> {
  if (!supabase) {
    throw new AccountRecoveryError('Supabase client is not configured.');
  }

  const redirectUrl = new URL(url);
  const queryError = redirectUrl.searchParams.get('error');
  const queryErrorCode = redirectUrl.searchParams.get('error_code');
  const queryErrorDescription =
    redirectUrl.searchParams.get('error_description');
  const code = redirectUrl.searchParams.get('code');
  const { accessToken, error, errorCode, errorDescription, refreshToken } =
    readHashParams(redirectUrl);

  if (
    queryError ||
    queryErrorCode ||
    queryErrorDescription ||
    error ||
    errorCode ||
    errorDescription
  ) {
    const { session, user } = await readCurrentRecoverySession();

    return {
      status: 'notCompleted',
      flow,
      reason: 'callback_error',
      message: getRecoveryEmailFailureMessage({
        error: queryError ?? error,
        errorCode: queryErrorCode ?? errorCode,
        errorDescription: queryErrorDescription ?? errorDescription,
      }),
      session,
      user,
    };
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      const { session, user } = await readCurrentRecoverySession();

      return {
        status: 'notCompleted',
        flow,
        reason: 'callback_error',
        message: getRecoveryEmailFailureMessage({
          error: error.name,
          errorCode: error.code ?? null,
          errorDescription: error.message,
        }),
        session,
        user,
      };
    }
  } else if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      throw error;
    }
  } else {
    const { session, user } = await readCurrentRecoverySession();

    return {
      status: 'notCompleted',
      flow,
      reason: 'missing_auth_payload',
      message: '이메일 확인 결과를 확인하지 못했습니다. 다시 시도해주세요.',
      session,
      user,
    };
  }

  const { session, user } = await readCurrentRecoverySession();

  if (!session) {
    return {
      status: 'notCompleted',
      flow,
      reason: 'missing_session',
      message: '이메일 확인 세션을 확인하지 못했습니다. 다시 시도해주세요.',
      session: null,
      user,
    };
  }

  return {
    status: 'completed',
    flow,
    session: {
      ...session,
      user: user ?? session.user,
    },
    user: user ?? session.user,
  };
}
