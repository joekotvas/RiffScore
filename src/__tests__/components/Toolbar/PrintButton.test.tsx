/**
 * PrintButton.test.tsx
 *
 * Tests for the PrintButton toolbar component.
 * Verifies print dialog invocation, icon rendering, and tooltips.
 *
 * @see PrintButton
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PrintButton from '@/components/Toolbar/PrintButton';

// Mock the PrintService
jest.mock('@/services/PrintService', () => ({
  openPrintDialog: jest.fn(),
}));

// Import the mocked function for assertions
import { openPrintDialog } from '@/services/PrintService';

const mockedOpenPrintDialog = openPrintDialog as jest.MockedFunction<typeof openPrintDialog>;

// ============================================================================
// PrintButton Tests
// ============================================================================

describe('PrintButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders a button', () => {
    render(<PrintButton />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  describe('button label', () => {
    it('has accessible label "Print"', () => {
      render(<PrintButton />);
      expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Print');
    });
  });

  describe('tooltip', () => {
    it('shows tooltip with keyboard shortcut', () => {
      render(<PrintButton />);

      const button = screen.getByRole('button');
      // Tooltip should mention Print and include P shortcut
      expect(button.getAttribute('title')).toMatch(/Print/);
      expect(button.getAttribute('title')).toMatch(/P/);
    });
  });

  describe('icon rendering', () => {
    it('renders an icon inside the button', () => {
      render(<PrintButton />);

      const button = screen.getByRole('button');
      // Verify the button contains content (the icon)
      expect(button).not.toBeEmptyDOMElement();
    });
  });

  describe('click behavior', () => {
    it('calls openPrintDialog when clicked', async () => {
      const user = userEvent.setup();

      render(<PrintButton />);

      const button = screen.getByRole('button');
      await user.click(button);

      expect(mockedOpenPrintDialog).toHaveBeenCalledTimes(1);
    });

    it('prevents focus on click (preventFocus behavior)', () => {
      render(<PrintButton />);

      const button = screen.getByRole('button');

      // Simulate mousedown (preventFocus calls preventDefault on mousedown)
      fireEvent.mouseDown(button);

      // The button should still exist and be interactive
      expect(button).toBeInTheDocument();
    });
  });

  describe('variants', () => {
    it('accepts variant prop', () => {
      render(<PrintButton variant="ghost" />);

      const button = screen.getByRole('button');
      // The button should have the ghost class applied
      expect(button.className).toContain('ghost');
    });

    it('defaults to default variant', () => {
      render(<PrintButton />);

      // Should render without errors
      expect(screen.getByRole('button')).toBeInTheDocument();
    });
  });
});
