# Chord Symbols - Product Requirements Document

**Feature:** Chord Symbols with Flexible Notation and Playback
**Issue:** [#29](https://github.com/joekotvas/riffscore/issues/29)
**Status:** Draft
**Date:** 2026-02-12

---

## 1. Overview

### 1.1 Problem Statement

Musicians and educators working with lead sheets, jazz charts, and educational materials need to annotate scores with chord symbols. Currently, RiffScore has no way to display harmonic analysis above the staff, limiting its usefulness for:

- Lead sheet creation
- Harmonic analysis exercises
- Jazz and pop music transcription
- Educational materials showing chord progressions

### 1.2 Solution Summary

Implement a **chord track** that displays chord symbols above the top staff, with:

- Support for multiple notation traditions (letter names, Roman numerals, Nashville numbers, solfège)
- A single canonical storage format for consistent behavior
- Export to all supported formats (JSON, ABC, MusicXML)
- Optional playback with configurable voicing
- Click-to-edit interaction model

### 1.3 Success Criteria

1. Users can add, edit, and delete chord symbols at any beat position
2. Chord symbols display in the user's preferred notation system
3. Chord data persists through save/load cycles
4. Chord symbols export correctly to ABC and MusicXML
5. Chord playback can be toggled independently of melody playback

---

## 2. User Stories

### 2.1 Core Workflows

| As a... | I want to... | So that... |
|---------|--------------|------------|
| Composer | Add chord symbols above my melody | I can create lead sheets |
| Music student | View chords in Roman numerals | I can analyze harmonic function |
| Nashville session musician | Display chords as Nashville numbers | I can read charts in my familiar system |
| Ear training teacher | Switch between notation systems | Students can compare representations |
| Pianist | Hear chord playback while composing | I can verify my harmonic choices |

### 2.2 Interaction Stories

| As a... | I want to... | So that... |
|---------|--------------|------------|
| User | Click on the chord track to add a chord | Entry is quick and intuitive |
| User | Click an existing chord to edit it | I can correct mistakes |
| User | Delete a chord with backspace/delete | I can remove unwanted symbols |
| User | See a text cursor when editing | I know I'm in edit mode |
| User | Press Escape to cancel editing | I can back out of changes |
| User | Press Enter to confirm a chord | I can quickly move on |

---

## 3. Functional Requirements

### 3.1 Chord Track Model

**FR-01:** The score SHALL support exactly one chord track per piece.

**FR-02:** Chord symbols SHALL be anchored to quant positions (not specific events), allowing placement at any rhythmic position where a note or rest begins in any staff.

**FR-03:** The chord track SHALL always render above the topmost staff.

**FR-04:** Chord symbols SHALL be stored in a single canonical format regardless of display notation.

### 3.2 Notation Systems

The system SHALL support these notation traditions:

| System | Example | Description |
|--------|---------|-------------|
| **Letter Names** | `C`, `Dm`, `G7`, `Fmaj7` | Standard chord symbols |
| **Roman Numerals** | `I`, `ii`, `V7`, `IVmaj7` | Functional harmony (relative to key) |
| **Nashville Numbers** | `1`, `2m`, `5`, `4maj7` | Number-based (relative to key) |
| **Fixed Do** | `Do`, `Re-`, `Sol7`, `Fa△` | Solfège with fixed C = Do |
| **Movable Do** | `Do`, `Re-`, `Sol7`, `Fa△` | Solfège transposed to key |

**FR-05:** Users SHALL be able to switch display notation without affecting stored data.

**FR-06:** The system SHALL convert between notations using the score's key signature.

**FR-07:** Input SHALL accept any common chord format; the parser SHALL normalize to canonical form.

### 3.3 Chord Input

**FR-08:** Users SHALL input chords by clicking on the chord track at valid positions (positions where at least one staff has a note or rest beginning).

**FR-09:** The system SHALL display an inline text field for chord entry.

**FR-10:** The parser SHALL accept these input variations:
- Quality: `C`, `Cmaj`, `CM`, `Cmajor`, `CΔ`
- Minor: `Cm`, `Cmin`, `C-`, `Cminor`
- Seventh: `C7`, `Cmaj7`, `CM7`, `CΔ7`, `Cmin7`, `Cm7`
- Extensions: `C9`, `C11`, `C13`, `Cadd9`
- Alterations: `C7#9`, `Cm7b5`, `Cdim`, `C°`, `Caug`, `C+`
- Slash chords: `C/E`, `Am/G`

**FR-11:** Invalid input SHALL display an error indicator; the chord SHALL not be saved until valid.

### 3.4 Chord Editing

**FR-12:** Clicking an existing chord symbol SHALL enter edit mode directly. `Cmd/Ctrl + Click` SHALL select the chord without entering edit mode. Double-clicking SHALL also enter edit mode.

**FR-12a:** When a chord is selected (via `Cmd/Ctrl + Click`), pressing `Enter` SHALL enter edit mode.

**FR-13:** Pressing `Enter` or clicking away SHALL confirm the edit.

**FR-14:** Pressing `Escape` SHALL cancel the edit and restore the previous value.

**FR-15:** Pressing `Delete` or `Backspace` on a selected (but not editing) chord SHALL remove it.

### 3.4a Audio Feedback

**FR-15a:** Selecting a chord SHALL play its voicing with eighth note duration for immediate feedback.

**FR-15b:** Navigating between chords (via arrow keys or Tab) SHALL play the newly selected chord's voicing.

**FR-15c:** Switching between edit mode and selected mode SHALL NOT trigger audio playback.

### 3.5 Chord Lifecycle

**FR-16:** When an event is deleted, any chord anchored to that quant position SHALL be automatically removed if no other note or rest begins at that quant in any staff.

**FR-17:** The system SHALL warn users before bulk operations (e.g., clearing measures) that would remove chords.

### 3.6 Display & Rendering

**FR-18:** Chord symbols SHALL render at a consistent vertical offset above the top staff.

**FR-19:** Chord symbols SHALL align horizontally with the note/event they anchor to.

**FR-20:** The font size SHALL be configurable (default: proportional to staff size).

**FR-21:** Quality symbols MAY use typographic alternatives (e.g., `△` for major 7, `°` for diminished).

### 3.7 Playback

**FR-22:** Chord playback SHALL be independently toggleable via configuration.

**FR-23:** When enabled, chords SHALL play at a reduced velocity relative to melody notes.

**FR-24:** Chord voicing SHALL default to close position within a reasonable register.

**FR-25:** The playback instrument MAY be configurable separately from the melody instrument (future enhancement).

### 3.8 Export

**FR-26:** JSON export SHALL include the chord track array in the score object.

**FR-27:** ABC export SHALL output chord symbols using standard annotation syntax: `"Cmaj7"`.

**FR-28:** MusicXML export SHALL output chord symbols using the `<harmony>` element with `<root>`, `<kind>`, and optionally `<bass>`.

### 3.9 Programmatic API

**FR-29:** All chord CRUD operations SHALL be available via the public API (add, update, remove, get).

**FR-30:** Chord selection SHALL be controllable via API methods (select, deselect, navigation).

**FR-31:** The API SHALL support querying chords by ID or by quant position.

**FR-32:** API methods SHALL follow the fluent chaining pattern and structured feedback pattern (ADR-011).

### 3.10 Import (Future)

**FR-33:** ABC import SHOULD parse chord annotations.

**FR-34:** MusicXML import SHOULD parse `<harmony>` elements.

> Note: Import is out of scope for initial implementation but the data model should accommodate it.

---

## 4. Non-Functional Requirements

### 4.1 Performance

**NFR-01:** Adding/editing a chord SHALL not cause perceptible UI lag (<100ms response).

**NFR-02:** Rendering 50+ chord symbols SHALL not degrade scroll performance.

### 4.2 Accessibility

**NFR-03:** Chord symbols SHALL be readable by screen readers with meaningful labels (e.g., "C major seventh" not "Cmaj7").

**NFR-04:** Keyboard navigation SHALL support moving to/from the chord track using `Cmd+Shift+C` (macOS) / `Ctrl+Shift+C` (Windows/Linux).

**NFR-05:** The chord input field SHALL have proper focus management and ARIA labels.

**NFR-06:** Error states SHALL be announced to assistive technologies.

**NFR-07:** All interactive chord elements SHALL have visible focus indicators meeting WCAG 2.1 AA contrast requirements.

### 4.3 Compatibility

**NFR-08:** Chord data SHALL be forward-compatible with future multi-track support.

---

## 5. Scope Boundaries

### 5.1 In Scope (v1)

- Single chord track per score
- Display above top staff only
- Five notation systems
- Click-to-edit interaction
- Playback toggle
- Export to JSON, ABC, MusicXML

### 5.2 Out of Scope (Future)

- Multiple chord tracks
- Chord track per staff (custom placement)
- Chord diagrams (guitar fingering)
- Advanced voicing algorithms
- Chord playback arpeggiation styles
- Chord-based auto-accompaniment
- Import from ABC/MusicXML (deferred)

---

## 6. Open Questions

| # | Question | Impact | Resolution |
|---|----------|--------|------------|
| 1 | Should the chord track be visible when empty? | UX | **Resolved:** Invisible when empty, but the hit area remains interactive. Hovering over valid positions shows a text-entry cursor to indicate chords can be added. |
| 2 | How to handle chords on pickup measures? | Data model | **Resolved:** Same as everywhere else. Chords anchor to quants where notes exist, including pickup measures. No special handling required. |
| 3 | Should Roman numerals show secondary dominants (V/V)? | Notation | **Resolved:** Yes, parse slash as secondary dominant. |

---

## 7. Dependencies

- **tonal** library - chord parsing and theory operations
- Existing layout engine - vertical spacing calculations
- Existing playback engine - chord audio synthesis

---

## 8. Related Documents

- [SRS.md](./SRS.md) - Software Requirements Specification
- [SDD.md](./SDD.md) - Software Design Document
- [ARCHITECTURE.md](../ARCHITECTURE.md) - System architecture
- [DATA_MODEL.md](../DATA_MODEL.md) - Data structures
