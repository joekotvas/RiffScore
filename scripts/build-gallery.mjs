/**
 * Builds the live visual-fixture gallery (issue #252).
 *
 * Bundles the gallery React app + the real riffscore library + fixtures into a single,
 * self-contained IIFE (so it opens from file://) with the Bravura font inlined into the CSS
 * as a data URL. Output: visual-gallery/{gallery.js,gallery.css,index.html}.
 *
 *   npm run visual:gallery
 */
import { build } from 'esbuild';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'visual-gallery');
mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: [resolve(root, 'scripts/gallery/main.tsx')],
  bundle: true,
  format: 'iife',
  outdir: outDir,
  entryNames: 'gallery', // → gallery.js + gallery.css
  tsconfig: resolve(root, 'tsconfig.json'), // resolves the @/ path aliases
  jsx: 'automatic',
  loader: { '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl' },
  define: { 'process.env.NODE_ENV': '"production"' },
  minify: true,
  legalComments: 'none',
  logLevel: 'info',
});

writeFileSync(
  resolve(outDir, 'index.html'),
  `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>RiffScore visual fixtures (#252)</title>
  <link rel="stylesheet" href="gallery.css" />
</head>
<body>
  <div id="root"></div>
  <script src="gallery.js"></script>
</body>
</html>
`
);

console.log(`\n  Live gallery built: ${resolve(outDir, 'index.html')}\n`);
