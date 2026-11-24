import { describe, expect, it } from 'vitest';
import {
  BANNER_LANGUAGES,
  BANNER_VERSIONS,
  base64ToBytes,
  bytesToHexString,
  calculateCrc16,
  calculateDeviceCapacity,
  createSyntheticBanner,
  createSyntheticHeader,
  decodeUtf16LeTitle,
  encodeUtf16Le,
  formatBytes,
  formatHex,
  HEADER_SIZE,
  hexToBytes,
  MAX_DEVICE_CAPACITY,
  MIN_BANNER_SIZE,
  MIN_DEVICE_CAPACITY,
  MIN_HEADER_SIZE,
  parseInputToBytes,
  parseNdsBanner,
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

describe('UTF-16LE Title Encoding and Decoding', () => {
  it('encodes and decodes ASCII and Unicode strings', () => {
    const text = 'Mario Kart DS';
    const encoded = encodeUtf16Le(text);
    const decoded = decodeUtf16LeTitle(encoded, 0, 0x100);
    expect(decoded.raw).toBe(text);
    expect(decoded.lines).toEqual([text]);
  });

  it('splits multiline titles on newline into lines', () => {
    const text = 'Mario Kart DS\nNintendo';
    const encoded = encodeUtf16Le(text);
    const decoded = decodeUtf16LeTitle(encoded, 0, 0x100);
    expect(decoded.raw).toBe('Mario Kart DS\nNintendo');
    expect(decoded.lines).toEqual(['Mario Kart DS', 'Nintendo']);
  });

  it('handles CRLF line endings', () => {
    const text = 'Line 1\r\nLine 2';
    const encoded = encodeUtf16Le(text);
    const decoded = decodeUtf16LeTitle(encoded, 0, 0x100);
    expect(decoded.lines).toEqual(['Line 1', 'Line 2']);
  });

  it('decodes non-ASCII titles including Japanese Katakana and accented characters', () => {
    const jpText = 'マリオカートDS\n任天堂';
    const jpEncoded = encodeUtf16Le(jpText);
    const jpDecoded = decodeUtf16LeTitle(jpEncoded, 0, 0x100);
    expect(jpDecoded.raw).toBe(jpText);
    expect(jpDecoded.lines).toEqual(['マリオカートDS', '任天堂']);

    const frText = 'Pokémon Édition Platine\nNintendo';
    const frEncoded = encodeUtf16Le(frText);
    const frDecoded = decodeUtf16LeTitle(frEncoded, 0, 0x100);
    expect(frDecoded.raw).toBe(frText);
    expect(frDecoded.lines).toEqual(['Pokémon Édition Platine', 'Nintendo']);
  });

  it('returns empty lines for null or empty buffer', () => {
    expect(decodeUtf16LeTitle(null, 0)).toEqual({ raw: '', lines: [] });
    expect(decodeUtf16LeTitle(new Uint8Array(0), 10)).toEqual({ raw: '', lines: [] });
    const empty = new Uint8Array(256);
    expect(decodeUtf16LeTitle(empty, 0, 256)).toEqual({ raw: '', lines: [] });
  });
});

describe('NDS Icon/Title Banner Inspector', () => {
  it('exports valid banner constants and parseNdsBanner utility', () => {
    expect(MIN_BANNER_SIZE).toBe(0x840);
    expect(BANNER_LANGUAGES).toHaveLength(6);
    expect(BANNER_VERSIONS[0x0001]).toContain('Version 1');
    expect(typeof parseNdsBanner).toBe('function');
  });

  it('parses a valid version 1 banner with all 6 language titles and valid CRC-16', () => {
    const rom = createSyntheticHeader({
      includeBanner: true,
      bannerOffset: 0x200,
      bannerTitles: {
        japanese: 'マリオカートDS\n任天堂',
        english: 'Mario Kart DS\nNintendo',
        french: 'Mario Kart DS\nNintendo',
        german: 'Mario Kart DS\nNintendo',
        italian: 'Mario Kart DS\nNintendo',
        spanish: 'Mario Kart DS\nNintendo',
      },
    });

    const result = parseNdsHeader(rom);
    expect(result.ok).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.banner.present).toBe(true);
    expect(result.banner.offset).toBe(0x200);
    expect(result.banner.offsetHex).toBe('0x00000200');
    expect(result.banner.version).toBe(0x0001);
    expect(result.banner.versionHex).toBe('0x0001');
    expect(result.banner.versionName).toBe('Version 1 (Original NDS)');
    expect(result.banner.valid).toBe(true);
    expect(result.banner.crc.v1.valid).toBe(true);
    expect(result.banner.crc.v1.expected).toBe(result.banner.crc.v1.actual);
    expect(result.banner.titles.japanese.lines).toEqual(['マリオカートDS', '任天堂']);
    expect(result.banner.titles.english.lines).toEqual(['Mario Kart DS', 'Nintendo']);
    expect(result.banner.titles.french.lines).toEqual(['Mario Kart DS', 'Nintendo']);
    expect(result.banner.titles.german.lines).toEqual(['Mario Kart DS', 'Nintendo']);
    expect(result.banner.titles.italian.lines).toEqual(['Mario Kart DS', 'Nintendo']);
    expect(result.banner.titles.spanish.lines).toEqual(['Mario Kart DS', 'Nintendo']);
    expect(result.banner.titlesList).toHaveLength(6);
  });

  it('detects a banner CRC-16 mismatch and reports error', () => {
    const rom = createSyntheticHeader({
      includeBanner: true,
      bannerOffset: 0x200,
      badBannerV1Crc: true,
    });

    const result = parseNdsHeader(rom);
    expect(result.ok).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.banner.present).toBe(true);
    expect(result.banner.valid).toBe(false);
    expect(result.banner.crc.v1.valid).toBe(false);
    expect(result.banner.crc.v1.expected).not.toBe(result.banner.crc.v1.actual);
    expect(result.validationErrors.some((e) => e.includes('Banner v1 CRC-16 mismatch'))).toBe(true);
  });

  it('reports diagnostic without crashing when banner offset is 0', () => {
    const rom = createSyntheticHeader({ bannerOffset: 0 });
    const result = parseNdsHeader(rom);

    expect(result.ok).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.banner.present).toBe(false);
    expect(result.banner.offset).toBe(0);
    expect(result.banner.offsetHex).toBe('0x00000000');
    expect(result.banner.diagnostic).toContain('Banner offset is 0x00000000');
    expect(result.banner.titles).toBeNull();
  });

  it('reports diagnostic when banner offset is past EOF', () => {
    // 352-byte header, but bannerOffset points to 0x4000 (> 352 bytes)
    const rom = createSyntheticHeader({ bannerOffset: 0x4000, totalSize: MIN_HEADER_SIZE });
    const result = parseNdsHeader(rom);

    expect(result.ok).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.banner.present).toBe(false);
    expect(result.banner.valid).toBe(false);
    expect(result.banner.diagnostic).toMatch(/beyond end of file/);
    expect(result.validationErrors.some((e) => e.includes('beyond end of file'))).toBe(true);
  });

  it('reports diagnostic when banner is truncated (fewer than 0x840 bytes)', () => {
    // Total size only gives 0x100 bytes of banner space at 0x200
    const rom = createSyntheticHeader({
      includeBanner: true,
      bannerOffset: 0x200,
      totalSize: 0x200 + 0x100,
    });
    const result = parseNdsHeader(rom);

    expect(result.ok).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.banner.present).toBe(false);
    expect(result.banner.valid).toBe(false);
    expect(result.banner.diagnostic).toMatch(/Truncated banner block/);
    expect(result.validationErrors.some((e) => e.includes('Truncated banner block'))).toBe(true);
  });

  it('reports diagnostic when banner version is unknown', () => {
    const banner = createSyntheticBanner({ version: 0x9999 });
    const total = 0x200 + banner.length;
    const rom = new Uint8Array(total);
    rom.set(createSyntheticHeader({ bannerOffset: 0x200, totalSize: total }).subarray(0, 0x160), 0);
    rom.set(banner, 0x200);

    const result = parseNdsHeader(rom);
    expect(result.ok).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.banner.present).toBe(true);
    expect(result.banner.valid).toBe(false);
    expect(result.banner.version).toBe(0x9999);
    expect(result.banner.diagnostic).toMatch(/Unknown banner version: 0x9999/);
    expect(result.validationErrors.some((e) => e.includes('Unknown banner version'))).toBe(true);
  });

  it('reports diagnostic when banner offset is within header (< HEADER_SIZE 0x200)', () => {
    const rom = createSyntheticHeader({ bannerOffset: 0x080 });
    const result = parseNdsHeader(rom);

    expect(result.ok).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.banner.present).toBe(false);
    expect(result.banner.valid).toBe(false);
    expect(result.banner.diagnostic).toMatch(/within header/);
    expect(result.banner.diagnostic).toContain('< 0x0200');
  });

  it('rejects banner offsets throughout the 0x160..0x1ff header range', () => {
    // Test boundary at 0x160
    const rom160 = createSyntheticHeader({ bannerOffset: 0x160 });
    const res160 = parseNdsHeader(rom160);
    expect(res160.valid).toBe(false);
    expect(res160.banner.present).toBe(false);
    expect(res160.banner.valid).toBe(false);
    expect(res160.banner.diagnostic).toBe(
      'Banner offset (0x00000160) is within header (< 0x0200).'
    );

    // Test offset 0x180 with synthetic banner placed there
    const banner = createSyntheticBanner({ version: 0x0001 });
    const total = 0x180 + banner.length;
    const rom180 = new Uint8Array(total);
    // Write header
    const synthHeader = createSyntheticHeader({ bannerOffset: 0x180, totalSize: total });
    rom180.set(synthHeader.subarray(0, 0x160), 0);
    // Place valid synthetic banner at 0x180
    rom180.set(banner, 0x180);

    const res180 = parseNdsHeader(rom180);
    expect(res180.ok).toBe(true);
    expect(res180.valid).toBe(false);
    expect(res180.banner.present).toBe(false);
    expect(res180.banner.valid).toBe(false);
    expect(res180.banner.diagnostic).toBe(
      'Banner offset (0x00000180) is within header (< 0x0200).'
    );
    expect(res180.validationErrors).toContain(
      'Banner offset (0x00000180) is within header (< 0x0200).'
    );

    // Test boundary at 0x1FF
    const rom1ff = createSyntheticHeader({ bannerOffset: 0x1ff });
    const res1ff = parseNdsHeader(rom1ff);
    expect(res1ff.valid).toBe(false);
    expect(res1ff.banner.present).toBe(false);
    expect(res1ff.banner.valid).toBe(false);
    expect(res1ff.banner.diagnostic).toBe(
      'Banner offset (0x000001FF) is within header (< 0x0200).'
    );

    // Test valid offset at 0x200
    const rom200 = createSyntheticHeader({ bannerOffset: 0x200, includeBanner: true });
    const res200 = parseNdsHeader(rom200);
    expect(res200.ok).toBe(true);
    expect(res200.valid).toBe(true);
    expect(res200.banner.present).toBe(true);
    expect(res200.banner.valid).toBe(true);
  });

  it('supports separate bounded banner slice with options.bannerBytes', () => {
    const bannerOffset = 0x4000;
    const banner = createSyntheticBanner({
      version: 0x0001,
      titles: {
        english: 'Custom Game\nPublisher',
      },
    });
    const headerBytes = createSyntheticHeader({
      bannerOffset,
      totalRomSize: 64 * 1024 * 1024,
    });

    // Pass header slice (0x200 bytes) and separate banner slice (0x840 bytes)
    const result = parseNdsHeader(headerBytes.subarray(0, HEADER_SIZE), {
      bannerBytes: banner,
      fileSize: 64 * 1024 * 1024,
    });

    expect(result.ok).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.banner.present).toBe(true);
    expect(result.banner.valid).toBe(true);
    expect(result.banner.offset).toBe(0x4000);
    expect(result.banner.version).toBe(0x0001);
    expect(result.banner.crc.v1.valid).toBe(true);
    expect(result.banner.titles.english.lines).toEqual(['Custom Game', 'Publisher']);
  });

  it('bounds check against real fileSize when banner offset is beyond fileSize', () => {
    const headerBytes = createSyntheticHeader({
      bannerOffset: 0x04000000, // 64 MB
    });

    // File is only 32 MB
    const result = parseNdsHeader(headerBytes.subarray(0, HEADER_SIZE), {
      bannerBytes: null,
      fileSize: 32 * 1024 * 1024,
    });

    expect(result.ok).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.banner.present).toBe(false);
    expect(result.banner.valid).toBe(false);
    expect(result.banner.diagnostic).toBe(
      'Banner offset (0x04000000) is beyond end of file (size: 0x02000000).'
    );
  });

  it('verifies v2, v3, and v103 banner CRCs when applicable', () => {
    // Version 2 banner (includes v1 and v2 CRCs, Chinese title space up to 0x940)
    const v2Banner = createSyntheticBanner({ version: 0x0002 });
    expect(v2Banner.length).toBe(0x940);

    const v2Rom = new Uint8Array(0x200 + v2Banner.length);
    v2Rom.set(createSyntheticHeader({ bannerOffset: 0x200, totalSize: v2Rom.length }), 0);
    v2Rom.set(v2Banner, 0x200);

    const v2Result = parseNdsHeader(v2Rom);
    expect(v2Result.ok).toBe(true);
    expect(v2Result.banner.present).toBe(true);
    expect(v2Result.banner.version).toBe(0x0002);
    expect(v2Result.banner.crc.v1.valid).toBe(true);
    expect(v2Result.banner.crc.v2.applicable).toBe(true);
    expect(v2Result.banner.crc.v2.valid).toBe(true);

    // Version 3 banner
    const v3Banner = createSyntheticBanner({ version: 0x0003 });
    expect(v3Banner.length).toBe(0x0a40);
    const v3Rom = new Uint8Array(0x200 + v3Banner.length);
    v3Rom.set(createSyntheticHeader({ bannerOffset: 0x200, totalSize: v3Rom.length }), 0);
    v3Rom.set(v3Banner, 0x200);

    const v3Result = parseNdsHeader(v3Rom);
    expect(v3Result.banner.crc.v3.applicable).toBe(true);
    expect(v3Result.banner.crc.v3.valid).toBe(true);

    // Version 103h banner
    const v103Banner = createSyntheticBanner({ version: 0x0103 });
    expect(v103Banner.length).toBe(0x23c0);
    const v103Rom = new Uint8Array(0x200 + v103Banner.length);
    v103Rom.set(createSyntheticHeader({ bannerOffset: 0x200, totalSize: v103Rom.length }), 0);
    v103Rom.set(v103Banner, 0x200);

    const v103Result = parseNdsHeader(v103Rom);
    expect(v103Result.banner.crc.v103.applicable).toBe(true);
    expect(v103Result.banner.crc.v103.valid).toBe(true);
  });
});
