import { describe, expect, it, vi } from 'vitest';
import { decodeHex, parseSwapHeader, readFirstPage } from './swap.utils.js';

function header(signature = 'SWAPSPACE2', little = true) {
  const bytes = new Uint8Array(4096);
  const view = new DataView(bytes.buffer);
  view.setUint32(1024, 1, little);
  view.setUint32(1028, 255, little);
  view.setUint32(1032, 2, little);
  bytes.set(Uint8Array.from({ length: 16 }, (_, i) => i), 1036);
  bytes.set(new TextEncoder().encode('볼륨\0ignored'), 1052);
  view.setUint32(1068, 42, little);
  view.setUint32(1536, 8, little);
  view.setUint32(1540, 17, little);
  bytes.set(new TextEncoder().encode(signature), 4086);
  return bytes;
}

describe('swap header', () => {
  it.each(['SWAPSPACE2', 'SWAP-SPACE'])('parses %s and its fields', (signature) => {
    const result = parseSwapHeader(header(signature));
    expect(result).toMatchObject({
      signature, version: 1, lastPage: 255, sizeBytes: '1048576', sizeHuman: '1.0 MiB',
      uuid: '00010203-0405-0607-0809-0a0b0c0d0e0f', label: '볼륨', badPageCount: 2,
      badPages: [8, 17],
    });
    expect(result.padding).toHaveLength(117);
    expect(result.padding[0]).toBe(42);
  });

  it('supports big endian headers and exact large sizes', () => {
    const bytes = header('SWAPSPACE2', false);
    new DataView(bytes.buffer).setUint32(1028, 0xffffffff, false);
    expect(parseSwapHeader(bytes)).toMatchObject({
      byteOrder: 'Big-endian', sizeBytes: '17592186044416', sizeHuman: '16.0 TiB',
    });
  });

  it('limits listed entries to the complete words before the signature', () => {
    const bytes = header();
    new DataView(bytes.buffer).setUint32(1032, 1536, true);
    expect(parseSwapHeader(bytes).badPages).toHaveLength(637);
  });

  it('rejects truncated pages, bad signatures, and unsupported versions', () => {
    expect(() => parseSwapHeader(new Uint8Array(4095))).toThrow(/truncated/i);
    const bytes = header();
    bytes[4086] = 0;
    expect(() => parseSwapHeader(bytes)).toThrow(/signature/i);
    bytes.set(new TextEncoder().encode('SWAPSPACE2'), 4086);
    new DataView(bytes.buffer).setUint32(1024, 2, true);
    expect(() => parseSwapHeader(bytes)).toThrow(/version/i);
  });

  it('decodes hex and rejects malformed input', () => {
    expect([...decodeHex('01 aF\n20')]).toEqual([1, 175, 32]);
    expect(() => decodeHex('abc')).toThrow(/hexadecimal/i);
    expect(() => decodeHex('zz')).toThrow(/hexadecimal/i);
  });

  it('reads only a 4096-byte slice from a large file', async () => {
    const file = new File([new Uint8Array(8192)], 'large');
    const slice = vi.spyOn(file, 'slice');
    expect((await readFirstPage(file)).length).toBe(4096);
    expect(slice).toHaveBeenCalledWith(0, 4096);
  });
});
