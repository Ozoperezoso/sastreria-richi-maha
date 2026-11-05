import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.js',
  outputDir: '.superpowers/playwright-results',
  fullyParallel: false,
  workers: 1,
  use: { ...devices['iPhone 13'], browserName: 'chromium', baseURL: 'http://localhost:5173' },
  webServer: { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true },
});
