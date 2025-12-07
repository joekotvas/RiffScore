// @ts-nocheck
import { useTheme } from '../../context/ThemeContext';

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
const Beam = ({ startX, endX, startY, endY, type, direction }) => {
    const { theme } = useTheme();
    const beamWidth = 5;
    const secondaryOffset = 8;
    
    const renderBeam = (y1, y2, key, thickness = 5) => {
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
            `${startX},${y1 - halfWidth}`,
            `${endX},${y2 - halfWidth}`,
            `${endX},${y2 + halfWidth}`,
            `${startX},${y1 + halfWidth}`
        ].join(' ');

        return <polygon key={key} points={points} fill={theme.score.note} />;
    };
    
    const paths = [];
    
    // Primary Beam (Outermost) - Standard Thickness
    paths.push(renderBeam(startY, endY, 'primary', 5));
    
    // Secondary Beams (Inner) - Thinner
    const beamSpacing = 8;
    const innerBeamThickness = 5;

    const addBeam = (index) => {
        const offset = direction === 'up' 
            ? (index * beamSpacing) 
            : -(index * beamSpacing);
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
