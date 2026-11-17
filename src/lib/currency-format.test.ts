import { expect, it } from 'vitest'
import { formatCurrencyAmount } from './utils'
it('shows chaos when the requested Divine conversion is unavailable', () => {
  for (const missing of [0, -1, NaN, Infinity])
    expect(formatCurrencyAmount(100, 'divine', missing)).toBe('100c')
  expect(formatCurrencyAmount(100, 'divine', 200)).toBe('0.5 div')
})
