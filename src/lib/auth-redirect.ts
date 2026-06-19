
const AUTH_REDIRECT_STORAGE_KEY = 'poe-party:post-login-redirect'

function sanitizeTarget(target: string | null | undefined): string | null {
  if (!target) return null

  const trimmed = target.trim()
  if (!trimmed) return null

  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const url = new URL(trimmed)
      if (typeof window !== 'undefined' && url.origin !== window.location.origin) return null
      return `${url.pathname}${url.search}${url.hash}`
    }
  } catch {
    return null
  }

  if (!trimmed.startsWith('/')) return null
  if (trimmed.startsWith('//')) return null

  return trimmed
}

function mapPreviewPathToDashboard(path: string): string {
  if (path === '/preview' || path === '/preview/') return '/dashboard'
  if (path === '/preview/economy') return '/dashboard/economy'
  if (path === '/preview/members') return '/dashboard/members'
  if (path === '/preview/gear') return '/dashboard/gear'
  if (path === '/preview/strategies') return '/dashboard/strategies'
  if (path === '/preview/search') return '/dashboard/search'

  if (path.startsWith('/preview/strategies/')) {
    return path.replace('/preview/strategies/', '/dashboard/strategies/public/')
  }

  return '/dashboard'
}

export function resolvePostLoginTarget(target: string | null | undefined): string {
  const sanitized = sanitizeTarget(target)
  if (!sanitized) return '/dashboard'
  if (sanitized.startsWith('/preview')) return mapPreviewPathToDashboard(sanitized)
  if (sanitized.startsWith('/auth')) return '/dashboard'
  return sanitized
}

export function storePostLoginTarget(target: string | null | undefined) {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(AUTH_REDIRECT_STORAGE_KEY, resolvePostLoginTarget(target))
}

export function takeStoredPostLoginTarget(): string {
  if (typeof window === 'undefined') return '/dashboard'

  const stored = window.sessionStorage.getItem(AUTH_REDIRECT_STORAGE_KEY)
  window.sessionStorage.removeItem(AUTH_REDIRECT_STORAGE_KEY)
  return resolvePostLoginTarget(stored)
}

export function getLoginHref(nextTarget: string | null | undefined): string {
  const params = new URLSearchParams()
  const sanitized = sanitizeTarget(nextTarget)

  if (sanitized) {
    params.set('next', sanitized)
  }

  const query = params.toString()
  return query ? `/auth/login?${query}` : '/auth/login'
}
