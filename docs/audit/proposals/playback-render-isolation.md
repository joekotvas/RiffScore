# Playback Render Isolation Proposal

## Problem Statement

### Hypothesis (RFC §3.A)
> Playback cursor updates may trigger React re-renders beyond the minimal necessary subtree.

### Observed Evidence

- `playbackPosition` state in ScoreEditor
- Passed as prop to ScoreCanvas
- Cursor uses CSS transitions (not per-tick re-renders)

---

## Current Architecture

```
ScoreEditor (state owner)
└── ScoreCanvas (receives prop)
    └── <rect> cursor (CSS transform)
```

**Positive**: Cursor movement is CSS-animated, not React state-driven per frame.

**Concern**: Prop drilling causes ScoreCanvas re-render on position change.

---

## Solution Options

### Option 1: Profile First (Recommended)

**Strategy**: Capture React Profiler data before any changes.

If profiling shows:
- Measure/Note components NOT re-rendering → No action needed
- Excessive re-renders → Proceed to Option 2 or 3

### Option 2: React.memo on Static Components

```tsx
const Measure = React.memo(({ ... }) => { ... });
const Note = React.memo(({ ... }) => { ... });
```

| Tradeoff | Impact |
|----------|--------|
| Re-renders | ↓ Reduced |
| Memory | ↑ Memoization overhead |
| Complexity | Low |

### Option 3: Separate Cursor Layer

**Strategy**: Extract cursor to independent SVG layer outside React tree.

| Tradeoff | Impact |
|----------|--------|
| Re-renders | ↓ Zero notation re-renders |
| Complexity | High |
| Maintainability | ↓ Harder to reason about |

---

## Recommendation

**Option 1: Profile First**

**Rationale**:
- CSS transitions already optimize cursor movement
- No evidence of performance issues
- Premature optimization risk

---

## Acceptance Criteria

- [ ] React Profiler capture during playback
- [ ] Measure/Note re-render count documented
- [ ] If excessive, implement Option 2

---

## Validation Checklist

- [ ] Profiler shows <16ms commit duration
- [ ] Static components don't re-render
