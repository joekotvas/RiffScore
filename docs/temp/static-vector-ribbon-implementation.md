# Score Ribbon Effect

> Technical exploration for implementing curved/waving staff lines using raw SVG math, integrated with RiffScore's layout engine.

## Core Concept: Global Displacement with Decay Envelope

The score maps to a curved surface using a displacement function **modulated by a decay envelope**:

$$y_{final} = y_{original} + (A \cdot E(x)) \cdot \sin(Bx + \phi)$$

**Where:**
- `A` = Amplitude (max wave height in pixels)
- `B` = Frequency (wavelength factor)
- `φ` = Phase (shifts wave left/right)
- `E(x)` = Envelope function (decays from 1 → 0 as x increases)

---

## Envelope Functions

Normalize `x` to `[0, 1]` range: `t = (x - startX) / (endX - startX)`

### Linear Fade
$$E(t) = 1 - t$$
Simple, even decay.

### Ease-Out (Recommended)
$$E(t) = (1 - t)^2$$
Strong wave at start, smooth fade to end.

### Exponential Decay
$$E(t) = e^{-kt}$$
Dramatic start, very rapid fade. `k` controls steepness (e.g., `k = 3`).

```typescript
type EnvelopeType = 'linear' | 'easeOut' | 'exponential';

function getEnvelope(t: number, type: EnvelopeType, k: number = 3): number {
  // t is normalized 0-1 across the score width
  switch (type) {
    case 'linear':
      return 1 - t;
    case 'easeOut':
      return (1 - t) ** 2;
    case 'exponential':
      return Math.exp(-k * t);
  }
}

function getWaveOffset(
  x: number, 
  startX: number, 
  endX: number, 
  wave: WaveConfig
): number {
  const t = (x - startX) / (endX - startX); // Normalize to 0-1
  const envelope = getEnvelope(t, wave.envelope, wave.decayRate);
  return wave.amplitude * envelope * Math.sin(wave.frequency * x + wave.phase);
}

interface WaveConfig {
  amplitude: number;       // Max wave height (pixels)
  frequency: number;       // Radians per pixel
  phase: number;           // Starting phase (radians)
  envelope: EnvelopeType;  // Decay shape
  decayRate?: number;      // For exponential (default: 3)
}
```

---

## Simplified Approach: Vertical Offset Only

**Key Insight:** Only staff lines need to render as curved `<path>` elements. Everything else (notes, stems, beams, barlines, etc.) simply gets a **vertical Y offset** based on its X position. No rotation required.

This means:
- Staff lines: Curved SVG paths ✓
- Notes, rests, accidentals: Y offset only ✓
- Stems: Straight, Y offset at base ✓  
- Beams: Straight lines, endpoints Y-offset ✓
- Barlines: Straight vertical, endpoints Y-offset ✓
- Ties/slurs: Control points Y-offset ✓

---

## Implementation

### Step 1: Wave Staff Lines (Curved Paths)

```tsx
// Generate wave path for a single staff line
function generateWavePath(
  startX: number,
  endX: number,
  baseY: number,
  wave: WaveConfig,
  step: number = 8
): string {
  const points: string[] = [];
  for (let x = startX; x <= endX; x += step) {
    const y = baseY + wave.amplitude * Math.sin(wave.frequency * x + wave.phase);
    points.push(x === startX ? `M ${x} ${y}` : `L ${x} ${y}`);
  }
  return points.join(' ');
}

// Usage: 5 staff lines
{[0, 1, 2, 3, 4].map((i) => (
  <path
    key={i}
    d={generateWavePath(startX, endX, baseY + i * lineHeight, waveConfig)}
    stroke={theme.score.staffLine}
    fill="none"
  />
))}
```

### Step 2: Everything Else (Y Offset Only)

```typescript
// Simple vertical displacement function
function getWaveOffset(x: number, wave: WaveConfig): number {
  return wave.amplitude * Math.sin(wave.frequency * x + wave.phase);
}

// Note positioning
const noteY = baseY + getOffsetForPitch(pitch, clef) + getWaveOffset(x, wave);

// Stem (just offset the base)
<line x1={stemX} y1={noteY} x2={stemX} y2={noteY + stemLength} />

// Beam (offset each endpoint)
const beam1Y = baseBeamY + getWaveOffset(beam1X, wave);
const beam2Y = baseBeamY + getWaveOffset(beam2X, wave);
<line x1={beam1X} y1={beam1Y} x2={beam2X} y2={beam2Y} strokeWidth={beamThickness} />

// Barline (offset top and bottom)
const barTopY = topStaffLine + getWaveOffset(barX, wave);
const barBottomY = bottomStaffLine + getWaveOffset(barX, wave);
<line x1={barX} y1={barTopY} x2={barX} y2={barBottomY} />
```

---

## Simplified Hook

```typescript
// src/engines/wave/useWaveLayout.ts

interface UseWaveLayoutReturn {
  enabled: boolean;
  getOffset: (x: number) => number;
  generateStaffLinePath: (startX: number, endX: number, lineY: number) => string;
}

export function useWaveLayout(totalWidth?: number): UseWaveLayoutReturn {
  const { ui } = useRiffScoreConfig();
  const waveStaff = ui?.waveStaff;
  
  const config = useMemo(() => {
    if (!waveStaff?.enabled || !totalWidth) return null;
    const cycles = waveStaff.cycles ?? 2;
    return {
      amplitude: waveStaff.amplitude ?? 20,
      frequency: (2 * Math.PI * cycles) / totalWidth,
      phase: waveStaff.phase ?? 0,
    };
  }, [waveStaff, totalWidth]);
  
  const getOffset = useMemo(() => {
    if (!config) return () => 0;
    return (x: number) => config.amplitude * Math.sin(config.frequency * x + config.phase);
  }, [config]);
  
  const generateStaffLinePath = useMemo(() => {
    if (!config) {
      return (startX: number, endX: number, lineY: number) => 
        `M ${startX} ${lineY} L ${endX} ${lineY}`;
    }
    return (startX: number, endX: number, lineY: number) =>
      generateWavePath(startX, endX, lineY, config);
  }, [config]);
  
  return { enabled: !!config, getOffset, generateStaffLinePath };
}
```

---

## Component Changes (Minimal)

| Component | Change |
|-----------|--------|
| `Staff.tsx` | Replace `<line>` with `<path d={wave.generateStaffLinePath(...)}` |
| `Note.tsx` | Add `+ wave.getOffset(x)` to Y calculation |
| `Beam.tsx` | Offset each endpoint Y by `wave.getOffset(x)` |
| `Tie.tsx` | Offset control point Ys by their respective X offsets |
| `Barline` | Offset top/bottom Y |

**No rotation, no tangent angles, no curved beams.**



---

## Modular Architecture: `useWaveLayout` Hook

The wave rendering should be **optional and encapsulated** in its own module, integrated via a hook that components can consume without modifying their core logic.

### Folder Structure

```
src/
├── engines/
│   └── wave/                    # NEW: Wave layout module
│       ├── index.ts             # Public exports
│       ├── types.ts             # WaveConfig, WavePoint interfaces
│       ├── math.ts              # Core displacement, angle functions
│       ├── paths.ts             # SVG path generators
│       └── useWaveLayout.ts     # Main hook
├── components/
│   └── Canvas/
│       ├── Staff.tsx            # Uses useWaveLayout (optional)
│       └── WaveStaffLines.tsx   # NEW: Wave-aware staff lines component
```

### Core Hook: `useWaveLayout`

```typescript
// src/engines/wave/useWaveLayout.ts

import { useMemo } from 'react';
import { useRiffScoreConfig } from '@/context/ConfigContext';
import { getWaveY, getWaveAngle, generateWavePath } from './math';
import { WaveConfig, WaveTransform } from './types';

interface UseWaveLayoutReturn {
  enabled: boolean;
  config: WaveConfig | null;
  
  // Transform functions - return identity when disabled
  transformY: (x: number, y: number) => number;
  getRotation: (x: number) => number;
  
  // Path generators
  generateStaffLinePath: (startX: number, endX: number, lineY: number) => string;
  generateBeamPath: (startX: number, startY: number, endX: number, endY: number, thickness: number) => string;
  
  // Point transform (for complex shapes)
  transformPoint: (x: number, y: number) => { x: number; y: number; angle: number };
}

export function useWaveLayout(totalWidth?: number): UseWaveLayoutReturn {
  const { ui } = useRiffScoreConfig();
  const waveStaff = ui?.waveStaff;
  
  // Compute wave config with frequency based on total width
  const config = useMemo<WaveConfig | null>(() => {
    if (!waveStaff?.enabled || !totalWidth) return null;
    
    const cycles = waveStaff.cycles ?? 2;
    return {
      amplitude: waveStaff.amplitude ?? 20,
      frequency: (2 * Math.PI * cycles) / totalWidth,
      phase: waveStaff.phase ?? 0,
    };
  }, [waveStaff, totalWidth]);
  
  // Transform functions - identity when disabled
  const transformY = useMemo(() => {
    if (!config) return (_x: number, y: number) => y;
    return (x: number, y: number) => getWaveY(x, y, config);
  }, [config]);
  
  const getRotation = useMemo(() => {
    if (!config) return (_x: number) => 0;
    return (x: number) => getWaveAngle(x, config);
  }, [config]);
  
  const generateStaffLinePath = useMemo(() => {
    if (!config) {
      // Return straight line path when disabled
      return (startX: number, endX: number, lineY: number) => 
        `M ${startX} ${lineY} L ${endX} ${lineY}`;
    }
    return (startX: number, endX: number, lineY: number) =>
      generateWavePath(startX, endX, lineY, config);
  }, [config]);
  
  const generateBeamPath = useMemo(() => {
    if (!config) {
      // Return straight polygon path when disabled
      return (startX: number, startY: number, endX: number, endY: number, thickness: number) =>
        `M ${startX} ${startY} L ${endX} ${endY} L ${endX} ${endY + thickness} L ${startX} ${startY + thickness} Z`;
    }
    return (startX: number, startY: number, endX: number, endY: number, thickness: number) =>
      generateCurvedBeamPath(startX, startY, endX, endY, thickness, config);
  }, [config]);
  
  const transformPoint = useMemo(() => {
    if (!config) return (x: number, y: number) => ({ x, y, angle: 0 });
    return (x: number, y: number) => ({
      x,
      y: getWaveY(x, y, config),
      angle: getWaveAngle(x, config),
    });
  }, [config]);
  
  return {
    enabled: !!config,
    config,
    transformY,
    getRotation,
    generateStaffLinePath,
    generateBeamPath,
    transformPoint,
  };
}
```

### Usage in Components

**Staff.tsx** – minimal changes:
```tsx
import { useWaveLayout } from '@/engines/wave';

const Staff: React.FC<StaffProps> = ({ ... }) => {
  const totalWidth = calculateStaffWidth(measures, keySignature);
  const wave = useWaveLayout(totalWidth);
  
  return (
    <g className="staff">
      {/* Staff lines - delegate to wave-aware component or use path generator */}
      {[0, 1, 2, 3, 4].map((i) => (
        <path
          key={i}
          d={wave.generateStaffLinePath(startX, endX, baseY + i * lineHeight)}
          stroke={theme.score.staffLine}
          fill="none"
        />
      ))}
      
      {/* Pass wave context to children */}
      <WaveContext.Provider value={wave}>
        {measureComponents}
      </WaveContext.Provider>
    </g>
  );
};
```

**Note.tsx** – uses wave context:
```tsx
import { useWaveContext } from '@/engines/wave';

const Note: React.FC<NoteProps> = ({ x, pitch, ... }) => {
  const wave = useWaveContext();
  
  const rawY = baseY + getOffsetForPitch(pitch, clef);
  const { y: noteY, angle } = wave.transformPoint(x, rawY);
  
  return (
    <g transform={`translate(${x}, ${noteY}) rotate(${angle})`}>
      <text>{noteheadGlyph}</text>
      {renderStem && <line ... />}
    </g>
  );
};
```

### Wave Context (Lightweight Propagation)

```typescript
// src/engines/wave/WaveContext.ts
import { createContext, useContext } from 'react';
import { UseWaveLayoutReturn } from './useWaveLayout';

// Default: disabled (identity transforms)
const defaultWave: UseWaveLayoutReturn = {
  enabled: false,
  config: null,
  transformY: (_, y) => y,
  getRotation: () => 0,
  generateStaffLinePath: (sx, ex, y) => `M ${sx} ${y} L ${ex} ${y}`,
  generateBeamPath: (sx, sy, ex, ey, t) => `M ${sx} ${sy} L ${ex} ${ey} L ${ex} ${ey+t} L ${sx} ${sy+t} Z`,
  transformPoint: (x, y) => ({ x, y, angle: 0 }),
};

export const WaveContext = createContext<UseWaveLayoutReturn>(defaultWave);
export const useWaveContext = () => useContext(WaveContext);
```

### File-by-File Breakdown

| File | Responsibility |
|------|----------------|
| `wave/types.ts` | `WaveConfig`, `WavePoint` interfaces |
| `wave/math.ts` | `getWaveY()`, `getWaveAngle()`, `waveDisplacement()` |
| `wave/paths.ts` | `generateWavePath()`, `generateCurvedBeamPath()` |
| `wave/useWaveLayout.ts` | Main hook, memoized transforms |
| `wave/WaveContext.ts` | React context for child components |
| `wave/index.ts` | Public API: `{ useWaveLayout, useWaveContext, WaveContext }` |

### Integration Summary

1. **Config-driven:** Wave is enabled via `ui.waveStaff.enabled` in RiffScoreConfig
2. **Zero-cost when disabled:** All transform functions return identity values
3. **Single source of truth:** `useWaveLayout` hook computes config once at Staff level
4. **Context propagation:** Children use `useWaveContext()` – no prop drilling
5. **Encapsulated:** All wave logic lives in `src/engines/wave/`

---


