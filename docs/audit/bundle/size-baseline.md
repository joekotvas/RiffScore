# Size Baseline

## Build Output (with bundled font)

| Artifact | Size | Notes |
|----------|------|-------|
| `dist/index.mjs` | 627.88 KB | ESM bundle |
| `dist/index.js` | 635.32 KB | CJS bundle |
| `dist/index.css` | 28.95 KB | Unified stylesheet (includes `@font-face`) |
| `dist/fonts/Bravura.woff2` | 241.41 KB | Bundled music font |
| `dist/index.d.ts` | 28.76 KB | TypeScript declarations |
| `dist/index.mjs.map` | 1.50 MB | ESM source map |
| `dist/index.js.map` | 1.50 MB | CJS source map |

## Published Package

```
npm notice 📦  riffscore@1.0.0-alpha.6
npm notice package size: 1.0 MB
npm notice unpacked size: 4.9 MB
npm notice total files: 12
```

### Files Included

| File | Size |
|------|------|
| `LICENSE` | 1.1 KB |
| `README.md` | 7.0 KB |
| `dist/fonts/Bravura.woff2` | 247.2 KB |
| `dist/index.css` | 29.5 KB |
| `dist/index.css.map` | 50.0 KB |
| `dist/index.d.mts` | 29.4 KB |
| `dist/index.d.ts` | 29.4 KB |
| `dist/index.js` | 650.6 KB |
| `dist/index.js.map` | 1.6 MB |
| `dist/index.mjs` | 643.0 KB |
| `dist/index.mjs.map` | 1.6 MB |

## External Dependencies

These are NOT included in the riffscore bundle but add to consumer bundle:

| Dependency | Approx. Size (minified) | Tree-Shakeable |
|------------|-------------------------|----------------|
| `tone` | ~400 KB | ❌ (namespace import) |
| `tonal` | ~50 KB | ✅ |
| `lucide-react` | Variable | ✅ |
| `react` + `react-dom` | ~40 KB | Peer dep |

## Baseline Summary

| Scenario | Package Size | Consumer Bundle Impact |
|----------|--------------|------------------------|
| Pre-font bundling | 800 KB | ~640 KB riffscore + ~400 KB Tone.js |
| With bundled font | 1.0 MB | ~640 KB riffscore + 241 KB font + ~400 KB Tone.js |
| Visual-only (Tone.js decoupled) | 1.0 MB | ~640 KB riffscore + 241 KB font |
