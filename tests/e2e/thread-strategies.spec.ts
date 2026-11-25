import type { Locator, Page } from '@playwright/test'
import { expect, groupId, seedSignedIn, test, user, userId } from './fixture'

const strategyId = '33000000-0000-0000-0000-000000000001'

test('public 3.30 setup shows Threads and preserves the legacy reference', async ({ page }) => {
  await page.route('**/rest/v1/rpc/get_public_strategy_preview', (route) => route.fulfill({
    json: [{ id: strategyId, group_id: '22000000-0000-0000-0000-000000000001', group_name: 'Test party',
      group_game: 'poe1', group_league: 'Covens', name: 'Thread farming setup', difficulty: 'normal',
      scarabs: [{ name: 'Ambush Scarab', quantity: 2 }],
      threads: [{ name: 'Breach Thread', quantity: 3, required: true, alternatives: [{ name: 'Legion Thread' }] }],
      map_requirements: { atlas_drops: 80, more_threads: 20 },
    }],
  }))
  await page.goto(`/preview/strategies/${strategyId}`)
  await expect(page.getByRole('heading', { name: 'Thread farming setup', exact: true })).toBeVisible()
  await expect(page.getByText(/Breach Thread\s*×3/)).toBeVisible()
  await expect(page.getByText('Atlas Drops 80%', { exact: true })).toBeVisible()
  await page.getByText('Legacy Scarab reference (removed in 3.30)', { exact: true }).click()
  await expect(page.getByText(/2 × Ambush Scarab/)).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
})

test('new editorial pages are current and old strategy URLs remain archived', async ({ page }) => {
  await page.goto('/poe-strategies/poe-3-30-alch-and-go')
  await expect(page.locator('h1')).toContainText('3.30')
  await page.goto('/poe-strategies/poe-3-29-alch-and-go')
  await expect(page.locator('h1')).toContainText('Archived 3.29')
})

type Payload = Record<string, unknown>

function thread(name: string, quantity: number) {
  return { name, quantity, required: true, alternatives: [] }
}

async function mockStrategyWorkspace(page: Page, options: {
  game?: 'poe1' | 'poe2'
  league?: string
  threads?: ReturnType<typeof thread>[]
  failFirstCreate?: boolean
} = {}) {
  const { game = 'poe1', league = 'Covens', threads, failFirstCreate = false } = options
  const defaults = {
    id: strategyId, group_id: groupId, name: 'Legacy setup', description: 'Keep my notes',
    difficulty: 'normal', colour: '#f5a524', is_active: true, visibility: 'group_only',
    created_by: userId, created_at: '2026-11-18T00:00:00Z', admin_locked: false,
    atlas_tree_url: null, map_trade_link: null, map_cost: null, map_requirements: {},
    scarabs: [], threads: [], source_strategy_id: null, subscription_state: null,
  }
  let strategy: Payload | null = threads ? {
    ...defaults, threads, scarabs: [{ name: 'Ambush Scarab', quantity: 2 }],
    map_requirements: { more_scarabs: 25, item_quantity: 80 },
  } : null
  const creates: Payload[] = []
  const updates: Payload[] = []
  await seedSignedIn(page)
  await page.route('**/rest/v1/**', (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const resource = url.pathname.split('/').at(-1)
    const group = { id: groupId, name: 'Fixture Party', game, league, current_strategy_id: null, is_solo: false }
    const profile = { ...user, display_name: 'Fixture', poe_account_name: 'Fixture#0001', has_seen_early_access_notice: true }
    if (resource === 'users') return route.fulfill({ json: profile })
    if (resource === 'group_members') {
      return route.fulfill({
        json: url.searchParams.get('select')?.includes('group:groups')
          ? [{ role: 'admin', group }]
          : [{ role: 'admin', user: profile }],
      })
    }
    if (resource === 'strategies') {
      if (request.method() === 'POST') {
        const payload: Payload = request.postDataJSON()
        creates.push(payload)
        if (failFirstCreate && creates.length === 1) {
          return route.fulfill({ status: 500, json: { message: 'Fixture create failure' } })
        }
        strategy = { ...defaults, ...payload }
        return route.fulfill({ status: 201, json: strategy })
      }
      if (request.method() === 'PATCH') {
        const payload: Payload = request.postDataJSON()
        updates.push(payload)
        strategy = { ...strategy, ...payload }
        return route.fulfill({ json: strategy })
      }
      return route.fulfill({ json: url.searchParams.has('id') ? strategy : strategy ? [strategy] : [] })
    }
    return route.fulfill({ json: [] })
  })
  return { creates, updates }
}

async function openCreation(page: Page) {
  await page.getByRole('button', { name: 'Create strategy', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Create strategy', exact: true })
  await expect(dialog).toBeVisible()
  return dialog
}

async function chooseThread(page: Page, input: Locator, name: string) {
  await input.fill(name)
  await input.press('ArrowDown')
  await page.getByRole('option').filter({ hasText: name }).click()
  await expect(input).toHaveValue(name)
}

function threadQuantities(scope: Page | Locator) {
  return scope.getByRole('button', { name: /\bThread quantity$/i })
}

async function chooseQuantity(page: Page, trigger: Locator, quantity: string) {
  await trigger.click()
  await page.getByRole('option', { name: quantity, exact: true }).click()
  await expect(trigger).toHaveText(quantity)
}

async function addThread(page: Page, scope: Locator, name: string, quantity: string) {
  await scope.getByRole('button', { name: 'Add thread', exact: true }).click()
  const input = scope.getByPlaceholder('Thread name', { exact: true }).last()
  await chooseThread(page, input, name)
  await chooseQuantity(page, threadQuantities(scope).last(), quantity)
}

test('editor preserves legacy Threads and validates changed selections', async ({ page }) => {
  const { updates } = await mockStrategyWorkspace(page, {
    threads: [thread('Breach Thread', 2), thread('Legion Thread', 1), thread('Abyss Thread', 1), thread('Ritual Thread', 1)],
  })
  await page.goto(`/dashboard/strategies/${strategyId}`)
  await expect(page.getByRole('heading', { name: 'Legacy Scarab reference' })).toBeVisible()
  await page.getByRole('button', { name: 'Edit setup', exact: true }).click()

  const name = page.getByRole('textbox', { name: 'Name', exact: true })
  const quantities = threadQuantities(page)
  await expect(quantities).toHaveText(['2', '1', '1', '1'])
  const save = page.getByRole('button', { name: 'Save Changes', exact: true })
  await name.fill('Renamed legacy setup')
  await save.click()
  await expect.poll(() => updates.length).toBe(1)
  expect(updates[0]).not.toHaveProperty('threads')
  expect(updates[0]).not.toHaveProperty('scarabs')
  expect(updates[0]).not.toHaveProperty('map_requirements')

  await chooseQuantity(page, quantities.first(), '8')
  await save.click()
  await expect(page.getByRole('alert').filter({ hasText: /(?:3|three) Thread types/i })).toBeVisible()
  expect(updates).toHaveLength(1)
  await page.getByRole('button', { name: 'Remove Thread', exact: true }).last().click()
  const names = page.getByPlaceholder('Thread name', { exact: true })
  await chooseThread(page, names.nth(1), 'Breach Thread')
  await save.click()
  await expect(page.getByRole('alert').filter({ hasText: /Breach Thread|per type/i })).toBeVisible()
  expect(updates).toHaveLength(1)

  await chooseThread(page, names.nth(1), 'Legion Thread')
  await chooseQuantity(page, quantities.nth(1), '8')
  await chooseQuantity(page, quantities.nth(2), '8')
  await page.getByRole('spinbutton', { name: 'Atlas Drops' }).fill('60')
  await save.click()
  await expect.poll(() => updates.length).toBe(2)
  expect(updates[1].threads).toEqual([
    thread('Breach Thread', 8), thread('Legion Thread', 8), thread('Abyss Thread', 8),
  ])
  expect(updates[1].map_requirements).toMatchObject({ atlas_drops: 60, more_scarabs: 25, item_quantity: 80 })
  await expect(page.getByText('2 × Ambush Scarab', { exact: true })).toBeVisible()
})

test('PoE1 wizard preserves its draft and saves a full setup in one insert', async ({ page }, testInfo) => {
  const { creates, updates } = await mockStrategyWorkspace(page, { failFirstCreate: true })
  let marketAvailable = false
  const marketLeagues: (string | null)[] = []
  await page.route('**/api/ninja/**', (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/economy/leagues')) {
      return route.fulfill({ json: [{ id: 'Covens', name: 'Covens' }] })
    }
    const core = { primary: 'chaos', rates: { divine: 0.005 } }
    if (url.searchParams.get('type') === 'Thread') {
      marketLeagues.push(url.searchParams.get('league'))
      if (!marketAvailable) return route.fulfill({ status: 503, json: {} })
      return route.fulfill({ json: {
        core,
        items: [{ id: 'breach-thread', name: 'Breach Thread' }],
        lines: [{ id: 'breach-thread', primaryValue: 4 }],
      } })
    }
    return route.fulfill({ json: { core, items: [], lines: [] } })
  })

  await page.goto('/dashboard/strategies')
  const dialog = await openCreation(page)
  const next = dialog.getByRole('button', { name: 'Next', exact: true })
  const title = dialog.getByRole('textbox', { name: 'Name', exact: true })
  await next.press('Enter')
  await expect(dialog.getByText('Enter a strategy name', { exact: true })).toBeVisible()
  await title.fill('Weekend farming')
  await dialog.getByRole('textbox', { name: 'Description' }).fill('Party run')
  await next.press('Enter')
  await expect(dialog.getByRole('heading', { name: 'Map setup', exact: true })).toBeFocused()
  const atlas = 'https://www.pathofexile.com/fullscreen-atlas-skill-tree/fixture'
  const trade = 'https://www.pathofexile.com/trade/search/Covens/fixture'
  await dialog.getByRole('textbox', { name: 'Atlas tree URL' }).fill(atlas)
  await dialog.getByRole('textbox', { name: 'Trade link' }).fill(trade)
  await dialog.getByRole('spinbutton', { name: 'Estimated map cost' }).fill('5')
  await dialog.getByRole('spinbutton', { name: 'Atlas Drops' }).fill('80')
  await dialog.getByRole('button', { name: 'Back', exact: true }).press('Enter')
  await expect(title).toHaveValue('Weekend farming')
  await next.press('Enter')
  await expect(dialog.getByRole('spinbutton', { name: 'Estimated map cost' })).toHaveValue('5')
  await next.press('Enter')
  await expect(dialog.getByRole('heading', { name: 'Threads', exact: true })).toBeFocused()
  await expect(dialog.getByRole('button', { name: /retry/i })).toBeVisible()
  marketAvailable = true
  await dialog.getByRole('button', { name: /retry/i }).click()

  await dialog.getByRole('button', { name: 'Add thread', exact: true }).click()
  const picker = dialog.getByPlaceholder('Thread name', { exact: true })
  await picker.fill('Breach')
  const option = page.getByRole('option', { name: /^Breach Thread/ })
  await expect(option).toContainText(/4\s*c/)
  await expect(option.locator('img')).toHaveAttribute('src', /\/Threads\/BreachThread\.png$/)
  await option.click()
  const quantity = threadQuantities(dialog).first()
  await expect(quantity).toHaveText('1')
  await quantity.press('Enter')
  await expect(page.getByRole('option')).toHaveText(['1', '2', '3', '4', '5', '6', '7', '8'])
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await expect(quantity).toHaveText('8')
  await expect(dialog.getByText('~ 32c', { exact: true }).first()).toBeVisible()
  await addThread(page, dialog, 'Legion Thread', '8')
  await addThread(page, dialog, 'Abyss Thread', '8')
  expect(creates).toHaveLength(0)

  const save = dialog.getByRole('button', { name: 'Create strategy', exact: true })
  await expect(save).toBeInViewport()
  await expect.poll(() => dialog.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: testInfo.outputPath('strategy-wizard-threads.png') })
  await save.click()
  await expect(dialog.getByRole('alert').filter({ hasText: /could not create/i })).toBeVisible()
  await expect(picker.first()).toHaveValue('Breach Thread')
  await expect(quantity).toHaveText('8')
  await save.click()

  await expect(page).toHaveURL(new RegExp(`/dashboard/strategies/${strategyId}$`))
  await expect(page.getByRole('heading', { name: 'Weekend farming', exact: true })).toBeVisible()
  expect(creates).toHaveLength(2)
  expect(updates).toHaveLength(0)
  expect(creates[1]).toMatchObject({
    group_id: groupId, name: 'Weekend farming', description: 'Party run', map_cost: 5,
    atlas_tree_url: atlas, map_trade_link: trade, map_requirements: { atlas_drops: 80 },
    threads: [thread('Breach Thread', 8), thread('Legion Thread', 8), thread('Abyss Thread', 8)],
  })
  expect([...new Set(marketLeagues)]).toEqual(['Covens'])
})

test('private league wizard shows artwork and allows a blank setup', async ({ page }) => {
  const { creates } = await mockStrategyWorkspace(page, { league: 'Fixture Private League (PL12345)' })
  const exchangeRequests: string[] = []
  await page.route('**/api/ninja/**', (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/economy/leagues')) {
      return route.fulfill({ json: [{ id: 'Covens', name: 'Covens' }] })
    }
    exchangeRequests.push(url.pathname + url.search)
    return route.fulfill({ status: 503, json: {} })
  })
  await page.goto('/dashboard/strategies')
  const dialog = await openCreation(page)
  const name = dialog.getByRole('textbox', { name: 'Name', exact: true })
  const next = dialog.getByRole('button', { name: 'Next', exact: true })
  await name.fill('Discard this draft')
  await next.click()
  await next.click()
  await expect(dialog.getByText('No live Thread prices for this league', { exact: false })).toBeVisible()
  await dialog.getByRole('button', { name: 'Add thread', exact: true }).click()
  await dialog.getByPlaceholder('Thread name', { exact: true }).fill('Abyss')
  const option = page.getByRole('option', { name: 'Abyss Thread', exact: true })
  const icon = option.locator('img')
  await expect(icon).toHaveAttribute('src', /\/Threads\/AbyssThread\.png$/)
  await expect.poll(() => icon.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  await option.click()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(creates).toHaveLength(0)

  await openCreation(page)
  await expect(name).toHaveValue('')
  await name.fill('Private league basics')
  await next.click()
  await next.click()
  await dialog.getByRole('button', { name: 'Create strategy', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/dashboard/strategies/${strategyId}$`))
  expect(creates).toHaveLength(1)
  expect(creates[0].threads ?? []).toEqual([])
  expect(exchangeRequests).toEqual([])
})

test('PoE2 creation only submits basics', async ({ page }) => {
  const { creates } = await mockStrategyWorkspace(page, { game: 'poe2', league: 'Fixture League 2' })
  await page.goto('/dashboard/strategies')
  const dialog = await openCreation(page)
  await expect(dialog.getByRole('button', { name: 'Next', exact: true })).toHaveCount(0)
  await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('PoE2 plan')
  await dialog.getByRole('button', { name: 'Create strategy', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/dashboard/strategies/${strategyId}$`))
  expect(creates).toHaveLength(1)
  expect(creates[0]).toMatchObject({ name: 'PoE2 plan', difficulty: 'normal' })
  for (const field of ['threads', 'map_cost', 'map_requirements', 'atlas_tree_url', 'map_trade_link']) {
    expect(creates[0]).not.toHaveProperty(field)
  }
})
