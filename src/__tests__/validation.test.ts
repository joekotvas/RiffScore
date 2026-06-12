import { isValidPitch, parseDuration, clampBpm, canModifyEventDuration } from '../utils/validation';
import { ScoreEvent } from '../types';

describe('Validation Utils', () => {
  describe('isValidPitch', () => {
    test('accepts valid scientific notation', () => {
      expect(isValidPitch('C4')).toBe(true);
      expect(isValidPitch('G#5')).toBe(true);
      expect(isValidPitch('Bbb3')).toBe(true);
    });

    test('rejects invalid inputs', () => {
      expect(isValidPitch('H4')).toBe(false);
      expect(isValidPitch('not a note')).toBe(false);
      expect(isValidPitch('')).toBe(false);
    });

    test('accepts null (for rests)', () => {
      expect(isValidPitch(null)).toBe(true);
    });

    test('accepts case-insensitive', () => {
      expect(isValidPitch('c4')).toBe(true);
    });
  });

  describe('parseDuration', () => {
    test('returns valid durations unchanged', () => {
      expect(parseDuration('quarter')).toBe('quarter');
      expect(parseDuration('whole')).toBe('whole');
    });

    test('normalizes shorthands', () => {
      expect(parseDuration('q')).toBe('quarter');
      expect(parseDuration('4n')).toBe('quarter');
      expect(parseDuration('h')).toBe('half');
      expect(parseDuration('w')).toBe('whole');
    });

    test('returns null for invalid durations', () => {
      expect(parseDuration('bad')).toBeNull();
      expect(parseDuration('')).toBeNull();
    });
  });

  describe('clampBpm', () => {
    test('returns value within range', () => {
      expect(clampBpm(100)).toBe(100);
    });

    test('clamps low values', () => {
      expect(clampBpm(10)).toBe(30);
    });

    test('clamps high values', () => {
      expect(clampBpm(400)).toBe(300);
    });

    test('parses strings', () => {
      expect(clampBpm('120')).toBe(120);
    });

    test('defaults invalid strings', () => {
      expect(clampBpm('abc')).toBe(120);
    });
  });

  describe('canModifyEventDuration (#242 Lane D)', () => {
    // 4/4 = 64 quants: quarter=16, half=32, dotted-half=48, whole=64.
    const ev = (id: string, duration: string, dotted = false): ScoreEvent => ({
      id,
      duration,
      dotted,
      notes: [{ id: `${id}n`, pitch: 'C4' }],
    });

    test('allows a change that fits the remaining capacity', () => {
      const events = [ev('a', 'quarter'), ev('b', 'quarter')];
      expect(canModifyEventDuration(events, 'a', 'half', 64)).toBe(true); // 32 + 16 = 48 ≤ 64
    });

    test('rejects a change that would overflow', () => {
      const events = [ev('a', 'quarter'), ev('b', 'half')];
      expect(canModifyEventDuration(events, 'a', 'whole', 64)).toBe(false); // 64 + 32 = 96 > 64
    });

    test('accounts for the TARGET dotted state, not the current one', () => {
      const events = [ev('a', 'quarter'), ev('b', 'half')]; // b uses 32 → 32 free for a
      // Plain half (32) fits exactly; the dotted half (48) overflows.
      expect(canModifyEventDuration(events, 'a', 'half', 64, false)).toBe(true);
      expect(canModifyEventDuration(events, 'a', 'half', 64, true)).toBe(false);
    });
  });
});
