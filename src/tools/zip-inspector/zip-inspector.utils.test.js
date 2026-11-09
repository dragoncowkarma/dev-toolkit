import { describe, expect, it } from 'vitest';
import {
  ZipInspectorError,
  compressionMethodName,
  decodeEntryName,
  inspectZip,
} from './zip-inspector.utils.js';

function writeUint16(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = value >> 8;
}

function writeUint32(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
  bytes[offset + 2] = (value >> 16) & 0xff;
  bytes[offset + 3] = (value >> 24) & 0xff;
}

function createZip({ name = Uint8Array.from([102, 111, 111, 46, 116, 120, 116]), flags = 0 } = {}) {
  const localLength = 30 + name.length;
  const centralOffset = localLength;
  const centralLength = 46 + name.length;
  const bytes = new Uint8Array(localLength + centralLength + 22);
  writeUint32(bytes, 0, 0x04034b50);
  writeUint16(bytes, 4, 20);
  writeUint16(bytes, 6, flags);
  writeUint16(bytes, 8, 8);
  writeUint16(bytes, 10, 0x5321);
  writeUint16(bytes, 12, 0x4a21);
  writeUint32(bytes, 14, 0x1234abcd);
  writeUint32(bytes, 18, 5);
  writeUint32(bytes, 22, 12);
  writeUint16(bytes, 26, name.length);
  bytes.set(name, 30);
  writeUint32(bytes, centralOffset, 0x02014b50);
  writeUint16(bytes, centralOffset + 4, 20);
  writeUint16(bytes, centralOffset + 6, 20);
  writeUint16(bytes, centralOffset + 8, flags);
  writeUint16(bytes, centralOffset + 10, 8);
  writeUint16(bytes, centralOffset + 12, 0x5321);
  writeUint16(bytes, centralOffset + 14, 0x4a21);
  writeUint32(bytes, centralOffset + 16, 0x1234abcd);
  writeUint32(bytes, centralOffset + 20, 5);
  writeUint32(bytes, centralOffset + 24, 12);
  writeUint16(bytes, centralOffset + 28, name.length);
  writeUint32(bytes, centralOffset + 38, 0x81a40000);
  bytes.set(name, centralOffset + 46);
  const eocd = centralOffset + centralLength;
  writeUint32(bytes, eocd, 0x06054b50);
  writeUint16(bytes, eocd + 8, 1);
  writeUint16(bytes, eocd + 10, 1);
  writeUint32(bytes, eocd + 12, centralLength);
  writeUint32(bytes, eocd + 16, centralOffset);
  return bytes.buffer;
}

describe('inspectZip', () => {
  it('parses EOCD and central-directory metadata without extracting contents', () => {
    const result = inspectZip(createZip());
    expect(result.eocd).toMatchObject({ entryCount: 1, centralDirectoryOffset: 37 });
    expect(result.entries[0]).toMatchObject({
      name: 'foo.txt', compressedSize: 5, uncompressedSize: 12, crc32: '1234ABCD',
      compressionMethod: 8, externalAttributes: '0x81A40000',
    });
  });

  it('rejects an archive with no valid EOCD record', () => {
    expect(() => inspectZip(new Uint8Array(22).buffer)).toThrow(ZipInspectorError);
    expect(() => inspectZip(new Uint8Array(22).buffer)).toThrow(/EOCD/);
  });

  it('rejects a truncated central directory', () => {
    const truncated = createZip().slice(0, -4);
    expect(() => inspectZip(truncated)).toThrow(/EOCD/);
  });

  it('uses hex and Base64 fallback for a non-UTF-8 entry name', () => {
    const result = inspectZip(createZip({ name: Uint8Array.from([0xff, 0x80]) }));
    expect(result.entries[0]).toMatchObject({
      name: 'hex:ff80 (Base64: /4A=)',
      nameUsedFallback: true,
    });
  });

  it('labels data descriptors and encrypted entries from their flags', () => {
    const result = inspectZip(createZip({ flags: 9 }));
    expect(result.entries[0]).toMatchObject({ encrypted: true, dataDescriptor: true });
  });
});

describe('ZIP display helpers', () => {
  it('maps known and unknown compression methods', () => {
    expect(compressionMethodName(0)).toBe('Stored');
    expect(compressionMethodName(8)).toBe('Deflate');
    expect(compressionMethodName(99)).toBe('Other');
  });

  it('does not mangle malformed UTF-8 names', () => {
    expect(decodeEntryName(Uint8Array.from([0xff])).usedFallback).toBe(true);
  });
});
