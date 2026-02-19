/**
 * EditorFooter.test.tsx
 *
 * Tests for the EditorFooter component with selection status and zoom control.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EditorFooter from '@/components/Layout/EditorFooter';
import { ThemeProvider } from '@/context/ThemeContext';
import { createDefaultScore, createDefaultSelection } from '@/types';
import type { Selection, Score } from '@/types';

/**
 * Test wrapper providing Theme context.
 */
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>{children}</ThemeProvider>
);

/**
 * Helper to render EditorFooter with default props.
 */
const renderFooter = (overrides?: {
  selection?: Selection;
  score?: Score;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
}) => {
  const defaultProps = {
    selection: createDefaultSelection(),
    previewNote: null,
    score: createDefaultScore(),
    zoom: 100,
    onZoomChange: jest.fn(),
    ...overrides,
  };

  return {
    ...render(
      <TestWrapper>
        <EditorFooter {...defaultProps} />
      </TestWrapper>
    ),
    props: defaultProps,
  };
};

describe('EditorFooter', () => {
  describe('rendering', () => {
    it('renders the footer element', () => {
      renderFooter();
      expect(screen.getByTestId('editor-footer')).toBeInTheDocument();
    });

    it('renders selection status', () => {
      renderFooter();
      expect(screen.getByTestId('selection-status')).toBeInTheDocument();
    });

    it('renders zoom control', () => {
      renderFooter();
      expect(screen.getByTestId('zoom-control')).toBeInTheDocument();
    });
  });

  describe('selection status display', () => {
    it('shows "No selection" when nothing is selected', () => {
      renderFooter();
      expect(screen.getByText('No selection')).toBeInTheDocument();
    });

    it('shows "Note selected" when single note is selected', () => {
      const score = createDefaultScore();
      score.staves[0].measures[0].events = [
        {
          id: 'e1',
          duration: 'quarter',
          dotted: false,
          notes: [{ id: 'n1', pitch: 'C4' }],
        },
      ];

      const selection: Selection = {
        ...createDefaultSelection(),
        staffIndex: 0,
        measureIndex: 0,
        eventId: 'e1',
        noteId: 'n1',
        selectedNotes: [
          { staffIndex: 0, measureIndex: 0, eventId: 'e1', noteId: 'n1' },
        ],
      };

      renderFooter({ selection, score });
      expect(screen.getByText('Note selected')).toBeInTheDocument();
    });

    it('shows note count when multiple notes are selected', () => {
      const selection: Selection = {
        ...createDefaultSelection(),
        selectedNotes: [
          { staffIndex: 0, measureIndex: 0, eventId: 'e1', noteId: 'n1' },
          { staffIndex: 0, measureIndex: 0, eventId: 'e2', noteId: 'n2' },
          { staffIndex: 0, measureIndex: 0, eventId: 'e3', noteId: 'n3' },
        ],
      };

      renderFooter({ selection });
      expect(screen.getByText('3 notes selected')).toBeInTheDocument();
    });
  });

  describe('zoom input', () => {
    it('displays current zoom value', () => {
      renderFooter({ zoom: 75 });
      const input = screen.getByTestId('zoom-input') as HTMLInputElement;
      expect(input.value).toBe('75');
    });

    it('displays percentage sign', () => {
      renderFooter();
      expect(screen.getByText('%')).toBeInTheDocument();
    });

    it('calls onZoomChange when input is changed and blurred', async () => {
      const user = userEvent.setup();
      const onZoomChange = jest.fn();
      renderFooter({ zoom: 100, onZoomChange });

      const input = screen.getByTestId('zoom-input');
      await user.clear(input);
      await user.type(input, '150');
      await user.tab(); // blur

      expect(onZoomChange).toHaveBeenCalledWith(150);
    });

    it('clamps value to min on blur', async () => {
      const user = userEvent.setup();
      const onZoomChange = jest.fn();
      renderFooter({ zoom: 100, onZoomChange });

      const input = screen.getByTestId('zoom-input');
      await user.clear(input);
      await user.type(input, '10'); // Below min of 25
      await user.tab();

      expect(onZoomChange).toHaveBeenCalledWith(25);
    });

    it('clamps value to max on blur', async () => {
      const user = userEvent.setup();
      const onZoomChange = jest.fn();
      renderFooter({ zoom: 100, onZoomChange });

      const input = screen.getByTestId('zoom-input');
      await user.clear(input);
      await user.type(input, '500'); // Above max of 400
      await user.tab();

      expect(onZoomChange).toHaveBeenCalledWith(400);
    });

    it('resets to current value on invalid input', async () => {
      const user = userEvent.setup();
      const onZoomChange = jest.fn();
      renderFooter({ zoom: 100, onZoomChange });

      const input = screen.getByTestId('zoom-input') as HTMLInputElement;
      await user.clear(input);
      await user.type(input, 'abc');
      await user.tab();

      // Should not call onChange and reset to original value
      expect(onZoomChange).not.toHaveBeenCalled();
      expect(input.value).toBe('100');
    });

    it('commits value on Enter key', async () => {
      const user = userEvent.setup();
      const onZoomChange = jest.fn();
      renderFooter({ zoom: 100, onZoomChange });

      const input = screen.getByTestId('zoom-input');
      await user.clear(input);
      await user.type(input, '200{Enter}');

      expect(onZoomChange).toHaveBeenCalledWith(200);
    });

    it('cancels editing on Escape key', async () => {
      const user = userEvent.setup();
      const onZoomChange = jest.fn();
      renderFooter({ zoom: 100, onZoomChange });

      const input = screen.getByTestId('zoom-input') as HTMLInputElement;
      await user.clear(input);
      await user.type(input, '200');
      await user.keyboard('{Escape}');

      // Should reset to original value
      expect(input.value).toBe('100');
    });

    it('increments by 10 on ArrowUp', async () => {
      const user = userEvent.setup();
      const onZoomChange = jest.fn();
      renderFooter({ zoom: 100, onZoomChange });

      const input = screen.getByTestId('zoom-input');
      await user.click(input);
      await user.keyboard('{ArrowUp}');

      expect(onZoomChange).toHaveBeenCalledWith(110);
    });

    it('decrements by 10 on ArrowDown', async () => {
      const user = userEvent.setup();
      const onZoomChange = jest.fn();
      renderFooter({ zoom: 100, onZoomChange });

      const input = screen.getByTestId('zoom-input');
      await user.click(input);
      await user.keyboard('{ArrowDown}');

      expect(onZoomChange).toHaveBeenCalledWith(90);
    });
  });

  describe('zoom drag handle', () => {
    it('renders drag handle', () => {
      renderFooter();
      expect(screen.getByTestId('zoom-handle')).toBeInTheDocument();
    });

    it('has the zoom-handle class for drag cursor styling', () => {
      renderFooter();
      const handle = screen.getByTestId('zoom-handle');
      expect(handle).toHaveClass('riff-EditorFooter__zoom-handle');
    });

    it('has title for accessibility', () => {
      renderFooter();
      const handle = screen.getByTestId('zoom-handle');
      expect(handle).toHaveAttribute('title', 'Drag to adjust zoom');
    });
  });

  describe('accessibility', () => {
    it('zoom input has aria-label', () => {
      renderFooter();
      const input = screen.getByTestId('zoom-input');
      expect(input).toHaveAttribute('aria-label', 'Zoom percentage');
    });
  });
});
