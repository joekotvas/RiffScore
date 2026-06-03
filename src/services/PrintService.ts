/**
 * PrintService - Print Preparation and Dialog Management
 *
 * Provides functions for preparing the score editor for printing,
 * managing the print dialog, and restoring the UI after printing.
 *
 * All functions handle DOM state for print mode transitions.
 */

import { TIMING } from '@/config';

// =============================================================================
// CSS CLASS CONSTANTS
// =============================================================================

/** Class added to body when printing */
const PRINTING_CLASS = 'riff-printing';

/** Attribute set on editor when in print mode */
const PRINT_MODE_ATTR = 'data-print-mode';

/** Selector for the editor element */
const EDITOR_SELECTOR = '.riff-editor';

// =============================================================================
// PRINT STATE FUNCTIONS
// =============================================================================

/**
 * Checks if the document is currently in print mode.
 *
 * @returns True if the body has the printing class
 */
export const isPrinting = (): boolean => {
  return document.body.classList.contains(PRINTING_CLASS);
};

// =============================================================================
// PRINT PREPARATION FUNCTIONS
// =============================================================================

/**
 * Prepares the document for printing.
 *
 * Actions:
 * - Adds 'riff-printing' class to body for CSS targeting
 * - Sets 'data-print-mode' attribute on editor element
 *
 * This enables print-specific styles to hide UI elements and
 * optimize the score for clean PDF output.
 */
export const preparePrint = (): void => {
  document.body.classList.add(PRINTING_CLASS);

  const editor = document.querySelector(EDITOR_SELECTOR);
  if (editor) {
    editor.setAttribute(PRINT_MODE_ATTR, 'true');
  }
};

/**
 * Restores the document after printing.
 *
 * Actions:
 * - Removes 'riff-printing' class from body
 * - Removes 'data-print-mode' attribute from editor element
 *
 * This restores the normal UI state after the print dialog closes.
 */
export const restoreFromPrint = (): void => {
  document.body.classList.remove(PRINTING_CLASS);

  const editor = document.querySelector(EDITOR_SELECTOR);
  if (editor) {
    editor.removeAttribute(PRINT_MODE_ATTR);
  }
};

// =============================================================================
// PRINT DIALOG FUNCTIONS
// =============================================================================

/**
 * Opens the native browser print dialog with proper preparation.
 *
 * Process:
 * 1. Prepares the document for printing (hide UI, set attributes)
 * 2. Waits for styles to settle (configured delay)
 * 3. Opens the native print dialog
 * 4. Restores the document after print dialog closes
 *
 * Uses the 'afterprint' event to restore state, which fires when the
 * print dialog is closed (whether user prints or cancels).
 */
export const openPrintDialog = (): void => {
  preparePrint();

  setTimeout(() => {
    window.print();

    // Restore after print dialog closes (print or cancel)
    window.addEventListener('afterprint', () => restoreFromPrint(), { once: true });
  }, TIMING.printStyleSettleMs);
};
