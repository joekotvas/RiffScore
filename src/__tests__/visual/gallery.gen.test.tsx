/**
 * Visual gallery generator — Lane B's cheap "see it" step (issue #252).
 *
 * Renders every fixture to inline SVG and writes a single static, SEARCHABLE + FILTERABLE
 * HTML page so a human can scan the whole corpus, jump to a feature, or text-search across
 * fixture names, descriptions, tags, and the scenarios each fixture covers. It diffs
 * nothing — it just lets you LOOK (the automated pixel-diff is the Playwright suite).
 *
 * Run on demand (SKIPPED in the normal test run):
 *   npm run visual:gallery     # writes ./visual-gallery/index.html, then open it
 *
 * The Bravura (SMuFL) font is copied next to the HTML and @font-face'd so the glyphs render.
 */

jest.mock('@/engines/toneEngine', () => ({
  playNote: jest.fn(),
  setInstrument: jest.fn(),
  isSamplerLoaded: jest.fn(() => false),
  InstrumentType: {},
}));

import * as fs from 'fs';
import * as path from 'path';
import { visualFixtures, visualFeatures } from '../fixtures/visual';
import { renderScore } from '../helpers/visual';

const ENABLED = process.env.VISUAL_GALLERY === '1';
const OUT_DIR = path.resolve(__dirname, '../../../visual-gallery');
const FONT_SRC = path.resolve(__dirname, '../../assets/fonts/Bravura.woff2');

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Render scores at this scale in the gallery (riffscore's built-in canvas scaling). */
const GALLERY_SCALE = 0.75;

interface Card {
  name: string;
  feature: string;
  description: string;
  covers: string[];
  tags: string[];
  svg: string;
}

function cardHtml(c: Card): string {
  const searchText = [c.name, c.feature, c.description, ...c.covers, ...c.tags].join(' ').toLowerCase();
  return `
      <figure class="card" id="${esc(c.name)}" data-feature="${esc(c.feature)}" data-search="${esc(searchText)}">
        <figcaption>
          <h3>${esc(c.name)}</h3>
          <p>${esc(c.description)}</p>
          <ul class="covers">${c.covers.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
          <small>${c.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join(' ')}</small>
        </figcaption>
        <div class="stage">${c.svg}</div>
      </figure>`;
}

function buildHtml(cards: Card[], features: string[]): string {
  const sections = features
    .map((feature) => {
      const inFeature = cards.filter((c) => c.feature === feature);
      return `
    <section class="feature-section" data-feature="${esc(feature)}">
      <h2 class="feature-title">${esc(feature)} <span class="feature-count">${inFeature.length}</span></h2>
      <div class="cards">${inFeature.map(cardHtml).join('\n')}</div>
    </section>`;
    })
    .join('\n');

  const chips = ['all', ...features]
    .map(
      (f) =>
        `<button class="chip${f === 'all' ? ' active' : ''}" data-feature="${esc(f)}">${
          f === 'all' ? 'All' : esc(f)
        }</button>`
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>RiffScore visual fixtures (#252)</title>
<style>
  @font-face { font-family: 'Bravura'; src: url('Bravura.woff2') format('woff2'); font-display: block; }
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font: 14px/1.5 system-ui, sans-serif; margin: 0; background: #fafafa; color: #111; }
  header { position: sticky; top: 0; z-index: 10; background: #fafafaee; backdrop-filter: blur(6px);
           border-bottom: 1px solid #e3e3e3; padding: 14px 24px; }
  h1 { font-size: 18px; margin: 0 0 8px; }
  .controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  #q { flex: 1 1 240px; min-width: 200px; padding: 7px 10px; border: 1px solid #ccc; border-radius: 8px; font: inherit; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { font: inherit; font-size: 12px; padding: 4px 10px; border: 1px solid #ccd; background: #fff;
          color: #335; border-radius: 999px; cursor: pointer; }
  .chip.active { background: #335; color: #fff; border-color: #335; }
  #count { font-size: 12px; color: #666; white-space: nowrap; }
  main { padding: 16px 24px 64px; }
  .feature-title { font-size: 14px; text-transform: uppercase; letter-spacing: .04em; color: #555;
                   margin: 28px 0 12px; border-bottom: 1px solid #e3e3e3; padding-bottom: 6px; }
  .feature-count { color: #999; font-weight: 400; }
  /* One card per row by default; two per row on widescreen. minmax(0,1fr) lets a wide score
     scroll inside its card (.stage overflow) instead of forcing the column wider. */
  .cards { display: grid; grid-template-columns: 1fr; gap: 16px 20px; align-items: start; }
  @media (min-width: 1280px) { .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (min-width: 1800px) { .cards { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  .card { margin: 0; padding: 16px; background: #fff; border: 1px solid #e3e3e3; border-radius: 10px; }
  .card[hidden], .feature-section[hidden] { display: none; }
  figcaption h3 { margin: 0; font-size: 15px; font-family: ui-monospace, monospace; }
  figcaption p { margin: 4px 0 8px; color: #444; }
  ul.covers { margin: 0 0 8px; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 4px 6px; }
  ul.covers li { font-size: 11px; color: #355; background: #eef3ff; border: 1px solid #dde6ff;
                 padding: 1px 7px; border-radius: 6px; }
  .tag { font-size: 11px; background: #f0f0f0; color: #666; padding: 1px 6px; border-radius: 999px; }
  /* The fixture SVGs bake the light theme's ink colors (dark notes, slate staff lines) as
     inline attributes, which can't follow OS dark mode. Render every score on a white
     "paper" surface so the ink is always readable, whatever the page chrome does. */
  .stage { overflow-x: auto; padding: 10px 12px; background: #ffffff; border-radius: 6px; }
  .stage svg text { font-family: 'Bravura', serif; }
  .empty { color: #999; padding: 32px 0; display: none; }
  @media (prefers-color-scheme: dark) {
    body { background: #16181c; color: #e8e8e8; }
    header { background: #16181cee; border-color: #2c2f36; }
    #q { background: #1f2228; border-color: #2c2f36; color: #e8e8e8; }
    .chip { background: #1f2228; border-color: #2c2f36; color: #aab; }
    .chip.active { background: #4a6; color: #061; border-color: #4a6; }
    .card { background: #1f2228; border-color: #2c2f36; }
    figcaption p { color: #b9bcc2; }
    .feature-title { color: #aab; border-color: #2c2f36; }
    ul.covers li { color: #bcd; background: #1b2435; border-color: #2a3550; }
    .tag { background: #2a2d34; color: #99a; }
  }
</style>
</head>
<body>
  <header>
    <h1>RiffScore visual fixtures</h1>
    <div class="controls">
      <input id="q" type="search" placeholder="Search fixtures, scenarios, tags…" autocomplete="off" />
      <div class="chips">${chips}</div>
      <span id="count"></span>
    </div>
  </header>
  <main>
    ${sections}
    <p class="empty">No fixtures match.</p>
  </main>
  <script>
    (function () {
      var q = document.getElementById('q');
      var chips = Array.prototype.slice.call(document.querySelectorAll('.chip'));
      var cards = Array.prototype.slice.call(document.querySelectorAll('.card'));
      var sections = Array.prototype.slice.call(document.querySelectorAll('.feature-section'));
      var count = document.getElementById('count');
      var empty = document.querySelector('.empty');
      var activeFeature = 'all';
      function apply() {
        var query = q.value.trim().toLowerCase();
        var visible = 0;
        cards.forEach(function (card) {
          var okText = !query || card.getAttribute('data-search').indexOf(query) !== -1;
          var okFeat = activeFeature === 'all' || card.getAttribute('data-feature') === activeFeature;
          var show = okText && okFeat;
          card.hidden = !show;
          if (show) visible++;
        });
        sections.forEach(function (sec) {
          var f = sec.getAttribute('data-feature');
          var any = cards.some(function (c) { return c.getAttribute('data-feature') === f && !c.hidden; });
          sec.hidden = !any;
        });
        empty.style.display = visible === 0 ? 'block' : 'none';
        count.textContent = visible + ' / ' + cards.length + ' fixtures';
      }
      q.addEventListener('input', apply);
      chips.forEach(function (chip) {
        chip.addEventListener('click', function () {
          activeFeature = chip.getAttribute('data-feature');
          chips.forEach(function (c) { c.classList.toggle('active', c === chip); });
          apply();
        });
      });
      apply();
    })();
  </script>
</body>
</html>`;
}

describe('visual gallery generator', () => {
  (ENABLED ? it : it.skip)('writes ./visual-gallery/index.html (set VISUAL_GALLERY=1)', () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const cards: Card[] = visualFixtures.map((f) => {
      const { svg, unmount } = renderScore(f.score, GALLERY_SCALE);
      unmount();
      return { name: f.name, feature: f.feature, description: f.description, covers: f.covers, tags: f.tags, svg };
    });

    fs.writeFileSync(path.join(OUT_DIR, 'index.html'), buildHtml(cards, visualFeatures()), 'utf8');
    if (fs.existsSync(FONT_SRC)) {
      fs.copyFileSync(FONT_SRC, path.join(OUT_DIR, 'Bravura.woff2'));
    }

    expect(fs.existsSync(path.join(OUT_DIR, 'index.html'))).toBe(true);
    console.log(`\n  Visual gallery written: ${path.join(OUT_DIR, 'index.html')}\n`);
  });
});
