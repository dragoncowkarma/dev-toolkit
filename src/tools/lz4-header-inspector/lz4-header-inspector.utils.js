const LZ4_FRAME_MAGIC = 0x184d2204;
const BLOCK_SIZE_LABELS = {
  4: '64 KB',
  5: '256 KB',
  6: '1 MB',
  7: '4 MB',
};

function readUint32LE(bytes, offset) {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

function readUint64LE(bytes, offset) {
  let value = 0n;
  for (let index = 7; index >= 0; index -= 1) {
    value = (value << 8n) | BigInt(bytes[offset + index]);
  }
  return value;
}

function rotateLeft(value, bits) {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

/**
 * Computes the xxHash32 value used by LZ4 frame header checksums.
 * @param {Uint8Array} input - Descriptor bytes, excluding the checksum byte.
 * @returns {number} Unsigned xxHash32 result.
 */
export function xxhash32(input) {
  const prime1 = 0x9e3779b1;
  const prime2 = 0x85ebca77;
  const prime3 = 0xc2b2ae3d;
  const prime4 = 0x27d4eb2f;
  const prime5 = 0x165667b1;
  let offset = 0;
  let hash;

  const round = (accumulator, value) =>
    Math.imul(rotateLeft((accumulator + Math.imul(value, prime2)) >>> 0, 13), prime1) >>> 0;

  if (input.length >= 16) {
    let v1 = (prime1 + prime2) >>> 0;
    let v2 = prime2;
    let v3 = 0;
    let v4 = (-prime1) >>> 0;
    const limit = input.length - 16;
    while (offset <= limit) {
      v1 = round(v1, readUint32LE(input, offset));
      v2 = round(v2, readUint32LE(input, offset + 4));
      v3 = round(v3, readUint32LE(input, offset + 8));
      v4 = round(v4, readUint32LE(input, offset + 12));
      offset += 16;
    }
    hash = (rotateLeft(v1, 1) + rotateLeft(v2, 7) + rotateLeft(v3, 12) + rotateLeft(v4, 18)) >>> 0;
  } else {
    hash = prime5;
  }

  hash = (hash + input.length) >>> 0;
  while (offset + 4 <= input.length) {
    hash = (hash + Math.imul(readUint32LE(input, offset), prime3)) >>> 0;
    hash = Math.imul(rotateLeft(hash, 17), prime4) >>> 0;
    offset += 4;
  }
  while (offset < input.length) {
    hash = (hash + Math.imul(input[offset], prime5)) >>> 0;
    hash = Math.imul(rotateLeft(hash, 11), prime1) >>> 0;
    offset += 1;
  }
  hash ^= hash >>> 15;
  hash = Math.imul(hash, prime2) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, prime3) >>> 0;
  return (hash ^ (hash >>> 16)) >>> 0;
}

function requireBytes(bytes, offset, count, label) {
  if (offset + count > bytes.length) {
    throw new Error(`Truncated LZ4 frame: missing ${label}.`);
  }
}

/**
 * Parses an LZ4 frame header and block boundaries without decompressing payloads.
 * @param {ArrayBuffer|Uint8Array} input - The local file bytes to inspect.
 * @returns {object} Parsed frame details.
 * @throws {Error} When the input is not a complete valid LZ4 frame.
 */
export function parseLz4Frame(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  requireBytes(bytes, 0, 4, 'frame magic number');
  if (readUint32LE(bytes, 0) !== LZ4_FRAME_MAGIC) {
    throw new Error('Invalid LZ4 frame magic number.');
  }

  requireBytes(bytes, 4, 2, 'frame descriptor');
  const flg = bytes[4];
  const bd = bytes[5];
  const version = flg >>> 6;
  if (version !== 1) throw new Error(`Unsupported LZ4 frame version: ${version}.`);
  if ((flg & 0x02) !== 0) throw new Error('Invalid LZ4 frame: reserved FLG bit is set.');
  if ((bd & 0x8f) !== 0 || !BLOCK_SIZE_LABELS[(bd >>> 4) & 0x07]) {
    throw new Error('Invalid LZ4 frame block maximum size.');
  }

  const contentSizeFlag = (flg & 0x08) !== 0;
  const dictionaryIdFlag = (flg & 0x01) !== 0;
  const descriptorStart = 4;
  let offset = 6;
  let contentSize = null;
  let dictionaryId = null;
  if (contentSizeFlag) {
    requireBytes(bytes, offset, 8, 'content size field');
    contentSize = readUint64LE(bytes, offset);
    offset += 8;
  }
  if (dictionaryIdFlag) {
    requireBytes(bytes, offset, 4, 'dictionary ID field');
    dictionaryId = readUint32LE(bytes, offset);
    offset += 4;
  }
  requireBytes(bytes, offset, 1, 'header checksum');
  const headerChecksum = bytes[offset];
  const expectedHeaderChecksum = (xxhash32(bytes.slice(descriptorStart, offset)) >>> 8) & 0xff;
  if (headerChecksum !== expectedHeaderChecksum) {
    throw new Error(
      `Invalid LZ4 header checksum (expected 0x${expectedHeaderChecksum
        .toString(16).padStart(2, '0')}).`
    );
  }
  offset += 1;

  let blockCount = 0;
  let compressedSize = 0;
  let uncompressedBlockCount = 0;
  while (true) {
    requireBytes(bytes, offset, 4, 'block header');
    const rawBlockSize = readUint32LE(bytes, offset);
    offset += 4;
    if (rawBlockSize === 0) break;
    const uncompressed = (rawBlockSize & 0x80000000) !== 0;
    const blockSize = rawBlockSize & 0x7fffffff;
    requireBytes(bytes, offset, blockSize, 'block payload');
    blockCount += 1;
    compressedSize += blockSize;
    if (uncompressed) uncompressedBlockCount += 1;
    offset += blockSize;
    if ((flg & 0x10) !== 0) {
      requireBytes(bytes, offset, 4, 'block checksum');
      offset += 4;
    }
  }
  if ((flg & 0x04) !== 0) requireBytes(bytes, offset, 4, 'content checksum');

  return {
    version,
    blockIndependent: (flg & 0x20) !== 0,
    blockChecksum: (flg & 0x10) !== 0,
    contentChecksum: (flg & 0x04) !== 0,
    contentSize,
    dictionaryId,
    maxBlockSize: BLOCK_SIZE_LABELS[(bd >>> 4) & 0x07],
    headerChecksum,
    blockCount,
    compressedSize,
    uncompressedBlockCount,
  };
}
