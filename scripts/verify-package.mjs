import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { createServer } from 'node:http';
const repoRequire = createRequire(new URL('../package.json', import.meta.url));
const { build } = repoRequire('esbuild');
const { chromium } = repoRequire('@playwright/test');
const root = process.argv[2];
if (!root)
  throw new Error('Pass a clean consumer directory with riffscore, react and react-dom installed.');
const require = createRequire(resolve(root, 'package.json'));
// A theory-only consumer must never initialize React, the DOM, styles or audio.
const Module = require('node:module');
const originalLoad = Module._load;
try {
  Module._load = function (request, ...args) {
    if (/^(react|react-dom|tone)(\/|$)|\.css$/.test(request))
      throw new Error(`Headless dependency: ${request}`);
    return originalLoad.call(this, request, ...args);
  };
  const theory = require('riffscore/theory');
  assert.equal(theory.getNoteDuration('quarter'), 16);
  assert.equal(theory.getMeasureCapacity('none'), Infinity);
  assert.ok(theory.parseChord('C'));
} finally {
  Module._load = originalLoad;
}
const esm = await import(resolve(root, 'node_modules/riffscore/dist/index.mjs'));
assert.equal(typeof esm.RiffScoreSession, 'function');
const React = require('react');
const { renderToString } = require('react-dom/server');
const { RiffScore } = require('riffscore');
const config = {
  score: {
    staves: [
      {
        id: 'staff',
        clef: 'treble',
        measures: [
          {
            id: 'measure',
            events: [{ id: 'event', duration: 'whole', notes: [{ id: 'note', pitch: 'C4' }] }],
          },
        ],
      },
    ],
  },
  ui: { showToolbar: false, scale: 1 },
};
const html = renderToString(React.createElement(RiffScore, { id: 'consumer', config }));
const out = resolve(root, 'browser');
await mkdir(out, { recursive: true });
await writeFile(
  resolve(root, 'client.jsx'),
  `import React from 'react'; import {hydrateRoot} from 'react-dom/client'; import {RiffScore} from 'riffscore'; import 'riffscore/styles.css'; window.hydrationErrors=[]; hydrateRoot(document.getElementById('root'),<RiffScore id="consumer" config={${JSON.stringify(config)}}/>,{onRecoverableError:e=>window.hydrationErrors.push(e.message)});`
);
await build({
  entryPoints: [resolve(root, 'client.jsx')],
  outdir: out,
  bundle: true,
  format: 'esm',
  loader: { '.woff2': 'file' },
  define: { 'process.env.NODE_ENV': '"development"' },
});
await writeFile(
  resolve(out, 'index.html'),
  `<!doctype html><html><head><link rel="stylesheet" href="/client.css"></head><body><div id="root">${html}</div><script type="module" src="/client.js"></script></body></html>`
);
const server = createServer(async (req, res) => {
  try {
    const path = req.url === '/' ? 'index.html' : req.url.slice(1);
    res.setHeader(
      'Content-Type',
      extname(path) === '.js'
        ? 'text/javascript'
        : extname(path) === '.css'
          ? 'text/css'
          : 'text/html'
    );
    res.end(await readFile(resolve(out, path)));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => window.riffScore?.get('consumer'));
  await page.evaluate(() => window.riffScore.get('consumer').select(0).setPitch('D4'));
  assert.equal(
    await page.evaluate(
      () =>
        window.riffScore.get('consumer').getScore().staves[0].measures[0].events[0].notes[0].pitch
    ),
    'D4'
  );
  assert.deepEqual(await page.evaluate(() => window.hydrationErrors), []);
  assert.deepEqual(errors, []);
  console.log(`React ${React.version}: packed ESM browser hydration/edit passed`);
} finally {
  await browser.close();
  server.close();
}
