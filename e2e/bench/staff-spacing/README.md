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

## Baseline numbers (staff px at 100%; positive = overlap)

`beams-in-gap` and `beams-in-gap-chords` measure identically:

| Bar | Treble beam bottom | Bass beam top | Overlap |
| --- | ------------------ | ------------- | ------- |
| 1   | 172.6              | 161.5         | 11.1    |
| 2   | 166.5              | 161.5         | 5.1     |
| 3   | 180.5              | 153.5         | 26.9    |

(The first version of this table was in the scroll view's 75%-scaled screen px; these are the
same measurements in staff px.) The treble staff's top line is at y = 80 and its bottom line at
128; with the fixed 120 px distance the bass top line sat at 200.

## After content-aware staff spacing

| Bar | Treble beam bottom | Bass beam top | Overlap |
| --- | ------------------ | ------------- | ------- |
| 1   | 172.6              | 200.4         | −27.8   |
| 2   | 166.5              | 200.4         | −33.9   |
| 3   | 180.5              | 192.5         | −12.0   |

The bass staff moved down by the shortfall of the worst bar (bar 3) so that bar clears by exactly
`STAFF_DISTANCE.MIN_CLEARANCE` (12 px); in page view the same happens per system, so systems
without such content keep the default distance.

## Re-measuring

```bash
npm run demo:dev            # in one terminal
node e2e/bench/staff-spacing/measure.mjs after
```

`measure.mjs` prints the table above for the current code and writes `after/*.png` next to
`before/`. The target for the spacing work is overlap ≤ 0 in every bar (a clear gap of at least
one staff space is the engraving norm) without moving staves that do not need it.
