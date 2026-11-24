/**
 * Minimum byte length required for a valid Nintendo DS ROM header (0x000 - 0x15F).
 */
export const MIN_HEADER_SIZE = 0x160;

/**
 * Minimum byte length required for a version 1 Nintendo DS icon/title banner block.
 */
export const MIN_BANNER_SIZE = 0x840;

/**
 * Standard NDS banner versions and human-readable names.
 * @type {Record<number, string>}
 */
export const BANNER_VERSIONS = Object.freeze({
  0x0001: 'Version 1 (Original NDS)',
  0x0002: 'Version 2 (+ Chinese)',
  0x0003: 'Version 3 (+ Korean)',
  0x0103: 'Version 103h (DSi Animated)',
});

/**
 * Supported language title slots in NDS banners (0x100 bytes each).
 */
export const BANNER_LANGUAGES = Object.freeze([
  { id: 'japanese', label: 'Japanese', offset: 0x240 },
  { id: 'english', label: 'English', offset: 0x340 },
  { id: 'french', label: 'French', offset: 0x440 },
  { id: 'german', label: 'German', offset: 0x540 },
  { id: 'italian', label: 'Italian', offset: 0x640 },
  { id: 'spanish', label: 'Spanish', offset: 0x740 },
]);

/**
 * Standard BIOS CRC-16 (CRC-16/MODBUS) reflected polynomial: 0xA001.
 */
export const CRC16_POLYNOMIAL = 0xa001;

/**
 * Initial seed for Nintendo DS CRC-16 calculations.
 */
export const CRC16_INITIAL_SEED = 0xffff;

/**
 * Standard compressed 156-byte Nintendo logo required in ROM headers (0x0C0 - 0x15B).
 * Used across official Nintendo DS cartridges; always calculates to CRC-16 0xCF56.
 */
export const STANDARD_NINTENDO_LOGO = new Uint8Array([
  0x24, 0xff, 0xae, 0x51, 0x69, 0x9a, 0xa2, 0x21, 0x3d, 0x84, 0x82, 0x0a, 0x84, 0xe4, 0x09, 0xad,
  0x11, 0x24, 0x8b, 0x98, 0xc0, 0x81, 0x7f, 0x21, 0xa3, 0x52, 0xbe, 0x19, 0x93, 0x09, 0xce, 0x20,
  0x10, 0x46, 0x4a, 0x4a, 0xf8, 0x27, 0x31, 0xec, 0x58, 0xc7, 0xe8, 0x33, 0x82, 0xe3, 0xce, 0xbf,
  0x85, 0xf4, 0xdf, 0x94, 0xce, 0x4b, 0x09, 0xc1, 0x94, 0x56, 0x8a, 0xc0, 0x13, 0x72, 0xa7, 0xfc,
  0x9f, 0x84, 0x4d, 0x73, 0xa3, 0xca, 0x9a, 0x61, 0x58, 0x97, 0xa3, 0x27, 0xfc, 0x03, 0x98, 0x76,
  0x23, 0x1d, 0xc7, 0x61, 0x03, 0x04, 0xae, 0x56, 0xbf, 0x38, 0x84, 0x00, 0x40, 0xa7, 0x0e, 0xfd,
  0xff, 0x52, 0xfe, 0x03, 0x6f, 0x95, 0x30, 0xf1, 0x97, 0xfb, 0xc0, 0x85, 0x60, 0xd6, 0x80, 0x25,
  0xa9, 0x63, 0xbe, 0x03, 0x01, 0x4e, 0x38, 0xe2, 0xf9, 0xa2, 0x34, 0xff, 0xbb, 0x3e, 0x03, 0x44,
  0x78, 0x00, 0x90, 0xcb, 0x88, 0x11, 0x3a, 0x94, 0x65, 0xc0, 0x7c, 0x63, 0x87, 0xf0, 0x3c, 0xaf,
  0xd6, 0x25, 0xe4, 0x8b, 0x38, 0x0a, 0xac, 0x72, 0x21, 0xd4, 0xf8, 0x07,
]);

/**
 * Known Nintendo DS unit codes.
 * @type {Record<number, string>}
 */
export const UNIT_CODES = Object.freeze({
  0x00: 'Nintendo DS (NDS)',
  0x02: 'Nintendo DS + Nintendo DSi',
  0x03: 'Nintendo DSi',
});

/**
 * Selected common Nintendo DS maker codes.
 * @type {Record<string, string>}
 */
export const MAKER_CODES = Object.freeze({
  '01': 'Nintendo',
  '08': 'Capcom',
  '13': 'Electronic Arts',
  '18': 'Hudson Soft',
  '20': 'KSS',
  '41': 'Ubisoft',
  '4f': 'Eidos',
  '51': 'Acclaim',
  '52': 'Activision',
  '54': 'Konami',
  '69': 'Electronic Arts',
  '70': 'Infogrames / Atari',
  '78': 'THQ',
  '7d': 'Midway',
  '8p': 'Sega',
  '99': 'Marvelous Entertainment',
  'a4': 'Konami',
  'af': 'Bandai Namco Games',
  'b0': 'Acclaim',
  'eb': 'Atlus',
});

/**
 * Minimum supported Nintendo DS ROM device capacity exponent (0x00 = 128 KiB).
 * Reference: GBATEK NDS Cartridge Header (014h - Devicecapacity: Chipsize = 128KB SHL nn).
 */
export const MIN_DEVICE_CAPACITY = 0;

/**
 * Maximum supported Nintendo DS ROM device capacity exponent (0x0F = 4 GB).
 * Reference: GBATEK NDS Cartridge Header (014h - Devicecapacity: Chipsize = 128KB SHL nn).
 * Retail Nintendo DS cartridges ranged up to 512 MB (0x0C, e.g. Pokémon Black 2/White 2).
 * The Nintendo DS 32-bit cartridge bus addressing space permits up to 4 GB (0x0F = 128 KiB * 2^15).
 * Values greater than 0x0F exceed 32-bit hardware bus addressing, and values >= 31
 * cause 32-bit signed shift overflow in JavaScript bitwise operations (1 << 31 yields
 * a negative number, and 1 << 32 wraps modulo 32).
 */
export const MAX_DEVICE_CAPACITY = 0x0f;

/**
 * Calculates ROM chip capacity in bytes from the device capacity exponent (header offset 0x014).
 * Uses exponential scaling (2 ** capacity) instead of bitwise left shifts to prevent 32-bit
 * signed integer overflow on capacity >= 31 and wrap-around on capacity >= 32.
 *
 * Reference: GBATEK NDS Cartridge Header (014h - Devicecapacity: Chipsize = 128KB SHL nn).
 *
 * @param {number} capacity - The device capacity exponent byte from offset 0x014.
 * @returns {{ bytes: number|null, formatted: string, valid: boolean }} Capacity result details.
 */
export function calculateDeviceCapacity(capacity) {
  if (
    typeof capacity !== 'number' ||
    !Number.isInteger(capacity) ||
    capacity < MIN_DEVICE_CAPACITY ||
    capacity > MAX_DEVICE_CAPACITY
  ) {
    return {
      bytes: null,
      formatted: 'Unknown',
      valid: false,
    };
  }

  const bytes = 128 * 1024 * (2 ** capacity);
  return {
    bytes,
    formatted: formatBytes(bytes),
    valid: true,
  };
}

/**
 * Calculates a 16-bit CRC checksum using the Nintendo DS BIOS CRC-16 algorithm
 * (CRC-16/MODBUS: reflected poly 0xA001, seed 0xFFFF, byte XOR into low byte).
 *
 * @param {Uint8Array} data - The raw byte data.
 * @param {number} [start=0] - The starting byte index.
 * @param {number} [length=data.length - start] - The number of bytes to include.
 * @param {number} [seed=CRC16_INITIAL_SEED] - Initial CRC seed (0xFFFF).
 * @returns {number} The 16-bit CRC integer (0x0000 - 0xFFFF).
 */
export function calculateCrc16(
  data,
  start = 0,
  length = data.length - start,
  seed = CRC16_INITIAL_SEED
) {
  let crc = seed & 0xffff;
  const end = Math.min(data.length, start + length);
  for (let i = start; i < end; i++) {
    crc ^= data[i];
    for (let b = 0; b < 8; b++) {
      if (crc & 1) {
        crc = ((crc >> 1) ^ CRC16_POLYNOMIAL) & 0xffff;
      } else {
        crc = (crc >> 1) & 0xffff;
      }
    }
  }
  return crc;
}

/**
 * Formats a number as a hexadecimal string with uppercase letters and optional zero-padding.
 * Preserves full values exceeding 32 bits (0xFFFFFFFF) without 32-bit truncation wrapping.
 *
 * @param {number} value - The numeric value.
 * @param {number} [digits=4] - Minimum number of hex characters.
 * @returns {string} Hex representation prefixed with '0x'.
 */
export function formatHex(value, digits = 4) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '0x0000';
  }
  if (value < 0) {
    return `0x${(value >>> 0).toString(16).toUpperCase().padStart(digits, '0')}`;
  }
  return `0x${Math.floor(value).toString(16).toUpperCase().padStart(digits, '0')}`;
}

/**
 * Formats a byte size into human-readable string (e.g. "32.0 MB").
 *
 * @param {number} bytes - Number of bytes.
 * @returns {string} Formatted size string.
 */
export function formatBytes(bytes) {
  if (typeof bytes !== 'number' || Number.isNaN(bytes) || bytes < 0) {
    return '0 B';
  }
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let val = bytes / 1024;
  let unitIndex = 0;
  while (val >= 1024 && unitIndex < units.length - 1) {
    val /= 1024;
    unitIndex += 1;
  }
  return `${val.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Cleans and converts a hex string into a Uint8Array.
 *
 * @param {string} text - Hex string, may include spaces, colons, or 0x prefixes.
 * @returns {Uint8Array|null} Parsed byte array or null if invalid.
 */
export function hexToBytes(text) {
  if (typeof text !== 'string') return null;
  const cleaned = text.replace(/0x|\s+|[,:_]/gi, '');
  if (cleaned.length === 0 || cleaned.length % 2 !== 0) return null;
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) return null;

  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < cleaned.length; i += 2) {
    const val = parseInt(cleaned.slice(i, i + 2), 16);
    if (Number.isNaN(val)) return null;
    bytes[i / 2] = val;
  }
  return bytes;
}

/**
 * Decodes a Base64 string into a Uint8Array.
 *
 * @param {string} text - Base64 string.
 * @returns {Uint8Array|null} Decoded byte array or null if invalid.
 */
export function base64ToBytes(text) {
  if (typeof text !== 'string') return null;
  const cleaned = text.trim().replace(/\s+/g, '');
  if (cleaned.length === 0) return null;
  try {
    const binary = atob(cleaned);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Converts various input forms (Uint8Array, ArrayBuffer, hex or Base64 string) into a Uint8Array.
 *
 * @param {Uint8Array|ArrayBuffer|string} input - Raw input data.
 * @param {'auto'|'hex'|'base64'} [format='auto'] - Preferred string format hint.
 * @returns {Uint8Array|null} Byte array or null if unparseable.
 */
export function parseInputToBytes(input, format = 'auto') {
  if (!input) return null;
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  if (typeof input !== 'string') return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  if (format === 'hex') {
    return hexToBytes(trimmed);
  }
  if (format === 'base64') {
    return base64ToBytes(trimmed);
  }

  // Auto-detection:
  const looksLikeHex =
    trimmed.startsWith('0x') ||
    trimmed.includes(' ') ||
    trimmed.includes(':') ||
    /^[0-9a-fA-F\s:,]+$/.test(trimmed);

  if (looksLikeHex) {
    const hexResult = hexToBytes(trimmed);
    if (hexResult && hexResult.length > 0) return hexResult;
  }

  // Try base64
  const b64Result = base64ToBytes(trimmed);
  if (b64Result && b64Result.length > 0) return b64Result;

  // Final fallback to hex
  if (!looksLikeHex) {
    const hexResult = hexToBytes(trimmed);
    if (hexResult && hexResult.length > 0) return hexResult;
  }

  return null;
}

/**
 * Reads an ASCII string of given length from a byte array.
 *
 * @param {Uint8Array} bytes - Source byte buffer.
 * @param {number} start - Offset to start reading.
 * @param {number} length - Number of bytes to read.
 * @returns {string} Cleaned ASCII string with null characters stripped.
 */
function readAscii(bytes, start, length) {
  let str = '';
  const end = Math.min(bytes.length, start + length);
  for (let i = start; i < end; i++) {
    const byte = bytes[i];
    if (byte === 0) continue;
    str += String.fromCharCode(byte);
  }
  return str.trim();
}

/**
 * Validates ARM9 and ARM7 ROM offsets against header boundaries and total ROM size.
 *
 * @param {object} params - Offsets, sizes, and ROM capacity.
 * @param {number} params.arm9Offset - ARM9 ROM offset.
 * @param {number} params.arm9Size - ARM9 binary size.
 * @param {number} params.arm7Offset - ARM7 ROM offset.
 * @param {number} params.arm7Size - ARM7 binary size.
 * @param {number} params.totalRomSize - Declared total ROM size.
 * @returns {{ valid: boolean, arm9Valid: boolean, arm7Valid: boolean, errors: string[] }}
 */
export function validateArmOffsets({
  arm9Offset,
  arm9Size,
  arm7Offset,
  arm7Size,
  totalRomSize,
}) {
  const errors = [];
  let arm9Valid = true;
  let arm7Valid = true;

  // 1. Lower bound check: ARM payloads cannot reside inside the cartridge header (< 0x160).
  if (arm9Offset < MIN_HEADER_SIZE) {
    arm9Valid = false;
    const headerHex = formatHex(MIN_HEADER_SIZE, 4);
    errors.push(
      `ARM9 ROM offset (${formatHex(arm9Offset, 8)}) is within header (< ${headerHex}).`
    );
  }

  if (arm7Offset < MIN_HEADER_SIZE) {
    arm7Valid = false;
    const headerHex = formatHex(MIN_HEADER_SIZE, 4);
    errors.push(
      `ARM7 ROM offset (${formatHex(arm7Offset, 8)}) is within header (< ${headerHex}).`
    );
  }

  // 2. Upper bound check: If total ROM size is known (> 0), payload must not exceed total size.
  if (totalRomSize > 0) {
    if (arm9Offset + arm9Size > totalRomSize) {
      arm9Valid = false;
      const endOffset = formatHex(arm9Offset + arm9Size, 8);
      errors.push(
        `ARM9 binary extends beyond total ROM size (${endOffset} > ${formatHex(totalRomSize, 8)}).`
      );
    }

    if (arm7Offset + arm7Size > totalRomSize) {
      arm7Valid = false;
      const endOffset = formatHex(arm7Offset + arm7Size, 8);
      errors.push(
        `ARM7 binary extends beyond total ROM size (${endOffset} > ${formatHex(totalRomSize, 8)}).`
      );
    }
  }

  return {
    valid: arm9Valid && arm7Valid,
    arm9Valid,
    arm7Valid,
    errors,
  };
}

/**
 * Decodes a UTF-16LE string from byte data up to a null terminator (0x0000) or max length,
 * and splits it on newlines into lines.
 *
 * @param {Uint8Array} bytes - Raw byte array.
 * @param {number} start - Offset to start reading.
 * @param {number} [length=0x100] - Number of bytes to read (default 256 / 0x100).
 * @returns {{ raw: string, lines: string[] }} Decoded raw string and lines.
 */
export function decodeUtf16LeTitle(bytes, start, length = 0x100) {
  if (!bytes || start >= bytes.length) {
    return { raw: '', lines: [] };
  }
  const end = Math.min(bytes.length, start + length);
  const slice = bytes.subarray(start, end);
  const rawDecoded = new TextDecoder('utf-16le').decode(slice);
  const nullIdx = rawDecoded.indexOf('\0');
  const clean = (nullIdx !== -1 ? rawDecoded.slice(0, nullIdx) : rawDecoded).trim();
  const lines = clean.length > 0 ? clean.split(/\r?\n/) : [];
  return {
    raw: clean,
    lines,
  };
}

/**
 * Encodes a string into UTF-16LE bytes, zero-padded up to maxLength.
 *
 * @param {string} str - Input text string.
 * @param {number} [maxLength=0x100] - Total buffer size in bytes.
 * @returns {Uint8Array} Byte buffer with encoded UTF-16LE characters.
 */
export function encodeUtf16Le(str, maxLength = 0x100) {
  const bytes = new Uint8Array(maxLength);
  const view = new DataView(bytes.buffer);
  const maxChars = Math.min(str.length, Math.floor(maxLength / 2) - 1);
  for (let i = 0; i < maxChars; i++) {
    view.setUint16(i * 2, str.charCodeAt(i), true);
  }
  return bytes;
}

/**
 * Creates a synthetic NDS ROM icon/title banner block for testing or preview.
 *
 * @param {object} [overrides={}] - Optional field overrides.
 * @returns {Uint8Array} Synthetic banner buffer.
 */
export function createSyntheticBanner(overrides = {}) {
  const version = overrides.version ?? 0x0001;
  const defaultSize =
    version >= 0x0103
      ? 0x23c0
      : version >= 0x0003
        ? 0x0a40
        : version >= 0x0002
          ? 0x0940
          : MIN_BANNER_SIZE;
  const size = overrides.size ?? defaultSize;
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);

  view.setUint16(0x000, version, true);

  const titles = overrides.titles ?? {
    japanese: 'マリオカートDS\n任天堂',
    english: 'Mario Kart DS\nNintendo',
    french: 'Mario Kart DS\nNintendo',
    german: 'Mario Kart DS\nNintendo',
    italian: 'Mario Kart DS\nNintendo',
    spanish: 'Mario Kart DS\nNintendo',
  };

  for (const lang of BANNER_LANGUAGES) {
    const text = titles[lang.id] ?? '';
    const encoded = encodeUtf16Le(text, 0x100);
    bytes.set(encoded, lang.offset);
  }

  // v1 CRC covers 0x020..0x83F (0x820 bytes = 2080 bytes)
  let v1Crc = calculateCrc16(bytes, 0x020, 0x820);
  if (overrides.badV1Crc) {
    v1Crc = (v1Crc ^ 0xffff) & 0xffff;
  }
  view.setUint16(0x002, overrides.v1Crc ?? v1Crc, true);

  // v2 CRC covers 0x020..0x93F (0x920 bytes = 2336 bytes)
  if (bytes.length >= 0x940) {
    let v2Crc = calculateCrc16(bytes, 0x020, 0x920);
    if (overrides.badV2Crc) {
      v2Crc = (v2Crc ^ 0xffff) & 0xffff;
    }
    view.setUint16(0x004, overrides.v2Crc ?? v2Crc, true);
  }

  // v3 CRC covers 0x020..0xA3F (0xA20 bytes = 2592 bytes)
  if (bytes.length >= 0x0a40) {
    let v3Crc = calculateCrc16(bytes, 0x020, 0x0a20);
    if (overrides.badV3Crc) {
      v3Crc = (v3Crc ^ 0xffff) & 0xffff;
    }
    view.setUint16(0x006, overrides.v3Crc ?? v3Crc, true);
  }

  // v103 CRC covers 0x1240..0x23BF (0x1180 bytes = 4480 bytes)
  if (bytes.length >= 0x23c0) {
    let v103Crc = calculateCrc16(bytes, 0x1240, 0x1180);
    if (overrides.badV103Crc) {
      v103Crc = (v103Crc ^ 0xffff) & 0xffff;
    }
    view.setUint16(0x008, overrides.v103Crc ?? v103Crc, true);
  }

  return bytes;
}

/**
 * Parses and verifies an NDS icon/title banner block from ROM bytes.
 *
 * @param {Uint8Array} bytes - Full ROM or buffer containing header and banner.
 * @param {number} bannerOffset - Header offset pointing to the banner.
 * @returns {object} Banner parsing result.
 */
export function parseNdsBanner(bytes, bannerOffset) {
  const offsetHex = formatHex(bannerOffset, 8);

  if (bannerOffset === 0) {
    return {
      present: false,
      offset: 0,
      offsetHex,
      version: null,
      versionHex: null,
      versionName: null,
      valid: true,
      diagnostic: 'Banner offset is 0x00000000 (no icon/title banner present).',
      crc: null,
      titles: null,
      titlesList: [],
    };
  }

  if (bannerOffset < MIN_HEADER_SIZE) {
    const minHex = formatHex(MIN_HEADER_SIZE, 4);
    return {
      present: false,
      offset: bannerOffset,
      offsetHex,
      version: null,
      versionHex: null,
      versionName: null,
      valid: false,
      diagnostic: `Banner offset (${offsetHex}) is within header (< ${minHex}).`,
      crc: null,
      titles: null,
      titlesList: [],
    };
  }

  if (bannerOffset >= bytes.length) {
    const sizeHex = formatHex(bytes.length, 8);
    return {
      present: false,
      offset: bannerOffset,
      offsetHex,
      version: null,
      versionHex: null,
      versionName: null,
      valid: false,
      diagnostic: `Banner offset (${offsetHex}) is beyond end of file (size: ${sizeHex}).`,
      crc: null,
      titles: null,
      titlesList: [],
    };
  }

  const available = bytes.length - bannerOffset;
  if (available < MIN_BANNER_SIZE) {
    const reqHex = `0x${MIN_BANNER_SIZE.toString(16)}`;
    return {
      present: false,
      offset: bannerOffset,
      offsetHex,
      version: null,
      versionHex: null,
      versionName: null,
      valid: false,
      diagnostic:
        `Truncated banner block: requires at least ${reqHex} bytes at offset ${offsetHex}, ` +
        `but only ${available} bytes available.`,
      crc: null,
      titles: null,
      titlesList: [],
    };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset + bannerOffset, available);
  const version = view.getUint16(0x000, true);
  const versionHex = formatHex(version, 4);
  const versionName = BANNER_VERSIONS[version] || null;

  if (!versionName) {
    return {
      present: true,
      offset: bannerOffset,
      offsetHex,
      version,
      versionHex,
      versionName: 'Unknown Version',
      valid: false,
      diagnostic:
        `Unknown banner version: ${versionHex} ` +
        `(expected 0x0001, 0x0002, 0x0003, or 0x0103).`,
      crc: null,
      titles: null,
      titlesList: [],
    };
  }

  // Stored CRC-16 fields
  const storedV1 = view.getUint16(0x002, true);
  const storedV2 = view.getUint16(0x004, true);
  const storedV3 = view.getUint16(0x006, true);
  const storedV103 = view.getUint16(0x008, true);

  // v1 CRC-16 check: 0x020..0x83F (0x820 = 2080 bytes)
  const actualV1 = calculateCrc16(bytes, bannerOffset + 0x020, 0x820);
  const v1Valid = storedV1 === actualV1;

  // v2 CRC-16 check: 0x020..0x93F (0x920 = 2336 bytes)
  let actualV2 = null;
  let v2Valid = null;
  const v2Applicable = version >= 0x0002 || (storedV2 !== 0 && available >= 0x940);
  if (available >= 0x940) {
    actualV2 = calculateCrc16(bytes, bannerOffset + 0x020, 0x920);
    if (v2Applicable) {
      v2Valid = storedV2 === actualV2;
    }
  } else if (v2Applicable) {
    v2Valid = false;
  }

  // v3 CRC-16 check: 0x020..0xA3F (0xA20 = 2592 bytes)
  let actualV3 = null;
  let v3Valid = null;
  const v3Applicable = version >= 0x0003 || (storedV3 !== 0 && available >= 0x0a40);
  if (available >= 0x0a40) {
    actualV3 = calculateCrc16(bytes, bannerOffset + 0x020, 0x0a20);
    if (v3Applicable) {
      v3Valid = storedV3 === actualV3;
    }
  } else if (v3Applicable) {
    v3Valid = false;
  }

  // v103 CRC-16 check: 0x1240..0x23BF (0x1180 = 4480 bytes)
  let actualV103 = null;
  let v103Valid = null;
  const v103Applicable = version >= 0x0103 || (storedV103 !== 0 && available >= 0x23c0);
  if (available >= 0x23c0) {
    actualV103 = calculateCrc16(bytes, bannerOffset + 0x1240, 0x1180);
    if (v103Applicable) {
      v103Valid = storedV103 === actualV103;
    }
  } else if (v103Applicable) {
    v103Valid = false;
  }

  const crcValid =
    v1Valid &&
    (!v2Applicable || v2Valid === true) &&
    (!v3Applicable || v3Valid === true) &&
    (!v103Applicable || v103Valid === true);

  // Decode multilingual titles
  const titles = {};
  const titlesList = [];
  for (const lang of BANNER_LANGUAGES) {
    const decoded = decodeUtf16LeTitle(bytes, bannerOffset + lang.offset, 0x100);
    const entry = {
      id: lang.id,
      label: lang.label,
      offset: lang.offset,
      offsetHex: formatHex(lang.offset, 4),
      raw: decoded.raw,
      lines: decoded.lines,
    };
    titles[lang.id] = entry;
    titlesList.push(entry);
  }

  return {
    present: true,
    offset: bannerOffset,
    offsetHex,
    version,
    versionHex,
    versionName,
    valid: crcValid,
    diagnostic: null,
    crc: {
      v1: {
        expected: storedV1,
        actual: actualV1,
        expectedHex: formatHex(storedV1, 4),
        actualHex: formatHex(actualV1, 4),
        valid: v1Valid,
        applicable: true,
        byteRange: '0x020 - 0x83F (2,080 B)',
      },
      v2: {
        expected: storedV2,
        actual: actualV2,
        expectedHex: formatHex(storedV2, 4),
        actualHex: actualV2 !== null ? formatHex(actualV2, 4) : 'N/A',
        valid: v2Valid,
        applicable: v2Applicable,
        byteRange: '0x020 - 0x93F (2,336 B)',
      },
      v3: {
        expected: storedV3,
        actual: actualV3,
        expectedHex: formatHex(storedV3, 4),
        actualHex: actualV3 !== null ? formatHex(actualV3, 4) : 'N/A',
        valid: v3Valid,
        applicable: v3Applicable,
        byteRange: '0x020 - 0xA3F (2,592 B)',
      },
      v103: {
        expected: storedV103,
        actual: actualV103,
        expectedHex: formatHex(storedV103, 4),
        actualHex: actualV103 !== null ? formatHex(actualV103, 4) : 'N/A',
        valid: v103Valid,
        applicable: v103Applicable,
        byteRange: '0x1240 - 0x23BF (4,480 B)',
      },
    },
    titles,
    titlesList,
  };
}

/**
 * Creates a synthetic 352-byte (0x160) Nintendo DS ROM header for testing or preview.
 * Optionally includes an icon/title banner block.
 *
 * @param {object} [overrides={}] - Optional field overrides.
 * @returns {Uint8Array} The synthetic header byte buffer.
 */
export function createSyntheticHeader(overrides = {}) {
  const includeBanner =
    overrides.includeBanner ??
    (Boolean(overrides.bannerOffset) || overrides.bannerTitles !== undefined);
  const bannerOffset = overrides.bannerOffset ?? (includeBanner ? 0x200 : 0);

  let bannerBytes = null;
  if (includeBanner) {
    bannerBytes = createSyntheticBanner({
      version: overrides.bannerVersion,
      titles: overrides.bannerTitles,
      badV1Crc: overrides.badBannerV1Crc || overrides.badBannerCrc,
      badV2Crc: overrides.badBannerV2Crc,
      badV3Crc: overrides.badBannerV3Crc,
      badV103Crc: overrides.badBannerV103Crc,
    });
  }

  const defaultTotal = bannerBytes ? bannerOffset + bannerBytes.length : MIN_HEADER_SIZE;
  const totalLength = Math.max(MIN_HEADER_SIZE, overrides.totalSize ?? defaultTotal);

  const bytes = new Uint8Array(totalLength);
  const view = new DataView(bytes.buffer);

  const title = (overrides.gameTitle ?? 'MARIO KART').padEnd(12, '\0').slice(0, 12);
  for (let i = 0; i < 12; i++) bytes[i] = title.charCodeAt(i);

  const code = (overrides.gameCode ?? 'AMKE').padEnd(4, '\0').slice(0, 4);
  for (let i = 0; i < 4; i++) bytes[0x00c + i] = code.charCodeAt(i);

  const maker = (overrides.makerCode ?? '01').padEnd(2, '\0').slice(0, 2);
  for (let i = 0; i < 2; i++) bytes[0x010 + i] = maker.charCodeAt(i);

  bytes[0x012] = overrides.unitCode ?? 0x00;
  bytes[0x014] = overrides.deviceCapacity ?? 0x08; // 32MB
  bytes[0x01e] = overrides.romVersion ?? 0x00;

  view.setUint32(0x020, overrides.arm9RomOffset ?? 0x4000, true);
  view.setUint32(0x024, overrides.arm9EntryAddress ?? 0x02000000, true);
  view.setUint32(0x028, overrides.arm9RamAddress ?? 0x02000000, true);
  view.setUint32(0x02c, overrides.arm9Size ?? 0x000a4000, true);

  view.setUint32(0x030, overrides.arm7RomOffset ?? 0x000a8000, true);
  view.setUint32(0x034, overrides.arm7EntryAddress ?? 0x02380000, true);
  view.setUint32(0x038, overrides.arm7RamAddress ?? 0x02380000, true);
  view.setUint32(0x03c, overrides.arm7Size ?? 0x00028000, true);

  // Icon/Title Banner offset at 0x068
  view.setUint32(0x068, bannerOffset, true);

  view.setUint32(0x080, overrides.totalRomSize ?? 0x02000000, true);

  // Copy banner bytes if provided
  if (bannerBytes && bannerOffset < bytes.length) {
    bytes.set(bannerBytes.subarray(0, bytes.length - bannerOffset), bannerOffset);
  }

  // Nintendo Logo (0x0C0 - 0x15B, 156 bytes)
  if (overrides.logoData) {
    bytes.set(overrides.logoData.subarray(0, 0x9c), 0x0c0);
  } else {
    bytes.set(STANDARD_NINTENDO_LOGO, 0x0c0);
  }

  // Logo CRC (0x0C0 - 0x15B)
  let logoCrc = calculateCrc16(bytes, 0x0c0, 0x9c);
  if (overrides.badLogoCrc) {
    logoCrc = (logoCrc ^ 0xffff) & 0xffff;
  }
  view.setUint16(0x15c, logoCrc, true);

  // Header CRC (0x000 - 0x15D)
  let headerCrc = calculateCrc16(bytes, 0x000, 0x15e);
  if (overrides.badHeaderCrc) {
    headerCrc = (headerCrc ^ 0xffff) & 0xffff;
  }
  view.setUint16(0x15e, headerCrc, true);

  return bytes;
}

/**
 * Converts a Uint8Array into a hex string formatted with spaces.
 *
 * @param {Uint8Array} bytes - Input byte array.
 * @returns {string} Hex string.
 */
export function bytesToHexString(bytes) {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    if (i > 0) hex += ' ';
    hex += bytes[i].toString(16).padStart(2, '0').toUpperCase();
  }
  return hex;
}

/**
 * Parses and verifies a Nintendo DS ROM header (0x000 - 0x15F).
 *
 * @param {Uint8Array|ArrayBuffer|string} input - ROM header bytes or Base64/Hex string.
 * @returns {object} Parsing result with { ok: true, ...fields } or { ok: false, error: string }.
 */
export function parseNdsHeader(input) {
  try {
    const bytes = parseInputToBytes(input);
    if (!bytes) {
      return {
        ok: false,
        error: 'No valid data provided. Please provide an NDS ROM file, Base64, or Hex bytes.',
      };
    }

    if (bytes.length < MIN_HEADER_SIZE) {
      return {
        ok: false,
        error:
          `Truncated ROM header: requires at least ${MIN_HEADER_SIZE} bytes ` +
          `(0x${MIN_HEADER_SIZE.toString(16)}), received ${bytes.length} bytes.`,
      };
    }

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    // Decode header fields
    const gameTitle = readAscii(bytes, 0x000, 12);
    const gameCode = readAscii(bytes, 0x00c, 4);
    const makerCode = readAscii(bytes, 0x010, 2);
    const makerCodeLower = makerCode.toLowerCase();
    const makerName = MAKER_CODES[makerCodeLower] || MAKER_CODES[makerCode] || 'Unknown Maker';

    const unitCode = view.getUint8(0x012);
    const unitCodeName = UNIT_CODES[unitCode] || `Unknown (${formatHex(unitCode, 2)})`;

    const deviceCapacity = view.getUint8(0x014);
    const capacityInfo = calculateDeviceCapacity(deviceCapacity);
    const chipSizeBytes = capacityInfo.bytes;
    const chipSizeFormatted = capacityInfo.formatted;

    const romVersion = view.getUint8(0x01e);

    // ARM9 fields
    const arm9RomOffset = view.getUint32(0x020, true);
    const arm9EntryAddress = view.getUint32(0x024, true);
    const arm9RamAddress = view.getUint32(0x028, true);
    const arm9Size = view.getUint32(0x02c, true);

    // ARM7 fields
    const arm7RomOffset = view.getUint32(0x030, true);
    const arm7EntryAddress = view.getUint32(0x034, true);
    const arm7RamAddress = view.getUint32(0x038, true);
    const arm7Size = view.getUint32(0x03c, true);

    // Banner offset at 0x068
    const bannerOffset = view.getUint32(0x068, true);
    const banner = parseNdsBanner(bytes, bannerOffset);

    // Total used ROM size at 0x080
    const totalRomSize = view.getUint32(0x080, true);

    // Nintendo Logo CRC-16 (0x15C) covers bytes 0x0C0 - 0x15B (156 bytes = 0x9C)
    const expectedLogoCrc = view.getUint16(0x15c, true);
    const actualLogoCrc = calculateCrc16(bytes, 0x0c0, 0x9c);
    const logoCrcValid = expectedLogoCrc === actualLogoCrc;

    // Header CRC-16 (0x15E) covers bytes 0x000 - 0x15D (350 bytes = 0x15E)
    const expectedHeaderCrc = view.getUint16(0x15e, true);
    const actualHeaderCrc = calculateCrc16(bytes, 0x000, 0x15e);
    const headerCrcValid = expectedHeaderCrc === actualHeaderCrc;

    // ARM offsets validation
    const armValidation = validateArmOffsets({
      arm9Offset: arm9RomOffset,
      arm9Size,
      arm7Offset: arm7RomOffset,
      arm7Size,
      totalRomSize,
    });

    const bannerErrors = [];
    if (!banner.valid) {
      if (banner.diagnostic) {
        bannerErrors.push(banner.diagnostic);
      } else if (banner.crc) {
        if (banner.crc.v1.valid === false) {
          bannerErrors.push(
            `Banner v1 CRC-16 mismatch: expected ${banner.crc.v1.expectedHex}, ` +
              `calculated ${banner.crc.v1.actualHex}.`
          );
        }
        if (banner.crc.v2.applicable && banner.crc.v2.valid === false) {
          bannerErrors.push(
            `Banner v2 CRC-16 mismatch: expected ${banner.crc.v2.expectedHex}, ` +
              `calculated ${banner.crc.v2.actualHex}.`
          );
        }
        if (banner.crc.v3.applicable && banner.crc.v3.valid === false) {
          bannerErrors.push(
            `Banner v3 CRC-16 mismatch: expected ${banner.crc.v3.expectedHex}, ` +
              `calculated ${banner.crc.v3.actualHex}.`
          );
        }
        if (banner.crc.v103.applicable && banner.crc.v103.valid === false) {
          bannerErrors.push(
            `Banner v103 CRC-16 mismatch: expected ${banner.crc.v103.expectedHex}, ` +
              `calculated ${banner.crc.v103.actualHex}.`
          );
        }
      }
    }

    const overallValid =
      logoCrcValid && headerCrcValid && armValidation.valid && banner.valid;

    return {
      ok: true,
      valid: overallValid,
      gameTitle: gameTitle || '(Empty Title)',
      gameCode: gameCode || '(Empty)',
      makerCode: makerCode || '(Empty)',
      makerName,
      unitCode,
      unitCodeName,
      deviceCapacity,
      deviceCapacityValid: capacityInfo.valid,
      chipSizeBytes,
      chipSizeFormatted,
      romVersion,
      bannerOffset,
      bannerOffsetHex: formatHex(bannerOffset, 8),
      banner,
      arm9: {
        romOffset: arm9RomOffset,
        entryAddress: arm9EntryAddress,
        ramAddress: arm9RamAddress,
        size: arm9Size,
        valid: armValidation.arm9Valid,
      },
      arm7: {
        romOffset: arm7RomOffset,
        entryAddress: arm7EntryAddress,
        ramAddress: arm7RamAddress,
        size: arm7Size,
        valid: armValidation.arm7Valid,
      },
      totalRomSize,
      totalRomSizeFormatted: formatBytes(totalRomSize),
      logoCrc: {
        expected: expectedLogoCrc,
        actual: actualLogoCrc,
        expectedHex: formatHex(expectedLogoCrc, 4),
        actualHex: formatHex(actualLogoCrc, 4),
        valid: logoCrcValid,
      },
      headerCrc: {
        expected: expectedHeaderCrc,
        actual: actualHeaderCrc,
        expectedHex: formatHex(expectedHeaderCrc, 4),
        actualHex: formatHex(actualHeaderCrc, 4),
        valid: headerCrcValid,
      },
      armOffsetsValid: armValidation.valid,
      armOffsets: armValidation,
      validationErrors: [...armValidation.errors, ...bannerErrors],
      bufferSize: bytes.length,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to inspect NDS ROM header.',
    };
  }
}

/**
 * Reads a File object and returns its raw ArrayBuffer.
 *
 * @param {File|Blob} file - The file to read.
 * @returns {Promise<ArrayBuffer>} Promise resolving to ArrayBuffer.
 */
export function fileToArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No file provided.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      resolve(/** @type {ArrayBuffer} */ (reader.result));
    };
    reader.onerror = () => reject(new Error('Failed to read the selected file.'));
    reader.readAsArrayBuffer(file);
  });
}
