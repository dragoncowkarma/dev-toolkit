/**
 * Utility functions for parsing and inspecting HFS+ and HFSX Volume Headers.
 * Based on Apple TN1150: HFS Plus Volume Format.
 */

export const HFS_PLUS_SIGNATURE = 0x482b; // 'H+'
export const HFSX_SIGNATURE = 0x4858; // 'HX'
export const VOLUME_HEADER_OFFSET = 1024;
export const VOLUME_HEADER_SIZE = 512;

// Difference in seconds between classic Mac OS epoch (1904-01-01) and Unix epoch (1970-01-01).
export const HFS_EPOCH_DIFF_SECONDS = 2082844800;

export const ATTRIBUTE_FLAGS = [
  { bit: 7, mask: 0x00000080, key: 'hardwareLock', label: 'Hardware Lock' },
  { bit: 8, mask: 0x00000100, key: 'unmounted', label: 'Unmounted Cleanly' },
  { bit: 9, mask: 0x00000200, key: 'spareBlocks', label: 'Bad Blocks Spared' },
  { bit: 10, mask: 0x00000400, key: 'noCacheRequired', label: 'No Cache Required' },
  { bit: 11, mask: 0x00000800, key: 'bootVolumeInconsistent', label: 'Boot Volume Inconsistent' },
  { bit: 12, mask: 0x00001000, key: 'catalogNodeIDsReused', label: 'Catalog Node IDs Reused' },
  { bit: 13, mask: 0x00002000, key: 'journaled', label: 'Journaled' },
  { bit: 15, mask: 0x00008000, key: 'softwareLock', label: 'Software Lock' },
];

/**
 * Converts a hex string into a Uint8Array.
 * Strips whitespace, delimiters (: or -), and optional 0x prefixes.
 *
 * @param {string} hex
 * @returns {Uint8Array}
 */
export function hexToBytes(hex) {
  if (typeof hex !== 'string') {
    throw new TypeError('Hex input must be a string.');
  }
  const cleaned = hex.replace(/0x/gi, '').replace(/[\s:-]/g, '');
  if (cleaned.length === 0) {
    return new Uint8Array(0);
  }
  if (cleaned.length % 2 !== 0) {
    throw new Error('Hex string must have an even number of characters.');
  }
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) {
    throw new Error('Hex string contains invalid characters.');
  }
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes[i / 2] = parseInt(cleaned.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Formats a byte array into a hex string.
 *
 * @param {Uint8Array} bytes
 * @param {number} [maxBytes]
 * @returns {string}
 */
export function bytesToHex(bytes, maxBytes) {
  const slice = maxBytes ? bytes.subarray(0, maxBytes) : bytes;
  let hex = '';
  for (let i = 0; i < slice.length; i++) {
    hex += slice[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Converts classic Mac HFS timestamp (seconds since 1904-01-01 00:00:00 UTC) to Date.
 *
 * @param {number} timestamp
 * @returns {Date|null}
 */
export function hfsDateToDate(timestamp) {
  if (typeof timestamp !== 'number' || timestamp <= 0) {
    return null;
  }
  const unixSeconds = timestamp - HFS_EPOCH_DIFF_SECONDS;
  return new Date(unixSeconds * 1000);
}

/**
 * Converts a Date to classic Mac HFS timestamp.
 *
 * @param {Date} date
 * @returns {number}
 */
export function dateToHfsTimestamp(date) {
  const unixSeconds = Math.floor(date.getTime() / 1000);
  return unixSeconds + HFS_EPOCH_DIFF_SECONDS;
}

/**
 * Formats classic Mac HFS timestamp to human-readable ISO/UTC string.
 * When isLocal / { isLocal: true } is specified, formats as local/unknown-zone wall time
 * without asserting UTC.
 *
 * @param {number} timestamp
 * @param {boolean|object} [options]
 * @returns {string}
 */
export function formatHfsDate(timestamp, options = false) {
  const isLocal = typeof options === 'boolean' ? options : Boolean(options?.isLocal);
  const date = hfsDateToDate(timestamp);
  if (!date || isNaN(date.getTime())) {
    return 'None (0)';
  }
  const wallTime = date.toISOString().replace('.000Z', '');
  if (isLocal) {
    return `${wallTime} (Local / Unknown Zone)`;
  }
  return `${wallTime} UTC`;
}

/**
 * Formats classic Mac HFS local timestamp (such as volume createDate)
 * without asserting UTC.
 *
 * @param {number} timestamp
 * @returns {string}
 */
export function formatHfsLocalDate(timestamp) {
  return formatHfsDate(timestamp, { isLocal: true });
}

/**
 * Formats bytes or bigint into human-readable size string.
 *
 * @param {number|bigint} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  const b = typeof bytes === 'bigint' ? Number(bytes) : bytes;
  if (!Number.isFinite(b) || b < 0) return '0 B';
  if (b < 1024) return `${b} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let val = b / 1024;
  let unitIndex = 0;
  while (val >= 1024 && unitIndex < units.length - 1) {
    val /= 1024;
    unitIndex += 1;
  }
  return `${val.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Decodes the attributes bitfield into a dictionary of boolean flags.
 *
 * @param {number} attributes
 * @returns {Record<string, boolean>}
 */
export function decodeAttributes(attributes) {
  const flags = {};
  for (const flag of ATTRIBUTE_FLAGS) {
    flags[flag.key] = (attributes & flag.mask) !== 0;
  }
  return flags;
}

/**
 * Reads an 80-byte HFSPlusForkData structure from a DataView.
 *
 * @param {DataView} view
 * @param {number} offset
 * @param {string} name
 * @returns {object}
 */
function readForkData(view, offset, name) {
  const logicalSize = view.getBigUint64(offset, false);
  const clumpSize = view.getUint32(offset + 8, false);
  const totalBlocks = view.getUint32(offset + 12, false);

  const extents = [];
  for (let i = 0; i < 8; i++) {
    const descOffset = offset + 16 + i * 8;
    const startBlock = view.getUint32(descOffset, false);
    const blockCount = view.getUint32(descOffset + 4, false);
    extents.push({
      index: i,
      startBlock,
      blockCount,
    });
  }

  return {
    name,
    logicalSize,
    logicalSizeFormatted: formatBytes(logicalSize),
    clumpSize,
    totalBlocks,
    extents,
  };
}

/**
 * Decodes a 32-bit integer as a 4-character ASCII code if printable.
 *
 * @param {number} value
 * @returns {string}
 */
function formatFourCC(value) {
  const bytes = [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
  const isPrintable = bytes.every((b) => b >= 32 && b <= 126);
  if (isPrintable) {
    return String.fromCharCode(...bytes);
  }
  return `0x${value.toString(16).padStart(8, '0').toUpperCase()}`;
}

/**
 * Parses an HFS+ or HFSX Volume Header from byte data.
 *
 * @param {Uint8Array} bytes - Raw byte buffer (full volume buffer or 512-byte header slice).
 * @param {object} [options]
 * @param {number} [options.offset=1024] - Byte offset to the Volume Header in the volume.
 * @param {boolean} [options.strict=false] - Whether to throw on error diagnostics.
 * @param {boolean} [options.isSlice=false] - True if bytes is pre-sliced at offset.
 * @param {number} [options.fileSize] - Total file/disk image size if known.
 * @param {number} [options.headerOffset] - Read offset in bytes (defaults to 0 if isSlice).
 * @returns {object} Parsed volume header result.
 */
export function parseHfsVolumeHeader(bytes, options = {}) {
  const offset = options.offset ?? VOLUME_HEADER_OFFSET;
  const strict = options.strict ?? false;
  const isSlice = options.isSlice ?? false;
  const headerOffset = options.headerOffset !== undefined
    ? options.headerOffset
    : (isSlice ? 0 : offset);

  const totalLength = options.fileSize !== undefined
    ? options.fileSize
    : (isSlice ? offset + (bytes?.length ?? 0) : (bytes?.length ?? 0));

  const diagnostics = [];

  if (!bytes || !(bytes instanceof Uint8Array)) {
    const errorMsg = 'Invalid input: expected Uint8Array buffer.';
    if (strict) throw new Error(errorMsg);
    return {
      isValid: false,
      errors: [errorMsg],
      warnings: [],
      diagnostics: [{ severity: 'error', field: 'input', message: errorMsg }],
      header: null,
      derived: null,
    };
  }

  const requiredLength = offset + VOLUME_HEADER_SIZE;
  if (totalLength < requiredLength || bytes.length < headerOffset + VOLUME_HEADER_SIZE) {
    const errorMsg = `Truncated input: expected at least ${requiredLength} bytes ` +
      `(header at offset ${offset} requires 512 bytes), but received ${totalLength} bytes.`;
    if (strict) throw new Error(errorMsg);
    return {
      isValid: false,
      errors: [errorMsg],
      warnings: [],
      diagnostics: [{ severity: 'error', field: 'size', message: errorMsg }],
      header: null,
      derived: null,
    };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset + headerOffset, VOLUME_HEADER_SIZE);

  // Read fields
  const signatureRaw = view.getUint16(0, false);
  const version = view.getUint16(2, false);
  const attributes = view.getUint32(4, false);
  const lastMountedVersion = view.getUint32(8, false);
  const journalInfoBlock = view.getUint32(12, false);
  const createDate = view.getUint32(16, false);
  const modifyDate = view.getUint32(20, false);
  const backupDate = view.getUint32(24, false);
  const checkedDate = view.getUint32(28, false);
  const fileCount = view.getUint32(32, false);
  const folderCount = view.getUint32(36, false);
  const blockSize = view.getUint32(40, false);
  const totalBlocks = view.getUint32(44, false);
  const freeBlocks = view.getUint32(48, false);
  const nextAllocation = view.getUint32(52, false);
  const rsrcClumpSize = view.getUint32(56, false);
  const dataClumpSize = view.getUint32(60, false);
  const nextCatalogID = view.getUint32(64, false);
  const writeCount = view.getUint32(68, false);
  const encodingsBitmap = view.getBigUint64(72, false);

  const isHfsPlus = signatureRaw === HFS_PLUS_SIGNATURE;
  const isHfsX = signatureRaw === HFSX_SIGNATURE;

  let signatureType = 'Unknown';
  let signatureString = '';
  if (isHfsPlus) {
    signatureType = 'HFS+';
    signatureString = 'H+';
  } else if (isHfsX) {
    signatureType = 'HFSX';
    signatureString = 'HX';
  } else {
    const b1 = (signatureRaw >> 8) & 0xff;
    const b2 = signatureRaw & 0xff;
    signatureString = (b1 >= 32 && b1 <= 126 && b2 >= 32 && b2 <= 126)
      ? String.fromCharCode(b1, b2)
      : '??';
    diagnostics.push({
      severity: 'error',
      field: 'signature',
      message: `Bad signature: 0x${signatureRaw.toString(16).padStart(4, '0').toUpperCase()} ` +
        `("${signatureString}"). Expected 0x482B ("H+") or 0x4858 ("HX").`,
    });
  }

  // Validate block size (must be non-zero power of two)
  const isPowerOfTwo = blockSize > 0 && (blockSize & (blockSize - 1)) === 0;
  if (!isPowerOfTwo) {
    diagnostics.push({
      severity: 'error',
      field: 'blockSize',
      message: `Invalid block size: ${blockSize} bytes. ` +
        'Block size must be a non-zero power of two (typically 512, 1024, 2048, or 4096).',
    });
  } else if (blockSize < 512) {
    diagnostics.push({
      severity: 'warning',
      field: 'blockSize',
      message: `Unusual block size: ${blockSize} bytes is smaller than standard 512 bytes.`,
    });
  }

  // Validate freeBlocks <= totalBlocks
  if (freeBlocks > totalBlocks) {
    diagnostics.push({
      severity: 'error',
      field: 'freeBlocks',
      message: `Invalid free blocks count: freeBlocks (${freeBlocks}) ` +
        `cannot exceed totalBlocks (${totalBlocks}).`,
    });
  }

  // Read five fork data structures
  const allocationFile = readForkData(view, 112, 'Allocation File');
  const extentsFile = readForkData(view, 192, 'Extents Overflow File');
  const catalogFile = readForkData(view, 272, 'Catalog File');
  const attributesFile = readForkData(view, 352, 'Attributes File');
  const startupFile = readForkData(view, 432, 'Startup File');

  const attributeFlags = decodeAttributes(attributes);

  // Derived values
  const blockSizeBig = BigInt(blockSize || 0);
  const totalBlocksBig = BigInt(totalBlocks || 0);
  const freeBlocksBig = BigInt(freeBlocks || 0);

  const volumeSize = blockSizeBig * totalBlocksBig;
  const freeSpace = blockSizeBig * freeBlocksBig;
  const usedBlocks = totalBlocks >= freeBlocks ? totalBlocks - freeBlocks : 0;
  const usedSpace = blockSizeBig * BigInt(usedBlocks);
  const usedPercent = totalBlocks > 0
    ? ((usedBlocks / totalBlocks) * 100).toFixed(1) + '%'
    : '0.0%';

  const header = {
    offset,
    signatureRaw,
    signatureHex: `0x${signatureRaw.toString(16).padStart(4, '0').toUpperCase()}`,
    signatureString,
    signatureType,
    version,
    attributes,
    attributesHex: `0x${attributes.toString(16).padStart(8, '0').toUpperCase()}`,
    attributeFlags,
    lastMountedVersion,
    lastMountedVersionFormatted: formatFourCC(lastMountedVersion),
    journalInfoBlock,
    createDate,
    createDateFormatted: formatHfsLocalDate(createDate),
    modifyDate,
    modifyDateFormatted: formatHfsDate(modifyDate),
    backupDate,
    backupDateFormatted: formatHfsDate(backupDate),
    checkedDate,
    checkedDateFormatted: formatHfsDate(checkedDate),
    fileCount,
    folderCount,
    blockSize,
    totalBlocks,
    freeBlocks,
    nextAllocation,
    rsrcClumpSize,
    dataClumpSize,
    nextCatalogID,
    writeCount,
    encodingsBitmap: `0x${encodingsBitmap.toString(16).toUpperCase()}`,
    allocationFile,
    extentsFile,
    catalogFile,
    attributesFile,
    startupFile,
  };

  const derived = {
    volumeSizeBytes: volumeSize,
    volumeSizeFormatted: formatBytes(volumeSize),
    freeSpaceBytes: freeSpace,
    freeSpaceFormatted: formatBytes(freeSpace),
    usedSpaceBytes: usedSpace,
    usedSpaceFormatted: formatBytes(usedSpace),
    usedBlocks,
    usedPercent,
  };

  const errors = diagnostics.filter((d) => d.severity === 'error').map((d) => d.message);
  const warnings = diagnostics.filter((d) => d.severity === 'warning').map((d) => d.message);
  const isValid = errors.length === 0;

  if (strict && !isValid) {
    throw new Error(errors.join('; '));
  }

  return {
    isValid,
    errors,
    warnings,
    diagnostics,
    header,
    derived,
  };
}

/**
 * Creates a synthetic HFS+ or HFSX volume buffer for testing and demo purposes.
 *
 * @param {object} [options]
 * @returns {Uint8Array}
 */
export function createSampleHfsHeader(options = {}) {
  const {
    signature = HFS_PLUS_SIGNATURE,
    version = 4,
    attributes = 0x00002100, // journaled + unmounted
    lastMountedVersion = 0x38383130, // '8810'
    journalInfoBlock = 25,
    createDate = 3660681600, // 2020-01-01 00:00:00 UTC
    modifyDate = 3700000000,
    backupDate = 0,
    checkedDate = 3700000000,
    fileCount = 1520,
    folderCount = 124,
    blockSize = 4096,
    totalBlocks = 262144, // 1 GB volume
    freeBlocks = 180000,
    nextAllocation = 82144,
    rsrcClumpSize = 65536,
    dataClumpSize = 65536,
    nextCatalogID = 25000,
    writeCount = 42,
    offset = VOLUME_HEADER_OFFSET,
    totalLength = offset + VOLUME_HEADER_SIZE,
  } = options;

  const buffer = new Uint8Array(totalLength);
  const view = new DataView(buffer.buffer);

  view.setUint16(offset, signature, false);
  view.setUint16(offset + 2, version, false);
  view.setUint32(offset + 4, attributes, false);
  view.setUint32(offset + 8, lastMountedVersion, false);
  view.setUint32(offset + 12, journalInfoBlock, false);
  view.setUint32(offset + 16, createDate, false);
  view.setUint32(offset + 20, modifyDate, false);
  view.setUint32(offset + 24, backupDate, false);
  view.setUint32(offset + 28, checkedDate, false);
  view.setUint32(offset + 32, fileCount, false);
  view.setUint32(offset + 36, folderCount, false);
  view.setUint32(offset + 40, blockSize, false);
  view.setUint32(offset + 44, totalBlocks, false);
  view.setUint32(offset + 48, freeBlocks, false);
  view.setUint32(offset + 52, nextAllocation, false);
  view.setUint32(offset + 56, rsrcClumpSize, false);
  view.setUint32(offset + 60, dataClumpSize, false);
  view.setUint32(offset + 64, nextCatalogID, false);
  view.setUint32(offset + 68, writeCount, false);

  // Setup catalog fork extents
  const catalogOffset = offset + 272;
  view.setBigUint64(catalogOffset, 10485760n, false);
  view.setUint32(catalogOffset + 8, 4096, false);
  view.setUint32(catalogOffset + 12, 2560, false);
  view.setUint32(catalogOffset + 16, 1000, false);
  view.setUint32(catalogOffset + 20, 2560, false);

  return buffer;
}
