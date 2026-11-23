import type { Locator, Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { expect, groupId, test, userId } from './fixture'
import { activeLayoutsPobXml, mockAnalysisRuns, profileId } from './ui-data'

const firstSyncTime = '2026-11-19T10:00:00Z'
const laterSyncTime = '2026-11-22T17:30:00Z'
const currentStats = '12% increased Attack Speed'
const masteryStats = '8% increased maximum Life'

function mapNode(skill: number, name: string, orbitIndex: number, options: Record<string, unknown> = {}) {
  return { skill, name, group: 1, orbit: 1, orbitIndex, out: [100], ...options }
}

const treeDataset = {
  min_x: -500, min_y: -400, max_x: 500, max_y: 400,
  constants: { orbitRadii: [0, 160], skillsPerOrbit: [1, 6] },
  groups: {
    1: { x: 0, y: 0, nodes: [100, 101, 102, 103, 105, 108, 109] },
    2: { x: 280, y: 80, nodes: [110] },
  },
  nodes: {
    100: { skill: 100, name: 'Shared route', group: 1, orbit: 0, orbitIndex: 0, out: [101, 102, 110], stats: ['+10 to Strength'] },
    101: mapNode(101, 'Saved Attack Speed', 1, { stats: [currentStats] }),
    102: mapNode(102, 'Target Cast Speed', 2, { stats: ['10% increased Cast Speed'] }),
    103: mapNode(103, 'Saved Life Mastery', 3, { isMastery: true, masteryEffects: [{ effect: 7, stats: [masteryStats] }] }),
    105: mapNode(105, 'Target Life Mastery', 4, { isMastery: true, masteryEffects: [{ effect: 7, stats: [masteryStats] }] }),
    108: mapNode(108, 'Modified Allocated Node', 5, { stats: ['+10 to Intelligence'] }),
    109: mapNode(109, 'Cluster Socket', 0, { isJewelSocket: true, isClusterSocket: true }),
    110: { skill: 110, name: 'Later Synced Spell Damage', group: 2, orbit: 0, orbitIndex: 0, out: [100], stats: ['8% increased Spell Damage'] },
  },
}

const savedCurrent = {
  tree_version: '3_30',
  variant: 'standard',
  class_id: 3,
  ascendancy_id: 0,
  allocation_ids: [100, 101, 103, 108, 109],
  mastery_effects: { 103: 7 },
  cluster_sockets: [{ node_id: 109, name: 'Fixture Large Cluster Jewel' }],
  modified_nodes: [108],
  cluster_allocation_ids: [65540],
  unresolved_node_ids: [49999],
}
const savedTarget = {
  tree_version: '3_30',
  variant: 'standard',
  class_id: 3,
  ascendancy_id: 0,
  allocation_ids: [100, 102, 105, 108, 109],
  mastery_effects: { 105: 7 },
  cluster_sockets: [],
  modified_nodes: [],
  cluster_allocation_ids: [],
  unresolved_node_ids: [],
}

async function mockPassiveMap(page: Page, failFirst = false) {
  let requests = 0
  await page.route('https://raw.githubusercontent.com/grindinggear/skilltree-export/**', (route) => {
    requests += 1
    return failFirst && requests === 1
      ? route.fulfill({ status: 503, json: { message: 'Fixture dataset unavailable' } })
      : route.fulfill({ json: treeDataset })
  })
  return () => requests
}

async function mockProfileSync(page: Page, characterId: string, alreadySynced = false) {
  let synced = alreadySynced
  let lastProfileResponse: string | undefined
  await page.route('**/rest/v1/character_profile_snapshots?*', (route) => {
    lastProfileResponse = synced ? laterSyncTime : firstSyncTime
    return route.fulfill({ json: [{
      id: profileId, user_id: userId, group_id: groupId, character_id: characterId,
      character_name: 'Fixture Witch', league: 'Covens', class: 'Witch', level: 91,
      visibility: 'private', gear: [], inventory: [], jewels: [],
      passive_tree: {
        metadata: { version: '3_30' },
        passives: {
          hashes: synced ? [100, 102, 105, 110] : savedCurrent.allocation_ids,
          mastery_effects: synced ? { 105: 7 } : savedCurrent.mastery_effects,
        },
      },
      raw_character: synced ? { passive_tree: { passives: {
        alternate_ascendancy: 'Fixture Bloodline',
        hashes_ex: [65544],
        jewel_data: { 2: { type: 'Fixture legacy Cluster Jewel', subgraph: { nodes: { 65544: {} } } } },
      } } } : {},
      last_synced_at: lastProfileResponse,
    }] })
  })
  return {
    syncAgain: () => { synced = true },
    lastProfileResponse: () => lastProfileResponse,
  }
}

async function openTreeDetails(page: Page) {
  const trigger = page.getByRole('button', { name: 'View tree details', exact: true })
  await trigger.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Passive tree details', exact: true })
  await expect(dialog).toBeVisible()
  const button = (name: string) => dialog.getByRole('button', { name, exact: true })
  const map = dialog.locator('svg[aria-label="Passive tree comparison map"]')
  return { trigger, dialog, button, map }
}

async function expectDialogContained(dialog: Locator) {
  const box = await dialog.boundingBox()
  const viewport = dialog.page().viewportSize()
  expect(box?.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1)
  const overflow = await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
}

async function moveTouchMap(page: Page, map: Locator) {
  await map.scrollIntoViewIfNeeded()
  const box = (await map.boundingBox())!
  const x = Math.round(box.x + box.width / 2)
  const y = Math.round(box.y + box.height / 2)
  const cdp = await page.context().newCDPSession(page)
  try {
    const beforeDrag = await map.getAttribute('viewBox')
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 0 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 36, y: y + 24, id: 0 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect.poll(() => map.getAttribute('viewBox')).not.toBe(beforeDrag)

    const cameraWidth = async () => Number((await map.getAttribute('viewBox'))?.trim().split(/[ ,]+/)[2])
    const widthBeforePinch = await cameraWidth()
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x - 24, y, id: 0 }, { x: x + 24, y, id: 1 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 64, y, id: 0 }, { x: x + 64, y, id: 1 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect.poll(cameraWidth).toBeLessThan(widthBeforePinch)
  } finally {
    await cdp.detach()
  }
}

async function moveMouseMap(page: Page, map: Locator) {
  await map.scrollIntoViewIfNeeded()
  const box = (await map.boundingBox())!
  const cursor = { x: box.x + box.width * 0.72, y: box.y + box.height * 0.4 }
  const projectCursor = () => map.evaluate((svg: SVGSVGElement, point) => {
    const { x, y } = new DOMPoint(point.x, point.y).matrixTransform(svg.getScreenCTM()!.inverse())
    return { x, y }
  }, cursor)

  const baseCamera = await map.getAttribute('viewBox')
  const worldBeforeZoom = await projectCursor()
  await page.mouse.move(cursor.x, cursor.y)
  await page.mouse.wheel(0, -220)
  await expect.poll(() => map.getAttribute('viewBox')).not.toBe(baseCamera)
  const worldAfterZoom = await projectCursor()
  expect(Math.hypot(worldAfterZoom.x - worldBeforeZoom.x, worldAfterZoom.y - worldBeforeZoom.y)).toBeLessThan(2)

  const cameraBeforeDrag = await map.getAttribute('viewBox')
  await page.mouse.down()
  await page.mouse.move(cursor.x - 35, cursor.y + 20, { steps: 4 })
  await page.mouse.up()
  await expect.poll(() => map.getAttribute('viewBox')).not.toBe(cameraBeforeDrag)
}

test('saved passive details recover a failed dataset and keep map, keyboard, and filters in sync after another sync', async ({ page }, testInfo) => {
  const { completedId, characterId, markCompletedRunStale } = await mockAnalysisRuns(page, {
    completedSummary: { passive_tree_comparison: { version: 1, current: savedCurrent, target: savedTarget } },
  })
  const profile = await mockProfileSync(page, characterId)
  const mapRequests = await mockPassiveMap(page, true)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto(`/dashboard/analysis/runs/${completedId}`)
  const { trigger, dialog, map, button } = await openTreeDetails(page)
  await expect(dialog.getByText('Saved run snapshot', { exact: true })).toHaveCount(2)
  await button('Retry loading tree map').press('Enter')
  await expect(map).toBeVisible()
  await expect(map).toBeInViewport({ ratio: 0.98 })
  await expect.poll(mapRequests).toBe(2)
  await expectDialogContained(dialog)
  await expect(button('Overlay')).toHaveAttribute('aria-pressed', 'true')
  await expect(button('In target')).toBeVisible()
  await expect(button('In current tree')).toBeVisible()
  await expect(button('Mastery changes')).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Needs review' })).toBeVisible()
  await expect(dialog.getByText(/cluster jewel/i).first()).toBeVisible()
  await expect(dialog.getByText(/modified/i).first()).toBeVisible()
  await expect(dialog.getByText(/49999/).first()).toBeVisible()

  const isMobile = testInfo.project.name === 'chromium-mobile'
  const currentRow = button('Saved Attack Speed')
  const targetRow = button('Target Cast Speed')
  const mapBox = (await map.boundingBox())!
  const rowBox = (await targetRow.boundingBox())!
  if (isMobile) expect(mapBox.y + mapBox.height).toBeLessThanOrEqual(rowBox.y)
  else expect(mapBox.x + mapBox.width <= rowBox.x || rowBox.x + rowBox.width <= mapBox.x).toBe(true)
  await dialog.screenshot({ path: testInfo.outputPath('passive-tree-overlay.png'), animations: 'disabled' })

  await currentRow.press('Enter')
  await expect(currentRow).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByText(currentStats, { exact: true })).toBeVisible()
  await expect(dialog.getByRole('link', { name: /Node 101.*Official tree export/ })).toBeVisible()
  const centeredCamera = await map.getAttribute('viewBox')
  const [viewX, viewY, viewWidth, viewHeight] = centeredCamera!.split(' ').map(Number)
  const selectedMapNode = button('Select Saved Attack Speed on map')
  await expect(selectedMapNode).toHaveAttribute('aria-pressed', 'true')
  const nodeCenter = await selectedMapNode.evaluate((node: SVGGElement) => {
    const { x, y, width, height } = node.getBBox()
    return { x: x + width / 2, y: y + height / 2 }
  })
  expect(viewX + viewWidth / 2).toBeCloseTo(nodeCenter.x, 3)
  expect(viewY + viewHeight / 2).toBeCloseTo(nodeCenter.y, 3)
  await button('Current').press('Enter')
  await expect(map).toHaveAttribute('viewBox', centeredCamera!)
  await expect(button('Select Target Cast Speed on map')).toHaveCount(0)
  await button('Target').press('Enter')
  await expect(map).toHaveAttribute('viewBox', centeredCamera!)
  await button('Overlay').press('Enter')
  await expect(map).toHaveAttribute('viewBox', centeredCamera!)
  await button('Fit changes').press('Enter')
  await expect.poll(() => map.getAttribute('viewBox')).not.toBe(centeredCamera)
  await expect(currentRow).toHaveAttribute('aria-pressed', 'true')
  await button('Reset view').press('Enter')
  await expect(currentRow).toHaveAttribute('aria-pressed', 'true')

  await button('In target').press('Enter')
  await expect(currentRow).toHaveCount(0)
  await expect(button('Select Saved Attack Speed on map')).toHaveCount(0)
  await button('Select Target Cast Speed on map').click()
  await expect(targetRow).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByText(currentStats, { exact: true })).toHaveCount(0)
  await button('Mastery changes').press('Enter')
  await expect(button('Saved Life Mastery')).toBeVisible()
  await expect(button('Target Life Mastery')).toBeVisible()
  await expect(targetRow).toHaveCount(0)

  await button('Reset view').press('Enter')
  const baseCamera = await map.getAttribute('viewBox')
  await map.press('ArrowRight')
  await expect.poll(() => map.getAttribute('viewBox')).not.toBe(baseCamera)
  const keyboardCamera = await map.getAttribute('viewBox')
  await button('Zoom in').press('Enter')
  await expect.poll(() => map.getAttribute('viewBox')).not.toBe(keyboardCamera)
  await button('Zoom out').press('Enter')
  if (isMobile) {
    await moveTouchMap(page, map)
  } else {
    await moveMouseMap(page, map)
  }
  const mobileOrDesktopAccessibility = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(mobileOrDesktopAccessibility.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')).toEqual([])

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
  profile.syncAgain()
  markCompletedRunStale()
  await page.reload()
  await expect.poll(profile.lastProfileResponse).toBe(laterSyncTime)
  await expect(page.getByText('Historical recommendations', { exact: true })).toBeVisible()
  await openTreeDetails(page)
  await expect(dialog.getByText('Saved run snapshot', { exact: true })).toHaveCount(2)
  await expect(currentRow).toBeVisible()
  await expect(button('Later Synced Spell Damage')).toHaveCount(0)
  expect(pageErrors).toEqual([])
})

test('an older analysis identifies its latest sync and compares the tree at the recorded export position', async ({ page }) => {
  const { completedId, characterId } = await mockAnalysisRuns(page, {
    targetXml: activeLayoutsPobXml,
    savedStage: { tree_spec_id: 'tree-spec:1' },
    completedSummary: {
      resolved_tree_spec_id: 2,
      compare_power_report: {
        available: true,
        metric_label: 'Hit DPS',
        rows: [{ category: 'tree_node', name: 'Historical passive score', impact: 1250, node_id: 101 }],
      },
    },
  })
  await mockProfileSync(page, characterId, true)
  await mockPassiveMap(page)
  await page.goto(`/dashboard/analysis/runs/${completedId}`)
  await page.getByText('PoB scores from this run', { exact: true }).click()
  const score = page.getByText('Historical passive score', { exact: true })
  await expect(score).toBeVisible()
  const { trigger, dialog, map, button } = await openTreeDetails(page)
  await expect(dialog.getByText('Latest synced character', { exact: true })).toBeVisible()
  await expect(dialog.getByText('Recorded target layout', { exact: true })).toBeVisible()
  await expect(dialog.locator(`time[datetime="${laterSyncTime}"]`)).toBeVisible()
  await expect(map).toBeVisible()
  await expect(dialog.getByText(/Fixture legacy Cluster Jewel/)).toBeVisible()
  await expect(button('Later Synced Spell Damage')).toBeVisible()
  await expect(button('Saved Attack Speed')).toHaveCount(0)
  await button('In target').click()
  await expect(dialog.getByText('No differences in this filter.', { exact: true })).toBeVisible()

  await dialog.getByText('Compare another tree', { exact: true }).click()
  const coordinates = Buffer.from([0, 0, 0, 6, 3, 0, 2, 0, 100, 0, 101, 0, 0]).toString('base64url')
  await dialog.getByRole('textbox', { name: 'Current tree link' }).fill(
    `https://www.pathofexile.com/passive-skill-tree/3.30.0/${coordinates}`,
  )
  await button('Apply tree link').click()
  await expect(dialog.getByText('Pasted tree link', { exact: true })).toBeVisible()
  await expect(dialog.getByText('Historical passive score', { exact: true })).toHaveCount(0)
  await button('All changes').click()
  await expect(button('Saved Attack Speed')).toBeVisible()
  await button('Close').click()
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await expect(score).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Build insights' })
    .getByText('Latest synced character', { exact: true })).toBeVisible()
  await openTreeDetails(page)
  await expect(dialog.getByText('Latest synced character', { exact: true })).toBeVisible()
  await expect(button('Later Synced Spell Damage')).toBeVisible()
  await expect(button('Saved Attack Speed')).toHaveCount(0)
})

test('an older analysis labels the saved target used when the run has no recorded position', async ({ page }) => {
  const { completedId, characterId } = await mockAnalysisRuns(page, {
    targetXml: activeLayoutsPobXml, savedStage: { tree_spec_id: 'tree-spec:1' },
  })
  await mockProfileSync(page, characterId, true)
  await mockPassiveMap(page)
  await page.goto(`/dashboard/analysis/runs/${completedId}`)
  const { dialog, map, button } = await openTreeDetails(page)
  await expect(dialog.getByText('Current saved target', { exact: true })).toBeVisible()
  await expect(map).toBeVisible()
  await expect(button('Saved Attack Speed')).toBeVisible()
})

test('incompatible passive versions present a review state without drawing a mismatched map', async ({ page }) => {
  const { completedId } = await mockAnalysisRuns(page, {
    completedSummary: { passive_tree_comparison: {
      version: 1, current: { ...savedCurrent, tree_version: '3_29' }, target: savedTarget,
    } },
  })
  const countMapRequests = await mockPassiveMap(page)
  await page.goto(`/dashboard/analysis/runs/${completedId}`)
  const { dialog, map } = await openTreeDetails(page)
  await expect(dialog.getByText(/incompatible|different passive tree versions/i).first()).toBeVisible()
  await expect(map).toHaveCount(0)
  await expect(dialog.getByText('Compare another tree', { exact: true })).toBeVisible()
  expect(countMapRequests()).toBe(0)
})
