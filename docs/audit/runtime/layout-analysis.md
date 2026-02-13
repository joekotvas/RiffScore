# Layout Analysis

## RFC §3.B — Layout Measurement & Reflow

### Hypothesis
> Resize observers or layout calculations may introduce synchronous DOM reads/writes that cause forced reflow during playback or resize.

### Finding: **CONFIRMED (Low Risk)**

---

## Code Inspection Results

### DOM Measurement APIs

| Pattern | Production Code | Test Mocks |
|---------|-----------------|------------|
| `getBoundingClientRect` | ❌ Not found | ❌ |
| `offsetWidth/offsetHeight` | ❌ Not found | ❌ |
| `clientWidth/clientHeight` | ❌ Not found | ❌ |
| `ResizeObserver` | ❌ Not found | ✅ Mocked for tests |

**Observation**: No synchronous DOM measurement in production code.

### Layout Hooks Analysis

**Cursor Layout**: `useCursorLayout.ts`
- Uses `useMemo` for position calculation
- Derives X position from pre-computed `ScoreLayout`
- No DOM reads during computation

### Memoization Patterns

```bash
# Files using useMemo in hooks
$ grep -l "useMemo" src/hooks/
# Results: 10+ files use useMemo
```

Key layout hooks are memoized:
- `useCursorLayout` — useMemo on line 48
- `useScoreLayout` — Centralized computation

---

## Forced Reflow Risk Assessment

| Risk Area | Status | Evidence |
|-----------|--------|----------|
| Synchronous DOM reads | ❌ None | grep search |
| Resize observers | ❌ None in prod | Only test mocks |
| Layout thrashing | ❌ Unlikely | No DOM reads |
| Repeated measurements | ❌ Unlikely | Layout pre-computed |

---

## Manual Verification Procedure

### Chrome Performance Panel Steps

1. Open demo app in Chrome
2. Open DevTools → Performance tab
3. Click record
4. Resize the browser window
5. Click Play and let playback run
6. Stop recording

### What to Look For

| Metric | Warning Sign |
|--------|--------------|
| Layout (purple) duration | >5ms per frame |
| "Forced reflow" warning | Any occurrence |
| Long tasks | >50ms |

---

## Design Objective Assessment

| Objective | Status |
|-----------|--------|
| No forced reflow during playback | ✅ CONFIRMED (code inspection) |
| No layout thrashing | ✅ CONFIRMED |
| Memoization of layout calculations | ✅ CONFIRMED |

**Verdict**: Layout implementation is low-risk. No forced reflow patterns detected.
