import { useCallback, useRef, RefObject } from 'react';
import { Score, getActiveStaff } from '@/types';
import { canAddEventToMeasure } from '@/utils/validation';
import { getTupletRun } from '@/utils/tupletEdit';
import { resolvePitch, createPreviewNote, arePreviewsEqual, PreviewNote } from '@/utils/entry';
import { InputMode } from '../editor';
import { HitZone } from '@/engines/layout/types';

/**
 * Props for the useHoverPreview hook.
 */
export interface UseHoverPreviewProps {
  /** Ref to the current score */
  scoreRef: RefObject<Score>;
  /** Setter for preview note state */
  setPreviewNote: (
    note: PreviewNote | null | ((prev: PreviewNote | null) => PreviewNote | null)
  ) => void;
  /** Currently selected duration */
  activeDuration: string;
  /** Whether dotted is active */
  isDotted: boolean;
  /** Current accidental tool selection */
  activeAccidental: 'flat' | 'natural' | 'sharp' | null;
  /** Quants per measure for capacity checking */
  currentQuantsPerMeasure: number;
  /** Current input mode (NOTE or REST) */
  inputMode: InputMode;
  /** Surface a non-blocking message (e.g. hovering a full tuplet's insert gap). */
  setFeedback?: (message: string | null) => void;
}

/**
 * Return type for useHoverPreview hook.
 */
export interface UseHoverPreviewReturn {
  /** Handler for measure hover events */
  handleMeasureHover: (
    measureIndex: number | null,
    hit: HitZone | null,
    rawPitch: string,
    staffIndex?: number
  ) => void;
}

/**
 * Hook for handling measure hover events and preview note display.
 *
 * Responsibilities:
 * - Calculate resolved pitch based on accidentals and key signature
 * - Determine preview mode (APPEND/INSERT/CHORD)
 * - Check measure capacity
 * - Create and update preview note state
 *
 * @param props - Hook props
 * @returns Object with handleMeasureHover callback
 *
 * @example
 * ```typescript
 * const { handleMeasureHover } = useHoverPreview({
 *   scoreRef,
 *   setPreviewNote,
 *   activeDuration: 'quarter',
 *   isDotted: false,
 *   activeAccidental: null,
 *   currentQuantsPerMeasure: 16,
 *   inputMode: 'NOTE',
 * });
 * ```
 *
 * @tested src/__tests__/hooks/note/useHoverPreview.test.tsx
 */
export function useHoverPreview({
  scoreRef,
  setPreviewNote,
  activeDuration,
  isDotted,
  activeAccidental,
  currentQuantsPerMeasure,
  inputMode,
  setFeedback,
}: UseHoverPreviewProps): UseHoverPreviewReturn {
  // Debounce the "tuplet is full" notice so it fires once per hover-entry, not every mousemove frame.
  const fullTupletNoticeRef = useRef<string | null>(null);
  const handleMeasureHover = useCallback(
    (
      measureIndex: number | null,
      hit: HitZone | null,
      rawPitch: string,
      staffIndex: number = 0
    ) => {
      if (measureIndex === null || !hit) {
        // Only clear preview if this call is from the same staff as current preview
        // This prevents staff B's mouseLeave from clearing staff A's preview
        setPreviewNote((prev: PreviewNote | null) => {
          if (!prev) return null;
          if (prev.staffIndex === staffIndex) return null;
          return prev; // Different staff, keep current preview
        });
        return;
      }

      // If rawPitch is empty (Y position outside pitch range), keep previous preview
      // This prevents "dead zones" where hover does nothing
      if (!rawPitch) {
        return; // Keep existing preview state
      }

      const currentScore = scoreRef.current;
      const currentStaff = getActiveStaff(currentScore, staffIndex);
      const measure = currentStaff.measures[measureIndex];

      // Resolve pitch using utility
      const keySig = currentStaff.keySignature || currentScore.keySignature || 'C';
      const finalPitch = resolvePitch({
        rawPitch,
        accidental: activeAccidental,
        keySignature: keySig,
      });

      let targetMeasureIndex = measureIndex;
      let targetIndex = hit.index;
      let targetMode: 'APPEND' | 'INSERT' | 'CHORD' =
        hit.type === 'EVENT' ? 'CHORD' : hit.type === 'INSERT' ? 'INSERT' : 'APPEND';

      if (targetMode === 'INSERT' && targetIndex === measure.events.length) {
        targetMode = 'APPEND';
      }

      if (targetMode === 'APPEND') {
        if (
          !canAddEventToMeasure(measure.events, activeDuration, isDotted, currentQuantsPerMeasure)
        ) {
          if (measureIndex === currentStaff.measures.length - 1) {
            targetMeasureIndex = measureIndex + 1;
            targetIndex = 0;
          } else {
            setPreviewNote(null);
            return;
          }
        } else {
          if (measure.events.length > 0) {
            targetMode = 'INSERT';
            targetIndex = measure.events.length;
          }
        }
      } else if (targetMode === 'INSERT') {
        if (
          !canAddEventToMeasure(measure.events, activeDuration, isDotted, currentQuantsPerMeasure)
        ) {
          setPreviewNote(null);
          return;
        }
        // Between two members of the SAME tuplet group, a FULL group (no reserved slot) can't accept
        // an insert — don't render a ghost the commit would reject; instead surface a clear message
        // (once per hover-entry) so the rejection is visible rather than a silent dead zone.
        const prevEv = measure.events[targetIndex - 1];
        const hereEv = measure.events[targetIndex];
        if (prevEv?.tuplet && hereEv?.tuplet) {
          const run = getTupletRun(measure.events, targetIndex - 1);
          if (
            run &&
            targetIndex > run.start &&
            targetIndex <= run.end &&
            !measure.events.slice(run.start, run.end + 1).some((e) => e.reserved)
          ) {
            const noticeKey = `${measureIndex}:${prevEv.id}`;
            if (fullTupletNoticeRef.current !== noticeKey) {
              fullTupletNoticeRef.current = noticeKey;
              setFeedback?.('That tuplet is full — delete a note in it to make room.');
            }
            setPreviewNote(null);
            return;
          }
        }
      }
      // Not over a full-tuplet gap → allow the notice to fire again next time one is entered.
      fullTupletNoticeRef.current = null;

      // Build new preview using utility
      const newPreview = createPreviewNote({
        measureIndex: targetMeasureIndex,
        staffIndex,
        pitch: finalPitch,
        duration: activeDuration,
        dotted: isDotted,
        mode: targetMode,
        index: targetIndex,
        eventId: hit.type === 'EVENT' ? hit.eventId : undefined,
        isRest: inputMode === 'REST',
        source: 'hover',
      });

      // Only update if preview actually changed to avoid flickering
      setPreviewNote((prev: PreviewNote | null) => {
        if (arePreviewsEqual(prev, newPreview)) {
          return prev; // Return same reference to avoid re-render
        }
        return newPreview;
      });
    },
    [
      activeDuration,
      isDotted,
      currentQuantsPerMeasure,
      scoreRef,
      setPreviewNote,
      activeAccidental,
      inputMode,
      setFeedback,
    ]
  );

  return { handleMeasureHover };
}
