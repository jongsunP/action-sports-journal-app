import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const artifactDir =
  process.env.MODEL_BENCHMARK_ARTIFACT_DIR ??
  "dev-artifacts/model-benchmarks";

function emptySummary() {
  return {
    artifactDir,
    runCount: 0,
    benchmarkModes: [],
    models: [],
  };
}

async function readBenchmarkRuns() {
  let fileNames;

  try {
    fileNames = await readdir(artifactDir);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const runs = [];

  for (const fileName of fileNames) {
    if (!fileName.endsWith(".json") || fileName.startsWith("summary-")) {
      continue;
    }

    const filePath = join(artifactDir, fileName);
    const parsed = JSON.parse(await readFile(filePath, "utf8"));

    if (parsed.kind !== "edge-native-video-benchmark-run") {
      continue;
    }

    runs.push({
      fileName,
      filePath,
      ...parsed.result,
    });
  }

  return runs;
}

function summarizeModel(model, runs) {
  const knownRuns = runs.filter((run) => run.correct !== null);
  const correctCount = knownRuns.filter((run) => run.correct).length;
  const latencyTotal = runs.reduce(
    (sum, run) => sum + Number(run.latencyMs ?? 0),
    0,
  );
  const evidenceQualityTotal = runs.reduce((sum, run) => {
    const visibleCount = Array.isArray(run.visibleEvidence)
      ? run.visibleEvidence.length
      : 0;
    const timestamp = run.timestampEvidence ?? {};
    const hasTimestamp =
      typeof timestamp.startSec === "number" ||
      typeof timestamp.endSec === "number";
    const hallucinationCount = Array.isArray(run.hallucinationFlags)
      ? run.hallucinationFlags.length
      : 0;
    const score = visibleCount + (hasTimestamp ? 1 : 0) - hallucinationCount;

    return sum + Math.max(score, 0);
  }, 0);

  return {
    model,
    total: runs.length,
    correct: correctCount,
    accuracy: knownRuns.length > 0 ? correctCount / knownRuns.length : null,
    highConfidenceWrong: runs.filter((run) => run.highConfidenceWrong).length,
    unknownOrAmbiguous: runs.filter(
      (run) => run.predictedEdge === "unknown" || run.predictedEdge === "ambiguous",
    ).length,
    averageLatencyMs:
      runs.length > 0 ? Math.round(latencyTotal / runs.length) : 0,
    hallucinationFlagCount: runs.reduce(
      (sum, run) =>
        sum +
        (Array.isArray(run.hallucinationFlags)
          ? run.hallucinationFlags.length
          : 0),
      0,
    ),
    averageEvidenceQualityScore:
      runs.length > 0 ? evidenceQualityTotal / runs.length : 0,
  };
}

function summarizeScope(runs) {
  return Array.from(new Set(runs.map((run) => run.model))).map((model) =>
    summarizeModel(
      model,
      runs.filter((run) => run.model === model),
    ),
  );
}

const runs = await readBenchmarkRuns();

if (runs.length === 0) {
  console.log(JSON.stringify(emptySummary(), null, 2));
} else {
  const benchmarkModes = Array.from(
    new Set(runs.map((run) => run.benchmarkMode ?? "legacy")),
  ).map((benchmarkMode) => {
    const modeRuns = runs.filter(
      (run) => (run.benchmarkMode ?? "legacy") === benchmarkMode,
    );

    return {
      benchmarkMode,
      runCount: modeRuns.length,
      models: summarizeScope(modeRuns),
    };
  });

  console.log(
    JSON.stringify(
      {
        artifactDir,
        runCount: runs.length,
        benchmarkModes,
        models: summarizeScope(runs),
      },
      null,
      2,
    ),
  );
}
