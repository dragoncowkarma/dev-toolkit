import { describe, expect, it } from 'vitest';
import {
  createSampleVdiHeader,
  formatFileSize,
  formatHexDump,
  formatUuid,
  parseHexBytes,
  parseVdiHeader,
} from './vdi.utils.js';

describe('VDI Header Parsing Utils', () => {
  it('parses a valid dynamic image header correctly', () => {
    const buffer = createSampleVdiHeader({
      imageType: 1, // Dynamic
      description: 'Test Dynamic Disk',
      diskSize: 10737418240n, // 10 GB
      blockSize: 1048576,
      blocksCount: 10240,
      blocksAllocated: 128,
    });

    const result = parseVdiHeader(buffer);
    expect(result.ok).toBe(true);
    expect(result.header).toBeDefined();

    const { header } = result;
    expect(header.preHeaderText).toContain('Oracle VM VirtualBox Disk Image');
    expect(header.signature).toBe('0xBEDA107F');
    expect(header.version).toBe('1.1');
    expect(header.versionMajor).toBe(1);
    expect(header.versionMinor).toBe(1);
    expect(header.headerSize).toBe(512);
    expect(header.imageType).toBe('dynamic');
    expect(header.imageTypeRaw).toBe(1);
    expect(header.description).toBe('Test Dynamic Disk');
    expect(header.offsetBlocks).toBe(512);
    expect(header.offsetData).toBe(1048576);
    expect(header.geometry.cylinders).toBe(1024);
    expect(header.geometry.heads).toBe(16);
    expect(header.geometry.sectors).toBe(63);
    expect(header.geometry.sectorSize).toBe(512);
    expect(header.diskSizeBytes).toBe('10737418240');
    expect(header.diskSizeFormatted).toBe('10.00 GB');
    expect(header.blockSize).toBe(1048576);
    expect(header.blockSizeFormatted).toBe('1.00 MB');
    expect(header.blocksCount).toBe(10240);
    expect(header.blocksAllocated).toBe(128);
    expect(header.uuidImage).toBe('01020304-0506-0708-090a-0b0c0d0e0f10');
    expect(header.uuidLastSnapshot).toBe('11121314-1516-1718-191a-1b1c1d1e1f20');
  });

  it('parses a valid fixed image header correctly', () => {
    const buffer = createSampleVdiHeader({
      imageType: 2, // Fixed
      description: 'Pre-allocated Fixed VDI',
      blocksCount: 5120,
      blocksAllocated: 5120,
    });

    const result = parseVdiHeader(buffer);
    expect(result.ok).toBe(true);
    expect(result.header.imageType).toBe('fixed');
    expect(result.header.imageTypeRaw).toBe(2);
    expect(result.header.blocksCount).toBe(5120);
    expect(result.header.blocksAllocated).toBe(5120);
    expect(result.header.description).toBe('Pre-allocated Fixed VDI');
  });

  it('parses a valid differencing image header correctly', () => {
    const buffer = createSampleVdiHeader({
      imageType: 3, // Differencing
      description: 'Snapshot Child Disk',
    });

    const result = parseVdiHeader(buffer);
    expect(result.ok).toBe(true);
    expect(result.header.imageType).toBe('differencing');
    expect(result.header.imageTypeRaw).toBe(3);
  });

  it('preserves raw image type value when type is unknown', () => {
    const buffer = createSampleVdiHeader({
      imageType: 99,
    });

    const result = parseVdiHeader(buffer);
    expect(result.ok).toBe(true);
    expect(result.header.imageType).toBe('unknown (raw: 99)');
    expect(result.header.imageTypeRaw).toBe(99);
  });

  it('returns { ok: false, error } when image signature is invalid', () => {
    const buffer = createSampleVdiHeader({
      signature: 0x12345678,
    });

    const result = parseVdiHeader(buffer);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Invalid VDI image signature/i);
    expect(result.error).toContain('0x12345678');
  });

  it('returns { ok: false, error } for truncated buffer (< 68 bytes)', () => {
    const smallBuffer = new ArrayBuffer(50);
    const result = parseVdiHeader(smallBuffer);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/truncated/i);
  });

  it('returns { ok: false, error } for truncated buffer between 68 and 456 bytes', () => {
    const sample = createSampleVdiHeader();
    const truncated = sample.slice(0, 200);

    const result = parseVdiHeader(truncated);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/truncated.*456/i);
  });

  it('returns { ok: false, error } when pre-header text is invalid', () => {
    const buffer = createSampleVdiHeader({
      preHeaderText: 'This is not a valid VirtualBox preheader text banner\n',
    });

    const result = parseVdiHeader(buffer);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Invalid pre-header text/i);
  });

  it('returns { ok: false, error } for non-buffer input', () => {
    expect(parseVdiHeader(null).ok).toBe(false);
    expect(parseVdiHeader('not a buffer').ok).toBe(false);
  });

  describe('parseHexBytes', () => {
    it('parses spaced hex string with 0x prefixes', () => {
      const hex = '0x7F 0x10 0xDA 0xBE';
      const res = parseHexBytes(hex);
      expect(res.ok).toBe(true);
      expect(Array.from(res.data)).toEqual([0x7f, 0x10, 0xda, 0xbe]);
    });

    it('rejects odd-length hex strings', () => {
      const res = parseHexBytes('abc');
      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/odd number/i);
    });

    it('rejects invalid characters', () => {
      const res = parseHexBytes('not-hex-at-all');
      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/Invalid character/i);
    });

    it('rejects empty input', () => {
      const res = parseHexBytes('   ');
      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/Input is empty/i);
    });

    it('rejects non-string input', () => {
      expect(parseHexBytes(123).ok).toBe(false);
    });
  });

  describe('formatHexDump', () => {
    it('formats a 16-byte chunk into standard hex dump format', () => {
      const bytes = new Uint8Array([
        0x3c, 0x3c, 0x3c, 0x20, 0x54, 0x65, 0x73, 0x74,
        0x20, 0x56, 0x44, 0x49, 0x20, 0x3e, 0x3e, 0x3e,
      ]);
      const dump = formatHexDump(bytes);
      expect(dump).toContain('00000000');
      expect(dump).toContain('3c 3c 3c 20 54 65 73 74');
      expect(dump).toContain('|<<< Test VDI >>>|');
    });
  });

  describe('formatFileSize', () => {
    it('formats various byte sizes', () => {
      expect(formatFileSize(512)).toBe('512 B');
      expect(formatFileSize(1048576)).toBe('1.00 MB');
      expect(formatFileSize(1073741824n)).toBe('1.00 GB');
      expect(formatFileSize(-1)).toBe('0 B');
    });
  });

  describe('formatUuid', () => {
    it('formats 16-byte UUID into standard string layout', () => {
      const buf = new ArrayBuffer(16);
      const view = new DataView(buf);
      for (let i = 0; i < 16; i += 1) {
        view.setUint8(i, i + 1);
      }
      expect(formatUuid(view, 0)).toBe('01020304-0506-0708-090a-0b0c0d0e0f10');
    });
  });
});
