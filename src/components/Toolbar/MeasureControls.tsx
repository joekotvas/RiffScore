import React from 'react';
import ToolbarButton from './ToolbarButton';

// SVG viewport size for compact toolbar icons
const ICON_SIZE = 20;

/**
 * Add Measure Icon - Final barline with a plus
 * Uses proper thin+thick final barline proportions
 */
const AddMeasureIcon: React.FC = () => (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox={`0 0 ${ICON_SIZE} ${ICON_SIZE}`} fill="none">
    {/* Thin barline */}
    <line x1={6} y1={4} x2={6} y2={16} stroke="currentColor" strokeWidth={1} />
    {/* Thick barline */}
    <line x1={10} y1={4} x2={10} y2={16} stroke="currentColor" strokeWidth={2.5} />
    {/* Plus sign */}
    <line x1={15} y1={10} x2={19} y2={10} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    <line x1={17} y1={8} x2={17} y2={12} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
  </svg>
);

/**
 * Delete Measure Icon - Final barline with a minus
 * Uses proper thin+thick final barline proportions
 */
const DeleteMeasureIcon: React.FC = () => (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox={`0 0 ${ICON_SIZE} ${ICON_SIZE}`} fill="none">
    {/* Thin barline */}
    <line x1={6} y1={4} x2={6} y2={16} stroke="currentColor" strokeWidth={1} />
    {/* Thick barline */}
    <line x1={10} y1={4} x2={10} y2={16} stroke="currentColor" strokeWidth={2.5} />
    {/* Minus sign */}
    <line x1={15} y1={10} x2={19} y2={10} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
  </svg>
);

/**
 * Pickup Measure Icon - Short barline segment
 */
const PickupIcon: React.FC = () => (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox={`0 0 ${ICON_SIZE} ${ICON_SIZE}`} fill="none">
    {/* Barline to the right */}
    <line x1={18} y1={4} x2={18} y2={16} stroke="currentColor" strokeWidth={1} />
    
    {/* Ascending eighth note couplet */}
    {/* Note 1 (Low) */}
    <ellipse cx={6} cy={14} rx={2.3} ry={1.6} fill="currentColor" transform="rotate(-20 6 14)" />
    <line x1={8.1} y1={14} x2={8.1} y2={6} stroke="currentColor" strokeWidth={1} />
    
    {/* Note 2 (High) */}
    <ellipse cx={13} cy={11} rx={2.3} ry={1.6} fill="currentColor" transform="rotate(-20 13 11)" />
    <line x1={15.1} y1={11} x2={15.1} y2={3} stroke="currentColor" strokeWidth={1} />
    
    {/* Beam (thick) */}
    <line x1={8.1} y1={6} x2={15.1} y2={3} stroke="currentColor" strokeWidth={2.5} strokeLinecap="butt" />
  </svg>
);

interface MeasureControlsProps {
  onAddMeasure: () => void;
  onRemoveMeasure: () => void;
  onTogglePickup: () => void;
  isPickup?: boolean;
  variant?: 'default' | 'ghost';
}

const MeasureControls: React.FC<MeasureControlsProps> = ({
  onAddMeasure,
  onRemoveMeasure,
  onTogglePickup,
  isPickup,
  variant = 'default',
}) => {
  return (
    <div className="riff-ControlGroup">
      <ToolbarButton
        onClick={onAddMeasure}
        label="Add Measure"
        icon={<AddMeasureIcon />}
        preventFocus={true}
        variant={variant}
      />
      <ToolbarButton
        onClick={onRemoveMeasure}
        label="Remove Measure"
        icon={<DeleteMeasureIcon />}
        preventFocus={true}
        variant={variant}
      />
      <ToolbarButton
        onClick={onTogglePickup}
        isActive={isPickup}
        label="Toggle Pickup"
        icon={<PickupIcon />}
        preventFocus={true}
        variant={variant}
      />
    </div>
  );
};

export default MeasureControls;
