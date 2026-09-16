[← Back to README](../README.md)

# RiffScore Configuration Guide

Complete reference for configuring the `<RiffScore />` component.

> **See also**: [API Reference](./API.md) • [Cookbook](./COOKBOOK.md) • [Architecture](./ARCHITECTURE.md) • [Interaction Design](./INTERACTION.md)

## Basic Usage

```tsx
import { RiffScore } from 'riffscore';

// Default configuration
<RiffScore />

// With custom config
<RiffScore config={{
  ui: { showToolbar: true, scale: 1 },
  interaction: { isEnabled: true },
  score: { staff: 'grand', measureCount: 4 }
}} />
```

## Configuration Interface

```typescript
interface RiffScoreConfig {
  ui: {
    showToolbar: boolean;  // Show/hide the toolbar
    scale: number;         // Zoom scale factor
    theme?: ThemeName;     // 'DARK' | 'COOL' | 'WARM' | 'LIGHT'
    showBackground?: boolean; // Show/hide panel background
    showScoreTitle?: boolean; // Show/hide score title input
  };
  interaction: {
    isEnabled: boolean;      // Master switch for all interactions
    enableKeyboard: boolean; // Keyboard shortcuts
    enablePlayback: boolean; // Playback controls
  };
  score: {
    title: string;           // Score title
    bpm: number;             // Beats per minute
    timeSignature: string;   // e.g., '4/4', '3/4', '6/8'
    keySignature: string;    // e.g., 'C', 'G', 'Bb'
    staff?: StaffTemplate;   // 'grand' | 'treble' | 'bass' | 'alto' | 'tenor'
    measureCount?: number;   // Number of measures to generate
    staves?: Staff[];        // Explicit content (overrides generator); staff.clef: 'treble' | 'bass' | 'alto' | 'tenor' | 'grand'
    abc?: string;            // ABC notation to import as the initial score (overrides staves and generator options)
    musicxml?: string;       // MusicXML text to import as the initial score (abc wins when both are given)
  };
  chord?: {
    display?: {
      notation: 'letter' | 'roman' | 'nashville' | 'fixedDo' | 'movableDo';
      useSymbols: boolean;     // △/°/+ vs maj/dim/aug
    };
    playback?: {
      enabled: boolean;        // Enable chord playback
      velocity: number;        // 0-127
    };
  };
}
```

## Default Values

| Property | Default |
|----------|---------|
| `ui.showToolbar` | `true` |
| `ui.scale` | `0.75` |
| `ui.theme` | `'LIGHT'` |
| `ui.showBackground` | `true` |
| `ui.showScoreTitle` | `true` |
| `interaction.isEnabled` | `true` |
| `interaction.enableKeyboard` | `true` |
| `interaction.enablePlayback` | `true` |
| `score.title` | `'Untitled'` |
| `score.bpm` | `120` |
| `score.timeSignature` | `'4/4'` |
| `score.keySignature` | `'C'` |
| `score.staff` | `'grand'` |
| `score.measureCount` | `4` |
| `score.abc` | — |
| `score.musicxml` | — |
| `chord.display.notation` | `'letter'` |
| `chord.display.useSymbols` | `false` |
| `chord.playback.enabled` | `true` |
| `chord.playback.velocity` | `50` |

---

## Modes

### Generator Mode

Create blank scores from templates by specifying `staff` and `measureCount`:

```tsx
// Grand staff (treble + bass) with 8 measures
<RiffScore config={{
  score: { staff: 'grand', measureCount: 8 }
}} />

// Single treble staff in G major
<RiffScore config={{
  score: { 
    staff: 'treble', 
    measureCount: 4,
    keySignature: 'G'
  }
}} />
```

### Render Mode

Load existing compositions by providing a `staves` array. When `staves` is provided, it overrides the Generator Mode options:

```tsx
const myComposition = {
  staves: [
    {
      id: 'staff-1',
      clef: 'treble',
      keySignature: 'D',
      measures: [/* your measures */]
    }
  ]
};

<RiffScore config={{
  score: { staves: myComposition.staves }
}} />
```

### ABC Mode

Seed the editor from a tune in [ABC notation](./ABC_IMPORT.md). The tune's own title, key, meter
and tempo are used; `abc` takes precedence over `staves` and the generator options. If the text
contains no music, the generator options apply and a warning is logged.

```tsx
<RiffScore config={{
  score: {
    abc: `X:1
T:The Kesh
M:6/8
L:1/8
K:G
G3 GAB|A3 ABd|edd gdd|edB dBA|G3 GAB|A3 ABd|edd gdB|AGF G3|`,
  },
}} />
```

### MusicXML Mode

Seed the editor from a [MusicXML](./MUSICXML_IMPORT.md) document (the text of a `.musicxml` /
`.xml` file; unpack a compressed `.mxl` first with `unpackScoreFile(bytes).text`, or use the File menu). The
document's own title, key, meter and tempo are used; `musicxml` takes precedence over `staves`
and the generator options, and `abc` over both. If the text is not a MusicXML score, the
generator options apply and a warning is logged.

```tsx
<RiffScore config={{
  score: {
    musicxml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>Study</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><key><fifths>1</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`,
  },
}} />
```


---

## UI Configuration

### Hide Toolbar

```tsx
<RiffScore config={{
  ui: { showToolbar: false }
}} />
```

### Scaled Display

```tsx
// 75% scale for compact views
<RiffScore config={{
  ui: { scale: 0.75 }
}} />

// 150% scale for detailed editing
<RiffScore config={{
  ui: { scale: 1.5 }
}} />
```

### Theme Selection

```tsx
// Available themes: 'DARK', 'COOL', 'WARM', 'LIGHT'
<RiffScore config={{
  ui: { theme: 'COOL' }
}} />
```

---

## Interaction Configuration

### Read-Only Mode

Disable all interactions for static score display:

```tsx
<RiffScore config={{
  interaction: { isEnabled: false }
}} />
```

### Disable Keyboard Shortcuts

```tsx
<RiffScore config={{
  interaction: { enableKeyboard: false }
}} />
```

### Disable Playback

```tsx
<RiffScore config={{
  interaction: { enablePlayback: false }
}} />
```

---

## Score Content

### Key Signatures

Supported keys: `C`, `G`, `D`, `A`, `E`, `B`, `F#`, `C#`, `F`, `Bb`, `Eb`, `Ab`, `Db`, `Gb`, `Cb`

Minor keys: `Am`, `Em`, `Bm`, `F#m`, `C#m`, `G#m`, `D#m`, `A#m`, `Dm`, `Gm`, `Cm`, `Fm`, `Bbm`, `Ebm`, `Abm`

```tsx
<RiffScore config={{
  score: { keySignature: 'Bb' }
}} />
```

### Time Signatures

Supported: `4/4`, `3/4`, `2/4`, `6/8`

```tsx
<RiffScore config={{
  score: { timeSignature: '3/4' }
}} />
```

### Tempo

```tsx
<RiffScore config={{
  score: { bpm: 140 }
}} />
```

`score.bpm` is the score's authoritative tempo: `api.play()` and the exporters use it, and `api.setBpm()` changes it (undoably). The toolbar's tempo input is a *working* tempo (issue #22): it is seeded from `score.bpm` and re-synced whenever the score tempo changes — a loaded or imported score, a melody from the library, `api.setBpm()`, `api.reset()`, undo/redo — but editing it in the toolbar only changes what the toolbar's Play button plays and never writes back to the score, so a practice tempo can differ from the notated one.

---

## Chord Configuration

### Display Notation

```tsx
// Display chords as Roman numerals with typographic symbols
<RiffScore config={{
  chord: {
    display: { notation: 'roman', useSymbols: true }
  }
}} />
```

Available notations: `'letter'` (default), `'roman'`, `'nashville'`, `'fixedDo'`, `'movableDo'`

### Playback Settings

```tsx
// Disable chord playback
<RiffScore config={{
  chord: {
    playback: { enabled: false }
  }
}} />

// Custom chord velocity
<RiffScore config={{
  chord: {
    playback: { enabled: true, velocity: 80 }
  }
}} />
```

---

## Layout Configuration

Page view and print read `score.layout` (a `LayoutConfig` stored with the score). It is not part of `RiffScoreConfig`: set it through the API (`setViewMode`, `setLayoutConfig`, `resetLayoutConfig` — see [API.md](API.md) §12; a score passed to `loadScore` uses its own `layout` when it has one, otherwise the editor's current layout) or in the Score Setup dialog (`Cmd+,`).

```typescript
interface LayoutConfig {
  pageSize: 'letter' | 'a4';
  margins: 'narrow' | 'normal' | 'wide';
  staffSize: number;                                // 50-150, in steps of 10
  systemSpacing: 'compact' | 'normal' | 'relaxed';
  viewMode: 'scroll' | 'page';
}
```

| Property | Default | Notes |
|----------|---------|-------|
| `pageSize` | `'letter'` | |
| `margins` | `'normal'` | 19mm on all sides (`narrow` 12.7mm, `wide` 25.4mm) |
| `staffSize` | `60` | Percent of the canvas staff. 60 is a 7.6mm staff — the standard for lead sheets, vocal and piano music. Range 50-150 in steps of 10. |
| `systemSpacing` | `'normal'` | Scales the minimum gap between systems in page view (`compact` ×0.5, `relaxed` ×1.5). Full pages before the last are still vertically justified. |
| `viewMode` | `'scroll'` | |

---

## Partial Configuration

You only need to specify the values you want to override. Everything else uses defaults:

```tsx
// Only change the key signature
<RiffScore config={{
  score: { keySignature: 'G' }
}} />

// Only hide the toolbar
<RiffScore config={{
  ui: { showToolbar: false }
}} />
```
