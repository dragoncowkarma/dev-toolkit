import { describe, expect, it } from 'vitest';
import { parseVmfsHeader, readVmfsFile, HEADER_OFFSET } from './vmfs.utils.js';

function fixture(version) {
  const offset = version === 6 ? 0x1000 : 0x200;
  const bytes = new Uint8Array(offset + 0x64);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0xc001d00d, true);
  view.setUint32(4, version, true);
  view.setUint32(0x5a, 512, true);
  view.setUint32(0x66, 1, true);
  view.setUint32(0xca, 0x1000, true);
  view.setBigUint64(0x5e, 9007199254740993n, true);
  view.setBigUint64(offset, 9007199254740995n, true);
  bytes.set(new TextEncoder().encode('datastore'), offset + 0x14);
  view.setUint32(offset + 0x54, 0x12345678, true);
  return bytes;
}

describe('VMFS LVM header', () => {
  for (const version of [5, 6]) {
    it(`parses version ${version} and preserves 64-bit values`, () => {
      const result = parseVmfsHeader(fixture(version));
      expect(result.version).toBe(`${version}.0`);
      expect(result.label).toBe('datastore');
      expect(result.uuid).toBe('12345678-00000000-0000-000000000000');
      expect(result.blockSize).toBe(512);
      expect(result.totalBytes).toBe(9007199254740993n);
      expect(result.logicalSize).toBe(9007199254740995n);
    });
  }

  it('reports invalid magic and truncated headers', () => {
    expect(() => parseVmfsHeader(new Uint8Array(4))).toThrow(/magic/i);
    expect(() => parseVmfsHeader(fixture(5).slice(0, 3))).toThrow(/truncated/i);
    expect(() => parseVmfsHeader(fixture(6).slice(0, 0x1000))).toThrow(/truncated/i);
  });

  it('accepts a header slice and a partition image', async () => {
    const header = fixture(5);
    const raw = new Uint8Array(HEADER_OFFSET + header.length);
    raw.set(header, HEADER_OFFSET);
    expect((await readVmfsFile(new File([header], 'slice'))).label).toBe('datastore');
    expect((await readVmfsFile(new File([raw], 'image'))).label).toBe('datastore');
  });
});
