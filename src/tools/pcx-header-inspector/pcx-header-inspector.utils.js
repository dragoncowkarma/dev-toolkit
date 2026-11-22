const PCX_HEADER_LENGTH = 128;
const PCX_MANUFACTURER = 0x0a;

class ByteReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.offset = 0;
  }

  ensure(length) {
    if (this.offset + length > this.bytes.length) {
      throw new Error('PCX header is truncated. A complete PCX header requires 128 bytes.');
    }
  }

  readUint8() {
    this.ensure(1);
    return this.bytes[this.offset++];
  }

  readUint16LE() {
    this.ensure(2);
    const value = this.bytes[this.offset] | (this.bytes[this.offset + 1] << 8);
    this.offset += 2;
    return value;
  }

  readBytes(length) {
    this.ensure(length);
    const value = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }
}

/**
 * Parses hexadecimal bytes, allowing whitespace and an optional 0x prefix per byte.
 * @param {string} value - Hexadecimal input.
 * @returns {Uint8Array} The parsed bytes.
 * @throws {Error} When the input is not valid hexadecimal byte data.
 */
export function parseHexBytes(value) {
  if (typeof value !== 'string') {
    throw new TypeError('Hex input must be a string.');
  }
  const compact = value.replace(/0x/gi, '').replace(/\s+/g, '');
  if (!compact || !/^[\da-f]+$/i.test(compact) || compact.length % 2 !== 0) {
    throw new Error('Enter complete hexadecimal bytes (for example: 0A 05 01 08).');
  }
  return Uint8Array.from(compact.match(/.{2}/g), (byte) => Number.parseInt(byte, 16));
}

/**
 * Decodes Base64 text into raw bytes.
 * @param {string} value - Base64 input.
 * @returns {Uint8Array} The decoded bytes.
 * @throws {Error} When Base64 is malformed.
 */
export function decodeBase64Bytes(value) {
  if (typeof value !== 'string') {
    throw new TypeError('Base64 input must be a string.');
  }
  const compact = value.replace(/\s+/g, '');
  if (!compact || compact.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) {
    throw new Error('Enter valid Base64 data.');
  }
  try {
    return Uint8Array.from(atob(compact), (character) => character.charCodeAt(0));
  } catch {
    throw new Error('Enter valid Base64 data.');
  }
}

/**
 * Reads a selected file as raw bytes.
 * @param {File|Blob} file - File selected by the user.
 * @returns {Promise<Uint8Array>} The file bytes.
 */
export async function readFileBytes(file) {
  try {
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    throw new Error('Failed to read the selected file.');
  }
}

/**
 * Parses the fixed 128-byte ZSoft PCX header without decoding image data.
 * @param {Uint8Array} bytes - PCX file bytes.
 * @returns {object} Parsed PCX header metadata.
 * @throws {Error} When bytes do not contain a valid complete PCX header.
 */
export function parsePcxHeader(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError('PCX data must be provided as bytes.');
  }
  if (bytes.length < PCX_HEADER_LENGTH) {
    throw new Error('PCX header is truncated. A complete PCX header requires 128 bytes.');
  }
  const reader = new ByteReader(bytes);
  const manufacturer = reader.readUint8();
  if (manufacturer !== PCX_MANUFACTURER) {
    throw new Error('Not a PCX file: the manufacturer byte must be 0x0A.');
  }
  const version = reader.readUint8();
  const encoding = reader.readUint8();
  const bitsPerPixel = reader.readUint8();
  const xmin = reader.readUint16LE();
  const ymin = reader.readUint16LE();
  const xmax = reader.readUint16LE();
  const ymax = reader.readUint16LE();
  const hDpi = reader.readUint16LE();
  const vDpi = reader.readUint16LE();
  const egaPalette = Array.from(reader.readBytes(48));
  const reserved = reader.readUint8();
  const numberOfPlanes = reader.readUint8();
  const bytesPerLine = reader.readUint16LE();
  const paletteInfo = reader.readUint16LE();
  const hScreenSize = reader.readUint16LE();
  const vScreenSize = reader.readUint16LE();
  reader.readBytes(54);

  return {
    manufacturer,
    version,
    encoding,
    bitsPerPixel,
    xmin,
    ymin,
    xmax,
    ymax,
    width: xmax - xmin + 1,
    height: ymax - ymin + 1,
    hDpi,
    vDpi,
    egaPalette,
    reserved,
    numberOfPlanes,
    bytesPerLine,
    paletteInfo,
    hScreenSize,
    vScreenSize,
  };
}
