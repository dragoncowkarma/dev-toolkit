import { describe, expect, it } from 'vitest';
import { decodeRecordSize, hexDump, parseHex, parseNtfsBootSector } from './ntfs.utils.js';

function sector() {
  const bytes = new Uint8Array(512);
  bytes.set(new TextEncoder().encode('NTFS    '), 3);
  bytes.set([0x55, 0xaa], 510);
  const view = new DataView(bytes.buffer);
  view.setUint16(11, 512, true);
  view.setUint8(13, 8);
  view.setBigUint64(40, 9007199254740993n, true);
  view.setBigUint64(48, 123n, true);
  view.setInt8(64, -10);
  view.setInt8(68, -12);
  return bytes;
}

describe('NTFS boot sector', () => {
  it('parses a valid sector with lossless 64-bit values', () => {
    const parsed = parseNtfsBootSector(sector());
    expect(parsed.bytesPerSector).toBe(512);
    expect(parsed.sectorsPerCluster).toBe(8);
    expect(parsed.totalSectors).toBe(9007199254740993n);
    expect(parsed.mftCluster).toBe(123n);
    expect(hexDump(parsed.bytes)).toContain('01f0');
  });
  it('rejects a bad OEM ID', () => {
    const bytes = sector(); bytes[3] = 0;
    expect(() => parseNtfsBootSector(bytes)).toThrow(/OEM ID/);
  });
  it('rejects a bad signature', () => {
    const bytes = sector(); bytes[511] = 0;
    expect(() => parseNtfsBootSector(bytes)).toThrow(/signature/);
  });
  it('rejects truncated input', () => {
    expect(() => parseNtfsBootSector(sector().slice(0, 511))).toThrow(/Truncated/);
  });
  it('decodes negative record sizes as powers of two bytes', () => {
    const parsed = parseNtfsBootSector(sector());
    expect(decodeRecordSize(parsed.mftRecordCode)).toBe('1024 bytes');
    expect(decodeRecordSize(parsed.indexBufferCode)).toBe('4096 bytes');
    expect(decodeRecordSize(4)).toBe('4 clusters');
  });
  it('rejects malformed hex including data after the first sector', () => {
    expect(() => parseHex('aa z0')).toThrow(/hexadecimal/);
    expect(() => parseHex('a')).toThrow(/hexadecimal/);
    expect(() => parseHex('00'.repeat(512) + 'zz')).toThrow(/hexadecimal/);
    expect(parseHex('aa '.repeat(600))).toHaveLength(512);
  });
});
