"use client";

import React from "react";

/**
 * SMuFL Symbol Demo - Preview Bravura glyphs for toolbar usage
 */

const BRAVURA_FONT = "'Bravura', serif";

// Tuplet digits (U+E880 - U+E88F)
const TUPLETS = {
  tuplet0: '\uE880',
  tuplet1: '\uE881',
  tuplet2: '\uE882',
  tuplet3: '\uE883', // Triplet
  tuplet4: '\uE884',
  tuplet5: '\uE885', // Quintuplet
  tuplet6: '\uE886',
  tuplet7: '\uE887',
  tuplet8: '\uE888',
  tuplet9: '\uE889',
  tupletColon: '\uE88A',
};

// Barlines
const BARLINES = {
  single: '\uE030',
  double: '\uE031',
  final: '\uE032',
  reverseFinal: '\uE033',
  dashed: '\uE036',
  dotted: '\uE037',
  short: '\uE038',
  tick: '\uE039',
  repeatLeft: '\uE040',
  repeatRight: '\uE041',
  repeatDots: '\uE043',
};

// Accidentals
const ACCIDENTALS = {
  flat: '\uE260',
  natural: '\uE261',
  sharp: '\uE262',
  doubleSharp: '\uE263',
  doubleFlat: '\uE264',
  parenthesisLeft: '\uE26A',
  parenthesisRight: '\uE26B',
};

// Other useful symbols
const MISC = {
  augmentationDot: '\uE1E7',
  fermataAbove: '\uE4C0',
  fermataBelow: '\uE4C1',
  breathMark: '\uE4CE',
  caesura: '\uE4D1',
  accentAbove: '\uE4A0',
  staccatoAbove: '\uE4A2',
  tenutoAbove: '\uE4A4',
  marcatoAbove: '\uE4AC',
  trill: '\uE566',
  turn: '\uE567',
  mordent: '\uE56C',
};

// Time signature digits
const TIME_SIG = {
  ts0: '\uE080',
  ts1: '\uE081',
  ts2: '\uE082',
  ts3: '\uE083',
  ts4: '\uE084',
  ts5: '\uE085',
  ts6: '\uE086',
  ts7: '\uE087',
  ts8: '\uE088',
  ts9: '\uE089',
  common: '\uE08A',
  cutCommon: '\uE08B',
};

// Rests
const RESTS = {
  whole: '\uE4E3',
  half: '\uE4E4',
  quarter: '\uE4E5',
  eighth: '\uE4E6',
  sixteenth: '\uE4E7',
};

// Precomposed notes
const NOTES = {
  whole: '\uE1D2',
  half: '\uE1D3',
  quarter: '\uE1D5',
  eighth: '\uE1D7',
  sixteenth: '\uE1D9',
};

interface GlyphGridProps {
  title: string;
  glyphs: Record<string, string>;
  fontSize?: number;
}

const GlyphGrid: React.FC<GlyphGridProps> = ({ title, glyphs, fontSize = 32 }) => (
  <div style={{ marginBottom: '2rem' }}>
    <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem', borderBottom: '1px solid #ccc', paddingBottom: '0.5rem' }}>
      {title}
    </h2>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
      {Object.entries(glyphs).map(([name, glyph]) => (
        <div
          key={name}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '0.75rem',
            border: '1px solid #e0e0e0',
            borderRadius: '8px',
            minWidth: '80px',
            backgroundColor: '#fafafa',
          }}
        >
          <span
            style={{
              fontFamily: BRAVURA_FONT,
              fontSize: `${fontSize}px`,
              lineHeight: 1.2,
              marginBottom: '0.5rem',
            }}
          >
            {glyph}
          </span>
          <span style={{ fontSize: '0.7rem', color: '#666', textAlign: 'center' }}>
            {name}
          </span>
        </div>
      ))}
    </div>
  </div>
);

export default function SymbolsPage() {
  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: '1.75rem', marginBottom: '1.5rem' }}>SMuFL Symbol Preview</h1>
      <p style={{ marginBottom: '2rem', color: '#666' }}>
        Preview Bravura font glyphs for potential toolbar usage. All displayed at 32px (20px for toolbar use = 0.83x scale).
      </p>

      <GlyphGrid title="Tuplet Digits (for triplet/quintuplet controls)" glyphs={TUPLETS} />
      <GlyphGrid title="Barlines (for measure controls)" glyphs={BARLINES} />
      <GlyphGrid title="Accidentals" glyphs={ACCIDENTALS} />
      <GlyphGrid title="Time Signature Digits" glyphs={TIME_SIG} />
      <GlyphGrid title="Rests" glyphs={RESTS} fontSize={40} />
      <GlyphGrid title="Notes (precomposed)" glyphs={NOTES} fontSize={40} />
      <GlyphGrid title="Misc (articulations, ornaments, fermata)" glyphs={MISC} fontSize={36} />

      <h2 style={{ fontSize: '1.25rem', marginTop: '2rem', marginBottom: '0.75rem', borderBottom: '1px solid #ccc', paddingBottom: '0.5rem' }}>
        Toolbar Size Comparison (20px)
      </h2>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        {['tuplet3', 'tuplet5', 'single', 'repeatLeft', 'repeatRight', 'flat', 'natural', 'sharp', 'augmentationDot'].map((name) => {
          const glyph = { ...TUPLETS, ...BARLINES, ...ACCIDENTALS, ...MISC }[name];
          return (
            <div
              key={name}
              style={{
                width: '30px',
                height: '30px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #ccc',
                borderRadius: '4px',
                backgroundColor: '#fff',
              }}
            >
              <span style={{ fontFamily: BRAVURA_FONT, fontSize: '20px' }}>{glyph}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
