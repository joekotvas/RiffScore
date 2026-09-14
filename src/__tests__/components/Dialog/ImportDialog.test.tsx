/**
 * ImportDialog.test.tsx
 *
 * The File menu's Import entry: paste or open ABC/JSON, preview what will load (title, staves,
 * bars, warnings), and import as one undoable step.
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FileMenu from '@/components/Toolbar/FileMenu';
import { ScoreProvider, useScoreContext } from '@/context/ScoreContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { createDefaultScore } from '@/types';

const TUNE = 'X:1\nT:Pasted Tune\nM:4/4\nL:1/8\nK:G\n|: G2 GAB | d2 dBA | G2 GAB | A2 A2 :|';

/** Reads the live score so the test can see what the dialog loaded. */
const ScoreProbe: React.FC = () => {
  const { state } = useScoreContext();
  return (
    <div data-testid="probe">
      {state.score.title}|{state.score.staves[0].measures.length}
    </div>
  );
};

const renderMenu = () =>
  render(
    <ThemeProvider>
      <ScoreProvider initialScore={createDefaultScore()}>
        <FileMenu score={createDefaultScore()} bpm={120} />
        <ScoreProbe />
      </ScoreProvider>
    </ThemeProvider>
  );

const openDialog = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'File Menu' }));
  await user.click(screen.getByRole('menuitem', { name: /ABC Notation or JSON/ }));
  return screen.getByRole('dialog', { name: /Import Score/ });
};

describe('ImportDialog', () => {
  beforeEach(() => {
    Element.prototype.scrollTo = jest.fn();
  });

  it('opens from the File menu with the text box focused and Import disabled', async () => {
    const user = userEvent.setup();
    renderMenu();
    await openDialog(user);

    expect(screen.getByLabelText('Score text')).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('previews pasted ABC and imports it as the current score', async () => {
    const user = userEvent.setup();
    renderMenu();
    await openDialog(user);

    await user.click(screen.getByLabelText('Score text'));
    await user.paste(TUNE);

    expect(screen.getByTestId('import-summary')).toHaveTextContent(
      'Ready to import Pasted Tune — 1 staff, 4 bars, ABC notation.'
    );
    expect(screen.getByTestId('import-warnings')).toHaveTextContent('1 thing to know:');
    expect(screen.getByTestId('import-warnings')).toHaveTextContent(
      /Repeat signs are not supported/
    );

    await user.click(screen.getByRole('button', { name: 'Import' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('probe')).toHaveTextContent('Pasted Tune|4');
  });

  it('imports with the keyboard shortcut', async () => {
    const user = userEvent.setup();
    renderMenu();
    await openDialog(user);

    await user.click(screen.getByLabelText('Score text'));
    await user.paste('X:1\nT:Shortcut\nK:C\nC D E F|');
    await user.keyboard('{Control>}{Enter}{/Control}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('probe')).toHaveTextContent('Shortcut|1');
  });

  it('explains input it cannot read and keeps Import disabled', async () => {
    const user = userEvent.setup();
    renderMenu();
    await openDialog(user);

    await user.click(screen.getByLabelText('Score text'));
    await user.paste('X:1\nT:Header only\n');

    expect(screen.getByTestId('import-error')).toHaveTextContent(
      'Could not read this as ABC notation: No music found in the ABC input'
    );
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
  });

  it('recognises the editor’s JSON', async () => {
    const user = userEvent.setup();
    renderMenu();
    await openDialog(user);

    const score = { ...createDefaultScore(), title: 'JSON Score' };
    await user.click(screen.getByLabelText('Score text'));
    await user.paste(JSON.stringify(score));

    expect(screen.getByTestId('import-summary')).toHaveTextContent(
      'Ready to import JSON Score — 2 staves, 2 bars, JSON.'
    );
    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(screen.getByTestId('probe')).toHaveTextContent('JSON Score|2');
  });

  it('loads a chosen file into the text box', async () => {
    const user = userEvent.setup();
    renderMenu();
    await openDialog(user);

    const file = new File([TUNE], 'kesh.abc', { type: 'text/plain' });
    await user.upload(screen.getByLabelText('Score file'), file);

    await waitFor(() => expect(screen.getByLabelText('Score text')).toHaveValue(TUNE));
    expect(screen.getByText('kesh.abc')).toBeInTheDocument();
    expect(screen.getByTestId('import-summary')).toHaveTextContent('Pasted Tune');
  });

  it('stays open when a drag that started in the text box ends on the backdrop', async () => {
    const user = userEvent.setup();
    renderMenu();
    await openDialog(user);
    const textarea = screen.getByLabelText('Score text');
    const backdrop = screen.getByTestId('import-backdrop');

    fireEvent.mouseDown(textarea);
    fireEvent.mouseUp(backdrop);
    fireEvent.click(backdrop);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.mouseDown(backdrop);
    fireEvent.mouseUp(backdrop);
    fireEvent.click(backdrop);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('hands focus back to the File menu button when it closes', async () => {
    const user = userEvent.setup();
    renderMenu();
    await openDialog(user);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'File Menu' })).toHaveFocus();
  });

  it('closes without importing on Cancel and on Escape', async () => {
    const user = userEvent.setup();
    renderMenu();
    await openDialog(user);
    await user.click(screen.getByLabelText('Score text'));
    await user.paste(TUNE);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('probe')).toHaveTextContent('Composition|2');

    await openDialog(user);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
