[← Back to README](../README.md)

# ABC Notation Import

> What the ABC importer understands, how it maps onto the score model, and what it warns about.

> **See also**: [API Reference](./API.md) • [Configuration](./CONFIGURATION.md) • [Data Model](./DATA_MODEL.md)

RiffScore reads tunes written in [ABC notation](https://abcnotation.com/wiki/abc:standard:v2.1) —
the text format used by The Session, abcnotation.com and most folk and traditional archives — and
its own ABC and JSON exports round-trip back in. The importer is a dependency-free parser of the
ABC 2.1 subset below (`src/importers/abcImporter.ts`); nothing is bundled from abcjs.

---

## 1. Three ways in

| Entry point | Use it for |
| :--- | :--- |
| **File menu → Import → ABC Notation or JSON…** | Paste ABC (or the editor's JSON) or open a `.abc` / `.json` file. The dialog previews the title, staves and bar count and lists every warning before you commit. Importing replaces the score as **one undo step**. |
| **`api.import('abc', text)`** / **`api.import('json', text)`** | Programmatic import with structured feedback (see [§5](#5-api-and-feedback)). |
| **`<RiffScore config={{ score: { abc } }} />`** | Seed a component from an ABC string. The tune's own title, key, meter and tempo are used; on failure the generator options apply and a warning is logged. |

A whole file with several tunes (`X:1`, `X:2`, …) imports the **first** tune. A bare fragment with
no header at all (`C D E F | G A B c |`) works too, with the defaults `M:4/4`, `L:1/8`, `K:C`.

---

## 2. Header fields

| Field | Becomes | Notes |
| :--- | :--- | :--- |
| `X:` | — | Ignored (reference number). |
| `T:` | `title` / `metadata.title` | First `T:` only. Missing → "Untitled". |
| `C:` | `metadata.composer` | |
| `Z:Lyricist: name` | `metadata.lyricist` | The form the exporter writes. Other `Z:` lines (transcriber) are ignored. |
| `N:` | `metadata.copyright` | Only when the line reads as a copyright notice (contains ©, `(c)`, "copyright" or "all rights reserved"); other notes are ignored. |
| `M:` | `timeSignature` | `4/4`, `6/8`, `C` (= 4/4), `C|` (= 2/2), `(2+3)/8` (= 5/8). Missing → 4/4. `M:none` and other unsupported meters warn and fall back to 4/4. |
| `L:` | unit note length | Missing → `1/8`, or `1/16` when the meter is shorter than 3/4 (ABC 2.1 rule). |
| `Q:` | `bpm` (quarter notes per minute) | `1/4=120`, `3/8=100` (→ 150), `1/2=60` (→ 120), compound beats `1/4 3/8=40` (summed), an `"Allegro"` label is skipped and a label alone leaves the default 120. A bare `Q:120` counts beats of the meter's beat unit (the dotted quarter in compound x/8 meters). Clamped to 30–300 with a warning. |
| `K:` | `keySignature` (+ clef / octave) | See [§3](#3-keys-and-modes). |
| `V:` | one staff per voice | `V:id clef=bass octave=-1`; `name=`, `sname=`, `middle=`, `transpose=`, `stem=` are ignored. Voices appear in declaration order; a declared voice that never plays is dropped. |
| `w:` `W:` `P:` | — | Lyrics and part markers are not supported (warning). |
| `%%…` directives, `R:` `S:` `O:` `H:` `B:` `D:` `I:` … | — | Ignored silently. |

Comments (`%` to end of line, except inside `"…"`), `\` line continuations, CRLF line endings and
free text before the `X:` line are all handled.

---

## 3. Keys and modes

The score model has 15 major and 15 minor key signatures. `K:` values map onto them like this:

| `K:` | `keySignature` | Rule |
| :--- | :--- | :--- |
| `G`, `Gmaj`, `G major` | `G` | Major keys keep their spelling (`F#` stays `F#`, `Gb` stays `Gb`). |
| `Gm`, `Gmin`, `G minor` | `Gm` | Minor keys likewise (`Ebm`, `D#m`, `A#m` are all canonical). |
| `Dbm`, `G#` | `C#m`, `Ab` | Theoretical keys (more than 7 accidentals) become their enharmonic twin. |
| `Ador`, `A dorian` | `Em` | Dorian, Phrygian, Aeolian and Locrian import as the **relative minor** with the same signature (warning). |
| `Dmix`, `Elyd` | `G`, `B` | Mixolydian and Lydian import as the **major key** with the same signature (warning). |
| `none`, empty | `C` | No key signature. |
| `HP` / `Hp` | `D` | Highland pipes (warning). |
| `K:G clef=bass`, `K:C bass`, `K:clef=F4`, `K:bass` | clef | `treble`/`G2`, `bass`/`F4`, `alto`/`C3`, `tenor`/`C4`, with or without a key in front. `treble-8`, `bass+8` etc. import as the plain clef (warning); `perc`/`none` become treble (warning). |
| `K:G octave=-1` | pitch shift | Every note of the voice moves by that many octaves. |
| `K:D exp ^f ^c` | — | Explicit signature accidentals are ignored (warning). |

Modes never change a single sounding pitch: the pitch-class set of A Dorian **is** E minor's, so
every accidental decision is identical. Only the name shown in the key menu differs.

---

## 4. Tune body

| Construct | Example | Becomes |
| :--- | :--- | :--- |
| Notes | `C D E F G A B c` | Pitches; `C` is middle C (C4), `c` is C5, `,` and `'` shift octaves. |
| Accidentals | `^F _B =F ^^F __B` | Sharp, flat, natural, double sharp, double flat — applied to the same letter **and octave** until the bar line, exactly as in ABC. A written accidental that only restates what is already in force (`^F` in G major) is kept visible (`accidentalDisplay: 'show'`). |
| Lengths | `A A2 A3/2 A/ A// A/4` | Multiples of `L:`. A length that is not a single (dotted) note value becomes tied notes (`A5` with `L:1/8` → half tied to eighth); a length off the 64th-note grid (`A1/3`) is rounded with a warning. |
| Broken rhythm | `A>B A<B A>>B` | Dotted / halved pairs, including double dots. |
| Rests | `z z2 x2` | Rests (`x` is treated as a normal rest). A bar holding nothing but a whole-note rest (`z4` with `L:1/4`, `z8` with `L:1/8`) is the engraver's "rest for the bar" in **any** meter and becomes an empty bar; a rest with a chord symbol on it stays explicit. (abcjs goes further and reads every whole-note rest as a bar, even next to other notes; RiffScore keeps those literal and reports the over-full bar.) |
| Multi-bar rests | `Z2` | That many empty bars. |
| Chords | `[CEG]2 [C2E2G2]` | One event with several notes; the length is the first note's times the outer length. |
| Ties | `A2-A2`, `[CEG]2-[CEG]2`, `[C-EG]` | Ties to the next same-pitch note, also across a bar line. A tie carries its accidental over the bar line to the tied note only (`^F4- \| F2 F2` sounds F♯, F♯, F♮), as in engraved music. A tie with no matching note is dropped (warning). |
| Tuplets | `(3ABc (5:4:5ABcde (3:2:2A2B` | `tuplet: { ratio: [p, q], groupSize: r }`. Omitted `q` follows ABC 2.1 (`(2`→3, `(3`→2, `(4`→3, `(6`→2, `(8`→3; `(5` `(7` `(9` → 3 in 6/8, 9/8 and 12/8, else 2); omitted `r` = `p`. abcjs reads a bare `(5`/`(7`/`(9` as "in the time of 2" in every meter, so write `(5:3:5` or `(5:2:5` in compound meters to be unambiguous everywhere. A chord counts as one member and rests may be members. A tuplet cut off by a bar line imports as plain notes (warning; abcjs lets it run on across the bar); nested tuplets are ignored (warning). |
| Bar lines | `\| \|\| \|] [\| \|: :\| :: \|1 [2` | Every form is a bar boundary. Consecutive bar lines (`:\|` then `\|:` on the next line) never create an empty bar. |
| Chord symbols | `"G"A2 "D7"B2 "Em"z2` | `chordTrack` entries anchored on the next note, rest or chord (also inside tuplets, on the fractional quant). Symbols are canonicalised by the chord parser; an unrecognised one is dropped (warning). The first symbol wins when two land on the same beat. |
| Inline fields | `[L:1/16] [K:D] [M:1/4] [V:2] [Q:…]` | `L:` and `V:` apply immediately. See below for `K:`, `M:`, `Q:`. |
| Voices | `V:1 … V:2 …` | Each voice is a staff; interleaved `V:` blocks continue the same voice. Staves are padded with empty bars to the same length (warning). |

**Pickups.** An under-full first bar followed by more music is imported as a pickup (`isPickup`),
whether it is written plainly (`D | G2 …`) or with the exporter's `[M:1/4] … [M:4/4]` pair.

**Bar fullness.** Under-full bars are valid (the editor renders the remainder as an implicit rest).
Over-full bars import as written and are reported (`Bar 3 holds more than a full bar (72/64 quants)`,
the first eight individually and the rest as a count) so they can be fixed in the editor.

**Mid-tune changes.** The score has one key, meter and tempo. A `K:` inside the tune keeps the
score key but resolves later accidentals in the new key, so every sounding pitch is right and
the difference shows as accidentals (warning). `M:` and `Q:` changes inside the tune are ignored
(warning), except an inline meter before the first bar line, which is read as a pickup meter.

---

## 5. What is imported with a warning

Everything below is skipped **without losing the surrounding notes**, and reported once per
category with the first line number and an occurrence count:

| Construct | Behaviour |
| :--- | :--- |
| Repeats `\|: :\| ::` and endings `\|1 \|2 [1` | The music is imported once, in sequence (repeats are not expanded — the model has no repeats yet, #28). |
| Slurs `( )` | Ignored. |
| Grace notes `{…}` | Ignored. |
| Decorations `!trill! +fermata+ . ~ H L M O P S T u v` | Ignored. |
| Text annotations `"^text" "_text" "<" ">" "@"` | Ignored. |
| Lyrics `w:` `W:`, parts `P:` | Ignored. |
| Voice overlays `&` | The overlaid notes (up to the next bar line) are ignored. |
| Octave-transposing clefs `treble-8` | Imported as the plain clef; written pitches are kept. |
| Unknown characters | Ignored, one warning per character. |

The parser never throws. It fails outright — leaving the current score untouched — only when the
input contains no music at all (`No music found in the ABC input`).

---

## 6. API and feedback

```typescript
api.import('abc', abcText);   // replaces the score, undoable
api.import('json', jsonText); // the JSON that export('json') writes
```

| Outcome | `Result` |
| :--- | :--- |
| Clean import | `{ ok: true, status: 'info', method: 'import', details: { format, title, staves, measures, warnings: [] } }` |
| Import with caveats | `{ ok: true, status: 'warning', code: 'IMPORT_WARNINGS', details: { …, warnings: string[] } }` |
| Nothing importable | `{ ok: false, status: 'error', code: 'IMPORT_FAILED', message: 'Import failed: …' }` — the score is untouched |
| Unknown format | `{ ok: false, code: 'IMPORT_NOT_IMPLEMENTED' }` |

Both parsers are also exported from the package for use without a mounted editor (validation,
server-side conversion): `importScoreText(text, format?)` is the shared entry point (format
auto-detected: an object literal is JSON, anything else ABC) and `parseABC(text)` the raw parser,
returning `{ ok, score, warnings }` / `{ ok: false, error, warnings }`.

```typescript
import { parseABC } from 'riffscore';
const result = parseABC(text);
if (result.ok) api.loadScore(result.score);
```

---

## 7. Round trip with the exporter

Everything `export('abc')` writes imports back to an equivalent score: exporting the imported score
reproduces the original ABC byte for byte. This is pinned by tests over every bundled melody and a
set of synthetic scores (accidentals in every key, ties, tuplets, chord symbols on fractional
anchors, pickups, grand staves, every clef), and the importer is cross-checked against **abcjs** as
an independent reference for the sounding pitches and onsets of hand-written tunes.

Two things are intentionally lossy: a written whole-note rest that fills a bar by itself comes back
as an empty bar (both export as `z4`, both engrave as a whole-bar rest), and a `hide` accidental
policy has no ABC form (the pitch is exported, the policy is not).

---

## 8. Not yet

- MusicXML import (#11).
- Repeat expansion, endings, D.C./D.S. (#28), lyrics (#30), slurs (#19), dynamics (#20) — the
  score model does not represent them yet, so the importer cannot either.
- Several tunes from one file (only the first is imported).
