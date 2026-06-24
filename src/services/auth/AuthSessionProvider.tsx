import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';

import { getAuthMode, type AuthMode } from './authPolicy';
import { supabase } from '../supabase/client';

type AuthSessionState = {
  accessToken: string | null;
  authMode: AuthMode;
  isAuthenticated: boolean;
  isLoading: boolean;
  refreshSession: () => Promise<Session | null>;
  session: Session | null;
  signOut: () => Promise<void>;
  user: User | null;
};

const AuthSessionContext = createContext<AuthSessionState | undefined>(undefined);

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
      refreshSession: async () => {
        if (!supabase) {
          return null;
        }

        const { data, error } = await supabase.auth.getSession();

        if (error) {
          console.warn(
            'Supabase session refresh failed:',
            error instanceof Error ? error.message : 'Unknown error',
          );
          setSession(null);
          return null;
        }

        setSession(data.session ?? null);
        return data.session ?? null;
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
