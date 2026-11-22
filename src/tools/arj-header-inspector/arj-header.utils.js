class ArjError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ArjError';
    this.code = code;
  }
}

function requireBytes(bytes, offset, length) {
  if (offset + length > bytes.length) {
    throw new ArjError('TRUNCATED', 'Truncated ARJ input.');
  }
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTimestamp(value) {
  const pad = (number) => String(number).padStart(2, '0');
  const date = value >>> 16;
  return `${1980 + (date >>> 9)}-${pad((date >>> 5) & 15)}-${pad(date & 31)} ` +
    `${pad((value >>> 11) & 31)}:${pad((value >>> 5) & 63)}:${pad((value & 31) * 2)}`;
}

function readString(bytes, start, end) {
  const terminator = bytes.indexOf(0, start);
  if (terminator < 0 || terminator >= end) {
    throw new ArjError('INVALID_HEADER', 'Missing null terminator in ARJ header.');
  }
  // Preserve each byte; ARJ filenames use the host's legacy encoding, not necessarily UTF-8.
  return [Array.from(bytes.subarray(start, terminator), (byte) => String.fromCharCode(byte))
    .join(''), terminator + 1];
}

function readHeader(bytes, view, offset, main) {
  requireBytes(bytes, offset, 4);
  if (bytes[offset] !== 0x60 || bytes[offset + 1] !== 0xea) {
    throw new ArjError('BAD_MAGIC', 'Invalid ARJ magic bytes.');
  }
  const size = view.getUint16(offset + 2, true);
  if (size === 0 && !main) return null;
  const start = offset + 4;
  if (size > bytes.length - start) {
    throw new ArjError('HEADER_SIZE', 'Basic header size exceeds the remaining buffer.');
  }
  if (size < 32 || size > 2600) {
    throw new ArjError('INVALID_HEADER', 'Invalid ARJ basic header size.');
  }
  const end = start + size;
  requireBytes(bytes, end, 4);
  const headerCrc = view.getUint32(end, true);
  if (crc32(bytes.subarray(start, end)) !== headerCrc) {
    throw new ArjError('CRC_MISMATCH', 'ARJ basic header CRC-32 mismatch.');
  }
  const firstHeaderSize = bytes[start];
  if (firstHeaderSize < 30 || firstHeaderSize + 2 > size) {
    throw new ArjError('INVALID_HEADER', 'Invalid ARJ first header size.');
  }
  const [filename, commentStart] = readString(bytes, start + firstHeaderSize, end);
  const [comment] = readString(bytes, commentStart, end);
  const header = {
    magic: '60 EA', basicHeaderSize: size, firstHeaderSize, headerCrc,
    archiverVersion: bytes[start + 1], extractVersion: bytes[start + 2],
    hostOS: bytes[start + 3], flags: bytes[start + 4], fileType: bytes[start + 6],
    filename, comment,
  };
  if (main) {
    Object.assign(header, {
      securityVersion: bytes[start + 5],
      created: dosTimestamp(view.getUint32(start + 8, true)),
      modified: dosTimestamp(view.getUint32(start + 12, true)),
      archiveSize: view.getUint32(start + 16, true),
    });
  } else {
    Object.assign(header, {
      method: bytes[start + 5], modified: dosTimestamp(view.getUint32(start + 8, true)),
      compressedSize: view.getUint32(start + 12, true),
      originalSize: view.getUint32(start + 16, true),
      originalCrc: view.getUint32(start + 20, true),
    });
  }
  let next = end + 4;
  while (true) {
    requireBytes(bytes, next, 2);
    const extendedSize = view.getUint16(next, true);
    next += 2;
    if (!extendedSize) break;
    requireBytes(bytes, next, extendedSize + 4);
    next += extendedSize + 4;
  }
  return { header, next };
}

/**
 * Parses the ARJ main header and first local file header without decompressing data.
 * @param {ArrayBuffer} buffer Archive bytes beginning with the main header.
 * @returns {{mainHeader: object, fileHeader: object|null}} Parsed headers.
 * @throws {Error} If a header is malformed, truncated, or fails its CRC check.
 */
export function parseArjHeaders(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const main = readHeader(bytes, view, 0, true);
  const file = readHeader(bytes, view, main.next, false);
  return { mainHeader: main.header, fileHeader: file?.header ?? null };
}
