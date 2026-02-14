/**
 * MetadataBlock - Renders score title and composer in page view
 *
 * Positioned at the top of the page within the content area.
 * Uses pre-computed positions from MetadataLayout.
 */

import React from 'react';
import type { MetadataLayout } from '@/types';

export interface MetadataBlockProps {
  /** Pre-computed metadata layout with positions */
  metadata: MetadataLayout;
}

/**
 * Renders score metadata (title, composer) at the top of a page.
 * Positions are pre-computed by PageLayoutService.
 */
export const MetadataBlock: React.FC<MetadataBlockProps> = ({ metadata }) => {
  // Nothing to render if no title
  if (!metadata.title) {
    return null;
  }

  return (
    <g className="riff-metadata">
      {/* Title - centered at top */}
      <text
        x={metadata.title.x}
        y={metadata.title.y}
        textAnchor="middle"
        className="riff-metadata__title"
      >
        {metadata.title.text}
      </text>

      {/* Composer - centered below title */}
      {metadata.composer && (
        <text
          x={metadata.composer.x}
          y={metadata.composer.y}
          textAnchor="middle"
          className="riff-metadata__composer"
        >
          {metadata.composer.text}
        </text>
      )}
    </g>
  );
};

export default MetadataBlock;
