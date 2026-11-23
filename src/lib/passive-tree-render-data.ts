import {
  buildPassiveTreeArtwork,
  type PassiveTreeArtwork,
  type PassiveTreeArtGroupSource,
  type PassiveTreeArtNodeSource,
} from './passive-tree-game-art'

const SUPPORTED_PASSIVE_TREE_RENDER_VERSION_FAMILY = '3_30'

// PoB's pinned PassiveTree:CalcOrbitAngles uses the orbit size.
const ORBIT_ANGLES_BY_SIZE: Record<number, number[]> = {
  16: [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330],
  40: [
    0, 10, 20, 30, 40, 45, 50, 60, 70, 80, 90, 100, 110, 120, 130, 135, 140, 150, 160, 170,
    180, 190, 200, 210, 220, 225, 230, 240, 250, 260, 270, 280, 290, 300, 310, 315, 320, 330, 340, 350,
  ],
}

const DATASET_REVISION = '550fb34ae7fca9ec4d760a2ac845bb2ba1032ec3'
export const PASSIVE_TREE_GEOMETRY_SOURCE_URL =
  `https://github.com/grindinggear/skilltree-export/tree/${DATASET_REVISION}`

const BRANCH_FILE_NAMES = {
  data: 'data.json',
  alternate: 'alternate.json',
  ruthless: 'ruthless.json',
  'ruthless-alternate': 'ruthless-alternate.json',
} as const

const BRANCH_LABELS = {
  data: 'Default',
  alternate: 'Event tree',
  ruthless: 'Ruthless',
  'ruthless-alternate': 'Ruthless event tree',
} as const

export type PassiveTreeRenderBranch = 'data' | 'alternate' | 'ruthless' | 'ruthless-alternate'

export interface PassiveTreeRenderNodeMasteryEffect {
  effectId: number
  text: string
}

export interface PassiveTreeRenderNode {
  nodeId: number
  groupId: number
  x: number
  y: number
  orbit: number
  angle: number
  radius: number
  label: string
  shortStatText: string | null
  stats: string[]
  isNotable: boolean
  isKeystone: boolean
  isMastery: boolean
  isProxy: boolean
  isAscendancyStart: boolean
  isMultipleChoice: boolean
  isMultipleChoiceOption: boolean
  isBloodline: boolean
  classStartIndex: number | null
  ascendancyName: string | null
  connectedNodeIds: number[]
  masteryEffects: PassiveTreeRenderNodeMasteryEffect[]
}

export interface PassiveTreeRenderGroup {
  groupId: number
  x: number
  y: number
  isProxy: boolean
  nodeIds: number[]
}

export interface PassiveTreeRenderConnector {
  id: string
  fromNodeId: number
  toNodeId: number
  path: string
}

export interface PassiveTreeRenderData {
  branch: PassiveTreeRenderBranch
  branchLabel: string
  versionFamily: string
  bounds: {
    minX: number
    minY: number
    maxX: number
    maxY: number
  }
  nodes: Record<number, PassiveTreeRenderNode>
  groups: Record<number, PassiveTreeRenderGroup>
  connectors: PassiveTreeRenderConnector[]
  artwork?: PassiveTreeArtwork
}

export interface PassiveTreeRenderRequest {
  gameVersion: string | null
  branch: PassiveTreeRenderBranch
}

export interface PassiveTreeRenderResolution {
  supported: boolean
  branch: PassiveTreeRenderBranch | null
  versionFamily: string | null
  detail: string
}

function hasPassiveTreeNodeEffect(node: PassiveTreeRenderNode): boolean {
  if (node.stats.length > 0) return true
  return !!node.shortStatText?.trim()
}

export function isPassiveTreeAutoGrantedNode(
  node: PassiveTreeRenderNode | null | undefined,
): boolean {
  if (!node) return false

  return (
    node.classStartIndex != null ||
    node.isAscendancyStart ||
    node.isProxy ||
    (node.isMultipleChoice && !hasPassiveTreeNodeEffect(node))
  )
}

export function filterComparablePassiveTreeNodeIds(
  nodeIds: number[],
  renderData?: PassiveTreeRenderData | null,
): number[] {
  const seen = new Set<number>()
  const filtered: number[] = []

  for (const value of nodeIds) {
    if (!Number.isFinite(value)) continue
    const nodeId = Math.trunc(value)
    if (seen.has(nodeId)) continue
    seen.add(nodeId)

    const renderNode = renderData?.nodes[nodeId]
    if (renderNode && isPassiveTreeAutoGrantedNode(renderNode)) {
      continue
    }

    filtered.push(nodeId)
  }

  return filtered.sort((left, right) => left - right)
}

type RawPassiveTreeNode = PassiveTreeArtNodeSource & {
  skill?: number
  name?: string
  stats?: string[]
  reminderText?: string[]
  group?: number | string
  orbit?: number
  orbitIndex?: number
  isNotable?: boolean
  isKeystone?: boolean
  isMastery?: boolean
  isProxy?: boolean
  isAscendancyStart?: boolean
  isMultipleChoice?: boolean
  isMultipleChoiceOption?: boolean
  isBloodline?: boolean
  classStartIndex?: number
  ascendancyName?: string
  out?: Array<number | string>
  in?: Array<number | string>
  masteryEffects?: Array<{
    effect?: number
    stats?: string[]
  }>
}

type RawPassiveTreeGroup = PassiveTreeArtGroupSource & {
  x?: number
  y?: number
  isProxy?: boolean
  nodes?: Array<number | string>
}

type RawPassiveTreeData = {
  constants?: {
    orbitRadii?: number[]
    skillsPerOrbit?: number[]
  }
  min_x?: number
  min_y?: number
  max_x?: number
  max_y?: number
  nodes?: Record<string, RawPassiveTreeNode>
  groups?: Record<string, RawPassiveTreeGroup>
  sprites?: unknown
}

const renderDataPromiseCache = new Map<PassiveTreeRenderBranch, Promise<PassiveTreeRenderData>>()

function parseVersionFamily(value: string | null | undefined): string | null {
  if (!value) return null
  const match = value.match(/^(\d+)[._](\d+)(?:$|[._ -])/)
  if (!match) return null
  return `${match[1]}_${match[2]}`
}

function hasUnsupportedPatch(value: string | null): boolean {
  const patch = value?.match(/^\d+[._]\d+[._](\d+)/)?.[1]
  return patch !== undefined && Number(patch) !== 0
}

export function getPassiveTreeRenderBranch(
  version: string | null,
  isRuthless = false,
): PassiveTreeRenderBranch {
  const label = version?.toLowerCase() ?? ''
  const alternate = /(?:^|[._ -])(?:alt|alternate|event)(?:$|[._ -])/.test(label)
  const ruthless = isRuthless || label.includes('ruthless')
  if (ruthless) return alternate ? 'ruthless-alternate' : 'ruthless'
  return alternate ? 'alternate' : 'data'
}

export function resolvePassiveTreeRenderResolution(
  current: PassiveTreeRenderRequest,
  target: PassiveTreeRenderRequest,
): PassiveTreeRenderResolution {
  const currentVersionFamily = parseVersionFamily(current.gameVersion)
  const targetVersionFamily = parseVersionFamily(target.gameVersion)
  const unavailable = { supported: false, branch: null, versionFamily: null } as const

  if (!currentVersionFamily || !targetVersionFamily) {
    return {
      ...unavailable,
      detail: 'A tree source is missing its game version. Open the source or use a versioned tree link.',
    }
  }
  if (currentVersionFamily !== targetVersionFamily || current.branch !== target.branch) {
    return {
      ...unavailable,
      detail: `The current tree (${current.gameVersion}, ${BRANCH_LABELS[current.branch]}) and target (${target.gameVersion}, ${BRANCH_LABELS[target.branch]}) use incompatible tree versions or variants.`,
    }
  }
  if (currentVersionFamily !== SUPPORTED_PASSIVE_TREE_RENDER_VERSION_FAMILY) {
    return {
      ...unavailable,
      detail: `Map geometry for version ${currentVersionFamily.replace('_', '.')} is unavailable.`,
    }
  }
  const newerPatch = [current.gameVersion, target.gameVersion].find(hasUnsupportedPatch)
  if (newerPatch) {
    return { ...unavailable, detail: `Map geometry for version ${newerPatch} is unavailable.` }
  }
  return {
    supported: true,
    branch: target.branch,
    versionFamily: currentVersionFamily,
    detail: `Path of Exile ${currentVersionFamily.replace('_', '.')} · ${BRANCH_LABELS[target.branch]}`,
  }
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toFiniteNumberArray(values: Array<number | string> | undefined): number[] {
  return (values ?? [])
    .map((entry) => toFiniteNumber(entry))
    .filter((entry): entry is number => entry != null)
}

function getOrbitAngle(orbitSize: number, orbitIndex: number): number {
  const degrees = ORBIT_ANGLES_BY_SIZE[orbitSize]?.[orbitIndex] ?? (360 * orbitIndex) / orbitSize
  return (degrees * Math.PI) / 180
}

function computeNodePosition(
  group: RawPassiveTreeGroup | undefined,
  node: RawPassiveTreeNode,
  orbitRadii: number[],
  skillsPerOrbit: number[],
): Pick<PassiveTreeRenderNode, 'x' | 'y' | 'angle' | 'orbit' | 'radius'> | null {
  const groupX = toFiniteNumber(group?.x)
  const groupY = toFiniteNumber(group?.y)
  if (groupX == null || groupY == null) return null

  const orbit = toFiniteNumber(node.orbit) ?? 0
  const orbitIndex = toFiniteNumber(node.orbitIndex) ?? 0
  const radius = orbitRadii[orbit]
  const orbitSize = skillsPerOrbit[orbit]
  if (!Number.isFinite(radius) || !orbitSize || orbitIndex < 0 || orbitIndex >= orbitSize) return null
  const angle = getOrbitAngle(orbitSize, orbitIndex)

  return {
    x: groupX + Math.sin(angle) * radius,
    y: groupY - Math.cos(angle) * radius,
    orbit,
    angle,
    radius,
  }
}

// PoB draws the shortest arc for nodes sharing an orbit and a line for other edges.
function buildConnectorPath(from: PassiveTreeRenderNode, to: PassiveTreeRenderNode): string {
  const start = `M ${from.x} ${from.y}`
  const end = `${to.x} ${to.y}`
  if (from.groupId !== to.groupId || from.orbit !== to.orbit || from.radius === 0) {
    return `${start} L ${end}`
  }
  const turn = 2 * Math.PI
  const clockwiseAngle = (to.angle - from.angle + turn) % turn
  const sweep = clockwiseAngle < Math.PI || (clockwiseAngle === Math.PI && from.angle > to.angle) ? 1 : 0
  return `${start} A ${from.radius} ${from.radius} 0 0 ${sweep} ${end}`
}

function getNodeLabel(nodeId: number, node: RawPassiveTreeNode): string {
  const name = typeof node.name === 'string' ? node.name.trim() : ''
  if (name) return name
  const firstStat = Array.isArray(node.stats)
    ? node.stats.find((entry) => entry.trim().length > 0)
    : null
  return firstStat?.trim() || `Node ${nodeId}`
}

function getNodeShortStat(node: RawPassiveTreeNode): string | null {
  const firstStat = Array.isArray(node.stats)
    ? node.stats.find((entry) => entry.trim().length > 0)
    : null
  if (firstStat?.trim()) return firstStat.trim()
  const firstReminder = Array.isArray(node.reminderText)
    ? node.reminderText.find((entry) => entry.trim().length > 0)
    : null
  return firstReminder?.trim() || null
}

export function normalizePassiveTreeRenderData(
  branch: PassiveTreeRenderBranch,
  rawData: RawPassiveTreeData,
): PassiveTreeRenderData {
  const orbitRadii = rawData.constants?.orbitRadii ?? [0, 82, 162, 335, 493]
  const skillsPerOrbit = rawData.constants?.skillsPerOrbit ?? [1, 6, 12, 12, 40]
  const groups = rawData.groups ?? {}
  const rawNodes = rawData.nodes ?? {}
  const nodes: Record<number, PassiveTreeRenderNode> = {}
  const connectors = new Map<string, PassiveTreeRenderConnector>()

  for (const [nodeIdKey, rawNode] of Object.entries(rawNodes)) {
    const nodeId = toFiniteNumber(nodeIdKey)
    const groupId = toFiniteNumber(rawNode.group)
    if (nodeId == null || groupId == null) continue

    const position = computeNodePosition(
      groups[String(groupId)],
      rawNode,
      orbitRadii,
      skillsPerOrbit,
    )
    if (!position) continue

    const connectedNodeIds = [
      ...toFiniteNumberArray(rawNode.out),
      ...toFiniteNumberArray(rawNode.in),
    ]
    const uniqueConnectedNodeIds = [...new Set(connectedNodeIds)].sort(
      (left, right) => left - right,
    )

    nodes[nodeId] = {
      nodeId,
      groupId,
      ...position,
      label: getNodeLabel(nodeId, rawNode),
      shortStatText: getNodeShortStat(rawNode),
      stats: Array.isArray(rawNode.stats)
        ? rawNode.stats.map((entry) => entry.trim()).filter((entry) => entry.length > 0)
        : [],
      isNotable: rawNode.isNotable === true,
      isKeystone: rawNode.isKeystone === true,
      isMastery: rawNode.isMastery === true,
      isProxy: rawNode.isProxy === true || groups[String(groupId)]?.isProxy === true,
      isAscendancyStart: rawNode.isAscendancyStart === true,
      isMultipleChoice: rawNode.isMultipleChoice === true,
      isMultipleChoiceOption: rawNode.isMultipleChoiceOption === true,
      isBloodline: rawNode.isBloodline === true,
      classStartIndex: toFiniteNumber(rawNode.classStartIndex),
      ascendancyName:
        typeof rawNode.ascendancyName === 'string' && rawNode.ascendancyName.trim()
          ? rawNode.ascendancyName.trim()
          : null,
      connectedNodeIds: uniqueConnectedNodeIds,
      masteryEffects: Array.isArray(rawNode.masteryEffects)
        ? rawNode.masteryEffects
            .map((entry) => {
              const effectId = toFiniteNumber(entry.effect)
              const text = Array.isArray(entry.stats)
                ? entry.stats.map((value) => value.trim()).filter(Boolean).join('\n')
                : null
              if (effectId == null || !text) return null
              return {
                effectId,
                text,
              } satisfies PassiveTreeRenderNodeMasteryEffect
            })
            .filter((entry): entry is PassiveTreeRenderNodeMasteryEffect => entry != null)
        : [],
    }
  }

  for (const from of Object.values(nodes)) {
    if (from.isProxy) continue
    const fromAscendancy = from.ascendancyName !== null || from.isAscendancyStart
    for (const toId of from.connectedNodeIds) {
      const to = nodes[toId]
      if (!to || to.isProxy || to.nodeId === from.nodeId) continue
      const toAscendancy = to.ascendancyName !== null || to.isAscendancyStart
      // Keep each ascendancy wheel visually separate while preserving the exported adjacency.
      if (fromAscendancy !== toAscendancy) continue

      const id = `${Math.min(from.nodeId, to.nodeId)}-${Math.max(from.nodeId, to.nodeId)}`
      if (!connectors.has(id)) {
        connectors.set(id, {
          id,
          fromNodeId: from.nodeId,
          toNodeId: to.nodeId,
          path: buildConnectorPath(from, to),
        })
      }
    }
  }

  if (Object.keys(nodes).length === 0) {
    throw new Error('The official tree dataset did not contain usable geometry.')
  }

  const normalizedGroups: Record<number, PassiveTreeRenderGroup> = {}
  for (const [groupIdKey, group] of Object.entries(groups)) {
    const groupId = toFiniteNumber(groupIdKey)
    const groupX = toFiniteNumber(group.x)
    const groupY = toFiniteNumber(group.y)
    if (groupId == null || groupX == null || groupY == null) continue

    normalizedGroups[groupId] = {
      groupId,
      x: groupX,
      y: groupY,
      isProxy: group.isProxy === true,
      nodeIds: toFiniteNumberArray(group.nodes),
    }
  }

  const artwork = buildPassiveTreeArtwork(rawData.sprites, nodes, normalizedGroups, rawNodes, groups)
  return {
    branch,
    branchLabel: BRANCH_LABELS[branch],
    versionFamily: SUPPORTED_PASSIVE_TREE_RENDER_VERSION_FAMILY,
    bounds: {
      minX: toFiniteNumber(rawData.min_x) ?? -15000,
      minY: toFiniteNumber(rawData.min_y) ?? -15000,
      maxX: toFiniteNumber(rawData.max_x) ?? 15000,
      maxY: toFiniteNumber(rawData.max_y) ?? 15000,
    },
    nodes,
    groups: normalizedGroups,
    connectors: [...connectors.values()],
    ...(artwork ? { artwork } : {}),
  }
}

export function loadPassiveTreeRenderData(
  branch: PassiveTreeRenderBranch,
): Promise<PassiveTreeRenderData> {
  const existingPromise = renderDataPromiseCache.get(branch)
  if (existingPromise) return existingPromise

  const promise = fetch(
    `https://raw.githubusercontent.com/grindinggear/skilltree-export/${DATASET_REVISION}/${BRANCH_FILE_NAMES[branch]}`,
  )
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Could not load official passive-tree geometry (${response.status}).`)
      }
      return (await response.json()) as RawPassiveTreeData
    })
    .then((rawData) => normalizePassiveTreeRenderData(branch, rawData))
    .catch((error: unknown) => {
      renderDataPromiseCache.delete(branch)
      throw error
    })

  renderDataPromiseCache.set(branch, promise)
  return promise
}
