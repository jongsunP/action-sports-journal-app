import { getMomentStatus, needsEvidenceReview } from './momentStatus';

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

export function getUserFacingDetailVideo({
  momentStatus,
  thumbnailUri,
  video,
}: {
  momentStatus?: MomentStatus;
  thumbnailUri?: string;
  video?: SessionVideoAsset | null;
}) {
  if (!video) {
    return null;
  }

  if (
    momentStatus === 'completed' &&
    thumbnailUri &&
    isCompressedPreviewVideo(video)
  ) {
    return null;
  }

  return video;
}

function isCompressedPreviewVideo(video: SessionVideoAsset) {
  if (video.previewSource === 'compressed') {
    return true;
  }

  return Boolean(video.fileName?.includes('.compressed.'));
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
  const needsReview = needsEvidenceReview(evidence);
  const detectedAction = needsReview ? undefined : evidence?.primaryCandidate.name;
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
    normalizeOptionalText(session.title) ??
    getSessionDisplayTitle(session, evidence) ??
    (session.videoUri ? '라이딩 영상' : '클립 대기 중');
  const reason = hasEvidence
    ? hook ?? '동작 근거가 준비됐습니다.'
    : session.videoUri
      ? '라이딩 신호 확인을 시작합니다.'
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

export function getSessionDisplayTitle(
  session: Session,
  _evidence?: GeminiEvidenceResult,
) {
  const userTitle = normalizeOptionalText(session.title);

  if (userTitle) {
    return inferMomentTitle(userTitle) ?? userTitle;
  }

  const dateLabel = formatShortSessionDate(session.occurredAt);

  return dateLabel || '라이딩 영상';
}

export function getVideoArchiveDescription(session: Session) {
  return session.videoUri
    ? '라이딩 기록을 확인할 수 있습니다.'
    : '영상이 없는 기록입니다.';
}

export function formatShortSessionDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const datePart = date.toLocaleDateString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
  });
  const timePart = date
    .toLocaleTimeString('en-US', {
      hour: '2-digit',
      hour12: true,
      minute: '2-digit',
    })
    .replace(' ', ' ');

  return `${datePart} ${timePart}`;
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

function normalizeOptionalText(value?: string | null) {
  const normalized = value?.replace(/\s+/g, ' ').trim();

  return normalized ? normalized : undefined;
}

function compactCardText(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, ' ').trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}
