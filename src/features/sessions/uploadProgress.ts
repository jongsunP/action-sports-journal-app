export type UploadProgressStage =
  | 'preparing'
  | 'creating_target'
  | 'uploading_video'
  | 'finalizing_upload'
  | 'requesting_analysis'
  | 'fallback_upload';

export type UploadProgressState = {
  detail: string;
  label: string;
  percent?: number;
  stage: UploadProgressStage;
};

export type UploadProgressHandler = (
  stage: UploadProgressStage,
  percent?: number,
) => void;

const UPLOAD_PROGRESS_COPY: Record<
  UploadProgressStage,
  { detail: string; label: string }
> = {
  preparing: {
    detail: '선택한 영상을 확인하고 업로드를 준비하고 있습니다.',
    label: '업로드 준비 중',
  },
  creating_target: {
    detail: '영상을 보낼 안전한 경로를 준비하고 있습니다.',
    label: '업로드 준비 중',
  },
  uploading_video: {
    detail: '원본 영상을 전송하고 있습니다.',
    label: '영상 전송 중',
  },
  finalizing_upload: {
    detail: '업로드된 영상을 확인하고 분석을 준비하고 있습니다.',
    label: '업로드 확인 중',
  },
  requesting_analysis: {
    detail: '서버에서 분석을 계속할 수 있도록 요청을 등록하고 있습니다.',
    label: '분석 준비 중',
  },
  fallback_upload: {
    detail: '네트워크 상태에 맞춰 업로드를 다시 시도하고 있습니다.',
    label: '업로드를 다시 시도하고 있습니다',
  },
};

export function buildUploadProgress(
  stage: UploadProgressStage,
  percent?: number,
): UploadProgressState {
  return {
    ...UPLOAD_PROGRESS_COPY[stage],
    percent: normalizeUploadPercent(stage, percent),
    stage,
  };
}

function normalizeUploadPercent(
  stage: UploadProgressStage,
  percent?: number,
) {
  if (
    stage !== 'uploading_video' ||
    typeof percent !== 'number' ||
    !Number.isFinite(percent)
  ) {
    return undefined;
  }

  return Math.max(0, Math.min(100, Math.round(percent)));
}
