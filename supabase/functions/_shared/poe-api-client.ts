const POE_API_BASE = 'https://api.pathofexile.com'
const MAX_RETRIES = 3
const DEFAULT_RETRY_DELAY_MS = 1500
const MIN_REQUEST_GAP_MS = 500

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

let nextAvailableRequestAt = 0

export class PoeApiClient {
  private accessToken: string

  constructor(accessToken: string) {
    this.accessToken = accessToken
  }

  private async waitForTurn(): Promise<void> {
    const now = Date.now()
    const waitMs = Math.max(0, nextAvailableRequestAt - now)
    if (waitMs > 0) {
      await delay(waitMs)
    }
  }

  private scheduleNextRequest(delayMs = MIN_REQUEST_GAP_MS): void {
    nextAvailableRequestAt = Math.max(nextAvailableRequestAt, Date.now()) + delayMs
  }

  private logRateLimitHeaders(path: string, res: Response): void {
    const clientLimit = res.headers.get('X-Rate-Limit-Client')
    const clientState = res.headers.get('X-Rate-Limit-Client-State')
    const accountLimit = res.headers.get('X-Rate-Limit-Account')
    const accountState = res.headers.get('X-Rate-Limit-Account-State')
    const retryAfter = res.headers.get('Retry-After')

    if (clientLimit || clientState || accountLimit || accountState || retryAfter) {
      console.warn('PoE API rate limit headers:', {
        path,
        status: res.status,
        clientLimit,
        clientState,
        accountLimit,
        accountState,
        retryAfter,
      })
    }
  }

  private getRetryDelayMs(res: Response, attempt: number): number {
    const retryAfter = res.headers.get('Retry-After')
    const parsed = retryAfter ? Number(retryAfter) : NaN
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed * 1000
    }

    return DEFAULT_RETRY_DELAY_MS * attempt
  }

  private buildUrl(path: string, params?: Record<string, string>): string {
    const url = new URL(`${POE_API_BASE}${path}`)
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value) url.searchParams.set(key, value)
      }
    }
    return url.toString()
  }

  private async fetch<T>(path: string, params?: Record<string, string>): Promise<T> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
      await this.waitForTurn()
      const res = await fetch(this.buildUrl(path, params), {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'User-Agent': 'poe-group-tool/1.0 (contact: your-email@example.com)',
        },
      })

      this.logRateLimitHeaders(path, res)

      if (res.ok) {
        this.scheduleNextRequest()
        return res.json() as Promise<T>
      }

      const text = await res.text()
      if (res.status === 429 && attempt < MAX_RETRIES) {
        this.scheduleNextRequest(this.getRetryDelayMs(res, attempt))
        continue
      }

      this.scheduleNextRequest()
      throw new Error(`PoE API error ${res.status}: ${text}`)
    }

    throw new Error('PoE API request failed after retries')
  }

  async getProfile(): Promise<{ uuid: string; name: string; realm: string }> {
    return this.fetch('/profile')
  }

  async getCharacters(realm?: string): Promise<{ characters: PoeCharacter[] }> {
    return this.fetch('/character', realm ? { realm } : undefined)
  }

  async getCharacter(
    name: string,
    realm?: string,
  ): Promise<{ character: PoeCharacterDetail | null }> {
    return this.fetch(`/character/${encodeURIComponent(name)}`, realm ? { realm } : undefined)
  }

  async getAccountLeagues(): Promise<{ leagues: PoeLeague[] }> {
    return this.fetch('/account/leagues')
  }

  async getLeagueAccount(
    league: string,
    realm?: string,
  ): Promise<{ league_account: PoeLeagueAccount | null }> {
    return this.fetch(
      `/league-account/${encodeURIComponent(league)}`,
      realm ? { realm } : undefined,
    )
  }

  async listStashes(league: string): Promise<{ stashes: PoeStashTab[] }> {
    return this.fetch(`/stash/${encodeURIComponent(league)}`)
  }

  async getStash(
    league: string,
    stashId: string,
    substashId?: string,
  ): Promise<{ stash: PoeStashTabWithItems }> {
    const subPath = substashId ? `/${substashId}` : ''
    return this.fetch(`/stash/${encodeURIComponent(league)}/${stashId}${subPath}`)
  }
}

// Minimal types for Edge Function use (no import from src/)
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
}

export interface PoeCharacterDetail extends PoeCharacter {
  items?: PoeItem[]
  equipment?: PoeItem[]
  inventory?: PoeItem[]
  jewels?: PoeItem[]
  guardian?: PoeItem[]
  wickerman?: PoeItem[]
  passives?: {
    hashes?: number[]
    hashes_ex?: number[]
    mastery_effects?: Record<string, number>
    jewel_data?: Record<string, PoeItemJewelData>
    bandit_choice?: string
    pantheon_major?: string
    pantheon_minor?: string
    alternate_ascendancy?: string | number
    skill_overrides?: Record<string, unknown>
  }
  metadata?: {
    version?: string
  }
  passiveSkills?: number[]
  hashes?: number[]
  hashes_ex?: number[]
  hashesEx?: number[]
  mastery_effect_pairs?: number[]
  masteryEffectPairs?: number[]
  passive_tree_url?: string
  passiveTreeUrl?: string
  passive_skill_tree_url?: string
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
  [key: string]: unknown
}

export interface PoeLeague {
  id: string
  realm: string
  startAt?: string
  endAt?: string | null
  url?: string
}

export interface PoeStashTab {
  id: string
  parent?: string
  folder?: string
  name: string
  type: string
  index: number
  metadata?: {
    public?: boolean
    folder?: boolean
    colour?: string
  }
  children?: PoeStashTab[]
  colour?: { r: number; g: number; b: number }
}

export interface PoeItem {
  id: string
  name: string
  typeLine: string
  baseType?: string
  inventoryId?: string
  rarity?: string
  identified: boolean
  itemLevel: number
  ilvl?: number
  frameType: number
  frameTypeId?: string
  icon: string
  socketedItems?: PoeItem[]
  stackSize?: number
  maxStackSize?: number
  corrupted?: boolean
  fractured?: boolean
  synthesised?: boolean
  influences?: Record<string, boolean>
  sockets?: { group: number; attr?: string; sColour?: string }[]
  properties?: { name: string; values: [string, number][] }[]
  requirements?: { name: string; values: [string, number][] }[]
  implicitMods?: import('./poe-item-mods.ts').PoeItemMod[]
  explicitMods?: import('./poe-item-mods.ts').PoeItemMod[]
  craftedMods?: string[]
  fracturedMods?: string[]
  enchantMods?: string[]
  veiledMods?: string[]
  scourgeMods?: string[]
  veiled?: boolean
  support?: boolean
  monsterLevel?: number
  builtInSupport?: string
  vestigial?: boolean
  doubleCorrupted?: boolean
  unidentifiedTier?: number
  note?: string
  x?: number
  y?: number
  w?: number
  h?: number
}

export interface PoeStashTabWithItems extends PoeStashTab {
  items: PoeItem[]
  children?: PoeStashTabWithItems[]
}
