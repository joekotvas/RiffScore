import React, { createContext, useContext, useState, useEffect } from 'react';
import { THEMES, Theme, ThemeName, DEFAULT_THEME } from '@/config';
import { DEFAULT_SCALE } from '@/constants';

interface ThemeContextType {
  theme: Theme;
  themeName: ThemeName;
  setTheme: (name: ThemeName) => void;
  zoom: number;
  setZoom: (zoom: number) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/**
 * Injects CSS custom properties based on the selected theme.
 * This allows CSS-based components to use dynamic theme colors.
 */
function injectThemeCSSVariables(theme: Theme) {
  const root = document.documentElement;
  
  // Map theme properties to CSS custom properties
  root.style.setProperty('--riff-color-bg', theme.background);
  root.style.setProperty('--riff-color-bg-panel', theme.panelBackground);
  root.style.setProperty('--riff-color-text', theme.text);
  root.style.setProperty('--riff-color-text-secondary', theme.secondaryText);
  root.style.setProperty('--riff-color-border', theme.border);
  root.style.setProperty('--riff-color-primary', theme.accent);
  root.style.setProperty('--riff-color-active-bg', theme.accent);
  root.style.setProperty('--riff-color-button-bg', theme.buttonBackground);
  root.style.setProperty('--riff-color-hover-bg', theme.buttonHoverBackground);
  
  // Score-specific colors
  root.style.setProperty('--riff-color-score-line', theme.score.line);
  root.style.setProperty('--riff-color-score-note', theme.score.note);
  root.style.setProperty('--riff-color-score-fill', theme.score.fill);
}

export const ThemeProvider: React.FC<{ children: React.ReactNode; initialTheme?: ThemeName }> = ({
  children,
  initialTheme,
}) => {
  const [themeName, setThemeName] = useState<ThemeName>(initialTheme || DEFAULT_THEME);
  const [zoom, setZoom] = useState(DEFAULT_SCALE);

  // Sync with prop changes
  useEffect(() => {
    if (initialTheme) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setThemeName(initialTheme);
    }
  }, [initialTheme]);

  const theme = THEMES[themeName];

  // Inject CSS variables whenever theme changes
  useEffect(() => {
    injectThemeCSSVariables(theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, themeName, setTheme: setThemeName, zoom, setZoom }}>
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
