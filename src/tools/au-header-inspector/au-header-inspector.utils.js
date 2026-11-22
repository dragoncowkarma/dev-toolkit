const AU_MAGIC = 0x2e736e64;
const FIXED_HEADER_SIZE = 24;
const UNKNOWN_DATA_SIZE = 0xffffffff;

const ENCODINGS = {
  1: '8-bit ISDN mu-law',
  2: '8-bit linear PCM',
  3: '16-bit linear PCM',
  4: '24-bit linear PCM',
  5: '32-bit linear PCM',
  6: '32-bit IEEE float',
  7: '64-bit IEEE double',
  23: 'G.721 ADPCM',
  24: 'G.722 ADPCM',
  25: 'G.723 ADPCM',
  26: 'G.723.5 ADPCM',
  27: '8-bit A-law',
};

/**
 * Converts a hexadecimal string into bytes.
 * @param {string} value
 * @returns {Uint8Array}
 */
export function hexToBytes(value) {
  const cleaned = value.replace(/\s/g, '').replace(/^0x/i, '');
  if (!cleaned || cleaned.length % 2 !== 0 || !/^[\da-f]+$/i.test(cleaned)) {
    throw new Error('Enter an even number of hexadecimal characters.');
  }
  return Uint8Array.from(cleaned.match(/../g), (pair) => Number.parseInt(pair, 16));
}

/**
 * Converts a Base64 string into bytes.
 * @param {string} value
 * @returns {Uint8Array}
 */
export function base64ToBytes(value) {
  const cleaned = value.replace(/\s/g, '');
  if (!cleaned || cleaned.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) {
    throw new Error('Enter valid Base64 data.');
  }
  try {
    return Uint8Array.from(atob(cleaned), (character) => character.charCodeAt(0));
  } catch {
    throw new Error('Enter valid Base64 data.');
  }
}

/**
 * Returns a human-readable name for an AU encoding number.
 * @param {number} encoding
 * @returns {string}
 */
export function getEncodingLabel(encoding) {
  return ENCODINGS[encoding] ?? `Unknown encoding (${encoding})`;
}

/**
 * Parses the fixed header and printable annotation from a Sun/NeXT AU file.
 * @param {Uint8Array} bytes
 * @returns {{dataOffset: number, dataSize: number|null, dataSizeUnknown: boolean,
 * encoding: number, encodingLabel: string, sampleRate: number, channels: number,
 * annotation: string|null}}
 */
export function parseAuHeader(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError('AU data must be provided as bytes.');
  }
  if (bytes.length < FIXED_HEADER_SIZE) {
    throw new Error('The AU header is truncated: at least 24 bytes are required.');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, false) !== AU_MAGIC) {
    throw new Error('Invalid AU magic number: expected .snd.');
  }

  const dataOffset = view.getUint32(4, false);
  const rawDataSize = view.getUint32(8, false);
  const annotationEnd = Math.min(Math.max(dataOffset, FIXED_HEADER_SIZE), bytes.length);
  const annotationBytes = bytes.slice(FIXED_HEADER_SIZE, annotationEnd);
  const annotation = getPrintableAnnotation(annotationBytes);

  return {
    dataOffset,
    dataSize: rawDataSize === UNKNOWN_DATA_SIZE ? null : rawDataSize,
    dataSizeUnknown: rawDataSize === UNKNOWN_DATA_SIZE,
    encoding: view.getUint32(12, false),
    encodingLabel: getEncodingLabel(view.getUint32(12, false)),
    sampleRate: view.getUint32(16, false),
    channels: view.getUint32(20, false),
    annotation,
  };
}

/**
 * Decodes an annotation only when all non-padding bytes are printable ASCII.
 * @param {Uint8Array} bytes
 * @returns {string|null}
 */
function getPrintableAnnotation(bytes) {
  const trimmed = bytes.filter((byte) => byte !== 0);
  if (trimmed.length === 0 || trimmed.some((byte) => byte < 0x20 || byte > 0x7e)) {
    return null;
  }
  return new TextDecoder('ascii').decode(trimmed);
}
