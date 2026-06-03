# Y Positioning API - Centralized Vertical Anchors

**Issue:** Follow-up to coordinate-service-v2 (#204)
**Date:** 2026-02-13

---

## Terminology

| Term | Definition |
|------|------------|
| **System** | One line of music on a page. Contains all staves (e.g., treble + bass for grand staff) rendered horizontally together. |
| **System break** | A line break - where music wraps to the next system. |
| **Staff** | A single 5-line pentagram within a system. A grand staff system has 2 staves. |
| **Quant** | Time position unit. 96 quants = 1 whole note, 24 = quarter note. |

---

## Problem

Adding a floating element requires understanding scattered vertical spacing logic:

```typescript
// Current: scattered across ScoreCanvas.tsx + ChordTrack.tsx (~66 lines)
// - CHORD_COLLISION constants
// - noteYByQuant map computation
// - chordTrackY baseline calculation
// - getChordYOffset collision logic
```

**Pain points:**
1. No single source of truth for vertical positions
2. Adjusting spacing (e.g., title-to-score gap) breaks cursor/hit detection
3. New elements must duplicate Y calculation logic
4. Backwards references between components cause fragility

---

## Goal

**Simple DX:** Four questions, four functions.

| Question | Function |
|----------|----------|
| "Where is system N?" | `getY.system(n).top/bottom` |
| "Where is staff N?" | `getY.staff(n).top/bottom` |
| "Where are the notes?" | `getY.notes(q?).top/bottom` |
| "Where is this pitch?" | `getY.pitch(p, staffIndex)` |

Plus one region anchor for the overall content area.

---

## Solution

### Vertical Stack (Forward-Flow)

The forward-flow model applies to top-level elements. Each derives from the previous:

```
Y=0 (origin)
  │
  ├── Header: 0 → header.height
  │
  ├── Title: header.bottom + margin → title.bottom
  │
  ├── System[0]: title.bottom + margin → system[0].bottom
  │     │
  │     ├── ChordTrack (floats above notes)
  │     │
  │     ├── Staff[0]: system.top → staff[0].bottom
  │     │     ├── Dynamics (above)
  │     │     ├── Pentagram (5 lines)
  │     │     └── Lyrics (below)
  │     │
  │     ├── Staff[1]: staff[0].bottom + spacing → staff[1].bottom
  │     │
  │     └── Pedal: lastStaff.bottom + margin
  │
  ├── System[1]: system[0].bottom + margin → system[1].bottom  (after system break)
  │
  └── Footer: lastSystem.bottom + margin → footer.bottom
```

**Key invariant:** No backwards references in the stack. Each top-level position derives from elements above it.

**Within a system:** Elements like chords, dynamics, and lyrics query computed layout data (note positions, staff bounds) rather than deriving from a linear stack. This is intentional - they need to respond to actual content.

### API

```typescript
// src/engines/layout/types.ts

export interface YBounds {
  top: number;
  bottom: number;
}

export interface ScoreLayout {
  staves: StaffLayout[];
  notes: Record<string, NoteLayout>;
  events: Record<string, EventLayout>;

  getX: (quant: number) => number;

  getY: {
    // Content region (forward-flow computed)
    content: YBounds;

    // System bounds (for multi-system/page view)
    system: (index: number) => YBounds | null;

    // Staff bounds within a system
    staff: (index: number) => YBounds | null;

    // Note extent for collision avoidance
    // - No arg: returns extent across entire system (memoized)
    // - With quant: returns extent at that position, falls back to system-wide
    notes: (quant?: number) => YBounds;

    // Pitch Y position (clef-aware)
    // - Returns null if staffIndex is invalid
    pitch: (pitch: string, staffIndex: number) => number | null;
  };
}
```

### Return Values & Edge Cases

| Function | Invalid Input | Return |
|----------|---------------|--------|
| `system(99)` on 1-system score | Out of bounds | `null` |
| `staff(99)` on 2-staff score | Out of bounds | `null` |
| `notes()` on empty score | No notes exist | Staff bounds as fallback |
| `notes(quant)` with no notes at quant | No notes at position | System-wide extent as fallback |
| `pitch('C4', 99)` on 2-staff score | Invalid staff | `null` |

**Design rationale:** Return `null` for truly invalid inputs (bad indices). Provide helpful fallbacks when the query is valid but no data exists (empty measures).

### Usage

```typescript
// Chord track: above notes (collision-aware)
const chordY = layout.getY.notes().top - MARGIN;
const chordYAtQuant = layout.getY.notes(quant).top - MARGIN;

// Lyrics: below staff
const staffBounds = layout.getY.staff(0);
const lyricsY = staffBounds ? staffBounds.bottom + MARGIN : null;

// Dynamics: below notes at position
const dynamicsY = layout.getY.notes(quant).bottom + MARGIN;

// Pedal: below last staff
const lastStaff = layout.getY.staff(lastIndex);
const pedalY = lastStaff ? lastStaff.bottom + MARGIN : null;

// Title: above content area
const titleY = layout.getY.content.top - TITLE_HEIGHT - MARGIN;

// Bar line: spans all staves
const firstStaff = layout.getY.staff(0);
const lastStaff = layout.getY.staff(lastIndex);
if (firstStaff && lastStaff) {
  drawBarLine(firstStaff.top, lastStaff.bottom);
}

// Preview note at pitch
const noteY = layout.getY.pitch('C4', staffIndex);
if (noteY !== null) {
  drawPreviewNote(noteY);
}

// Footer: below content
const footerY = layout.getY.content.bottom + MARGIN;

// Multi-system: position element in system 2
const sys2 = layout.getY.system(1);
if (sys2) {
  positionInSystem(sys2.top);
}
```

**Mental model:** Four simple questions. Null-check for indices, fallbacks for missing data.

---

## Scope

### This Implementation
- Single-system layout (no system breaks yet)
- `system(0)` returns bounds; `system(n>0)` returns `null`
- Note extent from standard notes (no grace notes yet)
- ChordTrack migration as proof of concept

### Future-Proofed For
- **Multi-system / page view**: `system(n)` accessor ready
- **Grace notes**: Will be included in `notes()` extent when implemented
- **Lyrics, dynamics, pedaling**: Will use `staff().bottom`, `notes().bottom` anchors
- **System breaks**: Each system gets independent Y stack

### In Scope (Layout Engine)
- Absolute Y positions for systems, staves, notes, pitches
- Memoized bounds computation
- Fallbacks for empty data

### Out of Scope (Consumer Responsibility)
- **Collision clamping** (e.g., ChordTrack's `PER_CHORD_MIN_Y` limit)
- **Element-specific margins** (each consumer defines its own)
- **Animation/transitions**

The API provides positions; consumers apply constraints.

---

## Implementation

### Build in Layout Engine

```typescript
// src/engines/layout/scoreLayout.ts

export const calculateScoreLayout = (score: Score): ScoreLayout => {
  // ... existing layout computation ...

  // --- Forward-flow Y computation ---

  // Content region starts after header/title space
  const contentTop = CONFIG.contentTopMargin;
  const contentBottom = layout.staves[layout.staves.length - 1]?.y + CONFIG.staffHeight
    ?? contentTop + CONFIG.defaultSystemHeight;

  // Memoized system bounds (currently single-system)
  const systemBoundsCache = new Map<number, YBounds | null>();
  const system = (index: number): YBounds | null => {
    if (systemBoundsCache.has(index)) return systemBoundsCache.get(index)!;

    // Currently single-system; returns null for index > 0
    if (index !== 0 || layout.staves.length === 0) {
      systemBoundsCache.set(index, null);
      return null;
    }

    const bounds = { top: contentTop, bottom: contentBottom };
    systemBoundsCache.set(index, bounds);
    return bounds;
  };

  // Memoized staff bounds
  const staffBoundsCache = new Map<number, YBounds | null>();
  const staff = (index: number): YBounds | null => {
    if (staffBoundsCache.has(index)) return staffBoundsCache.get(index)!;

    const staffLayout = layout.staves[index];
    if (!staffLayout) {
      staffBoundsCache.set(index, null);
      return null;
    }

    const bounds = { top: staffLayout.y, bottom: staffLayout.y + CONFIG.staffHeight };
    staffBoundsCache.set(index, bounds);
    return bounds;
  };

  // Note extent (system-wide) - computed once, memoized
  const allNoteYs = Object.values(layout.notes).map(n => n.y);
  const defaultBounds = staff(0) ?? { top: CONFIG.baseY, bottom: CONFIG.baseY + CONFIG.staffHeight };
  const systemNoteBounds: YBounds = allNoteYs.length > 0
    ? { top: Math.min(...allNoteYs), bottom: Math.max(...allNoteYs) }
    : defaultBounds;

  // Per-quant maps (built once)
  const noteTopByQuant = new Map<number, number>();
  const noteBottomByQuant = new Map<number, number>();

  Object.values(layout.notes).forEach((noteLayout) => {
    const globalQuant = computeGlobalQuant(noteLayout, score, quantsPerMeasure);

    const currentTop = noteTopByQuant.get(globalQuant) ?? Infinity;
    if (noteLayout.y < currentTop) noteTopByQuant.set(globalQuant, noteLayout.y);

    const currentBottom = noteBottomByQuant.get(globalQuant) ?? -Infinity;
    if (noteLayout.y > currentBottom) noteBottomByQuant.set(globalQuant, noteLayout.y);
  });

  const notes = (quant?: number): YBounds => {
    if (quant === undefined) {
      return systemNoteBounds;
    }
    return {
      top: noteTopByQuant.get(quant) ?? systemNoteBounds.top,
      bottom: noteBottomByQuant.get(quant) ?? systemNoteBounds.bottom,
    };
  };

  // Pitch positioning (clef-aware)
  const pitch = (p: string, staffIndex: number): number | null => {
    const staffLayout = layout.staves[staffIndex];
    if (!staffLayout) return null;

    const clef = score.staves[staffIndex]?.clef ?? (staffIndex === 0 ? 'treble' : 'bass');
    return staffLayout.y + getOffsetForPitch(p, clef);
  };

  const getY = {
    content: { top: contentTop, bottom: contentBottom },
    system,
    staff,
    notes,
    pitch,
  };

  return { ...layout, getX, getY };
};
```

---

## Migration

### ScoreCanvas.tsx

**Remove ~45 lines:**

```diff
- const CHORD_COLLISION = useMemo(() => ({ ... }), []);
- const noteYByQuant = useMemo(() => { ... }, [...]);
- const chordTrackY = useMemo(() => { ... }, [...]);

  <ChordTrack
-   trackY={chordTrackY}
-   noteYByQuant={noteYByQuant}
-   collisionConfig={CHORD_COLLISION}
+   layout={layout}
    ...
  />
```

### ChordTrack.tsx

**Simplify Y logic, keep collision clamping:**

```diff
+ const CHORD_MARGIN = 20;
+ const MIN_CHORD_Y = 0;  // Consumer-side clamping (was PER_CHORD_MIN_Y)

  export const ChordTrack = memo(function ChordTrack({
-   trackY,
-   noteYByQuant,
-   collisionConfig,
+   layout,
  }) {
+   const trackY = layout.getY.notes().top - CHORD_MARGIN;

-   const getChordYOffset = useCallback((quant) => {
-     const noteY = noteYByQuant.get(quant);
-     if (noteY === undefined) return 0;
-     // ... 10 more lines
-   }, [noteYByQuant, collisionConfig, trackY]);

+   const getChordYOffset = (quant: number): number => {
+     const noteY = layout.getY.notes(quant).top;
+     if (noteY >= trackY) return 0;
+
+     // Collision: move chord up, but clamp to MIN_CHORD_Y
+     const idealY = noteY - CHORD_MARGIN;
+     const clampedY = Math.max(MIN_CHORD_Y, idealY);
+     return clampedY - trackY;
+   };
```

---

## Files Changed

| File | Change |
|------|--------|
| `types.ts` | Add `YBounds`, update `ScoreLayout` with `getY` |
| `scoreLayout.ts` | Build forward-flow Y + memoized `getY` object |
| `ScoreCanvas.tsx` | Remove ~45 lines, pass `layout` |
| `ChordTrack.tsx` | Use `layout.getY`, keep clamping (~20 lines removed) |
| `scoreLayout.test.ts` | Add `getY` tests |

---

## Testing

```typescript
describe('layout.getY', () => {
  describe('system()', () => {
    it('returns bounds for system 0', () => {
      const layout = calculateScoreLayout(createTestScore());
      const sys = layout.getY.system(0);
      expect(sys).not.toBeNull();
      expect(sys!.top).toBeLessThan(sys!.bottom);
    });

    it('returns null for invalid system index', () => {
      const layout = calculateScoreLayout(createTestScore());
      expect(layout.getY.system(99)).toBeNull();
    });
  });

  describe('staff()', () => {
    it('returns bounds for valid staff', () => {
      const layout = calculateScoreLayout(createTestScore());
      const s0 = layout.getY.staff(0);
      expect(s0).not.toBeNull();
      expect(s0!.bottom - s0!.top).toBe(CONFIG.staffHeight);
    });

    it('returns null for invalid staff index', () => {
      const layout = calculateScoreLayout(createTestScore());
      expect(layout.getY.staff(99)).toBeNull();
    });
  });

  describe('notes()', () => {
    it('returns system-wide extent without arg', () => {
      const layout = calculateScoreLayout(createTestScore());
      const extent = layout.getY.notes();
      expect(extent.top).toBeLessThanOrEqual(extent.bottom);
    });

    it('returns per-quant extent with arg', () => {
      const layout = calculateScoreLayout(createTestScore());
      const extent = layout.getY.notes(0);
      expect(extent.top).toBeDefined();
      expect(extent.bottom).toBeDefined();
    });

    it('falls back to system-wide for empty quant', () => {
      const layout = calculateScoreLayout(createTestScore());
      const system = layout.getY.notes();
      const atQuant = layout.getY.notes(9999);
      expect(atQuant).toEqual(system);
    });
  });

  describe('pitch()', () => {
    it('returns Y for valid pitch and staff', () => {
      const layout = calculateScoreLayout(createTestScore());
      const y = layout.getY.pitch('C4', 0);
      expect(y).not.toBeNull();
      expect(typeof y).toBe('number');
    });

    it('returns null for invalid staff', () => {
      const layout = calculateScoreLayout(createTestScore());
      expect(layout.getY.pitch('C4', 99)).toBeNull();
    });
  });
});
```

---

## Result

**Before:** 66 lines of Y logic across ScoreCanvas + ChordTrack

**After:** ~10 lines per component, shared memoized layout computation

**DX:**
```typescript
// Adding lyrics?
const staff = layout.getY.staff(0);
const y = staff ? staff.bottom + MARGIN : null;

// Adding dynamics?
const y = layout.getY.notes(quant).bottom + MARGIN;

// Adding chord track?
const y = layout.getY.notes().top - MARGIN;

// Preview note?
const y = layout.getY.pitch('C4', 0);

// Multi-system positioning?
const sys = layout.getY.system(systemIndex);
```

**Architecture:**
```
score (state)
    │
useScoreLayout(score)
    │
    ├── layout.getX(quant)         ← horizontal
    └── layout.getY                ← vertical (forward-flow stack)
            │
            ├── .content           ← { top, bottom }
            ├── .system(n)         ← { top, bottom } | null
            ├── .staff(n)          ← { top, bottom } | null
            ├── .notes(q?)         ← { top, bottom } (with fallback)
            └── .pitch(p, n)       ← number | null
            │
    Title, Chords, Staff, Lyrics, Dynamics, Pedal, Footer...
```
