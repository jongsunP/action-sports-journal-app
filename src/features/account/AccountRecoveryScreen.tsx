import { useMemo, useState } from 'react';
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

import type { RootStackParamList } from '../../navigation/types';
import { normalizeRecoveryEmail } from '../../services/auth/accountRecovery';
import { useAuthSession } from '../../services/auth/AuthSessionProvider';

type RecoveryStep = 'idle' | 'emailSent' | 'linked';
type KakaoFeedbackType = 'success' | 'cancelled' | 'dismissed' | 'error';
type KakaoFeedback = {
  type: KakaoFeedbackType;
  message: string;
};
type KakaoUiState =
  | 'notLinked'
  | 'linking'
  | 'linked'
  | 'success'
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

function getKakaoUiCopy({
  hasKakaoIdentity,
  isLinkingKakao,
  kakaoFeedback,
  kakaoNickname,
}: {
  hasKakaoIdentity: boolean;
  isLinkingKakao: boolean;
  kakaoFeedback: KakaoFeedback | null;
  kakaoNickname: string | null;
}) {
  const state: KakaoUiState = hasKakaoIdentity
    ? kakaoFeedback?.type === 'success'
      ? 'success'
      : 'linked'
    : isLinkingKakao
      ? 'linking'
      : kakaoFeedback?.type ?? 'notLinked';

  switch (state) {
    case 'linked':
      return {
        state,
        title: '카카오 복구 수단 연결됨',
        description: kakaoNickname
          ? `${kakaoNickname} 카카오 계정으로 이 기록을 복구할 수 있습니다.`
          : '카카오 계정으로 이 기록을 복구할 수 있습니다.',
        buttonLabel: '카카오 연결 완료',
      };
    case 'success':
      return {
        state,
        title: '카카오 연결 완료',
        description: '현재 기기의 기록이 카카오 계정과 연결되었습니다.',
        buttonLabel: '카카오 연결 완료',
      };
    case 'linking':
      return {
        state,
        title: '카카오 연결 진행 중',
        description: '카카오 화면에서 동의가 끝나면 이 앱으로 돌아옵니다.',
        buttonLabel: '카카오 연결 중',
      };
    case 'cancelled':
      return {
        state,
        title: '카카오 연결이 취소됨',
        description:
          kakaoFeedback?.message ??
          '사용자가 카카오 연결을 취소했습니다. 기록은 그대로 보존됩니다.',
        buttonLabel: '카카오로 다시 연결',
      };
    case 'dismissed':
      return {
        state,
        title: '카카오 연결이 완료되지 않음',
        description:
          kakaoFeedback?.message ??
          '카카오 연결 창이 닫혔습니다. 필요할 때 다시 시도할 수 있습니다.',
        buttonLabel: '카카오로 다시 연결',
      };
    case 'error':
      return {
        state,
        title: '카카오 연결 실패',
        description:
          kakaoFeedback?.message ??
          '카카오 연결을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.',
        buttonLabel: '카카오로 다시 연결',
      };
    case 'notLinked':
    default:
      return {
        state,
        title: '카카오 복구 수단 연결',
        description:
          '이 기기의 익명 기록에 카카오 복구 수단을 연결합니다.',
        buttonLabel: '카카오로 복구 수단 연결',
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
      title: '기기 계정 보호됨',
      description: kakaoNickname
        ? `현재 라이딩 기록은 이 기기의 계정에 묶여 있고, ${kakaoNickname} 카카오 계정과 ${currentEmail} 이메일을 복구 수단으로 사용할 수 있습니다.`
        : `현재 라이딩 기록은 이 기기의 계정에 묶여 있고, 카카오 계정과 ${currentEmail} 이메일을 복구 수단으로 사용할 수 있습니다.`,
    };
  }

  if (hasKakaoIdentity) {
    return {
      title: '기기 계정 보호됨',
      description: kakaoNickname
        ? `현재 라이딩 기록은 이 기기의 계정에 묶여 있고, ${kakaoNickname} 카카오 계정이 복구 수단으로 연결되어 있습니다.`
        : '현재 라이딩 기록은 이 기기의 계정에 묶여 있고, 카카오 복구 수단이 연결되어 있습니다.',
    };
  }

  if (currentEmail) {
    return {
      title: '기기 계정 보호됨',
      description: `현재 라이딩 기록은 이 기기의 계정에 묶여 있고, ${currentEmail} 이메일이 복구 수단으로 연결되어 있습니다.`,
    };
  }

  if (isAnonymousUser) {
    return {
      title: '익명 기기 계정',
      description:
        '현재 라이딩 기록은 이 기기의 익명 계정에 묶여 있습니다. 카카오나 이메일을 복구 수단으로 연결할 수 있습니다.',
    };
  }

  return {
    title: '계정 상태 확인 필요',
    description: '인증 세션을 확인한 뒤 복구 수단을 연결할 수 있습니다.',
  };
}

export function AccountRecoveryScreen() {
  const navigation =
    useNavigation<
      NativeStackNavigationProp<RootStackParamList, 'AccountRecovery'>
    >();
  const {
    authMode,
    isLoading,
    linkKakaoIdentity,
    requestRecoveryEmailLink,
    refreshSession,
    user,
  } = useAuthSession();
  const [email, setEmail] = useState(user?.email ?? '');
  const [pendingEmail, setPendingEmail] = useState('');
  const [step, setStep] = useState<RecoveryStep>(user?.email ? 'linked' : 'idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [kakaoFeedback, setKakaoFeedback] = useState<KakaoFeedback | null>(null);
  const [isLinkingKakao, setIsLinkingKakao] = useState(false);
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);
  const [isRefreshingSession, setIsRefreshingSession] = useState(false);

  const normalizedEmail = useMemo(() => normalizeRecoveryEmail(email), [email]);
  const isAnonymousUser = hasAnonymousFlag(user);
  const currentEmail = user?.email ?? null;
  const hasKakaoIdentity = Boolean(
    user?.identities?.some((identity) => identity.provider === 'kakao'),
  );
  const kakaoNickname = getKakaoNickname(user?.user_metadata);
  const canSubmitEmail =
    authMode === 'authenticated' &&
    normalizedEmail.includes('@') &&
    !isSubmittingEmail &&
    !isRefreshingSession &&
    !isLinkingKakao;
  const canRefreshLinkStatus =
    authMode === 'authenticated' &&
    !isSubmittingEmail &&
    !isRefreshingSession &&
    !isLinkingKakao;
  const canLinkKakao =
    authMode === 'authenticated' &&
    !hasKakaoIdentity &&
    !isSubmittingEmail &&
    !isRefreshingSession &&
    !isLinkingKakao;
  const kakaoUiCopy = getKakaoUiCopy({
    hasKakaoIdentity,
    isLinkingKakao,
    kakaoFeedback,
    kakaoNickname,
  });
  const accountStatusCopy = getAccountStatusCopy({
    currentEmail,
    hasKakaoIdentity,
    isAnonymousUser,
    kakaoNickname,
  });

  const handleRequestEmailLink = async () => {
    if (!canSubmitEmail) {
      return;
    }

    setErrorMessage(null);
    setKakaoFeedback(null);
    setIsSubmittingEmail(true);

    try {
      await requestRecoveryEmailLink(normalizedEmail);
      setPendingEmail(normalizedEmail);
      setStep('emailSent');
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmittingEmail(false);
    }
  };

  const handleRefreshLinkStatus = async () => {
    if (!canRefreshLinkStatus) {
      return;
    }

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

    setEmail(pendingEmail);
    setErrorMessage(null);
    setKakaoFeedback(null);
    setIsSubmittingEmail(true);

    try {
      await requestRecoveryEmailLink(pendingEmail);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmittingEmail(false);
    }
  };

  const handleLinkKakao = async () => {
    if (!canLinkKakao) {
      return;
    }

    setErrorMessage(null);
    setKakaoFeedback(null);
    setIsLinkingKakao(true);

    try {
      const result = await linkKakaoIdentity();

      if (result.status === 'linked') {
        setKakaoFeedback({
          type: 'success',
          message: '카카오가 현재 계정의 복구 수단으로 연결되었습니다.',
        });
        return;
      }

      setKakaoFeedback({
        type: result.status === 'cancelled' ? 'cancelled' : 'dismissed',
        message:
          result.status === 'cancelled'
            ? '카카오 연결이 취소되었습니다. 기록은 그대로 유지됩니다.'
            : '카카오 연결 창이 닫혔습니다. 필요할 때 다시 시도할 수 있습니다.',
      });
    } catch (error) {
      setKakaoFeedback({
        type: 'error',
        message: getErrorMessage(error),
      });
    } finally {
      setIsLinkingKakao(false);
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
            <Text style={styles.panelEyebrow}>현재 상태</Text>
            <Text style={styles.panelTitle}>{accountStatusCopy.title}</Text>
            <Text style={styles.panelText}>
              {accountStatusCopy.description}
            </Text>
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
              <Text style={styles.formLabel}>복구 이메일</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isSubmittingEmail && !isRefreshingSession}
                inputMode="email"
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="name@example.com"
                placeholderTextColor="#64748b"
                style={styles.input}
                textContentType="emailAddress"
                value={email}
              />
              <Pressable
                accessibilityRole="button"
                disabled={!canSubmitEmail}
                onPress={handleRequestEmailLink}
                style={({ pressed }) => [
                  styles.primaryButton,
                  !canSubmitEmail ? styles.buttonDisabled : undefined,
                  pressed ? styles.buttonPressed : undefined,
                ]}
              >
                {isSubmittingEmail ? (
                  <ActivityIndicator color="#050507" />
                ) : (
                  <Text style={styles.primaryButtonText}>복구 이메일 보내기</Text>
                )}
              </Pressable>

              {step === 'emailSent' ? (
                <View style={styles.codeBlock}>
                  <Text style={styles.formLabel}>이메일 확인 대기 중</Text>
                  <Text style={styles.helperText}>
                    {pendingEmail} 주소로 보낸 메일에서 확인 링크를 눌러주세요.
                    링크를 연 뒤 앱으로 돌아와 연결 상태를 새로고침하면 됩니다.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    disabled={!canRefreshLinkStatus}
                    onPress={handleRefreshLinkStatus}
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      !canRefreshLinkStatus ? styles.buttonDisabled : undefined,
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
                    disabled={isSubmittingEmail || isRefreshingSession}
                    onPress={handleResend}
                    style={({ pressed }) => [
                      styles.textButton,
                      pressed ? styles.buttonPressed : undefined,
                    ]}
                  >
                    <Text style={styles.textButtonText}>이메일 다시 보내기</Text>
                  </Pressable>
                </View>
              ) : null}

              {step === 'linked' && currentEmail ? (
                <View style={styles.successPanel}>
                  <Text style={styles.successTitle}>복구 준비 완료</Text>
                  <Text style={styles.successText}>
                    앱을 다시 설치하거나 새 기기로 옮길 때 이 이메일을 복구
                    수단으로 사용할 수 있습니다.
                  </Text>
                </View>
              ) : null}

              <View style={styles.kakaoBlock}>
                <View style={styles.kakaoHeaderRow}>
                  <View style={styles.kakaoTitleBlock}>
                    <Text style={styles.formLabel}>카카오 복구 수단</Text>
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
                        : kakaoUiCopy.state === 'cancelled' ||
                            kakaoUiCopy.state === 'dismissed'
                          ? styles.kakaoStateBadgeNeutral
                          : kakaoUiCopy.state === 'error'
                            ? styles.kakaoStateBadgeError
                            : styles.kakaoStateBadgeDefault,
                    ]}
                  >
                    <Text style={styles.kakaoStateBadgeText}>
                      {kakaoUiCopy.state === 'linked' ||
                      kakaoUiCopy.state === 'success'
                        ? '연결됨'
                        : kakaoUiCopy.state === 'linking'
                          ? '진행 중'
                          : kakaoUiCopy.state === 'error'
                            ? '오류'
                            : kakaoUiCopy.state === 'cancelled' ||
                                kakaoUiCopy.state === 'dismissed'
                              ? '미완료'
                              : '미연결'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.helperText}>{kakaoUiCopy.description}</Text>
                <Text style={styles.kakaoFallbackText}>
                  카카오와 이메일은 대체 복구 수단입니다. 둘 중 하나만
                  연결해도 기록 복구에 사용할 수 있습니다.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={!canLinkKakao}
                  onPress={handleLinkKakao}
                  style={({ pressed }) => [
                    styles.kakaoButton,
                    !canLinkKakao ? styles.buttonDisabled : undefined,
                    pressed ? styles.buttonPressed : undefined,
                  ]}
                >
                  {isLinkingKakao ? (
                    <ActivityIndicator color="#181600" />
                  ) : (
                    <Text style={styles.kakaoButtonText}>
                      {kakaoUiCopy.buttonLabel}
                    </Text>
                  )}
                </Pressable>
                {kakaoFeedback ? (
                  <Text
                    style={[
                      styles.kakaoStatusText,
                      kakaoFeedback.type === 'error'
                        ? styles.kakaoStatusTextError
                        : undefined,
                    ]}
                  >
                    {kakaoFeedback.message}
                  </Text>
                ) : null}
              </View>

              {errorMessage ? (
                <View style={styles.errorPanel}>
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              ) : null}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  panelEyebrow: {
    color: '#93c5fd',
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 8,
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
  kakaoStateBadgeError: {
    backgroundColor: 'rgba(244, 63, 94, 0.13)',
    borderColor: 'rgba(251, 113, 133, 0.28)',
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
  kakaoStatusTextError: {
    color: '#fecdd3',
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
