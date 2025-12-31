/**
 * MeasureControls
 *
 * Toolbar component for managing measure operations (add, remove, pickup).
 * Contains custom SVG definitions for measure-related icons.
 */
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
    <line x1={3} y1={4} x2={3} y2={16} stroke="currentColor" strokeWidth={1} />
    {/* Thick barline */}
    <line x1={7} y1={4} x2={7} y2={16} stroke="currentColor" strokeWidth={2.5} />
    {/* Plus sign */}
    <line
      x1={12}
      y1={10}
      x2={16}
      y2={10}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
    />
    <line
      x1={14}
      y1={8}
      x2={14}
      y2={12}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
    />
  </svg>
);

/**
 * Delete Measure Icon - Final barline with a minus
 * Uses proper thin+thick final barline proportions
 */
const DeleteMeasureIcon: React.FC = () => (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox={`0 0 ${ICON_SIZE} ${ICON_SIZE}`} fill="none">
    {/* Thin barline */}
    <line x1={3} y1={4} x2={3} y2={16} stroke="currentColor" strokeWidth={1} />
    {/* Thick barline */}
    <line x1={7} y1={4} x2={7} y2={16} stroke="currentColor" strokeWidth={2.5} />
    {/* Minus sign */}
    <line
      x1={12}
      y1={10}
      x2={16}
      y2={10}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
    />
  </svg>
);

/**
 * Pickup Measure Icon - Beamed Eighth Note Ascending Couplet + Barline
 * Represents an anacrusis (pickup notes) before the first downbeat.
 */
const PickupIcon: React.FC = () => (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="2 0 18 18" fill="none">
    {/* Barline to the right */}
    <line x1={18} y1={4} x2={18} y2={16} stroke="currentColor" strokeWidth={1} />

    {/* Ascending eighth note couplet */}
    {/* Note 1 (Low) */}
    <ellipse cx={6} cy={14} rx={2.3} ry={1.6} fill="currentColor" transform="rotate(-20 6 14)" />
    <line x1={7.7} y1={14} x2={7.7} y2={5} stroke="currentColor" strokeWidth={1} />

    {/* Note 2 (High) */}
    <ellipse cx={13} cy={11} rx={2.3} ry={1.6} fill="currentColor" transform="rotate(-20 13 11)" />
    <line x1={14.7} y1={11} x2={14.7} y2={2} stroke="currentColor" strokeWidth={1} />

    {/* Beam (thick, polygon covers stems 7.3-15.3) */}
    <polygon points="7.2,4 15.2,1 15.2,3.5 7.2,6.5" fill="currentColor" />
  </svg>
);

interface MeasureControlsProps {
  onAddMeasure: () => void; // Callback to add a measure at the end
  onRemoveMeasure: () => void; // Callback to remove the selected measure (or last measure)
  onTogglePickup: () => void; // Callback to toggle pickup measure state
  isPickup?: boolean; // Whether the current measure is a pickup measure
  variant?: 'default' | 'ghost'; // Visual style variant
}

/**
 * MeasureControls
 *
 * Toolbar group for adding/removing measures and toggling pickup bars.
 * Uses custom SVG icons for precise musical representation.
 */
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
