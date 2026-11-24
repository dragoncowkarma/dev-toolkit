import { describe, expect, it, vi } from 'vitest';
import { decodeHeader, parseHex, readHeader } from './header.utils.js';

function sample() {
  const bytes = new Uint8Array(128);
  bytes[0] = 3;
  bytes.set(new TextEncoder().encode('ATARI7800'), 1);
  bytes.set(new TextEncoder().encode('Commando'), 17);
  bytes.set([0, 2, 0, 0, 0, 3, 1, 2, 5, 3], 49);
  return bytes;
}

describe('A78 header', () => {
  it('decodes complete fields and big-endian sizes and flags', () => {
    expect(decodeHeader(sample())).toMatchObject({
      Version: 3, Signature: 'Valid', Title: 'Commando', 'ROM size': '131072 bytes',
      'Legacy cart flags': 'POKEY at $4000, SuperGame banking',
      'Controller 1': '7800 joystick', 'Controller 2': 'Lightgun',
      'TV region': 'PAL (multi-region)', 'Save device': 'High Score Cartridge, SaveKey/AtariVox',
    });
  });

  it('marks incomplete fields unknown and detects bad signatures', () => {
    expect(decodeHeader(sample().slice(0, 54))).toMatchObject({
      Title: 'Commando', 'Legacy cart flags': 'Unknown', 'Controller 1': 'Unknown',
    });
    expect(decodeHeader(sample().slice(0, 9)).Signature).toBe('Unknown');
    const bytes = sample();
    bytes[1] = 0;
    expect(decodeHeader(bytes).Signature).toBe('Invalid');
  });

  it('parses bounded hex and reports malformed input without throwing', () => {
    expect(parseHex('01 0a\nFF').bytes).toEqual(new Uint8Array([1, 10, 255]));
    expect(parseHex('a').error).toBeTruthy();
    expect(parseHex('00 zz').error).toBeTruthy();
    expect(parseHex('00'.repeat(200)).bytes).toHaveLength(128);
  });

  it('reads a bounded slice of a file', async () => {
    const arrayBuffer = vi.fn().mockResolvedValue(new Uint8Array([1]).buffer);
    const file = { slice: vi.fn().mockReturnValue({ arrayBuffer }) };
    expect(await readHeader(file)).toEqual(new Uint8Array([1]));
    expect(file.slice).toHaveBeenCalledWith(0, 128);
  });

  it('displays v4 fields separately, including truncated fields', () => {
    const bytes = sample();
    bytes[0] = 4;
    bytes[64] = 1;
    expect(decodeHeader(bytes)['V4 mapper']).toBe('SuperGame');
    expect(decodeHeader(bytes.slice(0, 64))['V4 mapper']).toBe('Unknown');
  });
});
