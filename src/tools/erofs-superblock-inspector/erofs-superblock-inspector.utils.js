/**
 * @fileoverview Utility functions for parsing and inspecting EROFS superblocks.
 * EROFS (Enhanced Read-Only File System) on-disk superblock is located at
 * offset 1024 (0x400) and is 128 bytes in size.
 */

export const EROFS_MAGIC = 0xE0F5E1E2;
export const EROFS_SUPER_OFFSET = 1024;
export const EROFS_SUPERBLOCK_SIZE = 128;
export const EROFS_MIN_IMAGE_SIZE = EROFS_SUPER_OFFSET + EROFS_SUPERBLOCK_SIZE; // 1152

/**
 * Incompatible feature flags mapping.
 */
export const FEATURE_INCOMPAT_MAP = {
  0x00000001: 'ZERO_PADDING',
  0x00000002: 'COMPR_CFGS',
  0x00000004: 'CHUNKED_FILE',
  0x00000008: 'DEVICE_TABLE',
  0x00000010: 'ZTAILPACKING',
  0x00000020: 'FRAGMENTS',
  0x00000040: 'XATTR_PREFIXES',
  0x00000080: '48BIT',
  0x00000100: 'METABOX',
};

/**
 * Compatible feature flags mapping.
 */
export const FEATURE_COMPAT_MAP = {
  0x00000001: 'SB_CHKSUM',
  0x00000002: 'MTIME',
  0x00000004: 'XATTR_FILTER',
  0x00000008: 'SHARED_EA_IN_METABOX',
  0x00000010: 'PLAIN_XATTR_PFX',
};

/**
 * Compression algorithm names mapped from available_compr_algs bits.
 */
export const COMPR_ALGS_MAP = {
  0x0001: 'LZ4',
  0x0002: 'LZMA',
  0x0004: 'DEFLATE',
  0x0008: 'ZSTD',
};

/**
 * Decodes a 32-bit feature_incompat bitmask into an array of flag names.
 *
 * @param {number} flags
 * @returns {string[]}
 */
export function decodeFeatureIncompat(flags) {
  if (typeof flags !== 'number' || !Number.isFinite(flags) || flags <= 0) {
    return [];
  }
  const result = [];
  let remaining = flags >>> 0;
  for (const [bitStr, name] of Object.entries(FEATURE_INCOMPAT_MAP)) {
    const bit = Number(bitStr);
    if ((remaining & bit) === bit) {
      result.push(name);
      remaining &= ~bit;
    }
  }
  if (remaining !== 0) {
    result.push(`UNKNOWN_0x${remaining.toString(16).toUpperCase()}`);
  }
  return result;
}

/**
 * Decodes a 32-bit feature_compat bitmask into an array of flag names.
 *
 * @param {number} flags
 * @returns {string[]}
 */
export function decodeFeatureCompat(flags) {
  if (typeof flags !== 'number' || !Number.isFinite(flags) || flags <= 0) {
    return [];
  }
  const result = [];
  let remaining = flags >>> 0;
  for (const [bitStr, name] of Object.entries(FEATURE_COMPAT_MAP)) {
    const bit = Number(bitStr);
    if ((remaining & bit) === bit) {
      result.push(name);
      remaining &= ~bit;
    }
  }
  if (remaining !== 0) {
    result.push(`UNKNOWN_0x${remaining.toString(16).toUpperCase()}`);
  }
  return result;
}

/**
 * Decodes a 16-bit available_compr_algs bitmask into compression algorithm names.
 *
 * @param {number} flags
 * @returns {string[]}
 */
export function decodeCompressionAlgorithms(flags) {
  if (typeof flags !== 'number' || !Number.isFinite(flags) || flags <= 0) {
    return [];
  }
  const result = [];
  let remaining = flags & 0xffff;
  for (const [bitStr, name] of Object.entries(COMPR_ALGS_MAP)) {
    const bit = Number(bitStr);
    if ((remaining & bit) === bit) {
      result.push(name);
      remaining &= ~bit;
    }
  }
  if (remaining !== 0) {
    result.push(`UNKNOWN_0x${remaining.toString(16).toUpperCase()}`);
  }
  return result;
}

/**
 * Formats a 16-byte array into canonical UUID string format.
 *
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function formatUuid(bytes) {
  if (!bytes || bytes.length < 16) {
    return '';
  }
  const hex = Array.from(bytes.subarray(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
  return (
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-` +
    `${hex.slice(16, 20)}-${hex.slice(20, 32)}`
  );
}

/**
 * Parses a null-terminated or fixed-length volume name from a 16-byte array.
 *
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function parseVolumeName(bytes) {
  if (!bytes || bytes.length === 0) {
    return '';
  }
  let len = 0;
  const maxLen = Math.min(bytes.length, 16);
  while (len < maxLen && bytes[len] !== 0) {
    len += 1;
  }
  if (len === 0) {
    return '';
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, len)).trim();
}

/**
 * Formats a byte count into a human-readable string.
 *
 * @param {number|bigint} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  const num = typeof bytes === 'bigint' ? Number(bytes) : bytes;
  if (!Number.isFinite(num) || num < 0) return '0 B';
  if (num < 1024) return `${num} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB', 'EB'];
  let value = num / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Formats seconds since Unix epoch and nanoseconds into an ISO date string.
 *
 * @param {bigint|number} seconds
 * @param {number} [nsec=0]
 * @returns {string}
 */
export function formatBuildTime(seconds, nsec = 0) {
  const secBig = typeof seconds === 'bigint' ? seconds : BigInt(seconds || 0);
  if (secBig === 0n && nsec === 0) {
    return '1970-01-01T00:00:00.000Z';
  }
  try {
    const millis = Number(secBig) * 1000 + Math.floor(nsec / 1_000_000);
    const date = new Date(millis);
    if (isNaN(date.getTime())) {
      return `${secBig.toString()}s`;
    }
    return date.toISOString();
  } catch {
    return `${secBig.toString()}s`;
  }
}

/**
 * Parses an EROFS superblock from a Uint8Array, ArrayBuffer, or DataView.
 *
 * @param {Uint8Array|ArrayBuffer|ArrayBufferView} input
 * @param {object} [options]
 * @param {number} [options.offset=0]
 * @returns {object} Parsed superblock metadata.
 */
export function parseErofsSuperblock(input, options = {}) {
  let view;
  if (input instanceof ArrayBuffer) {
    view = new DataView(input);
  } else if (ArrayBuffer.isView(input)) {
    view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  } else {
    throw new TypeError('Input must be an ArrayBuffer or TypedArray.');
  }

  const offset = options.offset ?? 0;
  if (view.byteLength < offset + EROFS_SUPERBLOCK_SIZE) {
    const available = Math.max(0, view.byteLength - offset);
    throw new Error(
      `Truncated EROFS superblock: expected at least ${EROFS_SUPERBLOCK_SIZE} bytes, ` +
      `got ${available} byte(s).`
    );
  }

  const magic = view.getUint32(offset, true);
  if (magic !== EROFS_MAGIC) {
    const hex = '0x' + magic.toString(16).padStart(8, '0').toUpperCase();
    throw new Error(`Invalid EROFS magic: ${hex} (expected 0xE0F5E1E2).`);
  }

  const checksum = view.getUint32(offset + 4, true);
  const featureCompat = view.getUint32(offset + 8, true);
  const blkszbits = view.getUint8(offset + 12);
  const sbExtslots = view.getUint8(offset + 13);
  const raw14 = view.getUint16(offset + 14, true);
  const inos = view.getBigUint64(offset + 16, true);
  const epoch = view.getBigInt64(offset + 24, true);
  const buildTimeNsec = view.getUint32(offset + 32, true);
  const raw36 = view.getUint32(offset + 36, true);
  const metaBlkaddr = view.getUint32(offset + 40, true);
  const xattrBlkaddr = view.getUint32(offset + 44, true);

  const uuidBytes = new Uint8Array(view.buffer, view.byteOffset + offset + 48, 16);
  const uuid = formatUuid(uuidBytes);

  const volBytes = new Uint8Array(view.buffer, view.byteOffset + offset + 64, 16);
  const volumeName = parseVolumeName(volBytes);

  const featureIncompat = view.getUint32(offset + 80, true);
  const u1 = view.getUint16(offset + 84, true);
  const extraDevices = view.getUint16(offset + 86, true);

  const buildTimeOffset = view.getUint32(offset + 108, true);
  const rootnid8b = view.getBigUint64(offset + 112, true);

  const has48Bit = (featureIncompat & 0x00000080) !== 0;
  const is48BitLayout = has48Bit && rootnid8b !== 0n;

  let rootNid;
  let blocks;
  let blocksHi = 0;
  const blocksLo = raw36;

  if (is48BitLayout) {
    blocksHi = raw14;
    blocks = (BigInt(blocksHi) << 32n) | BigInt(blocksLo);
    rootNid = rootnid8b;
  } else {
    rootNid = raw14;
    blocks = raw36;
  }

  const buildTime = epoch + BigInt(buildTimeOffset);

  const hasComprCfgs = (featureIncompat & 0x00000002) !== 0;
  let availableComprAlgs = null;
  let availableComprAlgsDecoded = [];
  let lz4MaxDistance = null;

  if (hasComprCfgs) {
    availableComprAlgs = u1;
    availableComprAlgsDecoded = decodeCompressionAlgorithms(u1);
  } else {
    lz4MaxDistance = u1;
    availableComprAlgsDecoded = ['LZ4'];
  }

  const blockSize = 1 << blkszbits;
  const totalFsBytes = BigInt(blocks) * BigInt(blockSize);

  return {
    magic: '0xE0F5E1E2',
    magicRaw: magic,
    checksum: '0x' + checksum.toString(16).padStart(8, '0').toUpperCase(),
    checksumRaw: checksum,
    feature_compat: featureCompat,
    featureCompatHex: '0x' + featureCompat.toString(16).padStart(8, '0').toUpperCase(),
    featureCompatDecoded: decodeFeatureCompat(featureCompat),
    blkszbits,
    blockSize,
    sb_extslots: sbExtslots,
    root_nid: rootNid,
    rootnid_8b: rootnid8b,
    is_48bit: is48BitLayout,
    inos,
    inosFormatted: inos.toString(),
    epoch,
    build_time_offset: buildTimeOffset,
    build_time: buildTime,
    build_time_nsec: buildTimeNsec,
    buildTimeFormatted: formatBuildTime(buildTime, buildTimeNsec),
    blocks,
    blocks_hi: blocksHi,
    blocks_lo: blocksLo,
    meta_blkaddr: metaBlkaddr,
    xattr_blkaddr: xattrBlkaddr,
    uuid,
    uuidBytes: Array.from(uuidBytes),
    volume_name: volumeName,
    feature_incompat: featureIncompat,
    featureIncompatHex: '0x' + featureIncompat.toString(16).padStart(8, '0').toUpperCase(),
    featureIncompatDecoded: decodeFeatureIncompat(featureIncompat),
    has_compr_cfgs: hasComprCfgs,
    available_compr_algs: availableComprAlgs,
    availableComprAlgsDecoded,
    lz4_max_distance: lz4MaxDistance,
    extra_devices: extraDevices,
    totalFsBytes,
    totalFsSizeFormatted: formatFileSize(totalFsBytes),
  };
}

/**
 * Reads only the 128-byte superblock at offset 0x400 (1024) of a file or blob.
 *
 * @param {File|Blob} file
 * @returns {Promise<Uint8Array>}
 */
export function readErofsSuperblockSlice(file) {
  return new Promise((resolve, reject) => {
    if (!file || typeof file.slice !== 'function') {
      reject(new TypeError('Invalid file object provided.'));
      return;
    }
    if (file.size < EROFS_MIN_IMAGE_SIZE) {
      reject(
        new Error(
          `Truncated EROFS image: file size (${file.size} bytes) is smaller ` +
          `than the minimum ${EROFS_MIN_IMAGE_SIZE} bytes required for superblock at 0x400.`
        )
      );
      return;
    }

    const slice = file.slice(EROFS_SUPER_OFFSET, EROFS_SUPER_OFFSET + EROFS_SUPERBLOCK_SIZE);
    const reader = new FileReader();

    reader.onload = () => {
      resolve(new Uint8Array(/** @type {ArrayBuffer} */ (reader.result)));
    };
    reader.onerror = () => {
      reject(new Error('Failed to read the selected file.'));
    };
    reader.readAsArrayBuffer(slice);
  });
}

/**
 * Generates a valid 128-byte EROFS superblock Uint8Array for testing or sample display.
 *
 * @param {object} [overrides={}]
 * @returns {Uint8Array}
 */
export function createSampleSuperblock(overrides = {}) {
  const buffer = new ArrayBuffer(EROFS_SUPERBLOCK_SIZE);
  const view = new DataView(buffer);
  const u8 = new Uint8Array(buffer);

  // magic
  view.setUint32(0, overrides.magic ?? EROFS_MAGIC, true);
  // checksum
  view.setUint32(4, overrides.checksum ?? 0x5e8b1a2c, true);
  // feature_compat (0x01 = SB_CHKSUM)
  view.setUint32(8, overrides.feature_compat ?? 0x00000001, true);
  // blkszbits (12 = 4096)
  view.setUint8(12, overrides.blkszbits ?? 12);
  // sb_extslots
  view.setUint8(13, overrides.sb_extslots ?? 0);

  const featureIncompat = overrides.feature_incompat ?? 0x00000003;
  const is48BitFeature = (featureIncompat & 0x00000080) !== 0;

  let rootnid8b = 0n;
  if (overrides.rootnid_8b !== undefined) {
    rootnid8b = BigInt(overrides.rootnid_8b);
  } else if (
    is48BitFeature &&
    overrides.root_nid !== undefined &&
    BigInt(overrides.root_nid) > 0xffffn
  ) {
    rootnid8b = BigInt(overrides.root_nid);
  }

  if (is48BitFeature && rootnid8b !== 0n) {
    let blocksHi = 0;
    let blocksLo = 0;
    if (overrides.blocks_hi !== undefined) {
      blocksHi = Number(overrides.blocks_hi);
      blocksLo = Number(overrides.blocks_lo ?? overrides.blocks ?? 0);
    } else if (overrides.blocks !== undefined) {
      const b = BigInt(overrides.blocks);
      blocksHi = Number((b >> 32n) & 0xffffn);
      blocksLo = Number(b & 0xffffffffn);
    }
    view.setUint16(14, blocksHi, true);
    view.setUint32(36, blocksLo, true);
    view.setBigUint64(112, rootnid8b, true);
  } else {
    view.setUint16(14, Number(overrides.root_nid ?? 36), true);
    view.setUint32(36, Number(overrides.blocks ?? 65536), true);
    if (overrides.rootnid_8b !== undefined) {
      view.setBigUint64(112, BigInt(overrides.rootnid_8b), true);
    }
  }

  // inos (preserve 64-bit precision)
  view.setBigUint64(16, BigInt(overrides.inos ?? 1048576n), true);

  // epoch and build_time_offset
  const epoch = overrides.epoch !== undefined
    ? BigInt(overrides.epoch)
    : (overrides.build_time !== undefined ? BigInt(overrides.build_time) : 1700000000n);
  view.setBigInt64(24, epoch, true);

  // build_time_nsec
  view.setUint32(32, overrides.build_time_nsec ?? 123456789, true);

  // meta_blkaddr
  view.setUint32(40, overrides.meta_blkaddr ?? 1, true);
  // xattr_blkaddr
  view.setUint32(44, overrides.xattr_blkaddr ?? 2, true);

  // uuid (16 bytes)
  const defaultUuid = [
    0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef,
    0xfe, 0xdc, 0xba, 0x98, 0x76, 0x54, 0x32, 0x10,
  ];
  const uuidBytes = overrides.uuid ?? defaultUuid;
  for (let i = 0; i < 16; i++) {
    u8[48 + i] = uuidBytes[i];
  }

  // volume_name (16 bytes)
  const volName = overrides.volume_name ?? 'erofs_root';
  const encodedName = new TextEncoder().encode(volName);
  for (let i = 0; i < 16; i++) {
    u8[64 + i] = i < encodedName.length ? encodedName[i] : 0;
  }

  // feature_incompat
  view.setUint32(80, featureIncompat, true);

  // u1: available_compr_algs or lz4_max_distance
  const hasComprCfgs = (featureIncompat & 0x00000002) !== 0;
  if (hasComprCfgs) {
    view.setUint16(84, overrides.available_compr_algs ?? 0x0001, true);
  } else {
    view.setUint16(84, overrides.lz4_max_distance ?? overrides.available_compr_algs ?? 0, true);
  }

  // extra_devices (bytes 86-87)
  view.setUint16(86, overrides.extra_devices ?? 0, true);

  // build_time_offset (bytes 108-111)
  const buildTimeOffset = overrides.build_time_offset ?? 0;
  view.setUint32(108, buildTimeOffset, true);

  return u8;
}

/**
 * Creates a synthetic EROFS disk image buffer with superblock at offset 0x400.
 *
 * @param {object} [overrides={}]
 * @param {number} [totalSize=4096]
 * @returns {Uint8Array}
 */
export function createSampleImage(overrides = {}, totalSize = 4096) {
  const size = Math.max(totalSize, EROFS_MIN_IMAGE_SIZE);
  const image = new Uint8Array(size);
  const sb = createSampleSuperblock(overrides);
  image.set(sb, EROFS_SUPER_OFFSET);
  return image;
}
