import { defineConfig, devices } from '@playwright/test'

const port = 4177
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'line',
  use: {
    baseURL,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-mobile',
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      VITE_SUPABASE_URL: 'http://127.0.0.1:45121',
      VITE_SUPABASE_ANON_KEY: 'public-browser-test-key',
      VITE_SUPABASE_FUNCTIONS_KEY: 'public-browser-test-key',
      VITE_POE_CLIENT_ID: 'browser-test-client',
      VITE_POE_REDIRECT_URI: `${baseURL}/auth/callback`,
      VITE_POE2_ALLOWED_ACCOUNT_NAMES: '*',
      VITE_BILLING_ALLOWED_POE_ACCOUNTS: '*',
    },
  },
})
