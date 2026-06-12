import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import ffmpegPath from 'ffmpeg-static';
import multer from 'multer';
import OpenAI from 'openai';

dotenv.config({ path: '.env.local' });
dotenv.config();

const execFileAsync = promisify(execFile);

const port = Number(process.env.PORT ?? 8787);
const provider = 'openai';
const model = process.env.OPENAI_ANALYSIS_MODEL ?? 'gpt-5.5';
const maxVideoBytes = readNumberEnv('MAX_VIDEO_MB', 50) * 1024 * 1024;
const dailyAnalysisLimit = readNumberEnv('DAILY_ANALYSIS_LIMIT', 3);
const rateLimitWindowMs = readNumberEnv('RATE_LIMIT_WINDOW_MS', 60_000);
const rateLimitMaxRequests = readNumberEnv('RATE_LIMIT_MAX_REQUESTS', 3);
const maxOutputTokens = readNumberEnv('OPENAI_MAX_OUTPUT_TOKENS', 3_200);
const requestTimeoutMs = readNumberEnv('OPENAI_REQUEST_TIMEOUT_MS', 240_000);
const frameCount = readNumberEnv('OPENAI_VIDEO_FRAME_COUNT', 18);
const frameWidth = readNumberEnv('OPENAI_VIDEO_FRAME_WIDTH', 1536);
const reasoningEffort = process.env.OPENAI_REASONING_EFFORT ?? 'xhigh';
const benchmarkArtifactDir =
  process.env.OPENAI_BENCHMARK_ARTIFACT_DIR ?? 'dev-artifacts/openai-benchmarks';
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
    provider,
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    model,
    spendPolicy: 'development benchmark: keep usage intentional and limited',
    limits: {
      maxVideoMb: Math.round(maxVideoBytes / 1024 / 1024),
      dailyAnalysisLimit,
      rateLimitWindowMs,
      rateLimitMaxRequests,
      maxOutputTokens,
      requestTimeoutMs,
      frameCount,
      frameWidth,
      reasoningEffort,
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

    if (!ffmpegPath) {
      response.status(500).json({
        error: 'ffmpeg-static did not provide an ffmpeg binary path.',
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
    const activityGroupName = getField(request.body.activityGroupName, '웨이크보드');
    const title = getField(request.body.title, '웨이크보드 세션');
    const notes = getField(request.body.notes, '');
    const occurredAt = getField(request.body.occurredAt, new Date().toISOString());

    const frames = await extractVideoFrames({
      buffer: request.file.buffer,
      mimeType: request.file.mimetype || 'video/quicktime',
      originalName: request.file.originalname,
    });

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: requestTimeoutMs,
    });

    const prompt = buildAnalysisPrompt({
      activityGroupName,
      title,
      notes,
      occurredAt,
      fileName: request.file.originalname,
      sampledFrames: frames.length,
    });

    const result = await withTimeout(
      client.responses.create({
        model,
        instructions: buildCoachInstructions(),
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: prompt },
              ...frames.flatMap((frame, index) => [
                {
                  type: 'input_text' as const,
                  text: `Frame ${index + 1}: approximately ${frame.timestampLabel} after video start.`,
                },
                {
                  type: 'input_image' as const,
                  image_url: frame.dataUrl,
                  detail: 'high' as const,
                },
              ]),
            ],
          },
        ],
        max_output_tokens: maxOutputTokens,
        reasoning: {
          effort: reasoningEffort as 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh',
          summary: 'concise',
        },
        store: false,
        text: {
          verbosity: 'high',
          format: {
            type: 'json_schema',
            name: 'action_sports_journal_analysis',
            strict: true,
            schema: openAiAnalysisResponseSchema,
          },
        },
      }),
      requestTimeoutMs,
    );

    const analysis = parseAnalysis(result.output_text ?? '');
    dailyUsage.set(usageKey, (dailyUsage.get(usageKey) ?? 0) + 1);

    const responseBody = {
      id: `analysis-${Date.now()}`,
      sessionId,
      status: 'completed',
      summary: analysis.summary,
      highlights: analysis.highlights,
      highlightScenes: analysis.highlightScenes,
      suggestions: analysis.suggestions,
      observations: analysis.observations,
      patternRecognition: analysis.patternRecognition,
      inferences: analysis.inferences,
      confidence: analysis.confidence,
      selfCritique: analysis.selfCritique,
      createdAt: new Date().toISOString(),
      debug: {
        provider,
        model,
        sampledFrames: frames.length,
        frameTimestamps: frames.map((frame) => frame.timestampLabel),
      },
    };

    await writeBenchmarkArtifact({
      sessionId,
      activityGroupName,
      title,
      notes,
      occurredAt,
      fileName: request.file.originalname,
      videoMimeType: request.file.mimetype,
      videoBytes: request.file.size,
      responseBody,
      rawOutputText: result.output_text ?? '',
    });

    response.json(responseBody);
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

async function writeBenchmarkArtifact({
  sessionId,
  activityGroupName,
  title,
  notes,
  occurredAt,
  fileName,
  videoMimeType,
  videoBytes,
  responseBody,
  rawOutputText,
}: {
  sessionId: string;
  activityGroupName: string;
  title: string;
  notes: string;
  occurredAt: string;
  fileName: string;
  videoMimeType: string;
  videoBytes: number;
  responseBody: Record<string, unknown>;
  rawOutputText: string;
}) {
  await mkdir(benchmarkArtifactDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeSessionId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '-');
  const artifactPath = join(
    benchmarkArtifactDir,
    `${timestamp}-${safeSessionId || 'session'}-openai-benchmark.json`,
  );

  await writeFile(
    artifactPath,
    JSON.stringify(
      {
        benchmark: {
          provider,
          model,
          createdAt: new Date().toISOString(),
          frameCount,
          frameWidth,
          maxOutputTokens,
          reasoningEffort,
        },
        session: {
          sessionId,
          activityGroupName,
          title,
          notes,
          occurredAt,
        },
        video: {
          fileName,
          mimeType: videoMimeType,
          bytes: videoBytes,
        },
        response: responseBody,
        rawOutputText,
      },
      null,
      2,
    ),
  );

  console.log(`Saved OpenAI benchmark artifact: ${artifactPath}`);
}

async function extractVideoFrames({
  buffer,
  mimeType,
  originalName,
}: {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}) {
  const tempDir = await mkdtemp(join(tmpdir(), 'asj-openai-video-'));
  const safeName = basename(originalName || `session-video${extensionForMimeType(mimeType)}`);
  const filePath = join(tempDir, safeName);
  const framePattern = join(tempDir, 'frame-%03d.jpg');

  try {
    await writeFile(filePath, buffer);

    const durationSeconds = await getVideoDurationSeconds(filePath);
    const fps =
      durationSeconds && durationSeconds > 0
        ? Math.min(frameCount / durationSeconds, 2)
        : 1;

    await execFileAsync(ffmpegPath ?? 'ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      filePath,
      '-vf',
      `fps=${fps.toFixed(4)},scale=${frameWidth}:-1`,
      '-frames:v',
      String(frameCount),
      '-q:v',
      '2',
      framePattern,
    ]);

    const frameFiles = (await readdir(tempDir))
      .filter((fileName) => fileName.startsWith('frame-') && fileName.endsWith('.jpg'))
      .sort()
      .slice(0, frameCount);

    if (frameFiles.length === 0) {
      throw new Error('No frames could be extracted from the uploaded video.');
    }

    return Promise.all(
      frameFiles.map(async (fileName, index) => {
        const bytes = await readFile(join(tempDir, fileName));
        const timestampSeconds = durationSeconds
          ? Math.min((durationSeconds / Math.max(frameFiles.length - 1, 1)) * index, durationSeconds)
          : index;

        return {
          dataUrl: `data:image/jpeg;base64,${bytes.toString('base64')}`,
          timestampLabel: formatTimestamp(timestampSeconds),
        };
      }),
    );
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

async function getVideoDurationSeconds(filePath: string) {
  try {
    await execFileAsync(ffmpegPath ?? 'ffmpeg', ['-i', filePath]);
  } catch (error) {
    const stderr =
      typeof error === 'object' && error && 'stderr' in error
        ? String((error as { stderr?: unknown }).stderr)
        : '';
    const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);

    if (!match) {
      return undefined;
    }

    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  }

  return undefined;
}

function formatTimestamp(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
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

function buildCoachInstructions() {
  return [
    'You are a world-class wakeboard coach, action-sports biomechanics analyst, and elite video-review operator.',
    'Your job is to reproduce the quality of an expert ChatGPT coaching session through the OpenAI API.',
    'Analyze only visible evidence from sampled frames. Separate observation from inference.',
    'Use slow, careful reasoning internally, but output only the requested structured JSON.',
    'Look for repeated movement patterns across frames: handle path, line tension, edge angle, hip position, shoulder rotation, knee flexion, board direction, takeoff timing, landing control, and recovery.',
    'When evidence is incomplete, say so explicitly and lower confidence instead of inventing a confident answer.',
    'Write in Korean for a serious amateur wakeboarder who wants immediately usable coaching.',
    'Avoid generic praise. Every suggestion must connect to a visible observation or stated uncertainty.',
  ].join('\n');
}

function buildAnalysisPrompt({
  activityGroupName,
  title,
  notes,
  occurredAt,
  fileName,
  sampledFrames,
}: {
  activityGroupName: string;
  title: string;
  notes: string;
  occurredAt: string;
  fileName: string;
  sampledFrames: number;
}) {
  return [
    '다음은 Action Sports Journal의 세션 영상에서 추출한 연속 프레임입니다.',
    '동일한 웨이크보드 영상에 대해 Gemini 결과와 비교하기 위한 OpenAI GPT-5.5 벤치마크입니다.',
    '세계 최상급 웨이크보드 코치처럼 분석하되, 실제 프레임에서 보이는 내용과 추론을 반드시 분리하세요.',
    '',
    `종목: ${activityGroupName}`,
    `세션 제목: ${title}`,
    `세션 메모: ${notes || '없음'}`,
    `발생 시각: ${occurredAt}`,
    `파일명: ${fileName}`,
    `샘플 프레임 수: ${sampledFrames}`,
    '',
    '분석 프로토콜:',
    '1. Observation: 프레임에서 직접 보이는 사실만 적으세요.',
    '2. Pattern recognition: 여러 프레임에 반복되는 움직임 패턴을 찾으세요.',
    '3. Inference: 그 패턴이 라이딩/트릭 성공률에 주는 영향을 추론하되 근거를 연결하세요.',
    '4. Confidence: 각 판단의 확신도를 high/medium/low로 표시하세요.',
    '5. Self-critique: 샘플링 프레임, 각도, 가림, 해상도 때문에 분석이 약해지는 부분을 스스로 지적하세요.',
    '6. Coaching: 다음 세션에서 바로 실행할 큐와 드릴을 제안하세요.',
    '',
    '웨이크보드 체크리스트:',
    '- 어프로치 라인과 엣지 각도',
    '- 핸들 위치: 엉덩이/앞골반 근처 유지 여부, 팔이 펴지는 타이밍',
    '- 상체/골반/무릎 정렬과 무게중심',
    '- 시선 방향과 회전 선행 여부',
    '- 팝 또는 웨이크 통과 시점의 압력 유지',
    '- 착지 또는 회복 구간의 보드 방향과 라인 텐션',
    '',
    '출력 요구:',
    '- 모든 텍스트는 한국어',
    '- summary: 코치 총평 2~4문장',
    '- highlights: 핵심 관찰/판단 3~5개',
    '- observations: 보이는 사실 4~8개',
    '- patternRecognition: 반복 패턴 2~5개',
    '- inferences: 근거 기반 추론 2~5개',
    '- confidence: 전체 분석 확신도와 이유',
    '- selfCritique: 이 분석의 한계와 다음 촬영 개선점',
    '- highlightScenes: 중요한 장면 최대 4개, timestampLabel은 프레임 기반 대략 시점 또는 "확인 필요"',
    '- suggestions: 다음 세션에서 수행할 구체적 훈련/수정 지시 4~6개',
    '- imageUri는 항상 null',
  ].join('\n');
}

type AnalysisPayload = {
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
  observations: Array<{
    timestampLabel: string;
    evidence: string;
    coachingRelevance: string;
    confidence: 'high' | 'medium' | 'low';
  }>;
  patternRecognition: Array<{
    pattern: string;
    evidence: string;
    impact: string;
    confidence: 'high' | 'medium' | 'low';
  }>;
  inferences: Array<{
    inference: string;
    evidence: string;
    coachingImplication: string;
    confidence: 'high' | 'medium' | 'low';
  }>;
  confidence: {
    level: 'high' | 'medium' | 'low';
    reason: string;
  };
  selfCritique: {
    limitations: string[];
    whatWouldImproveAnalysis: string[];
  };
};

function parseAnalysis(outputText: string) {
  let parsed: AnalysisPayload;

  try {
    parsed = JSON.parse(extractJsonObject(outputText)) as AnalysisPayload;
  } catch (error) {
    console.error('OpenAI returned invalid JSON:', outputText.slice(0, 1000));

    return {
      summary: fallbackSummary(outputText),
      highlights: ['영상 분석 응답을 받았지만 JSON 형식이 깨져 간단 요약으로 표시합니다.'],
      highlightScenes: [],
      suggestions: ['다시 분석을 실행하거나, 더 짧은 영상을 사용해 보세요.'],
      observations: [],
      patternRecognition: [],
      inferences: [],
      confidence: {
        level: 'low' as const,
        reason: 'JSON 파싱 실패로 구조화된 확신도를 산출할 수 없습니다.',
      },
      selfCritique: {
        limitations: ['모델 응답이 JSON 형식을 지키지 않았습니다.'],
        whatWouldImproveAnalysis: ['동일 영상으로 다시 분석을 실행하세요.'],
      },
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

function normalizeAnalysis(parsed: Partial<AnalysisPayload>) {
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
    observations: normalizeObjectArray(parsed.observations),
    patternRecognition: normalizeObjectArray(parsed.patternRecognition),
    inferences: normalizeObjectArray(parsed.inferences),
    confidence:
      parsed.confidence && typeof parsed.confidence === 'object'
        ? parsed.confidence
        : {
            level: 'low' as const,
            reason: '모델이 전체 확신도를 제공하지 않았습니다.',
          },
    selfCritique:
      parsed.selfCritique && typeof parsed.selfCritique === 'object'
        ? parsed.selfCritique
        : {
            limitations: ['모델이 자기비판 정보를 제공하지 않았습니다.'],
            whatWouldImproveAnalysis: ['더 긴 클립과 측면 각도 영상을 추가하세요.'],
          },
  };
}

function normalizeObjectArray<T>(value: T[] | undefined) {
  return Array.isArray(value) ? value : [];
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

const openAiAnalysisResponseSchema = {
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
          imageUri: {
            anyOf: [{ type: 'string' }, { type: 'null' }],
          },
        },
        required: ['id', 'timestampLabel', 'title', 'description', 'imageUri'],
      },
    },
    suggestions: {
      type: 'array',
      items: { type: 'string' },
    },
    observations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          timestampLabel: { type: 'string' },
          evidence: { type: 'string' },
          coachingRelevance: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['timestampLabel', 'evidence', 'coachingRelevance', 'confidence'],
      },
    },
    patternRecognition: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          pattern: { type: 'string' },
          evidence: { type: 'string' },
          impact: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['pattern', 'evidence', 'impact', 'confidence'],
      },
    },
    inferences: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          inference: { type: 'string' },
          evidence: { type: 'string' },
          coachingImplication: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['inference', 'evidence', 'coachingImplication', 'confidence'],
      },
    },
    confidence: {
      type: 'object',
      additionalProperties: false,
      properties: {
        level: { type: 'string', enum: ['high', 'medium', 'low'] },
        reason: { type: 'string' },
      },
      required: ['level', 'reason'],
    },
    selfCritique: {
      type: 'object',
      additionalProperties: false,
      properties: {
        limitations: {
          type: 'array',
          items: { type: 'string' },
        },
        whatWouldImproveAnalysis: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['limitations', 'whatWouldImproveAnalysis'],
    },
  },
  required: [
    'summary',
    'highlights',
    'highlightScenes',
    'suggestions',
    'observations',
    'patternRecognition',
    'inferences',
    'confidence',
    'selfCritique',
  ],
};
