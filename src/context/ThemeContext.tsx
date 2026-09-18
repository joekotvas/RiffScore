import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
  useLayoutEffect,
} from 'react';
import { THEMES, Theme, ThemeName, DEFAULT_THEME } from '@/config';
import { getScoreHighlightColor } from '@/themes';
import type { DeepPartial } from '@/types';
import { DEFAULT_SCALE } from '@/constants';

// Server rendering has no layout phase; the client still injects before paint.
const useThemeLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

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
  for (const [name, value] of Object.entries(themeCSSVariables(theme))) {
    target.style.setProperty(name, value);
  }
}

/** The CSS custom properties a theme maps to (usable as an inline `style` for a subtree). */
export function themeCSSVariables(theme: Theme): Record<string, string> {
  return {
    '--riff-color-bg': theme.background,
    '--riff-color-bg-panel': theme.panelBackground,
    '--riff-color-text': theme.text,
    '--riff-color-text-secondary': theme.secondaryText,
    '--riff-color-border': theme.border,
    '--riff-color-primary': theme.accent,
    '--riff-color-active-bg': theme.accent,
    '--riff-color-button-bg': theme.buttonBackground,
    '--riff-color-hover-bg': theme.buttonHoverBackground,
    // Score-specific colors
    '--riff-color-score-line': theme.score.line,
    '--riff-color-score-note': theme.score.note,
    '--riff-color-score-fill': theme.score.fill,
    '--riff-color-score-highlight': getScoreHighlightColor(theme),
  };
}

/**
 * Renders `children` with a different theme object than the surrounding provider, keeping the
 * provider's setters. Used by the page view, which draws on white paper regardless of the UI
 * theme. CSS-variable consumers in the subtree still need `themeCSSVariables(theme)` applied
 * as an inline style on an ancestor element.
 */
export const ThemeOverride: React.FC<{ theme: Theme; children: React.ReactNode }> = ({
  theme,
  children,
}) => {
  const context = useTheme();
  const value = useMemo(() => ({ ...context, theme }), [context, theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const ThemeProvider: React.FC<{
  children: React.ReactNode;
  initialTheme?: ThemeName;
  overrides?: DeepPartial<Theme>;
  scoped?: boolean;
}> = ({ children, initialTheme, overrides, scoped = false }) => {
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

  const theme = useMemo((): Theme => {
    const base = THEMES[themeName];
    return { ...base, ...overrides, score: { ...base.score, ...overrides?.score } };
  }, [themeName, overrides]);

  // Inject CSS variables synchronously before paint to prevent FOUC
  // When containerRef is set, inject into that element for scoped theming
  useThemeLayoutEffect(() => {
    if (!scoped || containerRef) injectThemeCSSVariables(theme, containerRef);
  }, [theme, containerRef, scoped]);

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
