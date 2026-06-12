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

type RemoteErrorResponse = {
  error?: unknown;
};

const analysisEndpoint = process.env.EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT;

export function hasConfiguredAnalysisEndpoint() {
  return Boolean(analysisEndpoint);
}

export async function analyzeSessionVideo({
  session,
  activityGroupName,
  video,
}: AnalyzeSessionVideoInput): Promise<AnalysisResult> {
  if (!analysisEndpoint) {
    throw new Error('AI 분석 서버 엔드포인트가 설정되지 않았습니다.');
  }

  return requestRemoteAnalysis({ session, activityGroupName, video });
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
    const message = await readRemoteErrorMessage(response);

    throw new Error(message ?? `Analysis request failed with ${response.status}`);
  }

  const data = (await response.json()) as RemoteAnalysisResponse;

  return normalizeRemoteAnalysis(data, session.id);
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

async function readRemoteErrorMessage(response: Response): Promise<string | undefined> {
  try {
    const data = (await response.json()) as RemoteErrorResponse;

    return asString(data.error);
  } catch {
    return undefined;
  }
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
