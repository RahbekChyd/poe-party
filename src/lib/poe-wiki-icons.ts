import { asRecord, readString } from './parse-helpers'

const POE_WIKI_API_URL = 'https://www.poewiki.net/w/api.php'
const POE_WIKI_FILE_REDIRECT_BASE = 'https://www.poewiki.net/wiki/Special:Redirect/file'

interface CargoQueryResponse {
  cargoquery?: Array<{
    title?: Record<string, unknown>
  }>
}

function normalizeBaseType(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/g, ' ').trim()
  return normalized || null
}

function toCargoStringLiteral(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export function getPoeWikiFileRedirectUrl(fileTitle: string | null | undefined): string | null {
  const normalizedTitle = readString(fileTitle)?.replace(/^File:/i, '').trim()
  if (!normalizedTitle) return null

  const pathTitle = normalizedTitle.replace(/\s+/g, '_')
  return `${POE_WIKI_FILE_REDIRECT_BASE}/${encodeURIComponent(pathTitle)}`
}

export async function fetchPoeWikiInventoryIconUrl(
  baseType: string | null | undefined,
): Promise<string | null> {
  const normalizedBaseType = normalizeBaseType(baseType)
  if (!normalizedBaseType) return null

  const params = new URLSearchParams({
    action: 'cargoquery',
    tables: 'items',
    fields: 'name,inventory_icon',
    where: `name=${toCargoStringLiteral(normalizedBaseType)}`,
    format: 'json',
    origin: '*',
  })

  const response = await fetch(`${POE_WIKI_API_URL}?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`PoE Wiki API error: ${response.status}`)
  }

  const data = (await response.json()) as CargoQueryResponse
  for (const row of data.cargoquery ?? []) {
    const title = asRecord(row.title)
    const name = readString(title.name)
    const inventoryIcon = readString(title['inventory icon'])
    if (name === normalizedBaseType && inventoryIcon) {
      return getPoeWikiFileRedirectUrl(inventoryIcon)
    }
  }

  return null
}
