import { expect, test, userId } from './fixture'
import { groupName, mockApp, standardWorkspace } from './ui-data'

test('workspace colors follow the active league through menus and sign-out', async ({ page }) => {
  await mockApp(page, 'poe1', [standardWorkspace])
  await page.route('**/auth/v1/logout*', (route) => route.fulfill({ status: 204 }))
  await page.goto('/dashboard')
  const root = page.locator('html')
  const switcher = page.getByRole('button', { name: /switch group/i })
  const menu = page.getByRole('menu', { name: /switch group/i })
  const primary = page.getByRole('link', { name: 'Browse strategies' })
  await expect(root).toHaveAttribute('data-league-theme', 'covens')
  await expect(root).toHaveAttribute('data-theme', 'dark')
  await expect(primary).toHaveCSS('background-color', 'oklch(0.84072 0.06019 302.471)')

  for (const group of ['Standard Fixture Party', 'PoE2 Fixture Party', groupName]) {
    await switcher.click()
    await menu.getByRole('menuitemradio', { name: group }).click()
    await expect(menu).not.toBeVisible()
    if (group === groupName) {
      await expect(root).toHaveAttribute('data-league-theme', 'covens')
    } else {
      await expect(root).not.toHaveAttribute('data-league-theme', 'covens')
      await expect(primary).toHaveCSS('background-color', 'oklch(0.85017 0.05934 171.581)')
    }
  }

  await switcher.press('ArrowDown')
  await expect(page.locator('.dropdown__popover').filter({ has: menu }))
    .toHaveCSS('background-color', 'oklch(0.30194 0.04401 301.032)')
  await expect(menu.getByRole('menuitemradio').first()).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).not.toBeVisible()
  await expect(switcher).toBeFocused()
  await page.getByRole('button', { name: 'Toggle theme' }).click()
  await expect(root).toHaveAttribute('data-theme', 'light')
  await expect(root).toHaveAttribute('data-league-theme', 'covens')
  await expect(primary).toHaveCSS('background-color', 'oklch(0.39899 0.08371 303.536)')

  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Connect to PoE Party' })).toBeVisible()
  await expect(root).not.toHaveAttribute('data-league-theme', 'covens')
  await expect(root).toHaveAttribute('data-theme', 'light')
})

test('the sample shows Covens without tinting live public tools', async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/preview/economy')
  const root = page.locator('html')
  await expect(root).toHaveAttribute('data-league-theme', 'covens')
  await expect(page.getByText('Covens of Umbra', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Toggle theme' }).click()

  if (testInfo.project.name === 'chromium-mobile') {
    const explore = page.getByRole('button', { name: 'Open explore menu' })
    await explore.tap()
    await page.getByRole('navigation', { name: 'Explore PoE Party on mobile' })
      .getByRole('link', { name: 'Analysis' }).tap()
  } else {
    await page.getByRole('link', { name: 'Try public Analysis' }).click()
  }
  await expect(page).toHaveURL(/\/preview\/analysis\/?$/)
  await expect(root).not.toHaveAttribute('data-league-theme', 'covens')
  await expect(root).toHaveAttribute('data-theme', 'dark')

  await page.getByRole('link', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Connect to PoE Party' })).toBeVisible()
  await expect(root).not.toHaveAttribute('data-league-theme', 'covens')
  await expect(root).toHaveAttribute('data-theme', 'dark')
})

test('the focused chart period stays visible in a short viewport', async ({ page }) => {
  await mockApp(page, 'poe1')
  await page.route('**/rest/v1/group_wealth_history?*', (route) => route.fulfill({
    json: [{
      id: 'fixture-history',
      created_at: '2026-11-19T16:00:00Z',
      total_wealth_chaos: 1240,
      member_count: 1,
      strategy_id: null,
      triggered_by_user_id: userId,
      member_wealth_breakdown: [],
      pricing_summary: null,
    }],
  }))
  await page.setViewportSize({ width: 720, height: 415 })
  await page.goto('/dashboard')
  const period = page.getByRole('button', { name: /wealth history time period/i })
  await period.scrollIntoViewIfNeeded()
  await period.press('Enter')

  const selected = page.getByRole('option', { name: '7 days', exact: true })
  await expect(selected).toBeFocused()
  await expect(selected).toBeInViewport({ ratio: 0.98 })
  await page.keyboard.press('Escape')
  await expect(period).toBeFocused()
})
