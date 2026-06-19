/**
 * Vercel Edge Function: /api/poe-proxy
 *
 * Replicates the Vite dev proxy for /api/poe/* in production.
 * Invoked via vercel.json rewrite: /api/poe/:path* → /api/poe-proxy?proxyPath=:path*
 *
 * - Converts X-POESESSID and X-CF-Clearance headers into cookies
 * - Spoofs User-Agent to pass Cloudflare checks on pathofexile.com
 * - Strips browser-specific headers before forwarding
 */
export const config = { runtime: 'edge' }

export default async function handler(req) {
  const url = new URL(req.url)
  const proxyPath = '/' + (url.searchParams.get('proxyPath') || '')

  // Preserve any query params from the original request (excluding proxyPath)
  const forwardedSearch = new URLSearchParams(url.searchParams)
  forwardedSearch.delete('proxyPath')
  const qs = forwardedSearch.toString()

  const targetUrl = `https://www.pathofexile.com${proxyPath}${qs ? '?' + qs : ''}`

  const sessId = req.headers.get('x-poesessid')
  const cfClearance = req.headers.get('x-cf-clearance')

  const cookieParts = []
  if (sessId) cookieParts.push(`POESESSID=${sessId}`)
  if (cfClearance) cookieParts.push(`cf_clearance=${cfClearance}`)

  // Only forward a minimal set of headers — the Vite dev proxy never forwarded
  // browser-specific headers like sec-fetch-* or sec-ch-ua-*
  const FORWARD = new Set(['accept', 'accept-language', 'content-type', 'content-length'])
  const forwardHeaders = new Headers()
  for (const [key, value] of req.headers) {
    if (FORWARD.has(key.toLowerCase())) forwardHeaders.set(key, value)
  }

  if (cookieParts.length > 0) {
    forwardHeaders.set('cookie', cookieParts.join('; '))
  }

  // Mimic a real browser so Cloudflare accepts the request
  forwardHeaders.set(
    'user-agent',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  )
  forwardHeaders.set('x-requested-with', 'XMLHttpRequest')
  forwardHeaders.set('origin', 'https://www.pathofexile.com')
  forwardHeaders.set('referer', 'https://www.pathofexile.com/account/characters')

  const response = await fetch(targetUrl, {
    method: req.method,
    headers: forwardHeaders,
    body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
  })

  // Strip transfer-encoding which is managed by the runtime
  const responseHeaders = new Headers(response.headers)
  responseHeaders.delete('transfer-encoding')

  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders,
  })
}
