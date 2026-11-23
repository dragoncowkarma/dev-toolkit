import { describe, expect, it } from 'vitest';
import { decodeBytes, parseGbaHeader } from './gba.utils.js';

const logo = `24ffae51699aa2213d84820a84e409ad11248b98c0817f21a352be199309ce20
10464a4af82731ec58c7e83382e3cebf85f4df94ce4b09c194568ac01372a7fc
9f844d73a3ca9a615897a327fc039876231dc7610304ae56bf38840040a70efd
ff52fe036f9530f197fbc08560d68025a963be03014e38e2f9a234ffbb3e0344
780090cb88113a9465c07c6387f03cafd625e48b380aac7221d4f807`;

function header() {
  const bytes = new Uint8Array(192);
  bytes.set(decodeBytes(logo, 'hex').bytes, 4);
  bytes.set([0x00, 0x00, 0x00, 0xea], 0);
  bytes.set(new TextEncoder().encode('TEST GAME'), 0xa0);
  bytes.set(new TextEncoder().encode('ABCE01'), 0xac);
  bytes[0xb2] = 0x96;
  bytes[0xbc] = 1;
  bytes[0xbd] = (-bytes.subarray(0xa0, 0xbd).reduce((sum, byte) => sum + byte, 0) - 0x19) & 255;
  return bytes;
}

describe('GBA header', () => {
  it('decodes a valid header and ARM branch', () => {
    expect(parseGbaHeader(header())).toMatchObject({
      ok: true, title: 'TEST GAME', gameCode: 'ABCE', makerCode: '01',
      logoValid: true, fixedValid: true, checksum: { valid: true },
      entry: { isBranch: true, target: 0x08000008 }, softwareVersion: 1,
    });
  });
  it('detects a bad logo', () => {
    const bytes = header(); bytes[4] ^= 1;
    expect(parseGbaHeader(bytes).logoValid).toBe(false);
  });
  it('detects a bad fixed byte', () => {
    const bytes = header(); bytes[0xb2] = 0;
    expect(parseGbaHeader(bytes).fixedValid).toBe(false);
  });
  it('reports the expected and actual complement', () => {
    const bytes = header(); const expected = bytes[0xbd]; bytes[0xbd] ^= 1;
    expect(parseGbaHeader(bytes).checksum).toEqual({ expected, actual: bytes[0xbd], valid: false });
  });
  it('rejects a truncated buffer', () => {
    expect(parseGbaHeader(new Uint8Array(191))).toEqual({
      ok: false, error: expect.stringContaining('192 bytes'),
    });
  });
  it('decodes both input formats and rejects malformed input', () => {
    expect([...decodeBytes('00 ff', 'hex').bytes]).toEqual([0, 255]);
    expect([...decodeBytes('AP8=', 'base64').bytes]).toEqual([0, 255]);
    expect(decodeBytes('0', 'hex').ok).toBe(false);
    expect(decodeBytes('a===', 'base64').ok).toBe(false);
  });
});
