# Measure-Relative X Positioning

**Issue:** Preparation for system breaks
**Date:** 2025-02-13
**Status:** Complete (All Stages Done)

---

## Problem

Current `getX` returns absolute X coordinates, which breaks when measures can appear on different systems at different X offsets.

```typescript
// Current (absolute)
layout.getX(globalQuant)  // → 450 (absolute X on canvas)
```

For system breaks, we need measure-relative positioning where each measure is independently positionable.

---

## Solution

Replace absolute X with measure-relative coordinates.

```typescript
// New API
layout.getX({ measure: 0, quant: 24 })     // → 45 (relative to measure origin)
layout.getX.measureOrigin({ measure: 0 })  // → 120 (measure's absolute X)
```

**Rendering pattern:**
```typescript
<g transform={`translate(${layout.getX.measureOrigin({ measure }) ?? 0}, 0)`}>
  <Element x={layout.getX({ measure, quant }) ?? 0} />
</g>
```

---

## API

```typescript
interface ScoreLayout {
  getX: {
    /** X position within a measure (measure-relative) */
    (params: { measure: number; quant: number }): number | null;

    /** Measure's origin X (for SVG transforms) */
    measureOrigin: (params: { measure: number }): number | null;
  };

  // getY unchanged
}
```

---

## Migration Stages

### Stage 0: ChordSymbol Data Model ✅ COMPLETE

**Commits:** 7101c84, 0d4b356, c9f50ba, 93cad52, 23b44eb

**Files:**
- `src/types.ts` — Interface change
- `src/commands/chord/AddChordCommand.ts` — Accept `{ measure, quant }` instead of global quant
- `src/commands/chord/UpdateChordCommand.ts` — Update position handling if needed
- `src/commands/chord/RemoveChordCommand.ts` — No change (uses ID)
- `src/hooks/chord/useChordTrack.ts` — `creatingAtQuant` → `creatingAt: { measure, quant }`
- `src/services/chord/ChordQuants.ts` — Return `Map<measure, Set<quant>>` for efficient lookup
- `src/utils/chord/queries.ts` — `findChordAtQuant` → `findChordAt({ measure, quant })`
- `src/utils/navigation/vertical.ts` — Update chord lookup in navigation
- `src/engines/toneEngine.ts` — Update playback timing (use `chord.measure` directly)
- `src/hooks/api/chords.ts` — Update API methods (logging, selection)
- `src/components/Layout/ScoreEditor.tsx` — Update chord selection
- `src/components/Canvas/ScoreCanvas.tsx` — Update chord navigation
- `src/components/Canvas/ChordTrack/ChordTrack.tsx` — Use new data shape
- `src/exporters/abcExporter.ts` — Update chord export
- `src/exporters/musicXmlExporter.ts` — Update chord export
- Tests: `ChordCommands.test.ts`, `useChordTrack.test.ts`, `ChordTrack.test.tsx`

**Changes:**
1. Update `ChordSymbol` interface from global quant to measure-local:
```typescript
// Before
export interface ChordSymbol {
  id: string;
  quant: number;  // Global quant (measureIndex * quantsPerMeasure + localQuant)
  symbol: string;
}

// After
export interface ChordSymbol {
  id: string;
  measure: number;  // Measure index
  quant: number;    // Local quant within measure
  symbol: string;
}
```

2. Update `AddChordCommand` constructor: `new AddChordCommand({ measure, quant }, symbol)`
3. Update sorting: `sort((a, b) => a.measure - b.measure || a.quant - b.quant)`
4. Update `getValidChordQuants` → return `Array<{ measure, quant }>` or `Map<measure, Set<quant>>`
5. Update `findChordAtQuant` → `findChordAt({ measure, quant })`
6. Migration: scores with old format get auto-migrated in `migrateScore()`

**Rationale:** Clean data model before API change. Global quant requires recalculation when measures are inserted/deleted. Measure-local is robust to measure operations.

**Test:** `npm test -- chord` (all chord tests should pass)

---

### Stage 1: ScoreLayout API ✅ COMPLETE

**Commit:** a586d3a

**Files:**
- `src/engines/layout/types.ts`
- `src/engines/layout/scoreLayout.ts`

**Changes:**
1. Update `ScoreLayout` interface with new `getX` signature
2. Build per-measure quant→X maps
3. Implement `getX({ measure, quant })` and `getX.measureOrigin({ measure })`
4. Remove old `getX(quant)` function

**Test:** `npm test -- scoreLayout` ✅ All 33 tests pass

---

### Stage 2: ChordTrack ✅ COMPLETE

**Commit:** a586d3a (combined with Stage 1)

**Files:**
- `src/components/Canvas/ChordTrack/ChordTrack.tsx`

**Changes:**
1. Added `getAbsoluteX(position, layout)` helper combining measureOrigin + localX
2. Updated `xToNearestPosition` to use new API
3. Removed `positionToGlobalQuant` bridge function
4. Cleaned up dependency arrays (removed unused measurePositions, quantsPerMeasure)

**Before:**
```typescript
x={layout.getX(positionToGlobalQuant(position, quantsPerMeasure))}
```

**After:**
```typescript
x={getAbsoluteX(position, layout)}
```

**Test:** `npm test -- ChordTrack` ✅ All 101 tests pass

---

## Agent Parallelization Strategy

Stages 3-5 can be researched in parallel using Explore agents before implementation:

### Phase 1: Parallel Research (3 agents)

| Agent | Task | Output |
|-------|------|--------|
| **Agent A** | Explore `useCursorLayout.ts` and `ScoreCanvas.tsx` cursor usage | Current implementation patterns, what needs to change |
| **Agent B** | Explore `useDragToSelect.ts` and `notePositions` in ScoreCanvas | Current hit detection logic, measure context needed |
| **Agent C** | Explore all files with `NoteLayout.x` and `EventLayout.x` usage | Full list of files needing x→localX rename |

### Phase 2: Implementation (sequential with parallel prep)

After research completes:
1. **Stages 3+4** (Cursor): Implement together since tightly coupled
2. **Stage 5** (Drag): Implement independently
3. **Stage 6** (Cleanup): Batch rename after stages 3-5 verified

### Phase 3: Documentation (parallel with Stage 6)

| Agent | Task |
|-------|------|
| **Agent D** | Draft LAYOUT_ENGINE.md updates based on new getX API |
| **Agent E** | Draft ADR-016-measure-relative-x.md |

---

### Stage 3: useCursorLayout ✅ COMPLETE

**Files:**
- `src/hooks/layout/useCursorLayout.ts`

**Changes:**
1. Added `measure` field to CursorLayout interface
2. Return `{ measure, x: localX }` instead of absolute X
3. Updated tests to expect measure-relative coordinates

**Before:**
```typescript
return { x: absoluteX, width, ... };
```

**After:**
```typescript
return { measure, x: localX, width, ... };
```

**Test:** `npm test -- useCursorLayout` ✅ All 12 tests pass

---

### Stage 4: ScoreCanvas Cursor ✅ COMPLETE

**Files:**
- `src/components/Canvas/ScoreCanvas.tsx`

**Changes:**
1. Extract `cursorMeasure` and `cursorLocalX` from useCursorLayout
2. Calculate absolute X using `measureOrigin + localX`

**Before:**
```typescript
const { x: unifiedCursorX, numStaves } = useCursorLayout(...);
transform: `translateX(${unifiedCursorX}px)`
```

**After:**
```typescript
const { measure: cursorMeasure, x: cursorLocalX, numStaves } = useCursorLayout(...);
const unifiedCursorX = cursorMeasure !== null && cursorLocalX !== null
  ? (layout.getX.measureOrigin({ measure: cursorMeasure }) ?? 0) + cursorLocalX
  : null;
```

**Test:** `npm test -- ScoreCanvas` ✅ All tests pass

---

### Stage 5: useDragToSelect ✅ COMPLETE (Compatible)

**Files:**
- `src/hooks/interaction/useDragToSelect.ts`
- `src/components/Canvas/ScoreCanvas.tsx` (notePositions)

**Status:** Already compatible with current implementation.

**Why no changes needed:**
1. `notePositions` already includes `measureIndex` for each note
2. `NoteLayout.x` is currently absolute (computed as `absoluteX + xShift` in scoreLayout.ts)
3. Selection rect is in absolute SVG coordinates
4. Hit detection compares absolute vs absolute - works correctly

**Note:** When Stage 6 renames `NoteLayout.x` to `localX` (measure-relative), ScoreCanvas will need to compute absolute X for notePositions. Per-measure hit detection will be enhanced when system breaks are implemented.

**Test:** Full test suite passes (1209 tests)

---

### Stage 6: Layout Types Cleanup ✅ COMPLETE

**Files:**
- `src/engines/layout/types.ts`
- `src/engines/layout/scoreLayout.ts`
- `src/components/Canvas/ScoreCanvas.tsx`
- `src/__tests__/engines/layout/scoreLayout.test.ts`

**Changes:**
1. Renamed `NoteLayout.x` → `NoteLayout.localX` (now measure-relative)
2. Renamed `EventLayout.x` → `EventLayout.localX` (now measure-relative)
3. Updated `scoreLayout.ts` to compute measure-relative X
4. Updated `ScoreCanvas.tsx` notePositions to compute absolute X using measureOrigin
5. Updated tests to use `localX` instead of `x`

**Test:** `npm test` (full suite) ✅ All 1209 tests pass

---

### Stage 7: Documentation ✅ COMPLETE

**Files:**
- `docs/LAYOUT_ENGINE.md` — Updated getX documentation with new API
- `docs/adr/016-measure-relative-x.md` — Created ADR documenting design decisions

---

## Affected Components

| Component | Change | Complexity |
|-----------|--------|------------|
| `types.ts` (ChordSymbol) | Add `measure` field, local quant | Low |
| `AddChordCommand.ts` | Accept `{ measure, quant }` params | Medium |
| `useChordTrack.ts` | `creatingAt` instead of `creatingAtQuant` | Medium |
| `ChordQuants.ts` | Return `Map<measure, Set<quant>>` | Medium |
| `queries.ts` | `findChordAt({ measure, quant })` | Low |
| `vertical.ts` | Update chord lookup in navigation | Low |
| `toneEngine.ts` | Use `chord.measure` for timing | Medium |
| `chords.ts` (API) | Update logging and selection | Low |
| `ScoreEditor.tsx` | Update chord selection | Low |
| `ScoreCanvas.tsx` | Update chord navigation + cursor | Medium |
| `ChordTrack.tsx` | Use new data shape | Medium |
| `scoreLayout.ts` | New getX implementation | Medium |
| `useCursorLayout.ts` | Return measure context | Medium |
| `useDragToSelect.ts` | Per-measure hit detection | Medium |
| `NoteLayout/EventLayout` | Rename x → localX | Low |
| `abcExporter.ts` | Update chord export | Low |
| `musicXmlExporter.ts` | Update chord export | Low |

---

## Not In Scope

- System breaks implementation (future)
- Multi-system rendering (future)
- Tie splitting at system breaks (future)

This migration prepares the coordinate system. System breaks will be a separate effort.

---

## Rollback

Each stage is independently testable. If issues arise:
1. Revert the stage's changes
2. Tests should pass again
3. Investigate before retrying

---

## Success Criteria

- [x] Stage 0: ChordSymbol uses `{ measure, quant }` instead of global quant
- [x] Stage 0: Old scores auto-migrate to new format
- [x] Stage 1: ScoreLayout API updated with measure-relative getX
- [x] Stage 2: ChordTrack uses new getX API
- [x] All 1209 tests passing after each stage
- [x] Stage 3: useCursorLayout returns measure context
- [x] Stage 4: ScoreCanvas cursor uses measure-relative positioning
- [x] Stage 5: useDragToSelect compatible (already has measure context)
- [x] Stage 6: Layout types renamed (x → localX)
- [x] Stage 7: Documentation updated
- [ ] Manual verification: chords, cursor, selection work correctly
- [x] No absolute X references remain in layout types
- [x] No global quant references remain in chord data model
