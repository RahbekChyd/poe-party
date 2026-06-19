import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export function createAdminClient() {
  const url =
    Deno.env.get('SUPABASE_URL') ??
    Deno.env.get('API_URL') ??
    'http://127.0.0.1:54321'
  const serviceKey =
    Deno.env.get('SUPABASE_SECRET_KEY') ??
    Deno.env.get('SECRET_KEY') ??
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!serviceKey) {
    throw new Error(
      'Missing Supabase admin key for Edge Function. Set SUPABASE_SECRET_KEY (preferred), SECRET_KEY, or SUPABASE_SERVICE_ROLE_KEY.',
    )
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
