import { createClient } from '@supabase/supabase-js'
const configuredSupabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const configuredSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

function isValidHttpUrl(value: string | undefined): value is string {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export const supabaseConfiguration = {
  isConfigured:
    isValidHttpUrl(configuredSupabaseUrl) && Boolean(configuredSupabaseAnonKey?.trim()),
} as const

// Keep imports safe so a missing deployment variable renders the configuration fallback instead
// of throwing before React can mount. The placeholder client is never used while unconfigured.
const supabaseUrl = isValidHttpUrl(configuredSupabaseUrl)
  ? configuredSupabaseUrl
  : 'http://127.0.0.1:54321'
const supabaseAnonKey = configuredSupabaseAnonKey?.trim() || 'configuration-required'
const supabaseProjectStorageId = new URL(supabaseUrl).hostname.split('.')[0]
const supabaseAuthStorageKey = `sb-${supabaseProjectStorageId}-auth-token`

if (typeof window !== 'undefined') {
  // Earlier releases used Supabase's localStorage default. Remove only this project's
  // legacy credential (including chunked values) before switching to tab-scoped storage.
  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index)
    if (key === supabaseAuthStorageKey || key?.startsWith(`${supabaseAuthStorageKey}.`)) {
      window.localStorage.removeItem(key)
    }
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
    storageKey: supabaseAuthStorageKey,
  },
})
