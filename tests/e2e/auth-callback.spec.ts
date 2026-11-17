import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const callbackPath = '/auth/callback?code=synthetic-code&state=synthetic-state'

async function seedOAuth(page: import('@playwright/test').Page, verifier = true) {
  await page.addInitScript((includeVerifier) => {
    window.sessionStorage.setItem('poe_oauth_state', 'synthetic-state')
    if (includeVerifier) window.sessionStorage.setItem('poe_oauth_code_verifier', 'synthetic-verifier')
  }, verifier)
}

async function expectClearedOAuth(page: import('@playwright/test').Page) {
  expect(await page.evaluate(() => ({
    state: sessionStorage.getItem('poe_oauth_state'),
    verifier: sessionStorage.getItem('poe_oauth_code_verifier'),
  }))).toEqual({ state: null, verifier: null })
}

test('pending callback becomes an actionable recovery error without a spinner', async ({ page }, testInfo) => {
  await seedOAuth(page)
  let releaseRequest!: () => void
  const release = new Promise<void>((resolve) => { releaseRequest = resolve })
  await page.route('**/functions/v1/poe-oauth-callback', async (route) => {
    await release
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        error: 'This Path of Exile account requires a manual identity migration',
        code: 'oauth_identity_migration_required',
        verified_poe_account_sub: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      }),
    })
  })
  await page.goto(callbackPath)
  await expect(page.getByLabel('Completing sign-in')).toBeVisible()
  await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'true')
  releaseRequest()
  await expect(page.getByRole('heading', { name: 'Account recovery needed' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Your existing data is retained.')
  await expect(page.getByLabel('Completing sign-in')).toHaveCount(0)
  await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByRole('link', { name: 'Contact support' })).toHaveAttribute('href', 'mailto:support@poe-party.com')
  await expect(page.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/auth/login')
  await expect(page.getByText('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')).toHaveCount(0)
  await expectClearedOAuth(page)
  const viewport = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: document.documentElement.clientWidth }))
  expect(viewport.scroll).toBeLessThanOrEqual(viewport.width + 1)
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(accessibility.violations.filter((issue) => issue.impact === 'critical' || issue.impact === 'serious')).toEqual([])
  await page.screenshot({ path: testInfo.outputPath('identity-recovery.png'), fullPage: true })
  await page.getByRole('link', { name: 'Back to sign in' }).click()
  await expect(page.getByRole('button', { name: /connect with poe account/i })).toBeVisible()
})

test('provider denial clears OAuth state and offers a new sign-in', async ({ page }) => {
  await seedOAuth(page)
  await page.goto('/auth/callback?error=access_denied&error_description=Authorization%20was%20cancelled')
  await expect(page.getByRole('alert')).toHaveText('Authorization was cancelled')
  await expect(page.getByLabel('Completing sign-in')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Back to sign in' })).toBeVisible()
  await expectClearedOAuth(page)
})

test('invalid callback state never exchanges the code and offers a new sign-in', async ({ page }) => {
  await seedOAuth(page)
  let exchangeCalls = 0
  await page.route('**/functions/v1/poe-oauth-callback', (route) => { exchangeCalls += 1; return route.abort() })
  await page.goto('/auth/callback?code=synthetic-code&state=wrong-state')
  await expect(page.getByRole('alert')).toContainText('Please start the login flow again.')
  await expect(page.getByLabel('Completing sign-in')).toHaveCount(0)
  await expectClearedOAuth(page)
  expect(exchangeCalls).toBe(0)
})

test('a missing session link is a terminal error', async ({ page }) => {
  await seedOAuth(page)
  await page.route('**/functions/v1/poe-oauth-callback', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: '{}',
  }))
  await page.goto(callbackPath)
  await expect(page.getByRole('alert')).toContainText('No portal opened')
  await expect(page.getByLabel('Completing sign-in')).toHaveCount(0)
  await expectClearedOAuth(page)
})

test('a callback without a session offers a new sign-in', async ({ page }) => {
  await seedOAuth(page)
  await page.goto('/auth/callback')
  await expect(page.getByRole('alert')).toContainText('Please start the login flow again.')
  await expect(page.getByLabel('Completing sign-in')).toHaveCount(0)
  await expectClearedOAuth(page)
})

test('unexpected browser failures show a generic terminal error', async ({ page }) => {
  await seedOAuth(page)
  await page.addInitScript(() => {
    const readStorage = Storage.prototype.getItem
    Storage.prototype.getItem = function (key: string) {
      if (key === 'poe_oauth_state') throw new Error('private failure details')
      return readStorage.call(this, key)
    }
  })
  await page.goto(callbackPath)
  await expect(page.getByRole('alert')).toHaveText('Unable to finish signing in. Please start the login flow again.')
  await expect(page.getByText('private failure details')).toHaveCount(0)
  await expect(page.getByLabel('Completing sign-in')).toHaveCount(0)
  // This test intentionally makes state reads unavailable; removal still succeeds.
  expect(await page.evaluate(() => sessionStorage.getItem('poe_oauth_code_verifier'))).toBeNull()
})

const newUserId = '11111111-1111-4111-8111-111111111111'
const anotherUserId = '22222222-2222-4222-8222-222222222222'

function syntheticAccessToken(userId: string) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.synthetic-signature`
}

async function mockVerifiedUser(page: import('@playwright/test').Page, userId = newUserId) {
  let verificationRequests = 0
  await page.route('**/auth/v1/user', async (route) => {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type, x-supabase-api-version',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    }
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    verificationRequests += 1
    return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({
      id: userId, aud: 'authenticated', role: 'authenticated', email: 'synthetic@example.invalid',
      app_metadata: { identity_provider: 'pathofexile' }, user_metadata: {}, created_at: new Date().toISOString(),
    }) })
  })
  return () => verificationRequests
}

async function mockSessionLink(page: import('@playwright/test').Page, isNewProfile: boolean) {
  await seedOAuth(page)
  await page.addInitScript(() => {
    sessionStorage.setItem('poe-party:post-login-redirect', '/legal/security')
  })
  await page.route('**/functions/v1/poe-oauth-callback', (route) => {
    const callback = new URL('/auth/callback', new URL(route.request().headers().origin ?? 'http://127.0.0.1:4183'))
    callback.hash = new URLSearchParams({ access_token: syntheticAccessToken(newUserId), refresh_token: 'synthetic-refresh',
      expires_in: '3600', token_type: 'bearer', type: 'magiclink' }).toString()
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({
      magic_link: callback.toString(), is_new_profile: isNewProfile, user: { id: newUserId, poe_account_name: 'Synthetic#1234' },
    }) })
  })
}

test('fresh profile sign-in verifies the same user before showing an accessible first-login notice', async ({ page }, testInfo) => {
  const verificationCount = await mockVerifiedUser(page)
  await mockSessionLink(page, true)
  await page.goto(callbackPath)
  await expect(page.getByRole('heading', { name: 'Your new profile is ready' })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('groups, history and Supporter access from an older profile are not transferred automatically')
  await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByLabel('Completing sign-in')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Continue to PoE Party' })).toHaveAttribute('href', '/legal/security')
  await expect(page.getByRole('link', { name: 'Contact support' })).toHaveAttribute('href', 'mailto:support@poe-party.com')
  expect(verificationCount()).toBeGreaterThanOrEqual(2)
  expect(await page.evaluate(() => sessionStorage.getItem('poe_new_profile_notice'))).toBeNull()
  await expect(page.getByText(newUserId)).toHaveCount(0)
  const viewport = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: document.documentElement.clientWidth }))
  expect(viewport.scroll).toBeLessThanOrEqual(viewport.width + 1)
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(accessibility.violations.filter((issue) => issue.impact === 'critical' || issue.impact === 'serious')).toEqual([])
  await page.screenshot({ path: testInfo.outputPath('new-profile-ready.png'), fullPage: true })
  await page.getByRole('link', { name: 'Continue to PoE Party' }).click()
  await expect(page).toHaveURL(/\/legal\/security$/)
})

test('existing verified profile sign-in keeps its automatic redirect and never shows a fresh-profile notice', async ({ page }) => {
  await mockVerifiedUser(page)
  await mockSessionLink(page, false)
  await page.goto(callbackPath)
  await expect(page).toHaveURL(/\/legal\/security$/)
  await expect(page.getByRole('heading', { name: 'Your new profile is ready' })).toHaveCount(0)
  expect(await page.evaluate(() => sessionStorage.getItem('poe_new_profile_notice'))).toBeNull()
})

test('a notice never crosses to a different verified account', async ({ page }) => {
  await mockVerifiedUser(page, anotherUserId)
  await mockSessionLink(page, true)
  await page.goto(callbackPath)
  await expect(page).toHaveURL(/\/legal\/security$/)
  await expect(page.getByRole('heading', { name: 'Your new profile is ready' })).toHaveCount(0)
  expect(await page.evaluate(() => sessionStorage.getItem('poe_new_profile_notice'))).toBeNull()
})

test('unavailable notice storage does not block a verified sign-in', async ({ page }) => {
  await mockVerifiedUser(page)
  await mockSessionLink(page, true)
  await page.addInitScript(() => {
    const originalSet = Storage.prototype.setItem
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'poe_new_profile_notice') throw new Error('Notice storage unavailable')
      return originalSet.call(this, key, value)
    }
  })
  await page.goto(callbackPath)
  await expect(page).toHaveURL(/\/legal\/security$/)
  await expect(page.getByRole('heading', { name: 'Your new profile is ready' })).toHaveCount(0)
})

test('a failed Auth-server verification never displays the new-profile success notice', async ({ page }) => {
  let verificationRequests = 0
  await mockSessionLink(page, true)
  await page.route('**/auth/v1/user', (route) => {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type, x-supabase-api-version', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    verificationRequests += 1
    if (verificationRequests > 1) return route.fulfill({ status: 401, contentType: 'application/json', headers, body: JSON.stringify({ code: 'bad_jwt', message: 'Synthetic verification refusal' }) })
    return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ id: newUserId, aud: 'authenticated', role: 'authenticated',
      email: 'synthetic@example.invalid', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }) })
  })
  await page.goto(callbackPath)
  await expect(page.getByRole('alert')).toHaveText('Unable to verify your sign-in. Please start the login flow again.')
  await expect(page.getByRole('heading', { name: 'Your new profile is ready' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Continue to PoE Party' })).toHaveCount(0)
  expect(await page.evaluate(() => sessionStorage.getItem('poe_new_profile_notice'))).toBeNull()
})
