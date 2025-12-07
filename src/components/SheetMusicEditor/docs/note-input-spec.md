# Note Input Behavioral Specifications

This document defines the expected behavior for note input in the Sheet Music Editor. These specifications ensure consistency during development and testing.

---

## Terminology

| Term | Definition |
|------|------------|
| **Selection** | A highlighted note or event in the score. Indicated visually by a different color. Only one selection can be active at a time. |
| **Cursor (Ghost Note)** | A semi-transparent preview note showing where the next note will be inserted. Visible only when hovering over the score or navigating with keyboard. |
| **Event** | A beat unit containing one or more notes (chord). Has a duration property. |
| **Hit Zone** | An invisible interactive region in a measure used for click/hover detection. Types: `EVENT` (existing note), `INSERT` (between notes), `APPEND` (after last note). |

---

## State Rules

### Selection vs Cursor
- **Selection and Cursor are mutually exclusive** when using keyboard input mode.
- When a user presses Enter to add a note from the cursor:
  - The note is added
  - The selection is cleared
  - The cursor advances to the next slot
- When a user clicks to add a note:
  - The note is added
  - The added note becomes selected
  - The cursor is cleared

### Selection State
```
{ measureIndex: number | null, eventId: string | number | null, noteId: string | number | null }
```
- `measureIndex: null` indicates no selection
- `noteId` allows selecting a specific note within a chord

### Cursor State
```
{ measureIndex, pitch, duration, dotted, mode, index }
```
- `mode: 'APPEND'` — cursor is after all existing events
- `mode: 'INSERT'` — cursor is between events
- `mode: 'CHORD'` — cursor is on an existing event (add to chord)

---

## Mouse Workflow

### Hover Behavior
1. Moving mouse over a measure calculates the current hit zone and pitch
2. If a valid zone exists:
   - Cursor appears at that position showing preview of note to be added
   - Pitch is determined by Y position (quantized to staff lines/spaces)
3. If mouse leaves score area, cursor disappears

### Click to Add Note
1. Click is detected on measure (not on an existing note's hit box)
2. Hit zone determines placement:
   - `EVENT` zone → Add note to existing chord
   - `INSERT` zone → Insert new event before specified index
   - `APPEND` zone → Append new event at end of measure
3. Note is created with:
   - Pitch from mouse Y position
   - Duration from toolbar selection
   - Dotted state from toolbar
4. Resulting behavior:
   - **Note is added to score**
   - **Added note becomes selected**
   - **Cursor is cleared**
   - **Audio plays the added note**

### Click on Existing Note
**Cursor:** Crosshair (indicates duration change mode)

1. `onMouseDown` triggers on note group container
2. Note becomes selected
3. Click event is stopped from propagating to background
4. **The note's duration AND dotted state are changed to match the toolbar** (if it fits in the measure)
5. Audio plays the selected note/chord

**Hover Preview:** When hovering over a note (without Cmd/Ctrl held), a semi-transparent ghost note shows the toolbar's duration overlaid on the existing note, previewing the change before click.

### Cmd/Ctrl + Click on Existing Note
**Cursor:** Pointer (indicates select-only mode)

1. Note becomes selected
2. **Duration is NOT modified** - pure selection only
3. Audio plays the selected note/chord
4. No ghost preview is shown when holding Cmd/Ctrl

---

## Keyboard Workflow

### Duration Selection
| Key | Duration |
|-----|----------|
| `1` | Thirty-second |
| `4` | Sixteenth |
| `5` | Eighth |
| `6` | Quarter |
| `7` | Half |
| `8` | Whole |

Pressing a duration key (or clicking a toolbar button) **only changes the active duration for new notes**. Selected notes are **not modified**.

### Navigation (Arrow Keys)

| Keys | Action |
|------|--------|
| `←` / `→` | Move selection to previous/next event |
| `Cmd/Ctrl + ↑` / `Cmd/Ctrl + ↓` | Move selection between notes in a chord |

**Right Navigation Beyond Last Event:**
1. If measure has room → Cursor appears at append position
2. If measure is full → Cursor moves to next measure (created if needed)
3. Selection is cleared when cursor becomes active

**Left Navigation from Cursor:**
1. Selects last event in current measure
2. If current measure is empty, selects last event in previous measure
3. Cursor is cleared when selection becomes active

### Transposition (Arrow Up/Down without Cmd/Ctrl)

| Keys | Action |
|------|--------|
| `↑` / `↓` | Transpose selected note(s) by one step |
| `Shift + ↑` / `Shift + ↓` | Transpose selected note(s) by one octave |

- If a specific note is selected, only that note transposes
- If cursor is active (no selection), cursor pitch changes
- Audio plays the new pitch

### Note Entry (Enter)

**Precondition:** Cursor must be visible (previewNote exists)

**Behavior:**
1. Note is inserted at cursor position with:
   - Pitch from cursor
   - Duration from toolbar
   - Dotted state from toolbar
   - Accidental from toolbar (if set)
   - Tie state from toolbar (if set)
2. Measure is created if cursor was pointing to non-existent measure
3. Audio plays the added note
4. **Selection is cleared**
5. **Cursor advances to next available slot:**
   - If room in current measure → cursor moves to next insert position
   - If measure is full → cursor moves to next measure (append position)
   - Cursor retains the same pitch

### Accidentals

| Key | Accidental |
|-----|------------|
| `-` or `_` | Flat |
| `=` or `+` | Sharp |
| `0` | Natural |

- Toggles the accidental for the active toolbar state
- If a note is selected, applies accidental to that note
- Audio plays with the new accidental

### Ties

| Key | Action |
|-----|--------|
| `T` | Toggle tie on selected note |

### Delete

| Key | Action |
|-----|--------|
| `Backspace` / `Delete` | Delete selected note or event |

- If a specific note is selected in a chord, only that note is deleted
- If a note is the only one in an event, the entire event is deleted
- Selection is cleared after deletion

### Undo/Redo

| Keys | Action |
|------|--------|
| `Cmd/Ctrl + Z` | Undo |
| `Cmd/Ctrl + Shift + Z` or `Cmd/Ctrl + Y` | Redo |

---

## Measure Overflow Handling

When adding a note that would exceed the measure's time signature capacity:
1. If in APPEND mode and at last measure → A new measure is created, note is added there
2. If in INSERT mode → Note addition is rejected (no-op)

---

## Audio Feedback

Audio feedback plays in these scenarios:
- Note is added (plays the added note)
- Note is selected (plays the selected note/chord)
- Navigation changes selection (plays the newly selected note/chord)
- Transposition changes pitch (plays the new pitch)
- Accidental changes (plays the modified note)
