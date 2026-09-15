[← Back to README](../README.md)

# MusicXML Import

> What the MusicXML importer understands, how it maps onto the score model, and what it warns about.

> **See also**: [ABC Import](./ABC_IMPORT.md) • [API Reference](./API.md) • [Configuration](./CONFIGURATION.md) • [Data Model](./DATA_MODEL.md)

RiffScore reads [MusicXML](https://www.w3.org/2021/06/musicxml40/) — the interchange format every
major notation app (MuseScore, Finale, Sibelius, Dorico) exports — both as plain `.musicxml` /
`.xml` documents and as compressed `.mxl` archives. The editor's own MusicXML export round-trips
back in losslessly (the one exception is a note's `'hide'` accidental policy, which MusicXML has
no way to say). The importer is dependency-free (`src/importers/musicXmlImporter.ts`, with
its own small XML reader in `xml.ts` and a DEFLATE decoder for `.mxl` in `inflate.ts` / `mxl.ts`);
nothing is bundled from an XML or zip library.

---

## 1. Three ways in

| Entry point | Use it for |
| :--- | :--- |
| **File menu → Import → ABC, MusicXML or JSON…** | Paste MusicXML, or open a `.musicxml` / `.xml` / `.mxl` file. A compressed archive is unpacked into the text box. The dialog previews the title, staves and bar count and lists every warning before you commit. Importing replaces the score as **one undo step**. |
| **`api.import('musicxml', content)`** | Programmatic import with structured feedback (see [§9](#9-api-and-feedback)). `content` is the document text, or the bytes (`ArrayBuffer` / `Uint8Array`) of a `.musicxml` or `.mxl` file. |
| **`<RiffScore config={{ score: { musicxml } }} />`** | Seed a component from a MusicXML string. The document's own title, key, meter and tempo are used; on failure the generator options apply and a warning is logged. |

Without a mounted editor, `importScoreText(text)` auto-detects ABC, MusicXML (text starting with
`<`) and JSON, and `importScoreData(bytes)` adds the `.mxl` step in front of it.

---

## 2. Documents and containers

| Input | Handling |
| :--- | :--- |
| `score-partwise` | Any MusicXML version (1.x–4.x). The DOCTYPE, comments, CDATA and character references are all read; a namespace prefix is ignored. |
| `score-timewise` | Regrouped into parts and imported the same way. |
| `.mxl` archive | The score named by `META-INF/container.xml` is unpacked (stored and deflated entries); without a usable container the first `.xml` / `.musicxml` entry outside `META-INF` is used. |
| Text encoding | UTF-8 (with or without a byte-order mark), UTF-16 by its byte-order mark, and an ISO-8859-1 / Windows-1252 `encoding` declaration. |
| `opus`, other roots, malformed XML | Fail with an error (`not well-formed XML: … (line N)`, `not a MusicXML score …`); nothing is loaded. |

---

## 3. Header

| Element | Becomes | Notes |
| :--- | :--- | :--- |
| `work/work-title` | `title` / `metadata.title` | Falls back to `movement-title`, then a `credit` of type `title`, then "Untitled". |
| `identification/creator[@type="composer"]` | `metadata.composer` | An untyped `creator` counts as the composer. `arranger` is ignored. |
| `creator[@type="lyricist"]` (or `poet`) | `metadata.lyricist` | |
| `identification/rights` | `metadata.copyright` | |
| `defaults`, `credit` (other), `encoding`, `part-list` names | — | Layout, fonts and instrument data are ignored silently. |

---

## 4. Parts, staves and voices

Every `<part>` becomes one or more staves, in `part-list` order (parts missing from the list
follow in document order). A part with `<staves>2</staves>` — a piano grand staff — becomes two
staves, each with its own clef (`<clef number="2">`); `<staff>` on notes and `<backup>` /
`<forward>` between staves are followed exactly. A staff mentioned only in the attributes is
still created (with empty bars). Staves are padded with empty bars to the same length (warning).

The score model holds **one voice per staff**. When a staff carries several voices (`<voice>`),
the first voice heard on it is imported and the others are dropped with a warning naming the
staff. Time the kept voice skips (a `<forward>`, or bars where only another voice plays) is
filled with rests — including the time after its last note that the bar still spans — so the
bar's timeline stays intact and a bar the file wrote as full never reads as a pickup. Notes that
overlap an earlier note in the same voice are dropped (warning).

Part names are not stored (the model has no per-staff instruments, #25); transposing
instruments keep their written pitches, as on the page.

---

## 5. Attributes

### Key

`<key><fifths>N</fifths><mode>…</mode></key>` maps onto the model's 15 major and 15 minor keys:

| `fifths`, `mode` | `keySignature` | Rule |
| :--- | :--- | :--- |
| `1`, `major` (or none) | `G` | Major keys by fifths; `7` → `C#`, `-7` → `Cb`. |
| `3`, `minor` / `aeolian` | `F#m` | Minor keys by fifths. |
| `0`, `dorian` / `phrygian` / `locrian` | `Am` | Imported as the **relative minor** with the same signature (warning). |
| `1`, `lydian` / `mixolydian` | `G` | Imported as the **major key** with the same signature (warning). |
| `8`, `-8`, … | `Ab`, `E`, … | Beyond seven accidentals: the enharmonic twin. |
| `key-step` / `key-alter` (non-traditional) | `C` | Not supported (warning). |

The score has one key. A later `<key>` (a key change, or a differently-keyed transposing part)
keeps the first key; every note still carries its own `<alter>`, so pitches are right and the
difference shows as accidentals (warning).

### Time

`<beats>` / `<beat-type>` → `timeSignature`: `3/4`, `6/8`, `symbol="common"` and `"cut"` read
their beats, `3+2` / `8` → `5/8`, several pairs are summed (`3/4 + 1/8` → `7/8`). `senza-misura`
and unreadable meters import as 4/4 (warning); a later `<time>` is ignored (warning).

### Clef

| `sign` / `line` | Clef | Note |
| :--- | :--- | :--- |
| `G` 2, `F` 4, `C` 3, `C` 4 | treble, bass, alto, tenor | |
| `G` 1, `F` 3 / 5, `C` 1 / 2 / 5 | treble, bass, alto / tenor | Nearest supported clef (warning). |
| `percussion`, `TAB`, `none`, `jianpu` | treble | Warning. |
| `clef-octave-change` | plain clef | Written pitches are kept (warning), as for ABC's `treble-8`. |

Each staff keeps its first clef; a later clef change is reported.

### Divisions and tempo

`<divisions>` is honoured wherever it changes. The tempo is the first `<sound tempo="…">` or
`<metronome>` in the score, converted to quarter notes per minute (`♩. = 60` → 90, `𝅗𝅥 = 60` →
120; a range such as `120–132` reads its first number), clamped to 30–300 (warning). Later
tempi are ignored (warning); without any, the default is 120.

---

## 6. Notes

| Construct | Becomes |
| :--- | :--- |
| `<pitch>` step / alter / octave | The pitch spelling, e.g. `<step>B</step><alter>-1</alter><octave>3</octave>` → `Bb3`. Microtonal alters are rounded, alters beyond ±2 clamped (warnings). |
| `<type>` + `<dot/>` | The written value (`whole` … `64th`, one dot). Values the model lacks — double dots, `breve`, `128th` and shorter — become tied notes on the 64th grid (a `128th` rounds up, warning). |
| `<duration>` only | Read in divisions and broken into (tied) notes. When a `<type>` and its `<duration>` disagree with no tuplet ratio to explain it, the duration wins (warning) so the bar's timeline holds. |
| `<rest/>` | A rest. A bar holding nothing but `<rest measure="yes"/>` (or a lone whole rest, or a lone rest spanning the bar) becomes the model's **empty bar** — unless a chord symbol anchors in it, when the rest stays explicit to carry it. |
| `<chord/>` | Joins the note to the preceding one; the first note's value is the chord's. |
| `<tie type="start"/>`, `<notations><tied type="start"/>` | `tied: true`, also across the bar line. A tie with no same-pitch note to reach is dropped (warning). |
| `<accidental>` | The **visible glyph**, kept as the note's display policy (#236): a glyph the engraving rules would omit anyway → `accidentalDisplay: 'show'`; `parentheses="yes"` → `'courtesy'`; otherwise the rules decide (`'auto'`). A missing `<accidental>` never hides a glyph the rules require. |
| `<time-modification>` + `<notations><tuplet>` | `tuplet: { ratio: [actual, normal], groupSize, position, baseDuration }`. Groups run from `<tuplet type="start"/>` to `stop` (a notation on any member of a chord counts); in files without bracket notations, consecutive notes with the same ratio are grouped until they span `actual` × `normal-type` (or the first member's value). `baseDuration` is `<normal-type>` when the file names it, else the first member's value. Rests and mixed values are fine. A group whose footprint is not a whole number of beats (a bracket cut off, an incomplete tuplet) imports as plain notes (warning), as in ABC. Nested tuplets keep only the combined ratio, so the inner groups usually lose their brackets the same way (warning). |
| `<backup>` / `<forward>` | Move the cursor; gaps in the kept voice become rests. |
| `<grace/>` notes | Ignored (warning). |
| `<cue/>` notes | Ignored; their time becomes a rest (warning). |
| `<unpitched>` | A rest (warning). |
| `<stem>`, `<beam>`, `<notehead>`, `<staff-details>`, `print-object`, positions | Ignored silently — layout is recomputed. |

**Pickups.** When every staff's first bar is under-full (or empty) and more music follows, it is
imported as a pickup (`isPickup`) on every staff — whether the file marks it `implicit="yes"`
or not, though a first bar that holds nothing but rests is a pickup only when the file does.

**Bar fullness.** Under-full bars are valid (the editor renders the remainder as an implicit
rest). Over-full bars — a meter change the model cannot hold, a tuplet without its ratio — import
as written and are reported (`Bar 3 holds more than a full bar (72/64 quants)`, the first eight
individually and the rest as a count) so they can be fixed in the editor.

---

## 7. Chord symbols

`<harmony>` becomes a `chordTrack` entry anchored at the cursor position it appears at (plus
`<offset>`), canonicalised by the chord parser:

| `<kind>` | Symbol | | `<kind>` | Symbol |
| :--- | :--- | :--- | :--- | :--- |
| `major` | `C` | | `dominant` | `C7` |
| `minor` | `Cm` | | `major-seventh` | `Cmaj7` |
| `diminished` | `Cdim` | | `minor-seventh` | `Cm7` |
| `augmented` | `Caug` | | `diminished-seventh` | `Cdim7` |
| `half-diminished` | `Cm7b5` | | `dominant-ninth` / `-11th` / `-13th` | `C9` / `C11` / `C13` |
| `suspended-second` / `-fourth` | `Csus2` / `Csus4` | | `major-` / `minor-ninth` … | `Cmaj9` / `Cm9` … |
| `major-sixth` / `minor-sixth` | `C6` / `Cm6` | | `power` | `C5` |

`<root-alter>` and `<bass>` give `Bb`, `F#` and `C/E`; `<degree>` adds `add9`, `#5`, `b9` and
so on. `none` (N.C.) has no entry; `other` uses the `text` attribute; Neapolitan, Tristan and
the other special kinds are dropped (warning), as are functional (`<function>` / `<numeral>`)
symbols. The chord parser has a finite vocabulary: a spelling it does not know is simplified
rather than lost — first without its added tones, then without its bass, then to the nearest
kind it holds (`major-ninth` / `-11th` / `-13th` become `maj7`, since the parser reads `maj9`
as a dominant ninth) — with a warning naming both spellings. Symbols anchor on the note of the
top staff they precede (or `<offset>` points at); one that lands between notes moves back to
the note sounding there (warning), and the first symbol wins when two land on the same beat.

---

## 8. What is imported with a warning

Everything below is skipped **without losing the surrounding notes**, and reported once per
category with the bar it first occurred in and an occurrence count:

| Construct | Behaviour |
| :--- | :--- |
| Repeats (`<repeat>`), endings (`<ending>`), segno / coda / D.C. / D.S. (`<sound dacapo …>`) | The music is imported once, in order (the model has no repeats yet, #28). |
| Extra voices on a staff | Only the first voice is kept. |
| Key, meter, clef and tempo changes after the first | The first one stays (see [§5](#5-attributes)). |
| Slurs `<slur>` | Ignored. |
| Articulations, ornaments, technical marks, fermatas, arpeggios, glissandi | Ignored. |
| Dynamics `<dynamics>`, hairpins `<wedge>` | Ignored. |
| Text directions `<words>`, rehearsal marks | Ignored — except the label beside a tempo mark ("Allegro ♩ = 120"), which is not reported. |
| Octave shifts `<octave-shift>`, transposing clefs | Ignored; written pitches are kept. |
| Pedal marks, brackets and other directions | Ignored. |
| Lyrics `<lyric>` | Ignored (lyrics are roadmap #30). |
| Figured bass `<figured-bass>` | Ignored. |
| Grace notes, cue notes, unpitched notes | See [§6](#6-notes). |
| Non-traditional keys, senza misura | C major / 4/4. |
| A note's `'hide'` accidental policy (in the editor's own export) | Comes back as `'auto'` — MusicXML has no way to say "sound the alteration but draw nothing". |

---

## 9. API and feedback

```ts
import { importScoreText, importScoreData, parseMusicXML } from 'riffscore';

const result = importScoreText(xmlText); // format auto-detected
const fromFile = importScoreData(await file.arrayBuffer()); // .mxl or any score file as bytes
// { ok: true, format: 'musicxml', score, warnings: string[] }
// { ok: false, format: 'musicxml', error: string, warnings: string[] }

api.import('musicxml', xmlText); // or the file's ArrayBuffer / Uint8Array
```

`api.import` replaces the score (one undo step) and reports through the operation result:
`info` when nothing was lost, `warning` with code `IMPORT_WARNINGS` and `details.warnings` when
something was, and `error` with `IMPORT_FAILED` — leaving the score untouched — when the input
is not a MusicXML score at all. `details` also carries the format, title, staff and bar counts.

Warnings are human-readable sentences, deduplicated by category:

```
Slurs are not supported and were ignored (12 occurrences, first at bar 3)
Part "Piano", staff 2 has more than one voice; only voice 5 was imported (the editor holds one voice per staff)
Bar 17 holds more than a full bar (80/64 quants)
```

---

## 10. How it is tested

- **Exporter round trip** (`musicXmlRoundTrip.test.ts`): for every bundled melody and a set of
  synthetic fixtures (accidentals, double accidentals, courtesies, dotted values, ties, tuplets,
  chord symbols, pickups, grand staff, 6/8, alto/tenor clefs, metadata), exporting the imported
  score reproduces the original MusicXML byte for byte, and a structural projection matches.
- **Semantics** (`musicXmlImporter.test.ts`): first-principles cases for each construct above,
  a MuseScore-style export with its layout noise, timewise documents, and fast-check fuzzing to
  show the parser never throws.
- **XML reader** (`xml.test.ts`): every construct a MusicXML file can contain, error lines,
  agreement with fast-xml-parser, and a serialize → parse property test.
- **Compressed files** (`mxl.test.ts`): the DEFLATE decoder against Node's zlib at every level,
  ZIP central-directory and `container.xml` handling, and text decoding.
