
export interface ScarabAlternative {
  name: string
}

export interface Scarab {
  name: string
  quantity: number
  required: boolean
  alternatives: ScarabAlternative[]
}

function normalizeScarabAlternative(value: unknown): ScarabAlternative | null {
  if (!value || typeof value !== 'object') return null

  const name = String((value as { name?: unknown }).name ?? '').trim()
  if (!name) return null

  return { name }
}

export function normalizeScarab(value: unknown): Scarab | null {
  if (!value || typeof value !== 'object') return null

  const raw = value as {
    name?: unknown
    quantity?: unknown
    required?: unknown
    alternatives?: unknown
  }
  const name = String(raw.name ?? '').trim()
  if (!name) return null

  const quantityValue = Number(raw.quantity)
  const quantity =
    Number.isFinite(quantityValue) && quantityValue >= 1 ? Math.trunc(quantityValue) : 1
  const required = typeof raw.required === 'boolean' ? raw.required : true
  const alternatives = Array.isArray(raw.alternatives)
    ? raw.alternatives
        .map(normalizeScarabAlternative)
        .filter(
          (alternative): alternative is ScarabAlternative =>
            !!alternative && alternative.name !== name,
        )
    : []

  return {
    name,
    quantity,
    required,
    alternatives,
  }
}

export function normalizeScarabs(value: unknown): Scarab[] {
  if (!Array.isArray(value)) return []
  return value.map(normalizeScarab).filter((scarab): scarab is Scarab => !!scarab)
}
