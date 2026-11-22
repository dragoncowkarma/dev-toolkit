const HEADER_LENGTH = 8;
const TWIPS_PER_PIXEL = 20;

const SIGNATURES = {
  FWS: 'Uncompressed',
  CWS: 'zlib-compressed',
  ZWS: 'LZMA-compressed',
};

/**
 * Reads an unsigned bit-packed value from an SWF RECT structure.
 *
 * @param {DataView} view - The bytes containing the RECT.
 * @param {number} startBit - The first bit to read.
 * @param {number} width - The number of bits in the value.
 * @returns {number} The decoded signed value.
 */
function readUnsignedBits(view, startBit, width) {
  let value = 0;
  for (let offset = 0; offset < width; offset += 1) {
    const bitIndex = startBit + offset;
    const byte = view.getUint8(Math.floor(bitIndex / 8));
    const bit = (byte >> (7 - (bitIndex % 8))) & 1;
    value = value * 2 + bit;
  }

  return value;
}

/**
 * Reads a signed bit-packed value from an SWF RECT structure.
 *
 * @param {DataView} view - The bytes containing the RECT.
 * @param {number} startBit - The first bit to read.
 * @param {number} width - The number of bits in the value.
 * @returns {number} The decoded signed value.
 */
function readSignedBits(view, startBit, width) {
  const value = readUnsignedBits(view, startBit, width);
  const signBit = 2 ** (width - 1);
  return value >= signBit ? value - 2 ** width : value;
}

/**
 * Converts an ArrayBuffer or typed-array view to a DataView.
 *
 * @param {ArrayBuffer|ArrayBufferView} input - The binary SWF bytes.
 * @returns {DataView} A view over exactly the supplied bytes.
 */
function toDataView(input) {
  if (input instanceof ArrayBuffer) {
    return new DataView(input);
  }
  if (ArrayBuffer.isView(input)) {
    return new DataView(input.buffer, input.byteOffset, input.byteLength);
  }
  throw new TypeError('SWF input must be binary data.');
}

/**
 * Parses the available header fields from an SWF file without decompressing it.
 *
 * @param {ArrayBuffer|ArrayBufferView|null|undefined} input - The SWF file bytes.
 * @returns {object} The decoded header fields.
 * @throws {Error} When the file is missing, invalid, or truncated.
 */
export function parseSwfHeader(input) {
  if (!input) {
    throw new Error('No file selected. Choose an SWF file to inspect.');
  }

  const view = toDataView(input);
  if (view.byteLength < HEADER_LENGTH) {
    throw new Error('The SWF file is too short or truncated.');
  }

  const signature = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2));
  const compression = SIGNATURES[signature];
  if (!compression) {
    throw new Error(`Unrecognized SWF signature "${signature}". Expected FWS, CWS, or ZWS.`);
  }

  const header = {
    signature,
    compression,
    version: view.getUint8(3),
    fileLength: view.getUint32(4, true),
  };

  if (signature !== 'FWS') {
    return {
      ...header,
      decompressionRequired: true,
    };
  }

  const rectStart = HEADER_LENGTH * 8;
  if (view.byteLength < HEADER_LENGTH + 1) {
    throw new Error('The SWF file is too short or truncated.');
  }
  const nbits = readUnsignedBits(view, rectStart, 5);
  const rectBitLength = 5 + nbits * 4;
  const frameOffset = HEADER_LENGTH + Math.ceil(rectBitLength / 8);
  if (view.byteLength < frameOffset + 4) {
    throw new Error('The SWF file is too short or truncated.');
  }

  const xmin = readSignedBits(view, rectStart + 5, nbits);
  const xmax = readSignedBits(view, rectStart + 5 + nbits, nbits);
  const ymin = readSignedBits(view, rectStart + 5 + nbits * 2, nbits);
  const ymax = readSignedBits(view, rectStart + 5 + nbits * 3, nbits);
  const frameRate = view.getUint8(frameOffset + 1) + view.getUint8(frameOffset) / 256;

  return {
    ...header,
    frameSize: { xmin, xmax, ymin, ymax },
    frameRate,
    frameCount: view.getUint16(frameOffset + 2, true),
  };
}

/**
 * Converts a twip measurement to pixels.
 *
 * @param {number} twips - The measurement in twentieths of a pixel.
 * @returns {number} The measurement in pixels.
 */
export function twipsToPixels(twips) {
  return twips / TWIPS_PER_PIXEL;
}
