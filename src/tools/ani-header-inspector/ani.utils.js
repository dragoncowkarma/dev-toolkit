class AniParseError extends Error {}

/**
 * Converts a hexadecimal string to bytes.
 *
 * @param {string} value - Hexadecimal byte values, optionally separated by whitespace.
 * @returns {Uint8Array} Decoded bytes.
 */
export function bytesFromHex(value) {
  const compact = value.replace(/\s/g, '');
  if (compact.length === 0) return new Uint8Array();
  if (!/^[0-9a-f]+$/i.test(compact) || compact.length % 2 !== 0) {
    throw new AniParseError('Hex input must contain complete hexadecimal byte pairs.');
  }
  const bytes = new Uint8Array(compact.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(compact.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Converts a Base64 string to bytes.
 *
 * @param {string} value - Base64-encoded bytes.
 * @returns {Uint8Array} Decoded bytes.
 */
export function bytesFromBase64(value) {
  const compact = value.replace(/\s/g, '');
  if (compact.length === 0) return new Uint8Array();
  try {
    return Uint8Array.from(atob(compact), (character) => character.charCodeAt(0));
  } catch {
    throw new AniParseError('Base64 input is invalid.');
  }
}

class ByteReader {
  /**
   * @param {Uint8Array} bytes - The input bytes.
   */
  constructor(bytes) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  /**
   * @param {number} offset - Byte offset to validate.
   * @param {number} length - Required byte length.
   * @param {string} label - Human-readable structure name.
   */
  ensure(offset, length, label) {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0
      || offset + length > this.bytes.length) {
      throw new AniParseError(`Truncated ${label}: expected ${length} bytes at offset ${offset}.`);
    }
  }

  /**
   * @param {number} offset - Byte offset.
   * @param {string} label - Human-readable structure name.
   * @returns {number} The unsigned little-endian value.
   */
  uint32(offset, label) {
    this.ensure(offset, 4, label);
    return this.view.getUint32(offset, true);
  }

  /**
   * @param {number} offset - Byte offset.
   * @param {string} label - Human-readable structure name.
   * @returns {string} Four-byte ASCII signature.
   */
  fourCC(offset, label) {
    this.ensure(offset, 4, label);
    return String.fromCharCode(...this.bytes.slice(offset, offset + 4));
  }
}

/**
 * Parses an ANI RIFF container without decoding its embedded cursor images.
 *
 * @param {Uint8Array} bytes - The ANI file bytes.
 * @returns {{riffSize: number, header: object, frames: object[], rates: number[],
 * sequence: number[]}}
 * Parsed ANI metadata.
 */
export function parseAni(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError('ANI input must be a Uint8Array.');
  }
  const reader = new ByteReader(bytes);
  reader.ensure(0, 12, 'RIFF header');
  if (reader.fourCC(0, 'RIFF signature') !== 'RIFF') {
    throw new AniParseError('Invalid ANI file: expected RIFF signature.');
  }
  const riffSize = reader.uint32(4, 'RIFF size');
  const containerEnd = 8 + riffSize;
  if (riffSize < 4 || containerEnd > bytes.length) {
    throw new AniParseError('Truncated RIFF container: declared size exceeds available input.');
  }
  if (reader.fourCC(8, 'RIFF form type') !== 'ACON') {
    throw new AniParseError('Invalid ANI file: expected ACON RIFF form type.');
  }

  let header = null;
  const frames = [];
  let rates = [];
  let sequence = [];
  let offset = 12;
  while (offset < containerEnd) {
    const chunk = readChunk(reader, offset, containerEnd, 'RIFF chunk');
    if (chunk.id === 'anih') {
      header = parseHeader(reader, chunk);
    } else if (chunk.id === 'LIST' && reader.fourCC(chunk.dataOffset, 'LIST type') === 'fram') {
      frames.push(...parseFrames(reader, chunk));
    } else if (chunk.id === 'rate') {
      rates = parseValues(reader, chunk, 'rate');
    } else if (chunk.id === 'seq ') {
      sequence = parseValues(reader, chunk, 'sequence');
    }
    offset = chunk.nextOffset;
  }
  if (offset !== containerEnd) {
    throw new AniParseError('Invalid RIFF container: chunk padding exceeds declared size.');
  }
  if (!header) {
    throw new AniParseError('Invalid ANI file: missing anih header chunk.');
  }
  return { riffSize, header, frames, rates, sequence };
}

function readChunk(reader, offset, limit, label) {
  reader.ensure(offset, 8, `${label} header`);
  const id = reader.fourCC(offset, `${label} identifier`);
  const length = reader.uint32(offset + 4, `${label} size`);
  const dataOffset = offset + 8;
  const dataEnd = dataOffset + length;
  if (dataEnd > limit) {
    throw new AniParseError(`Truncated ${id} chunk: declared size exceeds its container.`);
  }
  const nextOffset = dataEnd + (length % 2);
  if (nextOffset > limit) {
    throw new AniParseError(`Truncated ${id} chunk: missing required padding byte.`);
  }
  return { id, length, offset, dataOffset, dataEnd, nextOffset };
}

function parseHeader(reader, chunk) {
  if (chunk.length < 36) {
    throw new AniParseError('Truncated anih chunk: ANI header requires 36 bytes.');
  }
  const offset = chunk.dataOffset;
  const flags = reader.uint32(offset + 32, 'anih flags');
  return {
    size: reader.uint32(offset, 'anih size'),
    frameCount: reader.uint32(offset + 4, 'anih frame count'),
    stepCount: reader.uint32(offset + 8, 'anih step count'),
    width: reader.uint32(offset + 12, 'anih width'),
    height: reader.uint32(offset + 16, 'anih height'),
    bitCount: reader.uint32(offset + 20, 'anih bit count'),
    planes: reader.uint32(offset + 24, 'anih planes'),
    displayRate: reader.uint32(offset + 28, 'anih display rate'),
    flags,
    framesAreIcons: (flags & 1) !== 0,
  };
}

function parseFrames(reader, listChunk) {
  if (listChunk.length < 4) {
    throw new AniParseError('Truncated LIST fram chunk: missing list type.');
  }
  const frames = [];
  let offset = listChunk.dataOffset + 4;
  while (offset < listChunk.dataEnd) {
    const chunk = readChunk(reader, offset, listChunk.dataEnd, 'LIST fram sub-chunk');
    if (chunk.id === 'icon') {
      frames.push({ offset: chunk.dataOffset, length: chunk.length });
    }
    offset = chunk.nextOffset;
  }
  return frames;
}

function parseValues(reader, chunk, label) {
  if (chunk.length % 4 !== 0) {
    throw new AniParseError(`Invalid ${label} chunk: length must be divisible by four.`);
  }
  const values = [];
  for (let offset = chunk.dataOffset; offset < chunk.dataEnd; offset += 4) {
    values.push(reader.uint32(offset, `${label} value`));
  }
  return values;
}
