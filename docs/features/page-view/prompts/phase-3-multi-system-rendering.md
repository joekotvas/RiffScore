# Phase 3: Multi-System Rendering

**Issue:** [#174](https://github.com/joekotvas/riffscore/issues/174)
**Estimated Effort:** 3-4 days
**Dependencies:** Phase 1 (PageLayoutService), Phase 2 (Commands & API)

---

## Objective

Update the rendering layer to display music across multiple systems (lines) in page view mode, including tie splitting at system breaks.

---

## Deliverables

1. Updated `ScoreCanvas.tsx` for multi-system rendering
2. Updated `Staff.tsx` for per-system clef/key
3. New `MeasureNumber.tsx` component
4. Updated `Barline.tsx` for cross-staff rendering
5. Updated `Tie.tsx` for system break splitting
6. New `PageBoundary.tsx` component
7. `usePageLayout.ts` hook
8. Integration tests for rendering

---

## Requirements Reference

From PRD:
- **FR-05:** Score auto-wraps to multiple systems based on page width
- **FR-07:** Each system includes clef, key signature, brace/bracket
- **FR-09:** Barlines extend across all staves
- **FR-17–18:** Ties split at system breaks with visual indication
- **FR-27:** First system indented ~15%
- **FR-28:** Measure numbers at system start
- **FR-29:** Systems justified; final system ragged if <60% full

---

## Component Updates

### ScoreCanvas.tsx

Update to render multiple systems in page view:

```typescript
// Pseudo-structure
const ScoreCanvas: React.FC<ScoreCanvasProps> = ({ score, viewMode, ... }) => {
  const { pageLayout, isPageView } = usePageLayout();

  if (!isPageView) {
    // Existing scroll view rendering (single horizontal line)
    return <g>{/* existing rendering */}</g>;
  }

  // Page view: render each system as a group
  return (
    <g className="riff-page-view">
      <PageBoundary pageLayout={pageLayout} />
      {pageLayout.systems.map((system) => (
        <g
          key={system.index}
          className="riff-system"
          transform={`translate(0, ${system.y})`}
        >
          {/* Render measures for this system */}
          {system.measures.map((measureIndex) => (
            <Measure
              key={measureIndex}
              measureIndex={measureIndex}
              systemLayout={system}
              {...measureProps}
            />
          ))}
          {/* Brace/bracket for grand staff */}
          {staves.length > 1 && <Brace y={0} height={system.height} />}
        </g>
      ))}
    </g>
  );
};
```

### Staff.tsx

Update to render clef and key signature on every system:

```typescript
// Current: only renders clef/key on first system
// Updated: renders clef/key at start of every system

interface StaffProps {
  // ... existing props
  isSystemStart: boolean;  // New prop
  systemIndex: number;     // New prop
}

// Inside Staff render:
{isSystemStart && (
  <>
    <Clef type={clef} x={clefX} />
    <KeySignature keySignature={keySignature} x={keySigX} />
    {systemIndex === 0 && <TimeSignature timeSignature={timeSignature} x={timeSigX} />}
  </>
)}
```

### MeasureNumber.tsx (New)

```typescript
/**
 * MeasureNumber
 *
 * Renders measure number at the start of each system.
 * Positioned above the top staff, left-aligned with first barline.
 */

interface MeasureNumberProps {
  number: number;
  x: number;
  y: number;
  staffScale: number;
}

export const MeasureNumber: React.FC<MeasureNumberProps> = ({
  number,
  x,
  y,
  staffScale,
}) => {
  const fontSize = 10 * staffScale;

  return (
    <text
      x={x}
      y={y - 8}  // Above staff
      fontSize={fontSize}
      className="riff-measure-number"
      textAnchor="start"
    >
      {number}
    </text>
  );
};
```

### Barline.tsx

Update to extend across all staves in a system:

```typescript
interface BarlineProps {
  // ... existing props
  extendAcrossStaves?: boolean;  // New prop
  systemHeight?: number;          // New prop for cross-staff extension
}

// Inside render:
{extendAcrossStaves && (
  <line
    x1={x}
    y1={topStaffY}
    x2={x}
    y2={topStaffY + systemHeight}
    className="riff-barline riff-barline--system"
  />
)}
```

### Tie.tsx

Update to handle ties that span system breaks:

```typescript
interface TieProps {
  // ... existing props
  crossesSystemBreak?: boolean;
  isStartOfTie?: boolean;  // First part (extends to right edge)
  isEndOfTie?: boolean;    // Second part (extends from left edge)
}

// Render logic:
if (crossesSystemBreak && isStartOfTie) {
  // Draw tie from note to right edge of system
  return <TieArc from={noteX} to={systemRightEdge} direction="right" />;
}

if (crossesSystemBreak && isEndOfTie) {
  // Draw tie from left edge to note
  return <TieArc from={systemLeftEdge} to={noteX} direction="left" />;
}

// Normal tie (within system)
return <TieArc from={startX} to={endX} />;
```

### PageBoundary.tsx (New)

```typescript
/**
 * PageBoundary
 *
 * Renders subtle page outline in page view mode.
 */

interface PageBoundaryProps {
  pageLayout: PageLayout;
}

export const PageBoundary: React.FC<PageBoundaryProps> = ({ pageLayout }) => {
  const { dimensions, margins } = pageLayout;

  return (
    <rect
      x={0}
      y={0}
      width={dimensions.width}
      height={dimensions.height}
      className="riff-page-boundary"
      fill="white"
      stroke="#ddd"
      strokeWidth={1}
    />
  );
};
```

---

## Hook: usePageLayout

Create `src/hooks/layout/usePageLayout.ts`:

```typescript
import { useMemo, useCallback } from 'react';
import { useScoreContext } from '@/hooks/useScoreContext';
import { calculatePageLayout, getSystemForMeasure } from '@/services/PageLayoutService';
import { PageLayout, SystemLayout, LayoutConfig } from '@/types';
import { DEFAULT_LAYOUT_CONFIG } from '@/config';

interface UsePageLayoutResult {
  pageLayout: PageLayout;
  viewMode: LayoutConfig['viewMode'];
  isPageView: boolean;
  getSystem: (measureIndex: number) => SystemLayout | null;
  getMeasureX: (measureIndex: number) => number | null;
}

export const usePageLayout = (): UsePageLayoutResult => {
  const { score } = useScoreContext();

  const config = score.layout ?? DEFAULT_LAYOUT_CONFIG;
  const viewMode = config.viewMode;
  const isPageView = viewMode === 'page';

  const pageLayout = useMemo(() => {
    if (!isPageView) {
      return {
        systems: [],
        pageSize: config.pageSize,
        dimensions: { width: 0, height: 0 },
        margins: config.margins,
        contentWidth: Infinity,
        firstSystemIndent: 0,
        staffScale: config.staffSize / 100,
      } as PageLayout;
    }
    return calculatePageLayout(score, config);
  }, [score, config, isPageView]);

  const getSystem = useCallback(
    (measureIndex: number) => {
      if (!isPageView) return null;
      return getSystemForMeasure(measureIndex, pageLayout);
    },
    [isPageView, pageLayout]
  );

  const getMeasureX = useCallback(
    (measureIndex: number) => {
      if (!isPageView) return null;
      const system = getSystemForMeasure(measureIndex, pageLayout);
      if (!system) return null;

      // Calculate X within system using justification
      let x = system.xOffset;
      // ... measure positioning with justification
      return x;
    },
    [isPageView, pageLayout]
  );

  return { pageLayout, viewMode, isPageView, getSystem, getMeasureX };
};
```

---

## Tie Splitting Logic

When rendering ties, detect if a tie crosses a system break:

```typescript
// In the tie rendering logic
const isTieCrossesSystemBreak = (
  startMeasure: number,
  endMeasure: number,
  pageLayout: PageLayout
): boolean => {
  const startSystem = getSystemForMeasure(startMeasure, pageLayout);
  const endSystem = getSystemForMeasure(endMeasure, pageLayout);
  return startSystem?.index !== endSystem?.index;
};

// When a tie crosses:
// 1. Render "start" arc from note to right edge on first system
// 2. Render "end" arc from left edge to note on second system
```

---

## CSS Updates

Add to `src/styles/theme.css`:

```css
/* Page view variables */
:root {
  --riff-page-bg: #f5f5f5;
  --riff-page-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  --riff-page-border: 1px solid #ddd;
  --riff-system-gap-normal: 2.0;
  --riff-first-system-indent: 15%;
  --riff-measure-number-size: 10px;
  --riff-measure-number-color: #666;
}
```

Add styles for new components:

```css
.riff-page-boundary {
  filter: drop-shadow(var(--riff-page-shadow));
}

.riff-system {
  /* System group */
}

.riff-measure-number {
  font-size: var(--riff-measure-number-size);
  fill: var(--riff-measure-number-color);
  font-family: var(--riff-font-sans);
}

.riff-barline--system {
  stroke: var(--riff-staff-line-color);
  stroke-width: 1;
}
```

---

## Coding Standards

### Layer Hierarchy
- Components use hooks for state
- Hooks use services for calculations
- Services are pure functions

### Forward-Flow Y (ADR-015)
- Y positions calculated top-to-bottom
- Each system's Y depends on previous system's height + spacing

### Measure-Relative X (ADR-016)
- X positions are relative to measure origin
- System controls measure origin X offset

### CSS Conventions
- Namespace: `.riff-` prefix
- BEM: `.riff-Block__element--modifier`
- Variables: `--riff-*`

---

## Parallelization Strategy

### Parallel Research (3 subagents)
1. **Canvas Agent:** Read ScoreCanvas.tsx to understand current rendering structure
2. **Staff Agent:** Read Staff.tsx for clef/key rendering logic
3. **Tie Agent:** Read Tie.tsx for current tie rendering

### Parallel Implementation (3 subagents)
After research:
1. **Layout Agent:** Create usePageLayout.ts hook and PageBoundary.tsx
2. **Staff Agent:** Update Staff.tsx, create MeasureNumber.tsx, update Barline.tsx
3. **Tie Agent:** Update Tie.tsx for system break handling

### Sequential Integration (Executor)
1. Update ScoreCanvas.tsx to use new hook and components
2. Add CSS updates

### Parallel Testing (2 subagents)
1. **Hook Tests Agent:** Write tests for usePageLayout
2. **Component Tests Agent:** Write rendering tests

### Final Step (Executor)
Run `npm run test` and visual verification in demo app.

---

## Acceptance Criteria

- [ ] `usePageLayout.ts` hook created
- [ ] `ScoreCanvas.tsx` renders multiple systems in page view
- [ ] `Staff.tsx` renders clef/key on every system
- [ ] `MeasureNumber.tsx` created and integrated
- [ ] `Barline.tsx` extends across staves
- [ ] `Tie.tsx` handles system breaks
- [ ] `PageBoundary.tsx` created
- [ ] First system indented correctly (~15%)
- [ ] Final system ragged when <60% full
- [ ] CSS variables and styles added
- [ ] All tests pass

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/hooks/layout/usePageLayout.ts` | Create |
| `src/components/Canvas/ScoreCanvas.tsx` | Modify |
| `src/components/Canvas/Staff.tsx` | Modify |
| `src/components/Canvas/MeasureNumber.tsx` | Create |
| `src/components/Canvas/Barline.tsx` | Modify |
| `src/components/Canvas/Tie.tsx` | Modify |
| `src/components/Canvas/PageBoundary.tsx` | Create |
| `src/styles/theme.css` | Modify |
| `src/__tests__/hooks/usePageLayout.test.ts` | Create |

---

## Test Cases

### usePageLayout
- Returns empty systems when in scroll view
- Calculates correct number of systems based on content
- First system has correct indent
- getSystem returns correct system for measure

### Tie Splitting
- Normal ties render correctly (no split)
- Ties crossing system breaks render two arcs
- Start arc extends to right edge
- End arc extends from left edge

### Measure Numbers
- Measure numbers appear at system start
- Numbers positioned above top staff
- First measure of each system shows number

---

## User Walkthrough & Manual Testing

After implementation, verify the following manually:

### 1. Run Tests
```bash
npm run test
npm run lint
```

### 2. Start Demo App
```bash
npm run demo:dev
```

### 3. Visual Verification in Page View

Switch to page view via console:
```javascript
const api = window.riffScore.get('demo');
api.setViewMode('page');
```

**Verify:**
- [ ] Score renders across multiple systems (not one horizontal line)
- [ ] First system is indented (~15% from left)
- [ ] Each system shows clef and key signature at start
- [ ] Time signature appears only on first system
- [ ] Barlines extend across all staves (grand staff)
- [ ] Measure numbers appear at start of each system
- [ ] Final system is ragged (not justified) if less than 60% full

### 4. Test Tie Splitting

Create a score with ties crossing measure boundaries:
1. Add notes that tie across where a system break will occur
2. Switch to page view
3. Verify tie arc appears at end of first system
4. Verify continuation arc appears at start of next system

### 5. Test Page Boundary

- [ ] Page outline/boundary is visible in page view
- [ ] Content fits within margins
- [ ] Page dimensions match Letter/A4 settings

### 6. Test Layout Changes

```javascript
api.setLayoutConfig({ staffSize: 80 });
// Systems should reflow (fewer measures per system)

api.setLayoutConfig({ staffSize: 120 });
// Systems should reflow (more measures per system)

api.setLayoutConfig({ pageSize: 'a4' });
// Page dimensions should change
```

---

## Phase Completion & Recalibration

### Before Moving to Phase 4

After completing Phase 3:

1. **Verify visual correctness**
   - Systems break at logical points
   - No overlapping elements
   - Ties render correctly at breaks

2. **Performance check**
   - Create a 100-measure score
   - Switch to page view
   - Verify no scroll jank

3. **Document rendering quirks**
   - Any edge cases with clef rendering?
   - Key signature positioning issues?
   - Barline alignment problems?

4. **Review Phase 4 prompt**
   - Does Score Setup dialog need access to page layout state?
   - Are there display issues that affect dialog preview?

### Recalibration Checklist

- [ ] All tests pass
- [ ] Visual rendering correct in demo app
- [ ] Tie splitting works at system breaks
- [ ] Measure numbers display correctly
- [ ] Performance acceptable for large scores
- [ ] Phase 4 prompt reviewed and updated if needed

### Commit Template

```bash
git add src/hooks/layout/usePageLayout.ts src/components/Canvas/
git commit -m "feat(#174): implement multi-system rendering for page view

- Create usePageLayout hook for system break calculation
- Update ScoreCanvas for multi-system rendering
- Add MeasureNumber component for system-start numbers
- Update Staff to render clef/key on every system
- Update Tie for system break splitting
- Update Barline for cross-staff rendering
- Add PageBoundary component

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Notes for Subsequent Phases

After this phase:
- Page view renders correctly with multiple systems
- `usePageLayout` hook provides system layout data
- Tie splitting handles cross-system ties
- Foundation ready for Phase 4 (Score Setup Dialog)
