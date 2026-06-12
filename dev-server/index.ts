import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import multer from 'multer';
import OpenAI from 'openai';

dotenv.config({ path: '.env.local' });
dotenv.config();

const port = Number(process.env.PORT ?? 8787);
const model = process.env.OPENAI_ANALYSIS_MODEL ?? 'gpt-5.4-mini';
const maxVideoBytes = readNumberEnv('MAX_VIDEO_MB', 20) * 1024 * 1024;
const dailyAnalysisLimit = readNumberEnv('DAILY_ANALYSIS_LIMIT', 3);
const rateLimitWindowMs = readNumberEnv('RATE_LIMIT_WINDOW_MS', 60_000);
const rateLimitMaxRequests = readNumberEnv('RATE_LIMIT_MAX_REQUESTS', 3);
const maxOutputTokens = readNumberEnv('OPENAI_MAX_OUTPUT_TOKENS', 600);
const requestTimeoutMs = readNumberEnv('OPENAI_REQUEST_TIMEOUT_MS', 120_000);
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
    openAiConfigured: Boolean(process.env.OPENAI_API_KEY),
    model,
    spendPolicy: 'development budget target: under KRW 10,000/month',
    limits: {
      maxVideoMb: Math.round(maxVideoBytes / 1024 / 1024),
      dailyAnalysisLimit,
      rateLimitWindowMs,
      rateLimitMaxRequests,
      maxOutputTokens,
      requestTimeoutMs,
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

    if (!process.env.OPENAI_API_KEY) {
      response.status(500).json({
        error: 'OPENAI_API_KEY is not configured on the server.',
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

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const uploadedFile = await client.files.create({
      file: new File([new Uint8Array(request.file.buffer)], request.file.originalname, {
        type: request.file.mimetype || 'video/quicktime',
      }),
      purpose: 'vision',
    });

    const prompt = buildAnalysisPrompt({
      activityGroupName,
      title,
      notes,
      occurredAt,
      fileName: request.file.originalname,
    });

    const result = await withTimeout(
      client.responses.create({
        model,
        max_output_tokens: maxOutputTokens,
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: prompt,
              },
              {
                type: 'input_file',
                file_id: uploadedFile.id,
              },
            ],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'session_video_analysis',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                summary: { type: 'string' },
                highlights: {
                  type: 'array',
                  items: { type: 'string' },
                },
                highlightScenes: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      id: { type: 'string' },
                      timestampLabel: { type: 'string' },
                      title: { type: 'string' },
                      description: { type: 'string' },
                      imageUri: { type: ['string', 'null'] },
                    },
                    required: [
                      'id',
                      'timestampLabel',
                      'title',
                      'description',
                      'imageUri',
                    ],
                  },
                },
                suggestions: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
              required: ['summary', 'highlights', 'highlightScenes', 'suggestions'],
            },
          },
        },
      }),
      requestTimeoutMs,
    );

    const analysis = parseAnalysis(result.output_text);
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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new Error('OpenAI analysis timed out.'));
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

function parseAnalysis(outputText: string) {
  const parsed = JSON.parse(outputText) as {
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

  return {
    summary: parsed.summary,
    highlights: parsed.highlights,
    highlightScenes: parsed.highlightScenes.map((scene) => ({
      ...scene,
      imageUri: scene.imageUri ?? undefined,
    })),
    suggestions: parsed.suggestions,
  };
}
