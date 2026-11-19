import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { expect, groupId, test, userId } from './fixture'
import {
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
  [`/dashboard/strategies/${strategyId}`, 'Name', 0],
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
  await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible()
  await expectContained(page)
})

test('mobile dashboard menus reach secondary destinations', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Mobile navigation only')
  await mockApp(page, 'poe1')
  await page.goto('/dashboard')
  const nav = page.getByRole('navigation', { name: 'Primary dashboard' })

  for (const [section, label, path] of [
    ['Runs', 'Economy', '/dashboard/economy'],
    ['Builds', 'Gear Planning', '/dashboard/gear'],
    ['Discover', 'Services', '/dashboard/services'],
  ]) {
    const trigger = nav.getByRole('button', { name: section, exact: true })
    const menu = page.getByRole('menu', { name: section, exact: true })
    await trigger.click()
    await menu.getByRole('menuitem', { name: label, exact: true }).click()
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
  await mockApp(page, 'poe1')
  const characterId = '70000000-0000-0000-0000-000000000001'
  const targetId = '80000000-0000-0000-0000-000000000001'
  const now = Date.now()
  const target = {
    id: targetId, group_id: groupId, user_id: userId, character_id: characterId,
    created_by: userId, name: 'Fixture build', source_kind: 'pob_xml',
    compatibility_status: 'compatible', is_selected: true, created_at: new Date(now).toISOString(),
  }
  await page.route('**/rest/v1/characters?*', (route) => route.fulfill({ json: [{
    id: characterId, user_id: userId, name: 'Fixture Witch', class: 'Witch', level: 91, is_active: true,
  }] }))
  await page.route('**/rest/v1/build_targets?*', (route) => {
    const isDetail = new URL(route.request().url()).searchParams.has('id')
    return route.fulfill({ json: isDetail ? target : [target] })
  })
  let historyRequests = 0
  await page.route('**/rest/v1/upgrade_analysis_runs?*', (route) => {
    if (new URL(route.request().url()).searchParams.has('build_target_id')) historyRequests += 1
    const shared = { group_id: groupId, build_target_id: targetId, target_user_id: userId, character_id: characterId, queued_by: userId }
    const started = new Date(now - 10_000).toISOString()
    const finished = new Date(now - 60_000).toISOString()
    return route.fulfill({ json: [
      { ...shared, id: 'fixture-running', status: 'running', started_at: started, created_at: started, summary: { fixture_refresh: historyRequests } },
      { ...shared, id: 'fixture-completed', status: 'completed', started_at: finished, completed_at: finished, created_at: finished },
    ] })
  })

  await page.goto('/dashboard/analysis')
  await page.getByRole('button', { name: 'Run history', exact: true }).click()
  const completed = page.getByRole('button', { name: /completed.*quick/i })
  const running = page.getByRole('button', { name: /running.*quick/i })
  await expect(running).toBeVisible()
  await completed.click()
  await expect(completed).toHaveAttribute('aria-pressed', 'true')
  await expect(running).toHaveAttribute('aria-pressed', 'false')
  const initialRequests = historyRequests
  await expect.poll(() => historyRequests).toBeGreaterThan(initialRequests)
  await expect(completed).toHaveAttribute('aria-pressed', 'true')
  await expectContained(page)
})
