import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e/qa',
  fullyParallel: true,
  retries: 0,
  use: { baseURL: 'http://127.0.0.1:4178', trace: 'retain-on-failure', reducedMotion: 'reduce' },
  webServer: {
    command: 'node scripts/serve-qa.mjs',
    url: 'http://127.0.0.1:4178',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } },
  ],
});
