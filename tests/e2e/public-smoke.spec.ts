import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './fixture'

const publicRoutes = [
  '/',
  '/auth/login',
  '/preview/analysis',
  '/preview/strategies',
  '/preview/services',
  '/preview/search',
  '/legal/security',
]

test.describe('public application shell', () => {
  for (const route of publicRoutes) {
    test(`${route} renders a stable, accessible viewport`, async ({ page }) => {
      await page.goto(route)
      await expect(page.locator('h1')).toHaveCount(1)

      const viewport = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        currentLinks: document.querySelectorAll('[aria-current="page"]').length,
      }))

      expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth + 1)
      expect(viewport.currentLinks).toBeLessThanOrEqual(1)

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      const seriousViolations = results.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      )
      expect(seriousViolations).toEqual([])
    })
  }

  test('home presents the two acquisition paths', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('link', { name: /try public analysis/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /connect poe account/i })).toBeVisible()
  })

  test('login keeps the OAuth action in the initial mobile viewport', async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem(
        'poe-session-tab',
        JSON.stringify({
          state: {
            sessId: 'must-be-removed',
            cfClearance: 'must-be-removed',
            selectedTabIds: ['currency-tab'],
          },
        }),
      )
      window.localStorage.setItem('poe-session', 'must-be-removed')
    })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/auth/login')

    const connectButton = page.getByRole('button', { name: /connect with poe account/i })
    await expect(connectButton).toBeVisible()
    await expect(page.getByPlaceholder('POESESSID')).toHaveCount(0)
    await expect(page.getByText(/local development transport/i)).toHaveCount(0)
    const box = await connectButton.boundingBox()
    expect(box).not.toBeNull()
    expect((box?.y ?? Number.POSITIVE_INFINITY) + (box?.height ?? 0)).toBeLessThanOrEqual(844)

    const storage = await page.evaluate(() => ({
      legacySession: window.sessionStorage.getItem('poe-session-tab'),
      legacyLocal: window.localStorage.getItem('poe-session'),
      selection: window.sessionStorage.getItem('poe-stash-tab-selection'),
    }))
    expect(storage.legacySession).toBeNull()
    expect(storage.legacyLocal).toBeNull()
    expect(storage.selection).toContain('currency-tab')
    expect(storage.selection).not.toContain('must-be-removed')
  })

  test('login can retry the account handoff and keep the return destination', async ({ page }) => {
    await page.addInitScript(() => {
      const digest = SubtleCrypto.prototype.digest
      SubtleCrypto.prototype.digest = async function (...args) {
        SubtleCrypto.prototype.digest = digest
        if (args[0] === 'SHA-256') throw new Error('Simulated first PKCE failure')
        return digest.apply(this, args)
      }
    })
    await page.route('https://www.pathofexile.com/oauth/authorize?**', (route) => route.fulfill({
      contentType: 'text/html',
      body: '<h1>Mock Path of Exile sign-in</h1>',
    }))
    await page.goto('/auth/login?next=%2Fpreview%2Feconomy')

    const connect = page.getByRole('button', { name: 'Connect with PoE Account' })
    await connect.click()
    await expect(page.getByRole('alert')).toContainText(/could not open path of exile sign-in/i)
    await expect(connect).toBeEnabled()
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('poe-party:post-login-redirect')))
      .toBe('/dashboard/economy')

    await connect.click()
    await expect(page.getByRole('heading', { name: 'Mock Path of Exile sign-in' })).toBeVisible()
    expect(new URL(page.url()).searchParams.get('code_challenge_method')).toBe('S256')
  })
})
