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
    showFooter?: boolean;
    showScore?: boolean;   // Show notation; custom controls remain mounted
    showGhostNotes?: boolean;
    showBlockedGhostNotes?: boolean;
    viewport?: ViewportConfig;
    engraving?: EngravingConfig;
    themeOverrides?: DeepPartial<Theme>;
    scrollPadding?: { top?: number; bottom?: number };
    scoreTitleOffset?: { x?: number; y?: number };
    scale: number;         // Zoom scale factor
    theme?: ThemeName;     // 'DARK' | 'COOL' | 'WARM' | 'LIGHT'
    showBackground?: boolean; // Show/hide panel background
    showScoreTitle?: boolean; // Show/hide score title input
  };
  interaction: {
    isEnabled: boolean;      // Master switch for all interactions
    enableKeyboard: boolean; // Keyboard shortcuts
    enablePlayback: boolean; // Playback controls
    allowEventInsertion?: boolean;
    allowDurationChanges?: boolean;
    allowEventDeletion?: boolean;
  };
  score: {
    title: string;           // Score title
    bpm: number;             // Beats per minute
    timeSignature: string;   // e.g., '4/4', '3/4', '6/8', or 'none'
    keySignature: string;    // e.g., 'C', 'G', 'Bb'
    staff?: StaffTemplate;   // 'grand' | 'treble' | 'bass' | 'alto' | 'tenor'
    measureCount?: number;   // Number of measures to generate
    staves?: Staff[];        // Explicit content (overrides generator); staff.clef: 'treble' | 'bass' | 'alto' | 'tenor' | 'grand'
    abc?: string;            // ABC notation to import as the initial score (overrides staves and generator options)
    musicxml?: string;       // MusicXML text to import as the initial score (abc wins when both are given)
  };
  chord?: {
    recognition?: { enabled: boolean; staffIndex?: number; includeBass?: boolean };
    display?: {
      visible?: boolean;
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


## Alpha.18 presentation and interaction controls

All configuration fields accept nested partial objects. Arrays are replaced whole. Presentation changes do not reload the document or clear undo history.

| Option | Behavior |
|---|---|
| `ui.showFooter`, `ui.showGhostNotes`, `ui.showBlockedGhostNotes` | Default to true; hiding previews does not disable entry or validation |
| `ui.viewport` | CSS-pixel `width`, `minWidth`, `maxWidth`, `height`, `minHeight`, `maxHeight`; explicit score-coordinate `bounds: { x, y, width, height }`; `verticalAlign: 'start' / 'center' / 'end'`; `overflow: 'auto' / 'hidden' / 'visible'`. Fullscreen uses the available screen instead. |
| `ui.themeOverrides` | Per-instance partial theme overrides, including `score.note`, `score.line`, `score.highlight` (selection/hover/entry ink); no global theme mutation |
| `ui.scoreTitleOffset` | Scroll-title x/y offset in unscaled staff units |
| `ui.scrollPadding` | Scroll-view top/bottom padding in unscaled staff units; defaults 0/50 in addition to required title/chord/high/low-note clearance |
| `ui.engraving.tuplets.hideBracketWhenBeamed` | Optional beam-centered number without bracket when one beam covers the complete tuplet; default false |

`ui.engraving` supplies ordinary scroll-view preferences. Except for `tuplets`, it is ignored in page view, which retains its own page-layout rules:

```ts
interface EngravingConfig {
  spacing?: 'natural' | 'justify';
  contentWidth?: number; // total measure-area width in unscaled staff units
  showPlaceholderRests?: boolean;
  stemDirection?: 'up' | 'down';
  showPreamble?: boolean;
  showBarlines?: boolean;
  tuplets?: { hideBracketWhenBeamed?: boolean };
}
```

`contentWidth` expands available space without shrinking the natural engraving. With `spacing: 'natural'`, extra space follows the final event; otherwise measures are justified. Visibility preferences default to true. These settings do not alter exported pitches, rhythm, clefs, or barlines. Chord-symbol visibility is controlled separately by `chord.display.visible`; hiding it also skips chord-input keyboard navigation.

### Editing permissions

`allowEventInsertion`, `allowDurationChanges`, and `allowEventDeletion` default to true. Set them independently to constrain user gestures while retaining selection and permitted edits. For example:

```tsx
<RiffScore config={{
  interaction: {
    allowEventInsertion: false,
    allowDurationChanges: false,
    allowEventDeletion: false,
  },
}} />
```

This preserves rhythmic events while allowing pitch edits and adding/removing tones within an existing chord. It is not a pitch-only mode: removing the final pitched tone is blocked, but changing chord membership is allowed. Permissions apply to editor actions and custom controls, including undo/redo. Host API calls remain unrestricted so the application can load or transform music. These are UI constraints, not a security boundary. Legacy transactions still group history and publish intermediate changes; they are not a new atomic transaction API.

Use `api.getInteractionConfig()`, `api.setInteractionConfig(partial)`, and `api.resetInteractionConfig()` to change permissions at runtime. Overrides merge over current props and persist until reset; changing them preserves the document and history. `isEnabled: false` disables editing while retaining native scroll behavior.

### Reactive custom controls and external cursors

The `renderControls` prop receives the current score, `canUndo`, `canRedo`, `undo`, `redo`, `isPlaying`, `play`, `pause`, `stop`, `seek`, `bpm`, `setBpm`, `instrument`, `setInstrument`, and `samplerLoaded`. Call playback from a user gesture. Practice tempo differs from an undoable score tempo edit. API playback, toolbar playback and these controls share one per-view transport, practice tempo, and instrument. An authoritative score BPM change (including undo) clears the practice override.

```tsx
<RiffScore renderControls={({ canUndo, undo, isPlaying, play, pause }) => (
  <div>
    <button disabled={!canUndo} onClick={undo}>Undo</button>
    <button onClick={() => { if (isPlaying) pause(); else void play(); }}>
      {isPlaying ? 'Pause' : 'Play'}
    </button>
  </div>
)} />
```

`playbackCursor` accepts `{ measureIndex, quant, duration, isPlaying }` for an externally driven visual cursor. `duration` is seconds until the next onset. Omit the prop to use the editor cursor; pass `null` to hide it. This only changes cursor presentation, not selection or audio transport. Playback still uses one shared audio engine; independently simultaneous transports are not supported.

### Unmetered notation and chord recognition

Set `score.timeSignature: 'none'` (or import ABC `M:none`) for measures without a fixed entry capacity. Explicit barlines still synchronize staves; playback derives each measure's duration from its content. Empty zero-length bars do not emit invalid zero-duration MusicXML rests.

`chord.recognition: { enabled: true, staffIndex: 0, includeBass: true }` derives chord symbols from simultaneous notes on the selected staff. It requires three distinct pitch classes, ignores octave doublings, and optionally labels inversions. It does not infer missing roots or interpret arpeggios/context. When enabled, recognition **owns and replaces the chord track**, including API/export output and imports; disable it when preserving supplied harmony. Disabling recognition retains the current track rather than restoring an earlier authored one.

For analysis without changing a score, use the exported `recognizeChord(pitches, includeBass?)` or `recognizeScoreChords(score, config)` functions.


### Shared documents and measure windows

```tsx
import { RiffScore, RiffScoreSession } from 'riffscore';

<RiffScoreSession config={{ score: { abc: music } }}>
  <RiffScore id="whole" />
  <RiffScore id="excerpt" config={{ ui: {
    view: { measures: { start: 2, end: 6 }, clefs: { 0: 'bass' } },
    showToolbar: false,
  } }} />
</RiffScoreSession>
```

The session owns one score, selection and undo history. Its `config.score` seeds the document on mount; load through an API or replace the session's React key to replace the document. Its `chord.recognition` owns recognition for the document. Child score seeds and recognition settings do not override the session.

Each view owns its presentation, permissions and transport. `ui.view.measures` uses zero-based source indices with an exclusive end (defaults: start 0, end all measures). A measure window renders in scroll mode even when the document's layout is page mode. APIs still address and export the complete source document; identities and indices are never renumbered. A window limits rendering, not editing authorization or keyboard navigation. `ui.view.clefs` maps zero-based staff indices to rendering-only clefs; exports retain the source clefs. Removing the window restores the document's chosen view mode. Session composition does not coordinate focus, navigation, MIDI targeting, or independent-score playback.

### Chord typography

Use `chord.display.font: { family, size, weight }` for chord symbols in both scroll and page views. `size` is a positive number in unscaled score units. Font options do not change the symbols exported with the score. Supply/load any custom text font through the host; RiffScore retains its text fallback. Chord visibility and notation style remain under `chord.display`.

### Anchored SVG content

`renderOverlay({ pageIndex, bounds, resolveAnchor })` returns SVG children. Use `{ noteId }` or `{ staffId, measureId, quant }` to resolve source identities. Deleted, ambiguous, invalid or out-of-view anchors return `null`. Scroll coordinates are unscaled score units; page coordinates are pixels on the indicated zero-based page. The callback runs once per rendered page, or with `pageIndex: null` in scroll view.

```tsx
<RiffScore renderOverlay={({ resolveAnchor }) => {
  const point = resolveAnchor({ noteId: selectedNoteId });
  return point ? <circle cx={point.x} cy={point.y - 20} r={4} /> : null;
}} />
```

Overlays do not change engraving or reserve space implicitly. Declare required scroll space through `ui.viewport.bounds`; positive finite width/height and finite x/y are required. Bounds, scroll padding, measure windows, and scale share the same coordinate transform as interaction. Invalid scale values fall back to the default. For HTML inside an overlay, return an SVG `foreignObject` and supply accessible names and keyboard behavior.

### Music glyph adapters

Wrap views in `MusicGlyphProvider` with a stable `MusicGlyphAdapter` object (`id`, optional async `load`, `renderGlyph`). During SSR, loading, rejection, adapter replacement or an unsupported glyph run, core renders bundled Bravura. Returning `null` from `renderGlyph` also requests fallback. Font loading belongs to the adapter; dispose host-owned resources when its host unmounts.

`renderGlyph(props, metrics)` receives the SVG text props and default metrics for each glyph. Metrics use SMuFL staff spaces (four per em), a Y-up coordinate system, and bounds `[left, bottom, right, top]`. `getDefaultGlyphMetrics` exposes the same data. An adapter must preserve the canonical Bravura advance, baseline and layout envelope. Core supplies this rendering contract; it does not automatically fit arbitrary fonts. Bravura and its metrics retain their SIL Open Font License notice in the package.

### Headless musical queries

Import from `riffscore/theory` for Node/worker use without React, CSS, DOM or audio initialization. The entry exports recognition, measure timing/offsets, `createTimeline`, duration/capacity queries, `parseChord`, `getChordVoicing`, and score types. Timing uses 64 quants per whole note. This is a query surface, not an arranging or document-mutation SDK.

### Printing in a host application

Page view supplies physical page dimensions and print styles that hide editor chrome and remove viewport limits. The host chooses which editors and surrounding content to print with its own `@media print` CSS. Hide unrelated wide scroll views when printing a paginated score, or the browser may shrink the entire document to fit. RiffScore does not hide arbitrary host content.

## Presentation composition (alpha.19 candidate)

`apiRef` exposes the same `MusicEditorAPI` as the instance registry, without a global lookup. Use a React ref or callback ref; it is cleared when the view unmounts. Changing presentation props retains the document and undo history.

```tsx
const api = useRef<MusicEditorAPI>(null);
<RiffScore apiRef={api} resolveViewport={(geometry) => ({
  bounds: geometry.contentBounds,
  scale: 0.75,
})} />
```

`resolveViewport` is a pure render-time function over frozen, detached scroll-view geometry. Coordinates are unscaled score units. The geometry includes staff identities, displayed clefs, staff endpoints, staff spacing, engraving content bounds and the default viewport. Content bounds describe the engraving envelope, not browser-measured text ink; applications with long titles or custom overlays must reserve their required space. The callback must not set state or edit the score. Observe the outer host when adapting to container width, not the SVG being resized.

Explicit `ui.viewport.bounds` takes precedence over callback bounds. Invalid bounds or nonpositive/nonfinite scale values fall back to core defaults. Callback exceptions propagate to the application's error boundary. Page view ignores this callback. Scaling applies consistently to rendering and pointer coordinates; it does not reflow musical layout. The default canvas left padding is disabled while a viewport policy owns framing; include desired padding in the returned bounds. Autoscroll defaults off for custom viewports, with the opt-in described below.

`renderOverlay` receives the same geometry in scroll view; `geometry` is `null` in page view. Overlays must reserve space through the viewport and use `resolveAnchor` for source note identities. `ClefGlyph` and `MusicGlyph` are exported for decorations that use core glyph metrics and the active adapter. The stable styling hook `[data-riffscore-part="note"]` marks real note groups; it excludes entry previews.

`ui.showScore: false` hides notation and disables its editor keyboard listener while keeping the API, history and custom controls mounted. It defaults to true. `renderControls` also exposes `playbackState` and `playbackEnabled`. A synchronous `controls.seek(measure, quant); controls.play()` starts at the new position. Seeking pauses playback. Disabling playback does not remove the host's explicit API authority.

`riffscore/extensions` is a headless entry point containing contract version 1, capability names and `assertExtensionCompatibility`. This is an explicit compatibility check, not a registry, loader, license manager or global service container. React integrations use ordinary imports, props and providers.

Viewport resolvers may return `autoScroll: true` to follow selection, keyboard entry and playback within a scrollable frame. It defaults off for custom viewports. Core uses the canonical engraving coordinates, resolved origin and effective scale; page views and measure windows retain their own behavior. Reduced-motion preferences disable smooth scrolling.

### Notehead labels and below-staff rows

The optional `annotations` presentation prop supplies generic notehead text and ordered text rows. It requires the `score-annotations` capability. Resolvers receive frozen, detached musical facts, including source identities, written pitches, key, meter, duration, and measure-local quant. They must be pure; exceptions propagate to the host's error boundary. Keep the annotation object stable with `useMemo` when deriving it from host settings.

```tsx
import type { ScoreAnnotations } from 'riffscore';
const annotations: ScoreAnnotations = {
  notehead: ({ note }) => ({ label: note.pitch?.[0] }),
  rows: [{
    id: 'pitch',
    label: 'Written pitch',
    staffIds: ['melody'], // omit to apply to every staff
    text: ({ notes, isRest }) => isRest ? null : notes.map(note => note.pitch ?? ''),
  }],
};
<RiffScore annotations={annotations} />
```

Rows have unique nonempty IDs and accessible names. Return `null` for blank events, a string for one line, or a string array for a vertical stack. Core reserves the largest stack for each row on each staff; subsequent rows follow in array order. Existing `staff.lyricLines` reservations come first. Rows use deterministic fixed-width text metrics for SSR and browser agreement; their width participates in synchronized note spacing, system breaks, and their height in staff/page spacing. They are inert to pointer interaction. Long prose belongs in host content rather than event labels.

Notehead labels fit inside the existing head envelope and retain stem attachment and the filled/hollow duration distinction. Labeled hollow heads use a thin outlined oval within the standard envelope to keep staff and ledger lines out of the text; unlabeled and filled heads retain the active music glyph. Use short labels (typically one to three characters); use rows for longer text and for reading at small display sizes. Labels remain text in SVG and carry accessible names. Ordinary notes remain unchanged when annotations are absent; entry ghosts never receive labels.

Annotations are view-only. They do not become lyrics, enter document history, alter playback, or appear in MusicXML/ABC/JSON exports. Browser printing includes them. Each view of a shared session can use different annotations. Explicit host viewport bounds still win and may intentionally crop annotations. Core supplies presentation primitives; educational naming conventions and presets belong to the integrating application or extension.

`riffscore/theory` additionally exports `getPitchInfo` (written letter, signed alteration, octave, pitch class; `null` for invalid input) and `resolveKey`/`ResolvedKey`/`KeyMode`. These expose existing theory facts without importing React or a second music engine.
