import { describe, expect, it } from 'vitest';
import { parseHex, parseSuperblock, sampleHex } from './jfs.utils.js';

describe('JFS superblock parsing', () => {
  it('reads little-endian fields and preserves large block counts', () => {
    const bytes = Uint8Array.from(sampleHex().split(' '), (part) => parseInt(part, 16));
    const view = new DataView(bytes.buffer);
    view.setBigUint64(8, 9007199254740993n, true);
    view.setUint32(40, 6, true);
    view.setUint32(64, 0x1234, true);
    view.setUint32(68, 42, true);
    bytes.set(Array.from({ length: 16 }, (_, index) => index), 136);
    expect(parseSuperblock(bytes).data).toMatchObject({
      Magic: 'JFS1', Version: '2', 'Size (hardware/LVM blocks)': '9007199254740993',
      'Block size (bytes)': '4096', 'Log2 block size': '12', Flags: '0x10000800',
      State: 'Dirty, Logredo failed (0x6)', UUID: '00010203-0405-0607-0809-0a0b0c0d0e0f',
      'Volume label': 'Example', 'Log device': '0x00001234', 'Log serial': '42',
    });
  });
  it('reports bad magic, truncation, unsupported versions, and malformed hex', () => {
    expect(parseHex('00 00 00 00 00 00 00 00').error).toMatch(/magic/i);
    expect(parseHex('4a 46 53 31 02 00 00 00').error).toMatch(/truncated/i);
    expect(parseHex('4a 46 53 31 03 00 00 00').error).toMatch(/unsupported/i);
    expect(parseHex('xyz').error).toMatch(/invalid/i);
    expect(parseSuperblock(null).error).toMatch(/unsupported/i);
  });
  it('reads the legacy label for version 1', () => {
    const bytes = new Uint8Array(112);
    bytes.set([74, 70, 83, 49, 1]);
    bytes.set(new TextEncoder().encode('Legacy'), 101);
    expect(parseSuperblock(bytes).data).toMatchObject({
      Version: '1', 'Volume label': 'Legacy', UUID: 'Not available in version 1', State: 'Clean',
    });
  });
});
