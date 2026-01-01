# Audio Decoupling Proposal

**Status**: ✅ IMPLEMENTED (see Issue #196, PR #197)

## Problem Statement

### Hypothesis (RFC §2.A)
> Tone.js is reachable from `import { RiffScore } from 'riffscore'`, increasing baseline bundle size even when playback is unused.

### Observed Evidence

```javascript
// dist/index.mjs (pre-implementation)
import * as Tone from 'tone';
```

**Import Chain**:
```
index.tsx → RiffScore → ScoreEditor → toneEngine → tone
```

### Clarification: "Bundle Size" Impact

> [!IMPORTANT]
> Tone.js was never bundled INTO riffscore. It's listed as an external dependency in `package.json`. The issue is that **consumer bundlers** see the static import and include Tone.js in **their** final bundle.

**The real impact**: Consumer bundlers (Webpack/Vite/etc.) cannot tree-shake or code-split Tone.js away because the static import makes it appear necessary.

---

## Solution: Dynamic Import

**Strategy**: Lazy-load Tone.js only when playback is invoked.

```typescript
// Before (static import)
import * as Tone from 'tone';

// After (dynamic import)
let toneModuleCache: typeof import('tone') | null = null;

const loadTone = async () => {
  if (!toneModuleCache) {
    toneModuleCache = await import('tone');
  }
  return toneModuleCache;
};
```

---

## Actual Impact (Honest Assessment)

| Use Case | Before | After | Real Benefit |
|----------|--------|-------|--------------|
| **Visual-only embedding** | ~400KB Tone.js in consumer bundle | 0KB (never loaded) | ✅ Eliminated |
| **Playback enabled** | Tone.js in initial bundle | Tone.js loaded on first play | ⚠️ Deferred only |
| **SSR/SSG** | Tone.js in server bundle | Not in server bundle | ✅ Eliminated |

### Who Benefits Most

1. **Visual-only embeds** (score viewer, no audio): ~400KB permanently saved
2. **Static site generators**: No AudioContext errors on server
3. **Performance-sensitive SPAs**: Initial load is faster, audio loads lazily

### Who Sees Trade-offs

- **Audio-first users**: 1-2 second latency on first play (network fetch)
- **Slow networks**: Noticeable delay before audio starts

---

## Implementation Details

- Refactored `toneEngine.ts` to use `import('tone')`
- Added `'not-loaded'` and `'loading'` instrument states
- Added error handling with retry logic
- Recursive `scheduleTonePlayback` properly returns awaited promise

---

## Validation

```bash
# Verify no static import
$ grep "from 'tone'" dist/index.mjs
# (empty output = success)

# All tests pass
$ npm test
# 815 passed
```

---

## Acceptance Criteria

- [x] `grep "from 'tone'" dist/index.mjs` returns empty
- [x] Playback still works when enabled
- [x] No breaking API changes
- [x] All 815 tests pass
