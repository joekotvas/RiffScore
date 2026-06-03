import { render, screen } from '@testing-library/react';
import React from 'react';
import { ScoreEditorContent } from '../components/Layout/ScoreEditor';
import { ScoreProvider } from '../context/ScoreContext';
import { ThemeProvider } from '../context/ThemeContext';

// Mock child components to isolate verification
jest.mock('../components/Canvas/ScoreCanvas', () => () => <div data-testid="score-canvas" />);
jest.mock('../components/Toolbar/Toolbar', () => () => <div data-testid="toolbar" />);
// Mock audio hooks to prevent async state updates during render tests
jest.mock('../hooks/audio', () => ({
  usePlayback: () => ({
    isPlaying: false,
    isActive: false,
    playbackPosition: 0,
    handlePlayToggle: jest.fn(),
    exitPlaybackMode: jest.fn(),
  }),
  useMIDI: () => ({
    midiStatus: { connected: false, error: null },
  }),
  useSamplerStatus: () => true,
  useAudioFeedback: () => jest.fn(),
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
    renderEditor({ showBackground: true });
    // theme.panelBackground is usually #ffffff or similar.
    // We check via toHaveStyle. 'transparent' is the key thing to avoid.
    const editor = screen.getByTestId('score-editor');
    expect(editor).not.toHaveStyle({ backgroundColor: 'transparent' });
  });

  it('renders transparent background when showBackground is false', () => {
    renderEditor({ showBackground: false });
    const editor = screen.getByTestId('score-editor');
    // Check style attribute directly to avoid computed style ambiguities
    // jest-dom toHaveStyle can be tricky with 'transparent'
    expect(editor).toHaveAttribute(
      'style',
      expect.stringContaining('background-color: transparent')
    );
  });
});
