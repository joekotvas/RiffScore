// RiffScore - Sheet Music Editor for React
// Main library exports

// Core styles (unified stylesheet)
import './styles/index.css';

// Core components
export { RiffScore } from './RiffScore';
export { default as ScoreEditor, ScoreEditorContent } from './components/Layout/ScoreEditor';

// Context providers and hooks
export { ThemeProvider, useTheme } from './context/ThemeContext';
export { ScoreProvider, useScoreContext } from './context/ScoreContext';

// UI Components
export { default as ConfigMenu } from './components/Layout/ConfigMenu';

// Importers (ABC notation / MusicXML / JSON → Score), usable without a mounted editor
export {
  importScoreText,
  importScoreData,
  parseABC,
  parseMusicXML,
  unpackScoreFile,
  detectImportFormat,
} from './importers';
export type {
  ImportFormat,
  ImportContent,
  ImportTextResult,
  AbcImportResult,
  MusicXmlImportResult,
} from './importers';

// Types
export type {
  Score,
  Selection,
  ScoreEvent,
  Note,
  Measure,
  Staff,
  RiffScoreConfig,
  DeepPartial,
  ChordDisplayConfig,
  ChordPlaybackConfig,
  ChordRecognitionConfig,
  EngravingConfig,
  TupletConfig,
  InteractionPolicy,
  InteractionConfig,
  ViewportConfig,
  AccidentalDisplay,
} from './types';

// API Types (Machine-Addressable Interface)
export type { MusicEditorAPI, RiffScoreRegistry, APIEventType, Unsubscribe } from './api.types';

export type { Theme, ThemeName } from './themes';

export type { RiffScoreProps } from './RiffScore';
export type {
  ScoreControls,
  RenderScoreControls,
  PlaybackCursorState,
} from './components/Layout/ScoreControls';

export { recognizeChord, recognizeScoreChords } from './services/chord/ChordRecognition';

export { RiffScoreSession, type RiffScoreSessionProps } from './context/RiffScoreSession';
export type { ScoreViewConfig, ScoreBounds } from './types';
export type { PlaybackState } from './api.types';

export {
  MusicGlyphProvider,
  getDefaultGlyphMetrics,
  type MusicGlyphAdapter,
  type MusicGlyphMetrics,
  type MusicGlyphProps,
} from './context/MusicGlyphContext';

export type {
  ScoreAnchor,
  ScoreOverlayContext,
  RenderScoreOverlay,
} from './components/Canvas/ScoreOverlay';
