import { getOrderedPitches } from '../constants';

/**
 * Calculates a new pitch based on the current pitch and a direction.
 * Handles shift key for octave jumps.
 * @param currentPitch - The current pitch (e.g., 'C4')
 * @param direction - 'up' or 'down'
 * @param isShift - Whether shift key is pressed (for octave jump)
 * @param clef - The current clef ('treble' or 'bass')
 * @returns The new pitch or the current pitch if out of bounds
 */
export const calculateNewPitch = (
    currentPitch: string, 
    direction: string, 
    isShift: boolean, 
    clef: string = 'treble'
): string => {
    const orderedPitches = getOrderedPitches(clef);
    const currentIndex = orderedPitches.indexOf(currentPitch);
    if (currentIndex === -1) return currentPitch;

    let delta = direction === 'up' ? 1 : -1;
    if (isShift) delta *= 7;

    const newIndex = Math.max(0, Math.min(orderedPitches.length - 1, currentIndex + delta));
    return orderedPitches[newIndex];
};

/**
 * Calculates a new pitch based on an offset in steps.
 * @param currentPitch - The starting pitch
 * @param offset - Number of steps (positive = up, negative = down)
 * @param clef - The current clef
 * @returns The new pitch
 */
export const getPitchByOffset = (
    currentPitch: string, 
    offset: number, 
    clef: string = 'treble'
): string => {
    const orderedPitches = getOrderedPitches(clef);
    const currentIndex = orderedPitches.indexOf(currentPitch);
    if (currentIndex === -1) return currentPitch;

    const newIndex = Math.max(0, Math.min(orderedPitches.length - 1, currentIndex + offset));
    return orderedPitches[newIndex];
};
