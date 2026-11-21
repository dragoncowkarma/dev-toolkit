import { describe, expect, it } from 'vitest';
import { extractIccBytesAsync, parseIccProfile } from './iccProfile.utils.js';

function writeSignature(bytes, offset, value) {
  bytes.set([...value].map((character) => character.charCodeAt(0)), offset);
}

function validProfile() {
  const bytes = new Uint8Array(160);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 160);
  view.setUint16(24, 2026);
  view.setUint16(26, 11);
  view.setUint16(28, 21);
  view.setUint16(30, 18);
  view.setUint16(32, 30);
  view.setUint16(34, 45);
  writeSignature(bytes, 36, 'acsp');
  writeSignature(bytes, 132, 'desc');
  view.setUint32(128, 1);
  view.setUint32(136, 144);
  view.setUint32(140, 16);
  return bytes;
}
describe('parseIccProfile', () => {
  it('parses a valid profile header and decodes well-known tags', () => {
    const parsed = parseIccProfile(validProfile());
    expect(parsed.header.find((item) => item.label === 'Signature').value).toBe('acsp');
    expect(parsed.header.find((item) => item.label === 'Creation date/time').value)
      .toBe('2026-11-21 18:30:45');
    expect(parsed.tags[0].label).toBe('Profile description');
  });

  it('rejects a truncated header with a path-qualified error', () => {
    expect(() => parseIccProfile(new Uint8Array(8), 'test.icc'))
      .toThrow('test.icc: ICC profile header is truncated');
  });

  it('keeps out-of-bounds tag entries in the result', () => {
    const bytes = validProfile();
    new DataView(bytes.buffer).setUint32(136, 999);
    expect(parseIccProfile(bytes).tags[0].outOfBounds).toBe(true);
  });

  it('rejects a PNG iCCP chunk that has no profile-name separator', async () => {
    const png = new Uint8Array([
      137, 80, 78, 71, 13, 10, 26, 10,
      0, 0, 0, 3, 105, 67, 67, 80, 98, 97, 100, 0, 0, 0, 0,
    ]);

    await expect(extractIccBytesAsync(png, 'broken.png'))
      .rejects.toThrow('broken.png: PNG iCCP chunk is missing its null separator.');
  });
});
