[← Back to README](../README.md) • [Architecture](./ARCHITECTURE.md)

# RiffScore Data Model

> Deep dive into the Score schema, quant system, and data structures.

> **See also**: [Architecture](./ARCHITECTURE.md) • [Commands](./COMMANDS.md) • [Selection Model](./SELECTION.md) • [Coding Patterns](./CODING_PATTERNS.md)

---

## 1. Score Structure

```typescript
Score {
  schemaVersion?: number      // Persisted schema version; stamped by migrateScore (current SCHEMA_VERSION = 2)
  title: string
  timeSignature: string       // "4/4", "3/4", "6/8"
  keySignature: string        // "C", "G", "F#", "Bb"
  bpm: number
  staves: Staff[]
  chordTrack?: ChordSymbol[]  // Sorted by position ascending
  metadata?: ScoreMetadata    // Title/composer/lyricist/copyright for display & export
  layout?: LayoutConfig       // Page/system layout configuration
}
```

> **Schema versioning:** `SCHEMA_VERSION` is currently **2**. `migrateScore` upgrades
> older scores on load (e.g. key-signature canonicalization and `note.accidental`
> reconciliation) and stamps the current version. Scores without `schemaVersion` are
> treated as legacy (pre-versioning) and migrated.

---

## 2. Staff

```typescript
Staff {
  id: string
  clef: 'treble' | 'bass' | 'alto' | 'tenor' | 'grand'
  keySignature: string        // Can override score-level
  measures: Measure[]
}
```

### Grand Staff

A grand staff contains two staves (treble + bass) visually connected by a brace. In the data model, `clef: 'grand'` indicates this layout.

---

## 3. Measure

```typescript
Measure {
  id: string
  isPickup?: boolean          // Anacrusis/upbeat
  events: ScoreEvent[]
}
```

### Pickup Measures

A pickup measure (`isPickup: true`) precedes the first full measure. It may have fewer beats than the time signature indicates.

---

## 4. ScoreEvent

The fundamental rhythmic unit:

```typescript
ScoreEvent {
  id: string
  duration: string            // "whole", "half", "quarter", etc.
  dotted: boolean             // Adds 50% duration
  notes: Note[]               // Multiple notes = chord; one pitchless note for a rest
  isRest?: boolean            // Rest vs notes
  chord?: string | null       // Per-event chord symbol (distinct from Score.chordTrack)
  tuplet?: { ratio, groupSize, position, baseDuration?, id? }  // Inline tuplet grouping (see §7)
}
```

### Duration Names

| Name | Quants | Musical Value |
|------|--------|---------------|
| `whole` | 64 | 4 beats |
| `half` | 32 | 2 beats |
| `quarter` | 16 | 1 beat |
| `eighth` | 8 | 1/2 beat |
| `sixteenth` | 4 | 1/4 beat |
| `thirtysecond` | 2 | 1/8 beat |
| `sixtyfourth` | 1 | 1/16 beat |

### Dotted Values

A dot adds 50% duration:
- Dotted quarter = 16 + 8 = 24 quants
- Dotted half = 32 + 16 = 48 quants

---

## 5. Note

```typescript
Note {
  id: string
  pitch: string | null        // "C4", "F#5", "Bb3", null for rests — the source of truth
  accidental?: 'sharp' | 'flat' | 'natural' | null  // Derived mirror of pitch (see below)
  accidentalDisplay?: 'auto' | 'show' | 'hide' | 'courtesy'  // Display policy; omitted === 'auto'
  tied?: boolean              // Tied to next note
  isRest?: boolean            // Redundant with event for clarity
}
```

> **`pitch` is the single source of truth for alteration.** `accidental` is a *derived
> mirror* of the pitch spelling (reconciled from `pitch` on load via
> `reconcileNoteAccidentalMirror`) and is never authoritative for rendering or export —
> the resolver derives the displayed glyph from `pitch` plus the key/measure context.
> `accidentalDisplay` is a separate **display policy** (force / hide / courtesy) that
> never changes the sounding pitch; it only affects whether and how the glyph is drawn.

### Pitch Format

Pitches use **Scientific Pitch Notation**:
- Letter: `C`, `D`, `E`, `F`, `G`, `A`, `B`
- Accidental: `#` (sharp), `b` (flat)
- Octave: `0-9` (middle C = C4)

Examples: `C4`, `F#5`, `Bb3`, `G#2`

### Why Absolute Pitches?

Storing `F#4` instead of "scale degree 4" means:
- **Transposition is explicit**: No ambiguity about enharmonics
- **Key independence**: Score data doesn't change when key changes
- **Rendering clarity**: MusicService determines if accidental is visible

---

## 5a. Chord Symbols

```typescript
ChordSymbol {
  id: string                    // Unique identifier
  measure: number               // 0-based measure index
  quant: number                 // Local quant position within the measure (0 = start)
  symbol: string                // Canonical letter notation: 'Cmaj7', 'Dm', 'G7'
}
```

Chord symbols live in `Score.chordTrack[]`, anchored to a **measure-local position**
(`{ measure, quant }`, with `quant` relative to the start of that measure — *not* a
global offset). Measure-local anchoring keeps chords correctly attached when measures
are inserted, deleted, or reflowed. They are independent of staves and render above the
top staff. (An older v1 layout stored a single global `quant`; `migrateChordTrack`
upgrades those scores on load.)

### Input Formats

The `ChordParser` accepts multiple input formats and normalizes them to letter notation:

| Input Format | Example | Stored As |
|---|---|---|
| Letter names | `Cmaj7`, `Am`, `F#dim` | `Cmaj7`, `Am`, `F#dim` |
| Solfège | `Do`, `Re`, `Sol7` | `C`, `D`, `G7` |
| Roman numerals | `IV`, `ii7`, `V` | Resolved from key context |

### Display Notations

Stored chords can be rendered in different notation systems via `ChordDisplayConfig.notation`:
- `'letter'` — `Cmaj7` (default)
- `'roman'` — `IVmaj7`
- `'nashville'` — `4maj7`
- `'fixedDo'` — `Domaj7`
- `'movableDo'` — `Famaj7` (relative to key)

---

## 6. Quant System

**Quants** are the smallest rhythmic unit in RiffScore:

```
1 whole note    = 64 quants
1 quarter note  = 16 quants
1 eighth note   =  8 quants
1 sixteenth     =  4 quants
1 sixtyfourth   =  1 quant   ← smallest unit
```

### Why 64?

64 divides evenly by:
- 1, 2, 4, 8, 16, 32, 64

This supports:
- Standard durations down to 64th notes (1 quant)
- Binary subdivisions align cleanly with power-of-2 durations
- Dotted values (quarter dot = 24 quants)

### Quant → Duration

```typescript
function quantToDuration(quants: number): { duration: string, dotted: boolean } {
  if (quants === 96) return { duration: 'whole', dotted: true };
  if (quants === 64) return { duration: 'whole', dotted: false };
  if (quants === 48) return { duration: 'half', dotted: true };
  // ... etc
}
```

---

## 7. Tuplets

Tuplets are described by an **inline object** on `ScoreEvent.tuplet` (there is no
standalone `TupletInfo` type):

```typescript
tuplet?: {
  ratio: [number, number]     // e.g., [3, 2] — 3 notes in the space of 2
  groupSize: number           // Total notes in the tuplet group (e.g., 3 for a triplet)
  position: number            // Position within the group (0-based)
  baseDuration?: string       // Base duration of the tuplet (e.g., 'eighth')
  id?: string                 // Unique ID shared by the group
}
```

### Triplet Example

Three eighth notes in the space of two:
- Each note: 8 × (2/3) ≈ 5.33 quants (rounded)
- Total: 16 quants (same as two eighths)

```typescript
// Triplet eighths
{ duration: 'eighth', tuplet: { ratio: [3, 2], groupSize: 3, position: 0 } }
{ duration: 'eighth', tuplet: { ratio: [3, 2], groupSize: 3, position: 1 } }
{ duration: 'eighth', tuplet: { ratio: [3, 2], groupSize: 3, position: 2 } }
```

---

## 8. Rest Modeling

Rests are `ScoreEvent` objects with `isRest: true`:

```typescript
{
  id: 'rest1',
  duration: 'quarter',
  dotted: false,
  isRest: true,
  notes: [{ id: 'r1', pitch: null, isRest: true }]
}
```

### Why notes[] for Rests?

- **Selection consistency**: Same structure for selecting notes and rests
- **Multi-voice support**: Future support for rests in specific voices
- **Simpler type handling**: No union types needed

---

## 9. Selection Model

```typescript
Selection {
  staffIndex: number
  measureIndex: number | null
  eventId: string | null
  noteId: string | null
  selectedNotes: SelectedNote[]
  anchor?: SelectedNote | null
  verticalAnchors?: VerticalAnchors | null
  chordId?: string | null       // Selected chord symbol ID
  chordTrackFocused?: boolean    // True when chord track has focus
}

SelectedNote {
  staffIndex: number
  measureIndex: number
  eventId: string
  noteId: string | null         // null for single-note events
}
```

See [SELECTION.md](./SELECTION.md) for full selection model documentation.

---

## 10. Key Files

| File | Purpose |
|------|---------|
| `src/types.ts` | All type definitions |
| `src/utils/core.ts` | Duration math (`getNoteDuration`) |
| `src/services/MusicService.ts` | Pitch operations |

---

[← Back to README](../README.md)
