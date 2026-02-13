# Playback Profiler Analysis

## RFC §3.A — Playback Cursor Render Isolation

### Hypothesis
> Playback cursor updates may trigger React re-renders beyond the minimal necessary subtree, potentially impacting performance on larger scores.

### Finding: **UNVERIFIED** (Manual verification required)

---

## Architecture Analysis

### Cursor Implementation

**Location**: `src/hooks/layout/useCursorLayout.ts`

The cursor is NOT a standalone component. Instead:
1. `playbackPosition` prop is passed from `ScoreEditor` → `ScoreCanvas`
2. `useCursorLayout` hook computes cursor X position
3. Cursor rendered as CSS transform on an SVG rectangle

### Component Hierarchy

```
ScoreEditor (owns playbackPosition state)
└── ScoreCanvas (receives playbackPosition prop)
    └── <rect> cursor element (inline, CSS transform animation)
```

### Render Trigger Analysis

**Code Reference**: `ScoreCanvas.tsx` line 382

```tsx
transition: `transform ${playbackPosition.duration || 0.1}s linear`,
```

**Observation**: Cursor uses CSS transitions (not React re-renders) for smooth movement.

### Potential Re-render Surfaces

When `playbackPosition` changes:

| Component | Re-renders? | Reason |
|-----------|-------------|--------|
| `ScoreEditor` | ✅ Yes | Owns state |
| `ScoreCanvas` | ✅ Yes | Receives prop |
| `useCursorLayout` | ✅ Yes | Recomputes position |
| Staff/Measure/Note | ❓ Depends | Need profiler data |

---

## Manual Verification Procedure

### React Profiler Capture Steps

1. Open demo app in Chrome
2. Open Chrome DevTools → Profiler tab
3. Click "Start profiling"
4. Click Play button in RiffScore toolbar
5. Let playback run for 2-3 measures
6. Click "Stop profiling"

### What to Look For

| Metric | Threshold | Concern |
|--------|-----------|---------|
| Render count per tick | >1 component | Over-rendering |
| Commit duration | >16ms | Jank risk |
| `Measure` component renders | Should be 0 | Static content |
| `Note` component renders | Should be 0 | Static content |

### Expected vs. Desired

| Component | Expected | Desired |
|-----------|----------|---------|
| ScoreCanvas | Re-renders | Acceptable |
| Cursor rect | CSS transform | Correct |
| Measure/Note | Unknown | No re-render |

---

## Design Objective Assessment

| Objective | Status |
|-----------|--------|
| Avoid re-rendering static SVG notation paths | UNVERIFIED |
| Update only cursor layer | Partially achieved (CSS transform) |

### Recommendation

If profiler shows excessive re-renders, consider:
1. Extracting cursor to separate SVG layer
2. Using `React.memo` on static notation components
3. Moving cursor animation to CSS-only (no React state)
