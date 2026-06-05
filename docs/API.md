[← Back to README](../README.md)

# RiffScore Machine-Addressable API Reference

> Programmatic control of the score editor via JavaScript.

> **See also**: [Cookbook](./COOKBOOK.md) • [Configuration](./CONFIGURATION.md) • [Architecture](./ARCHITECTURE.md) • [Coding Patterns](./CODING_PATTERNS.md)

**Version:** 1.0.0-alpha.14  
**Access:**
-   **React**: `const ref = useRef<MusicEditorAPI>(null)`
-   **Global**: `window.riffScore.get('my-score-id')` or `window.riffScore.active`

---

## Implementation Status

> [!NOTE]
> Methods marked ✅ are **ready to use**. Methods marked ⏳ are **pending implementation** and will return `this` (no-op) or throw for queries.

---

## Design Philosophy

| Principle | Description |
| :--- | :--- |
| **Intent-Based** | Methods describe *what* to do, not *how*. |
| **Fluent/Chainable** | All mutation/navigation methods return `this`. |
| **Synchronous** | State updates are immediate; React render is decoupled. |
| **Multi-Instance** | Registry supports multiple editors on one page. |
| **Fail-Safe** | Invalid inputs are no-ops or clamped to valid ranges. Returns `Result` object. |

---

## Internal Architecture

The API is implemented using a **factory pattern** with 13 domain-specific modules:

```
src/hooks/api/
├── index.ts        # Barrel exports
├── types.ts        # APIContext interface
├── navigation.ts   # move, jump, select, selectById
├── selection.ts    # selectAll, extend*, selectFullEvents
├── entry.ts        # addNote, addRest, addTone
├── modification.ts # setPitch, transpose, structure
├── history.ts      # undo, redo, transactions
├── playback.ts     # play, pause, stop
├── io.ts           # loadScore, reset, export
├── events.ts       # on() subscription wrapper
├── chords.ts       # addChord, updateChord, removeChord, selectChord
├── layout.ts       # getViewMode, setViewMode, toggleViewMode, getLayoutConfig
└── metadata.ts     # getMetadata, setMetadata, getTitle, setTitle, etc.
```

Each factory receives an `APIContext` containing refs and dispatch functions, then returns methods bound to `this` via `ThisType<MusicEditorAPI>` for fluent chaining.

### Method Status Tags

All methods in `src/api.types.ts` are annotated with `@status` JSDoc tags:
- `@status implemented` — Ready to use
- `@status stub` — Returns `this` (no-op), tracked in [Issue #119](https://github.com/joekotvas/RiffScore/issues/119)
- `@status partial` — Partially implemented (some arguments or code paths work, others are no-ops or throw)

---

## 1. Global Registry ✅

### `window.riffScore.get(id)` ✅
| Argument | Type | Required | Notes |
| :--- | :--- | :--- | :--- |
| `id` | `string` | Yes | Must match `<RiffScore id="..." />` prop. |

**Returns:** `MusicEditorAPI | undefined`

### `window.riffScore.active` ✅
The most recently focused or mounted instance.

**Returns:** `MusicEditorAPI | null`

---

## Indexing Convention

> **All indices are 0-based.** Use `select(0)` for the first measure, `select(1)` for the second, etc.

For user-facing display, use `toDisplayMeasureNumber()` from `@/utils/measureIndex`.

---

## 2. Navigation

| Method | Signature | Status | Description |
| :--- | :--- | :--- | :--- |
| `move` | `move(direction)` | ✅ | Navigate in any direction (left/right/up/down). |
| `jump` | `jump(target)` | ✅ | `'start-score'`, `'end-score'`, `'start-measure'`, `'end-measure'`. |
| `select` | `select(measureIndex, staffIndex?, eventIndex?, noteIndex?)` | ✅ | Absolute targeting (0-based indices). |
| `selectAtQuant` | `selectAtQuant(measureIndex, quant, staffIndex?)` | ✅ | Target by rhythmic position. |
| `selectById` | `selectById(eventId, noteId?)` | ✅ | Target by internal IDs. |

---

## 3. Selection (Multi-Select)

| Method | Signature | Status | Description |
| :--- | :--- | :--- | :--- |
| `addToSelection` | `addToSelection(measureIndex, staffIndex, eventIndex, noteIndex?)` | ✅ | Cmd+Click toggle behavior. |
| `selectRangeTo` | `selectRangeTo(measureIndex, staffIndex, eventIndex, noteIndex?)` | ✅ | Shift+Click range from anchor. |
| `selectAll` | `selectAll(scope)` | ✅ | `'score'`, `'measure'`, `'staff'`, `'event'`. |
| `selectEvent` | `selectEvent(measureIndex?, staffIndex?, eventIndex?)` | ✅ | Select all notes in chord. |
| `deselectAll` | `deselectAll()` | ✅ | Clear selection. |
| `selectFullEvents` | `selectFullEvents()` | ✅ | Fill partial chord selections. |
| `extendSelectionUp` | `extendSelectionUp()` | ✅ | Vertical extend toward treble. |
| `extendSelectionDown` | `extendSelectionDown()` | ✅ | Vertical extend toward bass. |
| `extendSelectionAllStaves` | `extendSelectionAllStaves()` | ✅ | Vertical extend to all staves. |

---

## 4. Entry (Create)

| Method | Signature | Status | Description |
| :--- | :--- | :--- | :--- |
| `addNote` | `addNote(pitch, duration?, dotted?, options?)` | ✅ | Append note at cursor; auto-advances. `options.mode`: `'overwrite' \| 'insert'`. |
| `addRest` | `addRest(duration?, dotted?, options?)` | ✅ | Append rest at cursor. `options.mode`: `'overwrite' \| 'insert'`. |
| `addTone` | `addTone(pitch)` | ✅ | Stack pitch onto existing chord. |
| `makeTuplet` | `makeTuplet(numNotes, inSpaceOf)` | ✅ | Convert selection to tuplet. |
| `unmakeTuplet` | `unmakeTuplet()` | ✅ | Remove tuplet grouping. |
| `toggleTie` | `toggleTie()` | ✅ | Toggle tie to next note. |
| `setTie` | `setTie(boolean)` | ✅ | Explicit tie setting. |
| `setInputMode` | `setInputMode('note' \| 'rest')` | ✅ | Set entry mode (UI state). |

---

## 5. Modification (Update)

| Method | Signature | Status | Description |
| :--- | :--- | :--- | :--- |
| `setPitch` | `setPitch(pitch)` | ✅ | Update selected note(s). |
| `setDuration` | `setDuration(duration, dotted?)` | ✅ | Update selected event(s). |
| `setAccidental` | `setAccidental(type)` | ✅ | `'sharp'`, `'flat'`, `'natural'`, `null`. |
| `toggleAccidental` | `toggleAccidental()` | ✅ | Cycle accidental. |
| `transpose` | `transpose(semitones)` | ✅ | Chromatic transposition. |
| `transposeDiatonic` | `transposeDiatonic(steps)` | ✅ | Visual/diatonic transposition. |
| `setAccidentalDisplay` | `setAccidentalDisplay(policy)` | ✅ | Display policy for selected note(s): `'auto' \| 'show' \| 'hide' \| 'courtesy'`. Orthogonal to sounding pitch. |
| `updateEvent` | `updateEvent(props)` | ✅ | Generic escape hatch. |

---

## 6. Structure

| Method | Signature | Status | Description |
| :--- | :--- | :--- | :--- |
| `addMeasure` | `addMeasure(atIndex?)` | ✅ | Add measure at index (default: end). |
| `deleteMeasure` | `deleteMeasure(measureIndex?)` | ✅ | Delete measure (default: selected). |
| `deleteSelected` | `deleteSelected()` | ✅ | Smart delete. |
| `setKeySignature` | `setKeySignature(key)` | ✅ | Change key signature. |
| `setTimeSignature` | `setTimeSignature(sig)` | ✅ | Change time signature. |
| `setMeasurePickup` | `setMeasurePickup(isPickup)` | ✅ | Toggle pickup measure. |

---

## 7. Configuration

| Method | Signature | Status | Description |
| :--- | :--- | :--- | :--- |
| `setClef` | `setClef(clef)` | ✅ | `'treble'`, `'bass'`, `'alto'`, `'tenor'`, `'grand'`. |
| `setScoreTitle` | `setScoreTitle(title)` | ✅ | Update title. |
| `setBpm` | `setBpm(number)` | ✅ | Set tempo. |
| `setTheme` | `setTheme(theme)` | ✅ | `'LIGHT'`, `'DARK'`, `'WARM'`, `'COOL'`. |
| `setScale` | `setScale(number)` | ✅ | Zoom factor. |
| `setStaffLayout` | `setStaffLayout(type)` | ✅ | `'grand'`, `'single'`. |

---

## 8. Lifecycle & IO

| Method | Signature | Status | Description |
| :--- | :--- | :--- | :--- |
| `loadScore` | `loadScore(score)` | ✅ | Load a `Score` object. |
| `reset` | `reset(template?, measures?)` | ✅ | Reset to blank score/template. |
| `export` | `export(format)` | ✅ | Returns string (empty on error). `'json' \| 'abc' \| 'musicxml'`. |

---

## 9. Playback

| Method | Signature | Status | Description |
| :--- | :--- | :--- | :--- |
| `play` | `play(startMeasure?, startQuant?)` | ✅ | Start/resume playback (async). |
| `pause` | `pause()` | ✅ | Pause (retains position). |
| `stop` | `stop()` | ✅ | Stop and reset to beginning. |
| `rewind` | `rewind(measureNum?)` | ✅ | Jump playback position. |
| `setInstrument` | `setInstrument(instrumentId)` | ✅ | `'bright'`, `'mellow'`, `'organ'`, `'piano'`. |

---

## 10. Data (Queries)

| Method | Signature | Status | Description |
| :--- | :--- | :--- | :--- |
| `getScore` | `getScore()` | ✅ | Read-only score state. |
| `getConfig` | `getConfig()` | ✅ | Current config. |
| `getSelection` | `getSelection()` | ✅ | Current selection state. |

---

## 11. Chord Symbols ✅

### CRUD

| Method | Signature | Status | Description |
| :--- | :--- | :--- | :--- |
| `addChord` | `addChord(position, symbol)` | ✅ | Add chord symbol at `{ measure, quant }`. |
| `updateChord` | `updateChord(chordId, symbol)` | ✅ | Update an existing chord symbol. |
| `removeChord` | `removeChord(chordId)` | ✅ | Remove a chord symbol. |
| `getChords` | `getChords()` | ✅ | Get all chords sorted by position ascending. |
| `getChord` | `getChord(chordId)` | ✅ | Get a specific chord by ID. |
| `getChordAt` | `getChordAt(position)` | ✅ | Get the chord at `{ measure, quant }` (or `null`). |
| `getValidChordPositions` | `getValidChordPositions()` | ✅ | `Map<measure, Set<quant>>` of valid chord positions. |

### Selection

| Method | Signature | Status | Description |
| :--- | :--- | :--- | :--- |
| `selectChord` | `selectChord(chordId)` | ✅ | Select a chord by ID. |
| `selectChordAt` | `selectChordAt(position)` | ✅ | Select the chord at `{ measure, quant }`. |
| `deselectChord` | `deselectChord()` | ✅ | Deselect the currently selected chord. |
| `deleteSelectedChord` | `deleteSelectedChord()` | ✅ | Remove the currently selected chord. |
| `getSelectedChord` | `getSelectedChord()` | ✅ | Get the currently selected chord. |
| `hasChordSelection` | `hasChordSelection()` | ✅ | Check if a chord is selected. |

### Focus

| Method | Signature | Status | Description |
| :--- | :--- | :--- | :--- |
| `focusChordTrack` | `focusChordTrack()` | ✅ | Move focus into the chord track for keyboard editing. |
| `blurChordTrack` | `blurChordTrack(options?)` | ✅ | Leave the chord track. `options.selectNoteAtQuant`: re-select the note under the chord. |
| `isChordTrackFocused` | `isChordTrackFocused()` | ✅ | Whether the chord track currently has focus. |

### Navigation

| Method | Signature | Status | Description |
| :--- | :--- | :--- | :--- |
| `selectNextChord` | `selectNextChord()` | ✅ | Select the next chord in sequence. |
| `selectPrevChord` | `selectPrevChord()` | ✅ | Select the previous chord. |
| `selectFirstChord` | `selectFirstChord()` | ✅ | Select the first chord in the score. |
| `selectLastChord` | `selectLastChord()` | ✅ | Select the last chord in the score. |

### Configuration

| Method | Signature | Status | Description |
| :--- | :--- | :--- | :--- |
| `setChordDisplay` | `setChordDisplay(config)` | ⏳ | `{ notation, useSymbols }`. |
| `setChordPlayback` | `setChordPlayback(config)` | ⏳ | `{ enabled, velocity }`. |
| `getChordDisplay` | `getChordDisplay()` | ✅ | Get current chord display config. |
| `getChordPlayback` | `getChordPlayback()` | ✅ | Get current chord playback config. |

---

## 12. Layout & View Mode ✅

| Method | Signature | Status | Description |
| :--- | :--- | :--- | :--- |
| `getViewMode` | `getViewMode()` | ✅ | Get current view mode (`'scroll'` or `'page'`). |
| `setViewMode` | `setViewMode(mode)` | ✅ | Set view mode. |
| `toggleViewMode` | `toggleViewMode()` | ✅ | Toggle between scroll and page view. |
| `getLayoutConfig` | `getLayoutConfig()` | ✅ | Get current layout configuration. |
| `setLayoutConfig` | `setLayoutConfig(config)` | ✅ | Update layout configuration (partial merge). |
| `resetLayoutConfig` | `resetLayoutConfig()` | ✅ | Reset layout configuration to defaults. |

### LayoutConfig Properties

```typescript
interface LayoutConfig {
  pageSize: 'letter' | 'a4';           // Page dimensions
  margins: 'narrow' | 'normal' | 'wide'; // Margin preset
  staffSize: number;                    // 50-150 (percentage)
  systemSpacing: 'compact' | 'normal' | 'relaxed';
  viewMode: 'scroll' | 'page';
}
```

---

## 13. Metadata ✅

| Method | Signature | Status | Description |
| :--- | :--- | :--- | :--- |
| `getMetadata` | `getMetadata()` | ✅ | Get complete score metadata. |
| `setMetadata` | `setMetadata(metadata)` | ✅ | Update metadata (partial merge). |
| `getTitle` | `getTitle()` | ✅ | Get score title. |
| `setTitle` | `setTitle(title)` | ✅ | Set score title. |
| `getComposer` | `getComposer()` | ✅ | Get composer name. |
| `setComposer` | `setComposer(composer)` | ✅ | Set composer name. |
| `getLyricist` | `getLyricist()` | ✅ | Get lyricist name. |
| `setLyricist` | `setLyricist(lyricist)` | ✅ | Set lyricist name. |
| `getCopyright` | `getCopyright()` | ✅ | Get copyright notice. |
| `setCopyright` | `setCopyright(copyright)` | ✅ | Set copyright notice. |
| `selectFirstElement` | `selectFirstElement()` | ✅ | Select first note (for Tab from metadata). |
| `selectLastElement` | `selectLastElement()` | ✅ | Select last note (for Shift+Tab from metadata). |

### ScoreMetadata Properties

```typescript
interface ScoreMetadata {
  title?: string;      // Required for Score Setup save
  composer?: string;   // Optional
  lyricist?: string;   // Optional
  copyright?: string;  // Appears on page 1 footer
}
```

---

## 14. History & Clipboard

| Method | Signature | Status | Description |
| :--- | :--- | :--- | :--- |
| `undo` | `undo()` | ✅ | Undo last mutation. |
| `redo` | `redo()` | ✅ | Redo last undone. |
| `beginTransaction` | `beginTransaction()` | ✅ | Start batch (single undo step). |
| `commitTransaction` | `commitTransaction(label?)` | ✅ | End batch; `label` is delivered on the `'batch'` event (default `'Batch Action'`). |
| `rollbackTransaction` | `rollbackTransaction()` | ✅ | Abort batch and revert changes. |
| `copy` | `copy()` | ⏳ | Copy selection. |
| `cut` | `cut()` | ⏳ | Cut selection. |
| `paste` | `paste()` | ⏳ | Paste at cursor. |

---

## 15. Batch & Feedback

| Method | Signature | Status | Description |
| :--- | :--- | :--- | :--- |
| `collect` | `collect(callback)` | ✅ | Execute batch and aggregate results. |
| `result` | `get result()` | ✅ | Get result of last operation (`{ ok, status, method, message, timestamp, code?, details? }`). |
| `ok` | `get ok()` | ✅ | Helper check for `result.ok`. |
| `hasError` | `get hasError()` | ✅ | Sticky flag if *any* error occurred since clear. |
| `clearStatus` | `clearStatus()` | ✅ | Reset sticky `hasError` flag. |
| `debug` | `debug(enabled)` | ✅ | Enable or disable verbose batch/debug output for development. |

---

## 16. Events & Subscriptions

| Method | Signature | Status | Description |
| :--- | :--- | :--- | :--- |
| `on` | `on(event, callback)` | ✅ | Subscribe to state changes. |

### Event Types
- `'score'` — Score mutations
- `'selection'` — Selection changes
- `'playback'` — Play/pause state (Pending)
- `'batch'` — Batch transaction commit. Payload (`BatchEventPayload`): `{ type: 'batch', label?: string, timestamp: number, commands: { type: string, summary?: string }[], affectedMeasures: number[] }`. `label` is the value passed to `commitTransaction(label)` (default `'Batch Action'`); `affectedMeasures` is currently always empty (reserved).
- `'operation'` — Any API method call (Payload: `Result`)
- `'error'` — Any API error (Payload: `Result`)

**Returns:** `() => void` — Unsubscribe function.

### Callback Timing

> [!IMPORTANT]
> Callbacks fire **after React processes state updates** (via `useEffect`), not synchronously.
> This ensures callbacks receive **guaranteed-fresh data**.

In tests, use `waitFor()` from `@testing-library/react`:
```javascript
await waitFor(() => {
  expect(callback).toHaveBeenCalled();
});
```

---

## 17. Error Handling

API methods implement a **Fail-Soft** pattern. They never throw errors (except for critical system failures).

### Structured Feedback
Every method updates the internal `result` state:
- **`ok`**: `true` / `false`
- **`code`**: string error code (e.g., `'INVALID_PITCH'`)
- **`message`**: Human-readable description
- **`details`**: Optional context object

### Sticky Error State
The `hasError` flag is "sticky"—it remains `true` if *any* operation in a chain fails, until explicitly cleared.

```javascript
api.addNote('Bad').addNote('Good');
console.log(api.hasError); // true (from first op)
api.clearStatus();
```

| Scenario | Behavior |
| :--- | :--- |
| Invalid `measureNum` | Clamped to valid range. |
| Invalid `pitch` format | `ok: false`, `code: 'INVALID_PITCH'`. |
| `export` unknown format | `ok: false`, `code: 'NOT_IMPLEMENTED'`; returns `''`. |

---

## 18. Usage Examples

### Linear Entry ✅
```javascript
api.select(0).addNote('C4').addNote('D4').addNote('E4');
```

### Build Chord ✅
```javascript
api.select(0).addNote('C4').move('left').addTone('E4').addTone('G4');
```

### Query State ✅
```javascript
const score = api.getScore();
const selection = api.getSelection();
console.log(score.title);
```

### Export JSON ✅
```javascript
const json = api.export('json');
localStorage.setItem('score', json);
```

### Batch with Transaction ✅
```javascript
api.beginTransaction();
for (let i = 0; i < 16; i++) {
  api.addNote(`C${(i % 3) + 4}`, 'sixteenth');
}
api.commitTransaction('Insert 16th Run');
```

### Reactive Integration ✅
```javascript
const unsub = api.on('score', (newScore) => {
  backend.save(newScore);
});
```

---

[← Back to README](../README.md)
