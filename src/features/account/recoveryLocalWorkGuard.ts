import { loadPersistedSessionState } from '../sessions/sessionStorage';

export type RecoveryLocalWorkGuardResult =
  | {
      canRecover: true;
      blockingCount: 0;
    }
  | {
      canRecover: false;
      blockingCount: number;
      message: string;
    };

export async function checkRecoveryLocalWorkGuard(): Promise<RecoveryLocalWorkGuardResult> {
  const persistedState = await loadPersistedSessionState();
  const sessions = persistedState?.sessions ?? [];
  const remoteMomentIdsBySessionId =
    persistedState?.remoteMomentIdsBySessionId ?? {};
  const uploadReconciliationCandidatesBySessionId =
    persistedState?.uploadReconciliationCandidatesBySessionId ?? {};

  const blockingSessions = sessions.filter((session) => {
    if (session.momentStatus === 'uploading') {
      return true;
    }

    if (
      (session.momentStatus === 'queued' ||
        session.momentStatus === 'processing') &&
      !remoteMomentIdsBySessionId[session.id]
    ) {
      return true;
    }

    return Boolean(uploadReconciliationCandidatesBySessionId[session.id]);
  });

  if (blockingSessions.length === 0) {
    return {
      canRecover: true,
      blockingCount: 0,
    };
  }

  return {
    canRecover: false,
    blockingCount: blockingSessions.length,
    message:
      '아직 업로드 또는 복구 확인 중인 기록이 있습니다. 해당 작업이 끝난 뒤 기존 기록 복구를 다시 시도해주세요.',
  };
}
