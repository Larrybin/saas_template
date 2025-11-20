import { defineConfig } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';

const webServer =
  process.env.PLAYWRIGHT_WEB_SERVER !== undefined
    ? {
        command: process.env.PLAYWRIGHT_WEB_SERVER,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        stdout: 'pipe' as const,
        stderr: 'pipe' as const,
      }
    : undefined;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    video: 'on-first-retry',
  },
  ...(webServer ? { webServer } : {}),
});
