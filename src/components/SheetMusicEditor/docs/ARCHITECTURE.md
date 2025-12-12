# RiffScore Architecture Guide

> **Overview**: A lightweight, embeddable notation engine designed for self-hosting. It prioritizes common notation needs and platform independence, treating music theory as a foundational data structure.

> **Additional Documentation**:
> *   [Interaction Design Guide](./INTERACTION.md) - Covers intent, states, and user flow.

---

## 1. Core Architectural Pillars

The editor is structured on distinct layers to separate business logic from UI concerns.

### 🏛️ 1. Single Source of Truth
The `Score` object defines the state. Derived states (like accidental visibility or beam angles) are not stored in the database.
*   **Serialized**: `Score` is pure JSON.
*   **Calculated**: Rendering properties are derived at runtime by the Layout Engine.
*   **Consistency**: Ensures that loaded data exactly matches saved data.

### ⚡ 2. Command Pattern
Mutations to the score—from adding notes to changing time signatures—are executed via `ScoreEngine.dispatch()`.
*   **Traceability**: Provides a log of all state changes.
*   **Undo/Redo**: Supported natively via command history.
*   **Encapsulation**: Complex operations are contained within single commands.

### 🎼 3. Theory-First Data Model
**Absolute Pitch** (e.g., `"F#4"`) is used for storage.
*   `MusicService` (via TonalJS) calculates context.
*   *Example*: In G Major, `"F#4"` renders as a natural F with a sharp in the key signature. In C Major, it renders with an explicit accidental. The underlying data remains `"F#4"`.

### Rendering & Typography
**Bravura** (SMuFL reference font) is used for rendering.
*   **Vector Glyphs**: Musical symbols are rendered as text elements using Bravura.
*   **Precision**: Standardized SMuFL code points ensure correct typography.
*   **Optimization**: Font is loaded locally for performance.

---

## 2. Directory Structure

```
SheetMusicEditor/
├── index.tsx                 # Main entry point
├── ScoreEditor.tsx           # Core editor component
├── types.ts                  # Type definitions (Score, Staff, Measure, Event, Note)
├── config.ts                 # Configuration constants
├── constants.ts              # Music constants (NOTE_TYPES, etc.)
│
├── services/                 # Business logic services
│   ├── MusicService.ts       # TonalJS wrapper - pitch, key, transposition
│   └── TimelineService.ts    # Timeline and playback calculations
│
├── engines/                  # Core processing engines
│   ├── ScoreEngine.ts        # Command dispatch and state management
│   ├── toneEngine.ts         # Tone.js audio playback
│   ├── midiEngine.ts         # MIDI input handling
│   └── layout/               # Layout calculation
│       ├── index.ts          # Module exports (barrel file)
│       ├── types.ts          # Layout type definitions
│       ├── positioning.ts    # Pitch-to-Y mapping, chord layout
│       ├── measure.ts        # Single measure layout and hit zones
│       ├── system.ts         # Multi-staff synchronization
│       ├── beaming.ts        # Beam grouping and angle calculation
│       ├── tuplets.ts        # Tuplet brackets
│       └── stems.ts          # Stem length calculations
│
├── commands/                 # Command pattern for undo/redo
│   ├── types.ts              # Command interface
│   ├── AddEventCommand.ts    # Unified note/rest creation
│   ├── AddNoteToEventCommand.ts
│   ├── ChangePitchCommand.ts
│   ├── DeleteEventCommand.ts
│   ├── DeleteNoteCommand.ts
│   ├── MeasureCommands.ts
│   ├── ToggleRestCommand.ts  # Convert note ↔ rest
│   ├── TransposeSelectionCommand.ts
│   ├── TupletCommands.ts
│   ├── SetKeySignatureCommand.ts
│   ├── SetTimeSignatureCommand.ts
│   ├── SetGrandStaffCommand.ts
│   ├── SetSingleStaffCommand.ts
│   ├── TogglePickupCommand.ts
│   └── ...
│
├── hooks/                    # React hooks
│   ├── useScoreLogic.ts      # Main score state management  
│   ├── useNavigation.ts      # Keyboard navigation
│   ├── usePlayback.ts        # Audio playback control
│   ├── useModifiers.ts       # Duration/accidental toggles
│   ├── useNoteActions.ts     # Note manipulation (Unified)
│   ├── useMeasureActions.ts  # Measure manipulation
│   ├── useTupletActions.ts   # Tuplet creation/management
│   ├── useAutoScroll.ts      # Canvas auto-scrolling
│   ├── useGrandStaffLayout.ts # Grand staff layout calculation
│   ├── useKeyboardShortcuts.ts # Keyboard shortcut handling
│   ├── useScoreInteraction.ts # Mouse/click interaction
│   ├── useSelection.ts      # Selection state management
│   ├── useDragToSelect.ts   # Drag selection for multi-select
│   ├── useEditorTools.ts    # Input mode (NOTE/REST), duration tools
│   ├── useMIDI.ts            # MIDI input handling
│   └── handlers/             # Event handlers
│       ├── handleNavigation.ts
│       ├── handleMutation.ts # Keyboard input for transposition, deletion
│       └── handlePlayback.ts
│
├── components/               # UI components
│   ├── Canvas/               # SVG score rendering
│   │   ├── ScoreCanvas.tsx   # Main canvas container
│   │   ├── Staff.tsx         # Staff lines and clef
│   │   ├── Measure.tsx       # Measure container
│   │   ├── ChordGroup.tsx    # Note grouping with stems
│   │   ├── ChordComponents.tsx # Extracted chord parts (stem, accidental, hit area)
│   │   ├── Note.tsx          # Individual note rendering
│   │   ├── Beam.tsx          # Beam rendering (angled)
│   │   ├── Rest.tsx          # Rest symbol rendering
│   │   ├── Tie.tsx           # Tie arc rendering
│   │   └── TupletBracket.tsx # Tuplet bracket rendering
│   ├── Assets/               # Visual assets (SVG icons, clefs)
│   │   ├── ClefIcon.tsx
│   │   └── GrandStaffBracket.tsx
│   ├── Toolbar/              # Toolbar controls
│   ├── Panels/               # Side panels
│   ├── Overlays/             # Modal overlays
│   └── Portal.tsx            # React portal wrapper
│
├── exporters/                # Export functionality
│
├── context/                  # React context
│   ├── ScoreContext.tsx      # Score state provider
│   ├── ThemeContext.tsx      # Theme provider
│
├── utils/                    # Utility functions
│   ├── core.ts               # Duration calculations, reflow
│   ├── validation.ts         # Input validation
│   └── interaction.ts        # Selection/navigation helpers
│
└── __tests__/                # Consolidated test files
```

---

## 3. Data Model

The schema supports advanced features such as Grand Staff, polyrhythms, and mixed note/rest events.

```typescript
Score
  ├── title: string
  ├── timeSignature: string ("4/4")
  ├── keySignature: string ("G")
  ├── bpm: number
  └── staves: Staff[]
        ├── clef: 'treble' | 'bass'
        ├── keySignature: string (inherited from score)
        └── measures: Measure[]
              ├── isPickup?: boolean
              ├── id: string | number
              └── events: ScoreEvent[]
                    ├── id: string | number
                    ├── quant: number
                    ├── duration: string ("quarter")
                    ├── dotted: boolean
                    ├── isRest?: boolean
                    ├── tuplet?: TupletInfo
                    └── notes: Note[]
                          ├── id: string | number
                          ├── pitch: string ("F#4")
                          ├── accidental?: 'sharp' | 'flat' | 'natural'
                          ├── isRest?: boolean (true for rests)
                          └── tied?: boolean
```

---

## 4. Key Systems & Decisions

### 🔄 Unified Event Model (DRY)
**Notes** and **Rests** are treated as sibling "ScoreEvent" types.
*   **Shared Code**: Commands, selection logic, and navigation are unified.
*   **Input Mode**: A global toggle (`R`) controls the type of event created.
*   **Benefits**: Reduces code duplication and potential bugs relative to separate handling.
*   **Storage**: Rests are stored with `isRest: true` and a "phantom" note acting as a handle for compatibility.

### 🎹 Grand Staff Synchronization
Multi-staff scores operate as a single system.
*   **Sync**: Key/Time signatures and pickup measures are synchronized across all staves.
*   **Navigation**: `Alt + Up/Down` moves context vertically between staves.

### 🧪 Testing Strategy
Testing is consolidated in `src/components/SheetMusicEditor/__tests__/`.
*   **Services**: 98% coverage (Theory logic)
*   **Utils**: 87% coverage (Calculations)
*   **Commands**: 79% coverage (State mutations)
*   **Hooks**: 62% coverage (Component integration)

---

## 5. Layout Engine

Modules are scoped to specific layout responsibilities.

### Module Overview

| Module | Responsibility |
|--------|---------------|
| `measure.ts` | Single measure layout, event positioning, hit zones |
| `system.ts` | Multi-staff synchronization |
| `positioning.ts` | Pitch-to-Y mapping, chord layout |
| `beaming.ts` | Beam grouping and angle calculation |
| `tuplets.ts` | Tuplet positioning |
| `stems.ts` | Stem length calculations |

### Rendering Pipeline

```
UseState Update
    ↓
Measure.tsx (Render)
    ├── calculateMeasureLayout() → event positions
    ├── calculateBeamingGroups() → beam specifications
    ├── calculateChordLayout() → note offsets
    │
    └── Render Primitives:
        ├── ChordGroup (notes, stems)
        ├── Beam (angled beams)
        ├── Rest (Bravura glyphs)
        └── TupletBracket
```

---

## 6. Hook Architecture

### Core Hooks

| Hook | Purpose |
|------|---------|
| `useScoreLogic` | Main state orchestration |
| `useScoreEngine` | ScoreEngine integration |
| `useSelection` | Selection state management |
| `useHistory` | Undo/redo management |
| `useNavigation` | Keyboard navigation |
| `useNoteActions` | Note/Rest manipulation |
| `useMeasureActions` | Measure manipulation |
| `useTupletActions` | Tuplet management |
| `useModifiers` | Duration/accidental toggles |
| `usePlayback` | Playback control |
| `useEditorTools` | Input mode & active tool state |

### UI Hooks

| Hook | Purpose |
|------|---------|
| `useAutoScroll` | Canvas auto-scrolling |
| `useGrandStaffLayout` | Vertical layout calculations |
| `useDragToSelect` | Box selection |
| `useKeyboardShortcuts` | Input handling |
| `useScoreInteraction` | Mouse handling |
| `useMIDI` | MIDI input |

---

## 7. Dependencies

| Package | Purpose |
|---------|---------|
| [`tonal`](https://github.com/tonaljs/tonal) | Music theory (pitch, key, intervals) |
| [`tone`](https://tonejs.github.io/) | Audio playback |
| `react` | UI framework |
| `lucide-react` | Icons |
| **Bravura** | SMuFL-compliant music font |
