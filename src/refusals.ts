/**
 * Refusal Registry — the single source of truth for "what happened / why this can't proceed".
 *
 * Before this module, the same refusal was authored in up to four disjoint string-spaces: the API
 * `Result` ({@link RefusalCode} + message, src/api.types.ts), the proactive ghost cursor
 * (`previewNote.blocked`, src/types.ts), the derived footer status (useSelectionStatus.ts), and the
 * transient toolbar banner (bare strings). They drifted (e.g. three different DURATION_OVERFLOW
 * messages) and disagreed on severity. This registry unifies the VOCABULARY: one code union, one
 * severity per code, one canonical message — and the API result, footer status, ghost, and banner
 * all derive from it.
 *
 * Deliberately NOT unified here: selection-KIND ('note'|'chord'|'rest'|'chord-symbol' in
 * useSelectionStatus) is a presentation axis, not a refusal — it stays separate.
 *
 * This module is React-free and importable from both the model/command layer and the UI.
 *
 * @tested src/__tests__/refusals.test.ts
 */

/** Display severity. Mirrors {@link Result.status}: info = success, warning = caveat, error = failure. */
export type RefusalSeverity = 'info' | 'warning' | 'error';

/**
 * The two proactive "can't place input here" kinds shown by the ghost cursor. These mirror the
 * values of `previewNote.blocked` (src/types.ts) verbatim — `blockedKind` on a registry entry links
 * an API/footer refusal to the ghost so all three surfaces share one wording.
 */
export type BlockedKind = 'tuplet-full' | 'measure-full';

/**
 * The closed vocabulary of machine-readable refusal/status codes. Promotes what used to be a
 * free-form `code?: string` (which drifted unchecked) into a compile-checked union. Adding a refusal
 * reason means adding one entry here and one row in {@link REFUSALS}.
 */
export type RefusalCode =
  // --- selection / target resolution ---
  | 'NO_SELECTION'
  | 'NO_NOTE_SELECTED'
  | 'STAFF_NOT_FOUND'
  | 'MEASURE_NOT_FOUND'
  | 'EVENT_NOT_FOUND'
  | 'NOTE_NOT_FOUND'
  | 'INVALID_STAFF'
  | 'INVALID_MEASURE_INDEX'
  | 'NO_MEASURES'
  | 'NO_EVENT_AT_QUANT'
  | 'STALE_SELECTION'
  // --- note / duration entry ---
  | 'INVALID_PITCH'
  | 'INVALID_DURATION'
  | 'DURATION_OVERFLOW'
  | 'ADD_NOTE_FAILED'
  | 'ADD_REST_FAILED'
  // --- proactive "can't place here" (ghost cursor); see BlockedKind ---
  | 'MEASURE_FULL'
  | 'TUPLET_FULL'
  // --- tuplets ---
  | 'TUPLET_EXCEEDS_BAR'
  | 'INSUFFICIENT_EVENTS'
  | 'NESTED_TUPLET_NOT_SUPPORTED'
  | 'INVALID_TUPLET_RATIO'
  | 'NON_UNIFORM_TUPLET'
  | 'NOT_A_TUPLET'
  // --- ties ---
  | 'NO_TIE_TARGET'
  // --- chords ---
  | 'CHORD_NOT_FOUND'
  | 'NO_CHORD_AT_POSITION'
  | 'INVALID_POSITION'
  | 'EMPTY_CHORD_TRACK'
  | 'CHORD_EMPTY'
  | 'CHORD_INVALID_ROOT'
  | 'CHORD_INVALID_QUALITY'
  | 'CHORD_INVALID_BASS'
  // --- navigation ---
  | 'BOUNDARY_REACHED'
  | 'INVALID_TARGET'
  // --- io / playback / misc ---
  | 'INVALID_SCORE'
  | 'SCORE_VALIDATION_WARNINGS'
  | 'EXPORT_NOT_IMPLEMENTED'
  | 'EXPORT_FAILED'
  | 'PLAYBACK_ERROR'
  | 'INVALID_INSTRUMENT'
  | 'NOT_IMPLEMENTED';

/** Context bag for templated messages (e.g. the offending duration or time signature). */
export type RefusalContext = Record<string, unknown>;

export interface RefusalSpec {
  /** Display tone. Drives both the API result status and the UI surface styling. */
  severity: RefusalSeverity;
  /** Canonical, single-sourced human message. `ctx` fills templated parts. */
  message: (ctx?: RefusalContext) => string;
  /** If this refusal corresponds to a proactive ghost-blocked state, the kind it links to. */
  blockedKind?: BlockedKind;
}

const s = (text: string) => () => text;

/**
 * The one table. Each code has exactly one severity and one canonical message; UI-facing refusals
 * also carry a `blockedKind`. Messages are seeded with the wording the surfaces showed before, so
 * existing snapshot/text assertions keep passing.
 */
export const REFUSALS: Record<RefusalCode, RefusalSpec> = {
  // --- selection / target resolution ---
  NO_SELECTION: { severity: 'error', message: s('No selection') },
  NO_NOTE_SELECTED: { severity: 'error', message: s('No note selected') },
  STAFF_NOT_FOUND: { severity: 'error', message: s('Staff not found') },
  MEASURE_NOT_FOUND: { severity: 'error', message: s('Measure not found') },
  EVENT_NOT_FOUND: { severity: 'error', message: s('Event not found') },
  NOTE_NOT_FOUND: { severity: 'error', message: s('Note not found') },
  INVALID_STAFF: { severity: 'error', message: s('Invalid staff index') },
  INVALID_MEASURE_INDEX: { severity: 'error', message: s('No measure selected or invalid index') },
  NO_MEASURES: { severity: 'error', message: s('No measures exist') },
  NO_EVENT_AT_QUANT: { severity: 'error', message: s('No event found at that position') },
  STALE_SELECTION: { severity: 'warning', message: s('The selected element no longer exists') },

  // --- note / duration entry ---
  INVALID_PITCH: {
    severity: 'error',
    message: (ctx) =>
      `Invalid pitch format${ctx?.pitch ? ` '${ctx.pitch}'` : ''}. Expected format: 'C4', 'F#5', 'Bb3', etc.`,
  },
  INVALID_DURATION: {
    severity: 'error',
    message: (ctx) => `Invalid duration${ctx?.duration ? `: "${ctx.duration}"` : ''}`,
  },
  DURATION_OVERFLOW: {
    severity: 'error',
    // Single-sourced (previously three divergent messages at modification.ts).
    message: (ctx) =>
      ctx?.duration
        ? `Cannot set duration to ${ctx.duration}${ctx.dotted ? ' (dotted)' : ''}: it would overflow the measure`
        : 'The new duration would overflow the measure',
  },
  ADD_NOTE_FAILED: {
    severity: 'error',
    message: (ctx) => (typeof ctx?.error === 'string' ? ctx.error : 'Could not add note'),
  },
  ADD_REST_FAILED: {
    severity: 'error',
    message: (ctx) => (typeof ctx?.error === 'string' ? ctx.error : 'Could not add rest'),
  },

  // --- proactive "can't place here" (ghost cursor). Wording mirrors useSelectionStatus exactly. ---
  MEASURE_FULL: { severity: 'warning', message: s('Measure is full'), blockedKind: 'measure-full' },
  TUPLET_FULL: { severity: 'warning', message: s('Tuplet is full'), blockedKind: 'tuplet-full' },

  // --- tuplets ---
  TUPLET_EXCEEDS_BAR: {
    severity: 'error',
    message: (ctx) =>
      `Cannot change to ${ctx?.signature ?? 'that time signature'}: a tuplet is longer than one bar of the new meter`,
  },
  INSUFFICIENT_EVENTS: { severity: 'error', message: s('Not enough events for a tuplet') },
  NESTED_TUPLET_NOT_SUPPORTED: { severity: 'error', message: s('Target events already contain a tuplet') },
  INVALID_TUPLET_RATIO: { severity: 'error', message: s('Invalid tuplet ratio') },
  NON_UNIFORM_TUPLET: { severity: 'error', message: s('Select notes of the same duration to form a tuplet') },
  NOT_A_TUPLET: { severity: 'warning', message: s('Selected event is not part of a tuplet') },

  // --- ties ---
  NO_TIE_TARGET: { severity: 'error', message: s('No matching note to tie to') },

  // --- chords ---
  CHORD_NOT_FOUND: { severity: 'error', message: s('Chord not found') },
  NO_CHORD_AT_POSITION: { severity: 'error', message: s('No chord at that position') },
  INVALID_POSITION: { severity: 'error', message: s('Chords must be placed at note positions') },
  EMPTY_CHORD_TRACK: { severity: 'warning', message: s('No chords in track') },
  CHORD_EMPTY: { severity: 'error', message: s('Enter a chord symbol') },
  CHORD_INVALID_ROOT: { severity: 'error', message: s('Unrecognized chord') },
  CHORD_INVALID_QUALITY: { severity: 'error', message: s('Unrecognized chord quality') },
  CHORD_INVALID_BASS: { severity: 'error', message: s('Invalid bass note') },

  // --- navigation ---
  BOUNDARY_REACHED: { severity: 'info', message: s('Reached the boundary') },
  INVALID_TARGET: { severity: 'error', message: s('Invalid navigation target') },

  // --- io / playback / misc ---
  INVALID_SCORE: { severity: 'error', message: s('Cannot load score: missing or empty staves') },
  SCORE_VALIDATION_WARNINGS: { severity: 'warning', message: s('Score loaded with validation issues') },
  EXPORT_NOT_IMPLEMENTED: {
    severity: 'error',
    message: (ctx) => `Export format '${ctx?.format ?? ''}' not yet implemented`,
  },
  EXPORT_FAILED: {
    severity: 'error',
    message: (ctx) => (typeof ctx?.error === 'string' ? `Export failed: ${ctx.error}` : 'Export failed'),
  },
  PLAYBACK_ERROR: {
    severity: 'error',
    message: (ctx) => (typeof ctx?.error === 'string' ? `Playback failed: ${ctx.error}` : 'Playback failed'),
  },
  INVALID_INSTRUMENT: { severity: 'error', message: s('Invalid instrument') },
  NOT_IMPLEMENTED: { severity: 'warning', message: s('Not implemented yet') },
};

/** The shape `refuse()` produces — a {@link Result} minus the per-call `method` and `timestamp`. */
export interface RefusalResult {
  ok: boolean;
  status: RefusalSeverity;
  code: RefusalCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface RefuseOptions {
  /** Fills templated parts of the canonical message. */
  messageCtx?: RefusalContext;
  /** Override the canonical message for a genuinely method-specific phrasing (use sparingly). */
  message?: string;
  /** Extra machine-readable context attached to the result. */
  details?: Record<string, unknown>;
}

/**
 * Build a result for a refusal/outcome from its code. Severity (and therefore `ok`, per the Result
 * contract `ok === status !== 'error'`) and the message come from the registry, so wording and tone
 * never drift across call sites.
 *
 * @example setResult({ method: 'setDuration', ...refuse('DURATION_OVERFLOW', { messageCtx: { duration } }) })
 */
export const refuse = (code: RefusalCode, opts: RefuseOptions = {}): RefusalResult => {
  const spec = REFUSALS[code];
  return {
    ok: spec.severity !== 'error',
    status: spec.severity,
    code,
    message: opts.message ?? spec.message(opts.messageCtx),
    ...(opts.details ? { details: opts.details } : {}),
  };
};

/** The first registry code whose `blockedKind` matches — links the ghost's proactive state to wording + severity. */
export const refusalForBlockedKind = (
  kind: BlockedKind
): { code: RefusalCode; spec: RefusalSpec } => {
  const entry = (Object.entries(REFUSALS) as [RefusalCode, RefusalSpec][]).find(
    ([, spec]) => spec.blockedKind === kind
  );
  // Every BlockedKind has a registry entry (MEASURE_FULL / TUPLET_FULL); the fallback is unreachable.
  if (!entry) return { code: 'MEASURE_FULL', spec: REFUSALS.MEASURE_FULL };
  return { code: entry[0], spec: entry[1] };
};
