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

**FR-02:** Users SHALL toggle view mode via a toolbar button or keyboard shortcut.

**FR-03:** Switching view modes SHALL preserve all score state (selection, cursor, playback position).

**FR-04:** The current view mode SHALL persist in user preferences.

### 3.2 System Breaks

**FR-05:** In page view, the score SHALL automatically wrap to multiple systems based on available page width.

**FR-06:** The system break algorithm SHALL respect these constraints:
- Never break in the middle of a measure
- Never break tied notes without visual indication
- Prefer breaks at natural phrase boundaries when possible

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

---

## 4. Non-Functional Requirements

### 4.1 Performance

**NFR-01:** View mode toggle SHALL complete in <200ms for scores up to 100 measures.

**NFR-02:** System break calculation SHALL be memoized and only recalculate when:
- Page size changes
- Measures are added/removed
- Time signature changes

**NFR-03:** Rendering 10+ systems SHALL not cause scroll jank (<16ms frame time).

### 4.2 Print Quality

**NFR-04:** Printed output SHALL match professional engraving standards.

**NFR-05:** Print SHALL work in all modern browsers (Chrome, Firefox, Safari, Edge).

**NFR-06:** PDF export via browser print SHALL produce searchable text for titles.

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

### 5.4 Key Implementation Changes

| Component | Change |
|-----------|--------|
| `scoreLayout.ts` | Add `calculatePageLayout()`, update `measureOrigin` per system |
| `ScoreCanvas.tsx` | Render multiple `<g>` groups for systems |
| `Staff.tsx` | Render clef/key on each system, handle tie splitting |
| `useCursorLayout.ts` | Track system index for cursor positioning |
| `config.ts` | Add `pageSize`, `viewMode`, `margins` options |
| New: `print.css` | Print-specific stylesheet |

---

## 6. Scope Boundaries

### 6.1 In Scope (v1)

- Toggle between scroll view and page view
- Automatic system breaks based on page width
- Letter and A4 page sizes
- Print to PDF via browser dialog
- Cmd/Ctrl+P keyboard shortcut
- Tie visualization across breaks
- Playback cursor across systems
- Basic margin configuration

### 6.2 Out of Scope (Future)

- Manual system break placement (user-specified)
- Page numbers and headers/footers
- Multiple pages in editor view (pagination within editor)
- Custom page sizes
- Landscape orientation
- Part extraction (separate treble/bass)
- Coda/segno jump indicators at breaks
- Ossia staves

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

### Phase 3: Tie Splitting
- [ ] Detect ties crossing system breaks
- [ ] Render split tie arcs
- [ ] Visual continuity indication

### Phase 4: Print Support
- [ ] Print stylesheet (`@media print`)
- [ ] Cmd/Ctrl+P handler
- [ ] Page break CSS rules
- [ ] Hide UI chrome in print

### Phase 5: View Mode Toggle
- [ ] Toolbar button for view mode
- [ ] Keyboard shortcut
- [ ] State persistence
- [ ] Smooth transition

### Phase 6: Interaction Polish
- [ ] Playback across systems
- [ ] Selection across systems
- [ ] Keyboard navigation across systems
- [ ] Auto-scroll in page view

---

## 8. Open Questions

| # | Question | Impact | Status |
|---|----------|--------|--------|
| 1 | Should page view show actual page boundaries (paper outline)? | UX | Open |
| 2 | How to handle very wide measures (full-measure rests, complex tuplets)? | Algorithm | Open |
| 3 | Should system breaks be configurable per-score or global preference? | Config | Open |
| 4 | What happens if a single measure exceeds page width? | Edge case | Open |

---

## 9. Dependencies

- **Measure-relative X positioning** (#204) - Complete
- **Forward-flow Y positioning** (ADR-015) - Complete
- **SVG rendering** - Existing

---

## 10. Related Documents

- [ADR-016: Measure-Relative X Positioning](../../adr/016-measure-relative-x.md)
- [ADR-015: Forward-Flow Y Positioning](../../adr/015-forward-flow-y-positioning.md)
- [LAYOUT_ENGINE.md](../../LAYOUT_ENGINE.md)
- [measure-relative-x-spec.md](../../migration/measure-relative-x-spec.md)
