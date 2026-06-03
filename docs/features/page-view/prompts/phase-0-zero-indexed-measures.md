# Phase 0: Zero-Indexed Internal Measure Numbers

**Issue:** [#227](https://github.com/joekotvas/riffscore/issues/227)
**Estimated Effort:** 1-2 days
**Dependencies:** None (prerequisite for Page View)
**Blocking:** All subsequent phases

---

## Objective

Refactor internal measure numbering from 1-indexed to 0-indexed for consistency with standard array indexing conventions. User-facing measure numbers remain 1-indexed (display layer converts).

---

## Rationale

- **Consistency:** Arrays and most internal indices are 0-indexed
- **Simplicity:** Eliminates off-by-one conversions when accessing `measures[index]`
- **Prerequisite:** Page View system break calculations assume 0-indexed measures
- **Convention:** Aligns with standard programming conventions

---

## Deliverables

1. Audit of all measure index usage
2. Updated internal APIs and data structures
3. Display layer conversion (internal 0 → display 1)
4. Updated tests
5. Migration for existing score data (if applicable)

---

## Scope

### In Scope
- Internal measure indices in all code
- API methods using measure indices
- Commands using measure references
- Layout engine measure positioning
- Selection engine measure tracking

### Out of Scope
- User-visible measure numbers (always displayed as 1-indexed)
- ABC/MusicXML export (already handles display conversion)

---

## Implementation Steps

### Step 1: Audit Measure Index Usage

Search for all measure-related code:

```bash
# Find all measure index references
grep -rn "measureIndex\|measure.*Index\|measureNumber" src/
grep -rn "\.measures\[" src/
grep -rn "measure:" src/types.ts
```

Key files to audit:
- `src/types.ts` - Position interfaces
- `src/engines/layout/scoreLayout.ts` - Layout calculations
- `src/engines/layout/coordinateUtils.ts` - Coordinate mapping
- `src/hooks/api/chords.ts` - Chord API
- `src/hooks/layout/useCursorLayout.ts` - Cursor positioning
- `src/utils/navigation/vertical.ts` - Navigation logic
- `src/services/chord/ChordQuants.ts` - Chord positioning
- `src/components/Canvas/ScoreCanvas.tsx` - Rendering

### Step 2: Define Conversion Helpers

Create `src/utils/measureIndex.ts`:

```typescript
/**
 * Measure index conversion utilities.
 *
 * Internal indices are 0-based (array index).
 * Display numbers are 1-based (human readable).
 */

/**
 * Convert internal measure index to display number.
 * @param index - 0-based internal index
 * @returns 1-based display number
 */
export const toDisplayMeasureNumber = (index: number): number => index + 1;

/**
 * Convert display measure number to internal index.
 * @param displayNumber - 1-based display number
 * @returns 0-based internal index
 */
export const toInternalMeasureIndex = (displayNumber: number): number => displayNumber - 1;

/**
 * Type guard for valid measure index.
 */
export const isValidMeasureIndex = (index: number, measureCount: number): boolean =>
  Number.isInteger(index) && index >= 0 && index < measureCount;
```

### Step 3: Update Type Definitions

Review `src/types.ts` Position interfaces:

```typescript
// Ensure all measure references use 0-based index
interface Position {
  /** 0-based measure index */
  measure: number;
  /** Quant position within measure */
  quant: number;
}

// Add JSDoc to clarify indexing
interface CursorPosition {
  /** 0-based measure index */
  measure: number;
  // ...
}
```

### Step 4: Update Layout Engine

In `src/engines/layout/scoreLayout.ts`:

```typescript
// Ensure getX uses 0-based indices
getX(position: { measure: number; quant: number }): number {
  // position.measure is 0-based, directly indexes measures array
  const measure = this.measures[position.measure];
  // ...
}
```

### Step 5: Update Display Components

In components that show measure numbers to users:

```typescript
import { toDisplayMeasureNumber } from '@/utils/measureIndex';

// MeasureNumber.tsx
<text>{toDisplayMeasureNumber(measureIndex)}</text>
```

### Step 6: Update Tests

Ensure all tests use 0-based indices:

```typescript
// Before (if 1-based)
expect(position.measure).toBe(1); // First measure

// After (0-based)
expect(position.measure).toBe(0); // First measure
```

---

## Files to Audit/Modify

| File | Changes |
|------|---------|
| `src/utils/measureIndex.ts` | Create - conversion helpers |
| `src/types.ts` | Add JSDoc clarifying 0-based indices |
| `src/engines/layout/scoreLayout.ts` | Verify 0-based indexing |
| `src/engines/layout/coordinateUtils.ts` | Verify 0-based indexing |
| `src/hooks/api/chords.ts` | Verify 0-based indexing |
| `src/hooks/layout/useCursorLayout.ts` | Verify 0-based indexing |
| `src/components/Canvas/MeasureNumber.tsx` | Use `toDisplayMeasureNumber()` |
| `src/utils/navigation/vertical.ts` | Verify 0-based indexing |
| `src/services/chord/ChordQuants.ts` | Verify 0-based indexing |
| `src/__tests__/**/*.ts` | Update test expectations |

---

## Test Cases

```typescript
describe('Measure Index Utilities', () => {
  describe('toDisplayMeasureNumber', () => {
    it('converts 0 to 1', () => {
      expect(toDisplayMeasureNumber(0)).toBe(1);
    });

    it('converts 5 to 6', () => {
      expect(toDisplayMeasureNumber(5)).toBe(6);
    });
  });

  describe('toInternalMeasureIndex', () => {
    it('converts 1 to 0', () => {
      expect(toInternalMeasureIndex(1)).toBe(0);
    });
  });

  describe('isValidMeasureIndex', () => {
    it('returns true for valid index', () => {
      expect(isValidMeasureIndex(0, 4)).toBe(true);
      expect(isValidMeasureIndex(3, 4)).toBe(true);
    });

    it('returns false for negative index', () => {
      expect(isValidMeasureIndex(-1, 4)).toBe(false);
    });

    it('returns false for index >= count', () => {
      expect(isValidMeasureIndex(4, 4)).toBe(false);
    });
  });
});
```

---

## Coding Standards

### JSDoc Convention

Add clarity to all measure-related parameters:

```typescript
/**
 * Get the X position for a location in the score.
 * @param position.measure - 0-based measure index
 * @param position.quant - Quant offset within measure
 */
```

### Naming Convention

- `measureIndex` - 0-based internal index
- `measureNumber` - 1-based display number

---

## Parallelization Strategy

### Parallel Research (3 subagents)
1. **Types Agent:** Audit `types.ts` and all Position interfaces
2. **Layout Agent:** Audit layout engine files
3. **API Agent:** Audit API hooks and commands

### Sequential Implementation (Executor)
1. Create `measureIndex.ts` utilities
2. Update type JSDoc comments
3. Apply fixes from audit

### Parallel Testing (2 subagents)
1. **Unit Tests Agent:** Update unit test expectations
2. **Integration Tests Agent:** Update integration test expectations

### Final Step (Executor)
Run full test suite: `npm run test`

---

## Acceptance Criteria

- [ ] `src/utils/measureIndex.ts` created with conversion helpers
- [ ] All internal measure indices are 0-based
- [ ] User-facing measure numbers display as 1-based
- [ ] JSDoc comments clarify indexing convention
- [ ] All tests updated and passing
- [ ] No off-by-one errors in measure access

---

## User Walkthrough & Manual Testing

After implementation, verify the following manually:

### 1. Open Demo App
```bash
npm run demo:dev
```

### 2. Create a New Score
- Add 4+ measures of notes
- Verify measure numbers display as 1, 2, 3, 4 (not 0, 1, 2, 3)

### 3. Test Navigation
- Use arrow keys to navigate between measures
- Verify cursor moves correctly at measure boundaries
- Check that clicking on measure 3 (displayed) positions cursor in correct measure

### 4. Test Chord Symbols
- Add a chord to measure 2 (displayed)
- Verify chord appears in correct location
- Edit the chord and verify it updates correctly

### 5. Test Selection
- Select notes across measures
- Verify selection highlights span correct measures

### 6. Verify Console
- Open browser console
- Check for any off-by-one errors or undefined access

### 7. Run Tests
```bash
npm run test
npm run lint
```

---

## Phase Completion & Recalibration

### Before Moving to Phase 1

After completing Phase 0:

1. **Review learnings:** Document any unexpected complexity or patterns discovered
2. **Update subsequent phases:** If this phase revealed new considerations, update Phase 1+ prompts
3. **Verify foundation:** Ensure all measure indexing is consistent before building page view on top

### Recalibration Checklist

- [ ] All tests pass
- [ ] No console errors in demo app
- [ ] Manual testing complete
- [ ] Any new patterns documented
- [ ] Phase 1 prompt reviewed for compatibility
- [ ] Git commit completed with clear message

### Commit Template

```bash
git add -A && git commit -m "refactor(#227): change internal measures to zero-indexed

- Add measureIndex.ts with conversion utilities
- Update all internal measure indices to 0-based
- User-facing measure numbers remain 1-based
- Update tests for new indexing convention

BREAKING CHANGE: Internal measure indices now 0-based

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Notes for Subsequent Phases

After this phase, all code should assume:
- `position.measure` is 0-based
- `measures[0]` is the first measure
- Display uses `toDisplayMeasureNumber()` for user-facing numbers
- Page View system breaks will use 0-based indices throughout
