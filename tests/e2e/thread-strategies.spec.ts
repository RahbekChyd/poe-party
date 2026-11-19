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
  await expect(page.getByText('Breach Thread x3', { exact: true })).toBeVisible()
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

test('editor saves Threads while keeping legacy setup fields and enforcing spent limit', async ({ page }, testInfo) => {
  let strategy = { id: strategyId, group_id: groupId, name: 'Legacy setup', description: 'Keep my notes', colour: '#f5a524', difficulty: 'normal', is_active: true, visibility: 'group_only', created_by: userId, created_at: '2026-11-18T00:00:00Z', scarabs: [{ name: 'Ambush Scarab', quantity: 2, required: true, alternatives: [] }], threads: [] as unknown[], atlas_tree_url: null, map_trade_link: null, map_requirements: { more_scarabs: 25, item_quantity: 80 }, map_cost: 5, admin_locked: false, source_strategy_id: null, subscription_state: null }
  const saves: Record<string, unknown>[] = []
  await seedSignedIn(page)
  await page.route('**/api/ninja/**', (route) => route.fulfill({ status: 503, body: '{}' }))
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const table = url.pathname.split('/').at(-1)
    let data: unknown = []
    if (table === 'users') data = { ...user, display_name: 'Fixture', poe_account_name: 'Fixture#0001', has_seen_early_access_notice: true }
    if (table === 'group_members') data = url.searchParams.get('select')?.includes('group:groups') ? [{ role: 'admin', group: { id: groupId, name: 'Fixture Party', game: 'poe1', league: 'Covens', current_strategy_id: null, is_solo: false } }] : [{ role: 'admin', user: { id: userId, display_name: 'Fixture', poe_account_name: 'Fixture#0001' } }]
    if (table === 'strategies') {
      if (route.request().method() === 'PATCH') {
        const payload = route.request().postDataJSON()
        saves.push(payload)
        strategy = { ...strategy, ...payload }
      }
      data = url.searchParams.has('id') ? strategy : [strategy]
    }
    await route.fulfill({ json: data })
  })
  await page.goto(`/dashboard/strategies/${strategyId}`)
  await expect(page.getByRole('heading', { name: 'Legacy Scarab reference' })).toBeVisible()
  await expect(page.getByText('2 × Ambush Scarab', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Add thread', exact: true }).click()
  await expect(page.getByPlaceholder('Thread name', { exact: true })).toHaveCount(1)
  await page.getByPlaceholder('Thread name', { exact: true }).fill('Breach Thread')
  await page.getByPlaceholder('Thread name', { exact: true }).press('Escape')
  await expect(page.getByPlaceholder('Thread name', { exact: true })).toHaveValue('Breach Thread')
  await page.getByRole('spinbutton', { name: 'Thread quantity' }).fill('8')
  await page.getByRole('button', { name: 'Add thread', exact: true }).click()
  await expect(page.getByPlaceholder('Thread name', { exact: true })).toHaveCount(2)
  await page.getByPlaceholder('Thread name', { exact: true }).nth(1).fill('Legion Thread')
  await page.getByPlaceholder('Thread name', { exact: true }).nth(1).press('Escape')
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Spend at most eight Threads per map')
  expect(saves).toHaveLength(0)
  await page.getByRole('spinbutton', { name: 'Thread quantity' }).first().fill('7')
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
  await expect.poll(() => saves.length).toBe(1)
  expect(saves[0].threads).toEqual([
    { name: 'Breach Thread', quantity: 7, required: true, alternatives: [] },
    { name: 'Legion Thread', quantity: 1, required: true, alternatives: [] },
  ])
  expect(saves[0]).not.toHaveProperty('scarabs')
  expect(saves[0].map_requirements).toMatchObject({ more_scarabs: 25, item_quantity: 80 })
  await expect(page.getByText('2 × Ambush Scarab', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
  await expect(page.getByRole('main')).toHaveJSProperty('scrollWidth', await page.getByRole('main').evaluate((node) => node.clientWidth))
  await page.getByRole('main').evaluate((node) => { node.scrollTop = 0; node.scrollLeft = 0 })
  await page.screenshot({ path: testInfo.outputPath('thread-editor.png'), fullPage: true })
  await page.getByRole('heading', { name: 'Threads', exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('thread-inputs.png'), fullPage: true })
})
