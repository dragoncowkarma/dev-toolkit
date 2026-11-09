export const MAX_INPUT_BYTES = 1_000_000;
const SIZE_LIMIT_MESSAGE =
  `Input is too long. Limit input to ${MAX_INPUT_BYTES.toLocaleString()} bytes.`;

/**
 * Converts text or hexadecimal bytes into a byte array for checksum calculation.
 * Text input is bounded by `MAX_INPUT_BYTES` so the synchronous crc8/crc16/crc32
 * bit-by-bit loops cannot stall the main thread on an oversized paste.
 * @param {string} input
 * @param {'text'|'hex'} mode
 * @returns {Uint8Array}
 * @throws {Error} When input is invalid or exceeds the supported size.
 */
export function inputToBytes(input, mode) {
  if (typeof input !== 'string') {
    throw new TypeError('Input must be a string.');
  }

  // Cheap pre-check: every UTF-8 character is at least 1 byte, so this
  // rejects huge inputs before paying for a full TextEncoder().encode() pass.
  if (input.length > MAX_INPUT_BYTES) {
    throw new Error(SIZE_LIMIT_MESSAGE);
  }

  if (mode === 'text') {
    const encoded = new TextEncoder().encode(input);
    if (encoded.byteLength > MAX_INPUT_BYTES) {
      throw new Error(SIZE_LIMIT_MESSAGE);
    }
    return encoded;
  }

  const cleaned = input.replace(/\s/g, '');
  if (cleaned.length % 2 !== 0) {
    throw new Error('Hex input must contain an even number of characters.');
  }
  if (!/^[0-9a-f]*$/i.test(cleaned)) {
    throw new Error('Hex input may contain only hexadecimal characters.');
  }

  const bytes = new Uint8Array(cleaned.length / 2);
  for (let index = 0; index < cleaned.length; index += 2) {
    bytes[index / 2] = Number.parseInt(cleaned.slice(index, index + 2), 16);
  }
  return bytes;
}

/**
 * Calculates CRC-8/SMBus (also called CRC-8/ATM) using polynomial 0x07.
 * @param {Uint8Array} bytes
 * @returns {number}
 */
export function crc8(bytes) {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x80) !== 0 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
  }
  return crc;
}

/**
 * Calculates CRC-16/CCITT-FALSE using polynomial 0x1021 and initial value 0xffff.
 * @param {Uint8Array} bytes
 * @returns {number}
 */
export function crc16CcittFalse(bytes) {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

/**
 * Calculates reflected CRC-32/IEEE 802.3 using polynomial 0xedb88320.
 * @param {Uint8Array} bytes
 * @returns {number}
 */
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Calculates Adler-32 as defined by RFC 1950.
 * @param {Uint8Array} bytes
 * @returns {number}
 */
export function adler32(bytes) {
  const modulus = 65521;
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % modulus;
    b = (b + a) % modulus;
  }
  return ((b << 16) | a) >>> 0;
}

/**
 * Formats a checksum number as uppercase, zero-padded hexadecimal.
 * @param {number} value
 * @param {number} width
 * @returns {string}
 */
export function formatHex(value, width) {
  return value.toString(16).toUpperCase().padStart(width, '0');
}

export const checksumAlgorithms = [
  { id: 'crc8', label: 'CRC-8 (SMBus)', calculate: crc8, width: 2 },
  { id: 'crc16', label: 'CRC-16/CCITT-FALSE', calculate: crc16CcittFalse, width: 4 },
  { id: 'crc32', label: 'CRC-32 (IEEE 802.3)', calculate: crc32, width: 8 },
  { id: 'adler32', label: 'Adler-32', calculate: adler32, width: 8 },
];
