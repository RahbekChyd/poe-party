const POE_WIKI_API_URL = 'https://www.poewiki.net/w/api.php'
const POE_WIKI_FILE_REDIRECT_BASE = 'https://www.poewiki.net/wiki/Special:Redirect/file'
const DEFAULT_USER_AGENT =
  'OAuth poeparty/1.0 (contact: support@poe-party.com) optimizer-worker'
const FETCH_TIMEOUT_MS = Number(process.env.POE_WIKI_FETCH_TIMEOUT_MS ?? 5000)
const iconUrlCache = new Map()

function trim(value) {
  return String(value ?? '').trim() || null
}

function normalizeBaseType(value) {
  return trim(String(value ?? '').replace(/\s+/g, ' '))
}

function toCargoStringLiteral(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function getPoeWikiFileRedirectUrl(fileTitle) {
  const normalizedTitle = trim(fileTitle)?.replace(/^File:/i, '').trim()
  if (!normalizedTitle) return null

  return `${POE_WIKI_FILE_REDIRECT_BASE}/${encodeURIComponent(
    normalizedTitle.replace(/\s+/g, '_'),
  )}`
}

async function fetchJson(url) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  timeout.unref?.()

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': process.env.POE_WIKI_USER_AGENT || DEFAULT_USER_AGENT,
      },
    })
    if (!response.ok) {
      throw new Error(`PoE Wiki API error: ${response.status}`)
    }
    return await response.json()
  } finally {
    clearTimeout(timeout)
  }
}

export async function getBaseItemIconUrl(baseType) {
  const normalizedBaseType = normalizeBaseType(baseType)
  if (!normalizedBaseType) return null
  if (iconUrlCache.has(normalizedBaseType)) {
    return iconUrlCache.get(normalizedBaseType)
  }

  const params = new URLSearchParams({
    action: 'cargoquery',
    tables: 'items',
    fields: 'name,inventory_icon',
    where: `name=${toCargoStringLiteral(normalizedBaseType)}`,
    format: 'json',
  })

  try {
    const data = await fetchJson(`${POE_WIKI_API_URL}?${params.toString()}`)
    const rows = Array.isArray(data?.cargoquery) ? data.cargoquery : []
    for (const row of rows) {
      const title = row?.title && typeof row.title === 'object' ? row.title : {}
      const name = trim(title.name)
      const inventoryIcon = trim(title['inventory icon'])
      if (name === normalizedBaseType && inventoryIcon) {
        const iconUrl = getPoeWikiFileRedirectUrl(inventoryIcon)
        iconUrlCache.set(normalizedBaseType, iconUrl)
        return iconUrl
      }
    }
  } catch (error) {
    console.warn('Optimizer worker PoE Wiki icon lookup failed', {
      baseType: normalizedBaseType,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  iconUrlCache.set(normalizedBaseType, null)
  return null
}

export async function getBaseItemIconUrls(baseTypes) {
  const uniqueBaseTypes = Array.from(
    new Set(
      (Array.isArray(baseTypes) ? baseTypes : [])
        .map(normalizeBaseType)
        .filter(Boolean),
    ),
  )

  const entries = await Promise.all(
    uniqueBaseTypes.map(async (baseType) => [baseType, await getBaseItemIconUrl(baseType)]),
  )

  return new Map(entries.filter(([, iconUrl]) => iconUrl))
}
