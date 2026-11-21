import { describe, expect, it } from 'vitest';
import { parseDexHeader } from './dex-header.utils.js';

function createDexHeader(littleEndian = true) {
  const bytes = new Uint8Array(112);
  bytes.set([0x64, 0x65, 0x78, 0x0a, 0x30, 0x33, 0x35, 0x00]);
  bytes.set(Array.from({ length: 20 }, (_, index) => index), 12);
  const view = new DataView(bytes.buffer);
  const put = (offset, value) => view.setUint32(offset, value, littleEndian);
  put(8, 0xdecafbad); put(32, 112); put(36, 112);
  // The tag is read as a native little-endian sentinel before selecting the
  // byte order for the remaining fields.
  view.setUint32(40, littleEndian ? 0x12345678 : 0x78563412, true);
  put(44, 16); put(48, 96); put(52, 80);
  put(56, 3); put(60, 112); put(64, 2); put(68, 124); put(72, 1); put(76, 132);
  put(80, 4); put(84, 140); put(88, 5); put(92, 156); put(96, 6); put(100, 176);
  return bytes;
}

describe('parseDexHeader', () => {
  it('parses a valid minimal little-endian DEX header', () => {
    const header = parseDexHeader(createDexHeader());
    expect(header.version).toBe('035');
    expect(header.checksum).toBe(0xdecafbad);
    expect(header.sections).toContainEqual({ name: 'Method IDs', size: 5, offset: 156 });
  });

  it('rejects a bad magic value', () => {
    const bytes = createDexHeader(); bytes[0] = 0;
    expect(() => parseDexHeader(bytes)).toThrow(/Invalid DEX magic/);
  });

  it('rejects a truncated header', () => {
    expect(() => parseDexHeader(new Uint8Array(111))).toThrow(/Truncated DEX header/);
  });

  it('parses reverse-endian DEX headers', () => {
    const header = parseDexHeader(createDexHeader(false));
    expect(header.byteOrder).toBe('Big endian (reverse endian)');
    expect(header.linkOffset).toBe(96);
    expect(header.sections).toContainEqual({ name: 'Class defs', size: 6, offset: 176 });
  });
});
