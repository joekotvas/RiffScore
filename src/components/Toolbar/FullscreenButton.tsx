/**
 * FullscreenButton
 *
 * Toolbar button for toggling fullscreen mode.
 * Expands the score editor to fill the entire viewport.
 *
 * @module components/Toolbar/FullscreenButton
 */
import React from 'react';
import { CONFIG } from '@/config';
import { getModifierKey } from '@/utils/platform';
import ToolbarButton from './ToolbarButton';

// =============================================================================
// ICONS
// =============================================================================

interface IconProps {
  size?: number;
}

/**
 * Expand icon - arrows pointing outward to corners.
 */
const ExpandIcon: React.FC<IconProps> = ({ size = CONFIG.toolbar.iconSize }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {/* Top-left corner */}
    <polyline points="15 3 21 3 21 9" />
    <line x1="21" y1="3" x2="14" y2="10" />
    {/* Bottom-right corner */}
    <polyline points="9 21 3 21 3 15" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </svg>
);

/**
 * Collapse icon - arrows pointing inward from corners.
 */
const CollapseIcon: React.FC<IconProps> = ({ size = CONFIG.toolbar.iconSize }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {/* Top-right inward */}
    <polyline points="4 14 10 14 10 20" />
    <line x1="3" y1="21" x2="10" y2="14" />
    {/* Bottom-left inward */}
    <polyline points="20 10 14 10 14 4" />
    <line x1="21" y1="3" x2="14" y2="10" />
  </svg>
);

// =============================================================================
// COMPONENT
// =============================================================================

interface FullscreenButtonProps {
  /** Whether fullscreen mode is currently active */
  isFullscreen: boolean;
  /** Callback to toggle fullscreen mode */
  onToggle: () => void;
  /** Visual style variant */
  variant?: 'default' | 'ghost';
}

/**
 * Fullscreen toggle button component.
 *
 * Shows expand icon when not fullscreen, collapse icon when fullscreen.
 * Displays tooltip with keyboard shortcut.
 */
const FullscreenButton: React.FC<FullscreenButtonProps> = ({
  isFullscreen,
  onToggle,
  variant = 'default',
}) => {
  // Build tooltip with keyboard shortcut
  const modKey = getModifierKey();
  const tooltip = isFullscreen
    ? `Exit Fullscreen (${modKey}+Shift+F)`
    : `Enter Fullscreen (${modKey}+Shift+F)`;

  const label = isFullscreen ? 'Exit Fullscreen' : 'Fullscreen';

  return (
    <ToolbarButton
      icon={isFullscreen ? <CollapseIcon /> : <ExpandIcon />}
      label={label}
      title={tooltip}
      onClick={onToggle}
      isActive={isFullscreen}
      preventFocus={true}
      variant={variant}
    />
  );
};

export default FullscreenButton;
