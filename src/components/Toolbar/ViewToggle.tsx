/**
 * ViewToggle
 *
 * Toolbar button for toggling between scroll view and page view modes.
 * Uses the Score API to get and toggle the current view mode.
 *
 * @module components/Toolbar/ViewToggle
 */
import React from 'react';
import { useScoreContext } from '@/context/ScoreContext';
import { SetViewModeCommand } from '@/commands/layout';
import { DEFAULT_LAYOUT_CONFIG } from '@/config';
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
 * Scroll view icon - horizontal lines representing continuous scroll.
 */
const ScrollViewIcon: React.FC<IconProps> = ({ size = CONFIG.toolbar.iconSize }) => (
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
    {/* Three horizontal lines representing continuous scroll */}
    <line x1="4" y1="6" x2="20" y2="6" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="18" x2="20" y2="18" />
  </svg>
);

/**
 * Page view icon - document/page representation.
 */
const PageViewIcon: React.FC<IconProps> = ({ size = CONFIG.toolbar.iconSize }) => (
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
    {/* Page outline with folded corner */}
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    {/* Content lines */}
    <line x1="8" y1="13" x2="16" y2="13" />
    <line x1="8" y1="17" x2="16" y2="17" />
  </svg>
);

// =============================================================================
// COMPONENT
// =============================================================================

interface ViewToggleProps {
  /** Visual style variant */
  variant?: 'default' | 'ghost';
}

/**
 * View mode toggle button component.
 *
 * Shows the icon for the opposite mode (clicking shows what you'll get):
 * - In scroll view: shows page icon (click to switch to page view)
 * - In page view: shows scroll icon (click to switch to scroll view)
 *
 * Displays tooltip with keyboard shortcut.
 */
const ViewToggle: React.FC<ViewToggleProps> = ({ variant = 'default' }) => {
  const ctx = useScoreContext();
  const { score } = ctx.state;
  const { dispatch } = ctx.engines;

  // Get current view mode from layout config
  const viewMode = score.layout?.viewMode ?? DEFAULT_LAYOUT_CONFIG.viewMode;
  const isPageView = viewMode === 'page';

  // Toggle handler
  const handleToggle = (): void => {
    const newMode = isPageView ? 'scroll' : 'page';
    dispatch(new SetViewModeCommand(newMode));
  };

  // Build tooltip with keyboard shortcut
  const modKey = getModifierKey();
  const tooltip = isPageView
    ? `Switch to Scroll View (${modKey}+\\)`
    : `Switch to Page View (${modKey}+\\)`;

  const label = isPageView ? 'Scroll View' : 'Page View';

  return (
    <ToolbarButton
      icon={isPageView ? <ScrollViewIcon /> : <PageViewIcon />}
      label={label}
      title={tooltip}
      onClick={handleToggle}
      preventFocus={true}
      variant={variant}
    />
  );
};

export default ViewToggle;
