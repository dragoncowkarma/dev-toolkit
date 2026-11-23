/**
 * Maximum input size in bytes to bound memory consumption (64 KB).
 */
export const MAX_INPUT_BYTES = 64 * 1024;

/**
 * Strips whitespace, colons, hyphens, and commas from a string.
 * @param {string} value
 * @returns {string}
 */
function cleanHexString(value) {
  return value.replace(/0x/gi, '').replace(/[\s,:-]/g, '');
}

/**
 * Parses a hexadecimal string into a Uint8Array.
 * @param {string} hex - The hex string to parse.
 * @returns {Uint8Array} The parsed byte array.
 * @throws {TypeError|Error} When input is invalid or exceeds max size.
 */
export function parseHexString(hex) {
  if (typeof hex !== 'string') {
    throw new TypeError('Input must be a string.');
  }
  const cleaned = cleanHexString(hex);
  if (cleaned.length === 0) {
    return new Uint8Array(0);
  }
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) {
    throw new Error('Invalid hexadecimal input: contains non-hex characters.');
  }
  if (cleaned.length % 2 !== 0) {
    throw new Error('Invalid hexadecimal input: odd number of digits.');
  }
  const byteLength = cleaned.length / 2;
  if (byteLength > MAX_INPUT_BYTES) {
    throw new Error(`Input exceeds maximum size limit of ${MAX_INPUT_BYTES} bytes.`);
  }
  const bytes = new Uint8Array(byteLength);
  for (let i = 0; i < byteLength; i++) {
    bytes[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Parses a Base64 string into a Uint8Array.
 * @param {string} base64 - The Base64 string to parse.
 * @returns {Uint8Array} The parsed byte array.
 * @throws {TypeError|Error} When input is invalid or exceeds max size.
 */
export function parseBase64String(base64) {
  if (typeof base64 !== 'string') {
    throw new TypeError('Input must be a string.');
  }
  const cleaned = base64.replace(/\s/g, '');
  if (cleaned.length === 0) {
    return new Uint8Array(0);
  }
  if (cleaned.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) {
    throw new Error('Invalid Base64 input. Please check for typos or missing characters.');
  }
  let padding = 0;
  if (cleaned.endsWith('==')) {
    padding = 2;
  } else if (cleaned.endsWith('=')) {
    padding = 1;
  }
  const decodedLength = (cleaned.length / 4) * 3 - padding;
  if (decodedLength > MAX_INPUT_BYTES) {
    throw new Error(`Input exceeds maximum size limit of ${MAX_INPUT_BYTES} bytes.`);
  }
  try {
    const binary = atob(cleaned);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    throw new Error('Invalid Base64 input. Please check for typos or missing characters.');
  }
}

/**
 * Reads the initial bytes of a File/Blob up to maxBytes.
 * @param {File|Blob} file - The file to read.
 * @param {number} [maxBytes=MAX_INPUT_BYTES] - Maximum bytes to read.
 * @returns {Promise<Uint8Array>}
 */
export function readFileHeaderBytes(file, maxBytes = MAX_INPUT_BYTES) {
  return new Promise((resolve, reject) => {
    const slice = file.slice(0, maxBytes);
    const reader = new FileReader();
    reader.onload = () => {
      const arrayBuffer = /** @type {ArrayBuffer} */ (reader.result);
      resolve(new Uint8Array(arrayBuffer));
    };
    reader.onerror = () => reject(new Error('Failed to read the selected file.'));
    reader.readAsArrayBuffer(slice);
  });
}

/**
 * Formats a single byte as two-digit uppercase hex.
 * @param {number} byte
 * @returns {string}
 */
export function toHexByte(byte) {
  return byte.toString(16).padStart(2, '0').toUpperCase();
}

/**
 * Inspects a Unix compress (.Z) header.
 *
 * Header format (3 bytes):
 * - Byte 0: Magic byte 1 (0x1F)
 * - Byte 1: Magic byte 2 (0x9D)
 * - Byte 2: Flags byte:
 *   - Bit 7: Block mode flag (1 = block mode enabled, 0 = disabled)
 *   - Bits 6-5: Reserved bits (must be zero)
 *   - Bits 4-0: Maximum code bits (valid range: 9 to 16)
 *
 * @param {Uint8Array|number[]} bytes - Raw stream bytes.
 * @param {object|number} [options={}] - Options object or total stream size in bytes.
 * @param {number} [options.totalBytes] - Total stream size in bytes if inspecting a prefix/slice.
 * @returns {object} The inspected header details.
 * @throws {Error} If truncated, magic is wrong, reserved bits are non-zero, or max bits invalid.
 */
export function inspectCompressZHeader(bytes, options = {}) {
  if (!bytes || bytes.length < 3) {
    const received = bytes ? bytes.length : 0;
    throw new Error(
      `Truncated input: Unix compress (.Z) header requires at least 3 bytes (received ${received}).`
    );
  }

  if (bytes.length > MAX_INPUT_BYTES) {
    throw new Error(`Input exceeds maximum size limit of ${MAX_INPUT_BYTES} bytes.`);
  }

  const magic0 = bytes[0];
  const magic1 = bytes[1];
  if (magic0 !== 0x1f || magic1 !== 0x9d) {
    const receivedHex = `${toHexByte(magic0)} ${toHexByte(magic1)}`;
    throw new Error(`Invalid magic bytes: expected 1F 9D, received ${receivedHex}.`);
  }

  const byte3 = bytes[2];
  const reservedBits = (byte3 & 0x60) >> 5;
  if ((byte3 & 0x60) !== 0) {
    throw new Error(
      `Invalid header: reserved bits must be zero (received 0b${reservedBits.toString(2)}).`
    );
  }

  const maxBits = byte3 & 0x1f;
  if (maxBits < 9 || maxBits > 16) {
    throw new Error(
      `Invalid maximum code bits: ${maxBits}. Unix compress (.Z) max bits must be between 9 and 16.`
    );
  }

  const blockMode = (byte3 & 0x80) !== 0;
  const maxCodes = 1 << maxBits;

  const rawTotal =
    typeof options === 'object' && options !== null && typeof options.totalBytes === 'number'
      ? options.totalBytes
      : typeof options === 'number'
        ? options
        : bytes.length;
  const totalBytes = Math.max(bytes.length, rawTotal);
  const payloadBytes = Math.max(0, totalBytes - 3);

  return {
    magic: '1F 9D',
    magicBytes: [0x1f, 0x9d],
    byte3,
    byte3Hex: `0x${toHexByte(byte3)}`,
    byte3Binary: byte3.toString(2).padStart(8, '0'),
    maxBits,
    maxCodes,
    blockMode,
    reservedBits,
    totalBytes,
    payloadBytes,
  };
}

/**
 * Formats a byte count into a human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}
