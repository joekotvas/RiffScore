# Audio Decoupling Proposal

## Problem Statement

### Hypothesis (RFC §2.A)
> Tone.js is reachable from `import { RiffScore } from 'riffscore'`, increasing baseline bundle size even when playback is unused.

### Observed Evidence

```javascript
// dist/index.mjs (line 3)
import * as Tone from 'tone';
```

**Import Chain**:
```
index.tsx → RiffScore → ScoreEditor → toneEngine → tone
```

**Impact**: ~400KB added to consumer bundle even for visual-only use cases.

---

## Solution Options

### Option 1: Dynamic Import (Recommended)

**Strategy**: Lazy-load Tone.js only when playback is invoked.

```typescript
// Before
import * as Tone from 'tone';

// After
let Tone: typeof import('tone') | null = null;

const getTone = async () => {
  if (!Tone) {
    Tone = await import('tone');
  }
  return Tone;
};
```

| Tradeoff | Impact |
|----------|--------|
| Bundle size (visual-only) | ↓ ~400KB |
| First playback latency | ↑ Network fetch |
| Code complexity | Moderate |
| Breaking changes | None |

### Option 2: Separate Entry Point

**Strategy**: Export audio functionality from `riffscore/audio`.

```json
// package.json exports
{
  ".": "./dist/index.mjs",
  "./audio": "./dist/audio.mjs"
}
```

| Tradeoff | Impact |
|----------|--------|
| Bundle size (visual-only) | ↓ ~400KB |
| Consumer ergonomics | ↓ Requires explicit import |
| Code complexity | High (two builds) |
| Breaking changes | Minor (new import path) |

### Option 3: Peer Dependency

**Strategy**: Move `tone` to `peerDependencies`.

| Tradeoff | Impact |
|----------|--------|
| Bundle size (visual-only) | No change |
| Consumer ergonomics | ↓ Must install `tone` |
| Code complexity | Low |
| Breaking changes | Medium (install step) |

---

## Recommendation

**Option 1: Dynamic Import**

**Rationale**:
- Zero breaking changes
- Significant bundle reduction
- Minimal code changes
- Consumer experience unchanged

---

## Migration Outline

1. Refactor `toneEngine.ts` to use dynamic imports
2. Update `initTone()` to return a Promise (already async)
3. Ensure playback controls handle loading state
4. Add loading indicator during first playback

---

## Acceptance Criteria

- [ ] Visual-only import does not load Tone.js
- [ ] Playback still works when enabled
- [ ] No breaking API changes
- [ ] Bundle size verified via `npm pack`

---

## Validation Checklist

- [ ] `grep "from 'tone'" dist/index.mjs` returns 0
- [ ] Demo app playback functional
- [ ] Unit tests pass
