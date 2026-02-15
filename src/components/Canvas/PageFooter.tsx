/**
 * PageFooter - Renders page number and copyright at bottom of page
 *
 * Positioned in the bottom margin area.
 * Uses pre-computed positions from FooterLayout.
 * Supports inline editing of copyright (page 1 only).
 */

import React, { memo, useState, useCallback } from 'react';
import type { FooterLayout } from '@/types';
import { MetadataField } from './MetadataTrack/MetadataField';
import { MetadataInput } from './MetadataTrack/MetadataInput';

export interface PageFooterProps {
  /** Pre-computed footer layout with positions */
  footer: FooterLayout;
  /** Whether to show the page number (default: true) */
  showPageNumber?: boolean;
  /** Whether this is the first page (shows copyright) */
  isFirstPage?: boolean;
  /** Whether copyright is being edited */
  editingCopyright?: boolean;
  /** Whether copyright is selected */
  selectedCopyright?: boolean;
  /** Initial value for copyright editing */
  copyrightInitialValue?: string | null;
  /** Called when copyright field is clicked */
  onCopyrightClick?: () => void;
  /** Called when copyright is Cmd/Ctrl+clicked (select) */
  onCopyrightSelect?: () => void;
  /** Called when copyright editing completes */
  onCopyrightEditComplete?: (value: string) => void;
  /** Called when copyright editing is cancelled */
  onCopyrightEditCancel?: () => void;
  /** Called when copyright should be deleted */
  onCopyrightDelete?: () => void;
}

/**
 * Renders page footer with page number and optional copyright.
 * Position is pre-computed by PageLayoutService.
 */
export const PageFooter = memo(function PageFooter({
  footer,
  showPageNumber = true,
  isFirstPage = false,
  editingCopyright = false,
  selectedCopyright = false,
  copyrightInitialValue,
  onCopyrightClick,
  onCopyrightSelect,
  onCopyrightEditComplete,
  onCopyrightEditCancel,
  onCopyrightDelete,
}: PageFooterProps) {
  const [isCopyrightHovered, setIsCopyrightHovered] = useState(false);

  const handleCopyrightMouseEnter = useCallback(() => {
    setIsCopyrightHovered(true);
  }, []);

  const handleCopyrightMouseLeave = useCallback(() => {
    setIsCopyrightHovered(false);
  }, []);

  const handleCopyrightClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      if (e.metaKey || e.ctrlKey) {
        onCopyrightSelect?.();
      } else {
        onCopyrightClick?.();
      }
    },
    [onCopyrightClick, onCopyrightSelect]
  );

  // Stop mousedown propagation
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const showCopyright = isFirstPage && footer.copyright;
  const copyrightValue = footer.copyright?.text ?? '';
  const showCopyrightPreview = isCopyrightHovered && !copyrightValue && !editingCopyright;

  return (
    <g className="riff-footer" data-testid="page-footer">
      {/* Page number */}
      {showPageNumber && (
        <text
          x={footer.pageNumber.x}
          y={footer.pageNumber.y}
          textAnchor="middle"
          className="riff-footer__page-number"
        >
          {footer.pageNumber.text}
        </text>
      )}

      {/* Copyright (page 1 only) */}
      {showCopyright && footer.copyright && (
        <>
          {editingCopyright ? (
            <MetadataInput
              x={footer.copyright.x}
              y={footer.copyright.y}
              initialValue={copyrightInitialValue ?? copyrightValue}
              placeholder="Copyright"
              fontSize="10px"
              fontWeight="normal"
              textAlign="center"
              required={false}
              onComplete={(value) => onCopyrightEditComplete?.(value)}
              onCancel={() => onCopyrightEditCancel?.()}
              onDelete={() => onCopyrightDelete?.()}
            />
          ) : (
            <g>
              {/* Hit area for copyright */}
              <rect
                x={footer.copyright.x - 150}
                y={footer.copyright.y - 12}
                width={300}
                height={24}
                fill="transparent"
                style={{ cursor: copyrightValue || showCopyrightPreview ? 'text' : 'default' }}
                onMouseEnter={handleCopyrightMouseEnter}
                onMouseLeave={handleCopyrightMouseLeave}
                onClick={handleCopyrightClick}
                onMouseDown={handleMouseDown}
              />
              {(copyrightValue || showCopyrightPreview || selectedCopyright) && (
                <MetadataField
                  field="copyright"
                  value={copyrightValue}
                  x={footer.copyright.x}
                  y={footer.copyright.y}
                  fontSize="10px"
                  fontWeight="normal"
                  textAnchor="middle"
                  placeholder="Copyright"
                  isSelected={selectedCopyright}
                  isHovered={isCopyrightHovered}
                  showPreview={showCopyrightPreview}
                />
              )}
            </g>
          )}
        </>
      )}
    </g>
  );
});

export default PageFooter;
