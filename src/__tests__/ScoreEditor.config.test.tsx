import { render, screen } from '@testing-library/react';
import React from 'react';
import { ScoreEditorContent } from '../components/Layout/ScoreEditor';
import { ScoreProvider } from '../context/ScoreContext';
import { ThemeProvider } from '../context/ThemeContext';

// Mock child components to isolate verification
jest.mock('../components/Canvas/ScoreCanvas', () => () => <div data-testid="score-canvas" />);
jest.mock('../components/Toolbar/Toolbar', () => () => <div data-testid="toolbar" />);
jest.mock('../components/Layout/ScoreTitleField', () => ({
  ScoreTitleField: () => <div data-testid="score-title-field" />,
}));
// ResizeObserver mock for ScoreTitleField internal logic if needed
window.ResizeObserver =
  window.ResizeObserver ||
  jest.fn().mockImplementation(() => ({
    disconnect: jest.fn(),
    observe: jest.fn(),
    unobserve: jest.fn(),
  }));

const renderEditor = (props: React.ComponentProps<typeof ScoreEditorContent>) => {
  return render(
    <ThemeProvider>
      <ScoreProvider>
        <ScoreEditorContent {...props} />
      </ScoreProvider>
    </ThemeProvider>
  );
};

describe('ScoreEditor Configuration', () => {
  it('renders background when showBackground is true (default)', () => {
    const { container } = renderEditor({ showBackground: true });
    // theme.panelBackground is usually #ffffff or similar. 
    // We check style attribute logic: backgroundColor should NOT be transparent.
    // The component sets style={{ backgroundColor: showBackground ? theme.panelBackground : 'transparent' }}
    const editor = container.firstChild as HTMLElement;
    expect(editor.style.backgroundColor).not.toBe('transparent');
  });

  it('renders transparent background when showBackground is false', () => {
    const { container } = renderEditor({ showBackground: false });
    const editor = container.firstChild as HTMLElement;
    expect(editor.style.backgroundColor).toBe('transparent');
  });

  it('renders score title when showScoreTitle is true (default)', () => {
    renderEditor({ showScoreTitle: true });
    expect(screen.getByTestId('score-title-field')).toBeInTheDocument();
  });

  it('hides score title when showScoreTitle is false', () => {
    renderEditor({ showScoreTitle: false });
    expect(screen.queryByTestId('score-title-field')).not.toBeInTheDocument();
  });
});
