export type UploadProgressStage =
  | 'preparing'
  | 'creating_target'
  | 'uploading_video'
  | 'finalizing_upload'
  | 'requesting_analysis'
  | 'fallback_upload';

export type UploadProgressState = {
  detail: string;
  index: number;
  label: string;
  stage: UploadProgressStage;
  total: number;
};

export type UploadProgressHandler = (stage: UploadProgressStage) => void;

const UPLOAD_PROGRESS_COPY: Record<
  UploadProgressStage,
  { detail: string; index: number; label: string }
> = {
  preparing: {
    detail: '선택한 영상을 확인하고 있습니다.',
    index: 1,
    label: '준비 중',
  },
  creating_target: {
    detail: '안전한 업로드 경로를 준비하고 있습니다.',
    index: 2,
    label: '업로드 대상 생성 중',
  },
  uploading_video: {
    detail: '원본 영상을 서버 저장소로 전송하고 있습니다.',
    index: 3,
    label: '영상 업로드 중',
  },
  finalizing_upload: {
    detail: '업로드된 영상을 확인하고 분석을 준비하고 있습니다.',
    index: 4,
    label: '업로드 확인 중',
  },
  requesting_analysis: {
    detail: '분석 요청을 등록하고 있습니다.',
    index: 5,
    label: '분석 요청 중',
  },
  fallback_upload: {
    detail: '안정 경로로 다시 업로드하고 있습니다.',
    index: 3,
    label: '영상 업로드 중',
  },
};

const UPLOAD_PROGRESS_TOTAL = 5;

export function buildUploadProgress(
  stage: UploadProgressStage,
): UploadProgressState {
  return {
    ...UPLOAD_PROGRESS_COPY[stage],
    stage,
    total: UPLOAD_PROGRESS_TOTAL,
  };
}
