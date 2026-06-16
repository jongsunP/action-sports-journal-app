import crypto from 'node:crypto';

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const keepRows = process.argv.includes('--keep');

if (!supabaseUrl) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL.');
  process.exit(1);
}

if (!serviceRoleKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
const smokeId = crypto.randomUUID();
const now = new Date().toISOString();
let userId;
let momentId;
let analysisJobId;
let evidenceResultId;

try {
  const user = await insertOne('users', {
    display_name: 'Supabase Write Smoke Test',
    email: `supabase-write-smoke-${smokeId}@example.invalid`,
    locale: 'ko-KR',
  });
  userId = user.id;

  const moment = await insertOne('moments', {
    user_id: userId,
    activity_group_id: 'wakeboard',
    title: 'Supabase write smoke test',
    notes: 'Inserted by scripts/smoke-test-supabase-writes.mjs',
    status: 'processing',
    source: 'smoke_test',
    occurred_at: now,
    file_name: 'smoke-test.mov',
    mime_type: 'video/quicktime',
    file_size: 0,
    intended_trick: 'unknown',
  });
  momentId = moment.id;

  const analysisJob = await insertOne('analysis_jobs', {
    user_id: userId,
    moment_id: momentId,
    kind: 'evidence_extraction',
    status: 'completed',
    provider: 'gemini',
    model: 'smoke-test',
    attempts: 1,
    max_attempts: 2,
    started_at: now,
    completed_at: now,
  });
  analysisJobId = analysisJob.id;

  const evidenceResult = await insertOne('evidence_results', {
    user_id: userId,
    moment_id: momentId,
    analysis_job_id: analysisJobId,
    provider: 'gemini',
    model: 'smoke-test',
    status: 'completed',
    quality_mode: 'standard',
    predicted_trick: 'Smoke Test',
    family: 'unknown',
    confidence: 'low',
    needs_review: true,
    consistency_status: 'needs_review',
    consistency_warnings: ['smoke test row'],
    approach_observed_facts: {
      edgeDirectionEvidence: {
        value: 'unknown',
        confidence: 'low',
        evidence: 'smoke test',
      },
    },
    approach_observed_facts_v2: {
      edgeDirectionEvidence: {
        value: 'unknown',
        confidence: 'low',
        evidence: 'smoke test',
        loadedEdge: 'unknown',
      },
      signals: [
        {
          field: 'edgeDirectionEvidence',
          supports: 'unknown',
          strength: 'primary',
          confidence: 'low',
          evidence: 'smoke test',
          timestampSeconds: null,
        },
      ],
      conflictSummary: {
        hasConflict: false,
        toesideSignals: 0,
        heelsideSignals: 0,
        switchSignals: 0,
        conflictFields: [],
        reason: 'smoke test',
      },
    },
    approach_decision_v2: {
      value: 'unknown',
      confidence: 'low',
      primaryEvidence: [],
      supportingEvidence: [],
      conflictingEvidence: [],
      rejectedAlternatives: [],
      uncertainty: ['smoke test'],
    },
    approach_v2_signals: [
      {
        field: 'edgeDirectionEvidence',
        supports: 'unknown',
        strength: 'primary',
        confidence: 'low',
        evidence: 'smoke test',
        timestampSeconds: null,
      },
    ],
    approach_v2_conflict_summary: {
      hasConflict: false,
      toesideSignals: 0,
      heelsideSignals: 0,
      switchSignals: 0,
      conflictFields: [],
      reason: 'smoke test',
    },
    inversion_observed_facts: {
      bodyInverted: 'unknown',
      boardAboveHead: 'unknown',
      rollAxisObserved: 'unknown',
      flipAxisObserved: 'unknown',
      inversionEvidenceCount: 0,
      antiInversionEvidence: ['smoke test'],
    },
    temporal_windows: {},
    evidence_windows: [],
    observations: [],
    raw_response_text: '{"smokeTest":true}',
  });
  evidenceResultId = evidenceResult.id;

  const v2WriteReady = Boolean(
    evidenceResult.approach_observed_facts_v2 &&
      evidenceResult.approach_decision_v2 &&
      Array.isArray(evidenceResult.approach_v2_signals) &&
      evidenceResult.approach_v2_conflict_summary,
  );

  if (!v2WriteReady) {
    throw new Error('Failed to round-trip ApproachObservedFacts v2 columns.');
  }

  const { data: updatedMoment, error: updateError } = await client
    .from('moments')
    .update({
      status: 'completed',
      latest_analysis_job_id: analysisJobId,
      latest_evidence_result_id: evidenceResultId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', momentId)
    .select('id,status,latest_analysis_job_id,latest_evidence_result_id')
    .single();

  if (updateError) {
    throw new Error(`Failed to update moment with latest result: ${updateError.message}`);
  }

  console.log('Supabase server-side write smoke test passed.');
  console.log(
    JSON.stringify(
      {
        inserted: {
          userId,
          momentId,
          analysisJobId,
          evidenceResultId,
        },
        updatedMoment,
        v2WriteReady,
        cleanup: keepRows ? 'skipped' : 'deleted user cascade',
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error('Supabase server-side write smoke test failed.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  if (!keepRows && userId) {
    const { error } = await client.from('users').delete().eq('id', userId);

    if (error) {
      console.error(`Supabase write smoke cleanup failed: ${error.message}`);
      process.exitCode = 1;
    }
  }
}

async function insertOne(tableName, values) {
  const { data, error } = await client
    .from(tableName)
    .insert(values)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to insert ${tableName}: ${error.message}`);
  }

  return data;
}
