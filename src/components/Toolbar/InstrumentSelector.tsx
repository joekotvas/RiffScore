import React, { useState, useRef } from 'react';
import { AudioWaveform, Check } from 'lucide-react';
import { InstrumentType, setInstrument } from '@/engines/toneEngine';
import DropdownOverlay, { DropdownItem, DropdownTrigger } from './Menus/DropdownOverlay';
import './styles/InstrumentSelector.css';

interface InstrumentSelectorProps {
  selectedInstrument: InstrumentType;
  onInstrumentChange: (instrument: InstrumentType) => void;
  samplerLoaded: boolean;
}

const InstrumentSelector: React.FC<InstrumentSelectorProps> = ({
  selectedInstrument,
  onInstrumentChange,
  samplerLoaded,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const options = [
    { id: 'bright' as InstrumentType, name: 'Bright Synth' },
    { id: 'mellow' as InstrumentType, name: 'Mellow Synth' },
    { id: 'organ' as InstrumentType, name: 'Organ Synth' },
    {
      id: 'piano' as InstrumentType,
      name: samplerLoaded ? 'Piano Samples' : 'Piano (Loading...)',
      loading: !samplerLoaded,
    },
  ];

  const selectedOption = options.find((o) => o.id === selectedInstrument) || options[0];

  const handleSelect = (id: InstrumentType) => {
    onInstrumentChange(id);
    setInstrument(id);
    setIsOpen(false);
  };

  return (
    <div className="riff-InstrumentSelector">
      <DropdownTrigger
        ref={buttonRef}
        label={selectedOption.name}
        icon={<AudioWaveform size={14} />}
        isOpen={isOpen}
        onClick={() => setIsOpen(!isOpen)}
      />

      {isOpen && (
        <DropdownOverlay
          onClose={() => setIsOpen(false)}
          triggerRef={buttonRef as React.RefObject<HTMLElement>}
          width={176}
        >
          <div className="riff-DropdownHeader">
            <AudioWaveform size={16} />
            <h3 className="riff-DropdownHeader__title">Voice</h3>
          </div>
          <div className="riff-InstrumentSelector__list">
            {options.map((option) => (
              <DropdownItem
                key={option.id}
                onClick={() => handleSelect(option.id)}
                isSelected={option.id === selectedInstrument}
              >
                <span className="riff-InstrumentSelector__option">
                  <span>{option.name}</span>
                  {option.id === selectedInstrument && (
                    <Check size={12} className="riff-InstrumentSelector__check" />
                  )}
                </span>
              </DropdownItem>
            ))}
          </div>
        </DropdownOverlay>
      )}
    </div>
  );
};

export default InstrumentSelector;
