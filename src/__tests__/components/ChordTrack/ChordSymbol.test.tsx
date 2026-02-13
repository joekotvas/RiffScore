/**
 * ChordSymbol.test.tsx
 *
 * Unit tests for the ChordSymbol component.
 * Verifies rendering, notation conversion, accessibility, and visual states.
 *
 * @see ChordSymbol
 */

import { render, screen } from '@testing-library/react';
import { ChordSymbol } from '@/components/Canvas/ChordTrack/ChordSymbol';
import type { ChordSymbol as ChordSymbolType, ChordDisplayConfig } from '@/types';

// Mock ChordService functions
jest.mock('@/services/ChordService', () => ({
  convertNotation: jest.fn((symbol: string, notation: string, _key: string, useSymbols: boolean) => {
    // Simple mock: apply symbols for maj7 -> triangle
    if (useSymbols && symbol.includes('maj7')) {
      return symbol.replace('maj7', 'Δ7');
    }
    if (notation === 'roman') {
      // Simple mock conversion
      if (symbol === 'C') return 'I';
      if (symbol === 'Am7') return 'vi7';
    }
    return symbol;
  }),
  getAccessibleChordName: jest.fn((symbol: string) => {
    // Simple mock: expand chord names
    if (symbol === 'Cmaj7') return 'C major seventh';
    if (symbol === 'Am7') return 'A minor seventh';
    if (symbol === 'G7') return 'G dominant seventh';
    return symbol;
  }),
}));

describe('ChordSymbol', () => {
  const defaultChord: ChordSymbolType = {
    id: 'chord-1',
    quant: 0,
    symbol: 'Cmaj7',
  };

  const defaultDisplayConfig: ChordDisplayConfig = {
    notation: 'letter',
    useSymbols: false,
  };

  const defaultProps = {
    chord: defaultChord,
    displayConfig: defaultDisplayConfig,
    keySignature: 'C',
    x: 100,
    beatPosition: 'measure 1, beat 1',
    isSelected: false,
    isHovered: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders chord symbol text', () => {
      render(
        <svg>
          <ChordSymbol {...defaultProps} />
        </svg>
      );

      expect(screen.getByText('Cmaj7')).toBeInTheDocument();
    });

    it('renders as SVG text element', () => {
      render(
        <svg>
          <ChordSymbol {...defaultProps} />
        </svg>
      );

      const textElement = screen.getByText('Cmaj7');
      expect(textElement.tagName.toLowerCase()).toBe('text');
    });

    it('positions text at specified x coordinate', () => {
      render(
        <svg>
          <ChordSymbol {...defaultProps} x={150} />
        </svg>
      );

      const textElement = screen.getByText('Cmaj7');
      expect(textElement).toHaveAttribute('x', '150');
    });

    it('renders with data-chord-id attribute', () => {
      render(
        <svg>
          <ChordSymbol {...defaultProps} />
        </svg>
      );

      const textElement = screen.getByText('Cmaj7');
      expect(textElement).toHaveAttribute('data-chord-id', 'chord-1');
    });
  });

  describe('notation conversion', () => {
    it('applies notation conversion from ChordService', () => {
      const { convertNotation } = require('@/services/ChordService');

      render(
        <svg>
          <ChordSymbol {...defaultProps} />
        </svg>
      );

      expect(convertNotation).toHaveBeenCalledWith(
        'Cmaj7',
        'letter',
        'C',
        false
      );
    });

    it('converts to roman numerals when notation is roman', () => {
      const romanConfig: ChordDisplayConfig = {
        notation: 'roman',
        useSymbols: false,
      };

      const amChord: ChordSymbolType = {
        id: 'chord-2',
        quant: 24,
        symbol: 'Am7',
      };

      render(
        <svg>
          <ChordSymbol
            {...defaultProps}
            chord={amChord}
            displayConfig={romanConfig}
          />
        </svg>
      );

      expect(screen.getByText('vi7')).toBeInTheDocument();
    });

    it('applies typographic symbols when useSymbols is true', () => {
      const symbolConfig: ChordDisplayConfig = {
        notation: 'letter',
        useSymbols: true,
      };

      render(
        <svg>
          <ChordSymbol {...defaultProps} displayConfig={symbolConfig} />
        </svg>
      );

      // Mock converts maj7 -> Δ7 when useSymbols is true
      expect(screen.getByText('CΔ7')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('has correct aria-label for accessibility', () => {
      render(
        <svg>
          <ChordSymbol {...defaultProps} />
        </svg>
      );

      const textElement = screen.getByLabelText('C major seventh at measure 1, beat 1');
      expect(textElement).toBeInTheDocument();
    });

    it('includes selected state in aria-label when selected', () => {
      render(
        <svg>
          <ChordSymbol {...defaultProps} isSelected={true} />
        </svg>
      );

      const textElement = screen.getByLabelText('C major seventh at measure 1, beat 1 (selected)');
      expect(textElement).toBeInTheDocument();
    });

    it('generates accessible name via ChordService', () => {
      const { getAccessibleChordName } = require('@/services/ChordService');

      render(
        <svg>
          <ChordSymbol {...defaultProps} />
        </svg>
      );

      expect(getAccessibleChordName).toHaveBeenCalledWith('Cmaj7');
    });

    it('includes beat position in aria-label', () => {
      render(
        <svg>
          <ChordSymbol {...defaultProps} beatPosition="measure 2, beat 3" />
        </svg>
      );

      const textElement = screen.getByLabelText('C major seventh at measure 2, beat 3');
      expect(textElement).toBeInTheDocument();
    });
  });

  describe('visual states', () => {
    it('applies base class by default', () => {
      render(
        <svg>
          <ChordSymbol {...defaultProps} />
        </svg>
      );

      const textElement = screen.getByText('Cmaj7');
      expect(textElement).toHaveClass('riff-ChordSymbol');
    });

    it('applies selected class when isSelected is true', () => {
      render(
        <svg>
          <ChordSymbol {...defaultProps} isSelected={true} />
        </svg>
      );

      const textElement = screen.getByText('Cmaj7');
      expect(textElement).toHaveClass('riff-ChordSymbol');
      expect(textElement).toHaveClass('riff-ChordSymbol--selected');
    });

    it('applies hovered class when isHovered is true', () => {
      render(
        <svg>
          <ChordSymbol {...defaultProps} isHovered={true} />
        </svg>
      );

      const textElement = screen.getByText('Cmaj7');
      expect(textElement).toHaveClass('riff-ChordSymbol');
      expect(textElement).toHaveClass('riff-ChordSymbol--hovered');
    });

    it('applies both selected and hovered classes when both are true', () => {
      render(
        <svg>
          <ChordSymbol {...defaultProps} isSelected={true} isHovered={true} />
        </svg>
      );

      const textElement = screen.getByText('Cmaj7');
      expect(textElement).toHaveClass('riff-ChordSymbol');
      expect(textElement).toHaveClass('riff-ChordSymbol--selected');
      expect(textElement).toHaveClass('riff-ChordSymbol--hovered');
    });

    it('does not apply selected class when isSelected is false', () => {
      render(
        <svg>
          <ChordSymbol {...defaultProps} isSelected={false} />
        </svg>
      );

      const textElement = screen.getByText('Cmaj7');
      expect(textElement).not.toHaveClass('riff-ChordSymbol--selected');
    });

    it('does not apply hovered class when isHovered is false', () => {
      render(
        <svg>
          <ChordSymbol {...defaultProps} isHovered={false} />
        </svg>
      );

      const textElement = screen.getByText('Cmaj7');
      expect(textElement).not.toHaveClass('riff-ChordSymbol--hovered');
    });
  });

  describe('pointer events', () => {
    it('has pointerEvents set to none', () => {
      render(
        <svg>
          <ChordSymbol {...defaultProps} />
        </svg>
      );

      const textElement = screen.getByText('Cmaj7');
      expect(textElement).toHaveAttribute('pointer-events', 'none');
    });
  });
});
