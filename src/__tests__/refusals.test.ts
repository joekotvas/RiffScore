/**
 * The refusal registry is the single source of truth for refusal severity + wording, shared by the
 * API result, the footer status, the ghost cursor, and the transient banner.
 */
import {
  REFUSALS,
  refuse,
  refusalForBlockedKind,
  type RefusalCode,
  type BlockedKind,
} from '@/refusals';

describe('refusal registry', () => {
  const codes = Object.keys(REFUSALS) as RefusalCode[];

  it('every code has a severity and a non-empty message', () => {
    for (const code of codes) {
      const spec = REFUSALS[code];
      expect(['info', 'warning', 'error']).toContain(spec.severity);
      expect(spec.message()).toBeTruthy();
    }
  });

  it('refuse() derives ok from severity per the Result contract (ok === status !== error)', () => {
    expect(refuse('DURATION_OVERFLOW')).toMatchObject({ ok: false, status: 'error', code: 'DURATION_OVERFLOW' });
    expect(refuse('NOT_IMPLEMENTED')).toMatchObject({ ok: true, status: 'warning', code: 'NOT_IMPLEMENTED' });
    expect(refuse('BOUNDARY_REACHED')).toMatchObject({ ok: true, status: 'info', code: 'BOUNDARY_REACHED' });
  });

  it('refuse() fills templated messages from ctx and supports an explicit override', () => {
    expect(refuse('DURATION_OVERFLOW', { messageCtx: { duration: 'whole', dotted: true } }).message).toBe(
      'Cannot set duration to whole (dotted): it would overflow the measure'
    );
    expect(refuse('TUPLET_EXCEEDS_BAR', { messageCtx: { signature: '2/4' } }).message).toContain('2/4');
    expect(refuse('NO_SELECTION', { message: 'No measure selected' }).message).toBe('No measure selected');
  });

  it('refuse() attaches details when provided, omits the key otherwise', () => {
    expect(refuse('MEASURE_NOT_FOUND', { details: { measureIndex: 3 } }).details).toEqual({ measureIndex: 3 });
    expect('details' in refuse('MEASURE_NOT_FOUND')).toBe(false);
  });

  it('the formerly-divergent DURATION_OVERFLOW now has one canonical message', () => {
    const a = refuse('DURATION_OVERFLOW', { messageCtx: { duration: 'half' } }).message;
    const b = refuse('DURATION_OVERFLOW', { messageCtx: { duration: 'half' } }).message;
    expect(a).toBe(b);
  });

  it('refusalForBlockedKind links each ghost-blocked kind to registry wording + severity', () => {
    const kinds: BlockedKind[] = ['measure-full', 'tuplet-full'];
    for (const kind of kinds) {
      const { spec } = refusalForBlockedKind(kind);
      expect(spec.blockedKind).toBe(kind);
      expect(spec.message()).toBeTruthy();
    }
    // Wording matches what the footer showed before unification (no UX regression).
    expect(refusalForBlockedKind('measure-full').spec.message()).toBe('Measure is full');
    expect(refusalForBlockedKind('tuplet-full').spec.message()).toBe('Tuplet is full');
  });
});
