/**
 * Retired production endpoint for the former POESESSID forwarding proxy.
 *
 * Keeping a deterministic 410 response avoids routing stale clients to the
 * SPA fallback while ensuring credentials and arbitrary requests are never
 * forwarded to pathofexile.com.
 */
export const config = { runtime: 'edge' }

export default function handler() {
  return new Response(
    JSON.stringify({
      error: 'The Path of Exile cookie proxy has been retired. Use OAuth-backed APIs.',
      code: 'poe_cookie_proxy_retired',
    }),
    {
      status: 410,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
      },
    },
  )
}
