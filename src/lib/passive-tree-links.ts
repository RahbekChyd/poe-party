import { sortUniqueNumbers } from './parse-helpers'

export interface DecodedPassiveTreeUrl {
  url: string
  treeVersionLabel: string | null
  payloadVersion: number
  classId: number
  rawAscendancyByte: number
  ascendancyId: number | null
  secondaryAscendancyId: number | null
  hashes: number[]
  hashesEx: number[]
  masteryEffects: number[]
}

export interface PassiveTreeComparable {
  classId: number | null
  ascendancyId: number | null
  hashes: number[]
  hashesEx: number[]
  masteryEffects: number[]
}

export interface PassiveTreeMasterySelection {
  nodeId: number
  effectId: number
  effectKey: string
}

const UINT16_MAX = 0xffff
const CLUSTER_NODE_OFFSET = 0x10000

function decodeBase64UrlPayload(payload: string): Uint8Array {
  const normalized = payload.trim().replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  const binary = atob(`${normalized}${padding}`)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function readUint32BigEndian(bytes: Uint8Array, index: number): number {
  return (
    bytes[index] * 0x1000000 +
    bytes[index + 1] * 0x10000 +
    bytes[index + 2] * 0x100 +
    bytes[index + 3]
  )
}

function decodeNodePairs(bytes: Uint8Array, offset = 0): number[] {
  const values: number[] = []
  for (let index = offset; index + 1 < bytes.length; index += 2) {
    values.push(bytes[index] * 256 + bytes[index + 1])
  }
  return values
}

function decodeMasteryPairs(bytes: Uint8Array): number[] {
  const values: number[] = []
  for (let index = 0; index + 3 < bytes.length; index += 4) {
    const effectId = bytes[index] * 256 + bytes[index + 1]
    const nodeId = bytes[index + 2] * 256 + bytes[index + 3]
    values.push((((effectId & 0xffff) << 16) | (nodeId & 0xffff)) >>> 0)
  }
  return values
}

function normalizeClusterNodeId(value: number): number | null {
  if (!Number.isFinite(value)) return null
  const normalizedValue = Math.trunc(value)
  if (normalizedValue < 0) return null
  return normalizedValue <= UINT16_MAX ? normalizedValue + CLUSTER_NODE_OFFSET : normalizedValue
}

function normalizeClusterNodeIds(values: number[]): number[] {
  return sortUniqueNumbers(
    values.map(normalizeClusterNodeId).filter((value): value is number => value != null),
  )
}

function normalizeMasteryPairs(values: number[]): number[] {
  return sortUniqueNumbers(
    values.filter((value) => Number.isFinite(value) && value >= 0 && value <= 0xffffffff),
  )
}

function unpackMasterySelection(value: number): { nodeId: number; effectId: number } | null {
  if (!Number.isFinite(value) || value < 0) return null
  return {
    nodeId: value & UINT16_MAX,
    effectId: (value >>> 16) & UINT16_MAX,
  }
}

export function getPassiveTreeMasterySelections(
  values: number[],
): PassiveTreeMasterySelection[] {
  const selectionsByKey = new Map<string, PassiveTreeMasterySelection>()

  for (const value of normalizeMasteryPairs(values)) {
    const selection = unpackMasterySelection(value)
    if (!selection || selection.nodeId <= 0 || selection.effectId <= 0) continue

    const effectKey = `${selection.nodeId}:${selection.effectId}`
    if (selectionsByKey.has(effectKey)) continue

    selectionsByKey.set(effectKey, {
      nodeId: selection.nodeId,
      effectId: selection.effectId,
      effectKey,
    })
  }

  return [...selectionsByKey.values()].sort((left, right) => {
    if (left.effectId !== right.effectId) return left.effectId - right.effectId
    return left.nodeId - right.nodeId
  })
}



function extractTreePayload(url: string): {
  payload: string
  treeVersionLabel: string | null
} {
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    throw new Error('Paste a full official Path of Exile passive tree link.')
  }

  if (parsedUrl.protocol !== 'https:' || !/(^|\.)pathofexile\.com$/.test(parsedUrl.hostname)) {
    throw new Error('Only official Path of Exile passive tree links are supported here.')
  }

  const segments = parsedUrl.pathname
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)

  const routeIndex = segments.findIndex(
    (segment) => segment === 'passive-skill-tree' || segment === 'fullscreen-passive-skill-tree',
  )

  if (routeIndex < 0 || routeIndex === segments.length - 1) {
    throw new Error('This does not look like a supported passive tree link.')
  }

  const payload = segments[segments.length - 1] ?? null
  const treeVersionLabel =
    segments.length - routeIndex >= 3 ? (segments[segments.length - 2] ?? null) : null

  if (!payload || payload.includes('.')) {
    throw new Error('This passive tree link is missing its encoded payload.')
  }

  return {
    payload,
    treeVersionLabel,
  }
}

export function decodePassiveTreeUrl(url: string): DecodedPassiveTreeUrl {
  const { payload, treeVersionLabel } = extractTreePayload(url)
  const bytes = decodeBase64UrlPayload(payload)

  if (bytes.length < 6) {
    throw new Error('This passive tree link is too short to decode.')
  }

  const payloadVersion = readUint32BigEndian(bytes, 0)
  if (payloadVersion > 6) {
    throw new Error(`Unsupported passive tree payload version: ${payloadVersion}.`)
  }

  const classId = bytes[4] ?? 0
  const rawAscendancyByte = payloadVersion >= 4 ? (bytes[5] ?? 0) : 0
  const ascendancyId = payloadVersion >= 4 ? rawAscendancyByte & 3 : 0
  const secondaryAscendancyId = payloadVersion >= 4 ? (rawAscendancyByte & 12) >> 2 : 0

  const nodesStart = payloadVersion >= 4 ? 7 : 6
  const mainNodeCount =
    payloadVersion >= 5 ? (bytes[6] ?? 0) : Math.floor((bytes.length - nodesStart) / 2)
  const nodesEnd = nodesStart + mainNodeCount * 2
  if (nodesEnd > bytes.length) throw new Error('This passive tree link is missing node data.')
  const hashes = decodeNodePairs(bytes.slice(nodesStart, nodesEnd))

  let hashesEx: number[] = []
  let masteryEffects: number[] = []

  if (payloadVersion >= 5) {
    if (bytes.length <= nodesEnd) throw new Error('This passive tree link is missing cluster jewel data.')
    const clusterCount = bytes[nodesEnd] ?? 0
    const clusterStart = nodesEnd + 1
    const clusterEnd = clusterStart + clusterCount * 2
    if (clusterEnd > bytes.length) throw new Error('This passive tree link is missing cluster node data.')
    hashesEx = normalizeClusterNodeIds(decodeNodePairs(bytes.slice(clusterStart, clusterEnd)))

    if (payloadVersion >= 6) {
      if (bytes.length <= clusterEnd) throw new Error('This passive tree link is missing mastery data.')
      const masteryCount = bytes[clusterEnd] ?? 0
      const masteryStart = clusterEnd + 1
      const masteryEnd = masteryStart + masteryCount * 4
      if (masteryEnd > bytes.length) throw new Error('This passive tree link is missing mastery data.')
      masteryEffects = decodeMasteryPairs(bytes.slice(masteryStart, masteryEnd))
    }
  }

  return {
    url,
    treeVersionLabel,
    payloadVersion,
    classId,
    rawAscendancyByte,
    ascendancyId: ascendancyId > 0 ? ascendancyId : null,
    secondaryAscendancyId: secondaryAscendancyId > 0 ? secondaryAscendancyId : null,
    hashes: sortUniqueNumbers(hashes),
    hashesEx: normalizeClusterNodeIds(hashesEx),
    masteryEffects: normalizeMasteryPairs(masteryEffects),
  }
}

export function tryDecodePassiveTreeUrl(
  url: string | null | undefined,
): DecodedPassiveTreeUrl | null {
  if (!url || !url.trim()) return null
  try {
    return decodePassiveTreeUrl(url)
  } catch {
    return null
  }
}
