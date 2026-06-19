
/**
 * poedb.tw gem metadata client.
 *
 * Fetches the Skill_Gems and Support_Gems listing pages through the Vite
 * dev proxy at /api/poedb, parses the HTML to extract every gem's display
 * name and CDN icon URL, and returns a flat array of entries.
 *
 * The CDN icons are served from cdn.poedb.tw and are cross-origin loadable
 * directly by <img> tags — no proxy needed for the images themselves.
 */

export interface PoedbGemEntry {
  name: string
  icon: string
  support: boolean
}

const GEM_PAGES = [
  { path: '/us/Skill_Gems', support: false },
  { path: '/us/Support_Gems', support: true },
] as const

function parseGemEntries(html: string, support: boolean): PoedbGemEntry[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const entries: PoedbGemEntry[] = []
  const seen = new Set<string>()

  // Each gem has an <img> with the CDN icon inside an <a>,
  // followed by an <a> with the display name.
  for (const img of doc.querySelectorAll<HTMLImageElement>(
    'img[src*="cdn.poedb.tw/image/Art/2DItems/Gems"]',
  )) {
    // getAttribute returns the raw attribute value, avoiding DOMParser URL resolution
    const icon = img.getAttribute('src') || ''
    if (!icon) continue

    // The next sibling <a> (after the image's parent <a>) holds the display name
    const parentAnchor = img.closest('a')
    const nameAnchor = parentAnchor?.nextElementSibling as HTMLAnchorElement | null
    const name = nameAnchor?.textContent?.trim() ?? ''
    if (!name) continue

    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    entries.push({ name, icon, support })
  }

  return entries
}

export async function fetchPoedbGemEntries(): Promise<PoedbGemEntry[]> {
  const pages = await Promise.all(
    GEM_PAGES.map(async ({ path, support }) => {
      const res = await fetch(`/api/poedb${path}`, {
        headers: { Accept: 'text/html' },
      })
      if (!res.ok) return []
      const html = await res.text()
      return parseGemEntries(html, support)
    }),
  )

  return pages.flat()
}
