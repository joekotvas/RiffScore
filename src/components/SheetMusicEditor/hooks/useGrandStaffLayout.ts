import { useMemo } from 'react';
import { CONFIG } from '../config';
import { calculateSystemLayout, calculateMeasureLayout, getNoteWidth, calculateHeaderLayout, calculateMeasureWidth } from '../engines/layout';
import { Score, getActiveStaff } from '../types';

interface UseGrandStaffLayoutProps {
  score: Score;
  playbackPosition: { measureIndex: number | null; eventIndex: number | null; duration: number };
  activeStaff: any; // Using activeStaff from ScoreCanvas for now
  keySignature: string;
  clef: string;
}

export const useGrandStaffLayout = ({
  score,
  playbackPosition,
  activeStaff,
  keySignature,
  clef
}: UseGrandStaffLayoutProps) => {

  // Calculate synchronized measure layouts for Grand Staff
  const synchronizedLayoutData = useMemo(() => {
    if (!score.staves || score.staves.length <= 1) return undefined;
    
    const maxMeasures = Math.max(...score.staves.map((s: any) => s.measures?.length || 0));
    const layouts: { width: number, forcedPositions: Record<number, number> }[] = [];
    
    for (let i = 0; i < maxMeasures; i++) {
        const measuresAtIndices = score.staves.map((staff: any) => staff.measures?.[i]).filter(Boolean);
        
        if (measuresAtIndices.length > 0) {
            const forcedPositions = calculateSystemLayout(measuresAtIndices);
            const maxX = Math.max(...Object.values(forcedPositions));
            
            const isPickup = measuresAtIndices[0]?.isPickup;
            const minDuration = isPickup ? 'quarter' : 'whole';
            const minWidth = getNoteWidth(minDuration, false) + CONFIG.measurePaddingLeft + CONFIG.measurePaddingRight;
            
            const width = Math.max(maxX + CONFIG.measurePaddingRight, minWidth);
            
            layouts.push({ width, forcedPositions });
        } else {
            const minWidth = getNoteWidth('whole', false) + CONFIG.measurePaddingLeft + CONFIG.measurePaddingRight;
            layouts.push({ width: minWidth, forcedPositions: {} });
        }
    }
    return layouts;
  }, [score.staves]);

  const numStaves = score.staves?.length || 1;
  const isGrandStaff = numStaves > 1;

  const unifiedCursorX = useMemo(() => {
    if (!isGrandStaff) return null;
    if (playbackPosition.measureIndex === null || playbackPosition.eventIndex === null) return null;
    
    const { startOfMeasures } = calculateHeaderLayout(keySignature);
    let cursorX = startOfMeasures;
    
    for (let i = 0; i < playbackPosition.measureIndex; i++) {
      if (activeStaff.measures && activeStaff.measures[i]) {
        cursorX += calculateMeasureWidth(activeStaff.measures[i].events, activeStaff.measures[i].isPickup);
      }
    }
    
    const measure = activeStaff.measures ? activeStaff.measures[playbackPosition.measureIndex] : null;
    if (measure && measure.events[playbackPosition.eventIndex]) {
      const layout = calculateMeasureLayout(measure.events, undefined, clef);
      const event = measure.events[playbackPosition.eventIndex];
      cursorX += layout.eventPositions[event.id] || CONFIG.measurePaddingLeft;
    }
    
    return cursorX;
  }, [isGrandStaff, playbackPosition, activeStaff.measures, keySignature, clef]);

  return { synchronizedLayoutData, unifiedCursorX, isGrandStaff, numStaves };
};
