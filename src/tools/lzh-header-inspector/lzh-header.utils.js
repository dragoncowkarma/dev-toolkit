const METHOD_START = 2;
const METHOD_LENGTH = 5;
const LEVEL_OFFSET = 20;

/**
 * Parses the first classic LZH/LHA entry header from archive bytes.
 *
 * @param {ArrayBuffer} buffer - The archive bytes to inspect.
 * @returns {{headerSize: number, headerChecksum: number|null, headerLevel: number,
 *   method: string, packedSize: number, originalSize: number, timestamp: Date,
 *   name: string, crc16: number}}
 * @throws {Error} When the header is malformed, truncated, or has a bad checksum.
 */
export function parseLzhHeader(buffer) {
  if (!(buffer instanceof ArrayBuffer)) {
    throw new TypeError('Archive data must be an ArrayBuffer.');
  }

  const bytes = new Uint8Array(buffer);
  requireBytes(bytes, 0, 21, 'header prefix');
  const level = isLevelThree(bytes) ? 3 : bytes[LEVEL_OFFSET] <= 2
    ? bytes[LEVEL_OFFSET] : detectLevelThree(bytes);

  if (level === 0 || level === 1) return parseLevelZeroOrOne(bytes, level);
  if (level === 2) return parseLevelTwo(bytes);
  return parseLevelThree(bytes);
}

function isLevelThree(bytes) {
  return bytes.length >= 23 && bytes[22] === 3 && readUint16(bytes, 2) === 4;
}

function detectLevelThree(bytes) {
  requireBytes(bytes, 0, 23, 'header level');
  if (bytes[22] !== 3) {
    throw new Error(`Unsupported LZH header level: ${bytes[LEVEL_OFFSET]}.`);
  }
  return 3;
}

function parseLevelZeroOrOne(bytes, level) {
  const headerSize = bytes[0];
  const totalSize = headerSize + 2;
  requireBytes(bytes, 0, totalSize, 'level ' + level + ' header');
  verifyHeaderChecksum(bytes, totalSize);

  const nameLength = bytes[21];
  const nameStart = 22;
  const crcOffset = nameStart + nameLength;
  requireBytes(bytes, crcOffset, 2, 'file CRC-16');
  if (crcOffset + 2 > totalSize) {
    throw new Error('Malformed LZH header: file name exceeds the declared header size.');
  }

  const base = {
    headerSize: totalSize,
    headerChecksum: bytes[1],
    headerLevel: level,
    method: readMethod(bytes, METHOD_START),
    packedSize: readUint32(bytes, 7),
    originalSize: readUint32(bytes, 11),
    timestamp: decodeDosTimestamp(readUint32(bytes, 15)),
    name: decodeText(bytes.slice(nameStart, crcOffset)),
    crc16: readUint16(bytes, crcOffset),
  };

  if (level === 0) return base;

  requireBytes(bytes, crcOffset + 2, 1, 'level 1 OS identifier');
  const extensions = parseExtendedHeaders(bytes, crcOffset + 3, 2);
  return { ...base, name: extensions.name || base.name };
}

function parseLevelTwo(bytes) {
  const totalSize = readUint16(bytes, 0);
  requireBytes(bytes, 0, 24, 'level 2 header');
  if (totalSize < 24) throw new Error('Malformed LZH header: invalid level 2 header size.');
  requireBytes(bytes, 0, totalSize, 'level 2 header');
  const extensions = parseExtendedHeaders(bytes, 24, 2, totalSize);

  return {
    headerSize: totalSize,
    headerChecksum: null,
    headerLevel: 2,
    method: readMethod(bytes, METHOD_START),
    packedSize: readUint32(bytes, 7),
    originalSize: readUint32(bytes, 11),
    timestamp: new Date(readUint32(bytes, 15) * 1000),
    name: extensions.name,
    crc16: readUint16(bytes, 21),
  };
}

function parseLevelThree(bytes) {
  requireBytes(bytes, 0, 26, 'level 3 header');
  const totalSize = readUint16(bytes, 0);
  const wordSize = readUint16(bytes, 2);
  if (wordSize !== 4 || totalSize < 26) {
    throw new Error('Malformed LZH header: invalid level 3 header structure.');
  }
  requireBytes(bytes, 0, totalSize, 'level 3 header');
  const extensions = parseExtendedHeaders(bytes, 26, 4, totalSize);

  return {
    headerSize: totalSize,
    headerChecksum: null,
    headerLevel: 3,
    method: readMethod(bytes, 4),
    packedSize: readUint32(bytes, 9),
    originalSize: readUint32(bytes, 13),
    timestamp: new Date(readUint32(bytes, 17) * 1000),
    name: extensions.name,
    crc16: readUint16(bytes, 23),
  };
}

function parseExtendedHeaders(bytes, start, sizeLength, boundary = bytes.length) {
  let offset = start;
  let name = '';
  while (true) {
    requireBytes(bytes, offset, sizeLength, 'extended header length');
    if (offset + sizeLength > boundary) throw new Error('Malformed LZH extended-header chain.');
    const size = sizeLength === 2 ? readUint16(bytes, offset) : readUint32(bytes, offset);
    if (size === 0) return { name };
    if (size < sizeLength + 1 || offset + size > boundary) {
      throw new Error('Malformed LZH extended-header chain.');
    }
    const typeOffset = offset + sizeLength;
    if (bytes[typeOffset] === 1) {
      name = decodeText(bytes.slice(typeOffset + 1, offset + size));
    }
    offset += size;
  }
}

function verifyHeaderChecksum(bytes, totalSize) {
  let sum = 0;
  for (let index = 2; index < totalSize; index += 1) sum = (sum + bytes[index]) & 0xff;
  if (sum !== bytes[1]) throw new Error('LZH header checksum mismatch.');
}

function readMethod(bytes, offset) {
  requireBytes(bytes, offset, METHOD_LENGTH, 'method ID');
  return String.fromCharCode(...bytes.slice(offset, offset + METHOD_LENGTH));
}

function readUint16(bytes, offset) {
  requireBytes(bytes, offset, 2, '16-bit value');
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32(bytes, offset) {
  requireBytes(bytes, offset, 4, '32-bit value');
  return (bytes[offset] + bytes[offset + 1] * 0x100 + bytes[offset + 2] * 0x10000 +
    bytes[offset + 3] * 0x1000000) >>> 0;
}

function decodeDosTimestamp(value) {
  const seconds = (value & 0x1f) * 2;
  const minutes = (value >>> 5) & 0x3f;
  const hours = (value >>> 11) & 0x1f;
  const day = (value >>> 16) & 0x1f;
  const month = (value >>> 21) & 0x0f;
  const year = ((value >>> 25) & 0x7f) + 1980;
  const timestamp = Date.UTC(
    year, Math.max(0, month - 1), Math.max(1, day), hours, minutes, seconds
  );
  return new Date(timestamp);
}

function decodeText(bytes) {
  return new TextDecoder().decode(bytes);
}

function requireBytes(bytes, offset, length, label) {
  if (offset + length > bytes.length) throw new Error(`Truncated LZH ${label}.`);
}
