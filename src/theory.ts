/** Browser-independent musical queries. No React, CSS, DOM or audio initialization. */
export { recognizeChord, recognizeScoreChords } from './services/chord/ChordRecognition';
export { getMeasureTiming, getPlaybackOffset } from './services/MeasureTiming';
export type { MeasureTiming } from './services/MeasureTiming';
export { createTimeline } from './services/TimelineService';
export type { TimelineEvent } from './services/TimelineService';
export { getNoteDuration } from './utils/core';
export { getMeasureCapacity } from './constants';
export { parseChord, getChordVoicing } from './services/ChordService';
export type { Score, Staff, Measure, ScoreEvent, Note, ChordSymbol } from './types';
