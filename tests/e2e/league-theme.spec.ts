import { expect, test, userId } from './fixture'
import { groupName, mockApp, standardWorkspace } from './ui-data'

test('workspace colors follow the active league through menus and sign-out', async ({ page }) => {
  const savedPreference = JSON.stringify({ state: { theme: 'light' }, version: 0 })
  await page.emulateMedia({ colorScheme: 'light' })
  await page.addInitScript((preference) => {
    if (localStorage.getItem('theme') === null) localStorage.setItem('theme', preference)
  }, savedPreference)
  await mockApp(page, 'poe1', [standardWorkspace], { profileTheme: 'light' })
  const profileRequests: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname === '/rest/v1/users') profileRequests.push(request.method() + ' ' + url.search)
  })
  await page.route('**/auth/v1/logout*', (route) => route.fulfill({ status: 204 }))
  await page.goto('/dashboard')
  const root = page.locator('html')
  const switcher = page.getByRole('button', { name: /switch group/i })
  const menu = page.getByRole('menu', { name: /switch group/i })
  const primary = page.getByRole('link', { name: 'Browse strategies' })
  await expect(root).toHaveAttribute('data-league-theme', 'covens')
  await expect(root).toHaveAttribute('data-theme', 'dark')
  await expect(primary).toHaveCSS('background-color', 'rgb(154, 204, 241)')
  await expect(page.getByRole('button', { name: 'Toggle theme' })).toHaveCount(0)

  for (const group of ['Standard Fixture Party', 'PoE2 Fixture Party', groupName]) {
    await switcher.click()
    await menu.getByRole('menuitemradio', { name: group }).click()
    await expect(menu).not.toBeVisible()
    if (group === groupName) {
      await expect(root).toHaveAttribute('data-league-theme', 'covens')
    } else {
      await expect(root).not.toHaveAttribute('data-league-theme', 'covens')
      await expect(primary).toHaveCSS('background-color', 'rgb(210, 180, 132)')
    }
  }

  await switcher.press('ArrowDown')
  await expect(page.locator('.dropdown__popover').filter({ has: menu }))
    .toHaveCSS('background-color', 'rgb(43, 35, 28)')
  await expect(menu.getByRole('menuitemradio').first()).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).not.toBeVisible()
  await expect(switcher).toBeFocused()
  await expect(root).toHaveAttribute('data-theme', 'dark')
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe(savedPreference)
  expect(profileRequests.length).toBeGreaterThan(0)
  expect(profileRequests.every((request) => request.startsWith('GET ') && !request.includes('theme'))).toBe(true)

  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Connect to PoE Party' })).toBeVisible()
  await expect(root).toHaveAttribute('data-league-theme', 'covens')
  await expect(root).toHaveAttribute('data-theme', 'dark')
})

test('the sample shows Covens without tinting live public tools', async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/preview/economy')
  const root = page.locator('html')
  await expect(root).toHaveAttribute('data-league-theme', 'covens')
  await expect(page.getByText('Covens of Umbra', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Toggle theme' })).toHaveCount(0)

  if (testInfo.project.name === 'chromium-mobile') {
    const explore = page.getByRole('button', { name: 'Open explore menu' })
    await explore.tap()
    await page.getByRole('navigation', { name: 'Explore PoE Party on mobile' })
      .getByRole('link', { name: 'Analysis' }).tap()
  } else {
    await page.getByRole('navigation', { name: 'Workspace sample', exact: true })
      .getByRole('link', { name: 'Analysis', exact: true }).press('Enter')
  }
  await expect(page).toHaveURL(/\/preview\/analysis\/?$/)
  await expect(root).not.toHaveAttribute('data-league-theme', 'covens')
  await expect(root).toHaveAttribute('data-theme', 'dark')

  await page.getByRole('link', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Connect to PoE Party' })).toBeVisible()
  await expect(root).toHaveAttribute('data-league-theme', 'covens')
  await expect(root).toHaveAttribute('data-theme', 'dark')
})

test('the featured scene follows entry routes and clears on a trust page', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.route('**/covens-ground*.webp', (route) => route.abort())
  await page.goto('/')
  const root = page.locator('html')
  await expect(root).toHaveAttribute('data-league-theme', 'covens')
  await expect(root).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByTestId('home-hero-analysis-cta')).toBeInViewport()
  await page.getByTestId('home-hero-connect-cta').click()
  await expect(root).toHaveAttribute('data-league-theme', 'covens')
  await expect(page.getByRole('button', { name: 'Connect with PoE Account' })).toBeInViewport()
  await page.getByRole('link', { name: 'Privacy', exact: true }).click()
  await expect(page).toHaveURL(/\/legal\/privacy\/?$/)
  await expect(root).not.toHaveAttribute('data-league-theme')
  await expect(root).toHaveAttribute('data-theme', 'dark')
})

test('initial HTML declares dark before scripts run', async ({ request }) => {
  for (const path of ['/', '/auth/login', '/dashboard/economy', '/preview', '/preview/analysis', '/legal/privacy']) {
    const response = await request.get(path)
    expect(response.ok()).toBe(true)
    const html = await response.text()
    expect(html).toMatch(/<html\b[^>]*class="dark"[^>]*data-theme="dark"/)
    expect(html).toContain('<meta name="color-scheme" content="dark"')
  }
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
