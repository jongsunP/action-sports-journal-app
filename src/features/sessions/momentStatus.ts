import type {
  GeminiEvidenceResult,
  MomentStatus,
  Session,
} from '../../types';
import type { SessionVideoAsset } from '../../services/ai';

const STALE_RETRY_THRESHOLD_MS = 10 * 60 * 1000;

export type VisibleMomentStatus = 'running' | 'completed' | 'failed';

export type UserFacingMomentStatusPresentation = {
  label: '진행중' | '완료' | '실패';
  visibleStatus: VisibleMomentStatus;
};

export type RetryEligibility = {
  canRetry: boolean;
  reason: string;
};

export function getRetryEligibility({
  canRequestGeminiEvidence,
  evidence,
  isLoading,
  momentStatus,
  session,
  video,
}: {
  canRequestGeminiEvidence: boolean;
  evidence?: GeminiEvidenceResult;
  isLoading: boolean;
  momentStatus?: MomentStatus;
  session: Session;
  video?: SessionVideoAsset | null;
}): RetryEligibility {
  if (!canRequestGeminiEvidence) {
    return {
      canRetry: false,
      reason: '분석 endpoint가 설정되어 있지 않습니다.',
    };
  }

  if (!video) {
    return {
      canRetry: false,
      reason: '재시도하려면 영상 파일이 필요합니다.',
    };
  }

  if (isLoading) {
    return {
      canRetry: false,
      reason: '이미 분석 요청을 진행하고 있습니다.',
    };
  }

  if (momentStatus === 'upload_failed') {
    return {
      canRetry: true,
      reason: '업로드가 완료되지 않았습니다.',
    };
  }

  if (momentStatus === 'failed' || evidence?.status === 'failed') {
    return {
      canRetry: true,
      reason: '이전 분석이 실패했습니다.',
    };
  }

  if (isStaleRunningMoment(session, momentStatus)) {
    return {
      canRetry: true,
      reason: '분석 진행 상태가 오래 갱신되지 않았습니다.',
    };
  }

  if (!evidence) {
    if (momentStatus === 'uploading') {
      return {
        canRetry: false,
        reason: '현재 영상을 업로드하고 있습니다.',
      };
    }

    if (momentStatus === 'processing' || momentStatus === 'queued') {
      return {
        canRetry: false,
        reason: '현재 분석이 진행 중입니다.',
      };
    }

    return {
      canRetry: true,
      reason: '저장된 분석 근거가 없습니다.',
    };
  }

  if (evidence.status !== 'completed') {
    return {
      canRetry: true,
      reason: '분석 근거가 완료 상태가 아닙니다.',
    };
  }

  if (
    momentStatus === 'uploading' ||
    momentStatus === 'processing' ||
    momentStatus === 'queued'
  ) {
    return {
      canRetry: false,
      reason: '현재 분석이 진행 중입니다.',
    };
  }

  return {
    canRetry: false,
    reason: '이미 정상 완료된 분석입니다.',
  };
}

export function getMomentStatus({
  evidence,
  isProcessing,
  sessionStatus,
}: {
  evidence?: GeminiEvidenceResult;
  isProcessing: boolean;
  sessionStatus?: MomentStatus;
}): MomentStatus | undefined {
  if (sessionStatus === 'completed' || evidence?.status === 'completed') {
    return 'completed';
  }

  if (sessionStatus === 'upload_failed') {
    return 'upload_failed';
  }

  if (sessionStatus === 'failed' || evidence?.status === 'failed') {
    return 'failed';
  }

  if (sessionStatus === 'uploading') {
    return 'uploading';
  }

  if (isProcessing || sessionStatus === 'processing') {
    return 'processing';
  }

  if (sessionStatus === 'queued') {
    return 'queued';
  }

  return evidence ? undefined : sessionStatus;
}

export function getVisibleMomentStatus(
  status?: MomentStatus,
): VisibleMomentStatus | undefined {
  if (!status) {
    return undefined;
  }

  if (status === 'failed' || status === 'upload_failed') {
    return 'failed';
  }

  if (status === 'completed') {
    return 'completed';
  }

  return 'running';
}

export function getUserFacingMomentStatusPresentation(
  status?: MomentStatus,
): UserFacingMomentStatusPresentation | undefined {
  const visibleStatus = getVisibleMomentStatus(status);

  if (!visibleStatus) {
    return undefined;
  }

  if (visibleStatus === 'completed') {
    return {
      label: '완료',
      visibleStatus,
    };
  }

  if (visibleStatus === 'failed') {
    return {
      label: '실패',
      visibleStatus,
    };
  }

  return {
    label: '진행중',
    visibleStatus,
  };
}

export function getMomentStatusLabel(status: MomentStatus) {
  return (
    getUserFacingMomentStatusPresentation(status)?.label ??
    getMomentStatusPresentation(status).label
  );
}

export function getMomentStatusMessage(status: MomentStatus) {
  const presentation = getMomentStatusPresentation(status);

  return {
    title: presentation.title,
    body: presentation.body,
  };
}

function isStaleRunningMoment(session: Session, status?: MomentStatus) {
  if (
    status !== 'uploading' &&
    status !== 'processing' &&
    status !== 'queued'
  ) {
    return false;
  }

  const updatedAtMs = new Date(session.updatedAt).getTime();

  if (Number.isNaN(updatedAtMs)) {
    return false;
  }

  return Date.now() - updatedAtMs >= STALE_RETRY_THRESHOLD_MS;
}

function getMomentStatusPresentation(status: MomentStatus) {
  if (status === 'uploading') {
    return {
      label: '진행중',
      title: '영상을 업로드하고 있습니다',
      body: '영상을 서버에 업로드하고 있습니다. 이 단계에서는 앱을 닫지 마세요. 업로드가 끝나면 분석은 서버에서 계속됩니다.',
    };
  }

  if (status === 'upload_failed') {
    return {
      label: '실패',
      title: '업로드가 완료되지 않았습니다',
      body: '영상 업로드가 중단되어 분석을 시작하지 못했습니다. 원본 영상을 다시 선택해 업로드해 주세요.',
    };
  }

  if (status === 'queued') {
    return {
      label: '진행중',
      title: '업로드 완료 · 분석 대기 중',
      body: '업로드가 완료되었습니다. 이제 앱을 닫아도 분석은 계속됩니다. 영상 길이와 네트워크 상태에 따라 몇 분 정도 걸릴 수 있습니다.',
    };
  }

  if (status === 'processing') {
    return {
      label: '진행중',
      title: 'AI가 영상을 분석하고 있습니다',
      body: 'Gemini가 영상의 접근, 팝, 회전, 착지 신호를 확인하고 있습니다. 보통 잠시 걸리지만 경우에 따라 1~5분 정도 걸릴 수 있습니다. 알림이 켜져 있으면 앱을 닫아도 완료 후 알려드립니다.',
    };
  }

  if (status === 'failed') {
    return {
      label: '실패',
      title: '분석을 완료하지 못했습니다',
      body: '영상 업로드나 분석 요청이 중단됐습니다. 원본 영상이 남아 있으면 다시 시도할 수 있습니다.',
    };
  }

  if (status === 'completed') {
    return {
      label: '완료',
      title: '분석 완료',
      body: '영상 분석 결과가 준비됐습니다.',
    };
  }

  return {
    label: '상태 확인',
    title: '상태를 확인하고 있습니다',
    body: '잠시 후 다시 확인해 주세요.',
  };
}
