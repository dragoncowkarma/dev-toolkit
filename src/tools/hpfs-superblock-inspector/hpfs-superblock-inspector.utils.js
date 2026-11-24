/**
 * HPFS (High Performance File System) Superblock Inspector Utilities.
 * Handles parsing of OS/2 HPFS boot blocks, superblocks, and spare blocks.
 */

export const HPFS_SB_MAGIC = 0xf995e849;
export const HPFS_SB_MAGIC1 = 0xfa53e9c5;
export const HPFS_SP_MAGIC = 0xf9911849;
export const HPFS_SP_MAGIC1 = 0xfa5229c5;
export const HPFS_BOOT_MAGIC = 0xaa55;
export const HPFS_SECTOR_SIZE = 512;
export const HPFS_SUPERBLOCK_OFFSET = 0x2000; // Sector 16 (8192 bytes)
export const HPFS_SPAREBLOCK_OFFSET = 0x2200; // Sector 17 (8704 bytes)

/**
 * Converts a hexadecimal string into a Uint8Array.
 * Strips whitespace, 0x prefixes, and delimiters.
 *
 * @param {string} hex - Hexadecimal string.
 * @returns {Uint8Array} Parsed byte array.
 * @throws {TypeError|Error} When input is invalid or contains non-hex characters.
 */
export function hexToBytes(hex) {
  if (typeof hex !== 'string') {
    throw new TypeError('Hex input must be a string.');
  }
  const cleaned = hex.replace(/0x/gi, '').replace(/[\s,:-]/g, '');
  if (cleaned.length === 0) {
    return new Uint8Array(0);
  }
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) {
    throw new Error('Invalid hexadecimal characters in input.');
  }
  if (cleaned.length % 2 !== 0) {
    throw new Error('Odd number of hexadecimal digits.');
  }
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes[i / 2] = parseInt(cleaned.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Converts a Uint8Array into a formatted hexadecimal string.
 *
 * @param {Uint8Array} bytes
 * @param {string} [separator=' ']
 * @returns {string}
 */
export function bytesToHex(bytes, separator = ' ') {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError('Input must be a Uint8Array.');
  }
  const parts = [];
  for (let i = 0; i < bytes.length; i += 1) {
    parts.push(bytes[i].toString(16).padStart(2, '0').toUpperCase());
  }
  return parts.join(separator);
}

/**
 * Parses a byte offset from a string or number.
 * Supports decimal and hex (e.g. "0x2000", "2000h", or "8192").
 * Validates the full string without allowing trailing garbage and checks safe integer boundaries.
 *
 * @param {string|number|null|undefined} value
 * @returns {number} Non-negative byte offset.
 * @throws {TypeError|Error} If offset is invalid or negative.
 */
export function parseByteOffset(value) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error('Invalid byte offset. Must be a non-negative integer.');
    }
    return value;
  }
  if (typeof value !== 'string') {
    throw new TypeError('Byte offset must be a string or number.');
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return 0;
  }

  let parsed;
  if (/^0x[0-9a-fA-F]+$/i.test(trimmed)) {
    parsed = parseInt(trimmed.slice(2), 16);
  } else if (/^[0-9a-fA-F]+h$/i.test(trimmed)) {
    parsed = parseInt(trimmed.slice(0, -1), 16);
  } else if (/^\d+$/.test(trimmed)) {
    parsed = parseInt(trimmed, 10);
  } else {
    throw new Error('Invalid byte offset. Must be a non-negative integer.');
  }

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error('Invalid byte offset. Must be a non-negative integer.');
  }
  return parsed;
}

/**
 * Formats a byte count into a human-readable string (e.g. "512 B", "12.3 KB", "1.5 MB").
 *
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Reads a slice of a File or Blob asynchronously.
 *
 * @param {File|Blob} file
 * @param {number} offset
 * @param {number} length
 * @returns {Promise<Uint8Array>}
 */
export function readSlice(file, offset = 0, length = 16384) {
  return new Promise((resolve, reject) => {
    if (!file || typeof file.slice !== 'function') {
      reject(new TypeError('Invalid file object.'));
      return;
    }
    const safeOffset = Math.max(0, offset);
    const slice = file.slice(safeOffset, safeOffset + length);
    const reader = new FileReader();
    reader.onload = () => {
      const arrayBuffer = /** @type {ArrayBuffer} */ (reader.result);
      resolve(new Uint8Array(arrayBuffer));
    };
    reader.onerror = () => {
      reject(new Error('Failed to read the selected file slice.'));
    };
    reader.readAsArrayBuffer(slice);
  });
}

/**
 * Parses an HPFS Boot Block (Sector 0, 512 bytes).
 *
 * @param {Uint8Array} bytes
 * @param {number} [offset=0]
 * @returns {object|null} Parsed boot block or null if signature is absent.
 */
export function parseHpfsBootBlock(bytes, offset = 0) {
  if (bytes.length < offset + HPFS_SECTOR_SIZE) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const bootMagic = view.getUint16(offset + 510, true);
  if (bootMagic !== HPFS_BOOT_MAGIC) {
    return null;
  }

  const bytesPerSector = view.getUint16(offset + 11, true);
  if (bytesPerSector !== HPFS_SECTOR_SIZE) {
    return null;
  }

  // Extract OEM ID (offset 3, 8 chars)
  let oemId = '';
  for (let i = 0; i < 8; i += 1) {
    const code = bytes[offset + 3 + i];
    if (code >= 32 && code <= 126) oemId += String.fromCharCode(code);
  }

  // Extract volume label (offset 43, 11 chars)
  let volumeLabel = '';
  for (let i = 0; i < 11; i += 1) {
    const code = bytes[offset + 43 + i];
    if (code >= 32 && code <= 126) volumeLabel += String.fromCharCode(code);
  }

  // Extract file system signature (offset 54, 8 chars, usually "HPFS    ")
  let systemId = '';
  for (let i = 0; i < 8; i += 1) {
    const code = bytes[offset + 54 + i];
    if (code >= 32 && code <= 126) systemId += String.fromCharCode(code);
  }

  const sectorsPerCluster = view.getUint8(offset + 13);
  const reservedSectors = view.getUint16(offset + 14, true);
  const fatsCount = view.getUint8(offset + 16);
  const rootDirEntries = view.getUint16(offset + 17, true);
  const sectorsSmall = view.getUint16(offset + 19, true);
  const mediaByte = view.getUint8(offset + 21);
  const sectorsPerTrack = view.getUint16(offset + 24, true);
  const heads = view.getUint16(offset + 26, true);
  const hiddenSectors = view.getUint32(offset + 28, true);
  const sectorsLarge = view.getUint32(offset + 32, true);
  const driveNumber = view.getUint8(offset + 36);
  const signature28h = view.getUint8(offset + 38);
  const volumeSerialNumber = view.getUint32(offset + 39, true);

  return {
    bootMagicHex: `0x${bootMagic.toString(16).toUpperCase()}`,
    oemId: oemId.trim(),
    bytesPerSector,
    sectorsPerCluster,
    reservedSectors,
    fatsCount,
    rootDirEntries,
    mediaByteHex: `0x${mediaByte.toString(16).toUpperCase().padStart(2, '0')}`,
    sectorsPerTrack,
    heads,
    hiddenSectors,
    totalSectors: sectorsLarge || sectorsSmall,
    driveNumberHex: `0x${driveNumber.toString(16).toUpperCase().padStart(2, '0')}`,
    signatureByte: signature28h,
    volumeSerialNumberHex: `0x${volumeSerialNumber.toString(16).toUpperCase().padStart(8, '0')}`,
    volumeLabel: volumeLabel.trim(),
    systemId: systemId.trim(),
  };
}

/**
 * Parses an HPFS Spare Block (Sector 17, 512 bytes) according to Linux fs/hpfs/hpfs.h.
 *
 * @param {Uint8Array} bytes
 * @param {number} [offset=0]
 * @returns {object|null}
 */
export function parseHpfsSpareBlock(bytes, offset = 0) {
  if (bytes.length < offset + HPFS_SECTOR_SIZE) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(offset + 0, true);
  const magic1 = view.getUint32(offset + 4, true);

  if (magic !== HPFS_SP_MAGIC || magic1 !== HPFS_SP_MAGIC1) {
    return null;
  }

  const flags = view.getUint8(offset + 8);
  const dirty = Boolean(flags & 0x01);
  const spareDirUsed = Boolean(flags & 0x02);
  const hotfixesUsed = Boolean(flags & 0x04);
  const badSector = Boolean(flags & 0x08);
  const badBitmap = Boolean(flags & 0x10);
  const fast = Boolean(flags & 0x20);

  const hotfixMap = view.getUint32(offset + 12, true);
  const usedHotfixes = view.getUint32(offset + 16, true);
  const totalHotfixes = view.getUint32(offset + 20, true);
  const freeDnodeSpares = view.getUint32(offset + 24, true);
  const totalDnodeSpares = view.getUint32(offset + 28, true);
  const codePageDir = view.getUint32(offset + 32, true);
  const nCodePages = view.getUint32(offset + 36, true);
  const superCrc = view.getUint32(offset + 40, true);
  const spareCrc = view.getUint32(offset + 44, true);

  return {
    magicHex: `0x${magic.toString(16).toUpperCase()}`,
    magic1Hex: `0x${magic1.toString(16).toUpperCase()}`,
    dirty,
    spareDirUsed,
    hotfixesUsed,
    badSector,
    badBitmap,
    fast,
    hotfixMap,
    usedHotfixes,
    totalHotfixes,
    freeDnodeSpares,
    totalDnodeSpares,
    codePageDir,
    nCodePages,
    superCrc,
    superCrcHex: `0x${superCrc.toString(16).toUpperCase().padStart(8, '0')}`,
    spareCrc,
    spareCrcHex: `0x${spareCrc.toString(16).toUpperCase().padStart(8, '0')}`,
  };
}

/**
 * Parses HPFS superblock and optional accompanying boot/spare blocks.
 *
 * @param {Uint8Array|ArrayBuffer} input
 * @param {object} [options={}]
 * @param {number|string} [options.offset=0] - Optional byte offset to superblock inside input.
 * @param {number|string} [options.baseOffset=0] - Optional absolute base offset
 *   of the slice within the file.
 * @param {object|null} [options.bootBlock=null] - Pre-parsed boot block if read separately.
 * @returns {object} Result object containing ok, data, error, and diagnostics.
 */
export function parseHpfsSuperblock(input, options = {}) {
  if (!input) {
    const error = 'No input data provided.';
    return { ok: false, error, diagnostics: [error] };
  }

  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length === 0) {
    const error = 'Input data is empty. Please provide HPFS image data or superblock hex.';
    return { ok: false, error, diagnostics: [error] };
  }

  let sbOffset;
  try {
    sbOffset = parseByteOffset(options.offset);
  } catch (err) {
    return { ok: false, error: err.message, diagnostics: [err.message] };
  }

  let baseOffset = 0;
  if (options.baseOffset !== undefined && options.baseOffset !== null) {
    try {
      baseOffset = parseByteOffset(options.baseOffset);
    } catch (err) {
      return { ok: false, error: err.message, diagnostics: [err.message] };
    }
  }

  // Auto-detect: If offset is 0 and baseOffset is 0, but offset 0x2000 contains
  // the superblock signature, automatically locate superblock at sector 16.
  if (
    sbOffset === 0 &&
    baseOffset === 0 &&
    bytes.length >= HPFS_SUPERBLOCK_OFFSET + 8
  ) {
    const viewProbe = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const magicAt0 = viewProbe.getUint32(0, true);
    const magicAt2000 = viewProbe.getUint32(HPFS_SUPERBLOCK_OFFSET, true);
    if (magicAt0 !== HPFS_SB_MAGIC && magicAt2000 === HPFS_SB_MAGIC) {
      sbOffset = HPFS_SUPERBLOCK_OFFSET;
    }
  }

  // Check truncation
  if (bytes.length < sbOffset + HPFS_SECTOR_SIZE) {
    const error =
      `Truncated input: buffer length (${bytes.length} bytes) is too short ` +
      `for HPFS superblock (expected at least ${sbOffset + HPFS_SECTOR_SIZE} bytes).`;
    return { ok: false, error, diagnostics: [error] };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(sbOffset + 0, true);
  const magic1 = view.getUint32(sbOffset + 4, true);

  // Validate magic signatures
  if (magic !== HPFS_SB_MAGIC || magic1 !== HPFS_SB_MAGIC1) {
    const expectedSig =
      `0x${HPFS_SB_MAGIC.toString(16).toUpperCase()} / ` +
      `0x${HPFS_SB_MAGIC1.toString(16).toUpperCase()}`;
    const foundSig =
      `0x${magic.toString(16).toUpperCase()} / ` +
      `0x${magic1.toString(16).toUpperCase()}`;
    const error =
      `Invalid HPFS superblock signature: expected ${expectedSig}, found ${foundSig}.`;
    return { ok: false, error, diagnostics: [error] };
  }

  // Validate version
  const version = view.getUint8(sbOffset + 8);
  const funcversion = view.getUint8(sbOffset + 9);
  if (version !== 2 && version !== 3) {
    const error =
      `Unknown HPFS version: ${version} ` +
      '(expected version 2 for standard HPFS or 3 for HPFS386).';
    return { ok: false, error, diagnostics: [error] };
  }

  // Extract superblock fields according to fs/hpfs/hpfs.h:
  // Offset 12: root directory fnode sector
  // Offset 16: total sector count
  // Offset 20: bad-block count
  // Offset 24: bitmap pointer sector
  // Offset 32: bad block list sector
  // Offset 40: last chkdsk timestamp
  // Offset 44: last optimize timestamp
  // Offset 48: directory band sector count
  // Offset 52: directory band start sector
  // Offset 56: directory band end sector
  // Offset 60: directory band bitmap sector
  // Offset 64..95: volume name (32 bytes)
  // Offset 96: user ID table sector
  const rootdir = view.getUint32(sbOffset + 12, true);
  const nSectors = view.getUint32(sbOffset + 16, true);
  const nBadblocks = view.getUint32(sbOffset + 20, true);
  const bitmaps = view.getUint32(sbOffset + 24, true);
  const badblocks = view.getUint32(sbOffset + 32, true);
  const lastChkdsk = view.getUint32(sbOffset + 40, true);
  const lastOptimize = view.getUint32(sbOffset + 44, true);
  const nDirBand = view.getUint32(sbOffset + 48, true);
  const dirBandStart = view.getUint32(sbOffset + 52, true);
  const dirBandEnd = view.getUint32(sbOffset + 56, true);
  const dirBandBitmap = view.getUint32(sbOffset + 60, true);

  // Extract volume name (offset 64, 32 bytes)
  let volumeName = '';
  for (let i = 0; i < 32; i += 1) {
    const code = bytes[sbOffset + 64 + i];
    if (code === 0) break;
    if (code >= 32 && code <= 126) volumeName += String.fromCharCode(code);
  }

  const userIdTable = view.getUint32(sbOffset + 96, true);

  const effectiveOffset = baseOffset + sbOffset;
  const effectiveSector = Math.floor(effectiveOffset / HPFS_SECTOR_SIZE);

  // Standard HPFS Spare Block is at sector 17
  const spareBlockSector = 17;

  // Optional boot block parsing (if partition boot sector is included in this buffer)
  let bootBlock = options.bootBlock || null;
  if (!bootBlock && sbOffset >= HPFS_SUPERBLOCK_OFFSET) {
    const candidateBootOffset = sbOffset - HPFS_SUPERBLOCK_OFFSET;
    if (bytes.length >= candidateBootOffset + HPFS_SECTOR_SIZE) {
      bootBlock = parseHpfsBootBlock(bytes, candidateBootOffset);
    }
  }

  // Optional spare block parsing (if sector 17 is included)
  let spareBlock = null;
  const spareOffsetCandidate = sbOffset + HPFS_SECTOR_SIZE;
  if (bytes.length >= spareOffsetCandidate + HPFS_SECTOR_SIZE) {
    spareBlock = parseHpfsSpareBlock(bytes, spareOffsetCandidate);
  }

  const totalBytes = nSectors * HPFS_SECTOR_SIZE;
  const dirBandBytes = nDirBand * HPFS_SECTOR_SIZE;

  const superblock = {
    offset: effectiveOffset,
    sector: effectiveSector,
    magicHex: `0x${magic.toString(16).toUpperCase()}`,
    magic1Hex: `0x${magic1.toString(16).toUpperCase()}`,
    version,
    functionalVersion: funcversion,
    rootFnodeSector: rootdir,
    totalSectors: nSectors,
    totalBytesFormatted: formatFileSize(totalBytes),
    badBlockCount: nBadblocks,
    bitmapPointerSector: bitmaps,
    badBlockListSector: badblocks,
    lastChkdsk,
    lastOptimize,
    spareBlockSector,
    dirBand: {
      sectorCount: nDirBand,
      startSector: dirBandStart,
      endSector: dirBandEnd,
      bitmapSector: dirBandBitmap,
      sizeFormatted: formatFileSize(dirBandBytes),
    },
    volumeName: volumeName.trim(),
    userIdTableSector: userIdTable,
  };

  return {
    ok: true,
    data: {
      superblock,
      bootBlock,
      spareBlock,
    },
    diagnostics: [],
  };
}

/**
 * Creates a valid HPFS superblock fixture as a Uint8Array according to Linux fs/hpfs/hpfs.h.
 *
 * @param {object} [overrides={}]
 * @returns {Uint8Array}
 */
export function createHpfsSuperblockBuffer(overrides = {}) {
  const buffer = new Uint8Array(HPFS_SECTOR_SIZE);
  const view = new DataView(buffer.buffer);

  const magic = overrides.magic !== undefined ? overrides.magic : HPFS_SB_MAGIC;
  const magic1 = overrides.magic1 !== undefined ? overrides.magic1 : HPFS_SB_MAGIC1;
  const version = overrides.version !== undefined ? overrides.version : 2;
  const funcversion = overrides.funcversion !== undefined ? overrides.funcversion : 2;
  const rootdir = overrides.rootdir !== undefined ? overrides.rootdir : 1200;
  const nSectors = overrides.nSectors !== undefined ? overrides.nSectors : 204800; // 100 MB
  const nBadblocks = overrides.nBadblocks !== undefined ? overrides.nBadblocks : 0;
  const bitmaps = overrides.bitmaps !== undefined ? overrides.bitmaps : 18;
  const badblocks = overrides.badblocks !== undefined ? overrides.badblocks : 0;
  const lastChkdsk = overrides.lastChkdsk !== undefined ? overrides.lastChkdsk : 0;
  const lastOptimize = overrides.lastOptimize !== undefined ? overrides.lastOptimize : 0;
  const nDirBand = overrides.nDirBand !== undefined ? overrides.nDirBand : 1600;
  const dirBandStart = overrides.dirBandStart !== undefined ? overrides.dirBandStart : 102400;
  const dirBandEnd = overrides.dirBandEnd !== undefined ? overrides.dirBandEnd : 103999;
  const dirBandBitmap =
    overrides.dirBandBitmap !== undefined
      ? overrides.dirBandBitmap
      : overrides.dirMap !== undefined
        ? overrides.dirMap
        : 120;
  const volumeName = overrides.volumeName !== undefined ? overrides.volumeName : 'OS2_HPFS';
  const userIdTable = overrides.userIdTable !== undefined ? overrides.userIdTable : 0;

  view.setUint32(0, magic, true);
  view.setUint32(4, magic1, true);
  view.setUint8(8, version);
  view.setUint8(9, funcversion);
  view.setUint16(10, 0, true);
  view.setUint32(12, rootdir, true);
  view.setUint32(16, nSectors, true);
  view.setUint32(20, nBadblocks, true);
  view.setUint32(24, bitmaps, true);
  view.setUint32(28, 0, true);
  view.setUint32(32, badblocks, true);
  view.setUint32(36, 0, true);
  view.setUint32(40, lastChkdsk, true);
  view.setUint32(44, lastOptimize, true);
  view.setUint32(48, nDirBand, true);
  view.setUint32(52, dirBandStart, true);
  view.setUint32(56, dirBandEnd, true);
  view.setUint32(60, dirBandBitmap, true);

  for (let i = 0; i < Math.min(32, volumeName.length); i += 1) {
    buffer[64 + i] = volumeName.charCodeAt(i);
  }

  view.setUint32(96, userIdTable, true);

  return buffer;
}

/**
 * Creates a valid HPFS spare block fixture as a Uint8Array according to Linux fs/hpfs/hpfs.h.
 *
 * @param {object} [overrides={}]
 * @returns {Uint8Array}
 */
export function createHpfsSpareBlockBuffer(overrides = {}) {
  const buffer = new Uint8Array(HPFS_SECTOR_SIZE);
  const view = new DataView(buffer.buffer);

  const magic = overrides.magic !== undefined ? overrides.magic : HPFS_SP_MAGIC;
  const magic1 = overrides.magic1 !== undefined ? overrides.magic1 : HPFS_SP_MAGIC1;
  const dirty = overrides.dirty !== undefined ? overrides.dirty : false;
  const spareDirUsed = overrides.spareDirUsed !== undefined ? overrides.spareDirUsed : false;
  const hotfixesUsed = overrides.hotfixesUsed !== undefined ? overrides.hotfixesUsed : false;
  const badSector = overrides.badSector !== undefined ? overrides.badSector : false;
  const badBitmap = overrides.badBitmap !== undefined ? overrides.badBitmap : false;
  const fast = overrides.fast !== undefined ? overrides.fast : false;

  let flags = 0;
  if (dirty) flags |= 0x01;
  if (spareDirUsed) flags |= 0x02;
  if (hotfixesUsed) flags |= 0x04;
  if (badSector) flags |= 0x08;
  if (badBitmap) flags |= 0x10;
  if (fast) flags |= 0x20;

  view.setUint32(0, magic, true);
  view.setUint32(4, magic1, true);
  buffer[8] = flags;

  view.setUint32(12, overrides.hotfixMap !== undefined ? overrides.hotfixMap : 0, true);
  view.setUint32(16, overrides.usedHotfixes !== undefined ? overrides.usedHotfixes : 0, true);
  view.setUint32(20, overrides.totalHotfixes !== undefined ? overrides.totalHotfixes : 0, true);
  view.setUint32(24, overrides.freeDnodeSpares !== undefined ? overrides.freeDnodeSpares : 0, true);
  view.setUint32(
    28,
    overrides.totalDnodeSpares !== undefined ? overrides.totalDnodeSpares : 0,
    true
  );
  view.setUint32(32, overrides.codePageDir !== undefined ? overrides.codePageDir : 0, true);
  view.setUint32(36, overrides.nCodePages !== undefined ? overrides.nCodePages : 0, true);
  view.setUint32(40, overrides.superCrc !== undefined ? overrides.superCrc : 0, true);
  view.setUint32(44, overrides.spareCrc !== undefined ? overrides.spareCrc : 0, true);

  return buffer;
}

/**
 * Creates an HPFS boot block fixture as a Uint8Array.
 *
 * @param {object} [overrides={}]
 * @returns {Uint8Array}
 */
export function createHpfsBootBlockBuffer(overrides = {}) {
  const buffer = new Uint8Array(HPFS_SECTOR_SIZE);
  const view = new DataView(buffer.buffer);

  buffer[0] = 0xeb;
  buffer[1] = 0x3c;
  buffer[2] = 0x90;

  const oemId = overrides.oemId !== undefined ? overrides.oemId : 'IBM 4.0';
  for (let i = 0; i < Math.min(8, oemId.length); i += 1) {
    buffer[3 + i] = oemId.charCodeAt(i);
  }

  view.setUint16(11, overrides.bytesPerSector || 512, true);
  buffer[13] = overrides.sectorsPerCluster || 1;
  view.setUint16(14, overrides.reservedSectors || 1, true);
  buffer[16] = overrides.fatsCount || 0;
  view.setUint16(17, overrides.rootDirEntries || 0, true);
  view.setUint16(19, overrides.sectorsSmall || 0, true);
  buffer[21] = overrides.mediaByte !== undefined ? overrides.mediaByte : 0xf8;
  view.setUint16(24, overrides.sectorsPerTrack || 32, true);
  view.setUint16(26, overrides.heads || 64, true);
  view.setUint32(28, overrides.hiddenSectors || 0, true);
  view.setUint32(32, overrides.sectorsLarge || 204800, true);

  buffer[36] = overrides.driveNumber !== undefined ? overrides.driveNumber : 0x80;
  buffer[38] = 0x28; // HPFS signature byte
  view.setUint32(
    39,
    overrides.volumeSerialNumber !== undefined ? overrides.volumeSerialNumber : 0x12345678,
    true
  );

  const volumeLabel = overrides.volumeLabel !== undefined ? overrides.volumeLabel : 'HPFS VOL';
  for (let i = 0; i < Math.min(11, volumeLabel.length); i += 1) {
    buffer[43 + i] = volumeLabel.charCodeAt(i);
  }

  const systemId = overrides.systemId !== undefined ? overrides.systemId : 'HPFS';
  for (let i = 0; i < Math.min(8, systemId.length); i += 1) {
    buffer[54 + i] = systemId.charCodeAt(i);
  }

  view.setUint16(510, HPFS_BOOT_MAGIC, true);

  return buffer;
}

/**
 * Creates a full HPFS partition image buffer containing Sector 0 (boot block),
 * Sector 16 (superblock), and Sector 17 (spare block).
 *
 * @param {object} [options={}]
 * @returns {Uint8Array}
 */
export function createHpfsPartitionImageBuffer(options = {}) {
  const totalSize = Math.max(18 * HPFS_SECTOR_SIZE, options.totalSize || 0);
  const image = new Uint8Array(totalSize);

  const bootBlock = createHpfsBootBlockBuffer(options.bootBlock);
  image.set(bootBlock, 0);

  const superblock = createHpfsSuperblockBuffer(options.superblock);
  image.set(superblock, HPFS_SUPERBLOCK_OFFSET);

  const spareBlock = createHpfsSpareBlockBuffer(options.spareBlock);
  image.set(spareBlock, HPFS_SPAREBLOCK_OFFSET);

  return image;
}

/**
 * Generates sample valid HPFS superblock hex string.
 *
 * @returns {string}
 */
export function createSampleHpfsSuperblockHex() {
  return bytesToHex(createHpfsSuperblockBuffer());
}
