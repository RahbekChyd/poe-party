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
    },
  },
})
