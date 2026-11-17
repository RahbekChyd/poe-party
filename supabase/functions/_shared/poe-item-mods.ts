/** GGG 3.29+ uses ItemMod objects; legacy exports still contain strings. */
export type PoeItemMod = string | {
  description: string
  flags?: Record<string, boolean | undefined>
}

export function normalizePoeItemModLines(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const description = typeof entry === 'string'
      ? entry
      : entry && typeof entry === 'object' && typeof entry.description === 'string'
        ? entry.description
        : ''
    return description.split(/\r?\n/).map((line: string) => line.trim()).filter(Boolean)
  })
}

export function getPoeItemModLinesByFlag(value: unknown, flag: string): string[] {
  if (!Array.isArray(value)) return []
  return normalizePoeItemModLines(value.filter((entry) =>
    entry && typeof entry === 'object' && entry.flags?.[flag] === true
  ))
}
