/**
 * PageBoundary - Renders page outline in page view mode
 *
 * Displays a subtle page border/shadow to indicate the page boundaries
 * and content area. Used only in page view mode.
 */

import React from 'react';
import type { PageLayout } from '@/types';

export interface PageBoundaryProps {
  /** Page layout with dimensions and margins */
  pageLayout: PageLayout;
}

/**
 * Renders the page boundary (outline) in page view mode.
 * Shows a white rectangle with subtle border to represent the page.
 */
export const PageBoundary: React.FC<PageBoundaryProps> = ({ pageLayout }) => {
  const { dimensions } = pageLayout;

  return (
    <rect
      x={0}
      y={0}
      width={dimensions.width}
      height={dimensions.height}
      className="riff-PageBoundary"
      fill="white"
      stroke="#ddd"
      strokeWidth={1}
    />
  );
};

export default PageBoundary;
