# Page View & Print - Product Requirements Document

**Feature:** Page View Mode with System Breaks and Print Support
**Issue:** [#174](https://github.com/joekotvas/riffscore/issues/174)
**Status:** Draft
**Date:** 2026-02-14

---

## 1. Overview

### 1.1 Problem Statement

RiffScore currently renders scores as a single horizontal line, which:

- Doesn't match how musicians read printed music (vertical page flow)
- Makes long pieces difficult to navigate and read
- Prevents printing without horizontal scrolling or truncation
- Limits usefulness for educational handouts, lead sheets, and sheet music

### 1.2 Solution Summary

Implement a **page view mode** that:

- Wraps music across multiple systems (lines) based on page width
- Supports standard page sizes (Letter, A4)
- Provides clean print-to-PDF via native browser dialog
- Maintains full interactivity in page view (editing, playback, selection)

### 1.3 Success Criteria

1. Users can toggle between horizontal scroll view and page view
2. Music wraps naturally across multiple systems
3. Print produces clean, professional-looking PDFs
4. Page size is configurable (Letter, A4)
5. All existing features work in page view (editing, playback, selection)

---

## 2. User Stories

### 2.1 Core Workflows

| As a... | I want to... | So that... |
|---------|--------------|------------|
| Music teacher | Print lead sheets for students | I can distribute physical handouts |
| Composer | View my piece in page layout | I can see how it will look printed |
| Performer | Print a part to put on my music stand | I can read music naturally |
| Student | Export my composition as PDF | I can submit assignments digitally |
| Blogger | Embed page-view scores | Readers see traditional sheet music layout |

### 2.2 Interaction Stories

| As a... | I want to... | So that... |
|---------|--------------|------------|
| User | Toggle between scroll and page view | I can choose the best view for my task |
| User | Press Cmd/Ctrl+P to print | Printing is intuitive and quick |
| User | Select Letter or A4 page size | Output matches my paper/region |
| User | Edit notes while in page view | I don't have to switch modes to make changes |
| User | Play back music in page view | The cursor follows across system breaks |

---

## 3. Functional Requirements

### 3.1 View Modes

**FR-01:** The editor SHALL support two view modes: **Scroll View** (default) and **Page View**.

**FR-02:** Users SHALL toggle view mode via a toolbar button or keyboard shortcut (`Cmd+\` on Mac, `Ctrl+\` on Windows/Linux).

**FR-03:** Switching view modes SHALL preserve all score state (selection, cursor, playback position).

**FR-04:** The current view mode SHALL persist in user preferences.

### 3.2 System Breaks

**FR-05:** In page view, the score SHALL automatically wrap to multiple systems based on available page width.

**FR-06:** The system break algorithm SHALL respect these constraints:
- Never break in the middle of a measure
- Never break tied notes without visual indication

**FR-07:** Each system SHALL include:
- Clef at the beginning (all systems)
- Key signature at the beginning (all systems)
- Time signature (first system only, unless changed)
- Brace/bracket for grand staff (all systems)

**FR-08:** System spacing SHALL be consistent and configurable.

**FR-09:** Bar lines SHALL extend across all staves within a system.

### 3.3 Page Dimensions

**FR-10:** The system SHALL support these page sizes:

| Size | Dimensions | Region |
|------|------------|--------|
| Letter | 8.5" × 11" (215.9 × 279.4 mm) | US/Canada |
| A4 | 210 × 297 mm (8.27" × 11.69") | International |

**FR-11:** Page margins SHALL be configurable with sensible defaults:
- Top: 0.75" (19mm)
- Bottom: 0.75" (19mm)
- Left: 0.75" (19mm)
- Right: 0.75" (19mm)

**FR-12:** The content area (page minus margins) SHALL determine available width for system layout.

### 3.4 Print Support

**FR-13:** Pressing `Cmd+P` (Mac) / `Ctrl+P` (Windows/Linux) SHALL open the native browser print dialog.

**FR-14:** The print stylesheet SHALL:
- Hide all UI chrome (toolbar, scrollbars, backgrounds)
- Show only the score content
- Use high-contrast black on white
- Respect page breaks between systems

**FR-15:** Print output SHALL be resolution-independent (vector-based SVG rendering).

**FR-16:** Multi-page scores SHALL paginate correctly with proper page breaks.

### 3.5 Tie Handling at System Breaks

**FR-17:** When a tie spans a system break, the system SHALL render:
- A tie arc extending to the right edge on the first system
- A tie arc continuing from the left edge on the second system

**FR-18:** The visual indication SHALL be clear that the note is held across the break.

### 3.6 Chord Symbols at System Breaks

**FR-19:** Chord symbols SHALL appear above the first staff of each system.

**FR-20:** Chord positioning SHALL use measure-relative coordinates (already implemented via #204).

### 3.7 Playback in Page View

**FR-21:** The playback cursor SHALL move across system breaks seamlessly.

**FR-22:** Auto-scroll (if enabled) SHALL keep the current system in view during playback.

**FR-23:** Clicking to set playback position SHALL work across all systems.

### 3.8 Editing in Page View

**FR-24:** All editing operations SHALL work identically in page view and scroll view.

**FR-25:** Selection across system breaks SHALL highlight notes on both systems.

**FR-26:** Keyboard navigation SHALL move between systems at measure boundaries.

### 3.9 Traditional Engraving Standards

**FR-27:** The first system SHALL be indented (default ~15% of content width) to accommodate title placement above.

**FR-28:** Measure numbers SHALL appear at the start of each system, positioned above the top staff and left-aligned with the first barline.

**FR-29:** Systems SHALL be horizontally justified to fill the content width, EXCEPT the final system which SHALL render at natural width if less than 60% full.

**FR-30:** *(Deferred to v2)* Courtesy signatures at system breaks.

**FR-30a:** Page numbers SHALL appear centered at the bottom of each page, below the copyright notice (if present on page 1).

### 3.10 Toolbar Controls

**FR-31:** The toolbar SHALL include a **View Toggle** button to switch between Scroll View and Page View.

**FR-32:** The View Toggle button SHALL display an icon indicating the current view mode (e.g., horizontal lines for scroll, page outline for page view).

**FR-33:** The toolbar SHALL include a **Score Setup** button that opens the Score Setup dialog.

**FR-34:** The keyboard shortcut `Cmd+,` (Mac) / `Ctrl+,` (Windows/Linux) SHALL open the Score Setup dialog.

**FR-34a:** The toolbar SHALL include a **Print** button that opens the browser print dialog.

**FR-34b:** The Print button SHALL display a printer icon and be grouped with the View Toggle and Score Setup buttons.

### 3.11 Score Setup Dialog

The Score Setup dialog provides centralized access to score metadata and layout configuration.

#### 3.11.1 Page Metadata

**FR-35:** The Score Setup dialog SHALL include fields for the following metadata:

| Field | Description | Display Location |
|-------|-------------|------------------|
| **Title** | Score title (pre-filled to "Untitled") | Centered above first system |
| **Composer** | Composer name (optional) | Right-aligned above first system |
| **Lyricist** | Lyricist name (optional) | Left-aligned above first system |
| **Copyright** | Copyright notice (optional) | Bottom of first page, centered |

**FR-36:** All metadata fields SHALL be optional except Title (pre-filled to "Untitled").

**FR-37:** Metadata SHALL be stored in the score JSON and exported to ABC/MusicXML.

**FR-38:** Metadata SHALL render in print output at appropriate positions.

#### 3.11.2 Layout Configuration

**FR-39:** The Score Setup dialog SHALL include the following layout settings:

| Setting | Options | Default |
|---------|---------|---------|
| **Page Size** | Letter, A4 | Letter (US) / A4 (International) |
| **Margins** | Narrow, Normal, Wide (dropdown) | Normal (0.75" all sides) |
| **Staff Size** | Slider from 50% to 150% in 10% increments | 100% |
| **System Spacing** | Compact, Normal, Relaxed | Normal |

**FR-40:** Layout settings SHALL apply immediately when changed via a batched command. Pressing Cancel SHALL undo all changes made during the session as a single undo operation.

**FR-41:** Layout settings SHALL persist per-score in the score JSON.

**FR-42:** A "Reset to Defaults" button SHALL restore all layout settings to defaults.

#### 3.11.3 Dialog Behavior

**FR-43:** The Score Setup dialog SHALL be modal with clear Save/Cancel actions.

**FR-44:** Pressing `Escape` SHALL cancel and close the dialog without saving changes.

**FR-45:** Pressing `Enter` (when not in a text field) SHALL save and close the dialog.

**FR-46:** The dialog SHALL be a single scrollable form with section headers: **Metadata** and **Layout**.

#### 3.11.4 Inline Metadata Editing (WYSIWYG)

> **Reuses interaction pattern from chord editing.** See SRS section 5.2.3 for full specification.

**FR-47:** Hovering over the title block area SHALL display placeholder text for all empty metadata fields at 50% opacity (matching chord preview styling).

**FR-48:** Users SHALL be able to click directly on rendered metadata text (title, composer, lyricist) to enter edit mode with text selected.

**FR-49:** Inline editing SHALL use the same keyboard navigation as chord editing:
- `Tab` to save and move to next field
- `Shift+Tab` to save and move to previous field
- `Tab` from last field (lyricist) to exit to first note via `api.selectFirstElement()`
- `Enter` to commit changes
- `Escape` to cancel and revert

**FR-50:** Metadata fields SHALL be selectable like chords:
- `Cmd/Ctrl+Click` to select without editing
- `Delete`/`Backspace` when selected to clear field content

**FR-51:** Inline metadata edits SHALL execute via the `SetMetadataCommand`, enabling undo/redo.

**FR-52:** The Score Setup dialog and inline editing SHALL share the same underlying metadata state.

---

## 4. Non-Functional Requirements

### 4.1 Performance

**NFR-01:** View mode toggle SHALL complete in <200ms for scores up to 100 measures.

**NFR-02:** System break calculation SHALL be memoized and only recalculate when:
- Page size changes
- Margins change
- Staff size changes
- Measures are added/removed
- Time signature changes
- View mode changes to 'page'

**NFR-03:** Rendering 10+ systems SHALL not cause scroll jank (<16ms frame time).

### 4.2 Print Quality

**NFR-04:** Printed output SHALL follow conventional music engraving proportions and spacing guidelines.

**NFR-05:** Print SHALL work in all modern browsers (Chrome, Firefox, Safari, Edge).

**NFR-06:** Print output saved as PDF SHALL produce searchable text for titles.

### 4.3 Accessibility

**NFR-07:** System breaks SHALL be announced to screen readers ("System 2 of 5").

**NFR-08:** Focus SHALL be visually clear when navigating between systems.

**NFR-09:** Print dialog SHALL be accessible via keyboard.

---

## 5. Technical Approach

### 5.1 Foundation (Already Complete)

The measure-relative X positioning (#204) provides the foundation:

```typescript
// Measures can now have different origins per system
layout.getX.measureOrigin({ measure: 5 })  // Could be X=100 on system 1, X=50 on system 2
layout.getX({ measure: 5, quant: 0 })      // Measure-relative, works everywhere
```

### 5.2 System Layout Model

```typescript
interface SystemLayout {
  index: number;           // 0-based system number
  measures: number[];      // Measure indices in this system [0, 1, 2, 3]
  y: number;               // Y position of this system
  height: number;          // Total system height
}

interface PageLayout {
  systems: SystemLayout[];
  pageSize: 'letter' | 'a4';
  margins: { top: number; right: number; bottom: number; left: number };
  contentWidth: number;    // Available width for music
}
```

### 5.3 System Break Algorithm

```
1. Calculate total width needed for each measure
2. Greedily fill systems until width exceeds contentWidth
3. Place system break before the measure that would overflow
4. Calculate Y positions using forward-flow pattern
5. Update getX.measureOrigin to return system-aware X
```

### 5.4 Score Metadata Model

```typescript
interface ScoreMetadata {
  title: string;           // Required (pre-filled to "Untitled")
  composer?: string;       // Composer name
  lyricist?: string;       // Lyricist name
  copyright?: string;      // Copyright notice
}

interface LayoutConfig {
  pageSize: 'letter' | 'a4';
  margins: 'narrow' | 'normal' | 'wide';  // Preset margin sizes
  staffSize: number;       // Percentage (50-150, stepped by 10)
  systemSpacing: 'compact' | 'normal' | 'relaxed';
  viewMode: 'scroll' | 'page';
}
```

### 5.5 Key Implementation Changes

| Component | Change |
|-----------|--------|
| `types.ts` | Add `ScoreMetadata` and `LayoutConfig` interfaces |
| `scoreLayout.ts` | Add `calculatePageLayout()`, update `measureOrigin` per system |
| `ScoreCanvas.tsx` | Render multiple `<g>` groups for systems |
| `ScoreHeader.tsx` | Render metadata (title, composer, lyricist, copyright) |
| `Staff.tsx` | Render clef/key on each system, handle tie splitting |
| `useCursorLayout.ts` | Track system index for cursor positioning |
| `config.ts` | Add `pageSize`, `viewMode`, `margins`, `staffSize` options |
| New: `ScoreSetupDialog.tsx` | Modal dialog for metadata and layout settings |
| New: `print.css` | Print-specific stylesheet |

---

## 6. Scope Boundaries

### 6.1 In Scope (v1)

- Toggle between scroll view and page view
- Automatic system breaks based on page width
- Letter and A4 page sizes
- Print to PDF via browser dialog (toolbar button + Cmd/Ctrl+P)
- Tie visualization across breaks
- Playback cursor across systems
- Margin presets (Narrow/Normal/Wide dropdown)
- Score Setup dialog with metadata (title, composer, lyricist, copyright)
- Layout configuration (page size, margins, staff size, system spacing)
- Toolbar buttons: view toggle, score setup, print
- Measure numbers at system start
- Page numbers (centered, bottom of each page)

### 6.2 Out of Scope (Future)

- Manual system break placement (user-specified)
- Headers/footers (beyond page numbers and copyright)
- Multiple pages in editor view (pagination within editor)
- Custom page sizes
- Landscape orientation
- Part extraction (separate treble/bass)
- Coda/segno jump indicators at breaks
- Ossia staves
- Slur splitting at system breaks (ties only in v1)
- Beam groups spanning system breaks
- Courtesy key/time signatures at system breaks
- Subtitle and arranger metadata fields
- Custom margin values (individual top/bottom/left/right)

---

## 7. Implementation Phases

### Phase 1: System Break Engine
- [ ] `calculatePageLayout()` function
- [ ] System break algorithm
- [ ] Multi-system Y positioning
- [ ] Update `getX.measureOrigin` for multi-system

### Phase 2: Multi-System Rendering
- [ ] ScoreCanvas renders multiple systems
- [ ] Clef/key signature on each system
- [ ] Brace/bracket per system
- [ ] System spacing
- [ ] First system indentation (FR-27)
- [ ] Measure numbers at system start (FR-28)
- [ ] System justification with ragged last system (FR-29)

### Phase 3: Tie Splitting
- [ ] Detect ties crossing system breaks
- [ ] Render split tie arcs
- [ ] Visual continuity indication

### Phase 4: Print Support
- [ ] Print stylesheet (`@media print`)
- [ ] Cmd/Ctrl+P handler
- [ ] Page break CSS rules
- [ ] Hide UI chrome in print

### Phase 5: Toolbar & View Mode Toggle
- [ ] View toggle button with icon (FR-31, FR-32)
- [ ] Score Setup button (FR-33)
- [ ] Print button (FR-34a, FR-34b)
- [ ] Keyboard shortcuts for all toolbar actions
- [ ] State persistence
- [ ] Smooth transition animation

### Phase 6: Score Setup Dialog
- [ ] Single scrollable form with section headers (FR-46)
- [ ] Metadata fields: title, composer, lyricist, copyright (FR-35–FR-38)
- [ ] Layout settings: page size, margins dropdown, staff size slider, system spacing (FR-39–FR-42)
- [ ] Score Setup toolbar button (FR-33)
- [ ] Cmd/Ctrl+, keyboard shortcut (FR-34)
- [ ] Batched command for undo-on-cancel (FR-40)
- [ ] Persist settings in score JSON (FR-41)

### Phase 7: Metadata Rendering
> **Reuses ChordTrack interaction pattern.** See SDD sections 6.6–6.9.

- [ ] Title positioning (centered above first system)
- [ ] Composer positioning (right-aligned)
- [ ] Lyricist positioning (left-aligned)
- [ ] Copyright footer (bottom of first page)
- [ ] Page numbers (centered, bottom of each page) (FR-30a)
- [ ] Hover preview for empty metadata fields (FR-47)
- [ ] Inline WYSIWYG editing (FR-48–FR-50)
- [ ] Tab/Shift+Tab navigation between fields (FR-49)
- [ ] Tab exit to first note via `api.selectFirstElement()` (FR-49)
- [ ] Metadata selection and deletion (FR-50)
- [ ] Metadata in print output (FR-38)
- [ ] Export to ABC/MusicXML (FR-37)

### Phase 8: Interaction Polish
- [ ] Playback across systems
- [ ] Selection across systems
- [ ] Keyboard navigation across systems
- [ ] Auto-scroll in page view

---

## 8. Resolved Questions

| # | Question | Resolution |
|---|----------|------------|
| 1 | Should page view show actual page boundaries (paper outline)? | **Yes.** Users expect WYSIWYG for print. Show subtle page outline in page view. |
| 2 | How to handle very wide measures (full-measure rests, complex tuplets)? | Allow measures to exceed "ideal" width. If single measure >50% of system width, give it its own system. Never scale down individual measures. |
| 3 | Should system breaks be configurable per-score or global preference? | **Per-score** for page size and layout settings, with global defaults that new scores inherit. |
| 4 | What happens if a single measure exceeds page width? | Scale entire score proportionally. Alert user if scaling drops below 50%. This is rare but must be handled gracefully. |

---

## 9. Dependencies

- **Measure-relative X positioning** (#204) - Complete
- **Forward-flow Y positioning** (ADR-015) - Complete
- **SVG rendering** - Existing

---

## 10. Related Documents

- [Notation Expert Review](./notation-expert-review.md) - Third-party advisory feedback
- [ADR-016: Measure-Relative X Positioning](../../adr/016-measure-relative-x.md)
- [ADR-015: Forward-Flow Y Positioning](../../adr/015-forward-flow-y-positioning.md)
- [LAYOUT_ENGINE.md](../../LAYOUT_ENGINE.md)
- [measure-relative-x-spec.md](../../migration/measure-relative-x-spec.md)
