import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const manifestPath = path.join(repoRoot, 'src', 'lib', 'public-seo-pages.json')
const publicDir = path.join(repoRoot, 'public')
const siteUrl = 'https://poe-party.com'
const contactEmail = 'support@poe-party.com'
const discordUrl = 'https://discord.gg/hSMV2r83mU'

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const routes = manifest.routes

function absoluteUrl(routePath) {
  return new URL(routePath, siteUrl).toString()
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function renderSitemap() {
  const urls = routes
    .filter((route) => !route.noindex)
    .map((route) => `  <url>
    <loc>${escapeXml(absoluteUrl(route.path))}</loc>
    <lastmod>${escapeXml(manifest.lastmod)}</lastmod>
    <changefreq>${escapeXml(route.changefreq)}</changefreq>
    <priority>${route.priority.toFixed(1)}</priority>
  </url>`)
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`
}

function renderLlms() {
  const sections = new Map()

  for (const route of routes) {
    const entries = sections.get(route.llmsSection) ?? []
    entries.push(route)
    sections.set(route.llmsSection, entries)
  }

  const body = [...sections.entries()]
    .map(([section, entries]) => {
      const lines = entries
        .map((route) => `- [${route.title}](${absoluteUrl(route.path)}): ${route.description}`)
        .join('\n')
      return `## ${section}\n\n${lines}`
    })
    .join('\n\n')

  return `# PoE Party

> PoE Party is an independent Path of Exile web app for group economy tracking, stash snapshots, public strategies, service listings, gear planning, and upgrade analysis for PoE 1 and Path of Exile 2.

PoE Party is built for Path of Exile players who coordinate groups, track shared wealth, plan farming strategies, publish service listings, compare character progress, and organize upgrades. It is not affiliated with or endorsed by Grinding Gear Games.

${body}

## Contact

- Contact: ${contactEmail}
- Discord: ${discordUrl}
`
}

await writeFile(path.join(publicDir, 'sitemap.xml'), renderSitemap(), 'utf8')
await writeFile(path.join(publicDir, 'llms.txt'), renderLlms(), 'utf8')

console.log(`Generated sitemap.xml and llms.txt for ${routes.length} public routes.`)
