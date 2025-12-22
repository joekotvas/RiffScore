# Phase 6B: Custom Staves & Alto Clef Support

## Goal
Establish general readiness for custom staves and non-standard clefs.
1.  **Entry Logic Reliability**: Ensure entry methods work on any valid staff index (1, 3+, etc.).
2.  **Alto Clef Support**: Implement the Alto clef (moveable C-clef) as a first-class option in the UI and rendering engine.
3.  **Engine Robustness**: Ensure pitch calculations respecting the "Middle C" position are dynamic and not hardcoded to Treble/Bass.

## Standards & Quality
**Strict adherence to project standards is required:**

1.  **Inline Documentation** (from `docs/CONTRIBUTING.md`):
    -   All new functions and methods must have JSDoc.
    -   Complex logic must have explanatory comments.
    -   Use `@tested` annotation to link implementation to tests.

2.  **Testing** (from `docs/TESTING.md`):
    -   **100% Coverage**: All new or modified logic must be fully covered by tests.
    -   **Strict Typing**: No `any` or `unknown` types allowed.
    -   **No Lint Errors**: Code must pass `npm run lint` with zero warnings.

## Workflow
1.  **Setup**: Create feature branch `feature/phase-6b-custom-staves`.
2.  **Reproduction**: Create failing tests first (TDD).
3.  **Implementation**:
    -   **Data**: Define types and constants.
    -   **Logic**: Update engine calculations.
    -   **UI**: Update rendering components.
4.  **Verification**: ensure all tests pass with 100% coverage.
5.  **Wrap-up**:
    -   Create `walkthrough.md`.
    -   Create ADR (if architectural decisions warrant it).
    -   Update `docs/migration/progress.md`.

## Proposed Strategy

### 1. Reproduction Test
Create `src/__tests__/ScoreAPI.customStaves.test.tsx` to assert failures for:
- Adding notes to a single-staff score (currently fails).
- Adding notes to a 3rd staff (currently fails).
- Rendering Alto clef (currently fails compile).

### 2. Data Model & Types
#### [MODIFY] [constants.ts](file:///Users/josephkotvas/Sites/Riffs/riffeasy/riffscore/src/constants.ts)
- Add `'alto'` to `CLEF_TYPES`.
- Define `KEY_SIGNATURE_OFFSETS` for Alto (C-clef centered on 3rd line).

#### [MODIFY] [types.ts](file:///Users/josephkotvas/Sites/Riffs/riffeasy/riffscore/src/types.ts)
- Update `Staff` interface `clef` property to allow `'alto'`.

### 3. Logic & Engine
#### [MODIFY] [src/utils/clef.ts] (or related entry utils)
- Ensure pitch-to-y calculation handles the Alto clef offset correctly. Middle C (C4) should be on the middle line (0 offset).

#### [MODIFY] [src/hooks/useSelection.ts]
- Audit validation logic to ensure it doesn't reject selections on staves indices that exist in `score.staves` but might be outside the default 0-1 range.

#### [MODIFY] [src/utils/entry/*.ts]
- Update `addNote`/`addRest` helpers to check `score.staves[index]` existence dynamically.

### 4. UI Implementation
#### [MODIFY] [ClefIcon.tsx](file:///Users/josephkotvas/Sites/Riffs/riffeasy/riffscore/src/components/Assets/ClefIcon.tsx)
- Add SVG path for the C-clef.

#### [MODIFY] [ClefOverlay.tsx](file:///Users/josephkotvas/Sites/Riffs/riffeasy/riffscore/src/components/Toolbar/Menus/ClefOverlay.tsx)
- Add "Alto" option to the menu.

## Verification Checklist

- [ ] **Data**: `alto` type and constants defined.
- [ ] **UI**: Alto clef selectable and renders correctly.
- [ ] **Logic**: `addNote('C4')` on Alto staff places note on middle line.
- [ ] **Reliability**: Single-staff and Multi-staff (3+) entry works via API.
- [ ] **Quality**: 100% Coverage, No Lint, Strict Types, JSDoc included.
- [ ] **Regression**: Standard Grand Staff behavior unchanged.
