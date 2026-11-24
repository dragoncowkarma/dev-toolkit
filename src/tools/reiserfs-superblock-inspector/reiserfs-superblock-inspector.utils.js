/**
 * ReiserFS superblock inspector utility functions and constants.
 * Supports ReiserFS v3.5 and v3.6 format superblocks.
 */

export const REISERFS_DEFAULT_OFFSET = 65536; // 64 KiB
export const MIN_SUPERBLOCK_BYTES = 76;
export const BOUNDED_SLICE_BYTES = 512;

export const VALID_BLOCK_SIZES = [512, 1024, 2048, 4096, 8192];

export const MAGIC_FORMATS = {
  ReIsErFs: '3.5 format',
  ReIsEr2Fs: '3.6 format',
  ReIsEr3Fs: 'journal relocated',
};

export const HASH_FUNCTIONS = {
  0: 'Unset',
  1: 'Tea',
  2: 'Yura',
  3: 'R5',
};

export const STATE_DESCRIPTIONS = {
  1: 'Valid / Cleanly unmounted',
  2: 'Error / Uncleanly unmounted',
};

export const VERSION_DESCRIPTIONS = {
  1: 'ReiserFS 3.5 (version 1)',
  2: 'ReiserFS 3.6 (version 2)',
};

/**
 * Formats a byte number or BigInt into a human-readable string.
 *
 * @param {number|bigint} bytes - The number of bytes.
 * @returns {string} Formatted size (e.g. "1.00 GiB").
 */
export function formatBytes(bytes) {
  const num = typeof bytes === 'bigint' ? Number(bytes) : Number(bytes || 0);
  if (num === 0) return '0 B';
  if (num < 1024) return `${num} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  let val = num / 1024;
  let idx = 0;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx += 1;
  }
  return `${val.toFixed(2)} ${units[idx]}`;
}

/**
 * Converts a hex string into a Uint8Array, ignoring whitespace and optional delimiters.
 *
 * @param {string} hex - The hex string to decode.
 * @returns {Uint8Array} Decoded binary bytes.
 * @throws {Error} When encountering invalid hex characters or odd digit count.
 */
export function hexToBytes(hex) {
  if (typeof hex !== 'string') {
    throw new TypeError('Hex input must be a string.');
  }
  // Strip whitespace, colons, hyphens, and leading 0x prefixes
  const cleaned = hex.replace(/0x|\s+|:|-/gi, '');
  if (cleaned.length === 0) {
    return new Uint8Array(0);
  }
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) {
    throw new Error('Invalid hex string: non-hexadecimal character encountered.');
  }
  if (cleaned.length % 2 !== 0) {
    throw new Error(`Invalid hex string: odd number of digits (${cleaned.length}).`);
  }
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes[i / 2] = parseInt(cleaned.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Converts a Uint8Array into a spaced hex string.
 *
 * @param {Uint8Array} bytes - The bytes to encode.
 * @returns {string} Formatted hex string.
 */
export function bytesToHex(bytes) {
  if (!bytes || !(bytes instanceof Uint8Array)) {
    return '';
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');
}

/**
 * Reads a bounded slice of a file using File.slice.
 *
 * @param {File|Blob} file - The file to read.
 * @param {number} offset - The starting byte offset.
 * @param {number} [length=BOUNDED_SLICE_BYTES] - Number of bytes to slice.
 * @returns {Promise<Uint8Array>} Resolves with the slice data.
 */
export function readFileSlice(file, offset, length = BOUNDED_SLICE_BYTES) {
  return new Promise((resolve, reject) => {
    if (!file || typeof file.slice !== 'function') {
      reject(new Error('Invalid file object provided.'));
      return;
    }
    const safeOffset = Math.max(0, offset);
    const slice = file.slice(safeOffset, safeOffset + length);
    const reader = new FileReader();
    reader.onload = () => {
      resolve(new Uint8Array(/** @type {ArrayBuffer} */ (reader.result)));
    };
    reader.onerror = () => reject(new Error('Failed to read file slice.'));
    reader.readAsArrayBuffer(slice);
  });
}

/**
 * Parses a ReiserFS superblock from a Uint8Array or ArrayBuffer.
 *
 * @param {Uint8Array|ArrayBuffer} input - Binary buffer containing the superblock.
 * @param {number} [offset=REISERFS_DEFAULT_OFFSET] - Superblock offset in bytes.
 * @returns {object} Result with superblock metadata, derived values, and diagnostics.
 */
export function parseReiserfsSuperblock(input, offset = REISERFS_DEFAULT_OFFSET) {
  const diagnostics = [];

  let buffer;
  if (input instanceof ArrayBuffer) {
    buffer = new Uint8Array(input);
  } else if (input instanceof Uint8Array) {
    buffer = input;
  } else {
    return {
      success: false,
      superblock: null,
      derived: null,
      diagnostics: ['Invalid input: expected a Uint8Array or ArrayBuffer.'],
    };
  }

  const safeOffset = typeof offset === 'number' && !Number.isNaN(offset) ? Math.max(0, offset) : 0;

  if (buffer.byteLength < safeOffset + MIN_SUPERBLOCK_BYTES) {
    const available = Math.max(0, buffer.byteLength - safeOffset);
    diagnostics.push(
      `Truncated input: expected at least ${MIN_SUPERBLOCK_BYTES} bytes at offset ${safeOffset}, ` +
        `but only ${available} byte(s) are available.`
    );
    return {
      success: false,
      superblock: null,
      derived: null,
      diagnostics,
    };
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset + safeOffset, MIN_SUPERBLOCK_BYTES);

  // Field extraction (all multi-byte integers are little-endian)
  const blockCount = view.getUint32(0, true);
  const freeBlocks = view.getUint32(4, true);
  const rootBlock = view.getUint32(8, true);
  const journal1stBlock = view.getUint32(12, true);
  const journalDev = view.getUint32(16, true);
  const journalSize = view.getUint32(20, true);
  const journalTransMax = view.getUint32(24, true);
  const journalMagic = view.getUint32(28, true);
  const journalMaxBatch = view.getUint32(32, true);
  const journalMaxCommitAge = view.getUint32(36, true);
  const maxTransAge = view.getUint32(40, true);
  const blockSize = view.getUint16(44, true);
  const oidMaxSize = view.getUint16(46, true);
  const oidCurSize = view.getUint16(48, true);
  const state = view.getUint16(50, true);

  // Magic string at offset 52 (up to 12 ASCII bytes, terminated by null)
  let magic = '';
  for (let i = 0; i < 12; i++) {
    const byte = view.getUint8(52 + i);
    if (byte === 0) break;
    magic += String.fromCharCode(byte);
  }

  const hashFunctionCode = view.getUint32(64, true);
  const treeHeight = view.getUint16(68, true);
  const bitmapCount = view.getUint16(70, true);
  const version = view.getUint16(72, true);
  const reservedForJournal = view.getUint16(74, true);

  // Diagnostics check 1: Magic string & format resolution
  let formatDescription = 'Unknown format';
  if (magic === 'ReIsErFs') {
    formatDescription = '3.5 format';
  } else if (magic === 'ReIsEr2Fs') {
    formatDescription = '3.6 format';
  } else if (magic === 'ReIsEr3Fs') {
    if (version === 1) {
      formatDescription = 'ReiserFS 3.5 (journal relocated)';
    } else if (version === 2) {
      formatDescription = 'ReiserFS 3.6 (journal relocated)';
    } else {
      formatDescription = `ReiserFS unknown version ${version} (journal relocated)`;
      diagnostics.push(
        `Unknown ReiserFS version ${version} for relocated journal magic "${magic}". Expected 1 (3.5) or 2 (3.6).`
      );
    }
  } else {
    diagnostics.push(
      `Invalid magic string "${magic}". Expected "ReIsErFs", "ReIsEr2Fs", or "ReIsEr3Fs".`
    );
  }

  // Diagnostics check 2: Block size must be power of two between 512 and 8192
  const isValidBlockSize = VALID_BLOCK_SIZES.includes(blockSize);
  if (!isValidBlockSize) {
    diagnostics.push(
      `Invalid block size: ${blockSize} bytes. Must be a power of two between 512 and 8192.`
    );
  }

  // Diagnostics check 3: Free blocks cannot exceed block count
  if (freeBlocks > blockCount) {
    diagnostics.push(
      `Free blocks (${freeBlocks}) cannot exceed total block count (${blockCount}).`
    );
  }

  // Diagnostics check 4: Unknown hash function code
  const hashFunctionName = HASH_FUNCTIONS[hashFunctionCode] ?? `Unknown (${hashFunctionCode})`;
  if (HASH_FUNCTIONS[hashFunctionCode] === undefined) {
    diagnostics.push(
      `Unknown hash function code: ${hashFunctionCode}. ` +
        `Expected 0 (Unset), 1 (Tea), 2 (Yura), or 3 (R5).`
    );
  }

  // Derived values
  let volumeSizeBytes = 0;
  let freeSpaceBytes = 0;
  let usedSpaceBytes = 0;
  let usagePercentage = 0;

  if (isValidBlockSize) {
    const bSize = BigInt(blockSize);
    const totalB = BigInt(blockCount);
    const freeB = BigInt(freeBlocks);
    const usedB = totalB >= freeB ? totalB - freeB : 0n;

    volumeSizeBytes = Number(totalB * bSize);
    freeSpaceBytes = Number(freeB * bSize);
    usedSpaceBytes = Number(usedB * bSize);
    usagePercentage = blockCount > 0 ? (Number(usedB) / Number(totalB)) * 100 : 0;
  }

  const superblock = {
    blockCount,
    freeBlocks,
    rootBlock,
    journal1stBlock,
    journalDev,
    journalSize,
    journalTransMax,
    journalMagic,
    journalMagicHex: `0x${journalMagic.toString(16).padStart(8, '0')}`,
    journalMaxBatch,
    journalMaxCommitAge,
    maxTransAge,
    blockSize,
    oidMaxSize,
    oidCurSize,
    state,
    stateDescription: STATE_DESCRIPTIONS[state] || `Unknown (${state})`,
    magic,
    formatDescription,
    hashFunctionCode,
    hashFunctionName,
    treeHeight,
    bitmapCount,
    version,
    versionDescription: VERSION_DESCRIPTIONS[version] || `Version ${version}`,
    reservedForJournal,
  };

  const derived = {
    volumeSizeBytes,
    volumeSizeFormatted: formatBytes(volumeSizeBytes),
    freeSpaceBytes,
    freeSpaceFormatted: formatBytes(freeSpaceBytes),
    usedSpaceBytes,
    usedSpaceFormatted: formatBytes(usedSpaceBytes),
    usagePercentage: Number(usagePercentage.toFixed(2)),
    usagePercentageFormatted: `${usagePercentage.toFixed(2)}%`,
  };

  return {
    success: diagnostics.length === 0,
    superblock,
    derived,
    diagnostics,
  };
}

/**
 * Builds a binary ReiserFS superblock byte buffer for testing and sample generation.
 *
 * @param {object} [options] - Overrides for superblock fields.
 * @returns {Uint8Array}
 */
export function buildSampleSuperblock(options = {}) {
  const size = options.size || 128;
  const buf = new Uint8Array(size);
  const dv = new DataView(buf.buffer);

  dv.setUint32(0, options.blockCount ?? 262144, true);
  dv.setUint32(4, options.freeBlocks ?? 196608, true);
  dv.setUint32(8, options.rootBlock ?? 8211, true);
  dv.setUint32(12, options.journal1stBlock ?? 18, true);
  dv.setUint32(16, options.journalDev ?? 0, true);
  dv.setUint32(20, options.journalSize ?? 8193, true);
  dv.setUint32(24, options.journalTransMax ?? 1024, true);
  dv.setUint32(28, options.journalMagic ?? 0x52454953, true);
  dv.setUint32(32, options.journalMaxBatch ?? 900, true);
  dv.setUint32(36, options.journalMaxCommitAge ?? 30, true);
  dv.setUint32(40, options.maxTransAge ?? 30, true);
  dv.setUint16(44, options.blockSize ?? 4096, true);
  dv.setUint16(46, options.oidMaxSize ?? 4096, true);
  dv.setUint16(48, options.oidCurSize ?? 2, true);
  dv.setUint16(50, options.state ?? 1, true);

  const magic = options.magic !== undefined ? options.magic : 'ReIsEr2Fs';
  for (let i = 0; i < magic.length && i < 12; i++) {
    buf[52 + i] = magic.charCodeAt(i);
  }

  dv.setUint32(64, options.hashFunctionCode ?? 3, true);
  dv.setUint16(68, options.treeHeight ?? 2, true);
  dv.setUint16(70, options.bitmapCount ?? 8, true);
  dv.setUint16(72, options.version ?? 2, true);
  dv.setUint16(74, options.reservedForJournal ?? 0, true);

  return buf;
}

export const SAMPLE_VALID_36_HEX = bytesToHex(
  buildSampleSuperblock({
    magic: 'ReIsEr2Fs',
    hashFunctionCode: 3,
    version: 2,
    blockCount: 262144,
    freeBlocks: 196608,
  })
);

export const SAMPLE_VALID_35_HEX = bytesToHex(
  buildSampleSuperblock({
    magic: 'ReIsErFs',
    hashFunctionCode: 2,
    version: 1,
    blockCount: 131072,
    freeBlocks: 98304,
  })
);

export const SAMPLE_RELOCATED_36_HEX = bytesToHex(
  buildSampleSuperblock({
    magic: 'ReIsEr3Fs',
    hashFunctionCode: 3,
    version: 2,
    blockCount: 524288,
    freeBlocks: 393216,
  })
);

export const SAMPLE_RELOCATED_HEX = SAMPLE_RELOCATED_36_HEX;

export const SAMPLE_RELOCATED_35_HEX = bytesToHex(
  buildSampleSuperblock({
    magic: 'ReIsEr3Fs',
    hashFunctionCode: 2,
    version: 1,
    blockCount: 524288,
    freeBlocks: 393216,
  })
);

export const SAMPLE_RELOCATED_UNKNOWN_HEX = bytesToHex(
  buildSampleSuperblock({
    magic: 'ReIsEr3Fs',
    hashFunctionCode: 3,
    version: 3,
    blockCount: 524288,
    freeBlocks: 393216,
  })
);

export const SAMPLE_CORRUPT_HEX = bytesToHex(
  buildSampleSuperblock({
    magic: 'BADMAGIC!',
    blockSize: 3000,
    blockCount: 1000,
    freeBlocks: 5000,
    hashFunctionCode: 99,
  })
);
