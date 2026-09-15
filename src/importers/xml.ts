/**
 * Minimal XML reader for the MusicXML importer.
 *
 * A dependency-free, non-validating parser that turns a document into a plain element tree:
 * elements, attributes and character data. It understands everything a MusicXML file can
 * contain — the XML declaration, a DOCTYPE with an internal subset, comments, processing
 * instructions, CDATA sections, the predefined and numeric character references — and nothing
 * more (no external entities, no namespaces beyond stripping prefixes). It never throws:
 * malformed input is reported with the line it was found on.
 *
 * @tested src/__tests__/importers/xml.test.ts
 */

export interface XmlElement {
  /** Local element name (a namespace prefix, if any, is stripped). */
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
  /** Character data directly inside this element, in document order (untrimmed). */
  text: string;
}

export type XmlParseResult = { ok: true; root: XmlElement } | { ok: false; error: string };

const NAME_RE = /[A-Za-z_:][\w:.-]*/y;

const ENTITIES: Record<string, string> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
};

/** Resolve `&lt;`, `&#233;`, `&#xE9;` …; an unknown entity reference is kept literally. */
export const decodeXmlEntities = (s: string): string => {
  if (s.indexOf('&') === -1) return s;
  return s.replace(/&(#x[0-9A-Fa-f]+|#\d+|\w+);/g, (match, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    return ENTITIES[body] ?? match;
  });
};

const localName = (qualified: string): string => {
  const colon = qualified.indexOf(':');
  return colon === -1 ? qualified : qualified.slice(colon + 1);
};

/**
 * Parse an XML document into an element tree.
 */
export const parseXml = (input: string): XmlParseResult => {
  const s = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const len = s.length;
  let pos = 0;
  const stack: XmlElement[] = [];
  let root: XmlElement | null = null;

  const lineAt = (at: number): number => {
    let line = 1;
    for (let i = 0; i < at && i < len; i++) if (s.charCodeAt(i) === 10) line += 1;
    return line;
  };
  const fail = (message: string, at = pos): XmlParseResult => ({
    ok: false,
    error: `${message} (line ${lineAt(at)})`,
  });
  const addText = (t: string): void => {
    if (stack.length > 0) stack[stack.length - 1].text += t;
  };

  while (pos < len) {
    const lt = s.indexOf('<', pos);
    const textEnd = lt === -1 ? len : lt;
    if (textEnd > pos) {
      const t = s.slice(pos, textEnd);
      if (stack.length > 0) addText(decodeXmlEntities(t));
      else if (t.trim() !== '') return fail('Text outside the root element');
    }
    if (lt === -1) break;
    pos = lt;

    if (s.startsWith('<!--', pos)) {
      const end = s.indexOf('-->', pos + 4);
      if (end === -1) return fail('Unterminated comment');
      pos = end + 3;
      continue;
    }
    if (s.startsWith('<![CDATA[', pos)) {
      const end = s.indexOf(']]>', pos + 9);
      if (end === -1) return fail('Unterminated CDATA section');
      if (stack.length === 0) return fail('Text outside the root element');
      addText(s.slice(pos + 9, end));
      pos = end + 3;
      continue;
    }
    if (s.startsWith('<?', pos)) {
      const end = s.indexOf('?>', pos + 2);
      if (end === -1) return fail('Unterminated processing instruction');
      pos = end + 2;
      continue;
    }
    if (s.startsWith('<!', pos)) {
      // <!DOCTYPE …> possibly with an internal subset in [ … ]; quoted strings may hold ">".
      let depth = 0;
      let quote: string | null = null;
      let i = pos + 2;
      for (; i < len; i++) {
        const c = s[i];
        if (quote) {
          if (c === quote) quote = null;
        } else if (c === '"' || c === "'") quote = c;
        else if (c === '[') depth += 1;
        else if (c === ']') depth -= 1;
        else if (c === '>' && depth <= 0) break;
      }
      if (i >= len) return fail('Unterminated declaration');
      pos = i + 1;
      continue;
    }
    if (s[pos + 1] === '/') {
      const end = s.indexOf('>', pos + 2);
      if (end === -1) return fail('Unterminated end tag');
      const name = localName(s.slice(pos + 2, end).trim());
      const open = stack.pop();
      if (!open) return fail(`Unexpected closing tag </${name}>`);
      if (open.name !== name) return fail(`Mismatched closing tag </${name}> for <${open.name}>`);
      pos = end + 1;
      continue;
    }

    // Start tag.
    const tagStart = pos;
    pos += 1;
    NAME_RE.lastIndex = pos;
    const nameMatch = NAME_RE.exec(s);
    if (!nameMatch) return fail('Malformed tag', tagStart);
    pos = NAME_RE.lastIndex;
    const element: XmlElement = {
      name: localName(nameMatch[0]),
      attrs: {},
      children: [],
      text: '',
    };
    let selfClosing = false;
    for (;;) {
      while (pos < len && /\s/.test(s[pos])) pos += 1;
      if (pos >= len) return fail(`Unterminated tag <${element.name}>`, tagStart);
      if (s[pos] === '>') {
        pos += 1;
        break;
      }
      if (s[pos] === '/' && s[pos + 1] === '>') {
        selfClosing = true;
        pos += 2;
        break;
      }
      NAME_RE.lastIndex = pos;
      const attrMatch = NAME_RE.exec(s);
      if (!attrMatch) return fail(`Malformed attribute in <${element.name}>`);
      pos = NAME_RE.lastIndex;
      while (pos < len && /\s/.test(s[pos])) pos += 1;
      if (s[pos] !== '=') return fail(`Attribute "${attrMatch[0]}" has no value`);
      pos += 1;
      while (pos < len && /\s/.test(s[pos])) pos += 1;
      const quote = s[pos];
      if (quote !== '"' && quote !== "'")
        return fail(`Unquoted value for attribute "${attrMatch[0]}"`);
      const end = s.indexOf(quote, pos + 1);
      if (end === -1) return fail(`Unterminated value for attribute "${attrMatch[0]}"`);
      element.attrs[attrMatch[0]] = decodeXmlEntities(s.slice(pos + 1, end));
      pos = end + 1;
    }

    if (stack.length > 0) stack[stack.length - 1].children.push(element);
    else if (root) return fail('More than one root element', tagStart);
    else root = element;
    if (!selfClosing) stack.push(element);
  }

  if (stack.length > 0) return fail(`Unclosed element <${stack[stack.length - 1].name}>`, len);
  if (!root) return { ok: false, error: 'No XML content' };
  return { ok: true, root };
};

// ============================================================================
// Tree accessors
// ============================================================================

export const xmlChild = (el: XmlElement | undefined, name: string): XmlElement | undefined =>
  el?.children.find((c) => c.name === name);

export const xmlChildren = (el: XmlElement | undefined, name: string): XmlElement[] =>
  el ? el.children.filter((c) => c.name === name) : [];

/** Trimmed text of `el` (or of its child `name`); '' when absent. */
export const xmlText = (el: XmlElement | undefined, name?: string): string => {
  const target = name === undefined ? el : xmlChild(el, name);
  return target ? target.text.trim() : '';
};

/** Numeric text of `el` (or of its child `name`); null when absent or not a number. */
export const xmlNumber = (el: XmlElement | undefined, name?: string): number | null => {
  const t = xmlText(el, name);
  if (t === '') return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
};
