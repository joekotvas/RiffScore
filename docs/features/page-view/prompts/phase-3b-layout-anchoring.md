# Phase 3b: Layout Anchoring & Margin Correctness

**Issue:** [#174](https://github.com/joekotvas/riffscore/issues/174)
**Estimated Effort:** 1-2 days
**Dependencies:** Phase 3 (Multi-System Rendering)

---

## Objective

Fix the positioning issues in page view where content ignores page margins and indentation. Implement a proper anchoring system where each layout element is positioned relative to its logical parent anchor.

---

## Current Problems

From visual verification of Phase 3:

1. **Measures flush with left edge** - Staff content renders at X=0 instead of respecting `marginLeft + systemXOffset`
2. **Title flush with top-left** - Metadata renders without margin offsets
3. **No system-relative measure rendering** - All measures render, not just measures for each system
4. **Missing content area abstraction** - No unified concept of the drawable area within margins

---

## Design: Semantic Anchor System

### Anchor Hierarchy

```
Page (0,0)
└── ContentArea (marginLeft, marginTop, contentWidth, contentHeight)
    ├── MetadataBlock (anchored to contentArea top-left)
    │   ├── Title (centered horizontally in contentArea)
    │   └── Composer (centered below title)
    ├── Systems (flow vertically from metadataBottom)
    │   ├── System 0 (first, indented)
    │   │   ├── MeasureNumber (system.x, above staff)
    │   │   ├── Bracket (system.x - 20)
    │   │   ├── Header (clef, key, time at system.x)
    │   │   └── Measures (anchored after header, within system bounds)
    │   ├── System 1...N (not indented)
    │   │   └── (same structure, no time signature)
    └── Footer (anchored to contentArea bottom)
        └── PageNumber (centered or right-aligned)
```

### Key Principle

Each element receives its **absolute position** from its parent anchor, not from a global origin. This makes the layout composable and testable.

---

## Data Model Changes

### Enhanced PageLayout

```typescript
// In src/types.ts - extend PageLayout

export interface ContentArea {
  /** Absolute X of content start (after left margin) */
  x: number;
  /** Absolute Y of content start (after top margin) */
  y: number;
  /** Width of content area (page width - left - right margins) */
  width: number;
  /** Height of content area (page height - top - bottom margins) */
  height: number;
}

export interface MetadataLayout {
  /** Title text and position */
  title: { text: string; x: number; y: number } | null;
  /** Composer text and position */
  composer: { text: string; x: number; y: number } | null;
  /** Y position where metadata ends (systems start below this) */
  bottom: number;
}

export interface FooterLayout {
  /** Y position of footer top */
  y: number;
  /** Page number position */
  pageNumber: { text: string; x: number; y: number };
}

export interface PageLayout {
  // Existing fields
  systems: SystemLayout[];
  pageSize: 'letter' | 'a4';
  dimensions: { width: number; height: number };
  margins: LayoutConfig['margins'];
  contentWidth: number;
  firstSystemIndent: number;
  staffScale: number;

  // NEW: Anchor areas
  contentArea: ContentArea;
  metadata: MetadataLayout;
  footer: FooterLayout;

  // NEW: Pixel margin values (computed from preset)
  marginsPx: { top: number; right: number; bottom: number; left: number };
}
```

### Enhanced SystemLayout

```typescript
export interface SystemLayout {
  // Existing fields
  index: number;
  measures: number[];
  y: number;
  height: number;
  xOffset: number;  // Renamed semantically to systemX
  contentWidth: number;
  isFirst: boolean;
  isLast: boolean;
  justification: number;

  // NEW: Computed measure positions within this system
  measurePositions: {
    measureIndex: number;
    /** Absolute X of measure start */
    x: number;
    /** Computed width (may be stretched for justification) */
    width: number;
  }[];
}
```

---

## Implementation Details

### 1. Update PageLayoutService

Add content area and metadata layout calculation:

```typescript
// In PageLayoutService.ts

export const calculatePageLayout = (
  score: Score,
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG
): PageLayout => {
  // ... existing dimension calculations ...

  // Compute pixel margins
  const marginsPx = {
    top: mmToPx(margins.top),
    right: mmToPx(margins.right),
    bottom: mmToPx(margins.bottom),
    left: mmToPx(margins.left),
  };

  // Content area (the drawable region within margins)
  const contentArea: ContentArea = {
    x: marginsPx.left,
    y: marginsPx.top,
    width: pageWidth - marginsPx.left - marginsPx.right,
    height: pageHeight - marginsPx.top - marginsPx.bottom,
  };

  // Metadata layout
  const metadata = calculateMetadataLayout(score.metadata, contentArea, staffScale);

  // Footer layout (for page numbers)
  const footer = calculateFooterLayout(contentArea, marginsPx.bottom);

  // Systems start after metadata
  const systemsStartY = metadata.bottom;
  const systemsEndY = footer.y; // Systems cannot overlap footer

  // ... system calculation, using systemsStartY as starting point ...

  // For each system, calculate measure positions
  for (const system of systems) {
    system.measurePositions = calculateMeasurePositions(
      system,
      measureWidths,
      contentArea.x  // Base X from content area
    );
  }

  return {
    // ... existing fields ...
    contentArea,
    metadata,
    footer,
    marginsPx,
  };
};

/**
 * Calculate metadata (title, composer) layout.
 */
const calculateMetadataLayout = (
  metadata: ScoreMetadata | undefined,
  contentArea: ContentArea,
  staffScale: number
): MetadataLayout => {
  if (!metadata?.title) {
    return {
      title: null,
      composer: null,
      bottom: contentArea.y,  // No metadata, systems start at content top
    };
  }

  const titleY = contentArea.y + METADATA_TYPOGRAPHY.titleHeight;
  const titleX = contentArea.x + contentArea.width / 2;  // Centered

  let currentY = titleY + METADATA_TYPOGRAPHY.titleHeight;
  let composer = null;

  if (metadata.composer) {
    currentY += METADATA_TYPOGRAPHY.composerHeight;
    composer = {
      text: metadata.composer,
      x: titleX,  // Centered below title
      y: currentY - METADATA_TYPOGRAPHY.composerHeight / 2,
    };
  }

  return {
    title: { text: metadata.title, x: titleX, y: titleY },
    composer,
    bottom: currentY + METADATA_TYPOGRAPHY.blockSpacing,
  };
};

/**
 * Calculate measure positions within a system.
 */
const calculateMeasurePositions = (
  system: SystemLayout,
  measureWidths: number[],
  contentX: number
): SystemLayout['measurePositions'] => {
  const positions: SystemLayout['measurePositions'] = [];

  // Start at system's X offset (includes content area X + indent)
  let currentX = system.xOffset;

  // Calculate natural total width
  const naturalWidth = system.measures.reduce(
    (sum, idx) => sum + (measureWidths[idx] ?? 0),
    0
  );

  // Stretch factor for justified systems
  const stretchFactor = system.justification === 1.0 && naturalWidth > 0
    ? system.contentWidth / naturalWidth
    : 1.0;

  for (const measureIndex of system.measures) {
    const naturalMeasureWidth = measureWidths[measureIndex] ?? 0;
    const width = naturalMeasureWidth * stretchFactor;

    positions.push({
      measureIndex,
      x: currentX,
      width,
    });

    currentX += width;
  }

  return positions;
};
```

### 2. Update ScoreCanvas Page View Rendering

Use the new anchor-based layout:

```typescript
// In ScoreCanvas.tsx - page view rendering

{isPageView && (
  <g className="riff-page-view">
    <PageBoundary pageLayout={pageLayout} />

    {/* Metadata (Title, Composer) */}
    {pageLayout.metadata.title && (
      <MetadataBlock metadata={pageLayout.metadata} />
    )}

    {/* Systems */}
    {pageLayout.systems.map((system) => (
      <g
        key={`system-${system.index}`}
        className="riff-system"
        // Note: NO transform - positions are absolute
      >
        {/* Measure number */}
        <MeasureNumber
          measureIndex={system.measures[0]}
          x={system.xOffset}
          y={system.y}
          staffScale={pageLayout.staffScale}
        />

        {/* Grand staff bracket */}
        {score.staves?.length > 1 && (
          <GrandStaffBracket
            topY={system.y}
            bottomY={system.y + system.height}
            x={system.xOffset - 20}
          />
        )}

        {/* System content (header + measures) */}
        <SystemContent
          system={system}
          score={score}
          staffScale={pageLayout.staffScale}
          layout={layout}
          interaction={interactionState}
          callbacks={callbacks}
        />
      </g>
    ))}

    {/* Footer (page number) */}
    <PageFooter footer={pageLayout.footer} />
  </g>
)}
```

### 3. New SystemContent Component

Extract system rendering to a focused component:

```typescript
// src/components/Canvas/SystemContent.tsx

interface SystemContentProps {
  system: SystemLayout;
  score: Score;
  staffScale: number;
  layout: ScoreLayout;
  interaction: InteractionState;
  callbacks: SystemCallbacks;
}

export const SystemContent: React.FC<SystemContentProps> = ({
  system,
  score,
  staffScale,
  layout,
  interaction,
  callbacks,
}) => {
  return (
    <g className="riff-system__content">
      {score.staves.map((staff, staffIndex) => {
        const staffY = system.y + staffIndex * CONFIG.staffSpacing * staffScale;

        return (
          <g key={staff.id || staffIndex}>
            {/* Score header (clef, key sig, time sig) */}
            <ScoreHeader
              clef={staff.clef || (staffIndex === 0 ? 'treble' : 'bass')}
              keySignature={staff.keySignature || score.keySignature}
              timeSignature={score.timeSignature}
              x={system.xOffset}
              y={staffY}
              showTimeSignature={system.isFirst}
              scale={staffScale}
            />

            {/* Staff lines */}
            <StaffLines
              x={system.xOffset}
              y={staffY}
              width={system.contentWidth}
              scale={staffScale}
            />

            {/* Measures for this system only */}
            {system.measurePositions.map(({ measureIndex, x, width }) => {
              const measure = staff.measures[measureIndex];
              if (!measure) return null;

              return (
                <Measure
                  key={`m${measureIndex}-s${staffIndex}`}
                  measureIndex={measureIndex}
                  measure={measure}
                  x={x}
                  y={staffY}
                  width={width}
                  staffIndex={staffIndex}
                  clef={staff.clef}
                  keySignature={staff.keySignature}
                  scale={staffScale}
                  interaction={interaction}
                  callbacks={callbacks}
                />
              );
            })}
          </g>
        );
      })}
    </g>
  );
};
```

### 4. MetadataBlock Component

```typescript
// src/components/Canvas/MetadataBlock.tsx

interface MetadataBlockProps {
  metadata: MetadataLayout;
}

export const MetadataBlock: React.FC<MetadataBlockProps> = ({ metadata }) => {
  return (
    <g className="riff-metadata">
      {metadata.title && (
        <text
          x={metadata.title.x}
          y={metadata.title.y}
          textAnchor="middle"
          className="riff-metadata__title"
        >
          {metadata.title.text}
        </text>
      )}
      {metadata.composer && (
        <text
          x={metadata.composer.x}
          y={metadata.composer.y}
          textAnchor="middle"
          className="riff-metadata__composer"
        >
          {metadata.composer.text}
        </text>
      )}
    </g>
  );
};
```

### 5. CSS Updates

```css
/* In theme.css */

.riff-metadata__title {
  font-size: var(--riff-font-size-2xl);
  font-family: var(--riff-font-serif);
  font-weight: var(--riff-font-weight-bold);
  fill: var(--riff-color-text);
}

.riff-metadata__composer {
  font-size: var(--riff-font-size-lg);
  font-family: var(--riff-font-serif);
  font-style: italic;
  fill: var(--riff-color-text-secondary);
}

.riff-footer__page-number {
  font-size: var(--riff-font-size-sm);
  font-family: var(--riff-font-sans);
  fill: var(--riff-color-text-secondary);
}
```

---

## Key Architecture Decisions

### 1. Absolute Positioning

Instead of using nested `transform` groups, we use absolute coordinates calculated by PageLayoutService. This makes:
- Hit detection simpler (no transform chain to walk)
- Testing easier (positions can be verified directly)
- Debugging straightforward (inspect element shows actual position)

### 2. Pre-computed Measure Positions

Each system pre-computes its `measurePositions` array with absolute X coordinates and stretched widths. This:
- Eliminates runtime justification calculation in render
- Makes measure lookup O(1) via the array
- Enables easy hit detection

### 3. Anchor Chain

```
ContentArea.x → System.xOffset → MeasurePosition.x
ContentArea.y → Metadata.bottom → System.y → Staff.y
```

Each level adds its offset to the parent anchor, creating traceable positioning.

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/types.ts` | Extend PageLayout, SystemLayout types |
| `src/services/PageLayoutService.ts` | Add anchor calculations |
| `src/components/Canvas/ScoreCanvas.tsx` | Use anchor-based rendering |
| `src/components/Canvas/SystemContent.tsx` | Create (system rendering) |
| `src/components/Canvas/MetadataBlock.tsx` | Create (title/composer) |
| `src/components/Canvas/PageFooter.tsx` | Create (page numbers) |
| `src/components/Canvas/MeasureNumber.tsx` | Update props (absolute Y) |
| `src/styles/theme.css` | Add metadata/footer styles |
| `src/__tests__/services/PageLayoutService.test.ts` | Add anchor tests |

---

## Acceptance Criteria

- [ ] Measures respect left margin and first system indent
- [ ] Title centered horizontally within content area
- [ ] Title positioned below top margin
- [ ] Composer positioned below title
- [ ] Systems flow vertically from metadata bottom
- [ ] Each system only renders its own measures
- [ ] Measure numbers use absolute positioning
- [ ] Grand staff brackets use absolute positioning
- [ ] Page footer shows page number (centered or right-aligned)
- [ ] All existing tests pass
- [ ] New anchor tests pass

---

## Test Cases

### ContentArea Calculation

```typescript
it('calculates content area from margins', () => {
  const layout = calculatePageLayout(score, { margins: 'normal', ... });

  // Normal margins are 19mm = ~72px at 96 DPI
  expect(layout.contentArea.x).toBeCloseTo(72, 0);
  expect(layout.contentArea.y).toBeCloseTo(72, 0);
  expect(layout.contentArea.width).toBeCloseTo(layout.dimensions.width - 144, 0);
});
```

### Metadata Layout

```typescript
it('positions title centered in content area', () => {
  const score = { metadata: { title: 'Test Title' }, ... };
  const layout = calculatePageLayout(score, config);

  expect(layout.metadata.title.x).toBe(
    layout.contentArea.x + layout.contentArea.width / 2
  );
  expect(layout.metadata.title.y).toBeGreaterThan(layout.contentArea.y);
});
```

### System Positioning

```typescript
it('first system starts at metadata bottom', () => {
  const layout = calculatePageLayout(score, config);

  expect(layout.systems[0].y).toBeCloseTo(layout.metadata.bottom, 1);
});

it('first system has correct X offset (margin + indent)', () => {
  const layout = calculatePageLayout(score, config);
  const system0 = layout.systems[0];

  // xOffset should be: contentArea.x + headerWidth + indent
  expect(system0.xOffset).toBeGreaterThan(layout.contentArea.x);
});
```

### Measure Positions

```typescript
it('calculates measure positions within system', () => {
  const layout = calculatePageLayout(score, config);
  const system = layout.systems[0];

  // First measure starts at system xOffset
  expect(system.measurePositions[0].x).toBe(system.xOffset);

  // Second measure starts after first
  expect(system.measurePositions[1].x).toBe(
    system.measurePositions[0].x + system.measurePositions[0].width
  );
});
```

---

## User Walkthrough & Manual Testing

### 1. Run Tests
```bash
npm run test
npm run lint
```

### 2. Visual Verification

```javascript
const api = window.riffScore.get('demo');
api.setViewMode('page');
api.setMetadata({ title: 'Test Score', composer: 'Test Composer' });
```

**Verify:**
- [ ] Title is centered horizontally on the page
- [ ] Title has visible top margin (not flush with page edge)
- [ ] Composer is centered below title
- [ ] First system is indented from left margin
- [ ] Subsequent systems align with left margin
- [ ] Measures fill the system width (justified)
- [ ] Last system is ragged if sparse
- [ ] Page number appears in footer

### 3. Margin Testing

```javascript
api.setLayoutConfig({ margins: 'narrow' });
// Content should move closer to edges

api.setLayoutConfig({ margins: 'wide' });
// Content should have more padding
```

---

## Commit Template

```bash
git add src/types.ts src/services/PageLayoutService.ts src/components/Canvas/
git commit -m "fix(#174): implement anchor-based layout for page view margins

- Extend PageLayout with contentArea, metadata, footer anchors
- Pre-compute measure positions in SystemLayout
- Create MetadataBlock component for title/composer
- Create SystemContent component for system rendering
- Create PageFooter component for page numbers
- Fix margin and indentation positioning
- All positions now use absolute coordinates

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Notes for Subsequent Phases

After this phase:
- All page view elements properly respect margins
- Measure positions are pre-computed for hit detection
- Footer anchoring establishes multi-page pagination foundation
- Phase 7 (Metadata Rendering) can build on MetadataBlock component
