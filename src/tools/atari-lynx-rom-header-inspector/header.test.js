import { describe, expect, it } from 'vitest';
import { parseHeader, parseHex } from './header.utils.js';

function header() {
  const bytes = new Uint8Array(64);
  bytes.set([76, 89, 78, 88, 0, 4, 0, 2, 1, 0]);
  bytes.set(new TextEncoder().encode('Game'), 10);
  bytes.set(new TextEncoder().encode('Atari'), 42);
  bytes.set([2, 1, 0xc1], 58);
  return bytes;
}

describe('LNX header parser', () => {
  it('decodes a valid header and EEPROM bits', () => {
    const result = parseHeader(header());
    expect(result.error).toBe('');
    expect(result.fields).toMatchObject({
      Magic: 'LYNX', 'Bank 0 page size': 1024, 'Bank 1 page size': 512,
      Version: 1, 'Cart name': 'Game', Manufacturer: 'Atari', Rotation: 'Right',
      AUDIN: 'Yes', 'EEPROM flag': '0xC1', 'EEPROM chip': '93C46',
      'EEPROM storage': 'LynxSD', 'EEPROM word size': '8-bit',
    });
  });
  it('reports invalid magic and truncated fields', () => {
    expect(parseHeader(Uint8Array.of(0, 0, 0, 0)).error).toMatch(/invalid magic/i);
    const result = parseHeader(header().slice(0, 5));
    expect(result.fields).toMatchObject({ Magic: 'LYNX', 'Bank 0 page size': 'Unknown',
      'Cart name': 'Unknown', Rotation: 'Unknown', AUDIN: 'Unknown', 'EEPROM flag': 'Unknown' });
    expect(parseHeader(header().slice(0, 3)).fields.Magic).toBe('Unknown');
  });
  it('rejects malformed and oversized hex without throwing', () => {
    for (const value of ['x0', '0', '00 '.repeat(65)]) expect(parseHex(value).error).toBeTruthy();
    expect([...parseHex('4c 59\n4e 58').bytes]).toEqual([76, 89, 78, 88]);
  });
});
