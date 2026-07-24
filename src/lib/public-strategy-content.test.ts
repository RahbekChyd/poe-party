import { describe, expect, it } from 'vitest'
import { normalizeStrategyContentMetadata } from './public-strategy-content'

describe('normalizeStrategyContentMetadata', () => {
  it('keeps only supported metadata values', () => {
    expect(
      normalizeStrategyContentMetadata({
        content_slug: 'poe-3-29-alch-and-go',
        patch: '3.29',
        stage: 'alch_and_go',
        kind: 'farming',
        tags: ['mapping'],
        source_refs: [{ label: 'Source', url: 'https://example.com' }],
        verified_at: '2026-07-17',
        confidence: 'curated',
      }),
    ).toEqual({
      content_slug: 'poe-3-29-alch-and-go',
      patch: '3.29',
      stage: 'alch_and_go',
      kind: 'farming',
      tags: ['mapping'],
      source_refs: [{ label: 'Source', url: 'https://example.com' }],
      verified_at: '2026-07-17',
      confidence: 'curated',
    })
  })

  it('drops unsupported enum values instead of trusting database JSON', () => {
    expect(
      normalizeStrategyContentMetadata({
        content_slug: 'safe-slug',
        stage: 'unsupported',
        kind: 'unsupported',
        confidence: 'unsupported',
      }),
    ).toMatchObject({
      content_slug: 'safe-slug',
      stage: null,
      kind: null,
      confidence: null,
    })
  })

  it('returns null for empty or malformed metadata', () => {
    expect(normalizeStrategyContentMetadata(null)).toBeNull()
    expect(normalizeStrategyContentMetadata([])).toBeNull()
    expect(normalizeStrategyContentMetadata({})).toBeNull()
  })
})
