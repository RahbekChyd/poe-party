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
  test(`${mode} Run Map and Economy reflow across widths and themes`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Exercises CSS breakpoints in one context')
    if (mode === 'signed-in') await mockApp(page, 'poe1', [], { runMapResult: 'complete' })
    const base = mode === 'signed-in' ? '/dashboard' : '/preview'
    const overview = mode === 'signed-in' ? 'Today' : 'Overview'
    const nav = page.getByRole('navigation', { name: mode === 'signed-in' ? 'Primary dashboard' : 'Workspace sample', exact: true })
    const root = page.locator('html')
    const themeToggle = page.getByRole('button', { name: 'Toggle theme', exact: true })

    for (const [path, heading] of [[base, overview], [`${base}/economy`, 'Economy']]) {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: heading, exact: true, level: 1 })).toBeVisible()
      for (const theme of ['light', 'dark']) {
        if (await root.getAttribute('data-theme') !== theme) await themeToggle.click()
        await expect(root).toHaveAttribute('data-theme', theme)
        for (const viewport of viewports) {
          await test.step(`${heading} in ${theme} at ${viewport.width}px`, async () => {
            await page.setViewportSize(viewport)
            await expect(nav).toBeInViewport({ ratio: 0.99 })
            if (viewport.width >= 1024) {
              await expect(nav.getByRole('link', { name: heading, exact: true })).toHaveAttribute('aria-current', 'page')
              await expect(nav.getByRole('link')).toHaveCount(mode === 'signed-in' ? 8 : 4)
            }
            if (heading === overview) {
              const run = page.getByRole('list', { name: 'Run progress', exact: true })
              const stops = run.getByRole('listitem')
              await expect(stops).toHaveCount(3)
              await expect(stops.nth(0)).toContainText(runMapStrategyName)
              await expect(stops.nth(1)).toContainText('Latest linked snapshot')
              await expect(stops.nth(1)).toContainText('1,960c')
              const nextAction = stops.nth(2).getByRole('link', { name: 'View strategy results', exact: true })
              await expect(nextAction).toBeVisible()
              if (viewport.width >= 1024) {
                await expect(run).toBeInViewport({ ratio: 0.99 })
                await expect(nextAction).toBeInViewport({ ratio: 0.99 })
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
    }

    for (const viewport of [viewports[1], viewports[4]]) {
      await page.setViewportSize(viewport)
      await page.goto(base)
      const run = page.getByRole('list', { name: 'Run progress', exact: true })
      await run.getByRole('link', { name: 'View strategy results', exact: true }).press('Enter')
      await expect(page).toHaveURL(/#strategy-results$/)
      await expect(page.locator('#strategy-results')).toBeInViewport()

      const nextDestination = mode === 'signed-in' ? 'Today' : 'Gear'
      await nav.getByRole('link', { name: nextDestination, exact: true }).click()
      await expect(page.getByRole('heading', { name: nextDestination, exact: true, level: 1 })).toBeInViewport()
    }
  })
}

test('desktop routes are directly reachable and highlight nested destinations', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Exercises the desktop route line')
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

  for (const [name, path] of [
    ['Strategies', `strategies/${strategyId}`],
    ['Strategies', `strategies/public/${strategyId}`],
    ['Economy', 'economy/group'],
    ['Economy', `economy/${userId}`],
    ['Gear Planning', `gear/${gearId}`],
    ['Services', `services/${serviceId}`],
    ['Directory', `search/groups/${groupId}`],
    ['Directory', `search/characters/${profileId}`],
  ]) {
    await page.goto(`/dashboard/${path}`)
    await expect(nav.getByRole('link', { name, exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1)
  }
})

for (const result of [null, 'partial', 'unavailable'] as const) {
  test(`Today shows the appropriate action when a linked snapshot is ${result ?? 'missing'}`, async ({ page }) => {
    await mockApp(page, 'poe1', [], { runMapResult: result })
    await page.goto('/dashboard')
    const run = page.getByRole('list', { name: 'Run progress', exact: true })
    const resultStop = run.getByRole('listitem').nth(1)
    if (result === null) {
      await expect(run.getByRole('button', { name: 'Snapshot stash', exact: true })).toBeVisible()
    } else {
      await expect(run.getByRole('link', { name: 'View strategy results', exact: true })).toBeVisible()
      if (result === 'partial') {
        await expect(resultStop).toContainText('Latest linked priced subtotal')
        await expect(resultStop).toContainText('3 unpriced items')
      } else {
        await expect(resultStop).toContainText('Pricing unavailable')
      }
    }
    await expectContained(page)
  })
}

test('route markers keep their keyboard feedback in forced colors with reduced motion', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Exercises the desktop route line')
  await mockApp(page, 'poe1', [], { runMapResult: 'complete' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/dashboard')
  const nav = page.getByRole('navigation', { name: 'Primary dashboard', exact: true })
  const economy = nav.getByRole('link', { name: 'Economy', exact: true })
  const transitionTime = () => economy.evaluate((node) => parseFloat(getComputedStyle(node, '::after').transitionDuration))
  await expect.poll(transitionTime).toBeGreaterThan(0.05)
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' })
  await expect.poll(transitionTime).toBeLessThan(0.001)
  await economy.focus()
  await expect(economy).toBeFocused()
  await expect(economy).toHaveCSS('outline-style', /solid|auto/)
  await economy.press('Enter')
  await expect(economy).toHaveAttribute('aria-current', 'page')
  await expect(economy.locator('.workspace-route-label')).toHaveCSS('border-top-width', '1px')
  await expectContained(page)
})
