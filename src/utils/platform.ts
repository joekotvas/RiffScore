/**
 * Platform Detection Utilities
 *
 * Provides utilities for detecting the user's operating system
 * and returning appropriate UI strings for keyboard shortcuts.
 *
 * @module utils/platform
 */

/**
 * Checks if the current platform is macOS.
 *
 * @returns True if running on macOS
 */
export const isMac = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPod|iPhone|iPad/.test(navigator.platform);
};

/**
 * Checks if the current platform is Windows.
 *
 * @returns True if running on Windows
 */
export const isWindows = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /Win/.test(navigator.platform);
};

/**
 * Returns the appropriate modifier key symbol for the current platform.
 *
 * @returns Command symbol on Mac, 'Ctrl' on other platforms
 */
export const getModifierKey = (): string => {
  return isMac() ? '\u2318' : 'Ctrl';
};
