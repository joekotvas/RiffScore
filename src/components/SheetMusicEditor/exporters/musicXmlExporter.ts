// @ts-nocheck
import { NOTE_TYPES } from '../constants';
import { getActiveStaff } from '../types';

export const generateMusicXML = (score: any) => {
    const activeStaff = getActiveStaff(score);
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1">
      <part-name>Music</part-name>
    </score-part>
  </part-list>
  <part id="P1">`;

    activeStaff.measures.forEach((measure: any, mIndex: number) => {
      xml += `\n    <measure number="${mIndex + 1}">`;
      if (mIndex === 0) {
        const clef = activeStaff.clef || 'treble';
        const clefSign = clef === 'bass' ? 'F' : 'G';
        const clefLine = clef === 'bass' ? '4' : '2';
        xml += `
    <attributes>
      <divisions>16</divisions>
      <key>
        <fifths>0</fifths>
      </key>
      <time>
        <beats>${(score.timeSignature || '4/4').split('/')[0]}</beats>
        <beat-type>${(score.timeSignature || '4/4').split('/')[1]}</beat-type>
      </time>
      <clef>
        <sign>${clefSign}</sign>
        <line>${clefLine}</line>
      </clef>
    </attributes>`;
      }

      // Render Events sequentially
      measure.events.forEach((event: any) => {
        let duration = NOTE_TYPES[event.duration].duration;
        if (event.dotted) duration = duration * 1.5;
        const xmlType = NOTE_TYPES[event.duration].xmlType;

        if (event.notes.length === 0) {
            // REST
            xml += `
    <note>
      <rest/>
      <duration>${duration}</duration>
      <type>${xmlType}</type>
      ${event.dotted ? '<dot/>' : ''}
    </note>`;
        } else {
            // NOTES / CHORDS
            event.notes.forEach((note: any, nIndex: number) => {
               const isChord = nIndex > 0;
               const step = note.pitch.charAt(0);
               const octave = note.pitch.slice(-1);
               
               let accidentalTag = '';
               if (note.accidental) {
                   // Map internal 'sharp'/'flat' to MusicXML 'sharp'/'flat'
                   // Assuming they match, but let's be safe
                   const acc = note.accidental === 'natural' ? 'natural' : 
                               note.accidental === 'sharp' ? 'sharp' : 
                               note.accidental === 'flat' ? 'flat' : '';
                   if (acc) accidentalTag = `<accidental>${acc}</accidental>`;
               }

               let tieTag = '';
               let tiedNotations = '';
               if (note.tied) {
                   tieTag = '<tie type="start"/>';
                   tiedNotations = '<notations><tied type="start"/></notations>';
               }

               xml += `
    <note>
      ${isChord ? '<chord/>' : ''}
      <pitch>
        <step>${step}</step>
        <octave>${octave}</octave>
      </pitch>
      <duration>${duration}</duration>
      <type>${xmlType}</type>
      ${accidentalTag}
      ${event.dotted ? '<dot/>' : ''}
      ${tieTag}
      ${tiedNotations}
    </note>`;
            });
        }
      });
      xml += `\n    </measure>`;
    });
    xml += `\n  </part>\n</score-partwise>`;
    return xml;
};
