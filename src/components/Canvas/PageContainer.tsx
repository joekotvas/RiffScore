/**
 * PageContainer - Wrapper component for individual page SVG
 *
 * Wraps page content in a separate SVG element with its own coordinate system.
 * Enables CSS page-break support for printing and better DOM isolation.
 */

import React, { forwardRef, useCallback } from 'react';
import type { Page, PageLayout } from '@/types';

export interface PageContainerProps {
  /** Page data */
  page: Page;
  /** Full page layout for dimensions */
  pageLayout: PageLayout;
  /** Zoom scale factor */
  scale: number;
  /** Page content to render */
  children: React.ReactNode;
  /** Mouse down handler with page context */
  onMouseDown?: (e: React.MouseEvent<SVGSVGElement>, pageIndex: number) => void;
  /** Mouse move handler with page context */
  onMouseMove?: (e: React.MouseEvent<SVGSVGElement>, pageIndex: number) => void;
  /** Mouse up handler with page context */
  onMouseUp?: (e: React.MouseEvent<SVGSVGElement>, pageIndex: number) => void;
  /** Click handler with page context */
  onClick?: (e: React.MouseEvent<SVGSVGElement>, pageIndex: number) => void;
}

/**
 * Wraps a page's content in its own SVG element.
 * Each page has its own coordinate system starting at (0,0).
 */
export const PageContainer = forwardRef<SVGSVGElement, PageContainerProps>(
  function PageContainer(
    {
      page,
      pageLayout,
      scale,
      children,
      onMouseDown,
      onMouseMove,
      onMouseUp,
      onClick,
    },
    ref
  ) {
    const { width, height } = pageLayout.dimensions;

    const handleMouseDown = useCallback(
      (e: React.MouseEvent<SVGSVGElement>) => {
        onMouseDown?.(e, page.index);
      },
      [onMouseDown, page.index]
    );

    const handleMouseMove = useCallback(
      (e: React.MouseEvent<SVGSVGElement>) => {
        onMouseMove?.(e, page.index);
      },
      [onMouseMove, page.index]
    );

    const handleMouseUp = useCallback(
      (e: React.MouseEvent<SVGSVGElement>) => {
        onMouseUp?.(e, page.index);
      },
      [onMouseUp, page.index]
    );

    const handleClick = useCallback(
      (e: React.MouseEvent<SVGSVGElement>) => {
        onClick?.(e, page.index);
      },
      [onClick, page.index]
    );

    return (
      <div
        className="riff-page-wrapper"
        data-page-index={page.index}
        data-testid={`page-${page.index}`}
      >
        <svg
          ref={ref}
          className="riff-page-svg"
          width={width * scale}
          height={height * scale}
          viewBox={`0 0 ${width} ${height}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onClick={handleClick}
        >
          {children}
        </svg>
      </div>
    );
  }
);

export default PageContainer;
