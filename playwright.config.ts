import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: { channel: 'chromium', baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3012', storageState:process.env.PLAYWRIGHT_AUTH_STATE || undefined, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : { command: 'node node_modules/next/dist/bin/next dev --webpack --port 3012', url: 'http://localhost:3012', reuseExistingServer: !process.env.CI, timeout: 120_000 },
});
