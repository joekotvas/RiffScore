import React, { createContext, useContext, useState, useEffect, useLayoutEffect } from 'react';
import { THEMES, Theme, ThemeName, DEFAULT_THEME } from '@/config';
import { DEFAULT_SCALE } from '@/constants';

interface ThemeContextType {
  theme: Theme;
  themeName: ThemeName;
  setTheme: (name: ThemeName) => void;
  zoom: number;
  setZoom: (zoom: number) => void;
  setContainerRef: (ref: HTMLElement | null) => void;
  containerRef: HTMLElement | null;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/**
 * Injects CSS custom properties based on the selected theme.
 * If a container element is provided, injects into that element for scoped theming.
 * Falls back to document.documentElement for global theming.
 */
function injectThemeCSSVariables(theme: Theme, container?: HTMLElement | null) {
  const target = container || document.documentElement;

  // Map theme properties to CSS custom properties
  target.style.setProperty('--riff-color-bg', theme.background);
  target.style.setProperty('--riff-color-bg-panel', theme.panelBackground);
  target.style.setProperty('--riff-color-text', theme.text);
  target.style.setProperty('--riff-color-text-secondary', theme.secondaryText);
  target.style.setProperty('--riff-color-border', theme.border);
  target.style.setProperty('--riff-color-primary', theme.accent);
  target.style.setProperty('--riff-color-active-bg', theme.accent);
  target.style.setProperty('--riff-color-button-bg', theme.buttonBackground);
  target.style.setProperty('--riff-color-hover-bg', theme.buttonHoverBackground);

  // Score-specific colors
  target.style.setProperty('--riff-color-score-line', theme.score.line);
  target.style.setProperty('--riff-color-score-note', theme.score.note);
  target.style.setProperty('--riff-color-score-fill', theme.score.fill);
}

export const ThemeProvider: React.FC<{ children: React.ReactNode; initialTheme?: ThemeName }> = ({
  children,
  initialTheme,
}) => {
  const [themeName, setThemeName] = useState<ThemeName>(initialTheme || DEFAULT_THEME);
  const [zoom, setZoom] = useState(DEFAULT_SCALE);
  const [containerRef, setContainerRef] = useState<HTMLElement | null>(null);

  // Sync with prop changes
  useEffect(() => {
    if (initialTheme) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setThemeName(initialTheme);
    }
  }, [initialTheme]);

  const theme = THEMES[themeName];

  // Inject CSS variables synchronously before paint to prevent FOUC
  // When containerRef is set, inject into that element for scoped theming
  useLayoutEffect(() => {
    injectThemeCSSVariables(theme, containerRef);
  }, [theme, containerRef]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        themeName,
        setTheme: setThemeName,
        zoom,
        setZoom,
        setContainerRef,
        containerRef,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
