import { describe, expect, it } from 'vitest';
import { inspectExfat, parseHex } from './exfat.utils.js';

function image() {
  const bytes = new Uint8Array(512);
  bytes.set(new TextEncoder().encode('EXFAT   '), 3);
  const view = new DataView(bytes.buffer);
  view.setBigUint64(64, 123n, true);
  view.setBigUint64(72, 9007199254740993n, true);
  view.setUint32(80, 24, true);
  view.setUint16(104, 0x100, true);
  bytes[108] = 9;
  bytes[109] = 3;
  bytes[110] = 1;
  bytes[510] = 0x55;
  bytes[511] = 0xaa;
  return bytes;
}

describe('exFAT boot sector', () => {
  it('parses valid geometry exactly', () => {
    const result = inspectExfat(image());
    expect(result.warnings).toEqual([]);
    expect(result.fields.PartitionOffset).toBe(123n);
    expect(result.fields.FatOffset).toBe(24);
    expect(result.derived['Bytes per cluster']).toBe(4096n);
    expect(result.derived['Volume size in bytes']).toBe(9007199254740993n * 512n);
  });
  it('reports an invalid signature', () => {
    const bytes = image(); bytes[510] = 0;
    expect(inspectExfat(bytes).warnings.join()).toMatch(/signature/);
  });
  it('reports an invalid name', () => {
    const bytes = image(); bytes[3] = 0;
    expect(inspectExfat(bytes).warnings.join()).toMatch(/name/);
  });
  it('reports a nonzero MustBeZero byte', () => {
    const bytes = image(); bytes[63] = 1;
    expect(inspectExfat(bytes).warnings.join()).toMatch(/MustBeZero/);
  });
  it('handles truncated and invalid input', () => {
    expect(inspectExfat(image().slice(0, 70)).warnings.join()).toMatch(/Truncated/);
    expect(inspectExfat(null).warnings.join()).toMatch(/Truncated/);
    expect(parseHex('0x12').error).toBeTruthy();
    expect(parseHex('abc').error).toBeTruthy();
    expect([...parseHex('ab CD\n01').bytes]).toEqual([0xab, 0xcd, 1]);
  });
  it('checks both shift bounds and revision', () => {
    const bytes = image(); bytes[108] = 8;
    expect(inspectExfat(bytes).warnings.join()).toMatch(/BytesPerSectorShift/);
    bytes[108] = 13;
    expect(inspectExfat(bytes).warnings.join()).toMatch(/BytesPerSectorShift/);
    bytes[108] = 12; bytes[109] = 14; bytes[104] = 1;
    const result = inspectExfat(bytes);
    expect(result.warnings.join()).toMatch(/SectorsPerClusterShift/);
    expect(result.warnings.join()).toMatch(/Revision/);
    expect(result.derived['Bytes per cluster']).toBeUndefined();
  });
});
