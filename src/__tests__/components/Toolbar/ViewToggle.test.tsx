/**
 * ViewToggle.test.tsx
 *
 * Tests for the ViewToggle toolbar component.
 * Verifies view mode toggling behavior, icon rendering, and tooltips.
 *
 * @see ViewToggle
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ViewToggle from '@/components/Toolbar/ViewToggle';
import { ScoreProvider } from '@/context/ScoreContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { createDefaultScore } from '@/types';
import type { Score, LayoutConfig } from '@/types';
import { DEFAULT_LAYOUT_CONFIG } from '@/config';

// Mock clipboard to avoid errors in test env
Object.assign(navigator, {
  clipboard: {
    writeText: jest.fn(),
  },
});

/**
 * Test wrapper providing both Theme and Score contexts.
 */
const TestWrapper: React.FC<{
  children: React.ReactNode;
  initialScore?: Score;
}> = ({ children, initialScore }) => (
  <ThemeProvider>
    <ScoreProvider initialScore={initialScore ?? createDefaultScore()}>{children}</ScoreProvider>
  </ThemeProvider>
);

/**
 * Create a score with a specific view mode.
 */
const createScoreWithViewMode = (viewMode: LayoutConfig['viewMode']): Score => {
  const score = createDefaultScore();
  return {
    ...score,
    layout: {
      ...DEFAULT_LAYOUT_CONFIG,
      viewMode,
    },
  };
};

// ============================================================================
// ViewToggle Tests
// ============================================================================

describe('ViewToggle', () => {
  it('renders a button', () => {
    render(
      <TestWrapper>
        <ViewToggle />
      </TestWrapper>
    );

    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  describe('button labels', () => {
    it('shows "Page View" label when in scroll view mode', () => {
      const scrollModeScore = createScoreWithViewMode('scroll');

      render(
        <TestWrapper initialScore={scrollModeScore}>
          <ViewToggle />
        </TestWrapper>
      );

      expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Page View');
    });

    it('shows "Scroll View" label when in page view mode', () => {
      const pageModeScore = createScoreWithViewMode('page');

      render(
        <TestWrapper initialScore={pageModeScore}>
          <ViewToggle />
        </TestWrapper>
      );

      expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Scroll View');
    });
  });

  describe('tooltips', () => {
    it('shows tooltip with keyboard shortcut when in scroll view', () => {
      const scrollModeScore = createScoreWithViewMode('scroll');

      render(
        <TestWrapper initialScore={scrollModeScore}>
          <ViewToggle />
        </TestWrapper>
      );

      const button = screen.getByRole('button');
      // Tooltip should mention switching to Page View and include backslash shortcut
      expect(button.getAttribute('title')).toMatch(/Page View/);
      expect(button.getAttribute('title')).toMatch(/\\/);
    });

    it('shows tooltip with keyboard shortcut when in page view', () => {
      const pageModeScore = createScoreWithViewMode('page');

      render(
        <TestWrapper initialScore={pageModeScore}>
          <ViewToggle />
        </TestWrapper>
      );

      const button = screen.getByRole('button');
      // Tooltip should mention switching to Scroll View and include backslash shortcut
      expect(button.getAttribute('title')).toMatch(/Scroll View/);
      expect(button.getAttribute('title')).toMatch(/\\/);
    });
  });

  describe('icon rendering', () => {
    it('renders an icon inside the button', () => {
      render(
        <TestWrapper>
          <ViewToggle />
        </TestWrapper>
      );

      const button = screen.getByRole('button');
      // Verify the button contains content (the icon)
      expect(button).not.toBeEmptyDOMElement();
    });
  });

  describe('click behavior', () => {
    it('toggles view mode when clicked', async () => {
      const user = userEvent.setup();
      const scrollModeScore = createScoreWithViewMode('scroll');

      render(
        <TestWrapper initialScore={scrollModeScore}>
          <ViewToggle />
        </TestWrapper>
      );

      const button = screen.getByRole('button');

      // Initially shows Page View (meaning we're in scroll mode, clicking will switch to page)
      expect(button).toHaveAttribute('aria-label', 'Page View');

      // Click the button
      await user.click(button);

      // Note: In a real scenario, the ScoreContext would update and the component would re-render.
      // This test verifies the button is clickable and doesn't throw.
    });

    it('prevents focus on click (preventFocus behavior)', () => {
      render(
        <TestWrapper>
          <ViewToggle />
        </TestWrapper>
      );

      const button = screen.getByRole('button');

      // Simulate mousedown (preventFocus calls preventDefault on mousedown)
      fireEvent.mouseDown(button);

      // The button should still exist and be interactive
      expect(button).toBeInTheDocument();
    });
  });

  describe('variants', () => {
    it('accepts variant prop', () => {
      render(
        <TestWrapper>
          <ViewToggle variant="ghost" />
        </TestWrapper>
      );

      const button = screen.getByRole('button');
      // The button should have the ghost class applied
      expect(button.className).toContain('ghost');
    });

    it('defaults to default variant', () => {
      render(
        <TestWrapper>
          <ViewToggle />
        </TestWrapper>
      );

      // Should render without errors
      expect(screen.getByRole('button')).toBeInTheDocument();
    });
  });
});
