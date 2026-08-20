export const MAX_INPUT_BYTES = 1024 * 1024;
export const MAX_RECURSION_DEPTH = 64;

const MAJOR_TYPE_NAMES = [
  'Unsigned integer',
  'Negative integer',
  'Byte string',
  'Text string',
  'Array',
  'Map',
  'Semantic tag',
  'Simple / float',
];

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function errorAt(offset, message) {
  return { error: `${message} at byte offset ${offset}.`, offset };
}

function numberOrString(value) {
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : `${value}n`;
}

function floatJsonValue(value) {
  if (Number.isNaN(value)) return 'NaN';
  if (value === Infinity) return 'Infinity';
  if (value === -Infinity) return '-Infinity';
  return value;
}

function decodeFloat16(bits) {
  const sign = (bits & 0x8000) === 0 ? 1 : -1;
  const exponent = (bits >> 10) & 0x1f;
  const fraction = bits & 0x03ff;
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024);
  if (exponent === 0x1f) return fraction === 0 ? sign * Infinity : NaN;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

function readUnsigned(bytes, offset, additionalInfo) {
  const byteLengths = { 24: 1, 25: 2, 26: 4, 27: 8 };
  if (additionalInfo < 24) return { value: BigInt(additionalInfo), nextOffset: offset };
  if (additionalInfo === 31) {
    return errorAt(offset - 1, 'Indefinite-length items are not supported');
  }
  const byteLength = byteLengths[additionalInfo];
  if (!byteLength) return errorAt(offset - 1, `Reserved additional information ${additionalInfo}`);
  if (offset + byteLength > bytes.length) return errorAt(offset, 'Truncated CBOR argument');

  let value = 0n;
  for (let index = 0; index < byteLength; index += 1) {
    value = (value << 8n) | BigInt(bytes[offset + index]);
  }
  return { value, nextOffset: offset + byteLength };
}

function safeLength(value, offset) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    return errorAt(offset, `Item length ${value} exceeds the browser-safe limit`);
  }
  return { length: Number(value) };
}

function mapJsonValue(entries) {
  const stringKeys = entries.every(({ key }) => typeof key.json === 'string');
  const uniqueKeys = new Set(entries.map(({ key }) => key.json));
  if (stringKeys && uniqueKeys.size === entries.length) {
    return Object.fromEntries(entries.map(({ key, value }) => [key.json, value.json]));
  }
  return entries.map(({ key, value }) => ({ key: key.json, value: value.json }));
}

function readNode(bytes, offset, depth) {
  if (depth > MAX_RECURSION_DEPTH) return errorAt(offset, 'Maximum nesting depth exceeded');
  if (offset >= bytes.length) return errorAt(offset, 'Truncated CBOR item');

  const startOffset = offset;
  const initialByte = bytes[offset];
  const majorType = initialByte >> 5;
  const additionalInfo = initialByte & 0x1f;
  const argument = readUnsigned(bytes, offset + 1, additionalInfo);
  if ('error' in argument) return argument;
  offset = argument.nextOffset;

  const base = {
    majorType,
    majorTypeName: MAJOR_TYPE_NAMES[majorType],
    offset: startOffset,
  };
  let node;

  if (majorType === 0) {
    const value = numberOrString(argument.value);
    node = { ...base, value, json: value, diagnostic: String(value) };
  } else if (majorType === 1) {
    const value = -1n - argument.value;
    const json = value >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(value) : `${value}n`;
    node = { ...base, value: json, json, diagnostic: String(json) };
  } else if (majorType === 2 || majorType === 3) {
    const lengthResult = safeLength(argument.value, startOffset);
    if ('error' in lengthResult) return lengthResult;
    if (offset + lengthResult.length > bytes.length) {
      return errorAt(offset, `Truncated ${majorType === 2 ? 'byte' : 'text'} string`);
    }
    const content = bytes.slice(offset, offset + lengthResult.length);
    offset += lengthResult.length;
    if (majorType === 2) {
      const hex = bytesToHex(content);
      const json = `h'${hex}'`;
      node = { ...base, value: json, json, diagnostic: json };
    } else {
      let text;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(content);
      } catch {
        return errorAt(startOffset, 'Text string is not valid UTF-8');
      }
      node = { ...base, value: text, json: text, diagnostic: JSON.stringify(text) };
    }
  } else if (majorType === 4) {
    const lengthResult = safeLength(argument.value, startOffset);
    if ('error' in lengthResult) return lengthResult;
    const items = [];
    for (let index = 0; index < lengthResult.length; index += 1) {
      const item = readNode(bytes, offset, depth + 1);
      if ('error' in item) return item;
      items.push(item);
      offset = item.nextOffset;
    }
    node = {
      ...base,
      children: items,
      json: items.map((item) => item.json),
      diagnostic: `[${items.map((item) => item.diagnostic).join(', ')}]`,
    };
  } else if (majorType === 5) {
    const lengthResult = safeLength(argument.value, startOffset);
    if ('error' in lengthResult) return lengthResult;
    const entries = [];
    for (let index = 0; index < lengthResult.length; index += 1) {
      const key = readNode(bytes, offset, depth + 1);
      if ('error' in key) return key;
      const value = readNode(bytes, key.nextOffset, depth + 1);
      if ('error' in value) return value;
      entries.push({ key, value });
      offset = value.nextOffset;
    }
    node = {
      ...base,
      entries,
      json: mapJsonValue(entries),
      diagnostic: `{${entries
        .map(({ key, value }) => `${key.diagnostic}: ${value.diagnostic}`)
        .join(', ')}}`,
    };
  } else if (majorType === 6) {
    const item = readNode(bytes, offset, depth + 1);
    if ('error' in item) return item;
    const tag = numberOrString(argument.value);
    offset = item.nextOffset;
    node = {
      ...base,
      tag,
      children: [item],
      json: { tag, value: item.json },
      diagnostic: `${tag}(${item.diagnostic})`,
    };
  } else {
    if (additionalInfo < 20) {
      node = {
        ...base,
        value: `simple(${additionalInfo})`,
        json: `simple(${additionalInfo})`,
        diagnostic: `simple(${additionalInfo})`,
      };
    } else if (additionalInfo === 20 || additionalInfo === 21) {
      const value = additionalInfo === 21;
      node = { ...base, value, json: value, diagnostic: String(value) };
    } else if (additionalInfo === 22) {
      node = { ...base, value: null, json: null, diagnostic: 'null' };
    } else if (additionalInfo === 23) {
      node = { ...base, value: 'undefined', json: 'undefined', diagnostic: 'undefined' };
    } else if (additionalInfo === 24) {
      const value = Number(argument.value);
      node = {
        ...base,
        value: `simple(${value})`,
        json: `simple(${value})`,
        diagnostic: `simple(${value})`,
      };
    } else if (additionalInfo === 25 || additionalInfo === 26 || additionalInfo === 27) {
      const width = { 25: 2, 26: 4, 27: 8 }[additionalInfo];
      const floatOffset = offset - width;
      const view = new DataView(bytes.buffer, bytes.byteOffset + floatOffset, width);
      const value = additionalInfo === 25
        ? decodeFloat16(view.getUint16(0, false))
        : additionalInfo === 26 ? view.getFloat32(0, false) : view.getFloat64(0, false);
      const json = floatJsonValue(value);
      node = { ...base, value: json, json, diagnostic: String(json) };
    } else {
      return errorAt(
        startOffset,
        `Unsupported simple value additional information ${additionalInfo}`,
      );
    }
  }

  return { ...node, byteLength: offset - startOffset, nextOffset: offset };
}

function collectMajorTypes(node, counts) {
  counts[node.majorType] += 1;
  node.children?.forEach((child) => collectMajorTypes(child, counts));
  node.entries?.forEach(({ key, value }) => {
    collectMajorTypes(key, counts);
    collectMajorTypes(value, counts);
  });
}

/**
 * Parses hexadecimal input, allowing whitespace, colons, hyphens, and a leading 0x.
 *
 * @param {string} input Raw hexadecimal payload.
 * @returns {{bytes: Uint8Array}|{error: string}} Parsed bytes or an actionable error.
 */
export function parseHexPayload(input) {
  const compact = input.replace(/[\s:-]/g, '');
  const value = compact.replace(/^0x/i, '');
  if (!value) return { error: 'Hex input is empty.' };
  if (!/^[0-9a-f]+$/i.test(value)) {
    return { error: 'Hex input contains non-hexadecimal characters.' };
  }
  if (value.length % 2) return { error: 'Hex input has an odd number of digits.' };
  return { bytes: Uint8Array.from(value.match(/../g), (pair) => Number.parseInt(pair, 16)) };
}

/**
 * Parses Base64 or Base64URL input with optional padding and whitespace.
 *
 * @param {string} input Raw Base64 payload.
 * @param {'base64'|'base64url'} format Expected Base64 alphabet.
 * @returns {{bytes: Uint8Array}|{error: string}} Parsed bytes or an actionable error.
 */
export function parseBase64Payload(input, format = 'base64') {
  const compact = input.replace(/\s/g, '');
  if (!compact) {
    const emptyLabel = format === 'base64url' ? 'Base64URL' : 'Base64';
    return { error: `${emptyLabel} input is empty.` };
  }
  const pattern = format === 'base64url' ? /^[A-Za-z0-9_-]*={0,2}$/ : /^[A-Za-z0-9+/]*={0,2}$/;
  const label = format === 'base64url' ? 'Base64URL' : 'Base64';
  if (!pattern.test(compact)) return { error: `${label} input contains invalid characters.` };
  const paddingIndex = compact.indexOf('=');
  if (paddingIndex !== -1 && compact.length % 4 !== 0) {
    return { error: `${label} input has invalid padding.` };
  }
  const unpadded = compact.replace(/=+$/, '');
  if (unpadded.length % 4 === 1) return { error: `${label} input has an invalid length.` };
  try {
    const normalized = `${unpadded.replace(/-/g, '+').replace(/_/g, '/')}${'='.repeat(
      (4 - (unpadded.length % 4)) % 4,
    )}`;
    const binary = atob(normalized);
    return { bytes: Uint8Array.from(binary, (character) => character.charCodeAt(0)) };
  } catch {
    return { error: `${label} input is malformed.` };
  }
}

/**
 * Parses a CBOR transport string using a chosen input format or deterministic auto detection.
 *
 * @param {string} input Raw transport string.
 * @param {'auto'|'hex'|'base64'|'base64url'} format Input format selector.
 * @returns {{bytes: Uint8Array, format: string}|{error: string, format: string}} Parse result.
 */
export function parseCborInput(input, format = 'auto') {
  const hexCandidate = input.replace(/[\s:-]/g, '').replace(/^0x/i, '');
  const resolvedFormat = format === 'auto'
    ? (/^[0-9a-f]*$/i.test(hexCandidate) ? 'hex' : /[-_]/.test(input) ? 'base64url' : 'base64')
    : format;
  const parsed = resolvedFormat === 'hex'
    ? parseHexPayload(input)
    : parseBase64Payload(input, resolvedFormat);
  return { ...parsed, format: resolvedFormat };
}

/**
 * Decodes a complete RFC 8949 CBOR payload into serializable JSON, diagnostic notation,
 * byte metadata, and a major-type count. Indefinite-length items are deliberately rejected.
 *
 * @param {Uint8Array} bytes CBOR bytes to decode.
 * @returns {{root: object, json: unknown, diagnostic: string, byteLength: number,
 *   majorTypes: Array<{type: number, name: string, count: number}>}
 *   |{error: string, offset: number}}
 * Decoded representation or an actionable error.
 */
export function decodeCbor(bytes) {
  try {
    if (!(bytes instanceof Uint8Array)) return errorAt(0, 'Payload must be a Uint8Array');
    if (bytes.length === 0) return errorAt(0, 'CBOR payload is empty');
    if (bytes.length > MAX_INPUT_BYTES) {
      return errorAt(0, `Payload too large (${bytes.length} bytes; limit ${MAX_INPUT_BYTES})`);
    }
    const root = readNode(bytes, 0, 0);
    if ('error' in root) return root;
    if (root.nextOffset !== bytes.length) {
      return errorAt(root.nextOffset, 'Unexpected trailing CBOR bytes');
    }
    const counts = Array(8).fill(0);
    collectMajorTypes(root, counts);
    return {
      root,
      json: root.json,
      diagnostic: root.diagnostic,
      byteLength: bytes.length,
      majorTypes: counts.map((count, type) => ({ type, name: MAJOR_TYPE_NAMES[type], count })),
    };
  } catch {
    return errorAt(0, 'Unable to decode this CBOR payload');
  }
}

/**
 * Formats decoded JSON using safe values that never contain BigInt or raw Uint8Array instances.
 *
 * @param {unknown} value Serializable decoded JSON value.
 * @returns {string} Indented JSON for the output panel.
 */
export function formatDecodedJson(value) {
  return JSON.stringify(value, null, 2);
}

/** Prebuilt CBOR examples for quick, local inspection. */
export const CBOR_SAMPLES = [
  { id: 'simple-map', label: 'Simple map', value: 'a16568656c6c6f65776f726c64', format: 'hex' },
  {
    id: 'webauthn',
    label: 'WebAuthn attestation-style',
    value: 'a363666d74646e6f6e6568617574684461746144deadbeef6661747453746da0',
    format: 'hex',
  },
  {
    id: 'tagged',
    label: 'Tagged timestamp and bignum',
    value: '82c11a6553f100c249010000000000000000',
    format: 'hex',
  },
];
