/**
 * CramFS filesystem superblock inspector utilities.
 */

export const CRAMFS_MAGIC = 0x28cd3d45;
export const CRAMFS_SUPERBLOCK_SIZE = 76;
export const CRAMFS_SIGNATURE = 'Compressed ROMFS';

export const CRAMFS_FLAGS = [
  {
    bit: 0x00000001,
    id: 'CRAMFS_FLAG_FSID_VERSION_2',
    name: 'FSID Version 2',
    description: 'FSID structure version 2 is used',
  },
  {
    bit: 0x00000002,
    id: 'CRAMFS_FLAG_SORTED_DIRS',
    name: 'Sorted Directories',
    description: 'Directory entries are sorted alphabetically',
  },
  {
    bit: 0x00000100,
    id: 'CRAMFS_FLAG_HOLES',
    name: 'Holes Support',
    description: 'Sparse files (holes) supported',
  },
  {
    bit: 0x00000200,
    id: 'CRAMFS_FLAG_WRONG_SIGNATURE',
    name: 'Wrong Signature',
    description: 'Legacy wrong signature flag',
  },
  {
    bit: 0x00000400,
    id: 'CRAMFS_FLAG_SHIFTED_ROOT_OFFSET',
    name: 'Shifted Root Offset',
    description: 'Root filesystem offset is shifted',
  },
  {
    bit: 0x00000800,
    id: 'CRAMFS_FLAG_EXT_BLOCK_POINTERS',
    name: 'Extended Block Pointers',
    description: 'Block pointer extensions are used',
  },
];

/**
 * Decodes active CramFS flag names from a 32-bit flags integer.
 * @param {number} flags
 * @returns {string[]}
 */
export function decodeCramfsFlags(flags) {
  const decoded = [];
  let knownMask = 0;
  for (const flag of CRAMFS_FLAGS) {
    if (((flags >>> 0) & flag.bit) !== 0) {
      decoded.push(flag.name);
      knownMask |= flag.bit;
    }
  }
  const unknownBits = ((flags >>> 0) & ~knownMask) >>> 0;
  if (unknownBits !== 0) {
    decoded.push(`Unknown (0x${unknownBits.toString(16).padStart(8, '0')})`);
  }
  return decoded;
}

/**
 * Returns detailed information for all known CramFS flags and their active status.
 * @param {number} flags
 * @returns {Array<{ bit: number, id: string, name: string, description: string, active: boolean }>}
 */
export function getCramfsFlagDetails(flags) {
  return CRAMFS_FLAGS.map((flag) => ({
    ...flag,
    active: (flags & flag.bit) !== 0,
  }));
}

/**
 * Decodes a null-terminated UTF-8 / ASCII byte array to string.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function decodeNullTerminatedAscii(bytes) {
  const nullIndex = bytes.indexOf(0);
  const slice = nullIndex === -1 ? bytes : bytes.subarray(0, nullIndex);
  return new TextDecoder('utf-8', { fatal: false }).decode(slice);
}

/**
 * Formats a byte count into a human-readable string.
 * @param {number} bytes
 * @returns {string}
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
 * Parses a CramFS superblock from an ArrayBuffer or TypedArray.
 * Must be at least 76 bytes.
 * @param {ArrayBuffer|ArrayBufferView} input
 * @returns {object} Parsed superblock metadata.
 */
export function parseCramfsSuperblock(input) {
  let view;
  let rawBytes;

  if (input instanceof ArrayBuffer) {
    view = new DataView(input);
    rawBytes = new Uint8Array(input);
  } else if (ArrayBuffer.isView(input)) {
    view = new DataView(input.buffer, input.byteOffset, input.byteLength);
    rawBytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  } else {
    throw new TypeError('Input must be an ArrayBuffer or ArrayBufferView.');
  }

  if (view.byteLength < CRAMFS_SUPERBLOCK_SIZE) {
    throw new Error(
      `Truncated CramFS image: expected at least ${CRAMFS_SUPERBLOCK_SIZE} bytes, ` +
      `received ${view.byteLength} byte(s).`
    );
  }

  const leMagic = view.getUint32(0, true);
  const beMagic = view.getUint32(0, false);

  let littleEndian;
  let endianness;

  if (leMagic === CRAMFS_MAGIC) {
    littleEndian = true;
    endianness = 'little';
  } else if (beMagic === CRAMFS_MAGIC) {
    littleEndian = false;
    endianness = 'big';
  } else {
    const foundHex = view.getUint32(0, false).toString(16).padStart(8, '0');
    throw new Error(
      `Invalid CramFS magic: expected 0x${CRAMFS_MAGIC.toString(16)}, found 0x${foundHex}.`
    );
  }

  const size = view.getUint32(4, littleEndian);
  const flags = view.getUint32(8, littleEndian);
  const future = view.getUint32(12, littleEndian);
  const signature = decodeNullTerminatedAscii(rawBytes.subarray(16, 32));

  const fsidCrc = view.getUint32(32, littleEndian);
  const fsidEdition = view.getUint32(36, littleEndian);
  const fsidBlocks = view.getUint32(40, littleEndian);
  const fsidFiles = view.getUint32(44, littleEndian);

  const name = decodeNullTerminatedAscii(rawBytes.subarray(48, 64));

  return {
    magic: CRAMFS_MAGIC,
    magicHex: `0x${CRAMFS_MAGIC.toString(16)}`,
    endianness,
    size,
    flags,
    flagsHex: `0x${flags.toString(16).padStart(8, '0')}`,
    flagNames: decodeCramfsFlags(flags),
    flagDetails: getCramfsFlagDetails(flags),
    future,
    futureHex: `0x${future.toString(16).padStart(8, '0')}`,
    signature,
    fsid: {
      crc: fsidCrc,
      crcHex: `0x${fsidCrc.toString(16).padStart(8, '0')}`,
      edition: fsidEdition,
      blocks: fsidBlocks,
      files: fsidFiles,
    },
    name,
  };
}

/**
 * Reads a Blob/File slice into an ArrayBuffer using native arrayBuffer() or FileReader fallback.
 * @param {Blob} blob
 * @returns {Promise<ArrayBuffer>}
 */
export function readBlobAsArrayBuffer(blob) {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(/** @type {ArrayBuffer} */ (reader.result));
    reader.onerror = () => reject(new Error('Failed to read the file slice.'));
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * Reads only the first 76 bytes of an uploaded CramFS image and returns parsed
 * superblock info with actual file size.
 * @param {File|Blob} file
 * @returns {Promise<object>}
 */
export async function readCramfsSuperblockFile(file) {
  if (!file || typeof file.size !== 'number') {
    throw new TypeError('Expected a valid File or Blob.');
  }

  const actualSize = file.size;
  if (actualSize < CRAMFS_SUPERBLOCK_SIZE) {
    throw new Error(
      `Truncated CramFS image: expected at least ${CRAMFS_SUPERBLOCK_SIZE} bytes, ` +
      `received ${actualSize} byte(s).`
    );
  }

  const slice = file.slice(0, CRAMFS_SUPERBLOCK_SIZE);
  const buffer = await readBlobAsArrayBuffer(slice);
  const parsed = parseCramfsSuperblock(buffer);

  return {
    ...parsed,
    actualSize,
  };
}

/**
 * Creates a sample CramFS superblock buffer for testing or demonstration.
 * @param {object} [options]
 * @returns {Uint8Array}
 */
export function createSampleSuperblock({
  endianness = 'little',
  size = 65536,
  flags = 0x00000003,
  future = 0,
  signature = CRAMFS_SIGNATURE,
  fsid = { crc: 0x12345678, edition: 1, blocks: 16, files: 4 },
  name = 'cramfs-sample',
} = {}) {
  const buffer = new ArrayBuffer(CRAMFS_SUPERBLOCK_SIZE);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const isLe = endianness === 'little';

  view.setUint32(0, CRAMFS_MAGIC, isLe);
  view.setUint32(4, size, isLe);
  view.setUint32(8, flags, isLe);
  view.setUint32(12, future, isLe);

  const encoder = new TextEncoder();
  const sigBytes = encoder.encode(signature);
  bytes.set(sigBytes.subarray(0, 16), 16);

  view.setUint32(32, fsid.crc, isLe);
  view.setUint32(36, fsid.edition, isLe);
  view.setUint32(40, fsid.blocks, isLe);
  view.setUint32(44, fsid.files, isLe);

  const nameBytes = encoder.encode(name);
  bytes.set(nameBytes.subarray(0, 16), 48);

  return new Uint8Array(buffer);
}
