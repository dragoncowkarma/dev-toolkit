/**
 * Minimum byte length required for a valid Nintendo DS ROM header (0x000 - 0x15F).
 */
export const MIN_HEADER_SIZE = 0x160;

/**
 * Standard CCITT CRC-16 polynomial: x^16 + x^12 + x^5 + 1.
 */
export const CRC16_POLYNOMIAL = 0x1021;

/**
 * Initial seed for Nintendo DS CRC-16 calculations.
 */
export const CRC16_INITIAL_SEED = 0xffff;

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
 * Calculates a 16-bit CRC checksum (CCITT / XMODEM) across a byte array slice.
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
    crc ^= (data[i] << 8);
    for (let b = 0; b < 8; b++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ CRC16_POLYNOMIAL) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
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
