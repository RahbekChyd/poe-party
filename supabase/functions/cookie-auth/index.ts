import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

// Derives the same internal email the frontend uses so they stay in sync.
function deriveEmail(accountName: string): string {
  const slug = accountName.toLowerCase().replace(/[^a-z0-9]/g, '_')
  return `${slug}@cookie.poe-party.app`
}

const PASSWORD = 'poe-party-cookie-auth-v1'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const { accountName } = await req.json()
  if (!accountName) {
    return new Response(JSON.stringify({ error: 'accountName is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl =
    Deno.env.get('SUPABASE_URL') ??
    Deno.env.get('API_URL') ??
    'http://127.0.0.1:54321'
  const adminKey =
    Deno.env.get('SUPABASE_SECRET_KEY') ??
    Deno.env.get('SECRET_KEY') ??
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!adminKey) {
    return new Response(JSON.stringify({
      error:
        'Missing Supabase admin key. Set SUPABASE_SECRET_KEY (preferred), SECRET_KEY, or SUPABASE_SERVICE_ROLE_KEY.',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const admin = createClient(supabaseUrl, adminKey)

  const email = deriveEmail(accountName)

  // Admin createUser bypasses the MX-record email validation that blocks signUp.
  // email_confirm: true means the user can sign in immediately.
  const { error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  })

  // "User already registered" is fine — just means returning user.
  if (error && !error.message.toLowerCase().includes('already been registered')) {
    return new Response(JSON.stringify({
      error: error.message || 'createUser failed',
      status: error.status ?? null,
      name: error.name ?? null,
      code: 'code' in error ? error.code : null,
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
