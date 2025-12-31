import React, { useRef, useState, useImperativeHandle, forwardRef } from 'react';
import ClefIcon from '../Assets/ClefIcon';
import { CLEF_TYPES, KEY_SIGNATURES } from '@/constants';
import ClefOverlay from './Menus/ClefOverlay';
import KeySignatureOverlay from './Menus/KeySignatureOverlay';
import TimeSignatureOverlay from './Menus/TimeSignatureOverlay';
import ToolbarButton from './ToolbarButton';

interface StaffControlsProps {
  clef: string;
  onClefChange: (clef: string) => void;
  keySignature: string;
  onKeySignatureChange: (key: string) => void;
  timeSignature: string;
  onTimeSignatureChange: (time: string) => void;
  variant?: 'default' | 'ghost';
}

export interface StaffControlsHandle {
  openClefMenu: () => void;
  openKeySigMenu: () => void;
  openTimeSigMenu: () => void;
  isMenuOpen: () => boolean;
}

const StaffControls = forwardRef<StaffControlsHandle, StaffControlsProps>(
  (
    {
      clef,
      onClefChange,
      keySignature,
      onKeySignatureChange,
      timeSignature,
      onTimeSignatureChange,
      variant = 'default',
    },
    ref
  ) => {
    const [showClefMenu, setShowClefMenu] = useState(false);
    const [showKeySig, setShowKeySig] = useState(false);
    const [showTimeSig, setShowTimeSig] = useState(false);

    const clefBtnRef = useRef<HTMLButtonElement>(null);
    const keySigBtnRef = useRef<HTMLButtonElement>(null);
    const timeSigBtnRef = useRef<HTMLButtonElement>(null);

    useImperativeHandle(
      ref,
      () => ({
        openClefMenu: () => setShowClefMenu(true),
        openKeySigMenu: () => setShowKeySig(true),
        openTimeSigMenu: () => setShowTimeSig(true),
        isMenuOpen: () => showClefMenu || showKeySig || showTimeSig,
      }),
      [showClefMenu, showKeySig, showTimeSig]
    );

    const currentClef = CLEF_TYPES[clef] || CLEF_TYPES['treble'];

    return (
      <div className="riff-ControlGroup">
        {/* Clef Selection */}
        <ToolbarButton
          ref={clefBtnRef}
          label={currentClef.label}
          showLabel={false}
          onClick={() => setShowClefMenu(!showClefMenu)}
          icon={<ClefIcon clef={clef || 'treble'} style={{ width: 24, height: 24, overflow: 'visible' }} />}
          variant={variant}
        />
        {showClefMenu && (
          <ClefOverlay
            current={clef}
            onSelect={(c: string) => {
              onClefChange(c);
              setShowClefMenu(false);
            }}
            onClose={() => setShowClefMenu(false)}
            triggerRef={clefBtnRef as React.RefObject<HTMLElement>}
          />
        )}

        {/* Key Signature */}
        <ToolbarButton
          ref={keySigBtnRef}
          label={KEY_SIGNATURES[keySignature]?.label || keySignature}
          showLabel={true}
          onClick={() => setShowKeySig(!showKeySig)}
          className="riff-ToolbarButton--label-xs"
          variant={variant}
        />
        {showKeySig && (
          <KeySignatureOverlay
            current={keySignature}
            clef={clef}
            onSelect={(k: string) => {
              onKeySignatureChange(k);
              setShowKeySig(false);
            }}
            onClose={() => setShowKeySig(false)}
          />
        )}

        {/* Time Signature */}
        <ToolbarButton
          ref={timeSigBtnRef}
          label={timeSignature}
          showLabel={true}
          onClick={() => setShowTimeSig(!showTimeSig)}
          className="riff-ToolbarButton--label-xs"
          variant={variant}
        />
        {showTimeSig && (
          <TimeSignatureOverlay
            current={timeSignature}
            onSelect={(ts: string) => {
              onTimeSignatureChange(ts);
              setShowTimeSig(false);
            }}
            onClose={() => setShowTimeSig(false)}
            triggerRef={timeSigBtnRef as React.RefObject<HTMLElement>}
          />
        )}
      </div>
    );
  }
);

StaffControls.displayName = 'StaffControls';

export default StaffControls;

