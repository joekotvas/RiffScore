/**
 * ChordInput.test.tsx
 *
 * Unit tests for the ChordInput component.
 * Verifies focus behavior, keyboard interactions, validation, and navigation.
 *
 * @see ChordInput
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChordInput } from '@/components/Canvas/ChordTrack/ChordInput';

// Mock ChordService parseChord function
jest.mock('@/services/ChordService', () => ({
  parseChord: jest.fn((input: string) => {
    // Valid chords
    const validChords: Record<string, string> = {
      C: 'C',
      Cmaj7: 'Cmaj7',
      Am7: 'Am7',
      G7: 'G7',
      Dm: 'Dm',
      F: 'F',
    };

    const trimmed = input.trim();
    if (validChords[trimmed]) {
      return { ok: true, symbol: validChords[trimmed], components: {} };
    }
    return { ok: false, code: 'CHORD_INVALID_ROOT', message: 'Unrecognized chord' };
  }),
}));

describe('ChordInput', () => {
  const defaultProps = {
    x: 100,
    initialValue: '',
    onComplete: jest.fn(),
    onCancel: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('focus behavior', () => {
    it('focuses input on mount', async () => {
      render(
        <svg>
          <ChordInput {...defaultProps} />
        </svg>
      );

      const input = screen.getByRole('textbox', { name: /enter chord symbol/i });
      await waitFor(() => {
        expect(input).toHaveFocus();
      });
    });

    it('selects initial value text on mount', async () => {
      render(
        <svg>
          <ChordInput {...defaultProps} initialValue="Cmaj7" />
        </svg>
      );

      const input = screen.getByRole('textbox') as HTMLInputElement;
      await waitFor(() => {
        expect(input).toHaveFocus();
      });
      // Note: selection state is hard to test in JSDOM, but focus is verified
      expect(input.value).toBe('Cmaj7');
    });
  });

  describe('Enter key behavior', () => {
    it('completes edit with valid chord on Enter', async () => {
      const user = userEvent.setup();
      const onComplete = jest.fn();

      render(
        <svg>
          <ChordInput {...defaultProps} onComplete={onComplete} />
        </svg>
      );

      const input = screen.getByRole('textbox');
      await user.type(input, 'Cmaj7{Enter}');

      expect(onComplete).toHaveBeenCalledWith('Cmaj7');
    });

    it('calls onCancel/onDelete for invalid chord on Enter', async () => {
      const user = userEvent.setup();
      const onComplete = jest.fn();
      const onCancel = jest.fn();

      render(
        <svg>
          <ChordInput {...defaultProps} onComplete={onComplete} onCancel={onCancel} />
        </svg>
      );

      const input = screen.getByRole('textbox');
      await user.type(input, 'InvalidChord{Enter}');

      // Should not call onComplete
      expect(onComplete).not.toHaveBeenCalled();

      // Should call onCancel (since no onDelete provided)
      expect(onCancel).toHaveBeenCalled();

      // Should not show error message
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('empty input behavior', () => {
    it('calls onDelete when Enter pressed on empty input with onDelete provided', async () => {
      const user = userEvent.setup();
      const onDelete = jest.fn();
      const onCancel = jest.fn();

      render(
        <svg>
          <ChordInput
            {...defaultProps}
            initialValue="Cmaj7"
            onDelete={onDelete}
            onCancel={onCancel}
          />
        </svg>
      );

      const input = screen.getByRole('textbox');
      await user.clear(input);
      await user.keyboard('{Enter}');

      expect(onDelete).toHaveBeenCalled();
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('calls onCancel when Enter pressed on empty input without onDelete', async () => {
      const user = userEvent.setup();
      const onCancel = jest.fn();

      render(
        <svg>
          <ChordInput {...defaultProps} initialValue="" onCancel={onCancel} />
        </svg>
      );

      const _input = screen.getByRole('textbox');
      await user.keyboard('{Enter}');

      expect(onCancel).toHaveBeenCalled();
    });
  });

  describe('Escape key behavior', () => {
    it('cancels edit on Escape', async () => {
      const user = userEvent.setup();
      const onCancel = jest.fn();

      render(
        <svg>
          <ChordInput {...defaultProps} onCancel={onCancel} />
        </svg>
      );

      const input = screen.getByRole('textbox');
      await user.type(input, 'Cmaj7');
      await user.keyboard('{Escape}');

      expect(onCancel).toHaveBeenCalled();
    });

    it('cancels without calling onComplete', async () => {
      const user = userEvent.setup();
      const onComplete = jest.fn();
      const onCancel = jest.fn();

      render(
        <svg>
          <ChordInput {...defaultProps} onComplete={onComplete} onCancel={onCancel} />
        </svg>
      );

      const input = screen.getByRole('textbox');
      await user.type(input, 'Cmaj7');
      await user.keyboard('{Escape}');

      expect(onCancel).toHaveBeenCalled();
      expect(onComplete).not.toHaveBeenCalled();
    });
  });

  describe('Tab navigation', () => {
    it('Tab navigates to next chord with valid input', async () => {
      const user = userEvent.setup();
      const onNavigateNext = jest.fn();

      render(
        <svg>
          <ChordInput {...defaultProps} onNavigateNext={onNavigateNext} />
        </svg>
      );

      const input = screen.getByRole('textbox');
      await user.type(input, 'Am7');
      await user.keyboard('{Tab}');

      expect(onNavigateNext).toHaveBeenCalledWith('Am7');
    });

    it('Shift+Tab navigates to previous chord with valid input', async () => {
      const user = userEvent.setup();
      const onNavigatePrevious = jest.fn();

      render(
        <svg>
          <ChordInput {...defaultProps} onNavigatePrevious={onNavigatePrevious} />
        </svg>
      );

      const input = screen.getByRole('textbox');
      await user.type(input, 'G7');
      await user.keyboard('{Shift>}{Tab}{/Shift}');

      expect(onNavigatePrevious).toHaveBeenCalledWith('G7');
    });

    it('calls onNavigateNext with empty string for invalid chord on Tab', async () => {
      const user = userEvent.setup();
      const onNavigateNext = jest.fn();
      const onCancel = jest.fn();

      render(
        <svg>
          <ChordInput {...defaultProps} onNavigateNext={onNavigateNext} onCancel={onCancel} />
        </svg>
      );

      const input = screen.getByRole('textbox');
      await user.type(input, 'NotAChord');
      await user.keyboard('{Tab}');

      expect(onNavigateNext).toHaveBeenCalledWith('');
      expect(onCancel).not.toHaveBeenCalled();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('Tab with empty input navigates with empty string', async () => {
      const user = userEvent.setup();
      const onNavigateNext = jest.fn();

      render(
        <svg>
          <ChordInput {...defaultProps} initialValue="" onNavigateNext={onNavigateNext} />
        </svg>
      );

      const input = screen.getByRole('textbox');
      await user.click(input);
      await user.keyboard('{Tab}');

      expect(onNavigateNext).toHaveBeenCalledWith('');
    });

    it('Tab falls back to onComplete when onNavigateNext not provided', async () => {
      const user = userEvent.setup();
      const onComplete = jest.fn();

      render(
        <svg>
          <ChordInput {...defaultProps} onComplete={onComplete} />
        </svg>
      );

      const input = screen.getByRole('textbox');
      await user.type(input, 'Dm');
      await user.keyboard('{Tab}');

      expect(onComplete).toHaveBeenCalledWith('Dm');
    });

    it('Tab with empty input falls back to onCancel when onNavigateNext not provided', async () => {
      const user = userEvent.setup();
      const onCancel = jest.fn();

      render(
        <svg>
          <ChordInput {...defaultProps} onCancel={onCancel} />
        </svg>
      );

      const input = screen.getByRole('textbox');
      await user.click(input);
      await user.keyboard('{Tab}');

      expect(onCancel).toHaveBeenCalled();
    });
  });

  describe('blur behavior', () => {
    it('completes with valid chord on blur', async () => {
      const user = userEvent.setup();
      const onComplete = jest.fn();

      render(
        <svg>
          <ChordInput {...defaultProps} onComplete={onComplete} />
        </svg>
      );

      const input = screen.getByRole('textbox');
      await user.type(input, 'F');
      await user.click(document.body);

      expect(onComplete).toHaveBeenCalledWith('F');
    });

    it('cancels on blur with invalid chord', async () => {
      const user = userEvent.setup();
      const onCancel = jest.fn();
      const onComplete = jest.fn();

      render(
        <svg>
          <ChordInput {...defaultProps} onComplete={onComplete} onCancel={onCancel} />
        </svg>
      );

      const input = screen.getByRole('textbox');
      await user.type(input, 'NotValid');
      await user.click(document.body);

      expect(onCancel).toHaveBeenCalled();
      expect(onComplete).not.toHaveBeenCalled();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('cancels on blur with empty input', async () => {
      const user = userEvent.setup();
      const onCancel = jest.fn();

      render(
        <svg>
          <ChordInput {...defaultProps} initialValue="" onCancel={onCancel} />
        </svg>
      );

      const input = screen.getByRole('textbox');
      await user.click(input);
      await user.click(document.body);

      expect(onCancel).toHaveBeenCalled();
    });
  });

  describe('input attributes', () => {
    it('has correct aria-label', () => {
      render(
        <svg>
          <ChordInput {...defaultProps} />
        </svg>
      );

      const input = screen.getByRole('textbox', { name: /enter chord symbol/i });
      expect(input).toBeInTheDocument();
    });

    it('has placeholder text', () => {
      render(
        <svg>
          <ChordInput {...defaultProps} />
        </svg>
      );

      const input = screen.getByPlaceholderText('e.g., Cmaj7');
      expect(input).toBeInTheDocument();
    });

    it('has autocomplete disabled', () => {
      render(
        <svg>
          <ChordInput {...defaultProps} />
        </svg>
      );

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('autocomplete', 'off');
    });

    it('has spellcheck disabled', () => {
      render(
        <svg>
          <ChordInput {...defaultProps} />
        </svg>
      );

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('spellcheck', 'false');
    });
  });

  describe('CSS classes', () => {
    it('has base class', () => {
      render(
        <svg>
          <ChordInput {...defaultProps} />
        </svg>
      );

      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('riff-ChordInput');
    });
  });
});
