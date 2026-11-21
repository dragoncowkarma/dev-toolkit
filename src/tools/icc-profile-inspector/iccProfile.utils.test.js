import { describe, expect, it } from 'vitest';
import { parseIccProfile } from './iccProfile.utils.js';

function writeSignature(bytes, offset, value) {
  bytes.set([...value].map((character) => character.charCodeAt(0)), offset);
}

function validProfile() {
  const bytes = new Uint8Array(160);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 160);
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
});
