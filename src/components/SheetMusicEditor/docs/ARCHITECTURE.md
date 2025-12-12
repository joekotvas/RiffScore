# RiffScore Architecture Guide

> **Overview**: A configurable, embeddable sheet music editor for React. It prioritizes common notation needs and platform independence, treating music theory as a foundational data structure.

> **Additional Documentation**:
> *   [Configuration Guide](./CONFIGURATION.md) - Complete API reference for `<RiffScore />` config options.
> *   [Interaction Design Guide](./INTERACTION.md) - Covers intent, states, and user flow.

---

## 1. Core Architectural Pillars

The editor separates business logic from UI through four foundational patterns.

<details>
<summary><strong>View architectural principles</strong></summary>

### 🏛️ Single Source of Truth
The `Score` object defines the state. Derived states (like accidental visibility or beam angles) are not stored in the database.
*   **Serialized**: `Score` is pure JSON.
*   **Calculated**: Rendering properties are derived at runtime by the Layout Engine.
*   **Consistency**: Ensures that loaded data exactly matches saved data.

### ⚡ Command Pattern
Mutations to the score—from adding notes to changing time signatures—are executed via `ScoreEngine.dispatch()`.
*   **Traceability**: Provides a log of all state changes.
*   **Undo/Redo**: Supported natively via command history.
*   **Encapsulation**: Complex operations are contained within single commands.

### 🎼 Theory-First Data Model
**Absolute Pitch** (e.g., `"F#4"`) is used for storage.
*   `MusicService` (via TonalJS) calculates context.
*   *Example*: In G Major, `"F#4"` renders as a natural F with a sharp in the key signature. In C Major, it renders with an explicit accidental. The underlying data remains `"F#4"`.

### Rendering & Typography
**Bravura** (SMuFL reference font) is used for rendering.
*   **Vector Glyphs**: Musical symbols are rendered as text elements using Bravura.
*   **Precision**: Standardized SMuFL code points ensure correct typography.
*   **Optimization**: Font is loaded locally for performance.

</details>

---

## 2. Component Entry Point

`<RiffScore />` is the primary public API. Pass a config prop to customize initialization, or use defaults.

<details>
<summary><strong>View usage examples</strong></summary>

```tsx
import { RiffScore } from '@/components/SheetMusicEditor';

// Default: Grand staff, 4 measures, full editing
<RiffScore />

// With configuration
<RiffScore config={{
  ui: { showToolbar: false, scale: 0.75 },
  interaction: { isEnabled: false },
  score: { staff: 'treble', measureCount: 8, keySignature: 'G' }
}} />
```

### Config Resolution Flow

```
RiffScoreConfig (Partial)
    ↓
useRiffScore() hook
    ├── mergeConfig() → Merge with defaults
    ├── If staves provided → Use directly (Render Mode)
    └── Else generateStaves() → Create from template (Generator Mode)
    ↓
ScoreProvider (initialScore)
    ↓
ScoreEditorContent
```

See [Configuration Guide](./CONFIGURATION.md) for complete API reference.

</details>

---

## 3. Directory Structure

Layered architecture: services → engines → hooks → components.

<details>
<summary><strong>View full directory tree</strong></summary>

```
SheetMusicEditor/
├── index.tsx                 # Module entry, exports RiffScore & ScoreEditor
├── RiffScore.tsx             # Config-driven wrapper component
├── ScoreEditor.tsx           # Core editor implementation
├── types.ts                  # Types (Score, RiffScoreConfig, DeepPartial)
├── config.ts                 # Layout configuration constants
├── themes.ts                 # Theme definitions (DARK, COOL, WARM, LIGHT)
├── constants.ts              # Music constants (NOTE_TYPES, TIME_SIGNATURES)
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
│   ├── ChangePitchCommand.ts
│   ├── DeleteNoteCommand.ts
│   ├── MeasureCommands.ts
│   ├── SetKeySignatureCommand.ts
│   ├── SetTimeSignatureCommand.ts
│   ├── SetGrandStaffCommand.ts
│   └── ...                   # Additional commands
│
├── hooks/                    # React hooks
│   ├── useRiffScore.ts       # Config normalization & score generation
│   ├── useScoreLogic.ts      # Main score state management  
│   ├── useScoreEngine.ts     # ScoreEngine integration
│   ├── useSelection.ts       # Selection state management
│   ├── useNavigation.ts      # Keyboard navigation
│   ├── useNoteActions.ts     # Note manipulation
│   ├── useMeasureActions.ts  # Measure manipulation
│   ├── useTupletActions.ts   # Tuplet creation/management
│   ├── useModifiers.ts       # Duration/accidental toggles
│   ├── usePlayback.ts        # Audio playback control
│   ├── useAutoScroll.ts      # Canvas auto-scrolling
│   ├── useGrandStaffLayout.ts # Grand staff layout
│   ├── useKeyboardShortcuts.ts # Keyboard handling
│   ├── useScoreInteraction.ts # Mouse handling
│   ├── useDragToSelect.ts    # Box selection
│   ├── useMIDI.ts            # MIDI input
│   └── handlers/             # Event handlers
│
├── components/               # UI components
│   ├── Canvas/               # SVG score rendering
│   │   ├── ScoreCanvas.tsx   # Main canvas container
│   │   ├── Staff.tsx         # Staff lines and clef
│   │   ├── Measure.tsx       # Measure container
│   │   ├── ChordGroup.tsx    # Note grouping with stems
│   │   ├── Note.tsx          # Individual note rendering
│   │   ├── Stem.tsx          # Stem line rendering
│   │   ├── Flags.tsx         # Eighth/sixteenth note flags
│   │   ├── Beam.tsx          # Beam rendering (angled)
│   │   ├── Rest.tsx          # Rest symbol rendering
│   │   ├── Tie.tsx           # Tie arc rendering
│   │   ├── TupletBracket.tsx # Tuplet bracket rendering
│   │   └── GhostPreview.tsx  # Note/rest preview on hover
│   ├── Assets/               # Visual assets for toolbar/UI
│   │   ├── ClefIcon.tsx      # Clef glyphs
│   │   ├── GrandStaffBracket.tsx # Grand staff bracket
│   │   ├── NoteIcon.tsx      # Note glyphs for toolbar
│   │   └── RestIcon.tsx      # Rest glyphs for toolbar
│   ├── Toolbar/              # Toolbar controls
│   ├── Panels/               # Side panels (ConfigMenu)
│   ├── Overlays/             # Modal overlays
│   └── Portal.tsx            # React portal wrapper
│
├── exporters/                # Export functionality
│   ├── musicXmlExporter.ts   # MusicXML export
│   ├── abcExporter.ts        # ABC notation export
│   └── jsonExporter.ts       # JSON export
│
├── context/                  # React context
│   ├── ScoreContext.tsx      # Score state provider
│   └── ThemeContext.tsx      # Theme provider
│
├── utils/                    # Utility functions
│   ├── core.ts               # Duration calculations, reflow
│   ├── generateScore.ts      # Score generation from templates
│   ├── mergeConfig.ts        # Deep merge for partial configs
│   ├── selection.ts          # Selection utilities
│   ├── interaction.ts        # Navigation/interaction helpers
│   ├── validation.ts         # Input validation
│   └── debug.ts              # Debug logging
│
├── docs/                     # Documentation
│   ├── ARCHITECTURE.md       # This file
│   ├── CONFIGURATION.md      # RiffScore config API reference
│   └── INTERACTION.md        # Interaction design guide
│
└── __tests__/                # Consolidated test files (34 test suites)
```

</details>

---

## 4. Data Model

`Score` → `Staff[]` → `Measure[]` → `ScoreEvent[]` → `Note[]`. Supports grand staff, tuplets, and mixed note/rest events.

<details>
<summary><strong>View schema</strong></summary>

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

</details>

---

## 5. Key Systems & Decisions

Unified event model, grand staff sync, and consolidated testing.

<details>
<summary><strong>View design decisions</strong></summary>

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

</details>

---

## 6. Layout Engine

Six modules calculate note positions, beaming, stems, and tuplet brackets.

<details>
<summary><strong>View modules and pipeline</strong></summary>

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

</details>

---

## 7. Hook Architecture

Core hooks manage state; UI hooks handle input and layout.

<details>
<summary><strong>View hook tables</strong></summary>

### Core Hooks

| Hook | Purpose |
|------|---------|
| `useRiffScore` | Config normalization & score generation |
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

</details>

---

## 8. Dependencies

<details>
<summary><strong>View package list</strong></summary>

| Package | Purpose |
|---------|---------|
| [`tonal`](https://github.com/tonaljs/tonal) | Music theory (pitch, key, intervals) |
| [`tone`](https://tonejs.github.io/) | Audio playback |
| `react` | UI framework |
| `lucide-react` | Icons |
| **Bravura** | SMuFL-compliant music font |

</details>
