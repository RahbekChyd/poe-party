import {
  addPassiveTreeProfileContext,
  buildPassiveTreeUrl,
  getCharacterClassId,
  type CharacterProfileSnapshot,
} from './character-profile'
import { asRecord, readString, sortUniqueNumbers } from './parse-helpers'
import {
  decodePassiveTreeUrl,
  tryDecodePassiveTreeUrl,
  type PassiveTreeComparable,
} from './passive-tree-links'
import { getPassiveTreeRenderBranch, type PassiveTreeRenderRequest } from './passive-tree-render-data'
import { getPobTreeSpecComparable, getPobTreeSpecUrl } from './pob'
import type { PobTreeSpecLayout } from '../types/app'

type ClusterSocket = { label: string; name: string | null; nodeId?: number }

export type PassiveTreeSource = PassiveTreeRenderRequest & {
  title: string
  detail: string | null
  syncedAt?: string
  tree: PassiveTreeComparable
  secondaryAscendancyId?: number | null
  alternateAscendancy?: string | null
  link: string | null
  clusterSockets: ClusterSocket[]
  modifiedNodeIds: number[]
  unresolvedNodeIds: number[]
  unresolvedClusterCount?: number
  unresolvedClusterIds?: number[]
}

export type PassiveTreeTargetSource = 'recorded' | 'saved' | null

const VARIANT_BRANCHES = {
  standard: 'data',
  alternate: 'alternate',
  ruthless: 'ruthless',
  ruthless_alternate: 'ruthless-alternate',
} as const

function parseId(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) return null
  const id = Number(value)
  return Number.isSafeInteger(id) && id >= 0 ? id : null
}

function parseIds(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return sortUniqueNumbers(value.map(parseId).filter((id): id is number => id !== null))
}

function packMasteries(value: unknown): number[] {
  return Object.entries(asRecord(value)).flatMap(([node, effect]) => {
    const nodeId = parseId(node)
    const effectId = parseId(effect)
    if (!nodeId || !effectId || nodeId > 0xffff || effectId > 0xffff) return []
    return [effectId * 0x10000 + nodeId]
  })
}

function snapshotSide(value: unknown, title: string): PassiveTreeSource | null {
  const entry = asRecord(value)
  const gameVersion = readString(entry.tree_version)
  const variant = readString(entry.variant)
  if (!gameVersion || !variant || !Object.prototype.hasOwnProperty.call(VARIANT_BRANCHES, variant) ||
    !Array.isArray(entry.allocation_ids)) return null
  const branch = VARIANT_BRANCHES[variant as keyof typeof VARIANT_BRANCHES]

  const allocationIds = parseIds(entry.allocation_ids)
  const clusterIds = new Set(parseIds(entry.cluster_allocation_ids))
  const clusterAllocationIds = sortUniqueNumbers([
    ...allocationIds.filter((id) => id > 0xffff),
    ...clusterIds,
  ])
  const tree: PassiveTreeComparable = {
    classId: parseId(entry.class_id),
    ascendancyId: parseId(entry.ascendancy_id),
    // Legacy generated sockets can fit in the base tree's 16-bit ID range.
    hashes: allocationIds.filter((id) => id <= 0xffff && !clusterIds.has(id)),
    hashesEx: clusterAllocationIds,
    masteryEffects: packMasteries(entry.mastery_effects).filter((effect) => !clusterIds.has(effect & 0xffff)),
  }
  const clusterSockets = Array.isArray(entry.cluster_sockets)
    ? entry.cluster_sockets.flatMap((value) => {
        const socket = asRecord(value)
        const nodeId = parseId(socket.node_id)
        return nodeId === null ? [] : [{ label: `Node ${nodeId}`, name: readString(socket.name), nodeId }]
      })
    : []
  // The official URL serializes the base and secondary ascendancy in one byte.
  const secondaryId = parseId(entry.secondary_ascendancy_id) ?? 0
  const ascendancyByte = (tree.ascendancyId ?? 0) | (secondaryId << 2)
  const unresolvedClusterIds = parseIds(entry.unresolved_cluster_ids)
  return {
    title,
    detail: 'Saved run snapshot',
    syncedAt: readString(entry.synced_at) ?? undefined,
    gameVersion,
    branch,
    tree,
    secondaryAscendancyId: secondaryId,
    link: buildPassiveTreeUrl({ ...tree, gameVersion: gameVersion.replace(/_/g, '.'), ascendancyId: ascendancyByte }),
    clusterSockets,
    modifiedNodeIds: parseIds(entry.modified_nodes).filter((id) => !clusterIds.has(id)),
    unresolvedNodeIds: parseIds(entry.unresolved_node_ids).filter((id) => !clusterIds.has(id)),
    unresolvedClusterCount: Math.max(
      parseId(entry.unresolved_cluster_count) ?? 0,
      unresolvedClusterIds.length,
    ),
    unresolvedClusterIds,
  }
}

export function readPassiveTreeRunSnapshot(summary: unknown): {
  current: PassiveTreeSource
  target: PassiveTreeSource
} | null {
  const pair = asRecord(asRecord(summary).passive_tree_comparison)
  if (pair.version !== 1) return null
  const current = snapshotSide(pair.current, 'Current tree at run time')
  const target = snapshotSide(pair.target, 'Target tree at run time')
  return current && target ? { current, target } : null
}

function getProfileClusterSockets(
  profile: CharacterProfileSnapshot,
  rawSources: Record<string, unknown>[],
): ClusterSocket[] {
  const sockets = new Map<string, ClusterSocket>()
  function add(index: number | null, name: string | null) {
    const label = index === null ? 'Unknown socket' : `Socket index ${index}`
    if (!sockets.has(label)) sockets.set(label, { label, name })
  }

  for (const jewel of profile.passive_tree.jewelData ?? []) {
    if (jewel.subgraphNodeIds.length > 0) add(jewel.socketIndex, jewel.type)
  }
  for (const source of rawSources) {
    for (const [index, value] of Object.entries(asRecord(source.jewel_data ?? source.jewelData))) {
      const entry = asRecord(value)
      const subgraph = asRecord(entry.subgraph)
      if (Object.keys(subgraph.nodes ?? {}).length > 0) add(parseId(index), readString(entry.type))
    }
  }
  return [...sockets.values()]
}

function readLegacyIds(sources: Record<string, unknown>[], ...keys: string[]): number[] | null {
  for (const source of sources) {
    for (const key of keys) {
      const ids = parseIds(source[key])
      if (ids.length) return ids
    }
  }
  return null
}

export function getProfilePassiveTree(profile: CharacterProfileSnapshot | null): PassiveTreeSource | null {
  if (!profile) return null
  const stored = profile.passive_tree
  const raw = profile.raw_character
  const legacyTree = asRecord(raw.passive_tree)
  const rawSources = [asRecord(raw.passives), asRecord(legacyTree.passives), legacyTree, raw]
  const storedLink = tryDecodePassiveTreeUrl(stored.url)
  const legacyMasteries = sortUniqueNumbers(rawSources.flatMap((source) =>
    packMasteries(source.mastery_effects ?? source.masteryEffects),
  ))
  const tree: PassiveTreeComparable = {
    classId: stored.classId ?? getCharacterClassId(profile.class) ?? storedLink?.classId ?? null,
    ascendancyId: stored.ascendancyId ?? profile.ascendancy_class ?? storedLink?.ascendancyId ?? null,
    hashes: stored.hashes.length
      ? stored.hashes
      : readLegacyIds(rawSources, 'hashes', 'passiveSkills') ?? storedLink?.hashes ?? [],
    hashesEx: stored.hashesEx.length
      ? stored.hashesEx
      : readLegacyIds(rawSources, 'hashes_ex', 'hashesEx') ?? storedLink?.hashesEx ?? [],
    masteryEffects: [stored.masteryEffects, legacyMasteries, storedLink?.masteryEffects]
      .find((effects) => effects?.length) ?? [],
  }
  if (!tree.hashes.length && !tree.hashesEx.length && !tree.masteryEffects.length) return null

  const gameVersion = stored.version ??
    readString(asRecord(raw.metadata).version) ??
    readString(raw.version) ??
    readString(asRecord(legacyTree.metadata).version) ??
    readString(legacyTree.version) ??
    storedLink?.treeVersionLabel ?? null
  const ruthless = raw.ruthless === true || legacyTree.ruthless === true || /ruthless/i.test(profile.league ?? '')
  const alternateAscendancy = rawSources.map((source) => readString(source.alternate_ascendancy)).find(Boolean) ?? null
  const generatedLink = buildPassiveTreeUrl({ ...tree, gameVersion, alternateAscendancy })

  return {
    title: 'Latest synced character',
    detail: profile.character_name,
    syncedAt: profile.last_synced_at,
    gameVersion,
    // GGG's alternate_ascendancy field identifies the Bloodline, not an event tree.
    branch: getPassiveTreeRenderBranch(gameVersion, ruthless),
    tree,
    alternateAscendancy,
    link: addPassiveTreeProfileContext(storedLink?.url ?? generatedLink, {
      accountName: profile.poe_account_name,
      characterName: profile.character_name,
      realm: readString(raw.realm),
    }),
    clusterSockets: getProfileClusterSockets(profile, rawSources),
    modifiedNodeIds: sortUniqueNumbers(rawSources.flatMap((source) =>
      parseIds(Object.keys(asRecord(source.skill_overrides ?? source.skillOverrides))),
    )),
    unresolvedNodeIds: [],
  }
}

export function getTargetPassiveTree(
  spec: PobTreeSpecLayout | null,
  source: PassiveTreeTargetSource,
): PassiveTreeSource | null {
  if (!spec) return null
  const decoded = tryDecodePassiveTreeUrl(spec.url)
  const comparable = getPobTreeSpecComparable(spec)
  const tree = comparable && (comparable.hashes.length || comparable.hashesEx.length || comparable.masteryEffects.length)
    ? comparable
    : decoded ?? comparable
  if (!tree) return null

  const gameVersion = spec.treeVersion ?? decoded?.treeVersionLabel ?? null
  const link = decoded?.url ?? tryDecodePassiveTreeUrl(getPobTreeSpecUrl(spec))?.url ?? null
  return {
    title: source === 'recorded' ? 'Recorded target layout' : 'Current saved target',
    detail: spec.title,
    gameVersion,
    branch: getPassiveTreeRenderBranch(gameVersion),
    tree,
    secondaryAscendancyId: spec.secondaryAscendancyId,
    link,
    clusterSockets: (spec.clusterJewels ?? []).map((jewel) => ({
      label: `Node ${jewel.socketNodeId}`,
      name: jewel.name ?? jewel.typeLine,
      nodeId: jewel.socketNodeId,
    })),
    modifiedNodeIds: spec.modifiedNodeIds ?? [],
    unresolvedNodeIds: [],
  }
}

export function readManualPassiveTree(url: string): PassiveTreeSource {
  const decoded = decodePassiveTreeUrl(url)
  return {
    title: 'Pasted tree link',
    detail: null,
    link: decoded.url,
    gameVersion: decoded.treeVersionLabel,
    branch: getPassiveTreeRenderBranch(decoded.treeVersionLabel),
    tree: decoded,
    // The official link encodes allocation IDs. Cluster jewel items and node overrides require source data.
    clusterSockets: [],
    modifiedNodeIds: [],
    unresolvedNodeIds: [],
  }
}
