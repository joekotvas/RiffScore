# PianoRiffs Editor - Interaction Design Specification

## Overview
This document defines the interaction model for the PianoRiffs Sheet Music Editor. It is designed to be **fluid**, **context-aware**, and **forgiving**, bridging the gap between a text editor's precision and a creative canvas's freedom.

---

## 1. Core Philosophy
The editor operates on a "State of Intent" model. It always tries to guess whether you are trying to *create* something new or *modify* something that exists, adapting its interface accordingly.

### The Three States
At any given moment, the editor is in one of three logical states:

| State | Name | Intent | Visual Indicator |
| :--- | :--- | :--- | :--- |
| **IDLE** | **Navigation** | Exploring or reading the score. | No specific focus. Mouse cursor is a standard pointer. |
| **ENTRY** | **Entry Ready** | Preparing to add new notes. | A semi-transparent **"Ghost Note"** follows your mouse or cursor, showing exactly where a note will be placed. |
| **SELECTION** | **Selection Ready** | Modifying existing music. | One or more notes are **highlighted in the primary accent color**. The "Ghost Note" disappears. |

---

## 2. Visual Language
The interface uses color and style to communicate status instantly.

### Cursors & Focus
*   **Ghost Note**: A shadow of a note that appears when hovering over empty space or moving the insertion cursor. It indicates "If you click now, this appears."
*   **Accent Color Highlight**: Indicates a selected element that will be affected by your next command (delete, pitch change, duration change).
*   **Focus Memory**: If you click away or stop editing, the editor remembers your last position. Pressing an arrow key will instantly snap focus back to where you left off.

### Duration Buttons (Toolbar)
The duration buttons (Whole, Half, Quarter, etc.) change appearance based on context:
*   **Solid Filled**: The current input duration is active (Entry Mode) OR all selected notes share this duration (Selection Mode).
*   **Dashed Outline**: You have selected multiple notes with **different** durations. This indicates a "Mixed State". (Clicking it creates uniformity).
*   **Standard/Outline**: Available but not active.

### Beams
*   **Standard**: Beams in the default note color connect notes rhythmically.
*   **Highlighted**: A beam turns to the **accent color only if every note in the beamed group is selected**. Partial selection leaves the beam neutral to avoid visual clutter.

---

## 3. Navigation & Focus
The editor treats music like a document. You can navigate spatially (Mouse) or structurally (Keyboard).

### Mouse Interaction
*   **Hover**: Hovering over a measure activates **Entry Mode**, showing a Ghost Note.
*   **Click (Empty Space)**: Commits the Ghost Note to the score.
*   **Click (Existing Note)**: Enters **Selection Mode** for that note.
*   **Click (Background)**: Deselects everything and returns to **Idle Mode**, but remembers your position.

### Keyboard Interaction
*   **Left / Right Arrows**: Move selection to the previous/next note or rest.
    *   *Smart Resume*: If you have no selection (Idle), pressing a **Left or Right** arrow key restores selection to your last active note.
*   **Shift + Arrows**: Extends selection to multiple notes.
*   **Up / Down Arrows**: Transposes the selected note(s) by semitone.
*   **Enter**: In Entry Mode, commits the Ghost Note.
*   **Duration Shortcuts**:
    *   `1`: Sixty-fourth Note
    *   `2`: Thirty-second Note
    *   `3`: Sixteenth Note
    *   `4`: Eighth Note
    *   `5`: Quarter Note
    *   `6`: Half Note
    *   `7`: Whole Note

---

## 4. Note Entry
The goal is "What You See Is What You Get".

### Mouse Entry
1.  Select a duration from the toolbar (e.g., Quarter Note).
2.  Move your mouse over a measure. A **Ghost Note** appears, snapping to valid rhythmic lines.
3.  **Click** to place the note.
    *   *Behavior*: The note is added, but **not selected**. This allows you to immediately click again to add more notes without needing to deselect the previous one. Focus Memory is updated so you can switch to keyboard navigation immediately.

### Keyboard Entry
1.  Navigate to a position (Cursor/Ghost Note is visible).
2.  Press **Enter** to place a note at the cursor's pitch.
3.  Auto-advance: The cursor automatically moves to the next rhythmic slot.

---

## 5. Selection & Transformation
Modifying music should feel safe and predictable.

### Selection Rules
*   **Single Click**: Selects a note.
*   **Cmd/Ctrl + Click**: Adds/Removes a note from the selection (Multi-Select).
*   **Shift + Click**: Selects a range of notes.
*   **Drag Selection**: Click and drag to draw a box around multiple notes.

### Transformation Logic
When you have a selection and click a **Duration Button**:
1.  **Uniform Selection**: If all instances validly fit the new duration, they update.
2.  **Mixed Selection (Dashed Outline)**: If notes differ, clicking a duration attempts to force them all to the target duration.
3.  **Safety Check**: If expanding a note (e.g., 16th to Quarter) would overlap specifically locked elements or exceed the measure, that specific note **fails silently**, while others in the selection still update. This ensures one error doesn't block the entire batch operation.

### Beam Logic
*   Selecting a single note in a beamed group highlights *that note*, not the beam.
*   Selecting *all* notes in the group highlights the *beam* as well, indicating the entire structure is selected.

---

## 6. Definitions
*   **Hit Zone**: An invisible vertical slice of a measure that detects where your mouse is.
*   **Flow**: The editor allows seamless switching between Mouse and Keyboard. You can click to place a note, then immediately use Arrow keys to correct its pitch.

---

## 7. Keyboard Shortcuts Reference

### General
| Key | Action |
| --- | --- |
| `Space` | Play / Pause (from selection or start) |
| `Shift + Space` | Play from last start position |
| `Cmd/Ctrl + Shift + Space` | Play from Beginning |
| `P` | Play from selection |
| `Esc` | Deselect All / Close Menus / Stop Playback |
| `Cmd/Ctrl + Z` | Undo |
| `Cmd/Ctrl + Shift + Z` (or `Y`) | Redo |

### Navigation & Selection
| Key | Action |
| --- | --- |
| `←` / `→` | Select Previous / Next Note |
| `Shift + ←` / `→` | Extend Selection |
| `Cmd/Ctrl + ↑` / `↓` | Select Note within Chord (Intra-chord navigation) |
| `Alt + ↑` / `↓` | Switch Staff (Grand Staff) |

### Note Entry & Modification
| Key | Action |
| --- | --- |
| `Enter` | Insert Note (at Cursor) |
| `Delete` / `Backspace` | Delete Selection |
| `↑` / `↓` | Transpose Selection (Semitone) |
| `Shift + ↑` / `↓` | Transpose Selection (Octave) |
| `1` - `7` | Select Duration (64th to Whole) |
| `-` / `_` | Flat |
| `=` / `+` | Sharp |
| `0` | Natural |
| `T` | Toggle Tie |
