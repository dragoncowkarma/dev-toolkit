export const MAX_INPUT_BYTES = 1024 * 1024;
export const MAX_RECURSION_DEPTH = 64;

const MAX_UINT64 = (1n << 64n) - 1n;
const MIN_NEGATIVE_INTEGER = -1n - MAX_UINT64;

class CborTag {
  constructor(tag, value) {
    this.tag = tag;
    this.value = value;
  }
}

function error(message) {
  return { error: message };
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function uintBytes(value, width) {
  const bytes = new Uint8Array(width);
  for (let index = 0; index < width; index += 1) {
    bytes[index] = Number((value >> BigInt((width - 1 - index) * 8)) & 0xffn);
  }
  return bytes;
}

function encodeArgument(majorType, value) {
  if (value < 0n || value > MAX_UINT64) throw new Error('Integer is outside CBOR uint64 range.');
  if (value < 24n) return Uint8Array.of((majorType << 5) | Number(value));
  if (value <= 0xffn) return Uint8Array.of((majorType << 5) | 24, Number(value));
  if (value <= 0xffffn) return Uint8Array.of((majorType << 5) | 25, ...uintBytes(value, 2));
  if (value <= 0xffffffffn) return Uint8Array.of((majorType << 5) | 26, ...uintBytes(value, 4));
  return Uint8Array.of((majorType << 5) | 27, ...uintBytes(value, 8));
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

function decodeFloat16(bits) {
  const sign = (bits & 0x8000) === 0 ? 1 : -1;
  const exponent = (bits >> 10) & 0x1f;
  const fraction = bits & 0x03ff;
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024);
  if (exponent === 0x1f) return fraction === 0 ? sign * Infinity : NaN;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

function float16Bits(value) {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value, false);
  const bits = view.getUint32(0, false);
  const sign = (bits >>> 16) & 0x8000;
  let exponent = ((bits >>> 23) & 0xff) - 127 + 15;
  let fraction = bits & 0x7fffff;

  if (exponent <= 0) {
    if (exponent < -10) return sign;
    fraction = (fraction | 0x800000) >>> (1 - exponent);
    return sign | ((fraction + 0x1000) >>> 13);
  }
  if (exponent >= 31) return sign | 0x7c00;
  fraction += 0x1000;
  if (fraction & 0x800000) {
    fraction = 0;
    exponent += 1;
  }
  return sign | (exponent << 10) | (fraction >>> 13);
}

function encodeFloat(value) {
  const half = float16Bits(value);
  // RFC 8949 permits several widths. Choose the shortest IEEE 754 width whose decoded value
  // is exactly the input (including -0), the usual deterministic canonical-CBOR policy.
  if (Object.is(decodeFloat16(half), value)) {
    return Uint8Array.of(0xf9, half >> 8, half & 0xff);
  }
  if (Object.is(Math.fround(value), value)) {
    const view = new DataView(new ArrayBuffer(4));
    view.setFloat32(0, value, false);
    return Uint8Array.of(
      0xfa,
      view.getUint8(0),
      view.getUint8(1),
      view.getUint8(2),
      view.getUint8(3),
    );
  }
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value, false);
  return Uint8Array.of(
    0xfb,
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
  if (depth > maxDepth) throw new Error('Maximum nesting depth exceeded.');
  if (value instanceof CborTag) {
    return concatBytes([
      encodeArgument(6, value.tag),
      encodeValue(value.value, depth + 1, maxDepth),
    ]);
  }
  if (value instanceof Uint8Array) {
    return concatBytes([encodeArgument(2, BigInt(value.length)), value]);
  }
  if (value === null) return Uint8Array.of(0xf6);
  if (value === false) return Uint8Array.of(0xf4);
  if (value === true) return Uint8Array.of(0xf5);
  if (typeof value === 'string') {
    const bytes = new TextEncoder().encode(value);
    return concatBytes([encodeArgument(3, BigInt(bytes.length)), bytes]);
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error('NaN and Infinity are not supported by this encoder.');
    }
    if (typeof value === 'number' && (!Number.isInteger(value) || Object.is(value, -0))) {
      return encodeFloat(value);
    }
    const integer = BigInt(value);
    if (integer >= 0n) return encodeArgument(0, integer);
    if (integer < MIN_NEGATIVE_INTEGER) throw new Error('Integer is outside CBOR uint64 range.');
    return encodeArgument(1, -1n - integer);
  }
  if (Array.isArray(value)) {
    return concatBytes([
      encodeArgument(4, BigInt(value.length)),
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
    return concatBytes([encodeArgument(5, BigInt(value.size)), ...entries]);
  }
  if (Object.getPrototypeOf(value) === Object.prototype) {
    const entries = Object.entries(value);
    return concatBytes([
      encodeArgument(5, BigInt(entries.length)),
      ...entries.flatMap(([key, entryValue]) => [
        encodeValue(key, depth + 1, maxDepth),
        encodeValue(entryValue, depth + 1, maxDepth),
      ]),
    ]);
  }
  throw new Error(
    'Only JSON-compatible values, byte strings, maps, and diagnostic tags can encode.',
  );
}

class DiagnosticParser {
  constructor(input) {
    this.input = input;
    this.offset = 0;
  }

  fail(message) {
    throw new Error(`${message} at character ${this.offset + 1}.`);
  }

  skipWhitespace() {
    while (/\s/.test(this.input[this.offset] || '')) this.offset += 1;
  }

  consume(character) {
    this.skipWhitespace();
    if (this.input[this.offset] !== character) this.fail(`Expected '${character}'`);
    this.offset += 1;
  }

  parse() {
    const value = this.parseValue();
    this.skipWhitespace();
    if (this.offset !== this.input.length) this.fail('Unexpected trailing input');
    return value;
  }

  parseValue() {
    this.skipWhitespace();
    const character = this.input[this.offset];
    if (character === '{') return this.parseMap();
    if (character === '[') return this.parseArray();
    if (character === '"') return this.parseString();
    if (character === 'h' && this.input[this.offset + 1] === "'") {
      return this.parseByteString();
    }
    if (this.input.startsWith('true', this.offset)) return this.parseLiteral('true', true);
    if (this.input.startsWith('false', this.offset)) return this.parseLiteral('false', false);
    if (this.input.startsWith('null', this.offset)) return this.parseLiteral('null', null);
    if (character === '-' || /\d/.test(character || '')) return this.parseNumberOrTag();
    this.fail('Expected a diagnostic value');
  }

  parseLiteral(literal, value) {
    this.offset += literal.length;
    return value;
  }

  parseString() {
    const start = this.offset;
    this.offset += 1;
    let escaped = false;
    while (this.offset < this.input.length) {
      const character = this.input[this.offset];
      this.offset += 1;
      if (!escaped && character === '"') {
        try {
          return JSON.parse(this.input.slice(start, this.offset));
        } catch {
          this.offset = start;
          this.fail('Malformed text string');
        }
      }
      escaped = !escaped && character === '\\';
      if (character !== '\\') escaped = false;
    }
    this.offset = start;
    this.fail('Unterminated text string');
  }

  parseByteString() {
    const start = this.offset;
    this.offset += 2;
    const end = this.input.indexOf("'", this.offset);
    if (end === -1) this.fail('Unterminated byte string');
    const hex = this.input.slice(this.offset, end);
    this.offset = end + 1;
    if (!/^[0-9a-f]*$/i.test(hex) || hex.length % 2) {
      this.offset = start;
      this.fail('Byte strings must contain an even number of hexadecimal digits');
    }
    return Uint8Array.from(hex.match(/../g) || [], (pair) => Number.parseInt(pair, 16));
  }

  parseNumberOrTag() {
    const remaining = this.input.slice(this.offset);
    const match = remaining.match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?n?/);
    if (!match) this.fail('Malformed number');
    const token = match[0];
    this.offset += token.length;
    const isBigInt = token.endsWith('n');
    if (isBigInt && /[.eE]/.test(token)) {
      this.fail('BigInt notation cannot include a decimal point');
    }
    const value = isBigInt ? BigInt(token.slice(0, -1)) : Number(token);
    if (!Number.isFinite(value)) this.fail('Numbers must be finite');
    this.skipWhitespace();
    if (this.input[this.offset] !== '(') return value;
    if (!Number.isInteger(value) || value < 0) this.fail('CBOR tags must be non-negative integers');
    this.offset += 1;
    const taggedValue = this.parseValue();
    this.consume(')');
    return new CborTag(BigInt(value), taggedValue);
  }

  parseArray() {
    this.consume('[');
    const values = [];
    this.skipWhitespace();
    if (this.input[this.offset] === ']') {
      this.offset += 1;
      return values;
    }
    while (true) {
      values.push(this.parseValue());
      this.skipWhitespace();
      if (this.input[this.offset] === ']') {
        this.offset += 1;
        return values;
      }
      this.consume(',');
    }
  }

  parseMap() {
    this.consume('{');
    const entries = new Map();
    this.skipWhitespace();
    if (this.input[this.offset] === '}') {
      this.offset += 1;
      return entries;
    }
    while (true) {
      const key = this.parseValue();
      this.consume(':');
      entries.set(key, this.parseValue());
      this.skipWhitespace();
      if (this.input[this.offset] === '}') {
        this.offset += 1;
        return entries;
      }
      this.consume(',');
    }
  }
}

/**
 * Parses JSON or the CBOR Decoder-compatible diagnostic notation subset.
 *
 * @param {string} input Raw editor content.
 * @param {'json'|'diagnostic'} format Selected input syntax.
 * @param {{maxInputBytes?: number}} [options] Optional parser limits.
 * @returns {{value: unknown}|{error: string}} Parsed input or an actionable error.
 */
export function parseCborEncoderInput(input, format = 'json', options = {}) {
  const maxInputBytes = options.maxInputBytes ?? MAX_INPUT_BYTES;
  if (new TextEncoder().encode(input).length > maxInputBytes) {
    return error(`Input is too large (limit ${maxInputBytes} bytes).`);
  }
  try {
    if (!input.trim()) return error('Input is empty.');
    return { value: format === 'json' ? JSON.parse(input) : new DiagnosticParser(input).parse() };
  } catch (caught) {
    const detail = caught instanceof Error ? caught.message : 'Unknown parsing failure';
    const prefix = format === 'json' ? 'Malformed JSON' : 'Malformed diagnostic notation';
    return error(`${prefix}: ${detail}`);
  }
}

/**
 * Encodes a supported value as definite-length RFC 8949 CBOR bytes.
 *
 * @param {unknown} value JSON-compatible value, Uint8Array, Map, or parsed diagnostic tag.
 * @param {{maxDepth?: number}} [options] Optional structure safety limits.
 * @returns {{bytes: Uint8Array}|{error: string}} Encoded bytes or an actionable error.
 */
export function encodeCbor(value, options = {}) {
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
 * Converts encoded bytes into the selectable output transport formats.
 *
 * @param {Uint8Array} bytes Encoded CBOR bytes.
 * @returns {{hex: string, base64: string, base64url: string}} Text output representations.
 */
export function formatCborOutputs(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  const base64 = btoa(binary);
  return {
    hex: bytesToHex(bytes),
    base64,
    base64url: base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  };
}

/** Prebuilt values that mirror the CBOR Decoder samples for round-trip checks. */
export const CBOR_ENCODER_SAMPLES = [
  { id: 'simple-map', label: 'Simple map', format: 'json', value: '{"hello":"world"}' },
  {
    id: 'webauthn',
    label: 'WebAuthn attestation-style',
    format: 'diagnostic',
    value: '{"fmt": "none", "authData": h\'deadbeef\', "attStm": {}}',
  },
  {
    id: 'tagged',
    label: 'Tagged timestamp and bignum',
    format: 'diagnostic',
    value: '[1(1700000000), 2(h\'010000000000000000\')]',
  },
];
