import { describe, expect, it } from 'vitest';
import {
  SPECIAL_SECTOR,
  createMinimalCfbBuffer,
  formatClsid,
  formatFileSize,
  formatHexBytes,
  formatSectorLocation,
  isValidCfbSignature,
  parseOleCfbHeader,
} from './oleCfb.utils.js';

describe('isValidCfbSignature', () => {
  it('returns true for exact CFB magic bytes', () => {
    const bytes = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(isValidCfbSignature(bytes)).toBe(true);
  });

  it('returns false for mismatched bytes or short arrays', () => {
    expect(isValidCfbSignature(new Uint8Array([0, 1, 2, 3]))).toBe(false);
    expect(isValidCfbSignature(new Uint8Array(8))).toBe(false);
    expect(isValidCfbSignature(null)).toBe(false);
  });
});

describe('Formatting helpers', () => {
  it('formats hex bytes with uppercase pairs', () => {
    expect(formatHexBytes([0xd0, 0xcf, 0x11])).toBe('D0 CF 11');
  });

  it('formats CLSID into standard GUID representation', () => {
    const clsid = new Uint8Array(16);
    expect(formatClsid(clsid)).toBe('{00000000-0000-0000-0000-000000000000}');
    expect(formatClsid(null)).toBe('{00000000-0000-0000-0000-000000000000}');
  });

  it('formats sector locations and special constants', () => {
    expect(formatSectorLocation(SPECIAL_SECTOR.ENDOFCHAIN)).toBe('0xFFFFFFFE (ENDOFCHAIN)');
    expect(formatSectorLocation(SPECIAL_SECTOR.FREESECT)).toBe('0xFFFFFFFF (FREESECT)');
    expect(formatSectorLocation(SPECIAL_SECTOR.FATSECT)).toBe('0xFFFFFFFD (FATSECT)');
    expect(formatSectorLocation(SPECIAL_SECTOR.DIFSECT)).toBe('0xFFFFFFFC (DIFSECT)');
    expect(formatSectorLocation(SPECIAL_SECTOR.RESERVED)).toBe('0xFFFFFFFB (RESERVED)');
    expect(formatSectorLocation(0)).toBe('Sector 0 (0x00000000)');
    expect(formatSectorLocation(15)).toBe('Sector 15 (0x0000000F)');
  });

  it('formats file sizes into human-readable units', () => {
    expect(formatFileSize(500)).toBe('500 B');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(1048576)).toBe('1.0 MB');
  });
});

describe('parseOleCfbHeader', () => {
  it('throws TypeError if input is not an ArrayBuffer or typed array', () => {
    expect(() => parseOleCfbHeader(null)).toThrow(TypeError);
    expect(() => parseOleCfbHeader('not a buffer')).toThrow(TypeError);
  });

  it('parses a valid minimal CFB version 3 header', () => {
    const buffer = createMinimalCfbBuffer();
    const result = parseOleCfbHeader(buffer);

    expect(result.fileSize).toBe(512);
    expect(result.magicHex).toBe('D0 CF 11 E0 A1 B1 1A E1');
    expect(result.clsid).toBe('{00000000-0000-0000-0000-000000000000}');
    expect(result.majorVersion).toBe(3);
    expect(result.minorVersion).toBe(0x003e);
    expect(result.byteOrder).toBe(0xfffe);
    expect(result.sectorShift).toBe(9);
    expect(result.sectorSize).toBe(512);
    expect(result.miniSectorShift).toBe(6);
    expect(result.miniSectorSize).toBe(64);
    expect(result.numDirectorySectors).toBe(0);
    expect(result.numFatSectors).toBe(0);
    expect(result.firstDirectorySectorLocation).toBe(SPECIAL_SECTOR.ENDOFCHAIN);
    expect(result.firstMiniFatSectorLocation).toBe(SPECIAL_SECTOR.ENDOFCHAIN);
    expect(result.firstDifatSectorLocation).toBe(SPECIAL_SECTOR.ENDOFCHAIN);
    expect(result.miniStreamCutoffSize).toBe(4096);
    expect(result.difatEntries.length).toBe(109);
    expect(result.activeDifatEntries.length).toBe(0);
    expect(result.maxAvailableSectors).toBe(0);
  });

  it('parses a valid CFB version 4 header', () => {
    const buffer = createMinimalCfbBuffer({ majorVersion: 4 });
    const result = parseOleCfbHeader(buffer);

    expect(result.majorVersion).toBe(4);
    expect(result.sectorShift).toBe(12);
    expect(result.sectorSize).toBe(4096);
    expect(result.fileSize).toBe(4096);
  });

  it('parses active DIFAT entries when allocated within bounds', () => {
    // 512 header + 2 sectors (1024 bytes) = 1536 bytes total, maxSectors = 2
    const buffer = createMinimalCfbBuffer({
      size: 1536,
      numFatSectors: 2,
      difatEntries: [0, 1],
      firstDirectorySectorLocation: 0,
    });
    const result = parseOleCfbHeader(buffer);

    expect(result.maxAvailableSectors).toBe(2);
    expect(result.activeDifatEntries).toEqual([
      { index: 0, sector: 0 },
      { index: 1, sector: 1 },
    ]);
    expect(result.numFatSectors).toBe(2);
    expect(result.firstDirectorySectorLocation).toBe(0);
  });

  it('rejects a buffer shorter than 512 bytes', () => {
    const shortBuffer = new ArrayBuffer(256);
    expect(() => parseOleCfbHeader(shortBuffer)).toThrow(
      'Truncated file: buffer size is smaller than the minimum 512-byte CFB header.',
    );
  });

  it('rejects an invalid magic signature', () => {
    const buffer = new ArrayBuffer(512);
    expect(() => parseOleCfbHeader(buffer)).toThrow(
      'Invalid OLE CFB file signature: magic bytes do not match CFBF specification.',
    );
  });

  it('rejects unsupported major versions', () => {
    const buffer = createMinimalCfbBuffer({ majorVersion: 2 });
    expect(() => parseOleCfbHeader(buffer)).toThrow(
      'Unsupported CFB major version: 2 (expected version 3 or 4).',
    );
  });

  it('rejects invalid byte order', () => {
    const buffer = createMinimalCfbBuffer({ byteOrder: 0x1234 });
    expect(() => parseOleCfbHeader(buffer)).toThrow(
      'Invalid byte order: 0x1234 (expected 0xFFFE for little-endian).',
    );
  });

  it('rejects invalid sector shift for major version', () => {
    const buffer = createMinimalCfbBuffer({ majorVersion: 3, sectorShift: 10 });
    expect(() => parseOleCfbHeader(buffer)).toThrow(
      'Invalid sector shift 10 for major version 3: expected 9 (512 bytes).',
    );
  });

  it('rejects invalid mini sector shift', () => {
    const buffer = createMinimalCfbBuffer({ miniSectorShift: 7 });
    expect(() => parseOleCfbHeader(buffer)).toThrow(
      'Invalid mini-sector shift 7: expected 6 (64 bytes).',
    );
  });

  it('rejects version 3 with non-zero directory sectors', () => {
    const buffer = createMinimalCfbBuffer({ majorVersion: 3, numDirectorySectors: 1 });
    expect(() => parseOleCfbHeader(buffer)).toThrow(
      'Invalid directory sector count (1) for version 3: must be 0.',
    );
  });

  it('rejects version 4 file smaller than 4096 bytes', () => {
    const buffer = createMinimalCfbBuffer({ majorVersion: 4, size: 2048 });
    expect(() => parseOleCfbHeader(buffer)).toThrow(
      'Truncated file: CFB version 4 requires at least 4096 bytes for the header sector.',
    );
  });

  it('rejects invalid mini stream cutoff size', () => {
    const buffer = createMinimalCfbBuffer({ miniStreamCutoffSize: 2048 });
    expect(() => parseOleCfbHeader(buffer)).toThrow(
      'Invalid mini stream cutoff size: 2048 bytes (expected 4096 bytes).',
    );
  });

  it('rejects out-of-bounds FAT sector count', () => {
    // 512-byte file has 0 data sectors
    const buffer = createMinimalCfbBuffer({ numFatSectors: 2 });
    expect(() => parseOleCfbHeader(buffer)).toThrow(
      'Declared FAT sector count (2) exceeds total available sectors (0).',
    );
  });

  it('rejects out-of-bounds mini FAT sector count', () => {
    const buffer = createMinimalCfbBuffer({ numMiniFatSectors: 1 });
    expect(() => parseOleCfbHeader(buffer)).toThrow(
      'Declared mini FAT sector count (1) exceeds total available sectors (0).',
    );
  });

  it('rejects out-of-bounds DIFAT sector count', () => {
    const buffer = createMinimalCfbBuffer({ numDifatSectors: 1 });
    expect(() => parseOleCfbHeader(buffer)).toThrow(
      'Declared DIFAT sector count (1) exceeds total available sectors (0).',
    );
  });

  it('rejects out-of-bounds first directory sector location', () => {
    const buffer = createMinimalCfbBuffer({ firstDirectorySectorLocation: 0 });
    expect(() => parseOleCfbHeader(buffer)).toThrow(
      'Declared first directory sector location (0) exceeds file bounds (max sector: none).',
    );
  });

  it('rejects out-of-bounds first mini FAT sector location', () => {
    const buffer = createMinimalCfbBuffer({ firstMiniFatSectorLocation: 5 });
    expect(() => parseOleCfbHeader(buffer)).toThrow(
      'Declared first mini FAT sector location (5) exceeds file bounds (max sector: none).',
    );
  });

  it('rejects out-of-bounds first DIFAT sector location', () => {
    const buffer = createMinimalCfbBuffer({ firstDifatSectorLocation: 8 });
    expect(() => parseOleCfbHeader(buffer)).toThrow(
      'Declared first DIFAT sector location (8) exceeds file bounds (max sector: none).',
    );
  });

  it('rejects out-of-bounds sector referenced in DIFAT array', () => {
    const buffer = createMinimalCfbBuffer({
      size: 1024,
      difatEntries: [10], // file has 1 sector (index 0)
    });
    expect(() => parseOleCfbHeader(buffer)).toThrow(
      'DIFAT entry at index 0 (sector 10) exceeds file bounds (max sector: 0).',
    );
  });

  it('rejects reserved sector markers in header DIFAT entries', () => {
    const reservedCases = [
      { name: 'ENDOFCHAIN', value: SPECIAL_SECTOR.ENDOFCHAIN },
      { name: 'FATSECT', value: SPECIAL_SECTOR.FATSECT },
      { name: 'DIFSECT', value: SPECIAL_SECTOR.DIFSECT },
      { name: 'RESERVED', value: SPECIAL_SECTOR.RESERVED },
    ];

    for (const { name, value } of reservedCases) {
      const buffer = createMinimalCfbBuffer({
        size: 1024,
        difatEntries: [value],
      });
      expect(() => parseOleCfbHeader(buffer)).toThrow(
        new RegExp(`Invalid DIFAT entry at index 0: reserved sector marker.*${name}`),
      );
    }
  });

  it('rejects version 4 header with non-zero padding beyond 512 bytes', () => {
    const buffer = createMinimalCfbBuffer({ majorVersion: 4 });
    const u8 = new Uint8Array(buffer);
    u8[512] = 0x01;

    expect(() => parseOleCfbHeader(buffer)).toThrow(
      /Invalid CFB version 4 header: sector padding from byte 512 to 4095 must be zero/,
    );
  });
});
