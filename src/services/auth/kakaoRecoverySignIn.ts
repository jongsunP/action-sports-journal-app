import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { Session, User } from '@supabase/supabase-js';

import { supabase } from '../supabase/client';

const KAKAO_RECOVERY_REDIRECT_PATH = 'auth/kakao/recovery';
const KAKAO_SCHEME = 'actionsportsjournal';

export type KakaoRecoverySignInResult =
  | {
      status: 'recovered';
      session: Session;
      user: User;
    }
  | {
      status: 'notRecovered';
      reason:
        | 'callback_error'
        | 'missing_auth_payload'
        | 'missing_kakao_identity'
        | 'missing_session';
      message: string;
      session: Session | null;
      user: User | null;
    }
  | {
      status: 'cancelled';
    }
  | {
      status: 'dismissed';
    };

export class KakaoRecoverySignInError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KakaoRecoverySignInError';
  }
}

export function getKakaoRecoveryRedirectUrl() {
  return Linking.createURL(KAKAO_RECOVERY_REDIRECT_PATH, {
    scheme: KAKAO_SCHEME,
  });
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

function hasKakaoIdentity(user: User | null) {
  return Boolean(
    user?.identities?.some((identity) => identity.provider === 'kakao'),
  );
}

function getKakaoRecoveryFailureMessage({
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

  if (detail.includes('access_denied')) {
    return '카카오 복구 로그인이 완료되지 않았습니다. 필요하면 다시 시도해주세요.';
  }

  return '카카오로 기존 기록을 복구하지 못했습니다. 다시 시도해주세요.';
}

async function completeKakaoRecoveryFromRedirectUrl(url: string) {
  if (!supabase) {
    throw new KakaoRecoverySignInError('Supabase client is not configured.');
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
    return {
      status: 'notRecovered' as const,
      reason: 'callback_error' as const,
      message: getKakaoRecoveryFailureMessage({
        error: queryError ?? error,
        errorCode: queryErrorCode ?? errorCode,
        errorDescription: queryErrorDescription ?? errorDescription,
      }),
    };
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return {
        status: 'notRecovered' as const,
        reason: 'callback_error' as const,
        message: getKakaoRecoveryFailureMessage({
          error: error.name,
          errorCode: error.code ?? null,
          errorDescription: error.message,
        }),
      };
    }

    return { status: 'completed' as const };
  }

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      throw error;
    }

    return { status: 'completed' as const };
  }

  return {
    status: 'notRecovered' as const,
    reason: 'missing_auth_payload' as const,
    message: '카카오 복구 결과를 확인하지 못했습니다. 다시 시도해주세요.',
  };
}

export async function signInWithKakaoRecovery(): Promise<KakaoRecoverySignInResult> {
  if (!supabase) {
    throw new KakaoRecoverySignInError('Supabase client is not configured.');
  }

  const redirectTo = getKakaoRecoveryRedirectUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'kakao',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error) {
    throw error;
  }

  if (!data?.url) {
    throw new KakaoRecoverySignInError(
      'Kakao recovery sign-in URL was not returned.',
    );
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type === 'cancel') {
    return { status: 'cancelled' };
  }

  if (result.type === 'dismiss') {
    return { status: 'dismissed' };
  }

  if (result.type !== 'success') {
    return { status: 'dismissed' };
  }

  const completion = await completeKakaoRecoveryFromRedirectUrl(result.url);

  if (completion.status === 'notRecovered') {
    const [{ data: sessionData }, { data: userData }] = await Promise.all([
      supabase.auth.getSession(),
      supabase.auth.getUser(),
    ]);

    return {
      ...completion,
      session: sessionData.session ?? null,
      user: userData.user ?? null,
    };
  }

  const [{ data: sessionData, error: sessionError }, { data: userData, error: userError }] =
    await Promise.all([supabase.auth.getSession(), supabase.auth.getUser()]);

  if (sessionError) {
    throw sessionError;
  }

  if (userError) {
    throw userError;
  }

  const nextSession = sessionData.session ?? null;
  const nextUser = userData.user ?? null;

  if (!nextSession) {
    return {
      status: 'notRecovered',
      reason: 'missing_session',
      message: '카카오 복구 세션을 확인하지 못했습니다. 다시 시도해주세요.',
      session: null,
      user: nextUser,
    };
  }

  if (!hasKakaoIdentity(nextUser)) {
    return {
      status: 'notRecovered',
      reason: 'missing_kakao_identity',
      message:
        '카카오로 로그인했지만 기존 기록 복구 대상을 확인하지 못했습니다.',
      session: nextSession,
      user: nextUser,
    };
  }

  return {
    status: 'recovered',
    session: {
      ...nextSession,
      user: nextUser ?? nextSession.user,
    },
    user: nextUser ?? nextSession.user,
  };
}
