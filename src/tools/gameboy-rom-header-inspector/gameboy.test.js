import { describe, expect, it } from 'vitest';
import { decodeBytes, parseGameBoyHeader } from './gameboy.utils.js';

const logo = 'CEED6666CC0D000B03730083000C000D0008111F8889000E' +
  'DCCC6EE6DDDDD999BBBB67636E0EECCCDDDC999FBBB9333E';
function makeRom() {
  const bytes = new Uint8Array(0x8000);
  bytes.set(logo.match(/../g).map((part) => parseInt(part, 16)), 0x104);
  bytes.set(new TextEncoder().encode('TEST GAME'), 0x134);
  bytes[0x147] = 1;
  for (let i = 0x134; i <= 0x14c; i += 1) bytes[0x14d] -= bytes[i] + 1;
  let sum = 0;
  for (const byte of bytes) sum = (sum + byte) & 0xffff;
  bytes[0x14e] = sum >> 8;
  bytes[0x14f] = sum & 0xff;
  return bytes;
}

describe('Game Boy headers', () => {
  it('parses a valid DMG header and both checksums', () => {
    expect(parseGameBoyHeader(makeRom())).toMatchObject({
      ok: true, title: 'TEST GAME', cgb: 'DMG', cartridgeType: 'MBC1', logoValid: true,
      headerChecksum: { valid: true }, globalChecksum: { valid: true },
    });
  });
  it('recognizes CGB-only titles without including manufacturer bytes', () => {
    const rom = makeRom();
    rom[0x143] = 0xc0;
    rom.set(new TextEncoder().encode('ABCD'), 0x13f);
    expect(parseGameBoyHeader(rom)).toMatchObject({ title: 'TEST GAME', cgb: 'CGB only' });
  });
  it('detects a bad logo', () => {
    const rom = makeRom();
    rom[0x104] ^= 1;
    expect(parseGameBoyHeader(rom).logoValid).toBe(false);
  });
  it('reports stored and computed header checksums', () => {
    const rom = makeRom();
    rom[0x14d] ^= 1;
    const result = parseGameBoyHeader(rom);
    expect(result.headerChecksum.valid).toBe(false);
    expect(result.headerChecksum.actual).not.toBe(result.headerChecksum.expected);
  });
  it('rejects truncated inputs', () => {
    expect(parseGameBoyHeader(new Uint8Array(0x14f))).toMatchObject({
      ok: false, error: expect.any(String),
    });
  });
  it('decodes hex and Base64 and rejects malformed input', () => {
    expect([...decodeBytes('00 ff', 'hex').bytes]).toEqual([0, 255]);
    expect([...decodeBytes('AP8=', 'base64').bytes]).toEqual([0, 255]);
    expect(decodeBytes('0', 'hex').ok).toBe(false);
    expect(decodeBytes('%%%=', 'base64').ok).toBe(false);
  });
});
