import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distRoot = path.join(repoRoot, 'dist')

const limits = {
  initialJavaScriptKb: Number(process.env.BUNDLE_INITIAL_JS_GZIP_KB ?? 400),
  asyncJavaScriptKb: Number(process.env.BUNDLE_ASYNC_JS_GZIP_KB ?? 250),
  cssKb: Number(process.env.BUNDLE_CSS_GZIP_KB ?? 60),
  logoKb: Number(process.env.BUNDLE_LOGO_RAW_KB ?? 100),
}

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await filesBelow(absolute)))
    else files.push(absolute)
  }
  return files
}

function assetPathFromUrl(url) {
  return path.join(distRoot, url.replace(/^\//, '').split('?')[0])
}

function kilobytes(bytes) {
  return bytes / 1024
}

function formatKb(bytes) {
  return `${kilobytes(bytes).toFixed(1)} kB`
}

function fail(message) {
  process.exitCode = 1
  console.error(`Bundle budget failed: ${message}`)
}

const indexHtml = await readFile(path.join(distRoot, 'index.html'), 'utf8')
const allFiles = await filesBelow(distRoot)
const javascriptFiles = allFiles.filter((file) => file.endsWith('.js'))
const cssFiles = allFiles.filter((file) => file.endsWith('.css'))
const initialUrls = new Set()

for (const match of indexHtml.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+\.js(?:\?[^"]*)?)"/g)) {
  initialUrls.add(match[1])
}

const initialFiles = [...initialUrls].map(assetPathFromUrl)
const initialGzipBytes = (
  await Promise.all(initialFiles.map(async (file) => gzipSync(await readFile(file)).byteLength))
).reduce((total, size) => total + size, 0)

if (kilobytes(initialGzipBytes) > limits.initialJavaScriptKb) {
  fail(
    `initial JavaScript is ${formatKb(initialGzipBytes)} gzip; limit is ${limits.initialJavaScriptKb} kB`,
  )
}

const javascriptSizes = await Promise.all(
  javascriptFiles.map(async (file) => ({
    file,
    gzipBytes: gzipSync(await readFile(file)).byteLength,
  })),
)
const largestJavaScript = javascriptSizes.toSorted((a, b) => b.gzipBytes - a.gzipBytes)[0]

if (
  largestJavaScript &&
  kilobytes(largestJavaScript.gzipBytes) > limits.asyncJavaScriptKb
) {
  fail(
    `${path.relative(distRoot, largestJavaScript.file)} is ${formatKb(largestJavaScript.gzipBytes)} gzip; per-chunk limit is ${limits.asyncJavaScriptKb} kB`,
  )
}

const cssGzipBytes = (
  await Promise.all(cssFiles.map(async (file) => gzipSync(await readFile(file)).byteLength))
).reduce((total, size) => total + size, 0)

if (kilobytes(cssGzipBytes) > limits.cssKb) {
  fail(`CSS is ${formatKb(cssGzipBytes)} gzip; limit is ${limits.cssKb} kB`)
}

const logoCandidates = allFiles.filter((file) => /poe-party-logo/i.test(path.basename(file)))
for (const logo of logoCandidates) {
  const logoBytes = (await stat(logo)).size
  if (kilobytes(logoBytes) > limits.logoKb) {
    fail(
      `${path.relative(distRoot, logo)} is ${formatKb(logoBytes)} raw; logo limit is ${limits.logoKb} kB`,
    )
  }
}

console.log(
  JSON.stringify(
    {
      initialJavaScriptGzipKb: Number(kilobytes(initialGzipBytes).toFixed(1)),
      largestJavaScript: largestJavaScript
        ? {
            file: path.relative(distRoot, largestJavaScript.file),
            gzipKb: Number(kilobytes(largestJavaScript.gzipBytes).toFixed(1)),
          }
        : null,
      cssGzipKb: Number(kilobytes(cssGzipBytes).toFixed(1)),
      logoFiles: await Promise.all(
        logoCandidates.map(async (file) => ({
          file: path.relative(distRoot, file),
          rawKb: Number(kilobytes((await stat(file)).size).toFixed(1)),
        })),
      ),
      limits,
    },
    null,
    2,
  ),
)
