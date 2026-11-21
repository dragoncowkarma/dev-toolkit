import { describe, expect, it } from 'vitest';
import { formatFlavor, parseWoffHeader } from './woffHeader.utils.js';

function writeTag(view, offset, tag) {
  [...tag].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
}

function createWoff1() {
  const bytes = new Uint8Array(96);
  const view = new DataView(bytes.buffer);
  writeTag(view, 0, 'wOFF');
  view.setUint32(4, 0x00010000);
  view.setUint32(8, bytes.length);
  view.setUint16(12, 2);
  view.setUint32(16, 140);
  view.setUint16(20, 1);
  view.setUint16(22, 2);
  writeTag(view, 44, 'cmap');
  view.setUint32(48, 84);
  view.setUint32(52, 6);
  view.setUint32(56, 8);
  view.setUint32(60, 0x11111111);
  writeTag(view, 64, 'name');
  view.setUint32(68, 90);
  view.setUint32(72, 6);
  view.setUint32(76, 6);
  view.setUint32(80, 0x22222222);
  return bytes;
}

describe('parseWoffHeader', () => {
  it('parses a valid WOFF1 header and fixed table directory', () => {
    const parsed = parseWoffHeader(createWoff1());
    expect(parsed.format).toBe('WOFF1');
    expect(parsed.header).toMatchObject({ numTables: 2, totalSfntSize: 140, majorVersion: 1 });
    expect(parsed.tables).toEqual([
      expect.objectContaining({ tag: 'cmap', offset: 84, compLength: 6, origLength: 8 }),
      expect.objectContaining({ tag: 'name', offset: 90, compLength: 6, origLength: 6 }),
    ]);
  });

  it('parses a WOFF2 variable directory and UIntBase128 transformed glyf length', () => {
    const bytes = new Uint8Array(60);
    const view = new DataView(bytes.buffer);
    writeTag(view, 0, 'wOF2');
    view.setUint32(4, 0x00010000);
    view.setUint32(8, bytes.length);
    view.setUint16(12, 2);
    view.setUint32(16, 160);
    view.setUint32(20, 2);
    view.setUint8(48, 10);
    view.setUint8(49, 0x81);
    view.setUint8(50, 0x00);
    view.setUint8(51, 0x7f);
    view.setUint8(52, 0x3f);
    writeTag(view, 53, 'TEST');
    view.setUint8(57, 0x05);
    const parsed = parseWoffHeader(bytes);
    expect(parsed.format).toBe('WOFF2');
    expect(parsed.tables).toEqual([
      expect.objectContaining({ tag: 'glyf', origLength: 128, transformLength: 127, offset: null }),
      expect.objectContaining({ tag: 'TEST', origLength: 5, transformLength: null, offset: null }),
    ]);
  });

  it('rejects a truncated declared container', () => {
    const bytes = createWoff1().slice(0, 50);
    expect(() => parseWoffHeader(bytes)).toThrow(/truncated/i);
  });

  it('rejects an unknown signature', () => {
    expect(() => parseWoffHeader(new Uint8Array([0, 1, 2, 3]))).toThrow(/Unknown font signature/);
  });
});

describe('formatFlavor', () => {
  it('formats TrueType and tag-based flavors', () => {
    expect(formatFlavor(0x00010000)).toBe('TrueType (0x00010000)');
    expect(formatFlavor(0x4f54544f)).toBe('OTTO (0x4f54544f)');
  });
});
