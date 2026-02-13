# Chord Symbols - Software Requirements Specification

**Feature:** Chord Symbols with Flexible Notation and Playback
**Issue:** [#29](https://github.com/joekotvas/riffscore/issues/29)
**Status:** Draft
**Date:** 2026-02-12
**Parent:** [PRD.md](./PRD.md)

---

## 1. Introduction

### 1.1 Purpose

This document specifies the detailed software requirements for the Chord Symbols feature, translating product requirements into technical specifications suitable for implementation.

### 1.2 Scope

This specification covers:
- Data structures for chord storage
- Parsing and normalization algorithms
- Notation system conversions
- User interaction behaviors
- Export format specifications
- Playback integration

### 1.3 Definitions

| Term | Definition |
|------|------------|
| **Canonical Form** | The normalized internal representation of a chord (e.g., `Cmaj7`) |
| **Chord Track** | The single array of chord symbols attached to a score |
| **Quant** | Smallest time unit; 96 quants = 1 whole note |
| **Anchor Quant** | The global quant position where a chord symbol is placed |
| **Display Notation** | The user-selected notation system for rendering |

---

## 2. Data Specifications

### 2.1 ChordSymbol Interface

```typescript
interface ChordSymbol {
  /** Unique identifier for this chord symbol */
  id: string;

  /** Global quant position (measureIndex * quantsPerMeasure + localQuant) */
  quant: number;

  /** Canonical chord representation (always letter-name based) */
  symbol: string;
}
```

#### 2.1.1 Field Specifications

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique within score; format: `chord_xxxxxxxx` (matches existing ID pattern) |
| `quant` | `number` | Yes | Non-negative integer; must align with event onset (note or rest) in at least one staff |
| `symbol` | `string` | Yes | Valid canonical chord symbol (see §2.2) |

> **Design Decision:** User input is normalized to canonical form immediately. The canonical form is always displayed (converted to the selected notation system). This simplifies the data model and ensures consistent behavior.

### 2.2 Canonical Chord Format

The canonical format uses **letter-name notation** with standardized quality symbols:

```
<root><quality><extension><alterations><bass>
```

#### 2.2.1 Root

Single uppercase letter with optional accidental (including double accidentals):
- `C`, `D`, `E`, `F`, `G`, `A`, `B`
- Sharps: `C#`, `F#`, etc.
- Flats: `Bb`, `Eb`, etc.
- Double sharps: `Fx`, `Cx`, etc. (x = double sharp)
- Double flats: `Bbb`, `Ebb`, etc.

#### 2.2.2 Quality

| Quality | Canonical | Aliases Accepted |
|---------|-----------|------------------|
| Major | (empty) | `maj`, `M`, `Δ`, `major` |
| Minor | `m` | `min`, `-`, `minor` |
| Diminished | `dim` | `°`, `o` |
| Augmented | `aug` | `+` |
| Dominant 7 | `7` | `dom7` |
| Major 7 | `maj7` | `M7`, `Δ7` |
| Minor 7 | `m7` | `min7`, `-7` |
| Half-diminished | `m7b5` | `ø`, `ø7` |
| Diminished 7 | `dim7` | `°7` |
| Suspended 4 | `sus4` | `sus` |
| Suspended 2 | `sus2` | |

#### 2.2.3 Extensions

- `9`, `11`, `13` - imply dominant 7
- `add9`, `add11` - add tone without 7th
- `6` - added 6th

#### 2.2.4 Alterations

Alterations appear in parentheses or adjacent:
- `#5`, `b5`, `#9`, `b9`, `#11`, `b13`

#### 2.2.5 Bass (Slash Chords)

Slash notation for inversions or bass notes:
- `C/E` - C major with E bass
- `Am/G` - A minor with G bass

### 2.3 ChordTrack on Score

```typescript
interface Score {
  // ... existing fields ...

  /** Chord symbols for harmonic annotation */
  chordTrack?: ChordSymbol[];
}
```

#### 2.3.1 Invariants

1. `chordTrack` array SHALL be sorted by `quant` ascending
2. No two chord symbols SHALL share the same `quant`
3. Each `quant` value SHALL correspond to an event onset (note or rest) in at least one staff

### 2.4 ChordDisplayConfig

```typescript
interface ChordDisplayConfig {
  /** Notation system for rendering */
  notation: 'letter' | 'roman' | 'nashville' | 'fixedDo' | 'movableDo';

  /** Use typographic symbols (△, °, +) vs text (maj, dim, aug) */
  useSymbols: boolean;
}
```

Default: `{ notation: 'letter', useSymbols: false }`

---

## 3. Algorithm Specifications

### 3.1 Chord Parsing

**Input:** User-entered string (e.g., `"Cmaj7"`, `"IVΔ7"`, `"2m"`)
**Output:** Canonical chord symbol or parse error

#### 3.1.1 Parsing Pipeline

```
Input → Trim → Detect Notation → Extract Components → Normalize → Canonical
```

1. **Trim:** Remove leading/trailing whitespace
2. **Detect Notation:** Identify if input is Roman, Nashville, or letter-based
3. **Extract Components:** Root, quality, extensions, alterations, bass
4. **Normalize:** Convert to canonical quality symbols
5. **Output:** Canonical string or `{ error: string }`

#### 3.1.2 Notation Detection Rules

| Pattern | Notation |
|---------|----------|
| Starts with `I`, `II`, `III`, `IV`, `V`, `VI`, `VII` (case-insensitive) | Roman |
| Starts with `1`-`7` | Nashville |
| Starts with `Do`, `Re`, `Mi`, `Fa`, `Sol`, `La`, `Si` | Solfège |
| Starts with `A`-`G` | Letter |

#### 3.1.3 Error Conditions

| Condition | Error Code |
|-----------|------------|
| Empty input | `CHORD_EMPTY` |
| Unrecognized root | `CHORD_INVALID_ROOT` |
| Invalid quality combination | `CHORD_INVALID_QUALITY` |
| Invalid bass note | `CHORD_INVALID_BASS` |

### 3.2 Notation Conversion

#### 3.2.1 Letter → Roman Numeral

**Input:** Canonical chord symbol, key signature
**Output:** Roman numeral representation

```
1. Extract root from canonical symbol
2. Calculate scale degree relative to key
3. Map degree to Roman numeral (I, ii, iii, IV, V, vi, vii°)
4. Preserve quality suffix
```

**Degree-to-Numeral Mapping (Major Key):**

| Degree | Diatonic Quality | Numeral |
|--------|------------------|---------|
| 1 | Major | I |
| 2 | Minor | ii |
| 3 | Minor | iii |
| 4 | Major | IV |
| 5 | Major | V |
| 6 | Minor | vi |
| 7 | Diminished | vii° |

**Degree-to-Numeral Mapping (Minor Key):**

| Degree | Diatonic Quality | Numeral |
|--------|------------------|---------|
| 1 | Minor | i |
| 2 | Diminished | ii° |
| 3 | Major | III |
| 4 | Minor | iv |
| 5 | Minor | v |
| 6 | Major | VI |
| 7 | Major | VII |

> **Note:** The system detects minor keys from the key signature (e.g., "Am", "Em"). Harmonic and melodic minor variations (raised 7th) are handled as non-diatonic alterations.

**Non-diatonic chords:** Use accidentals (e.g., `bVII`, `#IV`, `V` in minor for dominant)

#### 3.2.2 Letter → Nashville

**Input:** Canonical chord symbol, key signature
**Output:** Nashville number representation

```
1. Extract root from canonical symbol
2. Calculate scale degree relative to key
3. Output number with quality suffix
```

**Example:** `Dm` in key of C → `2m`

#### 3.2.3 Letter → Solfège

**Fixed Do:**
```
C→Do, D→Re, E→Mi, F→Fa, G→Sol, A→La, B→Si
```

**Movable Do:** Same as Nashville but with solfège syllables

### 3.3 Valid Quant Calculation

**Input:** Score state
**Output:** Set of quant positions where chords may be placed

```typescript
function getValidChordQuants(score: Score): Set<number> {
  const validQuants = new Set<number>();
  const quantsPerMeasure = getQuantsPerMeasure(score.timeSignature);

  for (const staff of score.staves) {
    for (let mIdx = 0; mIdx < staff.measures.length; mIdx++) {
      const measure = staff.measures[mIdx];
      let localQuant = 0;

      for (const event of measure.events) {
        if (!event.isRest) {
          const globalQuant = mIdx * quantsPerMeasure + localQuant;
          validQuants.add(globalQuant);
        }
        localQuant += getEventQuants(event);
      }
    }
  }

  return validQuants;
}
```

---

## 4. Interface Specifications

### 4.1 User Interaction States

```
┌─────────────────────────────────────────────────────────────┐
│                     CHORD TRACK STATES                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  IDLE ──────────────────────────────────────────────────┐   │
│    │                                                     │   │
│    │ click on empty valid position                       │   │
│    ▼                                                     │   │
│  CREATING ──────────────────────────────────────────────┤   │
│    │  │                                                  │   │
│    │  │ Escape / click away (empty)                      │   │
│    │  └─────────────────────────────────────────────────►│   │
│    │                                                     │   │
│    │ Enter / click away (valid)                          │   │
│    ▼                                                     │   │
│  IDLE ◄─────────────────────────────────────────────────┤   │
│    │                                                     │   │
│    │ click on existing chord                             │   │
│    ▼                                                     │   │
│  SELECTED ──────────────────────────────────────────────┤   │
│    │  │                                                  │   │
│    │  │ click away / Escape                              │   │
│    │  └─────────────────────────────────────────────────►│   │
│    │                                                     │   │
│    │ Enter / double-click / start typing                 │   │
│    ▼                                                     │   │
│  EDITING ───────────────────────────────────────────────┤   │
│    │  │                                                  │   │
│    │  │ Escape (restore previous)                        │   │
│    │  └──────────────────────────────────────►SELECTED   │   │
│    │                                                     │   │
│    │ Enter / click away (valid)                          │   │
│    ▼                                                     │   │
│  IDLE ◄─────────────────────────────────────────────────┘   │
│    ▲                                                         │
│    │ SELECTED + Escape → select topmost note at quant        │
│                                                              │
│  SELECTED + Delete/Backspace → Remove chord → IDLE          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Keyboard Bindings

#### 4.2.1 Navigation To/From Chord Track

| Context | Key (macOS) | Key (Windows/Linux) | Action |
|---------|-------------|---------------------|--------|
| Note selected | `Cmd+Shift+C` | `Ctrl+Shift+C` | Focus chord track, select chord at current quant (or first chord) |
| Topmost note selected | `Cmd+↑` | `Ctrl+↑` | If chord exists at quant, select chord; otherwise no action |
| Chord track focused | `Cmd+↓` | `Ctrl+↓` | Select topmost note at chord's quant |
| Chord track focused (not editing) | `Escape` | `Escape` | Return focus to staff, select topmost note group at selected chord's quant |
| Chord track focused (editing) | `Escape` | `Escape` | Exit edit mode, keep chord selected |
| Chord track focused | `←` | `←` | Select previous chord (wraps to end) |
| Chord track focused | `→` | `→` | Select next chord (wraps to start) |
| Chord track focused | `Home` | `Home` | Select first chord |
| Chord track focused | `End` | `End` | Select last chord |

#### 4.2.3 Keyboard Selection Behavior

When the chord track is focused:
1. Arrow keys navigate between existing chords (sorted by quant position)
2. If no chords exist, arrow keys have no effect
3. Navigation wraps: pressing `→` on the last chord selects the first
4. The selected chord receives visible focus indicator
5. Screen readers announce the selected chord's accessible name

#### 4.2.2 Chord Track Interactions

| State | Key | Action |
|-------|-----|--------|
| IDLE | Click valid position | → CREATING |
| IDLE | `Enter` on valid position | → CREATING |
| CREATING | `Enter` | Confirm if valid → IDLE |
| CREATING | `Escape` | Cancel → IDLE |
| CREATING | `Tab` | Confirm if valid, move to next valid position (next quant with event onset in any staff) |
| SELECTED | `Enter` | → EDITING |
| SELECTED | `Delete` / `Backspace` | Remove chord → IDLE |
| SELECTED | `Escape` | Return focus to staff, select topmost note at chord's quant |
| SELECTED | Any printable | Clear existing text, start with typed character → EDITING |
| EDITING | `Enter` | Confirm if valid → IDLE |
| EDITING | `Escape` | Cancel (restore) → SELECTED |
| EDITING | `Tab` | Confirm, move to next chord |
| EDITING | `Shift+Tab` | Confirm, move to previous chord |

#### 4.2.4 Vertical Navigation Cycle

The `Cmd/Ctrl + ↑/↓` shortcuts create a full wrap-around vertical navigation cycle that includes the chord track:

```
    ┌──────────────────────────────────────┐
    │                                      │
    ▼                                      │
┌─────────────────┐                        │
│  Chord Symbol   │  ← Cmd+↑ from topmost  │
└────────┬────────┘    (if chord exists)   │
         │ Cmd+↓                           │
         ▼                                 │
┌─────────────────┐                        │
│  Topmost Note   │  ← Staff index 0       │
└────────┬────────┘                        │
         │ Cmd+↓                           │
         ▼                                 │
┌─────────────────┐                        │
│  Lower Notes    │  ← Other staves        │
└────────┬────────┘                        │
         │ Cmd+↓                           │
         ▼                                 │
┌─────────────────┐                        │
│  Bottommost     │ ─── Cmd+↓ ─────────────┘
│  Note           │     (wraps to chord if exists)
└─────────────────┘
```

**Behavior:**
1. **Cmd+↑ from topmost note:**
   - Check if a chord exists at the current quant position
   - If yes, select the chord symbol (focus moves to chord track)
   - If no, no action (already at top of vertical stack)
2. **Cmd+↓ from chord:**
   - Select the topmost note at the chord's quant position
3. **Cmd+↓ from bottommost note:**
   - Check if a chord exists at the current quant position
   - If yes, wrap to chord symbol (focus moves to chord track)
   - If no, no action (already at bottom of vertical stack)
4. **Cmd+↑ from chord:**
   - No action (chord is at the top of the cycle)

#### 4.2.5 Focus Restoration Behavior

When returning focus from the chord track to the staff (via `Escape` from SELECTED state or `Cmd+↓`):

1. **Determine target quant:** Use the quant of the previously selected chord
2. **Find note groups at quant:** Query all staves for events starting at that quant position
3. **Select topmost note group:** Select the note group in the topmost staff (staff index 0) that has an event at that quant
4. **Fallback if no notes:** If no staff has a note at that quant (should not happen under normal conditions), clear selection and focus the first event in the first staff

### 4.3 Mouse Interactions

| Target | Action | Result |
|--------|--------|--------|
| Empty valid position | Click | → CREATING at position |
| Empty invalid position | Click | No action (cursor indicates invalid) |
| Existing chord | Click | → EDITING (direct to edit mode) |
| Existing chord | `Cmd/Ctrl + Click` | → SELECTED (without editing) |
| Existing chord | Double-click | → EDITING |
| Outside chord track | Click | → IDLE (confirm pending if valid) |

#### 4.3.1 Cursor Feedback

The chord track is invisible when empty, but the hit area remains interactive to allow creating the first chord:

| Hover Target | Modifier | Cursor |
|--------------|----------|--------|
| Valid position (event onset exists) | None | `text` cursor (indicates text entry) |
| Invalid position (no event onset) | None | `default` cursor (no visual affordance) |
| Existing chord | None | `text` cursor (indicates edit on click) |
| Existing chord | `Cmd/Ctrl` held | `pointer` cursor (indicates selection mode) |

> **Note:** Valid positions are determined by the presence of event onsets (notes or rests) in any staff at that quant. The cursor provides continuous feedback as the user moves the mouse across the chord track area.

#### 4.3.2 Selection Mode

Holding `Cmd` (macOS) or `Ctrl` (Windows/Linux) while hovering over a chord symbol changes the interaction mode:

1. **Cursor changes** from `text` to `pointer` to indicate selection mode
2. **Clicking** selects the chord without entering edit mode
3. **Audio feedback**: The chord voicing plays with eighth note duration

This allows users to:
- Select a chord for keyboard operations (arrow navigation, deletion)
- Preview the chord sound without editing
- Navigate the chord track via keyboard after selection

### 4.4 Audio Feedback

Chord playback provides auditory feedback during selection and navigation:

| Action | Audio Feedback |
|--------|----------------|
| `Cmd/Ctrl + Click` to select | Plays chord voicing (eighth note duration) |
| `Cmd + ↑/↓` to navigate to chord | Plays chord voicing (eighth note duration) |
| `←/→` or `Tab` between chords | Plays chord voicing (only when moving to a new chord) |
| Click to edit | No playback (entering edit mode) |
| Enter from selected to edit | No playback (mode toggle) |
| Escape from edit to selected | No playback (mode toggle) |

**Chord Voicing Algorithm:**
The `getChordVoicing()` function generates a balanced voicing:
1. Root in octave 2-3 (dynamic based on root pitch class)
2. Third in octave 3
3. Fifth in octave 4
4. Extensions (7th, 9th, etc.) in octave 4
5. Maximum 5 voices to avoid mud

### 4.5 API Methods

```typescript
interface ChordAPI {
  // ==================== CRUD Operations ====================

  /** Add a chord at the specified quant position */
  addChord(quant: number, symbol: string): MusicEditorAPI;

  /** Update an existing chord's symbol */
  updateChord(chordId: string, symbol: string): MusicEditorAPI;

  /** Remove a chord by ID */
  removeChord(chordId: string): MusicEditorAPI;

  /** Get all chords in the score */
  getChords(): ChordSymbol[];

  /** Get a single chord by ID */
  getChord(chordId: string): ChordSymbol | null;

  /** Get chord at a specific quant position */
  getChordAtQuant(quant: number): ChordSymbol | null;

  /** Get valid quant positions for chord placement */
  getValidChordQuants(): number[];

  // ==================== Selection ====================

  /** Select a chord by ID */
  selectChord(chordId: string): MusicEditorAPI;

  /** Select chord at a specific quant position */
  selectChordAtQuant(quant: number): MusicEditorAPI;

  /** Clear chord selection */
  deselectChord(): MusicEditorAPI;

  /** Get currently selected chord (null if none) */
  getSelectedChord(): ChordSymbol | null;

  /** Check if a chord is selected */
  hasChordSelection(): boolean;

  // ==================== Navigation ====================

  /** Move selection to next chord (wraps to first) */
  selectNextChord(): MusicEditorAPI;

  /** Move selection to previous chord (wraps to last) */
  selectPrevChord(): MusicEditorAPI;

  /** Select the first chord in the score */
  selectFirstChord(): MusicEditorAPI;

  /** Select the last chord in the score */
  selectLastChord(): MusicEditorAPI;

  /** Focus the chord track (enables keyboard navigation) */
  focusChordTrack(): MusicEditorAPI;

  /** Return focus to note selection */
  blurChordTrack(options?: {
    /** If true, select topmost note at the selected chord's quant position */
    selectNoteAtQuant?: boolean;
  }): MusicEditorAPI;

  /** Check if chord track is currently focused */
  isChordTrackFocused(): boolean;

  // ==================== Editing ====================

  /** Enter edit mode for selected chord */
  editSelectedChord(): MusicEditorAPI;

  /** Delete the selected chord */
  deleteSelectedChord(): MusicEditorAPI;

  // ==================== Configuration ====================

  /** Set chord display configuration */
  setChordDisplay(config: Partial<ChordDisplayConfig>): MusicEditorAPI;

  /** Get current chord display configuration */
  getChordDisplay(): ChordDisplayConfig;

  /** Set chord playback configuration */
  setChordPlayback(config: Partial<ChordPlaybackConfig>): MusicEditorAPI;

  /** Get current chord playback configuration */
  getChordPlayback(): ChordPlaybackConfig;
}
```

#### 4.4.1 API Usage Examples

```typescript
// Add a chord at beat 1 of measure 1 (quant 0)
api.addChord(0, 'Cmaj7');

// Add chord and select it
api.addChord(96, 'Am7').selectChordAtQuant(96);

// Navigate through chords
api.focusChordTrack().selectNextChord().selectNextChord();

// Edit the selected chord
const selected = api.getSelectedChord();
if (selected) {
  api.updateChord(selected.id, 'Dm7');
}

// Chain operations
api
  .selectChordAtQuant(0)
  .updateChord(api.getSelectedChord()!.id, 'C')
  .selectNextChord()
  .deleteSelectedChord();

// Switch display notation
api.setChordDisplay({ notation: 'roman', useSymbols: true });

// Return focus to staff, selecting note at current chord position
api.blurChordTrack({ selectNoteAtQuant: true });
```

---

## 5. Export Specifications

### 5.1 JSON Export

Chord track included as-is in the Score object:

```json
{
  "title": "My Song",
  "timeSignature": "4/4",
  "keySignature": "C",
  "chordTrack": [
    { "id": "chord-1", "quant": 0, "symbol": "C" },
    { "id": "chord-2", "quant": 96, "symbol": "Am" },
    { "id": "chord-3", "quant": 192, "symbol": "F" },
    { "id": "chord-4", "quant": 288, "symbol": "G" }
  ],
  "staves": [...]
}
```

### 5.2 ABC Export

Chord symbols use double-quoted annotation syntax:

```abc
X:1
T:My Song
M:4/4
K:C
"C"C D E F | "Am"A B c d | "F"F G A B | "G"G A B c |
```

#### 5.2.1 ABC Conversion Rules

1. Place chord annotation before the note at the anchor position
2. Use canonical symbol (no conversion needed for ABC)
3. Handle slash chords: `"C/E"` (ABC supports this)

### 5.3 MusicXML Export

Chords export as `<harmony>` elements within the measure:

```xml
<measure number="1">
  <harmony>
    <root>
      <root-step>C</root-step>
    </root>
    <kind>major</kind>
  </harmony>
  <note>...</note>
</measure>
```

#### 5.3.1 MusicXML Kind Mapping

| Canonical | MusicXML `<kind>` |
|-----------|-------------------|
| (major) | `major` |
| `m` | `minor` |
| `7` | `dominant` |
| `maj7` | `major-seventh` |
| `m7` | `minor-seventh` |
| `dim` | `diminished` |
| `aug` | `augmented` |
| `dim7` | `diminished-seventh` |
| `m7b5` | `half-diminished` |
| `sus4` | `suspended-fourth` |
| `sus2` | `suspended-second` |
| `6` | `major-sixth` |
| `m6` | `minor-sixth` |
| `9` | `dominant-ninth` |
| `maj9` | `major-ninth` |
| `m9` | `minor-ninth` |

#### 5.3.2 Slash Chord Export

```xml
<harmony>
  <root>
    <root-step>C</root-step>
  </root>
  <kind>major</kind>
  <bass>
    <bass-step>E</bass-step>
  </bass>
</harmony>
```

#### 5.3.3 Alteration Export

Alterations (`#9`, `b5`, `#11`, `b13`, etc.) are exported as `<degree>` elements:

```xml
<!-- C7#9 -->
<harmony>
  <root>
    <root-step>C</root-step>
  </root>
  <kind>dominant</kind>
  <degree>
    <degree-value>9</degree-value>
    <degree-alter>1</degree-alter>
    <degree-type>alter</degree-type>
  </degree>
</harmony>
```

**Alteration Mapping:**

| Alteration | `degree-value` | `degree-alter` | `degree-type` |
|------------|----------------|----------------|---------------|
| `#5` | 5 | 1 | alter |
| `b5` | 5 | -1 | alter |
| `#9` | 9 | 1 | alter |
| `b9` | 9 | -1 | alter |
| `#11` | 11 | 1 | alter |
| `b13` | 13 | -1 | alter |
| `add9` | 9 | 0 | add |
| `add11` | 11 | 0 | add |

---

## 6. Playback Specifications

### 6.1 Configuration

```typescript
interface ChordPlaybackConfig {
  /** Enable/disable chord playback */
  enabled: boolean;

  /** Velocity (0-127), default 50 */
  velocity: number;
}
```

### 6.2 Voicing Algorithm

1. **Root Position Close Voicing:**
   - Root in bass register with dynamic octave selection:
     - Roots C through F# → octave 3
     - Roots G through B → octave 2 (drop an octave to keep bass consistent)
   - Upper voices in close position (octave 3-4)

2. **Note Selection:**
   - Include root, 3rd, 5th (or altered)
   - Include 7th if present
   - Omit extensions beyond 7th for simplicity

3. **Duration:**
   - Sustain until next chord or end of measure containing the last note in the playback region

### 6.3 Timing

- Chord attacks align with anchor quant
- Velocity reduced to prevent overshadowing melody (default: 50 vs melody 80-100)

---

## 7. Error Handling

### 7.1 Parse Errors

| Code | Message | User Feedback |
|------|---------|---------------|
| `CHORD_EMPTY` | "Enter a chord symbol" | Placeholder text |
| `CHORD_INVALID_ROOT` | "Unrecognized root note" | Red border, tooltip |
| `CHORD_INVALID_QUALITY` | "Invalid chord quality" | Red border, tooltip |
| `CHORD_INVALID_BASS` | "Invalid bass note" | Red border, tooltip |

### 7.2 Placement Errors

| Code | Message |
|------|---------|
| `CHORD_INVALID_POSITION` | "Chords can only be placed where notes begin" |

### 7.2.1 Duplicate Position Behavior

When adding a chord at a position that already has a chord:
- The existing chord is **replaced** (not rejected)
- `api.result.status` is set to `'warning'` (not `'error'`)
- `api.result.code` is set to `'CHORD_REPLACED'`
- `api.result.message` indicates the replacement (e.g., "Replaced existing chord Cmaj7")
- The replaced chord is stored for undo

This allows convenient overwriting while still alerting the caller that a replacement occurred.

### 7.3 Lifecycle Errors

| Code | Message | Behavior |
|------|---------|----------|
| `CHORD_ORPHANED` | "Chord removed: anchor note was deleted" | Auto-remove chord, emit event |
| `CHORD_NOT_FOUND` | "Chord {id} not found" | API error on update/remove |

When a note deletion orphans a chord:
1. The chord is automatically removed
2. An `operation` event is emitted with code `CHORD_ORPHANED`
3. The removal is included in the same undo transaction as the note deletion

### 7.4 API Errors

All chord API methods follow the structured feedback pattern (ADR-011). Every operation sets `api.result` with the following fields:

```typescript
interface Result {
  /** Whether the operation succeeded */
  ok: boolean;

  /** Semantic status level: 'info' for success, 'warning' for partial success, 'error' for failure */
  status: 'info' | 'warning' | 'error';

  /** The API method that was called */
  method: string;

  /** Human-readable message describing the result */
  message: string;

  /** Error code for programmatic handling (present when ok is false) */
  code?: string;

  /** Additional context (optional) */
  details?: Record<string, unknown>;

  /** Timestamp when the result was generated */
  timestamp: number;
}
```

**Usage example:**

```typescript
api.addChord(100, 'Cmaj7');
if (!api.result.ok) {
  console.error(api.result.code, api.result.message);
  // api.result.status will be 'error'
} else {
  // api.result.status will be 'info'
}
```

**Complete Error Code Reference:**

| Code | Methods | Description |
|------|---------|-------------|
| `CHORD_EMPTY` | `addChord`, `updateChord` | Empty input string |
| `CHORD_INVALID_ROOT` | `addChord`, `updateChord` | Unrecognized root note |
| `CHORD_INVALID_QUALITY` | `addChord`, `updateChord` | Invalid chord quality |
| `CHORD_INVALID_BASS` | `addChord`, `updateChord` | Invalid slash bass note |
| `CHORD_INVALID_POSITION` | `addChord` | No note at quant position |
| `CHORD_NOT_FOUND` | `updateChord`, `removeChord`, `selectChord`, `selectChordAtQuant` | Chord ID or quant doesn't exist |
| `CHORD_ORPHANED` | (automatic) | Chord removed due to note deletion |
| `NO_CHORDS` | `selectNextChord`, `selectPrevChord` | Score has no chords to select |
| `NO_SELECTION` | `deleteSelectedChord`, `editSelectedChord` | No chord currently selected |

---

## 8. Accessibility Specifications

### 8.1 Screen Reader Support

| Element | ARIA Role | Accessible Name | Live Region |
|---------|-----------|-----------------|-------------|
| Chord track | `region` | "Chord symbols" | No |
| Chord symbol | `button` | Expanded name (e.g., "C major seventh at beat 1") | No |
| Chord input | `textbox` | "Enter chord symbol" | `aria-live="polite"` for errors |
| Selected chord | `button` | Include "(selected)" in name | No |

### 8.2 Accessible Chord Names

Symbols SHALL be expanded to readable text for screen readers:

| Symbol | Accessible Name |
|--------|-----------------|
| `Cmaj7` | "C major seventh" |
| `Dm` | "D minor" |
| `G7` | "G dominant seventh" |
| `Am7b5` | "A minor seventh flat five" |
| `F#dim` | "F sharp diminished" |
| `Bb/D` | "B flat over D" |
| `Esus4` | "E suspended fourth" |

### 8.3 Focus Management

1. **Focus trap in edit mode:** Tab cycles within input until Enter/Escape
2. **Focus restoration:** After chord operations, focus returns to logical position
3. **Skip link:** Chord track included in keyboard navigation landmark sequence

### 8.4 Visual Indicators

| State | Visual Indicator | Contrast Ratio |
|-------|------------------|----------------|
| Focused | 2px outline | ≥ 3:1 against background |
| Selected | Background highlight | ≥ 3:1 against unselected |
| Error | Red border + icon | ≥ 4.5:1 for text |
| Hover | Subtle background | ≥ 3:1 |

### 8.5 Motion & Timing

- No time limits on chord input
- Error messages persist until user action
- No auto-dismissing notifications

---

## 9. Test Specifications

### 9.1 Unit Tests

| Component | Test Cases |
|-----------|------------|
| Chord Parser | Valid inputs, invalid inputs, edge cases (double sharps, complex extensions) |
| Notation Converter | All 5 notation systems, all 12 keys, non-diatonic chords |
| Valid Quant Calculator | Empty score, single note, chords, rests, multiple staves |

### 9.2 Integration Tests

| Scenario | Verification |
|----------|--------------|
| Add chord via API | Chord appears in state, renders correctly |
| Edit chord via UI | State updates, display updates |
| Export with chords | ABC/MusicXML contain chord data |
| Playback with chords | Audio includes chord voices |

### 9.3 Coverage Requirements

- Parser: 100%
- Converter: 100%
- Commands: 80%+
- API methods: 80%+

---

## 10. Traceability Matrix

| PRD Requirement | SRS Section | Test ID |
|-----------------|-------------|---------|
| FR-01 (single track) | §2.3 | T-DATA-01 |
| FR-02 (quant anchor) | §2.1, §3.3 | T-DATA-02 |
| FR-05 (notation switch) | §3.2 | T-CONV-01 |
| FR-10 (input variations) | §3.1 | T-PARSE-01 |
| FR-25 (ABC export) | §5.2 | T-EXPORT-01 |
| FR-26 (MusicXML export) | §5.3 | T-EXPORT-02 |

---

## 11. Related Documents

- [PRD.md](./PRD.md) - Product Requirements Document
- [SDD.md](./SDD.md) - Software Design Document
- [ADR-011](../adr/011-structured-api-feedback.md) - Structured Feedback Pattern
