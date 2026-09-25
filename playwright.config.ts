import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4317',
    // Use an installed Chrome when present (CI can set PLAYWRIGHT_CHROME_PATH).
    launchOptions: process.env.PLAYWRIGHT_CHROME_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROME_PATH } : {},
    channel: process.env.PLAYWRIGHT_CHROME_PATH ? undefined : 'chrome',
  },
  // Always build and serve fresh on a dedicated port, so tests never run against a stale build.
  webServer: {
    command: 'npm run build && npx vite preview --port 4317 --strictPort',
    url: 'http://localhost:4317',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
