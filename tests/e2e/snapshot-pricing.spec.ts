import { expect, test, type Page } from '@playwright/test'

const userId = '10000000-0000-0000-0000-000000000001'
const groupId = '20000000-0000-0000-0000-000000000001'
const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-11-18T00:00:00Z' }
const summary = { status: 'complete', version: 1, source: 'poe.ninja', priced_at: '2026-11-18T00:00:00Z', divine_price: null, priced_item_count: 1000, unpriced_item_count: 1, failed_categories: [] as string[] }
const items = Array.from({ length: 1001 }, (_, i) => ({ id: `item-${String(i).padStart(4, '0')}`, user_id: userId, name: i === 1000 ? 'Unpriced keepsake' : 'Chaos Orb', type_line: 'Chaos Orb', base_type: null, frame_type: 5, ilvl: 1, icon_url: null, stack_size: 2, tab_name: 'Currency', tab_type: 'CurrencyStash', colour_r: 100, colour_g: 100, colour_b: 100, price_chaos: i === 1000 ? null : 6, is_excluded: false, excluded_reason: null }))
const exclusionItems = [
  { ...items[0], name: 'Excluded trophy', price_chaos: 100_000, is_excluded: true, tab_name: 'Excluded stash' },
  { ...items[1], name: 'Included currency' },
  { ...items[1000] },
]

type Item = typeof items[number]
type PricingStatus = 'complete' | 'partial' | 'unavailable'
async function mockCapture(page: Page, status: PricingStatus = 'complete', rows: Item[] = items) {
  const captureItems = status === 'unavailable' ? rows.map((item) => ({ ...item, price_chaos: null })) : rows
  const captureSummary = {
    ...summary, status,
    priced_item_count: captureItems.filter((item) => item.price_chaos !== null).length,
    unpriced_item_count: captureItems.filter((item) => item.price_chaos === null).length,
    failed_categories: status === 'complete' ? [] : ['Currency'],
  }
  await page.addInitScript(({ user, groupId }) => {
    sessionStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: 'fixture-access', refresh_token: 'fixture-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user }))
    localStorage.setItem('poe-group-tool:active-group', JSON.stringify({ state: { activeGroupId: groupId }, version: 0 }))
  }, { user, groupId })
  await page.route('**/api/ninja/**', (route) => route.fulfill({ status: 503, body: '{}' }))
  await page.route('**/auth/v1/**', (route) => route.fulfill({ json: user }))
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const table = url.pathname.split('/').at(-1)
    let data: unknown = []
    if (table === 'users') data = { ...user, display_name: 'Fixture', poe_account_name: 'Fixture#0001', has_seen_early_access_notice: true }
    if (table === 'group_members') data = url.searchParams.get('select')?.includes('group:groups') ? [{ role: 'admin', group: { id: groupId, name: 'Fixture Party', game: 'poe1', league: 'Covens', current_strategy_id: null, is_solo: false } }] : [{ role: 'admin', user: { id: userId, display_name: 'Fixture', poe_account_name: 'Fixture#0001' } }]
    if (table === 'latest_snapshots') data = [{ id: 'snapshot', user_id: userId, group_id: groupId, completed_at: '2026-11-18T00:00:00Z', pricing_summary: captureSummary }]
    if (table === 'stash_tabs') data = [{ id: 'tab', snapshot_id: 'snapshot', user_id: userId, name: 'Currency', tab_type: 'CurrencyStash', estimated_value_chaos: captureItems.reduce((sum, item) => sum + (item.is_excluded ? 0 : item.price_chaos ?? 0), 0) }]
    if (table === 'latest_stash_items') {
      const offset = Number(url.searchParams.get('offset') ?? 0)
      data = captureItems.slice(offset, offset + Number(url.searchParams.get('limit') ?? 500))
    }
    await route.fulfill({ json: data })
  })
}

for (const route of ['/dashboard/economy/group', `/dashboard/economy/${userId}`]) {
  test(`${route} retains stored prices and reads beyond 1000 items`, async ({ page }, testInfo) => {
    await mockCapture(page)
    await page.goto(route)
    await expect(page.getByText(/1,000 priced items; 1 unpriced/)).toBeVisible()
    await expect(page.getByText('6,000c', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Divine conversion unavailable', { exact: true }).first()).toBeVisible()
    await page.getByPlaceholder(/Search items/).fill('Unpriced keepsake')
    await expect(page.getByText('Unpriced keepsake', { exact: true })).toBeVisible()
    await expect(page.getByText('Unknown', { exact: true })).toBeVisible()
    await expect(page.getByRole('main')).toHaveJSProperty('scrollWidth', await page.getByRole('main').evaluate((node) => node.clientWidth))
    await page.screenshot({ path: testInfo.outputPath('stored-snapshot.png'), fullPage: true })
  })
  for (const status of ['partial', 'unavailable'] as const) {
    test(`${route} labels a ${status} stored capture`, async ({ page }, testInfo) => {
      await mockCapture(page, status, exclusionItems)
      await page.goto(route)
      await expect(page.getByRole('status').filter({ hasText: status === 'partial' ? 'Some price feeds were unavailable' : 'Pricing is unavailable for this capture' })).toBeVisible()
      if (status === 'unavailable') {
        await expect(page.getByText('Pricing unavailable', { exact: true }).first()).toBeVisible()
        await expect(page.getByText(/0 priced items; 3 unpriced/)).toBeVisible()
      } else {
        await expect(page.getByText('6c', { exact: true }).first()).toBeVisible()
      }
      await page.screenshot({ path: testInfo.outputPath(`${status}-snapshot.png`), fullPage: true })
    })
  }
}

test('group KPIs and rows consistently exclude an expensive item from totals', async ({ page }, testInfo) => {
  await mockCapture(page, 'complete', exclusionItems)
  await page.goto('/dashboard/economy/group')
  await expect(page.getByText('6c', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /Top Item/ })).toContainText('Included currency')
  await expect(page.getByRole('button', { name: /Top Tab/ })).toContainText('Currency')
  await expect(page.getByRole('button', { name: /Top Tab/ })).not.toContainText('Excluded stash')
  await expect(page.getByText('Excluded from totals', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('excluded-snapshot.png'), fullPage: true })
})

for (const route of ['/dashboard/economy', '/dashboard']) {
  for (const status of ['partial', 'unavailable'] as const) {
    test(`${route} distinguishes ${status} valuation from full wealth`, async ({ page }, testInfo) => {
      await mockCapture(page, status, exclusionItems)
      await page.goto(route)
      if (status === 'partial') {
        await expect(page.getByText('Priced subtotal', { exact: true })).toBeVisible()
        await page.getByText('Priced subtotal', { exact: true }).scrollIntoViewIfNeeded()
        await expect(page.getByRole('status').filter({ hasText: 'Partial pricing:' })).toBeVisible()
      } else {
        await expect(page.getByText('Pricing unavailable', { exact: true }).first()).toBeVisible()
        await page.getByText('Pricing unavailable', { exact: true }).first().scrollIntoViewIfNeeded()
      }
      await expect(page.getByRole('main')).toHaveJSProperty('scrollWidth', await page.getByRole('main').evaluate((node) => node.clientWidth))
      await page.screenshot({ path: testInfo.outputPath(`${status}-wealth.png`), fullPage: true })
    })
  }
}
