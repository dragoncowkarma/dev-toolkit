const OPTIONAL_CHUNK_TYPES = new Set(['ICCP', 'ANIM', 'ANMF', 'ALPH', 'EXIF', 'XMP ']);

const FEATURE_FLAGS = [
  { name: 'ICC profile', mask: 0x20 },
  { name: 'Alpha', mask: 0x10 },
  { name: 'Exif metadata', mask: 0x08 },
  { name: 'XMP metadata', mask: 0x04 },
  { name: 'Animation', mask: 0x02 },
];

function fail(message) {
  throw new Error(`Invalid WebP file: ${message}`);
}

function readFourCc(bytes, offset) {
  if (offset + 4 > bytes.length) fail('truncated chunk identifier.');
  return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}

function readUint32LE(bytes, offset) {
  if (offset + 4 > bytes.length) fail('truncated size field.');
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
}

function readUint24LE(bytes, offset) {
  if (offset + 3 > bytes.length) fail('truncated 24-bit field.');
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function parseVp8Dimensions(payload) {
  if (payload.length < 10) fail('VP8 chunk is too short to contain dimensions.');
  if (payload[3] !== 0x9d || payload[4] !== 0x01 || payload[5] !== 0x2a) {
    fail('VP8 chunk does not contain the key-frame start code.');
  }
  const width = (payload[6] | (payload[7] << 8)) & 0x3fff;
  const height = (payload[8] | (payload[9] << 8)) & 0x3fff;
  if (width === 0 || height === 0) fail('VP8 dimensions must be greater than zero.');
  return { width, height };
}

function parseVp8lDimensions(payload) {
  if (payload.length < 5) fail('VP8L chunk is too short to contain dimensions.');
  if (payload[0] !== 0x2f) fail('VP8L chunk has an invalid signature byte.');
  const bits = payload[1] | (payload[2] << 8) | (payload[3] << 16) | (payload[4] << 24);
  return {
    width: (bits & 0x3fff) + 1,
    height: ((bits >>> 14) & 0x3fff) + 1,
  };
}

function parseVp8x(payload) {
  if (payload.length < 10) fail('VP8X chunk is too short to contain canvas dimensions.');
  const flags = FEATURE_FLAGS.filter((feature) => (payload[0] & feature.mask) !== 0).map(
    (feature) => feature.name
  );
  return {
    features: flags,
    width: readUint24LE(payload, 4) + 1,
    height: readUint24LE(payload, 7) + 1,
  };
}

/**
 * Parses a WebP RIFF container without decoding image pixels.
 *
 * @param {ArrayBuffer|Uint8Array} input - Raw WebP bytes.
 * @returns {{declaredSize: number, formType: string, primaryChunk: string, width: number,
 * height: number, features: string[], optionalChunks: Array<{name: string, size: number}>}}
 * @throws {Error} When the container or its chunks are malformed.
 */
export function parseWebp(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 12) fail('file is shorter than the 12-byte RIFF header.');
  if (readFourCc(bytes, 0) !== 'RIFF') fail('missing RIFF container signature.');

  const declaredSize = readUint32LE(bytes, 4);
  const expectedLength = declaredSize + 8;
  if (expectedLength !== bytes.length) {
    fail(`declared RIFF size is ${declaredSize} bytes, but file length is ${bytes.length} bytes.`);
  }
  if (bytes.length % 2 !== 0) fail('container has non-even chunk padding.');

  const formType = readFourCc(bytes, 8);
  if (formType !== 'WEBP') fail('RIFF form type is not WEBP.');

  const chunks = [];
  let offset = 12;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) fail('truncated chunk header.');
    const name = readFourCc(bytes, offset);
    const size = readUint32LE(bytes, offset + 4);
    const dataOffset = offset + 8;
    const dataEnd = dataOffset + size;
    if (dataEnd > bytes.length) fail(`${name} chunk is truncated.`);
    const needsPadding = size % 2 === 1;
    const nextOffset = dataEnd + (needsPadding ? 1 : 0);
    if (nextOffset > bytes.length) fail(`${name} chunk has missing even-byte padding.`);
    if (needsPadding && bytes[dataEnd] !== 0) fail(`${name} chunk has non-zero padding.`);
    chunks.push({ name, size, payload: bytes.subarray(dataOffset, dataEnd) });
    offset = nextOffset;
  }

  if (chunks.length === 0) fail('container does not contain an image chunk.');
  const primary = chunks[0];
  if (!['VP8 ', 'VP8L', 'VP8X'].includes(primary.name)) {
    fail(`unsupported first image chunk ${JSON.stringify(primary.name)}.`);
  }

  let details;
  if (primary.name === 'VP8 ') {
    details = parseVp8Dimensions(primary.payload);
  } else if (primary.name === 'VP8L') {
    details = parseVp8lDimensions(primary.payload);
  } else {
    details = parseVp8x(primary.payload);
  }

  return {
    declaredSize,
    formType,
    primaryChunk: primary.name,
    width: details.width,
    height: details.height,
    features: details.features ?? [],
    optionalChunks: chunks
      .filter((chunk, index) => index > 0 && OPTIONAL_CHUNK_TYPES.has(chunk.name))
      .map((chunk) => ({ name: chunk.name, size: chunk.size })),
  };
}
