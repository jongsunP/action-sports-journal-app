import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { Session, User } from '@supabase/supabase-js';

import { supabase } from '../supabase/client';

const KAKAO_REDIRECT_PATH = 'auth/kakao';
const KAKAO_SCHEME = 'actionsportsjournal';

type KakaoNotLinkedReason =
  | 'already_linked_to_other_account'
  | 'callback_error'
  | 'missing_auth_payload'
  | 'missing_kakao_identity';

export type KakaoLinkResult =
  | {
      status: 'linked';
      session: Session | null;
      user: User | null;
    }
  | {
      status: 'notLinked';
      reason: KakaoNotLinkedReason;
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

export class KakaoLinkingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KakaoLinkingError';
  }
}

export function getKakaoLinkRedirectUrl() {
  return Linking.createURL(KAKAO_REDIRECT_PATH, {
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

function getKakaoLinkFailureReason({
  error,
  errorCode,
  errorDescription,
}: {
  error: string | null;
  errorCode: string | null;
  errorDescription: string | null;
}): KakaoNotLinkedReason {
  const detail = `${error ?? ''} ${errorCode ?? ''} ${
    errorDescription ?? ''
  }`.toLowerCase();

  if (
    detail.includes('already') ||
    detail.includes('exists') ||
    detail.includes('identity')
  ) {
    return 'already_linked_to_other_account';
  }

  return 'callback_error';
}

function getKakaoCallbackFailureMessage({
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

  if (
    detail.includes('already') ||
    detail.includes('exists') ||
    detail.includes('identity')
  ) {
    return '이미 다른 기기 계정에 연결된 카카오일 수 있습니다. 현재 기기 계정에는 연결되지 않았습니다.';
  }

  return '카카오 연결을 완료하지 못했습니다. 다시 시도해주세요.';
}

async function readCurrentSessionAndUser() {
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

async function completeKakaoLinkFromRedirectUrl(url: string) {
  if (!supabase) {
    throw new KakaoLinkingError('Supabase client is not configured.');
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
    const callbackError = queryError ?? error;
    const callbackErrorCode = queryErrorCode ?? errorCode;
    const callbackErrorDescription =
      queryErrorDescription ?? errorDescription;

    return {
      status: 'notLinked' as const,
      reason: getKakaoLinkFailureReason({
        error: callbackError,
        errorCode: callbackErrorCode,
        errorDescription: callbackErrorDescription,
      }),
      message: getKakaoCallbackFailureMessage({
        error: callbackError,
        errorCode: callbackErrorCode,
        errorDescription: callbackErrorDescription,
      }),
    };
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return {
        status: 'notLinked' as const,
        reason: getKakaoLinkFailureReason({
          error: error.name,
          errorCode: error.code ?? null,
          errorDescription: error.message,
        }),
        message: getKakaoCallbackFailureMessage({
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
    status: 'notLinked' as const,
    reason: 'missing_auth_payload' as const,
    message: '카카오 연결 결과를 확인하지 못했습니다. 다시 시도해주세요.',
  };
}

export async function linkKakaoIdentity(): Promise<KakaoLinkResult> {
  if (!supabase) {
    throw new KakaoLinkingError('Supabase client is not configured.');
  }

  const redirectTo = getKakaoLinkRedirectUrl();
  const { data, error } = await supabase.auth.linkIdentity({
    provider: 'kakao',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error) {
    const { session, user } = await readCurrentSessionAndUser();

    return {
      status: 'notLinked',
      reason: getKakaoLinkFailureReason({
        error: error.name,
        errorCode: error.code ?? null,
        errorDescription: error.message,
      }),
      message: getKakaoCallbackFailureMessage({
        error: error.name,
        errorCode: error.code ?? null,
        errorDescription: error.message,
      }),
      session,
      user,
    };
  }

  if (!data?.url) {
    throw new KakaoLinkingError('Kakao linking URL was not returned.');
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

  const completion = await completeKakaoLinkFromRedirectUrl(result.url);

  if (completion.status === 'notLinked') {
    const { session, user } = await readCurrentSessionAndUser();

    return {
      ...completion,
      session,
      user,
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

  if (!hasKakaoIdentity(nextUser)) {
    return {
      status: 'notLinked',
      reason: 'already_linked_to_other_account',
      message:
        '카카오 연결을 완료하지 못했습니다. 이미 다른 기기 계정에 연결된 카카오일 수 있습니다.',
      session: nextSession,
      user: nextUser,
    };
  }

  return {
    status: 'linked',
    session: nextSession,
    user: nextUser,
  };
}
