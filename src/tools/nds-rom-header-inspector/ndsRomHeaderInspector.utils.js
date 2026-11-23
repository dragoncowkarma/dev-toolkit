/**
 * Minimum byte length required for a valid Nintendo DS ROM header (0x000 - 0x15F).
 */
export const MIN_HEADER_SIZE = 0x160;

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
 *
 * @param {number} value - The numeric value.
 * @param {number} [digits=4] - Minimum number of hex characters.
 * @returns {string} Hex representation prefixed with '0x'.
 */
export function formatHex(value, digits = 4) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '0x0000';
  }
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(digits, '0')}`;
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
 * Creates a synthetic 352-byte (0x160) Nintendo DS ROM header for testing or preview.
 *
 * @param {object} [overrides={}] - Optional field overrides.
 * @returns {Uint8Array} The synthetic header byte buffer.
 */
export function createSyntheticHeader(overrides = {}) {
  const bytes = new Uint8Array(MIN_HEADER_SIZE);
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

  view.setUint32(0x080, overrides.totalRomSize ?? 0x02000000, true);

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
    const chipSizeBytes = deviceCapacity > 0 ? (128 * 1024) * (1 << deviceCapacity) : 0;

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

    const overallValid = logoCrcValid && headerCrcValid && armValidation.valid;

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
      chipSizeBytes,
      chipSizeFormatted: chipSizeBytes > 0 ? formatBytes(chipSizeBytes) : 'N/A',
      romVersion,
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
      validationErrors: armValidation.errors,
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
