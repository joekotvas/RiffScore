# Issue tracking

Updated 2026-09-18 against the released alpha.18 core.

Reusable editor, notation, import/export, API, package and library documentation work belongs in this tracker. Website branding and product-specific presentation are managed separately.

## Working rules

- The [active tracker](https://github.com/joekotvas/RiffScore/issues) is the source of truth for remaining work.
- `needs-verification` means the reported behavior or remaining acceptance criteria need confirmation against the current release. It is not a claim that every older reproduction still fails.
- `tracking` issues coordinate related work; linked focused issues own their specific fixes.
- `priority: high` identifies input/data-loss cases to investigate first. No obsolete release dates or assignments were copied forward.
- New issues, documentation and cross-references link only to active repositories. Historical numeric references in older release/design records are plain text.
- Before closing an issue, record the relevant behavior-level evidence and account for all remaining acceptance criteria.
- Pull requests use regular merge commits, never squash merges.

## Current backlog

| Issue | Labels |
|---|---|
| [Expand interactive browser coverage beyond the alpha.18 smoke suite](https://github.com/joekotvas/RiffScore/issues/5) | enhancement, needs-verification |
| [Review critical-path coverage and close meaningful branch gaps](https://github.com/joekotvas/RiffScore/issues/6) | enhancement, needs-verification |
| [Feature: Slurs - data structure, input, rendering, editing, and export](https://github.com/joekotvas/RiffScore/issues/7) | enhancement |
| [Feature: Simple dynamics (ppp to fff)](https://github.com/joekotvas/RiffScore/issues/8) | enhancement |
| [Feature: Changing dynamics (crescendo/diminuendo)](https://github.com/joekotvas/RiffScore/issues/9) | enhancement |
| [Add an editable tempo marking to the score canvas](https://github.com/joekotvas/RiffScore/issues/10) | enhancement |
| [Feature: Playback option to emphasize topmost note in chords](https://github.com/joekotvas/RiffScore/issues/11) | enhancement |
| [Feature: Rhythmic playback - beat emphasis and swing](https://github.com/joekotvas/RiffScore/issues/12) | enhancement |
| [Staff management, labels and per-staff instruments/velocity](https://github.com/joekotvas/RiffScore/issues/13) | enhancement |
| [Feature: In-line key signature changes](https://github.com/joekotvas/RiffScore/issues/14) | enhancement |
| [Feature: In-line time signature changes](https://github.com/joekotvas/RiffScore/issues/15) | enhancement |
| [Feature: Repeats - barlines, endings, D.C./D.S., playback](https://github.com/joekotvas/RiffScore/issues/16) | enhancement |
| [Feature: Lyrics with syllable alignment and multi-verse support](https://github.com/joekotvas/RiffScore/issues/17) | enhancement |
| [Feature: Add string synth instrument](https://github.com/joekotvas/RiffScore/issues/18) | enhancement |
| [Feature: Copy, Paste, and Cut notes](https://github.com/joekotvas/RiffScore/issues/19) | enhancement |
| [Feature: Drag notes horizontally to reorder](https://github.com/joekotvas/RiffScore/issues/20) | enhancement |
| [Ignore leading/trailing rests when choosing tuplet bracket slope](https://github.com/joekotvas/RiffScore/issues/21) | enhancement, needs-verification |
| [Add quant-based range selection and content inspection API](https://github.com/joekotvas/RiffScore/issues/22) | enhancement |
| [Implement read() and write() API methods](https://github.com/joekotvas/RiffScore/issues/23) | enhancement |
| [Whole rest handling improvements](https://github.com/joekotvas/RiffScore/issues/24) | bug, needs-verification |
| [Hide/show notes and rests](https://github.com/joekotvas/RiffScore/issues/25) | bug, needs-verification |
| [Standalone build for non-React sites (UMD bundle)](https://github.com/joekotvas/RiffScore/issues/26) | enhancement |
| [Implement runtime chord display and playback configuration setters](https://github.com/joekotvas/RiffScore/issues/27) | bug, needs-verification |
| [Architectural: Unify Fail-Fast vs Fail-Soft Patterns in Commands and API Layer](https://github.com/joekotvas/RiffScore/issues/28) | enhancement, needs-verification |
| [Improve Test ID Robustness and Naming Conventions](https://github.com/joekotvas/RiffScore/issues/29) | enhancement |
| [Reduce Coordinate Sensitivity in Hit-Detection Tests](https://github.com/joekotvas/RiffScore/issues/30) | enhancement, needs-verification |
| [Improve slash chord validation in MusicXML exporter](https://github.com/joekotvas/RiffScore/issues/31) | bug, enhancement, needs-verification |
| [Simplify event cloning using structuredClone](https://github.com/joekotvas/RiffScore/issues/32) | bug, needs-verification |
| [Refactor UpdateChordCommand to avoid parameter mutation](https://github.com/joekotvas/RiffScore/issues/33) | bug, needs-verification |
| [Cursor input recognition failure near left barline of empty measures](https://github.com/joekotvas/RiffScore/issues/34) | bug, needs-verification |
| [Improve chord navigation boundary test coverage](https://github.com/joekotvas/RiffScore/issues/35) | bug, needs-verification |
| [Add an optional drag handle for editor viewport height](https://github.com/joekotvas/RiffScore/issues/36) | enhancement |
| [Complete production-output oracle and mutation-test coverage](https://github.com/joekotvas/RiffScore/issues/37) | enhancement, needs-verification |
| [Design an exact internal rhythmic grid for tuplets](https://github.com/joekotvas/RiffScore/issues/38) | enhancement |
| [Add independent property coverage for key-aware transpose spelling](https://github.com/joekotvas/RiffScore/issues/39) | enhancement, needs-verification |
| [Verify and improve tuplet-within-beat beaming](https://github.com/joekotvas/RiffScore/issues/40) | enhancement, needs-verification |
| [Validate production exports against the full MusicXML 4.0 schema in CI](https://github.com/joekotvas/RiffScore/issues/41) | enhancement |
| [Toolbar: accidental display-policy control (force / hide / courtesy)](https://github.com/joekotvas/RiffScore/issues/42) | enhancement |
| [Define read-only presets and align the public configuration surfaces](https://github.com/joekotvas/RiffScore/issues/43) | enhancement |
| [Finish meter-capacity consistency in legacy chord migration and validation](https://github.com/joekotvas/RiffScore/issues/44) | enhancement |
| [Re-anchor chord symbols by absolute musical time when changing meter](https://github.com/joekotvas/RiffScore/issues/45) | enhancement |
| [Unify selection state + op "possibility" (affordance) layer; expose dry-run capability queries in the API](https://github.com/joekotvas/RiffScore/issues/46) | enhancement |
| [Tuplet-fill entry leaves the new note unselected (selection resolves against stale React score)](https://github.com/joekotvas/RiffScore/issues/47) | bug, needs-verification |
| [Export emits a tie spanning a rest from an under-full bar (MusicXML & ABC)](https://github.com/joekotvas/RiffScore/issues/48) | bug, needs-verification |
| [Verify single-step undo for interactive entry across a barline](https://github.com/joekotvas/RiffScore/issues/49) | bug, needs-verification |
| [Verify remaining entry, reflow and structural edge cases](https://github.com/joekotvas/RiffScore/issues/50) | enhancement, needs-verification, tracking |
| [Keyboard ghost cursor doesn't auto-advance after a full-bar rollover (both rollover paths)](https://github.com/joekotvas/RiffScore/issues/51) | bug, needs-verification |
| [Preserve chord extensions and alterations during input normalization](https://github.com/joekotvas/RiffScore/issues/52) | bug, needs-verification |
| [Chord voicing uses fixed octaves and discards the slash bass (inversions never sound)](https://github.com/joekotvas/RiffScore/issues/53) | bug, needs-verification |
| [Tuplet apply overwrites existing tuplet members (no re-tuplet guard)](https://github.com/joekotvas/RiffScore/issues/54) | bug, needs-verification |
| [Enforce coverage collection and thresholds in the CI merge gate](https://github.com/joekotvas/RiffScore/issues/55) | bug, needs-verification |
| [Track remaining chord theory, input and symbol-fidelity gaps](https://github.com/joekotvas/RiffScore/issues/56) | bug, needs-verification, tracking |
| [Track remaining public API result and synchronous-state defects](https://github.com/joekotvas/RiffScore/issues/57) | bug, needs-verification, tracking |
| [Finish page-layout metadata scaling and coordinate lookup cleanup](https://github.com/joekotvas/RiffScore/issues/58) | bug, needs-verification |
| [Define tempo beat units and verify overlapping playback completion](https://github.com/joekotvas/RiffScore/issues/59) | bug, needs-verification |
| [Track remaining engraving and selection-anchor polish](https://github.com/joekotvas/RiffScore/issues/60) | bug, needs-verification, tracking |
| [Track remaining notation-model and validation gaps](https://github.com/joekotvas/RiffScore/issues/61) | enhancement, needs-verification, tracking |
| [Improve MIDI device handling, musical spelling and entry targeting](https://github.com/joekotvas/RiffScore/issues/62) | bug, needs-verification, tracking |
| [Harden editor registry focus and duplicate-bundle ownership](https://github.com/joekotvas/RiffScore/issues/63) | bug, needs-verification |
| [Resolve documentation claims and tests that do not verify production behavior](https://github.com/joekotvas/RiffScore/issues/64) | documentation, needs-verification, tracking |
| [Disclose content removal when reducing a populated score to one staff](https://github.com/joekotvas/RiffScore/issues/65) | bug, needs-verification |
| [Toolbar/keyboard: no way to insert a measure at a position — "Add Measure" only appends at the end](https://github.com/joekotvas/RiffScore/issues/66) | enhancement |
| [Support duration-first tuplet entry using available rhythmic capacity](https://github.com/joekotvas/RiffScore/issues/67) | enhancement |
| [Brace spans every staff: no instrument grouping (piano brace vs string bracket)](https://github.com/joekotvas/RiffScore/issues/68) | enhancement |
| [API: malformed score structure corrupts loadScore state and throws through JSON import](https://github.com/joekotvas/RiffScore/issues/69) | bug, needs-verification, priority: high |
| [API: addNote/addRest accept invalid duration strings and poison later export](https://github.com/joekotvas/RiffScore/issues/70) | bug, needs-verification, priority: high |
| [API: reset depends on React timing and preserves conflicting metadata/key state](https://github.com/joekotvas/RiffScore/issues/71) | bug, needs-verification |
| [API: setScoreTitle reports success but cannot rename a score with metadata.title](https://github.com/joekotvas/RiffScore/issues/72) | bug, needs-verification |
| [Keep API playback results consistent when an asynchronous start is cancelled](https://github.com/joekotvas/RiffScore/issues/73) | bug, needs-verification |
| [Make the packaged stylesheet setup contract consistent across all examples](https://github.com/joekotvas/RiffScore/issues/74) | documentation, needs-verification |
| [ABC round trip silently loses copyright metadata without copyright-like keywords](https://github.com/joekotvas/RiffScore/issues/75) | bug, needs-verification |
| [Export: chord symbols anchored only to a lower staff are silently omitted from ABC and MusicXML](https://github.com/joekotvas/RiffScore/issues/76) | bug, needs-verification, priority: high |
| [Reconcile runnable cookbook recipes and API semantics with the current release](https://github.com/joekotvas/RiffScore/issues/77) | documentation, needs-verification |
| [Feature: represent multiple independent rhythmic voices on one staff](https://github.com/joekotvas/RiffScore/issues/78) | enhancement |

## Reconciled shipped work

ABC/MusicXML import, page view and print, MusicXML minor-major-seventh mapping, pickup-aware chord playback, horizontal API navigation context and synchronous exports are already delivered. See the [changelog](../CHANGELOG.md) and [alpha.18 QA](./ALPHA18_QA.md).

The remaining tuplet-entry reports share one issue; altered-chord normalization reports share one issue; export follow-ups are tracked as focused data-loss/schema issues. Partial work remains explicit: read-only preset design, legacy meter migration, cancellation result semantics and consumer stylesheet documentation are still tracked.
