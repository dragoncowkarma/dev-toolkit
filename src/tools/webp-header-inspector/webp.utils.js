const PRIMARY_CHUNKS = new Set(['VP8 ', 'VP8L', 'VP8X']);
const OPTIONAL_CHUNKS = new Set(['ICCP', 'ANIM', 'ANMF', 'ALPH', 'EXIF', 'XMP ']);

/** Error raised when bytes cannot be parsed as a complete WebP container. */
export class WebpParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WebpParseError';
  }
}

function requireBytes(bytes, offset, length, label) {
  if (offset + length > bytes.length) {
    throw new WebpParseError(`The WebP file is truncated while reading ${label}.`);
  }
}

function readFourCc(bytes, offset, label) {
  requireBytes(bytes, offset, 4, label);
  return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}

function readUint24LE(bytes, offset, label) {
  requireBytes(bytes, offset, 3, label);
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readUint32LE(bytes, offset, label) {
  requireBytes(bytes, offset, 4, label);
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
}

function parseVp8Dimensions(payload) {
  requireBytes(payload, 0, 10, 'the VP8 image header');
  if (payload[3] !== 0x9d || payload[4] !== 0x01 || payload[5] !== 0x2a) {
    throw new WebpParseError('The VP8 image header has an invalid start code.');
  }
  const width = (payload[6] | (payload[7] << 8)) & 0x3fff;
  const height = (payload[8] | (payload[9] << 8)) & 0x3fff;
  if (width === 0 || height === 0) {
    throw new WebpParseError('The VP8 image header has invalid dimensions.');
  }
  return { width, height };
}

function parseVp8lDimensions(payload) {
  requireBytes(payload, 0, 5, 'the VP8L image header');
  if (payload[0] !== 0x2f) {
    throw new WebpParseError('The VP8L image header has an invalid signature byte.');
  }
  const packed = readUint32LE(payload, 1, 'the VP8L image dimensions');
  return {
    width: (packed & 0x3fff) + 1,
    height: ((packed >>> 14) & 0x3fff) + 1,
  };
}

function parseVp8x(payload) {
  requireBytes(payload, 0, 10, 'the VP8X image header');
  const flags = payload[0];
  return {
    width: readUint24LE(payload, 4, 'the VP8X canvas width') + 1,
    height: readUint24LE(payload, 7, 'the VP8X canvas height') + 1,
    features: {
      iccProfile: Boolean(flags & 0x20),
      alpha: Boolean(flags & 0x10),
      exif: Boolean(flags & 0x08),
      xmp: Boolean(flags & 0x04),
      animation: Boolean(flags & 0x02),
    },
  };
}

/**
 * Parses a WebP RIFF container without decoding image pixels.
 *
 * @param {ArrayBuffer|Uint8Array} input - Complete bytes of a local WebP file.
 * @returns {{declaredSize: number, formType: string, chunkType: string, width: number,
 * height: number, features: object, optionalChunks: Array<{name: string, size: number}>}}
 * @throws {WebpParseError} When the RIFF container or required image header is malformed.
 */
export function parseWebp(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  requireBytes(bytes, 0, 12, 'the RIFF container header');
  if (readFourCc(bytes, 0, 'the RIFF magic') !== 'RIFF') {
    throw new WebpParseError('This file is not a RIFF container (missing RIFF magic).');
  }

  const declaredSize = readUint32LE(bytes, 4, 'the declared RIFF size');
  if (declaredSize + 8 !== bytes.length) {
    throw new WebpParseError('The declared RIFF file size does not match the file length.');
  }
  if (bytes.length % 2 !== 0) {
    throw new WebpParseError('The RIFF container has non-even chunk padding.');
  }
  const formType = readFourCc(bytes, 8, 'the RIFF form type');
  if (formType !== 'WEBP') {
    throw new WebpParseError('This RIFF container is not a WEBP file (missing WEBP form type).');
  }

  const chunks = [];
  let offset = 12;
  while (offset < bytes.length) {
    requireBytes(bytes, offset, 8, 'a chunk header');
    const name = readFourCc(bytes, offset, 'a chunk name');
    const size = readUint32LE(bytes, offset + 4, `${name} chunk size`);
    const dataOffset = offset + 8;
    requireBytes(bytes, dataOffset, size, `${name} chunk data`);
    const paddedSize = size + (size % 2);
    requireBytes(bytes, dataOffset, paddedSize, `${name} chunk padding`);
    chunks.push({ name, size, payload: bytes.subarray(dataOffset, dataOffset + size) });
    offset = dataOffset + paddedSize;
  }
  if (offset !== bytes.length || chunks.length === 0) {
    throw new WebpParseError('The RIFF container has invalid chunk padding.');
  }

  const primary = chunks[0];
  if (!PRIMARY_CHUNKS.has(primary.name)) {
    throw new WebpParseError('The first WebP chunk must be VP8, VP8L, or VP8X.');
  }

  let details;
  if (primary.name === 'VP8 ') details = { ...parseVp8Dimensions(primary.payload), features: {} };
  if (primary.name === 'VP8L') details = { ...parseVp8lDimensions(primary.payload), features: {} };
  if (primary.name === 'VP8X') details = parseVp8x(primary.payload);

  return {
    declaredSize,
    formType,
    chunkType: primary.name,
    width: details.width,
    height: details.height,
    features: details.features,
    optionalChunks: chunks
      .filter((chunk) => OPTIONAL_CHUNKS.has(chunk.name))
      .map((chunk) => ({ name: chunk.name, size: chunk.size })),
  };
}

/**
 * Formats a byte count for a compact inspection result.
 *
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  return `${bytes.toLocaleString()} byte${bytes === 1 ? '' : 's'}`;
}
