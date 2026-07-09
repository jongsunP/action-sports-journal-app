import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import process from 'node:process';

import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

const args = parseArgs(process.argv.slice(2));
const packageJson = readJson('package.json');
const appJson = readJson('app.json');
const easJson = readJson('eas.json');
const endpoint = process.env.EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT;
const checks = [];

addCheck('node_engine', checkNodeEngine(packageJson.engines?.node));
addCheck('expo_dev_client_dependency', {
  ok: Boolean(packageJson.dependencies?.['expo-dev-client']),
  detail: packageJson.dependencies?.['expo-dev-client'] ?? null,
});
addCheck('dev_client_scripts', checkRequiredScripts(packageJson.scripts ?? {}));
addCheck('ios_bundle', {
  ok: Boolean(appJson.expo?.ios?.bundleIdentifier && appJson.expo?.ios?.buildNumber),
  detail: {
    bundleIdentifier: appJson.expo?.ios?.bundleIdentifier ?? null,
    buildNumber: appJson.expo?.ios?.buildNumber ?? null,
  },
});
addCheck('eas_development_profile', {
  ok: easJson.build?.development?.developmentClient === true,
  detail: {
    developmentClient: easJson.build?.development?.developmentClient ?? null,
    distribution: easJson.build?.development?.distribution ?? null,
  },
});
addCheck('public_endpoint', checkPublicEndpoint(endpoint));
addCheck('codesigning_identity', checkCodesigningIdentities());
addCheck('connected_apple_device', checkConnectedAppleDevices());

if (args['check-health']) {
  addCheck('endpoint_health', await checkEndpointHealth(endpoint));
}

const failedChecks = checks.filter((check) => !check.ok);
const warningChecks = checks.filter((check) => check.warning);

console.log(
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      mode: 'read_only_local_readiness',
      status: failedChecks.length === 0 ? 'ready' : 'attention',
      checks,
      summary: {
        failed: failedChecks.map((check) => check.name),
        warnings: warningChecks.map((check) => check.name),
      },
      safety: {
        noSecretsPrinted: true,
        noRawDeviceIdsPrinted: true,
        noRawTokensPrinted: true,
      },
      nextCommands: {
        devClientLan:
          'cd ~/Repository/action-sports-journal-app && npm run start:dev-client:lan',
        expoGoLan:
          'cd ~/Repository/action-sports-journal-app && npm run start:go:lan:clear',
        optionalHealth:
          'cd ~/Repository/action-sports-journal-app && npm run qa:local-readiness -- --check-health',
      },
    },
    null,
    2,
  ),
);

if (failedChecks.length > 0) {
  process.exitCode = 1;
}

function addCheck(name, result) {
  checks.push({
    name,
    ...result,
  });
}

function checkNodeEngine(engineRange) {
  const major = Number(process.versions.node.split('.')[0]);
  const expectedRange = engineRange ?? 'unknown';
  const matchesExpectedRange = major >= 22 && major < 23;

  return {
    ok: true,
    warning: !matchesExpectedRange,
    detail: {
      currentMajor: major,
      expectedRange,
      note: matchesExpectedRange
        ? 'Node major matches package engines.'
        : 'Node major differs from package engines; npm install/typecheck may still work, but prefer the documented engine for repeatability.',
    },
  };
}

function checkRequiredScripts(scripts) {
  const required = [
    'start:dev-client:lan',
    'start:dev-client:lan:clear',
    'start:go:lan:clear',
    'device:ip',
    'device:list',
    'device:certs',
  ];
  const missing = required.filter((scriptName) => !scripts[scriptName]);

  return {
    ok: missing.length === 0,
    detail: {
      requiredCount: required.length,
      missing,
    },
  };
}

function checkPublicEndpoint(value) {
  if (!value) {
    return {
      ok: false,
      detail: {
        mode: 'missing',
      },
    };
  }

  let url;

  try {
    url = new URL(value);
  } catch {
    return {
      ok: false,
      detail: {
        mode: 'invalid_url',
        endpointHash: hashValue(value),
      },
    };
  }

  const mode = getEndpointMode(url);

  return {
    ok: mode === 'singapore_render' || mode === 'local_lan_backend',
    warning: mode === 'other',
    detail: {
      mode,
      host: url.hostname,
      endpointHash: hashValue(value),
    },
  };
}

function checkCodesigningIdentities() {
  const output = runOptional('security', ['find-identity', '-v', '-p', 'codesigning']);
  const validCountMatch = output.match(/(\d+) valid identities found/);
  const validCount = validCountMatch ? Number(validCountMatch[1]) : null;
  const appleDevelopmentCount = (output.match(/Apple Development:/g) ?? []).length;

  return {
    ok: appleDevelopmentCount >= 1 || (validCount ?? 0) >= 1,
    warning: appleDevelopmentCount !== 1,
    detail: {
      validIdentityCount: validCount,
      appleDevelopmentIdentityCount: appleDevelopmentCount,
    },
  };
}

function checkConnectedAppleDevices() {
  const output = runOptional('xcrun', ['devicectl', 'list', 'devices']);
  const noDevices = output.includes('No devices found');
  const iPhoneLikeCount = (output.match(/iPhone/g) ?? []).length;
  const iPhoneVisible = !noDevices && iPhoneLikeCount > 0;

  return {
    ok: true,
    warning: !iPhoneVisible,
    detail: {
      iPhoneVisible,
      iPhoneMentionCount: noDevices ? 0 : iPhoneLikeCount,
      note:
        !iPhoneVisible
          ? 'USB device is only needed for native rebuild/install; LAN Metro can still work after a dev client is installed.'
          : 'At least one iPhone-like device is visible to devicectl.',
    },
  };
}

async function checkEndpointHealth(value) {
  if (!value) {
    return {
      ok: false,
      detail: {
        error: 'missing_endpoint',
      },
    };
  }

  let healthUrl;

  try {
    const endpointUrl = new URL(value);
    healthUrl = `${endpointUrl.origin}/health`;
  } catch {
    return {
      ok: false,
      detail: {
        error: 'invalid_endpoint',
      },
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const startedAt = Date.now();
    const response = await fetch(healthUrl, { signal: controller.signal });
    const body = await response.text();

    return {
      ok: response.ok,
      detail: {
        status: response.status,
        durationMs: Date.now() - startedAt,
        bodyHash: hashValue(body),
      },
    };
  } catch (error) {
    return {
      ok: false,
      detail: {
        error: error instanceof Error ? error.name : 'unknown_error',
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

function getEndpointMode(url) {
  if (url.hostname === 'action-sports-journal-api-sg.onrender.com') {
    return 'singapore_render';
  }

  if (
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    /^10\./.test(url.hostname) ||
    /^192\.168\./.test(url.hostname)
  ) {
    return 'local_lan_backend';
  }

  return 'other';
}

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function runOptional(command, commandArgs) {
  try {
    return execFileSync(command, commandArgs, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000,
    });
  } catch (error) {
    return `${error.stdout ?? ''}\n${error.stderr ?? ''}`;
  }
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

function hashValue(value) {
  return crypto
    .createHash('sha256')
    .update(String(value ?? ''))
    .digest('hex')
    .slice(0, 12);
}
