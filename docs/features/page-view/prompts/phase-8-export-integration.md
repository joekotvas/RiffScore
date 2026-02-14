# Phase 8: Export Integration

**Issue:** [#174](https://github.com/joekotvas/riffscore/issues/174)
**Estimated Effort:** 1 day
**Dependencies:** Phase 1 (Types), Phase 2 (Metadata API)

---

## Objective

Update ABC and MusicXML exporters to include score metadata (title, composer, lyricist, copyright).

---

## Deliverables

1. Updated `abcExporter.ts` with metadata export
2. Updated `musicXmlExporter.ts` with metadata export
3. Export tests verifying metadata inclusion

---

## Requirements Reference

From PRD:
- **FR-37:** Metadata stored in score JSON and exported to ABC/MusicXML

---

## ABC Export

Update `src/exporters/abcExporter.ts`:

### ABC Metadata Format

```abc
X:1
T:Score Title
C:Composer Name
Z:Lyricist Name
N:Copyright notice
M:4/4
L:1/8
K:C
```

### Implementation

```typescript
/**
 * Export score metadata to ABC header fields.
 */
const exportMetadata = (metadata: ScoreMetadata): string[] => {
  const lines: string[] = [];

  // T: - Title (required)
  lines.push(`T:${metadata.title}`);

  // C: - Composer (optional)
  if (metadata.composer) {
    lines.push(`C:${metadata.composer}`);
  }

  // Z: - Transcription (used for lyricist)
  if (metadata.lyricist) {
    lines.push(`Z:Lyricist: ${metadata.lyricist}`);
  }

  // N: - Notes (used for copyright)
  if (metadata.copyright) {
    lines.push(`N:${metadata.copyright}`);
  }

  return lines;
};

/**
 * Main export function update
 */
export const exportToABC = (score: Score): string => {
  const metadata = score.metadata ?? DEFAULT_SCORE_METADATA;
  const lines: string[] = [];

  // Reference number
  lines.push('X:1');

  // Metadata
  lines.push(...exportMetadata(metadata));

  // Meter
  lines.push(`M:${formatTimeSignature(score.timeSignature)}`);

  // Default note length
  lines.push('L:1/8');

  // Key
  lines.push(`K:${score.keySignature}`);

  // Music content
  lines.push(...exportMeasures(score));

  return lines.join('\n');
};
```

### Test Cases

```typescript
describe('ABC Export - Metadata', () => {
  it('exports title', () => {
    const score = createScore({ metadata: { title: 'My Song' } });
    const abc = exportToABC(score);
    expect(abc).toContain('T:My Song');
  });

  it('exports composer', () => {
    const score = createScore({
      metadata: { title: 'My Song', composer: 'John Doe' }
    });
    const abc = exportToABC(score);
    expect(abc).toContain('C:John Doe');
  });

  it('exports lyricist in Z field', () => {
    const score = createScore({
      metadata: { title: 'My Song', lyricist: 'Jane Smith' }
    });
    const abc = exportToABC(score);
    expect(abc).toContain('Z:Lyricist: Jane Smith');
  });

  it('exports copyright in N field', () => {
    const score = createScore({
      metadata: { title: 'My Song', copyright: '© 2026 John Doe' }
    });
    const abc = exportToABC(score);
    expect(abc).toContain('N:© 2026 John Doe');
  });

  it('omits optional fields when not present', () => {
    const score = createScore({ metadata: { title: 'My Song' } });
    const abc = exportToABC(score);
    expect(abc).not.toContain('C:');
    expect(abc).not.toContain('Z:');
    expect(abc).not.toContain('N:');
  });

  it('uses default title when not specified', () => {
    const score = createScore({});
    const abc = exportToABC(score);
    expect(abc).toContain('T:Untitled');
  });
});
```

---

## MusicXML Export

Update `src/exporters/musicXmlExporter.ts`:

### MusicXML Metadata Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work>
    <work-title>Score Title</work-title>
  </work>
  <identification>
    <creator type="composer">Composer Name</creator>
    <creator type="lyricist">Lyricist Name</creator>
    <rights>Copyright notice</rights>
    <encoding>
      <software>RiffScore</software>
      <encoding-date>2026-02-14</encoding-date>
    </encoding>
  </identification>
  <!-- ... rest of score ... -->
</score-partwise>
```

### Implementation

```typescript
/**
 * Export score metadata to MusicXML elements.
 */
const exportMetadataToXML = (metadata: ScoreMetadata): string => {
  let xml = '';

  // <work> element
  xml += '  <work>\n';
  xml += `    <work-title>${escapeXml(metadata.title)}</work-title>\n`;
  xml += '  </work>\n';

  // <identification> element
  xml += '  <identification>\n';

  // Composer
  if (metadata.composer) {
    xml += `    <creator type="composer">${escapeXml(metadata.composer)}</creator>\n`;
  }

  // Lyricist
  if (metadata.lyricist) {
    xml += `    <creator type="lyricist">${escapeXml(metadata.lyricist)}</creator>\n`;
  }

  // Copyright
  if (metadata.copyright) {
    xml += `    <rights>${escapeXml(metadata.copyright)}</rights>\n`;
  }

  // Encoding info
  xml += '    <encoding>\n';
  xml += '      <software>RiffScore</software>\n';
  xml += `      <encoding-date>${formatDate(new Date())}</encoding-date>\n`;
  xml += '    </encoding>\n';

  xml += '  </identification>\n';

  return xml;
};

/**
 * Escape special XML characters.
 */
const escapeXml = (str: string): string => {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

/**
 * Format date as YYYY-MM-DD.
 */
const formatDate = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

/**
 * Main export function update
 */
export const exportToMusicXML = (score: Score): string => {
  const metadata = score.metadata ?? DEFAULT_SCORE_METADATA;

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n';
  xml += '<score-partwise version="4.0">\n';

  // Metadata
  xml += exportMetadataToXML(metadata);

  // Part list
  xml += exportPartList(score);

  // Parts
  xml += exportParts(score);

  xml += '</score-partwise>\n';

  return xml;
};
```

### Test Cases

```typescript
describe('MusicXML Export - Metadata', () => {
  it('exports title in work-title', () => {
    const score = createScore({ metadata: { title: 'My Song' } });
    const xml = exportToMusicXML(score);
    expect(xml).toContain('<work-title>My Song</work-title>');
  });

  it('exports composer as creator', () => {
    const score = createScore({
      metadata: { title: 'My Song', composer: 'John Doe' }
    });
    const xml = exportToMusicXML(score);
    expect(xml).toContain('<creator type="composer">John Doe</creator>');
  });

  it('exports lyricist as creator', () => {
    const score = createScore({
      metadata: { title: 'My Song', lyricist: 'Jane Smith' }
    });
    const xml = exportToMusicXML(score);
    expect(xml).toContain('<creator type="lyricist">Jane Smith</creator>');
  });

  it('exports copyright in rights', () => {
    const score = createScore({
      metadata: { title: 'My Song', copyright: '© 2026 John Doe' }
    });
    const xml = exportToMusicXML(score);
    expect(xml).toContain('<rights>© 2026 John Doe</rights>');
  });

  it('escapes XML special characters', () => {
    const score = createScore({
      metadata: { title: 'Rock & Roll', composer: '<Unknown>' }
    });
    const xml = exportToMusicXML(score);
    expect(xml).toContain('<work-title>Rock &amp; Roll</work-title>');
    expect(xml).toContain('&lt;Unknown&gt;');
  });

  it('includes encoding information', () => {
    const score = createScore({});
    const xml = exportToMusicXML(score);
    expect(xml).toContain('<software>RiffScore</software>');
    expect(xml).toContain('<encoding-date>');
  });

  it('omits optional fields when not present', () => {
    const score = createScore({ metadata: { title: 'My Song' } });
    const xml = exportToMusicXML(score);
    expect(xml).not.toContain('type="composer"');
    expect(xml).not.toContain('type="lyricist"');
    expect(xml).not.toContain('<rights>');
  });
});
```

---

## Coding Standards

### XML Escaping
Always escape special characters in XML output:
- `&` → `&amp;`
- `<` → `&lt;`
- `>` → `&gt;`
- `"` → `&quot;`
- `'` → `&apos;`

### Default Values
Use `DEFAULT_SCORE_METADATA` when metadata is undefined.

### Test Isolation
Each test should create its own score with specific metadata.

---

## Parallelization Strategy

### Parallel Implementation (2 subagents)
1. **ABC Agent:** Update abcExporter.ts
2. **MusicXML Agent:** Update musicXmlExporter.ts

### Parallel Testing (2 subagents)
1. **ABC Tests Agent:** Write ABC export tests
2. **MusicXML Tests Agent:** Write MusicXML export tests

### Final Step (Executor)
Run `npm run test` to verify.

---

## Acceptance Criteria

- [ ] ABC export includes T: field for title
- [ ] ABC export includes C: field for composer (when present)
- [ ] ABC export includes Z: field for lyricist (when present)
- [ ] ABC export includes N: field for copyright (when present)
- [ ] MusicXML export includes `<work-title>`
- [ ] MusicXML export includes `<creator type="composer">` (when present)
- [ ] MusicXML export includes `<creator type="lyricist">` (when present)
- [ ] MusicXML export includes `<rights>` (when present)
- [ ] MusicXML properly escapes special characters
- [ ] All export tests pass

---

## Files to Modify

| File | Action |
|------|--------|
| `src/exporters/abcExporter.ts` | Modify |
| `src/exporters/musicXmlExporter.ts` | Modify |
| `src/__tests__/exporters/abcExporter.test.ts` | Modify |
| `src/__tests__/exporters/musicXmlExporter.test.ts` | Modify |
