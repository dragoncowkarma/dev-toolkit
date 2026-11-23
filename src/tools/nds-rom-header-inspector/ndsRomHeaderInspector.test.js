import { describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  bytesToHexString,
  calculateCrc16,
  createSyntheticHeader,
  formatBytes,
  formatHex,
  hexToBytes,
  parseInputToBytes,
  parseNdsHeader,
  validateArmOffsets,
} from './ndsRomHeaderInspector.utils.js';

describe('CRC-16 calculation', () => {
  it('calculates CCITT CRC-16 correctly', () => {
    const testData = new Uint8Array([0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39]);
    expect(calculateCrc16(testData)).toBe(0x29b1);
  });

  it('calculates with offset and length slices', () => {
    const full = new Uint8Array([0x00, 0x31, 0x32, 0x33, 0x00]);
    expect(calculateCrc16(full, 1, 3)).toBe(calculateCrc16(full.subarray(1, 4)));
  });
});

describe('Formatting utilities', () => {
  it('formats hex values with zero padding', () => {
    expect(formatHex(0x4000, 8)).toBe('0x00004000');
    expect(formatHex(0x15c, 4)).toBe('0x015C');
    expect(formatHex(null)).toBe('0x0000');
  });

  it('formats byte sizes into readable units', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(32 * 1024 * 1024)).toBe('32.0 MB');
    expect(formatBytes(-1)).toBe('0 B');
  });
});

describe('Input conversion utilities', () => {
  it('converts clean hex string to bytes', () => {
    const bytes = hexToBytes('4D4152494F');
    expect(bytes).toEqual(new Uint8Array([0x4d, 0x41, 0x52, 0x49, 0x4f]));
  });

  it('handles spaces and 0x prefixes in hex', () => {
    const bytes = hexToBytes('0x4D 0x41 0x52');
    expect(bytes).toEqual(new Uint8Array([0x4d, 0x41, 0x52]));
  });

  it('returns null for invalid hex strings', () => {
    expect(hexToBytes('not-hex')).toBeNull();
    expect(hexToBytes('123')).toBeNull(); // Odd length
    expect(hexToBytes(123)).toBeNull();
  });

  it('converts base64 string to bytes', () => {
    const bytes = base64ToBytes('TUFS');
    expect(bytes).toEqual(new Uint8Array([0x4d, 0x41, 0x52]));
  });

  it('returns null for invalid base64', () => {
    expect(base64ToBytes('???')).toBeNull();
  });

  it('auto-detects and converts inputs in parseInputToBytes', () => {
    const raw = new Uint8Array([1, 2, 3]);
    expect(parseInputToBytes(raw)).toBe(raw);
    expect(parseInputToBytes(raw.buffer)).toEqual(raw);
    expect(parseInputToBytes('01 02 03')).toEqual(raw);
    expect(parseInputToBytes('AQID')).toEqual(raw);
    expect(parseInputToBytes('')).toBeNull();
  });

  it('formats bytes to hex string', () => {
    expect(bytesToHexString(new Uint8Array([0x01, 0x0f, 0xff]))).toBe('01 0F FF');
  });
});

describe('validateArmOffsets', () => {
  it('validates correct offsets', () => {
    const result = validateArmOffsets({
      arm9Offset: 0x4000,
      arm9Size: 0x10000,
      arm7Offset: 0x14000,
      arm7Size: 0x8000,
      totalRomSize: 0x2000000,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('detects out-of-range ARM9 offset within header', () => {
    const result = validateArmOffsets({
      arm9Offset: 0x100, // < 0x160
      arm9Size: 0x1000,
      arm7Offset: 0x4000,
      arm7Size: 0x1000,
      totalRomSize: 0x100000,
    });
    expect(result.valid).toBe(false);
    expect(result.arm9Valid).toBe(false);
    expect(result.errors[0]).toMatch(/ARM9 ROM offset .* within header/);
  });

  it('detects out-of-range ARM7 offset within header', () => {
    const result = validateArmOffsets({
      arm9Offset: 0x4000,
      arm9Size: 0x1000,
      arm7Offset: 0x050, // < 0x160
      arm7Size: 0x1000,
      totalRomSize: 0x100000,
    });
    expect(result.valid).toBe(false);
    expect(result.arm7Valid).toBe(false);
    expect(result.errors[0]).toMatch(/ARM7 ROM offset .* within header/);
  });

  it('detects binary extending beyond total ROM size', () => {
    const result = validateArmOffsets({
      arm9Offset: 0x4000,
      arm9Size: 0x2000000, // extends beyond 0x1000000
      arm7Offset: 0x4000,
      arm7Size: 0x1000,
      totalRomSize: 0x1000000,
    });
    expect(result.valid).toBe(false);
    expect(result.arm9Valid).toBe(false);
    expect(result.errors[0]).toMatch(/ARM9 binary extends beyond total ROM size/);
  });
});

describe('parseNdsHeader', () => {
  it('parses a valid Nintendo DS ROM header with all decoded fields', () => {
    const header = createSyntheticHeader({
      gameTitle: 'POKEMON D',
      gameCode: 'ADAE',
      makerCode: '01',
      unitCode: 0x00,
      romVersion: 0x01,
      arm9RomOffset: 0x4000,
      arm9EntryAddress: 0x02000000,
      arm9RamAddress: 0x02000000,
      arm9Size: 0x000dc000,
      arm7RomOffset: 0x000e0000,
      arm7EntryAddress: 0x02380000,
      arm7RamAddress: 0x02380000,
      arm7Size: 0x00028000,
      totalRomSize: 0x04000000, // 64 MB
    });

    const result = parseNdsHeader(header);
    expect(result.ok).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.gameTitle).toBe('POKEMON D');
    expect(result.gameCode).toBe('ADAE');
    expect(result.makerCode).toBe('01');
    expect(result.makerName).toBe('Nintendo');
    expect(result.unitCode).toBe(0x00);
    expect(result.unitCodeName).toBe('Nintendo DS (NDS)');
    expect(result.romVersion).toBe(0x01);
    expect(result.totalRomSize).toBe(0x04000000);
    expect(result.arm9.romOffset).toBe(0x4000);
    expect(result.arm9.entryAddress).toBe(0x02000000);
    expect(result.arm9.ramAddress).toBe(0x02000000);
    expect(result.arm9.size).toBe(0x000dc000);
    expect(result.arm9.valid).toBe(true);
    expect(result.arm7.romOffset).toBe(0x000e0000);
    expect(result.arm7.entryAddress).toBe(0x02380000);
    expect(result.arm7.ramAddress).toBe(0x02380000);
    expect(result.arm7.size).toBe(0x00028000);
    expect(result.arm7.valid).toBe(true);
    expect(result.logoCrc.valid).toBe(true);
    expect(result.headerCrc.valid).toBe(true);
    expect(result.armOffsetsValid).toBe(true);
  });

  it('detects a bad Nintendo logo CRC', () => {
    const header = createSyntheticHeader({ badLogoCrc: true });
    const result = parseNdsHeader(header);

    expect(result.ok).toBe(true);
    expect(result.logoCrc.valid).toBe(false);
    expect(result.logoCrc.expected).not.toBe(result.logoCrc.actual);
    expect(result.headerCrc.valid).toBe(true);
    expect(result.valid).toBe(false);
  });

  it('detects a bad header CRC', () => {
    const header = createSyntheticHeader({ badHeaderCrc: true });
    const result = parseNdsHeader(header);

    expect(result.ok).toBe(true);
    expect(result.headerCrc.valid).toBe(false);
    expect(result.headerCrc.expected).not.toBe(result.headerCrc.actual);
    expect(result.logoCrc.valid).toBe(true);
    expect(result.valid).toBe(false);
  });

  it('returns { ok: false, error } for truncated buffers without throwing', () => {
    // 100 bytes is less than the required 0x160 (352 bytes)
    const truncated = new Uint8Array(100);
    const result = parseNdsHeader(truncated);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Truncated ROM header/);

    // Empty buffer
    const emptyResult = parseNdsHeader(new Uint8Array(0));
    expect(emptyResult.ok).toBe(false);

    // Null or undefined
    expect(parseNdsHeader(null).ok).toBe(false);
    expect(parseNdsHeader(undefined).ok).toBe(false);
  });

  it('flags out-of-range ARM offsets', () => {
    const header = createSyntheticHeader({
      arm9RomOffset: 0x0080, // Invalid: within header (< 0x160)
    });
    const result = parseNdsHeader(header);

    expect(result.ok).toBe(true);
    expect(result.armOffsetsValid).toBe(false);
    expect(result.arm9.valid).toBe(false);
    expect(result.valid).toBe(false);
    expect(result.validationErrors.length).toBeGreaterThan(0);
  });

  it('parses valid Base64 string directly', () => {
    const header = createSyntheticHeader({ gameTitle: 'SUPER MARIO' });
    let binary = '';
    for (let i = 0; i < header.length; i++) {
      binary += String.fromCharCode(header[i]);
    }
    const b64 = btoa(binary);

    const result = parseNdsHeader(b64);
    expect(result.ok).toBe(true);
    expect(result.gameTitle).toBe('SUPER MARIO');
  });
});
