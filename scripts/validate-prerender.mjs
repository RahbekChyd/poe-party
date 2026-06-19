import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const distDir = path.join(repoRoot, 'dist')
const manifestPath = path.join(repoRoot, 'src', 'lib', 'public-seo-pages.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const routes = manifest.routes.filter((route) => route.prerender)

const failures = []

function titleWithSiteName(title) {
  return title === 'PoE Party' ? title : `${title} | PoE Party`
}

for (const route of routes) {
  const htmlPath = path.join(distDir, route.path.replace(/^\//, ''), 'index.html')
  let html = ''

  try {
    html = await readFile(htmlPath, 'utf8')
  } catch {
    failures.push(`${route.path}: missing ${htmlPath}`)
    continue
  }

  const expectedTitle = titleWithSiteName(route.title)
  const expectedCanonical = `https://poe-party.com${route.path}`

  if (!html.includes(`<title>${expectedTitle}</title>`)) {
    failures.push(`${route.path}: missing expected title`)
  }

  if (!html.includes(`name="description" content="${route.description}"`)) {
    failures.push(`${route.path}: missing expected description`)
  }

  if (!html.includes(`rel="canonical" href="${expectedCanonical}"`)) {
    failures.push(`${route.path}: missing canonical ${expectedCanonical}`)
  }

  if (html.includes('/dashboard') && !route.path.startsWith('/preview')) {
    failures.push(`${route.path}: unexpected dashboard reference`)
  }
}

if (failures.length > 0) {
  console.error('Prerender validation failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`Validated ${routes.length} prerendered routes.`)
