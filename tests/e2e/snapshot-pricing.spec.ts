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
async function mockCapture(page: Page, status: PricingStatus = 'complete', rows: Item[] = items, divineRate: number | null = null) {
  const captureItems = status === 'unavailable' ? rows.map((item) => ({ ...item, price_chaos: null })) : rows
  const captureSummary = {
    ...summary, status, divine_price: divineRate,
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
  const status = pager.getByRole('status')
  await expect(next).toBeVisible()
  await expect(status).toHaveText('Page 1 of 41')
  const nextBox = (await next.boundingBox())!
  const statusBox = (await status.boundingBox())!
  expect(Math.abs(nextBox.y + nextBox.height / 2 - statusBox.y - statusBox.height / 2)).toBeLessThanOrEqual(1)
  await expect.poll(() => page.getByRole('main').evaluate((main) => main.scrollWidth - main.clientWidth)).toBeLessThanOrEqual(1)
  await next.click()
  await expect(pager.getByRole('status')).toHaveText('Page 2 of 41')
  await page.getByRole('spinbutton', { name: 'Go to page' }).fill('41')
  await page.getByRole('button', { name: 'Go', exact: true }).click()
  await expect(pager.getByRole('status')).toHaveText('Page 41 of 41')
  await expect(next).toBeDisabled()
  await expect(page.getByText('Unpriced keepsake', { exact: true })).toBeVisible()
})

test('wide snapshot pagination and workspace footer span their available width', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'chromium-mobile', 'Exercises the desktop sidebar and wide pager')
  await mockCapture(page)
  await page.setViewportSize({ width: 3440, height: 900 })
  await page.goto(`/dashboard/economy/${userId}`)

  const pager = page.getByRole('navigation', { name: 'Snapshot pages' })
  const first = pager.getByRole('button', { name: 'Go to page 1', exact: true })
  const last = pager.getByRole('button', { name: 'Go to page 41', exact: true })
  const jump = page.getByRole('spinbutton', { name: 'Go to page' })
  await expect(first).toHaveAttribute('aria-current', 'page')
  await expect(jump).toBeVisible()
  const firstBox = (await first.boundingBox())!
  const jumpBox = (await jump.boundingBox())!
  expect(Math.abs(firstBox.y + firstBox.height / 2 - jumpBox.y - jumpBox.height / 2)).toBeLessThanOrEqual(1)

  await last.click()
  await expect(last).toHaveAttribute('aria-current', 'page')
  await expect(page.getByText('Unpriced keepsake', { exact: true })).toBeVisible()

  const footer = page.getByRole('contentinfo')
  await footer.scrollIntoViewIfNeeded()
  await expect(footer).toBeInViewport({ ratio: 0.99 })
  const footerBox = (await footer.boundingBox())!
  const sidebarBox = (await page.getByRole('navigation', { name: 'Primary dashboard' }).boundingBox())!
  expect(footerBox.x).toBeLessThan(sidebarBox.x)
  expect(footerBox.width).toBeGreaterThan(3400)
  await expect(footer).toHaveCSS('border-top-width', '1px')
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

test('member stash filters preserve exclusion meaning and recover from no matches', async ({ page }, testInfo) => {
  await mockCapture(page, 'partial', exclusionItems)
  const date = new Date()
  await page.route('**/rest/v1/snapshot_value_history?*', (route) => route.fulfill({
    json: [
      { id: 'earlier-capture', snapshot_id: null, completed_at: new Date(date.getTime() - 86_400_000).toISOString(), included_chaos_total: 12, excluded_chaos_total: 0, pricing_summary: summary },
      { id: 'current-capture', snapshot_id: 'snapshot', completed_at: date.toISOString(), included_chaos_total: 6, excluded_chaos_total: 100_000, pricing_summary: summary },
    ],
  }))
  const isMobile = testInfo.project.name === 'chromium-mobile'
  await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 })
  await page.goto(`/dashboard/economy/${userId}`)

  const table = page.getByRole('region', { name: 'Snapshot stash items' }).getByRole('table')
  const excluded = table.getByRole('row', { name: /Excluded trophy/ })
  const included = table.getByRole('row', { name: /Included currency/ })
  const excludedTab = excluded.getByRole('button', { name: 'Excluded stash', exact: true })
  await expect(excluded).toBeVisible()
  await expect(excluded).toHaveCSS('opacity', '1')
  await expect(excluded.getByRole('button', { name: 'Include item', exact: true })).toBeVisible()
  await expect(included.getByRole('button', { name: 'Exclude item', exact: true })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: testInfo.outputPath('member-stash-overview.png'), animations: 'disabled' })

  if (isMobile) await excludedTab.tap()
  else await excludedTab.press('Enter')
  await expect(excludedTab).toHaveAttribute('aria-pressed', 'true')
  await expect(excluded.getByRole('button', { name: 'Include item', exact: true })).toBeVisible()
  await expect(included).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('member-stash-selected.png'), animations: 'disabled' })

  const search = page.getByRole('textbox', { name: 'Search items', exact: true })
  await search.fill('nothing matches this')
  const empty = table.getByText('No results match these filters.')
  await expect(empty).toBeVisible()
  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await expect(search).toBeEmpty()
  await expect(search).toBeFocused()
  await expect(excludedTab).toHaveAttribute('aria-pressed', 'true')
  await search.fill('nothing matches this')
  await expect(empty).toBeVisible()
  const clearFilters = table.getByRole('button', { name: 'Clear filters' })
  await clearFilters.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('member-stash-no-results.png'), animations: 'disabled' })
  await clearFilters.click()
  await expect(search).toBeEmpty()
  await expect(search).toBeFocused()
  await expect(excludedTab).toHaveAttribute('aria-pressed', 'false')
  await expect(included).toBeVisible()
})

test('member stash distinguishes pending, failed, and empty captures', async ({ page }, testInfo) => {
  await mockCapture(page, 'complete', [])
  let allowFirstResponse: () => void = () => {}
  const firstResponse = new Promise<void>((resolve) => { allowFirstResponse = resolve })
  let showError = true
  await page.route('**/rest/v1/latest_stash_items?*', async (route) => {
    await firstResponse
    if (showError) return route.fulfill({ status: 500, json: { message: 'Fixture snapshot unavailable' } })
    return route.fulfill({ json: [] })
  })

  const isMobile = testInfo.project.name === 'chromium-mobile'
  await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 })
  try {
    await page.goto(`/dashboard/economy/${userId}`)
    await expect(page.getByRole('status').filter({ hasText: 'Loading stash items' })).toBeAttached()
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: testInfo.outputPath('member-stash-loading.png'), animations: 'disabled' })
  } finally {
    allowFirstResponse()
  }

  const alert = page.getByRole('alert').filter({ hasText: 'Couldn’t load the snapshot' })
  await expect(alert).toBeVisible()
  await alert.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('member-stash-error.png'), animations: 'disabled' })
  showError = false
  await alert.getByRole('button', { name: 'Try again', exact: true }).press('Enter')
  await expect(alert).toHaveCount(0)
  await expect(page.getByText(/no stash items/i)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Snapshot stash items' })).toHaveCount(0)
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

for (const source of ['live', 'snapshot', 'unavailable'] as const) {
  test(`Economy follows the currency preference with ${source} conversion`, async ({ page }, testInfo) => {
    await mockCapture(page, 'complete', [{ ...items[0], price_chaos: 800 }], source === 'unavailable' ? null : 200)
    if (source === 'live') {
      await page.route('**/api/ninja/**', (route) => {
        const type = new URL(route.request().url()).searchParams.get('type')
        return route.fulfill({ json: {
          core: { primary: 'chaos', rates: { divine: 0.01 }, items: [{ id: 'divine', name: 'Divine Orb' }] },
          lines: [],
          items: [],
          ...(type !== 'Currency' && { core: { primary: 'chaos' } }),
        } })
      })
    }
    await page.route('**/rest/v1/group_wealth_history?*', (route) => route.fulfill({
      json: [400, 800].map((wealth, index) => ({
        id: `history-${index}`,
        created_at: index === 0 ? '2026-11-17T22:00:00Z' : '2026-11-18T00:00:00Z',
        total_wealth_chaos: wealth,
        member_count: 1,
        triggered_by_user_id: userId,
        member_wealth_breakdown: [{ user_id: userId, display_name: 'Fixture', total_chaos: wealth }],
        pricing_summary: summary,
      })),
    }))
    await page.goto('/dashboard/economy')

    const mobile = testInfo.project.name === 'chromium-mobile'
    const selectCurrency = async (unit: 'Divine' | 'Chaos') => {
      if (mobile) {
        await page.getByRole('button', { name: 'Account menu', exact: true }).click()
        await page.getByRole('menuitem', { name: `Show amounts in ${unit} Orbs`, exact: true }).click()
      } else {
        await page.getByRole('radio', { name: unit, exact: true }).click()
      }
    }
    const total = page.locator('.workspace-lead-amount')
    const members = page.getByRole('region', { name: 'Member breakdown', exact: true })
    const memberLink = members.getByRole('link', { name: /Fixture/ })
    const memberValue = members.locator('[data-cell="value"]')
    const tabValue = members.locator('[data-cell="tabs"]')
    const rateLabel = source === 'live' ? '1 div = 100c'
      : source === 'snapshot' ? '1 div = 200c · snapshot rate'
        : 'Divine conversion unavailable'
    await expect(page.getByText(rateLabel, { exact: true })).toBeVisible()
    await expect(total).toHaveText('800c')

    await selectCurrency('Divine')
    const rate = source === 'live' ? 100 : 200
    const converted = source !== 'unavailable'
    const displayed = (wealth: number) => converted ? `${(wealth / rate).toFixed(1)} div` : `${wealth}c`
    await expect(total).toHaveText(displayed(800))
    await expect(memberValue).toContainText(displayed(800))
    await expect(tabValue).toContainText(displayed(800))
    await expect(page.getByText(converted ? `${(200 / rate).toFixed(1)} div/hr` : '200 chaos/hr', { exact: true })).toBeVisible()
    await expect(page.getByText(`+${displayed(400)} · +100.0%`, { exact: true })).toBeVisible()

    const chart = page.getByRole('application', { name: `Group wealth in ${converted ? 'divine' : 'chaos'} orbs` })
    await expect(chart.locator('.recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value').first()).toHaveText(converted ? / div$/ : /c$/)
    await chart.focus()
    const tooltip = page.locator('.recharts-tooltip-wrapper').getByRole('status')
    await expect(tooltip).toContainText(`Fixture: ${displayed(400)}`)
    await chart.press('ArrowRight')
    await expect(tooltip).toContainText(`Fixture: ${displayed(800)}`)

    await selectCurrency('Chaos')
    await expect(total).toHaveText('800c')
    await expect(memberValue).toContainText('800c')
    await expect(tabValue).toContainText('800c')
    await expect(page.getByRole('application', { name: 'Group wealth in chaos orbs' })).toBeVisible()

    if (source === 'live' && !mobile) {
      await memberLink.hover()
      await expect(memberLink).toHaveCSS('text-decoration-line', 'none')
      await memberLink.press('Enter')
      await expect(page).toHaveURL(new RegExp(`/dashboard/economy/${userId}$`))
    }
  })
}

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
