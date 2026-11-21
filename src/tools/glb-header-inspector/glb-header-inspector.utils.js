const GLB_HEADER_LENGTH = 12;
const GLB_MAGIC = 'glTF';
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;

/**
 * Parses a glTF Binary (GLB) container without decoding mesh or texture payloads.
 * @param {ArrayBuffer} buffer - The uploaded GLB file bytes.
 * @returns {{fileSize: number, header: object|null, chunks: object[], errors: string[],
 * warnings: string[], jsonMetadata: object|null}} Parsed, display-safe container metadata.
 */
export function inspectGlbHeader(buffer) {
  const bytes = toBytes(buffer);
  const result = {
    fileSize: bytes.byteLength,
    header: null,
    chunks: [],
    errors: [],
    warnings: [],
    jsonMetadata: null,
  };

  if (bytes.byteLength < GLB_HEADER_LENGTH) {
    result.errors.push(
      `Truncated GLB header: expected ${GLB_HEADER_LENGTH} bytes, found ${bytes.byteLength}.`
    );
    return result;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = decodeAscii(readBytes(bytes, 0, 4));
  const version = readUint32(view, 4, bytes.byteLength);
  const declaredLength = readUint32(view, 8, bytes.byteLength);
  result.header = { magic, version, declaredLength };

  if (magic !== GLB_MAGIC) {
    result.errors.push(`Invalid GLB magic: expected "${GLB_MAGIC}", found "${magic}".`);
  }
  if (version !== 2) {
    result.warnings.push(`Unsupported GLB version ${version}; this inspector expects version 2.`);
  }
  if (declaredLength !== bytes.byteLength) {
    result.errors.push(
      `Declared GLB length ${declaredLength} does not match actual buffer ` +
        `length ${bytes.byteLength}.`
    );
  }

  let offset = GLB_HEADER_LENGTH;
  let jsonChunkCount = 0;
  let binChunkCount = 0;
  while (offset < bytes.byteLength) {
    if (bytes.byteLength - offset < 8) {
      result.errors.push(`Truncated chunk header at offset ${offset}: 8 bytes are required.`);
      break;
    }

    const chunkLength = readUint32(view, offset, bytes.byteLength);
    const chunkType = readUint32(view, offset + 4, bytes.byteLength);
    const dataOffset = offset + 8;
    if (chunkLength > bytes.byteLength - dataOffset) {
      result.errors.push(
        `Truncated chunk data at offset ${offset}: declares ${chunkLength} bytes, ` +
          `but only ${bytes.byteLength - dataOffset} remain.`
      );
      break;
    }

    const chunk = {
      offset,
      dataOffset,
      length: chunkLength,
      type: getChunkTypeName(chunkType),
      typeValue: `0x${chunkType.toString(16).padStart(8, '0').toUpperCase()}`,
    };
    result.chunks.push(chunk);
    if (chunkLength % 4 !== 0) {
      result.warnings.push(`Chunk at offset ${offset} has a length not aligned to 4 bytes.`);
    }

    if (chunkType === JSON_CHUNK_TYPE) {
      jsonChunkCount += 1;
      if (jsonChunkCount > 1) {
        result.errors.push('GLB contains more than one JSON chunk.');
      }
      if (result.chunks.length !== 1) {
        result.errors.push('The JSON chunk must be the first chunk in a GLB file.');
      }
      parseJsonMetadata(readBytes(bytes, dataOffset, chunkLength), result);
    } else if (chunkType === BIN_CHUNK_TYPE) {
      binChunkCount += 1;
      if (binChunkCount > 1) {
        result.errors.push('GLB contains more than one BIN chunk.');
      }
      if (jsonChunkCount === 0) {
        result.errors.push('The BIN chunk must come after the JSON chunk.');
      }
    } else {
      result.warnings.push(`Unrecognized chunk type ${chunk.typeValue} at offset ${offset}.`);
    }
    offset = dataOffset + chunkLength;
  }

  if (jsonChunkCount === 0) {
    result.errors.push('GLB is missing its required JSON chunk.');
  }
  return result;
}

/**
 * Converts a GLB byte count into a display value.
 * @param {number} bytes
 * @returns {string}
 */
export function formatGlbBytes(bytes) {
  return `${bytes.toLocaleString()} bytes`;
}

function toBytes(buffer) {
  if (buffer instanceof ArrayBuffer) return new Uint8Array(buffer);
  throw new TypeError('Expected an ArrayBuffer containing GLB data.');
}

function readBytes(bytes, offset, length) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0) {
    throw new RangeError('Invalid GLB byte range.');
  }
  if (length > bytes.byteLength - offset) {
    throw new RangeError(`GLB field at offset ${offset} extends beyond the end of the buffer.`);
  }
  return bytes.subarray(offset, offset + length);
}

function readUint32(view, offset, totalLength) {
  if (!Number.isSafeInteger(offset) || offset < 0 || totalLength - offset < 4) {
    throw new RangeError(`Truncated uint32 field at offset ${offset}.`);
  }
  return view.getUint32(offset, true);
}

function decodeAscii(bytes) {
  return String.fromCharCode(...bytes);
}

function getChunkTypeName(chunkType) {
  if (chunkType === JSON_CHUNK_TYPE) return 'JSON';
  if (chunkType === BIN_CHUNK_TYPE) return 'BIN';
  return 'Unrecognized';
}

function parseJsonMetadata(jsonBytes, result) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(jsonBytes);
    const json = JSON.parse(text);
    if (json === null || Array.isArray(json) || typeof json !== 'object') {
      result.errors.push('The JSON chunk must contain a top-level JSON object.');
      return;
    }
    result.jsonMetadata = {
      topLevelKeys: Object.keys(json),
      assetVersion: typeof json.asset?.version === 'string' ? json.asset.version : null,
      assetGenerator: typeof json.asset?.generator === 'string' ? json.asset.generator : null,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(`Unable to parse JSON chunk: ${detail}`);
  }
}
