export type PoeGame = 'poe1' | 'poe2'
export type PoeRealm = 'pc' | 'poe2'

export function normalizePoeGame(value: unknown): PoeGame {
  return value === 'poe2' ? 'poe2' : 'poe1'
}

export function getPoeRealm(game: PoeGame): PoeRealm {
  return game === 'poe2' ? 'poe2' : 'pc'
}

export function supportsAccountLeagues(game: PoeGame): boolean {
  return game === 'poe1'
}

export function supportsStashSnapshots(game: PoeGame): boolean {
  return game === 'poe1'
}
