/**
 * Constants and utility functions for parsing Minix filesystem superblocks (v1, v2, v3).
 */

export const MINIX_MAGIC = {
  V1_14: 0x137F,
  V1_30: 0x138F,
  V2_14: 0x2468,
  V2_30: 0x2478,
  V3: 0x4D5A,
};

export const MINIX_VARIANTS = {
  [MINIX_MAGIC.V1_14]: 'Minix v1 (14-byte names)',
  [MINIX_MAGIC.V1_30]: 'Minix v1 (30-byte names)',
  [MINIX_MAGIC.V2_14]: 'Minix v2 (14-byte names)',
  [MINIX_MAGIC.V2_30]: 'Minix v2 (30-byte names)',
  [MINIX_MAGIC.V3]: 'Minix v3',
};

export const MINIX_STATE_FLAGS = {
  VALID_FS: 0x0001,
  ERROR_FS: 0x0002,
};

export const SUPERBLOCK_OFFSET = 1024;
export const MIN_SUPERBLOCK_SIZE = 32;
export const MIN_REQUIRED_SIZE = SUPERBLOCK_OFFSET + MIN_SUPERBLOCK_SIZE;

/**
 * Formats a byte size into a human-readable string.
 *
 * @param {number} bytes - Number of bytes.
 * @returns {string} Human-readable byte size.
 */
export function formatFileSize(bytes) {
  if (typeof bytes !== 'number' || Number.isNaN(bytes) || bytes < 0) {
    return '0 B';
  }
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
 * Formats state flags into an unsigned hexadecimal string and descriptive summary.
 *
 * @param {number|null|undefined} state - The raw 16-bit state value.
 * @returns {{ rawHex: string, summary: string, flags: string[], unknownBits: number }}
 */
export function formatStateFlags(state) {
  if (state === null || state === undefined) {
    return {
      rawHex: 'N/A',
      summary: 'N/A (v3 has no state flags)',
      flags: [],
      unknownBits: 0,
    };
  }

  // Ensure state is treated as an unsigned 16-bit integer (0 to 65535).
  const unsignedState = (state & 0xFFFF) >>> 0;
  const rawHex = `0x${unsignedState.toString(16).toUpperCase().padStart(4, '0')}`;

  const flags = [];
  if (unsignedState & MINIX_STATE_FLAGS.VALID_FS) {
    flags.push('Clean/Valid (0x0001)');
  }
  if (unsignedState & MINIX_STATE_FLAGS.ERROR_FS) {
    flags.push('Errors (0x0002)');
  }

  const knownMask = MINIX_STATE_FLAGS.VALID_FS | MINIX_STATE_FLAGS.ERROR_FS;
  const unknownBits = (unsignedState & ~knownMask) >>> 0;
  if (unknownBits !== 0) {
    const unknownHex = `0x${unknownBits.toString(16).toUpperCase()}`;
    flags.push(`Unknown bits: ${unknownHex}`);
  }

  if (flags.length === 0) {
    flags.push('None (0x0000)');
  }

  return {
    rawHex,
    summary: flags.join(', '),
    flags,
    unknownBits,
  };
}

/**
 * Reads a File/Blob as an ArrayBuffer.
 *
 * @param {File|Blob} file - The file to read.
 * @returns {Promise<Uint8Array>}
 */
export function readFileBuffer(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No file provided.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      resolve(new Uint8Array(/** @type {ArrayBuffer} */ (reader.result)));
    };
    reader.onerror = () => reject(new Error('Failed to read the selected file.'));
    // Minix superblock is at byte 1024 and spans 32 bytes.
    // Reading up to 4096 bytes is fast and avoids huge memory usage on large images.
    const slice = file.slice(0, Math.min(file.size, 4096));
    reader.readAsArrayBuffer(slice);
  });
}

/**
 * Parses a Minix filesystem superblock from a buffer.
 *
 * @param {Uint8Array|ArrayBuffer} buffer - Buffer containing the superblock at offset 1024.
 * @returns {object} Decoded superblock fields.
 * @throws {Error} When data is empty, truncated, or has unknown magic.
 */
export function parseMinixSuperblock(buffer) {
  if (!buffer) {
    throw new Error('Input is empty.');
  }

  const bytes =
    buffer instanceof Uint8Array
      ? buffer
      : new Uint8Array(/** @type {ArrayBuffer} */ (buffer));

  if (bytes.byteLength === 0) {
    throw new Error('File is empty. Minix superblock requires at least 1056 bytes.');
  }

  if (bytes.byteLength < MIN_REQUIRED_SIZE) {
    throw new Error(
      `Truncated input: expected at least ${MIN_REQUIRED_SIZE} bytes ` +
      `(1024-byte boot block + 32-byte superblock), but got ${bytes.byteLength} bytes.`
    );
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Minix v1 / v2 magic is at offset 1024 + 16 (uint16 LE)
  const magic16 = view.getUint16(SUPERBLOCK_OFFSET + 16, true);
  // Minix v3 magic is at offset 1024 + 24 (uint16 LE)
  const magic24 = view.getUint16(SUPERBLOCK_OFFSET + 24, true);

  if (
    magic16 === MINIX_MAGIC.V1_14 ||
    magic16 === MINIX_MAGIC.V1_30 ||
    magic16 === MINIX_MAGIC.V2_14 ||
    magic16 === MINIX_MAGIC.V2_30
  ) {
    const isV1 = magic16 === MINIX_MAGIC.V1_14 || magic16 === MINIX_MAGIC.V1_30;
    const version = isV1 ? 1 : 2;
    const variant = MINIX_VARIANTS[magic16];

    const inodeCount = view.getUint16(SUPERBLOCK_OFFSET + 0, true);
    const nzones = view.getUint16(SUPERBLOCK_OFFSET + 2, true);
    const imapBlocks = view.getUint16(SUPERBLOCK_OFFSET + 4, true);
    const zmapBlocks = view.getUint16(SUPERBLOCK_OFFSET + 6, true);
    const firstDataZone = view.getUint16(SUPERBLOCK_OFFSET + 8, true);
    const logZoneSize = view.getUint16(SUPERBLOCK_OFFSET + 10, true);
    const maxFileSize = view.getUint32(SUPERBLOCK_OFFSET + 12, true);
    const magic = magic16;
    const state = view.getUint16(SUPERBLOCK_OFFSET + 18, true);
    const zones = view.getUint32(SUPERBLOCK_OFFSET + 20, true);

    const zoneCount = isV1 ? nzones : (zones || nzones);
    const stateInfo = formatStateFlags(state);

    return {
      variant,
      version,
      magic,
      magicHex: `0x${(magic >>> 0).toString(16).toUpperCase().padStart(4, '0')}`,
      inodeCount,
      zoneCount,
      imapBlocks,
      zmapBlocks,
      firstDataZone,
      logZoneSize,
      maxFileSize,
      state,
      stateHex: stateInfo.rawHex,
      stateDescription: stateInfo.summary,
      blockSize: 1024,
      v3BlockSize: null,
      diskVersion: null,
    };
  }

  if (magic24 === MINIX_MAGIC.V3) {
    const variant = MINIX_VARIANTS[MINIX_MAGIC.V3];
    const version = 3;
    const magic = magic24;

    const inodeCount = view.getUint32(SUPERBLOCK_OFFSET + 0, true);
    const imapBlocks = view.getUint16(SUPERBLOCK_OFFSET + 6, true);
    const zmapBlocks = view.getUint16(SUPERBLOCK_OFFSET + 8, true);
    const firstDataZone = view.getUint16(SUPERBLOCK_OFFSET + 10, true);
    const logZoneSize = view.getUint16(SUPERBLOCK_OFFSET + 12, true);
    const maxFileSize = view.getUint32(SUPERBLOCK_OFFSET + 16, true);
    const zoneCount = view.getUint32(SUPERBLOCK_OFFSET + 20, true);
    const blockSize = view.getUint16(SUPERBLOCK_OFFSET + 28, true);
    const diskVersion = view.getUint8(SUPERBLOCK_OFFSET + 30);
    const stateInfo = formatStateFlags(null);

    return {
      variant,
      version,
      magic,
      magicHex: `0x${(magic >>> 0).toString(16).toUpperCase().padStart(4, '0')}`,
      inodeCount,
      zoneCount,
      imapBlocks,
      zmapBlocks,
      firstDataZone,
      logZoneSize,
      maxFileSize,
      state: null,
      stateHex: stateInfo.rawHex,
      stateDescription: stateInfo.summary,
      blockSize,
      v3BlockSize: blockSize,
      diskVersion,
    };
  }

  const unknownMagicHex = `0x${(magic16 >>> 0).toString(16).toUpperCase().padStart(4, '0')}`;
  throw new Error(`Unknown magic: ${unknownMagicHex}. Not a recognized Minix superblock.`);
}

/**
 * Creates a valid synthetic Minix superblock buffer for testing and built-in samples.
 *
 * @param {number} magic - Superblock magic value.
 * @param {object} [overrides] - Optional field overrides.
 * @returns {Uint8Array}
 */
export function createSampleMinixSuperblock(magic, overrides = {}) {
  const totalSize = overrides.totalSize ?? MIN_REQUIRED_SIZE;
  const bytes = new Uint8Array(totalSize);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (
    magic === MINIX_MAGIC.V1_14 ||
    magic === MINIX_MAGIC.V1_30 ||
    magic === MINIX_MAGIC.V2_14 ||
    magic === MINIX_MAGIC.V2_30
  ) {
    const isV1 = magic === MINIX_MAGIC.V1_14 || magic === MINIX_MAGIC.V1_30;
    const ninodes = overrides.inodeCount ?? (isV1 ? 512 : 1024);
    const zones = overrides.zoneCount ?? (isV1 ? 1440 : 2880);
    const nzones = overrides.nzones ?? (isV1 ? zones : 0);
    const imapBlocks = overrides.imapBlocks ?? 1;
    const zmapBlocks = overrides.zmapBlocks ?? (isV1 ? 1 : 2);
    const firstDataZone = overrides.firstDataZone ?? (isV1 ? 18 : 34);
    const logZoneSize = overrides.logZoneSize ?? 0;
    const maxFileSize = overrides.maxFileSize ?? (isV1 ? 268966912 : 1073741824);
    const state = overrides.state ?? MINIX_STATE_FLAGS.VALID_FS;

    view.setUint16(SUPERBLOCK_OFFSET + 0, ninodes, true);
    view.setUint16(SUPERBLOCK_OFFSET + 2, nzones, true);
    view.setUint16(SUPERBLOCK_OFFSET + 4, imapBlocks, true);
    view.setUint16(SUPERBLOCK_OFFSET + 6, zmapBlocks, true);
    view.setUint16(SUPERBLOCK_OFFSET + 8, firstDataZone, true);
    view.setUint16(SUPERBLOCK_OFFSET + 10, logZoneSize, true);
    view.setUint32(SUPERBLOCK_OFFSET + 12, maxFileSize, true);
    view.setUint16(SUPERBLOCK_OFFSET + 16, magic, true);
    view.setUint16(SUPERBLOCK_OFFSET + 18, state, true);
    view.setUint32(SUPERBLOCK_OFFSET + 20, zones, true);
  } else if (magic === MINIX_MAGIC.V3) {
    const ninodes = overrides.inodeCount ?? 4096;
    const imapBlocks = overrides.imapBlocks ?? 2;
    const zmapBlocks = overrides.zmapBlocks ?? 4;
    const firstDataZone = overrides.firstDataZone ?? 128;
    const logZoneSize = overrides.logZoneSize ?? 0;
    const maxFileSize = overrides.maxFileSize ?? 2147483647;
    const zones = overrides.zoneCount ?? 65536;
    const blockSize = overrides.blockSize ?? 1024;
    const diskVersion = overrides.diskVersion ?? 0;

    view.setUint32(SUPERBLOCK_OFFSET + 0, ninodes, true);
    view.setUint16(SUPERBLOCK_OFFSET + 4, 0, true); // s_pad0
    view.setUint16(SUPERBLOCK_OFFSET + 6, imapBlocks, true);
    view.setUint16(SUPERBLOCK_OFFSET + 8, zmapBlocks, true);
    view.setUint16(SUPERBLOCK_OFFSET + 10, firstDataZone, true);
    view.setUint16(SUPERBLOCK_OFFSET + 12, logZoneSize, true);
    view.setUint16(SUPERBLOCK_OFFSET + 14, 0, true); // s_pad1
    view.setUint32(SUPERBLOCK_OFFSET + 16, maxFileSize, true);
    view.setUint32(SUPERBLOCK_OFFSET + 20, zones, true);
    view.setUint16(SUPERBLOCK_OFFSET + 24, magic, true);
    view.setUint16(SUPERBLOCK_OFFSET + 26, 0, true); // s_pad2
    view.setUint16(SUPERBLOCK_OFFSET + 28, blockSize, true);
    view.setUint8(SUPERBLOCK_OFFSET + 30, diskVersion);
  }

  return bytes;
}

export const SAMPLES = {
  v1_14: {
    key: 'v1_14',
    name: 'Minix v1 (14-byte names, 0x137F)',
    buffer: createSampleMinixSuperblock(MINIX_MAGIC.V1_14),
  },
  v1_30: {
    key: 'v1_30',
    name: 'Minix v1 (30-byte names, 0x138F)',
    buffer: createSampleMinixSuperblock(MINIX_MAGIC.V1_30),
  },
  v2_14: {
    key: 'v2_14',
    name: 'Minix v2 (14-byte names, 0x2468)',
    buffer: createSampleMinixSuperblock(MINIX_MAGIC.V2_14),
  },
  v2_30: {
    key: 'v2_30',
    name: 'Minix v2 (30-byte names, 0x2478)',
    buffer: createSampleMinixSuperblock(MINIX_MAGIC.V2_30),
  },
  v3: {
    key: 'v3',
    name: 'Minix v3 (0x4D5A)',
    buffer: createSampleMinixSuperblock(MINIX_MAGIC.V3),
  },
};
