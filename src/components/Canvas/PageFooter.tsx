/**
 * PageFooter - Renders page number at bottom of page
 *
 * Positioned in the bottom margin area.
 * Uses pre-computed positions from FooterLayout.
 */

import React from 'react';
import type { FooterLayout } from '@/types';

export interface PageFooterProps {
  /** Pre-computed footer layout with positions */
  footer: FooterLayout;
  /** Whether to show the page number (default: true) */
  showPageNumber?: boolean;
}

/**
 * Renders page footer with page number.
 * Position is pre-computed by PageLayoutService.
 */
export const PageFooter: React.FC<PageFooterProps> = ({ footer, showPageNumber = true }) => {
  if (!showPageNumber) {
    return null;
  }

  return (
    <g className="riff-footer">
      <text
        x={footer.pageNumber.x}
        y={footer.pageNumber.y}
        textAnchor="middle"
        className="riff-footer__page-number"
      >
        {footer.pageNumber.text}
      </text>
    </g>
  );
};

export default PageFooter;
