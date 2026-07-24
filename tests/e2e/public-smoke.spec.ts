import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

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
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/auth/login')

    const connectButton = page.getByRole('button', { name: /connect with poe account/i })
    await expect(connectButton).toBeVisible()
    const box = await connectButton.boundingBox()
    expect(box).not.toBeNull()
    expect((box?.y ?? Number.POSITIVE_INFINITY) + (box?.height ?? 0)).toBeLessThanOrEqual(844)
  })
})
