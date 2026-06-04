/**
 * Accidental "derived mirror" consistency (Phase 1.5 seam fixes #1 + #2).
 *
 * note.accidental is a DERIVED MIRROR of note.pitch (pitch is the source of
 * truth). Two seams from the parallel lanes:
 *   #1 system.ts read the raw `n.accidental` for spacing while its sibling
 *      measure.ts derived from pitch — so they disagreed when the mirror was
 *      null/stale (e.g. demo-melody notes ship F#4 with no accidental field).
 *      Both now share pitchHasAlteration.
 *   #2 useToolsSync synced the raw mirror; deriveAccidental returns 'natural' for
 *      a plain note, so selecting one leaked a sticky 'natural' that suppressed
 *      key-signature snapping on the next entry. It now derives from pitch and
 *      never leaks a natural.
 */

import { renderHook } from '@testing-library/react';
import { useToolsSync } from '@/hooks/score/useToolsSync';
import { pitchHasAlteration } from '@/services/MusicService';
import { Score, Selection } from '@/types';

describe('pitchHasAlteration — the single shared accidental-space predicate', () => {
  it.each(['F#4', 'Bb3', 'Fx4', 'Dbb4', 'G##2'])('is true for altered pitch %s', (p) => {
    expect(pitchHasAlteration(p)).toBe(true);
  });

  it.each(['C4', 'F4', 'B3'])('is false for an unaltered pitch %s', (p) => {
    expect(pitchHasAlteration(p)).toBe(false);
  });

  it('is false for null/undefined (rest / missing pitch)', () => {
    expect(pitchHasAlteration(null)).toBe(false);
    expect(pitchHasAlteration(undefined)).toBe(false);
  });
});

// A score whose note carries NO `accidental` field — exactly the stale/null-mirror
// case (a loaded melody, or a note just transposed onto an alteration).
const scoreWith = (pitch: string): Score => ({
  title: 'T',
  timeSignature: '4/4',
  keySignature: 'C',
  bpm: 120,
  staves: [
    {
      id: 's1',
      clef: 'treble',
      keySignature: 'C',
      measures: [
        { id: 'm1', events: [{ id: 'e1', duration: 'quarter', dotted: false, notes: [{ id: 'n1', pitch }] }] },
      ],
    },
  ],
});

const selectFirstNote = (): Selection =>
  ({
    staffIndex: 0,
    measureIndex: 0,
    eventId: 'e1',
    noteId: 'n1',
    selectedNotes: [],
    anchor: null,
    chordId: null,
    chordTrackFocused: false,
  }) as unknown as Selection;

const syncFor = (pitch: string): jest.Mock => {
  const setActiveAccidental = jest.fn();
  renderHook(() =>
    useToolsSync({
      score: scoreWith(pitch),
      selection: selectFirstNote(),
      inputMode: 'NOTE',
      setActiveAccidental,
      setActiveTie: jest.fn(),
      setInputMode: jest.fn(),
    })
  );
  return setActiveAccidental;
};

describe('useToolsSync derives the sticky accidental from pitch (not the raw mirror)', () => {
  it('a plain note sets NO sticky accidental — never leaks a natural (the key-snap regression)', () => {
    const fn = syncFor('C4');
    expect(fn).toHaveBeenCalledWith(null);
    expect(fn).not.toHaveBeenCalledWith('natural');
  });

  it('a sharp note with a null/stale mirror derives sharp from the pitch', () => {
    expect(syncFor('F#4')).toHaveBeenCalledWith('sharp');
  });

  it('a flat note derives flat from the pitch', () => {
    expect(syncFor('Bb3')).toHaveBeenCalledWith('flat');
  });
});
