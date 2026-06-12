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

  return response.json();
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
    summary: `${activityGroupName} session "${session.title}" is ready for AI review. This is a local mock result until the backend analysis endpoint is connected.`,
    highlights: [
      durationSeconds
        ? `Selected video duration is about ${durationSeconds} seconds.`
        : 'Selected video is attached to the session.',
      video.fileSize
        ? `Video file size is about ${Math.round(video.fileSize / 1024 / 1024)} MB.`
        : 'Video metadata is available for upload.',
    ],
    suggestions: [
      'Send the video to a server endpoint for real OpenAI analysis.',
      'Keep the OpenAI API key on the server, not inside the mobile app.',
      'Return structured analysis that can be stored as AnalysisResult later.',
    ],
    createdAt: now,
  };
}
