import { assertEquals, assert } from 'jsr:@std/assert@1.0.18'

// Capture the real entrypoint without opening a listener or changing its deployment behavior.
let handler: (request: Request) => Promise<Response>
const originalServe = Deno.serve
try {
  Deno.serve = ((callback: typeof handler) => { handler = callback }) as unknown as typeof Deno.serve
  await import('../poe-oauth-callback/index.ts')
} finally {
  Deno.serve = originalServe
}

const subject = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const ownId = '11111111-1111-4111-8111-111111111111'
const otherId = '22222222-2222-4222-8222-222222222222'
const callbackUrl = 'https://preview.example/auth/callback'

async function runCallback(scenario: 'legacy' | 'rename' | 'insert-race' | 'rejected' | 'invalid-sub') {
  const environment = {
    SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
    SUPABASE_SECRET_KEY: 'synthetic-admin-key',
    POE_CLIENT_ID: 'synthetic-client', POE_CLIENT_SECRET: 'synthetic-secret',
    POE_REDIRECT_URI: callbackUrl, POE_ALLOWED_RETURN_URLS: callbackUrl,
    POE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID: 'test',
    POE_TOKEN_ENCRYPTION_KEYS: JSON.stringify({ test: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }),
  }
  for (const [key, value] of Object.entries(environment)) Deno.env.set(key, value)
  const originalFetch = globalThis.fetch
  const calls: { url: URL; method: string }[] = []
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    calls.push({ url, method })
    const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
    if (url.origin === 'https://www.pathofexile.com' && url.pathname === '/oauth/token') {
      if (scenario === 'rejected') return json({ error: 'invalid_grant' }, 400)
      return json({ username: 'Example#1234', sub: scenario === 'invalid-sub' ? 'bad' : subject, access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', expires_in: 3600 })
    }
    assertEquals(url.origin, 'https://abcdefghijklmnopqrst.supabase.co')
    if (url.pathname === '/rest/v1/users' && method === 'GET') {
      if (url.searchParams.has('poe_account_sub')) return json(scenario === 'rename' ? [{ id: ownId, poe_account_name: 'OldName#1234' }] : [])
      if (url.searchParams.has('poe_account_name')) return json(scenario === 'insert-race' ? [] : [{ id: otherId }])
    }
    if (scenario === 'insert-race') {
      if (url.pathname === '/auth/v1/admin/users' && method === 'POST') return json({ id: ownId, email: `${subject}@oauth.poe.invalid` })
      if (url.pathname === '/rest/v1/users' && method === 'POST') return json({ code: '23505', message: 'synthetic unique collision' }, 409)
      if (url.pathname === `/auth/v1/admin/users/${ownId}` && method === 'DELETE') return json({ id: ownId })
    }
    throw new Error(`Unexpected mocked request: ${method} ${url.pathname}`)
  }) as typeof fetch
  try {
    const response = await handler(new Request('https://abcdefghijklmnopqrst.supabase.co/functions/v1/poe-oauth-callback', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'synthetic-code', state: 'synthetic-state', code_verifier: 'synthetic-verifier', redirect_uri: callbackUrl }),
    }))
    return { response, body: await response.json(), calls }
  } finally {
    globalThis.fetch = originalFetch
    for (const key of Object.keys(environment)) Deno.env.delete(key)
  }
}

for (const scenario of ['legacy', 'rename', 'insert-race'] as const) {
  Deno.test(`verified UUID recovery response for ${scenario} conflict contains no credentials or stored profile IDs`, async () => {
    const { response, body, calls } = await runCallback(scenario)
    assertEquals(response.status, 409)
    assertEquals(response.headers.get('Cache-Control'), 'no-store')
    assertEquals(body, {
      error: 'This Path of Exile account requires a manual identity migration',
      code: 'oauth_identity_migration_required', verified_poe_account_sub: subject,
    })
    assert(!JSON.stringify(body).includes('synthetic-'))
    assert(!JSON.stringify(body).includes(ownId))
    assert(!JSON.stringify(body).includes(otherId))
    assert(!calls.some(({ url }) => url.pathname.includes('poe_oauth_tokens')))
    if (scenario !== 'insert-race') {
      assertEquals(calls.filter(({ method }) => method !== 'GET').map(({ url, method }) => ({ path: url.pathname, method })), [
        { path: '/oauth/token', method: 'POST' },
      ])
    } else {
      assertEquals(calls.filter(({ url }) => url.pathname.startsWith('/auth/')).map(({ method }) => method), ['POST', 'DELETE'])
    }
  })
}

for (const scenario of ['rejected', 'invalid-sub'] as const) {
  Deno.test(`no recovery UUID or database access for ${scenario} provider response`, async () => {
    const { response, body, calls } = await runCallback(scenario)
    assertEquals(response.status, scenario === 'rejected' ? 400 : 502)
    assertEquals('verified_poe_account_sub' in body, false)
    assertEquals(calls.length, 1)
  })
}
