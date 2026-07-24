import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    TanStackRouterVite({
      routesDirectory: './src/routes',
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      // Proxies /api/poe/* → https://www.pathofexile.com/*
      // Reads X-POESESSID header and injects it as a Cookie so the browser
      // never needs to directly set cookies on pathofexile.com (bypasses CORS).
      // Proxies /api/ninja/* → https://poe.ninja/*
      // poe.ninja doesn't send CORS headers, so all price fetches must go through here.
      '/api/ninja': {
        target: 'https://poe.ninja',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ninja/, ''),
      },

      // Proxies /api/poedb/* → https://poedb.tw/*
      // Used to fetch gem listing pages for icon/metadata resolution.
      '/api/poedb': {
        target: 'https://poedb.tw',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/poedb/, ''),
      },

      '/api/poe': {
        target: 'https://www.pathofexile.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/poe/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const sessId = req.headers['x-poesessid']
            const cfClearance = req.headers['x-cf-clearance']
            const cookieParts: string[] = []
            if (sessId) cookieParts.push(`POESESSID=${String(sessId)}`)
            if (cfClearance) cookieParts.push(`cf_clearance=${String(cfClearance)}`)
            if (cookieParts.length) proxyReq.setHeader('Cookie', cookieParts.join('; '))
            // Strip our custom transport headers — pathofexile.com must never see them
            proxyReq.removeHeader('x-poesessid')
            proxyReq.removeHeader('x-cf-clearance')
            // Mimic a real browser request so Cloudflare accepts it
            proxyReq.setHeader(
              'User-Agent',
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
            )
            proxyReq.setHeader('X-Requested-With', 'XMLHttpRequest')
            proxyReq.setHeader('Origin', 'https://www.pathofexile.com')
            // Referer must look like it came from within pathofexile.com, not localhost
            proxyReq.setHeader('Referer', 'https://www.pathofexile.com/account/characters')
          })
        },
      },
    },
  },
})
