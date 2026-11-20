const BZIP2_MAGIC = [0x42, 0x5a, 0x68];
const BLOCK_MAGIC = [0x31, 0x41, 0x59, 0x26, 0x53, 0x59];
const FOOTER_MAGIC = [0x17, 0x72, 0x45, 0x38, 0x50, 0x90];

/**
 * Checks whether bytes at an offset match an expected byte sequence.
 *
 * @param {DataView} view - The binary data to inspect.
 * @param {number} offset - The first byte to compare.
 * @param {number[]} expected - The expected byte sequence.
 * @returns {boolean} Whether every expected byte matches.
 */
function matchesBytes(view, offset, expected) {
  if (view.byteLength - offset < expected.length) return false;
  return expected.every((byte, index) => view.getUint8(offset + index) === byte);
}

/**
 * Formats a byte sequence as an uppercase hexadecimal value.
 *
 * @param {DataView} view - The binary data to inspect.
 * @param {number} offset - The first byte to format.
 * @param {number} length - The number of bytes to format.
 * @returns {string} The formatted hexadecimal value.
 */
function formatHex(view, offset, length) {
  return Array.from({ length }, (_, index) => view.getUint8(offset + index))
    .map((byte) => byte.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');
}

/**
 * Parses the uncompressed BZip2 stream header and its initial stream marker.
 *
 * @param {ArrayBuffer} buffer - The selected file contents.
 * @returns {{blockSize: number | null, marker: string | null, warnings: string[]}}
 *   Parsed header details and any non-fatal validation warnings.
 */
export function parseBzip2Header(buffer) {
  const warnings = [];
  if (!(buffer instanceof ArrayBuffer)) {
    return {
      blockSize: null,
      marker: null,
      warnings: ['The selected file could not be read as binary data.'],
    };
  }

  const view = new DataView(buffer);
  if (view.byteLength < 4) {
    return {
      blockSize: null,
      marker: null,
      warnings: ['The file is truncated: a BZip2 stream header requires at least 4 bytes.'],
    };
  }

  if (!matchesBytes(view, 0, BZIP2_MAGIC)) {
    return {
      blockSize: null,
      marker: null,
      warnings: ['Invalid BZip2 magic bytes. Expected the ASCII signature "BZh".'],
    };
  }

  const blockSizeByte = view.getUint8(3);
  if (blockSizeByte < 0x31 || blockSizeByte > 0x39) {
    return {
      blockSize: null,
      marker: null,
      warnings: ['Invalid BZip2 block-size digit. Expected an ASCII digit from 1 through 9.'],
    };
  }

  const blockSize = blockSizeByte - 0x30;
  if (view.byteLength < 10) {
    return {
      blockSize,
      marker: null,
      warnings: ['The stream header is valid, but the initial 6-byte marker is truncated.'],
    };
  }

  if (matchesBytes(view, 4, BLOCK_MAGIC)) {
    return { blockSize, marker: 'Block magic (0x314159265359)', warnings };
  }
  if (matchesBytes(view, 4, FOOTER_MAGIC)) {
    return { blockSize, marker: 'Stream footer magic (0x177245385090)', warnings };
  }

  return {
    blockSize,
    marker: null,
    warnings: [
      `Invalid initial stream marker: ${formatHex(view, 4, 6)}. ` +
        'Expected a block magic or stream footer magic value.',
    ],
  };
}
