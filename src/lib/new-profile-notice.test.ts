import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearNewProfileNotice, hasPendingNewProfileNotice, rememberNewProfileNotice, takeNewProfileNotice } from './new-profile-notice'

const userId = '11111111-1111-4111-8111-111111111111'
const otherId = '22222222-2222-4222-8222-222222222222'
const key = 'poe_new_profile_notice'
const now = 1794920000000

describe('new-profile sign-in notice', () => {
  beforeEach(() => sessionStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('stores only bounded non-credential metadata and shows once for the verified matching user', () => {
    rememberNewProfileNotice(userId, now)
    expect(JSON.parse(sessionStorage.getItem(key)!)).toEqual({ version: 1, userId, createdAt: now })
    expect(hasPendingNewProfileNotice(now)).toBe(true)
    expect(takeNewProfileNotice(userId, now)).toBe(true)
    expect(takeNewProfileNotice(userId, now)).toBe(false)
    expect(sessionStorage.getItem(key)).toBeNull()
  })

  it('does not show a different account the notice and clears the stale handoff', () => {
    rememberNewProfileNotice(userId, now)
    expect(takeNewProfileNotice(otherId, now)).toBe(false)
    expect(sessionStorage.getItem(key)).toBeNull()
  })

  it('rejects expired, future, malformed and oversized storage', () => {
    for (const value of [
      JSON.stringify({ version: 1, userId, createdAt: now - 15 * 60 * 1000 - 1 }),
      JSON.stringify({ version: 1, userId, createdAt: now + 60001 }),
      JSON.stringify({ version: 1, userId, createdAt: now, extra: 'unexpected' }),
      'null', '{not-json', 'x'.repeat(257),
    ]) {
      sessionStorage.setItem(key, value)
      expect(hasPendingNewProfileNotice(now)).toBe(false)
      expect(sessionStorage.getItem(key)).toBeNull()
    }
  })

  it('does not preserve an old handoff when the next response has no valid user ID', () => {
    rememberNewProfileNotice(userId, now)
    rememberNewProfileNotice('not-a-user-id', now)
    expect(hasPendingNewProfileNotice(now)).toBe(false)
  })

  it('unavailable storage cannot crash sign-in or display another account notice', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage unavailable') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable') })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('Storage unavailable') })
    expect(() => rememberNewProfileNotice(userId, now)).not.toThrow()
    expect(() => clearNewProfileNotice()).not.toThrow()
    expect(takeNewProfileNotice(userId, now)).toBe(false)
  })
})
