import { createServer } from 'node:http'
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const distDir = path.join(repoRoot, 'dist')
const manifestPath = path.join(repoRoot, 'src', 'lib', 'public-seo-pages.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const routes = manifest.routes.filter((route) => route.prerender)

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
])

async function fileExists(filePath) {
  try {
    const info = await stat(filePath)
    return info.isFile()
  } catch {
    return false
  }
}

async function resolveFile(urlPath) {
  const safePath = decodeURIComponent(urlPath.split('?')[0] ?? '/')
  const normalized = path.normalize(safePath).replace(/^(\.\.[/\\])+/, '')
  const requested = path.join(distDir, normalized)

  if (await fileExists(requested)) return requested
  if (await fileExists(path.join(requested, 'index.html'))) {
    return path.join(requested, 'index.html')
  }

  return path.join(distDir, 'index.html')
}

const server = createServer(async (req, res) => {
  try {
    const filePath = await resolveFile(req.url ?? '/')
    const body = await readFile(filePath)
    res.writeHead(200, {
      'Content-Type': contentTypes.get(path.extname(filePath)) ?? 'application/octet-stream',
    })
    res.end(body)
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(error instanceof Error ? error.message : 'Static server failed')
  }
})

const port = await new Promise((resolve) => {
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    resolve(typeof address === 'object' && address ? address.port : 0)
  })
})

const browser = await chromium.launch()

try {
  const page = await browser.newPage()

  for (const route of routes) {
    const url = `http://127.0.0.1:${port}${route.path}`
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.waitForTimeout(300)

    const html = await page.content()
    const outputDir = path.join(distDir, route.path.replace(/^\//, ''))
    await mkdir(outputDir, { recursive: true })
    await writeFile(path.join(outputDir, 'index.html'), html, 'utf8')
    console.log(`Prerendered ${route.path}`)
  }
} finally {
  await browser.close()
  await new Promise((resolve) => server.close(resolve))
}
