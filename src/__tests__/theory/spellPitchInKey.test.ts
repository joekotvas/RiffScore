/**
 * spellPitchInKey — the key-aware enharmonic policy for #239.
 *
 * Policy (agreed):
 *  - in-key pitch class -> the key's diatonic spelling (wins over direction);
 *  - otherwise <= 1 accidental, natural preferred when available;
 *  - the remaining black-key tie broken by direction: 'sharp' (up) / 'flat' (down).
 * The helper MUST be sounding-pitch-preserving: Note.midi(out) === Note.midi(in).
 */

import { Note } from 'tonal';
import { spellPitchInKey } from '@/utils/keyResolution';

describe('spellPitchInKey', () => {
  it('spells an out-of-key black key by direction (C major)', () => {
    // pc C#/Db is not in C major -> direction decides.
    expect(spellPitchInKey('Db4', 'C', 'sharp')).toBe('C#4'); // up
    expect(spellPitchInKey('C#4', 'C', 'flat')).toBe('Db4'); // down
  });

  it('lets the key diatonic spelling win over direction (in-key)', () => {
    // C# is diatonic in D major -> stays C# even when descending ('flat').
    expect(spellPitchInKey('Db4', 'D', 'flat')).toBe('C#4');
    // Gb/F# is diatonic in D major -> F#, even ascending in a "flat-named" input.
    expect(spellPitchInKey('Gb4', 'D', 'sharp')).toBe('F#4');
  });

  it('prefers a natural over an accidental, regardless of direction', () => {
    // pc B is in C major -> B (natural), never Cb.
    expect(spellPitchInKey('Cb4', 'C', 'flat')).toBe('B3'); // octave from MIDI, not the string
    expect(spellPitchInKey('B3', 'C', 'flat')).toBe('B3');
    // Eb major: target E natural (from Eb+1=Fb) is out of key -> natural E wins.
    expect(spellPitchInKey('Fb4', 'Eb', 'sharp')).toBe('E4');
  });

  it('accepts a MIDI number as the target', () => {
    expect(spellPitchInKey(61, 'F', 'sharp')).toBe('C#4'); // out-of-key in F, up
    expect(spellPitchInKey(61, 'F', 'flat')).toBe('Db4'); // out-of-key in F, down
    expect(spellPitchInKey(61, 'D', 'sharp')).toBe('C#4'); // in-key D major
  });

  it('respells a multi-accidental input to <= 1 accidental (kills the explosion)', () => {
    for (const [input, key] of [
      ['Gbb4', 'C'],
      ['Abbb4', 'C'],
      ['Cbbbb5', 'C'],
      ['B###3', 'C'],
    ] as const) {
      const out = spellPitchInKey(input, key, 'sharp');
      expect(Math.abs(Note.get(out).alt)).toBeLessThanOrEqual(1);
    }
  });

  it('resolves spelling mode-aware in minor keys', () => {
    // Eb minor's natural scale contains Cb, so B4 (chroma 11) is in-key -> Cb5
    // (octave from MIDI: Cb5 and B4 are the same sounding pitch, midi 71).
    const inKey = spellPitchInKey('B4', 'Ebm', 'sharp');
    expect(inKey).toBe('Cb5');
    expect(Note.midi(inKey)).toBe(71);
    // A minor's natural scale has no G#/Ab -> out of key -> direction decides.
    expect(spellPitchInKey(68, 'Am', 'sharp')).toBe('G#4');
    expect(spellPitchInKey(68, 'Am', 'flat')).toBe('Ab4');
  });

  it('respells a multi-accidental input cleanly against a non-C key', () => {
    // In-key override: F##4 sounds G (chroma 7), diatonic in C -> plain G4.
    const inKey = spellPitchInKey('F##4', 'C', 'sharp');
    expect(inKey).toBe('G4');
    expect(Note.midi(inKey)).toBe(67);
    // Out-of-key in a non-C key: B##3 sounds C#4 (midi 61); C# is not in A minor
    // -> direction (sharp). Result is a single accidental, MIDI preserved.
    const outKey = spellPitchInKey('B##3', 'Am', 'sharp');
    expect(outKey).toBe('C#4');
    expect(Math.abs(Note.get(outKey).alt)).toBeLessThanOrEqual(1);
    expect(Note.midi(outKey)).toBe(61);
  });

  it('NEVER changes the sounding pitch (MIDI-preserving)', () => {
    const samples: Array<[string, string, 'sharp' | 'flat']> = [
      ['Db4', 'C', 'sharp'],
      ['Cb4', 'C', 'flat'],
      ['Fb4', 'Eb', 'sharp'],
      ['Gbb4', 'C', 'sharp'],
      ['Cbbbb5', 'C', 'flat'],
      ['F#5', 'G', 'sharp'],
    ];
    for (const [input, key, prefer] of samples) {
      expect(Note.midi(spellPitchInKey(input, key, prefer))).toBe(Note.midi(input));
    }
  });
});
