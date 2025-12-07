// @ts-nocheck
import React from 'react';
import { renderFlags } from '../Canvas/Note';

const NoteIcon = ({ type, color = "currentColor" }) => {
  const strokeWidth = 2;
  
  // Center coordinates for 24x24 viewBox
  const cx = 10;
  const cy = 20;
  const stemX = 12 + 2.5; // Offset to right side of rotated ellipse
  const stemTopY = 0;
  
  // Note Head
  // Rotated -20 degrees
  const headRotation = `rotate(-20 ${cx} ${cy})`;
  
  const renderHead = (filled) => (
    <ellipse 
      cx={cx} 
      cy={cy} 
      rx={4} 
      ry={2.8} 
      transform={headRotation} 
      fill={filled ? color : "none"} 
      stroke={color} 
      strokeWidth={strokeWidth} 
    />
  );

  const renderStem = () => (
    <line x1={stemX} y1={cy} x2={stemX} y2={stemTopY} stroke={color} strokeWidth={1.5} />
  );

  switch (type) {
      case 'whole':
          return (
              <svg width="24" height="24" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <g transform="translate(4, 6.6) scale(0.8) translate(2, 2)">
                      <g transform="translate(-199.3990,-536.4730)">
                          <path
                             d="M 206.04921,542.89329 C 204.33221,542.80244 202.99047,541.27833 202.45208,539.70226 C 202.12589,538.77722 202.30505,537.38950 203.39174,537.12966 C 204.96615,536.86226 206.27260,538.19967 207.00481,539.47953 C 207.52641,540.42880 207.81478,541.92368 206.83679,542.67615 C 206.60458,542.83188 206.32387,542.89434 206.04921,542.89329 z M 208.78446,537.49000 C 206.85001,536.31510 204.40641,536.22358 202.28813,536.88110 C 200.94630,537.35025 199.41169,538.34823 199.39900,539.97250 C 199.39807,541.56396 200.87900,542.55675 202.18949,543.02959 C 204.26418,543.70824 206.65796,543.64856 208.59501,542.56669 C 209.69149,541.98333 210.66334,540.77535 210.33379,539.43643 C 210.15258,538.57546 209.49304,537.93123 208.78446,537.49000 z "
                             fill={color}
                          />
                      </g>
                  </g>
              </svg>
          );
      case 'half':
          return (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {renderHead(false)}
                  {renderStem()}
              </svg>
          );
      case 'quarter':
          return (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {renderHead(true)}
                  {renderStem()}
              </svg>
          );
      default:
          // Eighth and shorter (flags)
          return (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {renderHead(true)}
                  {renderStem()}
                  <g transform={`translate(${stemX}, ${stemTopY}) scale(0.6) translate(-${stemX}, -${stemTopY})`}>
                    {renderFlags(stemX, stemTopY, type, 'up', color, 10)}
                  </g>
              </svg>
          );
  }
};

export default NoteIcon;
