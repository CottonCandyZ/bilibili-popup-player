import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/browser',
  timeout: 20000,
  fullyParallel: true,
  workers: 3,
  use: {
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    headless: true,
    viewport: { width: 1360, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
