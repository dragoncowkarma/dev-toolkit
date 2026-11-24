export const MAX_INSPECT_BYTES = 4096;
export const JFFS2_HEADER_SIZE = 12;
export const JFFS2_MAGIC = 0x1985;
export const JFFS2_MAGIC_SWAPPED = 0x8519;

export const JFFS2_NODE_TYPES = Object.freeze({
  0xe001: 'DIRENT',
  0xe002: 'INODE',
  0x2003: 'CLEANMARKER',
  0x2004: 'PADDING',
  0x2006: 'SUMMARY',
  0xe008: 'XATTR',
  0xe009: 'XREF',
});

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc = i;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

/**
 * Aligns a non-negative byte length up to a 4-byte boundary without 32-bit overflow.
 *
 * @param {number} length - Byte length to align.
 * @returns {number} 4-byte-aligned length.
 */
export function align4(length) {
  const remainder = length % 4;
  return remainder === 0 ? length : length + (4 - remainder);
}

/**
 * Formats an unsigned integer as an uppercase 0x-prefixed hexadecimal string.
 *
 * @param {number} value - Unsigned integer to format.
 * @param {number} [width=4] - Minimum number of hex digits.
 * @returns {string} Formatted hex string (e.g. "0x1985").
 */
export function formatHex(value, width = 4) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

/**
 * Formats a byte count into a human-readable string (e.g. "4.0 KB").
 *
 * @param {number} bytes - Byte count.
 * @returns {string} Human-readable size label.
 */
export function formatByteSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Computes JFFS2 CRC32 (init 0, no final XOR, reflected IEEE 802.3 polynomial 0xEDB88320).
 *
 * @param {Uint8Array} bytes - Input byte buffer.
 * @param {number} [start=0] - Start byte offset.
 * @param {number} [length=bytes.length - start] - Number of bytes to hash.
 * @returns {number} Unsigned 32-bit CRC32 value.
 */
export function jffs2Crc32(bytes, start = 0, length = bytes.length - start) {
  let crc = 0;
  const end = start + length;
  for (let i = start; i < end; i += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return crc >>> 0;
}

/**
 * Resolves a JFFS2 nodetype uint16 to its symbolic name.
 *
 * @param {number} nodetype - 16-bit JFFS2 node type value.
 * @returns {string} Node type name, or "UNKNOWN" when unrecognized.
 */
export function getNodeTypeName(nodetype) {
  return JFFS2_NODE_TYPES[nodetype] ?? 'UNKNOWN';
}

/**
 * Detects JFFS2 byte order from a 2-byte magic signature at the given offset.
 * Bytes [0x85, 0x19] (0x1985 LE) indicate little-endian;
 * bytes [0x19, 0x85] (0x8519 LE) indicate big-endian.
 *
 * @param {Uint8Array} bytes - Input bytes.
 * @param {number} [offset=0] - Offset of the 2-byte magic field.
 * @returns {'little' | 'big' | null} Detected byte order, or null if magic does not match.
 */
export function detectByteOrder(bytes, offset = 0) {
  if (offset + 2 > bytes.length) {
    return null;
  }
  const leMagic = bytes[offset] | (bytes[offset + 1] << 8);
  if (leMagic === JFFS2_MAGIC) {
    return 'little';
  }
  if (leMagic === JFFS2_MAGIC_SWAPPED) {
    return 'big';
  }
  return null;
}

function isFillSpan(bytes, start, end, fillByte) {
  for (let i = start; i < end; i += 1) {
    if (bytes[i] !== fillByte) {
      return false;
    }
  }
  return end > start;
}

function consumeFillRun(bytes, start, fillByte) {
  let offset = start;
  while (offset + 4 <= bytes.length && isFillSpan(bytes, offset, offset + 4, fillByte)) {
    offset += 4;
  }
  if (offset < bytes.length && bytes.length - offset < 4) {
    if (isFillSpan(bytes, offset, bytes.length, fillByte)) {
      offset = bytes.length;
    }
  }
  return offset - start;
}

function buildEmptySummary() {
  return {
    nodeCount: 0,
    validCrcCount: 0,
    invalidCrcCount: 0,
    truncatedCount: 0,
    totlenTooSmallCount: 0,
    erasedRegionCount: 0,
    zeroFilledRegionCount: 0,
  };
}

/**
 * Parses and verifies 4-byte-aligned JFFS2 node headers from a byte buffer (max 4096 bytes).
 *
 * @param {Uint8Array | ArrayBuffer} input - Raw image bytes.
 * @param {{ totalFileSize?: number }} [options={}] - Optional metadata about source file size.
 * @returns {object} Parsed JFFS2 inspection report including nodes, regions, flags, and summary.
 */
export function parseJffs2Nodes(input, options = {}) {
  const source = input instanceof Uint8Array ? input : new Uint8Array(input);
  const bytes = source.length > MAX_INSPECT_BYTES
    ? source.subarray(0, MAX_INSPECT_BYTES)
    : source;
  const totalBytes = typeof options.totalFileSize === 'number'
    ? options.totalFileSize
    : source.length;
  const wasWindowTruncated = totalBytes > MAX_INSPECT_BYTES;

  const nodes = [];
  const regions = [];
  const flags = [];
  const summary = buildEmptySummary();

  if (bytes.length === 0) {
    flags.push({
      code: 'empty-input',
      severity: 'error',
      offset: 0,
      nodeIndex: null,
      message: 'Input is empty (0 bytes).',
    });
    return {
      inspectedBytes: 0,
      totalBytes,
      wasWindowTruncated,
      byteOrder: null,
      magicSignature: null,
      nodes,
      regions,
      flags,
      summary,
    };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let byteOrder = null;
  let offset = 0;

  while (offset < bytes.length) {
    const remaining = bytes.length - offset;
    const probeLen = Math.min(4, remaining);

    if (isFillSpan(bytes, offset, offset + probeLen, 0xff)) {
      const length = consumeFillRun(bytes, offset, 0xff);
      regions.push({ kind: 'erased', fillByte: 0xff, offset, length });
      summary.erasedRegionCount += 1;
      flags.push({
        code: 'erased-region',
        severity: 'warning',
        offset,
        nodeIndex: null,
        message:
          `Erased (0xFF) region of ${length} bytes at offset ${formatHex(offset)}.`,
      });
      offset += length;
      continue;
    }

    if (isFillSpan(bytes, offset, offset + probeLen, 0x00)) {
      const length = consumeFillRun(bytes, offset, 0x00);
      regions.push({ kind: 'zero-filled', fillByte: 0x00, offset, length });
      summary.zeroFilledRegionCount += 1;
      flags.push({
        code: 'zero-filled-region',
        severity: 'warning',
        offset,
        nodeIndex: null,
        message:
          `Zero-filled (0x00) region of ${length} bytes at offset ${formatHex(offset)}.`,
      });
      offset += length;
      continue;
    }

    if (byteOrder === null) {
      const detected = detectByteOrder(bytes, offset);
      if (detected === null) {
        const foundHex = remaining >= 2
          ? formatHex(view.getUint16(offset, true), 4)
          : formatHex(bytes[offset], 2);
        flags.push({
          code: 'invalid-magic',
          severity: 'error',
          offset,
          nodeIndex: null,
          message:
            `No JFFS2 magic (0x1985 LE or 0x8519 BE) at offset ${formatHex(offset)} ` +
            `(found ${foundHex}).`,
        });
        break;
      }
      byteOrder = detected;
    }

    if (remaining < JFFS2_HEADER_SIZE) {
      if (totalBytes > bytes.length && offset + JFFS2_HEADER_SIZE <= totalBytes) {
        flags.push({
          code: 'window-limited-header',
          severity: 'info',
          offset,
          nodeIndex: null,
          message:
            `Node header at offset ${formatHex(offset)} extends past the ` +
            `${bytes.length}-byte inspection window (${remaining} of ${JFFS2_HEADER_SIZE} ` +
            `header bytes available in window).`,
        });
      } else {
        summary.truncatedCount += 1;
        flags.push({
          code: 'truncated-header',
          severity: 'error',
          offset,
          nodeIndex: null,
          message:
            `Truncated node header at offset ${formatHex(offset)}: ` +
            `only ${remaining} of ${JFFS2_HEADER_SIZE} header bytes available.`,
        });
      }
      break;
    }

    const littleEndian = byteOrder === 'little';
    const magic = view.getUint16(offset, littleEndian);

    if (magic !== JFFS2_MAGIC) {
      flags.push({
        code: 'invalid-magic',
        severity: 'error',
        offset,
        nodeIndex: null,
        message:
          `Unexpected magic ${formatHex(magic)} at offset ${formatHex(offset)} ` +
          `(expected 0x1985 in ${byteOrder}-endian order).`,
      });
      break;
    }

    const nodetype = view.getUint16(offset + 2, littleEndian);
    const nodetypeName = getNodeTypeName(nodetype);
    const totlen = view.getUint32(offset + 4, littleEndian);
    const hdrCrc = view.getUint32(offset + 8, littleEndian);
    const expectedCrc = jffs2Crc32(bytes, offset, 8);
    const crcValid = hdrCrc === expectedCrc;
    const totlenTooSmall = totlen < JFFS2_HEADER_SIZE;
    const extendsPastBuffer = !totlenTooSmall && offset + totlen > bytes.length;
    const windowLimited =
      extendsPastBuffer && totalBytes > bytes.length && offset + totlen <= totalBytes;
    const truncated = extendsPastBuffer && !windowLimited;
    const alignedLength = totlenTooSmall ? JFFS2_HEADER_SIZE : align4(totlen);
    const nodeIndex = nodes.length;
    const nodeFlags = [];

    if (!crcValid) {
      nodeFlags.push('crc-mismatch');
      summary.invalidCrcCount += 1;
      flags.push({
        code: 'crc-mismatch',
        severity: 'error',
        offset,
        nodeIndex,
        message:
          `Node #${nodeIndex} (${nodetypeName}) at ${formatHex(offset)} has hdr_crc ` +
          `${formatHex(hdrCrc, 8)}, expected ${formatHex(expectedCrc, 8)}.`,
      });
    } else {
      summary.validCrcCount += 1;
    }

    if (totlenTooSmall) {
      nodeFlags.push('totlen-too-small');
      summary.totlenTooSmallCount += 1;
      flags.push({
        code: 'totlen-too-small',
        severity: 'error',
        offset,
        nodeIndex,
        message:
          `Node #${nodeIndex} (${nodetypeName}) at ${formatHex(offset)} has totlen ` +
          `${totlen} bytes, smaller than the ${JFFS2_HEADER_SIZE}-byte header.`,
      });
    }

    if (windowLimited) {
      nodeFlags.push('window-limited-node');
      const available = bytes.length - offset;
      flags.push({
        code: 'window-limited-node',
        severity: 'info',
        offset,
        nodeIndex,
        message:
          `Node #${nodeIndex} (${nodetypeName}) at ${formatHex(offset)} declares ` +
          `totlen ${totlen} bytes, extending past the ${bytes.length}-byte inspection window ` +
          `(${available} bytes available in window).`,
      });
    }

    if (truncated) {
      nodeFlags.push('truncated-node');
      summary.truncatedCount += 1;
      const available = Math.max(0, totalBytes - offset);
      flags.push({
        code: 'truncated-node',
        severity: 'error',
        offset,
        nodeIndex,
        message:
          `Node #${nodeIndex} (${nodetypeName}) at ${formatHex(offset)} declares ` +
          `totlen ${totlen} bytes, but only ${available} bytes remain in file.`,
      });
    }

    nodes.push({
      index: nodeIndex,
      offset,
      magic,
      nodetype,
      nodetypeName,
      totlen,
      alignedLength,
      hdrCrc,
      expectedCrc,
      crcValid,
      truncated,
      windowLimited,
      totlenTooSmall,
      flags: nodeFlags,
    });
    summary.nodeCount += 1;

    if (totlenTooSmall || truncated || windowLimited) {
      break;
    }

    offset += alignedLength;
  }

  return {
    inspectedBytes: bytes.length,
    totalBytes,
    wasWindowTruncated,
    byteOrder,
    magicSignature:
      byteOrder === 'little'
        ? formatHex(JFFS2_MAGIC)
        : byteOrder === 'big'
          ? formatHex(JFFS2_MAGIC_SWAPPED)
          : null,
    nodes,
    regions,
    flags,
    summary,
  };
}

/**
 * Builds a single 4-byte-aligned JFFS2 node buffer with a computed or overridden hdr_crc.
 *
 * @param {object} config - Node construction options.
 * @param {number} config.nodetype - 16-bit node type value.
 * @param {number} [config.totlen=12] - Total node length in bytes.
 * @param {boolean} [config.littleEndian=true] - True for LE, false for BE.
 * @param {number} [config.magic=0x1985] - 16-bit magic value.
 * @param {number} [config.hdrCrc] - Optional explicit hdr_crc override.
 * @param {number} [config.bufferLength] - Optional explicit output byte length.
 * @returns {Uint8Array} Encoded JFFS2 node bytes.
 */
export function buildJffs2Node({
  nodetype,
  totlen = JFFS2_HEADER_SIZE,
  littleEndian = true,
  magic = JFFS2_MAGIC,
  hdrCrc,
  bufferLength,
}) {
  const defaultLen = totlen < JFFS2_HEADER_SIZE
    ? JFFS2_HEADER_SIZE
    : align4(totlen);
  const length = typeof bufferLength === 'number' ? bufferLength : defaultLen;
  const bytes = new Uint8Array(length);
  const view = new DataView(bytes.buffer);
  if (length >= 2) {
    view.setUint16(0, magic, littleEndian);
  }
  if (length >= 4) {
    view.setUint16(2, nodetype, littleEndian);
  }
  if (length >= 8) {
    view.setUint32(4, totlen, littleEndian);
  }
  if (length >= 12) {
    const crc = typeof hdrCrc === 'number' ? hdrCrc : jffs2Crc32(bytes, 0, 8);
    view.setUint32(8, crc >>> 0, littleEndian);
  }
  return bytes;
}

/**
 * Concatenates multiple Uint8Array chunks into a single Uint8Array.
 *
 * @param {Uint8Array[]} chunks - Byte chunks to concatenate.
 * @returns {Uint8Array} Combined byte buffer.
 */
export function concatBytes(chunks) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  return combined;
}

/**
 * Creates a small sample JFFS2 image containing common node types and a trailing erased region.
 *
 * @param {'little' | 'big'} [byteOrder='little'] - Desired image endianness.
 * @returns {Uint8Array} Sample JFFS2 byte buffer.
 */
export function createSampleJffs2Image(byteOrder = 'little') {
  const littleEndian = byteOrder === 'little';
  const erasedTail = new Uint8Array(32).fill(0xff);
  return concatBytes([
    buildJffs2Node({ nodetype: 0x2003, totlen: 12, littleEndian }),
    buildJffs2Node({ nodetype: 0xe002, totlen: 68, littleEndian }),
    buildJffs2Node({ nodetype: 0xe001, totlen: 44, littleEndian }),
    buildJffs2Node({ nodetype: 0x2004, totlen: 16, littleEndian }),
    buildJffs2Node({ nodetype: 0xe008, totlen: 24, littleEndian }),
    buildJffs2Node({ nodetype: 0xe009, totlen: 20, littleEndian }),
    buildJffs2Node({ nodetype: 0x2006, totlen: 28, littleEndian }),
    erasedTail,
  ]);
}

function readBlobAsArrayBuffer(blob) {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read the selected file.'));
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * Reads at most the first 4096 bytes of a File or Blob via file.slice(0, 4096).
 *
 * @param {File | Blob} file - Local file or blob to inspect.
 * @returns {Promise<Uint8Array>} First up to 4096 bytes of the file.
 */
export async function readJffs2Slice(file) {
  if (!file || typeof file.slice !== 'function') {
    throw new TypeError('Input must be a File or Blob.');
  }
  const sliced = file.slice(0, MAX_INSPECT_BYTES);
  const buffer = await readBlobAsArrayBuffer(sliced);
  return new Uint8Array(buffer);
}

/**
 * Reads the first 4096 bytes of a local File/Blob and parses its JFFS2 node headers.
 *
 * @param {File | Blob} file - Local JFFS2 image file.
 * @returns {Promise<object>} Parsed JFFS2 inspection report.
 */
export async function inspectJffs2File(file) {
  const bytes = await readJffs2Slice(file);
  return parseJffs2Nodes(bytes, { totalFileSize: file.size });
}
