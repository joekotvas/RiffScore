/**
 * PrintService Tests
 *
 * Tests for print preparation, restoration, and state checking functions.
 * Tests DOM manipulation for print mode transitions.
 */

import {
  preparePrint,
  restoreFromPrint,
  isPrinting,
  openPrintDialog,
} from '@/services/PrintService';

// ============================================================================
// TEST SETUP
// ============================================================================

describe('PrintService', () => {
  // Create a mock editor element before each test
  let mockEditor: HTMLDivElement;

  beforeEach(() => {
    // Reset body classes
    document.body.className = '';

    // Create and append mock editor element
    mockEditor = document.createElement('div');
    mockEditor.className = 'riff-editor';
    document.body.appendChild(mockEditor);
  });

  afterEach(() => {
    // Clean up mock editor
    if (mockEditor.parentNode) {
      mockEditor.parentNode.removeChild(mockEditor);
    }

    // Reset body classes
    document.body.className = '';
  });

  // ============================================================================
  // preparePrint TESTS
  // ============================================================================

  describe('preparePrint', () => {
    it('adds riff-printing class to body', () => {
      expect(document.body.classList.contains('riff-printing')).toBe(false);

      preparePrint();

      expect(document.body.classList.contains('riff-printing')).toBe(true);
    });

    it('sets data-print-mode attribute on editor element', () => {
      expect(mockEditor.hasAttribute('data-print-mode')).toBe(false);

      preparePrint();

      expect(mockEditor.getAttribute('data-print-mode')).toBe('true');
    });

    it('sets data-print-mode on current ScoreEditor roots', () => {
      const scoreEditor = document.createElement('div');
      scoreEditor.className = 'riff-ScoreEditor';
      document.body.appendChild(scoreEditor);

      preparePrint();

      expect(scoreEditor.getAttribute('data-print-mode')).toBe('true');

      scoreEditor.remove();
    });

    it('handles missing editor element gracefully', () => {
      // Remove the editor
      mockEditor.parentNode?.removeChild(mockEditor);

      // Should not throw
      expect(() => preparePrint()).not.toThrow();

      // Body class should still be added
      expect(document.body.classList.contains('riff-printing')).toBe(true);
    });

    it('preserves existing body classes', () => {
      document.body.classList.add('existing-class');

      preparePrint();

      expect(document.body.classList.contains('existing-class')).toBe(true);
      expect(document.body.classList.contains('riff-printing')).toBe(true);
    });

    it('is idempotent - multiple calls do not duplicate class', () => {
      preparePrint();
      preparePrint();
      preparePrint();

      const printingClasses = Array.from(document.body.classList).filter(
        (c) => c === 'riff-printing'
      );
      expect(printingClasses.length).toBe(1);
    });
  });

  // ============================================================================
  // restoreFromPrint TESTS
  // ============================================================================

  describe('restoreFromPrint', () => {
    beforeEach(() => {
      // Set up print state before testing restoration
      preparePrint();
    });

    it('removes riff-printing class from body', () => {
      expect(document.body.classList.contains('riff-printing')).toBe(true);

      restoreFromPrint();

      expect(document.body.classList.contains('riff-printing')).toBe(false);
    });

    it('removes data-print-mode attribute from editor element', () => {
      expect(mockEditor.getAttribute('data-print-mode')).toBe('true');

      restoreFromPrint();

      expect(mockEditor.hasAttribute('data-print-mode')).toBe(false);
    });

    it('removes data-print-mode from current ScoreEditor roots', () => {
      const scoreEditor = document.createElement('div');
      scoreEditor.className = 'riff-ScoreEditor';
      scoreEditor.setAttribute('data-print-mode', 'true');
      document.body.appendChild(scoreEditor);

      restoreFromPrint();

      expect(scoreEditor.hasAttribute('data-print-mode')).toBe(false);

      scoreEditor.remove();
    });

    it('handles missing editor element gracefully', () => {
      // Remove the editor
      mockEditor.parentNode?.removeChild(mockEditor);

      // Should not throw
      expect(() => restoreFromPrint()).not.toThrow();

      // Body class should still be removed
      expect(document.body.classList.contains('riff-printing')).toBe(false);
    });

    it('preserves other body classes', () => {
      document.body.classList.add('other-class');

      restoreFromPrint();

      expect(document.body.classList.contains('other-class')).toBe(true);
      expect(document.body.classList.contains('riff-printing')).toBe(false);
    });

    it('is idempotent - multiple calls do not cause errors', () => {
      restoreFromPrint();
      restoreFromPrint();
      restoreFromPrint();

      expect(document.body.classList.contains('riff-printing')).toBe(false);
    });

    it('works when called without prior preparePrint', () => {
      // Reset state (remove what beforeEach set up)
      document.body.classList.remove('riff-printing');
      mockEditor.removeAttribute('data-print-mode');

      // Should not throw when nothing to restore
      expect(() => restoreFromPrint()).not.toThrow();
    });
  });

  // ============================================================================
  // isPrinting TESTS
  // ============================================================================

  describe('isPrinting', () => {
    it('returns false when not printing', () => {
      expect(isPrinting()).toBe(false);
    });

    it('returns true after preparePrint is called', () => {
      preparePrint();

      expect(isPrinting()).toBe(true);
    });

    it('returns false after restoreFromPrint is called', () => {
      preparePrint();
      expect(isPrinting()).toBe(true);

      restoreFromPrint();
      expect(isPrinting()).toBe(false);
    });

    it('returns correct state through multiple cycles', () => {
      expect(isPrinting()).toBe(false);

      preparePrint();
      expect(isPrinting()).toBe(true);

      restoreFromPrint();
      expect(isPrinting()).toBe(false);

      preparePrint();
      expect(isPrinting()).toBe(true);

      restoreFromPrint();
      expect(isPrinting()).toBe(false);
    });
  });

  // ============================================================================
  // INTEGRATION TESTS
  // ============================================================================

  describe('prepare/restore cycle', () => {
    it('fully restores state after print cycle', () => {
      // Capture initial state
      const initialBodyClasses = document.body.className;
      const initialEditorAttrs = Array.from(mockEditor.attributes).map((a) => a.name);

      // Run print cycle
      preparePrint();
      restoreFromPrint();

      // Verify state is restored
      expect(document.body.className).toBe(initialBodyClasses);
      expect(Array.from(mockEditor.attributes).map((a) => a.name)).toEqual(initialEditorAttrs);
    });
  });
});

// ============================================================================
// openPrintDialog TESTS
// ============================================================================

describe('openPrintDialog', () => {
  let mockEditor: HTMLDivElement;
  let printSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    document.body.className = '';
    mockEditor = document.createElement('div');
    mockEditor.className = 'riff-ScoreEditor';
    document.body.appendChild(mockEditor);
    if (typeof window.print !== 'function') {
      Object.defineProperty(window, 'print', {
        value: () => {},
        writable: true,
        configurable: true,
      });
    }
  });

  afterEach(() => {
    printSpy?.mockRestore();
    mockEditor.remove();
    document.body.className = '';
    jest.useRealTimers();
  });

  it('restores print mode when afterprint fires synchronously inside window.print() (Chromium, Firefox)', () => {
    printSpy = jest.spyOn(window, 'print').mockImplementation(() => {
      window.dispatchEvent(new Event('beforeprint'));
      window.dispatchEvent(new Event('afterprint'));
    });

    openPrintDialog();
    expect(isPrinting()).toBe(true);
    expect(mockEditor.getAttribute('data-print-mode')).toBe('true');

    jest.runAllTimers();

    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(isPrinting()).toBe(false);
    expect(mockEditor.hasAttribute('data-print-mode')).toBe(false);
  });

  it('restores print mode when afterprint fires after window.print() has returned', () => {
    printSpy = jest.spyOn(window, 'print').mockImplementation(() => {});

    openPrintDialog();
    jest.runAllTimers();
    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(isPrinting()).toBe(true);

    window.dispatchEvent(new Event('afterprint'));
    expect(isPrinting()).toBe(false);
    expect(mockEditor.hasAttribute('data-print-mode')).toBe(false);
  });
});
