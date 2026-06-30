import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import type { RootStackParamList } from '../../navigation/types';
import {
  useAppTheme,
  type AppThemeColors,
} from '../../theme';
import { normalizeRecoveryEmail } from '../../services/auth/accountRecovery';
import { useAuthSession } from '../../services/auth/AuthSessionProvider';
import {
  getRecoveryEmailDomain,
  getRecoveryErrorCode,
  getRecoveryReasonCode,
  maskRecoveryEmail,
  recordRecoveryAttempt,
} from '../../services/auth/recoveryAttempts';
import { checkRecoveryLocalWorkGuard } from './recoveryLocalWorkGuard';

type RecoveryStep = 'idle' | 'emailSent' | 'linked';
type EmailContinueFlow = 'connection' | 'recovery';
type RecoveryMethod = 'email' | 'kakao';
type KakaoContinueMode = 'link' | 'recover';
type KakaoFeedbackType =
  | 'success'
  | 'cancelled'
  | 'dismissed'
  | 'blocked'
  | 'error'
  | 'recoverReady';
type KakaoFeedback = {
  type: KakaoFeedbackType;
  message: string;
};
type KakaoUiState =
  | 'notLinked'
  | 'linking'
  | 'recovering'
  | 'recoverReady'
  | 'linked'
  | 'success'
  | 'blocked'
  | 'cancelled'
  | 'dismissed'
  | 'error';

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return '계정 연결을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.';
}

function hasAnonymousFlag(user: unknown) {
  return Boolean((user as { is_anonymous?: boolean } | null)?.is_anonymous);
}

function hasKakaoProviderIdentity(user: {
  identities?: Array<{ provider?: string | null }>;
} | null | undefined) {
  return Boolean(
    user?.identities?.some((identity) => identity.provider === 'kakao'),
  );
}

function readMetadataText(metadata: unknown, key: string) {
  const value = (metadata as Record<string, unknown> | null)?.[key];

  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function getKakaoNickname(metadata: unknown) {
  return (
    readMetadataText(metadata, 'name') ??
    readMetadataText(metadata, 'full_name') ??
    readMetadataText(metadata, 'nickname') ??
    readMetadataText(metadata, 'preferred_username')
  );
}

function getRecoveryEmailMetadata(email: string) {
  return {
    emailDomain: getRecoveryEmailDomain(email),
    maskedEmail: maskRecoveryEmail(email),
  };
}

function mergeStyleMaps<T extends Record<string, any>>(
  base: T,
  overrides: Record<string, any>,
) {
  const merged = { ...base } as Record<string, any>;

  Object.entries(overrides).forEach(([key, value]) => {
    merged[key] = base[key] ? [base[key], value] : value;
  });

  return merged as T;
}

function getKakaoUiCopy({
  hasKakaoIdentity,
  isLinkingKakao,
  isRecoveringWithKakao,
  kakaoContinueMode,
  kakaoFeedback,
  kakaoNickname,
}: {
  hasKakaoIdentity: boolean;
  isLinkingKakao: boolean;
  isRecoveringWithKakao: boolean;
  kakaoContinueMode: KakaoContinueMode;
  kakaoFeedback: KakaoFeedback | null;
  kakaoNickname: string | null;
}) {
  const state: KakaoUiState = hasKakaoIdentity
    ? kakaoFeedback?.type === 'success'
      ? 'success'
      : 'linked'
    : isLinkingKakao
      ? 'linking'
      : isRecoveringWithKakao
        ? 'recovering'
        : kakaoFeedback?.type === 'recoverReady'
          ? 'recoverReady'
          : kakaoFeedback?.type ?? 'notLinked';

  switch (state) {
    case 'linked':
      return {
        state,
        title: '카카오로 보호 중',
        description: kakaoNickname
          ? `${kakaoNickname} 카카오 계정으로 이 기록을 복구할 수 있습니다.`
          : '카카오 계정으로 이 기록을 복구할 수 있습니다.',
        buttonLabel: '카카오 연결 완료',
      };
    case 'success':
      return {
        state,
        title: kakaoContinueMode === 'recover'
          ? '기존 기록으로 돌아왔습니다'
          : '카카오로 보호 중',
        description:
          kakaoFeedback?.message ??
          (kakaoContinueMode === 'recover'
            ? '카카오 계정의 기존 라이딩 기록으로 돌아왔습니다.'
            : '현재 기기의 기록이 카카오 계정과 연결되었습니다.'),
        buttonLabel: '카카오 연결 완료',
      };
    case 'linking':
      return {
        state,
        title: '카카오로 계속하는 중',
        description: '카카오 화면에서 동의가 끝나면 이 앱으로 돌아옵니다.',
        buttonLabel: '카카오 진행 중',
      };
    case 'recovering':
      return {
        state,
        title: '기존 기록을 확인하는 중',
        description: '카카오 화면에서 동의가 끝나면 기존 기록을 불러옵니다.',
        buttonLabel: '카카오 진행 중',
      };
    case 'recoverReady':
      return {
        state,
        title: '기존 기록으로 계속할 수 있습니다',
        description:
          kakaoFeedback?.message ??
          '이 카카오는 이미 다른 기기 계정에 연결되어 있습니다. 기존 기록으로 계속하려면 한 번 더 진행해주세요.',
        buttonLabel: '기존 기록으로 계속하기',
      };
    case 'blocked':
      return {
        state,
        title: '진행 중인 기록이 있습니다',
        description:
          kakaoFeedback?.message ??
          '업로드 또는 복구 확인 중인 기록이 끝난 뒤 다시 시도해주세요.',
        buttonLabel: '카카오로 계속하기',
      };
    case 'cancelled':
      return {
        state,
        title: '카카오 진행이 취소됨',
        description:
          kakaoFeedback?.message ??
          '사용자가 카카오 진행을 취소했습니다. 기록은 그대로 보존됩니다.',
        buttonLabel: '카카오로 계속하기',
      };
    case 'dismissed':
      return {
        state,
        title: '카카오 진행이 완료되지 않음',
        description:
          kakaoFeedback?.message ??
          '카카오 창이 닫혔습니다. 필요할 때 다시 시도할 수 있습니다.',
        buttonLabel: '카카오로 계속하기',
      };
    case 'error':
      return {
        state,
        title: '카카오 확인 필요',
        description:
          kakaoFeedback?.message ??
          '카카오로 계속하지 못했습니다. 필요하면 다시 시도해주세요.',
        buttonLabel: kakaoContinueMode === 'recover'
          ? '기존 기록으로 계속하기'
          : '카카오로 계속하기',
      };
    case 'notLinked':
    default:
      return {
        state,
        title: '카카오로 기록 보호',
        description:
          '기록을 잃지 않도록 카카오로 보호합니다. 이미 연결된 기록이 있으면 기존 기록으로 계속할 수 있습니다.',
        buttonLabel: '카카오로 계속하기',
      };
  }
}

function getAccountStatusCopy({
  currentEmail,
  hasKakaoIdentity,
  isAnonymousUser,
  kakaoNickname,
}: {
  currentEmail: string | null;
  hasKakaoIdentity: boolean;
  isAnonymousUser: boolean;
  kakaoNickname: string | null;
}) {
  if (currentEmail && hasKakaoIdentity) {
    return {
      title: '복구 방법이 연결되어 있습니다',
      description: kakaoNickname
        ? `${kakaoNickname} 카카오 계정과 이메일로 기록을 다시 찾을 수 있습니다.`
        : '카카오와 이메일로 기록을 다시 찾을 수 있습니다.',
    };
  }

  if (hasKakaoIdentity) {
    return {
      title: '복구 방법이 연결되어 있습니다',
      description: kakaoNickname
        ? `${kakaoNickname} 카카오 계정으로 기록을 다시 찾을 수 있습니다.`
        : '카카오로 기록을 다시 찾을 수 있습니다.',
    };
  }

  if (currentEmail) {
    return {
      title: '복구 방법이 연결되어 있습니다',
      description: `${currentEmail} 이메일로 기록을 다시 찾을 수 있습니다.`,
    };
  }

  if (isAnonymousUser) {
    return {
      title: '복구 방법이 아직 연결되지 않았습니다',
      description:
        '카카오나 이메일을 연결하면 이 기기의 라이딩 기록을 다시 찾을 수 있습니다.',
    };
  }

  return {
    title: '계정 상태를 확인하고 있습니다',
    description: '잠시 후 복구 방법을 연결할 수 있습니다.',
  };
}

export function AccountRecoveryScreen() {
  const navigation =
    useNavigation<
      NativeStackNavigationProp<RootStackParamList, 'AccountRecovery'>
    >();
  const theme = useAppTheme();
  const styles = useMemo(
    () =>
      mergeStyleMaps(
        baseStyles,
        createAccountRecoveryThemeStyles(theme.colors, theme.mode),
      ),
    [theme.colors, theme.mode],
  );
  const {
    authMode,
    isLoading,
    lastRecoveryEmailCompletion,
    linkKakaoIdentity,
    recoverWithKakao,
    requestRecoveryEmailLink,
    requestRecoveryEmailSignInLink,
    refreshSession,
    user,
  } = useAuthSession();
  const [email, setEmail] = useState(user?.email ?? '');
  const [pendingEmail, setPendingEmail] = useState('');
  const [step, setStep] = useState<RecoveryStep>(user?.email ? 'linked' : 'idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [kakaoFeedback, setKakaoFeedback] = useState<KakaoFeedback | null>(null);
  const [kakaoContinueMode, setKakaoContinueMode] =
    useState<KakaoContinueMode>('link');
  const [isLinkingKakao, setIsLinkingKakao] = useState(false);
  const [isRecoveringWithKakao, setIsRecoveringWithKakao] = useState(false);
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);
  const [isRefreshingSession, setIsRefreshingSession] = useState(false);
  const [selectedRecoveryMethod, setSelectedRecoveryMethod] =
    useState<RecoveryMethod | null>(null);
  const [emailRecoveryMessage, setEmailRecoveryMessage] = useState<
    string | null
  >(null);
  const [emailContinueFlow, setEmailContinueFlow] =
    useState<EmailContinueFlow>('connection');

  const normalizedEmail = useMemo(() => normalizeRecoveryEmail(email), [email]);
  const isAnonymousUser = hasAnonymousFlag(user);
  const currentEmail = user?.email ?? null;
  const hasKakaoIdentity = hasKakaoProviderIdentity(user);
  const kakaoNickname = getKakaoNickname(user?.user_metadata);
  const canSubmitEmail =
    authMode === 'authenticated' &&
    normalizedEmail.includes('@') &&
    !isSubmittingEmail &&
    !isRefreshingSession &&
    !isLinkingKakao &&
    !isRecoveringWithKakao;
  const canRefreshLinkStatus =
    authMode === 'authenticated' &&
    !isSubmittingEmail &&
    !isRefreshingSession &&
    !isLinkingKakao &&
    !isRecoveringWithKakao;
  const canContinueWithKakao =
    authMode === 'authenticated' &&
    !hasKakaoIdentity &&
    !isSubmittingEmail &&
    !isRefreshingSession &&
    !isLinkingKakao &&
    !isRecoveringWithKakao;
  const kakaoUiCopy = getKakaoUiCopy({
    hasKakaoIdentity,
    isLinkingKakao,
    isRecoveringWithKakao,
    kakaoContinueMode,
    kakaoFeedback,
    kakaoNickname,
  });
  const accountStatusCopy = getAccountStatusCopy({
    currentEmail,
    hasKakaoIdentity,
    isAnonymousUser,
    kakaoNickname,
  });
  const hasProtectedAccount = Boolean(currentEmail || hasKakaoIdentity);
  const showEmailDetails =
    selectedRecoveryMethod === 'email' ||
    step === 'emailSent' ||
    Boolean(emailRecoveryMessage || errorMessage);
  const showKakaoDetails =
    selectedRecoveryMethod === 'kakao' ||
    isLinkingKakao ||
    isRecoveringWithKakao ||
    Boolean(kakaoFeedback);

  useEffect(() => {
    if (!currentEmail) {
      return;
    }

    setEmail(currentEmail);
    setPendingEmail('');
    setStep('linked');
    setErrorMessage(null);
  }, [currentEmail]);

  useEffect(() => {
    if (!lastRecoveryEmailCompletion) {
      return;
    }

    if (lastRecoveryEmailCompletion.status === 'completed') {
      const nextEmail = lastRecoveryEmailCompletion.user.email ?? '';

      setErrorMessage(null);
      setEmail(nextEmail);
      setPendingEmail('');
      setEmailRecoveryMessage(
        lastRecoveryEmailCompletion.flow === 'recovery'
          ? '기존 이메일 계정의 기록으로 돌아왔습니다.'
          : null,
      );
      setEmailContinueFlow(lastRecoveryEmailCompletion.flow);
      setStep(nextEmail ? 'linked' : 'idle');
      return;
    }

    if (lastRecoveryEmailCompletion.flow === 'recovery') {
      setEmailRecoveryMessage(lastRecoveryEmailCompletion.message);
      setErrorMessage(null);
      return;
    }

    setEmailRecoveryMessage(null);
    setErrorMessage(lastRecoveryEmailCompletion.message);
  }, [lastRecoveryEmailCompletion]);

  const requestEmailRecoverySignIn = async (emailToRecover: string) => {
    void recordRecoveryAttempt({
      event: 'email_recovery_started',
      flow: 'recovery_sign_in',
      metadata: getRecoveryEmailMetadata(emailToRecover),
      provider: 'email',
      status: 'started',
    });
    const guard = await checkRecoveryLocalWorkGuard();

    if (!guard.canRecover) {
      void recordRecoveryAttempt({
        event: 'email_recovery_blocked',
        flow: 'recovery_sign_in',
        metadata: {
          blockingCount: guard.blockingCount,
          ...getRecoveryEmailMetadata(emailToRecover),
        },
        provider: 'email',
        reasonCode: 'local_work_guard',
        status: 'blocked',
      });
      setEmailRecoveryMessage(guard.message);
      return false;
    }

    await requestRecoveryEmailSignInLink(emailToRecover);
    void recordRecoveryAttempt({
      event: 'email_recovery_email_sent',
      flow: 'recovery_sign_in',
      metadata: getRecoveryEmailMetadata(emailToRecover),
      provider: 'email',
      status: 'succeeded',
    });
    setPendingEmail(emailToRecover);
    setEmailContinueFlow('recovery');
    setEmailRecoveryMessage(
      '이메일 링크를 누르면 이 앱으로 돌아와 기존 기록을 불러옵니다.',
    );
    setStep('emailSent');
    return true;
  };

  const handleContinueWithEmail = async () => {
    if (!canSubmitEmail) {
      return;
    }

    setSelectedRecoveryMethod('email');
    setErrorMessage(null);
    setKakaoFeedback(null);
    setEmailRecoveryMessage(null);
    setIsSubmittingEmail(true);

    try {
      void recordRecoveryAttempt({
        event: 'email_connection_started',
        flow: 'email_connection',
        metadata: getRecoveryEmailMetadata(normalizedEmail),
        provider: 'email',
        status: 'started',
      });
      await requestRecoveryEmailLink(normalizedEmail);
      void recordRecoveryAttempt({
        event: 'email_connection_email_sent',
        flow: 'email_connection',
        metadata: getRecoveryEmailMetadata(normalizedEmail),
        provider: 'email',
        status: 'succeeded',
      });
      setPendingEmail(normalizedEmail);
      setEmailContinueFlow('connection');
      setStep('emailSent');
    } catch (error) {
      const reasonCode = getRecoveryReasonCode(error);

      void recordRecoveryAttempt({
        errorCode: getRecoveryErrorCode(error),
        event:
          reasonCode === 'email_exists'
            ? 'email_exists'
            : reasonCode === 'rate_limited'
              ? 'rate_limited'
              : 'email_connection_failed',
        flow: 'email_connection',
        metadata: getRecoveryEmailMetadata(normalizedEmail),
        provider: 'email',
        reasonCode,
        status: 'failed',
      });

      if (reasonCode === 'email_exists') {
        try {
          await requestEmailRecoverySignIn(normalizedEmail);
        } catch (recoveryError) {
          const recoveryReasonCode = getRecoveryReasonCode(recoveryError);

          void recordRecoveryAttempt({
            errorCode: getRecoveryErrorCode(recoveryError),
            event:
              recoveryReasonCode === 'rate_limited'
                ? 'email_recovery_rate_limited'
                : 'email_recovery_failed',
            flow: 'recovery_sign_in',
            metadata: getRecoveryEmailMetadata(normalizedEmail),
            provider: 'email',
            reasonCode: recoveryReasonCode,
            status: 'failed',
          });
          setEmailRecoveryMessage(getErrorMessage(recoveryError));
        }
      } else {
        setErrorMessage(getErrorMessage(error));
      }
    } finally {
      setIsSubmittingEmail(false);
    }
  };

  const handleRefreshLinkStatus = async () => {
    if (!canRefreshLinkStatus) {
      return;
    }

    setSelectedRecoveryMethod('email');
    setErrorMessage(null);
    setKakaoFeedback(null);
    setIsRefreshingSession(true);

    try {
      const nextSession = await refreshSession();
      if (nextSession?.user.email) {
        setEmail(nextSession.user.email);
        setStep('linked');
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsRefreshingSession(false);
    }
  };

  const handleResend = async () => {
    if (!pendingEmail || isSubmittingEmail || isRefreshingSession) {
      return;
    }

    setSelectedRecoveryMethod('email');
    setEmail(pendingEmail);
    setErrorMessage(null);
    setKakaoFeedback(null);
    setEmailRecoveryMessage(null);
    setIsSubmittingEmail(true);

    try {
      if (emailContinueFlow === 'recovery') {
        await requestEmailRecoverySignIn(pendingEmail);
      } else {
        void recordRecoveryAttempt({
          event: 'email_connection_started',
          flow: 'email_connection',
          metadata: getRecoveryEmailMetadata(pendingEmail),
          provider: 'email',
          status: 'started',
        });
        await requestRecoveryEmailLink(pendingEmail);
        void recordRecoveryAttempt({
          event: 'email_connection_email_sent',
          flow: 'email_connection',
          metadata: getRecoveryEmailMetadata(pendingEmail),
          provider: 'email',
          status: 'succeeded',
        });
      }
    } catch (error) {
      const reasonCode = getRecoveryReasonCode(error);

      void recordRecoveryAttempt({
        errorCode: getRecoveryErrorCode(error),
        event:
          emailContinueFlow === 'recovery'
            ? reasonCode === 'rate_limited'
              ? 'email_recovery_rate_limited'
              : 'email_recovery_failed'
          : reasonCode === 'email_exists'
            ? 'email_exists'
            : reasonCode === 'rate_limited'
              ? 'rate_limited'
              : 'email_connection_failed',
        flow:
          emailContinueFlow === 'recovery'
            ? 'recovery_sign_in'
            : 'email_connection',
        metadata: getRecoveryEmailMetadata(pendingEmail),
        provider: 'email',
        reasonCode,
        status: 'failed',
      });
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmittingEmail(false);
    }
  };

  const runKakaoRecovery = async () => {
    setSelectedRecoveryMethod('kakao');
    setErrorMessage(null);
    setKakaoFeedback(null);
    setEmailRecoveryMessage(null);
    setIsRecoveringWithKakao(true);

    try {
      void recordRecoveryAttempt({
        event: 'kakao_recovery_started',
        flow: 'recovery_sign_in',
        provider: 'kakao',
        status: 'started',
      });
      const guard = await checkRecoveryLocalWorkGuard();

      if (!guard.canRecover) {
        void recordRecoveryAttempt({
          event: 'kakao_recovery_blocked',
          flow: 'recovery_sign_in',
          metadata: {
            blockingCount: guard.blockingCount,
          },
          provider: 'kakao',
          reasonCode: 'local_work_guard',
          status: 'blocked',
        });
        setKakaoContinueMode('link');
        setKakaoFeedback({
          type: 'blocked',
          message: guard.message,
        });
        return;
      }

      const result = await recoverWithKakao();

      if (result.status === 'recovered') {
        void recordRecoveryAttempt({
          event: 'kakao_recovery_succeeded',
          flow: 'recovery_sign_in',
          metadata: {
            hasKakaoIdentity: hasKakaoProviderIdentity(result.user),
          },
          provider: 'kakao',
          status: 'succeeded',
        });
        setKakaoContinueMode('recover');
        setEmail(result.user.email ?? '');
        setStep(result.user.email ? 'linked' : 'idle');
        setKakaoFeedback({
          type: 'success',
          message: '카카오 계정의 기존 기록으로 돌아왔습니다.',
        });
        return;
      }

      if (result.status === 'notRecovered') {
        void recordRecoveryAttempt({
          event: 'kakao_recovery_failed',
          flow: 'recovery_sign_in',
          provider: 'kakao',
          reasonCode: result.reason,
          status: 'failed',
        });
        setKakaoContinueMode('link');
        setKakaoFeedback({
          type: 'error',
          message: result.message,
        });
        return;
      }

      setKakaoContinueMode('link');
      void recordRecoveryAttempt({
        event:
          result.status === 'cancelled'
            ? 'kakao_recovery_cancelled'
            : 'kakao_recovery_dismissed',
        flow: 'recovery_sign_in',
        provider: 'kakao',
        status: result.status === 'cancelled' ? 'cancelled' : 'dismissed',
      });
      setKakaoFeedback({
        type: result.status === 'cancelled' ? 'cancelled' : 'dismissed',
        message:
          result.status === 'cancelled'
            ? '카카오 진행이 취소되었습니다. 현재 기기 계정은 그대로 유지됩니다.'
            : '카카오 창이 닫혔습니다. 필요할 때 다시 시도할 수 있습니다.',
      });
    } catch (error) {
      void recordRecoveryAttempt({
        errorCode: getRecoveryErrorCode(error),
        event: 'kakao_recovery_failed',
        flow: 'recovery_sign_in',
        provider: 'kakao',
        reasonCode: getRecoveryReasonCode(error),
        status: 'failed',
      });
      setKakaoContinueMode('link');
      setKakaoFeedback({
        type: 'error',
        message: getErrorMessage(error),
      });
    } finally {
      setIsRecoveringWithKakao(false);
    }
  };

  const handleRecoverWithKakao = async () => {
    if (!canContinueWithKakao) {
      return;
    }

    await runKakaoRecovery();
  };

  const handleContinueWithKakao = async () => {
    if (!canContinueWithKakao) {
      return;
    }

    setSelectedRecoveryMethod('kakao');
    if (kakaoContinueMode === 'recover') {
      await handleRecoverWithKakao();
      return;
    }

    setErrorMessage(null);
    setKakaoFeedback(null);
    setEmailRecoveryMessage(null);
    setIsLinkingKakao(true);

    try {
      void recordRecoveryAttempt({
        event: 'kakao_link_started',
        flow: 'link',
        provider: 'kakao',
        status: 'started',
      });
      const result = await linkKakaoIdentity();

      if (result.status === 'linked' && hasKakaoProviderIdentity(result.user)) {
        void recordRecoveryAttempt({
          event: 'kakao_link_succeeded',
          flow: 'link',
          metadata: {
            hasKakaoIdentity: true,
          },
          provider: 'kakao',
          status: 'succeeded',
        });
        setKakaoContinueMode('link');
        setKakaoFeedback({
          type: 'success',
          message: '현재 기록이 카카오로 보호됩니다.',
        });
        return;
      }

      if (result.status === 'notLinked') {
        void recordRecoveryAttempt({
          event: 'kakao_link_failed',
          flow: 'link',
          provider: 'kakao',
          reasonCode: result.reason,
          status: 'failed',
        });
        if (result.reason === 'already_linked_to_other_account') {
          await runKakaoRecovery();
        } else {
          setKakaoContinueMode('link');
          setKakaoFeedback({
            type: 'error',
            message: result.message,
          });
        }
        return;
      }

      if (result.status === 'linked') {
        void recordRecoveryAttempt({
          event: 'kakao_link_failed',
          flow: 'link',
          provider: 'kakao',
          reasonCode: 'missing_kakao_identity',
          status: 'failed',
        });
        setKakaoContinueMode('link');
        setKakaoFeedback({
          type: 'error',
          message: '카카오로 계속하지 못했습니다. 다시 시도해주세요.',
        });
        return;
      }

      setKakaoContinueMode('link');
      void recordRecoveryAttempt({
        event:
          result.status === 'cancelled'
            ? 'kakao_link_cancelled'
            : 'kakao_link_dismissed',
        flow: 'link',
        provider: 'kakao',
        status: result.status === 'cancelled' ? 'cancelled' : 'dismissed',
      });
      setKakaoFeedback({
        type: result.status === 'cancelled' ? 'cancelled' : 'dismissed',
        message:
          result.status === 'cancelled'
            ? '카카오 진행이 취소되었습니다. 기록은 그대로 유지됩니다.'
            : '카카오 창이 닫혔습니다. 필요할 때 다시 시도할 수 있습니다.',
      });
    } catch (error) {
      void recordRecoveryAttempt({
        errorCode: getRecoveryErrorCode(error),
        event: 'kakao_link_failed',
        flow: 'link',
        provider: 'kakao',
        reasonCode: getRecoveryReasonCode(error),
        status: 'failed',
      });
      setKakaoContinueMode('link');
      setKakaoFeedback({
        type: 'error',
        message: getErrorMessage(error),
      });
    } finally {
      setIsLinkingKakao(false);
    }
  };

  const handleSelectKakaoMethod = async () => {
    setSelectedRecoveryMethod('kakao');

    if (canContinueWithKakao) {
      await handleContinueWithKakao();
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.screen}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="마이페이지 닫기"
            accessibilityRole="button"
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [
              styles.closeButton,
              pressed ? styles.buttonPressed : undefined,
            ]}
          >
            <Text style={styles.closeButtonText}>‹</Text>
          </Pressable>
          <View style={styles.headerTitleBlock}>
            <Text style={styles.kicker}>Account Recovery</Text>
            <Text style={styles.title}>계정 복구</Text>
            <Text style={styles.headerMeta}>
              이 기기의 라이딩 기록을 복구할 수단을 연결합니다.
            </Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.statusPanel}>
            <View style={styles.statusHeaderRow}>
              <Text style={styles.panelEyebrow}>기록 보호</Text>
              <View
                style={[
                  styles.protectionBadge,
                  hasProtectedAccount
                    ? styles.protectionBadgeSuccess
                    : styles.protectionBadgeDefault,
                ]}
              >
                <Text style={styles.protectionBadgeText}>
                  {hasProtectedAccount ? '보호됨' : '보호 전'}
                </Text>
              </View>
            </View>
            <Text style={styles.panelTitle}>{accountStatusCopy.title}</Text>
            <Text style={styles.panelText}>{accountStatusCopy.description}</Text>
            <View style={styles.connectedBadgeRow}>
              <View
                style={[
                  styles.methodMiniBadge,
                  hasKakaoIdentity
                    ? styles.methodMiniBadgeSuccess
                    : styles.methodMiniBadgeDefault,
                ]}
              >
                <Text style={styles.methodMiniBadgeText}>
                  카카오 {hasKakaoIdentity ? '연결됨' : '미연결'}
                </Text>
              </View>
              <View
                style={[
                  styles.methodMiniBadge,
                  currentEmail
                    ? styles.methodMiniBadgeSuccess
                    : styles.methodMiniBadgeDefault,
                ]}
              >
                <Text style={styles.methodMiniBadgeText}>
                  이메일 {currentEmail ? '연결됨' : '미연결'}
                </Text>
              </View>
            </View>
          </View>

          {authMode !== 'authenticated' ? (
            <View style={styles.noticePanel}>
              <Text style={styles.noticeTitle}>
                {isLoading ? '계정 상태 확인 중' : '계정 연결을 시작할 수 없습니다'}
              </Text>
              <Text style={styles.noticeText}>
                앱이 인증 세션을 준비한 뒤 다시 시도해주세요.
              </Text>
            </View>
          ) : (
            <View style={styles.formPanel}>
              <View style={styles.methodHub}>
                <Pressable
                  accessibilityRole="button"
                  onPress={handleSelectKakaoMethod}
                  style={({ pressed }) => [
                    styles.methodCard,
                    selectedRecoveryMethod === 'kakao'
                      ? styles.methodCardSelected
                      : undefined,
                    pressed ? styles.buttonPressed : undefined,
                  ]}
                >
                  <View style={styles.methodCardHeader}>
                    <View style={styles.methodTitleRow}>
                      <View
                        style={[
                          styles.methodIconChip,
                          styles.methodIconChipKakao,
                        ]}
                      >
                        <Ionicons
                          color={theme.mode === 'light' ? '#181600' : '#111827'}
                          name="chatbubble-ellipses-outline"
                          size={19}
                        />
                      </View>
                      <View style={styles.methodTitleBlock}>
                        <Text style={styles.methodLabel}>Kakao</Text>
                        <Text style={styles.methodTitle}>카카오로 계속하기</Text>
                      </View>
                    </View>
                    <View
                      style={[
                        styles.methodStateBadge,
                        hasKakaoIdentity
                          ? styles.methodStateBadgeSuccess
                          : styles.methodStateBadgeDefault,
                      ]}
                    >
                      <Text style={styles.methodStateBadgeText}>
                        {hasKakaoIdentity ? '연결됨' : '미연결'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.methodDescription}>
                    가장 빠르게 기록을 보호하거나 기존 기록을 불러옵니다.
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => setSelectedRecoveryMethod('email')}
                  style={({ pressed }) => [
                    styles.methodCard,
                    selectedRecoveryMethod === 'email'
                      ? styles.methodCardSelected
                      : undefined,
                    pressed ? styles.buttonPressed : undefined,
                  ]}
                >
                  <View style={styles.methodCardHeader}>
                    <View style={styles.methodTitleRow}>
                      <View
                        style={[
                          styles.methodIconChip,
                          styles.methodIconChipEmail,
                        ]}
                      >
                        <Ionicons
                          color={theme.colors.accent}
                          name="mail-outline"
                          size={19}
                        />
                      </View>
                      <View style={styles.methodTitleBlock}>
                        <Text style={styles.methodLabel}>Email</Text>
                        <Text style={styles.methodTitle}>이메일로 계속하기</Text>
                      </View>
                    </View>
                    <View
                      style={[
                        styles.methodStateBadge,
                        currentEmail
                          ? styles.methodStateBadgeSuccess
                          : styles.methodStateBadgeDefault,
                      ]}
                    >
                      <Text style={styles.methodStateBadgeText}>
                        {currentEmail ? '연결됨' : '미연결'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.methodDescription}>
                    메일 링크로 기록을 보호하거나 복구합니다.
                  </Text>
                </Pressable>
              </View>

              <Text style={styles.hubHelperText}>
                처음이면 기록을 보호하고, 기존 기록이 있으면 같은 방법으로 불러옵니다.
              </Text>

              {showKakaoDetails ? (
                <View style={styles.kakaoBlock}>
                  <View style={styles.kakaoHeaderRow}>
                    <View style={styles.kakaoTitleBlock}>
                      <Text style={styles.formLabel}>카카오</Text>
                      <Text style={styles.kakaoStateTitle}>
                        {kakaoUiCopy.title}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.kakaoStateBadge,
                        kakaoUiCopy.state === 'linked' ||
                        kakaoUiCopy.state === 'success'
                          ? styles.kakaoStateBadgeSuccess
                          : kakaoUiCopy.state === 'blocked' ||
                              kakaoUiCopy.state === 'recoverReady'
                            ? styles.kakaoStateBadgeAttention
                          : kakaoUiCopy.state === 'cancelled' ||
                              kakaoUiCopy.state === 'dismissed'
                            ? styles.kakaoStateBadgeNeutral
                          : kakaoUiCopy.state === 'error'
                              ? styles.kakaoStateBadgeAttention
                              : styles.kakaoStateBadgeDefault,
                      ]}
                    >
                      <Text style={styles.kakaoStateBadgeText}>
                        {kakaoUiCopy.state === 'linked' ||
                        kakaoUiCopy.state === 'success'
                          ? '연결됨'
                          : kakaoUiCopy.state === 'linking'
                            ? '진행 중'
                            : kakaoUiCopy.state === 'recovering'
                              ? '진행 중'
                              : kakaoUiCopy.state === 'error'
                                ? '확인 필요'
                                : kakaoUiCopy.state === 'blocked'
                                  ? '대기'
                                  : kakaoUiCopy.state === 'recoverReady'
                                    ? '확인 필요'
                                    : kakaoUiCopy.state === 'cancelled' ||
                                        kakaoUiCopy.state === 'dismissed'
                                      ? '미완료'
                                      : '미연결'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.helperText}>{kakaoUiCopy.description}</Text>
                  <Pressable
                    accessibilityRole="button"
                    disabled={!canContinueWithKakao}
                    onPress={handleContinueWithKakao}
                    style={({ pressed }) => [
                      styles.kakaoButton,
                      !canContinueWithKakao ? styles.buttonDisabled : undefined,
                      pressed ? styles.buttonPressed : undefined,
                    ]}
                  >
                    {isLinkingKakao || isRecoveringWithKakao ? (
                      <ActivityIndicator color="#181600" />
                    ) : (
                      <Text style={styles.kakaoButtonText}>
                        {kakaoUiCopy.buttonLabel}
                      </Text>
                    )}
                  </Pressable>
                  {kakaoFeedback &&
                  kakaoUiCopy.description !== kakaoFeedback.message ? (
                    <Text
                      style={[
                        styles.kakaoStatusText,
                        kakaoFeedback.type === 'success'
                          ? styles.kakaoStatusTextSuccess
                          : kakaoFeedback.type === 'cancelled' ||
                              kakaoFeedback.type === 'dismissed'
                            ? styles.kakaoStatusTextNeutral
                            : styles.kakaoStatusTextAttention,
                      ]}
                    >
                      {kakaoFeedback.message}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {showEmailDetails ? (
                <View style={styles.emailPanel}>
                  <Text style={styles.formLabel}>복구 이메일</Text>
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={
                      !isSubmittingEmail &&
                      !isRefreshingSession
                    }
                    inputMode="email"
                    keyboardType="email-address"
                    onChangeText={setEmail}
                    placeholder="name@example.com"
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.input}
                    textContentType="emailAddress"
                    value={email}
                  />
                  <Pressable
                    accessibilityRole="button"
                    disabled={!canSubmitEmail}
                    onPress={handleContinueWithEmail}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      !canSubmitEmail ? styles.buttonDisabled : undefined,
                      pressed ? styles.buttonPressed : undefined,
                    ]}
                  >
                    {isSubmittingEmail ? (
                      <ActivityIndicator color="#050507" />
                    ) : (
                      <Text style={styles.primaryButtonText}>
                        이메일로 계속하기
                      </Text>
                    )}
                  </Pressable>

                  {step === 'emailSent' ? (
                    <View style={styles.codeBlock}>
                      <Text style={styles.formLabel}>이메일 확인 대기 중</Text>
                      <Text style={styles.helperText}>
                        {pendingEmail} 주소로 보낸 메일에서 확인 링크를 눌러주세요.
                        링크를 열면 앱으로 돌아와{' '}
                        {emailContinueFlow === 'recovery'
                          ? '기존 기록을 불러옵니다.'
                          : '복구 수단 연결을 확인합니다.'}
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        disabled={!canRefreshLinkStatus}
                        onPress={handleRefreshLinkStatus}
                        style={({ pressed }) => [
                          styles.secondaryButton,
                          !canRefreshLinkStatus
                            ? styles.buttonDisabled
                            : undefined,
                          pressed ? styles.buttonPressed : undefined,
                        ]}
                      >
                        {isRefreshingSession ? (
                          <ActivityIndicator color="#f8fafc" />
                        ) : (
                          <Text style={styles.secondaryButtonText}>
                            연결 상태 새로고침
                          </Text>
                        )}
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        disabled={
                          isSubmittingEmail ||
                          isRefreshingSession
                        }
                        onPress={handleResend}
                        style={({ pressed }) => [
                          styles.textButton,
                          pressed ? styles.buttonPressed : undefined,
                        ]}
                      >
                        <Text style={styles.textButtonText}>
                          이메일 다시 보내기
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}

                  {step === 'linked' && currentEmail ? (
                    <View style={styles.successPanel}>
                      <Text style={styles.successTitle}>복구 준비 완료</Text>
                      <Text style={styles.successText}>
                        이 이메일이 현재 기기 계정의 복구 수단으로 연결되었습니다.
                      </Text>
                    </View>
                  ) : null}

                  <Text style={styles.helperText}>
                    이 이메일로 현재 기록을 보호합니다. 이미 연결된 기존 기록이
                    있으면 같은 버튼으로 복구 메일을 보냅니다.
                  </Text>
                  {emailRecoveryMessage ? (
                    <Text style={styles.helperText}>{emailRecoveryMessage}</Text>
                  ) : null}

                  {errorMessage ? (
                    <View style={styles.errorPanel}>
                      <Text style={styles.errorText}>{errorMessage}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createAccountRecoveryThemeStyles(
  colors: AppThemeColors,
  mode: 'dark' | 'light',
) {
  const isLight = mode === 'light';
  const borderSoft = isLight ? '#dbe4ee' : 'rgba(255, 255, 255, 0.08)';
  const borderStrong = isLight ? '#cbd5e1' : 'rgba(148, 163, 184, 0.22)';
  const subtleSurface = isLight ? '#f1f5f9' : 'rgba(148, 163, 184, 0.1)';
  const successSurface = isLight ? '#dcfce7' : 'rgba(34, 197, 94, 0.14)';
  const warningSurface = isLight ? '#fef3c7' : 'rgba(250, 204, 21, 0.12)';
  const errorSurface = isLight ? '#fff1f2' : 'rgba(244, 63, 94, 0.12)';

  return StyleSheet.create({
    screen: { backgroundColor: colors.background },
    closeButton: {
      backgroundColor: colors.surface,
      borderColor: borderStrong,
    },
    closeButtonText: { color: colors.textPrimary },
    kicker: { color: colors.textMuted },
    title: { color: colors.textPrimary },
    headerMeta: { color: colors.textMuted },
    statusPanel: {
      backgroundColor: colors.surface,
      borderColor: borderSoft,
    },
    panelEyebrow: { color: colors.accent },
    panelTitle: { color: colors.textPrimary },
    panelText: { color: colors.textSecondary },
    protectionBadgeDefault: {
      backgroundColor: subtleSurface,
      borderColor: borderStrong,
    },
    protectionBadgeSuccess: {
      backgroundColor: successSurface,
      borderColor: isLight ? '#bbf7d0' : 'rgba(74, 222, 128, 0.3)',
    },
    protectionBadgeText: { color: colors.textPrimary },
    methodMiniBadgeDefault: {
      backgroundColor: subtleSurface,
      borderColor: borderStrong,
    },
    methodMiniBadgeSuccess: {
      backgroundColor: successSurface,
      borderColor: isLight ? '#bbf7d0' : 'rgba(74, 222, 128, 0.26)',
    },
    methodMiniBadgeText: { color: colors.textPrimary },
    noticePanel: {
      backgroundColor: warningSurface,
      borderColor: isLight ? '#fde68a' : 'rgba(250, 204, 21, 0.22)',
    },
    noticeTitle: { color: colors.warning },
    noticeText: { color: colors.warning },
    methodCard: {
      backgroundColor: colors.surface,
      borderColor: borderStrong,
    },
    methodCardSelected: {
      backgroundColor: isLight ? '#ecfeff' : '#111827',
      borderColor: colors.accent,
    },
    methodIconChipEmail: {
      backgroundColor: isLight ? '#e0f2fe' : 'rgba(59, 130, 246, 0.16)',
      borderColor: isLight ? '#bae6fd' : 'rgba(147, 197, 253, 0.32)',
    },
    methodLabel: { color: colors.accent },
    methodTitle: { color: colors.textPrimary },
    methodDescription: { color: colors.textSecondary },
    methodStateBadgeDefault: {
      backgroundColor: subtleSurface,
      borderColor: borderStrong,
    },
    methodStateBadgeSuccess: {
      backgroundColor: successSurface,
      borderColor: isLight ? '#bbf7d0' : 'rgba(74, 222, 128, 0.3)',
    },
    methodStateBadgeText: { color: colors.textPrimary },
    hubHelperText: { color: colors.textMuted },
    emailPanel: {
      backgroundColor: colors.surface,
      borderColor: borderSoft,
    },
    formLabel: { color: colors.textPrimary },
    input: {
      backgroundColor: colors.surfaceElevated,
      borderColor: borderStrong,
      color: colors.textPrimary,
    },
    primaryButton: { backgroundColor: colors.textPrimary },
    primaryButtonText: { color: colors.background },
    secondaryButton: { backgroundColor: colors.accent },
    secondaryButtonText: { color: colors.background },
    kakaoBlock: {
      borderColor: isLight ? '#facc15' : 'rgba(254, 229, 0, 0.26)',
    },
    kakaoStateTitle: { color: colors.textPrimary },
    kakaoStateBadgeDefault: {
      backgroundColor: subtleSurface,
      borderColor: borderStrong,
    },
    kakaoStateBadgeSuccess: {
      backgroundColor: successSurface,
      borderColor: isLight ? '#bbf7d0' : 'rgba(74, 222, 128, 0.3)',
    },
    kakaoStateBadgeNeutral: {
      backgroundColor: warningSurface,
      borderColor: isLight ? '#fde68a' : 'rgba(250, 204, 21, 0.26)',
    },
    kakaoStateBadgeAttention: {
      backgroundColor: warningSurface,
      borderColor: isLight ? '#fde68a' : 'rgba(250, 204, 21, 0.28)',
    },
    kakaoStateBadgeText: { color: colors.textPrimary },
    kakaoFallbackText: { color: colors.textSecondary },
    kakaoStatusText: { color: colors.warning },
    kakaoStatusTextAttention: { color: colors.warning },
    kakaoStatusTextNeutral: { color: colors.textSecondary },
    kakaoStatusTextSuccess: { color: colors.success },
    helperText: { color: colors.textMuted },
    textButtonText: { color: colors.textPrimary },
    successPanel: {
      backgroundColor: successSurface,
      borderColor: isLight ? '#bbf7d0' : 'rgba(74, 222, 128, 0.28)',
    },
    successTitle: { color: colors.success },
    successText: { color: colors.success },
    errorPanel: {
      backgroundColor: errorSurface,
      borderColor: isLight ? '#fecdd3' : 'rgba(251, 113, 133, 0.25)',
    },
    errorText: { color: colors.error },
  });
}

const baseStyles = StyleSheet.create({
  screen: {
    backgroundColor: '#0b0d12',
    flex: 1,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(248, 250, 252, 0.08)',
    borderColor: 'rgba(248, 250, 252, 0.14)',
    borderRadius: 999,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  closeButtonText: {
    color: '#f8fafc',
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 32,
  },
  headerTitleBlock: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 10,
  },
  headerSpacer: {
    height: 38,
    width: 38,
  },
  kicker: {
    color: '#9ca3af',
    fontSize: 10,
    fontWeight: '900',
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  title: {
    color: '#f9fafb',
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 29,
  },
  headerMeta: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 3,
    textAlign: 'center',
  },
  body: {
    padding: 16,
    paddingBottom: 32,
  },
  statusPanel: {
    backgroundColor: '#101218',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 14,
    padding: 16,
  },
  statusHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  panelEyebrow: {
    color: '#93c5fd',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  panelTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 25,
  },
  panelText: {
    color: '#d1d5db',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 8,
  },
  protectionBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  protectionBadgeDefault: {
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
    borderColor: 'rgba(148, 163, 184, 0.24)',
  },
  protectionBadgeSuccess: {
    backgroundColor: 'rgba(34, 197, 94, 0.16)',
    borderColor: 'rgba(74, 222, 128, 0.3)',
  },
  protectionBadgeText: {
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '900',
  },
  connectedBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  methodMiniBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  methodMiniBadgeDefault: {
    backgroundColor: 'rgba(148, 163, 184, 0.1)',
    borderColor: 'rgba(148, 163, 184, 0.22)',
  },
  methodMiniBadgeSuccess: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderColor: 'rgba(74, 222, 128, 0.26)',
  },
  methodMiniBadgeText: {
    color: '#e5e7eb',
    fontSize: 11,
    fontWeight: '900',
  },
  noticePanel: {
    backgroundColor: 'rgba(250, 204, 21, 0.1)',
    borderColor: 'rgba(250, 204, 21, 0.22)',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  noticeTitle: {
    color: '#fef3c7',
    fontSize: 15,
    fontWeight: '900',
  },
  noticeText: {
    color: '#fde68a',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 5,
  },
  formPanel: {
    gap: 10,
  },
  methodHub: {
    gap: 10,
  },
  methodCard: {
    backgroundColor: '#111827',
    borderColor: 'rgba(148, 163, 184, 0.22)',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  methodCardSelected: {
    borderColor: 'rgba(147, 197, 253, 0.58)',
  },
  methodCardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  methodTitleRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
  },
  methodIconChip: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  methodIconChipKakao: {
    backgroundColor: '#fee500',
    borderColor: 'rgba(254, 229, 0, 0.48)',
  },
  methodIconChipEmail: {
    backgroundColor: 'rgba(59, 130, 246, 0.16)',
    borderColor: 'rgba(147, 197, 253, 0.32)',
  },
  methodTitleBlock: {
    flex: 1,
    gap: 4,
  },
  methodLabel: {
    color: '#93c5fd',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  methodTitle: {
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 22,
  },
  methodDescription: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 9,
  },
  methodStateBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  methodStateBadgeDefault: {
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
    borderColor: 'rgba(148, 163, 184, 0.24)',
  },
  methodStateBadgeSuccess: {
    backgroundColor: 'rgba(34, 197, 94, 0.16)',
    borderColor: 'rgba(74, 222, 128, 0.3)',
  },
  methodStateBadgeText: {
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '900',
  },
  hubHelperText: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  emailPanel: {
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
    borderColor: 'rgba(148, 163, 184, 0.18)',
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    marginTop: 8,
    padding: 14,
  },
  formLabel: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '900',
  },
  input: {
    backgroundColor: '#111827',
    borderColor: '#334155',
    borderRadius: 12,
    borderWidth: 1,
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: '#050507',
    fontSize: 15,
    fontWeight: '900',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#2563eb',
    borderRadius: 12,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '900',
  },
  buttonDisabled: {
    opacity: 0.42,
  },
  buttonPressed: {
    opacity: 0.72,
  },
  codeBlock: {
    gap: 10,
    marginTop: 14,
  },
  kakaoBlock: {
    borderColor: 'rgba(254, 229, 0, 0.26)',
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    marginTop: 18,
    padding: 14,
  },
  kakaoHeaderRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  kakaoTitleBlock: {
    flex: 1,
    gap: 6,
  },
  kakaoStateTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 21,
  },
  kakaoStateBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  kakaoStateBadgeDefault: {
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
    borderColor: 'rgba(148, 163, 184, 0.24)',
  },
  kakaoStateBadgeSuccess: {
    backgroundColor: 'rgba(34, 197, 94, 0.16)',
    borderColor: 'rgba(74, 222, 128, 0.3)',
  },
  kakaoStateBadgeNeutral: {
    backgroundColor: 'rgba(250, 204, 21, 0.12)',
    borderColor: 'rgba(250, 204, 21, 0.26)',
  },
  kakaoStateBadgeAttention: {
    backgroundColor: 'rgba(250, 204, 21, 0.12)',
    borderColor: 'rgba(250, 204, 21, 0.28)',
  },
  kakaoStateBadgeText: {
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '900',
  },
  kakaoFallbackText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  kakaoButton: {
    alignItems: 'center',
    backgroundColor: '#fee500',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 14,
  },
  kakaoButtonText: {
    color: '#181600',
    fontSize: 15,
    fontWeight: '900',
  },
  kakaoStatusText: {
    color: '#fde68a',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
  },
  kakaoStatusTextAttention: {
    color: '#fde68a',
  },
  kakaoStatusTextNeutral: {
    color: '#cbd5e1',
  },
  kakaoStatusTextSuccess: {
    color: '#bbf7d0',
  },
  helperText: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  textButton: {
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  textButtonText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '900',
    textDecorationLine: 'underline',
  },
  successPanel: {
    backgroundColor: 'rgba(22, 163, 74, 0.13)',
    borderColor: 'rgba(74, 222, 128, 0.28)',
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 14,
    padding: 14,
  },
  successTitle: {
    color: '#bbf7d0',
    fontSize: 15,
    fontWeight: '900',
  },
  successText: {
    color: '#dcfce7',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 5,
  },
  errorPanel: {
    backgroundColor: 'rgba(244, 63, 94, 0.12)',
    borderColor: 'rgba(251, 113, 133, 0.25)',
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 14,
    padding: 14,
  },
  errorText: {
    color: '#fecdd3',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
  },
});
