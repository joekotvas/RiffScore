# RiffScore Correctness Audit & Phased Remediation Plan

> **Generated:** 2026-06-03 · **Method:** 16-dimension multi-agent audit with per-finding adversarial verification (131 agents).  
> **Result:** 112 raw findings → **109 confirmed/partial**, 3 refuted, 0 uncertain.  
> Severity: **12 critical · 63 major · 33 minor · 1 info**, in **14 root-cause clusters** (5 critical).  
> Companion: [VERIFICATION_STRATEGY_2026-06.md](./VERIFICATION_STRATEGY_2026-06.md).

> ⚠️ **Read alongside [AUDIT_QA_2026-06.md](./AUDIT_QA_2026-06.md).** An independent QA re-verified these findings: ~70% validated, ~20% need nuance, ~6% overstated, **1 wrong** (`midi-enharmonic-sharp-only` — the example is backwards; `Note.fromMidi(61)='Db4'`). The "109" total is inflated by **~7 duplicate findings** that should be merged. Before executing, apply the QA's four overrides: (1) `note.accidental` should be **repurposed** as a display-policy override, not deleted; (2) the Phase 1C quant multiplier must be **≥210** (×105 is non-integer for dotted-64ths) and requires a `schemaVersion` pulled forward; (3) **interactive/API correctness should precede deep export fidelity** (no import path exists); (4) several severities re-graded. See the QA's "Corrections To Make" list.

---

## 1. Honest Reliability Assessment

RiffScore presents as a polished, well-architected, heavily-tested library, but the audit shows the surface polish is masking pervasive correctness failures at exactly the layers that matter for a music notation editor: pitch/accidental semantics, key signatures, rhythm/tuplet exactness, clef geometry, and the two export formats (MusicXML, ABC). The failures are overwhelmingly SILENT (only ~12 of ~75 findings are documented at all, and several of those docs actively misrepresent the implementation). The defects are not edge cases — most are "wrong in every situation because the model is wrong": every minor-key score, every accidental-bearing MusicXML export, every tuplet export, every alto/tenor-clef score, every 6/8 score, and every slash chord are affected. Critically, the same handful of root-cause mistakes recur across many independent dimensions: (1) accidental alteration is stored in TWO places (the SPN pitch string AND a redundant note.accidental field) with no single source of truth, so render, audio, layout, and export disagree; (2) one theory function path resolves minor keys correctly (the chord module) while the core MusicService path silently treats every minor key as an empty scale; (3) rhythm is modeled with lossy IEEE-754 floats for tuplets that get floored/truncated/used as map keys; (4) per-clef and per-meter geometry/beat-structure is hand-coded against a "4/4, treble" assumption instead of derived from the existing single-source models; (5) structural/cross-cutting invariants (measure capacity, tie validity, selection-after-staff-removal, chordTrack re-anchoring, load-time migration/validation) are enforced only in UI hooks, never at the command/model/API boundary, so the public API and any non-UI path silently corrupt state. The test suite is extensive but tests the happy path: there is no MusicXML round-trip, no <alter>/tuplet/tie/dot/pickup assertion, no minor-key accidental test, no altered-note transpose/undo test, no tuplet beaming/selection test — so all of the above pass CI. Bottom line: the editor is reliable ONLY for a narrow slice (single-staff treble/bass, major keys, no tuplets, no chromatic editing, scroll view, no export round-trip). Outside that slice it silently produces musically wrong output. This is alpha-quality reliability dressed as production-quality, and the most dangerous part is that the wrongness is invisible to the user until they open the file in real notation software or play it back.

---

## 2. Top Risks ("wrong in every instance because the model is wrong")

1. MusicXML export silently corrupts pitch and rhythm: <alter> is NEVER emitted (every sharp/flat exports a semitone wrong — F#4 becomes F natural), and tuplet durations are Math.floor'd against a hardcoded divisions=16 so triplets sum to 15/16 of a beat and 64th-triplets export <duration>0</duration> (illegal). Any non-C-major or tuplet-containing score exports broken to MuseScore/Finale/Sibelius, with zero test coverage to catch it.
2. All 15 minor key signatures are broken in the core theory path: Key.majorKey('Em').scale returns [], so every diatonic accidental is redundantly redrawn (E-minor melody covered in spurious F# signs) AND note entry/dragging ignores the signature entirely (clicking the F line gives F-natural, not F#). The staff visibly contradicts its own printed key signature in every minor-key score — and the correct fix already exists unused in the chord module (getScaleForKey).
3. Accidental alteration has no single source of truth (stored in both the pitch string and note.accidental). The public setAccidental('sharp') is a complete no-op (no visual, no audible change); diatonic transpose discards chromatic alterations and is not lossless under undo (F#->up->undo yields F-natural, silent data loss via the most common safety operation); transpose leaves stale accidental fields that corrupt export while looking correct on screen.
4. Alto and tenor clefs render every common pitch at TREBLE positions (a leftover lookup table shadows the correct clef-reference logic): alto C4 draws a third too low on a ledger line while the C-clef glyph sits on the correct line — the staff contradicts itself, and clicking the middle line inserts the wrong pitch. Every viola/cello/trombone part in alto/tenor is unusable. Key-signature accidentals in alto/tenor are also scrambled onto wrong lines.
5. Cross-cutting invariants are unenforced outside the UI: the public loadScore() skips migration/validation (legacy chordTracks mis-render, malformed scores crash instead of failing soft), the API can stuff 5 quarters into a 4/4 bar, removing a staff orphans the selection (the documented repair useEffect does not exist) leading to phantom-staff edits, and structural edits (insert/delete measure, time-sig change, reset) never re-anchor chordTrack so harmony silently drifts to the wrong bar or disappears.
6. Tuplets are modeled with lossy floats (triplet eighth = 5.333…) that are floored in export, truncated in getBreakdownOfQuants (silently dropping quants from gap-fill/capacity/overwrite math), and used as exact-equality map keys — a latent timing/positioning time-bomb that is already a hard bug in migrateChordTrack and MusicXML export.
7. ABC export is broken for the common cases: a natural note under a sharp/flat key signature is exported as a bare letter (F4 under K:G renders/plays as F#), there is no intra-measure accidental cancellation, the tie hyphen is placed before the duration (malformed), and quintuplets export with the wrong ratio (5-in-2 instead of 5-in-4).
8. Compound meter (6/8, 9/8, 12/8) is offered and documented as supported but beams in groups of 2 instead of 3 (hardcoded quarter-note beat) and plays at the wrong tempo (bpm always treated as quarter-note), misrepresenting the meter in every compound-meter score.
9. Chord-symbol normalization silently drops or flips extensions/alterations (Cmaj9->C9 changing quality, C7b9->C7, C7sus4->Csus4) and slash-chord voicing ignores the bass entirely, so the stored/played/exported chord is harmonically wrong with no warning.
10. Ties spanning a system/page break render as a hanging stub into blank space with nothing on the continuation note (the split-tie infrastructure in Tie.tsx is dead code), and ties accept no same-pitch-target validation (C4 tied to D4 is persisted), corrupting render and export.

---

## 3. Root-Cause Clusters

Fixing the *cause* collapses many findings at once.

| # | Sev | Cluster | Findings | Silent? |
|---|---|---|---|---|
| 1 | 🔴 critical | Cross-cutting structural invariants enforced only in UI hooks, never at the command/model/API boundary | 16 | mostly-silent |
| 2 | 🔴 critical | Dual source of truth for accidental alteration (pitch string vs. note.accidental field) | 12 | mostly-silent |
| 3 | 🔴 critical | Lossy float representation of tuplet rhythm (non-integer quants floored, truncated, and used as exact-equality keys) | 12 | mixed |
| 4 | 🔴 critical | Per-clef and per-meter geometry/structure hard-coded to a 'treble, 4/4' assumption instead of derived from existing single-source models | 10 | mixed |
| 5 | 🔴 critical | Minor keys silently unresolved in the core theory path (Key.majorKey on a minor key string) | 4 | mixed |
| 6 | 🟠 major | Ties/slurs: forward-only same-pitch model with no cross-event awareness, plus dead split-tie infrastructure | 8 | mixed |
| 7 | 🟠 major | Chord-symbol engine: quality/extension inferred by lossy substring heuristics instead of structured (tonal) data | 8 | mixed |
| 8 | 🟠 major | Page-view / pagination coordinate, lifecycle, and print fidelity defects (freshly built, high-risk) | 7 | mixed |
| 9 | 🟠 major | Beaming/stem engraving simplifications that misrepresent rhythm | 4 | mixed |
| 10 | 🟠 major | Chord vertical layout (accidentals & augmentation dots) has no column/collision model | 3 | mostly-silent |
| 11 | 🟠 major | Chromatic/diatonic transpose unit and spelling errors | 3 | mixed |
| 12 | 🟠 major | Documentation diverges from the implemented model | 3 | mostly-documented |
| 13 | 🟡 minor | Mid-score notation state changes (key, clef) not modeled; double dots & slurs unrepresentable | 3 | mostly-silent |
| 14 | 🟡 minor | Playback completion and chord-track parity edge defects | 2 | mostly-silent |

### Cluster root causes

**1. [CRITICAL] Cross-cutting structural invariants enforced only in UI hooks, never at the command/model/API boundary**  
Invariants that must hold for any valid score (measures sum to time-signature capacity, ties point at a same-pitch successor, selection references only existing nodes, chordTrack anchors stay valid across structural edits, loaded scores are migrated/validated, both play() paths sound identically) are implemented as ad-hoc checks inside React UI hooks rather than as a property of the commands, the model, or the public API ingestion boundary. Consequently the public/imperative API and every non-UI code path silently violate them: loadScore stores raw unmigrated/unvalidated objects, the API overfills bars, deletes leave gaps, duration growth silently no-ops, ties to wrong pitches persist, removing a staff orphans the selection (the documented repair effect does not even exist), and structural edits never re-anchor chordTrack. The first-principles fix is to centralize each invariant once at the command/model/ingestion layer so it is impossible to bypass, and make migration+validation a property of load rather than of mount.

*The data model permits invalid states because validation/repair lives in the UI, not the model. Through the documented API a consumer can overfill bars, load corrupt/legacy scores (mis-rendered or crashing), tie to the wrong pitch, lose the other staff's selection after a layout change, and watch chords drift to the wrong bar after edits — all silently. Centralizing each invariant at the command/API/ingestion boundary closes the entire class.*

**2. [CRITICAL] Dual source of truth for accidental alteration (pitch string vs. note.accidental field)**  
Pitch alteration is stored redundantly in BOTH the absolute SPN pitch string ('F#4') AND an optional note.accidental display field, with no single authority. Render and audio read the pitch string; the public API, the ABC exporter, and the layout spacing pass trust note.accidental first; the MusicXML exporter emits a visual <accidental> from the field but never derives the pitch-defining <alter> from the string at all; and the accidental-resolution helpers collapse the full chromatic alteration (alt) to a tri-state sharp/flat/natural, losing double accidentals. A single first-principles fix — make the absolute pitch string the one source of truth, derive the displayed accidental (including doubleSharp/doubleFlat) from pitch+context, and either remove note.accidental or keep it strictly derived — simultaneously fixes the no-op setAccidental API, the missing <alter> MusicXML corruption, the stale-override export drift, the double-accidental mis-rendering, the wrong glyph font, and the spacing/glyph disagreement.

*Every accidental-related defect traces to the model carrying alteration in two places that disagree. The most severe consequence is that MusicXML never emits <alter>, so every sharp/flat exports a semitone wrong; the public setAccidental is a silent no-op; transpose leaves stale fields that corrupt export while looking right on screen; and double accidentals render/export as single. Fixing the source-of-truth fixes the whole cluster.*

**3. [CRITICAL] Lossy float representation of tuplet rhythm (non-integer quants floored, truncated, and used as exact-equality keys)**  
The quant grid (sixtyfourth=1) is not divisible by tuplet ratios (3,5,7), so getNoteDuration returns raw IEEE-754 floats for tuplets (triplet eighth = 8*2/3 = 5.333…). These floats are then (a) floored per-note against a hardcoded MusicXML divisions=16, so groups under-fill the beat and 64th-triplets export duration 0; (b) fed into getBreakdownOfQuants which silently truncates the fractional remainder in gap-fill, capacity, overwrite, and reflow math; (c) used as exact-equality Map/object keys and === comparisons for layout sync, cursor mapping, and selection. makeTuplet compounds this by stamping a ratio onto mixed-duration events without establishing the tuplet's actual span. The first-principles fix is an exact integer/rational representation (finer tick grid = LCM of supported denominators, or rationals), a content-derived MusicXML divisions, atomic tuplet handling in reflow/beaming/sync, and validation that a tuplet occupies exactly inSpaceOf*base quants.

*Tuplets are modeled as lossy floats. The worst consequence is MusicXML export: tuplet measures don't sum to the beat (triplets give 15/16, 64th-triplets give illegal duration 0), corrupting timing in every importer. Internally the same floats truncate capacity/gap math, fragilely key layout maps, get dropped on time-sig reflow, and let incoherent mixed-duration tuplets be created. Switching to exact integer/rational quants and a content-derived divisions fixes the cluster.*

**4. [CRITICAL] Per-clef and per-meter geometry/structure hard-coded to a 'treble, 4/4' assumption instead of derived from existing single-source models**  
Clef pitch geometry, key-signature accidental positions, beam-group boundaries, rest decomposition, and tempo all hard-code assumptions instead of deriving from the meter or the authoritative clef-reference model (clef.ts CLEF_REFERENCES) that already exists. Specifically: getOffsetForPitch consults a treble lookup table FIRST for all non-bass clefs (so alto/tenor notes use treble positions, shadowing the correct CLEF_REFERENCE math), the CLEF_REFERENCE.tenor offset is itself wrong, the clef glyph Y uses ad-hoc multiples, the alto/tenor key-signature offset tables were hand-authored and scrambled, beaming derives the beat as a constant quantsPerMeasure/4 ('Assuming 4/4') and is never passed the time signature, rest breakdown ignores the beat grid, and bpm is always quarter-note-per-minute. The fix is to delete the hand-maintained tables and derive everything (pitch offsets, key-sig positions, beat boundaries, beat unit) from the single clef-reference and time-signature models.

*Anything whose layout depends on the clef or the meter is wrong because it is hard-coded rather than derived. Alto/tenor render every note at treble positions and contradict their own clef glyph (unusable for viola/cello/trombone); alto/tenor key signatures scatter onto wrong lines; 6/8 beams as 2+2+2 instead of 3+3 and plays 1.5x slow; rests cross beat boundaries. One algorithmic source per concept (clef reference, meter beat structure) fixes the whole cluster.*

**5. [CRITICAL] Minor keys silently unresolved in the core theory path (Key.majorKey on a minor key string)**  
The core theory functions (MusicService.needsAccidental, applyKeySignature, getScaleNotes/getScaleDegree, movePitchVisual, accidentalContext.getKeyAccidental) assume score.keySignature is always a major-key root and pass it directly to Tonal's Key.majorKey(root).scale. Minor keys are stored verbatim as 'Em'/'Am', which Key.majorKey treats as invalid, returning alteration 0 and an EMPTY scale. With an empty scale every diatonicity test fails, so the signature is ignored for both rendering (redundant accidentals on every diatonic note) and interaction (note entry/drag snaps to naturals). The sibling chord module already solved this exact problem with parseKeySignature/getScaleForKey (Key.minorKey(root).natural.scale), proving it is an oversight. The fix is one shared mode-aware key resolver routed through every key-theory consumer; the same boundary should thread key context into MIDI enharmonic spelling and per-staff/per-part export.

*All 15 minor keys are musically wrong end to end: the staff prints redundant accidentals AND ignores the signature on entry, directly contradicting the printed key signature. A single mode-aware scale resolver (which already exists in the chord module) routed through MusicService/accidentalContext fixes the entire dimension. Related: MIDI entry and key/divisions export also fail to consult the resolved key/mode.*

**6. [MAJOR] Ties/slurs: forward-only same-pitch model with no cross-event awareness, plus dead split-tie infrastructure**  
A tie is modeled as a bare forward-only boolean (tied: 'tied to next note') with no target pitch/position and no representation of an incoming/continuation tie, and the accidental engine likewise operates per-measure with no tie awareness. As a result: continuation noteheads are re-accidentalized at a barline; the MusicXML exporter resolves ties through a pitch-keyed Set with no adjacency check (spurious stops on distant same-pitch notes); the renderer can only resolve a tie within one system's measure slice, so ties across system/page breaks fall into a hanging-stub branch and the prebuilt split-arc props in Tie.tsx are dead code; the ABC exporter places the hyphen before the duration; and tie direction is taken from one note's offset ignoring stem/chord. (A related per-measure-scoping defect also produces cross-octave cautionary accidentals.) The fix is to model the tie as a first-class span (source+continuation, same-pitch validated) resolved at score level and consumed uniformly by render, accidentals, audio, and both exporters; slurs should be modeled separately or explicitly documented as unsupported.

*Ties are a forward-only boolean with no continuation concept, so they re-accidentalize over barlines, hang as stubs across system/page breaks (with the split-arc renderer left as dead code), export with wrong adjacency/placement, and accept invalid different-pitch targets. Modeling a tie as a validated same-pitch span resolved globally fixes render, accidentals, and both exporters at once.*

**7. [MAJOR] Chord-symbol engine: quality/extension inferred by lossy substring heuristics instead of structured (tonal) data**  
The chord subsystem reconstructs canonical symbols, infers quality, and converts notations using hand-rolled substring matching (includes('m'), includes('dim'), a fixed ladder of extension checks, leading-only quality tokens) rather than deriving from Tonal's structured chord/key data. This loses or flips information at every stage: normalization drops maj9->dominant9, alterations, and sus+7 combinations; isMinorChord matches the 'm' inside 'dim'/'m7b5'; Roman/solfege conversion has no half-diminished path and round-trips to unparseable 'Bmo'; minor-key diatonic quality is ignored (ii in Am resolves to Bm not Bdim); CmM7 is mangled to unparseable 'Cmmaj7'; secondary dominants (V/V) are rejected as invalid bass; voicing assigns octaves by chord-tone index and discards the slash bass so inversions never sound inverted. The fix is to model chord quality+extension+alteration as structured components from Tonal, carry an explicit quality enum, voice from absolute MIDI honoring the bass, and add a round-trip parse guard.

*Chord parsing/normalization/conversion/voicing all guess at chord structure via string matching instead of using Tonal's parsed result, so harmonically wrong chords are stored, displayed, played, and exported with no warning (Cmaj9 becomes a dominant, slash chords play root position, half-diminished shows as minor, minor-key ii is wrong, min-maj7 and secondary dominants won't parse). Deriving everything from structured chord/key data fixes the cluster.*

**8. [MAJOR] Page-view / pagination coordinate, lifecycle, and print fidelity defects (freshly built, high-risk)**  
The new page-view layer reuses or duplicates geometry/state that was designed for scroll view without remapping it into page/system coordinate space, and it omits engraving/lifecycle rules that the page model implies. Specifically: the justification stretchFactor is applied without a >=1.0 floor so over-wide measures are compressed (violating 'never scale a measure below natural width'); the playback cursor uses scroll-view absolute X inside page SVGs; page-layout lookups only search page 0; print inherits the editor's CSS viewport zoom transform; an empty score yields zero pages (blank void); the metadata header is fixed-px while staves scale; and barlines are drawn per-staff so grand-staff barlines are not connected. Each is the same class of error: page geometry/state must be derived from the page/system model (physical dimensions, per-system stretch, system-level barlines, minimum-one-page), not borrowed from scroll-view assumptions.

*Page view is the newest and riskiest surface and shows it: over-wide measures get squashed and collide, the playback cursor lands off-page, multi-page measure lookups fail, printing bakes in the on-screen zoom (WYSIWYG broken unless at 100%), an empty document renders a blank void, the header doesn't scale with the music, and grand-staff barlines aren't connected. All stem from page geometry being derived from scroll-view assumptions rather than the page/system model.*

**9. [MAJOR] Beaming/stem engraving simplifications that misrepresent rhythm**  
The beaming engine takes deliberate shortcuts that diverge from standard engraving (Gould): it breaks the beam group on any duration change and has no partial-beam/beamlet model (BeamGroup carries a single scalar type), so dotted-eighth+sixteenth and 8th+two-16ths don't beam; group stem direction uses mean-Y instead of the furthest-from-middle-line note (and contradicts its own doc which claims 'majority'); the slope clamp is a dimensionless 1:1 pixel ratio (~45 degrees) instead of a staff-space rise limit with quantization; and any rest unconditionally breaks the beam. These are independent simplifications but share a root: the beam model lacks per-note beam-level information and the engraving rules (beam by beat unit, beamlets, extreme-note direction, staff-space slope, beamed-over rests) are not modeled.

*Common rhythms are beamed incorrectly: dotted-8th+16th and 8th+two-16ths show as separate flagged notes (no beamlets), groups can point stems the wrong way (mean-Y not extreme-note), beam slopes can reach ~45 degrees, and any rest breaks a beam. Most are partly documented as simplifications, but mixed-duration beaming and the stem-direction rule are real, undocumented or doc-contradicting engraving errors.*

**10. [MAJOR] Chord vertical layout (accidentals & augmentation dots) has no column/collision model**  
Chords are rendered as independent per-note glyphs at fixed horizontal offsets with no chord-level layout pass: every accidental is drawn at noteX + a fixed -16px (and even moves with a displaced second), and augmentation dots get a single shared shift added to per-note x rather than a shared column anchored to the rightmost notehead. There is no collision/packing logic anywhere. The fix is a real chord-layout pass (a la Gould) that assigns accidentals to non-overlapping left columns based on vertical proximity and aligns all augmentation dots in one right column with per-dot Y de-collision, feeding the reserved width back into horizontal spacing.

*Chords with multiple close accidentals (e.g. Eb-Gb-Bb, C#-E#-G#) draw all accidental glyphs at the same X so they overlap and become unreadable, and augmentation dots form a ragged column instead of aligning. There is no chord-level accidental/dot column algorithm at all; adding one (with collision packing) is the principled fix.*

**11. [MAJOR] Chromatic/diatonic transpose unit and spelling errors**  
Transposition models movement by interval-name or letter geometry rather than by sounding pitch with a deliberate spelling choice. Chromatic transpose uses Interval.fromSemitones (1='2m') + Note.transpose with no re-spelling, so repeated +1 piles up multi-flats (Ebb, Gbbb…); diatonic up-movement walks staff letters and snaps to the key without verifying the sounding pitch actually rose, so at the B/C enharmonic seam in Cb major an up-arrow produces an identically-sounding pitch. And the transpose tests only exercise natural notes in C/G, masking these plus the source-of-truth defects in the accidental cluster. The fix is to compute targets by MIDI and choose a sensible enharmonic spelling (key/direction-biased, simplified), assert monotonicity for diatonic steps, and add altered-note test coverage.

*Chromatic transpose produces musically illegible multi-flat spellings (api.transpose(1) repeated gives Ebb/Gbbb), and diatonic up-movement at flat-key enharmonic seams produces a pitch that doesn't audibly rise. The happy-path-only test suite hides these and the broader transpose/accidental defects. Spelling target by MIDI + deliberate enharmonic policy fixes it.*

**12. [MAJOR] Documentation diverges from the implemented model**  
Public-facing documentation (DATA_MODEL.md) and code comments describe schemas/behaviors that do not match the implementation: the documented TupletInfo {numNotes,inSpaceOf,index} and global-quant ChordSymbol do not match the real {ratio,groupSize,position} and measure-local {measure,quant}; SetSingleStaffCommand's comment promises a 'merge' mode that was never built (so grand->single silently discards the other staff's music). An integrator coding against the docs builds objects the engine mis-handles (NaN durations, mis-anchored chords), and a user trusting the merge comment loses music. The fix is to reconcile docs to the real schema, export named types, and either implement or delete the false claims.

*The docs lie in places that cause real corruption: the documented tuplet/chord schemas don't match the code (integrators produce NaN durations / mis-anchored chords), and a documented grand->single 'merge' mode doesn't exist (the other staff is silently discarded). Reconciling docs/types and removing/implementing false claims is required.*

**13. [MINOR] Mid-score notation state changes (key, clef) not modeled; double dots & slurs unrepresentable**  
The data model treats key signature and clef as single immutable properties (key on Score/Staff, clef on Staff) and dotting as a boolean, with no time-indexed/positioned representation. So a key change at a barline (with cancellation naturals), a mid-staff clef change, and a double-dotted note are all unrepresentable; the editor silently substitutes (e.g. two tied notes for a double-dot, whole-score key overwrite). These are genuine scope/data-model gaps rather than logic bugs — the fix is to model these as positioned/time-indexed properties (per-measure key, event/measure clef anchor, dot count) — but they are largely undocumented as limitations.

*Common notations are structurally impossible: a written mid-score key change (with cancellation naturals), a mid-staff clef change (cello/bassoon/keyboard), and double-dotted rhythms cannot be represented because key/clef are single properties and dotted is a boolean. These are honest data-model gaps but are mostly not surfaced as limitations to the user.*

**14. [MINOR] Playback completion and chord-track parity edge defects**  
Playback end-of-piece is computed from the last-STARTING event (events sorted by start time) rather than max(time+duration) across all voices, so with overlapping/grand-staff durations the transport stops and the cursor clears while a long final note is still sounding. This is masked by the absence of un-mocked playback tests covering overlapping durations, tuplets, compound meter, and chord timing. The fix is to compute completion as the latest sounding end and add real scheduling tests.

*Playback completion fires off the last-starting note, so on a grand staff or any overlapping voicing the cursor disappears and playback stops ~a beat before the music actually ends. The most error-prone playback paths (tuplet/compound/chord/overlap timing) are only ever tested through mocks, so the bug and its cousins are unguarded.*

---

# RiffScore Phased Remediation Plan

## 1. Honest Reliability Assessment

RiffScore is a well-architected codebase with disciplined layering (commands, services, engines, exporters), ADRs, and an extensive test suite — and that surface polish is actively misleading. The audit confirms ~75 distinct defects, of which only ~12 are documented anywhere and several of those docs *misrepresent* the shipped code. The failures are concentrated at exactly the layers a notation editor cannot get wrong: pitch/accidental semantics, key signatures, rhythm/tuplet exactness, clef geometry, and both export formats. Crucially, most are not edge cases — they are "wrong in every instance because the model is wrong": every minor-key score, every accidental-bearing MusicXML export, every tuplet export, every alto/tenor score, every 6/8 score, and every slash chord are affected, and the wrongness is *silent* until the user plays back or opens the file in MuseScore/Finale/Sibelius.

What is genuinely solid: the command/undo architecture, the single-staff *treble/bass major-key* rendering path, the scroll-view layout for simple meters, chord-symbol *parsing via Tonal* (the structured data is correct even where the surrounding string logic corrupts it), and the cross-staff time-grid sync for non-tuplet content. Within that narrow slice the editor behaves correctly and predictably. The test suite, however, only exercises that slice: there is no MusicXML round-trip, no `<alter>`/tuplet/tie/dot/pickup assertion, no minor-key accidental test, no altered-note transpose/undo test, and no tuplet beaming/selection test. The polish is real but it is guarding the happy path.

The deeper pattern is that a small number of root-cause mistakes metastasize across many independent dimensions: (1) accidental alteration is stored in *two* places (the SPN pitch string **and** a redundant `note.accidental` field) with no single source of truth, so render, audio, layout, and export disagree; (2) the core theory path resolves minor keys through `Key.majorKey('Em')` which returns an empty scale, while the chord module already has the correct resolver; (3) tuplet rhythm is modeled as lossy IEEE-754 floats that get floored on export, truncated in capacity math, and used as exact-equality map keys; (4) clef geometry and meter beat-structure are hand-coded against a "treble, 4/4" assumption instead of derived from the single-source models that already exist; (5) structural invariants (capacity, tie validity, selection repair, chordTrack re-anchoring, load-time migration) are enforced only in UI hooks, so the public API and every non-UI path silently corrupt state. Because each root cause fans out, fixing the *cause* (not the symptom) collapses whole clusters of findings at once. That is the organizing principle of the phases below: fix models, reject duct tape, and lock each fix with the test that was missing.

---

## 2. Remediation Phases

Phases are ordered by **dependency and user impact**. Phase 1 establishes the correctness foundations that every later phase and every consumer relies on. Phases 2–4 are export/render/interaction correctness that depend on those foundations. Phases 5–7 are engraving polish, page-view hardening, and feature completeness. Each phase is independently shippable and leaves the editor in a strictly more-reliable state.

---

### Phase 1 — Correctness Foundations (the model substrate)

Everything downstream — rendering, audio, layout, export, transpose, selection — reads pitch, key, and rhythm from these three models. They must be correct *first*, or every later fix is built on sand.

#### 1A. Single source of truth for accidental alteration

**Goal:** The absolute SPN pitch string (`'F#4'`, `'Bbb3'`) is the *only* authority for sounding/visual alteration. `note.accidental` becomes either removed or a strictly-derived display hint, never a parallel truth.

**Resolves (cluster "Dual source of truth for accidental alteration"):** `setaccidental-api-no-op`, `musicxml-drops-note-accidental` / `missing-alter-pitch-corruption`, `double-accidentals-render-wrong`, `redundant-accidental-no-doublesharp`, `unicode-vs-smufl-glyph-mismatch`, `accidental-spacing-uses-wrong-source`, `stale-accidental-override-export-corruption`, `double-accidental-downgraded`, `addtone-enharmonic-unison-not-deduped` (identity portion).

**First-principles approach:**
- Define one resolution function `resolveDisplayedAccidental(pitch, keyContext, measureAccidentalState)` that returns the full chromatic alteration as an enum `'doubleSharp' | 'sharp' | 'natural' | 'flat' | 'doubleFlat' | null`, derived from `Note.get(pitch).alt` (Tonal). It must distinguish `±2`, not collapse to a tri-state.
- Reimplement `setAccidental`/`toggleAccidental` to recompute `note.pitch` via the same `calculateNewPitch` helper the keyboard path uses, dispatching `{ pitch }`, not `{ accidental }`. Both API and keyboard call one shared helper so they cannot diverge.
- Drive **glyph selection, horizontal spacing, and export** from this one result. Glyphs map through the existing `ACCIDENTALS` SMuFL PUA constants (E260–E264) — including `doubleSharp`/`doubleFlat` — never the legacy Unicode `U+266x` codepoints.
- **Reject the duct-tape fix** of "keep both fields and sync them on every mutation." Two sources of truth that must be kept in sync is the bug. Remove `note.accidental` as stored truth; if backward-compat requires the field, make it a render-time derivation only.

**Affected files:** `src/hooks/api/modification.ts`, `src/commands/UpdateNoteCommand.ts`, `src/hooks/editor/useModifiers.ts`, `src/hooks/editor/useAccidentalContext.ts` (return type → `{ type, show }`), `src/utils/accidentalContext.ts` (`getEffectiveAccidental`), `src/services/MusicService.ts` (`needsAccidental`, `getAccidentalGlyph`), `src/engines/layout/measure.ts` (`getEventMetrics` spacing source), `src/components/Canvas/Note.tsx`, `src/types.ts` (accidental field decision).

**Risk:** High — touches render, audio, layout, and export simultaneously. Mitigate by landing the resolver + `setAccidental` rewrite first (visible, audible win), then migrating each consumer behind the same function in separate commits.

**Verification:** Unit-test that `setAccidental('sharp')` on `C4` produces `pitch === 'C#4'` and the rendered glyph node contains the PUA sharp (`\uE262`), not `\u266F`. Assert double-sharp/double-flat render the E263/E264 glyphs. Assert spacing reservation and drawn glyph derive from the same source (no `note.accidental`-driven spacing). Add a layout test that a normally-entered `F#4` (field null) reserves accidental width.

#### 1B. Mode-aware key resolution (fix all 15 minor keys)

**Goal:** All key-theory functions resolve the actual *mode*, so minor keys produce correct diatonic accidentals on render **and** entry.

**Resolves (cluster "Minor keys silently unresolved"):** `minor-keys-break-all-accidental-theory`, `minor-keys-broken-in-musicservice`; unblocks `key-and-divisions-not-perpart` and `midi-enharmonic-sharp-only`.

**First-principles approach:**
- Promote the chord module's already-correct `parseKeySignature`/`getScaleForKey` (`src/services/chord/utils.ts:51-64`, using `Key.minorKey(root).natural.scale`) to a single shared utility `getEffectiveScale(keyString)`.
- Route `needsAccidental`, `applyKeySignature`, `getScaleNotes`, `getScaleDegree`, `getKeyAlteration`, `movePitchVisual`, and `accidentalContext.getKeyAccidental` through it. Natural-minor scale is the correct basis for *signature* decisions (raised 6th/7th of harmonic/melodic minor are correctly treated as chromatic accidentals that *should* print).
- The principled end-state is to store key as structured `{tonic, mode}` (or always derive the relative-major root once at the boundary) rather than passing a stringly-typed value that `Key.majorKey` silently mis-parses. **Reject** the duct-tape of stripping the `'m'` ad hoc at each call site — that recreates the divergence the chord module already escaped.

**Affected files:** `src/services/chord/utils.ts` (promote to shared `src/utils/keyResolution.ts`), `src/services/MusicService.ts`, `src/utils/accidentalContext.ts`, `src/commands/SetKeySignatureCommand.ts` (consider structured storage), `src/utils/entry/pitchResolver.ts`, `src/components/Canvas/ChordGroup.tsx`.

**Risk:** Medium — well-isolated; the correct algorithm already exists and is tested in the chord module.

**Verification:** Regression tests across all 15 minor keys for both render (`needsAccidental`/`getAccidentalGlyph` suppress diatonic F# in Em, show a contradicting natural) and entry (`applyKeySignature('F4','Em') === 'F#4'`, `applyKeySignature('B4','Dm') === 'Bb4'`, `movePitchVisual` snaps to the diatonic pitch). Exporter round-trip in a minor key.

#### 1C. Exact integer/rational rhythm model (kill float tuplets)

**Goal:** Tuplet durations are exact integers (or rationals), never IEEE-754 floats fed into floor/truncate/exact-equality.

**Resolves (cluster "Lossy float representation of tuplet rhythm"):** `tuplet-fractional-quants-corrupt-math`, `float-tuplet-quants-as-map-keys`, `noninteger-quant-keys`, and unblocks the export/beaming/selection sub-fixes in later phases (`tuplet-musicxml-floor-corrupts-duration`, `no-tuplet-aware-beaming`, `tuplet-exact-quant-matching-fragile-untested`, `reflow-drops-tuplets-and-float-quants`).

**First-principles approach:**
- Switch the internal quant base to a finer integer grid that is divisible by all supported tuplet denominators. With quarter = 16 today, multiply by `LCM(3,5,7) = 105` (or adopt a MIDI-style PPQ / exact `{num,den}` rational). Then `getNoteDuration` returns integers, and `getBreakdownOfQuants`, capacity, overwrite, gap-fill, and chord anchoring become exact by construction.
- `getBreakdownOfQuants` must **assert** integer input at a single explicit conversion point and never silently drop a fractional remainder.
- Fix the one genuinely independent drift site already proven wrong: `migrateChordTrack` (`src/types.ts:454`) derives local quant via `globalQuant % quantsPerMeasure` instead of accumulation — make it reuse the same accumulation as `getValidChordQuants`.
- **Reject** epsilon-tolerant float comparison as the *primary* fix (it is duct tape over a model that should be exact); use exact integers and `===` becomes safe. Epsilon is acceptable only as transitional defense-in-depth if the grid migration is staged.

**Affected files:** `src/utils/core.ts` (`getNoteDuration`, `getBreakdownOfQuants`, `QUANT_BREAKDOWN`), `src/config.ts` (quant base), `src/constants.ts` (`TIME_SIGNATURES`, duration→quant table), `src/types.ts` (`migrateChordTrack`), all consumers in `src/engines/layout/system.ts`, `measure.ts`, `scoreLayout.ts`, `src/services/chord/ChordQuants.ts`.

**Risk:** High — the quant base is referenced widely. This is why it is a *foundation*: doing it once, early, prevents re-patching every downstream consumer with float-tolerance hacks. Stage behind a constant so the multiplier can be tuned, and add an invariant test that every supported tuplet lands on an integer tick.

**Verification:** Assert `getNoteDuration(triplet eighth)` and `quintuplet sixteenth` are exact integers; three triplet eighths sum exactly to one beat; `getBreakdownOfQuants(quintuplet remainder)` loses zero quants. Migration test for legacy chords anchored to tuplets in measures ≥ 1.

#### 1D. Single-source clef geometry

**Goal:** One algorithm maps any pitch to a staff offset (forward) and any offset to a pitch (inverse) from the authoritative `CLEF_REFERENCES` model, with **no** treble/bass lookup-table fast-path.

**Resolves (part of cluster "Per-clef and per-meter geometry hard-coded"):** `alto-tenor-treble-positions`, `tenor-clef-pitch-offset-wrong`, `tenor-clef-glyph-wrong-line`.

**First-principles approach:**
- Delete the early `PITCH_TO_OFFSET`/`BASS_PITCH_TO_OFFSET` table lookup and the contradictory `CLEF_REFERENCE` table in `positioning.ts`. Compute every clef's offset from `src/utils/clef.ts` `CLEF_REFERENCES` (`referencePitch` + `referenceLine`): `offset = (5 - referenceLine)*lineStep - diatonicSteps(pitch, referencePitch)*halfStep`. This yields treble C4=60, alto C4=24, tenor C4=12, bass E2=60 from one formula.
- Derive `getPitchForOffset` (hit-detection / click-to-place) by inverting the *same* formula, so click and render are guaranteed consistent for alto/tenor/grand.
- Derive the clef glyph Y in `ScoreHeader.getClefY` and `ClefIcon` from the same `referenceLine`, so glyph and notes agree about where middle C sits.
- **Reject** keeping the tables "for performance" unless they are *generated* from `CLEF_REFERENCES` per clef.

**Affected files:** `src/engines/layout/positioning.ts` (`getOffsetForPitch`, `getPitchForOffset`, `getYToPitch`, delete tables + `CLEF_REFERENCE`), `src/components/Canvas/ScoreHeader.tsx` (`getClefY`), `src/components/Assets/ClefIcon.tsx`, `src/utils/clef.ts` (sole source).

**Risk:** Medium — alto/tenor are currently fully broken so there is little correct behavior to regress; treble/bass already decode correctly from the formula.

**Verification:** Round-trip test `pitch → offset → pitch` for every clef. Landmark assertions: alto C4=24, tenor C4=12, treble C4=60, bass E2=60. Assert click on the middle line in alto inserts C4, not B4. Assert the clef glyph's middle-C line equals `getOffsetForPitch('C4', clef)`.

---

### Phase 2 — Export Fidelity (MusicXML & ABC)

Depends on Phase 1 (pitch source of truth, exact rhythm, mode-aware keys). Export is where silent corruption becomes *permanent and shared* — the highest-leverage correctness payoff after the foundations.

**Goal:** A score exported to MusicXML or ABC is musically identical to what is rendered and played, and is valid against the MusicXML 4.0 schema / the ABC standard.

**Resolves:** `missing-alter-pitch-corruption`/`musicxml-drops-note-accidental`, `tuplet-duration-floor-nonsumming`/`tuplet-musicxml-floor-corrupts-duration`, `note-element-order-tie-dot`, `pickup-not-implicit`, `grand-staff-two-parts`, `key-and-divisions-not-perpart`, `no-rhythm-pitch-test-coverage`; ABC: `natural-vs-keysig-not-cancelled`, `no-measure-local-accidental-cancellation`, `quintuplet-wrong-ratio`, `abc-tie-before-duration`, `q-field-after-k-field`, `no-final-barline`; harmony: `extensions-alterations-dropped` (MusicXML `<kind>` portion, see completeness critique), `no-json-import-path`.

**First-principles approach:**
- **MusicXML `<alter>`:** Derive `<alter>` from `Note.get(pitch).alt` inside every `<pitch>` (handling ±1/±2 uniformly), exactly mirroring the chord-root path. Octave from `Note.get(pitch).oct`, not `slice(-1)`. `<accidental>` (visual) derives from the same pitch + key context, never the redundant field.
- **MusicXML `<divisions>`:** Compute per-score from the LCM of tuplet denominators present (e.g. 48 for triplets, more for quintuplets/septuplets) so every duration is an exact positive integer; never `Math.floor` a single note. Assert each measure's `sum(<duration>) == divisions*beats`. Emit `<normal-type>` inside `<time-modification>`.
- **Element order:** Build `<note>` children in strict DTD order: `(chord) pitch duration tie* type dot* accidental time-modification ... notations`. Move `<tie>` to follow `<duration>`, `<dot>` to follow `<type>`.
- **Pickup:** Read `Measure.isPickup`; emit `<measure number="0" implicit="yes">` and number full measures from 1.
- **Grand staff:** Model the grand staff as **one part** with `<staves>2</staves>`, two numbered clefs, per-note `<staff>`, a `<backup>` of the measure duration, and a brace via `<part-symbol>`/`part-group`.
- **Per-part key:** Derive `<fifths>` from `staff.keySignature || score.keySignature` inside the per-part loop; emit attributes for every part even when sparse.
- **MusicXML `<harmony>`:** Replace the separate, lossy `CHORD_KIND_MAP` with the canonical `parseChord` structured output; emit `<degree>` for extensions/alterations so `Cmaj9`/`C6`/`Cm6`/`C7b9` are not collapsed to triads (completeness-critique item).
- **ABC accidentals:** Compute the *displayed* accidental from absolute pitch vs key signature + an intra-measure ledger (reuse the Phase-1A resolver / extracted `useAccidentalContext` core): emit `=` to naturalize a key-altered letter, suppress redundant accidentals, reset at barlines.
- **ABC syntax fixes:** tie hyphen *after* pitch+length (`C2-`, `[CEG]2-`); explicit tuplet `(p:q:r`; `Q:` before `K:` (K last); final barline `|]`.
- **JSON round-trip:** Add `importScore(input)` that parses, **migrates**, and **validates**, exported from the public API, so JSON is a true symmetric format.

**Affected files:** `src/exporters/musicXmlExporter.ts`, `src/exporters/abcExporter.ts`, `src/exporters/jsonExporter.ts` (+ new `importScore`), `src/hooks/api/io.ts`, `src/hooks/api/useExport.ts`, `src/services/chord/ChordParser.ts` (canonical kind output reused), `src/index.tsx` (export importer + named types).

**Risk:** Medium. The exporters are isolated and now have correct upstream models to read. The grand-staff `<backup>` change is the trickiest; gate it behind a regression test.

**Verification:** This phase **must** ship with the test layer the audit found entirely missing. Add assertions for: `<alter>` on sharp/flat/double; `sum(<duration>) == divisions*beats` and all durations positive integers across triplet/quintuplet/sextuplet; DTD child-ordering (`indexOf('<tie') < indexOf('<type>')`, `indexOf('<dot/>') < indexOf('<accidental>')`); pickup `implicit="yes"`; grand staff = one `<part>` with `<staves>2</staves>` + `<backup>`. Validate a representative export against the MusicXML 4.0 XSD via `xmllint` in CI. ABC: `F4` under `K:G` → `=F`; sharp-then-natural within a bar; quintuplet `(5:4:5`; tie `C2-`; tune ends `|]`. JSON export→import lossless round-trip + legacy-fixture upgrade.

---

### Phase 3 — Transposition & Chromatic Spelling

Depends on Phase 1A (pitch source of truth) and 1B (mode-aware keys). Transpose is the most common destructive edit and currently silently loses data.

**Goal:** Transposition is spelling-aware, key-aware, monotonic in pitch, and **losslessly undoable**.

**Resolves (clusters "Dual source of truth" transpose subset + "Chromatic/diatonic transpose"):** `diatonic-destroys-accidentals`, `transpose-undo-not-lossless`, `chromatic-enharmonic-explosion`, `cb-major-uparrow-no-movement`, `transposeDiatonic-ignores-key-signature`, `step-12-coerced-to-octave`, `transpose-coverage-gaps`.

**First-principles approach:**
- **Lossless undo:** Have `TransposeSelectionCommand` and `ChromaticTransposeCommand` snapshot each mutated note's prior `{pitch}` at `execute()` and restore verbatim on `undo()` (mirror `ChangePitchCommand.oldPitch`). Undo is *exact state restoration*, never inverse transformation through a lossy spelling function.
- **Diatonic step preserves alteration:** `movePitchVisual` must carry the source's chromatic offset relative to its key-natural spelling: `newAlt = keyNaturalAlt(destLetter) + (srcAlt - keyNaturalAlt(srcLetter))`. So `F#4 → E#4`, not `E4`.
- **Monotonicity:** After computing the candidate, assert the sounding MIDI actually moved in the requested direction; if not (the Cb-major B/C seam), advance another scale degree. Compare audio-feedback by MIDI, not pitch string.
- **Chromatic spelling:** Compute target by MIDI, then choose a sensible enharmonic via a deterministic policy (key scale degree → fewest accidentals → `Note.simplify` so `|alt| ≤ 1` except where a double is least-surprising). Pass the staff key into `ChromaticTransposeCommand` like `TransposeSelectionCommand` already does. Eliminates the `Ebb/Gbbb` explosion.
- **Units:** Delete the `|steps|==12 → 7` magic coercion; translate the arrow-key octave shortcut to ±7 at the call site in `useNavigation`; rename the command parameter `semitones → steps`. Route the effective key through one shared `getEffectiveKeySignature(score, staffIndex)` resolver.

**Affected files:** `src/services/MusicService.ts` (`movePitchVisual`, `applyKeySignature`), `src/commands/TransposeSelectionCommand.ts`, `src/commands/ChromaticTransposeCommand.ts`, `src/hooks/interaction/useNavigation.ts`, `src/utils/navigation/transposition.ts`, `src/hooks/api/modification.ts`.

**Risk:** Medium. The undo-snapshot change is low-risk and high-value; the spelling-preservation change needs broad test coverage (currently zero for altered notes).

**Verification:** `F#4`/`Bb4`/forced-naturals up-and-undo and down-and-undo round-trip exactly. `transpose(+1)` repeated 5× from C4 never yields `|alt|>1`. Every diatonic up/down step strictly monotonic in MIDI across all 15 keys including `E#/B#/Cb/Fb` start notes. `transposeDiatonic(12)` on C4 in C yields A5 (not C5); `transposeDiatonic(7)` yields C5.

---

### Phase 4 — Structural Invariants at the Model Boundary

Depends on Phases 1 and 3 (so the operations being centralized are themselves correct). This phase makes invalid states *unrepresentable through any path*, closing the entire "UI-only validation" class.

**Goal:** Capacity, tie validity, selection consistency, chordTrack anchoring, and load-time migration/validation are properties of the command/model/ingestion layer, not the UI.

**Resolves (cluster "Cross-cutting structural invariants"):** `no-capacity-validation-in-commands-or-api`, `loadscore-api-bypasses-migration-and-validation`, `no-json-import-path` (shared with Phase 2), `no-selection-repair-on-staff-removal`, `no-same-pitch-validation`, `reflow-wipes-ties`, `delete-leaves-gap-no-backfill`, `duration-change-overflow-noop`, `interactive-insert-no-overflow`, `midi-entry-last-measure-no-capacity`, `chordtrack-not-adjusted-on-structural-ops`, `chord-reflow-orphan-position-shift`, `api-play-ignores-chords`, `no-duplicate-id-or-grandstaff-invariant-check`. Also `addnote-api-hardcoded-capacity`.

**First-principles approach:**
- **Capacity:** Make bar capacity a single source of truth = `TIME_SIGNATURES[score.timeSignature]`. Drop the `CONFIG.quantsPerMeasure` default from `getRemainingCapacity`/`canAddEventToMeasure`/`canModifyEventDuration`/`canToggleEventDot` so every caller must supply real capacity; thread it into both halves of `executeInsertion` so the capacity check and overflow handler can never disagree. Add a `validateMeasure`/`validateScore` invariant: every non-pickup measure sums to exactly capacity.
- **Single insertion engine:** Refactor `eventInserter.ts`'s `planInsertion`/`planOverflow` into a surface-agnostic planner used by mouse, keyboard, MIDI, and API, returning a command batch. MIDI entry targets the *cursor*, not `measures.length-1`, and inherits capacity/auto-advance.
- **Delete backfill:** `DeleteEventCommand`/`DeleteNoteCommand` replace the removed slot with rests via `getBreakdownOfQuants` (tuplet-aware), preserving downstream beat positions; only end-of-measure may collapse without a rest.
- **Duration overflow:** Replace the silent no-op with grow-and-tie-across-barline (a `ResizeEventCommand`), consuming following rests first; or surface a rejection — never silent.
- **Tie validity:** Centralize `findTieTarget(score, ...)` (same-pitch, immediate successor incl. cross-barline). Gate `toggleTie`/`setTie`/`handleTieToggle`; reject with `NO_TIE_TARGET` instead of persisting an unresolvable tie. Reflow preserves user ties whose adjacent same-pitch pair survives re-barring (stop blanket `tied:false` in `flattenMeasures`); only break genuinely separated pairs.
- **chordTrack re-anchoring:** Model the chord anchor as *musical time*. Add `globalQuantOf`/`chordPositionFromGlobal` helpers; every structural command (`AddMeasureCommand`, `DeleteMeasureCommand`, `SetTimeSignatureCommand`, `reset`) transforms `chordTrack` in the *same* immutable update. Out-of-range chords dropped at the command boundary.
- **Load boundary:** Move `migrateScore`/`migrateChordTrack` into `LoadScoreCommand.execute` (or a shared `importScore` service) and add a shape validator that returns `ok:false` (fail-soft per ADR-008) instead of crashing at `useScoreLogic`. Add a `schemaVersion` field for deterministic migration.
- **Selection repair:** Implement the documented `useSelection` effect — after any score change, prune/clear selection entries whose staff/measure/event/note no longer resolve. Make `TransposeSelectionCommand` bounds-safe and stop `getActiveStaff` silently retargeting staff 0 for mutations.
- **Play parity:** Route `api.play()` through `scheduleScorePlayback` (or fold chord scheduling into the single `scheduleTonePlayback` primitive) reading the score's own chord-playback config, so UI and API audio are byte-identical.

**Affected files:** `src/utils/validation.ts`, `src/utils/entry/insertion.ts`, `src/utils/entry/eventInserter.ts`, `src/hooks/api/entry.ts`, `src/hooks/note/useNoteEntry.ts`, `src/hooks/audio/useMIDI.ts`, `src/commands/DeleteEventCommand.ts`, `DeleteNoteCommand.ts`, `MeasureCommands.ts`, `SetTimeSignatureCommand.ts`, `LoadScoreCommand.ts`, `src/hooks/api/io.ts`, `src/utils/core.ts` (`reflowScore`, `flattenMeasures`), `src/services/chord/ChordQuants.ts`, `src/commands/chord/AddChordCommand.ts`, `src/hooks/score/useSelection.ts`, `src/commands/TransposeSelectionCommand.ts`, `src/hooks/api/playback.ts`.

**Risk:** Medium–High in breadth, but each invariant is independently landable. The reflow tie-preservation and chordTrack re-anchoring are the most intricate; gate behind dedicated tests.

**Verification:** API test: inserting a whole note into an empty 3/4 bar splits/ties (no 64-quant bar). Delete-from-front of a 4/4 measure leaves a quarter rest on beat 1. Tie to a different pitch is rejected. Time-sig change preserves within-bar ties and re-anchors chords to the same global time. `loadScore` of a legacy single-staff object migrates (does not throw); malformed object returns `ok:false`. Removing a staff clears/repairs a bass-staff selection. `api.play()` schedules chord events. Add the measure-integrity assertion to the suite (zero such tests exist today).

---

### Phase 5 — Engraving Correctness (beaming, stems, chord layout, accidentals on the page)

Depends on Phase 1C (exact rhythm) and 1D (clef geometry). These are render-only but actively misrepresent rhythm/harmony to the reader.

**Goal:** Beaming reflects the meter and standard secondary-beam rules; stems and chord glyphs follow Gould; key-signature accidentals sit on their own letters in every clef.

**Resolves (clusters "Per-clef/per-meter geometry" remainder, "Beaming simplifications", "Chord vertical layout"):** `compound-meter-beaming-hardcoded-quarter-beat`/`compound-meter-beam-grouping-wrong`, `beat-size-uses-fixed-quantsPerMeasure-not-measure-quants`, `rest-breakdown-ignores-beats`, `mixed-duration-break-no-beamlets`, `group-stem-direction-average-not-extreme`, `beam-slope-limit-too-permissive`, `rests-always-break-beams`, `no-tuplet-aware-beaming`, `alto-keysig-positions-wrong`, `tenor-keysig-fsharp-gsharp-wrong`, `chord-accidental-no-column`, `no-accidental-collision-avoidance`, `chord-dot-not-columned`, plus single-note stem-length (completeness critique).

**First-principles approach:**
- **Meter-aware beaming:** Thread `score.timeSignature` into `calculateBeamingGroups` (both call sites). Derive beat-group boundaries from numerator/denominator: simple meters group by the denominator unit; compound meters (numerator divisible by 3, denominator 8/16) group eighths in threes (6/8 → 3+3). Break beams on *crossing* a boundary, not equality. Anchor arithmetic to `TIME_SIGNATURES[timeSignature]`, not the fixed `CONFIG.quantsPerMeasure`.
- **Secondary beams / beamlets:** Stop breaking on duration change. Replace scalar `BeamGroup.type` with per-note beam counts (8th=1…64th=4); compute full secondary beams where adjacent notes share a level and partial beamlets (stubs, direction toward the rhythmic neighbor) where they don't. `Beam.tsx` draws per-segment.
- **Tuplet-aware beaming:** Make tuplet membership (by `tuplet.id`) a first-class break condition — beam each tuplet as a self-contained unit; with Phase 1C's exact quants, beat detection no longer relies on float equality.
- **Stem direction:** Replace mean-Y with the furthest-from-middle-line note; extract one shared `getGroupStemDirection` used by single notes, chords, and beams. Lengthen single-note stems toward the middle line for ledger-line notes and per flag count.
- **Beam slope:** Express the limit in staff spaces (cap total rise ~1 space, never >~2), quantize to standard steps, recompute endpoints; replace the dimensionless 1:1 `MAX_SLOPE`.
- **Beamed-over rests:** Include a rest in the group when it is internal to the beat with a following beamable note (behind a `beamOverRests` flag if the documented default is retained).
- **Rest decomposition:** Make `getBreakdownOfQuants` position-aware — clip at beat/half-bar boundaries before greedy fill, so no rest straddles the mid-bar of 4/4. Add a legal-merge consolidation pass.
- **Key-sig positions:** Generate `KEY_SIGNATURE_OFFSETS` programmatically from `CLEF_REFERENCES` (Phase 1D), placing each accidental on its own letter at the conventional octave; implement the tenor exception explicitly. Deletes the scrambled hand-authored alto/tenor tables.
- **Chord accidental/dot columns:** Add a chord-layout pass that packs accidentals into non-overlapping left columns (Gould zig-zag, anchored left of the leftmost notehead, decoupled from second-displacement), aligns all augmentation dots in one right column with per-dot Y de-collision, and feeds reserved width back into `getEventMetrics`.

**Affected files:** `src/engines/layout/beaming.ts`, `src/engines/layout/types.ts` (BeamGroup model), `src/components/Canvas/Beam.tsx`, `src/engines/layout/stems.ts`, `src/constants.ts` (`MAX_SLOPE` → rise/quanta, `STEM.LENGTHS`, generate `KEY_SIGNATURE_OFFSETS`), `src/utils/core.ts` (`getBreakdownOfQuants` position-aware), `src/engines/layout/positioning.ts` (`calculateChordLayout` accidental/dot columns), `src/components/Canvas/Note.tsx`, `ChordGroup.tsx`, `Rest.tsx`.

**Risk:** Medium. Beaming and beamlets are the largest sub-task; the rest are localized. Update `docs/LAYOUT_ENGINE.md` (stem-direction rule, beaming claims) as part of the work.

**Verification:** Six eighths in 6/8 → two groups of three; 9/8/12/8 likewise. Dotted-8th+16th beams with a left-pointing beamlet. Wide-spread descending group picks direction by the extreme note. Beam rise clamped ≤ ~1 space. Per clef and per key signature, every accidental glyph decodes to its own letter and stays near the staff. Chord `Eb-Gb-Bb`/`C#-E#-G#` produce distinct non-overlapping accidental X positions; dots align in one column. No rest spans the mid-bar of 4/4.

---

### Phase 6 — Page View & Print Hardening

Depends on Phase 1D (geometry) and the tie model from Phase 4. The newest, highest-risk surface.

**Goal:** Page-view geometry, lifecycle, and print are derived from the page/system model, not borrowed scroll-view assumptions.

**Resolves (cluster "Page-view / pagination"):** `overwide-measure-compressed`, `playback-cursor-scrollview-coords-in-page-view`, `multipage-lookup-first-page-only`, `print-bakes-in-viewport-zoom`, `empty-document-blank-page-view`, `metadata-block-not-scaled`, `grand-staff-barline-not-connected`, `tie-across-system-break-hangs`/`cross-system-tie-not-rendered`; plus completeness-critique items: page-view drag-to-select coordinate mismatch, print paper-size/`@page size`, chord-vs-note pickup playback desync.

**First-principles approach:**
- **Never compress a measure:** Floor `stretchFactor` at 1.0 in both `calculateStretchFactor` and `calculateMeasurePositions`. An over-wide measure overflows its system (or gets its own system); a measure wider than the page triggers a global proportional down-scale with a user alert — not local squashing.
- **Cursor & lasso in page space:** Expose one `getX(view, measure, quant)` from the layout that returns the rendered absolute X for the active view; the page-view cursor and `useDragToSelect` consume it (system left origin + per-system stretch + staffScale), eliminating the duplicated scroll-vs-page coordinate math. Make `useDragToSelect` page-aware (actually repoint the SVG ref / compute candidate positions from page layout).
- **Multi-page lookups:** `getSystemForMeasure`/`getMeasureOriginInSystem` iterate `pages.flatMap(p => p.systems)` and resolve by system *object*, not by indexing the page-0-only `layout.systems` alias with a global index.
- **Print:** `@media print { .riff-ScoreEditor__content { transform: none !important } }`; declare `@page { size: <pageSize>; margin: 0 }` from the layout's physical mm model so 1 page = 1 sheet at the configured staff size regardless of viewport zoom; fix the stale selectors to the real rendered class names.
- **Empty document:** Synthesize one blank first page (with footer, title placeholder) when there are no systems; `pageCount = 1`.
- **Metadata scaling:** Thread `staffScale` into `calculateMetadataLayout` and the rendered font sizes so header-to-music spacing stays proportional across 50–150%.
- **Connected barlines:** Create the missing `Barline.tsx`; draw barlines at *system* scope spanning top-of-top-staff to bottom-of-bottom-staff (including the inter-staff gap and continuous final thin-thick); remove per-staff `MeasureBarLine` for multi-staff systems.
- **Cross-system ties:** Resolve ties at score level; same-system → normal `Tie`; straddling a break → two arcs via the existing (currently dead) `isStartOfTie`/`isEndOfTie`/`crossesSystemBreak` props. Remove the hanging-stub fallthrough except for genuinely dangling ties.
- **Chord playback pickup sync:** Make the chord scheduler consume the same `measureStartTimes` array the note timeline builds (pickup-aware), not `chord.measure * fixed quantsPerMeasure`.

**Affected files:** `src/services/PageLayoutService.ts`, `src/engines/layout/measure.ts` (`calculateStretchFactor`), `src/components/Canvas/ScoreCanvas.tsx`, `src/hooks/layout/usePageLayout.ts`, `src/hooks/interaction/useDragToSelect.ts`, `src/styles/print.css`, `src/services/PrintService.ts`, new `src/components/Canvas/Barline.tsx`, `src/components/Canvas/Staff.tsx` (cross-system tie wiring), `src/components/Canvas/Tie.tsx`, `src/engines/toneEngine.ts` (chord scheduler `measureStartTimes`).

**Risk:** Medium–High — newest code, least battle-tested, heavy coordinate math. Land cursor/lasso (shared `getX`) and the stretch floor first as they unblock the rest.

**Verification:** Over-wide measure renders at ≥ natural width (replace the test that blesses compression). Page-view cursor X equals rendered note X for a later-page measure; lasso over a known measure selects exactly its notes. `getSystemForMeasure(lastMeasure)` ≠ -1 on a 60-measure score. After `preparePrint` the computed transform is `none` and page width equals the mm-derived pixels regardless of zoom. Empty score → `pages.length ≥ 1`. Cross-system tie renders an outgoing arc on system N and incoming arc on N+1. Chord on measure 1 after a pickup schedules at `measureStartTimes[1]`.

---

### Phase 7 — Chord-Symbol Theory & Feature Completeness

Depends on Phase 1B (mode-aware keys) for diatonic quality. Independent of most rendering; can run in parallel with Phases 5–6.

**Goal:** Chord parsing/normalization/conversion/voicing derive from structured Tonal data, not substring heuristics; documented-but-missing features are either implemented or honestly scoped.

**Resolves (cluster "Chord-symbol engine"):** `extensions-alterations-dropped` (parser portion), `slash-voicing-ignores-bass`, `secondary-dominant-fails-parse`, `roman-halfdim-dim-lost`, `minor-key-diatonic-quality-ignored`, `isminor-false-positive-dim`, `minmaj7-unparseable`, `voicing-fixed-octaves-no-inversion-spread`. Plus doc-reconciliation: `tupletinfo-shape-mismatch-docs`/`datamodel-doc-tuplet-type-mismatch`, `single-staff-merge-mode-missing-data-loss`, and `completion-endtime-overlap`, `bpm-ignores-beat-unit`.

**First-principles approach:**
- **Structured normalization:** Stop hand-rebuilding the canonical string. Derive quality+extension+alterations from Tonal's parsed result (distinguish maj7 vs dominant by the 7th interval; preserve sus+7; map intervals to `b9/#9/#11/b13`). Add a round-trip guard: `Chord.get(canonical).notes` must equal `Chord.get(input).notes` or fall back to a faithful representation.
- **Quality enum:** Carry one canonical quality enum (major/minor/dim/aug/half-dim) from the parser; converters switch on it. Fix `isMinorChord` to be mutually exclusive; add dim/aug/half-dim branches to Nashville and movable-do.
- **Roman/diatonic:** Detect notation first, then interpret `/` per notation (secondary dominant for Roman: re-key to the tonicized degree). Derive diatonic triad quality from the actual scale (Phase 1B), with case/explicit suffix as override; consume trailing `o`/`°`/`ø` markers.
- **Voicing:** Voice from absolute MIDI, stacking each tone above the previous; honor the slash bass as the lowest pitch (true inversion).
- **min-maj7 & secondary dominants:** Emit Tonal-parseable canonicals (`CmMaj7`); don't blindly rewrite `M7→maj7` after a minor marker; parse `V/V` as applied harmony. Thread the score key into `ChordInput` (currently hardcoded C).
- **Playback edges:** `endTime = max(time+duration)` across all events (not last-starting); derive `secondsPerQuant` from a meter beat unit (dotted-quarter in compound) or explicitly document quarter-BPM.
- **Docs & scope:** Reconcile `DATA_MODEL.md` tuplet/ChordSymbol schemas to the real types and export named types. Either implement `SetSingleStaffCommand` merge mode or remove the false comment and warn on data-discarding collapse.

**Affected files:** `src/services/chord/ChordParser.ts`, `ChordNotationConverter.ts`, `ChordVoicing.ts`, `utils.ts`, `src/components/Canvas/ChordTrack/ChordInput.tsx`, `src/engines/toneEngine.ts` (endTime, beat unit), `src/services/TimelineService.ts` (beat unit), `src/commands/SetSingleStaffCommand.ts`, `docs/DATA_MODEL.md`, `src/types.ts`/`src/index.tsx` (named tuplet/chord types).

**Risk:** Low–Medium. Parsing is well-isolated and Tonal already returns correct structured data; the work is rerouting through it and adding round-trip guards.

**Verification:** Exact symbol+notes for `maj9`/`7b9`/`7#9`/`7#11`/`7b13`/`7sus4`/`9sus4`. `getChordVoicing('C/E')[0]` is E. `V/V` in C → D7; `viio`/`iiø7` round-trip. Minor-key `ii` in Am → Bdim. `Cm(maj7)` parses with notes C-Eb-G-B. Solfege dim shows `°` not `-`. Overlapping grand-staff playback completes at the true last release. Doc-vs-type parity test that an externally-authored event built from `DATA_MODEL.md` round-trips through `getNoteDuration`.

---

## 3. Correctly Unsupported (leave as-is, document as limitations)

These are valid scope choices — but **all must be documented as explicit non-features** (as grace notes already are), because today their absence is silent and users may misuse adjacent tools.

- **Grace notes** — already correctly out of scope; keep documented.
- **Slurs** (different-pitch phrase marks) — `slurs-unsupported-undocumented`. A legitimate scope cut, but it is currently invisible and the tie tool accepts different-pitch input (closed by Phase 4 same-pitch validation). **Action: document slurs as unsupported in `DATA_MODEL.md`/`API.md`/`INTERACTION.md`.** Do *not* leave it implicit.
- **Multi-voice within a staff** — listed as future in `DATA_MODEL.md`; acceptable to defer. Keep documented.

These are **NOT** valid to leave broken (they masquerade as scope cuts but are real defects that must be fixed in the phases above):
- **Minor keys** (Phase 1B) — documented as *supported* in `CONFIGURATION.md`; broken.
- **Double accidentals** (Phase 1A) — the model, validator, and ABC exporter already accommodate them; rendering/export must too.
- **Tuplets** (Phases 1C/2/5) — a first-class UI feature; must be exact.
- **Alto/tenor clefs, 6/8/9/12/8** (Phases 1D/5) — offered in pickers and documented as supported.

Items that are *honest* data-model gaps and **may** be deferred with documentation (Phase-7-adjacent), not silently: **mid-score key change**, **mid-staff clef change**, **double-dotted notes**. Each is unrepresentable today and the editor silently substitutes (e.g. two tied notes for a double dot). **Action: document each as a known limitation now**; schedule the data-model work (positioned/time-indexed key, event/measure clef anchor, `dots: count`) post-Phase-4. Multi-measure rests and barline types (final/double/repeat) are likewise documentable deferrals.

---

## 4. Quick Wins (high value, low effort — land immediately, ahead of or alongside Phase 1)

- **`setAccidental` → rewrite pitch** (subset of 1A): point the API at the existing `calculateNewPitch` helper. Turns a silent no-op into a working, audible feature in a few lines.
- **Transpose undo snapshot** (subset of Phase 3): store `{pitch}` at `execute()`, restore on `undo()`. Stops silent data loss via the most common safety operation; ~20 lines, no model change.
- **MusicXML `<alter>`** (subset of Phase 2): emit `Note.get(pitch).alt` inside `<pitch>`. Single most impactful export fix — stops every sharp/flat exporting a semitone wrong. The ABC exporter already proves the parse.
- **Playback `endTime = max(time+duration)`** (`completion-endtime-overlap`): one-line reduce; fixes the cursor cutting off held final notes.
- **`api.play()` chord parity** (`api-play-ignores-chords`): point it at `scheduleScorePlayback`. One-line routing change.
- **ABC `Q:` before `K:`** and **final barline `|]`**: two trivial ordering/string fixes for valid ABC headers and a conventional ending.
- **Remove the `|steps|==12 → 7` magic coercion** and translate the octave shortcut at the call site: removes a surprising API footgun.
- **Delete the alto/tenor treble lookup short-circuit** (subset of 1D): even before full geometry unification, removing the early table return makes alto/tenor render from the (correct) reference formula.
- **`migrateChordTrack` modulo → accumulation** (`float-tuplet-quants-as-map-keys` real defect): fixes the one proven cross-path float drift for legacy chords on tuplets.
- **Stem-direction shared helper** (`group-stem-direction-average-not-extreme`): reuse the existing furthest-from-middle-line logic from `getTupletUnifiedDirection`; also correct `docs/LAYOUT_ENGINE.md:193`.

---

## 5. Sequencing & Test Strategy Summary

Phase 1 is the gate: it is the only phase that *must* precede the others, because Phases 2–7 all read pitch, key, rhythm, and clef geometry from it. Phases 2 (export), 3 (transpose), and 7 (chords/docs) can then proceed largely in parallel; Phase 4 (invariants) should precede Phase 6 (page view depends on the tie model and validated load); Phase 5 (engraving) depends on 1C/1D but is otherwise independent.

The cross-cutting test mandate, applied in *every* phase: the audit's central finding is that an extensive suite tested only the happy path. Each fix lands **with the assertion that was missing** — minor-key accidentals, altered-note transpose/undo, MusicXML `<alter>`/tuplet-sum/element-order/pickup, XSD validation in CI, 6/8 beaming, tuplet selection sync, cross-system ties, measure-capacity invariants, chord round-trip guards, JSON import/export round-trip. No phase is "done" until its regression locks are in CI, because the silent-failure class is precisely what undefended green builds allowed.

**Relevant files for this plan (all absolute):** `/Users/josephkotvas/Sites/riffscore/src/services/MusicService.ts`, `/Users/josephkotvas/Sites/riffscore/src/services/chord/utils.ts`, `/Users/josephkotvas/Sites/riffscore/src/utils/accidentalContext.ts`, `/Users/josephkotvas/Sites/riffscore/src/hooks/editor/useAccidentalContext.ts`, `/Users/josephkotvas/Sites/riffscore/src/exporters/musicXmlExporter.ts`, `/Users/josephkotvas/Sites/riffscore/src/exporters/abcExporter.ts`, `/Users/josephkotvas/Sites/riffscore/src/utils/core.ts`, `/Users/josephkotvas/Sites/riffscore/src/engines/layout/positioning.ts`, `/Users/josephkotvas/Sites/riffscore/src/engines/layout/beaming.ts`, `/Users/josephkotvas/Sites/riffscore/src/utils/clef.ts`, `/Users/josephkotvas/Sites/riffscore/src/constants.ts`, `/Users/josephkotvas/Sites/riffscore/src/services/PageLayoutService.ts`, `/Users/josephkotvas/Sites/riffscore/src/commands/TransposeSelectionCommand.ts`, `/Users/josephkotvas/Sites/riffscore/src/commands/LoadScoreCommand.ts`, `/Users/josephkotvas/Sites/riffscore/src/services/chord/ChordParser.ts`.

---

## Completeness Critique — under-weighted areas

The prior 17-dimension audit is genuinely thorough and its confirmed findings are well-evidenced; I did not find errors in its conclusions. My job here was the completeness critic, and the gaps cluster in INTERACTION/RENDERING-INTEGRATION paths and a few engraving fine-points that the dimension list (organized mostly around theory + static layout + export) systematically under-weighted. Highest-confidence NEW or materially-extended findings, all code-confirmed this session: 1. Page-view drag-to-select is broken by the same coordinate-space mismatch as the playback cursor, and the page-aware handler is an admitted no-op (ScoreCanvas.tsx:552-564 comment + notePositions built from scroll layout at :232-249). The audit found the cursor bug but not this distinct, equally user-facing one. 2. Chord-track playback desyncs from notes whenever a pickup measure exists, because the note timeline (TimelineService.ts:47-55) and chord scheduler (toneEngine.ts:158-159) use different measure-time models. The playback audit explicitly skipped pickup and called the system 'internally coherent.' 3. Mouse/click-to-place entry was never traced: getPitchForOffset is not clef-aware for alto/tenor (positioning.ts:141), cannot reach the top ledger zone (exact-key Map lookup vs OUTER_TOP clamp), and inherits the minor-key snap bug. 4. Single-note stems never lengthen toward the middle line for ledger-line notes (flat 44px in constants.ts:378), a real Gould violation the stems dimension missed. 5. MusicXML chord-kind degradation (CHORD_KIND_MAP omits 6/9/11/13/add/m6/mMaj7) - confirming the item both the chord-symbols and musicxml-export auditors deferred. Lower-confidence but worth a look: whole/half rest vertical anchoring was asserted-correct without a visual render and could be off by a space (baseline-dependent); time-sig glyph map breaks for multi-digit values (latent); accessibility/ARIA entirely unexamined; no final-barline/repeat barline modeling. I did not run new throwaway tests this session (relied on direct code reading with file:line), since every claim above is determinable from the source. The one item I'd most want executed before shipping a fix is the chord-vs-note pickup desync (item 2), which is the most clearly wrong-in-every-pickup-score and easiest to assert."

**Under-covered areas to fold into remediation:**

- **Mouse / click-to-place note entry (the entire pointer-driven entry path)** — The audit examined keyboard entry, MIDI entry, and the public API, and it noted that alto/tenor break 'inverse hit-detection' in the abstract, but it never traced the actual mouse-entry pipeline (useMeasureInteraction -> getPitchForOffset -> useHoverPreview -…
  - *Check:* Add tests that call getPitchForOffset for alto/tenor clefs and for offsets at the OUTER_TOP/OUTER_BOTTOM clamp extremes; assert mouse-derived pitch equals keyboard-derived pitch for the same staff position. Verify resol…
- **Page-view drag-to-select (lasso) coordinate mapping** — The page-view audit found the PLAYBACK CURSOR uses scroll-view X inside page SVGs, but it did not check drag-to-select, which has the identical and arguably worse bug. notePositions are built from layout.getX.measureOrigin + localX (the SCROLL-view continuous…
  - *Check:* Add an integration test asserting that a lasso rectangle over a known measure in page view selects exactly the notes rendered there. Make useDragToSelect page-aware (take the page's SVG ref and compute notePositions fro…
- **Chord-track playback timing vs pickup measures (two divergent measure-time models)** — The playback-timing audit asserted the timeline is 'internally coherent' via a shared secondsPerQuant and explicitly never examined pickup measures. But the NOTE timeline and the CHORD scheduler use different measure-time models. TimelineService builds measur…
  - *Check:* Build a score with an isPickup first measure plus a chordTrack entry on measure 1; assert the chord's scheduled startTime equals the note timeline's measureStartTimes[1]. Refactor the chord scheduler to consume the same…
- **Single-note stem length / ledger-line stem extension (engraving correctness)** — The stems-noteheads-ledger dimension validated stem DIRECTION, chord stem length spanning extremes, and ledger-line counts, but it did not check that a single note's stem length adapts to the note's distance from the staff. STEM.LENGTHS is a flat 44px for eve…
  - *Check:* Add a rule extending stem length toward the middle line for notes >= 1 ledger line from the staff, and lengthen stems for 32nd/64th notes per flag count; add assertions on stem endY for a high ledger-line note vs an in-…
- **MusicXML <harmony> chord-kind degradation (deferred by BOTH the chord and musicxml auditors)** — Both the chord-symbols and musicxml-export auditors explicitly flagged this as 'likely a real gap I did not run end-to-end.' Confirmed by code: musicXmlExporter.ts uses a SEPARATE CHORD_KIND_MAP (lines 84-96) that omits 6, 9, 11, 13, add9, m6, mMaj7, 7sus4, a…
  - *Check:* Drive generateMusicXML with Cmaj9, C6, Cadd9, Cm6, C7b9, Cm(maj7) and assert the emitted <kind>/<degree> elements preserve the extension; replace the ad-hoc CHORD_KIND_MAP with the canonical chord parser output and emit…
- **Print output paper-size / scale fidelity beyond the zoom-reset bug** — The page-view audit caught that viewport zoom (transform: scale) is never reset for print, which the print.css confirms (no transform reset anywhere in src/styles/print.css). But it could not run print preview and missed a second issue in the same file: @page…
  - *Check:* Declare an explicit @page { size } matching the layout's paper model, reset transform to none/scale(1) under @media print, and add a PrintService test asserting the prepared print DOM carries no residual zoom transform …
- **Rests as a first-class engraving/correctness domain (no dimension covered it)** — No audit dimension treated rests holistically. Open questions a careful engraver would still have: (1) whole-rest and half-rest vertical anchoring (Rest.tsx:27-39 places whole at baseY+lineHeight and half at baseY+2*lineHeight) depends on the SMuFL glyph's te…
  - *Check:* Snapshot/visually verify whole and half rest Y against staff lines for treble and bass; confirm a full-bar rest in 3/4 renders as a centered whole rest, and add tests for dotted rests.
- **Time-signature and tuplet-number GLYPH rendering for multi-digit / non-default values** — Not examined by any dimension. ScoreHeader.tsx:165,175 looks up TIME_SIG_DIGITS[timeSignature.split('/')[0]] but TIME_SIG_DIGITS (SMuFL.ts:113-126) only has single-character keys '0'..'9' plus common/cutCommon - so any two-digit numerator/denominator (12/8, 1…
  - *Check:* Add multi-digit time-signature numeral composition (and common/cut-common glyph support) plus a test for '12/8'; render tuplet ratios as 'n:m' when the ratio is not implied by the beat.
- **Accessibility / focus / ARIA for an embeddable widget** — No dimension covered accessibility at all, which is a real correctness/usability domain for an 'embeddable React' component. The score is rendered as SVG <text>/<rect> with onClick/onMouseDown handlers and no apparent ARIA roles, focus management, or keyboard…
  - *Check:* Audit ScoreCanvas/Measure/Note for role, aria-label, tabindex, and focus-visible handling; verify keyboard shortcuts work without a mouse and that selection state is announced.
- **Grand-staff measure-parity and per-staff pickup timing assumptions in playback** — The data-model audit flagged that nothing validates grand-staff measure-count/key/time parity, but it did not connect this to playback. TimelineService computes measureStartTimes from the FIRST staff only (TimelineService.ts:42-56) and applies them to every s…
  - *Check:* Either enforce grand-staff measure/duration parity in a structural validator, or compute measureStartTimes per staff; add a test with mismatched per-staff measure totals and assert the bass aligns to its own bars.

**Whole domains not examined (follow-up pass):**

- Mouse/pointer note entry (click-to-place pitch mapping, hover preview, ledger-zone reachability) - only keyboard/MIDI/API entry were audited
- Drag-to-select (lasso) geometry, especially in page view - LassoSelectCommand storage was read but the coordinate hit-testing in useDragToSelect and its page-view coordinate-space mismatch were not
- Rests as an engraving domain (rest vertical anchoring vs staff lines, full-bar rest in non-4/4, dotted/beamed rests, multi-measure rests)
- Single-note stem-length adaptation to pitch distance from staff and to flag count (Gould middle-line rule) - only stem direction and chord stem length were checked
- Time-signature numeral glyph rendering (multi-digit, common/cut-common) and tuplet n:m ratio display
- Chord-track playback synchronization with pickup measures (divergent measure-time models between TimelineService and the chord scheduler)
- MusicXML <harmony> chord-kind/extension fidelity end-to-end (deferred by both chord and musicxml auditors; now confirmed degraded)
- Print/PDF fidelity beyond the zoom-reset finding: paper-size (@page size) and browser rescaling of fixed-size page SVGs
- Accessibility/ARIA/focus management for the embeddable editor
- Web MIDI input device/channel handling and sustain/velocity semantics (entry side covered, but device lifecycle, channel filtering, and the consequence of feeding double-flat enharmonics from the chromatic-transpose bug to the Tone.js Sampler were not)
- Flag rendering correctness vs stem (flag glyph horizontal origin per direction, stem lengthening for 32nd/64th flag stacks)
- Barline TYPES (final thin-thick barline, double barline, repeats) as on-screen engraving - data model has none; only barline-crossing entry semantics were tested

---

## Refuted Findings (rejected by adversarial verification — recorded for honesty)

- **[playback-timing] setTempo during playback rescales note start times but not baked-in second durations** — *refuted:* The Tone.js mechanics the reviewer describes are correct in the abstract: durations are precomputed in absolute seconds (TimelineService.ts:96, `eventDurQuants * secondsPerQuant` with secondsPerQuant frozen at build-time bpm) and passed verbatim to triggerAttackRelease (toneEngine.ts:467, 525); if Transport.bpm.value were mutated live while a Tone.Part runs, onset spacing would rescale while bake…
- **[data-model-validation] LoadScoreCommand corrupts undo history on redo: execute() overwrites the saved previous state** — *refuted:* The code is correct; the finding rests on a false premise. The reviewer claims redo() re-runs execute() and re-captures previousScore as "whatever the current state is," which would be wrong "in a multi-step history." This ignores the linear undo/redo stack invariant that makes the re-capture idempotent. Mechanism (ScoreEngine.ts): undo() pops from history, calls command.undo(this.state), and pus…
- **[selection-navigation] Lasso/rectangular selection is purely geometric (glyph bbox intersection), so it cannot express a musical time-rectangle over irregular rhythms** — *refuted:* The code-level mechanics are accurately described: useDragToSelect.ts:77-92 (noteIntersectsRect) is a pure axis-aligned bounding-box test with zero time/onset logic, and notePositions (ScoreCanvas.tsx:232-249) feeds it per-note boxes whose width = hitZone.endX - hitZone.startX (the event slot width, centered on the head per scoreLayout.ts:130,145-151) and a fixed height of 20. So lasso IS geometr…

---

## Appendix A — All 109 Confirmed Findings

Compact index; full root-cause/fix narrative for each theme is in the phased plan above. **S** = silent (undocumented).

### Accidentals & enharmonics (8)

| Sev | Finding | Location | Impact | Doc |
|---|---|---|---|---|
| 🔴 | setAccidental/toggleAccidental API mutate note.accidental but never reflow note.pitch — n… | `src/hooks/api/modification.ts:400,421,478,505 (writes {acci…` | A consumer calling api.setAccidental('sharp') on a C sees and hears no change — the note stays C natural on screen and in playback. The onl… | S |
| 🔴 | MusicXML export omits <alter> and drops accidentals from every note pitch | `src/exporters/musicXmlExporter.ts:354-355 (step/octave extr…` | A note entered as F#4 (the normal case, accidental field null) exports as <pitch><step>F</step><octave>4</octave></pitch> with no <alter> a… | S |
| 🟠 | All minor key signatures silently break accidental logic (Key.majorKey('Em') returns empt… | `src/utils/accidentalContext.ts:28 (getKeyAccidental); src/s…` | In E minor (key signature shows 1 sharp, F#) every diatonic F#4 gets a redundant sharp glyph drawn on it, because scale.includes('F#') is f… | S |
| 🟠 | Double sharps/flats render as single accidental (semitone wrong) and are undocumented | `src/utils/accidentalContext.ts:14-15 (getEffectiveAccidenta…` | A stored B##4 (sounds C#/Db) is placed on the B staff line (correct) but draws a single sharp, reading as B# — a semitone too low visually,… | S |
| 🟠 | Cautionary accidental wrongly applied across octaves (F#4 forces a courtesy natural on F5) | `src/hooks/editor/useAccidentalContext.ts:59 and :62` | Measure in C major with F#4 then F5: the F5 (a different octave, never altered) gets a spurious courtesy natural drawn on it. Conversely th… | S |
| 🟠 | Note tied across a barline incorrectly re-shows its accidental at the new measure | `src/hooks/editor/useAccidentalContext.ts:22-89 (per-measure…` | An F#4 tied across a barline shows a new sharp on the tied (continuation) note at the start of the next measure. Standard practice (Gould) … | S |
| 🟡 | Rendered accidentals use Unicode music symbols (U+266F/D/E) instead of the SMuFL PUA glyp… | `src/hooks/editor/useAccidentalContext.ts:76-81 (symbolMap e…` | Note accidentals are drawn from different font glyphs than the key-signature and toolbar accidentals, with different design metrics, baseli… | S |
| 🟡 | Horizontal accidental spacing keys off note.accidental while the rendered glyph keys off … | `src/engines/layout/measure.ts:156,495; src/engines/layout/s…` | A normally-entered F#4 (accidental field null) renders a sharp glyph but the layout reserves no extra space for it (hasAccidental is false)… | S |

### Key signatures (5)

| Sev | Finding | Location | Impact | Doc |
|---|---|---|---|---|
| 🔴 | Minor keys produce no diatonic accidentals: every note entry and accidental-rendering dec… | `src/services/MusicService.ts:79 (needsAccidental), :131-132…` | In any minor key the staff is musically wrong: every diatonic accidental from the signature is printed again on every note (e.g. an E-minor… | — |
| 🟠 | Alto-clef key-signature accidentals are placed on the wrong staff lines/spaces (all 7 pos… | `src/constants.ts:147-166 (KEY_SIGNATURE_OFFSETS.alto). Cons…` | Any score in alto clef (e.g. viola parts) with a non-C key shows the key-signature accidentals scattered on incorrect lines and spaces — th… | S |
| 🟠 | Tenor-clef F# and G# key-signature accidentals are placed above the staff instead of on t… | `src/constants.ts:170-187 (KEY_SIGNATURE_OFFSETS.tenor.sharp…` | Tenor-clef scores (cello/bassoon upper register, trombone) in sharp keys render the F# and G# of the signature on the wrong lines (F# on a … | S |
| 🟠 | Mid-score key signature changes (and their cancellation naturals) are not modeled at all | `src/types.ts:41-45 (Measure interface: id/events/isPickup o…` | A user cannot notate a piece that modulates with a written key change (extremely common). Setting a new key retroactively rewrites the whol… | S |
| 🟡 | needsAccidental never emits double-sharp/double-flat and mislabels double-altered notes | `src/services/MusicService.ts:88-96 (needsAccidental) and sr…` | A double-sharp or double-flat note renders as an ordinary sharp/flat, changing the apparent pitch by a semitone and producing incorrect not… | S |

### Rhythm, tuplets & meter (7)

| Sev | Finding | Location | Impact | Doc |
|---|---|---|---|---|
| 🔴 | MusicXML export floors per-note tuplet duration, producing short/invalid measures | `src/exporters/musicXmlExporter.ts:331 (per-note Math.floor …` | Exported MusicXML opened in Finale/MuseScore/Sibelius shows measures that don't add up: the triplet group is too short, downstream notes sh… | S |
| 🟠 | Beaming hardcodes a quarter-note beat, breaking compound meter (6/8) beam grouping | `src/engines/layout/beaming.ts:66-69 (BEAT_QUANTS = CONFIG.q…` | Every 6/8 (or other compound) passage of eighth notes is beamed incorrectly — readers see 3×2 instead of 2×3, which misrepresents the metri… | S |
| 🟠 | addNote/addRest API uses hardcoded 64-quant capacity, overfilling non-4/4 measures | `src/hooks/api/entry.ts:144 (and the disagreeing handler at …` | Via the public API in 3/4 you can write a measure containing more beats than the time signature allows (e.g. a whole note in a 3/4 bar) wit… | S |
| 🟠 | reflowScore on time-sig change ignores tuplets and feeds float quants into integer breakd… | `src/utils/core.ts:74-86 (getBreakdownOfQuants), 94-101 (fla…` | Changing the time signature when the score contains tuplets yields measures whose totals are slightly short, tuplet brackets/ratios vanish … | S |
| 🟠 | DATA_MODEL.md documents a TupletInfo shape that does not match the code | `docs/DATA_MODEL.md:194-213 (documented shape {numNotes, inS…` | An integrator building a score from the documented data model creates tuplets with the wrong field names; duration math yields NaN (ratio u… | — |
| 🟠 | Gap/rest decomposition is greedy-largest-first and beat-agnostic, producing non-standard … | `src/utils/core.ts:74-86 (getBreakdownOfQuants); src/utils/e…` | After deletions or splits the engine can show a single rest/note that obscures the beat structure (e.g. a half rest straddling the middle o… | S |
| 🟡 | Double-dotted (and longer) durations are unrepresentable; ScoreEvent.dotted is a boolean | `src/types.ts:26 (ScoreEvent.dotted: boolean); src/utils/cor…` | Users cannot notate common double-dotted rhythms (e.g. baroque dotted style, dotted-quarter + sixteenth written as double-dotted). The edit… | S |

### Stems, noteheads & ledger (3)

| Sev | Finding | Location | Impact | Doc |
|---|---|---|---|---|
| 🔴 | Alto & tenor clefs render every common pitch at treble-clef vertical positions (leftover … | `src/engines/layout/positioning.ts:176-179 (early-return on …` | In alto clef the rendered C-clef sits on the middle line (C4=middle line) but a note entered as C4 draws a full third (36px / 3 staff steps… | S |
| 🟠 | Chords have no accidental-stacking/column algorithm; multiple accidentals overlap | `src/components/Canvas/Note.tsx:268 (accidentalX = noteX + L…` | A chord such as Eb-Gb-Bb or C#-E#-G# draws all accidentals stacked at the same X. With a 48px Bravura glyph and notes only 6-12px apart ver… | S |
| 🟡 | Augmentation dots in chords use a single shared shift and do not align in one vertical co… | `src/components/Canvas/Note.tsx:247,265 (noteX = x + xShift;…` | In dotted chords containing a second (or down-stem displacement), the augmentation dots are not vertically aligned — they form a ragged col… | S |

### Spacing, clefs & staff (7)

| Sev | Finding | Location | Impact | Doc |
|---|---|---|---|---|
| 🔴 | Tenor clef places every pitch a half-space too low (C4 on space3 instead of line 4) | `src/engines/layout/positioning.ts:134-136 (getPitchToOffset…` | In tenor clef every note is rendered one staff-position (a third) wrong relative to the lines — a reader sees the wrong pitch for every not… | — |
| 🟠 | Tenor C-clef glyph is drawn centered on line 2, not line 4 | `src/components/Canvas/ScoreHeader.tsx:52-54 (getClefY 'teno…` | The tenor clef symbol points its center at the wrong staff line, telling the reader middle C is on line 2 while the notes are engraved as i… | S |
| 🟠 | Grand-staff barlines are not connected through the system | `src/components/Canvas/Measure.tsx:53-77 (MeasureBarLine), :…` | In a piano/grand staff, barlines appear broken: a short tick on the top staff, a gap, a short tick on the bottom staff, instead of one cont… | S |
| 🟡 | Tuplet interior notes ignore the cross-staff sync grid (grand-staff alignment breaks for … | `src/engines/layout/measure.ts:345-398 (processTupletGroup);…` | In a grand staff (or any multi-staff system) where one staff has a tuplet and the other has notes/events that fall on the tuplet's interior… | S |
| 🟡 | No accidental collision avoidance or vertical stacking within a chord | `src/components/Canvas/Note.tsx:268 (fixed accidentalX = not…` | A chord with several accidentals on nearby noteheads (e.g. C#4/E#4/G#4, or two accidentals a second apart) renders all accidental glyphs st… | S |
| 🟡 | Mid-staff / mid-measure clef change is structurally unsupported | `Data model: src/types.ts:41-56 (Measure has only {id, event…` | Music that requires a clef change partway through a staff (extremely common in cello, bassoon, and keyboard writing — e.g. a bass-clef pass… | S |
| ⚪ | Non-integer tuplet quants used as Map/object keys and in exact-equality lookups | `src/engines/layout/system.ts:38,57,149,160; src/engines/lay…` | Latent: a single ULP of float drift between two accumulation paths makes findEventAtQuant return null (that staff contributes no width to t… | — |

### MusicXML export (7)

| Sev | Finding | Location | Impact | Doc |
|---|---|---|---|---|
| 🔴 | <alter> never emitted: every accidental-bearing note exports at the wrong pitch | `src/exporters/musicXmlExporter.ts:354-355 (step/octave pars…` | Catastrophic and pervasive: in MusicXML the sounding/MIDI pitch is step+octave+alter, so every sharp/flat/natural-by-key note exports a SEM… | S |
| 🔴 | Tuplet durations floored against divisions=16 do not sum to the beat (and can be 0) | `src/exporters/musicXmlExporter.ts:298 (hard-coded &lt;divis…` | Tuplet measures do not sum to divisions*beats, so Finale/Sibelius/MuseScore flag the measure as too short, shift following notes, or refuse… | S |
| 🔴 | Pitch alter, durations, tuplets, ties, dots, and divisions are entirely untested; no roun… | `src/__tests__/exporters/musicXmlExporter.test.ts (42 tests,…` | No safety net catches the alter/tuplet/order/pickup defects above; regressions in the most important export path go unnoticed. Users discov… | S |
| 🟠 | <tie> and <dot> emitted out of MusicXML content-model order | `src/exporters/musicXmlExporter.ts:338-344, 434-448` | Strict validating parsers (notably Finale, and schema validators) reject or partially drop notes whose children violate the ordering; MuseS… | S |
| 🟠 | Pickup (anacrusis) measure never marked implicit -> exports as a corrupt short measure | `src/exporters/musicXmlExporter.ts:292 (measure tag emission…` | Importers expect each measure (except implicit ones) to sum to the time signature. A non-implicit short first measure is flagged as incompl… | — |
| 🟠 | Grand staff exports as two independent parts, not one braced piano instrument | `src/exporters/musicXmlExporter.ts:242-289 (part-list loop a…` | The user who created a single braced grand-staff instrument gets two disconnected staves labelled 'Staff 1' and 'Staff 2' in MuseScore/Fina… | S |
| 🟡 | Global key/divisions written per part; per-staff key signature ignored | `src/exporters/musicXmlExporter.ts:225-229 (global fifths co…` | For transposing instruments or any score where staves legitimately differ in key, the export forces one key on all staves. For an empty sta… | S |

### ABC export (6)

| Sev | Finding | Location | Impact | Doc |
|---|---|---|---|---|
| 🔴 | Note natural by absolute pitch is not naturalized against a sharp/flat key signature | `src/exporters/abcExporter.ts:208-232 (formatNote) and :114 …` | Notes that are natural in the score are silently raised/lowered by a semitone in the exported ABC whenever the key signature alters that le… | S |
| 🟠 | No intra-measure accidental carry-over: a later natural after a sharp/flat on the same le… | `src/exporters/abcExporter.ts:147-245 (measure loop tracks o…` | Within a measure, any note that returns to natural (or changes accidental) after an earlier altered note of the same letter is played/print… | S |
| 🟠 | Quintuplet exports as bare (5 which means 5-in-2, not the intended 5-in-4 | `src/exporters/abcExporter.ts:199-201 (only `(${event.tuplet…` | Quintuplets — an explicit first-class toolbar feature — export with wrong timing: ABC plays/spaces them as 5 notes in the time of 2 of thei… | S |
| 🟡 | Double sharp/flat is downgraded to single when an accidental property is set | `src/exporters/abcExporter.ts:211-227 (formatNote). Related/…` | A double-sharp/double-flat note exports a semitone off (F## sounds G but exports as F#). Reachability is narrow because the standard accide… | S |
| 🟡 | Q: tempo field is emitted after K:, which ends the ABC tune header | `src/exporters/abcExporter.ts:110-116 (lines 114-115: K: pus…` | Usually benign (most players still read the tempo), but strict ABC tooling may misplace or ignore the tempo, and the header is technically … | S |
| 🟡 | No final barline (/]) emitted at end of tune | `src/exporters/abcExporter.ts:246-247 (unconditional `abc +=…` | The exported piece lacks a final barline; engraving convention (Gould) is that a piece ends with a thin-thick final barline. Cosmetic but v… | S |

### Chord symbols (9)

| Sev | Finding | Location | Impact | Doc |
|---|---|---|---|---|
| 🔴 | Normalization silently drops or flips extensions/alterations (Cmaj9 -> C9, C7b9 -> C7, C7… | `src/services/chord/ChordParser.ts:129-201 (normalizeChordSy…` | The user types a Cmaj9, C7b9, C7#9, or C7sus4 and the editor stores/displays/exports/plays a plainer, harmonically WRONG chord (dominant in… | S |
| 🟠 | Chord voicing discards the slash bass note — inversions never sound inverted | `src/services/chord/ChordVoicing.ts:23 (getChordVoicing stri…` | Every slash chord (C/E, Am/G, G/B, D/F#) plays back exactly like its root-position parent. The whole point of a slash chord — the specified… | S |
| 🟠 | Secondary dominants (V/V, V7/ii) fail to parse despite being a resolved requirement | `src/services/chord/ChordParser.ts:225-237 (slash branch run…` | A user entering Roman-numeral harmony cannot type the single most common chromatic chord, the secondary dominant (V/V, V/vi, etc.). They ge… | — |
| 🟠 | Roman/solfege conversion loses half-diminished and diminished markers; round-trips to gar… | `src/services/chord/ChordNotationConverter.ts:111-150 (toRom…` | Switching display to Roman numerals shows half-diminished chords as plain minor-sevenths (harmonically wrong analysis). If a user types a R… | S |
| 🟠 | fromRomanNumeral applies only case, not diatonic quality, so minor-key ii/vii resolve to … | `src/services/chord/ChordNotationConverter.ts:183-193 (fromR…` | Entering standard minor-key harmony in Roman numerals produces wrong chords: ii in a minor key becomes a minor triad rather than the diaton… | — |
| 🟠 | isMinorChord returns true for diminished chords, mislabeling them minor in solfege/Nashvi… | `src/services/chord/utils.ts:20-28 (isMinorChord). Consumed …` | In fixed-do and movable-do solfege display, diminished and half-diminished chords appear as minor (Do- instead of Do° / Do dim). The harmon… | S |
| 🟠 | Minor-major seventh (Cm(maj7), CmM7) fails to parse entirely | `src/services/chord/ChordParser.ts:261 (`.replace(/M7/g,'maj…` | A user cannot enter the minor/major-7 chord at all; they get 'Unrecognized chord'. It is a real, reasonably common chord and is neither sup… | S |
| 🟠 | Voicing assigns fixed octaves by chord-tone index, mis-voicing sus and any non-3rd-stacke… | `src/services/chord/ChordVoicing.ts:36-53` | Color chords (add9, 6, 13) play with unmusical spacing/voice-crossing; the register jump from oct3 third to oct4 fifth is a gap by design b… | S |
| 🟠 | Orphan detection only removes anchorless chords; surviving chords keep stale (measure,qua… | `src/services/chord/ChordQuants.ts:73-97 (findOrphanedChords…` | After common edits (changing a preceding note's duration, inserting/removing events), a chord can silently re-associate with a different be… | S |

### Selection & navigation (5)

| Sev | Finding | Location | Impact | Doc |
|---|---|---|---|---|
| 🔴 | Architecture doc's selection-repair useEffect does not exist; removing a staff orphans th… | `Missing repair: src/hooks/score/useSelection.ts (no useEffe…` | If the user has notes selected on the bass staff and switches to a single staff, the selection state still references staffIndex 1. getActi… | — |
| 🟠 | Chord-track DOWN navigation treats ChordSymbol.quant as global, but it is measure-local e… | `src/utils/navigation/vertical.ts:180-183 (within the chordT…` | A user editing chord symbols in, say, measure 4 selects a chord, presses Cmd+Down to jump to the note beneath it, and the cursor lands on (… | S |
| 🟠 | selectRangeTo across staves silently selects only the anchor staff (entire staff), droppi… | `Path: src/hooks/api/selection.ts:120-125 (selectRangeTo dis…` | Calling selectRangeTo from the anchor (treble, measure 0) to a target on the bass staff selects every note in the treble staff from the anc… | S |
| 🟡 | Vertical-extension per-slice anchors keyed by absolute quant time go stale after a quant-… | `src/commands/selection/ExtendSelectionVerticallyCommand.ts:…` | After pressing Shift+Up/Down to extend a vertical selection, then making an edit that shifts the selected notes' rhythmic position, the nex… | S |
| 🟡 | Cross-staff alignment and vertical-stack collection use exact-equality quant matching tha… | `src/utils/verticalStack.ts:155 (q === timeQuant in collectV…` | In a passage with tuplets, vertical (Cmd+Up/Down) selection extension or chord-symbol alignment over a tuplet note could intermittently fai… | — |

### Transposition (8)

| Sev | Finding | Location | Impact | Doc |
|---|---|---|---|---|
| 🟠 | Diatonic transpose (arrow keys) silently discards chromatic alterations | `src/services/MusicService.ts:167-196 (movePitchVisual) and …` | A user who entered F#4 and presses the down arrow expects E#4 (or at minimum a note retaining its 'raised by an accidental' character); ins… | S |
| 🟠 | Diatonic transpose + undo is not lossless for altered notes (sharp/flat permanently lost) | `src/commands/TransposeSelectionCommand.ts:247-255 (undo re-…` | The cardinal undo guarantee (undo restores the prior state exactly) is violated. A user nudges an F# up by accident, undoes, and is left wi… | S |
| 🟠 | Diatonic transpose preserves stale note.accidental override, corrupting MusicXML/ABC expo… | `src/commands/TransposeSelectionCommand.ts:172-175, 215-219,…` | Visually the note looks right (G natural) but the exported MusicXML/ABC says G#, and extra horizontal space is reserved for a non-existent … | S |
| 🟠 | Chromatic transpose() API produces nonsensical enharmonic spellings (multi-flats) | `src/commands/ChromaticTransposeCommand.ts:33-36 (Interval.f…` | Calling api.transpose(1) repeatedly (or transpose(3) on a sharp note) renders absurd noteheads with stacks of flats. A user transposing a m… | S |
| 🟠 | Transpose tests cover only natural-note happy path; no accidental, undo-of-altered, key-r… | `src/__tests__/MusicService.test.ts:221-261; src/__tests__/C…` | The silent accidental-destruction, lossy undo, export corruption, and enharmonic explosion all pass CI because no test exercises altered no… | S |
| 🟡 | transposeDiatonic() API ignores the score/staff key signature (hardcodes C) | `src/commands/TransposeSelectionCommand.ts:21 (key resolutio…` | On a staff whose keySignature is unset (relying on score-level keySignature), programmatic diatonic transposition produces C-major naturals… | S |
| 🟡 | TransposeSelectionCommand silently coerces /steps/==12 to a 7-step octave | `src/commands/TransposeSelectionCommand.ts:43-46 (coercion);…` | Programmatic transposeDiatonic(12) gives a surprising octave instead of moving 12 diatonic steps; the value 12 is unusable as a diatonic st… | S |
| 🟡 | Up-arrow in Cb major produces an enharmonically identical pitch (no audible/notational ri… | `src/services/MusicService.ts:167-196 (movePitchVisual) + ap…` | User in Cb major presses Up arrow and the note neither sounds higher nor visibly moves to the next staff position in a way that matches the… | S |

### Beaming (7)

| Sev | Finding | Location | Impact | Doc |
|---|---|---|---|---|
| 🟠 | 6/8 (compound meter) beams in groups of 2 instead of 3 — beat size is hard-coded to a qua… | `src/engines/layout/beaming.ts:66-69 (BEAT_QUANTS = CONFIG.q…` | Every 6/8 (and any compound) measure is beamed with the wrong rhythmic grouping. Six eighths in 6/8 display as three beamed pairs instead o… | S |
| 🟠 | Beat boundary uses the global fixed CONFIG.quantsPerMeasure (64), so 3/4 and 2/4 beat mat… | `src/engines/layout/beaming.ts:66; src/config.ts:104` | For 3/4 and 2/4 the result is currently visually correct by accident (quarter-note beats), but the model is wrong — there is no correct han… | S |
| 🟠 | Mixed-duration runs within a beat are never beamed (dotted-8th+16th, 8th+two-16ths) — gro… | `src/engines/layout/beaming.ts:55-57 (type-change break) and…` | Extremely common rhythms render incorrectly: a dotted-eighth–sixteenth (e.g. a dotted rhythm in 4/4) shows two separate flagged notes inste… | S |
| 🟠 | Beam grouping ignores tuplet membership; tuplets are beamed only by accidental beat-math … | `src/engines/layout/beaming.ts:38-74 (calculateBeamingGroups…` | Tuplet beaming is correct only by coincidence when the tuplet aligns to a quarter-note beat. Off-beat or non-quarter-aligned tuplets (e.g. … | S |
| 🟡 | Beam-group stem direction uses average note Y, not the 'majority' rule the docs claim nor… | `src/engines/layout/beaming.ts:126-127 (processBeamGroup). C…` | Beamed groups occasionally point their stems the wrong way (against both common-practice engraving and the documented behavior), producing … | — |
| 🟡 | Beam slope clamp (MAX_SLOPE = 1.0) is effectively no limit — allows ~45-degree beams seve… | `src/engines/layout/beaming.ts:178-189 (slope compute + clam…` | Beam groups with large pitch leaps render with extreme, steep slopes instead of the gentle, capped slopes used in real engraving, looking a… | S |
| 🟡 | Any rest unconditionally breaks the beam group (no beamed rests within a beat) | `/Users/josephkotvas/Sites/riffscore/src/engines/layout/beam…` | Rhythms where a beam should continue over an internal rest (very common in jazz/pop and syncopated figures) instead show isolated flagged n… | — |

### Ties / slurs (7)

| Sev | Finding | Location | Impact | Doc |
|---|---|---|---|---|
| 🟠 | Editor allows ties to a different pitch or to nothing (no same-pitch target validation) | `src/hooks/api/entry.ts:756-764 (toggleTie), src/hooks/api/e…` | A user can select C4 followed by D4 and press T; the model records tied:true on C4. The renderer (Staff.tsx:235-240 requires n.pitch===note… | S |
| 🟠 | Ties across a system/page break are not drawn on the continuation note (split-tie props a… | `src/components/Canvas/Staff.tsx:184-275 (renderTies; bail a…` | The single most common tie scenario after cross-barline — a tie that also happens to fall at a line/page break — renders as a stub arc into… | S |
| 🟠 | ABC export places the tie hyphen before the duration, producing malformed ABC | `src/exporters/abcExporter.ts:230-239 (formatNote returns `$…` | Exported ABC of any tied note fails to round-trip: ABC parsers (abcjs, abc2midi) will either drop the tie, mis-bind it, or error, so a tied… | S |
| 🟠 | MusicXML export tracks open ties by pitch with no adjacency check, causing spurious tie-s… | `src/exporters/musicXmlExporter.ts:286 (activeTies = new Set…` | Exported MusicXML can contain a tie that visually/aurally binds two notes several beats or measures apart that the composer never tied, or … | S |
| 🟠 | Time-signature change silently destroys all existing user ties | `src/utils/core.ts:94-101 (flattenMeasures), invoked from re…` | A user ties two half notes across a barline, then changes the time signature for any reason — the tie silently disappears and the two notes… | S |
| 🟡 | Slurs (different-pitch phrase marks) are entirely unsupported and not documented as a non… | `src/types.ts:13-19 (Note has only tied?); src/hooks/api/ent…` | Users cannot notate phrasing/legato slurs at all, and the absence is invisible — they may assume the tie tool doubles as a slur and create … | S |
| 🟡 | Tie curve direction is chosen from a single note's staff position only, ignoring stem dir… | `src/components/Canvas/Staff.tsx:243 (direction heuristic); …` | In chords and at the middle line, ties can be drawn on the stem side or collide with noteheads/flags rather than curving cleanly away from … | S |

### Page view & pagination (7)

| Sev | Finding | Location | Impact | Doc |
|---|---|---|---|---|
| 🟠 | Over-wide measure is compressed (stretchFactor < 1.0), violating 'never scale down a meas… | `src/services/PageLayoutService.ts:554-561 (calculateMeasure…` | Noteheads, accidentals and stems in a dense measure are crammed together and collide; the engraving looks broken and can become unreadable.… | S |
| 🟠 | Playback cursor uses scroll-view X coordinates inside page-view SVGs (wrong horizontal po… | `src/components/Canvas/ScoreCanvas.tsx:354-358 (unifiedCurso…` | During playback in page view the cursor is drawn far to the right of (and off) the page, not on the note being played. The follow-the-music… | S |
| 🟠 | Print/PDF output inherits the editor viewport zoom (transform: scale never reset for prin… | `src/components/Layout/ScoreEditor.tsx:362-370 (inline trans…` | Printing while zoomed (e.g. 150% to read details, or 60% to see the whole page) produces oversized/clipped or undersized PDF pages that no … | S |
| 🟠 | Ties spanning a system break render as a hanging stub, not a connected tie | `src/components/Canvas/Staff.tsx:175-275 (renderTies); :224-…` | A note tied across a system break shows a small dangling tie fragment at the right end of one system and nothing arriving at the start of t… | — |
| 🟡 | Page-layout lookup helpers only search page 0; measures on later pages return -1/null | `src/services/PageLayoutService.ts:757 (firstPageSystems = p…` | Any feature relying on usePageLayout.getSystem/getMeasureX for measures beyond the first page (e.g. measure X lookup, coordinate-based posi… | S |
| 🟡 | Empty score (or staves with no measures) renders a completely blank page view | `src/services/PageLayoutService.ts:418-420 (distributeSystem…` | A user who creates a new (empty) document and switches to page view sees a blank void with no page sheet, no title, and no place to begin —… | S |
| 🟡 | Metadata block height (title/composer) is fixed px and not multiplied by staffScale | `src/services/PageLayoutService.ts:265-318 (calculateMetadat…` | At non-default staff sizes the gap between the title block and the first system is visibly wrong (too large at small staff sizes, too tight… | S |

### Playback timing (5)

| Sev | Finding | Location | Impact | Doc |
|---|---|---|---|---|
| 🟠 | Public API play() never plays the chord track; only the UI hook does | `src/hooks/api/playback.ts:5,79-91 (calls scheduleTonePlayba…` | A consumer driving RiffScore via window.riffScore.get(id).play() hears no chord accompaniment, even though the score has a chord track and … | S |
| 🟠 | No tests for tuplet timing, compound-meter tempo, chord playback timing, or overlapping-d… | `Test-coverage gap is real across src/__tests__/TimelineServ…` | The most error-prone areas of playback (tuplet quantization, 6/8 beat unit, chord-track timing/duration capping, end-of-piece behavior) hav… | S |
| 🟡 | Playback completion fires off the last-STARTING note, cutting off longer overlapping notes | `src/engines/toneEngine.ts:476-477 (endTime computed from ev…` | On a grand staff (e.g. a whole note in the LH under four quarter notes / a final short note in the RH), the cursor disappears and the edito… | S |
| 🟡 | bpm always treated as quarter-note-per-minute; no time-signature beat unit (6/8 wrong tem… | `src/services/TimelineService.ts:29-30 (secondsPerQuant = (6…` | For a 6/8 score, a user setting bpm=120 expecting dotted-quarter=120 (the standard 6/8 beat) hears the eighth notes played as if quarter=12… | S |
| 🟡 | Non-integer triplet quants used as map keys / equality in cursor + start-offset logic | `Refuted parts: src/hooks/layout/useCursorLayout.ts:150 (qua…` | For tuplet passages the playback cursor can fall through the exact-match branch into the interpolation/fallback branch, and 'resume from ne… | S |

### Note entry & capacity (9)

| Sev | Finding | Location | Impact | Doc |
|---|---|---|---|---|
| 🟠 | Deleting an event leaves a metrically-invalid under-full measure (no rest backfill, no re… | `src/commands/DeleteEventCommand.ts:29-31 (raw splice, no re…` | Delete the 1st quarter of a 4/4 measure of four quarters and you get a measure containing only 3 quarter notes (48 of 64 quants). The remai… | S |
| 🟠 | Non-integer tuplet quants silently corrupt gap-fill, capacity, and breakdown arithmetic | `src/utils/core.ts:53 (getNoteDuration returns raw float), s…` | Whenever a tuplet is only partially present in a measure (e.g. a single triplet note, or a triplet plus normal notes), insertion-position, … | — |
| 🟠 | Lengthening a note's duration past remaining capacity silently does nothing | `src/hooks/editor/useModifiers.ts:149-167 (handleDurationCha…` | Select a quarter on beat 4 of a full 4/4 measure and press the half-note shortcut (or the dot key): the toolbar's active duration changes, … | S |
| 🟠 | MIDI entry always targets the last measure, ignores the cursor, and ignores measure capac… | `src/hooks/audio/useMIDI.ts:77 (targetMeasureIndex), :65-88 …` | Playing a MIDI keyboard always writes to the final measure, not where the cursor is, so users cannot edit earlier in the piece via MIDI. On… | S |
| 🟠 | makeTuplet validates only event count, not that the selection forms a clean tuplet, and n… | `src/hooks/api/entry.ts:588-672 (makeTuplet); src/commands/T…` | Make a triplet from a quarter + eighth + sixteenth: each is silently re-scaled by 2/3 (quarter->10.67, eighth->5.33, sixteenth->2.67) givin… | S |
| 🟡 | Interactive INSERT into the middle of a measure has no displacement/overflow handling | `src/hooks/note/useNoteEntry.ts:184-274; contrast src/hooks/…` | Click to insert a note in the middle of a full measure: nothing happens, or the note silently appears at the start of a brand-new measure a… | S |
| 🟡 | MIDI entry always spells black keys as sharps, ignoring key signature | `src/services/MusicService.ts:27 (midiToPitch); src/engines/…` | In a flat key (e.g. Eb major) MIDI-entering the note Db sounds correct but is written as C#, producing wrong, non-diatonic spelling that a … | S |
| 🟡 | addTone/chord build dedupes only on exact pitch string; enharmonic unisons and ordering a… | `Dedup: src/commands/AddNoteToEventCommand.ts:18 (exact stri…` | A chord can silently contain two noteheads on the same line/space with conflicting accidentals (C# and Db), which is not valid notation and… | S |
| 🟡 | Append/default entry pitch is hardcoded C4 regardless of clef | `src/utils/navigation/previewNote.ts:49,52 (the C4 fallback)…` | Starting note entry on an empty bass-clef staff (or after a rest) defaults the cursor/preview to middle C, which sits above the bass staff … | S |

### Data model & validation (9)

| Sev | Finding | Location | Impact | Doc |
|---|---|---|---|---|
| 🟠 | chordTrack is never re-anchored when measures are inserted/deleted, time signature change… | `src/commands/MeasureCommands.ts:12-110 (AddMeasureCommand.e…` | After inserting a bar before a chord, every harmonic symbol shifts one bar to the right (now over the wrong beat). After deleting a bar, ch… | S |
| 🟠 | Overfull/underfull measures pass silently: capacity checks live only in UI hooks, not in … | `REAL gaps: src/hooks/api/io.ts:29-41 (loadScore -> LoadScor…` | A consumer using the imperative API (or any future code path that dispatches AddEventCommand directly) can stuff 5 quarter notes into a 4/4… | S |
| 🟠 | Tuplet events store non-integer quants that float-drift capacity math and are floored in … | `MusicXML defect (real): src/exporters/musicXmlExporter.ts:3…` | Every exported MusicXML file containing triplets (or any tuplet whose member duration isn't divisible by the ratio) has measures that are r… | — |
| 🟠 | Public loadScore() stores the raw object without migration or validation; only initial mo… | `src/hooks/api/io.ts:29-41 (loadScore), src/commands/LoadSco…` | Round-tripping is broken: a score exported by an older version, or any object whose chordTrack uses the old global-quant schema, loads with… | S |
| 🟠 | JSON export exists but there is no JSON import/parse — JSON is not a true round-trip form… | `src/exporters/jsonExporter.ts:3-5 (stringify-only, no impor…` | A consumer cannot reliably persist and reload a composition through the library's own API: there is no validated load-from-JSON, so malform… | S |
| 🟠 | makeTuplet/ApplyTupletCommand applies a ratio across mixed-duration events and infers bas… | `src/hooks/api/entry.ts:588-661, src/commands/TupletCommands…` | A user can form a 'triplet' from notes of differing durations; the resulting group has an incoherent total duration, renders with a wrong b… | S |
| 🟠 | DATA_MODEL.md documents a TupletInfo type that does not exist in code (numNotes/inSpaceOf… | `docs/DATA_MODEL.md:69,194-213 (TupletInfo) and 124-134 (Cho…` | Indirect: developers integrating via the documented data model produce tuplet/chord objects the engine cannot interpret, leading to NaN/0 d… | — |
| 🟠 | No validation of ID uniqueness or grand-staff measure-count/key/time parity; createId tru… | `Real, higher-severity locus: src/commands/LoadScoreCommand.…` | On id collision, selecting/deleting one note can hit the wrong event. A loaded grand staff with unequal measure counts renders misaligned s… | S |
| 🟡 | Grand→single 'merge' mode is documented but never implemented — converting to single staf… | `src/commands/SetSingleStaffCommand.ts:4-48 (false doc comme…` | A user with a grand staff (e.g. melody in treble, bass line in bass) who collapses to a single treble staff silently loses the entire bass … | — |
