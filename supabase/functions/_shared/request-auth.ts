import { createClient, type User } from 'https://esm.sh/@supabase/supabase-js@2.110.7'
import { corsHeaders } from './cors.ts'

function createRequestClient(authorization: string) {
  const url =
    Deno.env.get('SUPABASE_URL') ??
    Deno.env.get('API_URL') ??
    'http://127.0.0.1:54321'
  const anonKey =
    Deno.env.get('SUPABASE_ANON_KEY') ??
    Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ??
    Deno.env.get('ANON_KEY')

  if (!anonKey) {
    throw new Error('Missing Supabase anon key for request authentication')
  }

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: authorization,
      },
    },
  })
}

export async function requireAuthenticatedUser(req: Request): Promise<User | Response> {
  const authorization = req.headers.get('Authorization')
  if (!authorization) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const client = createRequestClient(authorization)
  const {
    data: { user },
    error,
  } = await client.auth.getUser()

  if (error || !user) {
    return new Response(JSON.stringify({ error: 'Invalid user session' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return user
}
