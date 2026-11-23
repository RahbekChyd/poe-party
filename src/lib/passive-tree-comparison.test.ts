import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CharacterProfileSnapshot } from './character-profile'
import {
  getProfilePassiveTree,
  readPassiveTreeRunSnapshot,
} from './passive-tree-comparison'
import { buildPassiveTreeDiffViewModel } from './passive-tree-diff'
import {
  loadPassiveTreeRenderData,
  normalizePassiveTreeRenderData,
  resolvePassiveTreeRenderResolution,
} from './passive-tree-render-data'

const rawGeometry = {
  constants: {
    skillsPerOrbit: [1, 16, 40, 72],
    orbitRadii: [0, 100, 200, 300],
  },
  groups: {
    1: { x: 1000, y: -1000 },
    2: { x: 2500, y: -1000 },
  },
  nodes: {
    11: { name: 'First Mastery', group: 1, orbit: 1, orbitIndex: 2, isMastery: true, masteryEffects: [{ effect: 42, stats: ['Mastery effect'] }] },
    12: { name: 'Second Mastery', group: 1, orbit: 1, orbitIndex: 1, isMastery: true, masteryEffects: [{ effect: 42, stats: ['Mastery effect'] }] },
    13: { group: 1, orbit: 2, orbitIndex: 39, out: [14, 15] },
    14: { group: 1, orbit: 2, orbitIndex: 0 },
    15: { group: 2, orbit: 3, orbitIndex: 3 },
    16: { group: 1, orbit: 2, orbitIndex: 5 },
  },
}

const snapshotSide = {
  tree_version: '3_30',
  variant: 'standard',
  allocation_ids: [11, 13, 15, 79999],
  mastery_effects: { '11': 42 },
  cluster_sockets: [{ node_id: 13, name: 'Cluster fixture' }],
  cluster_allocation_ids: [79999],
  unresolved_cluster_count: 2,
  unresolved_cluster_ids: [80000],
  modified_nodes: [13],
  unresolved_node_ids: [49999],
}

afterEach(() => vi.unstubAllGlobals())

describe('passive tree comparison', () => {
  it('uses PoB orbit angles by orbit size and the shortest connector arcs', () => {
    const data = normalizePassiveTreeRenderData('data', rawGeometry)
    // Pinned PassiveTree:CalcOrbitAngles yields 45° for slots 2/16 and 5/40, and 15° for 3/72.
    expect(data.nodes[11].x).toBeCloseTo(1070.710678)
    expect(data.nodes[11].y).toBeCloseTo(-1070.710678)
    expect(data.nodes[16].x).toBeCloseTo(1141.421356)
    expect(data.nodes[16].y).toBeCloseTo(-1141.421356)
    expect(data.nodes[15].x).toBeCloseTo(2577.645714)
    expect(data.nodes[15].y).toBeCloseTo(-1289.777748)
    // The shared orbit wraps from 350° to 0° clockwise. The inter-group edge is straight.
    expect(data.connectors.find((connector) => connector.id === '13-14')?.path)
      .toContain('A 200 200 0 0 1 1000 -1200')
    expect(data.connectors.find((connector) => connector.id === '13-15')?.path).toContain(' L ')
  })

  it('keeps ascendancy wheels separate from the main tree in the comparison map', () => {
    const data = normalizePassiveTreeRenderData('data', {
      ...rawGeometry,
      nodes: {
        21: { group: 1, orbit: 0, orbitIndex: 0, classStartIndex: 5, out: [22, 23] },
        22: { group: 1, orbit: 1, orbitIndex: 1, in: [26] },
        23: { group: 2, orbit: 0, orbitIndex: 0, isAscendancyStart: true, ascendancyName: 'Guardian', out: [24] },
        24: { group: 2, orbit: 1, orbitIndex: 1, ascendancyName: 'Guardian' },
        25: { group: 2, orbit: 1, orbitIndex: 2, isAscendancyStart: true, ascendancyName: 'Ascendant', out: [26] },
        26: { group: 2, orbit: 1, orbitIndex: 3, name: 'Path of the Templar', ascendancyName: 'Ascendant' },
      },
    })

    expect(data.connectors.map(({ id }) => id)).toEqual(['21-22', '23-24', '25-26'])
    expect(data.nodes[21].connectedNodeIds).toContain(23)
    expect(data.nodes[22].connectedNodeIds).toContain(26)
  })

  it('compares the saved pair by node and effect and retains review information', () => {
    const summary = {
      passive_tree_comparison: {
        version: 1,
        current: snapshotSide,
        target: { ...snapshotSide, allocation_ids: [12, 14, 15], mastery_effects: { '12': 42 }, modified_nodes: [] },
      },
    }
    const pair = readPassiveTreeRunSnapshot(summary)
    expect(pair).not.toBeNull()
    if (!pair) return
    const diff = buildPassiveTreeDiffViewModel(pair.current, pair.target, normalizePassiveTreeRenderData('data', rawGeometry))
    expect(diff.counts).toEqual({ target: 1, current: 0, mastery: 2 })
    expect(diff.entries.filter((entry) => entry.kind === 'mastery').map((entry) =>
      [entry.node.nodeId, entry.currentEffect, entry.targetEffect],
    )).toEqual([[11, 42, null], [12, null, 42]])
    expect(diff.unknownNodeIds).toEqual([49999])
    expect(pair.current.tree.hashesEx).toEqual([79999])
    expect(pair.current.modifiedNodeIds).toEqual([13])
    expect(pair.current.clusterSockets).toEqual([{ label: 'Node 13', name: 'Cluster fixture' }])
    expect(pair.current.unresolvedClusterCount).toBe(2)
    expect(pair.current.unresolvedClusterIds).toEqual([80000])
    expect(readPassiveTreeRunSnapshot({ passive_tree_comparison: { version: 1, current: snapshotSide } })).toBeNull()
  })

  it('uses standard geometry for Bloodlines and keeps both cluster snapshot shapes', () => {
    const profile = {
      character_name: 'Fixture',
      last_synced_at: '2026-11-23T10:30:00Z',
      passive_tree: {
        classId: 3,
        ascendancyId: 1,
        hashes: [],
        hashesEx: [],
        masteryEffects: [],
        jewelData: [{
          socketIndex: 0,
          type: 'Normal socket index fixture',
          subgraphNodeIds: [10001],
        }],
      },
      raw_character: {
        metadata: { version: '3.30.0b' },
        passives: {
          alternate_ascendancy: 'Chaos',
          hashes: [13],
          hashes_ex: [4000],
          mastery_effects: { '11': 42 },
          skill_overrides: { '13': {} },
          jewel_data: { '2': { type: 'Legacy cluster', subgraph: { nodes: { '10002': {} } } } },
        },
      },
    } as unknown as CharacterProfileSnapshot
    const tree = getProfilePassiveTree(profile)
    expect(tree?.title).toBe('Latest synced character')
    expect(tree?.syncedAt).toBe(profile.last_synced_at)
    expect(tree?.branch).toBe('data')
    expect(tree?.tree.hashesEx).toEqual([4000])
    expect(tree?.clusterSockets?.map((socket) => socket.label)).toEqual(['Socket index 0', 'Socket index 2'])
    expect(tree?.modifiedNodeIds).toEqual([13])

    expect(resolvePassiveTreeRenderResolution(
      { branch: 'data', gameVersion: '3.30.0b' },
      { branch: 'data', gameVersion: '3_30' },
    ).supported).toBe(true)
    expect(resolvePassiveTreeRenderResolution(
      { branch: 'data', gameVersion: '3.30.0b' },
      { branch: 'alternate', gameVersion: '3_30_alternate' },
    ).supported).toBe(false)
    expect(resolvePassiveTreeRenderResolution(
      { branch: 'data', gameVersion: '3.29.0' },
      { branch: 'data', gameVersion: '3_30' },
    ).supported).toBe(false)
    expect(resolvePassiveTreeRenderResolution(
      { branch: 'data', gameVersion: '3.30.1' },
      { branch: 'data', gameVersion: '3_30' },
    ).supported).toBe(false)
  })

  it('retries after a failed geometry fetch', async () => {
    const fetchFixture = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, json: async () => rawGeometry })
    vi.stubGlobal('fetch', fetchFixture)
    await expect(loadPassiveTreeRenderData('ruthless-alternate')).rejects.toThrow('503')
    await expect(loadPassiveTreeRenderData('ruthless-alternate')).resolves.toMatchObject({
      branch: 'ruthless-alternate', versionFamily: '3_30',
    })
    expect(fetchFixture).toHaveBeenCalledTimes(2)
  })
})
