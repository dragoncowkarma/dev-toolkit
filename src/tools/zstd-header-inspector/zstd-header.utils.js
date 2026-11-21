const ZSTD_MAGIC = 0xFD2FB528;
const SKIPPABLE_MAGIC_MASK = 0xFFFFFFF0;
const SKIPPABLE_MAGIC_PREFIX = 0x184D2A50;
const LEGACY_MAGIC_MASK = 0xFFFFFF00;
const LEGACY_MAGIC_PREFIX = 0x184C2100;

function hasBytes(bytes, offset, length) {
  return offset + length <= bytes.length;
}

function readUint32LE(bytes, offset) {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

function readUnsignedLE(bytes, offset, length) {
  let value = 0n;
  for (let index = 0; index < length; index += 1) {
    value |= BigInt(bytes[offset + index]) << BigInt(index * 8);
  }
  return value;
}

function dictionaryIdLength(flag) {
  return [0, 1, 2, 4][flag];
}

function contentSizeLength(flag, isSingleSegment) {
  if (flag === 0) return isSingleSegment ? 1 : 0;
  return [0, 2, 4, 8][flag];
}

function parseWindowDescriptor(value) {
  const exponent = value >>> 3;
  const mantissa = value & 0x07;
  const windowBase = 2 ** (exponent + 10);
  return {
    raw: value,
    exponent,
    mantissa,
    windowSize: windowBase + (windowBase / 8) * mantissa,
  };
}

function formatMagic(magic) {
  return `0x${magic.toString(16).padStart(8, '0').toUpperCase()}`;
}

/**
 * Parses the plaintext fields in a Zstandard frame header without reading blocks.
 *
 * @param {ArrayBuffer|Uint8Array} input Raw bytes from a local file.
 * @returns {{status: string, fields: object, warnings: string[]}}
 */
export function parseZstdFrameHeader(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const warnings = [];
  const fields = {};

  if (!hasBytes(bytes, 0, 4)) {
    return {
      status: 'truncated',
      fields,
      warnings: ['Magic Number is truncated: expected 4 bytes.'],
    };
  }

  const magic = readUint32LE(bytes, 0);
  fields.magicNumber = formatMagic(magic);

  if ((magic & SKIPPABLE_MAGIC_MASK) === SKIPPABLE_MAGIC_PREFIX) {
    return {
      status: 'skippable',
      fields: { ...fields, skippableFrameId: magic & 0x0F },
      warnings: ['Skippable Frame detected. Its content is intentionally not parsed.'],
    };
  }

  if ((magic & LEGACY_MAGIC_MASK) === LEGACY_MAGIC_PREFIX) {
    return {
      status: 'legacy',
      fields,
      warnings: ['Unsupported legacy format.'],
    };
  }

  if (magic !== ZSTD_MAGIC) {
    return {
      status: 'invalid',
      fields,
      warnings: ['Invalid or unrecognized Zstandard frame magic number.'],
    };
  }

  let offset = 4;
  if (!hasBytes(bytes, offset, 1)) {
    return {
      status: 'truncated',
      fields,
      warnings: ['Frame Header Descriptor is truncated: expected 1 byte.'],
    };
  }

  const descriptor = bytes[offset];
  offset += 1;
  const frameContentSizeFlag = descriptor >>> 6;
  const singleSegment = Boolean(descriptor & 0x20);
  const dictionaryIdFlag = descriptor & 0x03;
  fields.frameHeaderDescriptor = {
    raw: descriptor,
    frameContentSizeFlag,
    singleSegment,
    unusedBit: Boolean(descriptor & 0x10),
    reservedBit: Boolean(descriptor & 0x08),
    contentChecksumFlag: Boolean(descriptor & 0x04),
    dictionaryIdFlag,
  };

  if (!singleSegment) {
    if (!hasBytes(bytes, offset, 1)) {
      return {
        status: 'truncated',
        fields,
        warnings: ['Window Descriptor is truncated: expected 1 byte.'],
      };
    }
    fields.windowDescriptor = parseWindowDescriptor(bytes[offset]);
    offset += 1;
  }

  const dictionaryLength = dictionaryIdLength(dictionaryIdFlag);
  if (dictionaryLength > 0) {
    if (!hasBytes(bytes, offset, dictionaryLength)) {
      return {
        status: 'truncated',
        fields,
        warnings: [`Dictionary ID is truncated: expected ${dictionaryLength} bytes.`],
      };
    }
    fields.dictionaryId = readUnsignedLE(bytes, offset, dictionaryLength);
    fields.dictionaryIdByteLength = dictionaryLength;
    offset += dictionaryLength;
  }

  const contentLength = contentSizeLength(frameContentSizeFlag, singleSegment);
  if (contentLength > 0) {
    if (!hasBytes(bytes, offset, contentLength)) {
      return {
        status: 'truncated',
        fields,
        warnings: [`Frame Content Size is truncated: expected ${contentLength} bytes.`],
      };
    }
    const contentSize = readUnsignedLE(bytes, offset, contentLength);
    fields.frameContentSize = contentLength === 2 ? contentSize + 256n : contentSize;
    fields.frameContentSizeByteLength = contentLength;
  }

  return { status: 'valid', fields, warnings };
}

/**
 * Formats field values for display without losing 64-bit precision.
 *
 * @param {unknown} value Value returned by parseZstdFrameHeader.
 * @returns {string} Display-safe value.
 */
export function formatZstdValue(value) {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'boolean') return value ? 'Set' : 'Not set';
  if (value === undefined) return 'Not present';
  return String(value);
}
