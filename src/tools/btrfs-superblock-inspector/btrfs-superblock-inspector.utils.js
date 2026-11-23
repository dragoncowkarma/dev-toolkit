/**
 * Constants and utility functions for parsing Btrfs filesystem superblocks.
 */

export const SUPERBLOCK_OFFSET = 0x10000; // 64 KiB
export const SUPERBLOCK_SIZE = 4096; // 4 KiB
export const BTRFS_MAGIC = '_BHRfS_M';
export const MAGIC_OFFSET = 0x40; // 64 bytes
export const BTRFS_CSUM_SIZE = 32;
export const BTRFS_FSID_SIZE = 16;
export const BTRFS_LABEL_SIZE = 256;

/**
 * Checksum type definitions supported by Btrfs.
 */
export const CSUM_TYPES = {
  0: { id: 0, name: 'CRC32c', length: 4 },
  1: { id: 1, name: 'XXHASH64', length: 8 },
  2: { id: 2, name: 'SHA256', length: 32 },
  3: { id: 3, name: 'BLAKE2b', length: 32 },
};

/**
 * Incompatible feature flag definitions (BTRFS_FEATURE_INCOMPAT_*).
 */
export const INCOMPAT_FLAG_DEFINITIONS = [
  { bit: 0n, name: 'MIXED_BACKREF', label: 'Mixed Backreferences' },
  { bit: 1n, name: 'DEFAULT_SUBVOL', label: 'Default Subvolume' },
  { bit: 2n, name: 'MIXED_GROUPS', label: 'Mixed Data/Metadata Groups' },
  { bit: 3n, name: 'COMPRESS_LZO', label: 'LZO Compression' },
  { bit: 4n, name: 'COMPRESS_ZSTD', label: 'ZSTD Compression' },
  { bit: 5n, name: 'BIG_METADATA', label: 'Big Metadata Nodesize' },
  { bit: 6n, name: 'EXTENDED_IREF', label: 'Extended Inode References' },
  { bit: 7n, name: 'RAID56', label: 'RAID 5/6 Profiles' },
  { bit: 8n, name: 'SKINNY_METADATA', label: 'Skinny Metadata' },
  { bit: 9n, name: 'NO_HOLES', label: 'No Hole Extents' },
  { bit: 10n, name: 'METADATA_UUID', label: 'Metadata UUID' },
  { bit: 11n, name: 'RAID1C34', label: 'RAID1 with 3/4 Replicas' },
  { bit: 12n, name: 'ZONED', label: 'Zoned Allocation Mode' },
  { bit: 13n, name: 'EXTENT_TREE_V2', label: 'Extent Tree v2' },
  { bit: 14n, name: 'RAID_STRIPE_TREE', label: 'RAID Stripe Tree' },
  { bit: 16n, name: 'SIMPLE_QUOTA', label: 'Simple Quota (squota)' },
  { bit: 17n, name: 'REMAP_TREE', label: 'Remap Tree' },
];

/**
 * Read-only compatible feature flag definitions (BTRFS_FEATURE_COMPAT_RO_*).
 */
export const COMPAT_RO_FLAG_DEFINITIONS = [
  { bit: 0n, name: 'FREE_SPACE_TREE', label: 'Free Space Tree' },
  { bit: 1n, name: 'FREE_SPACE_TREE_VALID', label: 'Free Space Tree Valid' },
  { bit: 2n, name: 'VERITY', label: 'fs-verity Support' },
  { bit: 3n, name: 'BLOCK_GROUP_TREE', label: 'Block Group Tree' },
];

/**
 * Compatible feature flag definitions (BTRFS_FEATURE_COMPAT_*).
 */
export const COMPAT_FLAG_DEFINITIONS = [];

/**
 * Superblock header flags definitions (BTRFS_SUPER_FLAG_*).
 */
export const SUPER_FLAG_DEFINITIONS = [
  { bit: 2n, name: 'ERROR', label: 'Filesystem Errors Detected' },
  { bit: 32n, name: 'SEEDING', label: 'Seeding Filesystem' },
  { bit: 33n, name: 'METADUMP', label: 'Metadump v1' },
  { bit: 34n, name: 'METADUMP_V2', label: 'Metadump v2' },
  { bit: 35n, name: 'CHANGING_FSID', label: 'Changing FSID' },
  { bit: 36n, name: 'CHANGING_FSID_V2', label: 'Changing FSID v2' },
];

/**
 * Formats a byte number or BigInt into a human-readable size string.
 *
 * @param {number|bigint} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  const b = typeof bytes === 'bigint' ? Number(bytes) : Number(bytes || 0);
  if (b < 1024) return `${b} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let val = b / 1024;
  let unitIndex = 0;
  while (val >= 1024 && unitIndex < units.length - 1) {
    val /= 1024;
    unitIndex += 1;
  }
  return `${val.toFixed(2)} ${units[unitIndex]} (${b.toLocaleString()} bytes)`;
}

/**
 * Formats a file size into a short human-readable string.
 *
 * @param {number|bigint} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  const b = typeof bytes === 'bigint' ? Number(bytes) : Number(bytes || 0);
  if (b < 1024) return `${b} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let val = b / 1024;
  let unitIndex = 0;
  while (val >= 1024 && unitIndex < units.length - 1) {
    val /= 1024;
    unitIndex += 1;
  }
  return `${val.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Formats a 16-byte buffer slice into canonical UUID format (8-4-4-4-12).
 *
 * @param {Uint8Array} bytes
 * @param {number} [offset=0]
 * @returns {string}
 */
export function formatUuid(bytes, offset = 0) {
  const hex = [];
  for (let i = 0; i < 16; i += 1) {
    hex.push(bytes[offset + i].toString(16).padStart(2, '0'));
  }
  const h = hex.join('');
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    h.slice(12, 16),
    h.slice(16, 20),
    h.slice(20, 32),
  ].join('-');
}

/**
 * Decodes bitmask flags according to provided definitions.
 *
 * @param {bigint|number} flags
 * @param {Array<{bit: bigint, name: string, label: string}>} definitions
 * @returns {Array<{bit: number, name: string, label: string, hex: string}>}
 */
export function decodeFlags(flags, definitions) {
  const flagsBig = typeof flags === 'bigint' ? flags : BigInt(flags || 0);
  const result = [];
  let remaining = flagsBig;

  for (const def of definitions) {
    const mask = 1n << def.bit;
    if ((flagsBig & mask) === mask) {
      result.push({
        bit: Number(def.bit),
        name: def.name,
        label: def.label,
        hex: `0x${mask.toString(16)}`,
      });
      remaining &= ~mask;
    }
  }

  if (remaining !== 0n) {
    result.push({
      bit: -1,
      name: `UNKNOWN_0x${remaining.toString(16)}`,
      label: `Unknown Flags (0x${remaining.toString(16)})`,
      hex: `0x${remaining.toString(16)}`,
    });
  }

  return result;
}

/**
 * Parses raw Btrfs superblock bytes.
 *
 * @param {Uint8Array|ArrayBuffer} input
 * @returns {object} The parsed superblock details.
 * @throws {Error} When data is truncated or magic is missing.
 */
export function parseBtrfsSuperblock(input) {
  let bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

  // If input contains a full image or larger slice beginning before 0x10000,
  // inspect slice starting at SUPERBLOCK_OFFSET if magic matches there.
  if (bytes.byteLength >= SUPERBLOCK_OFFSET + SUPERBLOCK_SIZE) {
    const candidateMagic = new TextDecoder('ascii').decode(
      bytes.subarray(SUPERBLOCK_OFFSET + MAGIC_OFFSET, SUPERBLOCK_OFFSET + MAGIC_OFFSET + 8)
    );
    if (candidateMagic === BTRFS_MAGIC) {
      bytes = bytes.subarray(SUPERBLOCK_OFFSET, SUPERBLOCK_OFFSET + SUPERBLOCK_SIZE);
    }
  }

  if (bytes.byteLength < MAGIC_OFFSET + 8) {
    throw new Error(
      `Truncated superblock: received ${bytes.byteLength} bytes, expected at least 4096 bytes.`
    );
  }

  const magicBytes = bytes.subarray(MAGIC_OFFSET, MAGIC_OFFSET + 8);
  const magic = new TextDecoder('ascii').decode(magicBytes);
  if (magic !== BTRFS_MAGIC) {
    const safeMagic = magic.replace(/[^\x20-\x7E]/g, '?');
    throw new Error(
      `Invalid Btrfs superblock: magic '${BTRFS_MAGIC}' not found (got '${safeMagic}').`
    );
  }

  if (bytes.byteLength < SUPERBLOCK_SIZE) {
    throw new Error(
      `Truncated superblock: received ${bytes.byteLength} bytes, expected full 4096 bytes.`
    );
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Checksum
  const csumType = view.getUint16(0xc4, true);
  const csumInfo = CSUM_TYPES[csumType] || {
    id: csumType,
    name: `Unknown (${csumType})`,
    length: 32,
  };
  const csumBytes = bytes.subarray(0, 32);
  const activeCsumBytes = csumBytes.subarray(0, csumInfo.length);
  const csumHex = Array.from(activeCsumBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const csumFullHex = Array.from(csumBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // FSID
  const fsid = formatUuid(bytes, 0x20);

  // Physical bytenr & flags
  const bytenr = view.getBigUint64(0x30, true);
  const flags = view.getBigUint64(0x38, true);
  const decodedFlags = decodeFlags(flags, SUPER_FLAG_DEFINITIONS);

  // Generation & Tree roots
  const generation = view.getBigUint64(0x48, true);
  const root = view.getBigUint64(0x50, true);
  const chunkRoot = view.getBigUint64(0x58, true);
  const logRoot = view.getBigUint64(0x60, true);

  // Sizing & Devices
  const totalBytes = view.getBigUint64(0x70, true);
  const bytesUsed = view.getBigUint64(0x78, true);
  const rootDirObjectId = view.getBigUint64(0x80, true);
  const numDevices = view.getBigUint64(0x88, true);

  // Geometry
  const sectorsize = view.getUint32(0x90, true);
  const nodesize = view.getUint32(0x94, true);
  const stripesize = view.getUint32(0x9c, true);

  // Feature flags
  const compatFlags = view.getBigUint64(0xac, true);
  const decodedCompatFlags = decodeFlags(compatFlags, COMPAT_FLAG_DEFINITIONS);

  const compatRoFlags = view.getBigUint64(0xb4, true);
  const decodedCompatRoFlags = decodeFlags(compatRoFlags, COMPAT_RO_FLAG_DEFINITIONS);

  const incompatFlags = view.getBigUint64(0xbc, true);
  const decodedIncompatFlags = decodeFlags(incompatFlags, INCOMPAT_FLAG_DEFINITIONS);

  // Volume Label (256 bytes at 0x12b)
  const labelBytes = bytes.subarray(0x12b, 0x12b + 256);
  let nullIndex = labelBytes.indexOf(0);
  if (nullIndex === -1) nullIndex = 256;
  const label = new TextDecoder('utf-8').decode(labelBytes.subarray(0, nullIndex)).trim();

  return {
    magic,
    csumType: {
      value: csumType,
      name: csumInfo.name,
      length: csumInfo.length,
    },
    csumHex,
    csumFullHex,
    fsid,
    bytenr,
    flags,
    decodedFlags,
    generation,
    root,
    chunkRoot,
    logRoot,
    totalBytes,
    bytesUsed,
    rootDirObjectId,
    numDevices,
    sectorsize,
    nodesize,
    stripesize,
    compatFlags,
    decodedCompatFlags,
    compatRoFlags,
    decodedCompatRoFlags,
    incompatFlags,
    decodedIncompatFlags,
    label,
  };
}

/**
 * Reads a Blob or File as an ArrayBuffer, with fallback to FileReader for jsdom/older environments.
 *
 * @param {Blob|File} blob
 * @returns {Promise<ArrayBuffer>}
 */
export function readBlobAsArrayBuffer(blob) {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(/** @type {ArrayBuffer} */ (reader.result));
    reader.onerror = () => reject(new Error('Failed to read file slice.'));
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * Reads only the slice at offset 0x10000 (64 KiB) of an uploaded image file and parses it.
 *
 * @param {File|Blob} file
 * @returns {Promise<object>} The parsed superblock details with file metadata.
 */
export async function readSuperblockFromImage(file) {
  if (!file || typeof file.size !== 'number') {
    throw new TypeError('A valid File or Blob must be provided.');
  }

  if (file.size < SUPERBLOCK_OFFSET + SUPERBLOCK_SIZE) {
    const requiredSize = SUPERBLOCK_OFFSET + SUPERBLOCK_SIZE;
    throw new Error(
      `Truncated image: file size (${formatBytes(file.size)}) is too small to contain ` +
        `a Btrfs superblock at offset 0x10000 (minimum ${requiredSize} bytes required).`
    );
  }

  const slice = file.slice(SUPERBLOCK_OFFSET, SUPERBLOCK_OFFSET + SUPERBLOCK_SIZE);
  const arrayBuffer = await readBlobAsArrayBuffer(slice);
  const parsed = parseBtrfsSuperblock(new Uint8Array(arrayBuffer));

  return {
    ...parsed,
    fileInfo: {
      name: file.name || 'image.bin',
      size: file.size,
      sliceOffset: SUPERBLOCK_OFFSET,
      sliceSize: SUPERBLOCK_SIZE,
    },
  };
}

/**
 * Creates a synthetic 4096-byte Btrfs superblock buffer for testing and sample display.
 *
 * @param {object} [overrides={}]
 * @returns {Uint8Array}
 */
export function createSampleBtrfsSuperblock(overrides = {}) {
  const buffer = new Uint8Array(SUPERBLOCK_SIZE);
  const view = new DataView(buffer.buffer);

  // Checksum (default CRC32c)
  buffer.set(overrides.csum ?? [0x78, 0x56, 0x34, 0x12], 0);

  // FSID
  buffer.set(
    overrides.fsid ?? [
      0x4a, 0x7f, 0x19, 0xb8, 0x23, 0x41, 0x4f, 0x92, 0x89, 0xac, 0x56, 0xef, 0x78, 0x90, 0x12,
      0x34,
    ],
    0x20
  );

  // bytenr: 0x10000
  view.setBigUint64(0x30, overrides.bytenr ?? 0x10000n, true);

  // flags
  view.setBigUint64(0x38, overrides.flags ?? 0n, true);

  // magic: '_BHRfS_M'
  const magic = overrides.magic ?? BTRFS_MAGIC;
  const magicBytes = new TextEncoder().encode(magic);
  buffer.set(magicBytes.subarray(0, 8), 0x40);

  // generation
  view.setBigUint64(0x48, overrides.generation ?? 1024n, true);

  // tree roots
  view.setBigUint64(0x50, overrides.root ?? 0x104000n, true);
  view.setBigUint64(0x58, overrides.chunkRoot ?? 0x108000n, true);
  view.setBigUint64(0x60, overrides.logRoot ?? 0n, true);

  // total_bytes & bytes_used
  view.setBigUint64(0x70, overrides.totalBytes ?? 21474836480n, true); // 20 GiB
  view.setBigUint64(0x78, overrides.bytesUsed ?? 1073741824n, true); // 1 GiB

  // root_dir_objectid & num_devices
  view.setBigUint64(0x80, overrides.rootDirObjectId ?? 6n, true);
  view.setBigUint64(0x88, overrides.numDevices ?? 1n, true);

  // sectorsize, nodesize, leafsize, stripesize
  view.setUint32(0x90, overrides.sectorsize ?? 4096, true);
  view.setUint32(0x94, overrides.nodesize ?? 16384, true);
  view.setUint32(0x98, overrides.leafsize ?? 16384, true);
  view.setUint32(0x9c, overrides.stripesize ?? 4096, true);

  // compat / compat_ro / incompat
  view.setBigUint64(0xac, overrides.compatFlags ?? 0n, true);
  // FREE_SPACE_TREE | FREE_SPACE_TREE_VALID
  view.setBigUint64(0xb4, overrides.compatRoFlags ?? 0x3n, true);
  // SKINNY_METADATA | NO_HOLES
  view.setBigUint64(0xbc, overrides.incompatFlags ?? 0x300n, true);

  // csum_type
  view.setUint16(0xc4, overrides.csumType ?? 0, true); // CRC32c

  // label
  const label = overrides.label !== undefined ? overrides.label : 'btrfs-data-volume';
  const labelBytes = new TextEncoder().encode(label);
  buffer.set(labelBytes.subarray(0, 255), 0x12b);

  return buffer;
}
