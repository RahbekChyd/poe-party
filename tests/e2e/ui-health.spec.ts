import { readFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import type { Page } from '@playwright/test'
import { expect, groupId, test } from './fixture'
import {
  activeLayoutsPobXml,
  analysisWorkerTrace,
  characterName,
  gearId,
  groupName,
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

async function mockPublicAnalysisCharacter(page: Page) {
  await page.route('**/functions/v1/guest-list-characters', (route) => route.fulfill({ json: {
    account_name: 'Fixture#1234',
    characters: [{ name: 'FixtureWitch', realm: 'pc', class: 'Witch', level: 91, league: 'Covens' }],
  } }))
}

async function selectPublicAnalysisCharacter(page: Page) {
  await page.getByRole('textbox', { name: /PoE account/i }).fill('Fixture#1234')
  await page.getByRole('button', { name: 'Find characters' }).click()
  await expect(page.getByText('FixtureWitch', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
}

test('a changed account must be looked up again before public analysis can queue', async ({ page }) => {
  await mockPublicAnalysisCharacter(page)
  const queueRequests: unknown[] = []
  await page.route('**/functions/v1/guest-queue-upgrade-analysis', (route) => {
    queueRequests.push(route.request().postDataJSON())
    return route.fulfill({ status: 400, json: { error: 'Unexpected queue request' } })
  })

  await page.goto('/preview/analysis')
  await selectPublicAnalysisCharacter(page)
  await expect(page.getByRole('heading', { name: 'Choose a PoB target', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await page.getByRole('textbox', { name: /PoE account/i }).fill('AnotherAccount#4321')
  await expect(page.getByText('FixtureWitch', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled()
  expect(queueRequests).toEqual([])
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

test('the public wizard validates the PoB and resumes one run through completion and expiry', async ({ page }, testInfo) => {
  await mockPublicAnalysisCharacter(page)
  const createdAt = new Date().toISOString()
  const runToken = 'fixture-public-analysis-run-token'
  const run = {
    id: 'fixture-public-run', character_name: 'FixtureWitch', target_name: 'Fixture target',
    character_league: 'Covens', created_at: createdAt, started_at: createdAt,
  }
  let status: 'running' | 'completed' | 'expired' = 'running'
  const statusRequests: Array<{ include_results: boolean; run_token: string }> = []
  await page.route('**/functions/v1/guest-queue-upgrade-analysis', (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      account_name: 'Fixture#1234', character_name: 'FixtureWitch',
      tree_spec_id: 'tree-spec:1', item_set_id: '8', skill_set_id: '9', config_set_id: '6',
    })
    return route.fulfill({ json: { run: { ...run, status: 'queued' }, run_token: runToken } })
  })
  await page.route('**/functions/v1/guest-upgrade-analysis-status', (route) => {
    const request = route.request().postDataJSON()
    statusRequests.push(request)
    if (status === 'expired') return route.fulfill({
      status: 404, json: { error: 'Public Analysis run not found or expired.', code: 'guest_run_not_found' },
    })
    return route.fulfill({ json: {
      run: {
        ...run, status, completed_at: status === 'completed' ? new Date().toISOString() : null,
        import_metadata: {
          tree_specs: [{ id: 'tree-spec:1', title: 'Progression' }, { id: 'tree-spec:2', title: 'Progression' }],
          item_sets: [{ id: '8', title: 'Mapping gear' }],
          skill_sets: [{ id: '9', title: 'Fireball links' }],
          config_sets: [{ id: '6', title: 'Maps' }],
        },
        summary: {
          current_phase: { id: 'scoring_upgrades', started_at: createdAt },
          resolved_tree_spec_id: 1, resolved_item_set_id: 8, resolved_skill_set_id: 9, resolved_config_set_id: 6,
        },
      },
      plans: request.include_results && status === 'completed' ? [{
        id: 'fixture-public-recommendation', title: 'Fixture Ward', section: 'primary',
        items: [{ id: 'fixture-public-item', item_name: 'Fixture Ward', slot: 'Body Armour', source: 'compare' }],
      }] : [],
    } })
  })

  await page.goto('/preview/analysis')
  await selectPublicAnalysisCharacter(page)
  const targetInput = page.getByRole('textbox', { name: 'PoB import', exact: true })
  const parse = page.getByRole('button', { name: 'Read PoB and continue', exact: true })
  const malformedCode = '!not-a-share-code!'
  await targetInput.fill(malformedCode)
  await parse.click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(targetInput).toHaveValue(malformedCode)
  const shareCode = deflateSync(activeLayoutsPobXml).toString('base64url')
  await targetInput.fill(shareCode)
  await parse.click()
  await expect(page.getByRole('heading', { name: 'Confirm PoB setup', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(targetInput).toHaveValue(shareCode)
  await parse.click()
  await page.getByRole('button', { name: /Tree.*Progression \(Tree 2\)|Progression \(Tree 2\).*Tree/ }).click()
  await page.getByRole('option', { name: 'Progression (Tree 1)', exact: true }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Review analysis', exact: true })).toBeVisible()
  for (const label of ['Progression (Tree 1)', 'Mapping gear', 'Fireball links', 'Maps']) {
    await expect(page.getByText(label, { exact: true })).toBeVisible()
  }
  await expectContained(page)
  await page.screenshot({ path: testInfo.outputPath('public-analysis-review.png'), animations: 'disabled' })
  await page.getByRole('button', { name: 'Run Quick analysis' }).click()

  const current = page.getByRole('region', { name: 'Current public run', exact: true })
  await expect(current).toBeVisible()
  await page.reload()
  await page.bringToFront()
  await expect(current).toContainText('FixtureWitch')
  await expect(page.getByText('Analysis in progress', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Find a character' })).toHaveCount(0)
  await expect(page.getByText('Recommendations', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Analysis ready', exact: true })).toHaveCount(0)
  expect(statusRequests.length).toBeGreaterThan(0)
  expect(statusRequests.every((request) => request.run_token === runToken && request.include_results === false)).toBe(true)
  expect(page.url()).not.toContain(runToken)

  status = 'completed'
  await expect(page.getByText('Recommendations', { exact: true })).toBeVisible({ timeout: 15_000 })
  expect(statusRequests.some((request) => request.include_results)).toBe(true)
  for (const label of ['Progression (Tree 1)', 'Mapping gear', 'Fireball links', 'Maps']) {
    await expect(current.getByText(label, { exact: true })).toBeVisible()
  }
  await expectContained(page)

  status = 'expired'
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Find a character', exact: true })).toBeVisible()
  await expect(page.getByText(/analysis is no longer available/i)).toBeVisible()
  await expect(current).toHaveCount(0)
})
