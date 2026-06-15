import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL.');
  process.exit(1);
}

if (!publishableKey) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
  process.exit(1);
}

const serverKey = serviceRoleKey || publishableKey;
const client = createClient(supabaseUrl, serverKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

if (serviceRoleKey) {
  const { error } = await client.auth.admin.listUsers({
    page: 1,
    perPage: 1,
  });

  if (error) {
    console.error('Supabase connection smoke test failed.');
    console.error(error.message);
    process.exit(1);
  }
}

const tableChecks = await Promise.all(
  ['users', 'moments', 'analysis_jobs', 'evidence_results'].map(
    async (tableName) => {
      const { error } = await client.from(tableName).select('id').limit(1);
      const errorMessage = error?.message;
      const exists = !errorMessage?.includes('Could not find the table');
      const permissionDenied = errorMessage?.includes('permission denied');

      return {
        tableName,
        reachable: !error,
        exists,
        permissionDenied: Boolean(permissionDenied),
        errorMessage,
      };
    },
  ),
);
const schemaReady = tableChecks.every((check) => check.reachable);
const schemaApplied = tableChecks.every((check) => check.exists);
const grantsReady = tableChecks.every((check) => !check.permissionDenied);

console.log('Supabase connection smoke test passed.');
console.log(
  JSON.stringify(
    {
      url: supabaseUrl,
      mode: serviceRoleKey ? 'service_role' : 'publishable_key',
      serviceRoleConfigured: Boolean(serviceRoleKey),
      schemaReady,
      schemaApplied,
      grantsReady,
      tables: tableChecks,
    },
    null,
    2,
  ),
);

if (!schemaReady) {
  if (!schemaApplied) {
    console.log(
      'Supabase connection is ready, but Phase 1 schema is not applied yet. Run supabase/phase1_schema.sql in the Supabase SQL editor.',
    );
  } else if (!grantsReady) {
    console.log(
      'Supabase Phase 1 tables exist, but service_role grants are missing. Run supabase/phase1_service_role_grants.sql in the Supabase SQL editor.',
    );
  }
}
