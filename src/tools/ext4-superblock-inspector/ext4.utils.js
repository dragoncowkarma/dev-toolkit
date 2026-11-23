/**
 * @file ext4.utils.js
 * Pure utility functions for parsing and inspecting ext2/ext3/ext4 filesystem superblocks.
 */

export const SUPERBLOCK_OFFSET = 1024;
export const SUPERBLOCK_SIZE = 1024;
export const MIN_IMAGE_SIZE = 2048;
export const EXT_MAGIC = 0xEF53;

export const FEATURE_COMPAT = Object.freeze({
  0x0001: 'dir_prealloc',
  0x0002: 'imagic_inodes',
  0x0004: 'has_journal',
  0x0008: 'ext_attr',
  0x0010: 'resize_inode',
  0x0020: 'dir_index',
  0x0040: 'lazy_bg',
  0x0080: 'exclude_inode',
  0x0100: 'exclude_bitmap',
  0x0200: 'sparse_super2',
  0x0400: 'fast_commit',
});

export const FEATURE_INCOMPAT = Object.freeze({
  0x0001: 'compression',
  0x0002: 'filetype',
  0x0004: 'recover',
  0x0008: 'journal_dev',
  0x0010: 'meta_bg',
  0x0040: 'extents',
  0x0080: '64bit',
  0x0100: 'mmp',
  0x0200: 'flex_bg',
  0x0400: 'ea_inode',
  0x1000: 'dirdata',
  0x2000: 'csum_seed',
  0x4000: 'largedir',
  0x8000: 'inline_data',
  0x10000: 'encrypt',
});

export const FEATURE_RO_COMPAT = Object.freeze({
  0x0001: 'sparse_super',
  0x0002: 'large_file',
  0x0004: 'btree_dir',
  0x0008: 'huge_file',
  0x0010: 'gdt_csum',
  0x0020: 'dir_nlink',
  0x0040: 'extra_isize',
  0x0080: 'has_snapshot',
  0x0100: 'quota',
  0x0200: 'bigalloc',
  0x0400: 'metadata_csum',
  0x0800: 'replica',
  0x1000: 'readonly',
  0x2000: 'project',
  0x4000: 'verity',
  0x8000: 'orphan_present',
});

export const STATE_LABELS = Object.freeze({
  1: 'Clean (EXT4_VALID_FS)',
  2: 'Errors detected (EXT4_ERROR_FS)',
  4: 'Orphan inodes recovering (EXT4_ORPHAN_FS)',
});

export const ERRORS_BEHAVIOR_LABELS = Object.freeze({
  1: 'Continue (EXT4_ERRORS_CONTINUE)',
  2: 'Remount read-only (EXT4_ERRORS_RO)',
  3: 'Panic (EXT4_ERRORS_PANIC)',
});

export const CREATOR_OS_LABELS = Object.freeze({
  0: 'Linux',
  1: 'Hurd',
  2: 'Masix',
  3: 'FreeBSD',
  4: 'Lites',
});

/**
 * Converts a hex string into a Uint8Array.
 * Ignores 0x prefixes and non-hex characters (spaces, newlines, colons, commas).
 *
 * @param {string} hexString - The raw hex string.
 * @returns {Uint8Array} The parsed byte array.
 * @throws {TypeError|Error} When input is not a string or has an odd number of hex digits.
 */
export function hexToBytes(hexString) {
  if (typeof hexString !== 'string') {
    throw new TypeError('Hex input must be a string.');
  }
  const cleaned = hexString.replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, '');
  if (cleaned.length === 0) {
    return new Uint8Array(0);
  }
  if (cleaned.length % 2 !== 0) {
    throw new Error('Hex string must have an even number of hex digits.');
  }
  const length = cleaned.length / 2;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Converts a Uint8Array into a continuous lowercase hex string.
 *
 * @param {Uint8Array} bytes - The bytes to encode.
 * @returns {string} Lowercase hex string.
 */
export function bytesToHex(bytes) {
  if (!bytes) return '';
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Formats a 16-byte buffer into standard UUID format (8-4-4-4-12 lowercase).
 *
 * @param {Uint8Array} bytes - The 16 UUID bytes.
 * @returns {string} Formatted UUID string.
 */
export function formatUuid(bytes) {
  if (!bytes || bytes.length < 16) return '';
  const hex = bytesToHex(bytes.slice(0, 16));
  const p1 = hex.slice(0, 8);
  const p2 = hex.slice(8, 12);
  const p3 = hex.slice(12, 16);
  const p4 = hex.slice(16, 20);
  const p5 = hex.slice(20, 32);
  return `${p1}-${p2}-${p3}-${p4}-${p5}`;
}

/**
 * Decodes null-terminated string bytes into a trimmed UTF-8 string.
 *
 * @param {Uint8Array} bytes - Raw string bytes.
 * @returns {string} Decoded string.
 */
export function decodeNullTerminatedString(bytes) {
  if (!bytes || bytes.length === 0) return '';
  const nullIndex = bytes.indexOf(0);
  const slice = nullIndex >= 0 ? bytes.slice(0, nullIndex) : bytes;
  return new TextDecoder('utf-8', { fatal: false }).decode(slice).trim();
}

/**
 * Decodes a 32-bit integer feature flags bitmask, listing known flag names
 * and preserving any unknown bit positions with UNKNOWN_0x<hex>.
 *
 * @param {number} flags - 32-bit feature flags integer.
 * @param {Record<number, string>} knownMap - Mapping of bitmask to flag name.
 * @returns {string[]} List of flag names with unknown bits preserved.
 */
export function decodeFeatureFlags(flags, knownMap) {
  const result = [];
  const uflags = flags >>> 0;
  for (let bitIndex = 0; bitIndex < 32; bitIndex++) {
    const bitMask = (1 << bitIndex) >>> 0;
    if ((uflags & bitMask) !== 0) {
      if (knownMap[bitMask]) {
        result.push(knownMap[bitMask]);
      } else {
        const hexStr = bitMask.toString(16).toUpperCase();
        result.push(`UNKNOWN_0x${hexStr}`);
      }
    }
  }
  return result;
}

/**
 * Formats a byte array as a standard hex dump with address, hex values, and ASCII view.
 *
 * @param {Uint8Array} bytes - The byte array to display.
 * @param {number} [bytesPerLine=16] - Number of bytes displayed per line.
 * @param {number} [baseOffset=0] - Starting address offset.
 * @returns {string} Formatted multiline hex dump.
 */
export function formatHexDump(bytes, bytesPerLine = 16, baseOffset = 0) {
  if (!bytes || bytes.length === 0) return '';
  const lines = [];
  for (let i = 0; i < bytes.length; i += bytesPerLine) {
    const chunk = bytes.slice(i, i + bytesPerLine);
    const addr = (baseOffset + i).toString(16).padStart(8, '0');
    const hexParts = [];
    let ascii = '';
    for (let j = 0; j < bytesPerLine; j++) {
      if (j < chunk.length) {
        const b = chunk[j];
        hexParts.push(b.toString(16).padStart(2, '0'));
        ascii += b >= 32 && b <= 126 ? String.fromCharCode(b) : '.';
      } else {
        hexParts.push('  ');
      }
    }
    const group1 = hexParts.slice(0, 8).join(' ');
    const group2 = hexParts.slice(8, 16).join(' ');
    lines.push(`${addr}  ${group1}  ${group2}  |${ascii}|`);
  }
  return lines.join('\n');
}

/**
 * Formats a Unix timestamp (seconds) into an ISO string or 'Never'.
 *
 * @param {number} timestamp - Unix timestamp in seconds.
 * @returns {string} Formatted date string.
 */
export function formatTimestamp(timestamp) {
  if (!timestamp || timestamp <= 0) return 'Never';
  try {
    return new Date(timestamp * 1000).toISOString();
  } catch {
    return 'Invalid Date';
  }
}

/**
 * Parses and validates an ext2, ext3, or ext4 filesystem superblock from a buffer or hex string.
 * Superblock is located at byte offset 1024 and is 1024 bytes long.
 *
 * @param {ArrayBuffer|Uint8Array|DataView|string} input - Disk slice or hex string.
 * @param {object} [options] - Optional parsing options.
 * @param {number} [options.offset=1024] - Superblock start offset in the buffer.
 * @returns {{ ok: boolean, data?: object, error?: string }} Parsing result.
 */
export function parseExt4Superblock(input, options = {}) {
  try {
    if (!input) {
      return { ok: false, error: 'No input provided.' };
    }

    let bytes;
    if (typeof input === 'string') {
      try {
        bytes = hexToBytes(input);
      } catch (err) {
        return { ok: false, error: `Invalid hex input: ${err.message}` };
      }
    } else if (input instanceof Uint8Array) {
      bytes = input;
    } else if (input instanceof ArrayBuffer) {
      bytes = new Uint8Array(input);
    } else if (input instanceof DataView) {
      bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    } else if (ArrayBuffer.isView(input)) {
      bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    } else {
      return {
        ok: false,
        error: 'Unsupported input format. Expected ArrayBuffer, Uint8Array, or hex string.',
      };
    }

    const sbOffset = options.offset ?? SUPERBLOCK_OFFSET;
    const requiredMinSize = sbOffset + SUPERBLOCK_SIZE;

    if (bytes.length < requiredMinSize) {
      return {
        ok: false,
        error:
          `Buffer is too short (${bytes.length} bytes). Superblock requires at least ` +
          `${requiredMinSize} bytes (1024-byte boot padding + 1024-byte superblock).`,
      };
    }

    const view = new DataView(bytes.buffer, bytes.byteOffset + sbOffset, SUPERBLOCK_SIZE);
    const magic = view.getUint16(0x38, true);

    if (magic !== EXT_MAGIC) {
      const magicHex = `0x${magic.toString(16).toUpperCase().padStart(4, '0')}`;
      return {
        ok: false,
        error: `Invalid magic number ${magicHex}. Expected 0xEF53 for ext2/ext3/ext4 filesystem.`,
      };
    }

    // Read superblock fields (little-endian)
    const inodesCount = view.getUint32(0x00, true);
    const blocksCountLo = view.getUint32(0x04, true);
    const rBlocksCountLo = view.getUint32(0x08, true);
    const freeBlocksCountLo = view.getUint32(0x0C, true);
    const freeInodesCount = view.getUint32(0x10, true);
    const firstDataBlock = view.getUint32(0x14, true);
    const logBlockSize = view.getUint32(0x18, true);
    const blockSize = 1024 << logBlockSize;
    const logClusterSize = view.getUint32(0x1C, true);
    const clusterSize = 1024 << logClusterSize;
    const blocksPerGroup = view.getUint32(0x20, true);
    const clustersPerGroup = view.getUint32(0x24, true);
    const inodesPerGroup = view.getUint32(0x28, true);
    const mountTime = view.getUint32(0x2C, true);
    const writeTime = view.getUint32(0x30, true);
    const mountCount = view.getUint16(0x34, true);
    const maxMountCount = view.getInt16(0x36, true);
    const stateRaw = view.getUint16(0x3A, true);
    const errorsBehaviorRaw = view.getUint16(0x3C, true);
    const minorRevLevel = view.getUint16(0x3E, true);
    const lastCheckTime = view.getUint32(0x40, true);
    const checkInterval = view.getUint32(0x44, true);
    const creatorOsRaw = view.getUint32(0x48, true);
    const revLevel = view.getUint32(0x4C, true);
    const defResUid = view.getUint16(0x50, true);
    const defResGid = view.getUint16(0x52, true);

    // Dynamic revision fields
    let firstInode = 11;
    let inodeSize = 128;
    let blockGroupNr = 0;
    let featureCompatRaw = 0;
    let featureIncompatRaw = 0;
    let featureRoCompatRaw = 0;

    if (revLevel >= 1) {
      firstInode = view.getUint32(0x54, true);
      inodeSize = view.getUint16(0x58, true) || 128;
      blockGroupNr = view.getUint16(0x5A, true);
      featureCompatRaw = view.getUint32(0x5C, true);
      featureIncompatRaw = view.getUint32(0x60, true);
      featureRoCompatRaw = view.getUint32(0x64, true);
    }

    // 64-bit block count support if INCOMPAT_64BIT (0x0080) is enabled
    const has64Bit = (featureIncompatRaw & 0x0080) !== 0;
    let blocksCount;
    let freeBlocksCount;
    let reservedBlocksCount;

    if (has64Bit) {
      const blocksCountHi = view.getUint32(0x150, true);
      const rBlocksCountHi = view.getUint32(0x154, true);
      const freeBlocksCountHi = view.getUint32(0x158, true);
      blocksCount = (BigInt(blocksCountHi) << 32n) | BigInt(blocksCountLo);
      reservedBlocksCount = (BigInt(rBlocksCountHi) << 32n) | BigInt(rBlocksCountLo);
      freeBlocksCount = (BigInt(freeBlocksCountHi) << 32n) | BigInt(freeBlocksCountLo);
    } else {
      blocksCount = BigInt(blocksCountLo);
      reservedBlocksCount = BigInt(rBlocksCountLo);
      freeBlocksCount = BigInt(freeBlocksCountLo);
    }

    // Feature flags decoding
    const compatFeatures = decodeFeatureFlags(featureCompatRaw, FEATURE_COMPAT);
    const incompatFeatures = decodeFeatureFlags(featureIncompatRaw, FEATURE_INCOMPAT);
    const roCompatFeatures = decodeFeatureFlags(featureRoCompatRaw, FEATURE_RO_COMPAT);

    // Variant detection: ext4 if extents/64bit/flex_bg; ext3 if has_journal; else ext2
    let variant = 'ext2';
    const isExt4 = (featureIncompatRaw & (0x0040 | 0x0080 | 0x0200)) !== 0;
    const isExt3 = (featureCompatRaw & 0x0004) !== 0;

    if (isExt4) {
      variant = 'ext4';
    } else if (isExt3) {
      variant = 'ext3';
    } else {
      variant = 'ext2';
    }

    // UUID, Volume Name, Last Mounted Path
    const sbBytes = bytes.slice(sbOffset, sbOffset + SUPERBLOCK_SIZE);
    const uuidBytes = sbBytes.slice(0x68, 0x78);
    const uuid = formatUuid(uuidBytes);
    const volumeName = decodeNullTerminatedString(sbBytes.slice(0x78, 0x88));
    const lastMountedPath = decodeNullTerminatedString(sbBytes.slice(0x88, 0xC8));

    const stateLabel = STATE_LABELS[stateRaw] ?? `Unknown (0x${stateRaw.toString(16)})`;
    const errorsBehaviorLabel =
      ERRORS_BEHAVIOR_LABELS[errorsBehaviorRaw] ?? `Unknown (${errorsBehaviorRaw})`;
    const creatorOsLabel = CREATOR_OS_LABELS[creatorOsRaw] ?? `Unknown (${creatorOsRaw})`;

    const hexDump = formatHexDump(sbBytes, 16, sbOffset);

    return {
      ok: true,
      data: {
        variant,
        magic,
        magicHex: '0xEF53',
        inodesCount,
        blocksCount: blocksCount.toString(),
        blocksCountNumeric: Number(blocksCount),
        reservedBlocksCount: reservedBlocksCount.toString(),
        freeBlocksCount: freeBlocksCount.toString(),
        freeBlocksCountNumeric: Number(freeBlocksCount),
        freeInodesCount,
        firstDataBlock,
        blockSize,
        logBlockSize,
        clusterSize,
        logClusterSize,
        blocksPerGroup,
        clustersPerGroup,
        inodesPerGroup,
        mountTime,
        mountTimeFormatted: formatTimestamp(mountTime),
        writeTime,
        writeTimeFormatted: formatTimestamp(writeTime),
        mountCount,
        maxMountCount,
        stateRaw,
        state: stateLabel,
        isClean: stateRaw === 1,
        errorsBehaviorRaw,
        errorsBehavior: errorsBehaviorLabel,
        minorRevLevel,
        lastCheckTime,
        lastCheckTimeFormatted: formatTimestamp(lastCheckTime),
        checkInterval,
        creatorOsRaw,
        creatorOs: creatorOsLabel,
        revLevel,
        revLevelLabel: revLevel === 0 ? '0 (Original / ext2)' : `${revLevel} (Dynamic rev)`,
        defResUid,
        defResGid,
        firstInode,
        inodeSize,
        blockGroupNr,
        featureCompatRaw,
        featureIncompatRaw,
        featureRoCompatRaw,
        compatFeatures,
        incompatFeatures,
        roCompatFeatures,
        featureFlags: {
          compat: compatFeatures,
          incompat: incompatFeatures,
          roCompat: roCompatFeatures,
        },
        uuid,
        volumeName: volumeName || '(none)',
        lastMountedPath: lastMountedPath || '(none)',
        rawSuperblockBytes: sbBytes,
        hexDump,
      },
    };
  } catch (err) {
    return { ok: false, error: err.message || 'Failed to parse ext4 superblock.' };
  }
}

/**
 * Creates a synthetic 2048-byte buffer representing a valid ext2, ext3, or ext4 superblock.
 * Used for testing and sample data in the UI.
 *
 * @param {'ext2'|'ext3'|'ext4'} [variant='ext4'] - The filesystem variant.
 * @param {object} [customOverrides={}] - Optional field overrides.
 * @returns {Uint8Array} A 2048-byte Uint8Array.
 */
export function createSampleSuperblock(variant = 'ext4', customOverrides = {}) {
  const bytes = new Uint8Array(MIN_IMAGE_SIZE);
  const view = new DataView(bytes.buffer, SUPERBLOCK_OFFSET, SUPERBLOCK_SIZE);

  // Common baseline values
  view.setUint32(0x00, 65536, true); // inodes count
  view.setUint32(0x04, 262144, true); // blocks count lo
  view.setUint32(0x08, 13107, true); // reserved blocks count lo
  view.setUint32(0x0C, 240000, true); // free blocks count lo
  view.setUint32(0x10, 65525, true); // free inodes count
  view.setUint32(0x14, 0, true); // first data block (0 for 4k)
  view.setUint32(0x18, 2, true); // log block size (4096 bytes)
  view.setUint32(0x1C, 2, true); // log cluster size
  view.setUint32(0x20, 32768, true); // blocks per group
  view.setUint32(0x24, 32768, true); // clusters per group
  view.setUint32(0x28, 8192, true); // inodes per group
  view.setUint32(0x2C, 1700000000, true); // mount time
  view.setUint32(0x30, 1700000100, true); // write time
  view.setUint16(0x34, 5, true); // mount count
  view.setInt16(0x36, 30, true); // max mount count
  view.setUint16(0x38, EXT_MAGIC, true); // magic 0xEF53
  view.setUint16(0x3A, 1, true); // state (clean)
  view.setUint16(0x3C, 1, true); // errors behavior (continue)
  view.setUint16(0x3E, 0, true); // minor rev level
  view.setUint32(0x40, 1699000000, true); // last check time
  view.setUint32(0x44, 15552000, true); // check interval
  view.setUint32(0x48, 0, true); // creator os (Linux)
  view.setUint32(0x4C, 1, true); // rev level (dynamic)
  view.setUint16(0x50, 0, true); // def res uid
  view.setUint16(0x52, 0, true); // def res gid
  view.setUint32(0x54, 11, true); // first inode
  view.setUint16(0x58, 256, true); // inode size
  view.setUint16(0x5A, 0, true); // block group nr

  let compat = 0;
  let incompat = 0;
  let roCompat = 0;

  if (variant === 'ext4') {
    compat = 0x0004 | 0x0008 | 0x0020; // has_journal, ext_attr, dir_index
    incompat = 0x0002 | 0x0040 | 0x0080 | 0x0200; // filetype, extents, 64bit, flex_bg
    // sparse_super, large_file, huge_file, dir_nlink, extra_isize
    roCompat = 0x0001 | 0x0002 | 0x0008 | 0x0020 | 0x0040;
  } else if (variant === 'ext3') {
    compat = 0x0004; // has_journal
    incompat = 0x0002; // filetype
    roCompat = 0x0001 | 0x0002; // sparse_super, large_file
  } else {
    // ext2
    compat = 0x0008; // ext_attr
    incompat = 0x0002; // filetype
    roCompat = 0x0001; // sparse_super
  }

  view.setUint32(0x5C, compat, true);
  view.setUint32(0x60, incompat, true);
  view.setUint32(0x64, roCompat, true);

  // Set sample UUID
  const sampleUuid = [
    0xde, 0xad, 0xbe, 0xef, 0xca, 0xfe, 0x40, 0x00, 0x80, 0x00, 0x12, 0x34, 0x56, 0x78, 0x9a,
    0xbc,
  ];
  sampleUuid.forEach((byte, idx) => {
    bytes[SUPERBLOCK_OFFSET + 0x68 + idx] = byte;
  });

  // Set sample volume name
  const volumeNameBytes = new TextEncoder().encode(
    variant === 'ext4' ? 'rootfs-ext4' : variant === 'ext3' ? 'data-ext3' : 'boot-ext2',
  );
  volumeNameBytes.forEach((byte, idx) => {
    bytes[SUPERBLOCK_OFFSET + 0x78 + idx] = byte;
  });

  // Set sample last mounted path
  const lastMountedBytes = new TextEncoder().encode(
    variant === 'ext4' ? '/' : variant === 'ext3' ? '/data' : '/boot',
  );
  lastMountedBytes.forEach((byte, idx) => {
    bytes[SUPERBLOCK_OFFSET + 0x88 + idx] = byte;
  });

  // Apply custom overrides
  if (customOverrides.magic !== undefined) {
    view.setUint16(0x38, customOverrides.magic, true);
  }
  if (customOverrides.featureCompat !== undefined) {
    view.setUint32(0x5C, customOverrides.featureCompat, true);
  }
  if (customOverrides.featureIncompat !== undefined) {
    view.setUint32(0x60, customOverrides.featureIncompat, true);
  }
  if (customOverrides.featureRoCompat !== undefined) {
    view.setUint32(0x64, customOverrides.featureRoCompat, true);
  }

  return bytes;
}
