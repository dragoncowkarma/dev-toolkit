import { describe, expect, it } from 'vitest';
import { parseLzhHeader } from './lzh-header.utils.js';

function writeUint32(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function writeText(bytes, offset, value) {
  bytes.set(new TextEncoder().encode(value), offset);
}

function finalizeChecksum(bytes, end) {
  bytes[1] = bytes.slice(2, end).reduce((sum, value) => (sum + value) & 0xff, 0);
}

function createLevelZero() {
  const name = 'zero.txt';
  const totalSize = 24 + name.length;
  const bytes = new Uint8Array(totalSize);
  bytes[0] = totalSize - 2;
  writeText(bytes, 2, '-lh0-');
  writeUint32(bytes, 7, 12);
  writeUint32(bytes, 11, 34);
  writeUint32(bytes, 15, 0x58a10000);
  bytes[20] = 0;
  bytes[21] = name.length;
  writeText(bytes, 22, name);
  bytes[22 + name.length] = 0x34;
  bytes[23 + name.length] = 0x12;
  finalizeChecksum(bytes, totalSize);
  return bytes;
}

function createLevelOne() {
  const name = 'one.txt';
  const basicSize = 25 + name.length;
  const bytes = new Uint8Array(basicSize + 2);
  bytes[0] = basicSize - 2;
  writeText(bytes, 2, '-lh5-');
  writeUint32(bytes, 7, 99);
  writeUint32(bytes, 11, 100);
  bytes[20] = 1;
  bytes[21] = name.length;
  writeText(bytes, 22, name);
  bytes[22 + name.length] = 0xcd;
  bytes[23 + name.length] = 0xab;
  bytes[24 + name.length] = 0x4d;
  finalizeChecksum(bytes, basicSize);
  return bytes;
}

function createLevelTwo() {
  const name = 'two.txt';
  const extensionSize = 3 + name.length;
  const totalSize = 24 + extensionSize + 2;
  const bytes = new Uint8Array(totalSize);
  bytes[0] = totalSize & 0xff;
  bytes[1] = totalSize >>> 8;
  writeText(bytes, 2, '-lhd-');
  writeUint32(bytes, 7, 0);
  writeUint32(bytes, 11, 0);
  writeUint32(bytes, 15, 1_700_000_000);
  bytes[20] = 2;
  bytes[21] = 0xef;
  bytes[22] = 0xbe;
  bytes[23] = 0x55;
  bytes[24] = extensionSize;
  bytes[25] = 0;
  bytes[26] = 1;
  writeText(bytes, 27, name);
  return bytes;
}

function createLevelThree() {
  const totalSize = 30;
  const bytes = new Uint8Array(totalSize);
  bytes[0] = totalSize;
  bytes[2] = 4;
  writeText(bytes, 4, '-lh0-');
  writeUint32(bytes, 9, 2);
  writeUint32(bytes, 13, 2);
  writeUint32(bytes, 17, 1_700_000_000);
  bytes[22] = 3;
  bytes[23] = 0x11;
  bytes[24] = 0x22;
  bytes[26] = 0;
  return bytes;
}

describe('parseLzhHeader', () => {
  it('parses a valid level 0 header', () => {
    const result = parseLzhHeader(createLevelZero().buffer);
    expect(result).toMatchObject({ headerLevel: 0, method: '-lh0-', name: 'zero.txt' });
    expect(result.packedSize).toBe(12);
    expect(result.crc16).toBe(0x1234);
  });

  it('parses a valid level 1 header with a terminating extended-header chain', () => {
    const result = parseLzhHeader(createLevelOne().buffer);
    expect(result).toMatchObject({ headerLevel: 1, method: '-lh5-', name: 'one.txt' });
    expect(result.crc16).toBe(0xabcd);
  });

  it('parses a valid level 2 directory header and its extended file name', () => {
    const result = parseLzhHeader(createLevelTwo().buffer);
    expect(result).toMatchObject({ headerLevel: 2, method: '-lhd-', name: 'two.txt' });
    expect(result.timestamp.toISOString()).toBe('2023-11-14T22:13:20.000Z');
  });

  it('detects and parses a level 3 header', () => {
    const result = parseLzhHeader(createLevelThree().buffer);
    expect(result).toMatchObject({ headerLevel: 3, method: '-lh0-', packedSize: 2 });
  });

  it('rejects a level 0 header with a checksum mismatch', () => {
    const bytes = createLevelZero();
    bytes[7] ^= 1;
    expect(() => parseLzhHeader(bytes.buffer)).toThrow('checksum mismatch');
  });

  it('rejects a truncated header distinctly', () => {
    const bytes = createLevelZero().slice(0, 10);
    expect(() => parseLzhHeader(bytes.buffer)).toThrow('Truncated LZH');
  });

  it('rejects an extended-header chain that exceeds its level 2 boundary', () => {
    const bytes = createLevelTwo();
    bytes[24] = 0xff;
    expect(() => parseLzhHeader(bytes.buffer)).toThrow('Malformed LZH extended-header chain');
  });
});
