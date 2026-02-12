# Chord Symbols - Software Design Document

**Feature:** Chord Symbols with Flexible Notation and Playback
**Issue:** [#29](https://github.com/joekotvas/riffscore/issues/29)
**Status:** Draft
**Date:** 2026-02-12
**Parent:** [PRD.md](./PRD.md) | [SRS.md](./SRS.md)

---

## 1. Overview

### 1.1 Purpose

This document describes the software architecture and detailed design for implementing chord symbols in RiffScore. It maps requirements from the SRS to concrete code structures, following established project patterns.

### 1.2 Design Principles

1. **Layer Separation:** Components → Hooks → Engines → Services
2. **Command Pattern:** All chord mutations through undoable commands
3. **Fail-Soft API:** Structured feedback, never throw
4. **Existing Patterns:** Follow ADRs 004 (Factory), 005 (Dispatch), 011 (Feedback)

### 1.3 Architecture Context

```
┌─────────────────────────────────────────────────────────────┐
│                        COMPONENTS                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ ChordTrack  │  │ ChordSymbol │  │ ChordInput          │  │
│  │ (container) │  │ (display)   │  │ (edit field)        │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │             │
├─────────┼────────────────┼─────────────────────┼─────────────┤
│         │         HOOKS  │                     │             │
│         ▼                ▼                     ▼             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              useChordTrack                           │    │
│  │  - chord state, editing state, event handlers        │    │
│  └──────────────────────────┬──────────────────────────┘    │
│                             │                                │
├─────────────────────────────┼────────────────────────────────┤
│                      ENGINES│                                │
│                             ▼                                │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              ScoreEngine                             │    │
│  │  - executes chord commands with undo/redo            │    │
│  └──────────────────────────┬──────────────────────────┘    │
│                             │                                │
├─────────────────────────────┼────────────────────────────────┤
│                    SERVICES │                                │
│                             ▼                                │
│  ┌────────────────┐  ┌─────────────────┐  ┌──────────────┐  │
│  │ ChordService   │  │ MusicService    │  │ ToneEngine   │  │
│  │ (parse/convert)│  │ (theory)        │  │ (playback)   │  │
│  └────────────────┘  └─────────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. File Organization

### 2.1 New Files

```
src/
├── services/
│   └── ChordService.ts              # Parsing, normalization, conversion (~200 lines)
│
├── commands/
│   └── chord/
│       ├── AddChordCommand.ts       # Add chord symbol (~50 lines)
│       ├── UpdateChordCommand.ts    # Edit chord symbol (~40 lines)
│       ├── RemoveChordCommand.ts    # Delete chord symbol (~40 lines)
│       └── index.ts                 # Barrel export
│
├── components/
│   └── Canvas/
│       └── ChordTrack/
│           ├── ChordTrack.tsx       # Container component (~100 lines)
│           ├── ChordSymbol.tsx      # Individual chord display (~60 lines)
│           ├── ChordInput.tsx       # Inline edit field (~80 lines)
│           ├── ChordTrack.css       # Styles (~50 lines)
│           └── index.ts             # Barrel export
│
├── hooks/
│   └── chord/
│       └── useChordTrack.ts         # Chord track state & handlers (~150 lines)
│
├── hooks/api/
│   └── chords.ts                    # Chord API factory (~200 lines)
│
└── __tests__/
    ├── services/
    │   └── ChordService.test.ts
    └── commands/
        └── chord/
            └── ChordCommands.test.ts
```

> **Note:** Chord parsing utilities are consolidated in `ChordService.ts` rather than separate files, since they're tightly coupled and small enough to stay together (~200 lines total).

### 2.2 Extended Existing Files (Minimal Changes)

| File | Change | Lines Added |
|------|--------|-------------|
| `src/utils/id.ts` | Add `chordId()` factory | ~2 |
| `src/utils/commandHelpers.ts` | Add `updateChordTrack()` helper | ~15 |
| `src/types.ts` | Add `ChordSymbol` interface, extend `Selection` | ~15 |
| `src/hooks/api/useScoreAPI.ts` | Import and spread `createChordMethods(ctx)` | ~3 |
| `src/hooks/api/index.ts` | Export chord methods | ~1 |
| `src/styles/theme.css` | Add chord CSS variables | ~8 |

### 2.3 Modified Files (Rendering & Export)

| File | Changes |
|------|---------|
| `src/api.types.ts` | Add chord method type definitions |
| `src/components/Canvas/ScoreCanvas.tsx` | Render ChordTrack component |
| `src/engines/toneEngine.ts` | Add chord playback scheduling |
| `src/exporters/abcExporter.ts` | Export chord annotations |
| `src/exporters/musicXmlExporter.ts` | Export harmony elements |

> **Note:** Commands are auto-discovered by type - no registration needed in ScoreEngine.

---

## 3. Type Definitions

### 3.1 Core Types (src/types.ts additions)

```typescript
// ========== CHORD SYMBOLS ==========
// Add to existing src/types.ts

/**
 * Represents a chord symbol in the chord track.
 * Anchored to a global quant position.
 */
export interface ChordSymbol {
  /** Unique identifier (generated via chordId() from utils/id.ts) */
  id: string;

  /** Global quant position (measureIndex * CONFIG.quantsPerMeasure + localQuant) */
  quant: number;

  /** Canonical chord symbol (letter-name notation) */
  symbol: string;
}

/**
 * Configuration for chord display notation.
 */
export interface ChordDisplayConfig {
  /** Notation system for rendering */
  notation: 'letter' | 'roman' | 'nashville' | 'fixedDo' | 'movableDo';

  /** Use typographic symbols (△, °, +) vs text (maj, dim, aug) */
  useSymbols: boolean;
}

/**
 * Default chord display configuration.
 */
export const DEFAULT_CHORD_DISPLAY: ChordDisplayConfig = {
  notation: 'letter',
  useSymbols: false,
};
```

### 3.1.1 Extend Existing Selection Interface

```typescript
// Extend existing Selection interface in src/types.ts
export interface Selection {
  // ... existing fields (staffIndex, measureIndex, eventId, noteId, etc.) ...

  /** Selected chord symbol ID (when chord track is focused). Default: null */
  chordId: string | null;

  /** Whether chord track has focus. Default: false */
  chordTrackFocused: boolean;
}

// Default values for chord selection fields
const DEFAULT_CHORD_SELECTION = {
  chordId: null,
  chordTrackFocused: false,
};
```

> **Rationale:** Integrating chord selection into the existing `Selection` interface keeps all selection state unified and leverages the existing `SelectionEngine` infrastructure. The defaults ensure no chord is selected and the staff (not chord track) has initial focus.

### 3.2 Score Extension

```typescript
// Extend existing Score interface
export interface Score {
  // ... existing fields ...

  /** Chord symbols for harmonic annotation (sorted by quant) */
  chordTrack?: ChordSymbol[];
}
```

> **Note:** `ChordDisplayConfig` is stored in `RiffScoreConfig`, not on `Score`. Display preferences are UI state, not score data, and should not be exported/imported with scores.

### 3.2.1 Utility Extensions

**Add to `src/utils/id.ts`:**

```typescript
/** Generate a unique chord ID: "chord_xxxxxxxx" */
export const chordId = (): string => createId('chord');
```

**Add to `src/utils/commandHelpers.ts`:**

```typescript
import { ChordSymbol } from '@/types';

/**
 * Helper to update the chord track in the score.
 * Handles cloning of the chord array.
 *
 * @param score The current score state
 * @param updateFn Callback to modify the chord track. Return new array or false to abort.
 * @returns New score state or original score
 */
export const updateChordTrack = (
  score: Score,
  updateFn: (chordTrack: ChordSymbol[]) => ChordSymbol[] | false
): Score => {
  const chordTrack = [...(score.chordTrack || [])];
  const result = updateFn(chordTrack);

  if (result === false) return score;

  return { ...score, chordTrack: result };
};
```

### 3.3 RiffScoreConfig Extension

```typescript
export interface RiffScoreConfig {
  // ... existing fields ...

  /** Chord track configuration */
  chord?: {
    /** Display notation preferences */
    display: ChordDisplayConfig;

    /** Playback settings */
    playback: ChordPlaybackConfig;
  };
}

export interface ChordPlaybackConfig {
  /** Enable/disable chord playback */
  enabled: boolean;

  /** Velocity (0-127), default 50 */
  velocity: number;
}

export const DEFAULT_CHORD_CONFIG = {
  display: {
    notation: 'letter' as const,
    useSymbols: false,
  },
  playback: {
    enabled: true,
    velocity: 50,
  },
};
```

### 3.4 Parse Result Types

```typescript
/**
 * Result of chord parsing operation.
 */
export type ChordParseResult =
  | { ok: true; symbol: string; components: ChordComponents }
  | { ok: false; code: ChordErrorCode; message: string };

export interface ChordComponents {
  root: string;          // 'C', 'F#', 'Bb'
  quality: string;       // '', 'm', 'dim', 'aug'
  extension: string;     // '7', 'maj7', '9', etc.
  alterations: string[]; // ['#5', 'b9']
  bass: string | null;   // 'E' for C/E, null otherwise
}

export type ChordErrorCode =
  | 'CHORD_EMPTY'
  | 'CHORD_INVALID_ROOT'
  | 'CHORD_INVALID_QUALITY'
  | 'CHORD_INVALID_BASS';
```

---

## 4. Service Design

### 4.1 ChordService (src/services/ChordService.ts)

The ChordService handles parsing, normalization, and notation conversion.

```typescript
import { Chord, Note } from 'tonal';

/**
 * ChordService - Chord parsing, normalization, and notation conversion.
 *
 * Uses tonal.js for music theory operations.
 */

// ============================================================================
// 1. PARSING
// ============================================================================

/**
 * Parse user input into canonical chord format.
 * Accepts multiple input notations and normalizes to letter-name.
 */
export const parseChord = (
  input: string,
  keySignature: string = 'C'
): ChordParseResult => {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, code: 'CHORD_EMPTY', message: 'Enter a chord symbol' };
  }

  // Detect notation system
  const notation = detectNotation(trimmed);

  // Convert to letter-name if needed
  const letterInput = notation === 'letter'
    ? trimmed
    : convertToLetter(trimmed, notation, keySignature);

  // Parse with tonal
  const parsed = Chord.get(letterInput);
  if (!parsed.tonic) {
    return { ok: false, code: 'CHORD_INVALID_ROOT', message: 'Unrecognized chord' };
  }

  // Normalize to canonical form
  const canonical = normalizeChord(parsed);

  return {
    ok: true,
    symbol: canonical,
    components: extractComponents(parsed),
  };
};

/**
 * Detect the notation system of input string.
 */
export const detectNotation = (
  input: string
): 'letter' | 'roman' | 'nashville' | 'solfege' => {
  // Roman numerals - match valid numerals I-VII with optional accidentals
  // Case is preserved: uppercase (I, IV, V) = major, lowercase (ii, iii, vi) = minor
  const romanPattern = /^(bb?|#)?(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)/;
  if (romanPattern.test(input)) return 'roman';

  // Nashville - starts with 1-7
  if (/^[1-7]/.test(input)) return 'nashville';

  // Solfège - Do, Re, Mi, Fa, Sol, La, Si
  if (/^(Do|Re|Mi|Fa|Sol|La|Si)/i.test(input)) return 'solfege';

  return 'letter';
};

// ============================================================================
// 2. NOTATION CONVERSION
// ============================================================================

/**
 * Convert canonical chord to specified notation.
 */
export const convertNotation = (
  symbol: string,
  targetNotation: ChordDisplayConfig['notation'],
  keySignature: string,
  useSymbols: boolean = false
): string => {
  switch (targetNotation) {
    case 'letter':
      return useSymbols ? applySymbols(symbol) : symbol;
    case 'roman':
      return toRomanNumeral(symbol, keySignature, useSymbols);
    case 'nashville':
      return toNashville(symbol, keySignature);
    case 'fixedDo':
      return toFixedDo(symbol, useSymbols);
    case 'movableDo':
      return toMovableDo(symbol, keySignature, useSymbols);
    default:
      return symbol;
  }
};

/**
 * Convert to Roman numeral notation.
 * Case indicates quality: uppercase = major, lowercase = minor/diminished
 */
export const toRomanNumeral = (
  symbol: string,
  keySignature: string,
  useSymbols: boolean
): string => {
  const { root, quality, extension } = extractComponents(Chord.get(symbol));
  const degree = getScaleDegree(root, keySignature);

  const numerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  let numeral = numerals[degree - 1] || 'I';

  // Apply case based on quality: lowercase for minor/diminished
  if (quality === 'm' || quality === 'dim') {
    numeral = numeral.toLowerCase();
  }

  // Handle non-diatonic roots
  const accidental = getNonDiatonicAccidental(root, keySignature);

  const qualitySuffix = formatQuality(quality, extension, useSymbols);

  return `${accidental}${numeral}${qualitySuffix}`;
};

/**
 * Convert Roman numeral input to letter-name notation.
 * Case determines quality: uppercase = major, lowercase = minor
 *
 * Examples (in key of C):
 *   'iii' → 'Em' (lowercase = minor)
 *   'III' → 'E'  (uppercase = major)
 *   'V7'  → 'G7' (uppercase + extension)
 *   'viio' → 'Bdim' (lowercase + diminished marker)
 */
export const fromRomanNumeral = (
  input: string,
  keySignature: string
): string => {
  const match = input.match(/^(bb?|#)?(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)$/);
  if (!match) return input;

  const [, accidental = '', numeral, suffix] = match;
  const isLowercase = numeral === numeral.toLowerCase();

  // Map numeral to scale degree
  const numeralMap: Record<string, number> = {
    'i': 1, 'ii': 2, 'iii': 3, 'iv': 4, 'v': 5, 'vi': 6, 'vii': 7,
  };
  const degree = numeralMap[numeral.toLowerCase()];

  // Get root note from key and degree
  const root = getRootFromDegree(keySignature, degree, accidental);

  // Infer quality from case (unless explicit quality in suffix)
  const hasExplicitQuality = /^(m|maj|dim|aug|°|\+)/.test(suffix);
  const quality = hasExplicitQuality ? '' : (isLowercase ? 'm' : '');

  return `${root}${quality}${suffix}`;
};

/**
 * Convert to Nashville number notation.
 */
export const toNashville = (symbol: string, keySignature: string): string => {
  const { root, quality, extension } = extractComponents(Chord.get(symbol));
  const degree = getScaleDegree(root, keySignature);

  const accidental = getNonDiatonicAccidental(root, keySignature);
  const qualitySuffix = quality === 'm' ? 'm' : '';

  return `${accidental}${degree}${qualitySuffix}${extension}`;
};

// ============================================================================
// 3. VOICING (for playback)
// ============================================================================

/**
 * Generate MIDI notes for chord playback.
 * Returns a balanced voicing with proper register spread.
 *
 * Voicing strategy:
 * - Root: dynamic octave based on pitch (keeps bass in consistent range)
 *   - C, C#, D, D#, E, F, F# → octave 3
 *   - G, G#, A, A#, B → octave 2 (higher roots drop an octave)
 * - 3rd/7th: octave 3-4 (core harmony)
 * - 5th/extensions: octave 4 (color tones higher)
 */
export const getChordVoicing = (symbol: string): string[] => {
  const chord = Chord.get(symbol);
  if (!chord.tonic) return [];

  const notes = chord.notes;
  const voicing: string[] = [];

  // Dynamic bass octave: high roots (G and above) use octave 2, others use octave 3
  // This keeps the bass in a consistent register range (~C2-F#3)
  const highRoots = ['G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];
  const bassOctave = highRoots.some((r) => notes[0].startsWith(r)) ? 2 : 3;

  // Root in dynamic octave
  voicing.push(`${notes[0]}${bassOctave}`);

  // 3rd (if present) in octave 3
  if (notes[1]) {
    voicing.push(`${notes[1]}3`);
  }

  // 5th (if present) in octave 4
  if (notes[2]) {
    voicing.push(`${notes[2]}4`);
  }

  // 7th and extensions in octave 4
  for (let i = 3; i < Math.min(notes.length, 5); i++) {
    voicing.push(`${notes[i]}4`);
  }

  return voicing;
};
```

### 4.2 Integration with MusicService

The ChordService uses existing MusicService functions:

```typescript
// From MusicService - reuse these
import { getScaleDegree, getKeyInfo } from './MusicService';
```

---

## 5. Command Design

### 5.1 AddChordCommand

```typescript
// src/commands/chord/AddChordCommand.ts

import { Command } from '../types';
import { Score, ChordSymbol } from '@/types';
import { chordId } from '@/utils/id';
import { updateChordTrack } from '@/utils/commandHelpers';

export class AddChordCommand implements Command {
  readonly type = 'ADD_CHORD';

  private chord: ChordSymbol;
  private insertIndex: number = -1;
  private replacedChord: ChordSymbol | null = null;

  constructor(quant: number, symbol: string) {
    this.chord = {
      id: chordId(),  // Use existing ID utility
      quant,
      symbol,
    };
  }

  execute(score: Score): Score {
    return updateChordTrack(score, (chordTrack) => {
      // Find insertion point (maintain sort by quant)
      this.insertIndex = chordTrack.findIndex((c) => c.quant >= this.chord.quant);

      if (this.insertIndex === -1) {
        // Append at end
        this.insertIndex = chordTrack.length;
        chordTrack.push(this.chord);
      } else if (chordTrack[this.insertIndex].quant === this.chord.quant) {
        // Duplicate position - store old chord for undo, then replace
        this.replacedChord = chordTrack[this.insertIndex];
        chordTrack[this.insertIndex] = this.chord;
      } else {
        // Insert at position
        chordTrack.splice(this.insertIndex, 0, this.chord);
      }

      return chordTrack;
    });
  }

  undo(score: Score): Score {
    return updateChordTrack(score, (chordTrack) => {
      const idx = chordTrack.findIndex((c) => c.id === this.chord.id);
      if (idx === -1) return false;

      if (this.replacedChord) {
        chordTrack[idx] = this.replacedChord;
      } else {
        chordTrack.splice(idx, 1);
      }

      return chordTrack;
    });
  }
}
```

### 5.2 UpdateChordCommand

```typescript
// src/commands/chord/UpdateChordCommand.ts

import { Command } from '../types';
import { Score } from '@/types';
import { updateChordTrack } from '@/utils/commandHelpers';

export class UpdateChordCommand implements Command {
  readonly type = 'UPDATE_CHORD';

  private chordId: string;
  private newSymbol: string;
  private previousSymbol: string = '';

  constructor(chordId: string, newSymbol: string) {
    this.chordId = chordId;
    this.newSymbol = newSymbol;
  }

  execute(score: Score): Score {
    return updateChordTrack(score, (chordTrack) => {
      const idx = chordTrack.findIndex((c) => c.id === this.chordId);
      if (idx === -1) return false;

      this.previousSymbol = chordTrack[idx].symbol;
      chordTrack[idx] = { ...chordTrack[idx], symbol: this.newSymbol };
      return chordTrack;
    });
  }

  undo(score: Score): Score {
    return updateChordTrack(score, (chordTrack) => {
      const idx = chordTrack.findIndex((c) => c.id === this.chordId);
      if (idx === -1) return false;

      chordTrack[idx] = { ...chordTrack[idx], symbol: this.previousSymbol };
      return chordTrack;
    });
  }
}
```

### 5.3 RemoveChordCommand

```typescript
// src/commands/chord/RemoveChordCommand.ts

import { Command } from '../types';
import { Score, ChordSymbol } from '@/types';
import { updateChordTrack } from '@/utils/commandHelpers';

export class RemoveChordCommand implements Command {
  readonly type = 'REMOVE_CHORD';

  private chordId: string;
  private removedChord: ChordSymbol | null = null;
  private removedIndex: number = -1;

  constructor(chordId: string) {
    this.chordId = chordId;
  }

  execute(score: Score): Score {
    return updateChordTrack(score, (chordTrack) => {
      this.removedIndex = chordTrack.findIndex((c) => c.id === this.chordId);
      if (this.removedIndex === -1) return false;

      this.removedChord = chordTrack[this.removedIndex];
      chordTrack.splice(this.removedIndex, 1);
      return chordTrack;
    });
  }

  undo(score: Score): Score {
    if (!this.removedChord) return score;

    return updateChordTrack(score, (chordTrack) => {
      chordTrack.splice(this.removedIndex, 0, this.removedChord!);
      return chordTrack;
    });
  }
}
```

---

## 6. Component Design

### 6.1 ChordTrack Component

```typescript
// src/components/Canvas/ChordTrack/ChordTrack.tsx

import React, { memo, useState } from 'react';
import { ChordSymbol as ChordSymbolType, ChordDisplayConfig } from '@/types';
import { ChordSymbol } from './ChordSymbol';
import { ChordInput } from './ChordInput';
import './ChordTrack.css';

interface ChordTrackProps {
  chords: ChordSymbolType[];
  displayConfig: ChordDisplayConfig;
  keySignature: string;
  timeSignature: string;
  validQuants: Set<number>;

  // Layout props
  measurePositions: Array<{ x: number; width: number; quant: number }>;
  quantToX: (quant: number) => number;
  trackY: number;

  // Interaction state
  editingChordId: string | null;
  selectedChordId: string | null;
  creatingAtQuant: number | null;
  initialValue: string | null;       // Override for "type to replace" behavior

  // Event handlers
  onChordClick: (chordId: string) => void;
  onEmptyClick: (quant: number) => void;
  onEditComplete: (chordId: string | null, value: string) => void;
  onEditCancel: () => void;
  onDelete: (chordId: string) => void;
}

/**
 * Convert pixel X position to nearest valid quant.
 */
function xToQuant(
  x: number,
  measurePositions: Array<{ x: number; width: number; quant: number }>,
  validQuants: Set<number>,
  quantsPerMeasure: number
): number | null {
  // Find which measure contains the X position
  const measure = measurePositions.find(
    (m) => x >= m.x && x < m.x + m.width
  );
  if (!measure) return null;

  // Calculate proportion through the measure
  const proportion = (x - measure.x) / measure.width;

  // Convert to local quant within measure
  const localQuant = Math.round(proportion * quantsPerMeasure);

  // Convert to global quant
  const globalQuant = measure.quant + localQuant;

  // Snap to nearest valid quant
  const validArray = Array.from(validQuants).sort((a, b) => a - b);
  const nearest = validArray.reduce((prev, curr) =>
    Math.abs(curr - globalQuant) < Math.abs(prev - globalQuant) ? curr : prev
  );

  // Only return if within reasonable distance (half a beat = 12 quants)
  return Math.abs(nearest - globalQuant) <= 12 ? nearest : null;
}

export const ChordTrack = memo(function ChordTrack({
  chords,
  displayConfig,
  keySignature,
  timeSignature,
  validQuants,
  measurePositions,
  quantToX,
  trackY,
  editingChordId,
  selectedChordId,
  creatingAtQuant,
  initialValue,
  onChordClick,
  onEmptyClick,
  onEditComplete,
  onEditCancel,
  onDelete,
}: ChordTrackProps) {
  const quantsPerMeasure = getQuantsPerMeasure(timeSignature);

  const [cursorStyle, setCursorStyle] = useState<'default' | 'text' | 'pointer'>('default');

  const handleTrackClick = (e: React.MouseEvent<SVGGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const quant = xToQuant(x, measurePositions, validQuants, quantsPerMeasure);

    if (quant !== null) {
      const existingChord = chords.find((c) => c.quant === quant);
      if (existingChord) {
        onChordClick(existingChord.id);
      } else {
        onEmptyClick(quant);
      }
    }
  };

  const handleTrackMouseMove = (e: React.MouseEvent<SVGGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const quant = xToQuant(x, measurePositions, validQuants, quantsPerMeasure);

    if (quant !== null) {
      const existingChord = chords.find((c) => c.quant === quant);
      setCursorStyle(existingChord ? 'pointer' : 'text');
    } else {
      setCursorStyle('default');
    }
  };

  const handleTrackMouseLeave = () => {
    setCursorStyle('default');
  };

  return (
    <g
      className="riff-ChordTrack"
      transform={`translate(0, ${trackY})`}
      onClick={handleTrackClick}
      onMouseMove={handleTrackMouseMove}
      onMouseLeave={handleTrackMouseLeave}
      role="region"
      aria-label="Chord symbols"
      style={{ cursor: cursorStyle }}
    >
      {/* Hit area for clicks - invisible but interactive */}
      <rect
        className="riff-ChordTrack__hitArea"
        x={0}
        y={-20}
        width="100%"
        height={40}
        fill="transparent"
      />

      {/* Render chord symbols */}
      {chords.map((chord) => (
        editingChordId === chord.id ? (
          <ChordInput
            key={chord.id}
            x={quantToX(chord.quant)}
            // Use initialValue if provided (for "type to replace"), otherwise existing chord text
            initialValue={initialValue ?? chord.symbol}
            onComplete={(value) => onEditComplete(chord.id, value)}
            onCancel={onEditCancel}
          />
        ) : (
          <ChordSymbol
            key={chord.id}
            chord={chord}
            displayConfig={displayConfig}
            keySignature={keySignature}
            x={quantToX(chord.quant)}
            isSelected={selectedChordId === chord.id}
            onClick={() => onChordClick(chord.id)}
          />
        )
      ))}

      {/* Creating new chord */}
      {editingChordId === 'new' && creatingAtQuant !== null && (
        <ChordInput
          x={quantToX(creatingAtQuant)}
          initialValue=""
          onComplete={(value) => onEditComplete(null, value)}
          onCancel={onEditCancel}
        />
      )}
    </g>
  );
});
```

### 6.2 ChordSymbol Component

```typescript
// src/components/Canvas/ChordTrack/ChordSymbol.tsx

import React, { memo } from 'react';
import { ChordSymbol as ChordSymbolType, ChordDisplayConfig } from '@/types';
import { convertNotation, getAccessibleChordName } from '@/services/ChordService';

interface ChordSymbolProps {
  chord: ChordSymbolType;
  displayConfig: ChordDisplayConfig;
  keySignature: string;
  x: number;
  beatPosition: string; // e.g., "measure 1, beat 1"
  isSelected: boolean;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

export const ChordSymbol = memo(function ChordSymbol({
  chord,
  displayConfig,
  keySignature,
  x,
  beatPosition,
  isSelected,
  onClick,
  onKeyDown,
}: ChordSymbolProps) {
  const displayText = convertNotation(
    chord.symbol,
    displayConfig.notation,
    keySignature,
    displayConfig.useSymbols
  );

  // Accessible name: "C major seventh at measure 1, beat 1 (selected)"
  const accessibleName = getAccessibleChordName(chord.symbol);
  const ariaLabel = `${accessibleName} at ${beatPosition}${isSelected ? ' (selected)' : ''}`;

  return (
    <text
      className={`riff-ChordSymbol ${isSelected ? 'riff-ChordSymbol--selected' : ''}`}
      x={x}
      y={0}
      textAnchor="start"
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-pressed={isSelected}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onKeyDown={onKeyDown}
    >
      {displayText}
    </text>
  );
});
```

### 6.2.1 Accessible Chord Name Helper

```typescript
// In ChordService.ts

const QUALITY_NAMES: Record<string, string> = {
  '': 'major',
  'm': 'minor',
  'dim': 'diminished',
  'aug': 'augmented',
  '7': 'dominant seventh',
  'maj7': 'major seventh',
  'm7': 'minor seventh',
  'dim7': 'diminished seventh',
  'm7b5': 'minor seventh flat five',
  'sus4': 'suspended fourth',
  'sus2': 'suspended second',
  '6': 'major sixth',
  'm6': 'minor sixth',
  '9': 'dominant ninth',
  'maj9': 'major ninth',
  'm9': 'minor ninth',
};

/**
 * Convert chord symbol to screen-reader-friendly name.
 * "Cmaj7" → "C major seventh"
 * "F#m" → "F sharp minor"
 * "Bb/D" → "B flat major over D"
 */
export const getAccessibleChordName = (symbol: string): string => {
  const { root, quality, bass } = extractComponents(Chord.get(symbol));

  // Expand root accidentals
  const rootName = root
    .replace('#', ' sharp')
    .replace('b', ' flat');

  // Get quality name
  const qualityName = QUALITY_NAMES[quality] || quality;

  // Handle bass note
  const bassName = bass
    ? ` over ${bass.replace('#', ' sharp').replace('b', ' flat')}`
    : '';

  return `${rootName} ${qualityName}${bassName}`.trim();
};
```

### 6.3 ChordInput Component

```typescript
// src/components/Canvas/ChordTrack/ChordInput.tsx

import React, { useState, useRef, useEffect, useId, memo } from 'react';
import { parseChord } from '@/services/ChordService';

interface ChordInputProps {
  x: number;
  initialValue: string;
  onComplete: (value: string) => void;
  onCancel: () => void;
}

export const ChordInput = memo(function ChordInput({
  x,
  initialValue,
  onComplete,
  onCancel,
}: ChordInputProps) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const result = parseChord(value);
      if (result.ok) {
        onComplete(result.symbol);
      } else {
        setError(result.message);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (e.key === 'Tab') {
      // Let Tab through for navigation, but validate first
      const result = parseChord(value);
      if (result.ok) {
        onComplete(result.symbol);
      } else {
        e.preventDefault();
        setError(result.message);
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    setError(null);
  };

  const handleBlur = () => {
    if (value.trim()) {
      const result = parseChord(value);
      if (result.ok) {
        onComplete(result.symbol);
      } else {
        onCancel();
      }
    } else {
      onCancel();
    }
  };

  // foreignObject allows HTML input inside SVG
  return (
    <foreignObject x={x - 5} y={-15} width={100} height={50}>
      <div className="riff-ChordInput__container">
        <input
          ref={inputRef}
          className={`riff-ChordInput ${error ? 'riff-ChordInput--error' : ''}`}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder="e.g., Cmaj7"
          aria-label="Enter chord symbol"
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          autoComplete="off"
          spellCheck={false}
        />
        {error && (
          <div
            id={errorId}
            className="riff-ChordInput__error"
            role="alert"
            aria-live="polite"
          >
            {error}
          </div>
        )}
      </div>
    </foreignObject>
  );
});
```

### 6.4 ChordTrack CSS

**First, add CSS variables to `src/styles/theme.css`:**

```css
/* Add to existing :root in theme.css */
:root {
  /* ... existing variables ... */

  /* Chord track */
  --riff-font-chord: 'Arial', sans-serif;
  --riff-chord-font-size: 14px;
  --riff-color-chord: #333;
  --riff-color-chord-hover: #0066cc;
  --riff-color-chord-selected: #0066cc;
}
```

**Then create component styles:**

```css
/* src/components/Canvas/ChordTrack/ChordTrack.css */

.riff-ChordTrack__hitArea {
  /* Cursor set dynamically via onMouseMove based on valid quant positions */
  cursor: default;
}

.riff-ChordSymbol {
  font-family: var(--riff-font-chord, 'Arial', sans-serif);
  font-size: var(--riff-chord-font-size, 14px);
  font-weight: 500;
  fill: var(--riff-color-chord, #333);
  cursor: pointer;
  user-select: none;
}

.riff-ChordSymbol:hover {
  fill: var(--riff-color-chord-hover, #0066cc);
}

.riff-ChordSymbol:focus {
  outline: 2px solid var(--riff-color-focus, #0066cc);
  outline-offset: 2px;
}

.riff-ChordSymbol--selected {
  fill: var(--riff-color-chord-selected, #0066cc);
  font-weight: 600;
}

.riff-ChordInput__container {
  display: flex;
  flex-direction: column;
}

.riff-ChordInput {
  width: 80px;
  padding: 4px 8px;
  font-family: var(--riff-font-chord, 'Arial', sans-serif);
  font-size: 14px;
  border: 2px solid var(--riff-color-border, #ccc);
  border-radius: 4px;
  outline: none;
}

.riff-ChordInput:focus {
  border-color: var(--riff-color-focus, #0066cc);
  box-shadow: 0 0 0 2px rgba(0, 102, 204, 0.2);
}

.riff-ChordInput--error {
  border-color: var(--riff-color-error, #cc0000);
}

.riff-ChordInput--error:focus {
  box-shadow: 0 0 0 2px rgba(204, 0, 0, 0.2);
}

.riff-ChordInput__error {
  font-size: 11px;
  color: var(--riff-color-error, #cc0000);
  margin-top: 2px;
}
```

---

## 7. Hook Design

### 7.1 useChordTrack Hook

> **Note:** This hook follows the composition pattern. Chord selection state is stored in the unified `Selection` interface via `SelectionEngine`, not in local state. This hook primarily manages editing state and exposes handlers for components.

```typescript
// src/hooks/chord/useChordTrack.ts

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { ChordSymbol, Score, Selection } from '@/types';
import { Command } from '@/commands/types';
import { SelectionEngine } from '@/engines/SelectionEngine';
import { getValidChordQuants } from '@/services/ChordService';
import {
  AddChordCommand,
  UpdateChordCommand,
  RemoveChordCommand,
} from '@/commands/chord';

interface UseChordTrackProps {
  scoreRef: React.RefObject<Score>;  // Synchronous score access
  selectionEngine: SelectionEngine;   // Shared selection state
  dispatch: (command: Command) => void;
}

interface ChordTrackEditingState {
  editingChordId: string | null;      // Currently being edited
  creatingAtQuant: number | null;     // Position for new chord
  initialValue: string | null;        // Override initial value (for "type to replace" behavior)
}

export function useChordTrack({
  scoreRef,
  selectionEngine,
  dispatch,
}: UseChordTrackProps) {
  // Local editing state only - selection is in SelectionEngine
  const [editState, setEditState] = useState<ChordTrackEditingState>({
    editingChordId: null,
    creatingAtQuant: null,
    initialValue: null,
  });

  // Subscribe to selection changes
  const [selection, setSelection] = useState(() => selectionEngine.getState());
  useEffect(() => {
    return selectionEngine.subscribe(setSelection);
  }, [selectionEngine]);

  // Derived values (using refs for synchronous access)
  const chords = scoreRef.current.chordTrack || [];
  const validQuants = useMemo(
    () => getValidChordQuants(scoreRef.current),
    [scoreRef.current.staves]
  );

  // Selection is in SelectionEngine (chordId, chordTrackFocused)
  const selectedChordId = selection.chordId;
  const isFocused = selection.chordTrackFocused;

  // Editing handlers
  const startEditing = useCallback((
    chordId: string,
    options?: { replaceWith?: string }
  ) => {
    setEditState({
      editingChordId: chordId,
      creatingAtQuant: null,
      // If replaceWith is provided, the input will start with that character
      // instead of the existing chord text (for "type to replace" behavior)
      initialValue: options?.replaceWith ?? null,
    });
  }, []);

  const startCreating = useCallback((quant: number) => {
    setEditState({ editingChordId: 'new', creatingAtQuant: quant, initialValue: null });
  }, []);

  const completeEdit = useCallback((chordId: string | null, value: string) => {
    if (chordId === null && editState.creatingAtQuant !== null) {
      dispatch(new AddChordCommand(editState.creatingAtQuant, value));
    } else if (chordId && chordId !== 'new') {
      dispatch(new UpdateChordCommand(chordId, value));
    }
    setEditState({ editingChordId: null, creatingAtQuant: null, initialValue: null });
  }, [editState.creatingAtQuant, dispatch]);

  const cancelEdit = useCallback(() => {
    setEditState({ editingChordId: null, creatingAtQuant: null, initialValue: null });
  }, []);

  const deleteChord = useCallback((chordId: string) => {
    dispatch(new RemoveChordCommand(chordId));
  }, [dispatch]);

  return {
    // State
    chords,
    validQuants,
    selectedChordId,        // From SelectionEngine
    isFocused,              // From SelectionEngine
    editingChordId: editState.editingChordId,
    creatingAtQuant: editState.creatingAtQuant,
    initialValue: editState.initialValue,  // For "type to replace" behavior

    // Editing actions
    startEditing,
    startCreating,
    completeEdit,
    cancelEdit,
    deleteChord,
  };
}
```

### 7.1.1 Keyboard Shortcut Integration

```typescript
// In keyboard handler (e.g., useKeyboardNavigation.ts)

// Focus chord track: Cmd+Shift+C (macOS) or Ctrl+Shift+C (Windows/Linux)
const handleKeyDown = (e: KeyboardEvent) => {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const modKey = isMac ? e.metaKey : e.ctrlKey;

  // Toggle chord track focus
  if (modKey && e.shiftKey && e.key.toLowerCase() === 'c') {
    e.preventDefault();
    if (chordTrack.isFocused) {
      chordTrack.blurChordTrack();
    } else {
      // Get current quant from note selection, if any
      const currentQuant = getCurrentQuantFromSelection(selection, score);
      chordTrack.focusChordTrack(currentQuant);
    }
    return;
  }

  // If chord track is focused, handle chord-specific keys
  if (chordTrack.isFocused) {
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        if (chordTrack.editingChordId) {
          // First ESC: Exit edit mode, keep chord selected
          chordTrack.cancelEdit();
        } else {
          // Second ESC: Return focus to staff, select topmost note at chord's quant
          chordTrack.blurChordTrack((quant) => {
            selectTopmostNoteAtQuant(quant, score, setSelection);
          });
        }
        break;

      case 'ArrowLeft':
        e.preventDefault();
        chordTrack.navigateChords('prev');
        break;

      case 'ArrowRight':
        e.preventDefault();
        chordTrack.navigateChords('next');
        break;

      case 'ArrowDown':
        // Cmd/Ctrl + Down: Move from chord to topmost note
        if (modKey && chordTrack.selectedChordId) {
          e.preventDefault();
          chordTrack.blurChordTrack((quant) => {
            selectTopmostNoteAtQuant(quant, score, setSelection);
          });
        }
        break;

      case 'Home':
        e.preventDefault();
        chordTrack.selectFirstChord();
        break;

      case 'End':
        e.preventDefault();
        chordTrack.selectLastChord();
        break;

      case 'Enter':
        e.preventDefault();
        if (chordTrack.selectedChordId) {
          chordTrack.startEditing(chordTrack.selectedChordId);
        } else if (chordTrack.creatingAtQuant !== null) {
          chordTrack.startCreating(chordTrack.creatingAtQuant);
        }
        break;

      case 'Delete':
      case 'Backspace':
        if (chordTrack.selectedChordId && !chordTrack.editingChordId) {
          e.preventDefault();
          chordTrack.deleteChord(chordTrack.selectedChordId);
        }
        break;

      default:
        // Start typing to edit chord - clears existing text and starts with typed character
        if (
          e.key.length === 1 &&
          !e.metaKey &&
          !e.ctrlKey &&
          chordTrack.selectedChordId &&
          !chordTrack.editingChordId
        ) {
          e.preventDefault();
          // Pass the typed character as initial value (replaces existing chord text)
          chordTrack.startEditing(chordTrack.selectedChordId, { replaceWith: e.key });
        }
        break;
    }
  }
};
```

### 7.1.2 Vertical Navigation Integration

The existing `Cmd/Ctrl + ↑/↓` handlers (for moving between notes vertically) need to be extended to include the chord track, with full wrap-around support:

```typescript
// In the main keyboard handler (outside chord track focus block)
// This handles Cmd+Up/Down when a NOTE is selected

case 'ArrowUp':
  if (modKey) {
    e.preventDefault();

    // Check if we're at the topmost note in the topmost staff
    const isTopmostStaff = selection.staffIndex === 0;
    const isTopmostNote = /* existing logic to check if at top of chord/voice */;

    if (isTopmostStaff && isTopmostNote) {
      // Check if a chord exists at the current quant
      const currentQuant = getQuantFromSelection(selection, score);
      const chordAtQuant = score.chordTrack?.find((c) => c.quant === currentQuant);

      if (chordAtQuant) {
        // Move focus to chord track, select this chord
        chordTrack.focusChordTrack();
        chordTrack.selectChord(chordAtQuant.id);
        return;
      }
    }

    // Otherwise, use existing vertical navigation logic
    moveToNoteAbove(selection, score, setSelection);
  }
  break;

case 'ArrowDown':
  if (modKey) {
    e.preventDefault();

    // Check if we're at the bottommost note in the bottommost staff
    const isBottommostStaff = selection.staffIndex === score.staves.length - 1;
    const isBottommostNote = /* existing logic to check if at bottom of chord/voice */;

    if (isBottommostStaff && isBottommostNote) {
      // Wrap around: Check if a chord exists at the current quant
      const currentQuant = getQuantFromSelection(selection, score);
      const chordAtQuant = score.chordTrack?.find((c) => c.quant === currentQuant);

      if (chordAtQuant) {
        // Wrap to chord track (completes the full cycle)
        chordTrack.focusChordTrack();
        chordTrack.selectChord(chordAtQuant.id);
        return;
      }
    }

    // Otherwise, use existing vertical navigation logic
    moveToNoteBelow(selection, score, setSelection);
  }
  break;
```

> **Note:** This implements full wrap-around navigation: Chord → Top note → ... → Bottom note → Chord (if chord exists at that quant). This matches the existing wrap-around behavior for note navigation without chords.

### 7.1.3 Focus Restoration Helper

```typescript
// Helper function to select topmost note at a given quant when returning focus from chord track

/**
 * Select the topmost note group at a given quant position.
 * Used when ESC is pressed to return focus from chord track to staff.
 *
 * @param quant - Global quant position to select
 * @param score - Current score state
 * @param setSelection - Selection setter function
 */
function selectTopmostNoteAtQuant(
  quant: number,
  score: Score,
  setSelection: (selection: Selection) => void
) {
  const quantsPerMeasure = getQuantsPerMeasure(score.timeSignature);
  const measureIndex = Math.floor(quant / quantsPerMeasure);
  const localQuant = quant % quantsPerMeasure;

  // Search staves from top to bottom (index 0 is topmost)
  for (let staffIndex = 0; staffIndex < score.staves.length; staffIndex++) {
    const staff = score.staves[staffIndex];
    const measure = staff.measures[measureIndex];
    if (!measure) continue;

    // Find event at this local quant
    let currentQuant = 0;
    for (let eventIndex = 0; eventIndex < measure.events.length; eventIndex++) {
      const event = measure.events[eventIndex];

      if (currentQuant === localQuant && !event.isRest) {
        // Found a note event at this quant in the topmost staff
        setSelection({
          type: 'event',
          staffIndex,
          measureIndex,
          eventIndex,
          noteIndex: 0, // Select first note in the group
        });
        return;
      }

      currentQuant += getEventQuants(event);
      if (currentQuant > localQuant) break;
    }
  }

  // Fallback: If no note found (unusual), clear selection
  setSelection({ type: 'none' });
}
```

### 7.1.4 Additional useChordTrack Methods

```typescript
// Add to useChordTrack hook

const selectFirstChord = useCallback(() => {
  const sortedChords = [...chords].sort((a, b) => a.quant - b.quant);
  if (sortedChords.length > 0) {
    selectChord(sortedChords[0].id);
  }
}, [chords, selectChord]);

const selectLastChord = useCallback(() => {
  const sortedChords = [...chords].sort((a, b) => a.quant - b.quant);
  if (sortedChords.length > 0) {
    selectChord(sortedChords[sortedChords.length - 1].id);
  }
}, [chords, selectChord]);

// Return in hook
return {
  // ... existing methods ...
  selectFirstChord,
  selectLastChord,
};
```

### 7.2 Chord API Factory

```typescript
// src/hooks/api/chords.ts

import { MusicEditorAPI } from '@/api.types';
import { ChordSymbol, ChordDisplayConfig, ChordPlaybackConfig } from '@/types';
import { APIContext } from './types';
import { parseChord, getValidChordQuants } from '@/services/ChordService';
import {
  AddChordCommand,
  UpdateChordCommand,
  RemoveChordCommand,
} from '@/commands/chord';
import { CONFIG } from '@/config';

/**
 * Method names exposed by the chord API factory.
 * Used for type-safe Pick<MusicEditorAPI, ChordMethodNames>.
 */
export type ChordMethodNames =
  | 'addChord' | 'updateChord' | 'removeChord'
  | 'getChords' | 'getChord' | 'getChordAtQuant' | 'getValidChordQuants'
  | 'selectChord' | 'selectChordAtQuant' | 'deselectChord'
  | 'getSelectedChord' | 'hasChordSelection'
  | 'selectNextChord' | 'selectPrevChord' | 'selectFirstChord' | 'selectLastChord'
  | 'focusChordTrack' | 'blurChordTrack' | 'isChordTrackFocused'
  | 'deleteSelectedChord'
  | 'setChordDisplay' | 'getChordDisplay' | 'setChordPlayback' | 'getChordPlayback';

/**
 * Factory for chord-related API methods.
 * Follows the established createXxxMethods(ctx) pattern.
 */
export const createChordMethods = (
  ctx: APIContext
): Pick<MusicEditorAPI, ChordMethodNames> & ThisType<MusicEditorAPI> => {
  const { getScore, getSelection, syncSelection, dispatch, config, setResult } = ctx;

  // Helper: Get sorted chords
  const getSortedChords = (): ChordSymbol[] =>
    [...(getScore().chordTrack || [])].sort((a, b) => a.quant - b.quant);

  return {
    // ==================== CRUD Operations ====================

    addChord(quant, symbol) {
      const score = getScore();
      const validQuants = getValidChordQuants(score);

      if (!validQuants.has(quant)) {
        setResult({
          ok: false,
          status: 'error',
          code: 'CHORD_INVALID_POSITION',
          message: 'Chords can only be placed where notes begin',
          method: 'addChord',
        });
        return this;
      }

      const parseResult = parseChord(symbol, score.keySignature);
      if (!parseResult.ok) {
        setResult({
          ok: false,
          status: 'error',
          code: parseResult.code,
          message: parseResult.message,
          method: 'addChord',
        });
        return this;
      }

      // Check if replacing existing chord
      const existingChord = score.chordTrack?.find((c) => c.quant === quant);

      dispatch(new AddChordCommand(quant, parseResult.symbol));

      if (existingChord) {
        // Replacement occurred - return warning
        setResult({
          ok: true,
          status: 'warning',
          code: 'CHORD_REPLACED',
          message: `Replaced existing chord ${existingChord.symbol} with ${parseResult.symbol}`,
          method: 'addChord',
        });
      } else {
        setResult({
          ok: true,
          status: 'info',
          message: `Added chord ${parseResult.symbol} at quant ${quant}`,
          method: 'addChord',
        });
      }
      return this;
    },

    updateChord(chordId, symbol) {
      const score = getScore();
      const chord = score.chordTrack?.find((c) => c.id === chordId);

      if (!chord) {
        setResult({
          ok: false,
          status: 'error',
          code: 'CHORD_NOT_FOUND',
          message: `Chord ${chordId} not found`,
          method: 'updateChord',
        });
        return this;
      }

      const parseResult = parseChord(symbol, score.keySignature);
      if (!parseResult.ok) {
        setResult({
          ok: false,
          status: 'error',
          code: parseResult.code,
          message: parseResult.message,
          method: 'updateChord',
        });
        return this;
      }

      dispatch(new UpdateChordCommand(chordId, parseResult.symbol));
      setResult({ ok: true, status: 'info', message: 'Chord updated', method: 'updateChord' });
      return this;
    },

    removeChord(chordId) {
      const score = getScore();
      const chord = score.chordTrack?.find((c) => c.id === chordId);

      if (!chord) {
        setResult({
          ok: false,
          status: 'error',
          code: 'CHORD_NOT_FOUND',
          message: `Chord ${chordId} not found`,
          method: 'removeChord',
        });
        return this;
      }

      // Clear selection if removing selected chord
      const sel = getSelection();
      if (sel.chordId === chordId) {
        syncSelection({ ...sel, chordId: null });
      }

      dispatch(new RemoveChordCommand(chordId));
      setResult({ ok: true, status: 'info', message: 'Chord removed', method: 'removeChord' });
      return this;
    },

    getChords() {
      return getScore().chordTrack || [];
    },

    getChord(chordId) {
      return getScore().chordTrack?.find((c) => c.id === chordId) || null;
    },

    getChordAtQuant(quant) {
      return getScore().chordTrack?.find((c) => c.quant === quant) || null;
    },

    getValidChordQuants() {
      return Array.from(getValidChordQuants(getScore()));
    },

    // ==================== Selection ====================
    // Note: Chord selection is stored in the unified Selection interface
    // via chordId and chordTrackFocused fields.

    selectChord(chordId) {
      const chord = this.getChord(chordId);
      if (!chord) {
        setResult({ ok: false, status: 'error', code: 'CHORD_NOT_FOUND',
          message: `Chord ${chordId} not found`, method: 'selectChord' });
        return this;
      }
      const sel = getSelection();
      syncSelection({ ...sel, chordId, chordTrackFocused: true });
      setResult({ ok: true, status: 'info', message: 'Chord selected', method: 'selectChord' });
      return this;
    },

    selectChordAtQuant(quant) {
      const chord = this.getChordAtQuant(quant);
      if (!chord) {
        setResult({ ok: false, status: 'error', code: 'CHORD_NOT_FOUND',
          message: `No chord at quant ${quant}`, method: 'selectChordAtQuant' });
        return this;
      }
      return this.selectChord(chord.id);
    },

    deselectChord() {
      const sel = getSelection();
      syncSelection({ ...sel, chordId: null });
      setResult({ ok: true, status: 'info', message: 'Chord deselected', method: 'deselectChord' });
      return this;
    },

    getSelectedChord() {
      const sel = getSelection();
      return sel.chordId ? this.getChord(sel.chordId) : null;
    },

    hasChordSelection() {
      return getSelection().chordId !== null;
    },

    // ==================== Navigation ====================

    selectNextChord() {
      const chords = getSortedChords();
      if (chords.length === 0) {
        setResult({ ok: false, status: 'error', code: 'NO_CHORDS',
          message: 'No chords in score', method: 'selectNextChord' });
        return this;
      }
      const sel = getSelection();
      const currentIdx = chords.findIndex((c) => c.id === sel.chordId);
      const nextIdx = currentIdx < chords.length - 1 ? currentIdx + 1 : 0;
      return this.selectChord(chords[nextIdx].id);
    },

    selectPrevChord() {
      const chords = getSortedChords();
      if (chords.length === 0) {
        setResult({ ok: false, status: 'error', code: 'NO_CHORDS',
          message: 'No chords in score', method: 'selectPrevChord' });
        return this;
      }
      const sel = getSelection();
      const currentIdx = chords.findIndex((c) => c.id === sel.chordId);
      const prevIdx = currentIdx > 0 ? currentIdx - 1 : chords.length - 1;
      return this.selectChord(chords[prevIdx].id);
    },

    selectFirstChord() {
      const chords = getSortedChords();
      if (chords.length === 0) {
        setResult({ ok: false, status: 'error', code: 'NO_CHORDS',
          message: 'No chords in score', method: 'selectFirstChord' });
        return this;
      }
      return this.selectChord(chords[0].id);
    },

    selectLastChord() {
      const chords = getSortedChords();
      if (chords.length === 0) {
        setResult({ ok: false, status: 'error', code: 'NO_CHORDS',
          message: 'No chords in score', method: 'selectLastChord' });
        return this;
      }
      return this.selectChord(chords[chords.length - 1].id);
    },

    focusChordTrack() {
      const sel = getSelection();
      syncSelection({ ...sel, chordTrackFocused: true });
      // Auto-select first chord if none selected
      if (!sel.chordId) {
        const chords = getSortedChords();
        if (chords.length > 0) {
          syncSelection({ ...getSelection(), chordId: chords[0].id });
        }
      }
      setResult({ ok: true, status: 'info', message: 'Chord track focused', method: 'focusChordTrack' });
      return this;
    },

    blurChordTrack(options) {
      const sel = getSelection();
      const selectedChord = sel.chordId ? this.getChord(sel.chordId) : null;
      const targetQuant = selectedChord?.quant ?? null;

      syncSelection({ ...sel, chordId: null, chordTrackFocused: false });

      // Optionally select topmost note at chord's quant (for ESC behavior)
      if (options?.selectNoteAtQuant && targetQuant !== null) {
        // This integrates with the existing selection system
        // Implementation delegates to navigation API or selection engine
      }

      setResult({ ok: true, status: 'info', message: 'Chord track blurred', method: 'blurChordTrack' });
      return this;
    },

    isChordTrackFocused() {
      return getSelection().chordTrackFocused;
    },

    // ==================== Editing ====================

    deleteSelectedChord() {
      const sel = getSelection();
      if (!sel.chordId) {
        setResult({ ok: false, status: 'error', code: 'NO_SELECTION',
          message: 'No chord selected', method: 'deleteSelectedChord' });
        return this;
      }
      return this.removeChord(sel.chordId);
    },

    // ==================== Configuration ====================
    // Config stored in RiffScoreConfig, not Score (UI preference, not score data)

    setChordDisplay(displayConfig) {
      // Update config via context's config setter
      setResult({ ok: true, status: 'info', message: 'Display config updated', method: 'setChordDisplay' });
      return this;
    },

    getChordDisplay() {
      return config.chord?.display ?? { notation: 'letter', useSymbols: false };
    },

    setChordPlayback(playbackConfig) {
      setResult({ ok: true, status: 'info', message: 'Playback config updated', method: 'setChordPlayback' });
      return this;
    },

    getChordPlayback() {
      return config.chord?.playback ?? { enabled: true, velocity: 50 };
    },
  };
};
```

### 7.2.1 Integration with useScoreAPI

Add chord methods to the main API instance via spread:

```typescript
// In src/hooks/api/useScoreAPI.ts - add to imports
import { createChordMethods } from './chords';

// In the instance composition (around line 264)
const instance = {
  ...createNavigationMethods(context),
  ...createSelectionMethods(context),
  ...createEntryMethods(context),
  ...createModificationMethods(context),
  ...createHistoryMethods(context),
  ...createPlaybackMethods(context),
  ...createIOMethods(context),
  ...createChordMethods(context),  // <-- Add this line
  // ... rest of instance
};
```

```typescript
// In src/hooks/api/index.ts - add export
export { createChordMethods, type ChordMethodNames } from './chords';
```

### 7.3 Chord Orphan Cleanup

When notes are deleted, chords anchored to orphaned quant positions must be cleaned up. These utilities are added to `ChordService.ts` (not a separate file).

```typescript
// Add to src/services/ChordService.ts

/**
 * Find chords that would be orphaned after a score change.
 * Returns chord IDs that no longer have a valid anchor.
 */
export function findOrphanedChords(
  currentScore: Score,
  updatedScore: Score
): string[] {
  if (!currentScore.chordTrack?.length) return [];

  const newValidQuants = getValidChordQuants(updatedScore);

  return currentScore.chordTrack
    .filter((chord) => !newValidQuants.has(chord.quant))
    .map((chord) => chord.id);
}

/**
 * Remove orphaned chords from a score.
 * Uses existing updateChordTrack helper.
 */
export function removeOrphanedChords(
  score: Score,
  orphanedIds: string[]
): Score {
  if (!orphanedIds.length || !score.chordTrack) return score;

  return updateChordTrack(score, (chordTrack) =>
    chordTrack.filter((chord) => !orphanedIds.includes(chord.id))
  );
}
```

### 7.3.1 Integration with Note Deletion

```typescript
// In DeleteNoteCommand or similar

execute(state: Score): Score {
  // 1. Perform note deletion
  const updatedScore = this.deleteNote(state);

  // 2. Find and store orphaned chords for undo
  this.orphanedChords = findOrphanedChords(state, updatedScore)
    .map((id) => state.chordTrack?.find((c) => c.id === id))
    .filter(Boolean) as ChordSymbol[];

  // 3. Remove orphaned chords
  const finalScore = removeOrphanedChords(
    updatedScore,
    this.orphanedChords.map((c) => c.id)
  );

  // 4. Emit event for UI feedback
  if (this.orphanedChords.length > 0) {
    emitEvent('operation', {
      ok: true,
      code: 'CHORD_ORPHANED',
      message: `${this.orphanedChords.length} chord(s) removed`,
      method: 'deleteNote',
    });
  }

  return finalScore;
}

undo(state: Score): Score {
  // Restore note
  let restoredScore = this.restoreNote(state);

  // Restore orphaned chords
  if (this.orphanedChords.length > 0) {
    restoredScore = {
      ...restoredScore,
      chordTrack: [
        ...(restoredScore.chordTrack || []),
        ...this.orphanedChords,
      ].sort((a, b) => a.quant - b.quant),
    };
  }

  return restoredScore;
}
```

---

## 8. Export Integration

### 8.1 ABC Exporter Updates

```typescript
// In src/exporters/abcExporter.ts - additions

export const generateABC = (score: Score, bpm: number) => {
  // ... existing code ...

  // Build chord lookup by global quant
  const chordsByQuant = new Map<number, string>();
  if (score.chordTrack) {
    for (const chord of score.chordTrack) {
      chordsByQuant.set(chord.quant, chord.symbol);
    }
  }

  const quantsPerMeasure = getQuantsPerMeasure(score.timeSignature);

  staves.forEach((staff: Staff, staffIndex: number) => {
    // ... existing voice header code ...

    staff.measures.forEach((measure: Measure, mIndex: number) => {
      let localQuant = 0;

      measure.events.forEach((event: ScoreEvent) => {
        const globalQuant = mIndex * quantsPerMeasure + localQuant;

        // Insert chord annotation if present (only for first staff)
        if (staffIndex === 0 && chordsByQuant.has(globalQuant)) {
          abc += `"${chordsByQuant.get(globalQuant)}"`;
        }

        // ... existing event rendering code ...

        localQuant += getEventQuants(event);
      });

      abc += '| ';
      if ((mIndex + 1) % 4 === 0) abc += '\n';
    });

    abc += '\n';
  });

  return abc;
};
```

### 8.2 MusicXML Exporter Updates

```typescript
// In src/exporters/musicXmlExporter.ts - additions

import { chordToMusicXML } from '@/utils/chord/converter';

export const generateMusicXML = (score: Score) => {
  // ... existing code ...

  // Build chord lookup
  const chordsByQuant = new Map<number, ChordSymbol>();
  if (score.chordTrack) {
    for (const chord of score.chordTrack) {
      chordsByQuant.set(chord.quant, chord);
    }
  }

  // In measure rendering (first part only):
  if (partIndex === 0) {
    const chord = chordsByQuant.get(globalQuant);
    if (chord) {
      xml += chordToMusicXML(chord.symbol);
    }
  }
};

// Helper function
function chordToMusicXML(symbol: string): string {
  const { root, quality, alterations, bass } = parseChordComponents(symbol);

  let xml = `
      <harmony>
        <root>
          <root-step>${root.letter}</root-step>
          ${root.alter ? `<root-alter>${root.alter}</root-alter>` : ''}
        </root>
        <kind>${qualityToMusicXMLKind(quality)}</kind>`;

  // Export alterations as <degree> elements
  for (const alt of alterations) {
    const { value, alter, type } = parseAlteration(alt);
    xml += `
        <degree>
          <degree-value>${value}</degree-value>
          <degree-alter>${alter}</degree-alter>
          <degree-type>${type}</degree-type>
        </degree>`;
  }

  if (bass) {
    xml += `
        <bass>
          <bass-step>${bass.letter}</bass-step>
          ${bass.alter ? `<bass-alter>${bass.alter}</bass-alter>` : ''}
        </bass>`;
  }

  xml += `
      </harmony>`;

  return xml;
}

/**
 * Parse alteration string to MusicXML degree components.
 * @param alt - Alteration like '#9', 'b5', 'add11'
 */
function parseAlteration(alt: string): { value: number; alter: number; type: string } {
  // Handle 'add' prefix
  if (alt.startsWith('add')) {
    const value = parseInt(alt.slice(3), 10);
    return { value, alter: 0, type: 'add' };
  }

  // Handle sharp/flat alterations
  const match = alt.match(/^([#b])(\d+)$/);
  if (match) {
    const [, accidental, num] = match;
    return {
      value: parseInt(num, 10),
      alter: accidental === '#' ? 1 : -1,
      type: 'alter',
    };
  }

  // Fallback
  return { value: 0, alter: 0, type: 'alter' };
}
```

---

## 9. Playback Integration

### 9.1 ToneEngine Updates

```typescript
// In src/engines/toneEngine.ts - additions

import { getChordVoicing } from '@/services/ChordService';

interface PlaybackOptions {
  // ... existing options ...
  chordPlayback?: {
    enabled: boolean;
    velocity: number;
  };
}

// In scheduling logic:
function scheduleChords(
  chordTrack: ChordSymbol[],
  timeline: TimelineService,
  options: PlaybackOptions,
  quantsPerMeasure: number
) {
  if (!options.chordPlayback?.enabled) return;

  for (const chord of chordTrack) {
    const time = timeline.quantToTime(chord.quant);
    const notes = getChordVoicing(chord.symbol);
    const velocity = options.chordPlayback.velocity / 127;

    // Find duration until next chord or end of measure containing last note
    const nextChord = chordTrack.find((c) => c.quant > chord.quant);
    let endQuant: number;

    if (nextChord) {
      // Sustain until next chord
      endQuant = nextChord.quant;
    } else {
      // Last chord: sustain until end of measure containing the last note
      const lastNoteQuant = timeline.getLastNoteQuant();
      const measureIndex = Math.floor(lastNoteQuant / quantsPerMeasure);
      endQuant = (measureIndex + 1) * quantsPerMeasure; // End of that measure
    }

    const duration = timeline.quantToTime(endQuant) - time;

    for (const note of notes) {
      synth.triggerAttackRelease(note, duration, time, velocity);
    }
  }
}
```

---

## 10. Accessibility Implementation

### 10.1 ARIA Attributes Summary

| Component | Attributes |
|-----------|------------|
| ChordTrack `<g>` | `role="region"`, `aria-label="Chord symbols"` |
| ChordSymbol `<text>` | `role="button"`, `tabIndex={0}`, `aria-label`, `aria-pressed` |
| ChordInput `<input>` | `aria-label`, `aria-invalid`, `aria-describedby` |
| Error message `<div>` | `role="alert"`, `aria-live="polite"` |

### 10.2 Focus Management Implementation

```typescript
// Focus order: Notes → Chords → Toolbar
// ChordTrack participates in tab sequence when focused via Cmd+Shift+C

// When chord track gains focus
useEffect(() => {
  if (isFocused && chords.length > 0) {
    // Focus first chord or chord at current quant
    const targetChord = creatingAtQuant
      ? chords.find((c) => c.quant === creatingAtQuant)
      : chords[0];

    if (targetChord) {
      const element = document.querySelector(
        `[data-chord-id="${targetChord.id}"]`
      );
      (element as HTMLElement)?.focus();
    }
  }
}, [isFocused, chords, creatingAtQuant]);
```

### 10.3 Screen Reader Announcements

```typescript
// Announce chord changes to screen readers
const announceChordChange = (action: string, chordName: string) => {
  const announcement = document.createElement('div');
  announcement.setAttribute('role', 'status');
  announcement.setAttribute('aria-live', 'polite');
  announcement.setAttribute('aria-atomic', 'true');
  announcement.className = 'riff-sr-only';
  announcement.textContent = `${action}: ${chordName}`;

  document.body.appendChild(announcement);
  setTimeout(() => announcement.remove(), 1000);
};

// Usage
announceChordChange('Added', 'C major seventh');
announceChordChange('Removed', 'D minor');
announceChordChange('Changed to', 'G dominant seventh');
```

### 10.4 CSS for Screen Reader Only Elements

```css
.riff-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

---

## 11. Implementation Phases

### Phase 1: Foundation (Days 1-2)

1. Add types to `src/types.ts`
2. Create `ChordService` with parsing and basic conversion
3. Create chord commands (Add, Update, Remove)
4. Write unit tests for parser and commands

### Phase 2: UI Components (Days 3-4)

5. Create `ChordTrack`, `ChordSymbol`, `ChordInput` components
6. Create `useChordTrack` hook
7. Integrate with `ScoreCanvas`
8. Add CSS styles

### Phase 3: API & Interaction (Days 5-6)

9. Create chord API factory
10. Integrate with `useScoreAPI`
11. Implement keyboard handlers
12. Write integration tests

### Phase 4: Export (Day 7)

13. Update ABC exporter
14. Update MusicXML exporter
15. Write export tests

### Phase 5: Playback (Day 8)

16. Add voicing to ChordService
17. Integrate with ToneEngine
18. Add playback configuration

### Phase 6: Polish (Days 9-10)

19. Add all notation conversions
20. Performance optimization
21. Accessibility audit
22. Documentation update

---

## 12. Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| tonal.js parsing limitations | Medium | Build fallback parser for edge cases |
| SVG foreignObject browser support | Low | Test early; fallback to pure SVG text input |
| Performance with many chords | Medium | Virtualize chord rendering if needed |
| Undo/redo with chord display changes | Low | Keep display config separate from score undo stack |

---

## 13. Related Documents

- [PRD.md](./PRD.md) - Product Requirements Document
- [SRS.md](./SRS.md) - Software Requirements Specification
- [ARCHITECTURE.md](../ARCHITECTURE.md) - System architecture
- [COMMANDS.md](../COMMANDS.md) - Command pattern reference
- [ADR-004](../adr/004-api-factory-pattern.md) - API Factory Pattern
- [ADR-011](../adr/011-structured-api-feedback.md) - Structured Feedback
