# Phase 1: Foundation & Data Model

**Issue:** [#174](https://github.com/joekotvas/riffscore/issues/174)
**Estimated Effort:** 2-3 days
**Dependencies:** Phase 0 (zero-indexed measures)

---

## Objective

Establish the type system, configuration, and services needed for page view layout. This phase creates no UI—only pure functions and types that subsequent phases will use.

---

## Deliverables

1. Type definitions in `src/types.ts`
2. Config defaults in `src/config.ts`
3. `PageLayoutService.ts` with system break algorithm
4. `MetadataService.ts` with validation
5. Unit tests achieving 95%+ coverage

---

## Type Definitions

Add to `src/types.ts`:

```typescript
/**
 * Score metadata for display and export.
 */
export interface ScoreMetadata {
  /** Score title (required, pre-filled to "Untitled") */
  title: string;
  /** Composer name */
  composer?: string;
  /** Lyricist name */
  lyricist?: string;
  /** Copyright notice */
  copyright?: string;
}

/**
 * Layout configuration for page view.
 */
export interface LayoutConfig {
  /** Page size identifier */
  pageSize: 'letter' | 'a4';
  /** Page margins preset */
  margins: 'narrow' | 'normal' | 'wide';
  /** Staff size as percentage (100 = default), stepped by 10 */
  staffSize: number;
  /** Spacing between systems */
  systemSpacing: 'compact' | 'normal' | 'relaxed';
  /** Current view mode */
  viewMode: 'scroll' | 'page';
}

/**
 * Computed layout for a single system (line of music).
 */
export interface SystemLayout {
  /** 0-based system index */
  index: number;
  /** Measure indices contained in this system */
  measures: number[];
  /** Y position of system top */
  y: number;
  /** Total height of system */
  height: number;
  /** X offset (indent for first system) */
  xOffset: number;
  /** Available content width */
  contentWidth: number;
  /** First system flag */
  isFirst: boolean;
  /** Last system flag */
  isLast: boolean;
  /** Justification factor (1.0 = full, <1.0 = natural) */
  justification: number;
}

/**
 * Complete page layout with all systems.
 */
export interface PageLayout {
  /** Systems on this page */
  systems: SystemLayout[];
  /** Page dimensions */
  pageSize: 'letter' | 'a4';
  dimensions: { width: number; height: number };
  /** Margins preset */
  margins: LayoutConfig['margins'];
  /** Computed content width */
  contentWidth: number;
  /** First system indent (0-1) */
  firstSystemIndent: number;
  /** Staff scale factor */
  staffScale: number;
}
```

Extend the existing `Score` interface:

```typescript
export interface Score {
  // ... existing fields ...
  /** Score metadata for display and export */
  metadata?: ScoreMetadata;
  /** Layout configuration */
  layout?: LayoutConfig;
}
```

---

## Config Defaults

Add to `src/config.ts`:

```typescript
export const DEFAULT_SCORE_METADATA: ScoreMetadata = {
  title: 'Untitled',
};

export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  pageSize: 'letter',
  margins: 'normal',
  staffSize: 100,
  systemSpacing: 'normal',
  viewMode: 'scroll',
};

export const MARGIN_PRESETS = {
  narrow: { top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 },
  normal: { top: 19, right: 19, bottom: 19, left: 19 },
  wide: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
} as const;

export const PAGE_DIMENSIONS = {
  letter: { width: 215.9, height: 279.4 },
  a4: { width: 210, height: 297 },
} as const;

export const SYSTEM_SPACING_MULTIPLIERS = {
  compact: 1.5,
  normal: 2.0,
  relaxed: 2.5,
} as const;

export const FIRST_SYSTEM_INDENT = 0.15;

export const LAYOUT_WIDTHS = {
  clef: 30,
  timeSignature: 24,
  barline: 2,
  keySignaturePerAccidental: 10,
} as const;

export const METADATA_TYPOGRAPHY = {
  titleHeight: 30,
  composerHeight: 16,
  blockSpacing: 20,
} as const;

export const TIMING = {
  printStyleSettleMs: 100,
} as const;
```

---

## PageLayoutService

Create `src/services/PageLayoutService.ts`:

### Required Functions

1. **`calculateMeasureWidth(score, measureIndex, staffScale)`** - Returns width of a single measure
2. **`calculateAllMeasureWidths(score, staffScale)`** - Returns array of all measure widths
3. **`calculateSystemBreaks(measureWidths, contentWidth, firstSystemIndent)`** - Returns `number[][]` (measures per system)
4. **`calculateJustification(systemMeasures, measureWidths, availableWidth, isLastSystem)`** - Returns justification factor
5. **`calculatePageLayout(score, config)`** - Main entry point, returns `PageLayout`
6. **`getSystemForMeasure(measureIndex, pageLayout)`** - Lookup function
7. **`getMeasureOriginInSystem(measureIndex, pageLayout, measureWidths)`** - Returns `{x, systemIndex}`

### Algorithm Notes

- **System breaks:** Greedy fill. Always accept first measure in system. Break before overflow.
- **First system:** Indent by `FIRST_SYSTEM_INDENT` (15%) to accommodate title.
- **Last system:** Ragged if <60% full; justified otherwise.
- **Y positioning:** Use forward-flow pattern (ADR-015). Start after header, accumulate.

### Test Cases

- Empty score returns empty systems
- Single measure fits in one system
- Measures correctly overflow to second system
- First system has correct indent
- Last system ragged when <60% full
- Last system justified when >=60% full
- `getSystemForMeasure` returns correct system
- `getMeasureOriginInSystem` returns correct X offset

---

## MetadataService

Create `src/services/MetadataService.ts`:

### Required Functions

1. **`validateMetadata(metadata)`** - Returns `MetadataValidationResult`
2. **`normalizeMetadata(metadata)`** - Returns normalized `ScoreMetadata`

### Validation Rules

- Title required (cannot be empty)
- Title max 200 characters
- Composer max 100 characters
- Lyricist max 100 characters
- Copyright max 300 characters

### Test Cases

- Valid metadata passes validation
- Empty title fails validation
- Overly long fields fail validation
- Normalization trims whitespace
- Normalization defaults title to "Untitled"

---

## Coding Standards

Follow these project patterns from [docs/AGENTS.md](../../../AGENTS.md):

### TypeScript Rules
- No `any` - strictly forbidden
- Explicit return types on all exports
- Use union types over enums: `type PageSize = 'letter' | 'a4'`
- Use path aliases: `@/types`, `@/config`, `@/services`

### Structured Feedback Pattern (ADR-011)
Never throw from services. Return result objects:

```typescript
export interface MetadataValidationResult {
  ok: boolean;
  errors: {
    title?: string;
    composer?: string;
    lyricist?: string;
    copyright?: string;
  };
}
```

### Testing Requirements
- 95%+ coverage for services
- Use fixtures from `src/__tests__/fixtures/`
- Test pure functions directly

---

## Parallelization Strategy

The executor can run Bash commands but subagents cannot.

### Parallel Research (2 subagents)
1. **Types Agent:** Read existing `types.ts` structure and `Score` interface to understand extension points
2. **Config Agent:** Read `config.ts` and `constants.ts` to understand existing configuration patterns

### Sequential Implementation
After research completes, implement in order:
1. Types (extends existing file)
2. Config (extends existing file)
3. PageLayoutService (new file)
4. MetadataService (new file)

### Parallel Testing (2 subagents)
1. **PageLayout Tests Agent:** Write tests for PageLayoutService
2. **Metadata Tests Agent:** Write tests for MetadataService

### Final Step (Executor)
Run `npm run test` to verify all tests pass.

---

## Acceptance Criteria

- [ ] All types added to `src/types.ts`
- [ ] All config added to `src/config.ts`
- [ ] `PageLayoutService.ts` created with all functions
- [ ] `MetadataService.ts` created with all functions
- [ ] Test files created in `src/__tests__/services/`
- [ ] All tests pass (`npm run test`)
- [ ] No lint errors (`npm run lint`)
- [ ] 95%+ coverage for new services

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/types.ts` | Extend with new types |
| `src/config.ts` | Extend with new defaults |
| `src/services/PageLayoutService.ts` | Create |
| `src/services/MetadataService.ts` | Create |
| `src/__tests__/services/PageLayoutService.test.ts` | Create |
| `src/__tests__/services/MetadataService.test.ts` | Create |

---

## User Walkthrough & Manual Testing

After implementation, verify the following manually:

### 1. Run Tests
```bash
npm run test -- --coverage
npm run lint
```

### 2. Verify Test Coverage
- Check that `PageLayoutService.ts` has 95%+ coverage
- Check that `MetadataService.ts` has 95%+ coverage

### 3. Interactive Service Testing

Open a Node REPL or create a test script:

```typescript
// test-services.ts
import { calculatePageLayout } from './src/services/PageLayoutService';
import { validateMetadata, normalizeMetadata } from './src/services/MetadataService';
import { DEFAULT_LAYOUT_CONFIG, DEFAULT_SCORE_METADATA } from './src/config';

// Test PageLayoutService
const mockScore = {
  staves: [{
    measures: [
      { events: [{ duration: 16 }, { duration: 16 }] },
      { events: [{ duration: 16 }, { duration: 16 }] },
      { events: [{ duration: 16 }, { duration: 16 }] },
      { events: [{ duration: 16 }, { duration: 16 }] },
    ]
  }],
  keySignature: 'C',
  timeSignature: { beats: 4, beatType: 4 },
};

const layout = calculatePageLayout(mockScore, DEFAULT_LAYOUT_CONFIG);
console.log('Systems:', layout.systems.length);
console.log('First system measures:', layout.systems[0]?.measures);

// Test MetadataService
const validation = validateMetadata({ title: '' });
console.log('Empty title valid?', validation.ok); // Should be false

const normalized = normalizeMetadata({ title: '  My Song  ' });
console.log('Normalized title:', normalized.title); // Should be 'My Song'
```

### 4. Type Checking
```bash
npx tsc --noEmit
```

### 5. Verify No Breaking Changes
- Ensure existing tests still pass
- Check that `Score` interface extension doesn't break existing code

---

## Phase Completion & Recalibration

### Before Moving to Phase 2

After completing Phase 1:

1. **Verify all services work correctly**
   - PageLayoutService calculates system breaks as expected
   - MetadataService validates and normalizes correctly

2. **Document any discoveries**
   - Unexpected complexity in measure width calculation?
   - Edge cases that need special handling?
   - Performance concerns for large scores?

3. **Review Phase 2 prompt**
   - Are the command interfaces aligned with service signatures?
   - Do API factory methods have access to necessary context?

### Recalibration Checklist

- [ ] All tests pass with 95%+ coverage
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Services work in isolation tests
- [ ] Any edge cases documented
- [ ] Phase 2 prompt reviewed and updated if needed

### Commit Template

```bash
git add src/types.ts src/config.ts src/services/PageLayoutService.ts \
        src/services/MetadataService.ts src/__tests__/services/
git commit -m "feat(#174): add foundation types and services for page view

- Add ScoreMetadata, LayoutConfig, SystemLayout, PageLayout types
- Add layout config defaults and page dimension constants
- Create PageLayoutService with system break algorithm
- Create MetadataService with validation and normalization

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Notes for Subsequent Phases

After this phase, the following are available:
- `ScoreMetadata` and `LayoutConfig` types
- `calculatePageLayout()` for system break calculation
- `validateMetadata()` and `normalizeMetadata()` for metadata handling
- All layout constants in `config.ts`

Phase 2 will create commands that use these services.
