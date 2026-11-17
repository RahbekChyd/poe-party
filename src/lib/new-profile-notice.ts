const STORAGE_KEY = 'poe_new_profile_notice'
const NOTICE_TTL_MS = 15 * 60 * 1000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type PendingNotice = { version: 1; userId: string; createdAt: number }

export function clearNewProfileNotice(): void {
  try { window.sessionStorage.removeItem(STORAGE_KEY) } catch { /* Notice storage must not block sign-in. */ }
}

export function rememberNewProfileNotice(userId: unknown, now = Date.now()): void {
  clearNewProfileNotice()
  if (typeof userId !== 'string' || !UUID.test(userId) || !Number.isFinite(now)) return
  const notice: PendingNotice = { version: 1, userId, createdAt: now }
  try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(notice)) } catch { /* No credentials are stored here. */ }
}

function readNotice(now: number): PendingNotice | null {
  try {
    const value = window.sessionStorage.getItem(STORAGE_KEY)
    if (!value) return null
    if (value.length > 256) throw new Error('Invalid notice')
    const notice = JSON.parse(value) as Partial<PendingNotice>
    if (Object.keys(notice).length !== 3 || notice.version !== 1 || typeof notice.userId !== 'string' || !UUID.test(notice.userId) ||
      typeof notice.createdAt !== 'number' || !Number.isFinite(notice.createdAt) || notice.createdAt > now + 60000 || now - notice.createdAt > NOTICE_TTL_MS) {
      throw new Error('Invalid notice')
    }
    return notice as PendingNotice
  } catch {
    clearNewProfileNotice()
    return null
  }
}

export function hasPendingNewProfileNotice(now = Date.now()): boolean {
  return readNotice(now) !== null
}

/** Call only after the Auth server has verified the current user. */
export function takeNewProfileNotice(verifiedUserId: string, now = Date.now()): boolean {
  const notice = readNotice(now)
  clearNewProfileNotice()
  return notice?.userId === verifiedUserId
}
