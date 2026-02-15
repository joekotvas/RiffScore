/**
 * PrintButton
 *
 * Toolbar button for opening the browser's print dialog.
 * Displays a printer icon with tooltip showing keyboard shortcut.
 *
 * @module components/Toolbar/PrintButton
 */
import React from 'react';
import { Printer } from 'lucide-react';
import { openPrintDialog } from '@/services/PrintService';
import { getModifierKey } from '@/utils/platform';
import ToolbarButton from './ToolbarButton';

// =============================================================================
// COMPONENT
// =============================================================================

interface PrintButtonProps {
  /** Visual style variant */
  variant?: 'default' | 'ghost';
}

/**
 * Print button component.
 *
 * Opens the native browser print dialog for printing the score.
 * Displays tooltip with keyboard shortcut (Cmd/Ctrl + P).
 */
const PrintButton: React.FC<PrintButtonProps> = ({ variant = 'default' }) => {
  // Build tooltip with keyboard shortcut
  const modKey = getModifierKey();
  const tooltip = `Print (${modKey}+P)`;

  return (
    <ToolbarButton
      icon={<Printer size={14} />}
      label="Print"
      title={tooltip}
      onClick={openPrintDialog}
      preventFocus={true}
      variant={variant}
    />
  );
};

export default PrintButton;
