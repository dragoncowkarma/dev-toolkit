/**
 * Constants and utility functions for parsing and inspecting
 * Amiga Smart File System (SFS) Root Blocks.
 */

export const SFS_MAGIC = 0x53465300; // 'SFS\0' in big-endian
export const SFS_MAGIC_STRING = 'SFS\\0';
export const MIN_ROOT_BLOCK_SIZE = 128;
export const MAX_SLICE_SIZE = 4096;
export const AMIGA_EPOCH_OFFSET_SECONDS = 252460800; // Seconds between 1970-01-01 and 1978-01-01

/**
 * Checks if a value is a positive power of two integer.
 *
 * @param {number} n
 * @returns {boolean}
 */
export function isPowerOfTwo(n) {
  return typeof n === 'number' && Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
}

/**
 * Formats seconds since the Amiga epoch (1978-01-01 00:00:00 UTC) into an ISO-like UTC string.
 *
 * @param {number} seconds - Amiga timestamp in seconds.
 * @returns {string} Formatted date string, or 'Unknown'.
 */
export function formatAmigaDate(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    return 'Unknown';
  }
  const ms = (seconds + AMIGA_EPOCH_OFFSET_SECONDS) * 1000;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }
  return date.toISOString().replace('.000Z', ' UTC');
}

/**
 * Formats a byte count into a human-readable string.
 *
 * @param {number | bigint} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  const n = typeof bytes === 'bigint' ? Number(bytes) : bytes;
  if (typeof n !== 'number' || Number.isNaN(n) || n < 0) {
    return 'Unknown';
  }
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let val = n / 1024;
  let unitIndex = 0;
  while (val >= 1024 && unitIndex < units.length - 1) {
    val /= 1024;
    unitIndex += 1;
  }
  return `${val.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Calculates the 32-bit checksum value that balances the sum of all longwords in the block to 0.
 *
 * @param {ArrayBuffer | Uint8Array | DataView} buffer - Buffer containing the block.
 * @param {number} blockSize - Size of the block in bytes.
 * @returns {number} The 32-bit checksum value.
 */
export function calculateBlockChecksum(buffer, blockSize) {
  let view;
  if (buffer instanceof DataView) {
    view = buffer;
  } else if (buffer instanceof ArrayBuffer) {
    view = new DataView(buffer);
  } else if (ArrayBuffer.isView(buffer)) {
    view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  } else {
    throw new TypeError('Expected an ArrayBuffer, TypedArray, or DataView.');
  }

  let sum = 0;
  for (let offset = 0; offset < blockSize; offset += 4) {
    if (offset === 4) continue; // Skip the checksum longword itself
    sum = (sum + view.getUint32(offset, false)) >>> 0;
  }
  return (0x100000000 - sum) >>> 0;
}

/**
 * Helper to construct an SFS root block buffer for testing and demonstration.
 *
 * @param {object} [options]
 * @returns {ArrayBuffer}
 */
export function createSfsRootBlockBuffer(options = {}) {
  const {
    blockSize = 512,
    totalBlocks = 2048,
    version = 1,
    sequenceNumber = 1,
    dateCreated = 100000000,
    flags = 0,
    bitmapBase = 1,
    adminSpaceContainer = 2,
    rootObjectContainer = 3,
    extentBnodeRoot = 4,
    ownBlock = 0,
    firstByte = 0n,
    lastByte = BigInt(blockSize * totalBlocks),
    magic = SFS_MAGIC,
    corruptChecksum = false,
  } = options;

  const buffer = new ArrayBuffer(blockSize);
  const view = new DataView(buffer);

  // 0x00: id (magic)
  view.setUint32(0, magic, false);
  // 0x04: checksum (initially 0)
  view.setUint32(4, 0, false);
  // 0x08: ownblock
  view.setUint32(8, ownBlock, false);
  // 0x0C: version
  view.setUint16(12, version, false);
  // 0x0E: sequencenumber
  view.setUint16(14, sequenceNumber, false);
  // 0x10: datecreated
  view.setUint32(16, dateCreated, false);
  // 0x14: bits (flags)
  view.setUint8(20, flags);

  // 0x20: firstbyteh, 0x24: firstbyte
  const fbBig = BigInt(firstByte);
  view.setUint32(32, Number((fbBig >> 32n) & 0xffffffffn), false);
  view.setUint32(36, Number(fbBig & 0xffffffffn), false);

  // 0x28: lastbyteh, 0x2C: lastbyte
  const lbBig = BigInt(lastByte);
  view.setUint32(40, Number((lbBig >> 32n) & 0xffffffffn), false);
  view.setUint32(44, Number(lbBig & 0xffffffffn), false);

  // 0x30: totalblocks
  view.setUint32(48, totalBlocks, false);
  // 0x34: blocksize
  view.setUint32(52, blockSize, false);

  // 0x60: bitmapbase
  view.setUint32(96, bitmapBase, false);
  // 0x64: adminspacecontainer
  view.setUint32(100, adminSpaceContainer, false);
  // 0x68: rootobjectcontainer
  view.setUint32(104, rootObjectContainer, false);
  // 0x6C: extentbnoderoot
  view.setUint32(108, extentBnodeRoot, false);

  const checksum = calculateBlockChecksum(buffer, blockSize);
  view.setUint32(4, corruptChecksum ? (checksum ^ 0xdeadbeef) >>> 0 : checksum, false);

  return buffer;
}

/**
 * Creates a default fallback result representing an Unknown or error state.
 *
 * @param {string} errorMessage
 * @param {number} [byteLength=0]
 * @param {object} [partialFields={}]
 * @returns {object}
 */
function createUnknownResult(errorMessage, byteLength = 0, partialFields = {}) {
  return {
    status: 'Unknown',
    checksumStatus: 'Unknown',
    isValid: false,
    errorMessage,
    rawBytesRead: byteLength,
    id: partialFields.id ?? 'Unknown',
    idHex: partialFields.idHex ?? 'Unknown',
    isKnownMagic: partialFields.isKnownMagic ?? false,
    checksum: partialFields.checksum ?? null,
    checksumHex: partialFields.checksumHex ?? 'Unknown',
    calculatedSum: null,
    version: partialFields.version ?? null,
    sequenceNumber: partialFields.sequenceNumber ?? null,
    dateCreated: partialFields.dateCreated ?? 'Unknown',
    dateCreatedRaw: partialFields.dateCreatedRaw ?? null,
    flags: partialFields.flags ?? null,
    flagsHex: partialFields.flagsHex ?? 'Unknown',
    flagsBinary: partialFields.flagsBinary ?? 'Unknown',
    totalBlocks: partialFields.totalBlocks ?? null,
    blockSize: partialFields.blockSize ?? null,
    bitmapBase: partialFields.bitmapBase ?? null,
    adminSpaceContainer: partialFields.adminSpaceContainer ?? null,
    rootObjectContainer: partialFields.rootObjectContainer ?? null,
    extentBnodeRoot: partialFields.extentBnodeRoot ?? null,
    ownBlock: partialFields.ownBlock ?? null,
    firstByte: partialFields.firstByte ?? null,
    lastByte: partialFields.lastByte ?? null,
    volumeSizeBytes: null,
  };
}

/**
 * Parses an Amiga SFS Root Block from a byte buffer.
 *
 * @param {ArrayBuffer | Uint8Array | DataView} input - Raw byte buffer.
 * @returns {object} The parsed root block metadata and validation status.
 */
export function parseSfsRootBlock(input) {
  if (!input) {
    return createUnknownResult('No data provided.');
  }

  let view;
  let byteLength = 0;
  try {
    if (input instanceof DataView) {
      view = input;
      byteLength = input.byteLength;
    } else if (input instanceof ArrayBuffer) {
      view = new DataView(input);
      byteLength = input.byteLength;
    } else if (ArrayBuffer.isView(input)) {
      view = new DataView(input.buffer, input.byteOffset, input.byteLength);
      byteLength = input.byteLength;
    } else {
      return createUnknownResult(
        'Invalid input type: expected ArrayBuffer, TypedArray, or DataView.',
      );
    }
  } catch {
    return createUnknownResult('Failed to access buffer.');
  }

  if (byteLength < MIN_ROOT_BLOCK_SIZE) {
    return createUnknownResult(
      `Truncated input: provided ${byteLength} bytes, ` +
        `minimum root block size is ${MIN_ROOT_BLOCK_SIZE} bytes.`,
      byteLength,
    );
  }

  // Read magic ID at offset 0
  const magic = view.getUint32(0, false);
  const b0 = view.getUint8(0);
  const b1 = view.getUint8(1);
  const b2 = view.getUint8(2);
  const b3 = view.getUint8(3);
  const idStr = `${String.fromCharCode(b0, b1, b2)}${b3 === 0 ? '\\0' : String.fromCharCode(b3)}`;
  const idHex = `0x${magic.toString(16).padStart(8, '0')}`;
  const isKnownMagic = magic === SFS_MAGIC;

  if (!isKnownMagic) {
    return createUnknownResult(
      `Unknown magic identifier: ${idHex} ("${idStr}"). Expected ${SFS_MAGIC_STRING} (0x53465300).`,
      byteLength,
      { id: idStr, idHex, isKnownMagic: false },
    );
  }

  // Safe to read fixed fields within the 128-byte header
  const checksum = view.getUint32(4, false);
  const checksumHex = `0x${checksum.toString(16).padStart(8, '0')}`;
  const ownBlock = view.getUint32(8, false);
  const version = view.getUint16(12, false);
  const sequenceNumber = view.getUint16(14, false);
  const dateCreatedRaw = view.getUint32(16, false);
  const dateCreated = formatAmigaDate(dateCreatedRaw);
  const flags = view.getUint8(20);
  const flagsHex = `0x${flags.toString(16).padStart(2, '0')}`;
  const flagsBinary = `0b${flags.toString(2).padStart(8, '0')}`;

  const firstByteHigh = view.getUint32(32, false);
  const firstByteLow = view.getUint32(36, false);
  const firstByte = (BigInt(firstByteHigh) << 32n) | BigInt(firstByteLow);

  const lastByteHigh = view.getUint32(40, false);
  const lastByteLow = view.getUint32(44, false);
  const lastByte = (BigInt(lastByteHigh) << 32n) | BigInt(lastByteLow);

  const totalBlocks = view.getUint32(48, false);
  const blockSize = view.getUint32(52, false);

  const bitmapBase = view.getUint32(96, false);
  const adminSpaceContainer = view.getUint32(100, false);
  const rootObjectContainer = view.getUint32(104, false);
  const extentBnodeRoot = view.getUint32(108, false);

  const partialFields = {
    id: idStr,
    idHex,
    isKnownMagic: true,
    checksum,
    checksumHex,
    version,
    sequenceNumber,
    dateCreated,
    dateCreatedRaw,
    flags,
    flagsHex,
    flagsBinary,
    totalBlocks,
    blockSize,
    bitmapBase,
    adminSpaceContainer,
    rootObjectContainer,
    extentBnodeRoot,
    ownBlock,
    firstByte,
    lastByte,
  };

  // Validate plausibility of block geometry
  if (!isPowerOfTwo(blockSize) || blockSize < MIN_ROOT_BLOCK_SIZE) {
    return createUnknownResult(
      `Implausible block size: ${blockSize} bytes. ` +
        `Block size must be a power of two >= ${MIN_ROOT_BLOCK_SIZE}.`,
      byteLength,
      partialFields,
    );
  }

  if (totalBlocks === 0) {
    return createUnknownResult(
      'Implausible block count: total blocks is 0. An SFS volume must contain at least 1 block.',
      byteLength,
      partialFields,
    );
  }

  // Ensure full block is present to verify checksum
  if (byteLength < blockSize) {
    return createUnknownResult(
      `Truncated block: buffer contains ${byteLength} bytes, ` +
        `but the block size is ${blockSize} bytes.`,
      byteLength,
      partialFields,
    );
  }

  // Sum all longwords in the block
  let sum = 0;
  for (let offset = 0; offset < blockSize; offset += 4) {
    sum = (sum + view.getUint32(offset, false)) >>> 0;
  }

  const isValidChecksum = sum === 0;
  const checksumStatus = isValidChecksum ? 'Valid' : 'Invalid';
  const status = isValidChecksum ? 'Valid' : 'Invalid';
  const volumeSizeBytes = BigInt(totalBlocks) * BigInt(blockSize);
  const sumHex = sum.toString(16).padStart(8, '0');

  return {
    status,
    checksumStatus,
    isValid: isValidChecksum,
    errorMessage: isValidChecksum
      ? null
      : `Checksum mismatch: sum of longwords is 0x${sumHex} (expected 0).`,
    rawBytesRead: byteLength,
    id: idStr,
    idHex,
    isKnownMagic: true,
    checksum,
    checksumHex,
    calculatedSum: sum,
    version,
    sequenceNumber,
    dateCreated,
    dateCreatedRaw,
    flags,
    flagsHex,
    flagsBinary,
    totalBlocks,
    blockSize,
    bitmapBase,
    adminSpaceContainer,
    rootObjectContainer,
    extentBnodeRoot,
    ownBlock,
    firstByte,
    lastByte,
    volumeSizeBytes,
  };
}

/**
 * Safely reads a Blob or File slice as an ArrayBuffer, using Blob.arrayBuffer or FileReader.
 *
 * @param {Blob} blob
 * @returns {Promise<ArrayBuffer>}
 */
export function readBlobAsArrayBuffer(blob) {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file slice.'));
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * Reads only the first 4096 bytes of a File/Blob through `File.slice` and parses the root block.
 * Never reads the full file and performs no network access.
 *
 * @param {Blob | File} file - The file or blob to inspect.
 * @returns {Promise<object>} The parsed root block result.
 */
export async function readRootBlockFromBlob(file) {
  if (!file || typeof file.slice !== 'function') {
    throw new TypeError('Expected a File or Blob object.');
  }
  const slice = file.slice(0, MAX_SLICE_SIZE);
  const arrayBuffer = await readBlobAsArrayBuffer(slice);
  return parseSfsRootBlock(arrayBuffer);
}
