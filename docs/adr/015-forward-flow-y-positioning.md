# ADR-015: Forward-Flow Y Positioning API

> **Principle**: Single Source of Truth, Forward-Flow Design
> **Status**: Proposed
> **Date**: 2026-02-13
> **Spec**: [y-positioning-spec.md](../migration/y-positioning-spec.md)

## Context

Vertical positioning logic is scattered across components:

- `ScoreCanvas.tsx`: computes `chordTrackY`, builds `noteYByQuant` map (~45 lines)
- `ChordTrack.tsx`: computes `getChordYOffset` collision logic (~20 lines)
- Future elements (lyrics, dynamics, pedal) would duplicate this pattern

This fragmentation causes:
1. **Fragility**: Adjusting title-to-score spacing broke cursor hit detection
2. **Duplication**: Each floating element reimplements Y calculations
3. **Backwards references**: Components reference each other's spacing constants
4. **Cognitive load**: Understanding positioning requires reading multiple files

## Decision

Add a `getY` API to `ScoreLayout` using **forward-flow computation** with **five accessor functions**.

### Terminology

- **System**: One line of music on a page (all staves rendered horizontally together)
- **System break**: A line break where music wraps to the next system
- **Staff**: A single 5-line pentagram within a system

### Forward-Flow Principle

Top-level positions flow from Y=0 downward. Each element derives from the previous:

```
Y=0 → Header → Title → System[0] → System[1] → ... → Footer
```

No top-level element references a position below it. The layout engine computes the stack once, then exposes the results.

**Within systems:** Elements like chords, dynamics, and lyrics query computed layout data (note positions, staff bounds). This is intentional - they respond to content rather than deriving from a linear stack.

### API Design

```typescript
getY: {
  content: { top: number; bottom: number };                      // Content region
  system: (index: number) => { top: number; bottom: number } | null;  // System bounds
  staff: (index: number) => { top: number; bottom: number } | null;   // Staff bounds
  notes: (quant?: number) => { top: number; bottom: number };    // Note extent
  pitch: (pitch: string, staffIndex: number) => number | null;   // Pitch position
}
```

### Key Design Choices

| Aspect | Decision |
|--------|----------|
| **Model** | Forward-flow stacking for top-level elements |
| **API shape** | Object with 5 functions returning `{top, bottom}` or `null` |
| **Invalid inputs** | Return `null` for out-of-bounds indices |
| **Missing data** | Provide helpful fallbacks (e.g., staff bounds when no notes) |
| **Collision** | `notes(quant)` returns per-position extent; falls back to system-wide |
| **Pitch helper** | `pitch('C4', 0)` centralizes clef-aware Y calculation |
| **Memoization** | Cache bounds objects to avoid recreating on each call |

### Scope

**In scope (Layout Engine):**
- Absolute Y positions for systems, staves, notes, pitches
- Memoized bounds computation
- Fallbacks for empty data

**Out of scope (Consumer responsibility):**
- Collision clamping (e.g., ChordTrack's min-Y limit)
- Element-specific margins
- Animation/transitions

## Consequences

### Positive

- **Single source of truth**: All Y positions come from `layout.getY`
- **Simple DX**: Four questions map to four functions
- **Forward-only**: No backwards references; changing header/title spacing propagates naturally
- **Future-proof**: Lyrics, dynamics, pedal, multi-system use same API
- **Reduced code**: ~35 lines removed from ScoreCanvas + ChordTrack
- **Type-safe**: `null` returns for invalid inputs catch errors at compile time

### Negative

- **Migration effort**: ChordTrack props change; ScoreCanvas logic moves to layout engine
- **Layout engine grows**: ~40 lines added for Y computation (shared across all consumers)
- **Null checks**: Consumers must handle `null` for staff/system/pitch calls

## Usage Examples

```typescript
// Chord track (above notes)
const chordY = layout.getY.notes().top - MARGIN;

// Per-chord collision
const chordYAtQuant = layout.getY.notes(quant).top - MARGIN;

// Lyrics (below staff)
const staff = layout.getY.staff(0);
const lyricsY = staff ? staff.bottom + MARGIN : null;

// Dynamics (below notes)
const dynamicsY = layout.getY.notes(quant).bottom + MARGIN;

// Pedal (below last staff)
const lastStaff = layout.getY.staff(lastIndex);
const pedalY = lastStaff ? lastStaff.bottom + MARGIN : null;

// Title (above content)
const titleY = layout.getY.content.top - TITLE_HEIGHT - MARGIN;

// Preview note
const noteY = layout.getY.pitch('C4', staffIndex);

// Multi-system positioning
const sys = layout.getY.system(1);
if (sys) positionInSystem(sys.top);
```

## Edge Cases

| Case | Behavior |
|------|----------|
| Empty score (no staves) | `notes()` returns default bounds; `staff(0)` returns `null` |
| No notes at quant | `notes(quant)` falls back to system-wide extent |
| Invalid staff index | `staff(n)` returns `null` |
| Invalid system index | `system(n)` returns `null` (currently only `system(0)` is valid) |
| Invalid pitch/staff combo | `pitch(p, n)` returns `null` |
| Ledger line notes | Included in `notes()` extent (affects collision) |

**Future features** (grace notes, multi-system, dynamics, pedaling) will use these same accessors when implemented.

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|--------------|
| Separate functions (`staffTop`, `staffBottom`, etc.) | More verbose; doesn't group related values |
| Properties instead of functions | Can't defer computation; index required |
| Pass collision config as props | Current pattern; causes duplication and fragility |
| Element-specific helpers (`chordTrackY`, `lyricsY`) | Doesn't scale; hardcodes element types into API |
| Always return bounds (never null) | Silent failures harder to debug than explicit nulls |

## Related

- [Coordinate Service v2 Spec](../migration/coordinate-service-v2-spec.md) - `getX` implementation
- [Y Positioning Spec](../migration/y-positioning-spec.md) - Full implementation details
- Issue #204 - Original coordinate service work
