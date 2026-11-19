import { publicStrategyContentEntries } from './public-strategy-content'
import { describe, expect, it } from 'vitest'
import { THREAD_NAMES, isThreadName, normalizeThreads } from './strategy-threads'

describe('3.30 Thread planning', () => {
  it('preserves archived URLs and starts current editorial templates without old investment assumptions', () => {
    const current = publicStrategyContentEntries.filter((entry) => entry.patch === '3.30')
    expect(current).toHaveLength(9)
    expect(publicStrategyContentEntries.find((entry) => entry.slug === 'poe-3-29-alch-and-go')?.headline).toContain('Archived 3.29')
    for (const entry of current) {
      expect(entry.strategy.threads).toEqual([])
      expect(entry.strategy.mapRequirements).toEqual({})
      expect(entry.strategy.mapCost).toBeNull()
    }
  })
  it('has exactly the ten usable mechanics, excluding Frayed Thread', () => {
    expect(THREAD_NAMES).toHaveLength(10)
    expect(isThreadName('Frayed Thread')).toBe(false)
    expect(isThreadName('Memory Thread')).toBe(false)
    expect(isThreadName('Breach Thread')).toBe(true)
  })
  it('never maps saved Scarabs into Threads', () => {
    expect(normalizeThreads([{ name: 'Breach Scarab', quantity: 2 }])).toEqual([])
    expect(normalizeThreads(undefined)).toEqual([])
  })
  it('keeps current quantities and recognized alternatives', () => {
    expect(normalizeThreads([{ name: 'Breach Thread', quantity: 3, required: false,
      alternatives: [{ name: 'Legion Thread' }, { name: 'Frayed Thread' }] }])).toEqual([
      { name: 'Breach Thread', quantity: 3, required: false, alternatives: [{ name: 'Legion Thread' }] },
    ])
  })
})
