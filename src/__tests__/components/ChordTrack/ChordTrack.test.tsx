/**
 * ChordTrack.test.tsx
 *
 * Unit tests for the ChordTrack container component.
 * Verifies chord rendering, positioning, click interactions, and editing state.
 *
 * @see ChordTrack
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { ChordTrack } from '@/components/Canvas/ChordTrack/ChordTrack';
import type { ChordSymbol, ChordDisplayConfig } from '@/types';

// Store the current mock position for coordinate transformation
// Reset in beforeEach to prevent test pollution
let mockClientX = 0;
let mockClientY = 0;

// Helper to set mock coordinates before events
const setMockCoordinates = (x: number, y: number) => {
  mockClientX = x;
  mockClientY = y;
};

// Reset mock state before each test to ensure isolation
beforeEach(() => {
  mockClientX = 0;
  mockClientY = 0;
});

// Mock SVG methods not available in JSDOM
// Using beforeAll for prototype modifications (only need to do once)
// but the mockClientX/mockClientY values reset in beforeEach
beforeAll(() => {
  // Mock getScreenCTM for all SVG elements
  const mockGetScreenCTM = jest.fn(() => ({
    inverse: () => ({}),
  }));

  Object.defineProperty(SVGElement.prototype, 'getScreenCTM', {
    value: mockGetScreenCTM,
    writable: true,
    configurable: true,
  });

  // Mock createSVGPoint for SVGSVGElement
  // Note: Uses the mutable mockClientX/mockClientY which are reset in beforeEach
  Object.defineProperty(SVGSVGElement.prototype, 'createSVGPoint', {
    value: function () {
      return {
        x: mockClientX,
        y: mockClientY,
        matrixTransform: () => ({ x: mockClientX, y: mockClientY }),
      };
    },
    writable: true,
    configurable: true,
  });
});

// Mock child components
jest.mock('@/components/Canvas/ChordTrack/ChordSymbol', () => ({
  ChordSymbol: ({ chord, isSelected, isHovered, x }: any) => (
    <text
      data-testid={`chord-symbol-${chord.id}`}
      data-selected={isSelected}
      data-hovered={isHovered}
      data-x={x}
    >
      {chord.symbol}
    </text>
  ),
}));

jest.mock('@/components/Canvas/ChordTrack/ChordInput', () => ({
  ChordInput: ({
    x,
    initialValue,
    onComplete,
    onCancel,
    onDelete,
    onNavigateNext,
    onNavigatePrevious,
  }: any) => (
    <foreignObject data-testid="chord-input" data-x={x}>
      <input
        data-testid="chord-input-field"
        defaultValue={initialValue}
        aria-label="chord input"
        onKeyDown={(e) => {
          if (e.key === 'Enter') onComplete(e.currentTarget.value);
          if (e.key === 'Escape') onCancel();
          if (e.key === 'Delete' && onDelete) onDelete();
          if (e.key === 'Tab' && !e.shiftKey && onNavigateNext)
            onNavigateNext(e.currentTarget.value);
          if (e.key === 'Tab' && e.shiftKey && onNavigatePrevious)
            onNavigatePrevious(e.currentTarget.value);
        }}
      />
    </foreignObject>
  ),
}));

// Mock the useModifierKeys hook
jest.mock('@hooks/editor', () => ({
  useModifierKeys: () => ({
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
  }),
}));

// Mock CSS import
jest.mock('@/components/Canvas/ChordTrack/ChordTrack.css', () => ({}));

describe('ChordTrack', () => {
  const mockChords: ChordSymbol[] = [
    { id: 'chord-1', quant: 0, symbol: 'Cmaj7' },
    { id: 'chord-2', quant: 24, symbol: 'Am7' },
    { id: 'chord-3', quant: 48, symbol: 'Dm7' },
  ];

  const mockDisplayConfig: ChordDisplayConfig = {
    notation: 'letter',
    useSymbols: false,
  };

  const mockMeasurePositions = [
    { x: 0, width: 200, quant: 0 },
    { x: 200, width: 200, quant: 96 },
  ];

  const mockQuantToX = (quant: number): number => {
    // Simple linear mapping: 1 quant = 2 pixels, starting at x=50
    return 50 + quant * 2;
  };

  const defaultProps = {
    chords: mockChords,
    displayConfig: mockDisplayConfig,
    keySignature: 'C',
    timeSignature: '4/4',
    validQuants: new Set([0, 24, 48, 72]),
    measurePositions: mockMeasurePositions,
    quantToX: mockQuantToX,
    trackY: 20,
    quantsPerMeasure: 96,
    noteYByQuant: new Map<number, number>(),
    collisionConfig: {
      MIN_DISTANCE_FROM_STAFF: 40,
      PADDING_ABOVE_NOTES: 12,
      MIN_Y: 0,
      PER_CHORD_MIN_Y: -20,
    },
    editingChordId: null,
    selectedChordId: null,
    creatingAtQuant: null,
    initialValue: null,
    onChordClick: jest.fn(),
    onChordSelect: jest.fn(),
    onEmptyClick: jest.fn(),
    onEditComplete: jest.fn(),
    onEditCancel: jest.fn(),
    onDelete: jest.fn(),
    onNavigateNext: jest.fn(),
    onNavigatePrevious: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    setMockCoordinates(0, 0);
  });

  describe('rendering chords', () => {
    it('renders all chord symbols', () => {
      render(
        <svg>
          <ChordTrack {...defaultProps} />
        </svg>
      );

      expect(screen.getByTestId('chord-symbol-chord-1')).toBeInTheDocument();
      expect(screen.getByTestId('chord-symbol-chord-2')).toBeInTheDocument();
      expect(screen.getByTestId('chord-symbol-chord-3')).toBeInTheDocument();
    });

    it('renders chord symbols at correct x positions via quantToX', () => {
      render(
        <svg>
          <ChordTrack {...defaultProps} />
        </svg>
      );

      // quant 0 -> x = 50 + 0*2 = 50
      expect(screen.getByTestId('chord-symbol-chord-1')).toHaveAttribute('data-x', '50');
      // quant 24 -> x = 50 + 24*2 = 98
      expect(screen.getByTestId('chord-symbol-chord-2')).toHaveAttribute('data-x', '98');
      // quant 48 -> x = 50 + 48*2 = 146
      expect(screen.getByTestId('chord-symbol-chord-3')).toHaveAttribute('data-x', '146');
    });

    it('marks selected chord correctly', () => {
      render(
        <svg>
          <ChordTrack {...defaultProps} selectedChordId="chord-2" />
        </svg>
      );

      expect(screen.getByTestId('chord-symbol-chord-1')).toHaveAttribute('data-selected', 'false');
      expect(screen.getByTestId('chord-symbol-chord-2')).toHaveAttribute('data-selected', 'true');
      expect(screen.getByTestId('chord-symbol-chord-3')).toHaveAttribute('data-selected', 'false');
    });

    it('renders with correct aria-label for region', () => {
      render(
        <svg>
          <ChordTrack {...defaultProps} />
        </svg>
      );

      const region = screen.getByRole('region', { name: /chord symbols/i });
      expect(region).toBeInTheDocument();
    });

    it('renders empty track when no chords provided', () => {
      render(
        <svg>
          <ChordTrack {...defaultProps} chords={[]} />
        </svg>
      );

      const region = screen.getByRole('region', { name: /chord symbols/i });
      expect(region).toBeInTheDocument();
      expect(screen.queryByTestId(/chord-symbol-/)).not.toBeInTheDocument();
    });
  });

  describe('chord click interactions', () => {
    it('calls onChordClick when clicking on existing chord', () => {
      const onChordClick = jest.fn();

      render(
        <svg data-testid="test-svg">
          <ChordTrack {...defaultProps} onChordClick={onChordClick} />
        </svg>
      );

      const hitArea = screen.getByTestId('chord-track-hit-area');

      // Set mock coordinates to return position at chord-1 (quant 0 -> x=50)
      setMockCoordinates(50, 0);

      fireEvent.click(hitArea, { clientX: 50, clientY: 0 });

      expect(onChordClick).toHaveBeenCalledWith('chord-1');
    });

    it('calls onChordSelect when CMD/CTRL+clicking on chord', () => {
      const onChordSelect = jest.fn();
      const onChordClick = jest.fn();

      render(
        <svg data-testid="test-svg">
          <ChordTrack {...defaultProps} onChordClick={onChordClick} onChordSelect={onChordSelect} />
        </svg>
      );

      const hitArea = screen.getByTestId('chord-track-hit-area');

      setMockCoordinates(50, 0);

      fireEvent.click(hitArea, { clientX: 50, clientY: 0, metaKey: true });

      expect(onChordSelect).toHaveBeenCalledWith('chord-1');
      expect(onChordClick).not.toHaveBeenCalled();
    });

    it('calls onChordSelect when CTRL+clicking on chord (Windows)', () => {
      const onChordSelect = jest.fn();
      const onChordClick = jest.fn();

      render(
        <svg data-testid="test-svg">
          <ChordTrack {...defaultProps} onChordClick={onChordClick} onChordSelect={onChordSelect} />
        </svg>
      );

      const hitArea = screen.getByTestId('chord-track-hit-area');

      setMockCoordinates(50, 0);

      fireEvent.click(hitArea, { clientX: 50, clientY: 0, ctrlKey: true });

      expect(onChordSelect).toHaveBeenCalledWith('chord-1');
      expect(onChordClick).not.toHaveBeenCalled();
    });
  });

  describe('empty space click', () => {
    it('calls onEmptyClick when clicking empty space at valid quant', () => {
      const onEmptyClick = jest.fn();

      // Add quant 72 to validQuants but no chord there
      const validQuants = new Set([0, 24, 48, 72]);

      render(
        <svg data-testid="test-svg">
          <ChordTrack {...defaultProps} validQuants={validQuants} onEmptyClick={onEmptyClick} />
        </svg>
      );

      const hitArea = screen.getByTestId('chord-track-hit-area');

      // Click at quant 72 (x = 50 + 72*2 = 194)
      setMockCoordinates(194, 0);

      fireEvent.click(hitArea, { clientX: 194, clientY: 0 });

      expect(onEmptyClick).toHaveBeenCalledWith(72);
    });

    it('does not call onEmptyClick when clicking far from valid quants', () => {
      const onEmptyClick = jest.fn();

      render(
        <svg data-testid="test-svg">
          <ChordTrack {...defaultProps} onEmptyClick={onEmptyClick} />
        </svg>
      );

      const hitArea = screen.getByTestId('chord-track-hit-area');

      // Click far from any valid quant (x = 500)
      setMockCoordinates(500, 0);

      fireEvent.click(hitArea, { clientX: 500, clientY: 0 });

      expect(onEmptyClick).not.toHaveBeenCalled();
    });
  });

  describe('editing state', () => {
    it('shows ChordInput when editingChordId matches a chord', () => {
      render(
        <svg>
          <ChordTrack {...defaultProps} editingChordId="chord-2" />
        </svg>
      );

      expect(screen.getByTestId('chord-input')).toBeInTheDocument();
      // The chord symbol should not be rendered when editing
      expect(screen.queryByTestId('chord-symbol-chord-2')).not.toBeInTheDocument();
      // Other chords should still be visible
      expect(screen.getByTestId('chord-symbol-chord-1')).toBeInTheDocument();
      expect(screen.getByTestId('chord-symbol-chord-3')).toBeInTheDocument();
    });

    it('shows ChordInput at correct position when editing', () => {
      render(
        <svg>
          <ChordTrack {...defaultProps} editingChordId="chord-2" />
        </svg>
      );

      // chord-2 is at quant 24 -> x = 98
      const input = screen.getByTestId('chord-input');
      expect(input).toHaveAttribute('data-x', '98');
    });

    it('passes chord symbol as initialValue when editing existing chord', () => {
      render(
        <svg>
          <ChordTrack {...defaultProps} editingChordId="chord-2" />
        </svg>
      );

      const inputField = screen.getByTestId('chord-input-field');
      expect(inputField).toHaveValue('Am7');
    });

    it('uses initialValue prop when provided for editing', () => {
      render(
        <svg>
          <ChordTrack {...defaultProps} editingChordId="chord-2" initialValue="G" />
        </svg>
      );

      const inputField = screen.getByTestId('chord-input-field');
      expect(inputField).toHaveValue('G');
    });

    it('shows ChordInput for new chord creation', () => {
      render(
        <svg>
          <ChordTrack {...defaultProps} editingChordId="new" creatingAtQuant={72} />
        </svg>
      );

      expect(screen.getByTestId('chord-input')).toBeInTheDocument();
      // Input for new chord should be at quant 72 -> x = 194
      expect(screen.getByTestId('chord-input')).toHaveAttribute('data-x', '194');
    });

    it('passes empty string as initialValue for new chord', () => {
      render(
        <svg>
          <ChordTrack {...defaultProps} editingChordId="new" creatingAtQuant={72} />
        </svg>
      );

      const inputField = screen.getByTestId('chord-input-field');
      expect(inputField).toHaveValue('');
    });
  });

  describe('edit callbacks', () => {
    it('calls onEditComplete with chord id and value when editing completes', () => {
      const onEditComplete = jest.fn();

      render(
        <svg>
          <ChordTrack {...defaultProps} editingChordId="chord-1" onEditComplete={onEditComplete} />
        </svg>
      );

      const inputField = screen.getByTestId('chord-input-field');
      fireEvent.change(inputField, { target: { value: 'Fmaj7' } });
      fireEvent.keyDown(inputField, { key: 'Enter' });

      expect(onEditComplete).toHaveBeenCalledWith('chord-1', 'Fmaj7');
    });

    it('calls onEditComplete with null id for new chord creation', () => {
      const onEditComplete = jest.fn();

      render(
        <svg>
          <ChordTrack
            {...defaultProps}
            editingChordId="new"
            creatingAtQuant={72}
            onEditComplete={onEditComplete}
          />
        </svg>
      );

      const inputField = screen.getByTestId('chord-input-field');
      fireEvent.change(inputField, { target: { value: 'G7' } });
      fireEvent.keyDown(inputField, { key: 'Enter' });

      expect(onEditComplete).toHaveBeenCalledWith(null, 'G7');
    });

    it('calls onEditCancel when Escape pressed', () => {
      const onEditCancel = jest.fn();

      render(
        <svg>
          <ChordTrack {...defaultProps} editingChordId="chord-1" onEditCancel={onEditCancel} />
        </svg>
      );

      const inputField = screen.getByTestId('chord-input-field');
      fireEvent.keyDown(inputField, { key: 'Escape' });

      expect(onEditCancel).toHaveBeenCalled();
    });

    it('calls onDelete when Delete pressed during edit', () => {
      const onDelete = jest.fn();

      render(
        <svg>
          <ChordTrack {...defaultProps} editingChordId="chord-1" onDelete={onDelete} />
        </svg>
      );

      const inputField = screen.getByTestId('chord-input-field');
      fireEvent.keyDown(inputField, { key: 'Delete' });

      expect(onDelete).toHaveBeenCalledWith('chord-1');
    });

    it('calls onNavigateNext on Tab during edit', () => {
      const onNavigateNext = jest.fn();

      render(
        <svg>
          <ChordTrack {...defaultProps} editingChordId="chord-1" onNavigateNext={onNavigateNext} />
        </svg>
      );

      const inputField = screen.getByTestId('chord-input-field');
      fireEvent.change(inputField, { target: { value: 'Cmaj7' } });
      fireEvent.keyDown(inputField, { key: 'Tab' });

      expect(onNavigateNext).toHaveBeenCalledWith('chord-1', 'Cmaj7');
    });

    it('calls onNavigatePrevious on Shift+Tab during edit', () => {
      const onNavigatePrevious = jest.fn();

      render(
        <svg>
          <ChordTrack
            {...defaultProps}
            editingChordId="chord-1"
            onNavigatePrevious={onNavigatePrevious}
          />
        </svg>
      );

      const inputField = screen.getByTestId('chord-input-field');
      fireEvent.change(inputField, { target: { value: 'Cmaj7' } });
      fireEvent.keyDown(inputField, { key: 'Tab', shiftKey: true });

      expect(onNavigatePrevious).toHaveBeenCalledWith('chord-1', 'Cmaj7');
    });
  });

  describe('preview ghost chord', () => {
    it('does not show preview when editing', () => {
      render(
        <svg data-testid="test-svg">
          <ChordTrack {...defaultProps} editingChordId="new" creatingAtQuant={72} />
        </svg>
      );

      const previewGhost = screen.queryByTestId('chord-preview-ghost');
      expect(previewGhost).not.toBeInTheDocument();
    });

    it('does not show preview over existing chord positions', () => {
      // When not editing and not hovering, there should be no preview
      render(
        <svg data-testid="test-svg">
          <ChordTrack {...defaultProps} />
        </svg>
      );

      // Initially no preview ghost
      const previewGhost = screen.queryByTestId('chord-preview-ghost');
      expect(previewGhost).not.toBeInTheDocument();
    });
  });

  describe('mouse leave behavior', () => {
    it('clears hover state on mouse leave', () => {
      render(
        <svg data-testid="test-svg">
          <ChordTrack {...defaultProps} />
        </svg>
      );

      const hitArea = screen.getByTestId('chord-track-hit-area');

      // First hover to set state
      setMockCoordinates(50, 0);
      fireEvent.mouseMove(hitArea, { clientX: 50, clientY: 0 });

      // Then leave
      fireEvent.mouseLeave(hitArea);

      // Check that no chord is hovered (data-hovered should be false for all)
      const chord1 = screen.getByTestId('chord-symbol-chord-1');
      expect(chord1).toHaveAttribute('data-hovered', 'false');
    });
  });

  describe('track positioning', () => {
    it('applies trackY transform to the group', () => {
      render(
        <svg data-testid="test-svg">
          <ChordTrack {...defaultProps} trackY={30} />
        </svg>
      );

      const trackGroup = screen.getByTestId('chord-track');

      expect(trackGroup).toHaveAttribute('transform', 'translate(0, 30)');
    });
  });
});
