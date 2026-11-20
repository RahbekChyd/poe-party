import type { Page } from '@playwright/test'
import { expect, groupId, seedSignedIn, test, user, userId } from './fixture'

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
  await seedSignedIn(page)
  await page.route('**/api/ninja/**', (route) => route.fulfill({ status: 503, body: '{}' }))
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
        await expect(page.getByText('Priced subtotal', { exact: true })).toBeVisible()
        await expect(page.getByText('6c', { exact: true }).first()).toBeVisible()
      }
      await page.screenshot({ path: testInfo.outputPath(`${status}-snapshot.png`), fullPage: true })
    })
  }
}

test('large unfiltered stash pagination fits a compact viewport and reaches the last item', async ({ page }) => {
  await mockCapture(page)
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('/dashboard/economy/group')
  const pager = page.getByRole('navigation', { name: 'Snapshot pages' })
  const next = pager.getByRole('button', { name: 'Next page' })
  await expect(next).toBeVisible()
  await expect(pager.getByRole('status')).toHaveText('Page 1 of 41')
  await expect.poll(() => page.getByRole('main').evaluate((main) => main.scrollWidth - main.clientWidth)).toBeLessThanOrEqual(1)
  await next.click()
  await expect(pager.getByRole('status')).toHaveText('Page 2 of 41')
  await page.getByRole('spinbutton', { name: 'Go to page' }).fill('41')
  await page.getByRole('button', { name: 'Go', exact: true }).click()
  await expect(pager.getByRole('status')).toHaveText('Page 41 of 41')
  await expect(next).toBeDisabled()
  await expect(page.getByText('Unpriced keepsake', { exact: true })).toBeVisible()
})

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

test('stash tables retain readable item and total cells when columns reflow', async ({ page }) => {
  await mockCapture(page, 'complete', exclusionItems)
  for (const [url, regionName] of [
    ['/dashboard/economy/group', 'Group stash items'],
    [`/dashboard/economy/${userId}`, 'Snapshot stash items'],
  ]) {
    await page.setViewportSize({ width: 1366, height: 768 })
    await page.goto(url)
    const region = page.getByRole('region', { name: regionName, exact: true })
    const table = region.getByRole('table')
    const row = table.getByRole('row', { name: /Included currency/ })
    const total = row.getByRole('cell', { name: /^(Total )?6c$/ })
    await expect(total).toBeVisible()
    const sortTotal = table.getByRole('columnheader', { name: 'Total', exact: true })
    await expect(sortTotal).toHaveAttribute('aria-sort', 'descending')
    await sortTotal.getByRole('button', { name: 'Total', exact: true }).click()
    await expect(sortTotal).toHaveAttribute('aria-sort', 'ascending')

    for (const width of [760, 390, 320]) {
      await page.setViewportSize({ width, height: 700 })
      await expect(row.getByText('Included currency', { exact: true })).toBeVisible()
      await expect(total).toBeVisible()
      await expect.poll(() => region.evaluate((node) => node.scrollWidth - node.clientWidth))
        .toBeLessThanOrEqual(1)
    }
  }
})

test('wealth history values and retained summaries support keyboard and pointer input', async ({ page }, testInfo) => {
  await mockCapture(page, 'complete', exclusionItems)
  await page.route('**/rest/v1/snapshot_value_history?*', (route) => route.fulfill({
    json: [
      {
        id: 'older-history',
        snapshot_id: null,
        completed_at: '2026-11-17T12:00:00Z',
        included_chaos_total: 4_200,
        excluded_chaos_total: 0,
        pricing_summary: summary,
      },
      {
        id: 'latest-history',
        snapshot_id: 'snapshot',
        completed_at: '2026-11-18T00:00:00Z',
        included_chaos_total: 6,
        excluded_chaos_total: 0,
        pricing_summary: summary,
      },
    ],
  }))
  await page.goto(`/dashboard/economy/${userId}`)

  const chart = page.getByRole('application', { name: 'Stash wealth in chaos orbs' })
  await chart.focus()
  const tooltip = page.locator('.recharts-tooltip-wrapper').getByRole('status')
  await expect(tooltip).toContainText('4,200c')
  await chart.press('ArrowRight')
  await expect(tooltip).toContainText('6c')

  await page.getByRole('button', { name: 'Select snapshot: Latest snapshot', exact: true }).press('Enter')
  const historical = page.getByRole('menuitemradio').filter({ hasText: 'summary only' })
  await historical.press('Enter')
  await expect(page).toHaveURL(/historyId=older-history/)
  await expect(page.getByText(/Summary value and strategy link are still preserved/)).toBeVisible()

  await page.getByRole('button', { name: 'Back to latest' }).press('Enter')
  await expect(page).not.toHaveURL(/historyId=/)
  const point = chart.locator('.recharts-area-dots g[aria-hidden="true"]').first()
  if (testInfo.project.name === 'chromium-mobile') await point.tap()
  else await point.click()
  await expect(page).toHaveURL(/historyId=older-history/)
})

test('Economy keeps the value intact and restores snapshot schedule focus', async ({ page }) => {
  await mockCapture(page, 'complete', [{ ...items[0], price_chaos: 123_456_789 }])
  await page.goto('/dashboard/economy')
  const amount = page.getByRole('region', { name: 'Member breakdown', exact: true })
    .getByRole('row', { name: /Fixture/ }).getByText('123,456,789c', { exact: true }).first()
  for (const width of [1440, 1024, 320]) {
    await page.setViewportSize({ width, height: 720 })
    await expect(amount).toBeVisible()
    await expect.poll(() => amount.evaluate((node) => {
      const range = document.createRange()
      range.selectNodeContents(node)
      const rects = range.getClientRects()
      const cell = node.closest('td')?.getBoundingClientRect()
      return rects.length === 1 && !!cell && rects[0].right <= cell.right + 1
    })).toBe(true)
  }
  const trigger = page.getByRole('button', { name: 'Snapshot schedule', exact: true })
  await trigger.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Snapshot schedule', exact: true })
  await expect(dialog.getByRole('button', { name: 'Manual only', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByRole('button', { name: 'Mix', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
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
