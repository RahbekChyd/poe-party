import type { Locator } from '@playwright/test'
import { expect, test, userId } from './fixture'
import { mockAnalysisRuns, mockApp, strategyId, strategyName } from './ui-data'

async function expectNoHorizontalScroll(locator: Locator) {
  await expect.poll(() => locator.evaluate((node) => node.scrollWidth - node.clientWidth))
    .toBeLessThanOrEqual(1)
}

async function expectTextInside(text: Locator, container: Locator) {
  await expect.poll(async () => {
    const bounds = await container.boundingBox()
    if (!bounds) return Number.POSITIVE_INFINITY
    return text.evaluate((node, { x, width }) => {
      const range = document.createRange()
      range.selectNodeContents(node)
      return Math.max(0, ...Array.from(range.getClientRects(), (rect) =>
        Math.max(x - rect.left, rect.right - (x + width)),
      ))
    }, bounds)
  }).toBeLessThanOrEqual(1)
}

test('completed Analysis uses the full results width across desktop breakpoints', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Desktop breakpoint regression')
  await mockAnalysisRuns(page)
  await page.goto('/dashboard/analysis')

  const heading = page.getByRole('heading', { name: 'Recommendations', exact: true })
  const results = page.getByRole('region', { name: 'Recommendations', exact: true })
  const recommendations = results.getByRole('button', { name: /View Fixture (Ward|Band|Crest)/ })
  const setup = page.getByRole('heading', { name: 'Analysis setup', exact: true })
  const run = page.getByRole('region', { name: 'Analysis run', exact: true })
  const editSetup = page.getByRole('button', { name: 'Edit setup', exact: true })
  await expect(heading).toBeInViewport()
  await expect(setup).toBeHidden()
  await expect(recommendations).toHaveCount(3)
  await editSetup.click()
  await expect(setup).toBeVisible()
  await page.getByRole('button', { name: 'Hide setup', exact: true }).click()
  await expect(setup).toBeHidden()

  const scoring = results.getByText('Scoring details', { exact: true })
  const explanation = results.getByText(/Compare scores within this run/)
  await expect(explanation).toBeHidden()
  await scoring.press('Enter')
  await expect(explanation).toBeVisible()
  await scoring.press('Enter')
  await expect(explanation).toBeHidden()

  const ward = results.getByRole('button', { name: 'View Fixture Ward', exact: true })
  await ward.press('Enter')
  const itemDialog = page.getByRole('dialog', { name: 'Fixture Ward', exact: true })
  await expect(itemDialog).toBeVisible()
  await expectNoHorizontalScroll(itemDialog)
  await page.keyboard.press('Escape')
  await expect(itemDialog).toHaveCount(0)

  for (const theme of ['dark', 'light']) {
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    const desktopViewports = [[1279, 720], [1280, 720], [1366, 768], [1440, 900], [1920, 1080]]
    const zoomEquivalentViewport = [1024, 576]
    for (const [width, height] of [...desktopViewports, zoomEquivalentViewport]) {
      await test.step(`${theme} ${width}×${height}`, async () => {
        await page.setViewportSize({ width, height })
        await expect(page.getByRole('complementary').getByRole('navigation', { name: 'Primary dashboard' })).toBeVisible()
        await expectNoHorizontalScroll(page.getByRole('main'))
        await expectNoHorizontalScroll(results)
        const panel = await results.boundingBox()
        const runPanel = await run.boundingBox()
        expect(panel).not.toBeNull()
        expect(runPanel).not.toBeNull()
        for (const recommendation of await recommendations.all()) {
          await expectNoHorizontalScroll(recommendation)
          const card = await recommendation.boundingBox()
          expect(card!.x).toBeGreaterThanOrEqual(panel!.x - 1)
          expect(card!.x + card!.width).toBeLessThanOrEqual(panel!.x + panel!.width + 1)
        }
        expect(panel!.x).toBeLessThanOrEqual(runPanel!.x + 1)
        expect(panel!.x + panel!.width).toBeGreaterThanOrEqual(runPanel!.x + runPanel!.width - 1)
      })
    }
    if (theme === 'dark') await page.getByRole('button', { name: 'Toggle theme', exact: true }).click()
  }
})

test('linked snapshots contain a maximum-length strategy name and keep actions reachable', async ({ page }, testInfo) => {
  await mockApp(page, 'poe1')
  await page.route('**/rest/v1/group_wealth_history?*', (route) => route.fulfill({
    json: Array.from({ length: 12 }, (_, index) => ({
      id: `history-${index}`, created_at: '2026-11-19T16:00:00Z', total_wealth_chaos: 5_000_000,
      triggered_by_user_id: userId, triggered_by_snapshot_id: `raw-${index}`,
    })),
  }))
  await page.goto(`/dashboard/strategies/${strategyId}`)
  await page.getByRole('button', { name: /Linked snapshots \(12\)/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Linked snapshots', exact: true })
  const name = dialog.getByText(strategyName, { exact: true })
  const close = dialog.getByRole('button', { name: 'Close', exact: true }).last()
  await expect(name).toBeVisible()

  const viewports = testInfo.project.name === 'chromium-mobile'
    ? [{ width: 320, height: 568 }, { width: 568, height: 320 }]
    : [{ width: 1280, height: 720 }, { width: 1366, height: 768 }]
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await expectNoHorizontalScroll(dialog)
    await expectTextInside(name, dialog)
    await expect(close).toBeInViewport({ ratio: 0.99 })
  }
  await close.click()
  await expect(dialog).toHaveCount(0)
})

test('service specifics contain long guarantees and keep footer actions reachable', async ({ page }, testInfo) => {
  await mockApp(page, 'poe1')
  const createdId = '40000000-0000-0000-0000-000000000002'
  const saves: Array<Record<string, unknown>> = []
  await page.route('**/rest/v1/services?*', (route) => {
    const request = route.request()
    if (request.method() === 'POST') {
      const payload = request.postDataJSON() as Record<string, unknown>
      saves.push(payload)
      return route.fulfill({ json: { ...payload, id: createdId } })
    }
    if (new URL(request.url()).searchParams.get('id') === `eq.${createdId}`) {
      return route.fulfill({ json: { ...saves[0], id: createdId } })
    }
    return route.fallback()
  })
  await page.goto('/dashboard/services')
  await page.getByRole('button', { name: 'New service', exact: true }).click()
  await page.getByRole('button', { name: /5-Way Host/ }).click()
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Fast 5-way runs')
  await page.getByRole('textbox', { name: 'PoE IGN', exact: true }).fill('FixtureIGN')
  const next = page.getByRole('button', { name: 'Next', exact: true })
  const viewports = testInfo.project.name === 'chromium-mobile'
    ? [{ width: 320, height: 568 }, { width: 568, height: 320 }]
    : [{ width: 1280, height: 720 }, { width: 1440, height: 900 }]
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await expect(next).toBeInViewport({ ratio: 0.99 })
  }
  await next.click()

  const dialog = page.getByRole('dialog', { name: 'Service specifics', exact: true })
  const guarantee = 'VerifiedCarries2026WithGuaranteedHostingAndPriorityRerunsForEveryClient'
  const guaranteeInput = dialog.getByRole('textbox', { name: 'Guarantee', exact: true })
  const addGuarantee = dialog.getByRole('button', { name: 'Add guarantee', exact: true })
  await guaranteeInput.fill(guarantee)
  await addGuarantee.click()
  const guaranteeText = dialog.getByText(guarantee, { exact: true })
  const create = dialog.getByRole('button', { name: 'Create', exact: true })
  await expect(guaranteeText).toBeVisible()
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await expectTextInside(guaranteeText, dialog.locator('.modal__body'))
    await expectNoHorizontalScroll(dialog.locator('.modal__body'))
    await expect(dialog.getByRole('heading', { name: 'Service specifics' })).toBeInViewport({ ratio: 0.99 })
    await expect(create).toBeInViewport({ ratio: 0.99 })
  }

  const additionalGuarantees = Array.from({ length: 7 }, (_, index) => `Guarantee ${index + 2}`)
  for (const additionalGuarantee of additionalGuarantees) {
    await guaranteeInput.fill(additionalGuarantee)
    await guaranteeInput.press('Enter')
  }
  await expect(addGuarantee).toBeDisabled()
  await expect(dialog.getByRole('status')).toHaveText('Maximum of 8 guarantees.')
  await guaranteeInput.fill('Replacement guarantee')
  await guaranteeInput.press('Enter')
  await expect(dialog.getByText('Replacement guarantee', { exact: true })).toHaveCount(0)
  await dialog.getByRole('listitem').filter({ hasText: 'Guarantee 8' })
    .getByRole('button', { name: 'Remove guarantee' }).click()
  await expect(addGuarantee).toBeEnabled()
  await guaranteeInput.press('Enter')
  await expect(dialog.getByText('Replacement guarantee', { exact: true })).toBeVisible()

  await create.click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Fast 5-way runs', exact: true, level: 1 })).toBeVisible()
  expect(saves).toHaveLength(1)
  expect(saves[0]).toMatchObject({
    service_type: 'five_way_host',
    poe_ign: 'FixtureIGN',
    details: { extra_guarantees: [guarantee, ...additionalGuarantees.slice(0, -1), 'Replacement guarantee'] },
  })
})

for (const [url, label, choice] of [
  ['/preview/services', 'Service type', 'Boss Carry'],
  ['/preview/strategies', 'Strategy stage', 'High end'],
] as const) {
  test(`${label} selection survives switching between segmented and compact filters`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'This case resizes through desktop and narrow widths')
    await mockApp(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(url)
    const segments = page.getByRole('radiogroup', { name: label, exact: true })
    const selection = segments.getByRole('radio', { name: choice, exact: true })
    await expect(segments).toBeVisible()
    await selection.click()
    await expect(selection).toBeChecked()
    await expectNoHorizontalScroll(segments)

    await page.setViewportSize({ width: 620, height: 700 })
    await expect(segments).toHaveCount(0)
    const compact = page.getByRole('button', { name: new RegExp(label, 'i') })
    await expect(compact).toContainText(choice)
    await compact.click()
    await expect(page.getByRole('option', { name: choice, exact: true })).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Escape')
    await expect(compact).toBeFocused()
    await expectNoHorizontalScroll(compact)

    await page.setViewportSize({ width: 1280, height: 720 })
    await expect(selection).toBeChecked()
  })
}
