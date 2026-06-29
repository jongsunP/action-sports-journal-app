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
  completeRecoveryEmailSignInFromUrl,
  isRecoveryEmailChangeUrl,
  isRecoveryEmailSignInUrl,
  requestRecoveryEmailLink,
  requestRecoveryEmailSignInLink,
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
  authBootstrapDiagnostics: AuthBootstrapDiagnostics;
  authMode: AuthMode;
  isAuthenticated: boolean;
  isLoading: boolean;
  lastRecoveryEmailCompletion: RecoveryEmailCompletionResult | null;
  linkKakaoIdentity: () => Promise<KakaoLinkResult>;
  requestRecoveryEmailLink: (email: string) => Promise<void>;
  requestRecoveryEmailSignInLink: (email: string) => Promise<void>;
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

type AuthBootstrapDiagnosticsStatus =
  | 'completed'
  | 'failed'
  | 'idle'
  | 'loading'
  | 'timeout';
type AuthBootstrapDiagnosticsStage =
  | 'anonymous_sign_in'
  | 'completed'
  | 'get_session'
  | 'get_user'
  | 'idle';
export type AuthBootstrapDiagnostics = {
  durationMs: number | null;
  reason: string | null;
  stage: AuthBootstrapDiagnosticsStage;
  status: AuthBootstrapDiagnosticsStatus;
  updatedAt: number | null;
};

const AUTH_BOOTSTRAP_STAGE_TIMEOUT_MS = 8_000;

const initialAuthBootstrapDiagnostics: AuthBootstrapDiagnostics = {
  durationMs: null,
  reason: null,
  stage: 'idle',
  status: 'idle',
  updatedAt: null,
};

class AuthBootstrapTimeoutError extends Error {
  constructor(stage: AuthBootstrapDiagnosticsStage) {
    super(`Auth bootstrap ${stage} timed out.`);
    this.name = 'AuthBootstrapTimeoutError';
  }
}

function sanitizeAuthBootstrapReason(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message.slice(0, 160);
  }

  return 'unknown error';
}

function isAuthBootstrapTimeout(error: unknown) {
  return error instanceof AuthBootstrapTimeoutError;
}

async function withAuthBootstrapTimeout<T>(
  stage: AuthBootstrapDiagnosticsStage,
  promise: Promise<T>,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new AuthBootstrapTimeoutError(stage));
        }, AUTH_BOOTSTRAP_STAGE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

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

function hasRecoveryEmailLinked(result: RecoveryEmailCompletionResult) {
  return Boolean(result.user?.email ?? result.session?.user.email);
}

function normalizeRecoveryEmailCompletion(
  result: RecoveryEmailCompletionResult,
): RecoveryEmailCompletionResult {
  if (
    result.flow !== 'connection' ||
    result.status === 'completed' ||
    !hasRecoveryEmailLinked(result)
  ) {
    return result;
  }

  const user = result.user ?? result.session?.user;

  if (!result.session || !user) {
    return result;
  }

  return {
    status: 'completed',
    flow: result.flow,
    session: {
      ...result.session,
      user,
    },
    user,
  };
}

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authBootstrapDiagnostics, setAuthBootstrapDiagnostics] =
    useState<AuthBootstrapDiagnostics>(initialAuthBootstrapDiagnostics);
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
      const startedAt = Date.now();

      const updateAuthBootstrapDiagnostics = (
        nextDiagnostics: Partial<AuthBootstrapDiagnostics>,
      ) => {
        if (!isMounted) {
          return;
        }

        setAuthBootstrapDiagnostics((current) => ({
          ...current,
          ...nextDiagnostics,
          durationMs: Date.now() - startedAt,
          updatedAt: Date.now(),
        }));
      };

      try {
        updateAuthBootstrapDiagnostics({
          reason: null,
          stage: 'get_session',
          status: 'loading',
        });
        const { data, error } = await withAuthBootstrapTimeout(
          'get_session',
          client.auth.getSession(),
        );

        if (!isMounted) {
          return;
        }

        if (error) {
          console.warn(
            'Supabase session restore failed:',
            error instanceof Error ? error.message : 'Unknown error',
          );
          updateAuthBootstrapDiagnostics({
            reason: sanitizeAuthBootstrapReason(error),
            stage: 'get_session',
            status: 'failed',
          });
          setSession(null);
          return;
        }

        if (data.session) {
          updateAuthBootstrapDiagnostics({
            reason: null,
            stage: 'get_user',
            status: 'loading',
          });
          const refreshedSession = await withAuthBootstrapTimeout(
            'get_user',
            refreshSupabaseSession(),
          );

          if (!isMounted) {
            return;
          }

          setSession(refreshedSession ?? data.session);
          updateAuthBootstrapDiagnostics({
            reason: null,
            stage: 'completed',
            status: 'completed',
          });
          return;
        }

        updateAuthBootstrapDiagnostics({
          reason: null,
          stage: 'anonymous_sign_in',
          status: 'loading',
        });
        const { data: anonymousData, error: anonymousError } =
          await withAuthBootstrapTimeout(
            'anonymous_sign_in',
            client.auth.signInAnonymously(),
          );

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
          updateAuthBootstrapDiagnostics({
            reason: sanitizeAuthBootstrapReason(anonymousError),
            stage: 'anonymous_sign_in',
            status: 'failed',
          });
          setSession(null);
          return;
        }

        setSession(anonymousData.session ?? null);
        updateAuthBootstrapDiagnostics({
          reason: null,
          stage: 'completed',
          status: 'completed',
        });
      } catch (error) {
        if (!isMounted) {
          return;
        }

        console.warn(
          'Supabase session initialization failed:',
          error instanceof Error ? error.message : 'Unknown error',
        );
        updateAuthBootstrapDiagnostics({
          reason: sanitizeAuthBootstrapReason(error),
          status: isAuthBootstrapTimeout(error) ? 'timeout' : 'failed',
        });
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
        if (nextSession) {
          void refreshSupabaseSession().then((refreshedSession) => {
            if (isMounted && refreshedSession) {
              setSession(refreshedSession);
            }
          });
        }
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
      const isConnectionCallback = url ? isRecoveryEmailChangeUrl(url) : false;
      const isRecoveryCallback = url ? isRecoveryEmailSignInUrl(url) : false;

      if (!url || (!isConnectionCallback && !isRecoveryCallback)) {
        return;
      }

      if (handledRecoveryEmailUrlsRef.current.has(url)) {
        return;
      }

      handledRecoveryEmailUrlsRef.current.add(url);
      const flow = isRecoveryCallback ? 'recovery' : 'connection';
      const attemptFlow =
        flow === 'recovery' ? 'recovery_sign_in' : 'email_callback';
      const attemptPrefix =
        flow === 'recovery' ? 'email_recovery' : 'email_connection';

      try {
        void recordRecoveryAttempt({
          event: `${attemptPrefix}_callback_received`,
          flow: attemptFlow,
          provider: 'email',
          status: 'started',
        });
        const result = normalizeRecoveryEmailCompletion(
          await (flow === 'recovery'
            ? completeRecoveryEmailSignInFromUrl(url)
            : completeRecoveryEmailChangeFromUrl(url)),
        );

        if (isDisposed) {
          return;
        }

        setLastRecoveryEmailCompletion(result);

        void recordRecoveryAttempt({
          event:
            result.status === 'completed'
              ? `${attemptPrefix}_callback_succeeded`
              : `${attemptPrefix}_callback_failed`,
          flow: attemptFlow,
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
          event: `${attemptPrefix}_callback_failed`,
          flow: attemptFlow,
          provider: 'email',
          reasonCode: getRecoveryReasonCode(error),
          status: 'failed',
        });
        setLastRecoveryEmailCompletion({
          status: 'notCompleted',
          flow,
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
      authBootstrapDiagnostics,
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
      requestRecoveryEmailSignInLink,
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
    [authBootstrapDiagnostics, isLoading, lastRecoveryEmailCompletion, session],
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
