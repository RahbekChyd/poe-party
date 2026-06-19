
const SUPPORTED_PASSIVE_TREE_RENDER_VERSION_FAMILY = '3_26'

const ORBIT_ANGLE_TABLE: Record<number, number[]> = {
  0: [0],
  1: [0, 60, 120, 180, 240, 300],
  2: [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330],
  3: [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330],
}

const BRANCH_FILE_NAMES = {
  data: 'data.json',
  alternate: 'alternate.json',
  ruthless: 'ruthless.json',
  'ruthless-alternate': 'ruthless-alternate.json',
} as const

const BRANCH_LABELS = {
  data: 'Default',
  alternate: 'Alternate ascendancy',
  ruthless: 'Ruthless',
  'ruthless-alternate': 'Ruthless alternate ascendancy',
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
}

export interface PassiveTreeRenderRequest {
  gameVersion: string | null
  hasAlternateAscendancy: boolean
  isRuthless: boolean
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

type RawPassiveTreeNode = {
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

type RawPassiveTreeGroup = {
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
}

const renderDataPromiseCache = new Map<PassiveTreeRenderBranch, Promise<PassiveTreeRenderData>>()

function parseVersionFamily(value: string | null | undefined): string | null {
  if (!value) return null
  const match = value.match(/(\d+)[._](\d+)/)
  if (!match) return null
  return `${match[1]}_${match[2]}`
}

function buildBranchKey(request: PassiveTreeRenderRequest): PassiveTreeRenderBranch {
  if (request.isRuthless && request.hasAlternateAscendancy) return 'ruthless-alternate'
  if (request.isRuthless) return 'ruthless'
  if (request.hasAlternateAscendancy) return 'alternate'
  return 'data'
}

export function resolvePassiveTreeRenderResolution(
  current: PassiveTreeRenderRequest,
  target: PassiveTreeRenderRequest,
): PassiveTreeRenderResolution {
  const currentVersionFamily = parseVersionFamily(current.gameVersion)
  const targetVersionFamily = parseVersionFamily(target.gameVersion)
  const resolvedVersionFamily = targetVersionFamily ?? currentVersionFamily
  const currentBranch = buildBranchKey(current)
  const targetBranch = buildBranchKey(target)

  if (!resolvedVersionFamily) {
    return {
      supported: true,
      branch: targetBranch,
      versionFamily: SUPPORTED_PASSIVE_TREE_RENDER_VERSION_FAMILY,
      detail:
        currentBranch === targetBranch
          ? 'Using live passive-tree geometry inferred from unlabeled current and target trees.'
          : 'Using live passive-tree geometry as best effort because the current and target trees use different passive-tree branches.',
    }
  }

  if (currentVersionFamily && targetVersionFamily && currentVersionFamily !== targetVersionFamily) {
    return {
      supported: true,
      branch: targetBranch,
      versionFamily: targetVersionFamily,
      detail:
        'Using live passive-tree geometry as best effort because the current and target trees carry different version labels.',
    }
  }

  if (resolvedVersionFamily !== SUPPORTED_PASSIVE_TREE_RENDER_VERSION_FAMILY) {
    return {
      supported: true,
      branch: targetBranch,
      versionFamily: resolvedVersionFamily,
      detail: `Using live passive-tree geometry as best effort for stored tree version ${resolvedVersionFamily.replace('_', '.')}.`,
    }
  }

  return {
    supported: true,
    branch: targetBranch,
    versionFamily: resolvedVersionFamily,
    detail:
      currentBranch === targetBranch
        ? `Using official ${BRANCH_LABELS[targetBranch]} passive-tree geometry.`
        : 'Using official target-branch passive-tree geometry as best effort because the current and target trees use different passive-tree branches.',
  }
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toFiniteNumberArray(values: Array<number | string> | undefined): number[] {
  return (values ?? [])
    .map((entry) => toFiniteNumber(entry))
    .filter((entry): entry is number => entry != null)
}

function getOrbitAngle(orbit: number, orbitIndex: number, skillsPerOrbit: number[]): number {
  const predefinedAngles = ORBIT_ANGLE_TABLE[orbit]
  if (predefinedAngles && orbitIndex >= 0 && orbitIndex < predefinedAngles.length) {
    return predefinedAngles[orbitIndex]
  }

  const orbitSize = skillsPerOrbit[orbit] ?? 0
  if (orbitSize <= 0) return 0
  return (360 / orbitSize) * orbitIndex
}

function computeNodePosition(
  group: RawPassiveTreeGroup | undefined,
  node: RawPassiveTreeNode,
  orbitRadii: number[],
  skillsPerOrbit: number[],
): { x: number; y: number } | null {
  const groupX = toFiniteNumber(group?.x)
  const groupY = toFiniteNumber(group?.y)
  if (groupX == null || groupY == null) return null

  const orbit = toFiniteNumber(node.orbit) ?? 0
  const orbitIndex = toFiniteNumber(node.orbitIndex) ?? 0
  const radius = orbitRadii[orbit] ?? 0
  const angleDegrees = getOrbitAngle(orbit, orbitIndex, skillsPerOrbit)
  const angleRadians = (angleDegrees * Math.PI) / 180

  return {
    x: groupX + Math.sin(angleRadians) * radius,
    y: groupY - Math.cos(angleRadians) * radius,
  }
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

function normalizePassiveTreeRenderData(
  branch: PassiveTreeRenderBranch,
  rawData: RawPassiveTreeData,
): PassiveTreeRenderData {
  const orbitRadii = rawData.constants?.orbitRadii ?? []
  const skillsPerOrbit = rawData.constants?.skillsPerOrbit ?? []
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

    for (const connectedNodeId of uniqueConnectedNodeIds) {
      const connectorId =
        connectedNodeId > nodeId ? `${nodeId}-${connectedNodeId}` : `${connectedNodeId}-${nodeId}`
      if (!connectors.has(connectorId)) {
        connectors.set(connectorId, {
          id: connectorId,
          fromNodeId: nodeId,
          toNodeId: connectedNodeId,
        })
      }
    }

    nodes[nodeId] = {
      nodeId,
      groupId,
      x: position.x,
      y: position.y,
      label: getNodeLabel(nodeId, rawNode),
      shortStatText: getNodeShortStat(rawNode),
      stats: Array.isArray(rawNode.stats)
        ? rawNode.stats.map((entry) => entry.trim()).filter((entry) => entry.length > 0)
        : [],
      isNotable: rawNode.isNotable === true,
      isKeystone: rawNode.isKeystone === true,
      isMastery: rawNode.isMastery === true,
      isProxy: rawNode.isProxy === true,
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
                ? entry.stats.map((value) => value.trim()).find((value) => value.length > 0)
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
  }
}

export function loadPassiveTreeRenderData(
  branch: PassiveTreeRenderBranch,
): Promise<PassiveTreeRenderData> {
  const existingPromise = renderDataPromiseCache.get(branch)
  if (existingPromise) return existingPromise

  const promise = fetch(
    `https://raw.githubusercontent.com/grindinggear/skilltree-export/master/${BRANCH_FILE_NAMES[branch]}`,
  )
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Could not load official passive-tree geometry (${response.status}).`)
      }
      return (await response.json()) as RawPassiveTreeData
    })
    .then((rawData) => normalizePassiveTreeRenderData(branch, rawData))

  renderDataPromiseCache.set(branch, promise)
  return promise
}
