const SUPERBLOCK_SIZE = 96;
const SQUASHFS_MAGIC = 0x73717368;
const NO_TABLE_OFFSET = 0xffffffffffffffffn;

const COMPRESSION_NAMES = {
  1: 'gzip',
  2: 'lzma',
  3: 'lzo',
  4: 'xz',
  5: 'lz4',
  6: 'zstd',
};

const FLAG_DEFINITIONS = [
  [0x0001, 'Uncompressed inodes'],
  [0x0002, 'Uncompressed data'],
  [0x0008, 'Uncompressed fragments'],
  [0x0010, 'No fragments'],
  [0x0020, 'Always fragments'],
  [0x0040, 'Duplicates'],
  [0x0080, 'Exportable'],
  [0x0100, 'Uncompressed xattrs'],
  [0x0200, 'No xattrs'],
  [0x0400, 'Compressor options present'],
  [0x0800, 'Uncompressed IDs'],
];

/**
 * Converts a SquashFS compression identifier into a user-facing name.
 *
 * @param {number} compressionId - Numeric compression identifier from the superblock.
 * @returns {string} Compression name.
 */
export function formatCompression(compressionId) {
  return COMPRESSION_NAMES[compressionId] ?? `Unknown (${compressionId})`;
}

/**
 * Formats a 64-bit table offset without converting it to a Number.
 *
 * @param {bigint} offset - Offset from the superblock.
 * @returns {string} Decimal offset or `none` for the SquashFS sentinel.
 */
export function formatTableOffset(offset) {
  return offset === NO_TABLE_OFFSET ? 'none' : offset.toString();
}

/**
 * Parses a little-endian SquashFS 4.0 superblock from an in-memory file.
 *
 * @param {ArrayBuffer} buffer - The uploaded file bytes.
 * @returns {object} Parsed superblock metadata.
 * @throws {Error} When the buffer is invalid or not a supported SquashFS 4 file.
 */
export function parseSquashfsSuperblock(buffer) {
  if (!(buffer instanceof ArrayBuffer)) {
    throw new Error('No file selected. Choose a SquashFS image to inspect.');
  }
  if (buffer.byteLength < SUPERBLOCK_SIZE) {
    throw new Error('The selected file is shorter than the 96-byte SquashFS superblock.');
  }

  const view = new DataView(buffer, 0, SUPERBLOCK_SIZE);
  const magic = view.getUint32(0, true);
  if (magic !== SQUASHFS_MAGIC) {
    throw new Error('Invalid SquashFS magic. Expected hsqs at the start of the file.');
  }

  const majorVersion = view.getUint16(28, true);
  const minorVersion = view.getUint16(30, true);
  if (majorVersion !== 4) {
    throw new Error(
      `Unsupported SquashFS major version ${majorVersion}. Only version 4 is supported.`
    );
  }

  const blockSize = view.getUint32(12, true);
  const blockLog = view.getUint16(22, true);
  const expectedBlockLog = blockSize > 0 ? Math.log2(blockSize) : Number.NaN;

  return {
    magic: 'hsqs',
    inodeCount: view.getUint32(4, true),
    modificationTime: view.getUint32(8, true),
    modificationTimeIso: new Date(view.getUint32(8, true) * 1000).toISOString(),
    blockSize,
    fragmentCount: view.getUint32(16, true),
    compressionId: view.getUint16(20, true),
    compression: formatCompression(view.getUint16(20, true)),
    blockLog,
    expectedBlockLog,
    blockLogMatches: Number.isInteger(expectedBlockLog) && blockLog === expectedBlockLog,
    flags: FLAG_DEFINITIONS.map(([bit, label]) => ({
      label,
      enabled: (view.getUint16(24, true) & bit) !== 0,
    })),
    idCount: view.getUint16(26, true),
    majorVersion,
    minorVersion,
    rootInodeReference: view.getBigUint64(32, true),
    bytesUsed: view.getBigUint64(40, true),
    tableOffsets: {
      id: view.getBigUint64(48, true),
      xattr: view.getBigUint64(56, true),
      inode: view.getBigUint64(64, true),
      directory: view.getBigUint64(72, true),
      fragment: view.getBigUint64(80, true),
      export: view.getBigUint64(88, true),
    },
  };
}
