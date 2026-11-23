import { describe, expect, it } from 'vitest';
import { parseFits } from './fits.utils.js';

const card = (text) => text.padEnd(80, ' ');
function header(cards) {
  const text = [...cards, 'END'].map(card).join('');
  return new TextEncoder().encode(text.padEnd(Math.ceil(text.length / 2880) * 2880, ' '));
}
function join(...parts) {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}
const primary = () => header([
  'SIMPLE  =                    T', 'BITPIX  =                    8',
  'NAXIS   =                    2', 'NAXIS1  =                    2',
  'NAXIS2  =                    2', "OBJECT  = 'M 31 / galaxy' / target",
  "DATE-OBS= '2020-01-01'", 'BSCALE  =                  1.5',
  'BZERO   =                  128', 'EXTEND  =                    T',
  "CONTINUE  'part''s' / continued", 'COMMENT some comment', 'HISTORY an event',
]);

describe('parseFits', () => {
  it('decodes cards and primary dimensions', () => {
    const [hdu] = parseFits(join(primary(), new Uint8Array(2880)));
    expect(hdu.dataSize).toBe(4);
    expect(hdu.values).toMatchObject({ OBJECT: 'M 31 / galaxy', 'DATE-OBS': '2020-01-01',
      BSCALE: 1.5, BZERO: 128, EXTEND: true });
    expect(hdu.cards.find((item) => item.keyword === 'OBJECT').comment).toBe('target');
    expect(hdu.cards.find((item) => item.keyword === 'CONTINUE').value).toBe("part's");
    expect(hdu.cards.find((item) => item.keyword === 'HISTORY').comment).toBe('an event');
  });
  it('walks table extensions including heap bytes and following HDUs', () => {
    const table = header(["XTENSION= 'BINTABLE'", 'BITPIX  =                    8',
      'NAXIS   =                    2', 'NAXIS1  =                    4',
      'NAXIS2  =                    2', 'PCOUNT  =                 2874',
      'GCOUNT  =                    1']);
    const image = header(["XTENSION= 'IMAGE   '", 'BITPIX  =                   16',
      'NAXIS   =                    0', 'PCOUNT  =                    0',
      'GCOUNT  =                    1']);
    const hdus = parseFits(join(primary(), new Uint8Array(2880), table,
      new Uint8Array(5760), image));
    expect(hdus.map((hdu) => hdu.dataSize)).toEqual([4, 2882, 0]);
    expect(hdus[2].values.XTENSION).toBe('IMAGE');
  });
  it('rejects truncated blocks, missing END and truncated data', () => {
    expect(() => parseFits(primary().slice(0, -1))).toThrow(/block size/i);
    expect(() => parseFits(new TextEncoder().encode(card('SIMPLE  =                    T')
      .padEnd(2880, ' ')))).toThrow(/END/);
    expect(() => parseFits(primary())).toThrow(/truncated/i);
  });
  it('rejects invalid signatures and non-ASCII header cards', () => {
    expect(() => parseFits(header(['NOTFITS =                    T'])))
      .toThrow(/signature/i);
    const bytes = primary();
    bytes[100] = 255;
    expect(() => parseFits(bytes)).toThrow(/ASCII/);
  });
});
