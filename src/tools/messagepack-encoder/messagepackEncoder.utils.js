export const MAX_INPUT_BYTES = 1024 * 1024;
export const MAX_RECURSION_DEPTH = 32;

const MAX_UINT64 = (1n << 64n) - 1n;
const MIN_INT64 = -(1n << 63n);

function error(message) {
  return { error: message };
}

function concatBytes(chunks) {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const bytes = new Uint8Array(length);
  let offset = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.length;
  });
  return bytes;
}

function unsignedBytes(value, width) {
  const bytes = new Uint8Array(width);
  for (let index = 0; index < width; index += 1) {
    bytes[index] = Number((value >> BigInt((width - index - 1) * 8)) & 0xffn);
  }
  return bytes;
}

function encodeUnsignedInteger(value) {
  if (value <= 0x7fn) return Uint8Array.of(Number(value));
  if (value <= 0xffn) return Uint8Array.of(0xcc, ...unsignedBytes(value, 1));
  if (value <= 0xffffn) return Uint8Array.of(0xcd, ...unsignedBytes(value, 2));
  if (value <= 0xffffffffn) return Uint8Array.of(0xce, ...unsignedBytes(value, 4));
  if (value <= MAX_UINT64) return Uint8Array.of(0xcf, ...unsignedBytes(value, 8));
  throw new Error('Integer is outside the MessagePack uint64 range.');
}

function encodeSignedInteger(value) {
  if (value >= -32n) return Uint8Array.of(Number(value & 0xffn));
  if (value >= -128n) return Uint8Array.of(0xd0, ...unsignedBytes(value & 0xffn, 1));
  if (value >= -32768n) return Uint8Array.of(0xd1, ...unsignedBytes(value & 0xffffn, 2));
  if (value >= -2147483648n) return Uint8Array.of(0xd2, ...unsignedBytes(value & 0xffffffffn, 4));
  if (value >= MIN_INT64) return Uint8Array.of(0xd3, ...unsignedBytes(value & MAX_UINT64, 8));
  throw new Error('Integer is outside the MessagePack int64 range.');
}

function encodeInteger(value) {
  return value >= 0n ? encodeUnsignedInteger(value) : encodeSignedInteger(value);
}

function encodeStringLength(length) {
  const value = BigInt(length);
  if (value <= 31n) return Uint8Array.of(0xa0 | Number(value));
  if (value <= 0xffn) return Uint8Array.of(0xd9, ...unsignedBytes(value, 1));
  if (value <= 0xffffn) return Uint8Array.of(0xda, ...unsignedBytes(value, 2));
  if (value <= 0xffffffffn) return Uint8Array.of(0xdb, ...unsignedBytes(value, 4));
  throw new Error('String length exceeds the MessagePack uint32 range.');
}

function encodeContainerLength(length, kind) {
  const value = BigInt(length);
  const formats = kind === 'array'
    ? { fixPrefix: 0x90, format16: 0xdc, format32: 0xdd }
    : { fixPrefix: 0x80, format16: 0xde, format32: 0xdf };
  if (value <= 15n) return Uint8Array.of(formats.fixPrefix | Number(value));
  if (value <= 0xffffn) return Uint8Array.of(formats.format16, ...unsignedBytes(value, 2));
  if (value <= 0xffffffffn) return Uint8Array.of(formats.format32, ...unsignedBytes(value, 4));
  throw new Error('Collection length exceeds the MessagePack uint32 range.');
}

function encodeFloat64(value) {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value, false);
  return Uint8Array.of(
    0xcb,
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
    view.getUint8(4),
    view.getUint8(5),
    view.getUint8(6),
    view.getUint8(7),
  );
}

function encodeValue(value, depth, maxDepth) {
  if (depth > maxDepth) throw new Error(`Maximum nesting depth (${maxDepth}) exceeded.`);
  if (value === null) return Uint8Array.of(0xc0);
  if (value === false) return Uint8Array.of(0xc2);
  if (value === true) return Uint8Array.of(0xc3);
  if (typeof value === 'string') {
    const bytes = new TextEncoder().encode(value);
    return concatBytes([encodeStringLength(bytes.length), bytes]);
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error('NaN and Infinity are not supported by this JSON encoder.');
    }
    if (typeof value === 'number' && (!Number.isInteger(value) || Object.is(value, -0))) {
      // MessagePack float32 would narrow ordinary JSON numbers, so JSON floats always use float64.
      return encodeFloat64(value);
    }
    return encodeInteger(BigInt(value));
  }
  if (Array.isArray(value)) {
    return concatBytes([
      encodeContainerLength(value.length, 'array'),
      ...value.map((item) => encodeValue(item, depth + 1, maxDepth)),
    ]);
  }
  if (value instanceof Map) {
    const entries = [];
    value.forEach((entryValue, key) => {
      if (typeof key !== 'string' && typeof key !== 'number') {
        throw new Error('Map keys must be strings or finite numbers.');
      }
      if (typeof key === 'number' && !Number.isFinite(key)) {
        throw new Error('Map keys must be strings or finite numbers.');
      }
      entries.push(
        encodeValue(key, depth + 1, maxDepth),
        encodeValue(entryValue, depth + 1, maxDepth),
      );
    });
    return concatBytes([
      encodeContainerLength(value.size, 'map'),
      ...entries,
    ]);
  }
  if (Object.getPrototypeOf(value) === Object.prototype) {
    const entries = Object.entries(value);
    return concatBytes([
      encodeContainerLength(entries.length, 'map'),
      ...entries.flatMap(([key, entryValue]) => [
        encodeValue(key, depth + 1, maxDepth),
        encodeValue(entryValue, depth + 1, maxDepth),
      ]),
    ]);
  }
  throw new Error('Only JSON-compatible values can encode as MessagePack.');
}

/**
 * Parses the JSON-only input accepted by this tool.
 *
 * MessagePack has no standardized diagnostic notation, so JSON is intentionally the sole input.
 *
 * @param {string} input Raw editor content.
 * @param {{maxInputBytes?: number}} [options] Optional parser limits.
 * @returns {{value: unknown}|{error: string}} Parsed JSON value or an actionable error.
 */
export function parseMessagePackEncoderInput(input, options = {}) {
  const maxInputBytes = options.maxInputBytes ?? MAX_INPUT_BYTES;
  if (new TextEncoder().encode(input).length > maxInputBytes) {
    return error(`Input is too large (limit ${maxInputBytes} bytes).`);
  }
  try {
    if (!input.trim()) return error('Input is empty.');
    return { value: JSON.parse(input) };
  } catch (caught) {
    const detail = caught instanceof Error ? caught.message : 'Unknown parsing failure';
    return error(`Malformed JSON: ${detail}`);
  }
}

/**
 * Encodes a JSON-compatible value as definite-length MessagePack bytes.
 *
 * @param {unknown} value JSON-compatible value, with Map supported for direct utility callers.
 * @param {{maxDepth?: number}} [options] Optional structure safety limits.
 * @returns {{bytes: Uint8Array}|{error: string}} Encoded bytes or an actionable error.
 */
export function encodeMessagePack(value, options = {}) {
  try {
    const maxDepth = options.maxDepth ?? MAX_RECURSION_DEPTH;
    if (!Number.isInteger(maxDepth) || maxDepth < 0) {
      return error('Maximum depth must be a non-negative integer.');
    }
    return { bytes: encodeValue(value, 0, maxDepth) };
  } catch (caught) {
    return error(caught instanceof Error ? caught.message : 'Unable to encode this value.');
  }
}

/**
 * Converts encoded bytes into selectable output transport formats.
 *
 * @param {Uint8Array} bytes Encoded MessagePack bytes.
 * @returns {{hex: string, base64: string, base64url: string}} Text output representations.
 */
export function formatMessagePackOutputs(bytes) {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  const base64 = btoa(binary);
  return {
    hex,
    base64,
    base64url: base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  };
}

/** Prebuilt JSON payloads that can be round-tripped through the MessagePack Decoder. */
export const MESSAGEPACK_ENCODER_SAMPLES = [
  { id: 'simple-map', label: 'Simple object', value: '{"hello":"world"}' },
  {
    id: 'nested-object',
    label: 'Nested object and array',
    value: '{"project":"dev-toolkit","items":[1,true,{"nested":"value"}]}',
  },
];
