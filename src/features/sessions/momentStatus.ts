import type {
  GeminiEvidenceResult,
  MomentStatus,
  Session,
} from '../../types';
import type { SessionVideoAsset } from '../../services/ai';

const STALE_RETRY_THRESHOLD_MS = 10 * 60 * 1000;

export type VisibleMomentStatus = 'running' | 'completed' | 'failed';

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

  if (momentStatus === 'processing' || momentStatus === 'queued') {
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

  if (sessionStatus === 'failed' || evidence?.status === 'failed') {
    return 'failed';
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

  if (status === 'failed') {
    return 'failed';
  }

  if (status === 'completed') {
    return 'completed';
  }

  return 'running';
}

export function getMomentStatusLabel(status: MomentStatus) {
  return getMomentStatusPresentation(status).label;
}

export function getMomentStatusMessage(status: MomentStatus) {
  const presentation = getMomentStatusPresentation(status);

  return {
    title: presentation.title,
    body: presentation.body,
  };
}

function isStaleRunningMoment(session: Session, status?: MomentStatus) {
  if (status !== 'processing' && status !== 'queued') {
    return false;
  }

  const updatedAtMs = new Date(session.updatedAt).getTime();

  if (Number.isNaN(updatedAtMs)) {
    return false;
  }

  return Date.now() - updatedAtMs >= STALE_RETRY_THRESHOLD_MS;
}

function getMomentStatusPresentation(status: MomentStatus) {
  const visibleStatus = getVisibleMomentStatus(status);

  if (visibleStatus === 'running') {
    return {
      label: '진행중',
      title: '진행중',
      body: '영상 분석을 진행하고 있습니다. 완료되면 결과가 이 화면에 표시됩니다.',
    };
  }

  if (visibleStatus === 'failed') {
    return {
      label: '실패',
      title: '실패',
      body: '영상 근거 추출이 완료되지 않았습니다. 다시 시도할 수 있습니다.',
    };
  }

  return {
    label: '완료',
    title: '완료',
    body: '영상 근거 결과가 준비됐습니다.',
  };
}
