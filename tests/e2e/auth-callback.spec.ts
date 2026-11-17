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
