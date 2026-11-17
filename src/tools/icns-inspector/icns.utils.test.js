import { describe, expect, it } from 'vitest';
import { describeIcnsType, parseIcns } from './icns.utils.js';

function icnsBuffer(entries, declaredLength) {
  const totalLength = declaredLength ?? 8 + entries.reduce((total, entry) => total + entry.length, 0);
  const bytes = new Uint8Array(totalLength);
  const view = new DataView(bytes.buffer);
  for (const [index, character] of [...'icns'].entries()) bytes[index] = character.charCodeAt(0);
  view.setUint32(4, totalLength, false);
  let offset = 8;
  for (const entry of entries) {
    for (const [index, character] of [...entry.type].entries()) {
      bytes[offset + index] = character.charCodeAt(0);
    }
    view.setUint32(offset + 4, entry.length, false);
    offset += entry.length;
  }
  return bytes.buffer;
}

describe('describeIcnsType', () => {
  it('labels PNG, legacy image, mask, and structural types', () => {
    expect(describeIcnsType('ic10')).toMatchObject({ dimensions: '1024 × 1024', format: 'PNG' });
    expect(describeIcnsType('il32')).toMatchObject({ dimensions: '32 × 32', isImage: true });
    expect(describeIcnsType('l8mk')).toMatchObject({ format: 'Legacy raw alpha mask' });
    expect(describeIcnsType('TOC ')).toMatchObject({ label: 'Table of contents', isImage: false });
  });
});

describe('parseIcns', () => {
  it('iterates TLV entries and retains container metadata separately', () => {
    const parsed = parseIcns(icnsBuffer([
      { type: 'ic07', length: 12 },
      { type: 'TOC ', length: 8 },
      { type: 'icnV', length: 8 },
    ]));

    expect(parsed.error).toBeNull();
    expect(parsed.entries).toHaveLength(3);
    expect(parsed.entries[0]).toMatchObject({ type: 'ic07', dimensions: '128 × 128', format: 'PNG' });
    expect(parsed.entries[1]).toMatchObject({ label: 'Table of contents', isImage: false });
    expect(parsed.entries[2]).toMatchObject({ label: 'Version information', isImage: false });
  });

  it('returns a warning for an entry length that exceeds remaining bytes', () => {
    const bytes = new Uint8Array(icnsBuffer([{ type: 'ic08', length: 8 }]));
    new DataView(bytes.buffer).setUint32(12, 100, false);
    const parsed = parseIcns(bytes.buffer);

    expect(parsed.error).toBeNull();
    expect(parsed.entries[0].warning).toMatch(/exceeds/);
    expect(parsed.warnings[0]).toMatch(/ic08/);
  });

  it('returns a clear error for a truncated header and invalid magic', () => {
    expect(parseIcns(new ArrayBuffer(4)).error).toMatch(/Truncated ICNS header/);
    const invalid = new Uint8Array(8).buffer;
    expect(parseIcns(invalid).error).toMatch(/Invalid ICNS magic/);
  });
});
