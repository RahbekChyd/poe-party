
export type PoeGame = 'poe1' | 'poe2'
export type PoeRealm = 'pc' | 'poe2'

export interface PoeGameCapabilities {
  supportsAccountLeagues: boolean
  supportsStashSnapshots: boolean
  supportsGroupEconomy: boolean
  supportsAtlasTree: boolean
  supportsScarabStrategies: boolean
  supportsOptimizer: boolean
  supportsGeneratedPassiveTreeUrl: boolean
  supportsProfileAtlasTree: boolean
  supportsMarketOverview: boolean
}

const POE_GAME_CAPABILITIES: Record<PoeGame, PoeGameCapabilities> = {
  poe1: {
    supportsAccountLeagues: true,
    supportsStashSnapshots: true,
    supportsGroupEconomy: true,
    supportsAtlasTree: true,
    supportsScarabStrategies: true,
    supportsOptimizer: true,
    supportsGeneratedPassiveTreeUrl: true,
    supportsProfileAtlasTree: true,
    supportsMarketOverview: true,
  },
  poe2: {
    supportsAccountLeagues: false,
    supportsStashSnapshots: false,
    supportsGroupEconomy: false,
    supportsAtlasTree: false,
    supportsScarabStrategies: false,
    supportsOptimizer: false,
    supportsGeneratedPassiveTreeUrl: false,
    supportsProfileAtlasTree: false,
    supportsMarketOverview: true,
  },
}

export const POE_GAME_OPTIONS: Array<{
  id: PoeGame
  label: string
  description: string
}> = [
  {
    id: 'poe1',
    label: 'Path of Exile 1',
    description: 'Full support for stash, atlas, optimizer, and existing PoE1 workflows.',
  },
  {
    id: 'poe2',
    label: 'Path of Exile 2',
    description: 'Character sync, shared planning, and market overview without PoE1-only systems.',
  },
]

const rawPoe2AllowedAccounts = String(import.meta.env.VITE_POE2_ALLOWED_ACCOUNT_NAMES ?? '')
  .split(',')
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean)

const POE2_ALLOWED_ACCOUNT_NAMES = new Set(
  rawPoe2AllowedAccounts.filter((entry) => entry !== '*'),
)
const ALLOW_ALL_POE2_ACCOUNTS = rawPoe2AllowedAccounts.includes('*')

export function normalizePoeAccountName(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase()
  return normalized ? normalized : null
}

export function canUsePoe2FromAccountName(value: string | null | undefined): boolean {
  const normalized = normalizePoeAccountName(value)
  return (
    normalized != null &&
    (ALLOW_ALL_POE2_ACCOUNTS || POE2_ALLOWED_ACCOUNT_NAMES.has(normalized))
  )
}

export function getAvailablePoeGameOptions(poeAccountName: string | null | undefined) {
  return canUsePoe2FromAccountName(poeAccountName)
    ? POE_GAME_OPTIONS
    : POE_GAME_OPTIONS.filter((game) => game.id === 'poe1')
}

export function isPoeGame(value: unknown): value is PoeGame {
  return value === 'poe1' || value === 'poe2'
}

export function normalizePoeGame(value: unknown): PoeGame {
  return isPoeGame(value) ? value : 'poe1'
}

export function getPoeRealm(game: PoeGame): PoeRealm {
  return game === 'poe2' ? 'poe2' : 'pc'
}

export function getPoeGameCapabilities(game: PoeGame): PoeGameCapabilities {
  return POE_GAME_CAPABILITIES[game]
}

export function getPoeGameLabel(game: PoeGame): string {
  return game === 'poe2' ? 'Path of Exile 2' : 'Path of Exile 1'
}

export function getPoeGameShortLabel(game: PoeGame): string {
  return game === 'poe2' ? 'PoE2' : 'PoE1'
}
