# Audit Methodology

## Tools & Environment

### Build System
- **Bundler**: tsup v8.5.1
- **Config**: `tsup.config.ts`
- **Format**: ESM + CJS dual output
- **Source maps**: Enabled
- **Tree-shaking**: Enabled (bundler flag)
- **Externals**: `react`, `react-dom` only

### Analysis Tools

| Tool | Purpose | Status |
|------|---------|--------|
| `npm pack --dry-run` | Inspect published file list | ✅ EXECUTED |
| `source-map-explorer` | Bundle visualization | ⚠️ FAILED (source map column mismatch) |
| `size-limit` | Size baselines | ✅ INSTALLED (not executed) |
| `grep` / `head` | Bundle content inspection | ✅ EXECUTED |

### Manual Verification Required

| Area | Tool | Status |
|------|------|--------|
| React Profiler | Chrome DevTools | PROCEDURE DOCUMENTED |
| Layout reflow | Chrome Performance panel | PROCEDURE DOCUMENTED |
| Font loading timing | Network waterfall | PROCEDURE DOCUMENTED |

---

## Assumptions

1. **Production build** via `npm run build` is the authoritative artifact
2. **tsup defaults** treat npm dependencies as external in ESM output
3. **Consumer bundler** (webpack, vite, etc.) will resolve external imports
4. **Tree-shaking efficacy** depends on consumer bundler, not library bundler

---

## Limitations

1. `source-map-explorer` failed due to source map generation issue:
   > "generated column Infinity on line 41"
   
   **Impact**: Bundle visualization artifact is UNVERIFIED
   
2. Runtime profiling requires manual browser interaction
3. Consumer bundle simulation not performed in this audit

---

## Evidence Standards

Every claim uses one of:
- `CONFIRMED` — Command output or code inspection proves the claim
- `UNVERIFIED` — Evidence incomplete; procedure documented
- `REJECTED` — Evidence disproves the hypothesis
