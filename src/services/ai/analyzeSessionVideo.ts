import type { AnalysisResult, Session } from '../../types';

export type SessionVideoAsset = {
  uri: string;
  fileName?: string | null;
  fileSize?: number;
  mimeType?: string | null;
  duration?: number | null;
};

export type AnalyzeSessionVideoInput = {
  session: Session;
  activityGroupName: string;
  video: SessionVideoAsset;
};

type RemoteAnalysisResponse = {
  id?: unknown;
  sessionId?: unknown;
  status?: unknown;
  summary?: unknown;
  highlights?: unknown;
  highlightScenes?: unknown;
  suggestions?: unknown;
  createdAt?: unknown;
};

const analysisEndpoint = process.env.EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT;

export async function analyzeSessionVideo({
  session,
  activityGroupName,
  video,
}: AnalyzeSessionVideoInput): Promise<AnalysisResult> {
  if (analysisEndpoint) {
    return requestRemoteAnalysis({ session, activityGroupName, video });
  }

  return createMockAnalysis({ session, activityGroupName, video });
}

async function requestRemoteAnalysis({
  session,
  activityGroupName,
  video,
}: AnalyzeSessionVideoInput): Promise<AnalysisResult> {
  const formData = new FormData();

  formData.append('sessionId', session.id);
  formData.append('activityGroupName', activityGroupName);
  formData.append('title', session.title);
  formData.append('notes', session.notes ?? '');
  formData.append('occurredAt', session.occurredAt);
  formData.append('video', {
    uri: video.uri,
    name: video.fileName ?? `${session.id}.mov`,
    type: video.mimeType ?? 'video/quicktime',
  } as unknown as Blob);

  const response = await fetch(analysisEndpoint, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Analysis request failed with ${response.status}`);
  }

  const data = (await response.json()) as RemoteAnalysisResponse;

  return normalizeRemoteAnalysis(data, session.id);
}

function createMockAnalysis({
  session,
  activityGroupName,
  video,
}: AnalyzeSessionVideoInput): AnalysisResult {
  const now = new Date().toISOString();
  const durationSeconds =
    typeof video.duration === 'number' ? Math.round(video.duration / 1000) : null;

  return {
    id: `analysis-${Date.now()}`,
    sessionId: session.id,
    status: 'completed',
    summary: `${activityGroupName} 세션 "${session.title}" 영상이 분석 대기 상태입니다. 아직 서버 분석이 연결되지 않아 앱 안에서 보여주는 임시 결과입니다.`,
    highlights: [
      durationSeconds
        ? `선택한 영상 길이는 약 ${durationSeconds}초입니다.`
        : '선택한 영상이 세션에 연결되었습니다.',
      video.fileSize
        ? `영상 파일 크기는 약 ${Math.round(video.fileSize / 1024 / 1024)}MB입니다.`
        : '영상 메타데이터를 업로드 요청에 사용할 수 있습니다.',
    ],
    suggestions: [
      '실제 분석은 서버 엔드포인트에서 OpenAI API로 처리합니다.',
      'OpenAI API 키는 모바일 앱이 아니라 서버에만 둡니다.',
      '분석 결과는 나중에 AnalysisResult로 저장할 수 있게 구조화합니다.',
    ],
    createdAt: now,
  };
}

function normalizeRemoteAnalysis(
  data: RemoteAnalysisResponse,
  sessionId: string,
): AnalysisResult {
  const now = new Date().toISOString();

  return {
    id: asString(data.id) ?? `analysis-${Date.now()}`,
    sessionId: asString(data.sessionId) ?? sessionId,
    status: data.status === 'failed' ? 'failed' : 'completed',
    summary: asString(data.summary) ?? '분석이 완료되었습니다.',
    highlights: asStringArray(data.highlights),
    highlightScenes: asHighlightScenes(data.highlightScenes),
    suggestions: asStringArray(data.suggestions),
    createdAt: asString(data.createdAt) ?? now,
  };
}

function asHighlightScenes(value: unknown): AnalysisResult['highlightScenes'] {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .map((item, index) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const scene = item as Record<string, unknown>;

      return {
        id: asString(scene.id) ?? `highlight-${index}`,
        timestampLabel: asString(scene.timestampLabel) ?? '0:00',
        title: asString(scene.title) ?? '하이라이트',
        description: asString(scene.description) ?? '장면 설명이 준비되었습니다.',
        imageUri: asString(scene.imageUri),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}


function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is string => typeof item === 'string' && item.length > 0,
  );
}
