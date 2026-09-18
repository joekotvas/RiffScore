import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'RiffScore release QA' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
});

test('keyboard pitch editing, announcements, undo, restricted deletion and synchronous export', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.getByRole('button', { name: 'Select first note', exact: true }).click();
  const editor = page.locator('[data-riffscore-id="qa"]');
  const canvas = editor.getByRole('application');
  await canvas.press('ArrowUp');
  await expect(editor.getByRole('status').filter({ hasText: 'Measure 1' })).toContainText('D4');
  await page.getByRole('button', { name: 'API undo' }).click();
  await expect(editor.getByRole('status').filter({ hasText: 'Measure 1' })).toContainText('C4');
  await page.getByRole('button', { name: 'Toggle restrictions' }).click();
  await canvas.press('Backspace');
  await expect(editor.getByRole('status').filter({ hasText: 'Measure 1' })).toContainText('C4');
  await page.getByRole('button', { name: 'Export MusicXML' }).click();
  await expect(page.getByText('<?xml', { exact: false })).toBeVisible();
  expect(errors).toEqual([]);
});

test('toolbar and configuration controls have accessible names and no serious axe violations', async ({
  page,
}) => {
  const report = await new AxeBuilder({ page })
    .include('[data-riffscore-id="qa"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(report.violations).toEqual([]);
  await page.getByRole('button', { name: 'Open configuration' }).click();
  await expect(page.getByRole('slider', { name: 'Zoom' })).toBeVisible();
  await page.getByRole('slider', { name: 'Zoom' }).press('Escape');
  await expect(page.getByRole('button', { name: 'Open configuration' })).toBeFocused();
});

test('viewports contain wide music; read-only scores retain scrolling and touch can select notes', async ({
  page,
}, testInfo) => {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  ).toBe(true);
  const canvas = page.locator('[data-riffscore-id="static"] .riff-ScoreCanvas');
  await expect(canvas).toHaveCSS('pointer-events', 'auto');
  const editor = page.locator('[data-riffscore-id="qa"]');
  const hit = editor.locator('[data-note-hit-area]').first();
  if (testInfo.project.use.hasTouch) await hit.tap();
  else await hit.click();
  await expect(editor.getByRole('status').filter({ hasText: 'Measure 1' })).toBeVisible();
});

test('print hides chrome/cursors and removes configured viewport limits without losing pages', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Page view', exact: true }).click();
  const editor = page.locator('[data-riffscore-id="qa"]');
  await expect(editor.locator('.riff-page-svg')).not.toHaveCount(0);
  await page.emulateMedia({ media: 'print' });
  await expect(editor.locator('.riff-Toolbar')).toBeHidden();
  await expect(editor.locator('.riff-ScoreEditor__controls')).toBeHidden();
  await expect(editor.locator('.riff-ScoreEditor__viewport')).toHaveCSS('max-height', 'none');
  await expect(editor.locator('.riff-page-svg').first()).toBeVisible();
  await expect(editor.locator('.riff-ScoreEditor__content')).toHaveCSS('transform', 'none');
  await page.screenshot({ path: test.info().outputPath('print.png'), fullPage: true });
  await page.emulateMedia({ media: 'screen' });
  await expect(editor.locator('.riff-Toolbar')).toBeVisible();
});

test('all built-in themes keep readable controls', async ({ page }) => {
  for (const theme of ['LIGHT', 'DARK', 'COOL', 'WARM']) {
    await page.getByRole('combobox', { name: 'Theme', exact: true }).selectOption(theme);
    await page.evaluate(async () => {
      await new Promise(requestAnimationFrame);
      await Promise.all(
        document.getAnimations().map((animation) => animation.finished.catch(() => {}))
      );
    });
    const report = await new AxeBuilder({ page })
      .include('[data-riffscore-id="qa"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      report.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({ html: n.html, reason: n.failureSummary })),
      })),
      theme
    ).toEqual([]);
  }
});

test('help and setup dialogs support keyboard entry, focus containment and return', async ({
  page,
}) => {
  const help = page.getByRole('button', { name: 'Keyboard Shortcuts', exact: true });
  await help.click();
  const dialog = page.getByRole('dialog', { name: 'Keyboard Shortcuts', exact: true });
  const close = dialog.getByRole('button', { name: 'Close keyboard shortcuts' });
  await expect(close).toBeFocused();
  await close.press('Tab');
  await expect(dialog.locator('.riff-ShortcutsOverlay__content')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  const report = await new AxeBuilder({ page })
    .include('.riff-ShortcutsOverlay')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    report.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ html: n.html, reason: n.failureSummary })),
    }))
  ).toEqual([]);
  await close.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(help).toBeFocused();
  const setup = page.getByRole('button', { name: 'Score Setup', exact: true });
  await setup.click();
  const setupDialog = page.getByRole('dialog', { name: 'Score Setup', exact: true });
  await expect(setupDialog).toBeVisible();
  await expect(setupDialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await setupDialog.getByRole('button', { name: 'Close', exact: true }).press('Escape');
  await expect(setupDialog).toBeHidden();
  await expect(setup).toBeFocused();
});

test('titles and high-clef chord symbols remain inside the scroll SVG without collisions', async ({
  page,
}) => {
  for (const id of ['qa', 'window']) {
    const geometry = await page.locator(`[data-riffscore-id="${id}"]`).evaluate((element) => {
      const svg = element.querySelector('.riff-ScoreCanvas__svg')!.getBoundingClientRect();
      const title = element.querySelector('.riff-metadata__title')!.getBoundingClientRect();
      const chords = [...element.querySelectorAll('.riff-ChordSymbol')].map((el) =>
        el.getBoundingClientRect()
      );
      return {
        svg: { top: svg.top },
        title: { top: title.top, bottom: title.bottom },
        chords: chords.map((r) => ({ top: r.top, bottom: r.bottom })),
      };
    });
    expect(geometry.title.top).toBeGreaterThanOrEqual(geometry.svg.top - 1);
    for (const chord of geometry.chords) {
      expect(chord.top).toBeGreaterThanOrEqual(geometry.svg.top - 1);
      expect(chord.top).toBeGreaterThanOrEqual(geometry.title.bottom);
    }
  }
  await page.screenshot({ path: test.info().outputPath('editor.png'), fullPage: true });
});

test('long scores paginate for print with unscaled paper dimensions', async ({
  page,
}, testInfo) => {
  await page.goto('/?long');
  await page.getByRole('button', { name: 'Page view', exact: true }).click();
  const editor = page.locator('[data-riffscore-id="qa"]');
  const pages = editor.locator('.riff-page-svg');
  expect(await pages.count()).toBeGreaterThan(1);
  await page.emulateMedia({ media: 'print' });
  const size = await pages.first().evaluate((el) => ({
    width: el.getBoundingClientRect().width,
    height: el.getBoundingClientRect().height,
  }));
  expect(size.width).toBeCloseTo(816, 0);
  expect(size.height).toBeCloseTo(1056, 0);
  if (testInfo.project.name === 'desktop-chromium') {
    await page.pdf({
      path: test.info().outputPath('score.pdf'),
      preferCSSPageSize: true,
      printBackground: true,
    });
  }
});

test('real audio transport stays coherent across API and visible controls', async ({ page }) => {
  const editor = page.locator('[data-riffscore-id="qa"]');
  await editor.getByRole('button', { name: 'Custom play', exact: true }).click();
  await expect(editor.getByLabel('Transport state')).toHaveText('Playing');
  await expect(editor.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.evaluate(() => window.riffScore.get('qa')!.pause());
  await expect(editor.getByLabel('Transport state')).toHaveText('Stopped');
  await expect(editor.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await page.evaluate(() => window.riffScore.get('qa')!.seek(1, 16));
  expect(await page.evaluate(() => window.riffScore.get('qa')!.getPlaybackState())).toMatchObject({
    isPlaying: false,
    measureIndex: 1,
    quant: 16,
  });
});

test('rotation and zoom preserve contained viewports and usable note targets', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  const editor = page.locator('[data-riffscore-id="qa"]');
  await editor.locator('[data-note-hit-area]').first().click();
  await expect(editor.getByRole('status').filter({ hasText: 'Measure 1' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
  await page.getByRole('button', { name: 'Open configuration' }).click();
  const zoom = page.getByRole('slider', { name: 'Zoom' });
  await zoom.fill('1.5');
  await zoom.press('Escape');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
});
