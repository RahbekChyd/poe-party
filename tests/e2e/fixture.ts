import { test as base, type Page } from '@playwright/test'

export const userId = '10000000-0000-0000-0000-000000000001'
export const groupId = '20000000-0000-0000-0000-000000000001'
export const user = {
  id: userId,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'fixture@example.invalid',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-11-18T00:00:00Z',
}

export async function seedSignedIn(page: Page, activeGroupId: string | null = groupId) {
  await page.addInitScript(({ user, activeGroupId }) => {
    sessionStorage.setItem('sb-127-auth-token', JSON.stringify({
      access_token: 'fixture-access',
      refresh_token: 'fixture-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      expires_in: 3600,
      token_type: 'bearer',
      user,
    }))
    if (activeGroupId && !localStorage.getItem('poe-group-tool:active-group')) {
      localStorage.setItem('poe-group-tool:active-group', JSON.stringify({
        state: { activeGroupId },
        version: 0,
      }))
    }
  }, { user, activeGroupId })
  await page.route('**/auth/v1/user', (route) => route.fulfill({ json: user }))
}

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+WsqQAAAAASUVORK5CYII=',
  'base64',
)

export const test = base.extend<{ localNetwork: void }>({
  localNetwork: [async ({ context, baseURL }, use) => {
    await context.route('**/*', (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.origin === baseURL) {
        if (url.pathname.startsWith('/api/')) {
          return route.fulfill({ status: 503, json: { message: 'No market data fixture' } })
        }
        return route.continue()
      }
      if (url.origin === 'http://127.0.0.1:45121') {
        if (url.pathname.startsWith('/rest/v1/')) {
          return route.fulfill({ json: [] })
        }
        if (url.pathname === '/functions/v1/poe-public-leagues') {
          const game = request.postDataJSON()?.game
          const league = game === 'poe2' ? 'Fixture League 2' : 'Covens'
          return route.fulfill({ json: { leagues: [{ id: league }, { id: 'Standard' }] } })
        }
        return route.fulfill({ status: 401, json: { message: 'No session fixture' } })
      }
      if (request.resourceType() === 'image') {
        return route.fulfill({ contentType: 'image/png', body: pixel })
      }
      return route.abort('blockedbyclient')
    })
    await use()
  }, { auto: true }],
})

export { expect } from '@playwright/test'
