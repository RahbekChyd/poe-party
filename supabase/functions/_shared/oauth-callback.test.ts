import { assertEquals, assert } from 'jsr:@std/assert@1.0.18'

// Exercise the real deployed entrypoint without opening a listener.
let handler: (request: Request) => Promise<Response>
const originalServe = Deno.serve
try {
  Deno.serve = ((callback: typeof handler) => { handler = callback }) as unknown as typeof Deno.serve
  await import('../poe-oauth-callback/index.ts')
} finally {
  Deno.serve = originalServe
}

const subject = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const differentSubject = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff'
const ownId = '11111111-1111-4111-8111-111111111111'
const legacyId = '22222222-2222-4222-8222-222222222222'
const winnerId = '33333333-3333-4333-8333-333333333333'
const accountName = 'Example#1234'
const callbackUrl = 'https://preview.example/auth/callback'
type Profile = { id: string; poe_account_name: string; poe_account_sub: string | null; poe_token_expires_at?: string }
type AuthUser = { id: string; email: string; app_metadata: Record<string, unknown>; user_metadata: Record<string, unknown> }
type Scenario = 'fresh' | 'repeat' | 'rename' | 'trusted-conflict' | 'auth-winner' | 'profile-winner' |
  'insert-committed-lost' | 'insert-uncertain' | 'insert-rejected' | 'auth-orphan' | 'rejected' | 'invalid-sub' | 'invalid-expiry'

function fixture(scenario: Scenario) {
  const profiles: Profile[] = [{ id: legacyId, poe_account_name: accountName, poe_account_sub: null }]
  const authUsers = new Map<string, AuthUser>()
  const auth = (id: string, name: string, sub: string | null): AuthUser => ({
    id, email: `${id}@fixture.invalid`, app_metadata: sub ? { poe_account_sub: sub, identity_provider: 'pathofexile' } : {}, user_metadata: { poe_account_name: name },
  })
  authUsers.set(legacyId, auth(legacyId, accountName, null))
  if (scenario === 'rename' || scenario === 'trusted-conflict') {
    profiles.push({ id: ownId, poe_account_name: 'OldName#1234', poe_account_sub: subject })
    authUsers.set(ownId, auth(ownId, 'OldName#1234', scenario === 'trusted-conflict' ? differentSubject : subject))
    // Another verified profile can also have the same cached name.
    profiles.push({ id: winnerId, poe_account_name: accountName, poe_account_sub: differentSubject })
    authUsers.set(winnerId, auth(winnerId, accountName, differentSubject))
  }
  const calls: { url: URL; method: string; body: Record<string, unknown> | null }[] = []
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status,
    headers: { 'Content-Type': 'application/json', 'X-Supabase-Api-Version': '2024-01-01' } })
  const addWinner = () => {
    profiles.push({ id: winnerId, poe_account_name: accountName, poe_account_sub: subject })
    authUsers.set(winnerId, auth(winnerId, accountName, subject))
  }
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    const rawBody = typeof init?.body === 'string' ? init.body : null
    const body = rawBody && url.origin !== 'https://www.pathofexile.com' ? JSON.parse(rawBody) as Record<string, unknown> : null
    calls.push({ url, method, body })
    if (url.origin === 'https://www.pathofexile.com' && url.pathname === '/oauth/token') {
      if (scenario === 'rejected') return json({ error: 'invalid_grant' }, 400)
      return json({ username: accountName, sub: scenario === 'invalid-sub' ? 'bad' : subject,
        access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', expires_in: scenario === 'invalid-expiry' ? 1e100 : 3600 })
    }
    assertEquals(url.origin, 'https://abcdefghijklmnopqrst.supabase.co')
    if (url.pathname === '/rest/v1/users' && method === 'GET') {
      // A display name must never be queried to decide account ownership.
      assert(!url.searchParams.has('poe_account_name'))
      const id = url.searchParams.get('id')?.slice(3)
      const sub = url.searchParams.get('poe_account_sub')?.slice(3)
      return json(profiles.filter(profile => id ? profile.id === id : profile.poe_account_sub === sub))
    }
    if (url.pathname === '/auth/v1/admin/users' && method === 'POST') {
      if (scenario === 'auth-winner') { addWinner(); return json({ code: 'email_exists', msg: 'Concurrent signup' }, 422) }
      if (scenario === 'auth-orphan') return json({ code: 'email_exists', msg: 'Existing canonical email' }, 422)
      const created = { ...auth(ownId, accountName, subject), email: String(body?.email) }
      authUsers.set(ownId, created)
      return json(created)
    }
    if (url.pathname === '/rest/v1/users' && method === 'POST') {
      if (scenario === 'profile-winner') { addWinner(); return json({ code: '23505', message: 'UUID collision' }, 409) }
      if (scenario === 'insert-rejected') return json({ code: '23505', message: 'Definitive constraint rejection' }, 409)
      if (scenario !== 'insert-uncertain') profiles.push(body as unknown as Profile)
      return scenario === 'insert-committed-lost' || scenario === 'insert-uncertain'
        ? json({ code: 'PGRST000', message: 'Uncertain response' }, 400) : new Response(null, { status: 201 })
    }
    const authId = /^\/auth\/v1\/admin\/users\/([^/]+)$/.exec(url.pathname)?.[1]
    if (authId) {
      if (method === 'GET') return authUsers.has(authId) ? json(authUsers.get(authId)) : json({ msg: 'Not found' }, 404)
      if (method === 'PUT') {
        const current = authUsers.get(authId)
        assert(current)
        Object.assign(current, body)
        return json(current)
      }
      if (method === 'DELETE') {
        assertEquals(authId, ownId)
        assert(!profiles.some(profile => profile.id === authId), 'Cleanup must never delete an adopted profile or a concurrent winner')
        authUsers.delete(authId)
        return json({ id: authId })
      }
    }
    if (url.pathname === '/rest/v1/users' && method === 'PATCH') {
      const id = url.searchParams.get('id')?.slice(3)
      const profile = profiles.find(profile => profile.id === id)
      assert(profile && id !== legacyId)
      Object.assign(profile, body)
      return new Response(null, { status: 204 })
    }
    if (url.pathname === '/rest/v1/poe_oauth_tokens' && method === 'POST') {
      assert(body?.user_id !== legacyId)
      assertEquals(body?.access_token, null); assertEquals(body?.refresh_token, null)
      assert(!JSON.stringify(body).includes('synthetic-access') && !JSON.stringify(body).includes('synthetic-refresh'))
      return new Response(null, { status: 201 })
    }
    if (url.pathname === '/auth/v1/admin/generate_link' && method === 'POST') {
      return json({ action_link: 'https://abcdefghijklmnopqrst.supabase.co/auth/v1/verify?token=synthetic-action', email: body?.email })
    }
    throw new Error(`Unexpected mocked request: ${method} ${url.pathname}`)
  }
  return { profiles, authUsers, calls, fetchImpl }
}

async function runCallback<T>(scenario: Scenario, check: (result: { response: Response; body: Record<string, unknown>; state: ReturnType<typeof fixture>; again: () => Promise<{ response: Response; body: Record<string, unknown> }> }) => Promise<T> | T) {
  const state = fixture(scenario)
  const environment = {
    SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', SUPABASE_SECRET_KEY: 'synthetic-admin-key',
    POE_CLIENT_ID: 'synthetic-client', POE_CLIENT_SECRET: 'synthetic-secret', POE_REDIRECT_URI: callbackUrl, POE_ALLOWED_RETURN_URLS: callbackUrl,
    POE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID: 'test', POE_TOKEN_ENCRYPTION_KEYS: JSON.stringify({ test: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }),
  }
  for (const [key, value] of Object.entries(environment)) Deno.env.set(key, value)
  const originalFetch = globalThis.fetch
  globalThis.fetch = state.fetchImpl as typeof fetch
  const invoke = async () => {
    const response = await handler(new Request('https://abcdefghijklmnopqrst.supabase.co/functions/v1/poe-oauth-callback', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'synthetic-code', state: 'synthetic-state', code_verifier: 'synthetic-verifier', redirect_uri: callbackUrl }),
    }))
    return { response, body: await response.json() as Record<string, unknown> }
  }
  try { return await check({ ...await invoke(), state, again: invoke }) }
  finally {
    globalThis.fetch = originalFetch
    for (const key of Object.keys(environment)) Deno.env.delete(key)
  }
}

Deno.test('fresh verified UUID gets a new profile despite a same-name legacy row; repeat login preserves the new UUID owner', async () => {
  await runCallback('repeat', async ({ response, body, state, again }) => {
    assertEquals(response.status, 200); assertEquals(body.is_new_profile, true)
    assertEquals(body.user, { id: ownId, poe_account_name: accountName })
    assertEquals(state.profiles.find(profile => profile.id === legacyId), { id: legacyId, poe_account_name: accountName, poe_account_sub: null })
    assertEquals(state.authUsers.get(legacyId)?.app_metadata, {})
    const repeated = await again()
    assertEquals(repeated.response.status, 200); assertEquals(repeated.body.is_new_profile, false)
    assertEquals(repeated.body.user, body.user)
    assertEquals(state.calls.filter(call => call.url.pathname === '/auth/v1/admin/users' && call.method === 'POST').length, 1)
    assertEquals(state.profiles.length, 2)
    assertEquals(response.headers.get('Cache-Control'), 'no-store')
    assert(!JSON.stringify(body).includes('synthetic-access') && !JSON.stringify(body).includes('synthetic-refresh'))
  })
})

Deno.test('a verified UUID may rename to a display name used by legacy and other verified profiles', async () => {
  await runCallback('rename', ({ response, body, state }) => {
    assertEquals(response.status, 200); assertEquals(body.is_new_profile, false)
    assertEquals(state.profiles.find(profile => profile.id === ownId)?.poe_account_name, accountName)
    assertEquals(state.profiles.find(profile => profile.id === winnerId)?.poe_account_sub, differentSubject)
    assert(!state.calls.some(call => call.url.pathname === '/auth/v1/admin/users' && call.method === 'POST'))
  })
})

Deno.test('conflicting trusted Auth subject refuses before profile, metadata or token writes', async () => {
  await runCallback('trusted-conflict', ({ response, body, state }) => {
    assertEquals(response.status, 409); assertEquals(body.code, 'oauth_identity_conflict')
    assertEquals(state.profiles.find(profile => profile.id === ownId)?.poe_account_name, 'OldName#1234')
    assertEquals(state.calls.filter(call => call.method !== 'GET').map(call => call.url.pathname), ['/oauth/token'])
  })
})

for (const scenario of ['auth-winner', 'profile-winner'] as const) {
  Deno.test(`parallel ${scenario} reuses only the immutable UUID winner`, async () => {
    await runCallback(scenario, ({ response, body, state }) => {
      assertEquals(response.status, 200); assertEquals(body.is_new_profile, false)
      assertEquals(body.user, { id: winnerId, poe_account_name: accountName })
      assertEquals(state.profiles.find(profile => profile.id === legacyId)?.poe_account_sub, null)
      assert(!state.calls.some(call => call.method === 'DELETE' && call.url.pathname.endsWith(winnerId)))
    })
  })
}

Deno.test('a successful profile insert with a lost response is adopted without Auth cascade cleanup', async () => {
  await runCallback('insert-committed-lost', ({ response, body, state }) => {
    assertEquals(response.status, 200); assertEquals(body.is_new_profile, true)
    assertEquals(body.user, { id: ownId, poe_account_name: accountName })
    assert(!state.calls.some(call => call.method === 'DELETE'))
  })
})

Deno.test('an uncertain insert with no visible profile never deletes the new Auth user', async () => {
  await runCallback('insert-uncertain', ({ response, state }) => {
    assertEquals(response.status, 500)
    assert(!state.calls.some(call => call.method === 'DELETE'))
    assert(!state.calls.some(call => call.url.pathname.includes('poe_oauth_tokens')))
  })
})

Deno.test('definitive SQL rejection without UUID winner cleans only the confirmed new orphan and returns a controlled conflict', async () => {
  await runCallback('insert-rejected', ({ response, body, state }) => {
    assertEquals(response.status, 409); assertEquals(body.code, 'oauth_sign_in_conflict')
    assertEquals(state.calls.filter(call => call.method === 'DELETE').map(call => call.url.pathname), [`/auth/v1/admin/users/${ownId}`])
    assert(!('verified_poe_account_sub' in body))
  })
})

Deno.test('canonical email without a UUID-owned profile is not adopted as identity proof', async () => {
  await runCallback('auth-orphan', ({ response, body, state }) => {
    assertEquals(response.status, 409); assertEquals(body.code, 'oauth_sign_in_conflict')
    assert(!state.calls.some(call => call.method === 'PUT' || call.method === 'PATCH' || call.method === 'DELETE'))
    assert(!state.calls.some(call => call.url.pathname.includes('poe_oauth_tokens')))
  })
})

for (const scenario of ['rejected', 'invalid-sub', 'invalid-expiry'] as const) {
  Deno.test(`no profile or Auth access for ${scenario} provider response`, async () => {
    await runCallback(scenario, ({ response, body, state }) => {
      assertEquals(response.status, scenario === 'rejected' ? 400 : 502)
      assertEquals('verified_poe_account_sub' in body, false)
      assertEquals(state.calls.length, 1)
    })
  })
}
