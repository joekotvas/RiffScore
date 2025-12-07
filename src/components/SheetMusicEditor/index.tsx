// @ts-nocheck
"use client";
import React from 'react';
import ScoreEditor from './ScoreEditor';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import ConfigMenu from './components/Panels/ConfigMenu';

const AppContent = () => {
  const { theme, zoom } = useTheme();
  
  return (
    <div className="min-h-screen p-8 font-sans transition-colors duration-300" style={{ backgroundColor: theme.background, color: theme.text }}>
      <ConfigMenu />
      <h1 className="text-8xl font-light mb-0 text-center" style={{ color: theme.text }}>RiffScore</h1>
      <h1 className="text-3xl font-bold mb-0 text-center" style={{ color: theme.text }}>Interactive Music Notation Editor for React</h1>
      <p className="text-center mb-8" style={{ color: theme.secondaryText }}>Early-stage proof of concept developed by <a href="https://jokma.com/" className="underline hover:opacity-80">Joe Kotvas</a></p>
      <div className="max-w-6xl mx-auto space-y-12">
        <ScoreEditor label="Row 1" scale={zoom} />
      </div>
    </div>
  );
};

export default function SheetMusicApp() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
