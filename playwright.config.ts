import { defineConfig, devices } from '@playwright/test';

/**
 * Lane B — real-browser pixel verification (issue #252).
 *
 * This is the lane that actually proves a score renders correctly: a real browser
 * rasterizes the SMuFL (Bravura) glyphs that jsdom (Lane A) cannot. The render surface is
 * the static gallery (`npm run visual:gallery`) — i.e. the exact SVG the real `ScoreEditor`
 * pipeline emits — so this pins the *pixels* of the same output Lane A pins as geometry.
 *
 * DETERMINISM: glyph rasterization varies by OS/browser, so baselines are PLATFORM-SCOPED
 * (the snapshot filename carries `-{platform}`). Only the CI (linux) baselines are
 * committed (see .gitignore); locally-generated `-darwin`/`-win32` baselines are ignored.
 * Approve baselines from a CI run, never a dev laptop — see docs/VISUAL_TESTING.md.
 */
export default defineConfig({
  testDir: './e2e/visual',
  // Regenerate the gallery (the render surface) from current source before every run.
  globalSetup: './e2e/visual/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  // Pixel determinism: fixed scale factor, no animations.
  use: {
    deviceScaleFactor: 1,
  },
  expect: {
    toHaveScreenshot: {
      // SMuFL antialiasing differs subtly even on the same platform; allow a tiny budget.
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
    },
  },
  // Platform-scoped names so darwin/linux baselines never collide.
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}-{projectName}-{platform}{ext}',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], deviceScaleFactor: 1 },
    },
  ],
});
