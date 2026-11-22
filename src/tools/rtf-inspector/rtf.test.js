import { describe, expect, it } from 'vitest';
import { parseRtfHeader } from './rtf.utils.js';

describe('parseRtfHeader', () => {
  it('parses a well-formed header with font and color tables', () => {
    const rtf = '{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0\\fswiss Arial;}'
      + '{\\f1\\froman Caf\\\'e9;}}{\\colortbl;\\red255\\green0\\blue0;'
      + '\\red0\\green1\\blue2;}\\pard Test}';
    expect(parseRtfHeader(rtf)).toMatchObject({
      version: 1,
      charset: 'ansi',
      defaultFont: 0,
      fonts: [
        { index: 0, family: 'Swiss', name: 'Arial' },
        { index: 1, family: 'Roman', name: 'Café' },
      ],
      colors: [
        { index: 1, red: 255, green: 0, blue: 0 },
        { index: 2, red: 0, green: 1, blue: 2 },
      ],
    });
  });

  it('accepts a document without a color table and decodes unicode font names', () => {
    const rtf = '{\\rtf1\\pc\\deff2{\\fonttbl{\\f2\\fmodern \\u548?;}}\\pard Text}';
    const result = parseRtfHeader(rtf);
    expect(result.charset).toBe('pc');
    expect(result.colors).toEqual([]);
    expect(result.fonts).toEqual([{ index: 2, family: 'Modern', name: 'Ȥ' }]);
  });

  it('rejects malformed and truncated input', () => {
    expect(() => parseRtfHeader('{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}')).toThrow(/ends before/);
    expect(() => parseRtfHeader('{\\ansi Test}')).toThrow(/Missing RTF signature/);
  });
});
