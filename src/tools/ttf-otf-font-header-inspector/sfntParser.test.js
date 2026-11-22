import { describe, expect, it } from 'vitest';
import { parseSfntHeader } from './sfntParser.js';

function makeFont(version, tag) {
  const bytes = new ArrayBuffer(32);
  const view = new DataView(bytes);
  view.setUint32(0, version, false);
  view.setUint16(4, 1, false);
  view.setUint16(6, 16, false);
  view.setUint16(8, 0, false);
  view.setUint16(10, 0, false);
  for (let index = 0; index < 4; index += 1) {
    view.setUint8(12 + index, tag.charCodeAt(index));
  }
  view.setUint32(16, 0x12345678, false);
  view.setUint32(20, 28, false);
  view.setUint32(24, 4, false);
  return bytes;
}

describe('parseSfntHeader', () => {
  it('parses a valid TrueType offset table and table record', () => {
    const result = parseSfntHeader(makeFont(0x00010000, 'head'));

    expect(result).toMatchObject({
      ok: true,
      font: {
        versionLabel: 'TrueType outlines',
        numTables: 1,
        tables: [{ tag: 'head', checksum: 0x12345678, offset: 28, length: 4 }],
      },
    });
  });

  it('parses a valid CFF-based OpenType offset table', () => {
    const result = parseSfntHeader(makeFont(0x4f54544f, 'CFF '));

    expect(result).toMatchObject({
      ok: true,
      font: {
        versionLabel: 'OpenType with CFF outlines',
        tables: [{ tag: 'CFF ', description: 'Compact Font Format outlines' }],
      },
    });
  });

  it('returns a graceful error when a table points past the file bounds', () => {
    const bytes = makeFont(0x00010000, 'cmap');
    new DataView(bytes).setUint32(24, 8, false);

    expect(parseSfntHeader(bytes)).toEqual({
      ok: false,
      error: 'Table "cmap" points outside the file bounds. The font may be malformed.',
    });
  });
});
