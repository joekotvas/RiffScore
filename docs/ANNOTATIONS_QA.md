# Annotation presentation QA — alpha.19 candidate

Scope: generic view-only notehead labels and ordered text lanes. Educational naming systems remain outside core. No release or package publication is part of this change.

## Architecture and correctness

- Frozen callback facts contain copied primitive musical data, never live score objects.
- Preparation projects reserved row counts into a view score; the engine document/history are untouched.
- Text widths join the existing multi-staff quant-grid constraints, including accidental/second-interval offsets and first/last margins. No second spacing engine.
- Event rows use the owning staff's event geometry, including rest events; notehead labels do not change hit targets or stem attachment.
- Shared vertical layout reserves stacked rows after any lyric bands; page layout uses per-system baselines and includes rows in page packing.
- Unannotated engraving is unchanged. Headless theory exports preserve written pitch identity.

## Evidence

- Unit suite: 218 suites, 3,877 tests, 87 existing snapshots.
- Targeted tests cover detached data, no document mutation, staff scope, stacked chords, lyric reservations, duplicate row IDs, rest callbacks, cross-staff spacing, accidental-aware label clearance, page breaks/staff scale and written pitch facts.
- Existing browser QA: 33 scenarios across desktop Chromium and mobile Chromium/WebKit.
- Packed extension consumer: 51 scenarios across desktop Chromium, Pixel and iPhone WebKit, including 15 teaching scenarios. Editing/undo, atomic transposition, minor-convention switching, view-only toggling, lane collisions, bounded head text, axe accessibility, mobile scrolling and page/print rendering are covered.
- Isolated production Next.js and Vite builds consume tarballs without source aliases. Enlarged visual review covers filled, half and whole heads. Print PDFs and print-media screenshots were generated.

## Deliberate limits

Short notehead text is compact; prefer below-staff rows at small display sizes. Labeled hollow heads use a thin outlined oval within the standard head envelope to keep staff lines out of the text. Text rows are fixed-width rather than arbitrary HTML or music-font glyphs. Explicit viewport bounds can crop them. Annotation values are absent from document exports and remain visible in browser printing. This adds no editable lyric model, educational conventions, shape-note mapping, pitch-color mapping or rhythm syllable rules to core.
