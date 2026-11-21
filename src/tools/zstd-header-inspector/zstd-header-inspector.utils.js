const STANDARD_MAGIC = 0xfd2fb528;
const SKIPPABLE_MAGIC_START = 0x184d2a50;
const SKIPPABLE_MAGIC_END = 0x184d2a5f;

function readLittleEndian(bytes, offset, length, label) {
  if (offset + length > bytes.length) {
    throw new Error(`Truncated Zstandard frame: missing ${label}.`);
  }

  let value = 0n;
  for (let index = 0; index < length; index += 1) {
    value |= BigInt(bytes[offset + index]) << BigInt(index * 8);
  }
  return value;
}

function readUint32LittleEndian(bytes, offset, label) {
  return Number(readLittleEndian(bytes, offset, 4, label));
}

function dictionaryIdLength(flag) {
  return [0, 1, 2, 4][flag];
}

function frameContentSizeLength(flag, singleSegment) {
  if (flag === 0) return singleSegment ? 1 : 0;
  return [0, 2, 4, 8][flag];
}

function parseWindowDescriptor(value) {
  const exponent = value >>> 3;
  const mantissa = value & 0x07;
  const windowBase = 2 ** (10 + exponent);
  const windowAdd = (windowBase / 8) * mantissa;
  return {
    exponent,
    mantissa,
    windowSize: windowBase + windowAdd,
  };
}

/**
 * Parses a Zstandard frame header without decompressing the frame payload.
 *
 * @param {Uint8Array} bytes - The selected file's bytes.
 * @returns {object} A standard-frame header or a skippable-frame result.
 * @throws {Error} When the input is too short, malformed, or not a Zstandard frame.
 */
export function parseZstdFrameHeader(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError('Expected Zstandard input bytes.');
  }

  const magic = readUint32LittleEndian(bytes, 0, 'magic number');
  if (magic >= SKIPPABLE_MAGIC_START && magic <= SKIPPABLE_MAGIC_END) {
    return {
      kind: 'skippable',
      magic,
      magicHex: `0x${magic.toString(16).toUpperCase()}`,
      skippableFrameId: magic - SKIPPABLE_MAGIC_START,
    };
  }
  if (magic !== STANDARD_MAGIC) {
    throw new Error('Not a Zstandard frame: the magic number does not match 0xFD2FB528.');
  }

  let offset = 4;
  const descriptor = Number(readLittleEndian(bytes, offset, 1, 'Frame_Header_Descriptor'));
  offset += 1;
  const frameContentSizeFlag = descriptor >>> 6;
  const singleSegment = Boolean(descriptor & 0x20);
  const unusedBit = Boolean(descriptor & 0x10);
  const reservedBit = Boolean(descriptor & 0x08);
  const contentChecksum = Boolean(descriptor & 0x04);
  const dictionaryIdFlag = descriptor & 0x03;

  if (reservedBit) {
    throw new Error('Malformed Zstandard frame: the reserved descriptor bit is set.');
  }

  const result = {
    kind: 'standard',
    magic,
    magicHex: '0xFD2FB528',
    descriptor: {
      value: descriptor,
      frameContentSizeFlag,
      singleSegment,
      unusedBit,
      reservedBit,
      contentChecksum,
      dictionaryIdFlag,
    },
  };

  if (!singleSegment) {
    const windowDescriptor = Number(readLittleEndian(bytes, offset, 1, 'Window_Descriptor'));
    offset += 1;
    result.windowDescriptor = {
      value: windowDescriptor,
      ...parseWindowDescriptor(windowDescriptor),
    };
  }

  const dictionaryLength = dictionaryIdLength(dictionaryIdFlag);
  if (dictionaryLength > 0) {
    result.dictionaryId = Number(
      readLittleEndian(bytes, offset, dictionaryLength, 'Dictionary_ID'),
    );
    result.dictionaryIdLength = dictionaryLength;
    offset += dictionaryLength;
  }

  const contentSizeLength = frameContentSizeLength(frameContentSizeFlag, singleSegment);
  if (contentSizeLength > 0) {
    let frameContentSize = readLittleEndian(bytes, offset, contentSizeLength, 'Frame_Content_Size');
    if (contentSizeLength === 2) frameContentSize += 256n;
    result.frameContentSize = frameContentSize;
    result.frameContentSizeLength = contentSizeLength;
    offset += contentSizeLength;
  }

  result.headerSize = offset;
  return result;
}

/**
 * Formats a parsed unsigned integer for display without losing 64-bit precision.
 *
 * @param {number|bigint} value - The parsed numeric value.
 * @returns {string} The decimal display value.
 */
export function formatZstdNumber(value) {
  return value.toLocaleString('en-US');
}
