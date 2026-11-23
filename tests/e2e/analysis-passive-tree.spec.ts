import type { Locator, Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { expect, groupId, test, userId } from './fixture'
import { activeLayoutsPobXml, mockAnalysisRuns, profileId } from './ui-data'

const firstSyncTime = '2026-11-19T10:00:00Z'
const laterSyncTime = '2026-11-22T17:30:00Z'
const currentStats = '12% increased Attack Speed'
const masteryStats = '8% increased maximum Life'
const clusterNote = 'Cluster jewel passives aren’t included in this comparison.'

function mapNode(skill: number, name: string, orbitIndex: number, options: Record<string, unknown> = {}) {
  return { skill, name, group: 1, orbit: 1, orbitIndex, out: [100], ...options }
}

const treeDataset = {
  min_x: -2000, min_y: -1800, max_x: 2000, max_y: 1800,
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

const spriteIcon = 'Art/2DArt/SkillIcons/passives/fixture.png'
const spritePrefix = 'https://web.poecdn.com/image/passive-skill/'
const activeSprite = `${spritePrefix}skills-1.jpg?aabbccdd`
const inactiveSprite = `${spritePrefix}skills-disabled-1.jpg?eeff0011`
const spriteSheet = (filename: string) => ({
  '0.2109': {
    filename,
    w: 14,
    h: 14,
    coords: { [spriteIcon]: { x: 0, y: 0, w: 14, h: 14 } },
  },
})
const artTreeDataset = {
  ...treeDataset,
  imageZoomLevels: [0.2109],
  nodes: Object.fromEntries(
    Object.entries(treeDataset.nodes).map(([id, node]) => [id, { ...node, icon: spriteIcon }]),
  ),
  sprites: { normalActive: spriteSheet(activeSprite), normalInactive: spriteSheet(inactiveSprite) },
}

async function mockPassiveMap(page: Page, failFirst = false, dataset: object = treeDataset) {
  let requests = 0
  await page.route(
    /^https:\/\/raw\.githubusercontent\.com\/grindinggear\/skilltree-export\/[^/]+\/[^/]+\.json$/,
    (route) => {
      requests += 1
      return failFirst && requests === 1
        ? route.fulfill({ status: 503, json: { message: 'Fixture dataset unavailable' } })
        : route.fulfill({ json: dataset })
    },
  )
  return () => requests
}

async function mockTreeSprites(page: Page, unavailable = false) {
  const requests: string[] = []
  await page.route(`${spritePrefix}**`, (route) => {
    const url = route.request().url()
    requests.push(url)
    if (unavailable) return route.fulfill({ status: 503, headers: { 'Access-Control-Allow-Origin': '*' } })
    const color = url === activeSprite ? '#ff0055' : '#00aa88'
    return route.fulfill({
      contentType: 'image/svg+xml',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14"><circle cx="7" cy="7" r="6" fill="${color}"/></svg>`,
    })
  })
  return { requests, restore: () => { unavailable = false } }
}

async function expectPaintedFixture(art: Locator) {
  await expect(art).toBeVisible()
  await expect.poll(() => art.evaluate((canvas: HTMLCanvasElement) => {
    const surface = canvas.getContext('2d')
    if (!surface || !canvas.width || !canvas.height) return false
    const pixels = surface.getImageData(0, 0, canvas.width, canvas.height).data
    for (let offset = 0; offset < pixels.length; offset += 4) {
      if (pixels[offset] > 215 && pixels[offset + 1] < 35 && pixels[offset + 2] > 55 && pixels[offset + 3] > 100) {
        return true
      }
    }
    return false
  })).toBe(true)
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

type TreeMenu = 'Filter changes' | 'Map options'

function treeMenu(dialog: Locator, name: TreeMenu) {
  const trigger = dialog.getByRole('button', { name, exact: true })
  const menu = dialog.page().getByRole('menu', { name, exact: true })
  const item = (label: string) => menu.getByRole(name === 'Filter changes' ? 'menuitemradio' : 'menuitem', {
    name: new RegExp(`^${label}(?:\\s|$)`),
  })
  return {
    trigger,
    menu,
    item,
    async choose(label: string) {
      await trigger.click()
      await item(label).click()
      await expect(menu).not.toBeVisible()
    },
  }
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
  const filter = treeMenu(dialog, 'Filter changes')
  const options = treeMenu(dialog, 'Map options')
  await expect(filter.trigger).toBeInViewport({ ratio: 1 })
  await expect(options.trigger).toBeInViewport({ ratio: 1 })
  await expect(button('Fit changes')).toBeInViewport({ ratio: 1 })
  await expect(filter.menu).not.toBeVisible()
  await expect(options.menu).not.toBeVisible()
  await filter.trigger.press('Enter')
  await expect(filter.item('All changes')).toHaveAttribute('aria-checked', 'true')
  await expect(filter.item('All changes')).toBeFocused()
  await expect(filter.menu).toBeInViewport({ ratio: 1 })
  await expect(filter.item('In target')).toBeVisible()
  await expect(filter.item('In current tree')).toBeVisible()
  await expect(filter.item('Mastery changes')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(filter.menu).not.toBeVisible()
  await expect(filter.trigger).toBeFocused()
  await options.trigger.press('Enter')
  await expect(options.item('Overlay')).toHaveAccessibleDescription('Selected view')
  await expect(options.menu).toBeInViewport({ ratio: 1 })
  await page.keyboard.press('Escape')
  await expect(options.menu).not.toBeVisible()
  await expect(options.trigger).toBeFocused()

  const isMobile = testInfo.project.name === 'chromium-mobile'
  const currentRow = button('Saved Attack Speed')
  const targetRow = button('Target Cast Speed')
  const changes = dialog.getByRole('region', { name: 'Tree changes', exact: true })
  await expect(changes.getByText(clusterNote, { exact: true })).toBeVisible()
  await expect(changes.getByText('4 nodes', { exact: true })).toBeVisible()
  await expect(dialog.getByText('Fixture Large Cluster Jewel', { exact: true })).toHaveCount(0)
  const mapBox = (await map.boundingBox())!
  const rowBox = (await targetRow.boundingBox())!
  if (isMobile) expect(mapBox.y + mapBox.height).toBeLessThanOrEqual(rowBox.y)
  else expect(mapBox.x + mapBox.width <= rowBox.x || rowBox.x + rowBox.width <= mapBox.x).toBe(true)
  await expect(currentRow.locator('svg.lucide-minus')).toBeVisible()
  await expect(targetRow.locator('svg.lucide-plus')).toBeVisible()
  // A horizontal SVG line has a zero-height geometry box even when its stroke is visible.
  await expect(button('Select Saved Attack Speed on map').locator('svg.lucide-minus')).toHaveCount(1)
  await expect(button('Select Saved Attack Speed on map').locator('circle[stroke-dasharray]')).toHaveCount(1)
  await expect(button('Select Target Cast Speed on map').locator('svg.lucide-plus')).toHaveCount(1)
  await expect(button('Select Target Life Mastery on map').locator('svg.lucide-gem')).toHaveCount(1)
  await dialog.screenshot({ path: testInfo.outputPath('passive-tree-overlay.png'), animations: 'disabled' })

  const review = dialog.getByRole('region', { name: 'Needs review' })
  await expect(review.getByRole('button', { name: /cluster socket/i })).toHaveCount(0)
  await expect(review.getByRole('heading', { name: 'Modified nodes', exact: true })).toBeVisible()
  await expect(review.getByRole('heading', { name: 'Unknown node IDs', exact: true })).toBeVisible()
  await expect(review.getByText(/49999/)).toBeVisible()
  await expect(review.getByRole('button', { name: /49999/ })).toHaveCount(0)
  await expect(review.getByRole('link', { name: 'Open current tree', exact: true }))
    .toHaveAttribute('href', /^https:\/\/www\.pathofexile\.com\/(?:fullscreen-)?passive-skill-tree\//)
  await review.screenshot({ path: testInfo.outputPath('passive-tree-review.png'), animations: 'disabled' })
  await review.getByRole('button', { name: 'Locate on map (Modified Allocated Node)', exact: true }).press('Enter')
  await expect(map).toBeFocused()
  await expect(options.trigger).toBeInViewport({ ratio: 1 })
  const reviewPin = map.locator('[data-review-node-id="108"]')
  await expect(reviewPin).toBeInViewport({ ratio: 1 })
  const pinBox = (await reviewPin.boundingBox())!
  const focusedMapBox = (await map.boundingBox())!
  expect(pinBox.x + pinBox.width / 2).toBeCloseTo(focusedMapBox.x + focusedMapBox.width / 2, 0)
  expect(pinBox.y + pinBox.height / 2).toBeCloseTo(focusedMapBox.y + focusedMapBox.height / 2, 0)
  await expect(dialog.getByRole('status').filter({ hasText: 'Modified Allocated Node' })).toBeVisible()
  await dialog.screenshot({ path: testInfo.outputPath('passive-tree-review-location.png'), animations: 'disabled' })
  await button('Dismiss map marker').press('Enter')
  await expect(reviewPin).toHaveCount(0)
  await expect(map).toBeFocused()

  for (let count = 0; count < 3; count++) await button('Zoom out').press('Enter')
  const zoomedOutWidth = Number((await map.getAttribute('viewBox'))!.split(' ')[2])
  await currentRow.press('Enter')
  await expect(currentRow).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByText(currentStats, { exact: true })).toBeVisible()
  await expect(dialog.getByRole('link', { name: /Node 101.*Official tree export/ })).toBeVisible()
  const centeredCamera = await map.getAttribute('viewBox')
  const [viewX, viewY, viewWidth, viewHeight] = centeredCamera!.split(' ').map(Number)
  expect(viewWidth).toBeLessThan(zoomedOutWidth)
  await expect(dialog.getByText('Allocated', { exact: true })).toBeVisible()
  await expect(dialog.getByText('Unallocated', { exact: true })).toBeVisible()
  await dialog.screenshot({ path: testInfo.outputPath('passive-tree-focused.png'), animations: 'disabled' })
  if (isMobile) {
    await button('Show on map').press('Enter')
    await expect(map).toBeFocused()
  }
  const selectedMapNode = button('Select Saved Attack Speed on map')
  await expect(selectedMapNode).toHaveAttribute('aria-pressed', 'true')
  const nodeCenter = await selectedMapNode.evaluate((node: SVGGElement) => {
    const { x, y, width, height } = node.getBBox()
    return { x: x + width / 2, y: y + height / 2 }
  })
  expect(viewX + viewWidth / 2).toBeCloseTo(nodeCenter.x, 3)
  expect(viewY + viewHeight / 2).toBeCloseTo(nodeCenter.y, 3)
  await options.choose('Current')
  await expect(map).toHaveAttribute('viewBox', centeredCamera!)
  await expect(button('Select Target Cast Speed on map')).toHaveCount(0)
  await options.choose('Target')
  await expect(map).toHaveAttribute('viewBox', centeredCamera!)
  await options.choose('Overlay')
  await expect(map).toHaveAttribute('viewBox', centeredCamera!)
  await button('Fit changes').press('Enter')
  await expect.poll(() => map.getAttribute('viewBox')).not.toBe(centeredCamera)
  await expect(currentRow).toHaveAttribute('aria-pressed', 'true')
  await options.choose('Reset view')
  await expect(currentRow).toHaveAttribute('aria-pressed', 'true')

  await filter.choose('In target')
  await expect(currentRow).toHaveCount(0)
  await expect(button('Select Saved Attack Speed on map')).toHaveCount(0)
  await button('Select Target Cast Speed on map').click()
  await expect(targetRow).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByText(currentStats, { exact: true })).toHaveCount(0)
  await filter.choose('Mastery changes')
  await expect(button('Saved Life Mastery')).toBeVisible()
  await expect(button('Target Life Mastery')).toBeVisible()
  await expect(targetRow).toHaveCount(0)

  await options.choose('Reset view')
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

test('Game art lazily paints official sprites while preserving the tree camera and comparison', async ({ page }, testInfo) => {
  const { completedId } = await mockAnalysisRuns(page, {
    completedSummary: { passive_tree_comparison: { version: 1, current: savedCurrent, target: savedTarget } },
  })
  const mapRequests = await mockPassiveMap(page, false, artTreeDataset)
  const sprites = await mockTreeSprites(page)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto(`/dashboard/analysis/runs/${completedId}`)
  const { dialog, map, button } = await openTreeDetails(page)
  const options = treeMenu(dialog, 'Map options')
  const art = map.locator('canvas[data-passive-tree-art]')
  await expect(map).toHaveAttribute('data-appearance', 'contrast')
  await expect(options.trigger).toBeInViewport({ ratio: 1 })
  await expect(options.trigger).toHaveAccessibleDescription('Overlay, High contrast')
  await expect(map).toBeInViewport({ ratio: 0.98 })

  const currentRow = button('Saved Attack Speed')
  await currentRow.press('Enter')
  await options.choose('Current')
  await button('Zoom in').press('Enter')
  const retainedCamera = await map.getAttribute('viewBox')
  const selectedNode = button('Select Saved Attack Speed on map')
  const selectionRing = selectedNode.locator('circle[fill="none"]')
  await expect(selectedNode).toHaveAttribute('aria-pressed', 'true')
  await expect(selectionRing).toHaveAttribute('stroke-dasharray', '3 2')
  await expect(art).toHaveCount(0)
  expect(sprites.requests).toEqual([])
  await dialog.screenshot({ path: testInfo.outputPath('passive-tree-high-contrast.png'), animations: 'disabled' })

  await options.choose('Game art')
  await expect(options.trigger).toHaveAccessibleDescription('Current, Game art')
  await expect(map).toHaveAttribute('data-appearance', 'game')
  await expectPaintedFixture(art)
  await expect.poll(() => map.evaluate((svg: SVGSVGElement) => {
    const artBounds = svg.querySelector('foreignObject:has(canvas[data-passive-tree-art])')?.getBoundingClientRect()
    return artBounds !== undefined &&
      Math.abs(artBounds.width - svg.clientWidth) < 2 &&
      Math.abs(artBounds.height - svg.clientHeight) < 2
  })).toBe(true)
  await expect(map).toHaveAttribute('viewBox', retainedCamera!)
  await expect(currentRow).toHaveAttribute('aria-pressed', 'true')
  await expect(selectedNode).toHaveAttribute('aria-pressed', 'true')
  await expect(selectionRing).toHaveCount(0)
  await expect(currentRow.locator('svg.lucide-minus')).toBeVisible()
  await expect(button('Select Target Cast Speed on map')).toHaveCount(0)
  expect(sprites.requests).toContain(activeSprite)
  expect(sprites.requests).toContain(inactiveSprite)
  expect(mapRequests()).toBe(1)
  await expectDialogContained(dialog)
  await dialog.screenshot({ path: testInfo.outputPath('passive-tree-game-art.png'), animations: 'disabled' })

  const accessibility = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(accessibility.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')).toEqual([])

  await options.choose('Overlay')
  await expect(map).toHaveAttribute('viewBox', retainedCamera!)
  await expect(button('Select Target Cast Speed on map')).toBeVisible()
  await expect(button('Select Target Life Mastery on map')).toBeVisible()
  await expect(map.locator('circle[stroke-dasharray]')).toHaveCount(0)
  await expect(map.locator('[data-node-id] circle[fill="none"]')).toHaveCount(0)
  const treeMap = dialog.getByRole('region', { name: 'Tree map', exact: true })
  await expect(treeMap.locator('svg.lucide-minus, svg.lucide-plus, svg.lucide-gem')).toHaveCount(0)
  await map.press('ArrowRight')
  await expect.poll(() => map.getAttribute('viewBox')).not.toBe(retainedCamera)
  await expectPaintedFixture(art)
  await button('Select Target Cast Speed on map').click()
  await expect(button('Target Cast Speed')).toHaveAttribute('aria-pressed', 'true')
  const targetCamera = await map.getAttribute('viewBox')
  await options.choose('High contrast')
  await expect(map).toHaveAttribute('data-appearance', 'contrast')
  await expect(options.trigger).toHaveAccessibleDescription('Overlay, High contrast')
  await expect(art).toHaveCount(0)
  await expect(map).toHaveAttribute('viewBox', targetCamera!)
  await expect(button('Select Target Cast Speed on map')).toHaveAttribute('aria-pressed', 'true')
  await expect(button('Select Target Cast Speed on map').locator('svg.lucide-plus')).toHaveCount(1)
  await expect(selectionRing).toHaveAttribute('stroke-dasharray', '3 2')
  expect(pageErrors).toEqual([])
})

test('Game art can retry failed images while the comparison stays usable', async ({ page }) => {
  const { completedId } = await mockAnalysisRuns(page, {
    completedSummary: { passive_tree_comparison: { version: 1, current: savedCurrent, target: savedTarget } },
  })
  await mockPassiveMap(page, false, artTreeDataset)
  const sprites = await mockTreeSprites(page, true)
  await page.goto(`/dashboard/analysis/runs/${completedId}`)
  const { dialog, map, button } = await openTreeDetails(page)
  const art = map.locator('canvas[data-passive-tree-art]')
  await treeMenu(dialog, 'Map options').choose('Game art')
  await expect(dialog.getByText(/Game art unavailable/)).toBeVisible()
  await expect(art).toHaveCount(0)
  const mapNode = button('Select Saved Attack Speed on map')
  await expect(mapNode.locator('circle[fill="none"]')).toHaveCount(0)
  await expect(mapNode.locator('svg')).toHaveCount(0)
  await mapNode.click()
  await expect(button('Saved Attack Speed')).toHaveAttribute('aria-pressed', 'true')
  const retainedCamera = await map.getAttribute('viewBox')

  sprites.restore()
  await button('Retry game art').click()
  await expectPaintedFixture(art)
  await expect(button('Retry game art')).toHaveCount(0)
  await expect(map).toHaveAttribute('viewBox', retainedCamera!)
  await expect(button('Select Saved Attack Speed on map')).toHaveAttribute('aria-pressed', 'true')
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
  const changes = dialog.getByRole('region', { name: 'Tree changes', exact: true })
  await expect(changes.getByText(clusterNote, { exact: true })).toBeVisible()
  await expect(dialog.getByText('Fixture legacy Cluster Jewel', { exact: true })).toHaveCount(0)
  await expect(button('Later Synced Spell Damage')).toBeVisible()
  await expect(button('Saved Attack Speed')).toHaveCount(0)
  const filter = treeMenu(dialog, 'Filter changes')
  await filter.choose('In target')
  await expect(dialog.getByText('No differences in this filter.', { exact: true })).toBeVisible()

  await dialog.getByText('Compare another tree', { exact: true }).click()
  const coordinates = Buffer.from([0, 0, 0, 6, 3, 0, 2, 0, 100, 0, 101, 0, 0]).toString('base64url')
  await dialog.getByRole('textbox', { name: 'Current tree link' }).fill(
    `https://www.pathofexile.com/passive-skill-tree/3.30.0/${coordinates}`,
  )
  await button('Apply tree link').click()
  await expect(dialog.getByText('Pasted tree link', { exact: true })).toBeVisible()
  await expect(changes.getByText(clusterNote, { exact: true })).toHaveCount(0)
  await expect(dialog.getByText('Historical passive score', { exact: true })).toHaveCount(0)
  await filter.choose('All changes')
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
  const { dialog, map, button } = await openTreeDetails(page)
  await expect(dialog.getByText(/incompatible|different passive tree versions/i).first()).toBeVisible()
  await expect(map).toHaveCount(0)
  await expect(dialog.getByText('Compare another tree', { exact: true })).toBeVisible()
  expect(countMapRequests()).toBe(0)
  await button('Paste a current tree link').click()
  await expect(dialog.getByRole('textbox', { name: 'Current tree link' })).toBeFocused()
})
