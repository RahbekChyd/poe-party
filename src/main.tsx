import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { routeTree } from './routeTree.gen'
import { queryClient } from './lib/queryClient'
import { supabaseConfiguration } from './lib/supabase'
import { ErrorBoundary } from './components/layout/ErrorBoundary'
import { AppConfigurationError } from './components/layout/AppConfigurationError'
import './index.css'

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Application root element is missing')
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      {supabaseConfiguration.isConfigured ? (
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
          <Analytics />
          <SpeedInsights />
        </QueryClientProvider>
      ) : (
        <AppConfigurationError />
      )}
    </ErrorBoundary>
  </StrictMode>,
)
