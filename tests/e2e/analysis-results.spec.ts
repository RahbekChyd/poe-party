import type { Locator, Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './fixture'
import { analysisPobXml, mockAnalysisRuns, recommendationIconPaths } from './ui-data'

async function openAnalysisFromNavigation(page: Page, isMobile: boolean) {
  const nav = page.getByRole('navigation', { name: 'Primary dashboard', exact: true })
  if (isMobile) {
    await nav.getByRole('button', { name: 'Builds', exact: true }).tap()
    await page.getByRole('menuitem', { name: 'Analysis', exact: true }).tap()
  } else {
    await nav.getByRole('link', { name: 'Analysis', exact: true }).click()
  }
}

function runPath(runId: string) {
  return `/dashboard/analysis/runs/${runId}`
}

for (const [status, label] of [
  ['completed', 'Analysis ready'],
  ['partial', 'Partial analysis ready'],
] as const) {
  test(`${label} persists after leaving and opens the announced run`, async ({ page }, testInfo) => {
    const multipleResults = status === 'completed'
    const fixture = await mockAnalysisRuns(page, { notification: status, running: true, secondNotification: multipleResults })
    const isMobile = testInfo.project.name === 'chromium-mobile'
    await page.clock.install()
    await page.goto(runPath(fixture.alternateReadyId))
    await expect(page.getByRole('button', { name: 'Analysis running', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Analysis run', level: 1 })).toBeVisible()
    expect(fixture.countRecommendationRequests()).toBe(0)
    await openAnalysisFromNavigation(page, isMobile)
    const history = page.getByRole('region', { name: 'Run history' })
    await expect(history.getByRole('link', { name: /Fixture Ranger.*Fixture Ranger build/ }).first()).toBeVisible()
    await expect(history.getByRole('link', { name: /Fixture Witch.*Fixture build/ }).first()).toBeVisible()
    const oldRun = history.locator(`a[href="${runPath(fixture.completedId)}"]`)
    await expect(oldRun).toContainText('500,000')
    await expect(oldRun).toContainText('42,000')
    await expect(page.getByRole('link', { name: 'New analysis', exact: true })).toBeVisible()
    if (status === 'completed') {
      await expectPageContained(page)
      await page.screenshot({ path: testInfo.outputPath('analysis-history.png'), animations: 'disabled' })
      await expectNoSeriousAccessibilityViolations(page)
    }

    fixture.finishAlternateRun()
    if (multipleResults) fixture.finishSecondRun()
    await page.clock.fastForward(31_000)
    const notification = page.getByRole('banner').getByRole('button', { name: 'Analysis ready', exact: true })
    await expect(notification).toBeVisible()
    await page.reload()
    await expect(notification).toBeVisible()
    if (multipleResults) await expect(notification).toContainText('2')
    await notification.click()
    await expect(page.getByRole('menuitem', { name: /Analysis running/ })).toBeVisible()
    if (status === 'completed') {
      await page.screenshot({ path: testInfo.outputPath('analysis-notifications.png'), animations: 'disabled' })
    }
    await page.getByRole('menuitem', { name: new RegExp(`^${label}.*Fixture Ranger`, 'i') }).click()
    const recommendation = page.getByRole('button', { name: 'View Fixture Stormcoat', exact: true })
    await expect(recommendation).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`${runPath(fixture.alternateReadyId)}/?$`))
    if (multipleResults) {
      await expect(notification).toContainText('1')
      if (isMobile) await page.setViewportSize({ width: 320, height: 720 })
      await notification.click()
      const otherUnread = page.getByRole('menuitem', { name: /^Partial analysis ready/ })
      await expect(otherUnread).toBeVisible()
      await expect(page.getByRole('menuitem', { name: /^Analysis ready.*Fixture Ranger/ })).toHaveCount(0)
      if (isMobile) {
        await expectPageContained(page)
        const menu = await page.getByRole('menu').filter({ has: otherUnread }).boundingBox({ timeout: 4_000 })
        expect(menu).not.toBeNull()
        expect(menu!.x).toBeGreaterThanOrEqual(0)
        expect(menu!.x + menu!.width).toBeLessThanOrEqual(320)
      }
    } else {
      await expect(notification).toHaveCount(0)
      await expect(page.getByRole('banner').getByRole('button', { name: 'Analysis running', exact: true })).toBeVisible()
    }
  })
}

test('a legacy link opens the exact run and a workspace change hides it', async ({ page }) => {
  const { completedId } = await mockAnalysisRuns(page)
  const search = new URLSearchParams({
    runId: completedId,
    buildTargetId: '80000000-0000-0000-0000-000000000099',
  })
  await page.goto(`/dashboard/analysis?${search}`)
  await expect(page).toHaveURL(new RegExp(`${runPath(completedId)}/?$`))
  const result = page.getByRole('button', { name: 'View Fixture Ward', exact: true })
  await expect(result).toBeVisible()
  await page.getByRole('button', { name: /^Switch group/ }).click()
  await page.getByRole('menuitemradio', { name: /Standard Fixture Party/ }).click()
  await expect(result).toHaveCount(0)
  await expect(page.getByText(/analysis run (is )?unavailable/i).first()).toBeVisible()
})

test('workspace viewers can open saved results while analysis creation is restricted', async ({ page }) => {
  const { completedId, getSubmissionBody } = await mockAnalysisRuns(page, { membershipRole: 'viewer' })
  await page.goto('/dashboard/analysis')

  const savedRun = page.getByRole('region', { name: 'Run history' })
    .getByRole('link', { name: /Fixture Witch.*Completed/ })
  await expect(savedRun).toBeVisible()
  await expect(page.getByRole('link', { name: 'New analysis', exact: true })).toHaveCount(0)
  await savedRun.click()
  await expect(page).toHaveURL(new RegExp(`${runPath(completedId)}/?$`))
  await expect(page.getByRole('button', { name: 'View Fixture Ward', exact: true })).toBeVisible()

  await page.goto('/dashboard/analysis/new')
  await expect(page.getByText('Ask a workspace editor or admin to start a new analysis.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toHaveCount(0)
  expect(getSubmissionBody()).toBeNull()
})

async function openWizardReview(page: Page) {
  await page.goto('/dashboard/analysis')
  await page.getByRole('link', { name: 'New analysis', exact: true }).click()
  const next = page.getByRole('button', { name: 'Continue', exact: true })
  const stepNames = ['Choose a character', 'Choose a PoB target', 'Confirm PoB setup', 'Choose analysis options', 'Review analysis']
  const stepHeadings = stepNames.map((name) => page.getByRole('heading', { name, exact: true }))
  for (const [index, heading] of stepHeadings.entries()) {
    await expect(heading).toBeVisible()
    if (index !== 0) await expect(heading).toBeFocused()
    if (index < stepHeadings.length - 1) {
      await expect(next).toBeEnabled()
      await next.press('Enter')
    }
  }
  const review = page.getByRole('heading', { name: 'Review analysis', exact: true })
  await expect(review).toBeVisible()
  return { review, next }
}

async function expectPageContained(page: Page) {
  const overflow = await page.locator('main').evaluate((main) => main.scrollWidth - main.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
}

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(results.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical')).toEqual([])
}

test('the signed-in wizard keeps choices, recovers a queue error, and reveals results after completion', async ({ page }, testInfo) => {
  const fixture = await mockAnalysisRuns(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const { review, next } = await openWizardReview(page)
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Choose analysis options', exact: true })).toBeVisible()
  await next.click()
  await expect(review).toBeVisible()
  await expectPageContained(page)
  await page.screenshot({ path: testInfo.outputPath('analysis-review.png'), animations: 'disabled' })
  await expectNoSeriousAccessibilityViolations(page)

  fixture.failSubmission({ status: 429, error: 'Community analysis queue limit reached.' })
  const start = page.getByRole('button', { name: 'Start analysis', exact: true })
  await start.click()
  await expect(page.getByRole('alert').filter({ hasText: 'Community analysis queue limit reached.' })).toBeVisible()
  await expect(review).toBeVisible()
  fixture.failSubmission(null)
  await start.click()
  await expect(page).toHaveURL(new RegExp(`${runPath(fixture.submittedId)}/?$`))
  await expect(page.getByRole('status').filter({ hasText: 'Analysis queued' }).first()).toBeVisible()
  await expect(page.getByText(/you can leave/i)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Recommendations', exact: true })).toHaveCount(0)
  expect(fixture.countRecommendationRequests()).toBe(0)
  expect(fixture.getSubmissionBody()).toMatchObject({ analysis_mode: 'quick', budget_chaos: 0 })
  await expectPageContained(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(() => page.locator('.analysis-progress-track').evaluate(
    (track) => getComputedStyle(track, '::after').animationName,
  )).toBe('none')
  await page.screenshot({ path: testInfo.outputPath('analysis-queued.png'), animations: 'disabled' })

  await page.bringToFront()
  fixture.completeSubmittedRun()
  await expect(page.getByRole('button', { name: 'View New Fixture Ward', exact: true })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Analysis ready', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'View Fixture Ward', exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('the wizard opens a reused result by the returned run ID', async ({ page }) => {
  const fixture = await mockAnalysisRuns(page)
  fixture.reuseExistingRun()
  await openWizardReview(page)
  await page.getByRole('button', { name: 'Start analysis', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`${runPath(fixture.completedId)}/?$`))
  await expect(page.getByRole('button', { name: 'View Fixture Ward', exact: true })).toBeVisible()
})

test('the signed-in wizard saves an imported target and uses its PoB layouts', async ({ page }) => {
  await mockAnalysisRuns(page)
  await page.goto('/dashboard/analysis/new')
  const next = page.getByRole('button', { name: 'Continue', exact: true })
  await next.click()
  await page.getByText('Import a PoB target', { exact: true }).click()
  await page.getByRole('textbox', { name: 'Target name', exact: true }).fill('Fireball progression')
  await page.getByRole('textbox', { name: 'PoB share code or XML', exact: true }).fill(analysisPobXml)
  await page.getByRole('button', { name: 'Import build target' }).click()
  await expect(page.getByText('Fireball progression', { exact: true })).toBeVisible()
  await next.click()
  await expect(page.getByRole('heading', { name: 'Confirm PoB setup', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mapping tree Tree', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Fireball links Skill set', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.getByText('Fireball progression', { exact: true })).toBeVisible()
})

test('a failed saved run shows safe recovery without fetching recommendations', async ({ page }) => {
  const fixture = await mockAnalysisRuns(page, { failed: true })
  await page.goto(runPath(fixture.failedId))
  await expect(page.getByRole('alert').filter({ hasText: 'Analysis failed' })).toBeVisible()
  await expect(page.getByText(/Modules\/Common\.lua|stack traceback|\/app\/pob/)).toHaveCount(0)
  expect(fixture.countRecommendationRequests()).toBe(0)
})

test('cancelling a running analysis clears the top bar and preserves its history entry', async ({ page }) => {
  const fixture = await mockAnalysisRuns(page, { running: true })
  await page.goto(runPath(fixture.runningId))
  await expect(page.getByRole('heading', { name: 'Analysis in progress', exact: true })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: /scoring/i })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Analysis running', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel run', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Analysis cancelled', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Analysis running', exact: true })).toHaveCount(0)
  await page.getByRole('link', { name: 'Run history', exact: true }).click()
  await expect(page.locator(`a[href="${runPath(fixture.runningId)}"]`)).toContainText('Cancelled')
  expect(fixture.countRecommendationRequests()).toBe(0)
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
  await page.getByRole('region', { name: 'Run history' })
    .getByRole('link', { name: /Fixture Witch.*Completed/i }).click()
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
