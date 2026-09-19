/** Public, headless compatibility and presentation contracts. No editor internals. */
export type {
  ScoreViewGeometry,
  ScoreStaffGeometry,
  ResolveScoreViewport,
} from './components/Canvas/ScoreGeometry';

export const RIFFSCORE_EXTENSION_CONTRACT = 1 as const;
export const RIFFSCORE_CAPABILITIES = Object.freeze([
  'viewport-resolver',
  'viewport-autoscroll',
  'overlay-geometry',
  'api-ref',
  'reactive-controls',
  'glyph-adapter',
  'score-annotations',
] as const);

export interface RiffScoreExtensionDescriptor {
  id: string;
  version: string;
  contract: number;
  capabilities: readonly string[];
}

/** Check at the integration boundary. This does not register global state or enforce licensing. */
export function assertExtensionCompatibility(extension: RiffScoreExtensionDescriptor): void {
  const missing = extension.capabilities.filter(
    (name) => !(RIFFSCORE_CAPABILITIES as readonly string[]).includes(name)
  );
  if (extension.contract !== RIFFSCORE_EXTENSION_CONTRACT || missing.length) {
    throw new Error(
      `${extension.id}@${extension.version} requires RiffScore extension contract ${extension.contract}` +
        (missing.length ? `; missing capabilities: ${missing.join(', ')}` : '')
    );
  }
}

export type {
  ScoreAnnotations,
  ScoreAnnotationRow,
  AnnotationEventContext,
  AnnotationNoteContext,
  NoteheadAnnotation,
} from './components/Canvas/ScoreAnnotations';
