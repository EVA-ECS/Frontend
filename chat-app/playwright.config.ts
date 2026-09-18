import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  timeout: 240_000,
  expect: { timeout: 20_000 },
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:18081',
    browserName: 'chromium',
    viewport: { width: 1280, height: 900 },
    // Auth responses contain tokens. Do not record them in traces or videos.
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
});
