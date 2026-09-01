export const MAX_INPUT_BYTES = 1024 * 1024;
export const MAX_RECURSION_DEPTH = 32;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;
const BASE64_URL_PATTERN = /^[A-Za-z0-9_-]*$/;

/**
 * Encodes JSON text as a BSON document.
 *
 * @param {string} jsonText
 * @returns {Uint8Array}
 */
export function encodeJsonToBson(jsonText) {
  if (typeof jsonText !== 'string') {
    throw new TypeError('JSON input must be text.');
  }
  if (encoder.encode(jsonText).length > MAX_INPUT_BYTES) {
    throw new Error('Input exceeds the 1 MiB limit.');
  }

  let value;
  try {
    value = JSON.parse(jsonText);
  } catch {
    throw new Error('Invalid JSON input.');
  }
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new Error('BSON documents must have a JSON object at the root.');
  }

  const bytes = encodeDocument(value, 0);
  if (bytes.length > MAX_INPUT_BYTES) {
    throw new Error('Encoded BSON exceeds the 1 MiB limit.');
  }
  return bytes;
}

/**
 * Decodes BSON bytes into JSON-compatible values.
 *
 * BSON ObjectId, Date, Binary, and large Int64 values are represented in
 * Extended JSON-like objects so that the displayed result remains valid JSON.
 *
 * @param {Uint8Array} bytes
 * @returns {Record<string, unknown>}
 */
export function decodeBson(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError('BSON input must be bytes.');
  }
  if (bytes.length > MAX_INPUT_BYTES) {
    throw new Error('Input exceeds the 1 MiB limit.');
  }
  if (bytes.length === 0) {
    throw new Error('BSON input is empty.');
  }

  const parsed = decodeDocument(bytes, 0, bytes.length, 0);
  if (parsed.nextOffset !== bytes.length) {
    throw new Error('Malformed BSON: trailing bytes after the root document.');
  }
  return parsed.value;
}

/**
 * Converts bytes to a lower-case hexadecimal string.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Converts bytes to Base64.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function bytesToBase64(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

/**
 * Converts bytes to unpadded Base64URL.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

/**
 * Parses hexadecimal, Base64, or Base64URL text into bytes.
 * @param {string} input
 * @param {'auto'|'hex'|'base64'} [format='auto']
 * @returns {Uint8Array}
 */
export function parseBsonInput(input, format = 'auto') {
  if (typeof input !== 'string') {
    throw new TypeError('BSON input must be text.');
  }
  const cleaned = input.replace(/\s/g, '');
  if (cleaned.length === 0) {
    throw new Error('BSON input is empty.');
  }

  if (format === 'hex' || (format === 'auto' && /^[0-9a-fA-F]+$/.test(cleaned))) {
    if (cleaned.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(cleaned)) {
      throw new Error('Invalid hexadecimal BSON input.');
    }
    const result = new Uint8Array(cleaned.length / 2);
    for (let index = 0; index < result.length; index += 1) {
      result[index] = Number.parseInt(cleaned.slice(index * 2, index * 2 + 2), 16);
    }
    enforceInputLimit(result.length);
    return result;
  }

  if (format === 'base64' || format === 'auto') {
    const base64 = cleaned.replaceAll('-', '+').replaceAll('_', '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const isUrl = BASE64_URL_PATTERN.test(cleaned);
    if ((!BASE64_PATTERN.test(base64) || base64.length % 4 === 1) && !isUrl) {
      throw new Error('Invalid Base64 BSON input.');
    }
    try {
      const binary = atob(padded);
      const result = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      enforceInputLimit(result.length);
      return result;
    } catch {
      throw new Error('Invalid Base64 BSON input.');
    }
  }

  throw new Error('Choose a supported BSON input format.');
}

/**
 * Reads a BSON file as bytes while enforcing the client-side size limit.
 * @param {File} file
 * @returns {Promise<Uint8Array>}
 */
export async function readBsonFile(file) {
  if (!(file instanceof Blob)) {
    throw new TypeError('Choose a BSON file to upload.');
  }
  enforceInputLimit(file.size);
  return new Uint8Array(await file.arrayBuffer());
}

function encodeDocument(document, depth) {
  enforceDepth(depth);
  const elements = Object.entries(document).map(([key, value]) => encodeElement(key, value, depth));
  const body = concatBytes(elements);
  const result = new Uint8Array(body.length + 5);
  new DataView(result.buffer).setInt32(0, result.length, true);
  result.set(body, 4);
  return result;
}

function encodeElement(key, value, depth) {
  const encodedKey = encodeCString(key);
  const { type, bytes } = encodeValue(value, depth);
  return concatBytes([Uint8Array.of(type), encodedKey, bytes]);
}

function encodeValue(value, depth) {
  if (value === null) return { type: 0x0a, bytes: new Uint8Array() };
  if (typeof value === 'string') {
    const encoded = encoder.encode(value);
    const bytes = new Uint8Array(encoded.length + 5);
    new DataView(bytes.buffer).setInt32(0, encoded.length + 1, true);
    bytes.set(encoded, 4);
    return { type: 0x02, bytes };
  }
  if (typeof value === 'boolean') return { type: 0x08, bytes: Uint8Array.of(value ? 1 : 0) };
  if (typeof value === 'number') return encodeNumber(value);
  if (Array.isArray(value)) {
    const arrayDocument = Object.fromEntries(value.map((item, index) => [String(index), item]));
    return { type: 0x04, bytes: encodeDocument(arrayDocument, depth + 1) };
  }
  if (typeof value === 'object') {
    return { type: 0x03, bytes: encodeDocument(value, depth + 1) };
  }
  throw new Error('JSON values must be strings, numbers, objects, arrays, booleans, or null.');
}

function encodeNumber(value) {
  if (!Number.isFinite(value)) {
    throw new Error('BSON cannot encode non-finite numbers.');
  }
  if (Number.isInteger(value) && value >= -2147483648 && value <= 2147483647) {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setInt32(0, value, true);
    return { type: 0x10, bytes };
  }
  if (Number.isSafeInteger(value)) {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setBigInt64(0, BigInt(value), true);
    return { type: 0x12, bytes };
  }
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setFloat64(0, value, true);
  return { type: 0x01, bytes };
}

function encodeCString(value) {
  if (value.includes('\0')) {
    throw new Error('BSON field names cannot contain null characters.');
  }
  const encoded = encoder.encode(value);
  const bytes = new Uint8Array(encoded.length + 1);
  bytes.set(encoded);
  return bytes;
}

function decodeDocument(bytes, offset, limit, depth) {
  enforceDepth(depth);
  const size = readInt32(bytes, offset, limit);
  if (size < 5) throw new Error('Malformed BSON: document size is invalid.');
  const end = offset + size;
  if (end > limit) throw new Error('Malformed BSON: document extends beyond its container.');
  if (bytes[end - 1] !== 0) throw new Error('Malformed BSON: document is missing its terminator.');

  const value = {};
  let position = offset + 4;
  while (position < end - 1) {
    const type = bytes[position];
    position += 1;
    const key = readCString(bytes, position, end - 1);
    position = key.nextOffset;
    const parsed = decodeValue(bytes, type, position, end - 1, depth);
    value[key.value] = parsed.value;
    position = parsed.nextOffset;
  }
  if (position !== end - 1) throw new Error('Malformed BSON: invalid element boundary.');
  return { value, nextOffset: end };
}

function decodeValue(bytes, type, offset, limit, depth) {
  if (type === 0x01) return { value: readFloat64(bytes, offset, limit), nextOffset: offset + 8 };
  if (type === 0x02) return decodeString(bytes, offset, limit);
  if (type === 0x03) return decodeDocument(bytes, offset, limit, depth + 1);
  if (type === 0x04) return decodeArray(bytes, offset, limit, depth + 1);
  if (type === 0x05) return decodeBinary(bytes, offset, limit);
  if (type === 0x07) return decodeObjectId(bytes, offset, limit);
  if (type === 0x08) return decodeBoolean(bytes, offset, limit);
  if (type === 0x09) return decodeDate(bytes, offset, limit);
  if (type === 0x0a) return { value: null, nextOffset: offset };
  if (type === 0x10) return { value: readInt32(bytes, offset, limit), nextOffset: offset + 4 };
  if (type === 0x12) return decodeInt64(bytes, offset, limit);
  throw new Error(`Unsupported BSON type 0x${type.toString(16).padStart(2, '0')}.`);
}

function decodeString(bytes, offset, limit) {
  const length = readInt32(bytes, offset, limit);
  const start = offset + 4;
  const end = start + length;
  if (length < 1 || end > limit || bytes[end - 1] !== 0) {
    throw new Error('Malformed BSON: string is invalid.');
  }
  try {
    return { value: decoder.decode(bytes.subarray(start, end - 1)), nextOffset: end };
  } catch {
    throw new Error('Malformed BSON: string is not valid UTF-8.');
  }
}

function decodeArray(bytes, offset, limit, depth) {
  const parsed = decodeDocument(bytes, offset, limit, depth);
  const entries = Object.entries(parsed.value);
  const result = [];
  for (let index = 0; index < entries.length; index += 1) {
    const [key, value] = entries[index];
    if (key !== String(index)) throw new Error('Malformed BSON: array indexes must be sequential.');
    result.push(value);
  }
  return { value: result, nextOffset: parsed.nextOffset };
}

function decodeBinary(bytes, offset, limit) {
  const length = readInt32(bytes, offset, limit);
  const subtypeOffset = offset + 4;
  const start = subtypeOffset + 1;
  const end = start + length;
  if (length < 0 || end > limit) throw new Error('Malformed BSON: binary value is invalid.');
  const base64 = bytesToBase64(bytes.subarray(start, end));
  const subType = bytes[subtypeOffset].toString(16).padStart(2, '0');
  return {
    value: {
      $binary: { base64, subType },
    },
    nextOffset: end,
  };
}

function decodeObjectId(bytes, offset, limit) {
  ensureAvailable(offset, 12, limit);
  return {
    value: { $oid: bytesToHex(bytes.subarray(offset, offset + 12)) },
    nextOffset: offset + 12,
  };
}

function decodeBoolean(bytes, offset, limit) {
  ensureAvailable(offset, 1, limit);
  if (bytes[offset] !== 0 && bytes[offset] !== 1) {
    throw new Error('Malformed BSON: boolean is invalid.');
  }
  return { value: bytes[offset] === 1, nextOffset: offset + 1 };
}

function decodeDate(bytes, offset, limit) {
  const milliseconds = readBigInt64(bytes, offset, limit);
  const date = new Date(Number(milliseconds));
  const value = Number.isNaN(date.getTime())
    ? { $date: { $numberLong: milliseconds.toString() } }
    : { $date: date.toISOString() };
  return { value, nextOffset: offset + 8 };
}

function decodeInt64(bytes, offset, limit) {
  const value = readBigInt64(bytes, offset, limit);
  const minSafe = BigInt(Number.MIN_SAFE_INTEGER);
  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
  return {
    value: value >= minSafe && value <= maxSafe ? Number(value) : { $numberLong: value.toString() },
    nextOffset: offset + 8,
  };
}

function readCString(bytes, offset, limit) {
  let end = offset;
  while (end < limit && bytes[end] !== 0) end += 1;
  if (end === limit) throw new Error('Malformed BSON: field name is unterminated.');
  try {
    return { value: decoder.decode(bytes.subarray(offset, end)), nextOffset: end + 1 };
  } catch {
    throw new Error('Malformed BSON: field name is not valid UTF-8.');
  }
}

function readInt32(bytes, offset, limit) {
  ensureAvailable(offset, 4, limit);
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getInt32(offset, true);
}

function readFloat64(bytes, offset, limit) {
  ensureAvailable(offset, 8, limit);
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getFloat64(offset, true);
}

function readBigInt64(bytes, offset, limit) {
  ensureAvailable(offset, 8, limit);
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigInt64(offset, true);
}

function ensureAvailable(offset, length, limit) {
  if (offset < 0 || length < 0 || offset + length > limit) {
    throw new Error('Malformed BSON: unexpected end of input.');
  }
}

function enforceInputLimit(length) {
  if (length > MAX_INPUT_BYTES) throw new Error('Input exceeds the 1 MiB limit.');
}

function enforceDepth(depth) {
  if (depth > MAX_RECURSION_DEPTH) {
    throw new Error('BSON nesting exceeds the maximum depth of 32.');
  }
}

function concatBytes(chunks) {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
