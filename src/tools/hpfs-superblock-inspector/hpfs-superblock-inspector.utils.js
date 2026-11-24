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
 * Parses a byte offset from a string or number (supports decimal and hex e.g. "0x2000" or "8192").
 *
 * @param {string|number|null|undefined} value
 * @returns {number} Non-negative byte offset.
 * @throws {Error} If offset is invalid or negative.
 */
export function parseByteOffset(value) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
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
  if (/^0x/i.test(trimmed)) {
    parsed = parseInt(trimmed, 16);
  } else if (/^[0-9a-fA-F]+h$/i.test(trimmed)) {
    parsed = parseInt(trimmed.slice(0, -1), 16);
  } else {
    parsed = parseInt(trimmed, 10);
  }
  if (!Number.isFinite(parsed) || parsed < 0) {
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

  const bytesPerSector = view.getUint16(offset + 11, true);
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
 * Parses an HPFS Spare Block (Sector 17, 512 bytes).
 *
 * @param {Uint8Array} bytes
 * @param {number} offset
 * @returns {object|null}
 */
export function parseHpfsSpareBlock(bytes, offset) {
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

  const nUsedSpareSds = view.getUint8(offset + 9);
  const nFreeSpareSds = view.getUint16(offset + 10, true);
  const spareSecDir = view.getUint32(offset + 12, true);
  const nSpareSectors = view.getUint32(offset + 16, true);
  const codePageDir = view.getUint32(offset + 20, true);
  const nCodePages = view.getUint32(offset + 24, true);
  const superCrc = view.getUint32(offset + 28, true);
  const spareCrc = view.getUint32(offset + 32, true);

  return {
    magicHex: `0x${magic.toString(16).toUpperCase()}`,
    magic1Hex: `0x${magic1.toString(16).toUpperCase()}`,
    dirty,
    spareDirUsed,
    hotfixesUsed,
    badSector,
    badBitmap,
    fast,
    nUsedSpareSds,
    nFreeSpareSds,
    spareSecDir,
    nSpareSectors,
    codePageDir,
    nCodePages,
    superCrcHex: `0x${superCrc.toString(16).toUpperCase().padStart(8, '0')}`,
    spareCrcHex: `0x${spareCrc.toString(16).toUpperCase().padStart(8, '0')}`,
  };
}

/**
 * Parses HPFS superblock and optional accompanying boot/spare blocks.
 *
 * @param {Uint8Array|ArrayBuffer} input
 * @param {object} [options={}]
 * @param {number|string} [options.offset=0] - Optional byte offset to superblock.
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

  // Auto-detect: If offset is 0 but offset 0x2000 contains the superblock signature,
  // automatically locate the superblock at sector 16 (0x2000).
  if (
    sbOffset === 0 &&
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

  // Extract superblock fields
  const rootdir = view.getUint32(sbOffset + 12, true);
  const nSectors = view.getUint32(sbOffset + 16, true);
  const nBadblocks = view.getUint32(sbOffset + 20, true);
  const bitmaps = view.getUint32(sbOffset + 24, true);
  const pubir = view.getUint32(sbOffset + 28, true);
  const rootBitmap = view.getUint32(sbOffset + 32, true);
  const malBitmap = view.getUint32(sbOffset + 36, true);
  const hotfixes = view.getUint32(sbOffset + 40, true);
  const nHotfixes = view.getUint32(sbOffset + 44, true);
  const dpB = view.getUint32(sbOffset + 48, true);
  const dep = view.getUint32(sbOffset + 52, true);
  const nDirBand = view.getUint32(sbOffset + 56, true);
  const dirBandStart = view.getUint32(sbOffset + 60, true);
  const dirBandEnd = view.getUint32(sbOffset + 64, true);
  const dirMap = view.getUint32(sbOffset + 68, true);

  // Extract volume name (offset 72, 32 bytes)
  let volumeName = '';
  for (let i = 0; i < 32; i += 1) {
    const code = bytes[sbOffset + 72 + i];
    if (code === 0) break;
    if (code >= 32 && code <= 126) volumeName += String.fromCharCode(code);
  }

  const fnodeBitmap = view.getUint32(sbOffset + 104, true);
  const checkpoints = view.getUint32(sbOffset + 108, true);
  const permBitmap = view.getUint32(sbOffset + 112, true);

  // Standard HPFS Spare Block is at sector 17
  const spareBlockSector = 17;

  // Optional boot block parsing (if sector 0 is included)
  let bootBlock = null;
  if (sbOffset >= HPFS_SECTOR_SIZE && bytes.length >= HPFS_SECTOR_SIZE) {
    bootBlock = parseHpfsBootBlock(bytes, 0);
  }

  // Optional spare block parsing (if sector 17 is included)
  let spareBlock = null;
  const spareOffsetCandidate =
    sbOffset === HPFS_SUPERBLOCK_OFFSET
      ? HPFS_SPAREBLOCK_OFFSET
      : sbOffset + HPFS_SECTOR_SIZE;
  if (bytes.length >= spareOffsetCandidate + HPFS_SECTOR_SIZE) {
    spareBlock = parseHpfsSpareBlock(bytes, spareOffsetCandidate);
  }

  const totalBytes = nSectors * HPFS_SECTOR_SIZE;
  const dirBandBytes = nDirBand * HPFS_SECTOR_SIZE;

  const superblock = {
    offset: sbOffset,
    sector: Math.floor(sbOffset / HPFS_SECTOR_SIZE),
    magicHex: `0x${magic.toString(16).toUpperCase()}`,
    magic1Hex: `0x${magic1.toString(16).toUpperCase()}`,
    version,
    functionalVersion: funcversion,
    rootFnodeSector: rootdir,
    totalSectors: nSectors,
    totalBytesFormatted: formatFileSize(totalBytes),
    badBlockCount: nBadblocks,
    bitmapPointerSector: bitmaps,
    spareBlockSector,
    pubir,
    rootBitmapSector: rootBitmap,
    malBitmapSector: malBitmap,
    hotfixMapSector: hotfixes,
    hotfixCount: nHotfixes,
    dpB,
    dep,
    dirBand: {
      sectorCount: nDirBand,
      startSector: dirBandStart,
      endSector: dirBandEnd,
      bitmapSector: dirMap,
      sizeFormatted: formatFileSize(dirBandBytes),
    },
    volumeName: volumeName.trim(),
    fnodeBitmapSector: fnodeBitmap,
    checkpointsSector: checkpoints,
    permBitmapSector: permBitmap,
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
 * Creates a valid HPFS superblock fixture as a Uint8Array.
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
  const pubir = overrides.pubir !== undefined ? overrides.pubir : 0;
  const rootBitmap = overrides.rootBitmap !== undefined ? overrides.rootBitmap : 20;
  const malBitmap = overrides.malBitmap !== undefined ? overrides.malBitmap : 22;
  const hotfixes = overrides.hotfixes !== undefined ? overrides.hotfixes : 24;
  const nHotfixes = overrides.nHotfixes !== undefined ? overrides.nHotfixes : 0;
  const dpB = overrides.dpB !== undefined ? overrides.dpB : 4;
  const dep = overrides.dep !== undefined ? overrides.dep : 0;
  const nDirBand = overrides.nDirBand !== undefined ? overrides.nDirBand : 1600;
  const dirBandStart = overrides.dirBandStart !== undefined ? overrides.dirBandStart : 102400;
  const dirBandEnd = overrides.dirBandEnd !== undefined ? overrides.dirBandEnd : 103999;
  const dirMap = overrides.dirMap !== undefined ? overrides.dirMap : 102400;
  const volumeName = overrides.volumeName !== undefined ? overrides.volumeName : 'OS2_HPFS';
  const fnodeBitmap = overrides.fnodeBitmap !== undefined ? overrides.fnodeBitmap : 26;
  const checkpoints = overrides.checkpoints !== undefined ? overrides.checkpoints : 0;
  const permBitmap = overrides.permBitmap !== undefined ? overrides.permBitmap : 0;

  view.setUint32(0, magic, true);
  view.setUint32(4, magic1, true);
  view.setUint8(8, version);
  view.setUint8(9, funcversion);
  view.setUint16(10, 0, true);
  view.setUint32(12, rootdir, true);
  view.setUint32(16, nSectors, true);
  view.setUint32(20, nBadblocks, true);
  view.setUint32(24, bitmaps, true);
  view.setUint32(28, pubir, true);
  view.setUint32(32, rootBitmap, true);
  view.setUint32(36, malBitmap, true);
  view.setUint32(40, hotfixes, true);
  view.setUint32(44, nHotfixes, true);
  view.setUint32(48, dpB, true);
  view.setUint32(52, dep, true);
  view.setUint32(56, nDirBand, true);
  view.setUint32(60, dirBandStart, true);
  view.setUint32(64, dirBandEnd, true);
  view.setUint32(68, dirMap, true);

  for (let i = 0; i < Math.min(32, volumeName.length); i += 1) {
    buffer[72 + i] = volumeName.charCodeAt(i);
  }

  view.setUint32(104, fnodeBitmap, true);
  view.setUint32(108, checkpoints, true);
  view.setUint32(112, permBitmap, true);

  return buffer;
}

/**
 * Generates sample valid HPFS superblock hex string.
 *
 * @returns {string}
 */
export function createSampleHpfsSuperblockHex() {
  return bytesToHex(createHpfsSuperblockBuffer());
}
