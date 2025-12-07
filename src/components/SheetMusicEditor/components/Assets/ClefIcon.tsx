import React from 'react';
import { CLEF_TYPES } from '../../constants';
import { useTheme } from '../../context/ThemeContext';

interface ClefIconProps extends React.SVGProps<SVGSVGElement> {
  clef: string;
}

const ClefIcon: React.FC<ClefIconProps> = ({ clef, ...props }) => {
  const { theme } = useTheme();
  
  // Default to 60x60 coordinate system as used in ClefOverlay
  // Consumers can scale this down by passing width/height props
  const viewBox = props.viewBox || "0 0 60 60";
  
  const key = clef || 'treble';
  const data = CLEF_TYPES[key] || CLEF_TYPES['treble'];

  return (
    <svg viewBox={viewBox} fill="none" {...props}>
      {key === 'grand' ? (
        <>
          {/* Brace */}
          <path d="M5,10 Q0,10 0,20 L0,40 Q0,50 5,50" fill="none" stroke="currentColor" strokeWidth="1.5" />
          
          {/* Top Staff (Treble) */}
          {[0, 1, 2].map(i => (
              <line key={`t-${i}`} x1="8" y1={12 + (i * 6)} x2="55" y2={12 + (i * 6)} stroke="currentColor" strokeWidth="1" opacity="0.4" />
          ))}
          <path 
              d={CLEF_TYPES.treble.path} 
              transform="scale(0.19) translate(30, 20)" 
              fill="currentColor"
          />

          {/* Bottom Staff (Bass) */}
          {[0, 1, 2].map(i => (
              <line key={`b-${i}`} x1="8" y1={38 + (i * 6)} x2="55" y2={38 + (i * 6)} stroke="currentColor" strokeWidth="1" opacity="0.4" />
          ))}
          <path 
              d={CLEF_TYPES.bass.path} 
              transform="scale(0.03) translate(150, 950)" 
              fill="currentColor"
          />
        </>
      ) : (
        <>
          {/* Standard Staff Lines (faint) - Optional for icon, but kept for consistency if desired. 
              Actually, for a small toolbar icon, lines might be too much noise. 
              Let's make lines optional or context dependent? 
              For now, let's keep them as they provide context for the clef position. 
              But wait, the toolbar icon was just the clef path before.
              The Overlay had lines.
              Let's include lines but maybe use opacity to keep them subtle.
          */}
          {[0, 1, 2, 3, 4].map(i => (
              <line 
                key={i} 
                x1="0" 
                y1={10 + (i * 10)} 
                x2="60" 
                y2={10 + (i * 10)} 
                stroke="currentColor" 
                strokeWidth="1" 
                opacity="0.3"
              />
          ))}
          
          <path 
              d={data.path} 
              transform={
                key === 'treble' 
                  ? "scale(0.35) translate(30, 20)" 
                  : key === 'bass'
                    ? "scale(0.065) translate(60, -120)"
                    : `scale(${data.scale || 0.5}) translate(10, 10)`
              } 
              fill="currentColor"
          />
        </>
      )}
    </svg>
  );
};

export default ClefIcon;
