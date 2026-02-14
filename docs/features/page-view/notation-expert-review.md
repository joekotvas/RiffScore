# Notation Expert Review: Page View PRD

**Date:** 2026-02-14
**Status:** Advisory (Non-Binding)

> **Note:** These recommendations represent third-party expert feedback on traditional music notation and typesetting best practices. They are advisory in nature and do not constitute binding requirements. The product team should evaluate each recommendation against project scope, timeline, and user priorities.

---

## Summary

The PRD captures core requirements well. The recommendations below address gaps from a traditional engraving perspective, prioritized by user impact.

---

## High Priority Recommendations

### 1. First System Indentation

**Issue:** Traditional engraving indents the first system to leave space for title/composer placement. This is universal practice in published music.

**Recommendation:**
```
FR-NEW: The first system SHALL be indented (default ~15-20% of page width)
to accommodate title placement above.
```

### 2. Measure Numbers

**Issue:** Users expect measure numbers at the start of each system. Essential for rehearsal, teaching, and referencing specific passages.

**Recommendation:**
```
FR-NEW: Measure numbers SHALL appear at the start of each system
(above the top staff, left-aligned with the first barline).
```

---

## Medium Priority Recommendations

### 3. System Justification (Ragged Last System)

**Issue:** The PRD doesn't specify whether systems should stretch to fill page width. Standard practice: justify all systems except the last.

**Recommendation:**
```
FR-NEW: Systems SHALL be horizontally justified to fill the content width,
EXCEPT the final system which MAY render at natural width if less than 60% full.
```

### 4. Courtesy/Cautionary Signatures

**Issue:** When key or time signature changes at a system break, the change should preview at the end of the preceding system.

**Recommendation:**
```
FR-NEW: When a key or time signature change occurs at the start of a system,
a courtesy signature SHALL appear at the end of the previous system.
```

---

## Lower Priority Recommendations (Future Consideration)

### 5. Cautionary Accidentals

When an accidentalized note appears at end of system and same pitch appears at start of next system, a courtesy accidental is standard practice. May defer to future enhancement.

### 6. Measure Density Constraints

Without limits, very short pieces might have 1-2 measures per system (sparse), or dense pieces might cram 12+ measures (cramped). Target 3-6 measures per system for typical music.

### 7. Pickup Measure Handling

Pickup measures (anacrusis) at system start should not take full measure width; partial width is standard.

---

## Refinements to Existing Requirements

### FR-06 (System Breaks)

> "Prefer breaks at natural phrase boundaries when possible"

**Concern:** This is aspirational but extremely difficult to implement automatically without musical analysis (phrase detection requires understanding melodic contour, harmonic rhythm, etc.).

**Recommendation:** Remove or defer to "Out of Scope." A simple greedy fill algorithm is perfectly acceptable for v1 and matches behavior of most notation software.

### NFR-04 (Professional Standards)

> "Printed output SHALL match professional engraving standards"

**Concern:** This is vague and potentially sets unrealistic expectations.

**Recommendation:** Soften to: "Printed output SHALL follow conventional music engraving proportions and spacing guidelines."

---

## Open Questions - Expert Recommendations

| # | Question | Recommendation |
|---|----------|----------------|
| 1 | Show page boundaries? | **Yes** - Users expect WYSIWYG for print. Show subtle page outline. |
| 2 | Very wide measures? | Allow measures to exceed "ideal" width. If single measure >50% of system width, give it own system. Never scale down individual measures. |
| 3 | Per-score or global config? | **Per-score** for page size. Global defaults with per-score override. |
| 4 | Measure exceeds page? | Scale entire score proportionally. Alert user. Rare but must handle gracefully. |

---

## Additional Considerations

### Scope Additions Worth Considering for v1

These are small additions with high user value:

1. **Score title on first page** - Already have title field; ensure it renders in print
2. **Composer/arranger line** - Simple text field below title
3. **Copyright footer** - Common requirement for educational/published work

### Out of Scope (Confirmed)

These are correctly excluded from v1:
- Manual system break placement
- Multi-measure rests
- Page numbers and headers/footers
- Part extraction
- Coda/segno indicators

---

## References

- Elaine Gould, *Behind Bars: The Definitive Guide to Music Notation* (2011)
- Ted Ross, *Teach Yourself the Art of Music Engraving and Processing* (1987)
- Kurt Stone, *Music Notation in the Twentieth Century* (1980)
