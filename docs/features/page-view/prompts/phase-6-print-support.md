# Phase 6: Print Support

**Issue:** [#174](https://github.com/joekotvas/riffscore/issues/174)
**Estimated Effort:** 2 days
**Dependencies:** Phase 3 (Multi-System Rendering)

---

## Objective

Implement print stylesheet and print service for clean PDF output via the native browser print dialog.

---

## Deliverables

1. `PrintService.ts` - Print preparation and dialog handling
2. `print.css` - Print-specific stylesheet
3. `Cmd/Ctrl+P` handler
4. Cross-browser testing (Chrome, Firefox, Safari, Edge)

---

## Requirements Reference

From PRD:
- **FR-13:** `Cmd+P` / `Ctrl+P` opens native browser print dialog
- **FR-14:** Print stylesheet hides UI, shows only score, high contrast
- **FR-15:** Resolution-independent (vector SVG)
- **FR-16:** Multi-page pagination with proper page breaks

---

## PrintService

Create `src/services/PrintService.ts`:

```typescript
/**
 * PrintService - Print preparation and cleanup.
 *
 * @see Issue #174
 * @tested src/__tests__/services/PrintService.test.ts
 */

import { TIMING } from '@/config';

/**
 * Prepare the document for printing.
 * Adds print class to body, hides UI elements.
 */
export const preparePrint = (): void => {
  document.body.classList.add('riff-printing');

  // Ensure page view mode for print
  const editor = document.querySelector('.riff-editor');
  if (editor) {
    editor.setAttribute('data-print-mode', 'true');
  }
};

/**
 * Restore normal view after printing.
 */
export const restoreFromPrint = (): void => {
  document.body.classList.remove('riff-printing');

  const editor = document.querySelector('.riff-editor');
  if (editor) {
    editor.removeAttribute('data-print-mode');
  }
};

/**
 * Open browser print dialog.
 */
export const openPrintDialog = (): void => {
  preparePrint();

  // Delay to ensure styles are applied before print dialog opens
  setTimeout(() => {
    window.print();

    // Restore after print dialog closes
    window.addEventListener(
      'afterprint',
      () => {
        restoreFromPrint();
      },
      { once: true }
    );
  }, TIMING.printStyleSettleMs);
};

/**
 * Check if currently printing.
 */
export const isPrinting = (): boolean => {
  return document.body.classList.contains('riff-printing');
};
```

---

## Print Stylesheet

Create `src/styles/print.css`:

```css
/**
 * Print stylesheet for RiffScore
 *
 * @see Issue #174
 */

@media print {
  /* ============================================
     1. HIDE UI ELEMENTS
     ============================================ */

  .riff-toolbar,
  .riff-sidebar,
  .riff-footer,
  .riff-dialog,
  .riff-tooltip,
  .riff-cursor,
  .riff-selection-highlight,
  .riff-playback-cursor,
  .riff-scrollbar,
  .riff-zoom-controls,
  .riff-view-toggle,
  .riff-score-setup-btn,
  .riff-MetadataField--preview,
  .riff-MetadataInput__foreign {
    display: none !important;
  }

  /* ============================================
     2. RESET BACKGROUNDS
     ============================================ */

  html,
  body,
  .riff-editor,
  .riff-canvas-container,
  .riff-canvas {
    background: white !important;
    background-color: white !important;
  }

  /* ============================================
     3. ENSURE HIGH CONTRAST
     ============================================ */

  .riff-staff-line,
  .riff-ledger-line,
  .riff-barline {
    stroke: black !important;
  }

  .riff-notehead,
  .riff-stem,
  .riff-flag,
  .riff-beam,
  .riff-accidental,
  .riff-clef,
  .riff-rest {
    fill: black !important;
    stroke: black !important;
  }

  .riff-chord-symbol,
  .riff-measure-number,
  .riff-page-number,
  .riff-MetadataField {
    fill: black !important;
    color: black !important;
  }

  /* ============================================
     4. PAGE BREAK CONTROL
     ============================================ */

  .riff-system {
    page-break-inside: avoid;
  }

  .riff-page-break {
    page-break-before: always;
  }

  /* ============================================
     5. SIZING
     ============================================ */

  .riff-editor {
    width: 100% !important;
    height: auto !important;
    overflow: visible !important;
  }

  .riff-canvas-container {
    width: 100% !important;
    height: auto !important;
    overflow: visible !important;
  }

  .riff-canvas {
    width: 100% !important;
    height: auto !important;
  }

  /* ============================================
     6. REMOVE BORDERS & SHADOWS
     ============================================ */

  .riff-editor,
  .riff-canvas,
  .riff-system,
  .riff-page-boundary {
    border: none !important;
    box-shadow: none !important;
  }

  /* Hide page boundary outline in print */
  .riff-page-boundary {
    stroke: none !important;
  }

  /* ============================================
     7. PAGE SETTINGS
     ============================================ */

  @page {
    margin: 0;
  }

  /* Content margins handled by SVG positioning */
}

/* ============================================
   PRINT MODE CLASS (for JavaScript prep)
   ============================================ */

body.riff-printing {
  /* Applied before print dialog opens */
}

.riff-printing .riff-toolbar,
.riff-printing .riff-sidebar,
.riff-printing .riff-footer {
  display: none !important;
}
```

---

## Keyboard Shortcut

Update the keyboard handler to intercept `Cmd/Ctrl+P`:

```typescript
// In useKeyboardShortcuts.ts or similar
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    const isMod = isMac() ? e.metaKey : e.ctrlKey;

    // Print: Cmd/Ctrl + P
    if (isMod && e.key === 'p') {
      e.preventDefault();  // Prevent default browser print
      openPrintDialog();
    }
  };

  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}, []);
```

---

## Cross-Browser Testing

Test in all major browsers:

### Chrome
- Verify print preview shows correct layout
- Verify page breaks occur at system boundaries
- Verify PDF output is vector-based

### Firefox
- Test `@page` margin handling
- Verify SVG rendering in print preview

### Safari
- Test `afterprint` event handling
- Verify high-contrast rendering

### Edge
- Same as Chrome (Chromium-based)

---

## Test Cases

```typescript
describe('PrintService', () => {
  describe('preparePrint', () => {
    it('adds riff-printing class to body', () => {
      preparePrint();
      expect(document.body.classList.contains('riff-printing')).toBe(true);
    });

    it('sets data-print-mode on editor', () => {
      const editor = document.createElement('div');
      editor.className = 'riff-editor';
      document.body.appendChild(editor);

      preparePrint();
      expect(editor.getAttribute('data-print-mode')).toBe('true');

      document.body.removeChild(editor);
    });
  });

  describe('restoreFromPrint', () => {
    it('removes riff-printing class from body', () => {
      document.body.classList.add('riff-printing');
      restoreFromPrint();
      expect(document.body.classList.contains('riff-printing')).toBe(false);
    });
  });

  describe('isPrinting', () => {
    it('returns true when printing', () => {
      document.body.classList.add('riff-printing');
      expect(isPrinting()).toBe(true);
      document.body.classList.remove('riff-printing');
    });

    it('returns false when not printing', () => {
      expect(isPrinting()).toBe(false);
    });
  });
});
```

---

## Coding Standards

### CSS Print Media Query
- Use `@media print` for all print-specific styles
- Use `!important` sparingly, only when necessary to override inline styles
- Test page break behavior

### Print Service Pattern
- Prepare -> Print -> Restore flow
- Use `afterprint` event for cleanup
- Add delay for style settling

---

## Parallelization Strategy

### Sequential Implementation
Print support requires careful ordering:

1. **PrintService Agent:** Create PrintService.ts
2. **Stylesheet Agent:** Create print.css

### Integration (Executor)
1. Import print.css in main stylesheet
2. Register Cmd/Ctrl+P handler

### Cross-Browser Testing (Executor)
Run manual tests in each browser - cannot be parallelized.

### Final Step (Executor)
Run `npm run test` and verify in all browsers.

---

## Acceptance Criteria

- [ ] `PrintService.ts` created with all functions
- [ ] `print.css` created with all rules
- [ ] Print stylesheet imported in main CSS
- [ ] `Cmd/Ctrl+P` opens print dialog
- [ ] UI elements hidden in print
- [ ] Score renders with high contrast
- [ ] Page breaks respect system boundaries
- [ ] Works in Chrome, Firefox, Safari, Edge
- [ ] Unit tests pass

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/services/PrintService.ts` | Create |
| `src/styles/print.css` | Create |
| `src/styles/index.css` | Modify (import print.css) |
| `src/__tests__/services/PrintService.test.ts` | Create |

---

## User Walkthrough & Manual Testing

After implementation, verify the following manually:

### 1. Run Tests
```bash
npm run test
npm run lint
```

### 2. Start Demo App
```bash
npm run demo:dev
```

### 3. Test Print Dialog

1. Switch to page view
2. Press `Cmd+P` (Mac) or `Ctrl+P` (Windows)
3. Print dialog should open

**Verify in print preview:**
- [ ] Toolbar is hidden
- [ ] Scrollbars are hidden
- [ ] Only score content is visible
- [ ] Background is white
- [ ] All notation is black (high contrast)
- [ ] Page boundary outline is hidden

### 4. Test PDF Export

1. In print dialog, select "Save as PDF"
2. Save the file
3. Open the PDF

**Verify:**
- [ ] PDF looks identical to print preview
- [ ] Text is searchable (vector, not rasterized)
- [ ] Multiple pages work correctly

### 5. Cross-Browser Testing

Test in each browser:

| Browser | Print Dialog Opens | Preview Correct | PDF Export |
|---------|-------------------|-----------------|------------|
| Chrome  | [ ] | [ ] | [ ] |
| Firefox | [ ] | [ ] | [ ] |
| Safari  | [ ] | [ ] | [ ] |
| Edge    | [ ] | [ ] | [ ] |

### 6. Test Print Cleanup

After closing print dialog:
- [ ] `riff-printing` class removed from body
- [ ] UI elements visible again
- [ ] No visual artifacts

---

## Phase Completion & Recalibration

### Before Moving to Phase 7

After completing Phase 6:

1. **Verify print quality**
   - Clean, professional output
   - No missing elements
   - Correct page breaks

2. **Cross-browser compatibility**
   - All major browsers work
   - No browser-specific issues

3. **Review Phase 7 prompt**
   - Will metadata render correctly in print?
   - Are page numbers positioned correctly?

### Recalibration Checklist

- [ ] All tests pass
- [ ] Print dialog opens correctly
- [ ] Print preview shows only score
- [ ] PDF export produces vector output
- [ ] Works in all major browsers
- [ ] Phase 7 prompt reviewed and updated if needed

### Commit Template

```bash
git add src/services/PrintService.ts src/styles/print.css src/styles/index.css
git commit -m "feat(#174): implement print support

- Create PrintService with prepare/restore/dialog functions
- Create print.css stylesheet
- Hide UI elements in print
- Ensure high-contrast output
- Add page break control for systems

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Notes for Subsequent Phases

After this phase:
- Print produces clean PDF output
- `@media print` styles hide UI elements
- Phase 7 will add metadata that appears in print
