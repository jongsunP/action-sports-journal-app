import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { Session, User } from '@supabase/supabase-js';

import { supabase } from '../supabase/client';

const KAKAO_REDIRECT_PATH = 'auth/kakao';
const KAKAO_SCHEME = 'actionsportsjournal';

export type KakaoLinkResult =
  | {
      status: 'linked';
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
    refreshToken: params.get('refresh_token'),
  };
}

async function completeKakaoLinkFromRedirectUrl(url: string) {
  if (!supabase) {
    throw new KakaoLinkingError('Supabase client is not configured.');
  }

  const redirectUrl = new URL(url);
  const code = redirectUrl.searchParams.get('code');

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      throw error;
    }

    return;
  }

  const { accessToken, refreshToken } = readHashParams(redirectUrl);

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      throw error;
    }
  }
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
    throw error;
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

  await completeKakaoLinkFromRedirectUrl(result.url);

  const [{ data: sessionData, error: sessionError }, { data: userData, error: userError }] =
    await Promise.all([supabase.auth.getSession(), supabase.auth.getUser()]);

  if (sessionError) {
    throw sessionError;
  }

  if (userError) {
    throw userError;
  }

  return {
    status: 'linked',
    session: sessionData.session ?? null,
    user: userData.user ?? null,
  };
}
