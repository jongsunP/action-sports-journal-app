import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { createPartFromUri, GoogleGenAI, Type } from '@google/genai';
import multer from 'multer';

dotenv.config({ path: '.env.local' });
dotenv.config();

const port = Number(process.env.PORT ?? 8787);
const model = process.env.GEMINI_ANALYSIS_MODEL ?? 'gemini-3.5-flash';
const maxVideoBytes = readNumberEnv('MAX_VIDEO_MB', 20) * 1024 * 1024;
const dailyAnalysisLimit = readNumberEnv('DAILY_ANALYSIS_LIMIT', 3);
const rateLimitWindowMs = readNumberEnv('RATE_LIMIT_WINDOW_MS', 60_000);
const rateLimitMaxRequests = readNumberEnv('RATE_LIMIT_MAX_REQUESTS', 3);
const maxOutputTokens = readNumberEnv('GEMINI_MAX_OUTPUT_TOKENS', 600);
const requestTimeoutMs = readNumberEnv('GEMINI_REQUEST_TIMEOUT_MS', 120_000);
const fileProcessingTimeoutMs = readNumberEnv('GEMINI_FILE_PROCESSING_TIMEOUT_MS', 120_000);
const fileProcessingPollMs = readNumberEnv('GEMINI_FILE_PROCESSING_POLL_MS', 2_000);
const allowedVideoMimeTypes = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-m4v',
  'video/mov',
]);
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();
const dailyUsage = new Map<string, number>();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxVideoBytes,
    files: 1,
  },
  fileFilter: (_request, file, callback) => {
    if (!allowedVideoMimeTypes.has(file.mimetype)) {
      callback(new Error(`Unsupported video type: ${file.mimetype}`));
      return;
    }

    callback(null, true);
  },
});

const app = express();

app.use(cors());
app.use(rateLimit);

app.get('/health', (_request, response) => {
  response.json({
    ok: true,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    model,
    spendPolicy: 'development budget target: under KRW 10,000/month',
    limits: {
      maxVideoMb: Math.round(maxVideoBytes / 1024 / 1024),
      dailyAnalysisLimit,
      rateLimitWindowMs,
      rateLimitMaxRequests,
      maxOutputTokens,
      requestTimeoutMs,
      fileProcessingTimeoutMs,
      fileProcessingPollMs,
    },
  });
});

app.post('/api/analyze-session-video', upload.single('video'), async (request, response) => {
  try {
    const usageKey = todayKey();

    if ((dailyUsage.get(usageKey) ?? 0) >= dailyAnalysisLimit) {
      response.status(429).json({
        error:
          'Daily analysis limit reached. This limit keeps development API spend under control.',
      });
      return;
    }

    if (!process.env.GEMINI_API_KEY) {
      response.status(500).json({
        error: 'GEMINI_API_KEY is not configured on the server.',
      });
      return;
    }

    if (!request.file) {
      response.status(400).json({ error: 'video file is required.' });
      return;
    }

    if (request.file.size > maxVideoBytes) {
      response.status(413).json({
        error: `Video is too large. Max size is ${Math.round(maxVideoBytes / 1024 / 1024)}MB.`,
      });
      return;
    }

    const sessionId = getField(request.body.sessionId, 'session-local');
    const activityGroupName = getField(request.body.activityGroupName, '종목');
    const title = getField(request.body.title, '세션');
    const notes = getField(request.body.notes, '');
    const occurredAt = getField(request.body.occurredAt, new Date().toISOString());

    const client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    const uploadedFile = await uploadVideoForGemini({
      client,
      buffer: request.file.buffer,
      mimeType: request.file.mimetype || 'video/quicktime',
      originalName: request.file.originalname,
    });

    const prompt = buildAnalysisPrompt({
      activityGroupName,
      title,
      notes,
      occurredAt,
      fileName: request.file.originalname,
    });

    const result = await withTimeout(
      client.models.generateContent({
        model,
        contents: [
          createPartFromUri(uploadedFile.uri ?? '', uploadedFile.mimeType ?? request.file.mimetype),
          prompt,
        ],
        config: {
          maxOutputTokens,
          responseMimeType: 'application/json',
          responseSchema: analysisResponseSchema,
        },
      }),
      requestTimeoutMs,
    );

    const analysis = parseAnalysis(result.text ?? '');
    dailyUsage.set(usageKey, (dailyUsage.get(usageKey) ?? 0) + 1);

    response.json({
      id: `analysis-${Date.now()}`,
      sessionId,
      status: 'completed',
      summary: analysis.summary,
      highlights: analysis.highlights,
      highlightScenes: analysis.highlightScenes,
      suggestions: analysis.suggestions,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Analysis failed.';
    console.error('Analysis request failed:', message);

    response.status(500).json({
      error: message,
    });
  }
});

app.listen(port, () => {
  console.log(`Action Sports Journal analysis server listening on ${port}`);
});

function getField(value: unknown, fallback: string) {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function readNumberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);

  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function rateLimit(
  request: express.Request,
  response: express.Response,
  next: express.NextFunction,
) {
  const key = request.ip ?? 'unknown';
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, {
      count: 1,
      resetAt: now + rateLimitWindowMs,
    });
    next();
    return;
  }

  if (bucket.count >= rateLimitMaxRequests) {
    response.status(429).json({
      error: 'Too many requests. Try again shortly.',
    });
    return;
  }

  bucket.count += 1;
  next();
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function uploadVideoForGemini({
  client,
  buffer,
  mimeType,
  originalName,
}: {
  client: GoogleGenAI;
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}) {
  const tempDir = await mkdtemp(join(tmpdir(), 'asj-video-'));
  const filePath = join(tempDir, originalName || `session-video${extensionForMimeType(mimeType)}`);

  try {
    await writeFile(filePath, buffer);

    const uploadedFile = await client.files.upload({
      file: filePath,
      config: {
        displayName: originalName,
        mimeType,
      },
    });

    if (!uploadedFile.name) {
      throw new Error('Gemini did not return a file name for the uploaded video.');
    }

    const activeFile = await waitForGeminiFileActive(client, uploadedFile.name);

    if (!activeFile.uri) {
      throw new Error('Gemini did not return a file URI for the uploaded video.');
    }

    return activeFile;
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

async function waitForGeminiFileActive(client: GoogleGenAI, name: string) {
  const deadline = Date.now() + fileProcessingTimeoutMs;

  while (Date.now() < deadline) {
    const file = await client.files.get({ name });

    if (file.state === 'ACTIVE') {
      return file;
    }

    if (file.state === 'FAILED') {
      throw new Error(
        `Gemini video processing failed: ${file.error?.message ?? 'unknown error'}`,
      );
    }

    await sleep(fileProcessingPollMs);
  }

  throw new Error('Gemini video processing timed out before the file became ACTIVE.');
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function extensionForMimeType(mimeType: string) {
  if (mimeType === 'video/mp4') {
    return '.mp4';
  }

  if (mimeType === 'video/x-m4v') {
    return '.m4v';
  }

  return '.mov';
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new Error('Gemini analysis timed out.'));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function buildAnalysisPrompt({
  activityGroupName,
  title,
  notes,
  occurredAt,
  fileName,
}: {
  activityGroupName: string;
  title: string;
  notes: string;
  occurredAt: string;
  fileName: string;
}) {
  return [
    '당신은 액션스포츠 코치이자 영상 분석가입니다.',
    '업로드된 세션 영상을 보고 한국어로 짧고 실용적인 피드백을 작성하세요.',
    '개발 비용을 아끼기 위해 답변은 짧게 유지하세요.',
    '영상에서 하이라이트 장면은 임의로 고정하지 말고, 실제로 눈에 띄는 장면을 기준으로 고르세요.',
    'timestampLabel은 영상 안에서 확인 가능한 대략적인 시점으로 작성하세요. 확신이 낮으면 "확인 필요"라고 작성하세요.',
    'imageUri는 서버에서 아직 캡쳐 이미지를 만들지 않으므로 항상 null로 두세요.',
    '',
    `종목: ${activityGroupName}`,
    `세션 제목: ${title}`,
    `세션 메모: ${notes || '없음'}`,
    `발생 시각: ${occurredAt}`,
    `파일명: ${fileName}`,
    '',
    '출력 분량 제한:',
    '- summary: 2문장 이내',
    '- highlights: 최대 3개',
    '- highlightScenes: 최대 2개',
    '- suggestions: 최대 3개',
  ].join('\n');
}

type GeminiAnalysisPayload = {
  summary: string;
  highlights: string[];
  highlightScenes: Array<{
    id: string;
    timestampLabel: string;
    title: string;
    description: string;
    imageUri: string | null;
  }>;
  suggestions: string[];
};

function parseAnalysis(outputText: string) {
  let parsed: GeminiAnalysisPayload;

  try {
    parsed = JSON.parse(extractJsonObject(outputText)) as GeminiAnalysisPayload;
  } catch (error) {
    console.error('Gemini returned invalid JSON:', outputText.slice(0, 1000));

    return {
      summary: fallbackSummary(outputText),
      highlights: ['영상 분석 응답을 받았지만 JSON 형식이 깨져 간단 요약으로 표시합니다.'],
      highlightScenes: [],
      suggestions: ['다시 분석을 실행하거나, 더 짧은 영상을 사용해 보세요.'],
    };
  }

  return normalizeAnalysis(parsed);
}

function extractJsonObject(outputText: string) {
  const trimmed = outputText.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const jsonText = fencedMatch?.[1]?.trim() ?? trimmed;
  const start = jsonText.indexOf('{');
  const end = jsonText.lastIndexOf('}');

  if (start === -1 || end === -1 || end <= start) {
    return jsonText;
  }

  return jsonText.slice(start, end + 1);
}

function normalizeAnalysis(parsed: Partial<GeminiAnalysisPayload>) {
  const highlightScenes = Array.isArray(parsed.highlightScenes)
    ? parsed.highlightScenes
        .filter((scene) => scene && typeof scene === 'object')
        .map((scene, index) => ({
          id: typeof scene.id === 'string' ? scene.id : `scene-${index + 1}`,
          timestampLabel:
            typeof scene.timestampLabel === 'string' ? scene.timestampLabel : '확인 필요',
          title: typeof scene.title === 'string' ? scene.title : '하이라이트',
          description:
            typeof scene.description === 'string'
              ? scene.description
              : '영상에서 확인된 장면입니다.',
          imageUri: scene.imageUri ?? undefined,
        }))
    : [];

  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary : '영상 분석 결과를 받았습니다.',
    highlights: normalizeStringArray(parsed.highlights, [
      '영상에서 주요 움직임을 확인했습니다.',
    ]),
    highlightScenes,
    suggestions: normalizeStringArray(parsed.suggestions, [
      '같은 구간을 한 번 더 촬영해 비교해 보세요.',
    ]),
  };
}

function normalizeStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const strings = value.filter((item): item is string => typeof item === 'string');

  return strings.length > 0 ? strings : fallback;
}

function fallbackSummary(outputText: string) {
  const normalized = outputText.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return '영상 분석 응답을 받았지만 표시할 수 있는 텍스트가 비어 있습니다.';
  }

  return normalized.length > 220 ? `${normalized.slice(0, 220)}...` : normalized;
}

const analysisResponseSchema = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    highlights: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    highlightScenes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          timestampLabel: { type: Type.STRING },
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          imageUri: { type: Type.STRING, nullable: true },
        },
        required: ['id', 'timestampLabel', 'title', 'description', 'imageUri'],
      },
    },
    suggestions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: ['summary', 'highlights', 'highlightScenes', 'suggestions'],
};
