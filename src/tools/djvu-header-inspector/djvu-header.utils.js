const textDecoder = new TextDecoder('ascii');

function readText(bytes, offset, length) {
  if (offset < 0 || length < 0 || offset + length > bytes.length) return null;
  return textDecoder.decode(bytes.subarray(offset, offset + length));
}

function readUint16(bytes, offset) {
  if (offset < 0 || offset + 2 > bytes.length) return null;
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32(bytes, offset) {
  if (offset < 0 || offset + 4 > bytes.length) return null;
  return (
    bytes[offset] * 0x1000000 +
    bytes[offset + 1] * 0x10000 +
    bytes[offset + 2] * 0x100 +
    bytes[offset + 3]
  );
}

function paddedSize(size) {
  return size + (size % 2);
}

function unavailableInfo() {
  return {
    width: null,
    height: null,
    majorVersion: null,
    minorVersion: null,
    dpi: null,
    gamma: null,
    rotationFlags: null,
  };
}

function parseInfo(bytes, offset, size) {
  const info = unavailableInfo();
  if (size < 10 || offset + 10 > bytes.length) return info;

  info.width = readUint16(bytes, offset);
  info.height = readUint16(bytes, offset + 2);
  info.majorVersion = bytes[offset + 4];
  info.minorVersion = bytes[offset + 5];
  info.dpi = readUint16(bytes, offset + 6);
  info.gamma = bytes[offset + 8] / 10;
  info.rotationFlags = bytes[offset + 9];
  return info;
}

function parseChunks(bytes, start, declaredEnd, warnings) {
  const chunks = [];
  let offset = start;
  const readableEnd = Math.min(bytes.length, declaredEnd);

  while (offset < readableEnd) {
    if (offset + 8 > readableEnd) {
      warnings.push('A trailing chunk header is truncated.');
      break;
    }

    const id = readText(bytes, offset, 4);
    const size = readUint32(bytes, offset + 4);
    const dataOffset = offset + 8;
    const padded = paddedSize(size);
    const declaredChunkEnd = dataOffset + padded;
    const availablePayload = Math.max(0, Math.min(size, bytes.length - dataOffset));
    const exceedsForm = declaredChunkEnd > declaredEnd;
    const truncated = dataOffset + size > bytes.length || exceedsForm;
    const formType = id === 'FORM' ? readText(bytes, dataOffset, 4) : null;
    const label = formType ? `FORM:${formType ?? 'unavailable'}` : id;

    chunks.push({
      id: label,
      size,
      paddedSize: padded,
      availablePayload,
      truncated,
      offset,
    });

    if (truncated) {
      warnings.push(
        `Chunk ${label} declares ${size} bytes but only ${availablePayload} are available.`
      );
      break;
    }
    offset = declaredChunkEnd;
  }

  return chunks;
}

/**
 * Parses the safely-readable DjVu IFF85 header and its first-level chunks.
 * Invalid and truncated data returns an inspection result instead of throwing.
 *
 * @param {Uint8Array} inputBytes - Bytes selected, dropped, or decoded in the browser.
 * @returns {object} Inspection metadata, warnings, and safely available fields.
 */
export function inspectDjvuHeader(inputBytes) {
  const bytes = inputBytes instanceof Uint8Array ? inputBytes : new Uint8Array();
  const result = {
    valid: false,
    formType: null,
    formSize: null,
    availableFormBytes: null,
    sizeMismatch: false,
    info: unavailableInfo(),
    chunks: [],
    pageCount: null,
    warnings: [],
  };

  if (readText(bytes, 0, 4) !== 'AT&T') {
    result.warnings.push('Missing DjVu AT&T magic bytes.');
    return result;
  }
  if (readText(bytes, 4, 4) !== 'FORM') {
    result.warnings.push('Missing IFF85 FORM header after the AT&T magic bytes.');
    return result;
  }

  const formSize = readUint32(bytes, 8);
  const formType = readText(bytes, 12, 4);
  if (formSize === null || formType === null) {
    result.warnings.push('The IFF85 FORM header is truncated.');
    return result;
  }

  result.formSize = formSize;
  result.availableFormBytes = Math.max(0, bytes.length - 12);
  result.formType = formType;
  result.sizeMismatch = formSize !== bytes.length - 12;
  if (result.sizeMismatch) {
    result.warnings.push(
      `FORM declares ${formSize} bytes, but ${bytes.length - 12} bytes follow its size field.`
    );
  }
  if (formType !== 'DJVU' && formType !== 'DJVM') {
    result.warnings.push(`Unsupported DjVu FORM type: ${formType}.`);
    return result;
  }

  result.valid = true;
  const declaredEnd = 12 + formSize;
  result.chunks = parseChunks(bytes, 16, declaredEnd, result.warnings);

  if (formType === 'DJVU') {
    const infoChunk = result.chunks.find((chunk) => chunk.id === 'INFO');
    if (infoChunk) {
      result.info = parseInfo(bytes, infoChunk.offset + 8, infoChunk.size);
      if (infoChunk.size < 10) {
        result.warnings.push('INFO chunk is shorter than its 10-byte header.');
      }
    } else {
      result.warnings.push('No readable INFO chunk was found.');
    }
  } else {
    const directory = result.chunks.find((chunk) => chunk.id === 'DIRM');
    if (directory && !directory.truncated && directory.size >= 3) {
      result.pageCount = readUint16(bytes, directory.offset + 9);
    }
  }

  return result;
}

/**
 * Decodes a Base64 string into bytes without accepting malformed input.
 *
 * @param {string} value - Base64 data, optionally separated by whitespace.
 * @returns {Uint8Array} Decoded bytes.
 * @throws {Error} When the text is not valid Base64.
 */
export function decodeBase64Bytes(value) {
  const cleaned = value.replace(/\s/g, '');
  if (!cleaned || cleaned.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) {
    throw new Error('Paste valid Base64-encoded DjVu data.');
  }
  try {
    return Uint8Array.from(atob(cleaned), (character) => character.charCodeAt(0));
  } catch {
    throw new Error('Paste valid Base64-encoded DjVu data.');
  }
}
