import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import { createPartFromUri, GoogleGenAI, Type } from '@google/genai';
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
const geminiModel = process.env.GEMINI_ANALYSIS_MODEL ?? 'gemini-3.5-flash';
const openAiModel = process.env.OPENAI_ANALYSIS_MODEL ?? 'gpt-5.5';
const geminiMaxVideoBytes = readNumberEnv('MAX_VIDEO_MB', 20) * 1024 * 1024;
const openAiMaxVideoBytes = readNumberEnv('OPENAI_MAX_VIDEO_MB', 50) * 1024 * 1024;
const uploadMaxVideoBytes = Math.max(geminiMaxVideoBytes, openAiMaxVideoBytes);
const dailyAnalysisLimit = readNumberEnv('DAILY_ANALYSIS_LIMIT', 3);
const rateLimitWindowMs = readNumberEnv('RATE_LIMIT_WINDOW_MS', 60_000);
const rateLimitMaxRequests = readNumberEnv('RATE_LIMIT_MAX_REQUESTS', 3);
const geminiMaxOutputTokens = readNumberEnv('GEMINI_MAX_OUTPUT_TOKENS', 600);
const geminiRequestTimeoutMs = readNumberEnv('GEMINI_REQUEST_TIMEOUT_MS', 120_000);
const geminiFileProcessingTimeoutMs = readNumberEnv(
  'GEMINI_FILE_PROCESSING_TIMEOUT_MS',
  120_000,
);
const geminiFileProcessingPollMs = readNumberEnv('GEMINI_FILE_PROCESSING_POLL_MS', 2_000);
const openAiMaxOutputTokens = readNumberEnv('OPENAI_MAX_OUTPUT_TOKENS', 3_200);
const openAiRequestTimeoutMs = readNumberEnv('OPENAI_REQUEST_TIMEOUT_MS', 240_000);
const openAiFrameCount = readNumberEnv('OPENAI_VIDEO_FRAME_COUNT', 18);
const openAiFrameWidth = readNumberEnv('OPENAI_VIDEO_FRAME_WIDTH', 1536);
const openAiReasoningEffort = process.env.OPENAI_REASONING_EFFORT ?? 'xhigh';
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
    fileSize: uploadMaxVideoBytes,
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
    primaryProvider: 'gemini',
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    geminiModel,
    openAiBenchmark: {
      configured: Boolean(process.env.OPENAI_API_KEY),
      model: openAiModel,
      endpoint: '/api/benchmarks/openai-wakeboard-video',
    },
    spendPolicy: 'development budget target: under KRW 10,000/month',
    limits: {
      geminiMaxVideoMb: Math.round(geminiMaxVideoBytes / 1024 / 1024),
      openAiMaxVideoMb: Math.round(openAiMaxVideoBytes / 1024 / 1024),
      dailyAnalysisLimit,
      rateLimitWindowMs,
      rateLimitMaxRequests,
      geminiMaxOutputTokens,
      geminiRequestTimeoutMs,
      openAiMaxOutputTokens,
      openAiRequestTimeoutMs,
      openAiFrameCount,
      openAiFrameWidth,
      openAiReasoningEffort,
    },
  });
});

app.post('/api/analyze-session-video', upload.single('video'), async (request, response) => {
  try {
    const usageKey = todayKey('gemini');

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

    if (request.file.size > geminiMaxVideoBytes) {
      response.status(413).json({
        error: `Video is too large. Max size is ${Math.round(geminiMaxVideoBytes / 1024 / 1024)}MB.`,
      });
      return;
    }

    const metadata = getSessionMetadata(request);
    const client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    const uploadedFile = await uploadVideoForGemini({
      client,
      buffer: request.file.buffer,
      mimeType: request.file.mimetype || 'video/quicktime',
      originalName: request.file.originalname,
    });

    const prompt = buildGeminiAnalysisPrompt({
      ...metadata,
      fileName: request.file.originalname,
    });

    const result = await withTimeout(
      client.models.generateContent({
        model: geminiModel,
        contents: [
          createPartFromUri(uploadedFile.uri ?? '', uploadedFile.mimeType ?? request.file.mimetype),
          prompt,
        ],
        config: {
          maxOutputTokens: geminiMaxOutputTokens,
          responseMimeType: 'application/json',
          responseSchema: geminiAnalysisResponseSchema,
        },
      }),
      geminiRequestTimeoutMs,
      'Gemini analysis timed out.',
    );

    const analysis = parseGeminiAnalysis(result.text ?? '');
    dailyUsage.set(usageKey, (dailyUsage.get(usageKey) ?? 0) + 1);

    response.json({
      id: `analysis-${Date.now()}`,
      sessionId: metadata.sessionId,
      status: 'completed',
      summary: analysis.summary,
      highlights: analysis.highlights,
      highlightScenes: analysis.highlightScenes,
      suggestions: analysis.suggestions,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Analysis failed.';
    console.error('Gemini analysis request failed:', message);

    response.status(500).json({
      error: message,
    });
  }
});

app.post(
  '/api/benchmarks/openai-wakeboard-video',
  upload.single('video'),
  async (request, response) => {
    try {
      const usageKey = todayKey('openai');

      if ((dailyUsage.get(usageKey) ?? 0) >= dailyAnalysisLimit) {
        response.status(429).json({
          error:
            'Daily benchmark limit reached. This limit keeps development API spend under control.',
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

      if (request.file.size > openAiMaxVideoBytes) {
        response.status(413).json({
          error: `Video is too large. Max size is ${Math.round(openAiMaxVideoBytes / 1024 / 1024)}MB.`,
        });
        return;
      }

      const metadata = getSessionMetadata(request);
      const frames = await extractVideoFrames({
        buffer: request.file.buffer,
        mimeType: request.file.mimetype || 'video/quicktime',
        originalName: request.file.originalname,
      });

      const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        timeout: openAiRequestTimeoutMs,
      });

      const prompt = buildOpenAiBenchmarkPrompt({
        ...metadata,
        fileName: request.file.originalname,
        sampledFrames: frames.length,
      });

      const result = await withTimeout(
        client.responses.create({
          model: openAiModel,
          instructions: buildOpenAiCoachInstructions(),
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
          max_output_tokens: openAiMaxOutputTokens,
          reasoning: {
            effort: openAiReasoningEffort as
              | 'none'
              | 'minimal'
              | 'low'
              | 'medium'
              | 'high'
              | 'xhigh',
            summary: 'concise',
          },
          store: false,
          text: {
            verbosity: 'high',
            format: {
              type: 'json_schema',
              name: 'action_sports_journal_openai_wakeboard_benchmark',
              strict: true,
              schema: openAiBenchmarkResponseSchema,
            },
          },
        }),
        openAiRequestTimeoutMs,
        'OpenAI benchmark timed out.',
      );

      const analysis = parseOpenAiBenchmark(result.output_text ?? '');
      dailyUsage.set(usageKey, (dailyUsage.get(usageKey) ?? 0) + 1);

      const responseBody = {
        id: `openai-benchmark-${Date.now()}`,
        sessionId: metadata.sessionId,
        status: 'completed',
        provider: 'openai',
        model: openAiModel,
        humanReadableAnalysis: analysis.humanReadableAnalysis,
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
          sampledFrames: frames.length,
          frameTimestamps: frames.map((frame) => frame.timestampLabel),
        },
      };

      await writeOpenAiBenchmarkArtifact({
        metadata,
        fileName: request.file.originalname,
        videoMimeType: request.file.mimetype,
        videoBytes: request.file.size,
        responseBody,
        rawOutputText: result.output_text ?? '',
      });

      response.json(responseBody);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Benchmark failed.';
      console.error('OpenAI benchmark request failed:', message);

      response.status(500).json({
        error: message,
      });
    }
  },
);

app.listen(port, () => {
  console.log(`Action Sports Journal analysis server listening on ${port}`);
});

type SessionMetadata = {
  sessionId: string;
  activityGroupName: string;
  title: string;
  notes: string;
  occurredAt: string;
};

function getSessionMetadata(request: express.Request): SessionMetadata {
  return {
    sessionId: getField(request.body.sessionId, 'session-local'),
    activityGroupName: getField(request.body.activityGroupName, '웨이크보드'),
    title: getField(request.body.title, '웨이크보드 세션'),
    notes: getField(request.body.notes, ''),
    occurredAt: getField(request.body.occurredAt, new Date().toISOString()),
  };
}

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

function todayKey(provider: 'gemini' | 'openai') {
  return `${provider}-${new Date().toISOString().slice(0, 10)}`;
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
  const tempDir = await mkdtemp(join(tmpdir(), 'asj-gemini-video-'));
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
  const deadline = Date.now() + geminiFileProcessingTimeoutMs;

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

    await sleep(geminiFileProcessingPollMs);
  }

  throw new Error('Gemini video processing timed out before the file became ACTIVE.');
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
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
        ? Math.min(openAiFrameCount / durationSeconds, 2)
        : 1;

    await execFileAsync(ffmpegPath ?? 'ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      filePath,
      '-vf',
      `fps=${fps.toFixed(4)},scale=${openAiFrameWidth}:-1`,
      '-frames:v',
      String(openAiFrameCount),
      '-q:v',
      '2',
      framePattern,
    ]);

    const frameFiles = (await readdir(tempDir))
      .filter((fileName) => fileName.startsWith('frame-') && fileName.endsWith('.jpg'))
      .sort()
      .slice(0, openAiFrameCount);

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

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(timeoutMessage));
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

async function writeOpenAiBenchmarkArtifact({
  metadata,
  fileName,
  videoMimeType,
  videoBytes,
  responseBody,
  rawOutputText,
}: {
  metadata: SessionMetadata;
  fileName: string;
  videoMimeType: string;
  videoBytes: number;
  responseBody: Record<string, unknown>;
  rawOutputText: string;
}) {
  await mkdir(benchmarkArtifactDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeSessionId = metadata.sessionId.replace(/[^a-zA-Z0-9_-]/g, '-');
  const artifactPath = join(
    benchmarkArtifactDir,
    `${timestamp}-${safeSessionId || 'session'}-openai-benchmark.json`,
  );

  await writeFile(
    artifactPath,
    JSON.stringify(
      {
        benchmark: {
          provider: 'openai',
          model: openAiModel,
          createdAt: new Date().toISOString(),
          frameCount: openAiFrameCount,
          frameWidth: openAiFrameWidth,
          maxOutputTokens: openAiMaxOutputTokens,
          reasoningEffort: openAiReasoningEffort,
        },
        session: metadata,
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

function buildGeminiAnalysisPrompt({
  activityGroupName,
  title,
  notes,
  occurredAt,
  fileName,
}: SessionMetadata & {
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

function buildOpenAiCoachInstructions() {
  return [
    'You are a world-class wakeboard coach, action-sports biomechanics analyst, and elite video-review operator.',
    'Your job is to reproduce the quality of an expert ChatGPT coaching session through the OpenAI API.',
    'This is not a generic video summary. Produce detailed wakeboard coaching feedback.',
    'Analyze only visible evidence from sampled frames. Separate Observation, Pattern Recognition, and Inference.',
    'Never present uncertain conclusions as facts. When evidence is incomplete, say so and lower confidence.',
    'Look for repeated movement patterns across frames: handle path, line tension, edge angle, hip position, shoulder rotation, knee flexion, board direction, takeoff timing, landing control, and recovery.',
    'Use slow, careful reasoning internally, but output only the requested JSON.',
    'Write in Korean for a serious amateur wakeboarder who wants immediately usable coaching.',
    'Avoid generic praise. Every suggestion must connect to a visible observation, pattern, inference, or stated uncertainty.',
  ].join('\n');
}

function buildOpenAiBenchmarkPrompt({
  activityGroupName,
  title,
  notes,
  occurredAt,
  fileName,
  sampledFrames,
}: SessionMetadata & {
  fileName: string;
  sampledFrames: number;
}) {
  return [
    '다음은 Action Sports Journal의 같은 웨이크보드 비교 영상에서 추출한 연속 프레임입니다.',
    '목표는 이전 OpenAI 결과가 프롬프트 품질, 모델 선택, 비디오 입력 구현, API 사용 방식 중 무엇에 의해 제한됐는지 판단하기 위한 GPT-5.5 벤치마크입니다.',
    '일반 영상 요약을 하지 마세요. 세계 최상급 웨이크보드 코치가 라이더에게 직접 피드백하듯 분석하세요.',
    '',
    `종목: ${activityGroupName}`,
    `세션 제목: ${title}`,
    `세션 메모: ${notes || '없음'}`,
    `발생 시각: ${occurredAt}`,
    `파일명: ${fileName}`,
    `샘플 프레임 수: ${sampledFrames}`,
    '',
    '분석 규칙:',
    '1. Observation: 프레임에서 직접 보이는 사실만 적으세요.',
    '2. Pattern Recognition: 여러 프레임에 반복되는 움직임 패턴만 적으세요.',
    '3. Inference: 관찰/패턴이 라이딩 결과에 주는 영향을 추론하되 근거를 연결하세요.',
    '4. Confidence: 각 항목에 high/medium/low 확신도를 넣고 이유를 포함하세요.',
    '5. Self-critique: 샘플링, 카메라 각도, 가림, 해상도, 누락 프레임 때문에 분석이 약해지는 부분을 스스로 지적하세요.',
    '6. Uncertainty: 확실하지 않은 내용은 사실처럼 쓰지 말고 "가능성", "확인 필요"로 표현하세요.',
    '',
    '웨이크보드 코칭 체크리스트:',
    '- 어프로치 라인과 엣지 각도',
    '- 핸들 위치: 엉덩이/앞골반 근처 유지 여부, 팔이 펴지는 타이밍',
    '- 상체/골반/무릎 정렬과 무게중심',
    '- 시선 방향과 회전 선행 여부',
    '- 팝 또는 웨이크 통과 시점의 압력 유지',
    '- 착지 또는 회복 구간의 보드 방향과 라인 텐션',
    '',
    '출력 요구:',
    '- 모든 텍스트는 한국어',
    '- humanReadableAnalysis: 사람이 바로 읽을 수 있는 코칭 리포트. Observation, Pattern Recognition, Inference, Coaching Plan, Self-critique 섹션을 포함하세요.',
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

type OpenAiBenchmarkPayload = GeminiAnalysisPayload & {
  humanReadableAnalysis: string;
  observations: Array<{
    timestampLabel: string;
    evidence: string;
    coachingRelevance: string;
    confidence: 'high' | 'medium' | 'low';
    confidenceReason: string;
  }>;
  patternRecognition: Array<{
    pattern: string;
    evidence: string;
    impact: string;
    confidence: 'high' | 'medium' | 'low';
    confidenceReason: string;
  }>;
  inferences: Array<{
    inference: string;
    evidence: string;
    coachingImplication: string;
    confidence: 'high' | 'medium' | 'low';
    confidenceReason: string;
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

function parseGeminiAnalysis(outputText: string) {
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

  return normalizeGeminiAnalysis(parsed);
}

function parseOpenAiBenchmark(outputText: string) {
  let parsed: OpenAiBenchmarkPayload;

  try {
    parsed = JSON.parse(extractJsonObject(outputText)) as OpenAiBenchmarkPayload;
  } catch (error) {
    console.error('OpenAI returned invalid JSON:', outputText.slice(0, 1000));

    return {
      humanReadableAnalysis: fallbackSummary(outputText),
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

  return normalizeOpenAiBenchmark(parsed);
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

function normalizeGeminiAnalysis(parsed: Partial<GeminiAnalysisPayload>) {
  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary : '영상 분석 결과를 받았습니다.',
    highlights: normalizeStringArray(parsed.highlights, [
      '영상에서 주요 움직임을 확인했습니다.',
    ]),
    highlightScenes: normalizeHighlightScenes(parsed.highlightScenes),
    suggestions: normalizeStringArray(parsed.suggestions, [
      '같은 구간을 한 번 더 촬영해 비교해 보세요.',
    ]),
  };
}

function normalizeOpenAiBenchmark(parsed: Partial<OpenAiBenchmarkPayload>) {
  return {
    ...normalizeGeminiAnalysis(parsed),
    humanReadableAnalysis:
      typeof parsed.humanReadableAnalysis === 'string'
        ? parsed.humanReadableAnalysis
        : '구조화된 코칭 리포트가 제공되지 않았습니다.',
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

function normalizeHighlightScenes(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((scene) => scene && typeof scene === 'object')
        .map((scene, index) => {
          const candidate = scene as Partial<GeminiAnalysisPayload['highlightScenes'][number]>;

          return {
            id: typeof candidate.id === 'string' ? candidate.id : `scene-${index + 1}`,
            timestampLabel:
              typeof candidate.timestampLabel === 'string'
                ? candidate.timestampLabel
                : '확인 필요',
            title: typeof candidate.title === 'string' ? candidate.title : '하이라이트',
            description:
              typeof candidate.description === 'string'
                ? candidate.description
                : '영상에서 확인된 장면입니다.',
            imageUri: candidate.imageUri ?? undefined,
          };
        })
    : [];
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

const geminiAnalysisResponseSchema = {
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

const openAiBenchmarkResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    humanReadableAnalysis: { type: 'string' },
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
          confidenceReason: { type: 'string' },
        },
        required: [
          'timestampLabel',
          'evidence',
          'coachingRelevance',
          'confidence',
          'confidenceReason',
        ],
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
          confidenceReason: { type: 'string' },
        },
        required: ['pattern', 'evidence', 'impact', 'confidence', 'confidenceReason'],
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
          confidenceReason: { type: 'string' },
        },
        required: [
          'inference',
          'evidence',
          'coachingImplication',
          'confidence',
          'confidenceReason',
        ],
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
    'humanReadableAnalysis',
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
