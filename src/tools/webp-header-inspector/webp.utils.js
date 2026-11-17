const OPTIONAL_CHUNK_NAMES = new Set(['ICCP', 'ANIM', 'ANMF', 'ALPH', 'EXIF', 'XMP ']);
const IMAGE_CHUNK_NAMES = new Set(['VP8 ', 'VP8L', 'VP8X']);

function fourCcAt(bytes, offset) {
  return String.fromCharCode(...bytes.slice(offset, offset + 4));
}

function readUint24LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readUint32LE(bytes, offset) {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

function parseVp8Dimensions(data) {
  if (data.length < 10) {
    throw new Error('The VP8 chunk is truncated before its frame header.');
  }
  if (data[3] !== 0x9d || data[4] !== 0x01 || data[5] !== 0x2a) {
    throw new Error('The VP8 chunk has an invalid frame start code.');
  }
  return {
    width: (data[6] | (data[7] << 8)) & 0x3fff,
    height: (data[8] | (data[9] << 8)) & 0x3fff,
  };
}

function parseVp8lDimensions(data) {
  if (data.length < 5) {
    throw new Error('The VP8L chunk is truncated before its image header.');
  }
  if (data[0] !== 0x2f) {
    throw new Error('The VP8L chunk has an invalid signature byte.');
  }
  return {
    width: ((data[1] | (data[2] << 8)) & 0x3fff) + 1,
    height: (((data[2] >> 6) | (data[3] << 2) | (data[4] << 10)) & 0x3fff) + 1,
  };
}

function parseVp8xDetails(data) {
  if (data.length < 10) {
    throw new Error('The VP8X chunk is truncated before its extended header.');
  }
  const flags = data[0];
  return {
    width: readUint24LE(data, 4) + 1,
    height: readUint24LE(data, 7) + 1,
    features: [
      ['ICC profile', 5],
      ['Alpha', 4],
      ['Exif metadata', 3],
      ['XMP metadata', 2],
      ['Animation', 1],
    ].filter(([, bit]) => (flags & (1 << bit)) !== 0).map(([name]) => name),
  };
}

/**
 * Parses a WebP RIFF container and its top-level chunks.
 *
 * @param {ArrayBuffer|Uint8Array} input - Raw WebP file bytes.
 * @returns {{declaredSize: number, fileSize: number, imageType: string, width?: number,
 * height?: number, features: string[], optionalChunks: {name: string, size: number}[]}}
 * @throws {Error} When the file is not a complete, well-formed WebP RIFF container.
 */
export function parseWebp(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 12) {
    throw new Error('File is truncated: a WebP RIFF header needs 12 bytes.');
  }
  if (fourCcAt(bytes, 0) !== 'RIFF') {
    throw new Error('Not a WebP file: the RIFF magic is missing.');
  }
  const declaredSize = readUint32LE(bytes, 4);
  if (declaredSize + 8 !== bytes.length) {
    throw new Error('RIFF declared file size does not match the selected file.');
  }
  if (fourCcAt(bytes, 8) !== 'WEBP') {
    throw new Error('Not a WebP file: the RIFF form type must be WEBP.');
  }

  const chunks = [];
  let offset = 12;
  while (offset < bytes.length) {
    if (bytes.length - offset < 8) {
      throw new Error('File is truncated in a WebP chunk header.');
    }
    const name = fourCcAt(bytes, offset);
    const size = readUint32LE(bytes, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + size;
    if (dataEnd > bytes.length) {
      throw new Error(`The ${name} chunk is truncated.`);
    }
    const paddedEnd = dataEnd + (size % 2);
    if (paddedEnd > bytes.length) {
      throw new Error(`The ${name} chunk is missing its required even-byte padding.`);
    }
    chunks.push({ name, size, data: bytes.slice(dataStart, dataEnd) });
    offset = paddedEnd;
  }

  if (chunks.length === 0) {
    throw new Error('The WebP file contains no image chunk.');
  }
  const [imageChunk] = chunks;
  if (!IMAGE_CHUNK_NAMES.has(imageChunk.name)) {
    throw new Error('The first WebP chunk must be VP8 , VP8L, or VP8X.');
  }

  let details = { features: [] };
  if (imageChunk.name === 'VP8 ') details = parseVp8Dimensions(imageChunk.data);
  if (imageChunk.name === 'VP8L') details = parseVp8lDimensions(imageChunk.data);
  if (imageChunk.name === 'VP8X') details = parseVp8xDetails(imageChunk.data);

  return {
    declaredSize,
    fileSize: bytes.length,
    imageType: imageChunk.name,
    ...details,
    features: details.features ?? [],
    optionalChunks: chunks
      .filter((chunk) => OPTIONAL_CHUNK_NAMES.has(chunk.name))
      .map(({ name, size }) => ({ name, size })),
  };
}

/**
 * Formats a byte count for presentation.
 *
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  return `${bytes.toLocaleString()} byte${bytes === 1 ? '' : 's'}`;
}
