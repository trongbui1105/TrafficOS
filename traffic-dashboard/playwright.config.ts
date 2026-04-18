import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E config for traffic-dashboard.
 *
 * Strategy:
 *  - Starts the Next.js dev server on port 3001 (avoiding conflict with the
 *    real stack on 3000).
 *  - Every test file intercepts `http://localhost:8080/**` (the traffic-api)
 *    with Playwright page.route() mocks, so the full backend is not required.
 *  - WebSocket connection to /ws/live will fail gracefully — useLiveTraffic
 *    auto-reconnects; the UI still renders from the REST seed call.
 */
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 45_000,       // allow for first-visit Next.js hydration + API round-trip
  retries: process.env.CI ? 2 : 0,
  workers: 1,            // sequential — avoids race conditions against the single dev server

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],

  use: {
    baseURL: 'http://localhost:3001',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Start the Next.js dev server before tests run */
  webServer: {
    command: 'npm run dev -- --port 3001',
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      NEXT_PUBLIC_API_URL: 'http://localhost:8080',
      NEXT_PUBLIC_WS_URL: 'ws://localhost:8080',
    },
  },
});
