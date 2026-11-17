import { describe, expect, it } from 'vitest';
import { decodeBase64Bytes, parsePeHeaders } from './pe-header-inspector.utils.js';

function writeString(bytes, offset, value) {
  [...value].forEach((character, index) => { bytes[offset + index] = character.charCodeAt(0); });
}

function createPeSample({ pe32Plus = false } = {}) {
  const bytes = new Uint8Array(0x200);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0x5a4d, true);
  view.setUint32(0x3c, 0x80, true);
  writeString(bytes, 0x80, 'PE\0\0');
  const coff = 0x84;
  view.setUint16(coff, pe32Plus ? 0x8664 : 0x14c, true);
  view.setUint16(coff + 2, 1, true);
  view.setUint32(coff + 4, 0, true);
  view.setUint16(coff + 16, pe32Plus ? 0xf0 : 0xe0, true);
  view.setUint16(coff + 18, 0x2022, true);
  const optional = coff + 20;
  view.setUint16(optional, pe32Plus ? 0x20b : 0x10b, true);
  view.setUint32(optional + 16, 0x1234, true);
  if (pe32Plus) view.setBigUint64(optional + 24, 0x140000000n, true);
  else view.setUint32(optional + 28, 0x400000, true);
  view.setUint16(optional + 68, 3, true);
  view.setUint16(optional + 70, 0x140, true);
  const section = optional + (pe32Plus ? 0xf0 : 0xe0);
  writeString(bytes, section, '.text');
  view.setUint32(section + 8, 0x321, true);
  view.setUint32(section + 12, 0x1000, true);
  view.setUint32(section + 16, 0x400, true);
  view.setUint32(section + 20, 0x200, true);
  view.setUint32(section + 36, 0x60000020, true);
  return bytes;
}

describe('parsePeHeaders', () => {
  it('parses a PE32 header and its section flags', () => {
    const result = parsePeHeaders(createPeSample());
    expect(result.dos.peOffset).toBe('0x00000080');
    expect(result.coff.machine).toContain('Intel 386');
    expect(result.optional.format).toBe('PE32 (32-bit)');
    expect(result.optional.imageBase).toBe('0x00400000');
    expect(result.sections[0]).toMatchObject({ name: '.text', virtualAddress: 0x1000 });
    expect(result.sections[0].flags).toEqual(['Code', 'Executable', 'Readable']);
  });

  it('parses a PE32+ header', () => {
    const result = parsePeHeaders(createPeSample({ pe32Plus: true }));
    expect(result.coff.machine).toContain('x64');
    expect(result.optional.format).toBe('PE32+ (64-bit)');
    expect(result.optional.imageBase).toBe('0x0000000140000000');
  });

  it('reports a path-qualified error for a truncated DOS header', () => {
    expect(() => parsePeHeaders(new Uint8Array([0x4d]))).toThrow(
      'PE parse error at dos.signature'
    );
  });

  it('reports a path-qualified error for a truncated section table', () => {
    const sample = createPeSample();
    expect(() => parsePeHeaders(sample.slice(0, 0x178))).toThrow(
      'PE parse error at sections[0]'
    );
  });
});

describe('decodeBase64Bytes', () => {
  it('decodes Base64 bytes and rejects malformed input', () => {
    expect([...decodeBase64Bytes('TVo=')]).toEqual([0x4d, 0x5a]);
    expect(() => decodeBase64Bytes('not Base64!')).toThrow('Invalid Base64 input.');
  });
});
