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
    {/* Short barline segment indicating pickup/anacrusis */}
    <line x1={10} y1={8} x2={10} y2={16} stroke="currentColor" strokeWidth={1.5} />
    {/* Small bracket indicating partial measure */}
    <path d="M 6 8 L 6 6 L 14 6 L 14 8" stroke="currentColor" strokeWidth={1} fill="none" strokeLinecap="round" />
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
