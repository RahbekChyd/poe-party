import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixture'
import { mockAnalysisRuns, recommendationIconPaths } from './ui-data'

async function openAnalysisFromNavigation(page: Page, isMobile: boolean) {
  const nav = page.getByRole('navigation', { name: 'Primary dashboard', exact: true })
  if (isMobile) {
    await nav.getByRole('button', { name: 'Builds', exact: true }).tap()
    await page.getByRole('menuitem', { name: 'Analysis', exact: true }).tap()
  } else {
    await nav.getByRole('link', { name: 'Analysis', exact: true }).click()
  }
}

async function openAnalysisNotification(page: Page, label: string, isMobile: boolean) {
  const header = page.getByRole('banner')
  if (isMobile) {
    await header.getByRole('button', { name: 'Account menu' }).tap()
    await page.getByRole('menuitem', { name: label, exact: true }).tap()
  } else {
    await header.getByRole('link', { name: label, exact: true }).click()
  }
}

for (const [status, label] of [
  ['completed', 'Analysis ready'],
  ['partial', 'Partial analysis ready'],
] as const) {
  test(`${label} opens the announced run for a different character and build`, async ({ page }, testInfo) => {
    await mockAnalysisRuns(page, { notification: status })
    const isMobile = testInfo.project.name === 'chromium-mobile'
    await page.goto('/dashboard')
    await openAnalysisFromNavigation(page, isMobile)

    const setup = page.getByRole('heading', { name: 'Analysis setup', exact: true })
    const run = page.getByRole('region', { name: 'Analysis run', exact: true })
    const recommendation = page.getByRole('button', { name: 'View Fixture Stormcoat', exact: true })
    await expect(setup).toBeVisible()
    await expect(run).toContainText('Fixture Witch · Fixture build')
    await expect(recommendation).toHaveCount(0)

    await openAnalysisNotification(page, label, isMobile)
    await expect(recommendation).toBeVisible()
    await expect(setup).toBeHidden()
    await expect(page).toHaveURL(/\/dashboard\/analysis\/?$/)
    await expect(run).toContainText('Fixture Ranger · Fixture Ranger build')
    await run.getByRole('button', { name: 'Run history', exact: true }).click()
    await expect(run.getByRole('button', { name: new RegExp(`${status}.*quick`, 'i') }))
      .toHaveAttribute('aria-pressed', 'true')
    const failed = run.getByRole('button', { name: /failed.*quick/i })
    await expect(failed).toHaveAttribute('aria-pressed', 'false')
    await failed.click()
    const failure = page.getByRole('alert').filter({ hasText: 'Exact analysis failed' })
    await expect(failure).toBeVisible()
    await openAnalysisNotification(page, label, isMobile)
    await expect(recommendation).toBeVisible()
    await expect(failure).toHaveCount(0)

    await page.getByRole('navigation', { name: 'Primary dashboard', exact: true })
      .getByRole('link', { name: 'Today', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible()
    await openAnalysisFromNavigation(page, isMobile)
    await expect(setup).toBeVisible()
    await expect(recommendation).toHaveCount(0)
  })
}

test('a run link with an unavailable build opens Analysis setup', async ({ page }) => {
  const { alternateReadyId } = await mockAnalysisRuns(page, { notification: 'completed' })
  const search = new URLSearchParams({
    runId: alternateReadyId,
    buildTargetId: '80000000-0000-0000-0000-000000000099',
  })
  await page.goto(`/dashboard/analysis?${search}`)
  await expect(page.getByRole('status').filter({ hasText: 'Could not open this analysis run.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Analysis setup', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'View Fixture Stormcoat', exact: true })).toHaveCount(0)
  await expect(page).toHaveURL(/\/dashboard\/analysis\/?$/)
})

async function expectDecodedImage(image: Locator, source: string) {
  await image.scrollIntoViewIfNeeded({ timeout: 8_000 })
  await expect.poll(() => image.evaluate((element: HTMLImageElement) =>
    element.complete && element.naturalWidth > 0 ? element.currentSrc : null,
  )).toBe(source)
}

test('Analysis resolves stored item art and falls back when image requests fail', async ({ page }) => {
  await mockAnalysisRuns(page, { icons: true })
  const wikiIcon = 'https://www.poewiki.net/wiki/Special:Redirect/file/Hubris_Circlet_inventory_icon.png'
  const brokenWikiIcon = 'https://www.poewiki.net/wiki/Special:Redirect/file/Titan_Gauntlets_inventory_icon.png'
  for (const failedUrl of [recommendationIconPaths['Fixture Crest'], recommendationIconPaths['Fixture Gloves']]) {
    await page.route(failedUrl, (route) => route.fulfill({ status: 404 }))
  }
  let requestedBrokenFallback = false
  await page.route(brokenWikiIcon, (route) => {
    requestedBrokenFallback = true
    return route.fulfill({ status: 404 })
  })
  await page.route('https://www.poewiki.net/w/api.php?*', (route) => {
    const where = new URL(route.request().url()).searchParams.get('where')
    const cargoquery = [
      { name: 'Hubris Circlet', 'inventory icon': 'File:Hubris Circlet inventory icon.png' },
      { name: 'Titan Gauntlets', 'inventory icon': 'File:Titan Gauntlets inventory icon.png' },
    ].filter(({ name }) => where === `name="${name}"`).map((title) => ({ title }))
    return route.fulfill({ json: { cargoquery }, headers: { 'Access-Control-Allow-Origin': '*' } })
  })

  await page.goto('/dashboard/analysis')
  await page.getByRole('button', { name: 'Run history', exact: true }).click()
  await page.getByRole('button', { name: /completed.*quick/i }).click()
  const results = page.getByRole('region', { name: 'Recommendations', exact: true })

  await expectDecodedImage(results.getByRole('img', { name: 'Fixture Ward', exact: true }), `https://web.poecdn.com${recommendationIconPaths['Fixture Ward']}`)
  await expectDecodedImage(results.getByRole('img', { name: 'Fixture Band', exact: true }), `https://web.poecdn.com${recommendationIconPaths['Fixture Band']}`)
  await expectDecodedImage(results.getByRole('img', { name: 'Fixture Crest', exact: true }), wikiIcon)
  await results.getByRole('button', { name: 'View Fixture Gloves', exact: true }).scrollIntoViewIfNeeded()
  await expect.poll(() => requestedBrokenFallback).toBe(true)
  await expect(results.getByText('Gl', { exact: true })).toBeVisible()
  await expect(results.getByRole('img', { name: 'Fixture Gloves', exact: true })).toHaveCount(0)

  await results.getByRole('button', { name: 'View Fixture Crest', exact: true }).click()
  const details = page.getByRole('dialog', { name: 'Fixture Crest', exact: true })
  await expectDecodedImage(details.locator('img').first(), wikiIcon)
  await details.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(details).toHaveCount(0)

  await results.getByRole('button', { name: 'View Fixture Gloves', exact: true }).click()
  const detailsWithoutArt = page.getByRole('dialog', { name: 'Fixture Gloves', exact: true })
  await expect(detailsWithoutArt.getByText('Gl', { exact: true })).toBeVisible()
  await expect(detailsWithoutArt.locator('img')).toHaveCount(0)
})
