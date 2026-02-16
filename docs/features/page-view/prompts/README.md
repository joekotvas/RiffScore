# Page View Implementation Prompts

**Issue:** [#174](https://github.com/joekotvas/riffscore/issues/174)

This directory contains agent prompt documents for implementing the Page View & Print feature. Each phase is designed to be executed by an AI agent with subagents for parallelization.

---

## Implementation Status

| Phase | Status | Commits | Notes |
|-------|--------|---------|-------|
| 0 | ✅ Complete | `ef0a604`, `c553ed6`, `bf3b70d`, `3bc059d`, `16b8f13` | API standardized to 0-based indexing |
| 1 | ✅ Complete | `1d001d8` | Types, config, and services for page view |
| 2 | ✅ Complete | `59144e7` | Layout and metadata commands + API |
| 3 | ✅ Complete | `b797d2e`, `07a7734` | Multi-system rendering for page view |
| 3b | ✅ Complete | `1d4289b`, `de56514`, `4e42dc6` | Anchor-based layout + fixes |
| 4 | ✅ Complete | `1c6a1ae`, `edc471f` | Score Setup dialog with live preview |
| 5 | ✅ Complete | `607fe24` | ViewToggle toolbar control |
| 6 | ✅ Complete | `607fe24` | Print support with @media print |
| 7 | ✅ Complete | `607fe24` | MetadataTrack inline editing |
| 7b | ✅ Complete | `57e30bc` | Multi-page pagination |
| 8 | ✅ Complete | `fe9264a` | ABC + MusicXML metadata export |
| 9 | ✅ Complete | `e0de1a6`, `2ca0447` | Documentation updates |

**Last Updated:** 2026-02-15

---

## Phase 0 Completion Notes

Phase 0 established the 0-based indexing convention throughout the codebase:

### Deliverables
- **`src/utils/measureIndex.ts`** - Conversion utilities (`toDisplayMeasureNumber`, `toInternalMeasureIndex`, `isValidMeasureIndex`, `clampMeasureIndex`)
- **JSDoc documentation** - All measure-related types now document 0-based convention
- **API standardization** - All API methods use 0-based indices consistently

### Breaking Change
The API now uses 0-based measure indices:
- `select(0)` = first measure (was `select(1)`)
- `select(1)` = second measure (was `select(2)`)

See [CHANGELOG.md](../../../../CHANGELOG.md) for migration details.

### Test Results
- 1227 tests passing
- All documentation updated

---

## Phase 1 Completion Notes

Phase 1 established the foundation types and services for page view:

### Deliverables
- **`src/types.ts`** - Extended with `ScoreMetadata`, `LayoutConfig`, `SystemLayout`, `PageLayout` types
- **`src/config.ts`** - Added layout defaults (`DEFAULT_LAYOUT_CONFIG`, `MARGIN_PRESETS`, `PAGE_DIMENSIONS`, `SYSTEM_SPACING_MULTIPLIERS`)
- **`src/services/PageLayoutService.ts`** - System break algorithm, measure width calculation, justification logic
- **`src/services/MetadataService.ts`** - Validation and normalization following ADR-011 structured feedback

### Key APIs Now Available
```typescript
// PageLayoutService
calculatePageLayout(score, config) → PageLayout
calculateSystemBreaks(measureWidths, contentWidth, indent) → number[][]
getSystemForMeasure(measureIndex, layout) → number
getMeasureOriginInSystem(measureIndex, layout, widths) → { x, systemIndex }

// MetadataService
validateMetadata(metadata) → { ok, errors }
normalizeMetadata(metadata) → ScoreMetadata
```

### Test Results
- 1325 tests passing (98 new tests)
- PageLayoutService: 97.74% statements, 87.14% branches
- MetadataService: 100% statements, 97.77% branches

---

## Phase 2 Completion Notes

Phase 2 added command pattern infrastructure and API factories:

### Deliverables
- **`src/commands/layout/`** - SetViewModeCommand, SetLayoutConfigCommand, SetMetadataCommand
- **`src/hooks/api/layout.ts`** - Layout API factory (getViewMode, setViewMode, toggleViewMode, etc.)
- **`src/hooks/api/metadata.ts`** - Metadata API factory + navigation helpers
- **`src/api.types.ts`** - Extended with 18 new method signatures

### Key APIs Now Available
```typescript
// Layout API
api.getViewMode() → 'scroll' | 'page'
api.setViewMode(mode) → this
api.toggleViewMode() → this
api.getLayoutConfig() → LayoutConfig
api.setLayoutConfig(config) → this

// Metadata API
api.getMetadata() → ScoreMetadata
api.setMetadata(metadata) → this
api.getTitle() / api.setTitle(title)
api.getComposer() / api.setComposer(composer)

// Navigation (for Tab from metadata)
api.selectFirstElement() → this
api.selectLastElement() → this
```

### Test Results
- 1362 tests passing (37 new tests)
- All commands support undo/redo

---

## Phase 3 Completion Notes

Phase 3 implemented multi-system rendering infrastructure for page view:

### Deliverables
- **`src/hooks/layout/usePageLayout.ts`** - Core hook for page view layout calculations, consumes PageLayoutService
- **`src/components/Canvas/PageBoundary.tsx`** - Renders page outline with drop shadow in page view
- **`src/components/Canvas/MeasureNumber.tsx`** - Renders measure numbers at system starts (0-based to 1-based conversion)
- **`src/components/Canvas/Staff.tsx`** - Extended with `isSystemStart` and `systemIndex` props for per-system rendering
- **`src/components/Canvas/ScoreHeader.tsx`** - Extended with `showTimeSignature` prop (only first system shows time signature)
- **`src/components/Canvas/Tie.tsx`** - Extended with system break splitting props (`crossesSystemBreak`, `isStartOfTie`, `isEndOfTie`)
- **`src/components/Canvas/ScoreCanvas.tsx`** - Conditional rendering for page view vs scroll view
- **`src/styles/theme.css`** - Page view CSS variables and component styles

### Key APIs Now Available
```typescript
// usePageLayout hook
const {
  pageLayout,      // PageLayout with dimensions, systems, staffScale
  viewMode,        // 'scroll' | 'page'
  isPageView,      // boolean
  getSystem,       // (measureIndex) => SystemLayout | null
  getMeasureX,     // (measureIndex) => number | null
  measureWidths,   // number[]
} = usePageLayout();

// MeasureNumber component
<MeasureNumber measureIndex={0} x={80} y={100} staffScale={1.0} />

// PageBoundary component
<PageBoundary pageLayout={pageLayout} />

// Staff component (new props)
<Staff isSystemStart={true} systemIndex={0} ... />

// Tie component (new props)
<Tie crossesSystemBreak={true} isStartOfTie={true} ... />
```

### Test Results
- 1407 tests passing (45 new tests since Phase 2)
- 13 new tests for usePageLayout hook
- All lint checks passing

---

## Phase 4 Completion Notes

Phase 4 implemented the Score Setup dialog for editing metadata and layout configuration:

### Deliverables
- **`src/hooks/layout/useScoreSetup.ts`** - Dialog state hook with transaction-based batch undo on cancel
- **`src/components/Dialog/ScoreSetupDialog/ScoreSetupDialog.tsx`** - Main dialog component with live preview
- **`src/components/Dialog/ScoreSetupDialog/MetadataSection.tsx`** - Metadata form fields (title, composer, lyricist, copyright)
- **`src/components/Dialog/ScoreSetupDialog/LayoutSection.tsx`** - Layout controls (page size, margins, staff size, spacing)
- **`src/components/Dialog/ScoreSetupDialog/ScoreSetupDialog.css`** - BEM-styled dialog CSS with `--riff-*` variables
- **`src/components/Dialog/ScoreSetupDialog/index.ts`** - Barrel export

### Key Features
- **Live preview**: Changes apply immediately via `SetMetadataCommand` and `SetLayoutConfigCommand`
- **Batch undo on cancel**: Uses `beginTransaction()`/`rollbackTransaction()` for clean rollback
- **Accessibility**: Focus trapping, `aria-modal`, `aria-labelledby`, `aria-required`/`aria-invalid`
- **Keyboard support**: Escape to cancel, Enter (outside text fields) to save
- **Validation**: Title required, errors displayed with `role="alert"`

### Key APIs Now Available
```typescript
// useScoreSetup hook
const { isOpen, open, save, cancel, toggle } = useScoreSetup();

// ScoreSetupDialog component
<ScoreSetupDialog isOpen={isOpen} onSave={save} onCancel={cancel} />
```

### Test Results
- 1407 tests passing (32 new tests for Phase 4)
- All lint checks passing

---

## Phase 3b Completion Notes

Phase 3b fixed margin/positioning issues identified during visual verification:

### Issues Fixed
- Measures were flush with left edge (ignoring margins)
- Title was flush with top-left (no margin offset)
- Staff content didn't use system X offset

### Deliverables
- **`src/types.ts`** - Added `ContentArea`, `MetadataLayout`, `FooterLayout`, `MarginsPx`, `MeasurePosition` interfaces
- **`src/services/PageLayoutService.ts`** - Added anchor layout calculations
- **`src/components/Canvas/MetadataBlock.tsx`** - Title/composer rendering (created)
- **`src/components/Canvas/PageFooter.tsx`** - Page number rendering (created)
- **`src/components/Canvas/ScoreCanvas.tsx`** - Anchor-based page view rendering
- **`src/styles/theme.css`** - Metadata and footer CSS styles
- **`src/config.ts`** - Added `titleSpacing` to METADATA_TYPOGRAPHY

### Key Architecture
```
Page (0,0)
└── ContentArea (marginLeft, marginTop)
    ├── MetadataBlock (title/composer, centered)
    ├── Systems (flow from metadata.bottom)
    │   └── measurePositions[] (pre-computed absolute X)
    └── Footer (page number at bottom)
```

### Test Results
- 1431 tests passing (24 new since Phase 4)
- All lint checks passing

### Additional Fixes (2026-02-14)

Further refinements to page view rendering:

**Title Unification**
- Removed external HTML `ScoreTitleField` from `ScoreEditor.tsx`
- Title now renders inside SVG canvas in both scroll and page view
- Scroll view title left-aligned with score start (`x=0`, `textAnchor="start"`)
- `PageLayoutService.ts` falls back to `score.title` when `score.metadata` is undefined
- Deleted `ScoreTitleField.tsx` and `ScoreTitleField.css` (dead code cleanup)

**Layout Improvements**
- Increased `METADATA_TYPOGRAPHY.blockSpacing` from 20px to 40px for better visual separation
- Grand staff bracket X position now accounts for first system indent
- Fixed bracket height formula to correctly span treble top line to bass bottom line

**Page View Interaction Fixes**
- Added `measureIndices` prop to `Staff.tsx` for correct measure index mapping in page view
- Added `isLastSystem` prop to `Staff.tsx` - final barline only renders on actual last measure
- Fixed layout lookup to use `actualMeasureIndex` instead of local array index

**Files Modified**
- `src/components/Canvas/ScoreCanvas.tsx` - Scroll view title, page view bracket/barline fixes
- `src/components/Canvas/Staff.tsx` - `measureIndices`, `isLastSystem` props, layout lookup fix
- `src/components/Layout/ScoreEditor.tsx` - Removed ScoreTitleField usage
- `src/services/PageLayoutService.ts` - Metadata fallback to score.title
- `src/config.ts` - Increased blockSpacing
- `src/hooks/layout/useFontLoaded.ts` - Removed dead ScoreTitleField CSS
- `src/styles/index.css` - Removed ScoreTitleField.css import

---

## Phase 8 Completion Notes

Phase 8 added metadata export to ABC and MusicXML formats:

### Deliverables
- **`src/exporters/abcExporter.ts`** - Added metadata fields (T:, C:, Z:, N:)
- **`src/exporters/musicXmlExporter.ts`** - Added work/identification elements, XML escaping, MusicXML 4.0
- **`src/__tests__/exporters/abcExporter.test.ts`** - 8 new metadata tests
- **`src/__tests__/exporters/musicXmlExporter.test.ts`** - 15 new metadata tests

### ABC Export Fields
```abc
X:1
T:Score Title
C:Composer Name
Z:Lyricist: Lyricist Name
N:Copyright notice
M:4/4
```

### MusicXML Export Structure
```xml
<work>
  <work-title>Score Title</work-title>
</work>
<identification>
  <creator type="composer">Composer Name</creator>
  <creator type="lyricist">Lyricist Name</creator>
  <rights>Copyright notice</rights>
  <encoding>
    <software>RiffScore</software>
    <encoding-date>2026-02-14</encoding-date>
  </encoding>
</identification>
```

### Key Features
- XML character escaping (&, <, >, ", ')
- Optional fields omitted when empty
- Legacy `score.title` fallback when `score.metadata` is undefined
- MusicXML upgraded to version 4.0

### Test Results
- 1431 tests passing (23 new exporter tests)
- All lint checks passing

---

## Phase 5 Completion Notes

Phase 5 added the toolbar view toggle control:

### Deliverables
- **`src/components/Toolbar/ViewToggle.tsx`** - Toggle button for scroll/page view modes
- **`src/components/Toolbar/ViewToggle.css`** - BEM-styled button with icon states
- **`src/__tests__/components/Toolbar/ViewToggle.test.tsx`** - 8 unit tests

### Key Features
- Icon switches between scroll (horizontal lines) and page (document) icons
- Tooltip shows current mode and keyboard shortcut (`Cmd+\`)
- Integrates with `useScoreAPI().toggleViewMode()`

### Test Results
- 1528 tests passing
- All lint checks passing

---

## Phase 6 Completion Notes

Phase 6 added print support with proper CSS media queries:

### Deliverables
- **`src/styles/theme.css`** - `@media print` rules for page view
- **`src/components/Layout/ScoreEditor.tsx`** - `usePrintHandler` hook for Cmd+P
- **`src/hooks/layout/usePrintHandler.ts`** - Print preparation with style settling

### Key Features
- Print only shows SVG canvas (hides toolbar, sidebars)
- Automatic view mode switch to page view for printing
- 100ms style settling delay before `window.print()`
- CSS hides page shadows, borders for clean print output

### Test Results
- All existing tests pass
- Manual print verification successful

---

## Phase 7 Completion Notes

Phase 7 implemented inline metadata editing in page view:

### Deliverables
- **`src/components/Canvas/MetadataTrack.tsx`** - Title, composer, lyricist rendering with inline editing
- **`src/components/Canvas/MetadataField.tsx`** - Individual editable field component
- **`src/components/Canvas/PageFooter.tsx`** - Page number and copyright with inline editing
- **`src/hooks/layout/useMetadataTrack.ts`** - State management hook

### Key Features
- Click-to-edit with foreignObject text inputs
- Tab/Shift+Tab navigation between fields
- Cmd/Ctrl+Click for selection without editing
- Delete/Backspace to clear fields
- Escape to cancel, blur to commit
- Placeholder text for empty optional fields

### Interaction Flow
```
Title → Composer → Lyricist → [Tab exits to first note]
                            ← [Shift+Tab navigates back]
```

### Test Results
- All existing tests pass
- Manual verification of editing workflow

---

## Phase 7b Completion Notes (Multi-Page Pagination)

Phase 7b added true multi-page support with page breaks:

### Deliverables
- **`src/types.ts`** - Added `Page` interface, extended `PageLayout` with pagination fields
- **`src/config.ts`** - Added `PAGE_GAP` (24px), `FOOTER_HEIGHT` (40px) constants
- **`src/services/PageLayoutService.ts`** - Page distribution algorithm, `getPageForMeasure()`
- **`src/hooks/layout/usePageLayout.ts`** - Extended with `pageCount`, `getPage()`, `getPageForMeasure()`
- **`src/components/Canvas/ScoreCanvas.tsx`** - Multi-page rendering with `canvasY` offsets
- **`src/__tests__/services/PageLayoutService.test.ts`** - 23 new pagination tests

### Key Architecture
```typescript
interface Page {
  index: number;           // 0-based page index
  systems: SystemLayout[]; // Systems on this page (Y is page-relative)
  footer: FooterLayout;    // Footer for this page
  canvasY: number;         // Y offset in canvas
  isFirst: boolean;        // Shows metadata
  isLast: boolean;
}
```

### Page Distribution Algorithm
- Greedy fill: place systems until page height exceeded, then start new page
- Page 0 has less available height due to metadata block
- 24px visual gap between pages (like document viewers)
- Page-relative Y coordinates for simpler rendering

### Key APIs
```typescript
// PageLayoutService
getPageForMeasure(measureIndex, layout) → number
calculateAvailableContentHeight(pageIndex, contentArea, metadataBottom) → number
distributeSystemsToPages(systems, contentArea, ...) → { pageIndex, systems }[]

// usePageLayout hook
pageCount: number
getPage(pageIndex): Page | null
getPageForMeasure(measureIndex): number
```

### Test Results
- 70 PageLayoutService tests (all pass)
- 1528 total tests (all pass)

### Type Refactoring
- Moved `Config` interface to `types.ts` as `EditorConfig`
- Updated `SYSTEM_SPACING_MULTIPLIERS` (compact: 1, normal: 1.5, relaxed: 2)

---

## Phase 9 Completion Notes

Phase 9 completed documentation updates for the Page View & Print feature:

### Documentation Updated
- **`docs/AGENTS.md`** - Added page view to Quick Navigation, PageLayoutService/MetadataService/ChordService to Services, layout.ts/metadata.ts to API Modules, Page View Hooks section
- **`docs/API.md`** - Added Layout & View Mode section (8 methods), Metadata section (10 methods), bumped to v1.0.0-alpha.10
- **`README.md`** - Added Page View & Print feature section with keyboard shortcuts
- **`CHANGELOG.md`** - Added comprehensive release notes for #174

### Code Cleanup
- Removed unused `pageStartY` and `footer` variables from PageLayoutService.ts (lint warnings)
- Moved `Config` interface to `types.ts` as `EditorConfig` (type/config separation)

### Test Results
- 1528 tests passing
- All lint checks passing
- Build successful

### Feature Complete
Issue #174 is ready for final review and PR creation.

---

## Execution Model

Each prompt is designed for a **prompt executor** that:
- Can run Bash commands directly
- Can spawn subagents for parallel research and implementation
- Should follow parallelization strategies described in each phase
- **Makes atomic commits** at the end of each phase

**Important:** Subagents cannot run Bash commands. They can only read files, search code, and write code. The executor must run all Bash commands (tests, builds, git operations).

---

## Phase Overview

| Phase | Name | Effort | Dependencies |
|-------|------|--------|--------------|
| 0 | [Zero-Indexed Measures](./phase-0-zero-indexed-measures.md) | 1-2 days | None (prerequisite) |
| 1 | [Foundation & Data Model](./phase-1-foundation.md) | 2-3 days | Phase 0 |
| 2 | [Commands & API](./phase-2-commands-api.md) | 1-2 days | Phase 1 |
| 3 | [Multi-System Rendering](./phase-3-multi-system-rendering.md) | 3-4 days | Phases 1, 2 |
| 3b | [Layout Anchoring](./phase-3b-layout-anchoring.md) | 1-2 days | Phase 3 |
| 4 | [Score Setup Dialog](./phase-4-score-setup-dialog.md) | 2-3 days | Phase 2 |
| 5 | [Toolbar Controls](./phase-5-toolbar-controls.md) | 1 day | Phases 2, 4, 3b |
| 6 | [Print Support](./phase-6-print-support.md) | 2 days | Phase 3b |
| 7 | [Metadata Rendering](./phase-7-metadata-rendering.md) | 3-4 days | Phases 2, 3b |
| 8 | [Export Integration](./phase-8-export-integration.md) | 1 day | Phases 1, 2 |
| 9 | [Polish & Testing](./phase-9-polish-testing.md) | 2-3 days | All |

**Total Estimated Effort:** 19-27 days

---

## Dependency Graph

```
Phase 0 (Zero-Indexed Measures) ← PREREQUISITE
    │
    └─── Phase 1 (Foundation)
             │
             ├─── Phase 2 (Commands & API)
             │        │
             │        ├─── Phase 3 (Multi-System Rendering)
             │        │        │
             │        │        └─── Phase 3b (Layout Anchoring) ← FIX
             │        │                 │
             │        │                 ├─── Phase 6 (Print Support)
             │        │                 │
             │        │                 └─── Phase 7 (Metadata Rendering)
             │        │
             │        ├─── Phase 4 (Score Setup Dialog)
             │        │        │
             │        │        └─── Phase 5 (Toolbar Controls) ← also needs 3b
             │        │
             │        └─── Phase 8 (Export Integration)
             │
             └─── Phase 9 (Polish & Testing) ← depends on ALL
```

---

## Parallelization Opportunities

Phases that can run in parallel (after dependencies met):
- **Phases 3, 4, 8** can run in parallel after Phase 2 completes
- **Phases 5, 6, 7** can run in parallel after Phase 3b completes

Maximum parallelism execution order:
1. Phase 0 (sequential, prerequisite)
2. Phase 1 (sequential)
3. Phase 2 (sequential)
4. Phases 3 + 4 + 8 (parallel)
5. Phase 3b (sequential, fixes Phase 3 issues)
6. Phases 5 + 6 + 7 (parallel, after Phase 3b)
7. Phase 9 (sequential, final)

---

## Phase Structure

Every phase prompt includes:

### 1. Objective & Deliverables
What to build and what files to create/modify.

### 2. Implementation Details
Code snippets, type definitions, and algorithm notes.

### 3. Parallelization Strategy
Which subagents to spawn and what they should do.

### 4. Acceptance Criteria
Checklist of requirements that must pass.

### 5. User Walkthrough & Manual Testing
**Step-by-step instructions for verifying the phase works correctly.** This section ensures the executor can manually test all functionality before moving on.

### 6. Phase Completion & Recalibration
- **Recalibration checklist** to verify everything works
- **Review next phase** prompt for any needed updates
- **Commit template** for atomic commits
- **Notes for subsequent phases** on what's now available

---

## Recalibration Process

After completing each phase:

1. **Run tests and lint**
   ```bash
   npm run test
   npm run lint
   ```

2. **Manual testing** - Follow the User Walkthrough section

3. **Review discoveries** - Did you learn anything that affects later phases?

4. **Update next phase prompt** - If needed, modify the next phase to incorporate learnings

5. **Atomic commit** - Use the provided commit template

6. **Proceed to next phase**

---

## Reference Documents

Each prompt pulls context from:
- [PRD.md](../PRD.md) - Product Requirements
- [SRS.md](../SRS.md) - Software Requirements Specification
- [SDD.md](../SDD.md) - Software Design Document
- [docs/AGENTS.md](../../../AGENTS.md) - Agent coding guidelines

---

## Common Patterns

All phases reference these project patterns:

### Layer Hierarchy
```
Components → Hooks → Engines → Services
```

### Command Pattern
All state mutations use undoable commands.

### Structured Feedback (ADR-011)
Never throw; return result objects with `{ ok, value }` or `{ ok, error }`.

### CSS Conventions
- Namespace: `.riff-` prefix
- BEM: `.riff-Block__element--modifier`
- Variables: `--riff-*`

### TypeScript Rules
- No `any`
- Explicit return types on exports
- Unions over enums

---

## Quick Start

To execute a phase:

1. Read the phase prompt document
2. Spawn research subagents as specified
3. Implement files in parallel where noted
4. Run tests: `npm run test`
5. Run lint: `npm run lint`
6. **Follow User Walkthrough for manual testing**
7. Verify acceptance criteria
8. **Complete recalibration checklist**
9. **Make atomic commit**
10. Proceed to next phase

---

## Key Interaction Pattern

Phase 7 (Metadata Rendering) reuses the **ChordTrack interaction pattern**:
- Hover preview with 50% opacity placeholders
- Click-to-edit with text selection
- Tab/Shift+Tab navigation
- Cmd/Ctrl+Click for selection without editing
- Enter to commit, Escape to cancel

Before implementing Phase 7, read:
- `src/components/Canvas/ChordTrack.tsx`
- `src/components/Canvas/ChordSymbol.tsx`
- `src/components/Canvas/ChordInput.tsx`
- `src/hooks/useChordTrack.ts`

---

## Documentation Updates

Phase 9 includes a comprehensive documentation update checklist. Ensure these files are updated before closing #174:

- `docs/AGENTS.md` - Add new files and patterns
- `docs/ARCHITECTURE.md` - Document new services
- `docs/API.md` - Document new API methods
- `docs/COMMANDS.md` - Document new commands
- `README.md` - Update features list
- `CHANGELOG.md` - Add release notes
