import { describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  bytesToHexString,
  calculateCrc16,
  calculateDeviceCapacity,
  createSyntheticHeader,
  formatBytes,
  formatHex,
  hexToBytes,
  MAX_DEVICE_CAPACITY,
  MIN_DEVICE_CAPACITY,
  parseInputToBytes,
  parseNdsHeader,
  STANDARD_NINTENDO_LOGO,
  validateArmOffsets,
} from './ndsRomHeaderInspector.utils.js';

describe('CRC-16 calculation', () => {
  it('calculates BIOS CRC-16 (MODBUS reflected) correctly for check string 123456789', () => {
    const testData = new Uint8Array([0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39]);
    expect(calculateCrc16(testData)).toBe(0x4b37);
  });

  it('calculates with offset and length slices', () => {
    const full = new Uint8Array([0x00, 0x31, 0x32, 0x33, 0x00]);
    expect(calculateCrc16(full, 1, 3)).toBe(calculateCrc16(full.subarray(1, 4)));
  });

  it('calculates 0xCF56 for the standard Nintendo logo (0x0C0-0x15B)', () => {
    expect(STANDARD_NINTENDO_LOGO.length).toBe(156);
    expect(calculateCrc16(STANDARD_NINTENDO_LOGO)).toBe(0xcf56);
  });
});

describe('Formatting utilities', () => {
  it('formats hex values with zero padding and preserves values exceeding 32 bits', () => {
    expect(formatHex(0x4000, 8)).toBe('0x00004000');
    expect(formatHex(0x15c, 4)).toBe('0x015C');
    expect(formatHex(null)).toBe('0x0000');
    expect(formatHex(undefined)).toBe('0x0000');
    expect(formatHex(Number.NaN)).toBe('0x0000');
    expect(formatHex(Number.POSITIVE_INFINITY)).toBe('0x0000');
    expect(formatHex(0, 8)).toBe('0x00000000');
    expect(formatHex(0xffffffff, 8)).toBe('0xFFFFFFFF');
    expect(formatHex(0x100000000, 8)).toBe('0x100000000');
    expect(formatHex(0x100000001, 8)).toBe('0x100000001');
    expect(formatHex(0x1fffffffe, 8)).toBe('0x1FFFFFFFE');
    expect(formatHex(-1, 8)).toBe('0xFFFFFFFF');
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

  it('supports explicit format hints in parseInputToBytes', () => {
    const hexResult = parseInputToBytes('4D 41 52', 'hex');
    expect(hexResult).toEqual(new Uint8Array([0x4d, 0x41, 0x52]));

    const b64Result = parseInputToBytes('TUFS', 'base64');
    expect(b64Result).toEqual(new Uint8Array([0x4d, 0x41, 0x52]));

    expect(parseInputToBytes('invalid-hex-chars!', 'hex')).toBeNull();
    expect(parseInputToBytes('???invalid-base64???', 'base64')).toBeNull();
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

  it('preserves full end address in ARM9 out-of-bounds diagnostic exceeding 0xFFFFFFFF', () => {
    const result = validateArmOffsets({
      arm9Offset: 0xffffffff,
      arm9Size: 2,
      arm7Offset: 0x160,
      arm7Size: 0,
      totalRomSize: 0xffffffff,
    });
    expect(result.valid).toBe(false);
    expect(result.arm9Valid).toBe(false);
    expect(result.arm7Valid).toBe(true);
    expect(result.errors).toContain(
      'ARM9 binary extends beyond total ROM size (0x100000001 > 0xFFFFFFFF).'
    );
  });

  it('preserves full end address in ARM7 out-of-bounds diagnostic exceeding 0xFFFFFFFF', () => {
    const result = validateArmOffsets({
      arm9Offset: 0x160,
      arm9Size: 0,
      arm7Offset: 0xffffffff,
      arm7Size: 2,
      totalRomSize: 0xffffffff,
    });
    expect(result.valid).toBe(false);
    expect(result.arm9Valid).toBe(true);
    expect(result.arm7Valid).toBe(false);
    expect(result.errors).toContain(
      'ARM7 binary extends beyond total ROM size (0x100000001 > 0xFFFFFFFF).'
    );
  });

  it('preserves exact 32-bit boundary wrap value 0x100000000 in diagnostics', () => {
    const result = validateArmOffsets({
      arm9Offset: 0xffffffff,
      arm9Size: 1,
      arm7Offset: 0x160,
      arm7Size: 0,
      totalRomSize: 0xfffffffe,
    });
    expect(result.valid).toBe(false);
    expect(result.arm9Valid).toBe(false);
    expect(result.errors).toContain(
      'ARM9 binary extends beyond total ROM size (0x100000000 > 0xFFFFFFFE).'
    );
  });

  it('accepts payloads where offset + size exactly equals total ROM size', () => {
    const result = validateArmOffsets({
      arm9Offset: 0x4000,
      arm9Size: 0x10000,
      arm7Offset: 0x14000,
      arm7Size: 0x8000,
      totalRomSize: 0x1c000, // exactly 0x14000 + 0x8000
    });
    expect(result.valid).toBe(true);
    expect(result.arm9Valid).toBe(true);
    expect(result.arm7Valid).toBe(true);
    expect(result.errors).toHaveLength(0);
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
    expect(result.logoCrc.actual).toBe(0xcf56);
    expect(result.logoCrc.expected).toBe(0xcf56);
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

  it('preserves full end address when ARM9 exceeds total ROM size in parseNdsHeader', () => {
    const header = createSyntheticHeader({
      arm9RomOffset: 0xffffffff,
      arm9Size: 2,
      totalRomSize: 0xffffffff,
    });
    const result = parseNdsHeader(header);
    expect(result.ok).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.arm9.valid).toBe(false);
    expect(result.validationErrors).toContain(
      'ARM9 binary extends beyond total ROM size (0x100000001 > 0xFFFFFFFF).'
    );
  });

  it('preserves full end address when ARM7 exceeds total ROM size in parseNdsHeader', () => {
    const header = createSyntheticHeader({
      arm7RomOffset: 0xffffffff,
      arm7Size: 2,
      totalRomSize: 0xffffffff,
    });
    const result = parseNdsHeader(header);
    expect(result.ok).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.arm7.valid).toBe(false);
    expect(result.validationErrors).toContain(
      'ARM7 binary extends beyond total ROM size (0x100000001 > 0xFFFFFFFF).'
    );
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

  it('correctly decodes device capacity 0 as 128 KiB', () => {
    const header = createSyntheticHeader({ deviceCapacity: 0 });
    const result = parseNdsHeader(header);

    expect(result.ok).toBe(true);
    expect(result.deviceCapacity).toBe(0);
    expect(result.deviceCapacityValid).toBe(true);
    expect(result.chipSizeBytes).toBe(128 * 1024);
    expect(result.chipSizeFormatted).toBe('128.0 KB');
  });

  it('correctly decodes ordinary device capacity values (e.g. 7 and 8)', () => {
    const header7 = createSyntheticHeader({ deviceCapacity: 7 });
    const result7 = parseNdsHeader(header7);
    expect(result7.ok).toBe(true);
    expect(result7.deviceCapacity).toBe(7);
    expect(result7.chipSizeBytes).toBe(16 * 1024 * 1024);
    expect(result7.chipSizeFormatted).toBe('16.0 MB');

    const header8 = createSyntheticHeader({ deviceCapacity: 8 });
    const result8 = parseNdsHeader(header8);
    expect(result8.ok).toBe(true);
    expect(result8.deviceCapacity).toBe(8);
    expect(result8.chipSizeBytes).toBe(32 * 1024 * 1024);
    expect(result8.chipSizeFormatted).toBe('32.0 MB');
  });

  it('correctly decodes upper boundary device capacity 15 (4 GB)', () => {
    const header15 = createSyntheticHeader({ deviceCapacity: 15 });
    const result15 = parseNdsHeader(header15);
    expect(result15.ok).toBe(true);
    expect(result15.deviceCapacity).toBe(15);
    expect(result15.chipSizeBytes).toBe(4 * 1024 * 1024 * 1024);
    expect(result15.chipSizeFormatted).toBe('4.0 GB');
  });

  it('handles malformed capacity 31 without negative chip size', () => {
    const header31 = createSyntheticHeader({ deviceCapacity: 31 });
    const result31 = parseNdsHeader(header31);

    expect(result31.ok).toBe(true);
    expect(result31.deviceCapacity).toBe(31);
    expect(result31.deviceCapacityValid).toBe(false);
    expect(result31.chipSizeBytes).toBeNull();
    expect(result31.chipSizeFormatted).toBe('Unknown');
    // Ensure 32-bit shift overflow does not produce negative byte size
    expect(result31.chipSizeBytes).not.toBe(-281474976710656);
  });

  it('handles malformed capacity 32 without wrapping to base size', () => {
    const header32 = createSyntheticHeader({ deviceCapacity: 32 });
    const result32 = parseNdsHeader(header32);

    expect(result32.ok).toBe(true);
    expect(result32.deviceCapacity).toBe(32);
    expect(result32.deviceCapacityValid).toBe(false);
    expect(result32.chipSizeBytes).toBeNull();
    expect(result32.chipSizeFormatted).toBe('Unknown');
    expect(result32.chipSizeBytes).not.toBe(128 * 1024);
  });

  it('handles unsupported byte 255 as unknown capacity', () => {
    const header255 = createSyntheticHeader({ deviceCapacity: 255 });
    const result255 = parseNdsHeader(header255);

    expect(result255.ok).toBe(true);
    expect(result255.deviceCapacity).toBe(255);
    expect(result255.deviceCapacityValid).toBe(false);
    expect(result255.chipSizeBytes).toBeNull();
    expect(result255.chipSizeFormatted).toBe('Unknown');
  });
});

describe('calculateDeviceCapacity', () => {
  // Authoritative reference: GBATEK Nintendo DS Cartridge Header (014h - Devicecapacity)
  // Formula: Chipsize = 128KB SHL nn (128 KiB * 2^nn)
  // Valid exponent range: 0x00 (128 KiB) to 0x0F (4 GB, 32-bit cart address space ceiling).

  it('exports valid range constants matching GBATEK specification', () => {
    expect(MIN_DEVICE_CAPACITY).toBe(0x00);
    expect(MAX_DEVICE_CAPACITY).toBe(0x0f);
  });

  it('calculates capacity for zero exponent (128 KiB base size)', () => {
    const result = calculateDeviceCapacity(0);
    expect(result.valid).toBe(true);
    expect(result.bytes).toBe(128 * 1024);
    expect(result.formatted).toBe('128.0 KB');
  });

  it('calculates ordinary supported retail capacities', () => {
    // 0x01: 256 KiB
    expect(calculateDeviceCapacity(1)).toEqual({
      bytes: 256 * 1024,
      formatted: '256.0 KB',
      valid: true,
    });

    // 0x06: 8 MB
    expect(calculateDeviceCapacity(6)).toEqual({
      bytes: 8 * 1024 * 1024,
      formatted: '8.0 MB',
      valid: true,
    });

    // 0x07: 16 MB (GBATEK explicit example: "eg. 07h = 16MB")
    expect(calculateDeviceCapacity(7)).toEqual({
      bytes: 16 * 1024 * 1024,
      formatted: '16.0 MB',
      valid: true,
    });

    // 0x08: 32 MB
    expect(calculateDeviceCapacity(8)).toEqual({
      bytes: 32 * 1024 * 1024,
      formatted: '32.0 MB',
      valid: true,
    });

    // 0x09: 64 MB
    expect(calculateDeviceCapacity(9)).toEqual({
      bytes: 64 * 1024 * 1024,
      formatted: '64.0 MB',
      valid: true,
    });

    // 0x0C: 512 MB (largest commercial retail NDS cartridges)
    expect(calculateDeviceCapacity(12)).toEqual({
      bytes: 512 * 1024 * 1024,
      formatted: '512.0 MB',
      valid: true,
    });
  });

  it('calculates upper boundary capacity (0x0F = 4 GB)', () => {
    expect(calculateDeviceCapacity(15)).toEqual({
      bytes: 4 * 1024 * 1024 * 1024,
      formatted: '4.0 GB',
      valid: true,
    });
  });

  it('returns Unknown and null bytes for capacity exceeding 4 GB boundary (16)', () => {
    const result = calculateDeviceCapacity(16);
    expect(result.valid).toBe(false);
    expect(result.bytes).toBeNull();
    expect(result.formatted).toBe('Unknown');
  });

  it('handles shift-overflowing values 31 and 32 without negative or wrapped sizes', () => {
    // Capacity 31 in 32-bit signed bitwise shift (1 << 31) yields -2147483648
    const cap31 = calculateDeviceCapacity(31);
    expect(cap31.valid).toBe(false);
    expect(cap31.bytes).toBeNull();
    expect(cap31.formatted).toBe('Unknown');

    // Capacity 32 in JS bitwise shift wraps modulo 32 (1 << (32 % 32) = 1)
    const cap32 = calculateDeviceCapacity(32);
    expect(cap32.valid).toBe(false);
    expect(cap32.bytes).toBeNull();
    expect(cap32.formatted).toBe('Unknown');
  });

  it('rejects malformed, negative, or non-integer inputs', () => {
    expect(calculateDeviceCapacity(-1)).toEqual({
      bytes: null,
      formatted: 'Unknown',
      valid: false,
    });
    expect(calculateDeviceCapacity(255)).toEqual({
      bytes: null,
      formatted: 'Unknown',
      valid: false,
    });
    expect(calculateDeviceCapacity(NaN)).toEqual({
      bytes: null,
      formatted: 'Unknown',
      valid: false,
    });
    expect(calculateDeviceCapacity(null)).toEqual({
      bytes: null,
      formatted: 'Unknown',
      valid: false,
    });
    expect(calculateDeviceCapacity('8')).toEqual({
      bytes: null,
      formatted: 'Unknown',
      valid: false,
    });
    expect(calculateDeviceCapacity(4.5)).toEqual({
      bytes: null,
      formatted: 'Unknown',
      valid: false,
    });
  });
});
