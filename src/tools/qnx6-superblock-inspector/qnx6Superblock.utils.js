/**
 * Constants and utility functions for parsing and inspecting
 * QNX6 (Power-Safe) filesystem superblocks client-side.
 */

export const QNX6_MAGIC = 0x68191122;
export const SUPERBLOCK_SIZE = 512;
export const BOOT_AREA_SIZE = 0x2000; // 8192 bytes
export const MAX_SLICE_SIZE = 12288;  // 0x3000 bytes
export const VALID_BLOCK_SIZES = [512, 1024, 2048, 4096];

const CRC32_POLY_BE = 0x04c11db7;

/**
 * Builds the Big-Endian CRC32 lookup table (polynomial 0x04c11db7).
 *
 * @returns {Uint32Array} 256-entry table.
 */
function createCrc32BeTable() {
  const table = new Uint32Array(256);
  let crc = 0x80000000;
  for (let i = 1; i < 256; i <<= 1) {
    crc = ((crc << 1) ^ ((crc & 0x80000000) ? CRC32_POLY_BE : 0)) >>> 0;
    for (let j = 0; j < i; j++) {
      table[i + j] = (crc ^ table[j]) >>> 0;
    }
  }
  return table;
}

const CRC32_BE_TABLE = createCrc32BeTable();

/**
 * Computes big-endian CRC32 (crc32_be) matching Linux fs/qnx6 integrity check.
 *
 * @param {Uint8Array} bytes - Data buffer.
 * @param {number} [start=0] - Offset to begin calculation.
 * @param {number} [length=bytes.length] - Number of bytes to process.
 * @returns {number} Unsigned 32-bit CRC.
 */
export function computeCrc32Be(bytes, start = 0, length = bytes.length) {
  let crc = 0;
  const end = start + length;
  for (let i = start; i < end; i++) {
    crc = ((crc << 8) ^ CRC32_BE_TABLE[((crc >>> 24) ^ bytes[i]) & 0xff]) >>> 0;
  }
  return crc;
}

/**
 * Detects whether QNX6 magic (0x68191122) is present at offset 0 or offset 0x2000,
 * and determines the byte order (little-endian or big-endian).
 *
 * @param {Uint8Array} bytes
 * @returns {{ offset: number, byteOrder: 'little' | 'big' } | null}
 */
export function detectSuperblockOffset(bytes) {
  if (!bytes || bytes.length < 4) {
    return null;
  }

  // Check offset 0
  const isLe0 =
    bytes[0] === 0x22 && bytes[1] === 0x11 &&
    bytes[2] === 0x19 && bytes[3] === 0x68;
  const isBe0 =
    bytes[0] === 0x68 && bytes[1] === 0x19 &&
    bytes[2] === 0x11 && bytes[3] === 0x22;

  if (isLe0 || isBe0) {
    return { offset: 0, byteOrder: isLe0 ? 'little' : 'big' };
  }

  // Check offset 0x2000 (8192 bytes)
  if (bytes.length >= BOOT_AREA_SIZE + 4) {
    const o = BOOT_AREA_SIZE;
    const isLeBoot =
      bytes[o] === 0x22 && bytes[o + 1] === 0x11 &&
      bytes[o + 2] === 0x19 && bytes[o + 3] === 0x68;
    const isBeBoot =
      bytes[o] === 0x68 && bytes[o + 1] === 0x19 &&
      bytes[o + 2] === 0x11 && bytes[o + 3] === 0x22;

    if (isLeBoot || isBeBoot) {
      return { offset: o, byteOrder: isLeBoot ? 'little' : 'big' };
    }
  }

  return null;
}

/**
 * Formats a 16-byte buffer as standard UUID string (8-4-4-4-12 hex).
 *
 * @param {Uint8Array} bytes
 * @returns {string} Formatted UUID string.
 */
export function formatUuid(bytes) {
  if (!bytes || bytes.length < 16) {
    return '';
  }
  const hex = Array.from(bytes.slice(0, 16), (b) =>
    b.toString(16).padStart(2, '0')
  ).join('');
  return (
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-` +
    `${hex.slice(16, 20)}-${hex.slice(20, 32)}`
  );
}

/**
 * Formats seconds timestamp into ISO 8601 string.
 *
 * @param {number} sec - UNIX timestamp in seconds.
 * @returns {string} Formatted date string or 'N/A'.
 */
export function formatTimestamp(sec) {
  if (!sec || sec === 0) return 'N/A';
  try {
    const d = new Date(sec * 1000);
    return isNaN(d.getTime()) ? 'Invalid Date' : d.toISOString();
  } catch {
    return 'Invalid Date';
  }
}

/**
 * Converts a Uint8Array into a hex string with optional byte spacing.
 *
 * @param {Uint8Array} bytes
 * @param {boolean} [spaced=false]
 * @returns {string}
 */
export function bytesToHex(bytes, spaced = false) {
  if (!bytes) return '';
  const hexArr = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return spaced ? hexArr.join(' ') : hexArr.join('');
}

/**
 * Parses raw hex string into a Uint8Array.
 *
 * @param {string} hexStr
 * @returns {Uint8Array}
 */
export function parseHexInput(hexStr) {
  if (typeof hexStr !== 'string') {
    throw new TypeError('Hex input must be a string.');
  }
  const cleaned = hexStr.replace(/0x|\s+|,|:/g, '');
  if (cleaned.length === 0) {
    return new Uint8Array(0);
  }
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) {
    throw new Error('Invalid hexadecimal characters in input.');
  }
  if (cleaned.length % 2 !== 0) {
    throw new Error('Hex string has an odd length.');
  }
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes[i / 2] = parseInt(cleaned.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Reads up to 12288 bytes from a File or Blob using file.slice(0, 12288).
 *
 * @param {File|Blob} file
 * @param {number} [maxBytes=MAX_SLICE_SIZE]
 * @returns {Promise<Uint8Array>}
 */
export function readSuperblockSlice(file, maxBytes = MAX_SLICE_SIZE) {
  return new Promise((resolve, reject) => {
    if (!file || typeof file.slice !== 'function') {
      reject(new Error('Invalid file object.'));
      return;
    }
    const slice = file.slice(0, maxBytes);
    const reader = new FileReader();
    reader.onload = () => {
      resolve(new Uint8Array(/** @type {ArrayBuffer} */ (reader.result)));
    };
    reader.onerror = () => reject(new Error('Failed to read file slice.'));
    reader.readAsArrayBuffer(slice);
  });
}

/**
 * Parses a QNX6 superblock from a byte buffer.
 *
 * @param {Uint8Array} inputBytes
 * @returns {object} Parsed superblock details, flags, and diagnostics.
 */
export function parseQnx6Superblock(inputBytes) {
  const errors = [];
  const warnings = [];

  if (!inputBytes || inputBytes.length === 0) {
    return {
      valid: false,
      truncated: true,
      errors: ['Input is empty.'],
      warnings: [],
    };
  }

  const loc = detectSuperblockOffset(inputBytes);

  if (!loc) {
    // If fewer than 512 bytes, it is truncated
    if (inputBytes.length < SUPERBLOCK_SIZE) {
      return {
        valid: false,
        truncated: true,
        errors: [
          `Truncated input (${inputBytes.length} bytes). ` +
          `Minimum superblock size is ${SUPERBLOCK_SIZE} bytes.`,
        ],
        warnings: [],
      };
    }
    // Buffer >= 512 bytes but magic does not match at offset 0 or 0x2000
    return {
      valid: false,
      truncated: false,
      magic: null,
      byteOrder: 'unknown',
      errors: [
        'Invalid QNX6 superblock magic (expected 0x68191122). Unknown byte order.',
      ],
      warnings: [],
    };
  }

  const { offset, byteOrder } = loc;
  const isLe = byteOrder === 'little';

  // Check truncation at detected offset
  if (inputBytes.length < offset + SUPERBLOCK_SIZE) {
    const available = inputBytes.length - offset;
    return {
      valid: false,
      truncated: true,
      offset,
      byteOrder,
      errors: [
        `Truncated superblock at offset 0x${offset.toString(16)}: ` +
        `expected ${SUPERBLOCK_SIZE} bytes, got ${available} bytes.`,
      ],
      warnings: [],
    };
  }

  const view = new DataView(
    inputBytes.buffer,
    inputBytes.byteOffset + offset,
    SUPERBLOCK_SIZE
  );

  const magic = view.getUint32(0, isLe);
  const checksum = view.getUint32(4, isLe);
  const serial = view.getBigUint64(8, isLe);
  const ctime = view.getUint32(16, isLe);
  const atime = view.getUint32(20, isLe);
  const flags = view.getUint32(24, isLe);
  const version1 = view.getUint16(28, isLe);
  const version2 = view.getUint16(30, isLe);

  const volumeIdBytes = inputBytes.slice(offset + 32, offset + 48);
  const volumeId = formatUuid(volumeIdBytes);

  const blockSize = view.getUint32(48, isLe);
  const numInodes = view.getUint32(52, isLe);
  const freeInodes = view.getUint32(56, isLe);
  const numBlocks = view.getUint32(60, isLe);
  const freeBlocks = view.getUint32(64, isLe);
  const allocGroup = view.getUint32(68, isLe);

  // Root node summaries: Inode (offset 72), Bitmap (offset 152), Longfile (offset 232)
  const roots = {
    inode: {
      size: view.getBigUint64(72, isLe),
      level: view.getUint8(72 + 72),
      mode: view.getUint8(72 + 73),
    },
    bitmap: {
      size: view.getBigUint64(152, isLe),
      level: view.getUint8(152 + 72),
      mode: view.getUint8(152 + 73),
    },
    longfile: {
      size: view.getBigUint64(232, isLe),
      level: view.getUint8(232 + 72),
      mode: view.getUint8(232 + 73),
    },
  };

  // CRC32 check: CRC of bytes 8..512 (504 bytes total)
  const expectedChecksum = computeCrc32Be(inputBytes, offset + 8, 504);
  const crcMatch = checksum === expectedChecksum;
  if (!crcMatch) {
    const expHex = `0x${expectedChecksum.toString(16).padStart(8, '0')}`;
    const fndHex = `0x${checksum.toString(16).padStart(8, '0')}`;
    errors.push(`Superblock CRC32 mismatch: expected ${expHex}, found ${fndHex}.`);
  }

  // Block size check: 512, 1024, 2048, or 4096
  const validBlockSize = VALID_BLOCK_SIZES.includes(blockSize);
  if (!validBlockSize) {
    errors.push(
      `Invalid block size: ${blockSize}. Must be 512, 1024, 2048, or 4096.`
    );
  }

  // Free counts check
  const validFreeInodes = freeInodes <= numInodes;
  if (!validFreeInodes) {
    errors.push(
      `Free inodes (${freeInodes}) exceeds total inodes (${numInodes}).`
    );
  }

  const validFreeBlocks = freeBlocks <= numBlocks;
  if (!validFreeBlocks) {
    errors.push(
      `Free blocks (${freeBlocks}) exceeds total blocks (${numBlocks}).`
    );
  }

  const isValid = errors.length === 0;

  return {
    valid: isValid,
    truncated: false,
    offset,
    byteOrder,
    magic,
    checksum,
    expectedChecksum,
    crcMatch,
    serial,
    ctime,
    ctimeFormatted: formatTimestamp(ctime),
    atime,
    atimeFormatted: formatTimestamp(atime),
    flags,
    version1,
    version2,
    volumeId,
    volumeIdBytes,
    blockSize,
    validBlockSize,
    numInodes,
    freeInodes,
    validFreeInodes,
    numBlocks,
    freeBlocks,
    validFreeBlocks,
    allocGroup,
    roots,
    errors,
    warnings,
  };
}

/**
 * Helper to build a sample QNX6 superblock buffer for tests and demo.
 *
 * @param {object} [options]
 * @returns {Uint8Array}
 */
export function buildSampleSuperblock(options = {}) {
  const {
    isLittleEndian = true,
    magic = QNX6_MAGIC,
    serial = 42n,
    ctime = 1609459200,
    atime = 1609545600,
    flags = 0,
    version1 = 1,
    version2 = 0,
    volumeId = new Uint8Array([
      0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef,
      0xfe, 0xdc, 0xba, 0x98, 0x76, 0x54, 0x32, 0x10,
    ]),
    blockSize = 1024,
    numInodes = 2048,
    freeInodes = 1800,
    numBlocks = 65536,
    freeBlocks = 50000,
    allocGroup = 0,
    inodeRoot = { size: 1024n, level: 0, mode: 1 },
    bitmapRoot = { size: 8192n, level: 1, mode: 0 },
    longfileRoot = { size: 512n, level: 0, mode: 0 },
    corruptChecksum = false,
    corruptChecksumValue = null,
    offset = 0,
    totalLength = offset + SUPERBLOCK_SIZE,
  } = options;

  const buf = new Uint8Array(totalLength);
  const view = new DataView(buf.buffer, offset, SUPERBLOCK_SIZE);

  view.setUint32(0, magic, isLittleEndian);
  view.setBigUint64(8, serial, isLittleEndian);
  view.setUint32(16, ctime, isLittleEndian);
  view.setUint32(20, atime, isLittleEndian);
  view.setUint32(24, flags, isLittleEndian);
  view.setUint16(28, version1, isLittleEndian);
  view.setUint16(30, version2, isLittleEndian);

  if (volumeId) {
    buf.set(volumeId.slice(0, 16), offset + 32);
  }

  view.setUint32(48, blockSize, isLittleEndian);
  view.setUint32(52, numInodes, isLittleEndian);
  view.setUint32(56, freeInodes, isLittleEndian);
  view.setUint32(60, numBlocks, isLittleEndian);
  view.setUint32(64, freeBlocks, isLittleEndian);
  view.setUint32(68, allocGroup, isLittleEndian);

  // Inode root
  view.setBigUint64(72, inodeRoot.size, isLittleEndian);
  view.setUint8(72 + 72, inodeRoot.level);
  view.setUint8(72 + 73, inodeRoot.mode ?? 0);

  // Bitmap root
  view.setBigUint64(152, bitmapRoot.size, isLittleEndian);
  view.setUint8(152 + 72, bitmapRoot.level);
  view.setUint8(152 + 73, bitmapRoot.mode ?? 0);

  // Longfile root
  view.setBigUint64(232, longfileRoot.size, isLittleEndian);
  view.setUint8(232 + 72, longfileRoot.level);
  view.setUint8(232 + 73, longfileRoot.mode ?? 0);

  // Compute CRC32
  let crc = computeCrc32Be(buf, offset + 8, 504);
  if (corruptChecksum) {
    crc = corruptChecksumValue !== null ? corruptChecksumValue : (crc ^ 0xffffffff) >>> 0;
  }
  view.setUint32(4, crc, isLittleEndian);

  return buf;
}
