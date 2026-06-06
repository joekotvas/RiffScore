import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { visualFixtures } from '../../src/__tests__/fixtures/visual';

/**
 * Lane B — pixel regression over the visual fixture corpus (issue #252).
 *
 * The gallery now renders each fixture with the REAL riffscore library (readonly, no
 * toolbar) — see scripts/gallery. So this loads the gallery ONCE (60 live editors are heavy
 * to mount), waits for the Bravura font + every editor to render, then screenshots each
 * fixture's stage with a SOFT assertion so one drift doesn't hide the rest. global-setup
 * rebuilds the gallery from current source before this runs.
 *
 * The fixture list is imported from the SAME source Lane A uses — one corpus, two lanes.
 */

const galleryUrl = pathToFileURL(path.resolve(__dirname, '../../visual-gallery/index.html')).href;

test.describe('visual pixel regression (#252)', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto(galleryUrl);
    await page.evaluate(async () => {
      await document.fonts.ready; // rasterize the SMuFL font before capturing
    });
    // Wait until every fixture's live editor has rendered its score canvas.
    await page.waitForFunction(
      (n) => document.querySelectorAll('.stage svg').length >= n,
      visualFixtures.length,
      { timeout: 60_000 }
    );
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test('all fixtures match their pixel baselines', async () => {
    for (const fixture of visualFixtures) {
      const stage = page.locator(`#${fixture.name} .stage`);
      await stage.scrollIntoViewIfNeeded();
      // soft → collect every fixture's diff in one run instead of failing on the first.
      await expect.soft(stage).toHaveScreenshot(`${fixture.name}.png`);
    }
  });
});
