import React, { useState } from 'react';
import { Settings, X } from 'lucide-react';
import { useTheme } from '../../src/context/ThemeContext';
import { THEMES, ThemeName } from '../../src/config';

const ConfigMenu = () => {
  const { theme, themeName, setTheme, zoom, setZoom } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div
      className="ConfigMenu"
      ref={menuRef}
      style={{
        position: 'fixed',
        top: '1rem',
        right: '1rem',
        zIndex: 50,
      }}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: '0.5rem',
          borderRadius: '9999px',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
          transition: 'background-color 0.2s, color 0.2s',
          backgroundColor: theme.buttonBackground,
          color: theme.text,
          border: `1px solid ${theme.border}`,
          cursor: 'pointer',
        }}
      >
        {isOpen ? <X size={24} /> : <Settings size={24} />}
      </button>

      {isOpen && (
        <div 
          style={{
            position: 'absolute',
            top: '3rem',
            right: 0,
            width: '16rem',
            padding: '1rem',
            borderRadius: '0.5rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            backdropFilter: 'blur(12px)',
            border: `1px solid ${theme.border}`,
            backgroundColor: theme.panelBackground,
            color: theme.text,
          }}
        >
          <h3
            style={{
              fontWeight: 700,
              marginBottom: '1rem',
              fontSize: '0.875rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: theme.secondaryText,
            }}
          >
            Configuration
          </h3>
          
          <div style={{ marginBottom: '1.5rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.75rem',
                fontWeight: 700,
                marginBottom: '0.5rem',
                textTransform: 'uppercase',
                color: theme.secondaryText,
              }}
            >
              Theme
            </label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '0.5rem',
              }}
            >
              {(Object.keys(THEMES) as ThemeName[]).map((name) => (
                <button
                  key={name}
                  onClick={() => setTheme(name)}
                  style={{
                    padding: '0.5rem 0.75rem',
                    borderRadius: '0.25rem',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    transition: 'all 0.2s',
                    cursor: 'pointer',
                    backgroundColor: THEMES[name].background,
                    color: THEMES[name].text,
                    border: `1px solid ${themeName === name ? theme.accent : THEMES[name].border}`,
                    opacity: themeName === name ? 1 : 0.7,
                    outline: themeName === name ? `2px solid ${theme.accent}` : 'none',
                    outlineOffset: '1px',
                  }}
                  onMouseEnter={(e) => {
                    if (themeName !== name) {
                      e.currentTarget.style.opacity = '1';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (themeName !== name) {
                      e.currentTarget.style.opacity = '0.7';
                    }
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.75rem',
                fontWeight: 700,
                marginBottom: '0.5rem',
                textTransform: 'uppercase',
                color: theme.secondaryText,
              }}
            >
              Zoom: {Math.round(zoom * 100)}%
            </label>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              style={{
                width: '100%',
                height: '0.5rem',
                borderRadius: '0.5rem',
                appearance: 'none',
                cursor: 'pointer',
                background: theme.border,
                accentColor: theme.accent,
              }}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.75rem',
                marginTop: '0.25rem',
                color: theme.secondaryText,
              }}
            >
              <span>50%</span>
              <span>100%</span>
              <span>200%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConfigMenu;
