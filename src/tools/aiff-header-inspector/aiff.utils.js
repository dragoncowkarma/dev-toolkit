const FORM_HEADER_SIZE = 12;
const CHUNK_HEADER_SIZE = 8;
const COMMON_CHUNK_MINIMUM_SIZE = 18;
const SOUND_DATA_HEADER_SIZE = 8;
const EXTENDED_EXPONENT_BIAS = 16383;
const EXTENDED_MANTISSA_BITS = 63;

function readFourCharacterCode(view, offset) {
  let value = '';
  for (let index = 0; index < 4; index += 1) {
    value += String.fromCharCode(view.getUint8(offset + index));
  }
  return value;
}

function readPascalString(view, offset, endOffset) {
  if (offset >= endOffset) {
    throw new Error('The AIFC COMM chunk is missing its compression name.');
  }

  const length = view.getUint8(offset);
  const stringEnd = offset + 1 + length;
  if (stringEnd > endOffset) {
    throw new Error('The AIFC compression name exceeds the COMM chunk boundary.');
  }

  let value = '';
  for (let index = offset + 1; index < stringEnd; index += 1) {
    value += String.fromCharCode(view.getUint8(index));
  }
  return value;
}

/**
 * Decodes an AIFF 80-bit IEEE 754 extended-precision floating-point value.
 *
 * @param {DataView} view
 * @param {number} offset
 * @returns {number}
 */
export function decodeExtendedFloat80(view, offset) {
  const signAndExponent = view.getUint16(offset, false);
  const sign = signAndExponent & 0x8000 ? -1 : 1;
  const exponent = signAndExponent & 0x7fff;
  let mantissa = 0n;

  for (let index = 0; index < 8; index += 1) {
    mantissa = (mantissa << 8n) | BigInt(view.getUint8(offset + 2 + index));
  }

  if (exponent === 0 && mantissa === 0n) return sign * 0;
  if (exponent === 0x7fff) return mantissa === 0x8000000000000000n ? sign * Infinity : NaN;

  const exponentOffset = exponent - EXTENDED_EXPONENT_BIAS - EXTENDED_MANTISSA_BITS;
  return sign * Number(mantissa) * 2 ** exponentOffset;
}

function parseCommonChunk(view, chunkStart, chunkEnd, formType) {
  if (chunkEnd - chunkStart < COMMON_CHUNK_MINIMUM_SIZE) {
    throw new Error('The COMM chunk is truncated.');
  }

  const common = {
    channels: view.getUint16(chunkStart, false),
    sampleFrames: view.getUint32(chunkStart + 2, false),
    bitsPerSample: view.getUint16(chunkStart + 6, false),
    sampleRate: decodeExtendedFloat80(view, chunkStart + 8),
  };

  if (formType === 'AIFC') {
    const compressionOffset = chunkStart + COMMON_CHUNK_MINIMUM_SIZE;
    if (chunkEnd - compressionOffset < 5) {
      throw new Error('The AIFC COMM chunk is missing compression details.');
    }
    common.compressionType = readFourCharacterCode(view, compressionOffset);
    common.compressionName = readPascalString(view, compressionOffset + 4, chunkEnd);
  }

  return common;
}

function parseSoundDataChunk(view, chunkStart, chunkEnd) {
  if (chunkEnd - chunkStart < SOUND_DATA_HEADER_SIZE) {
    throw new Error('The SSND chunk is truncated.');
  }

  return {
    offset: view.getUint32(chunkStart, false),
    blockSize: view.getUint32(chunkStart + 4, false),
  };
}

/**
 * Parses the metadata and chunk boundaries of an AIFF or AIFC file.
 * Audio payloads are never read or decoded.
 *
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {{
 *   formType: string,
 *   formSize: number,
 *   chunks: Array<object>,
 *   common: object|null,
 *   soundData: object|null
 * }}
 */
export function parseAiffHeader(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength < FORM_HEADER_SIZE) {
    throw new Error('The file is too short to contain an AIFF FORM header.');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (readFourCharacterCode(view, 0) !== 'FORM') {
    throw new Error('Not an AIFF file: expected FORM container magic.');
  }

  const formSize = view.getUint32(4, false);
  if (formSize < 4) {
    throw new Error('The FORM container size is invalid.');
  }
  const formEnd = 8 + formSize;
  if (formEnd > view.byteLength) {
    throw new Error('The FORM container size exceeds the available file data.');
  }

  const formType = readFourCharacterCode(view, 8);
  if (formType !== 'AIFF' && formType !== 'AIFC') {
    throw new Error(`Unsupported FORM type "${formType}". Expected AIFF or AIFC.`);
  }

  const chunks = [];
  let common = null;
  let soundData = null;
  let offset = FORM_HEADER_SIZE;

  while (offset < formEnd) {
    if (formEnd - offset < CHUNK_HEADER_SIZE) {
      throw new Error('A chunk header is truncated.');
    }

    const id = readFourCharacterCode(view, offset);
    const size = view.getUint32(offset + 4, false);
    const dataStart = offset + CHUNK_HEADER_SIZE;
    const dataEnd = dataStart + size;
    if (dataEnd > formEnd) {
      throw new Error(`The ${id} chunk size exceeds the remaining FORM data.`);
    }

    const chunk = { id, size };
    if (id === 'COMM') {
      chunk.common = parseCommonChunk(view, dataStart, dataEnd, formType);
      common = chunk.common;
    } else if (id === 'SSND') {
      chunk.soundData = parseSoundDataChunk(view, dataStart, dataEnd);
      soundData = chunk.soundData;
    }
    chunks.push(chunk);

    const nextOffset = dataEnd + (size % 2);
    if (nextOffset > formEnd) {
      throw new Error(`The ${id} chunk is missing its required padding byte.`);
    }
    offset = nextOffset;
  }

  return { formType, formSize, chunks, common, soundData };
}
