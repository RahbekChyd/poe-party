import { describe, expect, it } from 'vitest'
import { hasPassiveTreeNodeArt } from './passive-tree-game-art'
import { normalizePassiveTreeRenderData } from './passive-tree-render-data'

const activeUrl = 'https://web.poecdn.com/image/passive-skill/skills-1.jpg?abc123'
const inactiveUrl = 'https://web.poecdn.com/image/passive-skill/skills-disabled-1.jpg?def456'
const frameUrl = 'https://web.poecdn.com/image/passive-skill/frame-1.png?abc123'
const groupUrl = 'https://web.poecdn.com/image/passive-skill/group-background-1.png?abc123'
const ascendancyUrl = 'https://web.poecdn.com/image/passive-skill/ascendancy-1.webp?abc123'
const smallIcon = 'Art/2DArt/SkillIcons/passives/Accuracy.png'
const notableIcon = 'Art/2DArt/SkillIcons/passives/Finesse.png'

function atlas(filename: string, coords: Record<string, { x: number; y: number; w: number; h: number }>) {
  return { filename, w: 128, h: 128, coords }
}

const iconCrop = { x: 15, y: 5, w: 14, h: 15 }
const frameCrop = { x: 32, y: 22, w: 21, h: 21 }
const geometry = {
  groups: {
    1: { x: 20, y: 10, background: { image: 'PSGroupBackground3', isHalfImage: true } },
    2: { x: 500, y: 500 },
  },
  nodes: {
    11: { group: 1, orbit: 0, orbitIndex: 0, icon: smallIcon, out: [12, 13] },
    12: { group: 1, orbit: 1, orbitIndex: 2, icon: notableIcon, isNotable: true },
    13: { group: 2, orbit: 1, orbitIndex: 0, isAscendancyStart: true, ascendancyName: 'Guardian' },
  },
}

describe('official passive tree artwork', () => {
  it('uses the nearest preferred zoom and deduplicates sheets across sprites', () => {
    const data = normalizePassiveTreeRenderData('data', {
      ...geometry,
      sprites: {
        normalActive: {
          '0.1246': atlas('https://web.poecdn.com/image/passive-skill/skills-0.jpg', { [smallIcon]: iconCrop }),
          '0.2109': atlas(activeUrl, { [smallIcon]: iconCrop }),
          '0.2972': atlas('https://web.poecdn.com/image/passive-skill/skills-2.jpg', { [smallIcon]: iconCrop }),
        },
        notableActive: { '0.2109': atlas(activeUrl, { [notableIcon]: iconCrop }) },
        frame: { '0.2109': atlas(frameUrl, { PSSkillFrameActive: frameCrop }) },
        groupBackground: { '0.2109': atlas(groupUrl, { PSGroupBackground3: frameCrop }) },
        ascendancy: { '0.2109': atlas(ascendancyUrl, { ClassesGuardian: frameCrop }) },
      },
    })

    expect(data.artwork?.sheets.map(({ url }) => url).sort()).toEqual([
      activeUrl,
      frameUrl,
      groupUrl,
      ascendancyUrl,
    ].sort())
    expect(data.artwork?.nodes[11].active.icon).toEqual({
      url: activeUrl,
      sourceX: iconCrop.x,
      sourceY: iconCrop.y,
      sourceWidth: iconCrop.w,
      sourceHeight: iconCrop.h,
      width: iconCrop.w / 0.2109,
      height: iconCrop.h / 0.2109,
    })
    expect(data.artwork?.nodes[11].active.frame?.url).toBe(frameUrl)
    expect(data.artwork?.backdrops).toMatchObject([
      { x: 20, y: 10, mirrorY: true, sprite: { url: groupUrl } },
      { x: 500, y: 500, sprite: { url: ascendancyUrl } },
    ])
    expect(data.connectors.map(({ id }) => id)).toEqual(['11-12'])
  })

  it('rejects off-origin, out-of-path, and invalid crops without changing geometry', () => {
    for (const filename of [
      'http://web.poecdn.com/image/passive-skill/skills-1.jpg',
      'https://web.poecdn.com.example.com/image/passive-skill/skills-1.jpg',
      'https://user@web.poecdn.com/image/passive-skill/skills-1.jpg',
      'https://web.poecdn.com/image/unrelated/skills-1.jpg',
      'https://web.poecdn.com/image/passive-skill/skills-1.svg',
      'https://web.poecdn.com/image/passive-skill/skills-1.jpg?destination=example.com',
    ]) {
      const data = normalizePassiveTreeRenderData('data', {
        ...geometry,
        sprites: { normalActive: { '0.2109': atlas(filename, { [smallIcon]: iconCrop }) } },
      })
      expect(data).toEqual(normalizePassiveTreeRenderData('data', geometry))
    }

    const data = normalizePassiveTreeRenderData('data', {
      ...geometry,
      sprites: { normalActive: { '0.2109': atlas(activeUrl, { [smallIcon]: { ...iconCrop, x: 127 } }) } },
    })
    expect(data.artwork).toBeUndefined()
  })

  it('uses a vector node until its matching artwork is available', () => {
    const { artwork } = normalizePassiveTreeRenderData('data', {
      ...geometry,
      sprites: {
        normalActive: { '0.2109': atlas(activeUrl, { [smallIcon]: iconCrop }) },
        normalInactive: { '0.2109': atlas(inactiveUrl, { [smallIcon]: iconCrop }) },
      },
    })
    if (!artwork) throw new Error('Expected official artwork in the fixture')

    const image = { naturalWidth: 128, naturalHeight: 128 } as HTMLImageElement
    expect(hasPassiveTreeNodeArt(artwork, new Map(), 11, true)).toBe(false)
    expect(hasPassiveTreeNodeArt(artwork, new Map([[activeUrl, image]]), 11, true)).toBe(true)
    expect(hasPassiveTreeNodeArt(artwork, new Map([[activeUrl, image]]), 11, false)).toBe(false)
    expect(hasPassiveTreeNodeArt(artwork, new Map([[inactiveUrl, image]]), 11, false)).toBe(true)
  })
})
