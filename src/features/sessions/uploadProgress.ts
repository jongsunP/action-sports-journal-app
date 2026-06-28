export type UploadProgressStage =
  | 'preparing'
  | 'optimizing_video'
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
    detail: '영상 준비와 업로드를 진행하고 있습니다. 앱을 닫지 말고 잠시만 기다려주세요.',
    label: '영상 기록을 만들고 있습니다',
  },
  optimizing_video: {
    detail: '영상 준비와 업로드를 진행하고 있습니다. 앱을 닫지 말고 잠시만 기다려주세요.',
    label: '영상 기록을 만들고 있습니다',
  },
  creating_target: {
    detail: '영상 준비와 업로드를 진행하고 있습니다. 앱을 닫지 말고 잠시만 기다려주세요.',
    label: '영상 기록을 만들고 있습니다',
  },
  uploading_video: {
    detail: '영상 준비와 업로드를 진행하고 있습니다. 앱을 닫지 말고 잠시만 기다려주세요.',
    label: '영상 기록을 만들고 있습니다',
  },
  finalizing_upload: {
    detail: '영상 준비와 업로드를 진행하고 있습니다. 앱을 닫지 말고 잠시만 기다려주세요.',
    label: '영상 기록을 만들고 있습니다',
  },
  requesting_analysis: {
    detail: '영상 준비와 업로드를 진행하고 있습니다. 앱을 닫지 말고 잠시만 기다려주세요.',
    label: '영상 기록을 만들고 있습니다',
  },
  fallback_upload: {
    detail: '영상 준비와 업로드를 진행하고 있습니다. 앱을 닫지 말고 잠시만 기다려주세요.',
    label: '영상 기록을 만들고 있습니다',
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
  const boundedPercent =
    typeof percent === 'number' && Number.isFinite(percent)
      ? Math.max(0, Math.min(100, percent))
      : undefined;

  switch (stage) {
    case 'preparing':
      return 5;
    case 'optimizing_video':
      return Math.round(5 + ((boundedPercent ?? 25) / 100) * 20);
    case 'creating_target':
      return 30;
    case 'uploading_video':
      return Math.round(30 + ((boundedPercent ?? 10) / 100) * 55);
    case 'fallback_upload':
      return 70;
    case 'finalizing_upload':
      return 92;
    case 'requesting_analysis':
      return 100;
  }
}
