import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const out = resolve('.qa-browser');
await mkdir(out, { recursive: true });
await build({
  entryPoints: ['e2e/qa/fixture.tsx'],
  bundle: true,
  outdir: out,
  format: 'esm',
  loader: { '.woff2': 'file' },
  define: { 'process.env.NODE_ENV': '"production"' },
});
await writeFile(
  resolve(out, 'index.html'),
  '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>RiffScore QA</title><link rel="stylesheet" href="/fixture.css"><style>body{margin:0;font-family:system-ui}main{padding:12px;min-width:0}nav{display:flex;flex-wrap:wrap;gap:8px}h1{font-size:24px}@media print{h1,h2,nav,main>p{display:none}main{padding:0}[data-riffscore-id]:not([data-riffscore-id="qa"]){display:none}}</style></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>'
);
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
};
createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = resolve(out, pathname === '/' ? 'index.html' : '.' + pathname);
  if (!file.startsWith(out + '/')) {
    res.writeHead(403).end();
    return;
  }
  try {
    const data = await readFile(file);
    res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
    res.end(data);
  } catch {
    res.writeHead(404).end();
  }
}).listen(4178, '127.0.0.1');
