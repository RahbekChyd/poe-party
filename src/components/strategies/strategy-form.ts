import { z } from 'zod'
import type { Strategy } from '../../hooks/useStrategies'
import { isThreadName, type Thread } from '../../lib/strategy-threads'

const numericPct = z.preprocess(
  (value: string | number | null | undefined) => (value === '' || value == null ? null : Number(value)),
  z.number().min(0, 'Enter zero or more').nullable().optional(),
)

const threadName = z.string().trim().refine(isThreadName, 'Choose a Thread')

export const strategyFormSchema = z.object({
  name: z.string().trim().min(1, 'Enter a strategy name').max(64, 'Use 64 characters or fewer'),
  description: z.string().max(1000, 'Use 1,000 characters or fewer').optional().nullable(),
  difficulty: z.enum(['easy', 'normal', 'hard']),
  map_trade_link: z.string().optional().nullable(),
  atlas_tree_url: z.string().optional().nullable(),
  map_cost: z.preprocess(
    (value: string | number | null | undefined) => (value === '' || value == null ? null : Number(value)),
    z.number().int('Enter a whole number').min(0, 'Enter zero or more').nullable().optional(),
  ),
  map_requirements: z.object({
    atlas_drops: numericPct,
    item_rarity: numericPct,
    pack_size: numericPct,
    more_threads: numericPct,
    more_currency: numericPct,
    more_unique: numericPct,
  }),
  threads: z.array(z.object({
    name: threadName,
    quantity: z.preprocess(
      (value: string | number) => Number(value),
      z.number().int('Enter a whole number').min(1, 'Enter 1 to 8').max(8, 'Enter 1 to 8'),
    ),
    required: z.boolean(),
    alternatives: z.array(z.object({ name: threadName })),
  })),
})

export type StrategyFormInput = z.input<typeof strategyFormSchema>
export type StrategyFormValues = z.output<typeof strategyFormSchema>

export const EMPTY_STRATEGY: StrategyFormValues = {
  name: '',
  description: '',
  difficulty: 'normal',
  map_trade_link: '',
  atlas_tree_url: '',
  map_cost: null,
  map_requirements: {
    atlas_drops: null,
    item_rarity: null,
    pack_size: null,
    more_threads: null,
    more_currency: null,
    more_unique: null,
  },
  threads: [],
}

export function buildStrategyDefaults(strategy: Strategy): StrategyFormValues {
  const mapRequirements = strategy.map_requirements
  return {
    name: strategy.name,
    description: strategy.description ?? '',
    difficulty: strategy.difficulty ?? 'normal',
    atlas_tree_url: strategy.atlas_tree_url ?? '',
    map_trade_link: strategy.map_trade_link ?? '',
    map_cost: strategy.map_cost ?? null,
    map_requirements: {
      atlas_drops: mapRequirements?.atlas_drops ?? null,
      item_rarity: mapRequirements?.item_rarity ?? null,
      pack_size: mapRequirements?.pack_size ?? null,
      more_threads: mapRequirements?.more_threads ?? null,
      more_currency: mapRequirements?.more_currency ?? null,
      more_unique: mapRequirements?.more_unique ?? null,
    },
    threads: strategy.threads,
  }
}

export function threadLimitError(threads: Thread[]): string | undefined {
  const quantities = new Map<string, number>()
  for (const { name, quantity } of threads) {
    const total = (quantities.get(name) ?? 0) + quantity
    if (total > 8) return `Use at most 8 of each Thread type. ${name} adds up to ${total}.`
    quantities.set(name, total)
  }
  if (quantities.size > 3) return 'Use at most 3 Thread types per map.'
}

export function formatChaosValue(chaos: number): string {
  if (chaos > 0 && chaos < 1) return chaos.toFixed(1)
  return Math.round(chaos).toLocaleString()
}

export function toFieldStringValue(value: unknown): string {
  return value == null ? '' : String(value)
}
