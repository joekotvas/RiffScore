// @ts-nocheck
import { useTheme } from '@/context/ThemeContext';
import { BEAMING } from '@/constants';

/**
 * Renders a beam connecting multiple notes.
 * Handles primary and secondary beams (for 16th notes etc).
 * @param startX - Starting X coordinate
 * @param endX - Ending X coordinate
 * @param startY - Starting Y coordinate
 * @param endY - Ending Y coordinate
 * @param type - Duration type (determines number of beams)
 * @param direction - Stem direction (affects secondary beam offset)
 */
const Beam = ({ beam, color }) => {
  const { startX, endX, startY, endY, type, direction, segments } = beam;
  const { theme } = useTheme();

  const renderBeam = (y1, y2, key, thickness = 5, x1 = startX, x2 = endX) => {
    // To get vertical ends, we draw a polygon.
    // Top-Left: (startX, y1)
    // Top-Right: (endX, y2)
    // Bottom-Right: (endX, y2 + thickness)
    // Bottom-Left: (startX, y1 + thickness)

    // Adjust for "centered" line logic if needed?
    // The previous <line> with strokeWidth draws centered on the path.
    // So top edge was y - width/2, bottom was y + width/2.
    // Let's replicate that centering to maintain position.

    const halfWidth = thickness / 2;

    const points = [
      `${x1},${y1 - halfWidth}`,
      `${x2},${y2 - halfWidth}`,
      `${x2},${y2 + halfWidth}`,
      `${x1},${y1 + halfWidth}`,
    ].join(' ');

    return <polygon key={key} points={points} fill={color || theme.score.note} />;
  };

  const paths = [];

  if (segments?.length) {
    segments.forEach((segment, index) => {
      paths.push(
        renderBeam(
          segment.startY,
          segment.endY,
          `segment-${index}`,
          BEAMING.THICKNESS,
          segment.startX,
          segment.endX
        )
      );
    });
    return <g className="beam-group">{paths}</g>;
  }

  // Primary Beam (Outermost) - Standard Thickness
  paths.push(renderBeam(startY, endY, 'primary', BEAMING.THICKNESS));

  // Secondary Beams (Inner) - Same thickness
  const beamSpacing = BEAMING.SPACING;
  const innerBeamThickness = BEAMING.THICKNESS;

  const addBeam = (index) => {
    const offset = direction === 'up' ? index * beamSpacing : -(index * beamSpacing);
    paths.push(renderBeam(startY + offset, endY + offset, `beam-${index}`, innerBeamThickness));
  };

  if (['sixteenth', 'thirtysecond', 'sixtyfourth'].includes(type)) {
    addBeam(1); // 2nd beam
  }
  if (['thirtysecond', 'sixtyfourth'].includes(type)) {
    addBeam(2); // 3rd beam
  }
  if (type === 'sixtyfourth') {
    addBeam(3); // 4th beam
  }

  return <g className="beam-group">{paths}</g>;
};

export default Beam;
