import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as Linking from 'expo-linking';
import type { Session, User } from '@supabase/supabase-js';

import {
  completeRecoveryEmailChangeFromUrl,
  isRecoveryEmailChangeUrl,
  requestRecoveryEmailLink,
  type RecoveryEmailCompletionResult,
  verifyRecoveryEmailOtp,
} from './accountRecovery';
import { getAuthMode, type AuthMode } from './authPolicy';
import {
  linkKakaoIdentity,
  type KakaoLinkResult,
} from './kakaoLinking';
import {
  signInWithKakaoRecovery,
  type KakaoRecoverySignInResult,
} from './kakaoRecoverySignIn';
import {
  getRecoveryErrorCode,
  getRecoveryReasonCode,
  recordRecoveryAttempt,
} from './recoveryAttempts';
import { supabase } from '../supabase/client';

type AuthSessionState = {
  accessToken: string | null;
  authMode: AuthMode;
  isAuthenticated: boolean;
  isLoading: boolean;
  lastRecoveryEmailCompletion: RecoveryEmailCompletionResult | null;
  linkKakaoIdentity: () => Promise<KakaoLinkResult>;
  requestRecoveryEmailLink: (email: string) => Promise<void>;
  recoverWithKakao: () => Promise<KakaoRecoverySignInResult>;
  refreshSession: () => Promise<Session | null>;
  session: Session | null;
  signOut: () => Promise<void>;
  user: User | null;
  verifyRecoveryEmailOtp: (params: {
    email: string;
    token: string;
  }) => Promise<Session | null>;
};

const AuthSessionContext = createContext<AuthSessionState | undefined>(undefined);

async function refreshSupabaseSession() {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.warn(
      'Supabase session refresh failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return null;
  }

  const currentSession = data.session ?? null;

  if (!currentSession) {
    return null;
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    console.warn(
      'Supabase user refresh failed:',
      userError instanceof Error ? userError.message : 'Unknown error',
    );
    return currentSession;
  }

  return userData.user
    ? {
        ...currentSession,
        user: userData.user,
      }
    : currentSession;
}

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRecoveryEmailCompletion, setLastRecoveryEmailCompletion] =
    useState<RecoveryEmailCompletionResult | null>(null);
  const handledRecoveryEmailUrlsRef = useRef(new Set<string>());

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    const client = supabase;
    let hasCompletedInitialAuthLoad = false;
    let isMounted = true;

    async function restoreOrCreateAnonymousSession() {
      try {
        const { data, error } = await client.auth.getSession();

        if (!isMounted) {
          return;
        }

        if (error) {
          console.warn(
            'Supabase session restore failed:',
            error instanceof Error ? error.message : 'Unknown error',
          );
          setSession(null);
          return;
        }

        if (data.session) {
          setSession(data.session);
          return;
        }

        const { data: anonymousData, error: anonymousError } =
          await client.auth.signInAnonymously();

        if (!isMounted) {
          return;
        }

        if (anonymousError) {
          console.warn(
            'Supabase anonymous sign-in failed:',
            anonymousError instanceof Error
              ? anonymousError.message
              : 'Unknown error',
          );
          setSession(null);
          return;
        }

        setSession(anonymousData.session ?? null);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        console.warn(
          'Supabase session initialization failed:',
          error instanceof Error ? error.message : 'Unknown error',
        );
        setSession(null);
      } finally {
        if (isMounted) {
          hasCompletedInitialAuthLoad = true;
          setIsLoading(false);
        }
      }
    }

    const { data: subscription } = client.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (!hasCompletedInitialAuthLoad && !nextSession) {
          return;
        }

        setSession(nextSession ?? null);
        if (hasCompletedInitialAuthLoad || nextSession) {
          setIsLoading(false);
        }
      },
    );

    void restoreOrCreateAnonymousSession();

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    const client = supabase;
    let isDisposed = false;

    const handleRecoveryEmailUrl = async (url: string | null) => {
      if (
        !url ||
        !isRecoveryEmailChangeUrl(url) ||
        handledRecoveryEmailUrlsRef.current.has(url)
      ) {
        return;
      }

      handledRecoveryEmailUrlsRef.current.add(url);

      try {
        void recordRecoveryAttempt({
          event: 'email_connection_callback_received',
          flow: 'email_callback',
          provider: 'email',
          status: 'started',
        });
        const result = await completeRecoveryEmailChangeFromUrl(url);

        if (isDisposed) {
          return;
        }

        setLastRecoveryEmailCompletion(result);

        void recordRecoveryAttempt({
          event:
            result.status === 'completed'
              ? 'email_connection_callback_succeeded'
              : 'email_connection_callback_failed',
          flow: 'email_callback',
          provider: 'email',
          reasonCode:
            result.status === 'completed' ? undefined : result.reason,
          status: result.status === 'completed' ? 'succeeded' : 'failed',
        });

        if (result.session) {
          setSession(
            result.status === 'completed'
              ? {
                  ...result.session,
                  user: result.user ?? result.session.user,
                }
              : result.session,
          );
        }
      } catch (error) {
        if (isDisposed) {
          return;
        }

        const { data: sessionData } = await client.auth.getSession();
        const { data: userData } = await client.auth.getUser();
        void recordRecoveryAttempt({
          errorCode: getRecoveryErrorCode(error),
          event: 'email_connection_callback_failed',
          flow: 'email_callback',
          provider: 'email',
          reasonCode: getRecoveryReasonCode(error),
          status: 'failed',
        });
        setLastRecoveryEmailCompletion({
          status: 'notCompleted',
          reason: 'callback_error',
          message:
            error instanceof Error && error.message
              ? error.message
              : '이메일 확인을 완료하지 못했습니다. 다시 시도해주세요.',
          session: sessionData.session ?? null,
          user: userData.user ?? null,
        });
      }
    };

    void Linking.getInitialURL().then(handleRecoveryEmailUrl);

    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handleRecoveryEmailUrl(url);
    });

    return () => {
      isDisposed = true;
      subscription.remove();
    };
  }, []);

  const value = useMemo<AuthSessionState>(
    () => ({
      accessToken: session?.access_token ?? null,
      authMode: getAuthMode({
        hasAccessToken: Boolean(session?.access_token),
        isLoading,
      }),
      isAuthenticated: Boolean(session?.access_token),
      isLoading,
      lastRecoveryEmailCompletion,
      linkKakaoIdentity: async () => {
        const result = await linkKakaoIdentity();

        if (result.status === 'linked') {
          const nextSession = await refreshSupabaseSession();
          setSession(
            nextSession
              ? {
                  ...nextSession,
                  user: result.user ?? nextSession.user,
                }
              : result.session,
          );
        }

        return result;
      },
      requestRecoveryEmailLink: async (email: string) => {
        const user = await requestRecoveryEmailLink(email);
        setSession((currentSession) =>
          currentSession
            ? {
                ...currentSession,
                user,
              }
            : currentSession,
        );
      },
      recoverWithKakao: async () => {
        const result = await signInWithKakaoRecovery();

        if (result.status === 'recovered') {
          const nextSession = await refreshSupabaseSession();
          setSession(
            nextSession
              ? {
                  ...nextSession,
                  user: result.user ?? nextSession.user,
                }
              : result.session,
          );
        }

        return result;
      },
      refreshSession: async () => {
        const nextSession = await refreshSupabaseSession();
        setSession(nextSession);
        return nextSession;
      },
      session,
      signOut: async () => {
        if (!supabase) {
          setSession(null);
          return;
        }

        const { error } = await supabase.auth.signOut();

        if (error) {
          throw error;
        }

        setSession(null);
      },
      user: session?.user ?? null,
      verifyRecoveryEmailOtp: async ({ email, token }) => {
        const nextSession = await verifyRecoveryEmailOtp({ email, token });

        if (nextSession) {
          setSession(nextSession);
          return nextSession;
        }

        return null;
      },
    }),
    [isLoading, lastRecoveryEmailCompletion, session],
  );

  return (
    <AuthSessionContext.Provider value={value}>
      {children}
    </AuthSessionContext.Provider>
  );
}

export function useAuthSession() {
  const context = useContext(AuthSessionContext);

  if (!context) {
    throw new Error('useAuthSession must be used within AuthSessionProvider.');
  }

  return context;
}
