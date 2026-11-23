import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { expect, groupId, test } from './fixture'
import {
  analysisWorkerTrace,
  characterName,
  gearId,
  groupName,
  mockAnalysisRuns,
  mockApp,
  profileId,
  serviceId,
  serviceTitle,
  strategyId,
  strategyName,
} from './ui-data'
const seo = JSON.parse(
  readFileSync(new URL('../../src/lib/public-seo-pages.json', import.meta.url), 'utf8'),
) as { routes: Array<{ path: string }> }

async function expectContained(page: Page) {
  const widths = await page.evaluate(() => [document.documentElement, document.querySelector('main')]
    .filter((element): element is Element => element !== null)
    .map((element) => {
      const { scrollWidth, clientWidth, tagName } = element
      const leftEdge = element.getBoundingClientRect().left
      const offenders = scrollWidth <= clientWidth + 1
        ? []
        : Array.from(element.querySelectorAll('*'))
          .map((child) => ({
            tag: child.tagName,
            className: child.getAttribute('class'),
            width: Math.round(child.getBoundingClientRect().right - leftEdge),
          }))
          .filter((child) => child.width > clientWidth + 1)
          .sort((left, right) => right.width - left.width)
          .slice(0, 6)
      return { scrollWidth, clientWidth, tagName, offenders }
    }))
  for (const { scrollWidth, clientWidth, tagName, offenders } of widths) {
    expect(scrollWidth, `${tagName} overflows with ${JSON.stringify(offenders)}`).toBeLessThanOrEqual(clientWidth + 1)
  }
}

const publicPages: Array<[string, string | undefined]> = [
  ...seo.routes
    .filter(({ path }) => !['/', '/preview/analysis', '/preview/search', '/preview/services', '/preview/strategies', '/legal/security'].includes(path))
    .map(({ path }): [string, undefined] => [path, undefined]),
  [`/preview/strategies/${strategyId}`, strategyName],
  [`/preview/search/groups/${groupId}`, groupName],
  [`/preview/search/characters/${profileId}`, characterName],
]

for (const [path, title] of publicPages) {
  test(`public ${path} renders without overflow`, async ({ page }) => {
    await mockApp(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(path)
    const heading = title ? page.getByRole('heading', { name: title, level: 1 }) : page.locator('h1')
    await expect(heading).toBeVisible()
    await expectContained(page)
    expect(errors).toEqual([])
  })
}

const privatePages: Array<[string, string | RegExp, number?]> = [
  ['/dashboard', /overview|today/i],
  ['/dashboard/members', 'Members'],
  ['/dashboard/economy', 'Economy'],
  ['/dashboard/analysis', 'Analysis'],
  ['/dashboard/gear', 'Gear Planning'],
  [`/dashboard/gear/${gearId}`, /suggestion details/i, 2],
  ['/dashboard/strategies', 'Strategies'],
  [`/dashboard/strategies/${strategyId}`, strategyName],
  [`/dashboard/strategies/public/${strategyId}`, strategyName],
  ['/dashboard/services', 'Services'],
  [`/dashboard/services/${serviceId}`, serviceTitle],
  ['/dashboard/search', 'Directory'],
  [`/dashboard/search/groups/${groupId}`, groupName],
  [`/dashboard/search/characters/${profileId}`, characterName],
  ['/dashboard/support', 'Support PoE Party'],
  ['/dashboard/subscription', 'Support PoE Party'],
]

for (const [path, title, level = 1] of privatePages) {
  test(`PoE1 ${path} renders without overflow`, async ({ page }) => {
    await mockApp(page, 'poe1')
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(path)
    const heading = level ? page.getByRole('heading', { name: title, level, exact: true }) : page.getByRole('textbox', { name: title, exact: true })
    await expect(heading).toBeVisible()
    await expectContained(page)
    expect(errors).toEqual([])
  })
}

test('PoE2 dashboard surfaces respect workspace capabilities', async ({ page }) => {
  await mockApp(page, 'poe1')
  await page.route('**/api/ninja/poe2/api/economy/exchange/current/overview?*', (route) => {
    const isCurrency = new URL(route.request().url()).searchParams.get('type') === 'Currency'
    return route.fulfill({ json: {
      lines: isCurrency ? [{ id: 'test-market-item', primaryValue: 5 }] : [],
      items: isCurrency ? [{ id: 'test-market-item', name: 'Fixture Orb' }] : [],
    } })
  })
  await page.goto('/dashboard/economy')
  await expect(page.getByRole('heading', { name: 'Economy', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: /switch group/i }).click()
  await page.getByRole('menuitemradio', { name: 'PoE2 Fixture Party' }).click()
  await expect(page.getByText('Fixture Orb', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /snapshot/i })).toHaveCount(0)
  await expectContained(page)

  await page.goto('/dashboard/analysis')
  await expect(page.getByRole('heading', { name: 'Analysis', level: 1 })).toBeVisible()
  await expect(page.getByText(/optimizer.*(?:Path of Exile 1|PoE1)/i).first()).toBeVisible()
  await expectContained(page)

  await page.goto('/dashboard/gear')
  await expect(page.getByRole('heading', { name: 'Gear Planning', level: 1 })).toBeVisible()
  await expect(page.getByText('Fixture Wand', { exact: true })).toBeVisible()
  await expectContained(page)
})

test('workspace onboarding offers usable create, join, and solo dialogs', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'chromium-mobile') {
    await page.setViewportSize({ width: 320, height: 568 })
  }
  await mockApp(page, 'none')
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Welcome to PoE Party' })).toBeVisible()
  await expectContained(page)

  for (const [action, title] of [
    [/create group/i, 'Create a Group'],
    [/join group/i, 'Join a Group'],
    [/play solo/i, 'Play Solo'],
  ] as const) {
    const trigger = page.getByRole('button', { name: action }).first()
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: title })
    await expect(dialog).toBeVisible()
    await expectContained(page)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
  }
})

test('services disclose long details with the keyboard', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'chromium-mobile') {
    await page.setViewportSize({ width: 320, height: 568 })
  }
  await mockApp(page)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('Clipboard denied by test')) },
    })
  })
  await page.goto('/preview/services')
  await expect(page.getByText(serviceTitle, { exact: true })).toBeVisible()
  const disclosure = page.getByRole('button', { name: /show service details/i })
  await disclosure.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: /hide service details/i })).toHaveAttribute('aria-expanded', 'true')
  await page.getByRole('button', { name: 'Copy whisper' }).click()
  await expect(page.getByRole('alert')).toContainText('Clipboard unavailable')
  await expect(page.getByText(/^@FixtureCharacter\b/)).toBeVisible()
  await expectContained(page)
})

test('dashboard membership failure can be retried without losing the workspace', async ({ page }) => {
  await mockApp(page, 'poe1')
  let failMembershipRequest = true
  await page.route('**/rest/v1/group_members?*', (route) =>
    failMembershipRequest
      ? route.fulfill({ status: 400, json: { message: 'Fixture membership failure' } })
      : route.fallback(),
  )
  await page.goto('/dashboard')
  const alert = page.getByRole('alert').filter({ hasText: /load your groups/i })
  await expect(alert).toBeVisible()
  await expect(page.getByText('Welcome to PoE Party')).toHaveCount(0)
  failMembershipRequest = false
  await alert.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible()
  await expectContained(page)
})

test('mobile dashboard menus reach secondary destinations', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Mobile navigation only')
  await mockApp(page, 'poe1')
  await page.goto('/dashboard')
  const nav = page.getByRole('navigation', { name: 'Primary dashboard' })

  for (const [section, label, path] of [
    ['Runs', 'Strategies', '/dashboard/strategies'],
    ['Runs', 'Economy', '/dashboard/economy'],
    ['Builds', 'Analysis', '/dashboard/analysis'],
    ['Builds', 'Gear Planning', '/dashboard/gear'],
    ['Discover', 'Directory', '/dashboard/search'],
    ['Discover', 'Services', '/dashboard/services'],
  ]) {
    const trigger = nav.getByRole('button', { name: section, exact: true })
    const menu = page.getByRole('menu', { name: section, exact: true })
    await trigger.tap()
    await menu.getByRole('menuitem', { name: label, exact: true }).tap()
    await expect(menu).toHaveCount(0)
    await expect(page).toHaveURL(new RegExp(`${path}/?$`))
    await expect(page.getByRole('heading', { name: label, exact: true, level: 1 })).toBeVisible()
    await trigger.press('ArrowDown')
    await expect(menu.getByRole('menuitem', { name: label, exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(menu.getByRole('menuitem').first()).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await expectContained(page)
  }

  const party = nav.getByRole('link', { name: 'Party, members' })
  await party.tap()
  await expect(party).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: 'Members', level: 1 })).toBeVisible()
  const today = nav.getByRole('link', { name: 'Today', exact: true })
  await today.tap()
  await expect(today).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible()
})

test('a changed account must be looked up again before public analysis can queue', async ({ page }) => {
  await page.route('**/functions/v1/guest-list-characters', (route) => route.fulfill({ json: {
    account_name: 'Fixture#1234',
    characters: [{ name: 'FixtureWitch', realm: 'pc', class: 'Witch', level: 91, league: 'Covens' }],
  } }))
  let queueCalls = 0
  await page.route('**/functions/v1/guest-queue-upgrade-analysis', (route) => {
    queueCalls += 1
    return route.fulfill({ status: 400, json: { error: 'Unexpected queue request' } })
  })

  await page.goto('/preview/analysis')
  const account = page.getByRole('textbox', { name: /PoE account/i })
  const queue = page.getByRole('button', { name: 'Run Quick analysis' })
  await account.fill('Fixture#1234')
  await page.getByRole('button', { name: 'Find characters' }).click()
  await expect(page.getByText('FixtureWitch', { exact: true }).first()).toBeVisible()
  await page.getByRole('textbox', { name: 'PoB import' }).fill('<PathOfBuilding><Build className="Witch" /></PathOfBuilding>')
  await expect(queue).toBeEnabled()

  await account.fill('AnotherAccount#4321')
  await expect(page.getByText('FixtureWitch', { exact: true })).toHaveCount(0)
  await expect(queue).toBeDisabled()
  expect(queueCalls).toBe(0)
})

test('selecting a completed analysis remains active when a newer run refreshes', async ({ page }) => {
  const { countHistoryRequests } = await mockAnalysisRuns(page, { running: true })

  await page.goto('/dashboard/analysis')
  await page.bringToFront()
  const run = page.getByRole('region', { name: 'Analysis run', exact: true })
  await expect(run.getByRole('status').filter({ hasText: 'Analysis running' })).toBeVisible()
  await page.getByRole('button', { name: 'Run history', exact: true }).click()
  const completed = page.getByRole('button', { name: /completed.*quick/i })
  const running = page.getByRole('button', { name: /running.*quick/i })
  await expect(running).toBeVisible()
  await expect(running).toHaveAttribute('aria-pressed', 'false')
  await completed.click()
  await expect(completed).toHaveAttribute('aria-pressed', 'true')
  await expect(running).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('region', { name: 'Recommendations', exact: true })
    .getByRole('button', { name: 'View Fixture Ward', exact: true })).toBeVisible()
  const initialRequests = countHistoryRequests()
  await expect.poll(countHistoryRequests, { timeout: 15_000 }).toBeGreaterThan(initialRequests)
  await expect(completed).toHaveAttribute('aria-pressed', 'true')
  await expectContained(page)
})

test('Analysis opens fresh and shows safe failure copy when a saved run is selected', async ({ page }, testInfo) => {
  const { completeSubmittedRun } = await mockAnalysisRuns(page, { failed: true })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('/dashboard/analysis')
  const setup = page.getByRole('heading', { name: 'Analysis setup', exact: true })
  const history = page.getByRole('button', { name: 'Run history', exact: true })
  const failedRun = page.getByRole('button', { name: /failed.*quick/i })
  const completedRun = page.getByRole('button', { name: /completed.*quick/i })
  const failure = page.getByRole('alert').filter({ hasText: 'Exact analysis failed' })
  const recommendation = page.getByRole('button', { name: 'View Fixture Ward', exact: true })
  const trace = page.getByText(/Modules\/Common\.lua|stack traceback|Worker detail|\/app\/pob/)

  await expect(setup).toBeVisible()
  await expect(failure).toHaveCount(0)
  await expect(recommendation).toHaveCount(0)
  await history.click()
  await expect(failedRun).toHaveAttribute('aria-pressed', 'false')
  await expect(completedRun).toHaveAttribute('aria-pressed', 'false')
  await expect(trace).toHaveCount(0)

  await failedRun.click()
  await expect(failedRun).toHaveAttribute('aria-pressed', 'true')
  await expect(failure).toHaveCount(1)
  await expect(failure).toContainText('Try running the analysis again.')
  await expect(trace).toHaveCount(0)
  await expectContained(page)
  await failure.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('analysis-failed-history.png'), animations: 'disabled' })

  await completedRun.click()
  await expect(recommendation).toBeVisible()
  await expect(failure).toHaveCount(0)

  const nav = page.getByRole('navigation', { name: 'Primary dashboard' })
  await nav.getByRole('link', { name: 'Today', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible()
  if (testInfo.project.name === 'chromium-mobile') {
    await nav.getByRole('button', { name: 'Builds', exact: true }).tap()
    await page.getByRole('menuitem', { name: 'Analysis', exact: true }).tap()
  } else {
    await nav.getByRole('link', { name: 'Analysis', exact: true }).click()
  }
  await expect(setup).toBeVisible()
  await expect(recommendation).toHaveCount(0)
  await expect(failure).toHaveCount(0)
  await expect(history).toHaveAttribute('aria-expanded', 'false')
  await page.screenshot({ path: testInfo.outputPath('analysis-fresh-entry.png'), animations: 'disabled' })
  await history.click()
  await expect(completedRun).toHaveAttribute('aria-pressed', 'false')
  await expect(failedRun).toBeVisible()
  await expect(trace).toHaveCount(0)
  await expectContained(page)

  await history.click()
  await page.getByRole('button', { name: 'Run analysis', exact: true }).click()
  await page.bringToFront()
  await expect(page.getByRole('status').filter({ hasText: 'Analysis queued' })).toBeVisible()
  completeSubmittedRun()
  await expect(page.getByRole('button', { name: 'View New Fixture Ward', exact: true })).toBeVisible({ timeout: 15_000 })
  await expect(recommendation).toHaveCount(0)
  expect(errors).toEqual([])
})

test('public Analysis displays a retry message for a failed saved run', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('poe-party:guest-analysis-run-token:v1', 'fixture-run-token'))
  const createdAt = new Date().toISOString()
  await page.route('**/functions/v1/guest-upgrade-analysis-status', (route) => route.fulfill({ json: {
    run: {
      id: 'fixture-public-run', character_name: 'FixtureWitch', target_name: 'Fixture target',
      character_league: 'Covens', status: 'failed', error_detail: analysisWorkerTrace,
      created_at: createdAt, started_at: createdAt, completed_at: createdAt,
    },
    plans: [],
  } }))
  await page.goto('/preview/analysis')
  await expect(page.getByRole('alert').filter({ hasText: 'Public analysis failed' })).toBeVisible()
  await expect(page.getByText('Recommendations could not be generated. Try running the analysis again.').first()).toBeVisible()
  await expect(page.getByText(/Modules\/Common\.lua|stack traceback|\/app\/pob/)).toHaveCount(0)
  await expectContained(page)
})

test('a saved public analysis shows progress followed by results above setup', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('poe-party:guest-analysis-run-token:v1', 'fixture-run-token'))
  const started = new Date().toISOString()
  let completed = false
  await page.route('**/functions/v1/guest-upgrade-analysis-status', (route) => route.fulfill({ json: {
    run: {
      id: 'fixture-public-run', character_name: 'FixtureWitch', target_name: 'Fixture target',
      character_league: 'Covens', status: completed ? 'completed' : 'running',
      created_at: started, started_at: started, completed_at: completed ? started : null,
    },
    plans: route.request().postDataJSON()?.include_results ? [{
      id: 'fixture-public-recommendation', title: 'Fixture Ward', section: 'primary',
      items: [{ id: 'fixture-public-item', item_name: 'Fixture Ward', slot: 'Body Armour', source: 'compare' }],
    }] : [],
  } }))
  await page.goto('/preview/analysis')
  await page.bringToFront()
  const run = page.getByRole('region', { name: 'Current public run', exact: true })
  await expect(run).toContainText('FixtureWitch compared with Fixture target')
  await expect(run.getByText('Running', { exact: true })).toBeVisible()
  await expect(page.getByText('Analysis in progress', { exact: true })).toBeVisible()
  completed = true

  await expect(run.getByText('Completed', { exact: true })).toBeVisible({ timeout: 15_000 })
  const results = page.getByText('Recommendations', { exact: true })
  const setup = page.getByRole('heading', { name: 'Find a character', exact: true })
  await expect(results).toBeVisible()
  expect((await run.boundingBox())!.y).toBeLessThan((await results.boundingBox())!.y)
  expect((await results.boundingBox())!.y).toBeLessThan((await setup.boundingBox())!.y)
  await run.getByRole('link', { name: 'Analysis setup', exact: true }).press('Enter')
  await expect(setup).toBeInViewport()
  await expectContained(page)
})
