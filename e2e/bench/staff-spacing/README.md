# Staff-spacing benchmark

Baseline for **content-aware staff spacing**: today the distance between the staves of a grand
staff is fixed (`CONFIG.staffSpacing`, 120 px at 100%), so beams that both staves push into the
inter-staff gap can overlap. These scores make that happen on purpose; the `before/` images are
the state as of dev `7b1d7f9` (after PR #312, which bounds stem lengths in wide groups).

| Score                      | What it exercises                                                                                                                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `beams-in-gap.json`        | Treble stems-down wide groups (C6 over C4/D4) against bass stems-up wide groups (C2 under G3/B3) on the same beats, eighths and sixteenths; bar 3 is the worst case (two-octave leaps in both staves).   |
| `beams-in-gap-chords.json` | The same music with chord symbols. Chord symbols sit above the treble staff, so they do not enter the gap; the variant records that the chord track must stay clear once staff distance becomes dynamic. |

Lyrics are not in the model yet (roadmap #30). When they land they belong below the treble staff,
i.e. exactly in this gap, so a lyrics variant of this score should be added then.

## Baseline numbers (svg units at 100%; positive = overlap)

`beams-in-gap` and `beams-in-gap-chords` measure identically:

| Bar | Treble beam bottom | Bass beam top | Overlap |
| --- | ------------------ | ------------- | ------- |
| 1   | 129.4              | 121.1         | 8.3     |
| 2   | 124.9              | 121.1         | 3.8     |
| 3   | 135.4              | 115.1         | 20.2    |

The bass staff's top line is at y = 200 (treble bottom line 128, gap 72); a treble beam bottom
past ~188 would touch the bass staff itself.

## Re-measuring

```bash
npm run demo:dev            # in one terminal
node e2e/bench/staff-spacing/measure.mjs after
```

`measure.mjs` prints the table above for the current code and writes `after/*.png` next to
`before/`. The target for the spacing work is overlap ≤ 0 in every bar (a clear gap of at least
one staff space is the engraving norm) without moving staves that do not need it.
