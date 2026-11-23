const POEDB_ITEM_ICON_PREFIX = 'https://cdn.poedb.tw/image/Art/2DItems/'

export async function fetchPoedbInventoryIconUrl(baseType: string | null): Promise<string | null> {
  const slug = baseType?.trim().replace(/\s+/g, '_')
  if (!slug || slug === '.' || slug === '..') return null

  const response = await fetch(`/api/poedb/us/${encodeURIComponent(slug)}`, {
    headers: { Accept: 'text/html' },
  })
  if (!response.ok) return null

  // Parse the metadata in an inert template so the page's resources are not loaded.
  const metadata = document.createElement('template')
  metadata.innerHTML = (await response.text()).split('</head>', 1)[0]
  const icon = metadata.content.querySelector('meta[property="og:image"]')?.getAttribute('content')

  return icon?.startsWith(POEDB_ITEM_ICON_PREFIX) ? icon : null
}
