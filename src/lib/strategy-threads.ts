import { normalizeScarabs, type Scarab } from './strategy-scarabs'

export const THREAD_NAMES = [
  'Abyss Thread', 'Bestiary Thread', 'Betrayal Thread', 'Blight Thread', 'Breach Thread',
  'Expedition Thread', 'Incursion Thread', 'Legion Thread', 'Ritual Thread', 'Ultimatum Thread',
] as const

export type Thread = Scarab

/** Saved Scarabs are deliberately never converted into Threads. */
export function normalizeThreads(value: unknown): Thread[] {
  return normalizeScarabs(value).filter((thread) => isThreadName(thread.name)).map((thread) => ({
    ...thread, alternatives: thread.alternatives.filter((alternative) => isThreadName(alternative.name)),
  }))
}

export function isThreadName(name: string): boolean {
  return (THREAD_NAMES as readonly string[]).includes(name)
}
