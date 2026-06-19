import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { createPartFromUri, GoogleGenAI, Type } from "@google/genai";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import ffmpegPath from "ffmpeg-static";
import multer from "multer";
import OpenAI from "openai";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { buildCoachingInsightContext } from "../src/services/knowledge/coachingInsightContext";
import { buildCoachingInsightPromptSection } from "../src/services/knowledge/coachingPromptContext";
import { applyWakeboardKnowledgeRules } from "../src/services/knowledge/wakeboardKnowledgeRules";
import type {
  CandidateTrace,
  CoachingInsightContext,
  GeminiEvidenceResult,
} from "../src/types";
import {
  getMockAiFixture,
  stringifyMockAiPayload,
} from "./mockAiFixtures";

dotenv.config({ path: ".env.local" });
dotenv.config();

const execFileAsync = promisify(execFile);

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 8787);
const geminiModel = process.env.GEMINI_ANALYSIS_MODEL ?? "gemini-3.5-flash";
const geminiFallbackModel =
  process.env.GEMINI_FALLBACK_MODEL ?? "gemini-2.5-flash-lite";
const openAiModel = process.env.OPENAI_ANALYSIS_MODEL ?? "gpt-5.5";
const geminiMaxVideoBytes = readNumberEnv("MAX_VIDEO_MB", 20) * 1024 * 1024;
const openAiMaxVideoBytes =
  readNumberEnv("OPENAI_MAX_VIDEO_MB", 50) * 1024 * 1024;
const uploadMaxVideoBytes = Math.max(geminiMaxVideoBytes, openAiMaxVideoBytes);
const dailyUsageLimitEnabled = process.env.NODE_ENV === "production";
const dailyAnalysisLimit = Math.max(
  readNumberEnv("DAILY_ANALYSIS_LIMIT", 30),
  20,
);
const rateLimitWindowMs = readNumberEnv("RATE_LIMIT_WINDOW_MS", 60_000);
const rateLimitMaxRequests = readNumberEnv("RATE_LIMIT_MAX_REQUESTS", 3);
const geminiMaxOutputTokens = readNumberEnv("GEMINI_MAX_OUTPUT_TOKENS", 1_200);
const geminiEvidenceMaxOutputTokens = readNumberEnv(
  "GEMINI_EVIDENCE_MAX_OUTPUT_TOKENS",
  2_400,
);
const geminiRequestTimeoutMs = readNumberEnv(
  "GEMINI_REQUEST_TIMEOUT_MS",
  120_000,
);
const geminiEvidenceRequestTimeoutMs = readNumberEnv(
  "GEMINI_EVIDENCE_REQUEST_TIMEOUT_MS",
  240_000,
);
const geminiFileProcessingTimeoutMs = readNumberEnv(
  "GEMINI_FILE_PROCESSING_TIMEOUT_MS",
  120_000,
);
const geminiFileProcessingPollMs = readNumberEnv(
  "GEMINI_FILE_PROCESSING_POLL_MS",
  2_000,
);
const openAiMaxOutputTokens = readNumberEnv("OPENAI_MAX_OUTPUT_TOKENS", 8_000);
const openAiRequestTimeoutMs = readNumberEnv(
  "OPENAI_REQUEST_TIMEOUT_MS",
  240_000,
);
const openAiFrameCount = readNumberEnv("OPENAI_VIDEO_FRAME_COUNT", 18);
const openAiFocusedFrameCount = readNumberEnv(
  "OPENAI_FOCUSED_VIDEO_FRAME_COUNT",
  24,
);
const openAiFrameWidth = readNumberEnv("OPENAI_VIDEO_FRAME_WIDTH", 1536);
const openAiReasoningEffort = process.env.OPENAI_REASONING_EFFORT ?? "medium";
const benchmarkArtifactDir =
  process.env.OPENAI_BENCHMARK_ARTIFACT_DIR ??
  "dev-artifacts/openai-benchmarks";
const evidenceCaptureArtifactDir =
  process.env.EVIDENCE_CAPTURE_ARTIFACT_DIR ??
  "dev-artifacts/evidence-captures";
const modelBenchmarkArtifactDir =
  process.env.MODEL_BENCHMARK_ARTIFACT_DIR ??
  "dev-artifacts/model-benchmarks";
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const debugCaptureToken = process.env.DEBUG_CAPTURE_TOKEN;
const appEnv = process.env.APP_ENV ?? "development";
const mockAiAnalysisRequested = process.env.MOCK_AI_ANALYSIS === "true";
const mockAiAllowRemote =
  process.env.MOCK_AI_ANALYSIS_ALLOW_REMOTE === "true";
const mockAiAnalysisEnabled =
  appEnv !== "production" &&
  (appEnv === "preview" ? mockAiAllowRemote : true) &&
  mockAiAnalysisRequested;
const mockAiLatencyMs = readNumberEnv("MOCK_AI_LATENCY_MS", 0);
const evidenceDebugCaptures: EvidenceDebugCapture[] = [];
let supabaseServerClient: ReturnType<typeof createSupabaseClient<any>> | null | undefined;

if (appEnv === "production" && mockAiAnalysisRequested) {
  throw new Error(
    "MOCK_AI_ANALYSIS=true is not allowed when APP_ENV=production.",
  );
}

if (
  mockAiAnalysisRequested &&
  !["development", "test", "preview"].includes(appEnv)
) {
  throw new Error(
    "MOCK_AI_ANALYSIS=true requires APP_ENV=preview, development, or test.",
  );
}

if (appEnv === "preview" && mockAiAnalysisRequested && !mockAiAllowRemote) {
  throw new Error(
    "Remote Mock AI preview requires MOCK_AI_ANALYSIS_ALLOW_REMOTE=true.",
  );
}

type SupabaseServerClient = ReturnType<typeof createSupabaseClient<any>>;

type LinkedMoment = {
  id: string;
  user_id: string;
  status?: string | null;
  latest_evidence_result_id?: string | null;
};

const allowedVideoMimeTypes = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-m4v",
  "video/mov",
]);
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();
const dailyUsage = new Map<string, number>();
const analysisRateLimit = createRateLimit("analysis", {
  windowMs: rateLimitWindowMs,
  maxRequests: rateLimitMaxRequests,
});
const thumbnailRateLimit = createRateLimit("thumbnail", {
  windowMs: rateLimitWindowMs,
  maxRequests: Math.max(rateLimitMaxRequests, 10),
});

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
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    server: {
      host,
      port,
      environment: process.env.NODE_ENV ?? "development",
      appEnv,
    },
    primaryProvider: "gemini",
    mockAi: {
      requested: mockAiAnalysisRequested,
      enabled: mockAiAnalysisEnabled,
      fixture: process.env.MOCK_AI_FIXTURE ?? "auto",
      allowRemote: mockAiAllowRemote,
      latencyMs: mockAiLatencyMs,
    },
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    geminiModel,
    geminiFallbackModel,
    openAiBenchmark: {
      configured: Boolean(process.env.OPENAI_API_KEY),
      model: openAiModel,
      endpoint: "/api/benchmarks/openai-wakeboard-video",
    },
    geminiEvidence: {
      configured: Boolean(process.env.GEMINI_API_KEY),
      model: geminiModel,
      fallbackModel: geminiFallbackModel,
      endpoint: "/api/extract-session-evidence",
    },
    spendPolicy: "development budget target: under KRW 10,000/month",
    limits: {
      geminiMaxVideoMb: Math.round(geminiMaxVideoBytes / 1024 / 1024),
      openAiMaxVideoMb: Math.round(openAiMaxVideoBytes / 1024 / 1024),
      dailyUsageLimitEnabled,
      dailyAnalysisLimit,
      rateLimitWindowMs,
      rateLimitMaxRequests,
      rateLimitScope:
        "Only upload/AI routes are rate limited. Health, moments reads, and status polling are not counted.",
      rateLimitedRoutes: [
        "POST /api/analyze-session-video",
        "POST /api/extract-session-evidence",
        "POST /api/benchmarks/openai-wakeboard-video",
        "POST /api/create-session-thumbnail",
      ],
      geminiMaxOutputTokens,
      geminiEvidenceMaxOutputTokens,
      geminiRequestTimeoutMs,
      geminiEvidenceRequestTimeoutMs,
      openAiMaxOutputTokens,
      openAiRequestTimeoutMs,
      openAiFrameCount,
      openAiFocusedFrameCount,
      openAiFrameWidth,
      openAiReasoningEffort,
    },
  });
});

app.post("/api/moments", async (request, response) => {
  try {
    const client = getSupabaseServerClient();

    if (!client) {
      response.status(503).json({
        error: "Supabase service role env is not configured.",
      });
      return;
    }

    const now = new Date().toISOString();
    const status = readMomentStatus(request.body?.status, "queued");
    const userId = await getOrCreateDefaultSupabaseUser();
    const sessionId = getField(request.body?.sessionId, "");
    const fileSize = Number(request.body?.fileSize);
    const durationMs = Number(request.body?.durationMs);
    const { data, error } = await client
      .from("moments")
      .insert({
        user_id: userId,
        session_id: isUuid(sessionId) ? sessionId : null,
        activity_group_id: getField(request.body?.activityGroupId, "wakeboard"),
        title: nullableString(request.body?.title),
        notes: nullableString(request.body?.notes),
        status,
        source: "standalone_app",
        occurred_at: getField(request.body?.occurredAt, now),
        source_video_uri: nullableString(request.body?.sourceVideoUri),
        file_name: nullableString(request.body?.fileName),
        mime_type: nullableString(request.body?.mimeType),
        file_size: Number.isFinite(fileSize) ? fileSize : null,
        duration_ms: Number.isFinite(durationMs) ? durationMs : null,
      })
      .select("id,status")
      .single();

    if (error) {
      throw new Error(`Failed to insert moment: ${error.message}`);
    }

    const analysisJob = await createQueuedEvidenceAnalysisJob({
      userId,
      momentId: data.id,
    });

    response.json({
      momentId: data.id,
      status: data.status,
      analysisJobId: analysisJob?.id,
      analysisJobStatus: analysisJob?.status,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Moment creation failed.";
    console.error("Moment creation failed:", message);
    response.status(500).json({ error: message });
  }
});

app.get("/api/moments", async (_request, response) => {
  try {
    const client = getSupabaseServerClient();

    if (!client) {
      response.status(503).json({
        error: "Supabase service role env is not configured.",
      });
      return;
    }

    const userId = await getOrCreateDefaultSupabaseUser();
    const { data: moments, error: momentsError } = await client
      .from("moments")
      .select(
        [
          "id",
          "session_id",
          "activity_group_id",
          "title",
          "notes",
          "status",
          "occurred_at",
          "source_video_uri",
          "thumbnail_uri",
          "duration_ms",
          "file_name",
          "mime_type",
          "file_size",
          "latest_evidence_result_id",
          "latest_analysis_job_id",
          "created_at",
          "updated_at",
        ].join(","),
      )
      .eq("user_id", userId)
      .order("occurred_at", { ascending: false });

    if (momentsError) {
      throw new Error(`Failed to list moments: ${momentsError.message}`);
    }

    const momentRows = (moments ?? []) as unknown as Array<
      Record<string, unknown>
    >;
    const evidenceResultIds = momentRows
      .map((moment) => moment.latest_evidence_result_id)
      .filter((value): value is string => typeof value === "string");
    const evidenceResultsById = new Map<string, Record<string, unknown>>();

    if (evidenceResultIds.length > 0) {
      const evidenceResultColumnsV1 = [
        "id",
        "moment_id",
        "analysis_job_id",
        "provider",
        "model",
        "status",
        "quality_mode",
        "predicted_trick",
        "family",
        "confidence",
        "needs_review",
        "consistency_status",
        "consistency_warnings",
        "approach_observed_facts",
        "inversion_observed_facts",
        "temporal_windows",
        "evidence_windows",
        "observations",
        "raw_response_text",
        "error_message",
        "created_at",
        "updated_at",
      ];
      const evidenceResultColumnsV2 = [
        ...evidenceResultColumnsV1.slice(0, 14),
        "approach_observed_facts_v2",
        "approach_decision_v2",
        "approach_v2_signals",
        "approach_v2_conflict_summary",
        "pop_observed_facts",
        "pop_validation",
        "rotation_observed_facts",
        "rotation_validation",
        "grab_observed_facts",
        "grab_validation",
        "landing_observed_facts",
        "landing_validation",
        ...evidenceResultColumnsV1.slice(14),
      ];
      let evidenceResultsQuery = await client
        .from("evidence_results")
        .select(evidenceResultColumnsV2.join(","))
        .in("id", evidenceResultIds);

      if (isMissingApproachV2ColumnError(evidenceResultsQuery.error)) {
        console.warn(
          "ApproachObservedFacts v2 columns are not applied yet; falling back to v1 evidence result reads.",
        );
        evidenceResultsQuery = await client
          .from("evidence_results")
          .select(evidenceResultColumnsV1.join(","))
          .in("id", evidenceResultIds);
      }

      const { data: evidenceResults, error: evidenceResultsError } =
        evidenceResultsQuery;

      if (evidenceResultsError) {
        throw new Error(
          `Failed to list evidence results: ${evidenceResultsError.message}`,
        );
      }

      const evidenceResultRows = (evidenceResults ?? []) as unknown as Array<
        Record<string, unknown>
      >;

      for (const evidenceResult of evidenceResultRows) {
        if (typeof evidenceResult.id === "string") {
          evidenceResultsById.set(
            evidenceResult.id,
            evidenceResult,
          );
        }
      }
    }

    const visibleMomentRows = momentRows.filter(
      (moment) => !isIncompleteQueuedMomentListRow(moment),
    );

    response.json({
      moments: visibleMomentRows.map((moment) => ({
        id: moment.id,
        sessionId: moment.session_id,
        activityGroupId: moment.activity_group_id,
        title: moment.title,
        notes: moment.notes,
        status: moment.status,
        occurredAt: moment.occurred_at,
        sourceVideoUri: moment.source_video_uri,
        thumbnailUri: moment.thumbnail_uri,
        durationMs: moment.duration_ms,
        fileName: moment.file_name,
        mimeType: moment.mime_type,
        fileSize: moment.file_size,
        latestEvidenceResultId: moment.latest_evidence_result_id,
        latestAnalysisJobId: moment.latest_analysis_job_id,
        latestEvidenceResult:
          typeof moment.latest_evidence_result_id === "string"
            ? sanitizeEvidenceResultForMomentList(
                evidenceResultsById.get(moment.latest_evidence_result_id),
              )
            : null,
        createdAt: moment.created_at,
        updatedAt: moment.updated_at,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Moment list failed.";
    console.error("Moment list failed:", message);
    response.status(500).json({ error: message });
  }
});

function sanitizeEvidenceResultForMomentList(
  evidenceResult: Record<string, unknown> | undefined,
) {
  if (!evidenceResult) {
    return null;
  }

  const sanitized = { ...evidenceResult };

  sanitized.raw_response_text = safeRawResponseTextForMomentList(
    evidenceResult.raw_response_text,
  );

  return sanitized;
}

function safeRawResponseTextForMomentList(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  if (/[\u0000-\u001f]/.test(value)) {
    return null;
  }

  return value;
}

app.patch("/api/moments/:momentId/status", async (request, response) => {
  try {
    const client = getSupabaseServerClient();

    if (!client) {
      response.status(503).json({
        error: "Supabase service role env is not configured.",
      });
      return;
    }

    const momentId = request.params.momentId;

    if (!isUuid(momentId)) {
      response.status(400).json({ error: "Invalid moment id." });
      return;
    }

    const status = readMomentStatus(request.body?.status);

    if (!status) {
      response.status(400).json({ error: "Invalid moment status." });
      return;
    }

    const { data: existingMoment, error: existingMomentError } = await client
      .from("moments")
      .select("id,status,latest_evidence_result_id")
      .eq("id", momentId)
      .single();

    if (existingMomentError) {
      throw new Error(
        `Failed to read moment status: ${existingMomentError.message}`,
      );
    }

    const isDowngradeRequest = status === "queued" || status === "processing";
    const hasCompletedEvidence =
      typeof existingMoment.latest_evidence_result_id === "string";

    if (
      isDowngradeRequest &&
      (existingMoment.status === "completed" || hasCompletedEvidence)
    ) {
      if (existingMoment.status !== "completed") {
        const { error: completedUpdateError } = await client
          .from("moments")
          .update({
            status: "completed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", momentId);

        if (completedUpdateError) {
          throw new Error(
            `Failed to preserve completed moment status: ${completedUpdateError.message}`,
          );
        }
      }

      response.json({
        momentId,
        status: "completed",
      });
      return;
    }

    const { data, error } = await client
      .from("moments")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", momentId)
      .select("id,status")
      .single();

    if (error) {
      throw new Error(`Failed to update moment status: ${error.message}`);
    }

    response.json({
      momentId: data.id,
      status: data.status,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Moment status update failed.";
    console.error("Moment status update failed:", message);
    response.status(500).json({ error: message });
  }
});

app.get("/debug/evidence-captures", (request, response) => {
  if (!debugCaptureToken) {
    response.status(404).json({ error: "Debug evidence capture is disabled." });
    return;
  }

  if (getDebugToken(request) !== debugCaptureToken) {
    response.status(401).json({ error: "Unauthorized." });
    return;
  }

  response.json({
    captures: evidenceDebugCaptures,
  });
});

app.post(
  "/debug/benchmarks/edge-native-video",
  upload.single("video"),
  async (request, response) => {
    try {
      if (process.env.NODE_ENV === "production") {
        response.status(404).json({ error: "Benchmark endpoint is disabled." });
        return;
      }

      if (debugCaptureToken && getDebugToken(request) !== debugCaptureToken) {
        response.status(401).json({ error: "Unauthorized." });
        return;
      }

      if (!process.env.GEMINI_API_KEY) {
        response.status(500).json({
          error: "GEMINI_API_KEY is not configured on the server.",
        });
        return;
      }

      if (!request.file) {
        response.status(400).json({ error: "video file is required." });
        return;
      }

      const clipId = getField(request.body.clipId, request.file.originalname);
      const expectedEdge = normalizeBenchmarkExpectedEdge(
        request.body.expectedEdge,
      );
      const benchmarkMode = normalizeBenchmarkMode(
        request.body.benchmarkMode ?? request.body.mode,
      );
      const runCount = normalizeBenchmarkRunCount(
        request.body.runCount,
        benchmarkMode,
      );
      const requestedModels = normalizeBenchmarkModels(request.body.models);
      const benchmark = await runNativeVideoEdgeBenchmark({
        clipId,
        expectedEdge,
        benchmarkMode,
        file: request.file,
        models: requestedModels,
        runCount,
      });

      response.json(benchmark);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Edge benchmark failed.";
      console.error("Edge native video benchmark failed:", message);

      response.status(500).json({
        error: message,
      });
    }
  },
);

app.post(
  "/api/create-session-thumbnail",
  thumbnailRateLimit,
  upload.single("video"),
  async (request, response) => {
    try {
      if (!request.file) {
        response.status(400).json({ error: "video file is required." });
        return;
      }

      const thumbnail = await extractVideoThumbnail({
        buffer: request.file.buffer,
        mimeType: request.file.mimetype || "video/quicktime",
        originalName: request.file.originalname,
      });

      response.json({
        imageUri: thumbnail.dataUrl,
        timestampSeconds: thumbnail.timestampSeconds,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Thumbnail creation failed.";
      console.error("Thumbnail creation failed:", message);

      response.status(500).json({
        error: message,
      });
    }
  },
);

app.post(
  "/api/analyze-session-video",
  analysisRateLimit,
  upload.single("video"),
  async (request, response) => {
    try {
      const usageKey = todayKey("gemini");

      if (!mockAiAnalysisEnabled && isDailyUsageLimitExceeded(usageKey)) {
        response.status(429).json({
          error:
            "Daily analysis limit reached. This limit keeps development API spend under control.",
        });
        return;
      }

      if (!mockAiAnalysisEnabled && !process.env.GEMINI_API_KEY) {
        response.status(500).json({
          error: "GEMINI_API_KEY is not configured on the server.",
        });
        return;
      }

      if (!request.file) {
        response.status(400).json({ error: "video file is required." });
        return;
      }

      if (request.file.size > geminiMaxVideoBytes) {
        response.status(413).json({
          error: `Video is too large. Max size is ${Math.round(geminiMaxVideoBytes / 1024 / 1024)}MB.`,
        });
        return;
      }

      const metadata = getSessionMetadata(request);

      let rawOutputText: string;
      let actualModel: string;
      let mockInfo: Record<string, unknown> | undefined;

      if (mockAiAnalysisEnabled) {
        const fixture = getMockAiFixture(metadata);
        await applyMockAiLatency();
        rawOutputText = stringifyMockAiPayload(fixture.analysisPayload);
        actualModel = fixture.analysisModel;
        mockInfo = buildMockAiInfo(fixture.id, [
          "gemini_files_upload",
          "gemini_generate_content",
        ]);
        console.log(
          `[Mock AI] analysis fixture=${fixture.id} model=${actualModel} externalCallsSkipped=gemini_files_upload,gemini_generate_content`,
        );
      } else {
        const client = new GoogleGenAI({
          apiKey: process.env.GEMINI_API_KEY,
        });

        const uploadedFile = await uploadVideoForGemini({
          client,
          buffer: request.file.buffer,
          mimeType: request.file.mimetype || "video/quicktime",
          originalName: request.file.originalname,
        });

        const prompt = buildGeminiAnalysisPrompt({
          ...metadata,
          fileName: request.file.originalname,
          coachingInsightContext: readCoachingInsightContext(request),
        });

        const result = await withTimeout(
          generateGeminiContentWithResilience({
            client,
            operation: "analysis",
            params: {
              model: geminiModel,
              contents: [
                createPartFromUri(
                  uploadedFile.uri ?? "",
                  uploadedFile.mimeType ?? request.file.mimetype,
                ),
                prompt,
              ],
              config: {
                maxOutputTokens: geminiMaxOutputTokens,
                thinkingConfig: { thinkingBudget: 0 },
                responseMimeType: "application/json",
                responseSchema: geminiAnalysisResponseSchema,
              },
            },
          }),
          geminiRequestTimeoutMs,
          "Gemini analysis timed out.",
        );

        rawOutputText = result.response.text ?? "";
        actualModel = result.model;
      }

      const analysis = parseGeminiAnalysis(rawOutputText);
      if (!mockAiAnalysisEnabled) {
        recordDailyUsage(usageKey);
      }

      response.json({
        id: `analysis-${Date.now()}`,
        sessionId: metadata.sessionId,
        status: analysis.parseFailed ? "failed" : "completed",
        provider: "gemini",
        model: actualModel,
        mock: mockAiAnalysisEnabled ? true : undefined,
        mockInfo,
        rawResponseText: rawOutputText,
        summary: analysis.summary,
        highlights: analysis.highlights,
        highlightScenes: analysis.highlightScenes,
        suggestions: analysis.suggestions,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Analysis failed.";
      console.error("Gemini analysis request failed:", message);

      response.status(500).json({
        error: message,
      });
    }
  },
);

app.post(
  "/api/extract-session-evidence",
  analysisRateLimit,
  upload.single("video"),
  async (request, response) => {
    try {
      if (!mockAiAnalysisEnabled && !process.env.GEMINI_API_KEY) {
        response.status(500).json({
          error: "GEMINI_API_KEY is not configured on the server.",
        });
        return;
      }

      if (!request.file) {
        response.status(400).json({ error: "video file is required." });
        return;
      }

      if (request.file.size > geminiMaxVideoBytes) {
        response.status(413).json({
          error: `Video is too large. Max size is ${Math.round(geminiMaxVideoBytes / 1024 / 1024)}MB.`,
        });
        return;
      }

      const metadata = getSessionMetadata(request);
      const queuedJob = await getOrCreateQueuedEvidenceAnalysisJob(metadata);

      if (!queuedJob) {
        response.status(400).json({
          error: "A valid linked Moment is required to queue evidence extraction.",
        });
        return;
      }

      const file = {
        buffer: Buffer.from(request.file.buffer),
        mimetype: request.file.mimetype,
        originalname: request.file.originalname,
        size: request.file.size,
      };

      if (queuedJob.status === "queued") {
        setImmediate(() => {
          void processQueuedEvidenceAnalysisJob({
            analysisJobId: queuedJob.id,
            metadata,
            file,
          });
        });
      }

      response.status(202).json({
        id: queuedJob.id,
        sessionId: metadata.sessionId,
        momentId: queuedJob.momentId,
        status: queuedJob.status,
        provider: "gemini",
        model: mockAiAnalysisEnabled
          ? "mock-gemini-evidence-v1"
          : geminiModel,
        mock: mockAiAnalysisEnabled ? true : undefined,
        mockInfo: mockAiAnalysisEnabled
          ? buildMockAiInfo("auto", [
              "gemini_files_upload",
              "gemini_generate_content",
            ])
          : undefined,
        momentStatus:
          queuedJob.status === "processing" ? "processing" : "queued",
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Evidence extraction failed.";
      console.error("Gemini evidence extraction failed:", message);

      response.status(500).json({
        error: message,
      });
    }
  },
);

app.post(
  "/api/benchmarks/openai-wakeboard-video",
  analysisRateLimit,
  upload.single("video"),
  async (request, response) => {
    try {
      const usageKey = todayKey("openai");

      assertExternalAiAllowed("OpenAI benchmark");

      if (isDailyUsageLimitExceeded(usageKey)) {
        response.status(429).json({
          error:
            "Daily benchmark limit reached. This limit keeps development API spend under control.",
        });
        return;
      }

      if (!process.env.OPENAI_API_KEY) {
        response.status(500).json({
          error: "OPENAI_API_KEY is not configured on the server.",
        });
        return;
      }

      if (!ffmpegPath) {
        response.status(500).json({
          error: "ffmpeg-static did not provide an ffmpeg binary path.",
        });
        return;
      }

      if (!request.file) {
        response.status(400).json({ error: "video file is required." });
        return;
      }

      if (request.file.size > openAiMaxVideoBytes) {
        response.status(413).json({
          error: `Video is too large. Max size is ${Math.round(openAiMaxVideoBytes / 1024 / 1024)}MB.`,
        });
        return;
      }

      const metadata = getSessionMetadata(request);
      const broadFrames = await extractVideoFrames({
        buffer: request.file.buffer,
        mimeType: request.file.mimetype || "video/quicktime",
        originalName: request.file.originalname,
        frameCount: openAiFrameCount,
      });

      const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        timeout: openAiRequestTimeoutMs,
      });

      const motionScoutResult = await withTimeout(
        client.responses.create({
          model: openAiModel,
          instructions: buildOpenAiMotionScoutInstructions(),
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: buildOpenAiMotionScoutPrompt({
                    ...metadata,
                    fileName: request.file.originalname,
                    sampledFrames: broadFrames.frames.length,
                    durationSeconds: broadFrames.durationSeconds,
                  }),
                },
                ...buildOpenAiFrameInputContent(broadFrames.frames),
              ],
            },
          ],
          max_output_tokens: 2_000,
          reasoning: {
            effort: "low",
            summary: "concise",
          },
          store: false,
          text: {
            verbosity: "medium",
            format: {
              type: "json_schema",
              name: "action_sports_journal_motion_phase_scout",
              strict: true,
              schema: openAiMotionScoutResponseSchema,
            },
          },
        }),
        openAiRequestTimeoutMs,
        "OpenAI motion phase scouting timed out.",
      );

      const rawMotionScoutOutputText = motionScoutResult.output_text ?? "";
      const motionScout = parseOpenAiMotionScout(rawMotionScoutOutputText);
      const denseWindows = selectDenseMotionWindows(
        motionScout,
        broadFrames.durationSeconds,
      );
      const focusedFrames =
        denseWindows.length > 0
          ? await extractVideoFrames({
              buffer: request.file.buffer,
              mimeType: request.file.mimetype || "video/quicktime",
              originalName: request.file.originalname,
              frameCount: openAiFocusedFrameCount,
              windows: denseWindows,
            })
          : null;

      if (!focusedFrames) {
        const now = new Date().toISOString();
        const responseBody = {
          id: `openai-benchmark-${Date.now()}`,
          sessionId: metadata.sessionId,
          status: "completed",
          provider: "openai",
          model: openAiModel,
          rawResponseText: rawMotionScoutOutputText,
          humanReadableAnalysis:
            "전체 영상 프레임을 먼저 확인했지만, 신뢰할 수 있는 takeoff-to-landing 동작 구간을 특정하지 못했습니다. 현재 영상만으로는 코칭 결론을 사실처럼 제시하지 않습니다.",
          summary: "동작 phase 구간을 충분한 확신으로 찾지 못했습니다.",
          highlights: [
            "unknown: 신뢰할 수 있는 takeoff-to-landing 구간을 특정하지 못했습니다.",
          ],
          highlightScenes: [],
          suggestions: [
            "라이더와 웨이크가 더 오래 보이는 클립으로 다시 촬영해 주세요.",
            "트릭 전후 3~5초가 포함되도록 영상을 잘라 다시 올려 주세요.",
          ],
          observations: [],
          patternRecognition: [],
          inferences: [],
          confidence: {
            level: "low",
            reason: motionScout.notEnoughEvidenceReason,
          },
          selfCritique: {
            limitations: [motionScout.notEnoughEvidenceReason],
            whatWouldImproveAnalysis: [
              "전체 동작이 이어지는 더 긴 영상 또는 측면 각도의 영상을 사용하세요.",
            ],
          },
          motion: {
            phaseWindows: motionScout.phaseWindows,
            primaryHighlightTimestampSeconds:
              motionScout.primaryHighlightTimestampSeconds,
            thumbnailFrameTimestampSeconds:
              motionScout.thumbnailFrameTimestampSeconds,
            highlightFrameTimestampsSeconds:
              motionScout.highlightFrameTimestampsSeconds,
            denseWindows: [],
          },
          createdAt: now,
          debug: {
            stage1SampledFrames: broadFrames.frames.length,
            stage1FrameTimestamps: broadFrames.frames.map(
              (frame) => frame.timestampLabel,
            ),
            stage1PhaseWindows: motionScout.phaseWindows,
            primaryHighlightTimestampSeconds:
              motionScout.primaryHighlightTimestampSeconds,
            thumbnailFrameTimestampSeconds:
              motionScout.thumbnailFrameTimestampSeconds,
            highlightFrameTimestampsSeconds:
              motionScout.highlightFrameTimestampsSeconds,
            selectedDenseWindows: [],
            stage2SampledFrames: 0,
            stage2FrameTimestamps: [],
          },
        };

        await writeOpenAiBenchmarkArtifact({
          metadata,
          fileName: request.file.originalname,
          videoMimeType: request.file.mimetype,
          videoBytes: request.file.size,
          responseBody,
          rawOutputText: rawMotionScoutOutputText,
        });

        recordDailyUsage(usageKey);
        response.json(responseBody);
        return;
      }

      const prompt = buildOpenAiBenchmarkPrompt({
        ...metadata,
        fileName: request.file.originalname,
        sampledFrames: focusedFrames.frames.length,
        phaseWindows: motionScout.phaseWindows,
        denseWindows,
      });

      const result = await withTimeout(
        client.responses.create({
          model: openAiModel,
          instructions: buildOpenAiCoachInstructions(),
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: prompt },
                ...buildOpenAiFrameInputContent(focusedFrames.frames),
              ],
            },
          ],
          max_output_tokens: openAiMaxOutputTokens,
          reasoning: {
            effort: openAiReasoningEffort as
              | "none"
              | "minimal"
              | "low"
              | "medium"
              | "high"
              | "xhigh",
            summary: "concise",
          },
          store: false,
          text: {
            verbosity: "high",
            format: {
              type: "json_schema",
              name: "action_sports_journal_openai_wakeboard_benchmark",
              strict: true,
              schema: openAiBenchmarkResponseSchema,
            },
          },
        }),
        openAiRequestTimeoutMs,
        "OpenAI benchmark timed out.",
      );

      const rawOutputText = result.output_text ?? "";
      const analysis = parseOpenAiBenchmark(rawOutputText);
      const highlightScenes = attachHighlightImages(
        analysis.highlightScenes,
        focusedFrames.frames,
      );
      recordDailyUsage(usageKey);

      const responseBody = {
        id: `openai-benchmark-${Date.now()}`,
        sessionId: metadata.sessionId,
        status: analysis.parseFailed ? "failed" : "completed",
        provider: "openai",
        model: openAiModel,
        rawResponseText: rawOutputText,
        humanReadableAnalysis: analysis.humanReadableAnalysis,
        summary: analysis.summary,
        highlights: analysis.highlights,
        highlightScenes,
        suggestions: analysis.suggestions,
        observations: analysis.observations,
        patternRecognition: analysis.patternRecognition,
        inferences: analysis.inferences,
        confidence: analysis.confidence,
        selfCritique: analysis.selfCritique,
        motion: {
          phaseWindows: motionScout.phaseWindows,
          primaryHighlightTimestampSeconds:
            motionScout.primaryHighlightTimestampSeconds,
          thumbnailFrameTimestampSeconds:
            motionScout.thumbnailFrameTimestampSeconds,
          highlightFrameTimestampsSeconds:
            motionScout.highlightFrameTimestampsSeconds,
          denseWindows,
        },
        createdAt: new Date().toISOString(),
        debug: {
          stage1SampledFrames: broadFrames.frames.length,
          stage1FrameTimestamps: broadFrames.frames.map(
            (frame) => frame.timestampLabel,
          ),
          stage1PhaseWindows: motionScout.phaseWindows,
          primaryHighlightTimestampSeconds:
            motionScout.primaryHighlightTimestampSeconds,
          thumbnailFrameTimestampSeconds:
            motionScout.thumbnailFrameTimestampSeconds,
          highlightFrameTimestampsSeconds:
            motionScout.highlightFrameTimestampsSeconds,
          selectedDenseWindows: denseWindows,
          stage2SampledFrames: focusedFrames.frames.length,
          stage2FrameTimestamps: focusedFrames.frames.map(
            (frame) => frame.timestampLabel,
          ),
        },
      };

      await writeOpenAiBenchmarkArtifact({
        metadata,
        fileName: request.file.originalname,
        videoMimeType: request.file.mimetype,
        videoBytes: request.file.size,
        responseBody,
        rawOutputText,
      });

      response.json(responseBody);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Benchmark failed.";
      console.error("OpenAI benchmark request failed:", message);

      response.status(500).json({
        error: message,
      });
    }
  },
);

app.listen(port, host, () => {
  console.log(
    `Action Sports Journal analysis server listening on ${host}:${port}`,
  );
});

type SessionMetadata = {
  sessionId: string;
  momentId: string;
  activityGroupName: string;
  title: string;
  notes: string;
  occurredAt: string;
  userConfirmedTrick: string;
};

type EvidenceDebugCapture = {
  capturedAt: string;
  metadata: SessionMetadata;
  file: {
    originalName: string;
    mimeType: string;
    size: number;
  };
  rawResponseText: string;
  rawParsedEvidence: NormalizedGeminiEvidence;
  parsedEvidence: TaxonomyGatedEvidence;
  response: unknown;
};

type EvidenceJobVideoFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

type EdgeBenchmarkExpectedEdge = "toe" | "heel" | "unknown";

type EdgeBenchmarkMode = "smoke" | "full";

type EdgeBenchmarkParsedResult = {
  predictedEdge: "toe" | "heel" | "unknown" | "ambiguous";
  confidence: "high" | "medium" | "low";
  visibleEvidence: string[];
  inferredEvidence: string[];
  hallucinationFlags: string[];
  timestampEvidence: {
    startSec: number | null;
    endSec: number | null;
    description: string;
  };
};

type EdgeBenchmarkRunResult = EdgeBenchmarkParsedResult & {
  clipId: string;
  expectedEdge: EdgeBenchmarkExpectedEdge;
  benchmarkMode: EdgeBenchmarkMode;
  provider: "gemini";
  model: string;
  runIndex: number;
  latencyMs: number;
  estimatedCost: number | null;
  rawResponseText: string;
  rawResponseArtifactPath: string;
  correct: boolean | null;
  highConfidenceWrong: boolean;
};

type EdgeBenchmarkSummary = {
  createdAt: string;
  clipId: string;
  expectedEdge: EdgeBenchmarkExpectedEdge;
  benchmarkMode: EdgeBenchmarkMode;
  provider: "gemini";
  models: string[];
  runCount: number;
  results: EdgeBenchmarkRunResult[];
  aggregate: Array<{
    model: string;
    total: number;
    correct: number;
    accuracy: number | null;
    highConfidenceWrong: number;
    unknownOrAmbiguous: number;
    averageLatencyMs: number;
    hallucinationFlagCount: number;
  }>;
  summaryArtifactPath: string;
};

function normalizeBenchmarkExpectedEdge(
  value: unknown,
): EdgeBenchmarkExpectedEdge {
  return value === "toe" || value === "heel" ? value : "unknown";
}

function normalizeBenchmarkMode(value: unknown): EdgeBenchmarkMode {
  return value === "full" ? "full" : "smoke";
}

function normalizeBenchmarkRunCount(
  value: unknown,
  benchmarkMode: EdgeBenchmarkMode,
) {
  if (value === undefined || value === null || value === "") {
    return benchmarkMode === "full" ? 3 : 1;
  }

  const parsed =
    typeof value === "string" || typeof value === "number"
      ? Number(value)
      : benchmarkMode === "full"
        ? 3
        : 1;

  if (!Number.isFinite(parsed)) {
    return benchmarkMode === "full" ? 3 : 1;
  }

  return Math.min(Math.max(Math.trunc(parsed), 1), 5);
}

function normalizeBenchmarkModels(value: unknown) {
  const rawModels = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const models = rawModels
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.startsWith("gemini-"));
  const uniqueModels = Array.from(new Set(models));

  return uniqueModels.length > 0
    ? uniqueModels
    : ["gemini-2.5-flash", "gemini-2.5-pro"];
}

async function runNativeVideoEdgeBenchmark({
  clipId,
  expectedEdge,
  benchmarkMode,
  file,
  models,
  runCount,
}: {
  clipId: string;
  expectedEdge: EdgeBenchmarkExpectedEdge;
  benchmarkMode: EdgeBenchmarkMode;
  file: Express.Multer.File;
  models: string[];
  runCount: number;
}): Promise<EdgeBenchmarkSummary> {
  const client = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
  });
  const uploadedFile = await uploadVideoForGemini({
    client,
    buffer: file.buffer,
    mimeType: file.mimetype || "video/quicktime",
    originalName: file.originalname,
  });
  const results: EdgeBenchmarkRunResult[] = [];

  for (const model of models) {
    for (let runIndex = 1; runIndex <= runCount; runIndex += 1) {
      const startedAt = Date.now();
      const prompt = buildEdgeNativeVideoBenchmarkPrompt({
        clipId,
        expectedEdge,
        runIndex,
      });
      const response = await withTimeout(
        client.models.generateContent({
          model,
          contents: [
            createPartFromUri(
              uploadedFile.uri ?? "",
              uploadedFile.mimeType ?? file.mimetype,
            ),
            prompt,
          ],
          config: {
            maxOutputTokens: 1_200,
            responseMimeType: "application/json",
            responseSchema: geminiEdgeBenchmarkResponseSchema,
          },
        }),
        geminiEvidenceRequestTimeoutMs,
        `Gemini edge benchmark timed out for ${model}.`,
      );
      const latencyMs = Date.now() - startedAt;
      const rawResponseText = response.text ?? "";
      const parsed = parseEdgeBenchmarkResult(rawResponseText);
      const correct =
        expectedEdge === "unknown" ? null : parsed.predictedEdge === expectedEdge;
      const runResult: EdgeBenchmarkRunResult = {
        ...parsed,
        clipId,
        expectedEdge,
        benchmarkMode,
        provider: "gemini",
        model,
        runIndex,
        latencyMs,
        estimatedCost: null,
        rawResponseText,
        rawResponseArtifactPath: "",
        correct,
        highConfidenceWrong: correct === false && parsed.confidence === "high",
      };

      runResult.rawResponseArtifactPath =
        await writeEdgeBenchmarkRunArtifact(runResult);
      results.push(runResult);
    }
  }

  const createdAt = new Date().toISOString();
  const summary: EdgeBenchmarkSummary = {
    createdAt,
    clipId,
    expectedEdge,
    benchmarkMode,
    provider: "gemini",
    models,
    runCount,
    results,
    aggregate: aggregateEdgeBenchmarkResults(results),
    summaryArtifactPath: "",
  };
  summary.summaryArtifactPath = await writeEdgeBenchmarkSummaryArtifact(summary);

  return summary;
}

function buildEdgeNativeVideoBenchmarkPrompt({
  clipId,
  expectedEdge,
  runIndex,
}: {
  clipId: string;
  expectedEdge: EdgeBenchmarkExpectedEdge;
  runIndex: number;
}) {
  return `You are evaluating wakeboard edge direction from native video.

Task:
Return observed facts only for Toe/Heel edge use in this clip.

Clip:
- clipId: ${clipId}
- expectedEdge is provided only for benchmark bookkeeping: ${expectedEdge}
- runIndex: ${runIndex}

Rules:
- Do not use the clip name or expectedEdge as visual evidence.
- Decide predictedEdge only from what is visible in the video.
- Use "unknown" when the edge cannot be seen.
- Use "ambiguous" when toe and heel evidence conflict.
- High confidence requires timestamped, directly visible physical evidence.
- Visible evidence must describe board tilt, spray, line tension, rider weight over edge, or another concrete visual cue.
- Inferred evidence is allowed but must be separated from visible evidence.
- Add hallucinationFlags when the answer relies on labels, trick expectations, body orientation alone, or non-visible assumptions.
- Timestamp evidence should point to the most relevant visible moment. Use null startSec/endSec if no timestamp can be identified.

Return only JSON matching this schema:
{
  "predictedEdge": "toe | heel | unknown | ambiguous",
  "confidence": "high | medium | low",
  "visibleEvidence": ["specific visible evidence"],
  "inferredEvidence": ["inferences or assumptions, empty if none"],
  "hallucinationFlags": ["risk flags, empty if none"],
  "timestampEvidence": {
    "startSec": 0,
    "endSec": 0,
    "description": "what is visible at that moment"
  }
}`;
}

function parseEdgeBenchmarkResult(
  rawResponseText: string,
): EdgeBenchmarkParsedResult {
  try {
    const parsed = JSON.parse(extractJsonObject(rawResponseText)) as Partial<
      EdgeBenchmarkParsedResult
    >;
    const predictedEdge =
      parsed.predictedEdge === "toe" ||
      parsed.predictedEdge === "heel" ||
      parsed.predictedEdge === "ambiguous" ||
      parsed.predictedEdge === "unknown"
        ? parsed.predictedEdge
        : "unknown";
    const confidence = asOpenAiConfidenceLevel(parsed.confidence) ?? "low";

    return {
      predictedEdge,
      confidence,
      visibleEvidence: normalizeStringArray(parsed.visibleEvidence, []),
      inferredEvidence: normalizeStringArray(parsed.inferredEvidence, []),
      hallucinationFlags: normalizeStringArray(parsed.hallucinationFlags, []),
      timestampEvidence: normalizeEdgeBenchmarkTimestampEvidence(
        parsed.timestampEvidence,
      ),
    };
  } catch (error) {
    return {
      predictedEdge: "unknown",
      confidence: "low",
      visibleEvidence: [],
      inferredEvidence: [],
      hallucinationFlags: ["invalid_json_response"],
      timestampEvidence: {
        startSec: null,
        endSec: null,
        description: "Model did not return valid benchmark JSON.",
      },
    };
  }
}

function normalizeEdgeBenchmarkTimestampEvidence(value: unknown) {
  if (!value || typeof value !== "object") {
    return {
      startSec: null,
      endSec: null,
      description: "No timestamp evidence provided.",
    };
  }

  const record = value as Record<string, unknown>;
  const startSec =
    typeof record.startSec === "number" && Number.isFinite(record.startSec)
      ? record.startSec
      : null;
  const endSec =
    typeof record.endSec === "number" && Number.isFinite(record.endSec)
      ? record.endSec
      : null;
  const description =
    typeof record.description === "string" && record.description.trim()
      ? record.description
      : "No timestamp evidence provided.";

  return {
    startSec,
    endSec,
    description,
  };
}

function aggregateEdgeBenchmarkResults(results: EdgeBenchmarkRunResult[]) {
  return Array.from(new Set(results.map((result) => result.model))).map(
    (model) => {
      const modelResults = results.filter((result) => result.model === model);
      const knownResults = modelResults.filter(
        (result) => result.correct !== null,
      );
      const correct = knownResults.filter((result) => result.correct).length;
      const latencyTotal = modelResults.reduce(
        (sum, result) => sum + result.latencyMs,
        0,
      );

      return {
        model,
        total: modelResults.length,
        correct,
        accuracy:
          knownResults.length > 0 ? correct / knownResults.length : null,
        highConfidenceWrong: modelResults.filter(
          (result) => result.highConfidenceWrong,
        ).length,
        unknownOrAmbiguous: modelResults.filter(
          (result) =>
            result.predictedEdge === "unknown" ||
            result.predictedEdge === "ambiguous",
        ).length,
        averageLatencyMs:
          modelResults.length > 0
            ? Math.round(latencyTotal / modelResults.length)
            : 0,
        hallucinationFlagCount: modelResults.reduce(
          (sum, result) => sum + result.hallucinationFlags.length,
          0,
        ),
      };
    },
  );
}

async function writeEdgeBenchmarkRunArtifact(result: EdgeBenchmarkRunResult) {
  await mkdir(modelBenchmarkArtifactDir, { recursive: true });

  const artifactPath = join(
    modelBenchmarkArtifactDir,
    `${evidenceCaptureTimestamp()}-${safeFileSegment(result.benchmarkMode)}-${safeFileSegment(result.clipId)}-${safeFileSegment(result.model)}-run-${result.runIndex}.json`,
  );

  await writeFile(
    artifactPath,
    JSON.stringify(
      {
        kind: "edge-native-video-benchmark-run",
        createdAt: new Date().toISOString(),
        nodeEnv: process.env.NODE_ENV ?? "development",
        result: {
          ...result,
          rawResponseArtifactPath: artifactPath,
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  return artifactPath;
}

async function writeEdgeBenchmarkSummaryArtifact(
  summary: EdgeBenchmarkSummary,
) {
  await mkdir(modelBenchmarkArtifactDir, { recursive: true });

  const artifactPath = join(
    modelBenchmarkArtifactDir,
    `summary-${evidenceCaptureTimestamp()}-${safeFileSegment(summary.benchmarkMode)}-${safeFileSegment(summary.clipId)}.json`,
  );

  await writeFile(
    artifactPath,
    JSON.stringify(
      {
        kind: "edge-native-video-benchmark-summary",
        ...summary,
        summaryArtifactPath: artifactPath,
      },
      null,
      2,
    ),
    "utf8",
  );

  return artifactPath;
}

function getSessionMetadata(request: express.Request): SessionMetadata {
  return {
    sessionId: getField(request.body.sessionId, "session-local"),
    momentId: getField(request.body.momentId, ""),
    activityGroupName: getField(request.body.activityGroupName, "웨이크보드"),
    title: getField(request.body.title, "웨이크보드 세션"),
    notes: getField(request.body.notes, ""),
    occurredAt: getField(request.body.occurredAt, new Date().toISOString()),
    userConfirmedTrick: getField(request.body.userConfirmedTrick, ""),
  };
}

function readCoachingInsightContext(
  request: express.Request,
): CoachingInsightContext[] {
  const rawValue = request.body?.coachingInsightContext;

  if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(normalizeCoachingInsightContext)
      .filter((item): item is CoachingInsightContext => Boolean(item));
  } catch {
    return [];
  }
}

function normalizeCoachingInsightContext(
  value: unknown,
): CoachingInsightContext | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const context = value as Record<string, unknown>;
  const mode = readCoachingInsightMode(context.mode);
  const confidence = readEvidenceConfidence(context.confidence);
  const severity = readKnowledgeInsightSeverity(context.severity);

  if (!mode || !confidence || !severity) {
    return null;
  }

  return {
    mode,
    sourceRuleId: getField(context.sourceRuleId, "unknown-rule"),
    category: readKnowledgeInsightCategory(context.category),
    message: getField(context.message, ""),
    confidence,
    severity,
    requiresReview: context.requiresReview === true,
    coachingSafe: context.coachingSafe === true,
  };
}

function readCoachingInsightMode(value: unknown) {
  if (
    value === "direct_cue" ||
    value === "review_context" ||
    value === "internal_only"
  ) {
    return value;
  }

  return undefined;
}

function readKnowledgeInsightCategory(value: unknown) {
  if (
    value === "approach" ||
    value === "edge_load" ||
    value === "pop" ||
    value === "rotation" ||
    value === "grab" ||
    value === "landing" ||
    value === "completion" ||
    value === "progression" ||
    value === "review"
  ) {
    return value;
  }

  return "review";
}

function readKnowledgeInsightSeverity(value: unknown) {
  if (
    value === "info" ||
    value === "low" ||
    value === "medium" ||
    value === "high"
  ) {
    return value;
  }

  return undefined;
}

function readEvidenceConfidence(value: unknown) {
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }

  return undefined;
}

function getField(value: unknown, fallback: string) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

async function applyMockAiLatency() {
  if (mockAiLatencyMs > 0) {
    await sleep(mockAiLatencyMs);
  }
}

function buildMockAiInfo(fixtureId: string, providerCallsSkipped: string[]) {
  return {
    enabled: true,
    fixtureId,
    provider: "mock",
    providerCallsSkipped,
  };
}

function assertExternalAiAllowed(operation: string) {
  if (mockAiAnalysisEnabled) {
    throw new Error(`${operation} must not call external AI in mock mode.`);
  }
}

function getDebugToken(request: express.Request) {
  const headerValue = request.header("x-debug-token");

  if (headerValue) {
    return headerValue;
  }

  return getField(request.query.token, "");
}

function captureEvidenceDebug({
  metadata,
  file,
  rawResponseText,
  rawParsedEvidence,
  parsedEvidence,
  response,
}: Omit<EvidenceDebugCapture, "capturedAt">) {
  if (!debugCaptureToken) {
    return;
  }

  evidenceDebugCaptures.unshift({
    capturedAt: new Date().toISOString(),
    metadata,
    file,
    rawResponseText,
    rawParsedEvidence,
    parsedEvidence,
    response,
  });

  evidenceDebugCaptures.splice(5);
}

function readNumberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);

  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function createRateLimit(
  scope: string,
  {
    windowMs,
    maxRequests,
  }: {
    windowMs: number;
    maxRequests: number;
  },
) {
  return (
    request: express.Request,
    response: express.Response,
    next: express.NextFunction,
  ) => {
    const key = `${scope}:${request.ip ?? "unknown"}`;
    const now = Date.now();
    const bucket = rateLimitBuckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      rateLimitBuckets.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });
      next();
      return;
    }

    if (bucket.count >= maxRequests) {
      response.status(429).json({
        error:
          "Server is rate limiting analysis requests. The Moment remains queued; try again shortly.",
      });
      return;
    }

    bucket.count += 1;
    next();
  };
}

function todayKey(provider: "gemini" | "gemini-evidence" | "openai") {
  return `${provider}-${new Date().toISOString().slice(0, 10)}`;
}

function isDailyUsageLimitExceeded(usageKey: string) {
  return (
    dailyUsageLimitEnabled &&
    (dailyUsage.get(usageKey) ?? 0) >= dailyAnalysisLimit
  );
}

function recordDailyUsage(usageKey: string) {
  dailyUsage.set(usageKey, (dailyUsage.get(usageKey) ?? 0) + 1);
}

function isMissingApproachV2ColumnError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const message =
    "message" in error && typeof error.message === "string"
      ? error.message
      : "";

  return (
    message.includes("approach_observed_facts_v2") ||
    message.includes("approach_decision_v2") ||
    message.includes("approach_v2_signals") ||
    message.includes("approach_v2_conflict_summary") ||
    message.includes("pop_observed_facts") ||
    message.includes("pop_validation") ||
    message.includes("rotation_observed_facts") ||
    message.includes("rotation_validation") ||
    message.includes("grab_observed_facts") ||
    message.includes("grab_validation") ||
    message.includes("landing_observed_facts") ||
    message.includes("landing_validation")
  );
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
  assertExternalAiAllowed("uploadVideoForGemini");

  const tempDir = await mkdtemp(join(tmpdir(), "asj-gemini-video-"));
  const filePath = join(
    tempDir,
    originalName || `session-video${extensionForMimeType(mimeType)}`,
  );

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
      throw new Error(
        "Gemini did not return a file name for the uploaded video.",
      );
    }

    const activeFile = await waitForGeminiFileActive(client, uploadedFile.name);

    if (!activeFile.uri) {
      throw new Error(
        "Gemini did not return a file URI for the uploaded video.",
      );
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

    if (file.state === "ACTIVE") {
      return file;
    }

    if (file.state === "FAILED") {
      throw new Error(
        `Gemini video processing failed: ${file.error?.message ?? "unknown error"}`,
      );
    }

    await sleep(geminiFileProcessingPollMs);
  }

  throw new Error(
    "Gemini video processing timed out before the file became ACTIVE.",
  );
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

type GeminiGenerateContentParams = Parameters<
  GoogleGenAI["models"]["generateContent"]
>[0];

async function generateGeminiContentWithResilience({
  client,
  operation,
  params,
}: {
  client: GoogleGenAI;
  operation: string;
  params: GeminiGenerateContentParams;
}) {
  assertExternalAiAllowed("generateGeminiContentWithResilience");

  const retryDelaysMs = [2_000, 5_000, 10_000];
  let lastError: unknown;

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    try {
      const response = await client.models.generateContent({
        ...params,
        model: geminiModel,
      });

      return { response, model: geminiModel };
    } catch (error) {
      lastError = error;

      if (!isGeminiOverloadError(error) || attempt === retryDelaysMs.length) {
        break;
      }

      const delayMs = retryDelaysMs[attempt];
      console.warn(
        `[Gemini retry] ${operation}: ${geminiModel} returned 503/high demand. Retry ${attempt + 1}/${retryDelaysMs.length} in ${delayMs / 1000}s.`,
      );
      await sleep(delayMs);
    }
  }

  if (geminiFallbackModel && geminiFallbackModel !== geminiModel) {
    try {
      console.warn(
        `[Gemini fallback] ${operation}: switching from ${geminiModel} to ${geminiFallbackModel} after retries.`,
      );

      const response = await client.models.generateContent({
        ...params,
        model: geminiFallbackModel,
      });

      return { response, model: geminiFallbackModel };
    } catch (error) {
      lastError = error;
    }
  }

  if (isGeminiOverloadError(lastError)) {
    throw new Error(
      "Gemini 모델이 현재 혼잡합니다. 잠시 후 다시 시도해 주세요.",
    );
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function isGeminiOverloadError(error: unknown) {
  const message = errorMessage(error).toLowerCase();

  return (
    message.includes("503") ||
    message.includes("high demand") ||
    message.includes("unavailable") ||
    message.includes('"status":"unavailable"')
  );
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function extractVideoFrames({
  buffer,
  mimeType,
  originalName,
  frameCount,
  windows,
}: {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
  frameCount: number;
  windows?: FrameExtractionWindow[];
}) {
  const tempDir = await mkdtemp(join(tmpdir(), "asj-openai-video-"));
  const safeName = basename(
    originalName || `session-video${extensionForMimeType(mimeType)}`,
  );
  const filePath = join(tempDir, safeName);

  try {
    await writeFile(filePath, buffer);

    const durationSeconds = await getVideoDurationSeconds(filePath);
    const extractionWindows: FrameExtractionWindow[] =
      windows && windows.length > 0
        ? windows
        : [
            {
              startSeconds: 0,
              endSeconds:
                durationSeconds && durationSeconds > 0
                  ? durationSeconds
                  : Math.max(frameCount, 1),
            },
          ];
    const framesPerWindow = Math.max(
      1,
      Math.ceil(frameCount / Math.max(extractionWindows.length, 1)),
    );

    const frames = (
      await Promise.all(
        extractionWindows.map((window, index) =>
          extractFramesFromWindow({
            filePath,
            tempDir,
            window,
            frameCount: framesPerWindow,
            prefix: `frame-${index + 1}`,
          }),
        ),
      )
    )
      .flat()
      .sort((first, second) => first.timestampSeconds - second.timestampSeconds)
      .slice(0, frameCount);

    if (frames.length === 0) {
      throw new Error("No frames could be extracted from the uploaded video.");
    }

    return {
      durationSeconds,
      frames: frames.map(({ timestampSeconds, dataUrl }) => ({
        dataUrl,
        timestampSeconds,
        timestampLabel: formatTimestamp(timestampSeconds),
      })),
    };
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

async function extractVideoThumbnail({
  buffer,
  mimeType,
  originalName,
}: {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}) {
  const tempDir = await mkdtemp(join(tmpdir(), "asj-video-thumbnail-"));
  const safeName = basename(
    originalName || `session-video${extensionForMimeType(mimeType)}`,
  );
  const filePath = join(tempDir, safeName);
  const thumbnailPath = join(tempDir, "thumbnail.jpg");

  try {
    await writeFile(filePath, buffer);

    const durationSeconds = await getVideoDurationSeconds(filePath);
    const timestampSeconds =
      durationSeconds && durationSeconds > 1
        ? Math.min(Math.max(durationSeconds * 0.2, 0.5), durationSeconds - 0.25)
        : 0;

    await execFileAsync(ffmpegPath ?? "ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      String(timestampSeconds),
      "-i",
      filePath,
      "-frames:v",
      "1",
      "-vf",
      "scale=720:-1",
      "-q:v",
      "3",
      thumbnailPath,
    ]);

    const bytes = await readFile(thumbnailPath);

    return {
      timestampSeconds,
      dataUrl: `data:image/jpeg;base64,${bytes.toString("base64")}`,
    };
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

async function extractFramesFromWindow({
  filePath,
  tempDir,
  window,
  frameCount,
  prefix,
}: {
  filePath: string;
  tempDir: string;
  window: FrameExtractionWindow;
  frameCount: number;
  prefix: string;
}) {
  const startSeconds = Math.max(window.startSeconds, 0);
  const endSeconds = Math.max(window.endSeconds, startSeconds + 0.5);
  const durationSeconds = Math.max(endSeconds - startSeconds, 0.5);
  const framePattern = join(tempDir, `${prefix}-%03d.jpg`);
  const fps = Math.max(Math.min(frameCount / durationSeconds, 6), 0.25);

  await execFileAsync(ffmpegPath ?? "ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    String(startSeconds),
    "-t",
    String(durationSeconds),
    "-i",
    filePath,
    "-vf",
    `fps=${fps.toFixed(4)},scale=${openAiFrameWidth}:-1`,
    "-frames:v",
    String(frameCount),
    "-q:v",
    "2",
    framePattern,
  ]);

  const frameFiles = (await readdir(tempDir))
    .filter(
      (fileName) =>
        fileName.startsWith(`${prefix}-`) && fileName.endsWith(".jpg"),
    )
    .sort()
    .slice(0, frameCount);

  return Promise.all(
    frameFiles.map(async (fileName, index) => {
      const bytes = await readFile(join(tempDir, fileName));
      const timestampSeconds = Math.min(
        startSeconds +
          (durationSeconds / Math.max(frameFiles.length - 1, 1)) * index,
        endSeconds,
      );

      return {
        timestampSeconds,
        dataUrl: `data:image/jpeg;base64,${bytes.toString("base64")}`,
      };
    }),
  );
}

async function getVideoDurationSeconds(filePath: string) {
  try {
    await execFileAsync(ffmpegPath ?? "ffmpeg", ["-i", filePath]);
  } catch (error) {
    const stderr =
      typeof error === "object" && error && "stderr" in error
        ? String((error as { stderr?: unknown }).stderr)
        : "";
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

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function buildOpenAiFrameInputContent(
  frames: Array<{
    dataUrl: string;
    timestampLabel: string;
  }>,
) {
  return frames.flatMap((frame, index) => [
    {
      type: "input_text" as const,
      text: `Frame ${index + 1}: approximately ${frame.timestampLabel} after video start.`,
    },
    {
      type: "input_image" as const,
      image_url: frame.dataUrl,
      detail: "high" as const,
    },
  ]);
}

function extensionForMimeType(mimeType: string) {
  if (mimeType === "video/mp4") {
    return ".mp4";
  }

  if (mimeType === "video/x-m4v") {
    return ".m4v";
  }

  return ".mov";
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

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeSessionId = metadata.sessionId.replace(/[^a-zA-Z0-9_-]/g, "-");
  const artifactPath = join(
    benchmarkArtifactDir,
    `${timestamp}-${safeSessionId || "session"}-openai-benchmark.json`,
  );

  await writeFile(
    artifactPath,
    JSON.stringify(
      {
        benchmark: {
          provider: "openai",
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

async function persistEvidenceResultForLinkedMoment({
  metadata,
  evidence,
  rawResponseText,
  model,
  qualityMode,
  requiresUserConfirmation,
  analysisJobId,
}: {
  metadata: SessionMetadata;
  evidence: TaxonomyGatedEvidence;
  rawResponseText: string;
  model: string;
  qualityMode: "standard" | "degraded";
  requiresUserConfirmation: boolean;
  analysisJobId?: string;
}) {
  const client = getSupabaseServerClient();

  if (!client) {
    return {
      status: "skipped" as const,
      reason: "Supabase service role env is not configured.",
    };
  }

  const linkedMoment = await findLinkedMomentForEvidence(metadata);

  if (!linkedMoment) {
    return {
      status: "skipped" as const,
      reason: "No existing Moment was linked to this evidence request.",
    };
  }

  const now = new Date().toISOString();
  const resolvedAnalysisJobId =
    analysisJobId ??
    (await createCompletedEvidenceAnalysisJob({
      userId: linkedMoment.user_id,
      momentId: linkedMoment.id,
      model,
      now,
    }));

  const evidenceResultValues = {
    user_id: linkedMoment.user_id,
    moment_id: linkedMoment.id,
    analysis_job_id: resolvedAnalysisJobId,
    provider: "gemini",
    model,
    status: evidence.parseFailed ? "failed" : "completed",
    quality_mode: qualityMode,
    predicted_trick: evidence.primaryCandidate.name,
    family: evidence.family.value,
    confidence: evidence.confidence,
    needs_review: requiresUserConfirmation,
    consistency_status: evidence.consistencyStatus,
    consistency_warnings: evidence.consistencyWarnings,
    approach_observed_facts: evidence.approachObservedFacts,
    approach_observed_facts_v2: evidence.approachObservedFactsV2,
    approach_decision_v2: evidence.approachDecisionV2,
    approach_v2_signals: evidence.approachObservedFactsV2?.signals ?? [],
    approach_v2_conflict_summary:
      evidence.approachObservedFactsV2?.conflictSummary ?? null,
    pop_observed_facts: evidence.popObservedFacts,
    pop_validation: evidence.popValidation,
    rotation_observed_facts: evidence.rotationObservedFacts,
    rotation_validation: evidence.rotationValidation,
    grab_observed_facts: evidence.grabObservedFacts,
    grab_validation: evidence.grabValidation,
    landing_observed_facts: evidence.landingObservedFacts,
    landing_validation: evidence.landingValidation,
    inversion_observed_facts: evidence.inversionObservedFacts,
    temporal_windows: evidence.temporalWindows,
    evidence_windows: evidence.evidenceWindows,
    observations: evidence.observations,
    raw_response_text: rawResponseText,
    error_message: evidence.parseFailed
      ? evidence.uncertainty.reasons.join(" ")
      : null,
  };
  let evidenceResultQuery = await client
    .from("evidence_results")
    .insert(evidenceResultValues)
    .select("id")
    .single();

  if (isMissingApproachV2ColumnError(evidenceResultQuery.error)) {
    const {
      approach_observed_facts_v2,
      approach_decision_v2,
      approach_v2_signals,
      approach_v2_conflict_summary,
      pop_observed_facts,
      pop_validation,
      rotation_observed_facts,
      rotation_validation,
      grab_observed_facts,
      grab_validation,
      landing_observed_facts,
      landing_validation,
      ...v1EvidenceResultValues
    } = evidenceResultValues;

    console.warn(
      "ApproachObservedFacts v2 columns are not applied yet; saving v1 evidence result only.",
    );
    evidenceResultQuery = await client
      .from("evidence_results")
      .insert(v1EvidenceResultValues)
      .select("id")
      .single();
  }

  const { data: evidenceResult, error: evidenceResultError } =
    evidenceResultQuery;

  if (evidenceResultError) {
    throw new Error(
      `Failed to insert evidence_results: ${evidenceResultError.message}`,
    );
  }

  const completedEvidenceResultId = evidence.parseFailed
    ? await findCompletedEvidenceResultIdForMoment({
        client,
        momentId: linkedMoment.id,
        preferredEvidenceResultId: linkedMoment.latest_evidence_result_id,
      })
    : (evidenceResult.id as string);
  const shouldKeepMomentCompleted =
    evidence.parseFailed && Boolean(completedEvidenceResultId);

  const { error: momentUpdateError } = await client
    .from("moments")
    .update({
      status: shouldKeepMomentCompleted
        ? "completed"
        : evidence.parseFailed
          ? "failed"
          : "completed",
      latest_analysis_job_id: resolvedAnalysisJobId,
      latest_evidence_result_id: shouldKeepMomentCompleted
        ? completedEvidenceResultId
        : evidenceResult.id,
      updated_at: now,
    })
    .eq("id", linkedMoment.id);

  if (momentUpdateError) {
    throw new Error(`Failed to update moments: ${momentUpdateError.message}`);
  }

  if (analysisJobId) {
    const { error: analysisJobUpdateError } = await client
      .from("analysis_jobs")
      .update({
        status: evidence.parseFailed ? "failed" : "completed",
        model,
        completed_at: evidence.parseFailed ? null : now,
        failed_at: evidence.parseFailed ? now : null,
        last_error: evidence.parseFailed
          ? evidence.uncertainty.reasons.join(" ").slice(0, 1000)
          : null,
        updated_at: now,
      })
      .eq("id", analysisJobId);

    if (analysisJobUpdateError) {
      throw new Error(
        `Failed to update analysis_jobs: ${analysisJobUpdateError.message}`,
      );
    }
  }

  return {
    status: "inserted" as const,
    momentId: linkedMoment.id,
    analysisJobId: resolvedAnalysisJobId,
    evidenceResultId: evidenceResult.id as string,
  };
}

async function createCompletedEvidenceAnalysisJob({
  userId,
  momentId,
  model,
  now,
}: {
  userId: string;
  momentId: string;
  model: string;
  now: string;
}) {
  const client = getSupabaseServerClient();

  if (!client) {
    throw new Error("Supabase service role env is not configured.");
  }

  const { data, error } = await client
    .from("analysis_jobs")
    .insert({
      user_id: userId,
      moment_id: momentId,
      kind: "evidence_extraction",
      status: "completed",
      provider: "gemini",
      model,
      attempts: 1,
      max_attempts: 1,
      started_at: now,
      completed_at: now,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to insert analysis_jobs: ${error.message}`);
  }

  return data.id as string;
}

async function createQueuedEvidenceAnalysisJob({
  userId,
  momentId,
}: {
  userId: string;
  momentId: string;
}) {
  const client = getSupabaseServerClient();

  if (!client) {
    return null;
  }

  const { data, error } = await client
    .from("analysis_jobs")
    .insert({
      user_id: userId,
      moment_id: momentId,
      kind: "evidence_extraction",
      status: "queued",
      provider: "gemini",
      model: geminiModel,
      attempts: 0,
      max_attempts: 1,
    })
    .select("id,status")
    .single();

  if (error) {
    throw new Error(`Failed to insert queued analysis_jobs: ${error.message}`);
  }

  const completedEvidenceResultId = await findCompletedEvidenceResultIdForMoment({
    client,
    momentId,
  });
  const { error: momentUpdateError } = await client
    .from("moments")
    .update({
      status: completedEvidenceResultId ? "completed" : "queued",
      latest_analysis_job_id: data.id,
      ...(completedEvidenceResultId
        ? { latest_evidence_result_id: completedEvidenceResultId }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", momentId);

  if (momentUpdateError) {
    throw new Error(
      `Failed to link queued analysis job to moment: ${momentUpdateError.message}`,
    );
  }

  return {
    id: data.id as string,
    status: data.status as "queued",
  };
}

async function getOrCreateQueuedEvidenceAnalysisJob(metadata: SessionMetadata) {
  const client = getSupabaseServerClient();

  if (!client) {
    throw new Error("Supabase service role env is not configured.");
  }

  const linkedMoment = await findLinkedMomentForEvidence(metadata);

  if (!linkedMoment) {
    return null;
  }

  const { data: existingJobs, error: existingJobError } = await client
    .from("analysis_jobs")
    .select("id,status")
    .eq("moment_id", linkedMoment.id)
    .eq("kind", "evidence_extraction")
    .in("status", ["queued", "processing"])
    .order("queued_at", { ascending: false })
    .limit(1);

  if (existingJobError) {
    throw new Error(`Failed to find active analysis job: ${existingJobError.message}`);
  }

  const existingJob = existingJobs?.[0];

  if (existingJob?.id && existingJob?.status) {
    return {
      id: existingJob.id as string,
      momentId: linkedMoment.id,
      userId: linkedMoment.user_id,
      status: existingJob.status as "queued" | "processing",
    };
  }

  const queuedJob = await createQueuedEvidenceAnalysisJob({
    userId: linkedMoment.user_id,
    momentId: linkedMoment.id,
  });

  if (!queuedJob) {
    return null;
  }

  return {
    id: queuedJob.id,
    momentId: linkedMoment.id,
    userId: linkedMoment.user_id,
    status: queuedJob.status,
  };
}

async function processQueuedEvidenceAnalysisJob({
  analysisJobId,
  metadata,
  file,
}: {
  analysisJobId: string;
  metadata: SessionMetadata;
  file: EvidenceJobVideoFile;
}) {
  const claimedJob = await markEvidenceAnalysisJobProcessing(analysisJobId);

  if (!claimedJob) {
    return;
  }

  try {
    await runGeminiEvidenceExtraction({
      analysisJobId,
      metadata,
      file,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Evidence extraction failed.";
    console.error("Async Gemini evidence extraction failed:", message);
    await markEvidenceAnalysisJobFailed({
      analysisJobId,
      momentId: claimedJob.momentId,
      errorMessage: message,
    });
  }
}

async function markEvidenceAnalysisJobProcessing(analysisJobId: string) {
  const client = getSupabaseServerClient();

  if (!client) {
    throw new Error("Supabase service role env is not configured.");
  }

  const now = new Date().toISOString();
  const { data, error } = await client
    .from("analysis_jobs")
    .update({
      status: "processing",
      attempts: 1,
      started_at: now,
      updated_at: now,
    })
    .eq("id", analysisJobId)
    .eq("status", "queued")
    .select("id,moment_id")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to mark analysis job processing: ${error.message}`);
  }

  if (!data?.id || !data?.moment_id) {
    return null;
  }

  const completedEvidenceResultId = await findCompletedEvidenceResultIdForMoment({
    client,
    momentId: data.moment_id as string,
  });
  const { error: momentUpdateError } = await client
    .from("moments")
    .update({
      status: completedEvidenceResultId ? "completed" : "processing",
      latest_analysis_job_id: analysisJobId,
      ...(completedEvidenceResultId
        ? { latest_evidence_result_id: completedEvidenceResultId }
        : {}),
      updated_at: now,
    })
    .eq("id", data.moment_id);

  if (momentUpdateError) {
    throw new Error(
      `Failed to mark moment processing: ${momentUpdateError.message}`,
    );
  }

  return {
    id: data.id as string,
    momentId: data.moment_id as string,
  };
}

async function markEvidenceAnalysisJobFailed({
  analysisJobId,
  momentId,
  errorMessage,
}: {
  analysisJobId: string;
  momentId: string;
  errorMessage: string;
}) {
  const client = getSupabaseServerClient();

  if (!client) {
    return;
  }

  const now = new Date().toISOString();
  const safeErrorMessage = errorMessage.slice(0, 1000);
  const { error: jobError } = await client
    .from("analysis_jobs")
    .update({
      status: "failed",
      last_error: safeErrorMessage,
      failed_at: now,
      updated_at: now,
    })
    .eq("id", analysisJobId);

  if (jobError) {
    console.error(`Failed to mark analysis job failed: ${jobError.message}`);
  }

  const completedEvidenceResultId = await findCompletedEvidenceResultIdForMoment({
    client,
    momentId,
  });
  const { error: momentError } = await client
    .from("moments")
    .update({
      status: completedEvidenceResultId ? "completed" : "failed",
      latest_analysis_job_id: analysisJobId,
      ...(completedEvidenceResultId
        ? { latest_evidence_result_id: completedEvidenceResultId }
        : {}),
      updated_at: now,
    })
    .eq("id", momentId);

  if (momentError) {
    console.error(`Failed to mark moment failed: ${momentError.message}`);
  }
}

async function runGeminiEvidenceExtraction({
  analysisJobId,
  metadata,
  file,
}: {
  analysisJobId: string;
  metadata: SessionMetadata;
  file: EvidenceJobVideoFile;
}) {
  const usageKey = todayKey("gemini-evidence");

  if (!mockAiAnalysisEnabled && isDailyUsageLimitExceeded(usageKey)) {
    throw new Error(
      "Daily evidence extraction limit reached. This limit keeps development API spend under control.",
    );
  }

  let rawOutputText: string;
  let actualModel: string;
  let finishReason = "unknown";
  let mockInfo: Record<string, unknown> | undefined;

  if (mockAiAnalysisEnabled) {
    const fixture = getMockAiFixture(metadata);
    await applyMockAiLatency();
    rawOutputText = stringifyMockAiPayload(fixture.evidencePayload);
    actualModel = fixture.evidenceModel;
    finishReason = "mock";
    mockInfo = buildMockAiInfo(fixture.id, [
      "gemini_files_upload",
      "gemini_generate_content",
    ]);
    console.log(
      `[Mock AI] evidence fixture=${fixture.id} model=${actualModel} externalCallsSkipped=gemini_files_upload,gemini_generate_content`,
    );
  } else {
    const client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    const uploadedFile = await uploadVideoForGemini({
      client,
      buffer: file.buffer,
      mimeType: file.mimetype || "video/quicktime",
      originalName: file.originalname,
    });

    const prompt = buildGeminiEvidencePrompt({
      ...metadata,
      fileName: file.originalname,
    });

    const result = await withTimeout(
      generateGeminiContentWithResilience({
        client,
        operation: "evidence extraction",
        params: {
          model: geminiModel,
          contents: [
            createPartFromUri(
              uploadedFile.uri ?? "",
              uploadedFile.mimeType ?? file.mimetype,
            ),
            prompt,
          ],
          config: {
            maxOutputTokens: geminiEvidenceMaxOutputTokens,
            responseMimeType: "application/json",
            responseSchema: geminiEvidenceResponseSchema,
          },
        },
      }),
      geminiEvidenceRequestTimeoutMs,
      "Gemini evidence extraction timed out.",
    );

    rawOutputText = result.response.text ?? "";
    actualModel = result.model;
    finishReason = result.response.candidates?.[0]?.finishReason ?? "unknown";
  }

  console.log(
    `[Gemini evidence raw] model=${actualModel} outputChars=${rawOutputText.length} finishReason=${finishReason}`,
  );
  const evidence = parseGeminiEvidence(rawOutputText);
  const qualityMode = geminiQualityMode(actualModel);
  const qualityAdjustedEvidence =
    qualityMode === "degraded" ? markEvidenceAsDegraded(evidence) : evidence;
  const taxonomyAdjustedEvidence = applyWakeboardTaxonomyGates(
    qualityAdjustedEvidence,
  );
  const normalizedEvidence = applyGeminiEvidenceConsistency(
    taxonomyAdjustedEvidence,
  );
  const candidateTrace = buildCandidateTrace({
    rawEvidence: qualityAdjustedEvidence,
    taxonomyAdjustedEvidence,
    normalizedEvidence,
  });
  const knowledgeInsights = applyWakeboardKnowledgeRules({
    ...normalizedEvidence,
    id: `evidence-${Date.now()}`,
    sessionId: metadata.sessionId,
    status: normalizedEvidence.parseFailed ? "failed" : "completed",
    provider: "gemini",
    model: actualModel,
    qualityMode,
    recoveredFromPartial: isPartialRecoveredEvidence(normalizedEvidence),
    requiresUserConfirmation: false,
    rawResponseText: rawOutputText,
    createdAt: new Date().toISOString(),
  } as GeminiEvidenceResult);
  const coachingInsightContext =
    buildCoachingInsightContext(knowledgeInsights);
  const recoveredFromPartial = isPartialRecoveredEvidence(normalizedEvidence);
  const requiresUserConfirmation =
    qualityMode === "degraded" ||
    recoveredFromPartial ||
    normalizedEvidence.consistencyStatus !== "valid" ||
    normalizedEvidence.confidence === "low" ||
    normalizedEvidence.primaryCandidate.confidence === "low" ||
    normalizedEvidence.edgeLoadValidation.needsReview ||
    normalizedEvidence.popValidation.needsReview ||
    normalizedEvidence.rotationValidation.needsReview ||
    normalizedEvidence.grabValidation.needsReview ||
    normalizedEvidence.landingValidation.needsReview;
  if (!mockAiAnalysisEnabled) {
    recordDailyUsage(usageKey);
  }
  console.log(
    `[Gemini evidence] model=${actualModel} qualityMode=${qualityMode} recoveredFromPartial=${recoveredFromPartial} consistencyStatus=${normalizedEvidence.consistencyStatus} requiresUserConfirmation=${requiresUserConfirmation} primaryCandidate=${normalizedEvidence.primaryCandidate.name}`,
  );

  const evidenceResponse = {
    id: `evidence-${Date.now()}`,
    sessionId: metadata.sessionId,
    status: normalizedEvidence.parseFailed ? "failed" : "completed",
    provider: "gemini",
    model: actualModel,
    mock: mockAiAnalysisEnabled ? true : undefined,
    mockInfo,
    qualityMode,
    recoveredFromPartial,
    requiresUserConfirmation,
    consistencyStatus: normalizedEvidence.consistencyStatus,
    consistencyWarnings: normalizedEvidence.consistencyWarnings,
    rawFamilyCandidate: normalizedEvidence.rawFamilyCandidate,
    safeFamilyCandidate: normalizedEvidence.safeFamilyCandidate,
    taxonomyWarnings: normalizedEvidence.taxonomyWarnings,
    gateFailures: normalizedEvidence.gateFailures,
    candidateTrace,
    rawResponseText: rawOutputText,
    primaryCandidate: normalizedEvidence.primaryCandidate,
    alternativeCandidates: normalizedEvidence.alternativeCandidates,
    family: normalizedEvidence.family,
    temporalWindows: normalizedEvidence.temporalWindows,
    rawApproachType: normalizedEvidence.rawApproachType,
    approachObservedFacts: normalizedEvidence.approachObservedFacts,
    edgeLoadObservedFacts: normalizedEvidence.edgeLoadObservedFacts,
    edgeLoadValidation: normalizedEvidence.edgeLoadValidation,
    popObservedFacts: normalizedEvidence.popObservedFacts,
    popValidation: normalizedEvidence.popValidation,
    rotationObservedFacts: normalizedEvidence.rotationObservedFacts,
    rotationValidation: normalizedEvidence.rotationValidation,
    grabObservedFacts: normalizedEvidence.grabObservedFacts,
    grabValidation: normalizedEvidence.grabValidation,
    landingObservedFacts: normalizedEvidence.landingObservedFacts,
    landingValidation: normalizedEvidence.landingValidation,
    approachObservedFactsV2: normalizedEvidence.approachObservedFactsV2,
    inversionObservedFacts: normalizedEvidence.inversionObservedFacts,
    approachDecision: normalizedEvidence.approachDecision,
    approachDecisionV2: normalizedEvidence.approachDecisionV2,
    approachWarnings: normalizedEvidence.approachWarnings,
    approachType: normalizedEvidence.approachType,
    rotationType: normalizedEvidence.rotationType,
    landingOutcome: normalizedEvidence.landingOutcome,
    confidence: normalizedEvidence.confidence,
    evidence: normalizedEvidence.evidence,
    evidenceWindows: normalizedEvidence.evidenceWindows,
    observations: normalizedEvidence.observations,
    uncertainty: normalizedEvidence.uncertainty,
    knowledgeInsights,
    coachingInsightContext,
    createdAt: new Date().toISOString(),
  };

  captureEvidenceDebug({
    metadata,
    file: {
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    },
    rawResponseText: rawOutputText,
    rawParsedEvidence: qualityAdjustedEvidence,
    parsedEvidence: normalizedEvidence,
    response: evidenceResponse,
  });

  const persistence = await persistEvidenceResultForLinkedMoment({
    metadata,
    evidence: normalizedEvidence,
    rawResponseText: rawOutputText,
    model: actualModel,
    qualityMode,
    requiresUserConfirmation,
    analysisJobId,
  });

  if (persistence.status !== "skipped") {
    Object.assign(evidenceResponse, {
      supabasePersistence: persistence,
    });
  }

  try {
    await writeEvidenceCaptureArtifact({
      metadata,
      fileName: file.originalname,
      videoMimeType: file.mimetype,
      videoBytes: file.size,
      rawGeminiResponse: rawOutputText,
      rawParsedEvidence: evidence,
      qualityAdjustedEvidence,
      taxonomyGateResult: taxonomyAdjustedEvidence,
      normalizedResult: normalizedEvidence,
      evidenceResponse,
      candidateTrace,
      knowledgeInsights,
      coachingInsightContext,
      modelInfo: {
        requestedModel: geminiModel,
        fallbackModel: geminiFallbackModel,
        actualModel,
        qualityMode,
        degraded: qualityMode === "degraded",
        recoveredFromPartial,
        requiresUserConfirmation,
        finishReason,
        mock: mockAiAnalysisEnabled,
        mockInfo,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown artifact error";
    console.error("Failed to save Gemini evidence capture artifact:", message);
  }
}

async function findLinkedMomentForEvidence(metadata: SessionMetadata) {
  const client = getSupabaseServerClient();

  if (!client) {
    return null;
  }

  if (isUuid(metadata.momentId)) {
    return findMomentByColumn("id", metadata.momentId);
  }

  if (isUuid(metadata.sessionId)) {
    return findMomentByColumn("session_id", metadata.sessionId);
  }

  return null;
}

async function findMomentByColumn(column: "id" | "session_id", value: string) {
  const client = getSupabaseServerClient();

  if (!client) {
    return null;
  }

  const { data, error } = await client
    .from("moments")
    .select("id,user_id,status,latest_evidence_result_id")
    .eq(column, value)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to find linked Moment: ${error.message}`);
  }

  return data as LinkedMoment | null;
}

async function findCompletedEvidenceResultIdForMoment({
  client,
  momentId,
  preferredEvidenceResultId,
}: {
  client: SupabaseServerClient;
  momentId: string;
  preferredEvidenceResultId?: string | null;
}) {
  if (preferredEvidenceResultId) {
    const { data, error } = await client
      .from("evidence_results")
      .select("id,status")
      .eq("id", preferredEvidenceResultId)
      .eq("moment_id", momentId)
      .maybeSingle();

    if (error) {
      throw new Error(
        `Failed to inspect latest evidence result: ${error.message}`,
      );
    }

    if (data?.id && data.status === "completed") {
      return data.id as string;
    }
  }

  const { data, error } = await client
    .from("evidence_results")
    .select("id")
    .eq("moment_id", momentId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(
      `Failed to find completed evidence result: ${error.message}`,
    );
  }

  return data?.[0]?.id ? (data[0].id as string) : null;
}

async function getOrCreateDefaultSupabaseUser() {
  const client = getSupabaseServerClient();

  if (!client) {
    throw new Error("Supabase service role env is not configured.");
  }

  const email = "standalone-app@action-sports-journal.invalid";
  const { data: existingUsers, error: selectError } = await client
    .from("users")
    .select("id")
    .eq("email", email)
    .limit(1);

  if (selectError) {
    throw new Error(`Failed to find default user: ${selectError.message}`);
  }

  if (existingUsers?.[0]?.id) {
    return existingUsers[0].id as string;
  }

  const { data, error } = await client
    .from("users")
    .insert({
      email,
      display_name: "Standalone App User",
      locale: "ko-KR",
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to insert default user: ${error.message}`);
  }

  return data.id as string;
}

function getSupabaseServerClient() {
  if (supabaseServerClient !== undefined) {
    return supabaseServerClient;
  }

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    supabaseServerClient = null;
    return supabaseServerClient;
  }

  supabaseServerClient = createSupabaseClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabaseServerClient;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function readMomentStatus(value: unknown, fallback?: "queued") {
  if (
    value === "queued" ||
    value === "processing" ||
    value === "completed" ||
    value === "failed"
  ) {
    return value;
  }

  return fallback;
}

function isIncompleteQueuedMomentListRow(moment: Record<string, unknown>) {
  if (moment.status !== "queued") {
    return false;
  }

  if (typeof moment.latest_evidence_result_id === "string") {
    return false;
  }

  return (
    !isNonEmptyString(moment.source_video_uri) &&
    !isNonEmptyString(moment.file_name) &&
    !isPositiveNumber(moment.file_size) &&
    !isPositiveNumber(moment.duration_ms)
  );
}

function isNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveNumber(value: unknown) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) && numberValue > 0;
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function buildCandidateTrace({
  rawEvidence,
  taxonomyAdjustedEvidence,
  normalizedEvidence,
}: {
  rawEvidence: NormalizedGeminiEvidence;
  taxonomyAdjustedEvidence: TaxonomyGatedEvidence;
  normalizedEvidence: TaxonomyGatedEvidence;
}): CandidateTrace {
  const rawCandidateName = nonEmptyTraceValue(rawEvidence.primaryCandidate.name);
  const rawFamily = nonEmptyTraceValue(rawEvidence.family.value);
  const rawRotationType = nonEmptyTraceValue(rawEvidence.rotationType.value);
  const safePredictedTrick =
    nonEmptyTraceValue(normalizedEvidence.primaryCandidate.name) ?? "확인 필요";
  const safeFamily =
    nonEmptyTraceValue(normalizedEvidence.family.value) ?? "확인 필요";
  const downgradedBy = uniqueStrings([
    rawCandidateName && rawCandidateName !== safePredictedTrick
      ? `candidate changed from ${rawCandidateName} to ${safePredictedTrick}`
      : undefined,
    rawFamily && rawFamily !== safeFamily
      ? `family changed from ${rawFamily} to ${safeFamily}`
      : undefined,
    ...(taxonomyAdjustedEvidence.taxonomyWarnings ?? []),
    ...(taxonomyAdjustedEvidence.gateFailures ?? []),
    ...(normalizedEvidence.consistencyWarnings ?? []),
    normalizedEvidence.rotationValidation?.needsReview
      ? "rotationValidation requires review"
      : undefined,
    normalizedEvidence.popValidation?.needsReview
      ? "popValidation requires review"
      : undefined,
    normalizedEvidence.grabValidation?.needsReview
      ? "grabValidation requires review"
      : undefined,
    normalizedEvidence.landingValidation?.needsReview
      ? "landingValidation requires review"
      : undefined,
  ]);
  const observedSignals = collectCandidateTraceSignals(normalizedEvidence);
  const needsReview =
    normalizedEvidence.consistencyStatus !== "valid" ||
    normalizedEvidence.confidence === "low" ||
    normalizedEvidence.primaryCandidate.confidence === "low" ||
    downgradedBy.length > 0;

  return {
    rawCandidateName,
    rawFamily,
    rawRotationType,
    safePredictedTrick,
    safeFamily,
    observedSignals,
    downgradedBy,
    needsReview,
    displayLabel: candidateTraceDisplayLabel({
      rawCandidateName,
      rawFamily,
      rawRotationType,
      safePredictedTrick,
      observedSignals,
      needsReview,
    }),
    confidence: needsReview
      ? "low"
      : (normalizedEvidence.confidence as CandidateTrace["confidence"]),
  };
}

function collectCandidateTraceSignals(evidence: TaxonomyGatedEvidence) {
  const signals: string[] = [];
  const approach = evidence.approachDecisionV2?.value;
  const approachConfidence = evidence.approachDecisionV2?.confidence;
  const rotation = evidence.rotationObservedFacts;
  const inversion = evidence.inversionObservedFacts;
  const pop = evidence.popObservedFacts;

  if (approach && approach !== "unknown" && approach !== "ambiguous") {
    signals.push(`approach=${approach}/${approachConfidence ?? "unknown"}`);
  }

  if (pop?.popType || pop?.timing || pop?.intensity) {
    signals.push(
      `pop=${[pop.popType, pop.timing, pop.intensity]
        .filter(Boolean)
        .join("/")}/${pop.confidence}`,
    );
  }

  if (rotation?.rotationAxis) {
    signals.push(`rotationAxis=${rotation.rotationAxis}/${rotation.confidence}`);
  }

  if (rotation?.inversionDetected !== undefined) {
    signals.push(`inversionDetected=${String(rotation.inversionDetected)}`);
  }

  if (inversion?.boardAboveHead === true) {
    signals.push("boardAboveHead=true");
  }

  if (inversion?.bodyInverted === true) {
    signals.push("bodyInverted=true");
  }

  if (inversion?.rollAxisObserved === true) {
    signals.push("rollAxisObserved=true");
  }

  return uniqueStrings(signals);
}

function candidateTraceDisplayLabel({
  rawCandidateName,
  rawFamily,
  rawRotationType,
  safePredictedTrick,
  observedSignals,
  needsReview,
}: {
  rawCandidateName?: string;
  rawFamily?: string;
  rawRotationType?: string;
  safePredictedTrick: string;
  observedSignals: string[];
  needsReview: boolean;
}) {
  if (!needsReview) {
    return undefined;
  }

  const rawText = normalizeDomainText(
    `${rawCandidateName ?? ""} ${rawFamily ?? ""} ${rawRotationType ?? ""}`,
  );
  const signalText = normalizeDomainText(observedSignals.join(" "));
  const safeText = normalizeDomainText(safePredictedTrick);
  const safeIsUnknown =
    includesAnyDomainTerm(safeText, ["확인 필요", "unknown", "unknown invert"]) ||
    safeText.length === 0;
  const hasBackRollRaw = includesAnyDomainTerm(rawText, [
    "back roll",
    "backroll",
    "백롤",
  ]);
  const hasBackRollSignals =
    includesAnyDomainTerm(signalText, ["approach=heelside"]) &&
    includesAnyDomainTerm(signalText, ["rotationaxis=roll_axis"]) &&
    includesAnyDomainTerm(signalText, [
      "inversiondetected=true",
      "boardabovehead=true",
      "bodyinverted=true",
      "rollaxisobserved=true",
    ]);

  if (safeIsUnknown && (hasBackRollRaw || hasBackRollSignals)) {
    return "관찰된 가능성: 백롤 계열 · 확인 필요";
  }

  if (safeIsUnknown && rawCandidateName && !isUnknownCandidateName(rawCandidateName)) {
    return `관찰된 가능성: ${rawCandidateName} · 확인 필요`;
  }

  return undefined;
}

function isUnknownCandidateName(value: string) {
  return includesAnyDomainTerm(normalizeDomainText(value), [
    "확인 필요",
    "unknown",
    "n/a",
  ]);
}

function nonEmptyTraceValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function uniqueStrings(values: Array<string | undefined>) {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => Boolean(value && value.trim()))
        .map((value) => value.trim()),
    ),
  );
}

async function writeEvidenceCaptureArtifact({
  metadata,
  fileName,
  videoMimeType,
  videoBytes,
  rawGeminiResponse,
  rawParsedEvidence,
  qualityAdjustedEvidence,
  taxonomyGateResult,
  normalizedResult,
  evidenceResponse,
  candidateTrace,
  knowledgeInsights,
  coachingInsightContext,
  modelInfo,
}: {
  metadata: SessionMetadata;
  fileName: string;
  videoMimeType: string;
  videoBytes: number;
  rawGeminiResponse: string;
  rawParsedEvidence: NormalizedGeminiEvidence;
  qualityAdjustedEvidence: NormalizedGeminiEvidence;
  taxonomyGateResult: TaxonomyGatedEvidence;
  normalizedResult: TaxonomyGatedEvidence;
  evidenceResponse: Record<string, unknown>;
  candidateTrace: CandidateTrace;
  knowledgeInsights: ReturnType<typeof applyWakeboardKnowledgeRules>;
  coachingInsightContext: ReturnType<typeof buildCoachingInsightContext>;
  modelInfo: {
    requestedModel: string;
    fallbackModel: string;
    actualModel: string;
    qualityMode: "standard" | "degraded";
    degraded: boolean;
    recoveredFromPartial: boolean;
    requiresUserConfirmation: boolean;
    finishReason: string;
    mock?: boolean;
    mockInfo?: Record<string, unknown>;
  };
}) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  await mkdir(evidenceCaptureArtifactDir, { recursive: true });

  const timestamp = evidenceCaptureTimestamp();
  const predictedTrick = safeFileSegment(
    normalizedResult.primaryCandidate.name || "unknown-trick",
  );
  const model = safeFileSegment(modelInfo.actualModel || "unknown-model");
  const artifactPath = join(
    evidenceCaptureArtifactDir,
    `${timestamp}-${predictedTrick}-${model}.json`,
  );
  const createdAt = new Date().toISOString();

  await writeFile(
    artifactPath,
    JSON.stringify(
      {
        capture: {
          kind: modelInfo.mock ? "mock-gemini-evidence" : "gemini-evidence",
          createdAt,
          nodeEnv: process.env.NODE_ENV ?? "development",
        },
        modelInfo,
        session: metadata,
        video: {
          fileName,
          mimeType: videoMimeType,
          bytes: videoBytes,
        },
        rawGeminiResponse,
        rawParsedEvidence,
        qualityAdjustedEvidence,
        taxonomyGateResult: {
          rawFamilyCandidate: taxonomyGateResult.rawFamilyCandidate,
          safeFamilyCandidate: taxonomyGateResult.safeFamilyCandidate,
          taxonomyWarnings: taxonomyGateResult.taxonomyWarnings,
          gateFailures: taxonomyGateResult.gateFailures,
          result: taxonomyGateResult,
        },
        normalizedResult,
        approachObservedFacts: normalizedResult.approachObservedFacts,
        edgeLoadObservedFacts: normalizedResult.edgeLoadObservedFacts,
        edgeLoadValidation: normalizedResult.edgeLoadValidation,
        popObservedFacts: normalizedResult.popObservedFacts,
        popValidation: normalizedResult.popValidation,
        rotationObservedFacts: normalizedResult.rotationObservedFacts,
        rotationValidation: normalizedResult.rotationValidation,
        grabObservedFacts: normalizedResult.grabObservedFacts,
        grabValidation: normalizedResult.grabValidation,
        landingObservedFacts: normalizedResult.landingObservedFacts,
        landingValidation: normalizedResult.landingValidation,
        candidateTrace,
        knowledgeInsights,
        coachingInsightContext,
        approachObservedFactsV2: normalizedResult.approachObservedFactsV2,
        approachDecisionV2: normalizedResult.approachDecisionV2,
        approachV2Comparison: {
          v1Decision: normalizedResult.approachDecision,
          v1ApproachType: normalizedResult.approachType,
          v2Decision: normalizedResult.approachDecisionV2,
          v2ConflictSummary:
            normalizedResult.approachObservedFactsV2?.conflictSummary ?? null,
          v2Signals: normalizedResult.approachObservedFactsV2?.signals ?? [],
        },
        inversionObservedFacts: normalizedResult.inversionObservedFacts,
        consistencyCheck: {
          status: normalizedResult.consistencyStatus,
          warnings: normalizedResult.consistencyWarnings,
          requiresUserConfirmation: modelInfo.requiresUserConfirmation,
        },
        evidenceResponse,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`Saved Gemini evidence capture artifact: ${artifactPath}`);
}

function evidenceCaptureTimestamp() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");

  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join("-") +
    `-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
}

function safeFileSegment(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9가-힣_-]+/gi, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "unknown"
  );
}

function buildGeminiAnalysisPrompt({
  activityGroupName,
  title,
  notes,
  occurredAt,
  userConfirmedTrick,
  fileName,
  coachingInsightContext = [],
}: SessionMetadata & {
  fileName: string;
  coachingInsightContext?: CoachingInsightContext[];
}) {
  const coachingInsightPromptSection =
    buildCoachingInsightPromptSection(coachingInsightContext);

  return [
    "당신은 액션스포츠 코치이자 영상 분석가입니다.",
    "업로드된 세션 영상을 보고 한국어로 짧고 실용적인 피드백을 작성하세요.",
    "개발 비용을 아끼기 위해 답변은 짧게 유지하세요.",
    "영상에서 하이라이트 장면은 임의로 고정하지 말고, 실제로 눈에 띄는 장면을 기준으로 고르세요.",
    'timestampLabel은 영상 안에서 확인 가능한 대략적인 시점으로 작성하세요. 확신이 낮으면 "확인 필요"라고 작성하세요.',
    "imageUri는 서버에서 아직 캡쳐 이미지를 만들지 않으므로 항상 null로 두세요.",
    "",
    `종목: ${activityGroupName}`,
    `세션 제목: ${title}`,
    `세션 메모: ${notes || "없음"}`,
    `사용자 확인 기술: ${userConfirmedTrick || "없음"}`,
    `발생 시각: ${occurredAt}`,
    `파일명: ${fileName}`,
    coachingInsightPromptSection
      ? `\n${coachingInsightPromptSection}`
      : "",
    "",
    "출력 분량 제한:",
    "- 전체 JSON 응답은 700자 이내로 유지하세요.",
    userConfirmedTrick
      ? "- 사용자가 확인한 기술명을 우선 기준으로 삼고, 영상 근거와 맞지 않으면 불확실성을 표시하세요."
      : "- 기술명이 불확실하면 정확한 명칭을 단정하지 마세요.",
    "- summary: 짧은 1문장",
    "- highlights: 최대 2개, 각 20자 이내",
    "- highlightScenes: 최대 1개",
    "- suggestions: 최대 2개, 각 35자 이내",
  ].join("\n");
}

function buildGeminiEvidencePrompt({
  activityGroupName,
  title,
  notes,
  occurredAt,
  userConfirmedTrick,
  fileName,
}: SessionMetadata & {
  fileName: string;
}) {
  return [
    "당신은 웨이크보드 영상 판독 전문가입니다.",
    "이번 요청의 목적은 코칭 문장을 쓰는 것이 아니라, 영상에서 보이는 동작 증거를 구조화하는 것입니다.",
    "최종 목표는 프레임 몇 장으로 트릭명을 맞히는 것이 아닙니다.",
    "최종 목표는 트릭 정체성을 판단하는 올바른 event window들을 찾고 phase별로 가중해 해석하는 것입니다.",
    "중급 웨이크보더가 보았을 때 'AI가 내가 하려던 동작을 이해했다'고 느낄 수 있어야 합니다.",
    "보이는 근거와 추론을 분리하세요. 확실하지 않으면 confidence를 낮추고 uncertainty에 이유를 쓰세요.",
    "정확한 트릭명이 불확실하면 primaryCandidate에 가장 가능성 높은 이름을 쓰고, alternativeCandidates에 가능한 대안을 넣으세요.",
    "트릭명을 억지로 하나로 맞히는 것보다 경험자/코치가 보는 결정적 순간과 근거를 찾는 것이 더 중요합니다.",
    "기본 점프/스트레이트 에어/토사이드 베이직 점프도 정상 후보입니다. 인버트가 아니면 반드시 No invert 또는 기본 점프로 분류하세요.",
    "명시적 반례 후보: Toeside Basic Jump, Basic Jump, Straight Air, No invert, No roll axis, No back roll mechanics.",
    "보드가 높게 뜨거나 카메라 각도 때문에 보드가 라이더 위쪽에 보이는 것만으로 인버트/백롤이라고 판단하지 마세요.",
    "접근 방향을 판단하기 전에 반드시 takeoff/pop timestamp를 먼저 찾으세요.",
    "finalApproachWindow는 takeoffTimestamp 약 2~3초 전부터 takeoff 순간까지입니다.",
    "긴 slalom/setup 구간이 있으면 접근 방향 직접 근거로 쓰지 말고 ignoredSetupWindows에 분리하세요.",
    "approachObservedFacts는 finalApproachWindow 내부에서만 추출하세요.",
    "edgeLoadObservedFacts는 edgeDirectionEvidence의 라벨 추측과 실제 edge load 물리 근거를 분리해서 작성하세요.",
    "edgeLoadObservedFacts에는 toeEdgeLoaded, heelEdgeLoaded, edgeLoadVisible, edgeLoadTiming, boardTiltDirection, sprayDirection, lineTensionDirection, riderWeightOverEdge, edgeLoadConfidence, edgeLoadEvidenceText, antiEdgeLoadEvidence를 작성하세요.",
    "edgeLoadTiming에는 startSec, endSec, observedMoment, evidenceFrameDescription을 작성하세요.",
    "edgeLoadTiming은 board tilt, spray, rider weight가 직접 보이는 특정 시간대여야 하며 finalApproachWindow 안에 있어야 합니다.",
    "EdgeLoadObservedFacts v2 원칙: 보이는 사실(visible evidence)과 추정(inferred label)을 반드시 분리하세요.",
    "toeEdgeLoaded/heelEdgeLoaded는 실제 board edge contact/load가 보일 때만 true로 쓰세요.",
    "approach label, trick name, expected trick family, bodyOrientation, wakeCrossingPath, stance에서 toeEdgeLoaded/heelEdgeLoaded=true를 추론하지 마세요.",
    "looks toeside/heelside, Toeside approach, Heelside로 보임처럼 라벨만 반복하면 toeEdgeLoaded/heelEdgeLoaded는 unknown으로 쓰세요.",
    "라이더의 chest/back/hips 방향이 주된 단서라면 edge load는 unknown으로 쓰고 antiEdgeLoadEvidence에 body orientation only, not edge load를 기록하세요.",
    "boardTiltDirection은 toe/heel board edge angle이 직접 보일 때만 toe edge 또는 heel edge로 쓰세요.",
    "screen left/right, boat left/right, rider left/right, travel direction을 toe/heel board tilt로 변환하지 마세요.",
    "sprayDirection은 finalApproachWindow 안에서 특정 board edge에서 나온 물보라가 보일 때만 toe/heel spray로 쓰세요.",
    "generic spray, wake spray, landing spray, edge source가 불명확한 spray는 unknown 또는 low로 쓰세요.",
    "lineTensionDirection은 단독으로 edge load 근거가 아닙니다. visible board tilt 또는 rider weight over visible edge와 함께 있을 때만 보조 근거로 쓰세요.",
    "riderWeightOverEdge는 라이더 질량이 특정 toe/heel edge 위에 visibly stacked 된 경우에만 true/edge 방향으로 쓰세요.",
    "riderWeightOverEdge를 chest/back orientation, regular/goofy stance, 진행 방향만으로 추론하지 마세요.",
    "edgeLoadEvidenceText에는 실제 물리 근거만 쓰세요. 라벨, trick expectation, body orientation, wake path 추론은 쓰지 마세요.",
    "edgeLoadConfidence=high는 finalApproachWindow 안에서 서로 독립적인 visible physical indicators가 최소 2개 이상 있을 때만 허용하세요.",
    "edgeLoadConfidence=high는 edgeLoadTiming.startSec/endSec가 finalApproachWindow와 겹칠 때만 허용하세요.",
    "독립 physical indicators 예: visible board edge angle, edge-specific spray, rider weight over visible edge. 같은 라벨 추정에서 파생된 반복 문장은 독립 근거가 아닙니다.",
    "edgeLoadConfidence=medium은 명확한 visible physical indicator가 1개 있을 때만 허용하세요.",
    "label-only, inferred, timing-unclear, camera-obscured, bodyOrientation-only이면 edgeLoadConfidence는 low로 쓰세요.",
    "toeEdgeLoaded와 heelEdgeLoaded가 충돌하면 edgeLoadConfidence는 low로 낮추고 antiEdgeLoadEvidence에 충돌 이유를 쓰세요.",
    "antiEdgeLoadEvidence는 적극적으로 작성하세요. 누락/차단 근거가 있으면 반드시 기록하세요.",
    "antiEdgeLoadEvidence 예: board edge angle not visible, spray not tied to a specific edge, body orientation only not edge load, label-only edge claim, timing outside finalApproachWindow.",
    "popObservedFacts는 takeoff/pop mechanics에 대한 관찰 사실만 기록하세요. 트릭명이나 family를 근거로 팝을 추론하지 마세요.",
    "popObservedFacts는 단순 schema로 작성하세요: popType, timing, intensity, evidenceText, confidence, antiEvidence.",
    "popType은 progressive_pop, trip_pop, ollie_pop, flat_release, early_release, late_pop, no_clear_pop, unknown 같은 짧은 문자열 또는 null로 쓰세요.",
    "timing은 takeoffTimestamp 근처에서 보이는 팝 타이밍을 짧은 문자열로 쓰세요. 예: on_wake, early_release, late_pop, unclear.",
    "intensity는 strong, moderate, weak, unclear 같은 짧은 문자열로 쓰세요.",
    "confidence는 PopObservedFacts 전체에 대해 하나만 쓰고, 각 필드별 confidence 객체를 만들지 마세요.",
    "confidence=high는 takeoffTimestamp 근처에서 서로 독립적인 visible physical pop indicators가 최소 2개 이상 있을 때만 허용하세요.",
    "독립 pop indicators 예: wake lip/top contact at release, board release angle, line/handle tension, rider leg extension, upward trajectory.",
    "evidenceText에는 실제 물리 근거만 한 문장으로 쓰세요. Basic Jump, Tantrum, Back Roll 같은 trick label은 pop 근거가 아닙니다.",
    "antiEvidence는 적극적으로 작성하세요. 팝 순간이 가려짐, 립 접촉 불명확, 라인 텐션 불명확, 다리 펴짐 불명확, label-only pop claim 등을 기록하세요.",
    "rotationObservedFacts는 공중 회전 mechanics에 대한 관찰 사실만 기록하세요. 트릭명이나 family를 근거로 회전을 추론하지 마세요.",
    "rotationObservedFacts는 단순 schema로 작성하세요: rotationAxis, rotationDirection, inversionDetected, spinDegrees, handlePassObserved, evidenceText, confidence, antiEvidence.",
    "rotationAxis는 roll_axis, flip_axis, spin_yaw_axis, off_axis, none, unknown 중 하나로 쓰세요.",
    "rotationDirection은 frontside, backside, left, right, none, unknown 중 하나로 쓰세요.",
    "inversionDetected와 handlePassObserved는 true, false, unknown 중 하나로 쓰세요.",
    "spinDegrees는 0, 180, 360, 540, unknown 중 하나로 쓰세요.",
    "evidenceText에는 body axis, board path, handle path, landing direction처럼 보이는 mechanics만 한 문장으로 쓰세요. Back Roll/Tantrum/KGB/Crow Mobe 같은 trick label은 rotation 근거가 아닙니다.",
    "confidence=high는 visible rotation axis, body axis evidence, board path evidence 중 독립적인 근거가 최소 2개 이상 있을 때만 허용하세요.",
    "antiEvidence는 적극적으로 작성하세요. no visible roll axis, no board path rotation, handle pass not visible, camera pan may create apparent rotation 같은 누락/반례를 기록하세요.",
    "grabObservedFacts는 공중 동작 중 손과 보드의 실제 접촉 관찰 사실만 기록하세요. trick name, family, 스타일, 무릎 접힘, 예상 grab 이름에서 grab을 추론하지 마세요.",
    "schema complexity를 줄이기 위해 grabObservedFacts는 객체가 아니라 JSON 문자열로 작성하세요.",
    "grabObservedFacts 문자열 안에는 grabDetected, contactVisible, grabbingHand, grabbedBoardZone, grabTiming, grabDuration, evidenceText, confidence, antiEvidence를 넣으세요.",
    "grabDetected와 contactVisible은 true, false, unknown 중 하나로 쓰세요.",
    "grabbingHand는 front_hand, rear_hand, both_hands, unknown, none 중 하나 또는 null로 쓰세요.",
    "grabbedBoardZone은 toe_edge_between_bindings, heel_edge_between_bindings, nose, tail, frontside_edge, backside_edge, center_board, unknown_zone, none 중 하나 또는 null로 쓰세요.",
    "grabTiming은 takeoff, rising, peak_air, descent, landing, unknown, none 중 하나 또는 null로 쓰세요.",
    "grabDuration은 momentary, held, attempted_reach, none, unknown 중 하나 또는 null로 쓰세요.",
    "contactVisible=true는 손/손가락과 보드의 실제 접촉점이 보일 때만 쓰세요. 손이 보드 근처에 있음, 겹쳐 보임, 가까워 보임, likely/appears to/near/close 수준의 표현은 contactVisible=true가 아닙니다.",
    "hand passing near board, knee tuck, arm swing, handle movement, board poke/style, body-board overlap, occlusion, camera crop만으로 grabDetected=true를 쓰지 마세요.",
    "attempted_reach는 actual grab이 아닙니다. 손이 보드 쪽으로 가지만 접촉이 보이지 않으면 grabDetected는 unknown 또는 false로 쓰고 grabDuration=attempted_reach로 쓰세요.",
    "Indy, Melon, Mute, Stalefish 같은 grab name을 이 계층에서 분류하지 마세요. hand + board zone + timing + duration만 기록하세요.",
    "grabDuration=held는 여러 프레임/순간에 걸친 지속 접촉이 보일 때만 쓰세요.",
    "명확히 그랩이 없고 양손이 핸들에 남아 있거나 hand-board contact가 보이지 않으면 grabDetected=false로 쓰고 confidence는 medium/high도 가능합니다.",
    "crop, spray, body overlap, low resolution 때문에 손/보드 접촉이 안 보이면 unknown 또는 low로 쓰고 antiEvidence에 이유를 기록하세요.",
    "positive grab evidenceText에는 visible hand/finger-board contact point를 써야 합니다. 접촉점이 불명확하면 grabDetected=true를 금지하세요.",
    "grabObservedFacts는 primaryCandidate, family, approachType, rotationType을 직접 변경하는 근거가 아닙니다.",
    "landingObservedFacts는 착지와 즉시 회복에 대한 관찰 사실만 기록하세요. 트릭명, family, 접근 방향, 회전 타입에서 착지 결과를 추론하지 마세요.",
    "schema complexity를 줄이기 위해 landingObservedFacts는 객체가 아니라 JSON 문자열로 작성하세요.",
    "landingObservedFacts 문자열 안에는 landingVisible, landingOutcome, boardContact, edgeOnLanding, handlePosition, balanceRecovery, evidenceText, confidence, antiEvidence를 넣으세요.",
    "landingVisible은 true, false, unknown 중 하나로 쓰세요.",
    "landingOutcome은 clean, butt_check, edge_catch, handle_loss, over_rotated, under_rotated, crash, rides_away, not_visible, unknown 중 하나 또는 null로 쓰세요.",
    "boardContact는 clean_contact, tail_first, nose_first, flat, edge_contact, hard_impact, not_contacted_visible, not_visible, unknown 중 하나 또는 null로 쓰세요.",
    "edgeOnLanding은 toe_edge, heel_edge, flat, edge_catch, not_visible, unknown 중 하나 또는 null로 쓰세요.",
    "handlePosition은 controlled, near_lead_hip, away_from_body, high, dropped, pulled_out, two_hands_visible, one_hand_visible, not_visible, unknown 중 하나 또는 null로 쓰세요.",
    "balanceRecovery는 rides_away, recovers, unstable, falls, butt_check_recovery, no_recovery, not_visible, unknown 중 하나 또는 null로 쓰세요.",
    "confidence는 LandingObservedFacts 전체에 대해 하나만 쓰고, 각 필드별 confidence 객체를 만들지 마세요.",
    "confidence=high는 board contact, rider balance/recovery, handle control, edge contact/catch, ride-away/fall outcome 중 독립적인 visible indicators가 최소 2개 이상 있을 때만 허용하세요.",
    "landing이 out of frame, splash obscured, video ends before landing, handle not visible, only aftermath visible이면 antiEvidence에 기록하세요.",
    "clean/crash/butt_check 같은 라벨만 쓰고 board contact, hips/butt contact, edge dig, handle loss, ride-away/fall 같은 관찰 근거가 없으면 confidence를 low로 쓰고 antiEvidence에 label-only landing claim을 기록하세요.",
    "landingOutcome은 코칭과 outcome 판단에는 사용하되 primaryCandidate, family, approachType, rotationType을 뒤집는 근거로 사용하지 마세요.",
    "inversionObservedFacts는 접근/엣지/예상 트릭에서 추론하지 말고 공중 동작에서 보이는 사실만 기록하세요.",
    "인버트는 머리가 엉덩이보다 아래인지 하나만으로 정의하지 마세요. 1차 근거는 boardAboveHead입니다.",
    "boardAboveHead는 보드가 라이더 머리보다 위에 명확히 있는지 관찰하세요. 보드가 머리 위에 한 번도 보이지 않으면 antiInversionEvidence에 기록하세요.",
    "bodyInverted, boardAboveHead, rollAxisObserved, flipAxisObserved가 불명확하면 unknown으로 반환하세요.",
    "inversionObservedFacts 안에서는 트릭명, family, Back Roll/Tantrum 같은 분류를 쓰지 말고 관찰 사실만 쓰세요.",
    "earlier slalom/setup, 카메라 프레이밍, 착지/회복 구간은 approachType high의 직접 근거가 될 수 없습니다.",
    "접근 방향은 바로 힐사이드/토사이드로 단정하지 말고 먼저 approachObservedFacts를 채우세요.",
    "approachObservedFacts에는 stance, leadFoot, boardDirection, wakeCrossingPath, edgeDirectionEvidence, handlePosition, bodyOrientation을 관찰 사실로 분리해서 작성하세요.",
    "질문 순서: 스탠스는 무엇인가? 어느 발이 앞인가? 보드 방향은? 라이더는 어디서 시작했고 어디서 이륙했고 어디에 착지했는가? 어떤 엣지가 로드됐는가? 핸들은 어디에 있는가? 어떤 시각 사실이 이를 뒷받침하는가?",
    "edgeDirectionEvidence는 기존 접근 라벨/엣지 설명으로 유지하되, 실제 edge load 물리 근거는 반드시 edgeLoadObservedFacts에 따로 분리하세요.",
    "bodyOrientation은 보조 근거입니다. 가슴/등이 보인다는 사실만으로 힐사이드/토사이드를 확정하지 마세요.",
    "트릭 후보명에서 접근 방향을 역추론하지 마세요. Back Roll/Tantrum 후보라고 해서 힐사이드로 채우면 안 됩니다.",
    "wake crossing direction만으로 approach high를 주지 마세요. stance/leadFoot/wake path/edge evidence가 부족하면 confidence를 낮추세요.",
    "static classification과 dynamic classification을 분리하세요.",
    "static classification: regular/goofy, heelside/toeside, switch/normal stance는 비교적 적은 프레임으로도 판단할 수 있습니다.",
    "dynamic classification: trick identity, rotation family, roll axis, invert mechanics는 더 어렵고 setup + initiation + airborne mechanics를 함께 봐야 합니다.",
    "phase-weighted evidence를 사용하세요.",
    "1. static setup evidence: stance, regular/goofy, edge, heelside/toeside, approach.",
    "2. initiation evidence: approach load, takeoff, pop, shoulder/hip movement, rotation start.",
    "3. airborne evidence: early rotation axis, peak-air body orientation, handle path, board direction.",
    "4. outcome evidence: descent, landing, crash, recovery.",
    "일반 우선순위: stance/regular-goofy > edge/heelside-toeside > approach/edge load > takeoff/pop > rotation initiation > early airborne rotation axis > peak-air body orientation > descent/landing setup > landing outcome/crash.",
    "Back Roll vs Tantrum 같은 invert trick은 보통 pop → rotation initiation → early airborne → peak 구간이 가장 중요합니다.",
    "Back Roll high confidence는 반드시 서로 독립된 가시 근거 4가지를 모두 만족해야 합니다: heelside setup, roll axis, inverted body/board relationship, rotation initiation.",
    "위 4가지 중 하나라도 명확하지 않으면 primaryCandidate=Back Roll 또는 rotationType=Back Roll의 confidence는 high가 될 수 없습니다.",
    "roll axis가 보이지 않으면 rotationType은 Back Roll high가 될 수 없습니다.",
    "명확한 inverted body/board relationship이 보이지 않으면 family는 Invert high가 될 수 없습니다.",
    "Basic Jump 또는 Straight Air가 그럴듯하면 Back Roll은 high가 될 수 없습니다.",
    "approachType high와 rotationType high는 같은 문장을 반복하지 말고, 각각 독립적인 보이는 근거에 의존해야 합니다.",
    "spin, grab, basic variation은 peak-air나 descent에서만 명확해질 수 있으므로 peak-to-landing을 완전히 무시하지 마세요.",
    "트릭명은 착지 결과가 아니라 setup + initiation + airborne mechanics를 중심으로 판단하세요.",
    "트릭 정체성은 보통 착지 전에 결정됩니다. 실패 착지나 크래시는 트릭명을 바꾸지 않습니다.",
    "evidenceWindows에는 가능하면 트릭 정체성을 판단하는 가장 중요한 event window 하나를 넣으세요.",
    "event window는 보통 pop/rotation initiation/early airborne/peak 중심이지만, 기술군에 따라 peak-air나 descent 근거도 포함할 수 있습니다.",
    "우선 볼 근거: stance, approach mechanics, edge pattern, takeoff mechanics, pop, shoulder opening, hip movement, rotation initiation, rotation axis, peak-air body orientation, handle path, board direction.",
    "landing quality, crash outcome, recovery는 landingOutcome과 coaching에는 사용하되 primaryCandidate를 뒤집는 근거로 과대평가하지 마세요.",
    "landingOutcome은 보조 정보입니다. 실패 착지나 크래시는 트릭 정체성을 바꾸지 않습니다.",
    "예: 힐사이드 백롤을 시도하다 크래시해도 primaryCandidate는 힐사이드 백롤 계열이어야 합니다.",
    "근거가 충돌하면 하나의 답을 강요하지 말고 후보 기술명, 이유, confidence를 분리하세요.",
    "primaryCandidate.evidence에는 접근, 엣지 로드, 테이크오프, 팝, 어깨/골반 움직임, 회전 시작, 공중 회전축, peak-air orientation 중 어떤 phase가 결정적이었는지 쓰세요.",
    "모든 텍스트는 한국어로 작성하세요.",
    "",
    `종목: ${activityGroupName}`,
    `세션 제목: ${title}`,
    `세션 메모: ${notes || "없음"}`,
    `사용자 확인 기술: ${userConfirmedTrick || "아직 없음"}`,
    `발생 시각: ${occurredAt}`,
    `파일명: ${fileName}`,
    "",
    "반드시 추출할 항목:",
    "- primaryCandidate: AI가 가장 가능성이 높다고 보는 기술명",
    "- family: 인버트/스핀/그랩/슬라이드/기본 점프/확인 필요 등 넓은 계열",
    "- temporalWindows: takeoffTimestamp, finalApproachWindow, ignoredSetupWindows, approachWindowConfidence",
    "- approachObservedFacts: 접근 방향 판단 전 관찰 사실",
    "- edgeLoadObservedFacts: 실제 toe/heel edge load 물리 근거. 라벨 추측과 분리",
    "- popObservedFacts: takeoff/pop mechanics 관찰 사실. popType, timing, intensity, evidenceText, confidence, antiEvidence",
    "- rotationObservedFacts: 공중 회전 mechanics 관찰 사실. rotationAxis, rotationDirection, inversionDetected, spinDegrees, handlePassObserved, evidenceText, confidence, antiEvidence",
    "- grabObservedFacts: airborne hand-to-board contact 관찰 사실을 담은 JSON 문자열. grabDetected, contactVisible, grabbingHand, grabbedBoardZone, grabTiming, grabDuration, evidenceText, confidence, antiEvidence",
    "- landingObservedFacts: landing/recovery 관찰 사실을 담은 JSON 문자열. landingVisible, landingOutcome, boardContact, edgeOnLanding, handlePosition, balanceRecovery, evidenceText, confidence, antiEvidence",
    "- inversionObservedFacts: 인버트 판단 전 관찰 사실. bodyInverted, boardAboveHead, rollAxisObserved, flipAxisObserved, inversionDuration, inversionEvidenceCount, antiInversionEvidence",
    "- approachType: 힐사이드/토사이드/스위치/확인 필요 등 접근 방식",
    "- rotationType: 백롤/탠트럼/프론트롤/스핀/No roll axis/확인 필요 등 회전 특성",
    "- landingOutcome: 착지 성공/불안정 착지/크래시/확인 필요",
    "- confidence: primaryCandidate에 대한 전체 확신도",
    "- evidence: primaryCandidate를 제안한 짧은 핵심 근거",
    "- alternativeCandidates: 가능한 대안 기술명 최대 1개",
    "- evidenceWindows: 트릭 정체성을 판단하는 phase-weighted event window",
    "- observations: 영상에서 직접 보이는 사실",
    "- uncertainty: 불확실한 이유와 전체 확신도",
    "",
    "negative evidence 규칙:",
    "- 토사이드 접근이 보이면 approachType은 토사이드로 쓰고 힐사이드 high를 금지하세요.",
    "- approachObservedFacts의 timestamp 근거가 finalApproachWindow 밖이면 approachType high를 금지하세요.",
    "- takeoffTimestamp가 없거나 finalApproachWindow confidence가 low이면 approachType high를 금지하세요.",
    "- wakeCrossingPath와 edgeDirectionEvidence는 finalApproachWindow를 참조해야 합니다.",
    "- 웨이크를 넘어가는 기본 점프/스트레이트 에어로 보이면 family는 기본 점프 또는 No invert로 쓰세요.",
    "- 몸/보드가 완전히 뒤집히는 관계가 보이지 않으면 family=인버트 high를 금지하세요.",
    "- boardAboveHead/bodyInverted/rollAxisObserved 중 true가 하나도 없으면 family=인버트를 쓰지 마세요.",
    "- boardAboveHead가 false이고 보드가 라이더 머리 위에 한 번도 보이지 않으면 antiInversionEvidence에 그 사실을 쓰세요.",
    "- roll axis가 보이지 않으면 rotationType=No roll axis 또는 확인 필요로 쓰세요.",
    "- 백롤 mechanics가 보이지 않으면 primaryCandidate에 백롤을 쓰지 마세요.",
    "- approachObservedFacts가 부족하면 approachType high를 금지하세요.",
    "- 실제 toe/heel edge loading이 보이지 않으면 edgeLoadConfidence는 low로 쓰세요.",
    "- EdgeLoadObservedFacts에서 high confidence는 독립적인 visible physical evidence 2개 이상이 없으면 금지하세요.",
    "- EdgeLoadObservedFacts에서 timestamp 없는 edge load high confidence는 금지하세요.",
    "- edgeLoadTiming이 finalApproachWindow 밖이거나 unknown이면 edgeLoadConfidence는 medium 이하로 쓰세요.",
    "- bodyOrientation, wake path, stance, trick name만 있는 경우 antiEdgeLoadEvidence에 근거 부족을 기록하세요.",
    "- PopObservedFacts에서 high confidence는 takeoffTimestamp 근처의 독립적인 visible physical evidence 2개 이상이 없으면 금지하세요.",
    "- timing이 takeoffTimestamp 근처를 설명하지 못하면 Pop confidence high를 금지하세요.",
    "- trick name, family, airtime만으로 popType을 확정하지 말고 antiEvidence에 근거 부족을 기록하세요.",
    "- RotationObservedFacts에서 high confidence는 rotation axis, body axis, board path 중 독립적인 visible evidence 2개 이상이 없으면 금지하세요.",
    "- airtime, trick name, body twist만으로 rotationAxis를 확정하지 말고 antiEvidence에 근거 부족을 기록하세요.",
    "- rotationAxis=none 또는 spinDegrees=0이면 spin/invert trick high를 금지하세요.",
    "- GrabObservedFacts에서 grabDetected=true는 손/손가락과 보드의 실제 접촉점이 보이는 경우에만 허용하세요.",
    "- GrabObservedFacts에서 hand-board contact 근거 없는 high confidence를 금지하세요.",
    "- near/close/appears/likely/겹쳐 보임/근처/가까움 수준이면 grabDetected=true와 contactVisible=true를 금지하세요.",
    "- knee tuck, arm swing, handle movement, board poke/style, hand passing near board, occlusion/camera crop만으로 grabDetected=true를 쓰지 마세요.",
    "- attempted_reach와 actual grab을 분리하세요. 접촉이 보이지 않으면 positive grab high를 금지하세요.",
    "- grab name label만 있고 contactVisible 근거가 없으면 Grab confidence를 low로 쓰세요.",
    "- LandingObservedFacts에서 landingVisible=false 또는 unknown이면 confidence high를 금지하세요.",
    "- LandingObservedFacts에서 evidenceText 없는 high confidence를 금지하세요.",
    "- clean/crash/butt_check 라벨만 있고 board contact, ride-away/fall, hips/butt contact, edge dig 같은 관찰 근거가 없으면 Landing confidence를 low로 쓰세요.",
    "- camera crop, splash, video end, only aftermath visible이면 Landing confidence high를 금지하고 antiEvidence에 기록하세요.",
    "",
    "중요: JSON key 순서는 반드시 primaryCandidate, family, temporalWindows, approachObservedFacts, edgeLoadObservedFacts, popObservedFacts, rotationObservedFacts, grabObservedFacts, landingObservedFacts, inversionObservedFacts, approachType, rotationType, landingOutcome, confidence, evidence, alternativeCandidates, evidenceWindows, observations, uncertainty 순서로 작성하세요.",
    "출력은 JSON만 반환하세요. 코칭 플랜이나 연습법은 쓰지 마세요.",
    "출력 길이 제한:",
    "- evidenceWindows: 최대 1개. setup/initiation/airborne/outcome 중 정체성 판단에 가장 중요한 구간",
    "- observations: 최대 2개",
    "- alternativeCandidates: 최대 1개",
    "- uncertainty.reasons: 최대 2개",
    "- 각 evidence/detail/reason은 60자 이내 한 문장",
  ].join("\n");
}

function buildOpenAiCoachInstructions() {
  return [
    "You are a world-class wakeboard coach, action-sports biomechanics analyst, and elite video-review operator.",
    "Your job is to reproduce the quality of an expert ChatGPT coaching session through the OpenAI API.",
    "This is not a generic video summary. Produce detailed wakeboard coaching feedback.",
    "Analyze only visible evidence from sampled frames. Separate Observation, Pattern Recognition, and Inference.",
    "Never present uncertain conclusions as facts. When evidence is incomplete, say so and lower confidence.",
    "Look for repeated movement patterns across frames: handle path, line tension, edge angle, hip position, shoulder rotation, knee flexion, board direction, takeoff timing, landing control, and recovery.",
    "Use slow, careful reasoning internally, but output only the requested JSON.",
    "Write in Korean for a serious amateur wakeboarder who wants immediately usable coaching.",
    "Avoid generic praise. Every suggestion must connect to a visible observation, pattern, inference, or stated uncertainty.",
  ].join("\n");
}

function buildOpenAiHighlightScoutInstructions() {
  return [
    "You are an action-sports video triage assistant.",
    "Your only job is to scan sparse frames from the entire uploaded video and identify likely wakeboard trick/action/highlight windows.",
    "Do not coach yet. Do not invent highlights. If the sparse frames do not show enough evidence, return no candidate windows.",
    "Use only visible frame evidence and timestamps provided by the caller.",
    "Return only the requested JSON.",
  ].join("\n");
}

function buildOpenAiMotionScoutInstructions() {
  return [
    "You are an action-sports motion phase scout.",
    "Your job is to scan sparse frames from the full video and identify phase-weighted event windows for wakeboard trick evidence.",
    "Do not coach yet. Do not infer fixed timing in advance.",
    "The ultimate goal is not to classify tricks from isolated frames.",
    "For wakeboarding trick identity, use phase-weighted evidence: setup, initiation, airborne mechanics, then outcome.",
    "For invert tricks such as Back Roll vs Tantrum, the most important window is usually pop to rotation initiation to early airborne to peak.",
    "Do not ignore peak-air or descent: some spins, grabs, and basic variations only become clear there.",
    "Landing, crash, and recovery are outcome evidence. Identify them when visible, but do not let them override setup + initiation + airborne mechanics.",
    "Use only visible frame evidence and timestamps provided by the caller.",
    "Return only the requested JSON.",
  ].join("\n");
}

function buildOpenAiHighlightScoutPrompt({
  activityGroupName,
  title,
  notes,
  occurredAt,
  userConfirmedTrick,
  fileName,
  sampledFrames,
  durationSeconds,
}: SessionMetadata & {
  fileName: string;
  sampledFrames: number;
  durationSeconds?: number;
}) {
  return [
    "다음 프레임들은 사용자가 업로드한 전체 영상에서 균등하게 샘플링한 것입니다.",
    "앱과 서버는 트릭/하이라이트가 언제 발생하는지 모릅니다.",
    "프레임 증거만 보고 가능성 있는 액션/트릭/하이라이트 구간 후보를 찾으세요.",
    "확신이 낮으면 후보를 만들지 말고 unknown/not enough evidence로 처리하세요.",
    "",
    `종목: ${activityGroupName}`,
    `세션 제목: ${title}`,
    `세션 메모: ${notes || "없음"}`,
    `사용자 확인 기술: ${userConfirmedTrick || "없음"}`,
    `발생 시각: ${occurredAt}`,
    `파일명: ${fileName}`,
    `샘플 프레임 수: ${sampledFrames}`,
    `영상 길이: ${durationSeconds ? `${durationSeconds.toFixed(1)}초` : "unknown"}`,
    "",
    "규칙:",
    "- 하이라이트 구간을 앱/서버가 알고 있다고 가정하지 마세요.",
    "- candidate window는 실제 프레임 증거가 있을 때만 제안하세요.",
    "- startSeconds/endSeconds는 전체 영상 시작 기준 초 단위입니다.",
    "- 너무 넓은 구간을 임의로 잡지 마세요. 보이는 액션 주변의 짧은 구간만 제안하세요.",
    "- 확신이 낮으면 highlightCandidates를 빈 배열로 두세요.",
  ].join("\n");
}

function buildOpenAiMotionScoutPrompt({
  activityGroupName,
  title,
  notes,
  occurredAt,
  userConfirmedTrick,
  fileName,
  sampledFrames,
  durationSeconds,
}: SessionMetadata & {
  fileName: string;
  sampledFrames: number;
  durationSeconds?: number;
}) {
  return [
    "다음 프레임들은 사용자가 업로드한 전체 영상에서 균등하게 샘플링한 것입니다.",
    "앱과 서버는 트릭/하이라이트가 언제 발생하는지 모릅니다.",
    "프레임 증거만 보고 웨이크보드 동작 phase window를 찾으세요.",
    "최종 목표는 프레임 몇 장으로 트릭명을 맞히는 것이 아니라, phase-weighted trick evidence를 찾는 것입니다.",
    "목표는 Stage 2에서 setup/initiation/airborne/outcome 근거 구간을 촘촘히 추출할 수 있도록 시간 구간을 잡는 것입니다.",
    "일반 우선순위: stance/regular-goofy > edge/heelside-toeside > approach/edge load > takeoff/pop > rotation initiation > early airborne rotation axis > peak-air body orientation > descent/landing setup > landing outcome/crash.",
    "Back Roll vs Tantrum 같은 invert trick은 보통 pop → rotation initiation → early airborne → peak 구간이 가장 중요합니다.",
    "peak-air와 descent를 무시하지 마세요. 일부 spin, grab, basic variation은 그 구간에서만 명확해질 수 있습니다.",
    "landing/crash/recovery는 outcome evidence이며, landingOutcome과 coaching에는 중요하지만 trick identity를 단독으로 뒤집지 않습니다.",
    "",
    `종목: ${activityGroupName}`,
    `세션 제목: ${title}`,
    `세션 메모: ${notes || "없음"}`,
    `사용자 확인 기술: ${userConfirmedTrick || "없음"}`,
    `발생 시각: ${occurredAt}`,
    `파일명: ${fileName}`,
    `샘플 프레임 수: ${sampledFrames}`,
    `영상 길이: ${durationSeconds ? `${durationSeconds.toFixed(1)}초` : "unknown"}`,
    "",
    "찾을 phase:",
    "- approach",
    "- edge_load",
    "- takeoff",
    "- pop",
    "- airborne",
    "- peak_air",
    "- rotation",
    "- descent",
    "- landing",
    "- crash_recovery",
    "",
    "규칙:",
    "- 모든 startSeconds/endSeconds는 전체 영상 시작 기준 초 단위입니다.",
    "- phase가 보이지 않으면 만들지 마세요.",
    "- setup, initiation, airborne, outcome 구간을 가능한 한 분리하세요.",
    "- primaryHighlightTimestampSeconds는 하이라이트가 아니라 트릭 정체성 판단에 가장 중요한 순간 하나입니다.",
    "- thumbnailFrameTimestampSeconds는 기록 카드 썸네일로 가장 설명력이 높은 순간입니다.",
    "- highlightFrameTimestampsSeconds는 future carousel/highlight image용 대표 시점입니다.",
  ].join("\n");
}

function buildOpenAiBenchmarkPrompt({
  activityGroupName,
  title,
  notes,
  occurredAt,
  userConfirmedTrick,
  fileName,
  sampledFrames,
  phaseWindows,
  denseWindows,
}: SessionMetadata & {
  fileName: string;
  sampledFrames: number;
  phaseWindows: MotionPhaseWindow[];
  denseWindows: FrameExtractionWindow[];
}) {
  return [
    "다음은 Action Sports Journal의 웨이크보드 영상에서 AI가 먼저 찾은 후보 구간 주변을 더 촘촘히 추출한 프레임입니다.",
    "목표는 이전 OpenAI 결과가 프롬프트 품질, 모델 선택, 비디오 입력 구현, API 사용 방식 중 무엇에 의해 제한됐는지 판단하기 위한 GPT-5.5 벤치마크입니다.",
    "일반 영상 요약을 하지 마세요. 세계 최상급 웨이크보드 코치가 라이더에게 직접 피드백하듯 분석하세요.",
    "중요: 앱/서버는 하이라이트 타이밍을 미리 알지 못합니다. 아래 phase window는 Stage 1 AI scout가 전체 영상 샘플에서 찾은 동작 구간입니다.",
    "최종 highlightScenes는 반드시 제공된 phase window와 현재 dense focused frames에서 보이는 증거에 근거해야 합니다.",
    "증거가 부족하면 highlightScenes를 빈 배열로 두고 unknown/not enough evidence라고 쓰세요.",
    "",
    `종목: ${activityGroupName}`,
    `세션 제목: ${title}`,
    `세션 메모: ${notes || "없음"}`,
    `사용자 확인 기술: ${userConfirmedTrick || "없음"}`,
    `발생 시각: ${occurredAt}`,
    `파일명: ${fileName}`,
    `focused 샘플 프레임 수: ${sampledFrames}`,
    `Stage 1 phase windows: ${phaseWindows
      .map(
        (window) =>
          `${window.phase} ${window.startSeconds.toFixed(1)}s-${window.endSeconds.toFixed(1)}s (${window.confidence}, ${window.evidence})`,
      )
      .join(" / ")}`,
    `Stage 2 dense windows: ${denseWindows
      .map(
        (window) =>
          `${window.startSeconds.toFixed(1)}s-${window.endSeconds.toFixed(1)}s`,
      )
      .join(" / ")}`,
    "",
    "분석 규칙:",
    userConfirmedTrick
      ? "0. 사용자가 확인한 기술명을 라이더 의도로 우선 사용하되, 영상 근거와 충돌하면 그 불확실성을 명시하세요."
      : "0. 기술명이 불확실하면 정확한 명칭을 단정하지 말고 가능한 계열로 표현하세요.",
    "1. Observation: 프레임에서 직접 보이는 사실만 적으세요.",
    "2. Pattern Recognition: 여러 프레임에 반복되는 움직임 패턴만 적으세요.",
    "3. Inference: 관찰/패턴이 라이딩 결과에 주는 영향을 추론하되 근거를 연결하세요.",
    "4. Confidence: 각 항목에 high/medium/low 확신도를 넣고 이유를 포함하세요.",
    "5. Self-critique: 샘플링, 카메라 각도, 가림, 해상도, 누락 프레임 때문에 분석이 약해지는 부분을 스스로 지적하세요.",
    '6. Uncertainty: 확실하지 않은 내용은 사실처럼 쓰지 말고 "가능성", "확인 필요"로 표현하세요.',
    "7. Trick identity는 setup + initiation + airborne mechanics를 중심으로 판단하고, landing/crash는 landingOutcome과 coaching에 주로 반영하세요.",
    "8. 근거가 충돌하면 하나의 정답을 강요하지 말고 후보 기술명, 이유, confidence를 분리하세요.",
    "",
    "웨이크보드 코칭 체크리스트:",
    "- static setup evidence: stance, regular/goofy, edge, heelside/toeside, approach",
    "- initiation evidence: edge load, takeoff, pop, shoulder/hip movement, rotation start",
    "- airborne evidence: rotation axis, peak-air body orientation, handle path, board direction",
    "- outcome evidence: descent, landing, crash, recovery",
    "- invert trick은 pop → rotation initiation → early airborne → peak 구간을 특히 중요하게 보세요.",
    "- peak-air와 descent는 일부 spin/grab/basic variation에서 결정적일 수 있으므로 무시하지 마세요.",
    "",
    "출력 요구:",
    "- 모든 텍스트는 한국어",
    "- humanReadableAnalysis: 사람이 바로 읽을 수 있는 코칭 리포트. Observation, Pattern Recognition, Inference, Coaching Plan, Self-critique 섹션을 포함하세요.",
    "- summary: 코치 총평 2~4문장",
    "- highlights: 핵심 관찰/판단 3~5개",
    "- observations: 보이는 사실 4~8개",
    "- patternRecognition: 반복 패턴 2~5개",
    "- inferences: 근거 기반 추론 2~5개",
    "- confidence: 전체 분석 확신도와 이유",
    "- selfCritique: 이 분석의 한계와 다음 촬영 개선점",
    '- highlightScenes: 중요한 장면 최대 4개, timestampLabel은 프레임 기반 대략 시점 또는 "확인 필요"',
    "- suggestions: 다음 세션에서 수행할 구체적 훈련/수정 지시 4~6개",
    "- imageUri는 항상 null",
  ].join("\n");
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

type GeminiEvidencePayload = {
  primaryCandidate: {
    name: string;
    confidence: "high" | "medium" | "low";
    evidence: string;
  };
  alternativeCandidates: Array<{
    name: string;
    confidence: "high" | "medium" | "low";
    evidence: string;
  }>;
  family: {
    value: string;
    confidence: "high" | "medium" | "low";
    evidence: string;
  };
  temporalWindows?: EvidenceTemporalWindowsPayload;
  approachType: {
    value: string;
    confidence: "high" | "medium" | "low";
    evidence: string;
  };
  approachObservedFacts?: ApproachObservedFactsPayload;
  edgeLoadObservedFacts?: EdgeLoadObservedFactsPayload;
  popObservedFacts?: PopObservedFactsPayload;
  rotationObservedFacts?: RotationObservedFactsPayload;
  grabObservedFacts?: GrabObservedFactsPayload | string;
  landingObservedFacts?: LandingObservedFactsPayload | string;
  inversionObservedFacts?: InversionObservedFactsPayload;
  rotationType: {
    value: string;
    confidence: "high" | "medium" | "low";
    evidence: string;
  };
  landingOutcome: {
    value: string;
    confidence: "high" | "medium" | "low";
    evidence: string;
  } | string;
  confidence: "high" | "medium" | "low";
  evidence: string;
  evidenceWindows: Array<{
    startSeconds: number;
    endSeconds: number;
    label: string;
    evidence: string;
    confidence: "high" | "medium" | "low";
  }>;
  observations: Array<{
    timestampLabel: string;
    label: string;
    detail: string;
    confidence: "high" | "medium" | "low";
  }>;
  uncertainty: {
    level: "high" | "medium" | "low";
    reasons: string[];
  };
};

type EvidenceConsistencyStatus = "valid" | "inconsistent" | "needs_review";

type TakeoffDetectionPayload = {
  timestampSeconds: number | null;
  confidence: "high" | "medium" | "low";
  evidence: string;
};

type FinalApproachWindowPayload = {
  startSeconds: number;
  endSeconds: number;
  confidence: "high" | "medium" | "low";
  reasonWindowWasChosen: string;
};

type EvidenceTemporalWindowsPayload = {
  takeoffTimestamp: TakeoffDetectionPayload;
  finalApproachWindow: FinalApproachWindowPayload;
  ignoredSetupWindows: Array<{
    startSeconds: number;
    endSeconds: number;
    reason: string;
  }>;
  approachWindowConfidence: "high" | "medium" | "low";
};

type ApproachFactPayload = {
  value: string;
  confidence: "high" | "medium" | "low";
  evidence: string;
};

type ApproachObservedFactsPayload = {
  stance: ApproachFactPayload;
  leadFoot: ApproachFactPayload;
  boardDirection: ApproachFactPayload;
  wakeCrossingPath: {
    startPosition: string;
    takeoffPosition: string;
    landingPosition: string;
    direction: string;
    confidence: "high" | "medium" | "low";
    evidence: string;
  };
  edgeDirectionEvidence: ApproachFactPayload;
  handlePosition: ApproachFactPayload;
  bodyOrientation: ApproachFactPayload;
};

type ObservedBooleanPayload = true | false | "unknown";

type EdgeLoadObservedFactsPayload = {
  toeEdgeLoaded: ApproachFactPayload;
  heelEdgeLoaded: ApproachFactPayload;
  edgeLoadVisible: ApproachFactPayload;
  edgeLoadTiming: {
    startSec: number | null;
    endSec: number | null;
    observedMoment: string;
    evidenceFrameDescription: string;
  };
  boardTiltDirection: ApproachFactPayload;
  sprayDirection: ApproachFactPayload;
  lineTensionDirection: ApproachFactPayload;
  riderWeightOverEdge: ApproachFactPayload;
  edgeLoadConfidence: "high" | "medium" | "low";
  edgeLoadEvidenceText: string;
  antiEdgeLoadEvidence: string[];
};

type EdgeLoadValidationResult = {
  before: EdgeLoadObservedFactsPayload;
  after: EdgeLoadObservedFactsPayload;
  adjusted: boolean;
  needsReview: boolean;
  independentPhysicalEvidenceCount: number;
  rulesApplied: string[];
  rejectedHighConfidenceReasons: string[];
};

type PopObservedFactsPayload = {
  popType: string | null;
  timing: string | null;
  intensity: string | null;
  evidenceText: string | null;
  confidence: "high" | "medium" | "low";
  antiEvidence: string[];
};

type PopValidationResult = {
  before: PopObservedFactsPayload;
  after: PopObservedFactsPayload;
  adjusted: boolean;
  needsReview: boolean;
  independentPhysicalEvidenceCount: number;
  rulesApplied: string[];
  rejectedHighConfidenceReasons: string[];
};

type RotationObservedFactsPayload = {
  rotationAxis: string | null;
  rotationDirection: string | null;
  inversionDetected: ObservedBooleanPayload;
  spinDegrees: string | null;
  handlePassObserved: ObservedBooleanPayload;
  evidenceText: string | null;
  confidence: "high" | "medium" | "low";
  antiEvidence: string[];
};

type RotationValidationResult = {
  before: RotationObservedFactsPayload;
  after: RotationObservedFactsPayload;
  adjusted: boolean;
  needsReview: boolean;
  independentRotationEvidenceCount: number;
  rulesApplied: string[];
  rejectedHighConfidenceReasons: string[];
};

type GrabObservedFactsPayload = {
  grabDetected: ObservedBooleanPayload;
  contactVisible: ObservedBooleanPayload;
  grabbingHand: string | null;
  grabbedBoardZone: string | null;
  grabTiming: string | null;
  grabDuration: string | null;
  evidenceText: string | null;
  confidence: "high" | "medium" | "low";
  antiEvidence: string[];
};

type GrabValidationResult = {
  before: GrabObservedFactsPayload;
  after: GrabObservedFactsPayload;
  adjusted: boolean;
  needsReview: boolean;
  independentGrabEvidenceCount: number;
  rulesApplied: string[];
  rejectedHighConfidenceReasons: string[];
};

type LandingObservedFactsPayload = {
  landingVisible: ObservedBooleanPayload;
  landingOutcome: string | null;
  boardContact: string | null;
  edgeOnLanding: string | null;
  handlePosition: string | null;
  balanceRecovery: string | null;
  evidenceText: string | null;
  confidence: "high" | "medium" | "low";
  antiEvidence: string[];
};

type LandingValidationResult = {
  before: LandingObservedFactsPayload;
  after: LandingObservedFactsPayload;
  adjusted: boolean;
  needsReview: boolean;
  independentLandingEvidenceCount: number;
  rulesApplied: string[];
  rejectedHighConfidenceReasons: string[];
};

type InversionObservedFactsPayload = {
  bodyInverted: ObservedBooleanPayload;
  boardAboveHead: ObservedBooleanPayload;
  rollAxisObserved: ObservedBooleanPayload;
  flipAxisObserved: ObservedBooleanPayload;
  inversionDuration: {
    seconds: number | null;
    confidence: "high" | "medium" | "low";
    evidence: string;
  };
  inversionEvidenceCount: number;
  antiInversionEvidence: string[];
};

type ApproachDecision = {
  value: "heelside" | "toeside" | "switch" | "unknown";
  confidence: "high" | "medium" | "low";
  derivedFrom: string[];
  reasoning: string[];
  rejectedAlternatives: Array<{
    value: "heelside" | "toeside" | "switch";
    reason: string;
  }>;
  uncertainty: string[];
};

type ApproachSideV2 = "heelside" | "toeside" | "switch" | "unknown" | "ambiguous";
type DirectionFrame = "boat" | "camera" | "rider" | "unknown";

type ApproachEvidenceSignalV2 = {
  field: string;
  supports: Exclude<ApproachSideV2, "ambiguous">;
  strength: "primary" | "supporting" | "weak";
  confidence: "high" | "medium" | "low";
  evidence: string;
  timestampSeconds: number | null;
};

type ApproachObservedFactsV2Payload = {
  stance: ApproachFactPayload;
  leadFoot: ApproachFactPayload;
  boardDirection: ApproachFactPayload & {
    frameOfReference: DirectionFrame;
    noseDirection?: string;
    travelDirection?: string;
  };
  wakeCrossingPath: ApproachObservedFactsPayload["wakeCrossingPath"] & {
    frameOfReference: DirectionFrame;
  };
  edgeDirectionEvidence: ApproachFactPayload & {
    loadedEdge: "toe_edge" | "heel_edge" | "unknown";
  };
  edgeLoadObservedFacts: EdgeLoadObservedFactsPayload;
  edgeLoadValidation: EdgeLoadValidationResult;
  handlePosition: ApproachFactPayload;
  bodyOrientation: ApproachFactPayload;
  signals: ApproachEvidenceSignalV2[];
  conflictSummary: {
    hasConflict: boolean;
    toesideSignals: number;
    heelsideSignals: number;
    switchSignals: number;
    conflictFields: string[];
    reason: string;
  };
};

type ApproachDecisionV2 = {
  value: ApproachSideV2;
  confidence: "high" | "medium" | "low";
  primaryEvidence: string[];
  supportingEvidence: string[];
  conflictingEvidence: string[];
  rejectedAlternatives: Array<{
    value: "heelside" | "toeside" | "switch";
    reason: string;
  }>;
  uncertainty: string[];
};

type TrickFamily =
  | "basic_air"
  | "surface_trick"
  | "grab"
  | "spin"
  | "invert"
  | "raley"
  | "unknown";

type FamilyGateDecision = {
  rawFamily: TrickFamily;
  safeFamily: TrickFamily;
  confidence: "high" | "medium" | "low";
  entryGateSatisfied: boolean;
  entryGateEvidence: string[];
  missingGateEvidence: string[];
};

type SpecificTrickCandidate = {
  rawName: string;
  safeName: string;
  rawConfidence: "high" | "medium" | "low";
  safeConfidence: "high" | "medium" | "low";
  requiredFamily: TrickFamily;
};

type TaxonomyValidationResult = {
  familyGate: FamilyGateDecision;
  specificCandidate: SpecificTrickCandidate;
  warnings: string[];
  gateFailures: string[];
};

type NormalizedGeminiEvidence = ReturnType<typeof normalizeGeminiEvidence>;

type TaxonomyGatedEvidence = NormalizedGeminiEvidence & {
  rawFamilyCandidate: FamilyGateDecision["rawFamily"];
  safeFamilyCandidate: FamilyGateDecision["safeFamily"];
  taxonomyWarnings: string[];
  gateFailures: string[];
};

type OpenAiBenchmarkPayload = GeminiAnalysisPayload & {
  humanReadableAnalysis: string;
  observations: Array<{
    timestampLabel: string;
    evidence: string;
    coachingRelevance: string;
    confidence: "high" | "medium" | "low";
    confidenceReason: string;
  }>;
  patternRecognition: Array<{
    pattern: string;
    evidence: string;
    impact: string;
    confidence: "high" | "medium" | "low";
    confidenceReason: string;
  }>;
  inferences: Array<{
    inference: string;
    evidence: string;
    coachingImplication: string;
    confidence: "high" | "medium" | "low";
    confidenceReason: string;
  }>;
  confidence: {
    level: "high" | "medium" | "low";
    reason: string;
  };
  selfCritique: {
    limitations: string[];
    whatWouldImproveAnalysis: string[];
  };
};

type HighlightCandidateWindow = {
  startSeconds: number;
  endSeconds: number;
  reason: string;
  confidence: "high" | "medium" | "low";
};

type MotionPhaseName =
  | "approach"
  | "edge_load"
  | "takeoff"
  | "pop"
  | "airborne"
  | "peak_air"
  | "rotation"
  | "descent"
  | "landing"
  | "crash_recovery";

type MotionPhaseWindow = {
  phase: MotionPhaseName;
  startSeconds: number;
  endSeconds: number;
  evidence: string;
  confidence: "high" | "medium" | "low";
};

type FrameExtractionWindow = {
  startSeconds: number;
  endSeconds: number;
};

type OpenAiHighlightScoutPayload = {
  highlightCandidates: HighlightCandidateWindow[];
  overallConfidence: "high" | "medium" | "low";
  notEnoughEvidenceReason: string;
};

type OpenAiMotionScoutPayload = {
  phaseWindows: MotionPhaseWindow[];
  primaryHighlightTimestampSeconds: number | null;
  thumbnailFrameTimestampSeconds: number | null;
  highlightFrameTimestampsSeconds: number[];
  overallConfidence: "high" | "medium" | "low";
  notEnoughEvidenceReason: string;
};

function parseGeminiAnalysis(outputText: string) {
  let parsed: GeminiAnalysisPayload;

  try {
    parsed = JSON.parse(extractJsonObject(outputText)) as GeminiAnalysisPayload;
  } catch (error) {
    console.error("Gemini returned invalid JSON:", outputText.slice(0, 1000));

    return {
      parseFailed: true,
      summary: invalidJsonSummary(outputText),
      highlights: [
        "코칭 응답은 도착했지만 앱에서 읽을 수 있는 JSON 형식으로 끝까지 오지 않았습니다.",
      ],
      highlightScenes: [],
      suggestions: [
        "서버를 재시작한 뒤 같은 영상으로 다시 코칭을 요청해 주세요.",
      ],
    };
  }

  return normalizeGeminiAnalysis(parsed);
}

function parseGeminiEvidence(outputText: string) {
  let parsed: GeminiEvidencePayload;

  try {
    parsed = JSON.parse(extractJsonObject(outputText)) as GeminiEvidencePayload;
  } catch (error) {
    console.error(
      "Gemini evidence returned invalid JSON:",
      outputText.slice(0, 1000),
    );

    const partial = parsePartialGeminiEvidence(outputText);

    if (partial) {
      return {
        ...partial,
        parseFailed: false,
        uncertainty: {
          level: partial.uncertainty.level,
          reasons: [
            ...partial.uncertainty.reasons,
            "Gemini 응답 JSON 일부가 잘렸지만, 도착한 핵심 기술 후보와 동작 근거는 복구했습니다.",
          ],
        },
      };
    }

    const temporalWindows = normalizeTemporalWindows(undefined);
    const rawApproachType = normalizeEvidenceFact(undefined, "확인 필요");
    const approachObservedFacts = normalizeApproachObservedFacts(undefined);
    const rawEdgeLoadObservedFacts = normalizeEdgeLoadObservedFacts(undefined);
    const edgeLoadValidation = validateEdgeLoadObservedFacts({
      temporalWindows,
      approachObservedFacts,
      edgeLoadObservedFacts: rawEdgeLoadObservedFacts,
    });
    const edgeLoadObservedFacts = edgeLoadValidation.after;
    const rawPopObservedFacts = normalizePopObservedFacts(undefined);
    const popValidation = validatePopObservedFacts({
      temporalWindows,
      popObservedFacts: rawPopObservedFacts,
    });
    const popObservedFacts = popValidation.after;
    const rawRotationObservedFacts = normalizeRotationObservedFacts(undefined);
    const rotationValidation = validateRotationObservedFacts({
      family: normalizeEvidenceFact(undefined, "확인 필요"),
      rotationObservedFacts: rawRotationObservedFacts,
    });
    const rotationObservedFacts = rotationValidation.after;
    const rawGrabObservedFacts = normalizeGrabObservedFacts(undefined);
    const grabValidation = validateGrabObservedFacts({
      grabObservedFacts: rawGrabObservedFacts,
    });
    const grabObservedFacts = grabValidation.after;
    const rawLandingObservedFacts = normalizeLandingObservedFacts(undefined);
    const landingValidation = validateLandingObservedFacts({
      landingObservedFacts: rawLandingObservedFacts,
    });
    const landingObservedFacts = landingValidation.after;
    const inversionObservedFacts = normalizeInversionObservedFacts(undefined);
    const approachDecision = deriveApproachDecision(
      approachObservedFacts,
      rawApproachType,
      temporalWindows,
    );
    const approachObservedFactsV2 = deriveApproachObservedFactsV2(
      approachObservedFacts,
      rawApproachType,
      edgeLoadObservedFacts,
      edgeLoadValidation,
    );
    const approachDecisionV2 = deriveApproachDecisionV2(
      approachObservedFactsV2,
    );

    return {
      parseFailed: true,
      consistencyStatus: "needs_review" as EvidenceConsistencyStatus,
      consistencyWarnings: ["Gemini evidence 응답을 JSON으로 해석하지 못했습니다."],
      primaryCandidate: normalizeTrickCandidate(undefined, "확인 필요"),
      alternativeCandidates: [],
      family: normalizeEvidenceFact(undefined, "확인 필요"),
      temporalWindows,
      rawApproachType,
      approachObservedFacts,
      edgeLoadObservedFacts,
      edgeLoadValidation,
      popObservedFacts,
      popValidation,
      rotationObservedFacts,
      rotationValidation,
      grabObservedFacts,
      grabValidation,
      landingObservedFacts,
      landingValidation,
      approachObservedFactsV2,
      inversionObservedFacts,
      approachDecision,
      approachDecisionV2,
      approachWarnings: approachDecision.uncertainty,
      approachType: approachFactFromDecision(
        approachDecision,
        rawApproachType,
      ),
      rotationType: normalizeEvidenceFact(undefined, "확인 필요"),
      landingOutcome: normalizeEvidenceFact(undefined, "확인 필요"),
      confidence: "low" as const,
      evidence: invalidJsonSummary(outputText),
      evidenceWindows: [],
      observations: [],
      uncertainty: {
        level: "high" as const,
        reasons: [
          "Gemini evidence 응답을 JSON으로 해석하지 못했습니다.",
          invalidJsonSummary(outputText),
        ],
      },
    };
  }

  return normalizeGeminiEvidence(parsed);
}

function isPartialRecoveredEvidence(
  evidence: ReturnType<typeof normalizeGeminiEvidence>,
) {
  return evidence.uncertainty.reasons.some((reason) =>
    reason.includes("복구"),
  );
}

function parsePartialGeminiEvidence(outputText: string) {
  const primaryCandidate = parseObjectProperty(outputText, "primaryCandidate");

  if (!primaryCandidate) {
    return null;
  }

  const alternativeCandidates =
    parseArrayProperty(outputText, "alternativeCandidates") ?? [];
  const family = parseObjectProperty(outputText, "family");
  const temporalWindows = parseObjectProperty(outputText, "temporalWindows");
  const approachObservedFacts = parseObjectProperty(
    outputText,
    "approachObservedFacts",
  );
  const edgeLoadObservedFacts = parseObjectProperty(
    outputText,
    "edgeLoadObservedFacts",
  );
  const popObservedFacts = parseObjectProperty(
    outputText,
    "popObservedFacts",
  );
  const rotationObservedFacts = parseObjectProperty(
    outputText,
    "rotationObservedFacts",
  );
  const grabObservedFacts = parseObjectProperty(
    outputText,
    "grabObservedFacts",
  ) ?? parseStringProperty(outputText, "grabObservedFacts");
  const landingObservedFacts = parseObjectProperty(
    outputText,
    "landingObservedFacts",
  ) ?? parseStringProperty(outputText, "landingObservedFacts");
  const inversionObservedFacts = parseObjectProperty(
    outputText,
    "inversionObservedFacts",
  );
  const approachType = parseObjectProperty(outputText, "approachType");
  const rotationType = parseObjectProperty(outputText, "rotationType");
  const landingOutcome = parseObjectProperty(outputText, "landingOutcome");
  const uncertainty = parseObjectProperty(outputText, "uncertainty");

  const partialEvidence: Partial<GeminiEvidencePayload> = {
    primaryCandidate:
      primaryCandidate as GeminiEvidencePayload["primaryCandidate"],
    alternativeCandidates:
      alternativeCandidates as GeminiEvidencePayload["alternativeCandidates"],
    family: family as GeminiEvidencePayload["family"] | undefined,
    temporalWindows:
      temporalWindows as GeminiEvidencePayload["temporalWindows"] | undefined,
    approachObservedFacts:
      approachObservedFacts as GeminiEvidencePayload["approachObservedFacts"] | undefined,
    edgeLoadObservedFacts:
      edgeLoadObservedFacts as GeminiEvidencePayload["edgeLoadObservedFacts"] | undefined,
    popObservedFacts:
      popObservedFacts as GeminiEvidencePayload["popObservedFacts"] | undefined,
    rotationObservedFacts:
      rotationObservedFacts as GeminiEvidencePayload["rotationObservedFacts"] | undefined,
    grabObservedFacts:
      grabObservedFacts as GeminiEvidencePayload["grabObservedFacts"] | undefined,
    landingObservedFacts:
      landingObservedFacts as GeminiEvidencePayload["landingObservedFacts"] | undefined,
    inversionObservedFacts:
      inversionObservedFacts as GeminiEvidencePayload["inversionObservedFacts"] | undefined,
    approachType: approachType as GeminiEvidencePayload["approachType"] | undefined,
    rotationType: rotationType as GeminiEvidencePayload["rotationType"] | undefined,
    landingOutcome:
      landingOutcome as GeminiEvidencePayload["landingOutcome"] | undefined,
    confidence:
      asOpenAiConfidenceLevel(stringProperty(outputText, "confidence")) ??
      "low",
    evidence:
      stringProperty(outputText, "evidence") ??
      "Gemini가 기술 후보를 일부 추정했지만 전체 JSON은 완성되지 않았습니다.",
    evidenceWindows: [],
    observations: [],
    uncertainty: (uncertainty as GeminiEvidencePayload["uncertainty"]) ?? {
      level: "medium",
      reasons: ["Gemini 응답이 중간에서 잘려 일부 근거만 표시합니다."],
    },
  };

  return normalizeGeminiEvidence(partialEvidence);
}

function parseObjectProperty(outputText: string, key: string) {
  const marker = `"${key}"`;
  const markerIndex = outputText.indexOf(marker);

  if (markerIndex === -1) {
    return undefined;
  }

  const objectStart = outputText.indexOf("{", markerIndex + marker.length);

  if (objectStart === -1) {
    return undefined;
  }

  const objectEnd = findMatchingBracket(outputText, objectStart, "{", "}");

  if (objectEnd === -1) {
    return undefined;
  }

  try {
    return JSON.parse(outputText.slice(objectStart, objectEnd + 1)) as Record<
      string,
      unknown
    >;
  } catch {
    return undefined;
  }
}

function parseStringProperty(outputText: string, key: string) {
  const marker = `"${key}"`;
  const markerIndex = outputText.indexOf(marker);

  if (markerIndex === -1) {
    return undefined;
  }

  const colonIndex = outputText.indexOf(":", markerIndex + marker.length);

  if (colonIndex === -1) {
    return undefined;
  }

  const valueStart = outputText.slice(colonIndex + 1).search(/\S/);

  if (valueStart === -1) {
    return undefined;
  }

  const stringStart = colonIndex + 1 + valueStart;

  if (outputText[stringStart] !== '"') {
    return undefined;
  }

  for (let index = stringStart + 1; index < outputText.length; index += 1) {
    if (outputText[index] !== '"') {
      continue;
    }

    let slashCount = 0;
    for (
      let slashIndex = index - 1;
      slashIndex > stringStart && outputText[slashIndex] === "\\";
      slashIndex -= 1
    ) {
      slashCount += 1;
    }

    if (slashCount % 2 === 1) {
      continue;
    }

    try {
      return JSON.parse(outputText.slice(stringStart, index + 1)) as string;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function parseArrayProperty(outputText: string, key: string) {
  const marker = `"${key}"`;
  const markerIndex = outputText.indexOf(marker);

  if (markerIndex === -1) {
    return undefined;
  }

  const arrayStart = outputText.indexOf("[", markerIndex + marker.length);

  if (arrayStart === -1) {
    return undefined;
  }

  const arrayEnd = findMatchingBracket(outputText, arrayStart, "[", "]");

  if (arrayEnd === -1) {
    return undefined;
  }

  try {
    return JSON.parse(outputText.slice(arrayStart, arrayEnd + 1)) as unknown[];
  } catch {
    return undefined;
  }
}

function findMatchingBracket(
  text: string,
  startIndex: number,
  openBracket: "{" | "[",
  closeBracket: "}" | "]",
) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === openBracket) {
      depth += 1;
    }

    if (char === closeBracket) {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function stringProperty(outputText: string, key: string) {
  const match = outputText.match(
    new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`),
  );

  if (!match) {
    return undefined;
  }

  return match[1].replace(/\\"/g, '"');
}

function parseOpenAiHighlightScout(
  outputText: string,
): OpenAiHighlightScoutPayload {
  if (!outputText.trim()) {
    return {
      highlightCandidates: [],
      overallConfidence: "low",
      notEnoughEvidenceReason:
        "OpenAI highlight scout 응답의 최종 텍스트가 비어 있습니다.",
    };
  }

  try {
    const parsed = JSON.parse(
      extractJsonObject(outputText),
    ) as Partial<OpenAiHighlightScoutPayload>;

    return {
      highlightCandidates: normalizeHighlightCandidateWindows(
        parsed.highlightCandidates,
      ),
      overallConfidence:
        asOpenAiConfidenceLevel(parsed.overallConfidence) ?? "low",
      notEnoughEvidenceReason:
        typeof parsed.notEnoughEvidenceReason === "string"
          ? parsed.notEnoughEvidenceReason
          : "전체 영상 샘플만으로 신뢰할 수 있는 하이라이트 후보를 특정하지 못했습니다.",
    };
  } catch (error) {
    console.error(
      "OpenAI highlight scout returned invalid JSON:",
      outputText.slice(0, 1000),
    );

    return {
      highlightCandidates: [],
      overallConfidence: "low",
      notEnoughEvidenceReason:
        "OpenAI highlight scout 응답을 JSON으로 해석하지 못해 하이라이트 후보를 확정하지 않았습니다.",
    };
  }
}

function parseOpenAiMotionScout(outputText: string): OpenAiMotionScoutPayload {
  if (!outputText.trim()) {
    return {
      phaseWindows: [],
      primaryHighlightTimestampSeconds: null,
      thumbnailFrameTimestampSeconds: null,
      highlightFrameTimestampsSeconds: [],
      overallConfidence: "low",
      notEnoughEvidenceReason:
        "OpenAI motion scout 응답의 최종 텍스트가 비어 있습니다.",
    };
  }

  try {
    const parsed = JSON.parse(
      extractJsonObject(outputText),
    ) as Partial<OpenAiMotionScoutPayload>;

    return {
      phaseWindows: normalizeMotionPhaseWindows(parsed.phaseWindows),
      primaryHighlightTimestampSeconds: nullableNumber(
        parsed.primaryHighlightTimestampSeconds,
      ),
      thumbnailFrameTimestampSeconds: nullableNumber(
        parsed.thumbnailFrameTimestampSeconds,
      ),
      highlightFrameTimestampsSeconds: normalizeNumberArray(
        parsed.highlightFrameTimestampsSeconds,
      ),
      overallConfidence:
        asOpenAiConfidenceLevel(parsed.overallConfidence) ?? "low",
      notEnoughEvidenceReason:
        typeof parsed.notEnoughEvidenceReason === "string"
          ? parsed.notEnoughEvidenceReason
          : "전체 영상 샘플만으로 신뢰할 수 있는 motion phase 구간을 특정하지 못했습니다.",
    };
  } catch (error) {
    console.error(
      "OpenAI motion scout returned invalid JSON:",
      outputText.slice(0, 1000),
    );

    return {
      phaseWindows: [],
      primaryHighlightTimestampSeconds: null,
      thumbnailFrameTimestampSeconds: null,
      highlightFrameTimestampsSeconds: [],
      overallConfidence: "low",
      notEnoughEvidenceReason:
        "OpenAI motion scout 응답을 JSON으로 해석하지 못해 phase 구간을 확정하지 않았습니다.",
    };
  }
}

function parseOpenAiBenchmark(outputText: string) {
  let parsed: OpenAiBenchmarkPayload;

  if (!outputText.trim()) {
    return {
      parseFailed: true,
      humanReadableAnalysis:
        "GPT 요청은 완료됐지만 최종 코칭 텍스트가 비어 있었습니다. reasoning effort 또는 출력 토큰 설정 문제일 가능성이 높습니다.",
      summary:
        "GPT 요청은 완료됐지만 최종 코칭 텍스트가 비어 있었습니다. 서버 설정을 조정한 뒤 새 기록에서 다시 확인해야 합니다.",
      highlights: ["OpenAI API 응답의 최종 출력 텍스트가 비어 있었습니다."],
      highlightScenes: [],
      suggestions: [
        "새 GPT 설정이 반영된 서버로 새 라이딩 기록에서 다시 요청해 주세요.",
      ],
      observations: [],
      patternRecognition: [],
      inferences: [],
      confidence: {
        level: "low" as const,
        reason:
          "최종 출력 텍스트가 없어 영상 내용에 대한 확신도를 산출할 수 없습니다.",
      },
      selfCritique: {
        limitations: ["OpenAI 응답에 최종 텍스트가 포함되지 않았습니다."],
        whatWouldImproveAnalysis: [
          "reasoning effort를 낮추고 max output tokens를 늘린 설정으로 다시 실행하세요.",
        ],
      },
    };
  }

  try {
    parsed = JSON.parse(
      extractJsonObject(outputText),
    ) as OpenAiBenchmarkPayload;
  } catch (error) {
    console.error("OpenAI returned invalid JSON:", outputText.slice(0, 1000));

    return {
      parseFailed: true,
      humanReadableAnalysis: invalidJsonSummary(outputText),
      summary: invalidJsonSummary(outputText),
      highlights: [
        "코칭 응답은 도착했지만 앱에서 읽을 수 있는 JSON 형식으로 끝까지 오지 않았습니다.",
      ],
      highlightScenes: [],
      suggestions: [
        "서버를 재시작한 뒤 같은 영상으로 다시 코칭을 요청해 주세요.",
      ],
      observations: [],
      patternRecognition: [],
      inferences: [],
      confidence: {
        level: "low" as const,
        reason: "JSON 파싱 실패로 구조화된 확신도를 산출할 수 없습니다.",
      },
      selfCritique: {
        limitations: ["모델 응답이 JSON 형식을 지키지 않았습니다."],
        whatWouldImproveAnalysis: ["동일 영상으로 다시 분석을 실행하세요."],
      },
    };
  }

  return normalizeOpenAiBenchmark(parsed);
}

function normalizeHighlightCandidateWindows(
  value: unknown,
): HighlightCandidateWindow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const candidate = item as Record<string, unknown>;
      const startSeconds = Number(candidate.startSeconds);
      const endSeconds = Number(candidate.endSeconds);
      const confidence = asOpenAiConfidenceLevel(candidate.confidence);

      if (
        !Number.isFinite(startSeconds) ||
        !Number.isFinite(endSeconds) ||
        endSeconds <= startSeconds ||
        !confidence
      ) {
        return null;
      }

      return {
        startSeconds,
        endSeconds,
        reason:
          typeof candidate.reason === "string"
            ? candidate.reason
            : "프레임에서 액션 후보가 보였습니다.",
        confidence,
      };
    })
    .filter((item): item is HighlightCandidateWindow => Boolean(item));
}

function normalizeMotionPhaseWindows(value: unknown): MotionPhaseWindow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const candidate = item as Record<string, unknown>;
      const phase = asMotionPhaseName(candidate.phase);
      const startSeconds = Number(candidate.startSeconds);
      const endSeconds = Number(candidate.endSeconds);
      const confidence = asOpenAiConfidenceLevel(candidate.confidence);

      if (
        !phase ||
        !Number.isFinite(startSeconds) ||
        !Number.isFinite(endSeconds) ||
        endSeconds <= startSeconds ||
        !confidence
      ) {
        return null;
      }

      return {
        phase,
        startSeconds,
        endSeconds,
        evidence:
          typeof candidate.evidence === "string"
            ? candidate.evidence
            : "해당 phase의 움직임 근거가 보입니다.",
        confidence,
      };
    })
    .filter((item): item is MotionPhaseWindow => Boolean(item));
}

function asMotionPhaseName(value: unknown): MotionPhaseName | undefined {
  return value === "approach" ||
    value === "edge_load" ||
    value === "takeoff" ||
    value === "pop" ||
    value === "airborne" ||
    value === "peak_air" ||
    value === "rotation" ||
    value === "descent" ||
    value === "landing" ||
    value === "crash_recovery"
    ? value
    : undefined;
}

function nullableNumber(value: unknown) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeNumberArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item))
    .slice(0, 6);
}

function selectHighlightCandidateWindows(
  scout: OpenAiHighlightScoutPayload,
  durationSeconds: number | undefined,
) {
  return scout.highlightCandidates
    .filter(
      (candidate) =>
        candidate.confidence === "high" || candidate.confidence === "medium",
    )
    .slice(0, 3)
    .map((candidate) => {
      const paddedStart = Math.max(candidate.startSeconds - 1.5, 0);
      const paddedEnd = candidate.endSeconds + 1.5;

      return {
        ...candidate,
        startSeconds: durationSeconds
          ? Math.min(paddedStart, Math.max(durationSeconds - 0.5, 0))
          : paddedStart,
        endSeconds: durationSeconds
          ? Math.min(paddedEnd, durationSeconds)
          : paddedEnd,
      };
    })
    .filter((candidate) => candidate.endSeconds > candidate.startSeconds);
}

function selectDenseMotionWindows(
  scout: OpenAiMotionScoutPayload,
  durationSeconds: number | undefined,
) {
  const initiationPhases = new Set<MotionPhaseName>([
    "takeoff",
    "pop",
    "rotation",
  ]);
  const airbornePhases = new Set<MotionPhaseName>([
    "airborne",
    "peak_air",
  ]);
  const setupContextPhases = new Set<MotionPhaseName>([
    "edge_load",
    "takeoff",
  ]);
  const descentContextPhases = new Set<MotionPhaseName>(["descent"]);
  const outcomePhases = new Set<MotionPhaseName>(["landing", "crash_recovery"]);
  const isConfident = (window: MotionPhaseWindow) =>
    window.confidence === "high" || window.confidence === "medium";
  const confidentInitiationWindows = scout.phaseWindows.filter(
    (window) =>
      isConfident(window) && initiationPhases.has(window.phase),
  );
  const confidentAirborneWindows = scout.phaseWindows.filter(
    (window) =>
      isConfident(window) && airbornePhases.has(window.phase),
  );
  const confidentPrimaryWindows = [
    ...confidentInitiationWindows,
    ...confidentAirborneWindows,
  ];
  const confidentSupportWindows = scout.phaseWindows.filter(
    (window) =>
      isConfident(window) &&
      (setupContextPhases.has(window.phase) ||
        descentContextPhases.has(window.phase)),
  );
  const confidentOutcomeWindows = scout.phaseWindows.filter(
    (window) => isConfident(window) && outcomePhases.has(window.phase),
  );
  const fallbackWindows = scout.phaseWindows.filter(isConfident);
  const selectedWindows =
    confidentPrimaryWindows.length > 0
      ? [...confidentSupportWindows, ...confidentPrimaryWindows]
      : confidentSupportWindows.length > 0
        ? confidentSupportWindows
        : confidentOutcomeWindows.length > 0
          ? confidentOutcomeWindows
          : fallbackWindows;

  if (selectedWindows.length === 0) {
    return [];
  }

  const hasPrimaryEvidence = confidentPrimaryWindows.length > 0;
  const startSeconds = Math.max(
    Math.min(...selectedWindows.map((window) => window.startSeconds)) -
      (hasPrimaryEvidence ? 0.8 : 1.5),
    0,
  );
  const endSeconds = Math.max(
    ...selectedWindows.map((window) => window.endSeconds),
  ) + (hasPrimaryEvidence ? 0.8 : 1);

  return [
    {
      startSeconds,
      endSeconds: durationSeconds ? Math.min(endSeconds, durationSeconds) : endSeconds,
    },
  ].filter((window) => window.endSeconds > window.startSeconds);
}

function asOpenAiConfidenceLevel(value: unknown) {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : undefined;
}

function extractJsonObject(outputText: string) {
  const trimmed = outputText.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const jsonText = fencedMatch?.[1]?.trim() ?? trimmed;
  const start = jsonText.indexOf("{");
  const end = jsonText.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return jsonText;
  }

  return jsonText.slice(start, end + 1);
}

function normalizeGeminiAnalysis(parsed: Partial<GeminiAnalysisPayload>) {
  return {
    parseFailed: false,
    summary:
      typeof parsed.summary === "string"
        ? parsed.summary
        : "영상 분석 결과를 받았습니다.",
    highlights: normalizeStringArray(parsed.highlights, [
      "영상에서 주요 움직임을 확인했습니다.",
    ]),
    highlightScenes: normalizeHighlightScenes(parsed.highlightScenes),
    suggestions: normalizeStringArray(parsed.suggestions, [
      "같은 구간을 한 번 더 촬영해 비교해 보세요.",
    ]),
  };
}

function normalizeGeminiEvidence(parsed: Partial<GeminiEvidencePayload>) {
  const family = normalizeEvidenceFact(parsed.family, "확인 필요");
  const rawApproachType = normalizeEvidenceFact(
    parsed.approachType,
    "확인 필요",
  );
  const temporalWindows = normalizeTemporalWindows(parsed.temporalWindows);
  const approachObservedFacts = normalizeApproachObservedFacts(
    parsed.approachObservedFacts,
  );
  const rawEdgeLoadObservedFacts = normalizeEdgeLoadObservedFacts(
    parsed.edgeLoadObservedFacts,
  );
  const edgeLoadValidation = validateEdgeLoadObservedFacts({
    temporalWindows,
    approachObservedFacts,
    edgeLoadObservedFacts: rawEdgeLoadObservedFacts,
  });
  const edgeLoadObservedFacts = edgeLoadValidation.after;
  const rawPopObservedFacts = normalizePopObservedFacts(
    parsed.popObservedFacts,
  );
  const popValidation = validatePopObservedFacts({
    temporalWindows,
    popObservedFacts: rawPopObservedFacts,
  });
  const popObservedFacts = popValidation.after;
  const rawRotationObservedFacts = normalizeRotationObservedFacts(
    parsed.rotationObservedFacts,
  );
  const rotationValidation = validateRotationObservedFacts({
    family,
    rotationObservedFacts: rawRotationObservedFacts,
  });
  const rotationObservedFacts = rotationValidation.after;
  const rawGrabObservedFacts = normalizeGrabObservedFacts(
    parsed.grabObservedFacts,
  );
  const grabValidation = validateGrabObservedFacts({
    grabObservedFacts: rawGrabObservedFacts,
  });
  const grabObservedFacts = grabValidation.after;
  const rawLandingObservedFacts = normalizeLandingObservedFacts(
    parsed.landingObservedFacts,
  );
  const landingValidation = validateLandingObservedFacts({
    landingObservedFacts: rawLandingObservedFacts,
  });
  const landingObservedFacts = landingValidation.after;
  const inversionObservedFacts = normalizeInversionObservedFacts(
    parsed.inversionObservedFacts,
  );
  const approachDecision = deriveApproachDecision(
    approachObservedFacts,
    rawApproachType,
    temporalWindows,
  );
  const approachObservedFactsV2 = deriveApproachObservedFactsV2(
    approachObservedFacts,
    rawApproachType,
    edgeLoadObservedFacts,
    edgeLoadValidation,
  );
  const approachDecisionV2 = deriveApproachDecisionV2(approachObservedFactsV2);
  const approachWarnings = approachDecision.uncertainty;

  return {
    parseFailed: false,
    consistencyStatus: "valid" as EvidenceConsistencyStatus,
    consistencyWarnings: [] as string[],
    primaryCandidate: normalizeTrickCandidate(
      parsed.primaryCandidate,
      "확인 필요",
    ),
    alternativeCandidates: normalizeTrickCandidates(
      parsed.alternativeCandidates,
    ),
    family,
    temporalWindows,
    rawApproachType,
    approachObservedFacts,
    edgeLoadObservedFacts,
    edgeLoadValidation,
    popObservedFacts,
    popValidation,
    rotationObservedFacts,
    rotationValidation,
    grabObservedFacts,
    grabValidation,
    landingObservedFacts,
    landingValidation,
    approachObservedFactsV2,
    inversionObservedFacts,
    approachDecision,
    approachDecisionV2,
    approachWarnings,
    approachType: approachFactFromDecision(approachDecision, rawApproachType),
    rotationType: normalizeEvidenceFact(parsed.rotationType, "확인 필요"),
    landingOutcome: normalizeEvidenceFact(parsed.landingOutcome, "확인 필요"),
    confidence: asOpenAiConfidenceLevel(parsed.confidence) ?? "low",
    evidence:
      typeof parsed.evidence === "string"
        ? parsed.evidence
        : "AI 추정 근거가 충분히 제공되지 않았습니다.",
    evidenceWindows: normalizeEvidenceWindows(parsed.evidenceWindows),
    observations: normalizeEvidenceObservations(parsed.observations),
    uncertainty: normalizeEvidenceUncertainty(parsed.uncertainty),
  };
}

function normalizeTemporalWindows(
  value: unknown,
): EvidenceTemporalWindowsPayload {
  const temporal =
    value && typeof value === "object"
      ? (value as Partial<EvidenceTemporalWindowsPayload>)
      : {};
  const takeoff = normalizeTakeoffDetection(temporal.takeoffTimestamp);
  const finalApproachWindow = normalizeFinalApproachWindow(
    temporal.finalApproachWindow,
    takeoff.timestampSeconds,
  );

  return {
    takeoffTimestamp: takeoff,
    finalApproachWindow,
    ignoredSetupWindows: normalizeIgnoredSetupWindows(
      temporal.ignoredSetupWindows,
    ),
    approachWindowConfidence:
      asOpenAiConfidenceLevel(temporal.approachWindowConfidence) ??
      finalApproachWindow.confidence,
  };
}

function normalizeTakeoffDetection(value: unknown): TakeoffDetectionPayload {
  if (!value || typeof value !== "object") {
    return {
      timestampSeconds: null,
      confidence: "low",
      evidence: "takeoff/pop timestamp를 충분히 구조화하지 못했습니다.",
    };
  }

  const takeoff = value as Record<string, unknown>;
  const timestampSeconds = Number(takeoff.timestampSeconds);

  return {
    timestampSeconds: Number.isFinite(timestampSeconds)
      ? timestampSeconds
      : null,
    confidence: asOpenAiConfidenceLevel(takeoff.confidence) ?? "low",
    evidence:
      typeof takeoff.evidence === "string"
        ? takeoff.evidence
        : "takeoff/pop timestamp 근거가 부족합니다.",
  };
}

function normalizeFinalApproachWindow(
  value: unknown,
  takeoffTimestamp: number | null,
): FinalApproachWindowPayload {
  const fallbackEnd = takeoffTimestamp ?? 0;
  const fallbackStart = Math.max(0, fallbackEnd - 3);

  if (!value || typeof value !== "object") {
    return {
      startSeconds: fallbackStart,
      endSeconds: fallbackEnd,
      confidence: "low",
      reasonWindowWasChosen:
        "final approach window를 충분히 구조화하지 못했습니다.",
    };
  }

  const window = value as Record<string, unknown>;
  const startSeconds = Number(window.startSeconds);
  const endSeconds = Number(window.endSeconds);

  return {
    startSeconds: Number.isFinite(startSeconds) ? startSeconds : fallbackStart,
    endSeconds: Number.isFinite(endSeconds) ? endSeconds : fallbackEnd,
    confidence: asOpenAiConfidenceLevel(window.confidence) ?? "low",
    reasonWindowWasChosen:
      typeof window.reasonWindowWasChosen === "string"
        ? window.reasonWindowWasChosen
        : "takeoff 직전 final approach window로 선택했습니다.",
  };
}

function normalizeIgnoredSetupWindows(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as EvidenceTemporalWindowsPayload["ignoredSetupWindows"];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const window = item as Record<string, unknown>;
      const startSeconds = Number(window.startSeconds);
      const endSeconds = Number(window.endSeconds);

      if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) {
        return null;
      }

      return {
        startSeconds,
        endSeconds,
        reason:
          typeof window.reason === "string"
            ? window.reason
            : "final approach window 이전 setup/slalom 구간입니다.",
      };
    })
    .filter(
      (item): item is EvidenceTemporalWindowsPayload["ignoredSetupWindows"][number] =>
        Boolean(item),
    );
}

function normalizeApproachObservedFacts(
  value: unknown,
): ApproachObservedFactsPayload {
  const facts =
    value && typeof value === "object"
      ? (value as Partial<ApproachObservedFactsPayload>)
      : {};

  return {
    stance: normalizeApproachFact(facts.stance, "unknown"),
    leadFoot: normalizeApproachFact(facts.leadFoot, "unknown"),
    boardDirection: normalizeApproachFact(facts.boardDirection, "unknown"),
    wakeCrossingPath: normalizeWakeCrossingPath(facts.wakeCrossingPath),
    edgeDirectionEvidence: normalizeApproachFact(
      facts.edgeDirectionEvidence,
      "unknown",
    ),
    handlePosition: normalizeApproachFact(facts.handlePosition, "unknown"),
    bodyOrientation: normalizeApproachFact(facts.bodyOrientation, "unknown"),
  };
}

function normalizeEdgeLoadObservedFacts(
  value: unknown,
): EdgeLoadObservedFactsPayload {
  const facts =
    value && typeof value === "object"
      ? (value as Partial<EdgeLoadObservedFactsPayload>)
      : {};

  return {
    toeEdgeLoaded: normalizeApproachFact(facts.toeEdgeLoaded, "unknown"),
    heelEdgeLoaded: normalizeApproachFact(facts.heelEdgeLoaded, "unknown"),
    edgeLoadVisible: normalizeApproachFact(facts.edgeLoadVisible, "unknown"),
    edgeLoadTiming: normalizeEdgeLoadTiming(facts.edgeLoadTiming),
    boardTiltDirection: normalizeApproachFact(
      facts.boardTiltDirection,
      "unknown",
    ),
    sprayDirection: normalizeApproachFact(facts.sprayDirection, "unknown"),
    lineTensionDirection: normalizeApproachFact(
      facts.lineTensionDirection,
      "unknown",
    ),
    riderWeightOverEdge: normalizeApproachFact(
      facts.riderWeightOverEdge,
      "unknown",
    ),
    edgeLoadConfidence:
      asOpenAiConfidenceLevel(facts.edgeLoadConfidence) ?? "low",
    edgeLoadEvidenceText:
      typeof facts.edgeLoadEvidenceText === "string"
        ? facts.edgeLoadEvidenceText
        : "",
    antiEdgeLoadEvidence: normalizeStringArray(
      facts.antiEdgeLoadEvidence,
      [],
    ),
  };
}

function normalizeEdgeLoadTiming(
  value: unknown,
): EdgeLoadObservedFactsPayload["edgeLoadTiming"] {
  const timing =
    value && typeof value === "object"
      ? (value as Partial<EdgeLoadObservedFactsPayload["edgeLoadTiming"]>)
      : {};
  const startSec = Number(timing.startSec);
  const endSec = Number(timing.endSec);

  return {
    startSec: Number.isFinite(startSec) ? startSec : null,
    endSec: Number.isFinite(endSec) ? endSec : null,
    observedMoment:
      typeof timing.observedMoment === "string"
        ? timing.observedMoment
        : "unknown",
    evidenceFrameDescription:
      typeof timing.evidenceFrameDescription === "string"
        ? timing.evidenceFrameDescription
        : "",
  };
}

function validateEdgeLoadObservedFacts({
  temporalWindows,
  approachObservedFacts,
  edgeLoadObservedFacts,
}: {
  temporalWindows: EvidenceTemporalWindowsPayload;
  approachObservedFacts: ApproachObservedFactsPayload;
  edgeLoadObservedFacts: EdgeLoadObservedFactsPayload;
}): EdgeLoadValidationResult {
  const before = cloneEdgeLoadObservedFacts(edgeLoadObservedFacts);
  const after = cloneEdgeLoadObservedFacts(edgeLoadObservedFacts);
  const rulesApplied: string[] = [];
  const rejectedHighConfidenceReasons: string[] = [];
  const reviewReasons: string[] = [];
  const edgeLoadText = [
    approachObservedFacts.edgeDirectionEvidence.evidence,
    edgeLoadObservedFacts.edgeLoadEvidenceText,
  ].join(" ");
  const independentPhysicalEvidenceCount =
    countIndependentEdgeLoadEvidence(edgeLoadObservedFacts);
  const hasBodyOrientationLeak = containsBodyOrientationEvidence(edgeLoadText);
  const isLabelOnlyEvidence = edgeLoadEvidenceIsLabelOnly(
    edgeLoadObservedFacts.edgeLoadEvidenceText,
  );
  const hasFinalApproachTiming = edgeLoadTimingOverlapsFinalApproach(
    edgeLoadObservedFacts.edgeLoadTiming,
    temporalWindows.finalApproachWindow,
  );
  const wasHigh = edgeLoadObservedFacts.edgeLoadConfidence === "high";

  if (hasBodyOrientationLeak) {
    rejectedHighConfidenceReasons.push(
      "edgeDirectionEvidence or edgeLoadEvidenceText contains body orientation terms.",
    );
    reviewReasons.push("body orientation was used near edge load evidence.");
    addPostValidationAntiEvidence(
      after,
      "post-validation: body orientation terms appeared near edge load evidence.",
    );
  }

  if (isLabelOnlyEvidence) {
    rejectedHighConfidenceReasons.push(
      "edgeLoadEvidenceText repeats an edge label without independent physical detail.",
    );
    reviewReasons.push("edge load evidence appears label-only.");
    addPostValidationAntiEvidence(
      after,
      "post-validation: edgeLoadEvidenceText appears label-only.",
    );
  }

  if (independentPhysicalEvidenceCount < 2) {
    rejectedHighConfidenceReasons.push(
      "edgeLoadConfidence high requires at least two independent physical evidence indicators.",
    );
  }

  if (!hasFinalApproachTiming) {
    rejectedHighConfidenceReasons.push(
      "edgeLoadConfidence high requires timestamped visual evidence inside finalApproachWindow.",
    );
    reviewReasons.push(
      "edge load timing is missing or outside finalApproachWindow.",
    );
    addPostValidationAntiEvidence(
      after,
      "post-validation: edgeLoadTiming is missing or outside finalApproachWindow.",
    );
  }

  if (
    edgeLoadObservedFacts.antiEdgeLoadEvidence.length === 0 &&
    edgeLoadObservedFacts.edgeLoadConfidence === "high"
  ) {
    reviewReasons.push(
      "edgeLoadConfidence was high while antiEdgeLoadEvidence was empty.",
    );
    addPostValidationAntiEvidence(
      after,
      "post-validation: antiEdgeLoadEvidence was empty for high confidence.",
    );
  }

  if (wasHigh && rejectedHighConfidenceReasons.length > 0) {
    after.edgeLoadConfidence =
      independentPhysicalEvidenceCount >= 1 &&
      !hasBodyOrientationLeak &&
      !isLabelOnlyEvidence
        ? "medium"
        : "low";
    rulesApplied.push(
      `edgeLoadConfidence downgraded from high to ${after.edgeLoadConfidence}.`,
    );
    after.toeEdgeLoaded = downgradeEdgeLoadFactConfidence(
      after.toeEdgeLoaded,
      after.edgeLoadConfidence,
    );
    after.heelEdgeLoaded = downgradeEdgeLoadFactConfidence(
      after.heelEdgeLoaded,
      after.edgeLoadConfidence,
    );
  }

  if (reviewReasons.length > 0) {
    rulesApplied.push(...reviewReasons);
  }

  return {
    before,
    after,
    adjusted: JSON.stringify(before) !== JSON.stringify(after),
    needsReview: reviewReasons.length > 0,
    independentPhysicalEvidenceCount,
    rulesApplied,
    rejectedHighConfidenceReasons,
  };
}

function addPostValidationAntiEvidence(
  facts: EdgeLoadObservedFactsPayload,
  reason: string,
) {
  if (!facts.antiEdgeLoadEvidence.includes(reason)) {
    facts.antiEdgeLoadEvidence.push(reason);
  }
}

function cloneEdgeLoadObservedFacts(
  facts: EdgeLoadObservedFactsPayload,
): EdgeLoadObservedFactsPayload {
  return {
    toeEdgeLoaded: { ...facts.toeEdgeLoaded },
    heelEdgeLoaded: { ...facts.heelEdgeLoaded },
    edgeLoadVisible: { ...facts.edgeLoadVisible },
    edgeLoadTiming: { ...facts.edgeLoadTiming },
    boardTiltDirection: { ...facts.boardTiltDirection },
    sprayDirection: { ...facts.sprayDirection },
    lineTensionDirection: { ...facts.lineTensionDirection },
    riderWeightOverEdge: { ...facts.riderWeightOverEdge },
    edgeLoadConfidence: facts.edgeLoadConfidence,
    edgeLoadEvidenceText: facts.edgeLoadEvidenceText,
    antiEdgeLoadEvidence: [...facts.antiEdgeLoadEvidence],
  };
}

function edgeLoadTimingOverlapsFinalApproach(
  timing: EdgeLoadObservedFactsPayload["edgeLoadTiming"],
  finalApproachWindow: EvidenceTemporalWindowsPayload["finalApproachWindow"],
) {
  if (
    timing.startSec === null ||
    timing.endSec === null ||
    !Number.isFinite(timing.startSec) ||
    !Number.isFinite(timing.endSec)
  ) {
    return false;
  }

  return (
    timing.endSec >= finalApproachWindow.startSeconds &&
    timing.startSec <= finalApproachWindow.endSeconds
  );
}

function downgradeEdgeLoadFactConfidence(
  fact: ApproachFactPayload,
  confidence: ApproachFactPayload["confidence"],
): ApproachFactPayload {
  const text = normalizeDomainText(`${fact.value} ${fact.evidence}`);
  const isPositiveLoadedFact =
    includesAnyDomainTerm(text, ["true", "loaded", "로드", "하중", "실림"]) &&
    fact.confidence === "high";

  return isPositiveLoadedFact
    ? {
        ...fact,
        confidence,
        evidence: `${fact.evidence} 서버 post-validation에서 ${confidence} confidence로 낮췄습니다.`,
      }
    : fact;
}

function countIndependentEdgeLoadEvidence(
  facts: EdgeLoadObservedFactsPayload,
) {
  const evidenceKeys = new Set<string>();

  addIndependentEdgeLoadEvidence(
    evidenceKeys,
    facts.boardTiltDirection,
    isPhysicalBoardTiltEvidence,
  );
  addIndependentEdgeLoadEvidence(
    evidenceKeys,
    facts.sprayDirection,
    isPhysicalEdgeSprayEvidence,
  );
  addIndependentEdgeLoadEvidence(
    evidenceKeys,
    facts.riderWeightOverEdge,
    isPhysicalRiderWeightEvidence,
  );

  return evidenceKeys.size;
}

function addIndependentEdgeLoadEvidence(
  evidenceKeys: Set<string>,
  fact: ApproachFactPayload,
  predicate: (text: string) => boolean,
) {
  const text = normalizeDomainText(`${fact.value} ${fact.evidence}`);

  if (
    fact.confidence === "low" ||
    containsBodyOrientationEvidence(text) ||
    edgeLoadEvidenceIsLabelOnly(text) ||
    !predicate(text)
  ) {
    return;
  }

  evidenceKeys.add(dedupeEdgeLoadEvidenceText(text));
}

function dedupeEdgeLoadEvidenceText(text: string) {
  return text
    .replace(/\b(toe|heel|toeside|heelside|edge|loaded|load)\b/g, "")
    .replace(/\b(토|힐|토사이드|힐사이드|엣지|로드|하중)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePopObservedFacts(value: unknown): PopObservedFactsPayload {
  const facts =
    value && typeof value === "object"
      ? (value as Partial<PopObservedFactsPayload>)
      : {};

  return {
    popType: normalizeNullableString(facts.popType),
    timing: normalizeNullableString(facts.timing),
    intensity: normalizeNullableString(facts.intensity),
    evidenceText: normalizeNullableString(facts.evidenceText),
    confidence: asOpenAiConfidenceLevel(facts.confidence) ?? "low",
    antiEvidence: normalizeStringArray(facts.antiEvidence, []),
  };
}

function normalizeNullableString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function validatePopObservedFacts({
  temporalWindows,
  popObservedFacts,
}: {
  temporalWindows: EvidenceTemporalWindowsPayload;
  popObservedFacts: PopObservedFactsPayload;
}): PopValidationResult {
  const before = clonePopObservedFacts(popObservedFacts);
  const after = clonePopObservedFacts(popObservedFacts);
  const rulesApplied: string[] = [];
  const rejectedHighConfidenceReasons: string[] = [];
  const reviewReasons: string[] = [];
  const evidenceText = [
    popObservedFacts.popType,
    popObservedFacts.timing,
    popObservedFacts.intensity,
    popObservedFacts.evidenceText,
  ]
    .filter(Boolean)
    .join(" ");
  const independentPhysicalEvidenceCount =
    countIndependentPopEvidence(evidenceText);
  const hasTakeoffTimestamp =
    temporalWindows.takeoffTimestamp.timestampSeconds !== null;
  const hasTiming = Boolean(popObservedFacts.timing);
  const labelOnlyEvidence = popEvidenceIsLabelOnly(evidenceText);
  const shouldKeepProgressiveWakePopAtMedium =
    isPlausibleProgressiveWakePop({
      popObservedFacts,
      evidenceText,
      hasTakeoffTimestamp,
      labelOnlyEvidence,
    });
  const wasHigh = popObservedFacts.confidence === "high";

  if (!hasTakeoffTimestamp) {
    rejectedHighConfidenceReasons.push(
      "Pop high confidence requires a detected takeoffTimestamp.",
    );
    reviewReasons.push("takeoffTimestamp is missing for pop validation.");
    addPostValidationAntiPopEvidence(
      after,
      "post-validation: takeoffTimestamp is missing.",
    );
  }

  if (!hasTiming) {
    rejectedHighConfidenceReasons.push(
      "Pop high confidence requires timing evidence near takeoff.",
    );
    reviewReasons.push("pop timing evidence is missing.");
    addPostValidationAntiPopEvidence(
      after,
      "post-validation: pop timing evidence is missing.",
    );
  }

  if (independentPhysicalEvidenceCount < 2) {
    rejectedHighConfidenceReasons.push(
      "popConfidence high requires at least two independent visible physical pop indicators.",
    );
  }

  if (labelOnlyEvidence) {
    rejectedHighConfidenceReasons.push(
      "pop evidence repeats a pop label without independent physical detail.",
    );
    reviewReasons.push("pop evidence appears label-only.");
    addPostValidationAntiPopEvidence(
      after,
      "post-validation: pop evidence appears label-only.",
    );
  }

  if (
    popObservedFacts.antiEvidence.length === 0 &&
    popObservedFacts.confidence === "high"
  ) {
    rejectedHighConfidenceReasons.push(
      "Pop high confidence requires antiEvidence to document missing or contradictory cues.",
    );
    reviewReasons.push("Pop confidence was high while antiEvidence was empty.");
    addPostValidationAntiPopEvidence(
      after,
      "post-validation: antiEvidence was empty for high confidence.",
    );
  }

  if (wasHigh && rejectedHighConfidenceReasons.length > 0) {
    after.confidence =
      (independentPhysicalEvidenceCount >= 1 && !labelOnlyEvidence) ||
      shouldKeepProgressiveWakePopAtMedium
        ? "medium"
        : "low";
    rulesApplied.push(
      `Pop confidence downgraded from high to ${after.confidence}.`,
    );
  }

  if (reviewReasons.length > 0) {
    rulesApplied.push(...reviewReasons);
  }

  return {
    before,
    after,
    adjusted: JSON.stringify(before) !== JSON.stringify(after),
    needsReview: reviewReasons.length > 0,
    independentPhysicalEvidenceCount,
    rulesApplied,
    rejectedHighConfidenceReasons,
  };
}

function clonePopObservedFacts(
  facts: PopObservedFactsPayload,
): PopObservedFactsPayload {
  return {
    popType: facts.popType,
    timing: facts.timing,
    intensity: facts.intensity,
    evidenceText: facts.evidenceText,
    confidence: facts.confidence,
    antiEvidence: [...facts.antiEvidence],
  };
}

function addPostValidationAntiPopEvidence(
  facts: PopObservedFactsPayload,
  reason: string,
) {
  if (!facts.antiEvidence.includes(reason)) {
    facts.antiEvidence.push(reason);
  }
}

function isPlausibleProgressiveWakePop({
  popObservedFacts,
  evidenceText,
  hasTakeoffTimestamp,
  labelOnlyEvidence,
}: {
  popObservedFacts: PopObservedFactsPayload;
  evidenceText: string;
  hasTakeoffTimestamp: boolean;
  labelOnlyEvidence: boolean;
}) {
  return (
    hasTakeoffTimestamp &&
    popObservedFacts.popType === "progressive_pop" &&
    popObservedFacts.timing === "on_wake" &&
    popObservedFacts.intensity === "moderate" &&
    popObservedFacts.antiEvidence.length > 0 &&
    !labelOnlyEvidence &&
    hasWakeEdgeReleasePopEvidence(evidenceText)
  );
}

function hasWakeEdgeReleasePopEvidence(text: string) {
  return includesAnyDomainTerm(normalizeDomainText(text), [
    "wake",
    "edge",
    "release",
    "takeoff",
    "wake lip",
    "top of wake",
    "leaves the wake",
    "웨이크",
    "엣지",
    "릴리즈",
    "이륙",
    "웨이크 끝까지",
    "웨이크 경사",
    "자연스럽게 뜸",
    "웨이크 정점",
    "수면에서 떨어짐",
  ]);
}

function countIndependentPopEvidence(text: string) {
  const normalized = normalizeDomainText(text);
  const evidenceKeys = new Set<string>();

  if (isPhysicalWakeReleaseEvidence(normalized)) {
    evidenceKeys.add("wake_release");
  }

  if (isPhysicalBoardReleaseEvidence(normalized)) {
    evidenceKeys.add("board_release_angle");
  }

  if (isPhysicalLineTensionEvidence(normalized)) {
    evidenceKeys.add("line_tension");
  }

  if (isPhysicalRiderExtensionEvidence(normalized)) {
    evidenceKeys.add("rider_extension");
  }

  if (isPhysicalUpwardTrajectoryEvidence(normalized)) {
    evidenceKeys.add("upward_trajectory");
  }

  return evidenceKeys.size;
}

function popEvidenceIsLabelOnly(text: string) {
  const normalized = normalizeDomainText(text);

  if (!normalized.trim()) {
    return true;
  }

  return (
    includesAnyDomainTerm(normalized, [
      "progressive pop",
      "trip pop",
      "late pop",
      "early release",
      "pop detected",
      "프로그레시브 팝",
      "트립 팝",
      "늦은 팝",
      "이른 릴리즈",
    ]) &&
    countIndependentPopEvidence(normalized) === 0
  );
}

function isPhysicalWakeReleaseEvidence(text: string) {
  return includesAnyDomainTerm(text, [
    "wake lip",
    "top of wake",
    "release",
    "takeoff",
    "leaves the wake",
    "웨이크 립",
    "웨이크 정상",
    "웨이크 정점",
    "이륙",
    "릴리즈",
    "수면에서 떨어짐",
  ]);
}

function isPhysicalBoardReleaseEvidence(text: string) {
  return includesAnyDomainTerm(text, [
    "board angle",
    "nose",
    "tail",
    "ramp",
    "edge angle",
    "보드 각도",
    "노즈",
    "테일",
    "엣지 각도",
  ]);
}

function isPhysicalLineTensionEvidence(text: string) {
  return includesAnyDomainTerm(text, [
    "line tension",
    "rope tension",
    "handle tension",
    "taut line",
    "라인 텐션",
    "로프 텐션",
    "핸들 텐션",
  ]);
}

function isPhysicalRiderExtensionEvidence(text: string) {
  return includesAnyDomainTerm(text, [
    "leg extension",
    "knees extend",
    "stands tall",
    "hips rise",
    "다리",
    "무릎",
    "다리를 펴",
    "펴",
    "힙",
  ]);
}

function isPhysicalUpwardTrajectoryEvidence(text: string) {
  return includesAnyDomainTerm(text, [
    "upward trajectory",
    "vertical lift",
    "rises",
    "upward",
    "상승",
    "수직",
    "위로",
    "수면에서 떨어짐",
  ]);
}

function normalizeRotationObservedFacts(
  value: unknown,
): RotationObservedFactsPayload {
  const facts =
    value && typeof value === "object"
      ? (value as Partial<RotationObservedFactsPayload>)
      : {};

  return {
    rotationAxis: normalizeRotationAxis(facts.rotationAxis),
    rotationDirection: normalizeRotationDirection(facts.rotationDirection),
    inversionDetected: normalizeObservedBoolean(facts.inversionDetected),
    spinDegrees: normalizeSpinDegrees(facts.spinDegrees),
    handlePassObserved: normalizeObservedBoolean(facts.handlePassObserved),
    evidenceText: normalizeNullableString(facts.evidenceText),
    confidence: asOpenAiConfidenceLevel(facts.confidence) ?? "low",
    antiEvidence: normalizeStringArray(facts.antiEvidence, []),
  };
}

function normalizeRotationAxis(value: unknown) {
  const text = normalizeNullableString(value);

  if (
    text &&
    ["roll_axis", "flip_axis", "spin_yaw_axis", "off_axis", "none", "unknown"].includes(
      text,
    )
  ) {
    return text;
  }

  return "unknown";
}

function normalizeRotationDirection(value: unknown) {
  const text = normalizeNullableString(value);

  if (
    text &&
    ["frontside", "backside", "left", "right", "none", "unknown"].includes(text)
  ) {
    return text;
  }

  return "unknown";
}

function normalizeSpinDegrees(value: unknown) {
  const text =
    typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : normalizeNullableString(value);

  if (text && ["0", "180", "360", "540", "unknown"].includes(text)) {
    return text;
  }

  return "unknown";
}

function validateRotationObservedFacts({
  family,
  rotationObservedFacts,
}: {
  family: ApproachFactPayload;
  rotationObservedFacts: RotationObservedFactsPayload;
}): RotationValidationResult {
  const before = cloneRotationObservedFacts(rotationObservedFacts);
  const after = cloneRotationObservedFacts(rotationObservedFacts);
  const rulesApplied: string[] = [];
  const rejectedHighConfidenceReasons: string[] = [];
  const reviewReasons: string[] = [];
  const evidenceText = [
    rotationObservedFacts.rotationAxis,
    rotationObservedFacts.rotationDirection,
    rotationObservedFacts.spinDegrees,
    rotationObservedFacts.evidenceText,
  ]
    .filter(Boolean)
    .join(" ");
  const independentRotationEvidenceCount =
    countIndependentRotationEvidence(evidenceText);
  const hasAxis =
    rotationObservedFacts.rotationAxis !== null &&
    !["unknown", "none"].includes(rotationObservedFacts.rotationAxis);
  const hasEvidenceText = Boolean(rotationObservedFacts.evidenceText);
  const labelOnlyEvidence = rotationEvidenceIsLabelOnly(evidenceText);
  const wasHigh = rotationObservedFacts.confidence === "high";
  const clearNonRotationBasicJumpEvidence =
    isBasicJumpFamily(family) &&
    hasNoRotationObservedFacts(rotationObservedFacts) &&
    hasClearNoRotationEvidence(evidenceText);

  if (!hasAxis && wasHigh && !clearNonRotationBasicJumpEvidence) {
    rejectedHighConfidenceReasons.push(
      "Rotation high confidence requires a visible rotationAxis.",
    );
    reviewReasons.push("rotationAxis is missing for high confidence.");
    addPostValidationAntiRotationEvidence(
      after,
      "post-validation: rotationAxis is missing for high confidence.",
    );
  }

  if (!hasEvidenceText && wasHigh) {
    rejectedHighConfidenceReasons.push(
      "Rotation high confidence requires visible mechanics evidenceText.",
    );
    reviewReasons.push("rotation evidenceText is missing.");
    addPostValidationAntiRotationEvidence(
      after,
      "post-validation: rotation evidenceText is missing.",
    );
  }

  if (
    independentRotationEvidenceCount < 2 &&
    wasHigh &&
    !clearNonRotationBasicJumpEvidence
  ) {
    rejectedHighConfidenceReasons.push(
      "Rotation high confidence requires at least two independent visible rotation indicators.",
    );
  }

  if (labelOnlyEvidence) {
    rejectedHighConfidenceReasons.push(
      "Rotation evidence repeats labels without independent mechanics.",
    );
    reviewReasons.push("rotation evidence appears label-only.");
    addPostValidationAntiRotationEvidence(
      after,
      "post-validation: rotation evidence appears label-only.",
    );
  }

  if (
    rotationObservedFacts.antiEvidence.length === 0 &&
    rotationObservedFacts.confidence === "high" &&
    !clearNonRotationBasicJumpEvidence
  ) {
    rejectedHighConfidenceReasons.push(
      "Rotation high confidence requires antiEvidence to document missing or contradictory cues.",
    );
    reviewReasons.push(
      "Rotation confidence was high while antiEvidence was empty.",
    );
    addPostValidationAntiRotationEvidence(
      after,
      "post-validation: antiEvidence was empty for high confidence.",
    );
  }

  if (wasHigh && clearNonRotationBasicJumpEvidence) {
    after.confidence = "medium";
    rulesApplied.push(
      "Rotation confidence calibrated from high to medium for clear no-rotation Basic Jump evidence.",
    );
  } else if (wasHigh && rejectedHighConfidenceReasons.length > 0) {
    after.confidence =
      independentRotationEvidenceCount >= 1 && !labelOnlyEvidence
        ? "medium"
        : "low";
    rulesApplied.push(
      `Rotation confidence downgraded from high to ${after.confidence}.`,
    );
  }

  if (reviewReasons.length > 0) {
    rulesApplied.push(...reviewReasons);
  }

  return {
    before,
    after,
    adjusted: JSON.stringify(before) !== JSON.stringify(after),
    needsReview: reviewReasons.length > 0,
    independentRotationEvidenceCount,
    rulesApplied,
    rejectedHighConfidenceReasons,
  };
}

function isBasicJumpFamily(family: ApproachFactPayload) {
  const text = normalizeDomainText(`${family.value} ${family.evidence}`);

  return includesAnyDomainTerm(text, [
    "basic jump",
    "basic air",
    "straight air",
    "wake jump",
    "기본 점프",
    "베이직 점프",
    "스트레이트 에어",
  ]);
}

function hasNoRotationObservedFacts(facts: RotationObservedFactsPayload) {
  return (
    facts.rotationAxis === "none" &&
    facts.rotationDirection === "none" &&
    facts.inversionDetected === false &&
    facts.spinDegrees === "0" &&
    facts.handlePassObserved === false
  );
}

function hasClearNoRotationEvidence(text: string) {
  const normalized = normalizeDomainText(text);
  const hasRotationSubject = includesAnyDomainTerm(normalized, [
    "rotation",
    "spin",
    "inversion",
    "invert",
    "axis",
    "회전",
    "스핀",
    "인버트",
    "축",
  ]);
  const hasNoObservation = includesAnyDomainTerm(normalized, [
    "not observed",
    "not visible",
    "not seen",
    "none observed",
    "no visible",
    "보이지 않음",
    "관찰되지",
    "관찰되지 않음",
    "관찰되지 않았",
    "없음",
    "없이",
  ]);

  if (hasRotationSubject && hasNoObservation) {
    return true;
  }

  return includesAnyDomainTerm(normalized, [
    "회전 없음",
    "회전 없이",
    "회전도 관찰되지",
    "회전하는 움직임이 관찰되지",
    "회전축이나 스핀 동작이 전혀 관찰되지",
    "전혀 관찰되지",
    "관찰되지 않음",
    "어떠한 회전도 관찰되지 않음",
    "안정적인 자세",
    "no rotation",
    "without rotation",
    "stable body position",
    "no spin",
    "no inversion",
    "no invert",
  ]);
}

function cloneRotationObservedFacts(
  facts: RotationObservedFactsPayload,
): RotationObservedFactsPayload {
  return {
    rotationAxis: facts.rotationAxis,
    rotationDirection: facts.rotationDirection,
    inversionDetected: facts.inversionDetected,
    spinDegrees: facts.spinDegrees,
    handlePassObserved: facts.handlePassObserved,
    evidenceText: facts.evidenceText,
    confidence: facts.confidence,
    antiEvidence: [...facts.antiEvidence],
  };
}

function addPostValidationAntiRotationEvidence(
  facts: RotationObservedFactsPayload,
  reason: string,
) {
  if (!facts.antiEvidence.includes(reason)) {
    facts.antiEvidence.push(reason);
  }
}

function normalizeGrabObservedFacts(value: unknown): GrabObservedFactsPayload {
  const parsedValue =
    typeof value === "string" ? parseJsonObjectString(value) : value;
  const facts =
    parsedValue && typeof parsedValue === "object"
      ? (parsedValue as Partial<GrabObservedFactsPayload>)
      : {};

  return {
    grabDetected: normalizeObservedBoolean(facts.grabDetected),
    contactVisible: normalizeObservedBoolean(facts.contactVisible),
    grabbingHand: normalizeGrabHand(facts.grabbingHand),
    grabbedBoardZone: normalizeGrabBoardZone(facts.grabbedBoardZone),
    grabTiming: normalizeGrabTiming(facts.grabTiming),
    grabDuration: normalizeGrabDuration(facts.grabDuration),
    evidenceText: normalizeNullableString(facts.evidenceText),
    confidence: asOpenAiConfidenceLevel(facts.confidence) ?? "low",
    antiEvidence: normalizeStringArray(facts.antiEvidence, []),
  };
}

function normalizeGrabHand(value: unknown) {
  const text = normalizeNullableString(value);

  if (
    text &&
    ["front_hand", "rear_hand", "both_hands", "unknown", "none"].includes(text)
  ) {
    return text;
  }

  return text ? "unknown" : null;
}

function normalizeGrabBoardZone(value: unknown) {
  const text = normalizeNullableString(value);

  if (
    text &&
    [
      "toe_edge_between_bindings",
      "heel_edge_between_bindings",
      "nose",
      "tail",
      "frontside_edge",
      "backside_edge",
      "center_board",
      "unknown_zone",
      "none",
    ].includes(text)
  ) {
    return text;
  }

  return text ? "unknown_zone" : null;
}

function normalizeGrabTiming(value: unknown) {
  const text = normalizeNullableString(value);

  if (
    text &&
    ["takeoff", "rising", "peak_air", "descent", "landing", "unknown", "none"].includes(
      text,
    )
  ) {
    return text;
  }

  return text ? "unknown" : null;
}

function normalizeGrabDuration(value: unknown) {
  const text = normalizeNullableString(value);

  if (
    text &&
    ["momentary", "held", "attempted_reach", "none", "unknown"].includes(text)
  ) {
    return text;
  }

  return text ? "unknown" : null;
}

function validateGrabObservedFacts({
  grabObservedFacts,
}: {
  grabObservedFacts: GrabObservedFactsPayload;
}): GrabValidationResult {
  const before = cloneGrabObservedFacts(grabObservedFacts);
  const after = cloneGrabObservedFacts(grabObservedFacts);
  const rulesApplied: string[] = [];
  const rejectedHighConfidenceReasons: string[] = [];
  const reviewReasons: string[] = [];
  const evidenceText = [
    grabObservedFacts.grabbingHand,
    grabObservedFacts.grabbedBoardZone,
    grabObservedFacts.grabTiming,
    grabObservedFacts.grabDuration,
    grabObservedFacts.evidenceText,
  ]
    .filter(Boolean)
    .join(" ");
  const independentGrabEvidenceCount = countIndependentGrabEvidence(evidenceText);
  const wasHigh = grabObservedFacts.confidence === "high";
  const isPositiveGrab = grabObservedFacts.grabDetected === true;
  const isClearNoGrab = hasClearNoGrabEvidence(grabObservedFacts, evidenceText);
  const hasEvidenceText = Boolean(grabObservedFacts.evidenceText);
  const labelOnlyEvidence = grabEvidenceIsLabelOnly(evidenceText);
  const hasExplicitContactPoint =
    hasExplicitGrabContactPointEvidence(evidenceText);
  const hasWeakPositiveGrabLanguage = hasWeakGrabPositiveEvidence(evidenceText);

  if (isPositiveGrab && grabObservedFacts.contactVisible !== true) {
    rejectedHighConfidenceReasons.push(
      "Positive grab requires visible hand-to-board contact.",
    );
    reviewReasons.push("grabDetected was true without contactVisible=true.");
    after.confidence = "low";
    after.grabDetected =
      grabObservedFacts.contactVisible === false ? false : "unknown";
    addPostValidationAntiGrabEvidence(
      after,
      "post-validation: positive grab requires visible hand-board contact.",
    );
  }

  if (
    isPositiveGrab &&
    grabObservedFacts.contactVisible === true &&
    (!hasExplicitContactPoint || hasWeakPositiveGrabLanguage)
  ) {
    rejectedHighConfidenceReasons.push(
      "Positive grab requires an explicit visible hand/finger-board contact point.",
    );
    reviewReasons.push(
      "positive grab was downgraded because contact point evidence is weak or implicit.",
    );
    after.grabDetected = "unknown";
    after.contactVisible = "unknown";
    after.grabDuration =
      grabObservedFacts.grabDuration === "held"
        ? "attempted_reach"
        : (grabObservedFacts.grabDuration ?? "unknown");
    after.confidence = "low";
    addPostValidationAntiGrabEvidence(
      after,
      "post-validation: no explicit visible hand/finger-board contact point.",
    );
  }

  if (!isPositiveGrab && grabObservedFacts.contactVisible === true) {
    reviewReasons.push("contactVisible=true conflicts with grabDetected=false/unknown.");
    addPostValidationAntiGrabEvidence(
      after,
      "post-validation: contactVisible conflicts with grabDetected.",
    );
  }

  if (!hasEvidenceText && wasHigh) {
    rejectedHighConfidenceReasons.push(
      "Grab high confidence requires visible contact evidenceText.",
    );
    reviewReasons.push("grab evidenceText is missing.");
    addPostValidationAntiGrabEvidence(
      after,
      "post-validation: grab evidenceText is missing.",
    );
  }

  if (labelOnlyEvidence) {
    rejectedHighConfidenceReasons.push(
      "Grab evidence repeats a grab label without visible hand-board contact.",
    );
    reviewReasons.push("grab evidence appears label-only.");
    after.confidence = "low";
    addPostValidationAntiGrabEvidence(
      after,
      "post-validation: label-only grab claim.",
    );
  }

  if (
    isPositiveGrab &&
    grabObservedFacts.grabDuration === "attempted_reach"
  ) {
    rejectedHighConfidenceReasons.push(
      "Attempted reach is not an actual grab.",
    );
    reviewReasons.push("attempted reach was reported as a positive grab.");
    after.grabDetected = "unknown";
    after.confidence = "low";
    addPostValidationAntiGrabEvidence(
      after,
      "post-validation: attempted reach is not visible contact.",
    );
  }

  if (
    grabObservedFacts.grabDuration === "held" &&
    !hasSustainedGrabEvidence(evidenceText)
  ) {
    rejectedHighConfidenceReasons.push(
      "Held grab requires sustained or multiple-frame contact evidence.",
    );
    reviewReasons.push("grabDuration=held lacks sustained contact evidence.");
    after.grabDuration =
      grabObservedFacts.contactVisible === true ? "momentary" : "unknown";
    if (after.confidence === "high") {
      after.confidence = "medium";
    }
  }

  if (
    wasHigh &&
    grabObservedFacts.grabTiming &&
    !["none", "unknown"].includes(grabObservedFacts.grabTiming) &&
    !hasGrabTimingEvidence(evidenceText)
  ) {
    rejectedHighConfidenceReasons.push(
      "Grab timing high confidence requires visible contact timing evidence.",
    );
    reviewReasons.push("grab timing was precise without visible contact timing.");
    after.grabTiming = "unknown";
  }

  if (
    !isPositiveGrab &&
    ["front_hand", "rear_hand", "both_hands"].includes(
      grabObservedFacts.grabbingHand ?? "",
    )
  ) {
    reviewReasons.push("specific grabbingHand was given without a positive grab.");
    after.grabbingHand =
      grabObservedFacts.contactVisible === true ? "unknown" : "none";
  }

  if (
    grabObservedFacts.contactVisible !== true &&
    grabObservedFacts.grabbedBoardZone &&
    !["none", "unknown_zone"].includes(grabObservedFacts.grabbedBoardZone)
  ) {
    reviewReasons.push("specific board zone was given without visible contact.");
    after.grabbedBoardZone =
      grabObservedFacts.contactVisible === false ? "none" : "unknown_zone";
  }

  if (
    wasHigh &&
    isPositiveGrab &&
    independentGrabEvidenceCount < 2
  ) {
    rejectedHighConfidenceReasons.push(
      "Positive grab high confidence requires at least two independent contact indicators.",
    );
  }

  if (
    wasHigh &&
    rejectedHighConfidenceReasons.length > 0 &&
    after.confidence !== "low"
  ) {
    after.confidence =
      independentGrabEvidenceCount >= 1 && !labelOnlyEvidence
        ? "medium"
        : "low";
    rulesApplied.push(
      `Grab confidence downgraded from high to ${after.confidence}.`,
    );
  }

  if (isClearNoGrab && grabObservedFacts.grabDetected === false) {
    after.contactVisible = false;
    after.grabbingHand = "none";
    after.grabbedBoardZone = "none";
    after.grabTiming = "none";
    after.grabDuration = "none";
  }

  if (reviewReasons.length > 0) {
    rulesApplied.push(...reviewReasons);
  }

  return {
    before,
    after,
    adjusted: JSON.stringify(before) !== JSON.stringify(after),
    needsReview: reviewReasons.length > 0,
    independentGrabEvidenceCount,
    rulesApplied,
    rejectedHighConfidenceReasons,
  };
}

function cloneGrabObservedFacts(
  facts: GrabObservedFactsPayload,
): GrabObservedFactsPayload {
  return {
    grabDetected: facts.grabDetected,
    contactVisible: facts.contactVisible,
    grabbingHand: facts.grabbingHand,
    grabbedBoardZone: facts.grabbedBoardZone,
    grabTiming: facts.grabTiming,
    grabDuration: facts.grabDuration,
    evidenceText: facts.evidenceText,
    confidence: facts.confidence,
    antiEvidence: [...facts.antiEvidence],
  };
}

function addPostValidationAntiGrabEvidence(
  facts: GrabObservedFactsPayload,
  reason: string,
) {
  if (!facts.antiEvidence.includes(reason)) {
    facts.antiEvidence.push(reason);
  }
}

function countIndependentGrabEvidence(text: string) {
  const normalized = normalizeDomainText(text);
  const evidenceKeys = new Set<string>();

  if (hasHandLeavesHandleEvidence(normalized)) {
    evidenceKeys.add("hand_leaves_handle");
  }

  if (hasHandBoardContactEvidence(normalized)) {
    evidenceKeys.add("hand_board_contact");
  }

  if (hasGrabBoardZoneEvidence(normalized)) {
    evidenceKeys.add("board_zone");
  }

  if (hasGrabTimingEvidence(normalized)) {
    evidenceKeys.add("airborne_timing");
  }

  if (hasSustainedGrabEvidence(normalized)) {
    evidenceKeys.add("sustained_contact");
  }

  return evidenceKeys.size;
}

function hasClearNoGrabEvidence(
  facts: GrabObservedFactsPayload,
  evidenceText: string,
) {
  const normalized = normalizeDomainText(
    [evidenceText, ...facts.antiEvidence].join(" "),
  );

  return (
    facts.grabDetected === false &&
    (facts.contactVisible === false || facts.contactVisible === "unknown") &&
    includesAnyDomainTerm(normalized, [
      "no visible hand-board contact",
      "no hand-board contact",
      "both hands remain on handle",
      "both hands stayed on handle",
      "hands remain on handle",
      "hands stayed on handle",
      "no grab visible",
      "손과 보드 접촉 없음",
      "손이 보드에 닿지",
      "두 손이 핸들",
      "양손이 핸들",
      "그랩 없음",
    ])
  );
}

function grabEvidenceIsLabelOnly(text: string) {
  const normalized = normalizeDomainText(text);

  if (!normalized.trim()) {
    return false;
  }

  return (
    includesAnyDomainTerm(normalized, [
      "indy",
      "melon",
      "mute",
      "stalefish",
      "method",
      "tail grab",
      "nose grab",
      "grab trick",
      "그랩",
      "인디",
      "멜론",
      "뮤트",
    ]) &&
    countIndependentGrabEvidence(normalized) === 0
  );
}

function hasHandLeavesHandleEvidence(text: string) {
  return includesAnyDomainTerm(text, [
    "hand leaves handle",
    "released handle",
    "one hand leaves",
    "lets go of handle",
    "손이 핸들에서",
    "핸들을 놓",
    "한 손을 떼",
  ]);
}

function hasHandBoardContactEvidence(text: string) {
  return includesAnyDomainTerm(text, [
    "touches board",
    "hand touches board",
    "hand-to-board contact",
    "grabs board",
    "contact with board",
    "손이 보드에 닿",
    "보드를 잡",
    "보드 접촉",
    "손-보드 접촉",
  ]);
}

function hasExplicitGrabContactPointEvidence(text: string) {
  return includesAnyDomainTerm(normalizeDomainText(text), [
    "finger touches board",
    "fingers touch board",
    "hand visibly touches board",
    "visible hand-to-board contact point",
    "visible contact point",
    "contact point",
    "hand contacts the board",
    "hand is in contact with the board",
    "palm on board",
    "gripping the board edge",
    "손가락이 보드에 닿",
    "손이 보드에 닿",
    "손과 보드의 접촉점",
    "접촉점",
    "보드 엣지를 잡고",
    "보드에 손이 닿",
  ]);
}

function hasWeakGrabPositiveEvidence(text: string) {
  return includesAnyDomainTerm(normalizeDomainText(text), [
    "appears to",
    "seems to",
    "likely",
    "possibly",
    "near the board",
    "close to the board",
    "overlap",
    "overlapping",
    "occluded",
    "partially hidden",
    "looks like",
    "보이는 듯",
    "처럼",
    "근처",
    "가까",
    "겹쳐",
    "가려",
    "불명확",
    "추정",
  ]);
}

function hasGrabBoardZoneEvidence(text: string) {
  return includesAnyDomainTerm(text, [
    "toe-side edge",
    "heel-side edge",
    "between bindings",
    "nose",
    "tail",
    "board edge",
    "토사이드 엣지",
    "힐사이드 엣지",
    "바인딩 사이",
    "노즈",
    "테일",
    "보드 엣지",
  ]);
}

function hasGrabTimingEvidence(text: string) {
  return includesAnyDomainTerm(text, [
    "airborne",
    "rising",
    "peak air",
    "descent",
    "before landing",
    "공중",
    "상승",
    "최고점",
    "하강",
    "착지 전",
  ]);
}

function hasSustainedGrabEvidence(text: string) {
  return includesAnyDomainTerm(text, [
    "held",
    "sustained",
    "multiple frames",
    "more than one frame",
    "across frames",
    "유지",
    "계속",
    "여러 프레임",
    "몇 프레임",
  ]);
}

function normalizeLandingObservedFacts(
  value: unknown,
): LandingObservedFactsPayload {
  const parsedValue =
    typeof value === "string" ? parseJsonObjectString(value) : value;
  const facts =
    parsedValue && typeof parsedValue === "object"
      ? (parsedValue as Partial<LandingObservedFactsPayload>)
      : {};

  return {
    landingVisible: normalizeObservedBoolean(facts.landingVisible),
    landingOutcome: normalizeLandingOutcome(facts.landingOutcome),
    boardContact: normalizeBoardContact(facts.boardContact),
    edgeOnLanding: normalizeEdgeOnLanding(facts.edgeOnLanding),
    handlePosition: normalizeLandingHandlePosition(facts.handlePosition),
    balanceRecovery: normalizeBalanceRecovery(facts.balanceRecovery),
    evidenceText: normalizeNullableString(facts.evidenceText),
    confidence: asOpenAiConfidenceLevel(facts.confidence) ?? "low",
    antiEvidence: normalizeStringArray(facts.antiEvidence, []),
  };
}

function parseJsonObjectString(value: string) {
  try {
    const parsed = JSON.parse(value);

    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

function normalizeLandingOutcome(value: unknown) {
  const text = normalizeNullableString(value);

  if (
    text &&
    [
      "clean",
      "butt_check",
      "edge_catch",
      "handle_loss",
      "over_rotated",
      "under_rotated",
      "crash",
      "rides_away",
      "not_visible",
      "unknown",
    ].includes(text)
  ) {
    return text;
  }

  return text ? "unknown" : null;
}

function normalizeBoardContact(value: unknown) {
  const text = normalizeNullableString(value);

  if (
    text &&
    [
      "clean_contact",
      "tail_first",
      "nose_first",
      "flat",
      "edge_contact",
      "hard_impact",
      "not_contacted_visible",
      "not_visible",
      "unknown",
    ].includes(text)
  ) {
    return text;
  }

  return text ? "unknown" : null;
}

function normalizeEdgeOnLanding(value: unknown) {
  const text = normalizeNullableString(value);

  if (
    text &&
    [
      "toe_edge",
      "heel_edge",
      "flat",
      "edge_catch",
      "not_visible",
      "unknown",
    ].includes(text)
  ) {
    return text;
  }

  return text ? "unknown" : null;
}

function normalizeLandingHandlePosition(value: unknown) {
  const text = normalizeNullableString(value);

  if (
    text &&
    [
      "controlled",
      "near_lead_hip",
      "away_from_body",
      "high",
      "dropped",
      "pulled_out",
      "two_hands_visible",
      "one_hand_visible",
      "not_visible",
      "unknown",
    ].includes(text)
  ) {
    return text;
  }

  return text ? "unknown" : null;
}

function normalizeBalanceRecovery(value: unknown) {
  const text = normalizeNullableString(value);

  if (
    text &&
    [
      "rides_away",
      "recovers",
      "unstable",
      "falls",
      "butt_check_recovery",
      "no_recovery",
      "not_visible",
      "unknown",
    ].includes(text)
  ) {
    return text;
  }

  return text ? "unknown" : null;
}

function validateLandingObservedFacts({
  landingObservedFacts,
}: {
  landingObservedFacts: LandingObservedFactsPayload;
}): LandingValidationResult {
  const before = cloneLandingObservedFacts(landingObservedFacts);
  const after = cloneLandingObservedFacts(landingObservedFacts);
  const rulesApplied: string[] = [];
  const rejectedHighConfidenceReasons: string[] = [];
  const reviewReasons: string[] = [];
  const evidenceText = [
    landingObservedFacts.landingOutcome,
    landingObservedFacts.boardContact,
    landingObservedFacts.edgeOnLanding,
    landingObservedFacts.handlePosition,
    landingObservedFacts.balanceRecovery,
    landingObservedFacts.evidenceText,
  ]
    .filter(Boolean)
    .join(" ");
  const independentLandingEvidenceCount =
    countIndependentLandingEvidence(evidenceText);
  const wasHigh = landingObservedFacts.confidence === "high";
  const landingNotVisible =
    landingObservedFacts.landingVisible === false ||
    landingObservedFacts.landingVisible === "unknown";
  const hasEvidenceText = Boolean(landingObservedFacts.evidenceText);
  const labelOnlyEvidence = landingEvidenceIsLabelOnly(evidenceText);
  const boardContactVisible = Boolean(
    landingObservedFacts.boardContact &&
      !["not_visible", "unknown"].includes(landingObservedFacts.boardContact),
  );
  const recoveryVisible = Boolean(
    landingObservedFacts.balanceRecovery &&
      !["not_visible", "unknown"].includes(
        landingObservedFacts.balanceRecovery,
      ),
  );

  if (landingNotVisible && landingObservedFacts.confidence !== "low") {
    rejectedHighConfidenceReasons.push(
      "Landing confidence cannot be medium/high when landingVisible is false or unknown.",
    );
    reviewReasons.push("landing is not visible enough for confident outcome.");
    after.confidence = "low";
    addPostValidationAntiLandingEvidence(
      after,
      "post-validation: landing visibility is false or unknown.",
    );
  }

  if (landingNotVisible && hasSpecificLandingOutcome(landingObservedFacts)) {
    reviewReasons.push("specific landing outcome was given while landing is not visible.");
    addPostValidationAntiLandingEvidence(
      after,
      "post-validation: specific landing outcome requires visible landing.",
    );
    if (landingObservedFacts.landingVisible === false) {
      after.landingOutcome = "not_visible";
    }
  }

  if (!hasEvidenceText && wasHigh) {
    rejectedHighConfidenceReasons.push(
      "Landing high confidence requires visible mechanics evidenceText.",
    );
    reviewReasons.push("landing evidenceText is missing.");
    addPostValidationAntiLandingEvidence(
      after,
      "post-validation: landing evidenceText is missing.",
    );
  }

  if (labelOnlyEvidence) {
    rejectedHighConfidenceReasons.push(
      "Landing evidence repeats outcome labels without visible mechanics.",
    );
    reviewReasons.push("landing evidence appears label-only.");
    addPostValidationAntiLandingEvidence(
      after,
      "post-validation: landing evidence appears label-only.",
    );
  }

  if (wasHigh && !boardContactVisible) {
    rejectedHighConfidenceReasons.push(
      "Landing high confidence requires visible board contact.",
    );
    reviewReasons.push("board contact is not visible for high confidence.");
  }

  if (wasHigh && !recoveryVisible) {
    rejectedHighConfidenceReasons.push(
      "Landing high confidence requires visible balance/recovery outcome.",
    );
    reviewReasons.push("balance recovery is not visible for high confidence.");
  }

  if (wasHigh && independentLandingEvidenceCount < 2) {
    rejectedHighConfidenceReasons.push(
      "Landing high confidence requires at least two independent visible landing indicators.",
    );
  }

  if (
    landingObservedFacts.landingOutcome === "clean" &&
    ["falls", "no_recovery", "unstable"].includes(
      landingObservedFacts.balanceRecovery ?? "",
    )
  ) {
    reviewReasons.push("clean landing conflicts with balance recovery.");
    addPostValidationAntiLandingEvidence(
      after,
      "post-validation: clean landing conflicts with recovery evidence.",
    );
  }

  if (
    landingObservedFacts.landingOutcome === "crash" &&
    landingObservedFacts.balanceRecovery === "rides_away"
  ) {
    reviewReasons.push("crash landing conflicts with rides_away recovery.");
    addPostValidationAntiLandingEvidence(
      after,
      "post-validation: crash landing conflicts with rides_away recovery.",
    );
  }

  if (
    landingObservedFacts.landingOutcome === "handle_loss" &&
    !["dropped", "pulled_out"].includes(
      landingObservedFacts.handlePosition ?? "",
    ) &&
    !hasHandleLossEvidence(evidenceText)
  ) {
    reviewReasons.push("handle_loss requires visible handle loss evidence.");
    addPostValidationAntiLandingEvidence(
      after,
      "post-validation: handle_loss requires dropped or pulled_out handle evidence.",
    );
  }

  if (
    wasHigh &&
    rejectedHighConfidenceReasons.length > 0 &&
    after.confidence !== "low"
  ) {
    after.confidence =
      independentLandingEvidenceCount >= 1 && !labelOnlyEvidence
        ? "medium"
        : "low";
    rulesApplied.push(
      `Landing confidence downgraded from high to ${after.confidence}.`,
    );
  }

  if (reviewReasons.length > 0) {
    rulesApplied.push(...reviewReasons);
  }

  return {
    before,
    after,
    adjusted: JSON.stringify(before) !== JSON.stringify(after),
    needsReview: reviewReasons.length > 0,
    independentLandingEvidenceCount,
    rulesApplied,
    rejectedHighConfidenceReasons,
  };
}

function cloneLandingObservedFacts(
  facts: LandingObservedFactsPayload,
): LandingObservedFactsPayload {
  return {
    landingVisible: facts.landingVisible,
    landingOutcome: facts.landingOutcome,
    boardContact: facts.boardContact,
    edgeOnLanding: facts.edgeOnLanding,
    handlePosition: facts.handlePosition,
    balanceRecovery: facts.balanceRecovery,
    evidenceText: facts.evidenceText,
    confidence: facts.confidence,
    antiEvidence: [...facts.antiEvidence],
  };
}

function addPostValidationAntiLandingEvidence(
  facts: LandingObservedFactsPayload,
  reason: string,
) {
  if (!facts.antiEvidence.includes(reason)) {
    facts.antiEvidence.push(reason);
  }
}

function hasSpecificLandingOutcome(facts: LandingObservedFactsPayload) {
  return Boolean(
    facts.landingOutcome &&
      !["not_visible", "unknown"].includes(facts.landingOutcome),
  );
}

function landingEvidenceIsLabelOnly(text: string) {
  const normalized = normalizeDomainText(text);

  if (!normalized.trim()) {
    return true;
  }

  return (
    includesAnyDomainTerm(normalized, [
      "clean landing",
      "crash landing",
      "butt check",
      "edge catch",
      "landed clean",
      "fell",
      "깨끗한 착지",
      "클린 착지",
      "크래시",
      "엉덩방아",
    ]) && countIndependentLandingEvidence(normalized) === 0
  );
}

function countIndependentLandingEvidence(text: string) {
  const normalized = normalizeDomainText(text);
  const evidenceKeys = new Set<string>();

  if (hasBoardContactEvidence(normalized)) {
    evidenceKeys.add("board_contact");
  }

  if (hasBalanceRecoveryEvidence(normalized)) {
    evidenceKeys.add("balance_recovery");
  }

  if (hasLandingHandleEvidence(normalized)) {
    evidenceKeys.add("handle_position");
  }

  if (hasLandingEdgeEvidence(normalized)) {
    evidenceKeys.add("edge_contact");
  }

  if (hasFallOutcomeEvidence(normalized)) {
    evidenceKeys.add("fall_or_ride_away");
  }

  return evidenceKeys.size;
}

function hasBoardContactEvidence(text: string) {
  return includesAnyDomainTerm(text, [
    "board contacts",
    "board contact",
    "water contact",
    "lands flat",
    "flat contact",
    "tail first",
    "nose first",
    "보드가 수면",
    "보드 접촉",
    "수면 접촉",
    "플랫",
    "테일",
    "노즈",
  ]);
}

function hasBalanceRecoveryEvidence(text: string) {
  return includesAnyDomainTerm(text, [
    "rides away",
    "rides out",
    "recovers",
    "unstable",
    "balance",
    "continues riding",
    "라이딩을 이어",
    "타고 나감",
    "회복",
    "불안정",
    "균형",
  ]);
}

function hasLandingHandleEvidence(text: string) {
  return includesAnyDomainTerm(text, [
    "handle",
    "dropped handle",
    "handle drops",
    "pulled out",
    "lead hip",
    "two hands",
    "one hand",
    "핸들",
    "핸들을 놓",
    "핸들이 빠",
    "리드 힙",
    "두 손",
    "한 손",
  ]);
}

function hasLandingEdgeEvidence(text: string) {
  return includesAnyDomainTerm(text, [
    "edge digs",
    "edge catch",
    "toe edge",
    "heel edge",
    "edge contact",
    "abrupt stop",
    "엣지가 박",
    "엣지 캐치",
    "토 엣지",
    "힐 엣지",
    "급정지",
  ]);
}

function hasFallOutcomeEvidence(text: string) {
  return includesAnyDomainTerm(text, [
    "falls",
    "fall",
    "crash",
    "butt",
    "hips touch",
    "rides away",
    "no recovery",
    "넘어",
    "크래시",
    "엉덩",
    "힙",
    "타고 나감",
    "회복하지",
  ]);
}

function hasHandleLossEvidence(text: string) {
  return includesAnyDomainTerm(normalizeDomainText(text), [
    "dropped handle",
    "handle drops",
    "handle loss",
    "pulled out",
    "핸들을 놓",
    "핸들 놓",
    "핸들이 빠",
  ]);
}

function countIndependentRotationEvidence(text: string) {
  const normalized = normalizeDomainText(text);
  const evidenceKeys = new Set<string>();

  if (isBodyAxisRotationEvidence(normalized)) {
    evidenceKeys.add("body_axis");
  }

  if (isBoardPathRotationEvidence(normalized)) {
    evidenceKeys.add("board_path");
  }

  if (isHandlePathRotationEvidence(normalized)) {
    evidenceKeys.add("handle_path");
  }

  if (isLandingDirectionRotationEvidence(normalized)) {
    evidenceKeys.add("landing_direction");
  }

  return evidenceKeys.size;
}

function rotationEvidenceIsLabelOnly(text: string) {
  const normalized = normalizeDomainText(text);

  if (!normalized.trim()) {
    return true;
  }

  return (
    includesAnyDomainTerm(normalized, [
      "roll_axis",
      "flip_axis",
      "spin_yaw_axis",
      "off_axis",
      "frontside",
      "backside",
      "180",
      "360",
      "540",
      "롤 축",
      "플립 축",
      "스핀",
      "프론트사이드",
      "백사이드",
    ]) &&
    countIndependentRotationEvidence(normalized) === 0
  );
}

function isBodyAxisRotationEvidence(text: string) {
  return includesAnyDomainTerm(text, [
    "shoulder",
    "hip",
    "torso",
    "body axis",
    "rolls",
    "pitches",
    "yaws",
    "어깨",
    "골반",
    "상체",
    "몸축",
    "몸 축",
    "구르",
    "말리",
    "회전",
  ]);
}

function isBoardPathRotationEvidence(text: string) {
  return includesAnyDomainTerm(text, [
    "board path",
    "board nose",
    "board direction",
    "board rises",
    "board stays",
    "board rotates",
    "보드 경로",
    "보드 노즈",
    "보드 방향",
    "보드가",
    "보드 회전",
  ]);
}

function isHandlePathRotationEvidence(text: string) {
  return includesAnyDomainTerm(text, [
    "handle path",
    "handle pass",
    "hands",
    "behind the back",
    "핸들",
    "핸들 패스",
    "손",
  ]);
}

function isLandingDirectionRotationEvidence(text: string) {
  return includesAnyDomainTerm(text, [
    "landing direction",
    "takeoff direction",
    "lands switch",
    "same direction",
    "착지 방향",
    "이륙 방향",
    "스위치 착지",
    "같은 방향",
  ]);
}

function containsBodyOrientationEvidence(text: string) {
  return includesAnyDomainTerm(normalizeDomainText(text), [
    "back visible",
    "chest visible",
    "facing boat",
    "facing away",
    "body orientation",
    "torso",
    "shoulder",
    "hips facing",
    "등이",
    "등 방향",
    "가슴",
    "몸 방향",
    "몸이",
    "상체",
    "어깨",
    "골반",
  ]);
}

function edgeLoadEvidenceIsLabelOnly(text: string) {
  const normalized = normalizeDomainText(text);
  const hasEdgeLabel = includesAnyDomainTerm(normalized, [
    "heel edge",
    "toe edge",
    "heelside edge",
    "toeside edge",
    "heel edge loaded",
    "toe edge loaded",
    "힐 엣지",
    "토 엣지",
    "힐사이드 엣지",
    "토사이드 엣지",
    "힐 엣지 로드",
    "토 엣지 로드",
  ]);
  const hasPhysicalDetail = includesAnyDomainTerm(normalized, [
    "spray",
    "water spray",
    "board tilt",
    "tilted",
    "edge angle",
    "weight over",
    "stacked over",
    "물보라",
    "물살",
    "보드 기울",
    "기울어",
    "엣지 각도",
    "체중",
    "무게 중심",
    "물에 잠기",
  ]);

  return hasEdgeLabel && !hasPhysicalDetail;
}

function isPhysicalBoardTiltEvidence(text: string) {
  return (
    includesAnyDomainTerm(text, [
      "board tilt",
      "tilted",
      "edge angle",
      "보드 기울",
      "기울어",
      "엣지 각도",
      "물에 잠기",
    ]) &&
    includesEdgeSideTerm(text)
  );
}

function isPhysicalEdgeSprayEvidence(text: string) {
  return (
    includesAnyDomainTerm(text, [
      "spray",
      "water spray",
      "물보라",
      "물살",
    ]) &&
    includesEdgeSideTerm(text)
  );
}

function isPhysicalRiderWeightEvidence(text: string) {
  return (
    includesAnyDomainTerm(text, [
      "weight over",
      "stacked over",
      "rider weight",
      "체중",
      "무게 중심",
      "질량",
    ]) &&
    includesEdgeSideTerm(text)
  );
}

function includesEdgeSideTerm(text: string) {
  return includesAnyDomainTerm(text, [
    "toe edge",
    "heel edge",
    "toeside edge",
    "heelside edge",
    "토 엣지",
    "힐 엣지",
    "토사이드 엣지",
    "힐사이드 엣지",
  ]);
}

function normalizeInversionObservedFacts(
  value: unknown,
): InversionObservedFactsPayload {
  const facts =
    value && typeof value === "object"
      ? (value as Partial<InversionObservedFactsPayload>)
      : {};
  const normalized = {
    bodyInverted: normalizeObservedBoolean(facts.bodyInverted),
    boardAboveHead: normalizeObservedBoolean(facts.boardAboveHead),
    rollAxisObserved: normalizeObservedBoolean(facts.rollAxisObserved),
    flipAxisObserved: normalizeObservedBoolean(facts.flipAxisObserved),
    inversionDuration: normalizeInversionDuration(facts.inversionDuration),
    inversionEvidenceCount: normalizeInversionEvidenceCount(
      facts.inversionEvidenceCount,
    ),
    antiInversionEvidence: normalizeStringArray(facts.antiInversionEvidence, []),
  };

  return {
    ...normalized,
    inversionEvidenceCount:
      normalized.inversionEvidenceCount ??
      [
        normalized.bodyInverted,
        normalized.boardAboveHead,
        normalized.rollAxisObserved,
        normalized.flipAxisObserved,
      ].filter((fact) => fact === true).length,
  };
}

function normalizeObservedBoolean(value: unknown): ObservedBooleanPayload {
  if (value === true || value === "true") {
    return true;
  }

  if (value === false || value === "false") {
    return false;
  }

  return "unknown";
}

function normalizeInversionDuration(
  value: unknown,
): InversionObservedFactsPayload["inversionDuration"] {
  const duration =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const seconds = Number(duration.seconds);

  return {
    seconds: Number.isFinite(seconds) ? seconds : null,
    confidence: asOpenAiConfidenceLevel(duration.confidence) ?? "low",
    evidence:
      typeof duration.evidence === "string"
        ? duration.evidence
        : "인버전 지속 시간 근거를 충분히 구조화하지 못했습니다.",
  };
}

function normalizeInversionEvidenceCount(value: unknown) {
  const count = Number(value);

  return Number.isFinite(count) && count >= 0 ? count : undefined;
}

function normalizeApproachFact(
  value: unknown,
  fallbackValue: string,
): ApproachFactPayload {
  if (!value || typeof value !== "object") {
    return {
      value: fallbackValue,
      confidence: "low",
      evidence: "영상 근거를 충분히 구조화하지 못했습니다.",
    };
  }

  const fact = value as Record<string, unknown>;

  return {
    value: typeof fact.value === "string" ? fact.value : fallbackValue,
    confidence: asOpenAiConfidenceLevel(fact.confidence) ?? "low",
    evidence:
      typeof fact.evidence === "string"
        ? fact.evidence
        : "영상 근거를 충분히 구조화하지 못했습니다.",
  };
}

function normalizeWakeCrossingPath(
  value: unknown,
): ApproachObservedFactsPayload["wakeCrossingPath"] {
  if (!value || typeof value !== "object") {
    return {
      startPosition: "unknown",
      takeoffPosition: "unknown",
      landingPosition: "unknown",
      direction: "unknown",
      confidence: "low",
      evidence: "웨이크 경로 근거를 충분히 구조화하지 못했습니다.",
    };
  }

  const path = value as Record<string, unknown>;

  return {
    startPosition:
      typeof path.startPosition === "string" ? path.startPosition : "unknown",
    takeoffPosition:
      typeof path.takeoffPosition === "string"
        ? path.takeoffPosition
        : "unknown",
    landingPosition:
      typeof path.landingPosition === "string"
        ? path.landingPosition
        : "unknown",
    direction: typeof path.direction === "string" ? path.direction : "unknown",
    confidence: asOpenAiConfidenceLevel(path.confidence) ?? "low",
    evidence:
      typeof path.evidence === "string"
        ? path.evidence
        : "웨이크 경로 근거를 충분히 구조화하지 못했습니다.",
  };
}

function deriveApproachDecision(
  facts: ApproachObservedFactsPayload,
  rawApproachType: ReturnType<typeof normalizeEvidenceFact>,
  temporalWindows: EvidenceTemporalWindowsPayload,
): ApproachDecision {
  const uncertainty: string[] = [];
  const reasoning: string[] = [];
  const rejectedAlternatives: ApproachDecision["rejectedAlternatives"] = [];
  const temporalWarnings = validateApproachTemporalFocus(
    facts,
    rawApproachType,
    temporalWindows,
  );
  const edgeText = approachFactText(facts.edgeDirectionEvidence);
  const rawText = approachFactText(rawApproachType);
  const edgeCandidate = approachValueFromText(edgeText);
  const rawCandidate = approachValueFromText(rawText);
  const derivedFrom: string[] = [];
  const supportingFacts = [
    ["stance", facts.stance] as const,
    ["leadFoot", facts.leadFoot] as const,
    ["boardDirection", facts.boardDirection] as const,
    ["wakeCrossingPath", facts.wakeCrossingPath] as const,
    ["handlePosition", facts.handlePosition] as const,
  ].filter(([, fact]) => isSpecificApproachFact(fact));
  const bodyOnly =
    supportingFacts.length === 0 &&
    !isSpecificApproachFact(facts.edgeDirectionEvidence) &&
    isSpecificApproachFact(facts.bodyOrientation);

  if (isSpecificApproachFact(facts.edgeDirectionEvidence)) {
    derivedFrom.push("edgeDirectionEvidence");
    reasoning.push(`edgeDirectionEvidence: ${facts.edgeDirectionEvidence.evidence}`);
  }

  for (const [field, fact] of supportingFacts) {
    derivedFrom.push(field);
    reasoning.push(`${field}: ${approachFactEvidence(fact)}`);
  }

  if (isSpecificApproachFact(facts.bodyOrientation)) {
    reasoning.push(
      `bodyOrientation은 보조 근거로만 사용됨: ${facts.bodyOrientation.evidence}`,
    );
  }

  if (bodyOnly) {
    uncertainty.push(
      "가슴/등 방향만 구조화되어 있어 접근 방향 판정 근거로 충분하지 않습니다.",
    );
  }

  if (!edgeCandidate && rawCandidate && rawApproachType.confidence === "high") {
    uncertainty.push(
      "raw approachType은 high였지만 관찰 사실의 edgeDirectionEvidence에서 같은 결론을 독립적으로 확인하지 못했습니다.",
    );
  }

  if (
    approachEvidenceOnlyRepeatsLabel(facts.edgeDirectionEvidence) ||
    approachEvidenceOnlyRepeatsLabel(rawApproachType)
  ) {
    uncertainty.push(
      "접근 근거가 힐사이드/토사이드 라벨을 반복하지만 스탠스, 리드풋, 경로, 핸들 등 시각 사실이 부족합니다.",
    );
  }

  if (supportingFacts.length < 2) {
    uncertainty.push(
      "stance/leadFoot/wake path/board direction/handle position 중 독립 근거가 2개 미만이라 high confidence를 허용하지 않습니다.",
    );
  }

  if (
    !isSpecificApproachFact(facts.stance) ||
    !isSpecificApproachFact(facts.leadFoot) ||
    !isSpecificApproachFact(facts.boardDirection) ||
    !isSpecificApproachFact(facts.edgeDirectionEvidence)
  ) {
    uncertainty.push(
      "stance, leadFoot, boardDirection, edgeDirectionEvidence 중 하나 이상이 부족해 접근 high confidence를 허용하지 않습니다.",
    );
  }

  uncertainty.push(...temporalWarnings);

  const value = edgeCandidate ?? "unknown";
  let confidence: ApproachDecision["confidence"] = "low";

  if (value !== "unknown") {
    confidence =
      facts.edgeDirectionEvidence.confidence === "high" &&
      supportingFacts.length >= 2 &&
      uncertainty.length === 0
        ? "high"
        : supportingFacts.length >= 1 && !bodyOnly
          ? "medium"
          : "low";
  }

  if (value === "unknown") {
    reasoning.push(
      "approachType은 raw label이 아니라 관찰 사실에서 파생해야 하므로, edgeDirectionEvidence가 부족한 경우 unknown으로 유지합니다.",
    );
  }

  for (const alternative of ["heelside", "toeside", "switch"] as const) {
    if (alternative !== value) {
      rejectedAlternatives.push({
        value: alternative,
        reason:
          value === "unknown"
            ? "독립적인 edgeDirectionEvidence와 경로 근거가 부족합니다."
            : `${value} 근거가 우선이며 ${alternative}를 지지하는 독립 근거가 부족합니다.`,
      });
    }
  }

  return {
    value,
    confidence,
    derivedFrom,
    reasoning:
      reasoning.length > 0
        ? reasoning
        : ["접근 방향을 파생할 충분한 관찰 사실이 없습니다."],
    rejectedAlternatives,
    uncertainty,
  };
}

function deriveApproachObservedFactsV2(
  facts: ApproachObservedFactsPayload,
  rawApproachType: ReturnType<typeof normalizeEvidenceFact>,
  edgeLoadObservedFacts: EdgeLoadObservedFactsPayload,
  edgeLoadValidation: EdgeLoadValidationResult,
): ApproachObservedFactsV2Payload {
  const edgeDirectionEvidence = {
    ...facts.edgeDirectionEvidence,
    loadedEdge: loadedEdgeFromText(approachFactText(facts.edgeDirectionEvidence)),
  };
  const wakePathSupport = inferApproachFromWakePathAndStance(facts);
  const signals = [
    createApproachSignal({
      field: "edgeDirectionEvidence",
      fact: facts.edgeDirectionEvidence,
      strength: approachEvidenceOnlyRepeatsLabel(facts.edgeDirectionEvidence)
        ? "weak"
        : "primary",
    }),
    createApproachSignal({
      field: "wakeCrossingPath",
      fact: facts.wakeCrossingPath,
      strength: "weak",
      supportOverride: wakePathSupport,
    }),
    createApproachSignal({
      field: "boardDirection",
      fact: facts.boardDirection,
      strength: "supporting",
    }),
    createApproachSignal({
      field: "stance",
      fact: facts.stance,
      strength: "weak",
    }),
    createApproachSignal({
      field: "leadFoot",
      fact: facts.leadFoot,
      strength: "weak",
    }),
    createApproachSignal({
      field: "handlePosition",
      fact: facts.handlePosition,
      strength: "weak",
    }),
    createApproachSignal({
      field: "bodyOrientation",
      fact: facts.bodyOrientation,
      strength: "weak",
    }),
    createApproachSignal({
      field: "rawApproachType",
      fact: rawApproachType,
      strength: approachEvidenceOnlyRepeatsLabel(rawApproachType)
        ? "weak"
        : "supporting",
    }),
  ];
  const conflictSummary = summarizeApproachSignalConflicts(signals);

  return {
    stance: facts.stance,
    leadFoot: facts.leadFoot,
    boardDirection: {
      ...facts.boardDirection,
      frameOfReference: inferDirectionFrame(facts.boardDirection.evidence),
      noseDirection: extractDirectionHint(facts.boardDirection.evidence, "nose"),
      travelDirection: extractDirectionHint(
        facts.boardDirection.evidence,
        "travel",
      ),
    },
    wakeCrossingPath: {
      ...facts.wakeCrossingPath,
      frameOfReference: inferDirectionFrame(
        approachFactEvidence(facts.wakeCrossingPath),
      ),
    },
    edgeDirectionEvidence,
    edgeLoadObservedFacts,
    edgeLoadValidation,
    handlePosition: facts.handlePosition,
    bodyOrientation: facts.bodyOrientation,
    signals,
    conflictSummary,
  };
}

function deriveApproachDecisionV2(
  facts: ApproachObservedFactsV2Payload,
): ApproachDecisionV2 {
  const scores = approachSignalScores(facts.signals);
  const directionalEntries = (["heelside", "toeside", "switch"] as const)
    .map((side) => ({ side, score: scores[side] }))
    .sort((left, right) => right.score - left.score);
  const top = directionalEntries[0];
  const runnerUp = directionalEntries[1];
  const primarySignals = facts.signals.filter(
    (signal) => signal.strength === "primary" && signal.supports !== "unknown",
  );
  const supportingSignals = facts.signals.filter(
    (signal) => signal.strength !== "primary" && signal.supports !== "unknown",
  );
  const uncertainty: string[] = [];
  const explicitEdgeSupport = explicitApproachEdgeSupport(
    facts.edgeDirectionEvidence,
  );
  const hasExplicitEdgeUseForTop =
    (top.side === "toeside" && explicitEdgeSupport === "toeside") ||
    (top.side === "heelside" && explicitEdgeSupport === "heelside");

  if (facts.conflictSummary.hasConflict) {
    uncertainty.push(facts.conflictSummary.reason);
  }

  if (top.score === 0) {
    uncertainty.push(
      "v2 directional signal이 부족해 Toeside/Heelside를 분리하지 못했습니다.",
    );
  }

  const hasPrimaryConflict =
    primarySignals.length > 0 &&
    supportingSignals.some((signal) => signal.supports !== primarySignals[0].supports);
  const isAmbiguous =
    top.score > 0 &&
    runnerUp.score > 0 &&
    (facts.conflictSummary.hasConflict ||
      runnerUp.score >= top.score ||
      hasPrimaryConflict);
  const value: ApproachDecisionV2["value"] =
    top.score === 0 ? "unknown" : isAmbiguous ? "ambiguous" : top.side;
  const confidence: ApproachDecisionV2["confidence"] =
    value === "unknown" || value === "ambiguous"
      ? "low"
      : top.score >= 5 &&
          runnerUp.score === 0 &&
          uncertainty.length === 0 &&
          hasExplicitEdgeUseForTop
        ? "high"
        : hasExplicitEdgeUseForTop
          ? "medium"
          : "low";

  if (value === "ambiguous") {
    uncertainty.push(
      "Toeside와 Heelside를 지지하는 관찰 근거가 동시에 존재해 확정하지 않습니다.",
    );
  }

  return {
    value,
    confidence,
    primaryEvidence: primarySignals.map(signalEvidenceSummary),
    supportingEvidence: supportingSignals.map(signalEvidenceSummary),
    conflictingEvidence: facts.conflictSummary.conflictFields.map((field) => {
      const signal = facts.signals.find((item) => item.field === field);

      return signal ? signalEvidenceSummary(signal) : field;
    }),
    rejectedAlternatives: (["heelside", "toeside", "switch"] as const)
      .filter((side) => side !== value)
      .map((side) => ({
        value: side,
        reason:
          value === "ambiguous"
            ? `${side}를 지지하거나 반박하는 근거가 충돌해 단정하지 않습니다.`
            : `${value} 점수=${top.score}, ${side} 점수=${scores[side]}입니다.`,
      })),
    uncertainty,
  };
}

function createApproachSignal({
  field,
  fact,
  strength,
  supportOverride,
}: {
  field: string;
  fact:
    | ApproachFactPayload
    | ApproachObservedFactsPayload["wakeCrossingPath"]
    | ReturnType<typeof normalizeEvidenceFact>;
  strength: ApproachEvidenceSignalV2["strength"];
  supportOverride?: ApproachEvidenceSignalV2["supports"];
}): ApproachEvidenceSignalV2 {
  const text = approachFactText(fact);
  const timestamps = extractEvidenceTimestamps(approachFactEvidence(fact));
  const inferred = approachValueFromText(text) ?? "unknown";
  const supports =
    fact.confidence === "low" || !isSpecificApproachFact(fact)
      ? "unknown"
      : supportOverride && supportOverride !== "unknown"
        ? supportOverride
        : inferred;

  return {
    field,
    supports,
    strength,
    confidence: fact.confidence,
    evidence: approachFactEvidence(fact),
    timestampSeconds: timestamps[0] ?? null,
  };
}

function summarizeApproachSignalConflicts(
  signals: ApproachEvidenceSignalV2[],
): ApproachObservedFactsV2Payload["conflictSummary"] {
  const directionalSignals = signals.filter(
    (signal) => signal.supports !== "unknown",
  );
  const toesideSignals = directionalSignals.filter(
    (signal) => signal.supports === "toeside",
  ).length;
  const heelsideSignals = directionalSignals.filter(
    (signal) => signal.supports === "heelside",
  ).length;
  const switchSignals = directionalSignals.filter(
    (signal) => signal.supports === "switch",
  ).length;
  const supportedSides = [toesideSignals, heelsideSignals, switchSignals].filter(
    (count) => count > 0,
  ).length;
  const hasConflict = supportedSides > 1;

  return {
    hasConflict,
    toesideSignals,
    heelsideSignals,
    switchSignals,
    conflictFields: hasConflict
      ? directionalSignals.map((signal) => signal.field)
      : [],
    reason: hasConflict
      ? `v2 signals conflict: toeside=${toesideSignals}, heelside=${heelsideSignals}, switch=${switchSignals}.`
      : "v2 signals do not contain cross-side conflict.",
  };
}

function approachSignalScores(signals: ApproachEvidenceSignalV2[]) {
  const scores = {
    heelside: 0,
    toeside: 0,
    switch: 0,
  };

  for (const signal of signals) {
    if (signal.supports === "unknown") {
      continue;
    }

    scores[signal.supports] += approachSignalWeight(signal);
  }

  return scores;
}

function approachSignalWeight(signal: ApproachEvidenceSignalV2) {
  const strengthWeight = {
    primary: 3,
    supporting: 2,
    weak: 1,
  }[signal.strength];
  const confidenceWeight = {
    high: 1,
    medium: 0.75,
    low: 0.25,
  }[signal.confidence];

  return strengthWeight * confidenceWeight;
}

function signalEvidenceSummary(signal: ApproachEvidenceSignalV2) {
  return `${signal.field} supports ${signal.supports}: ${signal.evidence}`;
}

function inferApproachFromWakePathAndStance(
  facts: ApproachObservedFactsPayload,
): ApproachEvidenceSignalV2["supports"] {
  const stance = riderStanceFromFacts(facts);
  const crossing = wakeCrossingDirectionFromFacts(facts.wakeCrossingPath);

  if (stance === "unknown" || crossing.direction === "unknown") {
    return "unknown";
  }

  if (crossing.frame === "camera") {
    return stance === "regular"
      ? crossing.direction === "left_to_right"
        ? "toeside"
        : "heelside"
      : crossing.direction === "left_to_right"
        ? "heelside"
        : "toeside";
  }

  if (crossing.frame === "boat") {
    return stance === "regular"
      ? crossing.direction === "left_to_right"
        ? "heelside"
        : "toeside"
      : crossing.direction === "left_to_right"
        ? "toeside"
        : "heelside";
  }

  return "unknown";
}

function riderStanceFromFacts(facts: ApproachObservedFactsPayload) {
  const stanceText = normalizeDomainText(
    `${facts.stance.value} ${facts.stance.evidence}`,
  );
  const leadFootText = normalizeDomainText(
    `${facts.leadFoot.value} ${facts.leadFoot.evidence}`,
  );

  if (
    includesAnyDomainTerm(stanceText, ["regular", "레귤러"]) ||
    includesAnyDomainTerm(leadFootText, ["left", "왼발", "왼쪽 발"])
  ) {
    return "regular" as const;
  }

  if (
    includesAnyDomainTerm(stanceText, ["goofy", "구피"]) ||
    includesAnyDomainTerm(leadFootText, ["right", "오른발", "오른쪽 발"])
  ) {
    return "goofy" as const;
  }

  return "unknown" as const;
}

function wakeCrossingDirectionFromFacts(
  path: ApproachObservedFactsPayload["wakeCrossingPath"],
) {
  const text = normalizeDomainText(
    `${path.startPosition} ${path.takeoffPosition} ${path.landingPosition} ${path.direction} ${path.evidence}`,
  );
  const frame = inferDirectionFrame(text);
  const startsLeft = includesAnyDomainTerm(text, [
    "startposition left",
    "start left",
    "stage left",
    "left to right",
    "left outside",
    "왼쪽에서",
    "왼쪽 바깥",
    "보트 진행 방향 왼쪽",
  ]);
  const startsRight = includesAnyDomainTerm(text, [
    "startposition right",
    "start right",
    "stage right",
    "right to left",
    "right outside",
    "우측에서",
    "오른쪽에서",
    "오른쪽 바깥",
    "보트 진행 방향 오른쪽",
  ]);
  const landsLeft = includesAnyDomainTerm(text, [
    "landingposition left",
    "landing left",
    "stage left",
    "right to left",
    "좌측에 착지",
    "왼쪽에 착지",
    "웨이크 안쪽 (보트 진행 방향 왼쪽)",
  ]);
  const landsRight = includesAnyDomainTerm(text, [
    "landingposition right",
    "landing right",
    "stage right",
    "left to right",
    "우측에 착지",
    "오른쪽에 착지",
    "웨이크 안쪽 (보트 진행 방향 오른쪽)",
  ]);

  if ((startsLeft && landsRight) || includesAnyDomainTerm(text, ["left to right"])) {
    return {
      direction: "left_to_right" as const,
      frame,
    };
  }

  if ((startsRight && landsLeft) || includesAnyDomainTerm(text, ["right to left"])) {
    return {
      direction: "right_to_left" as const,
      frame,
    };
  }

  return {
    direction: "unknown" as const,
    frame,
  };
}

function loadedEdgeFromText(text: string): "toe_edge" | "heel_edge" | "unknown" {
  const approach = explicitApproachEdgeSupport({
    value: "",
    confidence: "high",
    evidence: text,
  });

  if (approach === "toeside") {
    return "toe_edge";
  }

  if (approach === "heelside") {
    return "heel_edge";
  }

  return "unknown";
}

function explicitApproachEdgeSupport(
  fact: ApproachFactPayload,
):
  | Extract<ApproachEvidenceSignalV2["supports"], "toeside" | "heelside">
  | "unknown" {
  const text = normalizeDomainText(`${fact.value} ${fact.evidence}`);

  if (
    includesAnyDomainTerm(text, [
      "toe edge",
      "toe-edge",
      "toeside edge",
      "toe side edge",
      "토 엣지",
      "토엣지",
      "토사이드 엣지",
      "발가락 쪽 엣지",
      "발가락 엣지",
    ])
  ) {
    return "toeside";
  }

  if (
    includesAnyDomainTerm(text, [
      "heel edge",
      "heel-edge",
      "heelside edge",
      "heel side edge",
      "힐 엣지",
      "힐엣지",
      "힐사이드 엣지",
      "뒤꿈치 쪽 엣지",
      "뒤꿈치 엣지",
    ])
  ) {
    return "heelside";
  }

  return "unknown";
}

function inferDirectionFrame(evidence: string): DirectionFrame {
  const text = normalizeDomainText(evidence);

  if (
    includesAnyDomainTerm(text, [
      "stage left",
      "stage right",
      "camera",
      "screen",
      "화면",
    ])
  ) {
    return "camera";
  }

  if (
    includesAnyDomainTerm(text, [
      "boat",
      "boat's",
      "boat direction",
      "boat frame",
      "toward the boat",
      "away from the boat",
      "보트",
      "보트 진행 방향",
    ])
  ) {
    return "boat";
  }

  if (includesAnyDomainTerm(text, ["rider", "toe edge", "heel edge", "라이더"])) {
    return "rider";
  }

  return "unknown";
}

function extractDirectionHint(evidence: string, kind: "nose" | "travel") {
  const text = normalizeDomainText(evidence);
  const terms =
    kind === "nose"
      ? ["nose", "노즈", "board tip", "보드 앞"]
      : ["travel", "direction of travel", "이동", "진행"];

  return includesAnyDomainTerm(text, terms) ? evidence : undefined;
}

function approachFactFromDecision(
  decision: ApproachDecision,
  rawApproachType: ReturnType<typeof normalizeEvidenceFact>,
) {
  const labelMap: Record<ApproachDecision["value"], string> = {
    heelside: "힐사이드",
    toeside: "토사이드",
    switch: "스위치",
    unknown: "확인 필요",
  };
  const rawLabel =
    rawApproachType.value !== "확인 필요"
      ? ` Raw Gemini approachType: ${rawApproachType.value} (${rawApproachType.confidence}).`
      : "";

  return {
    value: labelMap[decision.value],
    confidence: decision.confidence,
    evidence: `${decision.reasoning.join(" ")}${rawLabel}`.trim(),
  };
}

function approachFactText(
  fact:
    | ApproachFactPayload
    | ApproachObservedFactsPayload["wakeCrossingPath"]
    | ReturnType<typeof normalizeEvidenceFact>,
) {
  if ("value" in fact) {
    return normalizeDomainText(`${fact.value} ${fact.evidence}`);
  }

  return normalizeDomainText(
    `${fact.startPosition} ${fact.takeoffPosition} ${fact.landingPosition} ${fact.direction} ${fact.evidence}`,
  );
}

function approachFactEvidence(
  fact: ApproachFactPayload | ApproachObservedFactsPayload["wakeCrossingPath"],
) {
  if ("value" in fact) {
    return fact.evidence;
  }

  return `${fact.startPosition} -> ${fact.takeoffPosition} -> ${fact.landingPosition}; ${fact.evidence}`;
}

function approachValueFromText(
  text: string,
): ApproachDecision["value"] | null {
  if (
    includesAnyDomainTerm(text, [
      "switch",
      "스위치",
      "opposite stance",
      "반대 스탠스",
    ])
  ) {
    return "switch";
  }

  if (
    includesAnyDomainTerm(text, [
      "toeside",
      "toe side",
      "toe edge",
      "토사이드",
      "토 엣지",
      "앞꿈치",
      "발가락",
    ])
  ) {
    return "toeside";
  }

  if (
    includesAnyDomainTerm(text, [
      "heelside",
      "heel side",
      "heel edge",
      "힐사이드",
      "힐 엣지",
      "뒤꿈치",
      "힐엣지",
    ])
  ) {
    return "heelside";
  }

  return null;
}

function isSpecificApproachFact(
  fact: ApproachFactPayload | ApproachObservedFactsPayload["wakeCrossingPath"],
) {
  const text = approachFactText(fact);
  const confidence = fact.confidence;

  if (confidence === "low") {
    return false;
  }

  if (
    includesAnyDomainTerm(text, [
      "unknown",
      "unclear",
      "확인 필요",
      "불명확",
      "보이지 않",
      "식별 불가",
    ])
  ) {
    return false;
  }

  return text.length > 12;
}

function approachEvidenceOnlyRepeatsLabel(
  fact: ApproachFactPayload | ReturnType<typeof normalizeEvidenceFact>,
) {
  const evidenceText = normalizeDomainText(fact.evidence);
  const valueText = normalizeDomainText(fact.value);
  const containsApproachLabel =
    approachValueFromText(`${valueText} ${evidenceText}`) !== null;
  const containsVisualFact = includesAnyDomainTerm(evidenceText, [
    "stance",
    "스탠스",
    "lead foot",
    "리드풋",
    "앞발",
    "board direction",
    "보드 방향",
    "wake crossing",
    "웨이크 경로",
    "start",
    "takeoff",
    "landing",
    "시작",
    "이륙",
    "착지",
    "handle",
    "핸들",
  ]);

  return containsApproachLabel && !containsVisualFact;
}

function validateApproachTemporalFocus(
  facts: ApproachObservedFactsPayload,
  rawApproachType: ReturnType<typeof normalizeEvidenceFact>,
  temporalWindows: EvidenceTemporalWindowsPayload,
) {
  const warnings: string[] = [];
  const finalWindow = temporalWindows.finalApproachWindow;
  const keyEvidence = [
    facts.stance.evidence,
    facts.leadFoot.evidence,
    facts.boardDirection.evidence,
    approachFactEvidence(facts.wakeCrossingPath),
    facts.edgeDirectionEvidence.evidence,
    facts.handlePosition.evidence,
    rawApproachType.evidence,
  ];
  const timestampedEvidence = keyEvidence.filter((text) =>
    hasTimestampReference(text),
  );
  const insideCount = timestampedEvidence.filter((text) =>
    isEvidenceInsideFinalApproachWindow(text, finalWindow),
  ).length;
  const outsideCount = timestampedEvidence.length - insideCount;

  if (temporalWindows.takeoffTimestamp.timestampSeconds === null) {
    warnings.push(
      "takeoffTimestamp가 없어 final approach window 기준 접근 high confidence를 허용하지 않습니다.",
    );
  }

  if (
    finalWindow.confidence === "low" ||
    temporalWindows.approachWindowConfidence === "low"
  ) {
    warnings.push(
      "finalApproachWindow confidence가 낮아 접근 high confidence를 허용하지 않습니다.",
    );
  }

  if (!hasTimestampReference(facts.edgeDirectionEvidence.evidence)) {
    warnings.push(
      "edgeDirectionEvidence가 finalApproachWindow timestamp를 명시하지 않습니다.",
    );
  } else if (
    !isEvidenceInsideFinalApproachWindow(
      facts.edgeDirectionEvidence.evidence,
      finalWindow,
    )
  ) {
    warnings.push(
      "edgeDirectionEvidence timestamp가 finalApproachWindow 밖에 있어 접근 high confidence를 허용하지 않습니다.",
    );
  }

  const wakeCrossingEvidence = approachFactEvidence(facts.wakeCrossingPath);

  if (!hasTimestampReference(wakeCrossingEvidence)) {
    warnings.push(
      "wakeCrossingPath가 finalApproachWindow timestamp를 명시하지 않습니다.",
    );
  } else if (
    !isEvidenceInsideFinalApproachWindow(wakeCrossingEvidence, finalWindow)
  ) {
    warnings.push(
      "wakeCrossingPath timestamp가 finalApproachWindow 밖에 있어 접근 high confidence를 허용하지 않습니다.",
    );
  }

  if (timestampedEvidence.length > 0 && outsideCount >= insideCount) {
    warnings.push(
      "접근 근거 timestamp가 finalApproachWindow보다 외부 setup/slalom 구간에 더 많이 의존합니다.",
    );
  }

  return warnings;
}

function isEvidenceInsideFinalApproachWindow(
  evidence: string,
  finalApproachWindow: FinalApproachWindowPayload,
) {
  const timestamps = extractEvidenceTimestamps(evidence);

  if (timestamps.length === 0) {
    return false;
  }

  return timestamps.some(
    (timestamp) =>
      timestamp >= finalApproachWindow.startSeconds - 0.25 &&
      timestamp <= finalApproachWindow.endSeconds + 0.25,
  );
}

function hasTimestampReference(evidence: string) {
  return extractEvidenceTimestamps(evidence).length > 0;
}

function extractEvidenceTimestamps(evidence: string) {
  const timestamps: number[] = [];
  const mmSsPattern = /(\d{1,2}):(\d{2})(?:\.(\d+))?/g;
  const secondPattern = /(?:^|[^\d])(\d+(?:\.\d+)?)\s*(?:초|s|sec|second|seconds)\b/gi;
  let match: RegExpExecArray | null;

  while ((match = mmSsPattern.exec(evidence)) !== null) {
    const minutes = Number(match[1]);
    const seconds = Number(match[2]);
    const fraction = match[3] ? Number(`0.${match[3]}`) : 0;

    if (Number.isFinite(minutes) && Number.isFinite(seconds)) {
      timestamps.push(minutes * 60 + seconds + fraction);
    }
  }

  while ((match = secondPattern.exec(evidence)) !== null) {
    const seconds = Number(match[1]);

    if (Number.isFinite(seconds)) {
      timestamps.push(seconds);
    }
  }

  return timestamps;
}

function applyWakeboardTaxonomyGates(
  evidence: NormalizedGeminiEvidence,
): TaxonomyGatedEvidence {
  const taxonomy = validateWakeboardTaxonomy(evidence);

  if (taxonomy.gateFailures.length === 0) {
    return {
      ...evidence,
      rawFamilyCandidate: taxonomy.familyGate.rawFamily,
      safeFamilyCandidate: taxonomy.familyGate.safeFamily,
      taxonomyWarnings: taxonomy.warnings,
      gateFailures: taxonomy.gateFailures,
    };
  }

  const safeFamilyFact = familyFactForTaxonomy(taxonomy, evidence);
  const safePrimaryCandidate = trickCandidateForTaxonomy(taxonomy, evidence);
  const safeRotationType = rotationFactForTaxonomy(taxonomy, evidence);
  const taxonomyWarningText = taxonomy.warnings.join(" ");

  return {
    ...evidence,
    rawFamilyCandidate: taxonomy.familyGate.rawFamily,
    safeFamilyCandidate: taxonomy.familyGate.safeFamily,
    taxonomyWarnings: taxonomy.warnings,
    gateFailures: taxonomy.gateFailures,
    consistencyStatus: "inconsistent",
    consistencyWarnings: [
      ...evidence.consistencyWarnings,
      ...taxonomy.warnings,
    ],
    primaryCandidate: safePrimaryCandidate,
    family: safeFamilyFact,
    rotationType: safeRotationType,
    confidence: "low",
    evidence: `${evidence.evidence} ${taxonomyWarningText}`.trim(),
    uncertainty: {
      level: "high",
      reasons: [
        ...evidence.uncertainty.reasons,
        ...taxonomy.gateFailures,
      ],
    },
  };
}

function validateWakeboardTaxonomy(
  evidence: NormalizedGeminiEvidence,
): TaxonomyValidationResult {
  const primaryText = normalizeDomainText(evidence.primaryCandidate.name);
  const familyText = normalizeDomainText(evidence.family.value);
  const rotationText = normalizeDomainText(evidence.rotationType.value);
  const approachText = normalizeDomainText(evidence.approachType.value);
  const allEvidenceText = evidenceSearchText(evidence);
  const rawFamily = inferRawTrickFamily({
    primaryText,
    familyText,
    rotationText,
    allEvidenceText,
  });
  const isBackRollCandidate = includesAnyDomainTerm(
    `${primaryText} ${rotationText}`,
    ["back roll", "backroll", "백롤"],
  );
  const isTantrumCandidate = includesAnyDomainTerm(
    `${primaryText} ${rotationText}`,
    ["tantrum", "탠트럼"],
  );
  const isInvertSpecificCandidate =
    rawFamily === "invert" || isBackRollCandidate || isTantrumCandidate;
  const isBasicAirPlausible = hasBasicAirEvidence(
    `${primaryText} ${familyText} ${rotationText} ${allEvidenceText}`,
  );
  const inversionGate = inversionGateEvidence(evidence.inversionObservedFacts);
  const visibleInversion =
    inversionGate.boardAboveHead || inversionGate.bodyInverted;
  const visibleRollAxis = inversionGate.rollAxisObserved;
  const invertFamilyAllowed = inversionGate.invertFamilyAllowed;
  const visibleRotationInitiation =
    hasVisibleRotationInitiationEvidence(allEvidenceText);
  const heelsideSetup = hasHeelsideSetupEvidence(approachText, allEvidenceText);
  const toesideApproach = includesAnyDomainTerm(
    `${approachText} ${allEvidenceText}`,
    ["toeside", "toe side", "토사이드"],
  );
  const warnings: string[] = [];
  const gateFailures: string[] = [];

  if (rawFamily === "invert") {
    if (!invertFamilyAllowed) {
      gateFailures.push(
        "InversionObservedFacts v1 blocks Invert Family: boardAboveHead, bodyInverted, and rollAxisObserved are not true",
      );
      warnings.push(
        "InversionObservedFacts v1에서 boardAboveHead/bodyInverted/rollAxisObserved가 확인되지 않아 Invert family를 차단합니다.",
      );
    }
  }

  if (rawFamily === "invert" && evidence.family.confidence === "high") {
    if (!visibleRotationInitiation) {
      gateFailures.push("Invert high requires rotation-initiation evidence");
      warnings.push("인버트 high에 필요한 회전 시작 근거가 부족합니다.");
    }
  }

  if (isBackRollCandidate && evidence.primaryCandidate.confidence === "high") {
    if (!heelsideSetup) {
      gateFailures.push("Back Roll requires heelside setup evidence");
      warnings.push("Back Roll high에 필요한 힐사이드 setup 근거가 부족합니다.");
    }

    if (!visibleRollAxis) {
      gateFailures.push("Back Roll requires visible roll-axis evidence");
      warnings.push("Back Roll high에 필요한 roll-axis 근거가 부족합니다.");
    }

    if (!visibleInversion) {
      gateFailures.push("Back Roll requires visible inversion evidence");
      warnings.push("Back Roll high에 필요한 인버트 근거가 부족합니다.");
    }

    if (!visibleRotationInitiation) {
      gateFailures.push("Back Roll requires rotation-initiation evidence");
      warnings.push("Back Roll high에 필요한 회전 시작 근거가 부족합니다.");
    }
  }

  if (isTantrumCandidate && evidence.primaryCandidate.confidence === "high") {
    if (toesideApproach) {
      gateFailures.push("Tantrum cannot be high confidence from toeside approach");
      warnings.push("토사이드 접근에서는 Tantrum high를 허용하지 않습니다.");
    }

    if (!visibleInversion) {
      gateFailures.push("Tantrum requires visible inversion evidence");
      warnings.push("Tantrum high에 필요한 인버트 근거가 부족합니다.");
    }

    if (!heelsideSetup) {
      gateFailures.push("Tantrum requires heelside setup evidence");
      warnings.push("Tantrum high에 필요한 힐사이드 setup 근거가 부족합니다.");
    }

    if (!visibleRotationInitiation) {
      gateFailures.push("Tantrum requires rotation-initiation evidence");
      warnings.push("Tantrum high에 필요한 회전 시작 근거가 부족합니다.");
    }
  }

  if (
    isInvertSpecificCandidate &&
    isBasicAirPlausible &&
    !invertFamilyAllowed
  ) {
    gateFailures.push("Basic Air is plausible and invert evidence is missing");
    warnings.push("Basic Air / Straight Air 가능성이 있어 인버트 계열 high를 낮춥니다.");
  }

  const safeFamily: TrickFamily =
    gateFailures.length === 0
      ? rawFamily
      : isBasicAirPlausible || !invertFamilyAllowed
        ? "basic_air"
        : "unknown";
  const rawPrimaryConfidence = taxonomyConfidence(
    evidence.primaryCandidate.confidence,
  );
  const rawFamilyConfidence = taxonomyConfidence(evidence.family.confidence);
  const safeConfidence: "high" | "medium" | "low" =
    gateFailures.length === 0
      ? rawPrimaryConfidence
      : "low";

  return {
    familyGate: {
      rawFamily,
      safeFamily,
      confidence:
        gateFailures.length === 0
          ? rawFamilyConfidence
          : "low" as const,
      entryGateSatisfied: gateFailures.length === 0,
      entryGateEvidence: taxonomyEntryEvidence({
        visibleInversion,
        visibleRollAxis,
        visibleRotationInitiation,
        heelsideSetup,
        toesideApproach,
        isBasicAirPlausible,
      }),
      missingGateEvidence: gateFailures,
    },
    specificCandidate: {
      rawName: evidence.primaryCandidate.name,
      safeName:
        gateFailures.length === 0
          ? evidence.primaryCandidate.name
          : safeFamily === "basic_air"
            ? "Basic Air / Straight Air"
            : "확인 필요",
      rawConfidence: rawPrimaryConfidence,
      safeConfidence,
      requiredFamily: isInvertSpecificCandidate ? "invert" : rawFamily,
    },
    warnings,
    gateFailures,
  };
}

function familyFactForTaxonomy(
  taxonomy: TaxonomyValidationResult,
  evidence: NormalizedGeminiEvidence,
) {
  if (taxonomy.gateFailures.length === 0) {
    return evidence.family;
  }

  return {
    value:
      taxonomy.familyGate.safeFamily === "basic_air"
        ? "Basic Air / Straight Air"
        : "확인 필요",
    confidence: "low" as const,
    evidence:
      taxonomy.familyGate.safeFamily === "basic_air"
        ? "인버트 family gate를 통과하지 못해 기본 점프 계열로 낮춰 표시합니다."
        : "트릭 family gate를 통과하지 못해 확인 필요로 낮춰 표시합니다.",
  };
}

function trickCandidateForTaxonomy(
  taxonomy: TaxonomyValidationResult,
  evidence: NormalizedGeminiEvidence,
) {
  if (taxonomy.gateFailures.length === 0) {
    return evidence.primaryCandidate;
  }

  return {
    name: taxonomy.specificCandidate.safeName,
    confidence: taxonomy.specificCandidate.safeConfidence,
    evidence: `${evidence.primaryCandidate.evidence} Taxonomy gate: ${taxonomy.gateFailures.join("; ")}`,
  };
}

function rotationFactForTaxonomy(
  taxonomy: TaxonomyValidationResult,
  evidence: NormalizedGeminiEvidence,
) {
  if (taxonomy.gateFailures.length === 0) {
    return evidence.rotationType;
  }

  return {
    value:
      taxonomy.familyGate.safeFamily === "basic_air"
        ? "No roll axis / 확인 필요"
        : "확인 필요",
    confidence: "low" as const,
    evidence: "family gate 실패로 회전 유형을 high confidence로 유지하지 않습니다.",
  };
}

function applyGeminiEvidenceConsistency(
  evidence: TaxonomyGatedEvidence,
) {
  const warnings: string[] = [];
  const primaryName = evidence.primaryCandidate.name;
  const primaryText = normalizeDomainText(primaryName);
  const approachText = normalizeDomainText(evidence.approachType.value);
  const rotationText = normalizeDomainText(evidence.rotationType.value);
  const familyText = normalizeDomainText(evidence.family.value);
  const allEvidenceText = evidenceSearchText(evidence);
  const inversionGate = inversionGateEvidence(evidence.inversionObservedFacts);
  const isHeelsideApproach = includesAnyDomainTerm(approachText, [
    "heelside",
    "heel side",
    "힐사이드",
    "hs",
  ]);
  const isToesideMentioned = includesAnyDomainTerm(
    `${approachText} ${allEvidenceText}`,
    ["toeside", "toe side", "토사이드", "ts"],
  );
  const isBasicJumpPlausible = includesAnyDomainTerm(
    `${primaryText} ${familyText} ${rotationText} ${allEvidenceText}`,
    [
      "basic jump",
      "straight air",
      "베이직 점프",
      "기본 점프",
      "스트레이트 에어",
      "no invert",
      "no roll axis",
      "백롤 mechanics 없음",
      "백롤 메커닉 없음",
    ],
  );
  const isBackRollCandidate =
    includesAnyDomainTerm(primaryText, ["back roll", "backroll", "백롤"]) ||
    includesAnyDomainTerm(rotationText, ["back roll", "backroll", "백롤"]);
  const isFrontRollCandidate =
    includesAnyDomainTerm(primaryText, ["front roll", "frontroll", "프론트롤"]) ||
    includesAnyDomainTerm(rotationText, ["front roll", "frontroll", "프론트롤"]);
  const isInvertFamily =
    includesAnyDomainTerm(familyText, ["invert", "인버트"]) ||
    includesAnyDomainTerm(primaryText, ["roll", "롤"]) ||
    includesAnyDomainTerm(rotationText, ["roll", "롤"]);
  const isPrimaryHigh = evidence.primaryCandidate.confidence === "high";
  const isApproachHigh = evidence.approachType.confidence === "high";
  const isRotationHigh = evidence.rotationType.confidence === "high";
  const isFamilyHigh = evidence.family.confidence === "high";
  const hasHeelsideSetupEvidence =
    isHeelsideApproach &&
    includesAnyDomainTerm(allEvidenceText, ["heelside", "heel side", "힐사이드"]) &&
    includesAnyDomainTerm(allEvidenceText, ["edge", "엣지", "load", "로드"]);
  const hasRollAxisEvidence = inversionGate.rollAxisObserved;
  const hasExplicitInvertEvidence =
    inversionGate.boardAboveHead || inversionGate.bodyInverted;
  const hasRotationInitiationEvidence = includesAnyDomainTerm(allEvidenceText, [
    "rotation initiation",
    "회전 시작",
    "initiation",
    "어깨",
    "골반",
    "shoulder",
    "hip",
  ]);
  const approachEvidenceText = normalizeDomainText(evidence.approachType.evidence);
  const rotationEvidenceText = normalizeDomainText(evidence.rotationType.evidence);
  const hasSeparateApproachAndRotationEvidence =
    approachEvidenceText.length > 0 &&
    rotationEvidenceText.length > 0 &&
    approachEvidenceText !== rotationEvidenceText;

  let consistencyStatus: EvidenceConsistencyStatus = "valid";

  if (isHeelsideApproach && isFrontRollCandidate) {
    consistencyStatus = "inconsistent";
    warnings.push(
      "힐사이드 접근과 프론트 롤 추정이 함께 나와 내부 일관성이 낮습니다.",
    );
  }

  if (isBackRollCandidate && (isPrimaryHigh || isRotationHigh)) {
    if (!hasExplicitInvertEvidence) {
      consistencyStatus = "inconsistent";
      warnings.push("백롤 high 추정에 필요한 명시적 인버트 근거가 부족합니다.");
    }

    if (!hasRollAxisEvidence) {
      consistencyStatus = "inconsistent";
      warnings.push("백롤 high 추정에 필요한 roll-axis 근거가 부족합니다.");
    }

    if (!hasHeelsideSetupEvidence) {
      consistencyStatus = "inconsistent";
      warnings.push("백롤 high 추정에 필요한 독립적인 힐사이드 setup 근거가 부족합니다.");
    }

    if (!hasRotationInitiationEvidence) {
      consistencyStatus = "inconsistent";
      warnings.push("백롤 high 추정에 필요한 회전 시작 근거가 부족합니다.");
    }

    if (isBasicJumpPlausible) {
      consistencyStatus = "inconsistent";
      warnings.push("기본 점프/스트레이트 에어 가능성이 있어 백롤 high 추정을 낮춰야 합니다.");
    }
  }

  if (isInvertFamily && isFamilyHigh && !inversionGate.invertFamilyAllowed) {
    consistencyStatus = "inconsistent";
    warnings.push(
      "Invert family high에 필요한 boardAboveHead/bodyInverted/rollAxisObserved 근거가 부족합니다.",
    );
  }

  if (isHeelsideApproach && isApproachHigh && isToesideMentioned) {
    consistencyStatus = "inconsistent";
    warnings.push("토사이드 가능성이 함께 나타나 힐사이드 high 추정을 낮춰야 합니다.");
  }

  if (
    isApproachHigh &&
    isRotationHigh &&
    !hasSeparateApproachAndRotationEvidence
  ) {
    consistencyStatus = "inconsistent";
    warnings.push("접근 방식과 회전 유형 high 추정이 독립 근거에 의존하지 않습니다.");
  }

  if (
    consistencyStatus === "valid" &&
    (
    evidence.primaryCandidate.confidence === "low" ||
    evidence.approachType.confidence === "low" ||
    evidence.rotationType.confidence === "low"
    )
  ) {
    consistencyStatus = "needs_review";
    warnings.push("핵심 동작 필드의 확신도가 낮아 사용자 확인이 필요합니다.");
  }

  if (consistencyStatus === "valid") {
    return evidence;
  }

  const safeCandidateName =
    consistencyStatus === "inconsistent" && isInvertFamily
      ? "unknown invert"
      : evidence.primaryCandidate.name;

  return {
    ...evidence,
    consistencyStatus,
    consistencyWarnings: warnings,
    confidence: "low" as const,
    primaryCandidate: {
      ...evidence.primaryCandidate,
      name: safeCandidateName,
      confidence: "low" as const,
      evidence:
        safeCandidateName === evidence.primaryCandidate.name
          ? `${evidence.primaryCandidate.evidence} 내부 일관성 검토가 필요합니다.`
          : `${evidence.primaryCandidate.evidence} 원 모델 추정은 "${primaryName}"였지만, 접근/회전 정보가 모순되어 "${safeCandidateName}"로 낮춰 표시합니다.`,
    },
    uncertainty: {
      level: "high" as const,
      reasons: [...evidence.uncertainty.reasons, ...warnings],
    },
  };
}

function inferRawTrickFamily({
  primaryText,
  familyText,
  rotationText,
  allEvidenceText,
}: {
  primaryText: string;
  familyText: string;
  rotationText: string;
  allEvidenceText: string;
}): TrickFamily {
  const combined = `${primaryText} ${familyText} ${rotationText} ${allEvidenceText}`;

  if (hasBasicAirEvidence(combined)) {
    return "basic_air";
  }

  if (
    includesAnyDomainTerm(combined, ["raley", "랠리", "레일리"])
  ) {
    return "raley";
  }

  if (
    includesAnyDomainTerm(combined, ["invert", "인버트", "tantrum", "탠트럼"]) ||
    includesAnyDomainTerm(combined, ["back roll", "backroll", "백롤"]) ||
    includesAnyDomainTerm(combined, ["front roll", "frontroll", "프론트롤"])
  ) {
    return "invert";
  }

  if (includesAnyDomainTerm(combined, ["spin", "스핀", "180", "360"])) {
    return "spin";
  }

  if (includesAnyDomainTerm(combined, ["grab", "그랩"])) {
    return "grab";
  }

  if (
    includesAnyDomainTerm(combined, ["surface", "butter", "press", "서피스"])
  ) {
    return "surface_trick";
  }

  return "unknown";
}

function evidenceSearchText(evidence: NormalizedGeminiEvidence) {
  const inversionFacts = evidence.inversionObservedFacts;
  const popFacts = evidence.popObservedFacts;
  const rotationFacts = evidence.rotationObservedFacts;

  return normalizeDomainText(
    [
      evidence.primaryCandidate.name,
      evidence.primaryCandidate.evidence,
      evidence.family.value,
      evidence.family.evidence,
      evidence.approachType.value,
      evidence.approachType.evidence,
      evidence.rotationType.value,
      evidence.rotationType.evidence,
      popFacts
        ? [
            `popType ${popFacts.popType ?? "unknown"}`,
            `timing ${popFacts.timing ?? "unknown"}`,
            `intensity ${popFacts.intensity ?? "unknown"}`,
            `popConfidence ${popFacts.confidence}`,
            popFacts.evidenceText ?? "",
            ...popFacts.antiEvidence,
          ].join(" ")
        : "",
      rotationFacts
        ? [
            `rotationAxis ${rotationFacts.rotationAxis ?? "unknown"}`,
            `rotationDirection ${rotationFacts.rotationDirection ?? "unknown"}`,
            `inversionDetected ${rotationFacts.inversionDetected}`,
            `spinDegrees ${rotationFacts.spinDegrees ?? "unknown"}`,
            `handlePassObserved ${rotationFacts.handlePassObserved}`,
            `rotationConfidence ${rotationFacts.confidence}`,
            rotationFacts.evidenceText ?? "",
            ...rotationFacts.antiEvidence,
          ].join(" ")
        : "",
      inversionFacts
        ? [
            `bodyInverted ${inversionFacts.bodyInverted}`,
            `boardAboveHead ${inversionFacts.boardAboveHead}`,
            `rollAxisObserved ${inversionFacts.rollAxisObserved}`,
            `flipAxisObserved ${inversionFacts.flipAxisObserved}`,
            `inversionDuration ${inversionFacts.inversionDuration.seconds ?? "unknown"} ${inversionFacts.inversionDuration.evidence}`,
            `inversionEvidenceCount ${inversionFacts.inversionEvidenceCount}`,
            ...inversionFacts.antiInversionEvidence,
          ].join(" ")
        : "",
      evidence.evidence,
      ...evidence.evidenceWindows.map(
        (window) => `${window.label} ${window.evidence}`,
      ),
      ...evidence.observations.map(
        (observation) => `${observation.label} ${observation.detail}`,
      ),
      ...evidence.uncertainty.reasons,
    ].join(" "),
  );
}

function hasBasicAirEvidence(value: string) {
  const text = normalizeDomainText(value);

  return (
    includesAnyDomainTerm(text, [
      "basic air",
      "basic jump",
      "straight air",
      "wake jump",
      "베이직 점프",
      "기본 점프",
      "스트레이트 에어",
    ]) ||
    includesAnyDomainTerm(text, ["no invert", "no roll axis"]) ||
    includesAnyDomainTerm(text, ["인버트 없음", "회전축 없음", "롤 축 없음"])
  );
}

function hasVisibleInversionEvidence(value: string) {
  const text = normalizeDomainText(value);

  if (
    includesAnyDomainTerm(text, [
      "no invert",
      "인버트 없음",
      "not invert",
      "no visible inversion",
    ])
  ) {
    return false;
  }

  return (
    includesAnyDomainTerm(text, [
      "inverted body",
      "body/board",
      "body-board",
      "몸/보드",
      "몸과 보드",
      "상하 반전",
      "완전히 뒤집",
      "인버트된",
    ]) &&
    includesAnyDomainTerm(text, ["머리 위", "overhead", "inverted", "인버트"])
  );
}

function hasVisibleRollAxisEvidence(value: string) {
  const text = normalizeDomainText(value);

  if (
    includesAnyDomainTerm(text, [
      "no roll axis",
      "회전축 없음",
      "롤 축 없음",
      "no visible roll",
    ])
  ) {
    return false;
  }

  return includesAnyDomainTerm(text, [
    "roll axis",
    "rotation axis",
    "회전축",
    "롤 축",
    "roll축",
  ]);
}

function hasVisibleRotationInitiationEvidence(value: string) {
  return includesAnyDomainTerm(value, [
    "rotation initiation",
    "회전 시작",
    "initiation",
    "어깨",
    "골반",
    "shoulder",
    "hip",
  ]);
}

function hasHeelsideSetupEvidence(approachText: string, allEvidenceText: string) {
  return (
    includesAnyDomainTerm(approachText, [
      "heelside",
      "heel side",
      "힐사이드",
      "hs",
    ]) &&
    includesAnyDomainTerm(allEvidenceText, ["heelside", "heel side", "힐사이드"]) &&
    includesAnyDomainTerm(allEvidenceText, ["edge", "엣지", "load", "로드"])
  );
}

function inversionGateEvidence(facts: InversionObservedFactsPayload) {
  const bodyInverted = facts.bodyInverted === true;
  const boardAboveHead = facts.boardAboveHead === true;
  const rollAxisObserved = facts.rollAxisObserved === true;

  return {
    bodyInverted,
    boardAboveHead,
    rollAxisObserved,
    invertFamilyAllowed: boardAboveHead || bodyInverted || rollAxisObserved,
  };
}

function taxonomyEntryEvidence({
  visibleInversion,
  visibleRollAxis,
  visibleRotationInitiation,
  heelsideSetup,
  toesideApproach,
  isBasicAirPlausible,
}: {
  visibleInversion: boolean;
  visibleRollAxis: boolean;
  visibleRotationInitiation: boolean;
  heelsideSetup: boolean;
  toesideApproach: boolean;
  isBasicAirPlausible: boolean;
}) {
  return [
    visibleInversion ? "visible inversion" : undefined,
    visibleRollAxis ? "visible roll axis" : undefined,
    visibleRotationInitiation ? "visible rotation initiation" : undefined,
    heelsideSetup ? "heelside setup" : undefined,
    toesideApproach ? "toeside approach" : undefined,
    isBasicAirPlausible ? "basic air plausible" : undefined,
  ].filter((item): item is string => Boolean(item));
}

function taxonomyConfidence(value: string): "high" | "medium" | "low" {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : "low";
}

function normalizeDomainText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function includesAnyDomainTerm(value: string, terms: string[]) {
  const compactValue = value.replace(/\s+/g, "");

  return terms.some((term) => {
    const normalizedTerm = normalizeDomainText(term);
    return (
      value.includes(normalizedTerm) ||
      compactValue.includes(normalizedTerm.replace(/\s+/g, ""))
    );
  });
}

function geminiQualityMode(model: string) {
  return model.toLowerCase().includes("lite")
    ? ("degraded" as const)
    : ("standard" as const);
}

function markEvidenceAsDegraded(evidence: ReturnType<typeof normalizeGeminiEvidence>) {
  return {
    ...evidence,
    confidence: "low" as const,
    primaryCandidate: {
      ...evidence.primaryCandidate,
      confidence: "low" as const,
      evidence: `${evidence.primaryCandidate.evidence} Flash-Lite fallback 결과라 기술명은 반드시 사용자가 확인해야 합니다.`,
    },
    uncertainty: {
      level: "high" as const,
      reasons: [
        ...evidence.uncertainty.reasons,
        "Flash-Lite fallback은 service degraded mode입니다. 최종 코칭 품질 판단이나 자동 코칭 기준으로 사용하지 마세요.",
      ],
    },
  };
}

function normalizeEvidenceFact(
  value:
    | {
        name?: unknown;
        value?: unknown;
        confidence?: unknown;
        evidence?: unknown;
      }
    | string
    | undefined,
  fallbackValue: string,
): ApproachFactPayload {
  const label =
    typeof value === "string"
      ? value
      : typeof value?.name === "string"
        ? value.name
        : typeof value?.value === "string"
          ? value.value
          : fallbackValue;

  return {
    value: label,
    confidence:
      typeof value === "string"
        ? "low"
        : asOpenAiConfidenceLevel(value?.confidence) ?? "low",
    evidence:
      typeof value === "string"
        ? "Gemini returned a compact evidence string."
        : typeof value?.evidence === "string"
        ? value.evidence
        : "영상 근거를 충분히 구조화하지 못했습니다.",
  };
}

function normalizeTrickCandidate(
  value:
    | {
        name?: unknown;
        confidence?: unknown;
        evidence?: unknown;
      }
    | undefined,
  fallbackName: string,
) {
  return {
    name: typeof value?.name === "string" ? value.name : fallbackName,
    confidence: asOpenAiConfidenceLevel(value?.confidence) ?? "low",
    evidence:
      typeof value?.evidence === "string"
        ? value.evidence
        : "기술명 후보 근거를 충분히 구조화하지 못했습니다.",
  };
}

function normalizeTrickCandidates(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) =>
      item && typeof item === "object"
        ? normalizeTrickCandidate(item as Record<string, unknown>, "")
        : null,
    )
    .filter(
      (item): item is NonNullable<typeof item> =>
        Boolean(item && item.name.trim()),
    )
    .slice(0, 3);
}

function normalizeEvidenceWindows(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const candidate = item as Record<string, unknown>;
      const startSeconds = Number(candidate.startSeconds);
      const endSeconds = Number(candidate.endSeconds);
      const confidence = asOpenAiConfidenceLevel(candidate.confidence);

      if (
        !Number.isFinite(startSeconds) ||
        !Number.isFinite(endSeconds) ||
        endSeconds <= startSeconds ||
        !confidence
      ) {
        return null;
      }

      return {
        startSeconds,
        endSeconds,
        label:
          typeof candidate.label === "string" ? candidate.label : "동작 구간",
        evidence:
          typeof candidate.evidence === "string"
            ? candidate.evidence
            : "해당 구간에서 주요 동작이 보입니다.",
        confidence,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function normalizeEvidenceObservations(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const candidate = item as Record<string, unknown>;

      return {
        timestampLabel:
          typeof candidate.timestampLabel === "string"
            ? candidate.timestampLabel
            : "확인 필요",
        label:
          typeof candidate.label === "string"
            ? candidate.label
            : `관찰 ${index + 1}`,
        detail:
          typeof candidate.detail === "string"
            ? candidate.detail
            : "영상에서 보이는 사실을 충분히 구조화하지 못했습니다.",
        confidence: asOpenAiConfidenceLevel(candidate.confidence) ?? "low",
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function normalizeEvidenceUncertainty(value: unknown) {
  if (!value || typeof value !== "object") {
    return {
      level: "medium" as const,
      reasons: ["모델이 불확실성 정보를 충분히 제공하지 않았습니다."],
    };
  }

  const candidate = value as Record<string, unknown>;

  return {
    level: asOpenAiConfidenceLevel(candidate.level) ?? "medium",
    reasons: normalizeStringArray(candidate.reasons, [
      "영상 각도나 프레임 정보 때문에 일부 판단이 제한됩니다.",
    ]),
  };
}

function normalizeOpenAiBenchmark(parsed: Partial<OpenAiBenchmarkPayload>) {
  return {
    ...normalizeGeminiAnalysis(parsed),
    humanReadableAnalysis:
      typeof parsed.humanReadableAnalysis === "string"
        ? parsed.humanReadableAnalysis
        : "구조화된 코칭 리포트가 제공되지 않았습니다.",
    observations: normalizeObjectArray(parsed.observations),
    patternRecognition: normalizeObjectArray(parsed.patternRecognition),
    inferences: normalizeObjectArray(parsed.inferences),
    confidence:
      parsed.confidence && typeof parsed.confidence === "object"
        ? parsed.confidence
        : {
            level: "low" as const,
            reason: "모델이 전체 확신도를 제공하지 않았습니다.",
          },
    selfCritique:
      parsed.selfCritique && typeof parsed.selfCritique === "object"
        ? parsed.selfCritique
        : {
            limitations: ["모델이 자기비판 정보를 제공하지 않았습니다."],
            whatWouldImproveAnalysis: [
              "더 긴 클립과 측면 각도 영상을 추가하세요.",
            ],
          },
  };
}

function invalidJsonSummary(outputText: string) {
  const normalized = outputText.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "코칭 응답을 받았지만 표시할 수 있는 내용이 비어 있습니다.";
  }

  return "코칭 응답을 받았지만 구조화 처리에 실패했습니다. 전체 응답은 상세의 응답 원문에서 확인해 주세요.";
}

function normalizeHighlightScenes(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((scene) => scene && typeof scene === "object")
        .map((scene, index) => {
          const candidate = scene as Partial<
            GeminiAnalysisPayload["highlightScenes"][number]
          >;

          return {
            id:
              typeof candidate.id === "string"
                ? candidate.id
                : `scene-${index + 1}`,
            timestampLabel:
              typeof candidate.timestampLabel === "string"
                ? candidate.timestampLabel
                : "확인 필요",
            title:
              typeof candidate.title === "string"
                ? candidate.title
                : "하이라이트",
            description:
              typeof candidate.description === "string"
                ? candidate.description
                : "영상에서 확인된 장면입니다.",
            imageUri: candidate.imageUri ?? undefined,
          };
        })
    : [];
}

function attachHighlightImages(
  scenes: ReturnType<typeof normalizeHighlightScenes>,
  frames: Array<{
    dataUrl: string;
    timestampSeconds: number;
    timestampLabel: string;
  }>,
) {
  if (scenes.length === 0 || frames.length === 0) {
    return scenes;
  }

  const usedFrameIndexes = new Set<number>();

  return scenes.map((scene, sceneIndex) => {
    if (scene.imageUri) {
      return scene;
    }

    const sceneSeconds = parseTimestampSeconds(scene.timestampLabel);
    const nearestFrameIndex =
      sceneSeconds === undefined
        ? getDistributedFrameIndex(sceneIndex, scenes.length, frames.length)
        : findNearestUnusedFrameIndex(frames, sceneSeconds, usedFrameIndexes);
    usedFrameIndexes.add(nearestFrameIndex);
    const nearestFrame = frames[nearestFrameIndex] ?? frames[0];

    return {
      ...scene,
      imageUri: nearestFrame.dataUrl,
    };
  });
}

function getDistributedFrameIndex(
  itemIndex: number,
  itemCount: number,
  frameCount: number,
) {
  if (frameCount <= 1 || itemCount <= 1) {
    return 0;
  }

  return Math.min(
    Math.round((itemIndex / (itemCount - 1)) * (frameCount - 1)),
    frameCount - 1,
  );
}

function findNearestUnusedFrameIndex(
  frames: Array<{
    timestampSeconds: number;
  }>,
  targetSeconds: number,
  usedFrameIndexes: Set<number>,
) {
  const rankedIndexes = frames
    .map((frame, index) => ({
      index,
      distance: Math.abs(frame.timestampSeconds - targetSeconds),
    }))
    .sort((first, second) => first.distance - second.distance);

  return (
    rankedIndexes.find((item) => !usedFrameIndexes.has(item.index))?.index ??
    rankedIndexes[0]?.index ??
    0
  );
}

function parseTimestampSeconds(timestampLabel: string) {
  const timestampMatches = Array.from(
    timestampLabel.matchAll(/(\d+):(\d{1,2}(?:\.\d+)?)/g),
  );

  if (timestampMatches.length > 0) {
    const seconds = timestampMatches.map(
      (match) => Number(match[1]) * 60 + Number(match[2]),
    );

    return seconds.reduce((sum, value) => sum + value, 0) / seconds.length;
  }

  const secondsMatches = Array.from(
    timestampLabel.matchAll(/(\d+(?:\.\d+)?)\s*(?:s|sec|seconds|초)/gi),
  );

  if (secondsMatches.length === 0) {
    return undefined;
  }

  const seconds = secondsMatches.map((match) => Number(match[1]));

  return seconds.reduce((sum, value) => sum + value, 0) / seconds.length;
}

function normalizeObjectArray<T>(value: T[] | undefined) {
  return Array.isArray(value) ? value : [];
}

function normalizeStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const strings = value.filter(
    (item): item is string => typeof item === "string",
  );

  return strings.length > 0 ? strings : fallback;
}

function fallbackSummary(outputText: string) {
  const normalized = outputText.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "영상 분석 응답을 받았지만 표시할 수 있는 텍스트가 비어 있습니다.";
  }

  return normalized.length > 220
    ? `${normalized.slice(0, 220)}...`
    : normalized;
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
        required: ["id", "timestampLabel", "title", "description", "imageUri"],
      },
    },
    suggestions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: ["summary", "highlights", "highlightScenes", "suggestions"],
};

const geminiEdgeBenchmarkResponseSchema = {
  type: Type.OBJECT,
  properties: {
    predictedEdge: {
      type: Type.STRING,
      enum: ["toe", "heel", "unknown", "ambiguous"],
    },
    confidence: {
      type: Type.STRING,
      enum: ["high", "medium", "low"],
    },
    visibleEvidence: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    inferredEvidence: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    hallucinationFlags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    timestampEvidence: {
      type: Type.OBJECT,
      properties: {
        startSec: { type: Type.NUMBER, nullable: true },
        endSec: { type: Type.NUMBER, nullable: true },
        description: { type: Type.STRING },
      },
      required: ["startSec", "endSec", "description"],
    },
  },
  required: [
    "predictedEdge",
    "confidence",
    "visibleEvidence",
    "inferredEvidence",
    "hallucinationFlags",
    "timestampEvidence",
  ],
};

const geminiEvidenceFactSchema = {
  type: Type.OBJECT,
  properties: {
    value: { type: Type.STRING },
    confidence: {
      type: Type.STRING,
      enum: ["high", "medium", "low"],
    },
    evidence: { type: Type.STRING },
  },
  required: ["value", "confidence", "evidence"],
};

const geminiTrickCandidateSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    confidence: {
      type: Type.STRING,
      enum: ["high", "medium", "low"],
    },
    evidence: { type: Type.STRING },
  },
  required: ["name", "confidence", "evidence"],
};

const geminiApproachObservedFactsSchema = {
  type: Type.OBJECT,
  properties: {
    stance: geminiEvidenceFactSchema,
    leadFoot: geminiEvidenceFactSchema,
    boardDirection: geminiEvidenceFactSchema,
    wakeCrossingPath: {
      type: Type.OBJECT,
      properties: {
        startPosition: { type: Type.STRING },
        takeoffPosition: { type: Type.STRING },
        landingPosition: { type: Type.STRING },
        direction: { type: Type.STRING },
        confidence: {
          type: Type.STRING,
          enum: ["high", "medium", "low"],
        },
        evidence: { type: Type.STRING },
      },
      required: [
        "startPosition",
        "takeoffPosition",
        "landingPosition",
        "direction",
        "confidence",
        "evidence",
      ],
    },
    edgeDirectionEvidence: geminiEvidenceFactSchema,
    handlePosition: geminiEvidenceFactSchema,
    bodyOrientation: geminiEvidenceFactSchema,
  },
  required: [
    "stance",
    "leadFoot",
    "boardDirection",
    "wakeCrossingPath",
    "edgeDirectionEvidence",
    "handlePosition",
    "bodyOrientation",
  ],
};

const geminiEdgeLoadObservedFactsSchema = {
  type: Type.OBJECT,
  properties: {
    toeEdgeLoaded: geminiEvidenceFactSchema,
    heelEdgeLoaded: geminiEvidenceFactSchema,
    edgeLoadVisible: geminiEvidenceFactSchema,
    edgeLoadTiming: {
      type: Type.OBJECT,
      properties: {
        startSec: { type: Type.NUMBER, nullable: true },
        endSec: { type: Type.NUMBER, nullable: true },
        observedMoment: { type: Type.STRING },
        evidenceFrameDescription: { type: Type.STRING },
      },
      required: [
        "startSec",
        "endSec",
        "observedMoment",
        "evidenceFrameDescription",
      ],
    },
    boardTiltDirection: geminiEvidenceFactSchema,
    sprayDirection: geminiEvidenceFactSchema,
    lineTensionDirection: geminiEvidenceFactSchema,
    riderWeightOverEdge: geminiEvidenceFactSchema,
    edgeLoadConfidence: {
      type: Type.STRING,
      enum: ["high", "medium", "low"],
    },
    edgeLoadEvidenceText: { type: Type.STRING },
    antiEdgeLoadEvidence: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: [
    "toeEdgeLoaded",
    "heelEdgeLoaded",
    "edgeLoadVisible",
    "edgeLoadTiming",
    "boardTiltDirection",
    "sprayDirection",
    "lineTensionDirection",
    "riderWeightOverEdge",
    "edgeLoadConfidence",
    "edgeLoadEvidenceText",
    "antiEdgeLoadEvidence",
  ],
};

const geminiObservedBooleanSchema = {
  type: Type.STRING,
  enum: ["true", "false", "unknown"],
};

const geminiPopObservedFactsSchema = {
  type: Type.OBJECT,
  properties: {
    popType: { type: Type.STRING, nullable: true },
    timing: { type: Type.STRING, nullable: true },
    intensity: { type: Type.STRING, nullable: true },
    evidenceText: { type: Type.STRING, nullable: true },
    confidence: {
      type: Type.STRING,
      enum: ["high", "medium", "low"],
    },
    antiEvidence: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: [
    "popType",
    "timing",
    "intensity",
    "evidenceText",
    "confidence",
    "antiEvidence",
  ],
};

const geminiRotationObservedFactsSchema = {
  type: Type.OBJECT,
  properties: {
    rotationAxis: { type: Type.STRING, nullable: true },
    rotationDirection: { type: Type.STRING, nullable: true },
    inversionDetected: geminiObservedBooleanSchema,
    spinDegrees: { type: Type.STRING, nullable: true },
    handlePassObserved: geminiObservedBooleanSchema,
    evidenceText: { type: Type.STRING, nullable: true },
    confidence: {
      type: Type.STRING,
      enum: ["high", "medium", "low"],
    },
    antiEvidence: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: [
    "rotationAxis",
    "rotationDirection",
    "inversionDetected",
    "spinDegrees",
    "handlePassObserved",
    "evidenceText",
    "confidence",
    "antiEvidence",
  ],
};

const geminiInversionObservedFactsSchema = {
  type: Type.OBJECT,
  properties: {
    bodyInverted: geminiObservedBooleanSchema,
    boardAboveHead: geminiObservedBooleanSchema,
    rollAxisObserved: geminiObservedBooleanSchema,
    flipAxisObserved: geminiObservedBooleanSchema,
    inversionDuration: {
      type: Type.OBJECT,
      properties: {
        seconds: { type: Type.NUMBER, nullable: true },
        confidence: {
          type: Type.STRING,
          enum: ["high", "medium", "low"],
        },
        evidence: { type: Type.STRING },
      },
      required: ["seconds", "confidence", "evidence"],
    },
    inversionEvidenceCount: { type: Type.NUMBER },
    antiInversionEvidence: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: [
    "bodyInverted",
    "boardAboveHead",
    "rollAxisObserved",
    "flipAxisObserved",
    "inversionDuration",
    "inversionEvidenceCount",
    "antiInversionEvidence",
  ],
};

const geminiTemporalWindowsSchema = {
  type: Type.OBJECT,
  properties: {
    takeoffTimestamp: {
      type: Type.OBJECT,
      properties: {
        timestampSeconds: { type: Type.NUMBER, nullable: true },
        confidence: {
          type: Type.STRING,
          enum: ["high", "medium", "low"],
        },
        evidence: { type: Type.STRING },
      },
      required: ["timestampSeconds", "confidence", "evidence"],
    },
    finalApproachWindow: {
      type: Type.OBJECT,
      properties: {
        startSeconds: { type: Type.NUMBER },
        endSeconds: { type: Type.NUMBER },
        confidence: {
          type: Type.STRING,
          enum: ["high", "medium", "low"],
        },
        reasonWindowWasChosen: { type: Type.STRING },
      },
      required: [
        "startSeconds",
        "endSeconds",
        "confidence",
        "reasonWindowWasChosen",
      ],
    },
    ignoredSetupWindows: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          startSeconds: { type: Type.NUMBER },
          endSeconds: { type: Type.NUMBER },
          reason: { type: Type.STRING },
        },
        required: ["startSeconds", "endSeconds", "reason"],
      },
    },
    approachWindowConfidence: {
      type: Type.STRING,
      enum: ["high", "medium", "low"],
    },
  },
  required: [
    "takeoffTimestamp",
    "finalApproachWindow",
    "ignoredSetupWindows",
    "approachWindowConfidence",
  ],
};

const geminiEvidenceResponseSchema = {
  type: Type.OBJECT,
  properties: {
    primaryCandidate: geminiTrickCandidateSchema,
    family: geminiEvidenceFactSchema,
    temporalWindows: geminiTemporalWindowsSchema,
    approachObservedFacts: geminiApproachObservedFactsSchema,
    edgeLoadObservedFacts: geminiEdgeLoadObservedFactsSchema,
    popObservedFacts: geminiPopObservedFactsSchema,
    rotationObservedFacts: geminiRotationObservedFactsSchema,
    grabObservedFacts: { type: Type.STRING, nullable: true },
    landingObservedFacts: { type: Type.STRING, nullable: true },
    inversionObservedFacts: geminiInversionObservedFactsSchema,
    approachType: geminiEvidenceFactSchema,
    rotationType: geminiEvidenceFactSchema,
    landingOutcome: { type: Type.STRING, nullable: true },
    confidence: {
      type: Type.STRING,
      enum: ["high", "medium", "low"],
    },
    evidence: { type: Type.STRING },
    alternativeCandidates: {
      type: Type.ARRAY,
      items: geminiTrickCandidateSchema,
    },
    evidenceWindows: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          startSeconds: { type: Type.NUMBER },
          endSeconds: { type: Type.NUMBER },
          label: { type: Type.STRING },
          evidence: { type: Type.STRING },
          confidence: {
            type: Type.STRING,
            enum: ["high", "medium", "low"],
          },
        },
        required: [
          "startSeconds",
          "endSeconds",
          "label",
          "evidence",
          "confidence",
        ],
      },
    },
    observations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          timestampLabel: { type: Type.STRING },
          label: { type: Type.STRING },
          detail: { type: Type.STRING },
          confidence: {
            type: Type.STRING,
            enum: ["high", "medium", "low"],
          },
        },
        required: ["timestampLabel", "label", "detail", "confidence"],
      },
    },
    uncertainty: {
      type: Type.OBJECT,
      properties: {
        level: {
          type: Type.STRING,
          enum: ["high", "medium", "low"],
        },
        reasons: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
      },
      required: ["level", "reasons"],
    },
  },
  required: [
    "primaryCandidate",
    "family",
    "temporalWindows",
    "approachObservedFacts",
    "edgeLoadObservedFacts",
    "popObservedFacts",
    "rotationObservedFacts",
    "grabObservedFacts",
    "inversionObservedFacts",
    "approachType",
    "rotationType",
    "landingOutcome",
    "confidence",
    "evidence",
    "alternativeCandidates",
    "evidenceWindows",
    "observations",
    "uncertainty",
  ],
};

const openAiHighlightScoutResponseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    highlightCandidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          startSeconds: { type: "number" },
          endSeconds: { type: "number" },
          reason: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["startSeconds", "endSeconds", "reason", "confidence"],
      },
    },
    overallConfidence: { type: "string", enum: ["high", "medium", "low"] },
    notEnoughEvidenceReason: { type: "string" },
  },
  required: [
    "highlightCandidates",
    "overallConfidence",
    "notEnoughEvidenceReason",
  ],
};

const openAiMotionScoutResponseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    phaseWindows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          phase: {
            type: "string",
            enum: [
              "approach",
              "edge_load",
              "takeoff",
              "pop",
              "airborne",
              "peak_air",
              "rotation",
              "descent",
              "landing",
              "crash_recovery",
            ],
          },
          startSeconds: { type: "number" },
          endSeconds: { type: "number" },
          evidence: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: [
          "phase",
          "startSeconds",
          "endSeconds",
          "evidence",
          "confidence",
        ],
      },
    },
    primaryHighlightTimestampSeconds: {
      anyOf: [{ type: "number" }, { type: "null" }],
    },
    thumbnailFrameTimestampSeconds: {
      anyOf: [{ type: "number" }, { type: "null" }],
    },
    highlightFrameTimestampsSeconds: {
      type: "array",
      items: { type: "number" },
    },
    overallConfidence: { type: "string", enum: ["high", "medium", "low"] },
    notEnoughEvidenceReason: { type: "string" },
  },
  required: [
    "phaseWindows",
    "primaryHighlightTimestampSeconds",
    "thumbnailFrameTimestampSeconds",
    "highlightFrameTimestampsSeconds",
    "overallConfidence",
    "notEnoughEvidenceReason",
  ],
};

const openAiBenchmarkResponseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    humanReadableAnalysis: { type: "string" },
    summary: { type: "string" },
    highlights: {
      type: "array",
      items: { type: "string" },
    },
    highlightScenes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          timestampLabel: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          imageUri: {
            anyOf: [{ type: "string" }, { type: "null" }],
          },
        },
        required: ["id", "timestampLabel", "title", "description", "imageUri"],
      },
    },
    suggestions: {
      type: "array",
      items: { type: "string" },
    },
    observations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          timestampLabel: { type: "string" },
          evidence: { type: "string" },
          coachingRelevance: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          confidenceReason: { type: "string" },
        },
        required: [
          "timestampLabel",
          "evidence",
          "coachingRelevance",
          "confidence",
          "confidenceReason",
        ],
      },
    },
    patternRecognition: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          pattern: { type: "string" },
          evidence: { type: "string" },
          impact: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          confidenceReason: { type: "string" },
        },
        required: [
          "pattern",
          "evidence",
          "impact",
          "confidence",
          "confidenceReason",
        ],
      },
    },
    inferences: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          inference: { type: "string" },
          evidence: { type: "string" },
          coachingImplication: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          confidenceReason: { type: "string" },
        },
        required: [
          "inference",
          "evidence",
          "coachingImplication",
          "confidence",
          "confidenceReason",
        ],
      },
    },
    confidence: {
      type: "object",
      additionalProperties: false,
      properties: {
        level: { type: "string", enum: ["high", "medium", "low"] },
        reason: { type: "string" },
      },
      required: ["level", "reason"],
    },
    selfCritique: {
      type: "object",
      additionalProperties: false,
      properties: {
        limitations: {
          type: "array",
          items: { type: "string" },
        },
        whatWouldImproveAnalysis: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["limitations", "whatWouldImproveAnalysis"],
    },
  },
  required: [
    "humanReadableAnalysis",
    "summary",
    "highlights",
    "highlightScenes",
    "suggestions",
    "observations",
    "patternRecognition",
    "inferences",
    "confidence",
    "selfCritique",
  ],
};
