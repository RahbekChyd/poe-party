import type { PassiveTreeSource } from './passive-tree-comparison'
import type { PassiveTreeArtwork } from './passive-tree-game-art'
import { getPassiveTreeMasterySelections } from './passive-tree-links'
import { buildConnectorPath, type PassiveTreeRenderData } from './passive-tree-render-data'

type Bounds = PassiveTreeRenderData['bounds']
type Point = { x: number; y: number }
type Axis = keyof Point

const NODE_PADDING = 120
const WHEEL_GAP = 320
const LABEL_GAP = 150
const LABEL_SPACE = 220

interface Wheel {
  id: string
  name: string
  isBloodline: boolean
  anchor: Point
  bounds: Bounds
}

const SIDES = [
  { side: 'left', normal: 'x', tangent: 'y', direction: -1 },
  { side: 'right', normal: 'x', tangent: 'y', direction: 1 },
  { side: 'top', normal: 'y', tangent: 'x', direction: -1 },
  { side: 'bottom', normal: 'y', tangent: 'x', direction: 1 },
] as const

function emptyBounds(): Bounds {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
}

function includeBounds(bounds: Bounds, minX: number, minY: number, maxX: number, maxY: number) {
  bounds.minX = Math.min(bounds.minX, minX)
  bounds.minY = Math.min(bounds.minY, minY)
  bounds.maxX = Math.max(bounds.maxX, maxX)
  bounds.maxY = Math.max(bounds.maxY, maxY)
}

function includeCentered(bounds: Bounds, { x, y }: Point, radiusX: number, radiusY = radiusX) {
  includeBounds(bounds, x - radiusX, y - radiusY, x + radiusX, y + radiusY)
}

function getAxisBounds(bounds: Bounds, axis: Axis): [number, number] {
  return axis === 'x' ? [bounds.minX, bounds.maxX] : [bounds.minY, bounds.maxY]
}

function span(bounds: Bounds, axis: Axis) {
  const [min, max] = getAxisBounds(bounds, axis)
  return max - min
}

function getSide(bounds: Bounds, { x, y }: Point) {
  const dx = (x - (bounds.minX + bounds.maxX) / 2) / Math.max(span(bounds, 'x'), 1)
  const dy = (y - (bounds.minY + bounds.maxY) / 2) / Math.max(span(bounds, 'y'), 1)
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? SIDES[0] : SIDES[1]
  return dy < 0 ? SIDES[2] : SIDES[3]
}

function getWheelPlacements(wheels: Wheel[], mainBounds: Bounds): Map<string, Point> {
  const placements = new Map<string, Point>()
  for (const { side, normal, tangent, direction } of SIDES) {
    const row = wheels
      .filter((wheel) => getSide(mainBounds, wheel.anchor).side === side)
      .sort((left, right) => left.anchor[tangent] - right.anchor[tangent] || left.id.localeCompare(right.id))
    const [normalMin, normalMax] = getAxisBounds(mainBounds, normal)
    const [tangentMin, tangentMax] = getAxisBounds(mainBounds, tangent)
    let cursor = tangentMin
    let remaining = row.reduce((length, wheel) => length + span(wheel.bounds, tangent) + WHEEL_GAP, -WHEEL_GAP)

    for (const wheel of row) {
      const [wheelNormalMin, wheelNormalMax] = getAxisBounds(wheel.bounds, normal)
      const [wheelTangentMin, wheelTangentMax] = getAxisBounds(wheel.bounds, tangent)
      const normalOffset = direction < 0
        ? normalMin - WHEEL_GAP - wheelNormalMax
        : normalMax + WHEEL_GAP - wheelNormalMin
      const start = Math.max(cursor, Math.min(wheelTangentMin, tangentMax - remaining))
      const tangentOffset = start - wheelTangentMin
      const used = wheelTangentMax - wheelTangentMin + WHEEL_GAP
      cursor = start + used
      remaining -= used
      placements.set(wheel.id, normal === 'x'
        ? { x: normalOffset, y: tangentOffset }
        : { x: tangentOffset, y: normalOffset })
    }
  }

  // Very small trees can have more wheels than fit on one side. Clear any corner conflicts.
  const occupied: Bounds[] = []
  for (const wheel of wheels) {
    const offset = placements.get(wheel.id)
    if (!offset) continue
    const { normal, tangent, direction } = getSide(mainBounds, wheel.anchor)
    const [tangentMin, tangentMax] = getAxisBounds(wheel.bounds, tangent)
    const [normalMin, normalMax] = getAxisBounds(wheel.bounds, normal)
    let shifted = offset[normal]
    const obstacles = occupied.flatMap((bounds) => {
      const [otherMin, otherMax] = getAxisBounds(bounds, tangent)
      const overlaps = tangentMin + offset[tangent] < otherMax + WHEEL_GAP &&
        tangentMax + offset[tangent] > otherMin - WHEEL_GAP
      return overlaps ? [getAxisBounds(bounds, normal)] : []
    }).sort((left, right) => direction < 0 ? right[1] - left[1] : left[0] - right[0])
    for (const [otherMin, otherMax] of obstacles) {
      if (normalMin + shifted >= otherMax + WHEEL_GAP || normalMax + shifted <= otherMin - WHEEL_GAP) {
        continue
      }
      shifted = direction < 0 ? otherMin - WHEEL_GAP - normalMax : otherMax + WHEEL_GAP - normalMin
    }
    offset[normal] = shifted
    occupied.push({
      minX: wheel.bounds.minX + offset.x,
      minY: wheel.bounds.minY + offset.y,
      maxX: wheel.bounds.maxX + offset.x,
      maxY: wheel.bounds.maxY + offset.y,
    })
  }
  return placements
}

function toSearchName(name: string) {
  return name.toLowerCase().replace(/\s+bloodline$/, '').replace(/[^a-z0-9]/g, '')
}

export function getPassiveTreeSourceAscendancyIds(data: PassiveTreeRenderData, source: PassiveTreeSource): Set<string> {
  const ids = new Set<string>()
  let hasPrimary = false
  let hasSecondary = false
  for (const nodeId of [
    ...source.tree.hashes,
    ...source.modifiedNodeIds,
    ...source.unresolvedNodeIds,
    ...source.clusterSockets.flatMap(({ nodeId }) => nodeId == null ? [] : [nodeId]),
    ...getPassiveTreeMasterySelections(source.tree.masteryEffects).map(({ nodeId }) => nodeId),
  ]) {
    const node = data.nodes[nodeId]
    if (!node?.ascendancyName || node.isProxy) continue
    ids.add(node.ascendancyName)
    if (node.isBloodline) hasSecondary = true
    else hasPrimary = true
  }

  const classes = data.ascendancyClasses ?? []
  const primary = hasPrimary || source.tree.classId == null ? undefined : classes.find(({ classId, selectionId }) =>
    classId === source.tree.classId && selectionId === source.tree.ascendancyId,
  )
  if (primary) ids.add(primary.id)

  if (!hasSecondary) {
    const alternate = source.alternateAscendancy && toSearchName(source.alternateAscendancy)
    const secondary = classes.find(({ id, name, classId, selectionId }) => classId === null && (
      (alternate && (toSearchName(id) === alternate || toSearchName(name) === alternate)) ||
      selectionId === source.secondaryAscendancyId
    ))
    if (secondary) ids.add(secondary.id)
  }
  return ids
}

function arrangeArtwork(
  artwork: PassiveTreeArtwork,
  nodes: PassiveTreeRenderData['nodes'],
  groups: PassiveTreeRenderData['groups'],
  placements: Map<string, Point>,
  groupOwners: Map<number, string>,
): PassiveTreeArtwork | undefined {
  const urls = new Set<string>()
  const artNodes: PassiveTreeArtwork['nodes'] = {}
  for (const art of Object.values(artwork.nodes)) {
    const node = nodes[art.nodeId]
    if (!node) continue
    artNodes[art.nodeId] = { ...art, x: node.x, y: node.y }
    for (const sprite of [art.active.icon, art.active.frame, art.inactive.icon, art.inactive.frame]) {
      if (sprite) urls.add(sprite.url)
    }
  }
  const backdrops = artwork.backdrops.flatMap((art) => {
    if (!groups[art.groupId]) return []
    const owner = art.ascendancyId ?? groupOwners.get(art.groupId)
    const offset = owner ? placements.get(owner) : undefined
    if (owner && !offset) return []
    urls.add(art.sprite.url)
    return [offset ? { ...art, x: art.x + offset.x, y: art.y + offset.y } : art]
  })
  const sheets = artwork.sheets.filter(({ url }) => urls.has(url))
  return sheets.length ? { nodes: artNodes, backdrops, sheets } : undefined
}

export function getPassiveTreeComparisonGeometry(
  data: PassiveTreeRenderData,
  current: PassiveTreeSource,
  target: PassiveTreeSource,
): PassiveTreeRenderData {
  const sourceIds = new Set([
    ...getPassiveTreeSourceAscendancyIds(data, current),
    ...getPassiveTreeSourceAscendancyIds(data, target),
  ])
  const originalNodes = Object.values(data.nodes)
  const wheelNodes = new Map<string, typeof originalNodes>()
  const groupNames = new Map<number, Set<string | null>>()
  for (const node of originalNodes) {
    if (node.isProxy) continue
    const group = groupNames.get(node.groupId) ?? new Set()
    group.add(node.ascendancyName)
    groupNames.set(node.groupId, group)
    if (!node.ascendancyName) continue
    const wheel = wheelNodes.get(node.ascendancyName) ?? []
    wheel.push(node)
    wheelNodes.set(node.ascendancyName, wheel)
  }
  if (!wheelNodes.size) return data

  const groupOwners = new Map<number, string>()
  for (const [groupId, names] of groupNames) {
    const [only] = names
    if (names.size === 1 && only) groupOwners.set(groupId, only)
  }

  const footprints = new Map<string | null, Bounds>()
  function getFootprint(id: string | null) {
    const bounds = footprints.get(id) ?? emptyBounds()
    footprints.set(id, bounds)
    return bounds
  }
  for (const node of originalNodes) {
    if (node.isProxy) continue
    const group = data.groups[node.groupId]
    // Reserve the entire orbit to cover connecting arcs, alongside each sprite and comparison marker.
    includeCentered(getFootprint(node.ascendancyName), group ?? node, node.radius + NODE_PADDING)
  }
  for (const art of data.artwork?.backdrops ?? []) {
    includeCentered(
      getFootprint(art.ascendancyId ?? groupOwners.get(art.groupId) ?? null),
      art,
      art.sprite.width / 2,
      art.sprite.height / (art.mirrorY ? 1 : 2),
    )
  }

  const mainBounds = footprints.get(null) ?? data.bounds
  const classNames = new Map(data.ascendancyClasses?.map(({ id, name }) => [id, name]))
  const wheels: Wheel[] = []
  for (const id of [...sourceIds].sort()) {
    const members = wheelNodes.get(id)
    const start = members?.find((node) => node.isAscendancyStart) ?? members?.[0]
    const bounds = footprints.get(id)
    if (!start || !bounds) continue
    const group = data.groups[start.groupId]
    wheels.push({
      id,
      name: classNames.get(id) ?? (start.isAscendancyStart ? start.label : id),
      isBloodline: start.isBloodline,
      anchor: group ?? start,
      bounds: { ...bounds, maxY: bounds.maxY + LABEL_SPACE },
    })
  }
  const placements = getWheelPlacements(wheels, mainBounds)

  const nodes: PassiveTreeRenderData['nodes'] = {}
  for (const node of originalNodes) {
    if (!node.ascendancyName) {
      nodes[node.nodeId] = node
      continue
    }
    const offset = placements.get(node.ascendancyName)
    if (offset) nodes[node.nodeId] = { ...node, x: node.x + offset.x, y: node.y + offset.y }
  }

  const groups: PassiveTreeRenderData['groups'] = {}
  for (const group of Object.values(data.groups)) {
    const owner = groupOwners.get(group.groupId)
    const offset = owner ? placements.get(owner) : null
    if (owner && !offset) continue
    const nodeIds = group.nodeIds.filter((id) => nodes[id])
    groups[group.groupId] = offset
      ? { ...group, x: group.x + offset.x, y: group.y + offset.y, nodeIds }
      : { ...group, nodeIds }
  }

  const connectors = data.connectors.flatMap((connector) => {
    const from = nodes[connector.fromNodeId]
    const to = nodes[connector.toNodeId]
    if (!from || !to) return []
    return [from.ascendancyName || to.ascendancyName
      ? { ...connector, path: buildConnectorPath(from, to) }
      : connector]
  })

  const bounds = { ...mainBounds }
  const ascendancyWheels: NonNullable<PassiveTreeRenderData['ascendancyWheels']> = []
  for (const wheel of wheels) {
    const offset = placements.get(wheel.id)
    if (!offset) continue
    includeBounds(bounds,
      wheel.bounds.minX + offset.x, wheel.bounds.minY + offset.y,
      wheel.bounds.maxX + offset.x, wheel.bounds.maxY + offset.y,
    )
    ascendancyWheels.push({
      id: wheel.id,
      name: wheel.name,
      isBloodline: wheel.isBloodline,
      x: wheel.anchor.x + offset.x,
      y: wheel.anchor.y + offset.y,
      labelY: wheel.bounds.maxY - LABEL_SPACE + LABEL_GAP + offset.y,
    })
  }

  return {
    ...data,
    bounds,
    nodes,
    groups,
    connectors,
    ascendancyWheels,
    artwork: data.artwork ? arrangeArtwork(data.artwork, nodes, groups, placements, groupOwners) : undefined,
  }
}
