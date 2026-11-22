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

const crestArtwork = 'https://cdn.poedb.tw/image/Art/2DItems/Armours/Helmets/HelmetInt11.webp'
const glovesArtwork = 'https://cdn.poedb.tw/image/Art/2DItems/Armours/Gloves/GlovesStr4.webp'

async function mockArtworkFallback(
  page: Page,
  baseURL: string | undefined,
  artwork: { crest: string; gloves: string },
) {
  await mockAnalysisRuns(page, { icons: true })
  for (const failedUrl of [recommendationIconPaths['Fixture Crest'], recommendationIconPaths['Fixture Gloves']]) {
    await page.route(failedUrl, (route) => route.fulfill({ status: 404 }))
  }
  const requests = new Set<string>()
  page.on('request', (request) => requests.add(request.url()))

  for (const [slug, image] of [
    ['Hubris_Circlet', artwork.crest],
    ['Titan_Gauntlets', artwork.gloves],
  ]) {
    await page.route(`${baseURL}/api/poedb/us/${slug}`, (route) => route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><head><meta property="og:image" content="${image}" /></head></html>`,
    }))
  }
  return requests
}

async function openSavedRecommendations(page: Page) {
  await page.goto('/dashboard/analysis')
  await page.getByRole('button', { name: 'Run history', exact: true }).click()
  await page.getByRole('button', { name: /completed.*quick/i }).click()
  return page.getByRole('region', { name: 'Recommendations', exact: true })
}

test('Analysis resolves stored item art and looks up missing art through the PoEDB proxy', async ({ page, baseURL }) => {
  const requests = await mockArtworkFallback(page, baseURL, { crest: crestArtwork, gloves: glovesArtwork })
  const results = await openSavedRecommendations(page)

  await expectDecodedImage(results.getByRole('img', { name: 'Fixture Ward', exact: true }), `https://web.poecdn.com${recommendationIconPaths['Fixture Ward']}`)
  await expectDecodedImage(results.getByRole('img', { name: 'Fixture Band', exact: true }), `https://web.poecdn.com${recommendationIconPaths['Fixture Band']}`)

  for (const [item, image] of [['Fixture Crest', crestArtwork], ['Fixture Gloves', glovesArtwork]]) {
    await expectDecodedImage(results.getByRole('img', { name: item, exact: true }), image)
    await results.getByRole('button', { name: `View ${item}`, exact: true }).click()
    const details = page.getByRole('dialog', { name: item, exact: true })
    await expectDecodedImage(details.locator('img').first(), image)
    await details.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(details).toHaveCount(0)
  }

  expect(requests.has(`${baseURL}/api/poedb/us/Hubris_Circlet`)).toBe(true)
  expect(requests.has(`${baseURL}/api/poedb/us/Titan_Gauntlets`)).toBe(true)
  expect([...requests].filter((url) => url.startsWith('https://www.poewiki.net/w/api.php'))).toEqual([])
})

test('Analysis shows slots when fallback artwork is invalid or unavailable', async ({ page, baseURL }) => {
  const invalidArtwork = 'https://example.invalid/image/Art/2DItems/fixture.png'
  const requests = await mockArtworkFallback(page, baseURL, { crest: invalidArtwork, gloves: glovesArtwork })
  await page.route(glovesArtwork, (route) => route.fulfill({ status: 404 }))
  const results = await openSavedRecommendations(page)
  const crest = results.getByRole('button', { name: 'View Fixture Crest', exact: true })
  const gloves = results.getByRole('button', { name: 'View Fixture Gloves', exact: true })
  await crest.scrollIntoViewIfNeeded()
  await expect.poll(() => requests.has(`${baseURL}/api/poedb/us/Hubris_Circlet`)).toBe(true)
  await expect(results.getByText('He', { exact: true })).toBeVisible()
  await expect(results.getByRole('img', { name: 'Fixture Crest', exact: true })).toHaveCount(0)
  await gloves.scrollIntoViewIfNeeded()
  await expect.poll(() => requests.has(glovesArtwork)).toBe(true)
  await expect(results.getByText('Gl', { exact: true })).toBeVisible()
  await expect(results.getByRole('img', { name: 'Fixture Gloves', exact: true })).toHaveCount(0)

  await gloves.click()
  const detailsWithoutArt = page.getByRole('dialog', { name: 'Fixture Gloves', exact: true })
  await expect(detailsWithoutArt.getByText('Gl', { exact: true })).toBeVisible()
  await expect(detailsWithoutArt.locator('img')).toHaveCount(0)
  expect(requests.has(invalidArtwork)).toBe(false)
})
