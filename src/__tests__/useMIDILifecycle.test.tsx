import { act, renderHook } from '@testing-library/react';
import { useMIDI } from '@/hooks/audio/useMIDI';
import { requestMIDIAccess, setupMIDIListeners } from '@/engines/midiEngine';
import type { Score } from '@/types';

jest.mock('@/engines/midiEngine', () => ({
  requestMIDIAccess: jest.fn(),
  setupMIDIListeners: jest.fn(),
  midiNoteToPitch: () => 'C4',
}));
jest.mock('@/engines/toneEngine', () => ({ playNote: jest.fn() }));
const scoreRef = { current: { staves: [] } as unknown as Score };
beforeEach(() => jest.clearAllMocks());

it('does not request a MIDI connection for disabled local transports', () => {
  renderHook(() => useMIDI(jest.fn(), 'quarter', false, null, scoreRef, false));
  expect(requestMIDIAccess).not.toHaveBeenCalled();
});

it('does not attach a listener when access resolves after unmount', async () => {
  let resolve!: (value: unknown) => void;
  (requestMIDIAccess as jest.Mock).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    })
  );
  const { unmount } = renderHook(() => useMIDI(jest.fn(), 'quarter', false, null, scoreRef));
  unmount();
  await act(async () => {
    resolve({ inputs: [{ name: 'Test keyboard' }], access: {}, error: null });
  });
  expect(setupMIDIListeners).not.toHaveBeenCalled();
});
