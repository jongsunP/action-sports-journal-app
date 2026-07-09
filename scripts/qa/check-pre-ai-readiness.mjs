import { execFileSync } from 'node:child_process';
import process from 'node:process';

const args = parseArgs(process.argv.slice(2));
const includeDb = args['skip-db'] !== 'true';
const matchCount = args['match-count'] ?? '11';
const checks = [];

checks.push(runCommandCheck('typecheck', ['run', 'typecheck'], parsePlainSuccess));
checks.push(
  runCommandCheck(
    'local_readiness',
    ['run', 'qa:local-readiness', '--', '--check-health'],
    parseLocalReadiness,
  ),
);

if (includeDb) {
  checks.push(
    runCommandCheck(
      'db_owner_summary',
      ['run', 'qa:db:owner-summary', '--', `--match-count=${matchCount}`],
      parseDbOwnerSummary,
    ),
  );
}

const failed = checks.filter((check) => !check.ok);
const warnings = checks
  .flatMap((check) => check.warnings?.map((warning) => `${check.name}:${warning}`) ?? []);

console.log(
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      mode: 'pre_ai_readiness',
      status: failed.length === 0 ? 'ready' : 'attention',
      checks,
      summary: {
        failed: failed.map((check) => check.name),
        warnings,
        aiCalibrationCanStartAfterReferenceVideos: failed.length === 0,
      },
      safety: {
        noEasBuild: true,
        noLocalNativeBuild: true,
        noDbWrites: true,
        noPaidAiCalls: true,
        noSecretsPrinted: true,
      },
    },
    null,
    2,
  ),
);

if (failed.length > 0) {
  process.exitCode = 1;
}

function runCommandCheck(name, npmArgs, parseOutput) {
  try {
    const output = execFileSync('npm', npmArgs, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60000,
    });
    const parsed = parseOutput(output);

    return {
      name,
      ok: parsed.ok,
      warnings: parsed.warnings ?? [],
      detail: parsed.detail ?? {},
    };
  } catch (error) {
    const output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`;
    let parsed;

    try {
      parsed = parseOutput(output);
    } catch {
      parsed = null;
    }

    return {
      name,
      ok: parsed?.ok ?? false,
      warnings: parsed?.warnings ?? [],
      detail: parsed?.detail ?? {
        error: 'command_failed',
        status: error.status ?? null,
      },
    };
  }
}

function parsePlainSuccess() {
  return {
    ok: true,
    detail: {
      passed: true,
    },
  };
}

function parseLocalReadiness(output) {
  const json = extractJson(output);
  const failed = json.summary?.failed ?? [];
  const warnings = json.summary?.warnings ?? [];
  const endpointHealth = json.checks?.find((check) => check.name === 'endpoint_health');
  const publicEndpoint = json.checks?.find((check) => check.name === 'public_endpoint');
  const codesigning = json.checks?.find((check) => check.name === 'codesigning_identity');

  return {
    ok: failed.length === 0,
    warnings,
    detail: {
      readinessStatus: json.status,
      endpointMode: publicEndpoint?.detail?.mode ?? null,
      endpointHealthStatus: endpointHealth?.detail?.status ?? null,
      endpointHealthDurationMs: endpointHealth?.detail?.durationMs ?? null,
      appleDevelopmentIdentityCount:
        codesigning?.detail?.appleDevelopmentIdentityCount ?? null,
    },
  };
}

function parseDbOwnerSummary(output) {
  const json = extractJson(output);
  const owners = json.owners ?? [];
  const warnings = [];

  if (owners.length === 0) {
    warnings.push('no_matching_owner');
  }

  const ownerSummaries = owners.map((owner) => ({
    ownerHash: owner.ownerHash,
    momentsTotal: owner.moments?.total ?? 0,
    statuses: owner.moments?.statuses ?? {},
    thumbnails: owner.moments?.thumbnails ?? 0,
    missingThumbnails: owner.moments?.missingThumbnails ?? 0,
    pushTokensEnabled: owner.pushTokens?.enabled ?? 0,
    analysisJobsCompleted: owner.analysisJobs?.statuses?.completed ?? 0,
    evidenceResultsCompleted: owner.evidenceResults?.statuses?.completed ?? 0,
  }));

  return {
    ok: true,
    warnings,
    detail: {
      ownersMatched: json.totals?.ownersMatched ?? owners.length,
      momentsRead: json.totals?.momentsRead ?? null,
      owners: ownerSummaries,
    },
  };
}

function extractJson(output) {
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in command output.');
  }

  return JSON.parse(output.slice(start, end + 1));
}

function parseArgs(rawArgs) {
  return rawArgs.reduce((acc, arg) => {
    if (!arg.startsWith('--')) {
      return acc;
    }

    const [key, value = 'true'] = arg.slice(2).split('=');
    acc[key] = value;
    return acc;
  }, {});
}
