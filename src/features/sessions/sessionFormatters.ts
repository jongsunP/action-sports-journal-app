import { getMomentStatus } from './momentStatus';

import type { SessionVideoAsset } from '../../services/ai';
import type { GeminiEvidenceResult, MomentStatus, Session } from '../../types';

export function getVideoAssetFromSession(session: Session): SessionVideoAsset | null {
  if (!session.videoUri) {
    return null;
  }

  return {
    uri: session.videoUri,
    fileName: `${session.id}.mov`,
    mimeType: 'video/quicktime',
  };
}

export function formatVideoMeta(video: SessionVideoAsset) {
  const parts = [
    video.duration ? `${Math.round(video.duration / 1000)}s` : null,
    video.fileSize ? `${Math.round(video.fileSize / 1024 / 1024)} MB` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' · ') : '준비됨';
}

export function getCompletedMomentEvidence({
  evidence,
  isProcessing,
  sessionStatus,
}: {
  evidence?: GeminiEvidenceResult;
  isProcessing: boolean;
  sessionStatus?: MomentStatus;
}) {
  const momentStatus = getMomentStatus({
    evidence,
    isProcessing,
    sessionStatus,
  });

  return momentStatus === 'completed' ? evidence : undefined;
}

export function getSessionCardPresentation({
  session,
  evidence,
  thumbnailUri,
}: {
  session: Session;
  evidence?: GeminiEvidenceResult;
  thumbnailUri?: string;
}) {
  const needsReview =
    evidence?.requiresUserConfirmation ||
    evidence?.consistencyStatus === 'needs_review' ||
    evidence?.consistencyStatus === 'inconsistent' ||
    evidence?.confidence === 'low' ||
    evidence?.primaryCandidate.confidence === 'low' ||
    evidence?.primaryCandidate.name === '확인 필요';
  const detectedAction =
    needsReview || evidence?.primaryCandidate.name === '확인 필요'
      ? undefined
      : evidence?.primaryCandidate.name;
  const hook =
    needsReview
      ? evidence?.candidateTrace?.displayLabel
        ? `검토 후보: ${evidence.candidateTrace.displayLabel}`
        : '상세 확인이 필요한 분석 결과입니다.'
      : evidence?.evidence ??
        evidence?.approachObservedFacts?.wakeCrossingPath.evidence ??
        evidence?.family.evidence;
  const hasEvidence = evidence?.status === 'completed';
  const momentTitle =
    needsReview
      ? '확인 필요'
      : detectedAction ??
        inferMomentTitle(session.title) ??
        (session.videoUri ? '라이딩 영상' : '클립 대기 중');
  const reason = hasEvidence
    ? hook ?? '동작 근거가 준비됐습니다.'
    : session.videoUri
      ? 'Gemini 근거 추출을 시작합니다.'
      : '클립을 추가하면 영상 기록이 살아납니다.';
  const openReason = hasEvidence
    ? needsReview
      ? '검토 필요'
      : '동작 근거 준비'
    : session.videoUri
      ? '근거 추출 대기'
      : '클립 추가 필요';

  return {
    thumbnailUri,
    detectedAction: detectedAction ? compactCardText(detectedAction, 42) : undefined,
    hook: hook ? compactCardText(hook, 92) : undefined,
    momentTitle: compactCardText(momentTitle, 34),
    reason: compactCardText(reason, 58),
    openReason,
  };
}

export function getVideoArchiveDescription(session: Session) {
  return session.videoUri ? '업로드된 라이딩 영상' : '영상이 없는 세션';
}

export function formatTimelineMonth(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return `${date.getMonth() + 1}월`;
}

export function formatTimelineDay(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return String(date.getDate()).padStart(2, '0');
}

export function formatShortSessionDate(value: string) {
  return new Date(value).toLocaleDateString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
  });
}

function inferMomentTitle(title: string) {
  const normalized = title.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return undefined;
  }

  if (
    normalized.toLowerCase().includes('back roll') ||
    normalized.includes('백롤')
  ) {
    return 'HS 백롤 시도';
  }

  if (
    normalized.toLowerCase().includes('landing') ||
    normalized.includes('착지')
  ) {
    return '착지 진행 상황';
  }

  return normalized;
}

function compactCardText(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, ' ').trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}
