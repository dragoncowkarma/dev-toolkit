const STREAM_IDENTIFIER = [0x73, 0x4e, 0x61, 0x50, 0x70, 0x59];
const CHUNK_HEADER_SIZE = 4;
const CHECKSUM_SIZE = 4;
const MAX_UNCOMPRESSED_PAYLOAD_SIZE = 65536;

/**
 * Reads a three-byte little-endian chunk length.
 *
 * @param {Uint8Array} bytes - Source bytes.
 * @param {number} offset - Offset of the first length byte.
 * @returns {number} The decoded length.
 */
function readUint24LittleEndian(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

/**
 * Formats a masked CRC-32C value for display.
 *
 * @param {Uint8Array} bytes - Source bytes.
 * @param {number} offset - Offset of the checksum.
 * @returns {string} An eight-digit hexadecimal checksum.
 */
function readMaskedCrc32c(bytes, offset) {
  const checksum = new DataView(bytes.buffer, bytes.byteOffset + offset, CHECKSUM_SIZE)
    .getUint32(0, true);
  return `0x${checksum.toString(16).padStart(8, '0')}`;
}

/**
 * Parses a Snappy framed stream without decompressing its data chunks.
 *
 * @param {ArrayBuffer|Uint8Array} source - Complete stream bytes.
 * @returns {{ chunks: Array<{ type: number, kind: string, label: string, offset: number,
 * length: number, crc32c?: string }>, fileSize: number }} Parsed framing details.
 * @throws {Error} When the stream violates the Snappy framing format or is truncated.
 */
export function parseSnappyFramedStream(source) {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);

  if (bytes.length < CHUNK_HEADER_SIZE || bytes[0] !== 0xff) {
    throw new Error('Missing stream identifier: the first chunk must be type 0xff.');
  }

  const identifierLength = readUint24LittleEndian(bytes, 1);
  if (identifierLength !== STREAM_IDENTIFIER.length) {
    throw new Error('Invalid stream identifier: type 0xff must have a 6-byte payload.');
  }
  if (bytes.length < CHUNK_HEADER_SIZE + identifierLength) {
    throw new Error('Truncated chunk payload at offset 0: stream identifier is incomplete.');
  }
  if (!STREAM_IDENTIFIER.every((value, index) => bytes[CHUNK_HEADER_SIZE + index] === value)) {
    throw new Error('Invalid stream identifier: expected the payload "sNaPpY".');
  }

  const chunks = [
    {
      type: 0xff,
      kind: 'identifier',
      label: 'Stream identifier',
      offset: 0,
      length: identifierLength,
    },
  ];
  let offset = CHUNK_HEADER_SIZE + identifierLength;

  while (offset < bytes.length) {
    const remaining = bytes.length - offset;
    if (remaining < CHUNK_HEADER_SIZE) {
      throw new Error(
        `Truncated chunk header at offset ${offset}: ${remaining} byte${
          remaining === 1 ? '' : 's'
        } remain.`
      );
    }

    const type = bytes[offset];
    const length = readUint24LittleEndian(bytes, offset + 1);
    const payloadOffset = offset + CHUNK_HEADER_SIZE;
    const available = bytes.length - payloadOffset;
    if (length > available) {
      throw new Error(
        `Truncated chunk payload at offset ${offset}: declares ${length} bytes, ` +
          `only ${available} available.`
      );
    }
    if (type >= 0x02 && type <= 0x7f) {
      throw new Error(
        `Reserved unskippable chunk type 0x${type.toString(16).padStart(2, '0')} at offset ${
          offset
        }.`
      );
    }
    if (type === 0x01 && length > MAX_UNCOMPRESSED_PAYLOAD_SIZE) {
      throw new Error(
        `Uncompressed chunk at offset ${offset} exceeds the ${
          MAX_UNCOMPRESSED_PAYLOAD_SIZE
        }-byte maximum.`
      );
    }

    if (type === 0x00 || type === 0x01) {
      if (length < CHECKSUM_SIZE) {
        throw new Error(`Data chunk at offset ${offset} is missing its 4-byte CRC-32C.`);
      }
      chunks.push({
        type,
        kind: type === 0x00 ? 'compressed' : 'uncompressed',
        label: type === 0x00 ? 'Compressed data' : 'Uncompressed data',
        offset,
        length,
        crc32c: readMaskedCrc32c(bytes, payloadOffset),
      });
    } else if (type === 0xfe) {
      chunks.push({ type, kind: 'padding', label: 'Padding', offset, length });
    } else if (type >= 0x80 && type <= 0xfd) {
      chunks.push({
        type,
        kind: 'skippable',
        label: 'Reserved skippable',
        offset,
        length,
      });
    } else if (type === 0xff) {
      throw new Error(
        `Invalid stream identifier at offset ${offset}: it is only valid as the first chunk.`
      );
    }

    offset = payloadOffset + length;
  }

  return { chunks, fileSize: bytes.length };
}

/**
 * Reads local file bytes through the browser File API.
 *
 * @param {File} file - User-selected local file.
 * @returns {Promise<ArrayBuffer>} The file's raw bytes.
 */
export function readSnappyFile(file) {
  return file.arrayBuffer();
}
