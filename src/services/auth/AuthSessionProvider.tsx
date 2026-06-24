import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';

import {
  requestRecoveryEmailLink,
  verifyRecoveryEmailOtp,
} from './accountRecovery';
import { getAuthMode, type AuthMode } from './authPolicy';
import {
  linkKakaoIdentity,
  type KakaoLinkResult,
} from './kakaoLinking';
import { supabase } from '../supabase/client';

type AuthSessionState = {
  accessToken: string | null;
  authMode: AuthMode;
  isAuthenticated: boolean;
  isLoading: boolean;
  linkKakaoIdentity: () => Promise<KakaoLinkResult>;
  requestRecoveryEmailLink: (email: string) => Promise<void>;
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

  return data.session ?? null;
}

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  const value = useMemo<AuthSessionState>(
    () => ({
      accessToken: session?.access_token ?? null,
      authMode: getAuthMode({
        hasAccessToken: Boolean(session?.access_token),
        isLoading,
      }),
      isAuthenticated: Boolean(session?.access_token),
      isLoading,
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
    [isLoading, session],
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
