import { describe, expect, it } from 'vitest'
import type { PassiveTreeSource } from './passive-tree-comparison'
import { getPassiveTreeComparisonGeometry, getPassiveTreeSourceAscendancyIds } from './passive-tree-layout'
import { normalizePassiveTreeRenderData } from './passive-tree-render-data'

const bloodlineUrl = 'https://web.poecdn.com/image/passive-skill/bloodline-1.webp?fixture'
const ascendancyUrl = 'https://web.poecdn.com/image/passive-skill/ascendancy-1.webp?fixture'

function spriteSheet(url: string, key: string) {
  return {
    '0.2109': {
      filename: url,
      w: 360,
      h: 360,
      coords: {
        [key]: { x: 0, y: 0, w: 300, h: 300 },
        AscendancyMiddle: { x: 300, y: 300, w: 17, h: 17 },
        AscendancyFrameSmallAllocated: { x: 301, y: 321, w: 21, h: 21 },
      },
    },
  }
}

const rawData = {
  min_x: -4000,
  max_x: 4000,
  min_y: -3000,
  max_y: 3000,
  classes: [{ ascendancies: [{ id: 'Unrelated', name: 'Unrelated class' }] }],
  alternate_ascendancies: [
    { id: 'Aul', name: 'Aul Bloodline' },
    { id: 'Catarina', name: 'Catarina Bloodline' },
  ],
  groups: {
    1: { x: -2000, y: -1650, nodes: [11] },
    2: { x: 2000, y: 1650, nodes: [12] },
    3: { x: -2500, y: 400, nodes: [101, 102] },
    4: { x: -2600, y: 500, nodes: [201, 202] },
    5: { x: -2550, y: 600, nodes: [301] },
    6: { x: -2550, y: 350, nodes: [103] },
  },
  nodes: {
    11: { group: 1, out: [12, 101] },
    12: { group: 2 },
    101: { group: 3, isAscendancyStart: true, ascendancyName: 'Aul', isBloodline: true, out: [102, 201] },
    102: { group: 3, orbit: 1, orbitIndex: 2, ascendancyName: 'Aul', isBloodline: true, out: [103] },
    103: { group: 6, ascendancyName: 'Aul', isBloodline: true },
    201: { group: 4, isAscendancyStart: true, ascendancyName: 'Catarina', isBloodline: true, out: [202] },
    202: { group: 4, orbit: 1, orbitIndex: 4, ascendancyName: 'Catarina', isBloodline: true },
    301: { group: 5, isAscendancyStart: true, ascendancyName: 'Unrelated' },
  },
  sprites: {
    aulBloodline: spriteSheet(bloodlineUrl, 'ClassesAul'),
    catarinaBloodline: spriteSheet(bloodlineUrl, 'ClassesCatarina'),
    ascendancy: spriteSheet(ascendancyUrl, 'ClassesUnrelated'),
  },
}

function source(hashes: number[]): PassiveTreeSource {
  return {
    title: 'Fixture',
    detail: null,
    gameVersion: '3.30',
    branch: 'data',
    tree: { classId: null, ascendancyId: null, hashes, hashesEx: [], masteryEffects: [] },
    link: null,
    clusterSockets: [],
    modifiedNodeIds: [],
    unresolvedNodeIds: [],
  }
}

function expectSeparateArt(data: ReturnType<typeof normalizePassiveTreeRenderData>) {
  const backdrops = data.artwork?.backdrops ?? []
  expect(backdrops.length).toBeGreaterThan(1)
  for (const [index, left] of backdrops.entries()) {
    for (const right of backdrops.slice(index + 1)) {
      const overlapsX = Math.abs(left.x - right.x) < (left.sprite.width + right.sprite.width) / 2
      const overlapsY = Math.abs(left.y - right.y) < (left.sprite.height + right.sprite.height) / 2
      expect(overlapsX && overlapsY).toBe(false)
    }
  }
}

describe('passive-tree comparison wheel placement', () => {
  it('separates overlapping wheels in both sources and keeps artwork, nodes, and edges aligned', () => {
    const original = normalizePassiveTreeRenderData('data', rawData)
    const current = source([11, 102])
    const target = source([11, 202])
    const data = getPassiveTreeComparisonGeometry(original, current, target)
    const [aul, catarina] = data.ascendancyWheels ?? []

    expect(data.ascendancyWheels?.map(({ name }) => name)).toEqual(['Aul Bloodline', 'Catarina Bloodline'])
    expect(aul.y).toBeLessThan(catarina.y)
    expect(aul.labelY).toBeGreaterThan(aul.y)
    expect(data.nodes[11]).toBe(original.nodes[11])
    expect(data.nodes[301]).toBeUndefined()
    expect(data.groups[5]).toBeUndefined()
    expect(data.artwork?.sheets.map(({ url }) => url)).toEqual([bloodlineUrl])
    expectSeparateArt(data)
    expect(data.groups[3]).toMatchObject({ x: aul.x, y: aul.y })
    expect(data.nodes[101]).toMatchObject({ x: aul.x, y: aul.y })
    expect(data.artwork?.nodes[102]).toMatchObject({ x: data.nodes[102].x, y: data.nodes[102].y })
    expect(data.artwork?.backdrops.find(({ ascendancyId }) => ascendancyId === 'Aul'))
      .toMatchObject({ x: aul.x, y: aul.y })
    expect(data.nodes[103].x - data.nodes[101].x).toBe(original.nodes[103].x - original.nodes[101].x)
    expect(data.nodes[103].y - data.nodes[101].y).toBe(original.nodes[103].y - original.nodes[101].y)
    expect(data.connectors.map(({ id }) => id)).toEqual(['11-12', '101-102', '102-103', '201-202'])
    expect(data.connectors.find(({ id }) => id === '101-102')?.path).toBe(
      `M ${aul.x} ${aul.y} L ${data.nodes[102].x} ${data.nodes[102].y}`,
    )
    expect(getPassiveTreeComparisonGeometry(original, target, current)).toEqual(data)
  })

  it('keeps selections without allocated points when their source identifies the wheel', () => {
    const original = normalizePassiveTreeRenderData('data', rawData)
    const current = source([11])
    current.tree.classId = 0
    current.tree.ascendancyId = 1
    current.alternateAscendancy = 'Aul'
    const target = { ...source([12]), secondaryAscendancyId: 2 }

    expect([...getPassiveTreeSourceAscendancyIds(original, current)]).toEqual(['Unrelated', 'Aul'])
    expect([...getPassiveTreeSourceAscendancyIds(original, target)]).toEqual(['Catarina'])
    expect(getPassiveTreeComparisonGeometry(original, current, target).ascendancyWheels?.map(({ id }) => id))
      .toEqual(['Aul', 'Catarina', 'Unrelated'])
  })

  it('still separates footprints when adjacent sides overflow a small main tree', () => {
    const original = normalizePassiveTreeRenderData('data', {
      ...rawData,
      groups: {
        ...rawData.groups,
        1: { x: -50, y: -50, nodes: [11] },
        2: { x: 50, y: 50, nodes: [12] },
        3: { x: 250, y: 200, nodes: [101, 102] },
        4: { x: 200, y: 260, nodes: [201, 202] },
        5: { x: 200, y: 270, nodes: [301] },
        6: { x: 250, y: 220, nodes: [103] },
      },
    })
    const data = getPassiveTreeComparisonGeometry(original, source([11, 102]), source([12, 202, 301]))
    expect(data.ascendancyWheels).toHaveLength(3)
    expectSeparateArt(data)
    for (const { x, y, sprite } of data.artwork?.backdrops ?? []) {
      expect(x - sprite.width / 2).toBeGreaterThanOrEqual(data.bounds.minX)
      expect(y - sprite.height / 2).toBeGreaterThanOrEqual(data.bounds.minY)
      expect(x + sprite.width / 2).toBeLessThanOrEqual(data.bounds.maxX)
      expect(y + sprite.height / 2).toBeLessThanOrEqual(data.bounds.maxY)
    }
  })
})
