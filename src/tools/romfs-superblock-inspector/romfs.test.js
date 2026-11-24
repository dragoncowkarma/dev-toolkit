import { describe, expect, it } from 'vitest';
import { parseRomfsHeader } from './romfs.utils.js';

function image(size = 512, name = 'volume') {
  const bytes = new Uint8Array(size);
  bytes.set(new TextEncoder().encode('-rom1fs-'), 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, size);
  bytes.set(new TextEncoder().encode(name), 16);
  let sum = 0;
  for (let offset = 0; offset < size; offset += 4) {
    sum = (sum + view.getUint32(offset)) >>> 0;
  }
  view.setUint32(12, (-sum) >>> 0);
  return bytes;
}

describe('parseRomfsHeader', () => {
  it('parses a valid header and checksum', () => {
    expect(parseRomfsHeader(image().buffer)).toMatchObject({
      fullSize: 512, volumeName: 'volume', firstFileOffset: 32,
      checksumValid: true, headerExceedsSize: false,
    });
  });

  it('detects a bad checksum', () => {
    const bytes = image();
    bytes[100] = 1;
    expect(parseRomfsHeader(bytes.buffer).checksumValid).toBe(false);
  });

  it('rejects bad magic', () => {
    const bytes = image();
    bytes[0] = 0;
    expect(() => parseRomfsHeader(bytes.buffer)).toThrow(/magic/i);
  });

  it('rejects truncated input', () => {
    expect(() => parseRomfsHeader(image().slice(0, 40).buffer)).toThrow(/truncated/i);
    expect(() => parseRomfsHeader(new ArrayBuffer(8))).toThrow(/truncated/i);
  });

  it('rejects an unterminated volume name', () => {
    const bytes = image();
    bytes.fill(65, 16);
    expect(() => parseRomfsHeader(bytes.buffer)).toThrow(/unterminated/i);
  });

  it('flags a size smaller than the padded header', () => {
    const bytes = image();
    new DataView(bytes.buffer).setUint32(8, 20);
    expect(parseRomfsHeader(bytes.buffer).headerExceedsSize).toBe(true);
  });

  it('aligns long volume names to the next 16-byte boundary', () => {
    expect(parseRomfsHeader(image(512, 'abcdefghijklmnop').buffer).firstFileOffset).toBe(48);
  });
});
