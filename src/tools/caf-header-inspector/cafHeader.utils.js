const CAF_HEADER_BYTES = 8;
const CHUNK_HEADER_BYTES = 12;
const DESCRIPTION_BYTES = 32;
const DATA_EDIT_COUNT_BYTES = 4;

function fourCharacterCode(view, offset) {
  let value = '';
  for (let index = 0; index < 4; index += 1) {
    value += String.fromCharCode(view.getUint8(offset + index));
  }
  return value;
}

function unavailableDescription() {
  return {
    sampleRate: 'Unavailable',
    formatId: 'Unavailable',
    formatFlags: 'Unavailable',
    bytesPerPacket: 'Unavailable',
    framesPerPacket: 'Unavailable',
    channelsPerFrame: 'Unavailable',
    bitsPerChannel: 'Unavailable',
  };
}

function decodeDescription(view, offset, size) {
  if (size < DESCRIPTION_BYTES || offset + DESCRIPTION_BYTES > view.byteLength) {
    return unavailableDescription();
  }
  return {
    sampleRate: view.getFloat64(offset, false),
    formatId: fourCharacterCode(view, offset + 8),
    formatFlags: view.getUint32(offset + 12, false),
    bytesPerPacket: view.getUint32(offset + 16, false),
    framesPerPacket: view.getUint32(offset + 20, false),
    channelsPerFrame: view.getUint32(offset + 24, false),
    bitsPerChannel: view.getUint32(offset + 28, false),
  };
}

/**
 * Parses a CAF file header and its directly reachable top-level chunks.
 *
 * @param {ArrayBuffer|Uint8Array} input - Raw CAF bytes.
 * @returns {{header: object|null, chunks: object[], error: string, warnings: string[]}}
 *   The inspected metadata. Malformed input is represented as unavailable fields and warnings.
 */
export function parseCafHeader(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const result = { header: null, chunks: [], error: '', warnings: [] };

  if (view.byteLength < CAF_HEADER_BYTES) {
    result.error = 'This file is too short to contain a CAF header.';
    return result;
  }
  if (fourCharacterCode(view, 0) !== 'caff') {
    result.error = 'This file does not begin with the CAF caff signature.';
    return result;
  }

  result.header = {
    fileVersion: view.getUint16(4, false),
    fileFlags: view.getUint16(6, false),
  };

  let offset = CAF_HEADER_BYTES;
  while (offset < view.byteLength) {
    if (view.byteLength - offset < CHUNK_HEADER_BYTES) {
      result.warnings.push('A trailing chunk header is truncated.');
      break;
    }
    const type = fourCharacterCode(view, offset);
    const declaredSize = view.getBigInt64(offset + 4, false);
    const payloadOffset = offset + CHUNK_HEADER_BYTES;
    const remainingBytes = view.byteLength - payloadOffset;
    const readToEnd = declaredSize === -1n;
    const invalidSize = declaredSize < 0n && !readToEnd;
    const extendsPastBuffer = !invalidSize && !readToEnd && declaredSize > BigInt(remainingBytes);
    const payloadSize = readToEnd
      ? remainingBytes
      : invalidSize || extendsPastBuffer
        ? null
        : Number(declaredSize);
    const chunk = {
      type,
      declaredSize: readToEnd ? 'Read to EOF' : declaredSize.toString(),
      size: payloadSize,
      status: invalidSize || extendsPastBuffer ? 'Unavailable' : 'Available',
      details: null,
    };

    if (invalidSize) {
      result.warnings.push(`${type} has an unrecognized negative chunk size.`);
      result.chunks.push(chunk);
      break;
    }
    if (extendsPastBuffer) {
      result.warnings.push(`${type} extends past the available file data.`);
      result.chunks.push(chunk);
      break;
    }

    if (type === 'desc') {
      chunk.details = decodeDescription(view, payloadOffset, payloadSize);
      if (payloadSize < DESCRIPTION_BYTES) {
        result.warnings.push('The desc chunk is truncated; its fields are unavailable.');
      }
    } else if (type === 'data') {
      chunk.details = payloadSize < DATA_EDIT_COUNT_BYTES
        ? { editCount: 'Unavailable', payloadByteLength: 'Unavailable' }
        : {
          editCount: view.getUint32(payloadOffset, false),
          payloadByteLength: payloadSize - DATA_EDIT_COUNT_BYTES,
        };
      if (payloadSize < DATA_EDIT_COUNT_BYTES) {
        result.warnings.push('The data chunk is truncated; its fields are unavailable.');
      }
    }
    result.chunks.push(chunk);
    offset = payloadOffset + payloadSize;
    if (readToEnd) break;
  }
  return result;
}

/**
 * Decodes Base64 text into raw bytes for browser-only inspection.
 *
 * @param {string} value - Base64 text, optionally containing whitespace.
 * @returns {Uint8Array} The decoded bytes.
 * @throws {Error} When the text is not valid Base64.
 */
export function decodeBase64Bytes(value) {
  try {
    const binary = atob(value.replace(/\s/g, ''));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new Error('Enter valid Base64 data.');
  }
}
