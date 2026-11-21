const LZ4_FRAME_MAGIC = 0x184d2204;
const LZ4_LEGACY_MAGIC = 0x184c2102;

const BLOCK_MAX_SIZES = {
  4: 64 * 1024,
  5: 256 * 1024,
  6: 1024 * 1024,
  7: 4 * 1024 * 1024,
};

function requireBytes(view, offset, count, label) {
  if (offset + count > view.byteLength) {
    throw new Error(`The file is truncated while reading ${label}.`);
  }
}

function formatBytes(bytes) {
  return bytes.toLocaleString('en-US');
}

/**
 * Parses an LZ4 frame header and its block boundaries without decompressing data.
 *
 * @param {ArrayBuffer} buffer - The local file contents.
 * @returns {object} Parsed frame information.
 * @throws {Error} When the file is malformed or incomplete.
 */
export function parseLz4Frame(buffer) {
  if (!(buffer instanceof ArrayBuffer)) {
    throw new TypeError('Expected the selected file contents as an ArrayBuffer.');
  }

  const view = new DataView(buffer);
  requireBytes(view, 0, 4, 'the magic number');
  const magic = view.getUint32(0, true);

  if (magic === LZ4_LEGACY_MAGIC) {
    return { kind: 'legacy' };
  }
  if (magic !== LZ4_FRAME_MAGIC) {
    throw new Error('This file does not begin with an LZ4 frame magic number.');
  }

  requireBytes(view, 4, 2, 'the FLG and BD bytes');
  const flg = view.getUint8(4);
  const bd = view.getUint8(5);
  const version = flg >> 6;
  const blockMaximumCode = (bd >> 4) & 0x07;
  const blockMaximumSize = BLOCK_MAX_SIZES[blockMaximumCode];

  if (version !== 1) {
    throw new Error(`Unsupported LZ4 frame version ${version}.`);
  }
  if ((flg & 0x02) !== 0 || (bd & 0x8f) !== 0 || !blockMaximumSize) {
    throw new Error('The LZ4 frame header contains reserved or invalid flag values.');
  }

  const flags = {
    blockIndependence: Boolean(flg & 0x20),
    blockChecksum: Boolean(flg & 0x10),
    contentSize: Boolean(flg & 0x08),
    contentChecksum: Boolean(flg & 0x04),
    dictionaryId: Boolean(flg & 0x01),
  };
  let offset = 6;
  let contentSize;
  let dictionaryId;

  if (flags.contentSize) {
    requireBytes(view, offset, 8, 'the Content Size field');
    contentSize = view.getBigUint64(offset, true);
    offset += 8;
  }
  if (flags.dictionaryId) {
    requireBytes(view, offset, 4, 'the Dictionary ID field');
    dictionaryId = view.getUint32(offset, true);
    offset += 4;
  }

  requireBytes(view, offset, 1, 'the Header Checksum byte');
  const headerChecksum = view.getUint8(offset);
  offset += 1;
  const blocks = [];

  while (true) {
    requireBytes(view, offset, 4, 'a block size field');
    const encodedSize = view.getUint32(offset, true);
    offset += 4;
    if (encodedSize === 0) break;

    const uncompressed = Boolean(encodedSize & 0x80000000);
    const size = encodedSize & 0x7fffffff;
    if (size === 0 || size > blockMaximumSize) {
      throw new Error(
        `Block ${blocks.length + 1} has an out-of-range size (${formatBytes(size)} bytes).`,
      );
    }
    requireBytes(view, offset, size, `block ${blocks.length + 1} payload`);
    const payloadOffset = offset;
    offset += size;
    if (flags.blockChecksum) {
      requireBytes(view, offset, 4, `block ${blocks.length + 1} checksum`);
      offset += 4;
    }
    blocks.push({ index: blocks.length + 1, offset: payloadOffset, size, uncompressed });
  }

  if (flags.contentChecksum) {
    requireBytes(view, offset, 4, 'the Content Checksum field');
    offset += 4;
  }

  return {
    kind: 'frame',
    magic,
    version,
    flags,
    blockMaximumSize,
    contentSize,
    dictionaryId,
    headerChecksum,
    blocks,
    consumedBytes: offset,
  };
}

/**
 * Formats an unsigned 64-bit content size for display without losing precision.
 *
 * @param {bigint|undefined} value - The parsed optional content size.
 * @returns {string} A readable value or "Not present" when unavailable.
 */
export function formatContentSize(value) {
  return value === undefined ? 'Not present' : `${value.toLocaleString('en-US')} bytes`;
}
