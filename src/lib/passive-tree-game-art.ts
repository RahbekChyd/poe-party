import type { PassiveTreeRenderGroup, PassiveTreeRenderNode } from './passive-tree-render-data'

export type PassiveTreeArtNodeSource = {
  icon?: string
  activeIcon?: string
  inactiveIcon?: string
  isJewelSocket?: boolean
}

export type PassiveTreeArtGroupSource = {
  background?: {
    image?: string
    isHalfImage?: boolean
    offsetX?: number
    offsetY?: number
  }
}

export interface PassiveTreeArtSprite {
  url: string
  sourceX: number
  sourceY: number
  sourceWidth: number
  sourceHeight: number
  width: number
  height: number
}

interface PassiveTreeArtNodeVariant {
  icon?: PassiveTreeArtSprite
  frame?: PassiveTreeArtSprite
}

interface PassiveTreeArtNode {
  nodeId: number
  x: number
  y: number
  active: PassiveTreeArtNodeVariant
  inactive: PassiveTreeArtNodeVariant
}

interface PassiveTreeArtBackdrop {
  x: number
  y: number
  groupId: number
  ascendancyId?: string
  sprite: PassiveTreeArtSprite
  mirrorY?: boolean
}

export interface PassiveTreeArtwork {
  sheets: PassiveTreeArtSheet[]
  nodes: Record<number, PassiveTreeArtNode>
  backdrops: PassiveTreeArtBackdrop[]
}

export interface PassiveTreeArtSheet {
  url: string
  width: number
  height: number
}

export type PassiveTreeArtImages = ReadonlyMap<string, HTMLImageElement>

interface SpriteSheet extends PassiveTreeArtSheet {
  coords: Record<string, unknown>
  zoom: number
}

const ASSET_ORIGIN = 'https://web.poecdn.com'
const ASSET_PATH = /^\/image\/passive-skill\/[a-z0-9-]+-[0-9]+\.(?:png|webp|jpe?g)$/
const ASSET_REVISION = /^\?[a-zA-Z0-9-]{1,64}$/
// The export supplies five atlas sizes. This keeps the comparison dialog light while retaining detail.
const PREFERRED_ZOOM = 0.2109
const CLASS_ART = ['scion', 'marauder', 'ranger', 'witch', 'duelist', 'templar', 'shadow']

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function asPixels(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 8192
    ? value
    : null
}

function getAssetUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    if (
      url.origin !== ASSET_ORIGIN ||
      url.username ||
      url.password ||
      url.hash ||
      !ASSET_PATH.test(url.pathname) ||
      (url.search && !ASSET_REVISION.test(url.search))
    ) return null
    return url.href
  } catch {
    return null
  }
}

function getPreferredSheet(value: unknown): SpriteSheet | undefined {
  let preferred: SpriteSheet | undefined
  for (const [zoomKey, entry] of Object.entries(asRecord(value) ?? {})) {
    const zoom = Number(zoomKey)
    if (!Number.isFinite(zoom) || zoom < 0.1 || zoom > 1) continue
    if (preferred && Math.abs(zoom - PREFERRED_ZOOM) >= Math.abs(preferred.zoom - PREFERRED_ZOOM)) {
      continue
    }
    const sheet = asRecord(entry)
    const url = getAssetUrl(sheet?.filename)
    const width = asPixels(sheet?.w)
    const height = asPixels(sheet?.h)
    const coords = asRecord(sheet?.coords)
    if (!url || !width || !height || !coords) continue
    preferred = { url, width, height, coords, zoom }
  }
  return preferred
}

function getPreferredSheets(value: unknown): Map<string, SpriteSheet> {
  const sheets = new Map<string, SpriteSheet>()
  for (const [name, zooms] of Object.entries(asRecord(value) ?? {})) {
    const sheet = getPreferredSheet(zooms)
    if (sheet) sheets.set(name, sheet)
  }
  return sheets
}

function readSprite(sheet: SpriteSheet, key: string): PassiveTreeArtSprite | undefined {
  if (!Object.prototype.hasOwnProperty.call(sheet.coords, key)) return undefined
  const rect = asRecord(sheet.coords[key])
  const x = asPixels(rect?.x)
  const y = asPixels(rect?.y)
  const w = asPixels(rect?.w)
  const h = asPixels(rect?.h)
  if (x == null || y == null || !w || !h || x + w > sheet.width || y + h > sheet.height) {
    return undefined
  }
  return {
    url: sheet.url,
    sourceX: x,
    sourceY: y,
    sourceWidth: w,
    sourceHeight: h,
    width: w / sheet.zoom,
    height: h / sheet.zoom,
  }
}

type SpriteLookup = (category: string, key?: string) => PassiveTreeArtSprite | undefined

function getAscendancySheet(
  node: PassiveTreeRenderNode,
  bloodlineSheets: Map<string, string>,
): string {
  return (node.ascendancyName && bloodlineSheets.get(`Classes${node.ascendancyName}`)) || 'ascendancy'
}

function getNodeVariant(
  node: PassiveTreeRenderNode,
  rawNode: PassiveTreeArtNodeSource,
  sprite: SpriteLookup,
  ascendancySheet: string,
  active: boolean,
): PassiveTreeArtNodeVariant {
  if (node.isAscendancyStart) return { icon: sprite(ascendancySheet, 'AscendancyMiddle') }
  if (node.isMastery) {
    const icon = active
      ? sprite('masteryActiveSelected', rawNode.activeIcon)
      : sprite('masteryInactive', rawNode.inactiveIcon)
    return { icon: icon ?? sprite('mastery', rawNode.icon) }
  }

  const size = node.isKeystone ? 'keystone' : node.isNotable ? 'notable' : 'normal'
  const icon = rawNode.isJewelSocket
    ? undefined
    : sprite(`${size}${active ? 'Active' : 'Inactive'}`, rawNode.icon)
  const allocation = active ? 'Allocated' : 'Unallocated'
  let frame: PassiveTreeArtSprite | undefined
  if (rawNode.isJewelSocket) frame = sprite('frame', `JewelFrame${allocation}`)
  else if (node.ascendancyName) {
    const frameSize = node.isNotable || node.isKeystone ? 'Large' : 'Small'
    frame = sprite(ascendancySheet, `AscendancyFrame${frameSize}${active ? 'Allocated' : 'Normal'}`)
  } else if (node.isKeystone) frame = sprite('frame', `KeystoneFrame${allocation}`)
  else if (node.isNotable) frame = sprite('frame', `NotableFrame${allocation}`)
  else frame = sprite('frame', active ? 'PSSkillFrameActive' : 'PSSkillFrame')
  return { icon, frame }
}

function getOffset(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 2000 ? value : 0
}

export function buildPassiveTreeArtwork(
  source: unknown,
  nodes: Record<number, PassiveTreeRenderNode>,
  groups: Record<number, PassiveTreeRenderGroup>,
  rawNodes: Record<string, PassiveTreeArtNodeSource>,
  rawGroups: Record<string, PassiveTreeArtGroupSource>,
): PassiveTreeArtwork | undefined {
  const sheets = getPreferredSheets(source)
  if (sheets.size === 0) return undefined

  const usedSheets = new Map<string, PassiveTreeArtSheet>()
  const sprites = new Map<string, PassiveTreeArtSprite | undefined>()
  const sprite: SpriteLookup = (category, key) => {
    const sheet = sheets.get(category)
    if (!sheet || typeof key !== 'string' || !key) return undefined
    const cacheKey = `${category}/${key}`
    if (!sprites.has(cacheKey)) {
      const crop = readSprite(sheet, key)
      if (crop && !usedSheets.has(crop.url)) {
        usedSheets.set(crop.url, { url: crop.url, width: sheet.width, height: sheet.height })
      }
      sprites.set(cacheKey, crop)
    }
    return sprites.get(cacheKey)
  }

  const bloodlineSheets = new Map<string, string>()
  for (const [category, sheet] of sheets) {
    if (!category.endsWith('Bloodline')) continue
    for (const key of Object.keys(sheet.coords)) {
      if (key.startsWith('Classes')) bloodlineSheets.set(key, category)
    }
  }

  const backdrops: PassiveTreeArtBackdrop[] = []
  for (const group of Object.values(groups)) {
    if (group.isProxy) continue
    const background = rawGroups[group.groupId]?.background
    const crop = sprite('groupBackground', background?.image)
    if (!crop) continue
    backdrops.push({
      x: group.x + getOffset(background?.offsetX),
      y: group.y + getOffset(background?.offsetY),
      groupId: group.groupId,
      sprite: crop,
      mirrorY: background?.isHalfImage === true,
    })
  }

  const nodeArtwork: Record<number, PassiveTreeArtNode> = {}
  for (const node of Object.values(nodes)) {
    if (node.isProxy) continue
    if (node.classStartIndex != null) {
      const className = CLASS_ART[node.classStartIndex]
      const crop = className ? sprite('startNode', `center${className}`) : undefined
      if (crop) backdrops.push({ x: node.x, y: node.y, groupId: node.groupId, sprite: crop })
      continue
    }

    const ascendancySheet = getAscendancySheet(node, bloodlineSheets)
    if (node.isAscendancyStart && node.ascendancyName) {
      const crop = sprite(ascendancySheet, `Classes${node.ascendancyName}`)
      const center = groups[node.groupId]
      if (crop && center) {
        backdrops.push({
          x: center.x,
          y: center.y,
          groupId: node.groupId,
          ascendancyId: node.ascendancyName,
          sprite: crop,
        })
      }
    }

    const rawNode = rawNodes[node.nodeId]
    if (!rawNode) continue
    const active = getNodeVariant(node, rawNode, sprite, ascendancySheet, true)
    const inactive = getNodeVariant(node, rawNode, sprite, ascendancySheet, false)
    if (!active.icon && !active.frame && !inactive.icon && !inactive.frame) continue
    nodeArtwork[node.nodeId] = { nodeId: node.nodeId, x: node.x, y: node.y, active, inactive }
  }

  return usedSheets.size
    ? { sheets: [...usedSheets.values()], nodes: nodeArtwork, backdrops }
    : undefined
}

export function getPassiveTreeNodeArt(
  artwork: PassiveTreeArtwork,
  images: PassiveTreeArtImages,
  nodeId: number,
  active: boolean,
): PassiveTreeArtNodeVariant | undefined {
  const node = artwork.nodes[nodeId]
  if (!node) return undefined
  const primary = active ? node.active : node.inactive
  const fallback = active ? node.inactive : node.active
  const icon = availableSprite(images, primary.icon ?? fallback.icon)
  const frame = availableSprite(images, primary.frame ?? fallback.frame)
  return icon || frame ? { icon, frame } : undefined
}

function availableSprite(
  images: PassiveTreeArtImages,
  sprite: PassiveTreeArtSprite | undefined,
): PassiveTreeArtSprite | undefined {
  if (!sprite) return undefined
  const image = images.get(sprite.url)
  if (
    image &&
    sprite.sourceX + sprite.sourceWidth <= image.naturalWidth &&
    sprite.sourceY + sprite.sourceHeight <= image.naturalHeight
  ) return sprite
  return undefined
}

export function hasPassiveTreeNodeArt(
  artwork: PassiveTreeArtwork,
  images: PassiveTreeArtImages,
  nodeId: number,
  active: boolean,
): boolean {
  return getPassiveTreeNodeArt(artwork, images, nodeId, active) !== undefined
}
