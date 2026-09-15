/**
 * The MusicXML importer's XML reader: a small non-validating parser that must accept every
 * construct a MusicXML file can contain and report malformed input with a line number.
 */

import fc from 'fast-check';
import { XMLParser } from 'fast-xml-parser';
import {
  parseXml,
  decodeXmlEntities,
  xmlChild,
  xmlChildren,
  xmlNumber,
  xmlText,
} from '@/importers/xml';
import type { XmlElement } from '@/importers/xml';

const ok = (s: string): XmlElement => {
  const r = parseXml(s);
  if (!r.ok) throw new Error(r.error);
  return r.root;
};

const err = (s: string): string => {
  const r = parseXml(s);
  if (r.ok) throw new Error('expected a parse error');
  return r.error;
};

describe('parseXml', () => {
  it('reads elements, attributes and text', () => {
    const root = ok('<a x="1" y=\'two\'><b>hi</b><c/><d>3</d></a>');
    expect(root.name).toBe('a');
    expect(root.attrs).toEqual({ x: '1', y: 'two' });
    expect(root.children.map((c) => c.name)).toEqual(['b', 'c', 'd']);
    expect(xmlText(root, 'b')).toBe('hi');
    expect(xmlNumber(root, 'd')).toBe(3);
    expect(xmlNumber(root, 'b')).toBeNull();
    expect(xmlChild(root, 'missing')).toBeUndefined();
    expect(xmlChildren(root, 'c')).toHaveLength(1);
  });

  it('skips the declaration, a DOCTYPE with an internal subset, comments and processing instructions', () => {
    const root = ok(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd" [
  <!ENTITY sharp "#"> <!-- a ">" inside: --> <!ELEMENT x (#PCDATA)>
]>
<!-- leading comment -->
<?app hint="x"?>
<score-partwise version="4.0"><!-- inner --><part-list/></score-partwise>
<!-- trailing -->`);
    expect(root.name).toBe('score-partwise');
    expect(root.attrs.version).toBe('4.0');
    expect(root.children.map((c) => c.name)).toEqual(['part-list']);
  });

  it('decodes entities and CDATA', () => {
    const root = ok(
      '<t a="&lt;&amp;&quot;">Tom &amp; Jerry &#233;&#xE9; &lt;3 <![CDATA[<raw> & stuff]]> &unknown;</t>'
    );
    expect(root.attrs.a).toBe('<&"');
    expect(root.text).toBe('Tom & Jerry éé <3 <raw> & stuff &unknown;');
    expect(decodeXmlEntities('&#x1F3B5;')).toBe('🎵');
    expect(decodeXmlEntities('no entities')).toBe('no entities');
  });

  it('strips namespace prefixes, keeps CRLF text and drops a byte-order mark', () => {
    const root = ok('﻿<m:score xmlns:m="urn:x"><m:part id="P1">a\r\nb</m:part></m:score>');
    expect(root.name).toBe('score');
    expect(root.children[0].name).toBe('part');
    expect(root.children[0].attrs.id).toBe('P1');
    expect(root.children[0].text).toBe('a\r\nb');
  });

  it.each([
    ['<a><b></a>', /Mismatched closing tag <\/a> for <b> \(line 1\)/],
    ['<a>\n<b>\n', /Unclosed element <b> \(line 3\)/],
    ['<a/></a>', /Unexpected closing tag <\/a>/],
    ['text<a/>', /Text outside the root element/],
    ['<a/><b/>', /More than one root element/],
    ['<a x=1/>', /Unquoted value for attribute "x"/],
    ['<a x/>', /Attribute "x" has no value/],
    ['<a x="1/>', /Unterminated value/],
    ['<a><!-- never closed', /Unterminated comment/],
    ['<a><![CDATA[x</a>', /Unterminated CDATA/],
    ['<?xml version="1.0"?>', /No XML content/],
    ['', /No XML content/],
    ['<1a/>', /Malformed tag/],
    ['<a', /Unterminated tag <a>/],
  ])('reports %j', (input, message) => {
    expect(err(input)).toMatch(message);
  });

  it('agrees with fast-xml-parser on a MusicXML fragment', () => {
    const xml = `<score-partwise version="3.1"><part id="P1"><measure number="1"><note><pitch><step>C</step><alter>-1</alter><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note><note><rest measure="yes"/><duration>16</duration></note></measure></part></score-partwise>`;
    const mine = ok(xml);
    const theirs = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' }).parse(xml);
    const measure = mine.children[0].children[0];
    expect(measure.attrs.number).toBe(theirs['score-partwise'].part.measure.number);
    const [note, rest] = xmlChildren(measure, 'note');
    expect(xmlText(xmlChild(note, 'pitch'), 'step')).toBe(
      theirs['score-partwise'].part.measure.note[0].pitch.step
    );
    expect(xmlNumber(xmlChild(note, 'pitch'), 'alter')).toBe(
      theirs['score-partwise'].part.measure.note[0].pitch.alter
    );
    expect(xmlChild(rest, 'rest')?.attrs.measure).toBe(
      theirs['score-partwise'].part.measure.note[1].rest.measure
    );
  });

  it('round-trips arbitrary element trees (serialize → parse)', () => {
    const name = fc.stringMatching(/^[a-z][a-z0-9-]{0,7}$/);
    const text = fc.string({ maxLength: 12 }).filter((s) => !/[\uD800-\uDFFF]/.test(s));
    const tree: fc.Arbitrary<XmlElement> = fc.letrec<{ node: XmlElement }>((tie) => ({
      node: fc.record({
        name,
        attrs: fc.dictionary(name, text, { maxKeys: 3 }),
        children: fc.oneof(
          { maxDepth: 4, depthSize: 'small' },
          fc.constant([] as XmlElement[]),
          fc.array(tie('node'), { maxLength: 3 })
        ),
        text: fc.constant(''),
      }),
    })).node;
    const escape = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const serialize = (el: XmlElement): string => {
      const attrs = Object.entries(el.attrs)
        .map(([k, v]) => ` ${k}="${escape(v)}"`)
        .join('');
      return el.children.length === 0
        ? `<${el.name}${attrs}/>`
        : `<${el.name}${attrs}>${el.children.map(serialize).join('')}</${el.name}>`;
    };
    fc.assert(
      fc.property(tree, (t) => {
        const parsed = parseXml(serialize(t));
        expect(parsed.ok && parsed.root).toEqual(t);
      }),
      { numRuns: 300 }
    );
  });
});
