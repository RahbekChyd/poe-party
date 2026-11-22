import type { Page } from '@playwright/test'
import { expect, groupId, test, userId } from './fixture'
import { gearId, mockApp, profileId, runMapStrategyName, serviceId, strategyId } from './ui-data'

const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
]

async function expectContained(page: Page) {
  for (const area of [page.locator('html'), page.getByRole('main')]) {
    await expect.poll(() => area.evaluate((node) => node.scrollWidth - node.clientWidth))
      .toBeLessThanOrEqual(1)
  }
}

for (const mode of ['signed-in', 'sample'] as const) {
  test(`${mode} run summary and Economy reflow across widths`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Exercises CSS breakpoints in one context')
    if (mode === 'signed-in') await mockApp(page, 'poe1', [], { runMapResult: 'complete' })
    const base = mode === 'signed-in' ? '/dashboard' : '/preview'
    const overview = mode === 'signed-in' ? 'Today' : 'Overview'
    const nav = page.getByRole('navigation', { name: mode === 'signed-in' ? 'Primary dashboard' : 'Workspace sample', exact: true })
    const root = page.locator('html')

    for (const [path, heading] of [[base, overview], [`${base}/economy`, 'Economy']]) {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: heading, exact: true, level: 1 })).toBeVisible()
      await expect(root).toHaveAttribute('data-theme', 'dark')
      for (const viewport of viewports) {
        await test.step(`${heading} at ${viewport.width}px`, async () => {
          await page.setViewportSize(viewport)
          await expect(nav).toBeInViewport({ ratio: 0.99 })
          if (viewport.width >= 1024) {
            await expect(nav.getByRole('link', { name: heading, exact: true })).toHaveAttribute('aria-current', 'page')
            await expect(nav.getByRole('link')).toHaveCount(8)
          }
          if (heading === overview) {
            const run = page.getByRole('region', { name: 'Run summary', exact: true })
            const strategy = run.locator('.run-summary__strategy')
            const result = run.locator('.run-summary__result')
            await expect(strategy).toContainText(runMapStrategyName)
            await expect(result).toContainText('Latest linked snapshot')
            await expect(result).toContainText('1,960c')
            const action = result.getByRole('link', { name: 'View strategy results', exact: true })
            await expect(action).toBeVisible()
            const strategyBox = (await strategy.boundingBox())!
            const resultBox = (await result.boundingBox())!
            if (viewport.width >= 1024) {
              expect(resultBox.x).toBeGreaterThan(strategyBox.x)
              await expect(run).toBeInViewport({ ratio: 0.99 })
              await expect(action).toBeInViewport({ ratio: 0.99 })
            } else if (viewport.width <= 390) {
              expect(resultBox.y).toBeGreaterThan(strategyBox.y)
              expect(resultBox.x).toBe(strategyBox.x)
            }
          } else {
            await expect(page.getByRole('button', { name: 'Snapshot stash', exact: true })).toBeVisible()
            const member = page.getByRole('row', { name: mode === 'signed-in' ? /Fixture Player/ : /Iris Vale/ })
            await expect(member.getByRole('cell', { name: mode === 'signed-in' ? /1,960c/ : /6,480c/ }).first()).toBeVisible()
          }
          await expectContained(page)
        })
      }
    }

    for (const viewport of [viewports[1], viewports[4]]) {
      await page.setViewportSize(viewport)
      await page.goto(base)
      const run = page.getByRole('region', { name: 'Run summary', exact: true })
      await run.getByRole('link', { name: 'View strategy results', exact: true }).press('Enter')
      await expect(page).toHaveURL(/#strategy-results$/)
      await expect(page.locator('#strategy-results')).toBeInViewport()

      const nextDestination = mode === 'signed-in' ? 'Today' : 'Gear'
      await nav.getByRole('link', { name: nextDestination, exact: true }).click()
      await expect(page.getByRole('heading', { name: nextDestination, exact: true, level: 1 })).toBeInViewport()
    }
  })
}

test('desktop sidebar links reach each dashboard destination', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Exercises the desktop sidebar')
  await mockApp(page, 'poe1')
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.goto('/dashboard')
  const nav = page.getByRole('navigation', { name: 'Primary dashboard', exact: true })
  for (const [name, path] of [
    ['Strategies', 'strategies'],
    ['Economy', 'economy'],
    ['Analysis', 'analysis'],
    ['Gear Planning', 'gear'],
    ['Members', 'members'],
    ['Directory', 'search'],
    ['Services', 'services'],
    ['Today', ''],
  ]) {
    const stop = nav.getByRole('link', { name, exact: true })
    await expect(stop).toBeInViewport({ ratio: 0.99 })
    await stop.click()
    await expect(page).toHaveURL(new RegExp(`/dashboard${path ? `/${path}` : ''}/?$`))
    await expect(stop).toHaveAttribute('aria-current', 'page')
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1)
  }
})

for (const [name, path] of [
  ['Strategies', `/dashboard/strategies/${strategyId}`],
  ['Strategies', `/dashboard/strategies/public/${strategyId}`],
  ['Economy', '/dashboard/economy/group'],
  ['Economy', `/dashboard/economy/${userId}`],
  ['Gear Planning', `/dashboard/gear/${gearId}`],
  ['Services', `/dashboard/services/${serviceId}`],
  ['Directory', `/dashboard/search/groups/${groupId}`],
  ['Directory', `/dashboard/search/characters/${profileId}`],
  ['Strategies', `/preview/strategies/${strategyId}`],
  ['Directory', `/preview/search/groups/${groupId}`],
]) {
  test(`${path} selects ${name} in the desktop sidebar`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Exercises the desktop sidebar')
    const isDashboard = path.startsWith('/dashboard/')
    await mockApp(page, isDashboard ? 'poe1' : 'guest')
    await page.setViewportSize({ width: 1024, height: 768 })
    await page.goto(path)
    const nav = page.getByRole('navigation', { name: isDashboard ? 'Primary dashboard' : 'Workspace sample', exact: true })
    await expect(nav.getByRole('link', { name, exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1)
  })
}

for (const result of [null, 'partial', 'unavailable'] as const) {
  test(`Today shows the appropriate action when a linked snapshot is ${result ?? 'missing'}`, async ({ page }) => {
    await mockApp(page, 'poe1', [], { runMapResult: result })
    await page.goto('/dashboard')
    const run = page.getByRole('region', { name: 'Run summary', exact: true })
    const resultPanel = run.locator('.run-summary__result')
    if (result === null) {
      await expect(run.getByRole('button', { name: 'Snapshot stash', exact: true })).toBeVisible()
    } else {
      await expect(run.getByRole('link', { name: 'View strategy results', exact: true })).toBeVisible()
      if (result === 'partial') {
        await expect(resultPanel).toContainText('Latest linked priced subtotal')
        await expect(resultPanel).toContainText('3 unpriced items')
      } else {
        await expect(resultPanel).toContainText('Pricing unavailable')
      }
    }
    await expectContained(page)
  })
}

test('sidebar links keep their keyboard feedback in forced colors with reduced motion', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Exercises the desktop sidebar')
  await mockApp(page, 'poe1', [], { runMapResult: 'complete' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/dashboard')
  const nav = page.getByRole('navigation', { name: 'Primary dashboard', exact: true })
  const economy = nav.getByRole('link', { name: 'Economy', exact: true })
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' })
  const transitionTime = () => economy.evaluate((node) => parseFloat(getComputedStyle(node).transitionDuration))
  await expect.poll(transitionTime).toBeLessThan(0.001)
  await economy.focus()
  await expect(economy).toBeFocused()
  await expect(economy).toHaveCSS('outline-style', /solid|auto/)
  await economy.press('Enter')
  await expect(economy).toHaveAttribute('aria-current', 'page')
  await expect(economy).toHaveCSS('border-width', '1px')
  await expect(economy).toHaveCSS('text-decoration-line', 'underline')
  await expect(nav.getByRole('link', { name: 'Today', exact: true })).toHaveCSS('border-style', 'none')

  await page.setViewportSize({ width: 1024, height: 415 })
  await nav.getByRole('link', { name: 'Gear Planning', exact: true }).focus()
  await page.keyboard.press('Tab')
  const members = nav.getByRole('link', { name: 'Members', exact: true })
  await expect(members).toBeFocused()
  await expect(members).toBeInViewport({ ratio: 0.99 })
  await expect(members).toHaveCSS('outline-offset', '-2px')
  await expect.poll(() => nav.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  await expectContained(page)
})
