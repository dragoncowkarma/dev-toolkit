/**
 * UBIFS superblock node constants and parsing utilities.
 */

export const UBIFS_NODE_MAGIC = 0x06101831;
export const UBIFS_HEADER_SIZE = 24;
export const UBIFS_SB_NODE_TYPE = 6;
export const UBIFS_SB_NODE_SZ = 4096;

export const UBIFS_NODE_TYPES = Object.freeze({
  0: 'Inode',
  1: 'Data',
  2: 'Directory Entry',
  3: 'Extended Attribute Entry',
  4: 'Truncation',
  5: 'Padding',
  6: 'Superblock',
  7: 'Master',
  8: 'Reference',
  9: 'Index',
  10: 'Commit Start',
  11: 'Orphan',
  12: 'Authentication',
  13: 'Signature',
});

export const UBIFS_GROUP_TYPES = Object.freeze({
  0: 'No Node Group',
  1: 'In Node Group',
  2: 'Last of Node Group',
});

export const UBIFS_KEY_HASHES = Object.freeze({
  0: 'R5',
  1: 'Test',
});

export const UBIFS_KEY_FMTS = Object.freeze({
  0: 'Simple',
});

export const UBIFS_COMPR_TYPES = Object.freeze({
  0: 'None',
  1: 'LZO',
  2: 'ZLIB',
  3: 'ZSTD',
});

export const UBIFS_FLAGS = Object.freeze({
  0x02: 'BIGLPT',
  0x04: 'SPACE_FIXUP',
  0x08: 'DOUBLE_HASH',
  0x10: 'ENCRYPTION',
  0x20: 'AUTHENTICATION',
});

/**
 * Precomputed CRC-32 table using polynomial 0xEDB88320 (IEEE 802.3 reversed).
 */
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC32_TABLE[i] = c >>> 0;
}

/**
 * Calculates UBIFS CRC-32 checksum.
 * Uses polynomial 0xEDB88320, initial value 0xFFFFFFFF, and no final XOR.
 *
 * @param {Uint8Array} bytes Node buffer.
 * @param {number} [offset=8] Start byte offset.
 * @param {number} [length=bytes.length] End byte offset.
 * @returns {number} The 32-bit unsigned checksum.
 */
export function computeUbifsCrc(bytes, offset = 8, length = bytes.length) {
  let crc = 0xffffffff;
  const end = Math.min(bytes.length, length);
  for (let i = offset; i < end; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return crc >>> 0;
}

/**
 * Formats a 16-byte buffer as standard RFC 4122 UUID string in lowercase hex.
 *
 * @param {Uint8Array} bytes 16-byte UUID array.
 * @returns {string} Formatted UUID string.
 */
export function formatUuid(bytes) {
  if (!bytes || bytes.length < 16) {
    return 'Unknown';
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return (
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-` +
    `${hex.slice(16, 20)}-${hex.slice(20, 32)}`
  );
}

/**
 * Formats superblock feature flags into hex and known flag names.
 *
 * @param {number} flags 32-bit integer flags.
 * @returns {string} Formatted flags string.
 */
export function formatFlags(flags) {
  if (typeof flags !== 'number' || Number.isNaN(flags)) {
    return 'Unknown';
  }
  const hex = '0x' + (flags >>> 0).toString(16).padStart(8, '0');
  if (flags === 0) {
    return `${hex} (None)`;
  }
  const matched = [];
  let remaining = flags >>> 0;
  for (const [bit, name] of Object.entries(UBIFS_FLAGS)) {
    const bitNum = Number(bit);
    if ((flags & bitNum) !== 0) {
      matched.push(name);
      remaining &= ~bitNum;
    }
  }
  if (remaining !== 0) {
    matched.push(`Unknown (0x${(remaining >>> 0).toString(16)})`);
  }
  const label = matched.join(', ');
  return `${hex} (${label})`;
}

/**
 * Parses a UBIFS superblock node from an ArrayBuffer or Uint8Array.
 *
 * @param {ArrayBuffer|Uint8Array} buffer Input buffer slice.
 * @param {object} [options] Parsing options.
 * @param {boolean} [options.throwOnCrcMismatch=false] Throw on CRC mismatch.
 * @returns {object} Parsed superblock node details.
 */
export function parseUbifsSuperblock(buffer, options = {}) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (bytes.byteLength < UBIFS_HEADER_SIZE) {
    throw new Error(
      `File is truncated: buffer size ${bytes.byteLength} is smaller than ` +
      `UBIFS common node header (${UBIFS_HEADER_SIZE} bytes).`,
    );
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(0, true);

  if (magic !== UBIFS_NODE_MAGIC) {
    const magicHex = '0x' + magic.toString(16).padStart(8, '0');
    throw new Error(
      `Invalid UBIFS magic: expected 0x06101831, got ${magicHex}.`,
    );
  }

  const storedCrc = view.getUint32(4, true);
  const sqnum = view.getBigUint64(8, true);
  const len = view.getUint32(16, true);
  const nodeTypeRaw = view.getUint8(20);
  const groupTypeRaw = view.getUint8(21);

  if (nodeTypeRaw !== UBIFS_SB_NODE_TYPE) {
    const typeLabel = UBIFS_NODE_TYPES[nodeTypeRaw] ?? 'Unknown';
    throw new Error(
      `Invalid UBIFS node type: expected Superblock (6), got ${typeLabel} (${nodeTypeRaw}).`,
    );
  }

  if (len !== UBIFS_SB_NODE_SZ) {
    throw new Error(
      `Invalid UBIFS superblock node length: expected ${UBIFS_SB_NODE_SZ} bytes, got ${len} bytes.`,
    );
  }

  if (bytes.byteLength < len) {
    throw new Error(
      `File is truncated: expected at least ${len} bytes, got ${bytes.byteLength} bytes.`,
    );
  }

  const calculatedCrc = computeUbifsCrc(bytes, 8, len);
  const crcValid = storedCrc === calculatedCrc;

  if (options.throwOnCrcMismatch && !crcValid) {
    const expHex = '0x' + storedCrc.toString(16).padStart(8, '0');
    const calcHex = '0x' + calculatedCrc.toString(16).padStart(8, '0');
    throw new Error(`CRC32 mismatch: expected ${expHex}, calculated ${calcHex}.`);
  }

  const nodeType = UBIFS_NODE_TYPES[nodeTypeRaw]
    ? `${UBIFS_NODE_TYPES[nodeTypeRaw]} (${nodeTypeRaw})`
    : 'Unknown';

  const groupType = UBIFS_GROUP_TYPES[groupTypeRaw]
    ? `${UBIFS_GROUP_TYPES[groupTypeRaw]} (${groupTypeRaw})`
    : 'Unknown';

  const keyHashRaw = view.getUint8(26);
  const keyHash = UBIFS_KEY_HASHES[keyHashRaw]
    ? `${UBIFS_KEY_HASHES[keyHashRaw]} (${keyHashRaw})`
    : 'Unknown';

  const keyFmtRaw = view.getUint8(27);
  const keyFmt = UBIFS_KEY_FMTS[keyFmtRaw]
    ? `${UBIFS_KEY_FMTS[keyFmtRaw]} (${keyFmtRaw})`
    : 'Unknown';

  const flagsRaw = view.getUint32(28, true);
  const flags = formatFlags(flagsRaw);

  const minIoSize = view.getUint32(32, true);
  const lebSize = view.getUint32(36, true);
  const lebCnt = view.getUint32(40, true);
  const maxLebCnt = view.getUint32(44, true);
  const maxBudBytes = view.getBigUint64(48, true);
  const logLebs = view.getUint32(56, true);
  const lptLebs = view.getUint32(60, true);
  const orphLebs = view.getUint32(64, true);
  const jheadCnt = view.getUint32(68, true);
  const fanout = view.getUint32(72, true);
  const lsaveCnt = view.getUint32(76, true);
  const fmtVersion = view.getUint32(80, true);

  const defaultComprRaw = view.getUint16(84, true);
  const defaultCompr = UBIFS_COMPR_TYPES[defaultComprRaw]
    ? `${UBIFS_COMPR_TYPES[defaultComprRaw]} (${defaultComprRaw})`
    : 'Unknown';

  const rpUid = view.getUint32(88, true);
  const rpGid = view.getUint32(92, true);
  const rpSize = view.getBigUint64(96, true);
  const timeGran = view.getUint32(104, true);
  const uuid = formatUuid(bytes.slice(108, 124));

  return {
    magic: '0x' + magic.toString(16).padStart(8, '0'),
    crc: '0x' + storedCrc.toString(16).padStart(8, '0'),
    calculatedCrc: '0x' + calculatedCrc.toString(16).padStart(8, '0'),
    crcValid,
    crcStatus: crcValid ? 'Valid' : 'Mismatch',
    sqnum: sqnum.toString(),
    sqnumRaw: sqnum,
    len,
    nodeType,
    nodeTypeRaw,
    groupType,
    groupTypeRaw,
    keyHash,
    keyHashRaw,
    keyFmt,
    keyFmtRaw,
    flags,
    flagsRaw,
    minIoSize,
    lebSize,
    lebCnt,
    maxLebCnt,
    maxBudBytes: maxBudBytes.toString(),
    maxBudBytesRaw: maxBudBytes,
    logLebs,
    lptLebs,
    orphLebs,
    jheadCnt,
    fanout,
    lsaveCnt,
    fmtVersion,
    defaultCompr,
    defaultComprRaw,
    rpUid,
    rpGid,
    rpSize: rpSize.toString(),
    rpSizeRaw: rpSize,
    timeGran,
    uuid,
  };
}

/**
 * Creates a mock UBIFS superblock buffer for testing.
 *
 * @param {object} [overrides={}] Overrides for header and superblock fields.
 * @returns {Uint8Array} Mock superblock node buffer.
 */
export function createMockUbifsSuperblock(overrides = {}) {
  const size = overrides.bufferSize ?? 4096;
  const buffer = new Uint8Array(size);
  const view = new DataView(buffer.buffer);

  const magic = overrides.magic ?? UBIFS_NODE_MAGIC;
  const sqnum = overrides.sqnum ?? 1n;
  const len = overrides.len ?? 4096;
  const nodeType = overrides.nodeTypeRaw ?? 6;
  const groupType = overrides.groupTypeRaw ?? 0;

  view.setUint32(0, magic, true);
  view.setBigUint64(8, BigInt(sqnum), true);
  view.setUint32(16, len, true);
  view.setUint8(20, nodeType);
  view.setUint8(21, groupType);
  view.setUint16(22, 0, true);

  view.setUint16(24, 0, true);
  view.setUint8(26, overrides.keyHashRaw ?? 0);
  view.setUint8(27, overrides.keyFmtRaw ?? 0);
  view.setUint32(28, overrides.flagsRaw ?? 2, true);
  view.setUint32(32, overrides.minIoSize ?? 2048, true);
  view.setUint32(36, overrides.lebSize ?? 129024, true);
  view.setUint32(40, overrides.lebCnt ?? 100, true);
  view.setUint32(44, overrides.maxLebCnt ?? 1000, true);
  view.setBigUint64(48, BigInt(overrides.maxBudBytes ?? 8388608), true);
  view.setUint32(56, overrides.logLebs ?? 4, true);
  view.setUint32(60, overrides.lptLebs ?? 2, true);
  view.setUint32(64, overrides.orphLebs ?? 1, true);
  view.setUint32(68, overrides.jheadCnt ?? 1, true);
  view.setUint32(72, overrides.fanout ?? 8, true);
  view.setUint32(76, overrides.lsaveCnt ?? 256, true);
  view.setUint32(80, overrides.fmtVersion ?? 5, true);
  view.setUint16(84, overrides.defaultComprRaw ?? 1, true);
  view.setUint16(86, 0, true);
  view.setUint32(88, overrides.rpUid ?? 0, true);
  view.setUint32(92, overrides.rpGid ?? 0, true);
  view.setBigUint64(96, BigInt(overrides.rpSize ?? 5242880), true);
  view.setUint32(104, overrides.timeGran ?? 1000000000, true);

  const uuidBytes = overrides.uuidBytes ?? [
    0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef,
    0xfe, 0xdc, 0xba, 0x98, 0x76, 0x54, 0x32, 0x10,
  ];
  for (let i = 0; i < 16; i++) {
    buffer[108 + i] = uuidBytes[i];
  }

  if (overrides.crc !== undefined) {
    view.setUint32(4, overrides.crc, true);
  } else {
    const computedCrc = computeUbifsCrc(buffer, 8, len);
    view.setUint32(4, computedCrc, true);
  }

  return buffer;
}
