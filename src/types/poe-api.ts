
// Path of Exile official API types

export interface PoeProfile {
  uuid: string
  name: string
  realm: string
}

export interface PoeCharacter {
  id: string
  name: string
  realm: string
  class: string
  ascendancyClass: number
  level: number
  experience: number
  league: string
  current?: boolean
  equipment?: PoeItem[]
  jewels?: PoeItem[]
  inventory?: PoeItem[]
  passives?: {
    hashes?: number[]
    hashes_ex?: number[]
    mastery_effects?: Record<string, number>
    jewel_data?: Record<string, PoeItemJewelData>
  }
  metadata?: {
    version?: string
  }
}

export interface PoeItemJewelData {
  type?: string
  radius?: number
  radiusMin?: number
  radiusVisual?: string
  subgraph?: {
    groups?: Record<string, unknown>
    nodes?: Record<string, unknown>
  }
}

export type PoeFrameType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 9 | 10

export interface PoeItemSocket {
  group: number
  attr?: string
  sColour?: string
}

export interface PoeProperty {
  name: string
  values: [string, number][]
  displayMode: number
  type?: number
}

export interface PoeMod {
  text: string
}

export interface PoeItem {
  id: string
  name: string
  typeLine: string
  baseType?: string
  inventoryId?: string
  rarity?: string
  identified: boolean
  itemLevel: number  // OAuth API
  ilvl?: number      // Legacy /character-window endpoint
  frameType: PoeFrameType
  icon: string
  socketedItems?: PoeItem[]
  stackSize?: number
  maxStackSize?: number
  corrupted?: boolean
  fractured?: boolean
  synthesised?: boolean
  influences?: Record<string, boolean>
  sockets?: PoeItemSocket[]
  properties?: PoeProperty[]
  requirements?: PoeProperty[]
  implicitMods?: string[]
  explicitMods?: string[]
  craftedMods?: string[]
  fracturedMods?: string[]
  enchantMods?: string[]
  veiledMods?: string[]
  scourgeMods?: string[]
  veiled?: boolean
  support?: boolean
  x?: number
  y?: number
  w?: number
  h?: number
  league?: string
  note?: string
}

export interface PoeLeagueAccount {
  atlas_passives?: {
    hashes?: number[]
  }
  atlas_passive_trees?: Array<{
    name: string
    hashes?: number[]
  }>
  atlasPassiveSkills?: number[]
  atlas_passive_skills?: number[]
  atlasPassiveHashes?: number[]
  atlas_passive_hashes?: number[]
  atlasSkillTreeUrl?: string
  atlas_skill_tree_url?: string
  atlas_tree_url?: string
}

export interface PoeStashTab {
  id: string
  name: string
  type: string
  index: number
  colour?: {
    r: number
    g: number
    b: number
  }
  hidden?: boolean
  selected?: boolean
  children?: PoeStashTab[]
  metadata?: {
    colour?: string
    public?: boolean
    folder?: boolean
    items?: number
  }
}

/** Compact stash-tab shape returned by the poe-list-stash-tabs Edge Function. */
export interface PoeStashTabSummary {
  id: string
  n: string
  i: number
  type: string
  colour: { r: number; g: number; b: number }
  hidden?: boolean
}

export interface PoeStashTabWithItems extends PoeStashTab {
  items: PoeItem[]
}

export interface PoeListStashesResponse {
  stashes: PoeStashTab[]
}

export interface PoeGetStashResponse {
  stash: PoeStashTabWithItems
}
