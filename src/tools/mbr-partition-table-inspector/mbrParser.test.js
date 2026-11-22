import { describe, expect, it } from 'vitest';
import { getPartitionTypeName, parseMbr } from './mbrParser.js';

function createMbr(entries = []) {
  const bytes = new Uint8Array(512);
  bytes[0x1fe] = 0x55;
  bytes[0x1ff] = 0xaa;
  const view = new DataView(bytes.buffer);
  entries.forEach((entry, index) => {
    const offset = 0x1be + index * 16;
    bytes[offset] = entry.bootIndicator ?? 0;
    bytes[offset + 1] = entry.startHead ?? 1;
    bytes[offset + 2] = entry.startSector ?? 1;
    bytes[offset + 3] = entry.startCylinder ?? 0;
    bytes[offset + 4] = entry.type;
    bytes[offset + 5] = entry.endHead ?? 254;
    bytes[offset + 6] = entry.endSector ?? 63;
    bytes[offset + 7] = entry.endCylinder ?? 10;
    view.setUint32(offset + 8, entry.lbaStart ?? 0, true);
    view.setUint32(offset + 12, entry.sectorCount ?? 0, true);
  });
  return bytes;
}

describe('parseMbr', () => {
  it('parses valid MBR partition entries from a Uint8Array', () => {
    const mbr = createMbr([
      { bootIndicator: 0x80, type: 0x07, lbaStart: 2048, sectorCount: 409600 },
      { type: 0x83, lbaStart: 411648, sectorCount: 8192 },
      { type: 0x0c, lbaStart: 419840, sectorCount: 16384 },
      { type: 0x82, lbaStart: 436224, sectorCount: 2048 },
    ]);

    const result = parseMbr(mbr);

    expect(result).toMatchObject({
      ok: true,
      bootSignature: '0x55AA',
      bootstrapCodeSize: 446,
      isGptProtective: false,
    });
    expect(result.partitions).toHaveLength(4);
    expect(result.partitions[0]).toMatchObject({
      bootIndicator: 0x80,
      type: 0x07,
      typeName: 'NTFS/exFAT',
      lbaStart: 2048,
      sectorCount: 409600,
      chsStart: { head: 1, sector: 1, cylinder: 0 },
    });
    expect(result.partitions[3].typeName).toBe('Linux swap');
  });

  it('accepts an ArrayBuffer input and reports known partition type names', () => {
    const mbr = createMbr([{ type: 0x0b, lbaStart: 63, sectorCount: 100 }]);

    expect(parseMbr(mbr.buffer).partitions[0].typeName).toBe('FAT32');
    expect(getPartitionTypeName(0x05)).toBe('Extended');
    expect(getPartitionTypeName(0x99)).toBe('Unknown');
  });

  it('returns a clear error for an invalid boot signature', () => {
    const mbr = createMbr();
    mbr[0x1ff] = 0;

    expect(parseMbr(mbr)).toEqual({
      ok: false,
      error: 'Invalid MBR boot signature. Expected 0x55AA at offset 0x1FE.',
    });
  });

  it('returns a clear error for truncated inputs', () => {
    expect(parseMbr(new Uint8Array(511))).toEqual({
      ok: false,
      error: 'The selected file is too short to contain a 512-byte MBR sector.',
    });
  });

  it('detects a GPT protective MBR without parsing GPT structures', () => {
    const result = parseMbr(createMbr([{ type: 0xee, lbaStart: 1, sectorCount: 1000 }]));

    expect(result).toMatchObject({ ok: true, isGptProtective: true });
    expect(result.note).toMatch(/disk uses GPT/);
  });
});
