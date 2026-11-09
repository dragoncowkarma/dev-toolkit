/**
 * Converts text into its UTF-8 byte representation.
 * @param {string} text
 * @returns {Uint8Array}
 */
export function textToBytes(text) {
  if (typeof text !== 'string') {
    throw new TypeError('Input must be a string.');
  }
  return new TextEncoder().encode(text);
}

/**
 * Largest file accepted by the CRC calculator.
 *
 * Each uploaded byte is processed synchronously by three bit-at-a-time CRC
 * algorithms. Keeping uploads to 256 KB bounds that work before reading the
 * file into memory and avoids a multi-second main-thread stall on large files.
 */
export const MAX_INPUT_BYTES = 256 * 1024;

/**
 * Calculates CRC-8 using polynomial 0x07, initial value 0x00, and no reflection.
 * @param {Uint8Array} bytes
 * @returns {number}
 */
export function crc8(bytes) {
  let checksum = 0;
  for (const byte of bytes) {
    checksum ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      checksum = checksum & 0x80 ? ((checksum << 1) ^ 0x07) & 0xff : (checksum << 1) & 0xff;
    }
  }
  return checksum;
}

/**
 * Calculates CRC-16/CCITT-FALSE using polynomial 0x1021 and initial value 0xFFFF.
 * @param {Uint8Array} bytes
 * @returns {number}
 */
export function crc16(bytes) {
  let checksum = 0xffff;
  for (const byte of bytes) {
    checksum ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      checksum = checksum & 0x8000 ? ((checksum << 1) ^ 0x1021) & 0xffff : (checksum << 1) & 0xffff;
    }
  }
  return checksum;
}

/**
 * Calculates standard CRC-32 (IEEE 802.3 / zlib compatible).
 * @param {Uint8Array} bytes
 * @returns {number}
 */
export function crc32(bytes) {
  let checksum = 0xffffffff;
  for (const byte of bytes) {
    checksum ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      checksum = checksum & 1 ? (checksum >>> 1) ^ 0xedb88320 : checksum >>> 1;
    }
  }
  return (checksum ^ 0xffffffff) >>> 0;
}

/**
 * Formats a checksum as zero-padded uppercase hexadecimal.
 * @param {number} checksum
 * @param {number} width
 * @returns {string}
 */
export function formatChecksum(checksum, width) {
  return `0x${checksum.toString(16).toUpperCase().padStart(width, '0')}`;
}

/**
 * Reads a File or Blob as raw bytes.
 * @param {File|Blob} file
 * @returns {Promise<Uint8Array>}
 */
export function fileToBytes(file) {
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error(
      `File is too large. Choose a file up to ${formatFileSize(MAX_INPUT_BYTES)}.`
    );
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(/** @type {ArrayBuffer} */ (reader.result)));
    reader.onerror = () => reject(new Error('Failed to read the selected file.'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Formats a byte count into a human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
