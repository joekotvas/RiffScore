// Staff-spacing benchmark: loads each score into the running demo (npm run demo:dev, port 3000),
// measures how far the treble staff's lowest beam edge reaches below the bass staff's highest
// beam edge in every bar (svg units at 100%; positive = the beams overlap), and captures a
// scroll-view crop plus page 1 under print media into the given output folder.
//
//   node e2e/bench/staff-spacing/measure.mjs before   # writes ./before/*.png and prints the table
//   node e2e/bench/staff-spacing/measure.mjs after
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const label = process.argv[2] || 'after';
const outDir = join(here, label);
mkdirSync(outDir, { recursive: true });
const scores = ['beams-in-gap', 'beams-in-gap-chords'].map((name) => [
  name,
  JSON.parse(readFileSync(join(here, `${name}.json`), 'utf8')),
]);

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1400, height: 1200 },
  deviceScaleFactor: 2,
});
await page.goto('http://localhost:3000/simple');
await page.waitForFunction(() => window.riffScore && window.riffScore.active);
for (const [name, score] of scores) {
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate((s) => {
    const api = window.riffScore.active;
    api.loadScore(s);
    api.setLayoutConfig({ viewMode: 'scroll' });
    api.deselectAll();
  }, score);
  await page.mouse.move(2, 2);
  await page.waitForTimeout(600);
  const svg = await page.evaluateHandle(() =>
    Array.from(document.querySelectorAll('svg')).find((s) => s.querySelector('.Measure'))
  );
  await svg.asElement().screenshot({ path: join(outDir, `${name}-scroll.png`) });
  const rows = await page.evaluate((barCount) => {
    const beamYs = (staff, i) => {
      const hit = document.querySelector(`[data-testid="measure-hit-area-${staff}-${i}"]`);
      const measure = hit.closest('.Measure');
      const root = measure.ownerSVGElement;
      const ys = [];
      measure.querySelectorAll('.beam-group polygon').forEach((p) => {
        const ctm = p.getCTM();
        p.getAttribute('points')
          .split(' ')
          .forEach((pair) => {
            const [x, y] = pair.split(',').map(Number);
            const pt = root.createSVGPoint();
            pt.x = x;
            pt.y = y;
            ys.push(pt.matrixTransform(ctm).y);
          });
      });
      return ys;
    };
    const out = [];
    for (let i = 0; i < barCount; i++) {
      const t = beamYs(0, i);
      const b = beamYs(1, i);
      const trebleBottom = t.length ? Math.max(...t) : null;
      const bassTop = b.length ? Math.min(...b) : null;
      out.push({
        bar: i + 1,
        trebleBeamBottom: trebleBottom && +trebleBottom.toFixed(1),
        bassBeamTop: bassTop && +bassTop.toFixed(1),
        overlapPx: trebleBottom && bassTop ? +(trebleBottom - bassTop).toFixed(1) : null,
      });
    }
    return out;
  }, score.staves[0].measures.length);
  console.log(name);
  console.table(rows);
  await page.evaluate(() => {
    window.riffScore.active.setLayoutConfig({
      viewMode: 'page',
      pageSize: 'letter',
      margins: 'normal',
    });
  });
  await page.waitForTimeout(600);
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(200);
  const first = await page.$('.riff-page-svg');
  await first.screenshot({ path: join(outDir, `${name}-page1.png`) });
}
await browser.close();
