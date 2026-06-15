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

const { data, error } = await client.from('users').select('id').limit(1);

if (error) {
  console.error('Supabase smoke test failed.');
  console.error(error.message);
  process.exit(1);
}

console.log('Supabase smoke test passed.');
console.log(
  JSON.stringify(
    {
      url: supabaseUrl,
      mode: serviceRoleKey ? 'service_role' : 'publishable_key',
      usersTableReachable: Array.isArray(data),
    },
    null,
    2,
  ),
);
