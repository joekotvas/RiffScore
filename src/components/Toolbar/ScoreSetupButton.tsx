/**
 * ScoreSetupButton
 *
 * Toolbar button for opening the Score Setup dialog.
 * Displays a gear icon with tooltip showing keyboard shortcut.
 *
 * @module components/Toolbar/ScoreSetupButton
 */
import React from 'react';
import { Settings } from 'lucide-react';
import { getModifierKey } from '@/utils/platform';
import ToolbarButton from './ToolbarButton';

// =============================================================================
// COMPONENT
// =============================================================================

interface ScoreSetupButtonProps {
  /** Handler called when button is clicked */
  onClick: () => void;
  /** Visual style variant */
  variant?: 'default' | 'ghost';
}

/**
 * Score Setup button component.
 *
 * Opens the Score Setup dialog for editing metadata and layout configuration.
 * Displays tooltip with keyboard shortcut (Cmd/Ctrl + ,).
 */
const ScoreSetupButton: React.FC<ScoreSetupButtonProps> = ({ onClick, variant = 'default' }) => {
  // Build tooltip with keyboard shortcut
  const modKey = getModifierKey();
  const tooltip = `Score Setup (${modKey}+,)`;

  return (
    <ToolbarButton
      icon={<Settings size={14} />}
      label="Score Setup"
      title={tooltip}
      onClick={onClick}
      preventFocus={true}
      variant={variant}
    />
  );
};

export default ScoreSetupButton;
