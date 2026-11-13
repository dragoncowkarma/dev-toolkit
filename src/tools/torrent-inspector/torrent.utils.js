const textDecoder = new TextDecoder();

/**
 * Decodes an ASCII-compatible bencoded byte string for display.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function decodeText(bytes) {
  return textDecoder.decode(bytes);
}

/**
 * Parses a bencoded value while retaining its source byte range.
 * @param {Uint8Array} bytes
 * @param {number} offset
 * @returns {{ value: number|Uint8Array|Array<unknown>|Map<string, unknown>, end: number }}
 */
function parseValue(bytes, offset) {
  if (offset >= bytes.length) throw new Error('Unexpected end of bencode data.');
  const token = bytes[offset];

  if (token === 105) {
    const end = bytes.indexOf(101, offset);
    if (end === -1) throw new Error('Unterminated integer value.');
    const source = decodeText(bytes.slice(offset + 1, end));
    if (!/^-?(0|[1-9]\d*)$/.test(source)) throw new Error('Invalid bencoded integer.');
    const value = Number(source);
    if (!Number.isSafeInteger(value)) throw new Error('Integer is outside the safe range.');
    return { value, end: end + 1 };
  }

  if (token === 108) {
    const values = [];
    let cursor = offset + 1;
    while (bytes[cursor] !== 101) {
      const item = parseValue(bytes, cursor);
      values.push(item.value);
      cursor = item.end;
    }
    return { value: values, end: cursor + 1 };
  }

  if (token === 100) {
    const values = new Map();
    let cursor = offset + 1;
    while (bytes[cursor] !== 101) {
      const key = parseValue(bytes, cursor);
      if (!(key.value instanceof Uint8Array)) {
        throw new Error('Dictionary key must be a byte string.');
      }
      const value = parseValue(bytes, key.end);
      values.set(decodeText(key.value), value.value);
      cursor = value.end;
    }
    return { value: values, end: cursor + 1 };
  }

  if (token < 48 || token > 57) throw new Error('Invalid bencode token.');
  let colon = offset;
  while (colon < bytes.length && bytes[colon] !== 58) colon += 1;
  if (colon === bytes.length) throw new Error('Byte string is missing its length separator.');
  const lengthSource = decodeText(bytes.slice(offset, colon));
  if (!/^(0|[1-9]\d*)$/.test(lengthSource)) throw new Error('Invalid byte string length.');
  const length = Number(lengthSource);
  const start = colon + 1;
  const end = start + length;
  if (!Number.isSafeInteger(length) || end > bytes.length) {
    throw new Error('Truncated byte string.');
  }
  return { value: bytes.slice(start, end), end };
}

/**
 * Calculates a SHA-1 digest without sending data outside the browser.
 * @param {Uint8Array} input
 * @returns {string}
 */
export function sha1Hex(input) {
  const words = [];
  const bitLength = input.length * 8;
  for (let index = 0; index < input.length; index += 1) {
    words[index >> 2] = (words[index >> 2] || 0) | (input[index] << (24 - (index % 4) * 8));
  }
  words[bitLength >> 5] = (words[bitLength >> 5] || 0) | (0x80 << (24 - (bitLength % 32)));
  words[((bitLength + 64 >> 9) << 4) + 15] = bitLength;

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const rotateLeft = (value, count) => (value << count) | (value >>> (32 - count));

  for (let block = 0; block < words.length; block += 16) {
    const schedule = words.slice(block, block + 16);
    for (let index = 16; index < 80; index += 1) {
      schedule[index] = rotateLeft(
        schedule[index - 3] ^ schedule[index - 8] ^ schedule[index - 14] ^ schedule[index - 16], 1
      );
    }
    let a = h0; let b = h1; let c = h2; let d = h3; let e = h4;
    for (let index = 0; index < 80; index += 1) {
      const phase = Math.floor(index / 20);
      const f = phase === 0 ? (b & c) | (~b & d) : phase === 1 || phase === 3 ? b ^ c ^ d :
        (b & c) | (b & d) | (c & d);
      const constant = [0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xca62c1d6][phase];
      const next = (rotateLeft(a, 5) + f + e + constant + schedule[index]) | 0;
      e = d; d = c; c = rotateLeft(b, 30); b = a; a = next;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
  }
  return [h0, h1, h2, h3, h4].map((word) => (word >>> 0).toString(16).padStart(8, '0')).join('');
}

function requiredInteger(info, key) {
  const value = info.get(key);
  if (!Number.isSafeInteger(value) || value < 0 || (key === 'piece length' && value === 0)) {
    throw new Error(`Missing or invalid info.${key}.`);
  }
  return value;
}

function optionalText(dictionary, key) {
  const value = dictionary.get(key);
  return value instanceof Uint8Array ? decodeText(value) : null;
}

/**
 * Finds the raw value range for the top-level `info` dictionary.
 * @param {Uint8Array} bytes
 * @returns {{ value: Map<string, unknown>, start: number, end: number }|null}
 */
function findRawInfo(bytes) {
  if (bytes[0] !== 100) return null;
  let cursor = 1;
  while (bytes[cursor] !== 101) {
    const key = parseValue(bytes, cursor);
    if (!(key.value instanceof Uint8Array)) {
      throw new Error('Dictionary key must be a byte string.');
    }
    const valueStart = key.end;
    const value = parseValue(bytes, valueStart);
    if (decodeText(key.value) === 'info') {
      return value.value instanceof Map
        ? { value: value.value, start: valueStart, end: value.end }
        : null;
    }
    cursor = value.end;
  }
  return null;
}

/**
 * Parses .torrent bytes and returns metadata suitable for display.
 * @param {Uint8Array} bytes
 * @returns {object} Parsed torrent metadata suitable for display.
 */
export function inspectTorrent(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('Torrent data must be bytes.');
  const parsed = parseValue(bytes, 0);
  if (parsed.end !== bytes.length) throw new Error('Unexpected data after the bencoded value.');
  if (!(parsed.value instanceof Map)) {
    throw new Error('A torrent must contain a top-level dictionary.');
  }

  const root = parsed.value;
  const rawInfo = findRawInfo(bytes);
  if (!rawInfo) throw new Error('Missing required info dictionary.');
  const info = rawInfo.value;
  const pieceLength = requiredInteger(info, 'piece length');
  const pieces = info.get('pieces');
  if (!(pieces instanceof Uint8Array) || pieces.length % 20 !== 0) {
    throw new Error('Missing or invalid info.pieces.');
  }

  const length = info.get('length');
  const fileEntries = info.get('files');
  const isMultiFile = Array.isArray(fileEntries);
  if (!isMultiFile && (!Number.isSafeInteger(length) || length < 0)) {
    throw new Error('Missing or invalid single-file length.');
  }
  const files = isMultiFile ? fileEntries.map((file) => {
    if (!(file instanceof Map)) throw new Error('Invalid file entry.');
    const size = requiredInteger(file, 'length');
    const pathParts = file.get('path');
    if (!Array.isArray(pathParts) || pathParts.some((part) => !(part instanceof Uint8Array))) {
      throw new Error('Invalid multi-file path.');
    }
    return { path: pathParts.map(decodeText).join('/'), size };
  }) : [{ path: optionalText(info, 'name') || 'Unnamed file', size: length }];
  const announceList = root.get('announce-list');
  const tierUrls = Array.isArray(announceList)
    ? announceList.flatMap((tier) => Array.isArray(tier) ? tier : [tier])
      .filter((url) => url instanceof Uint8Array)
      .map(decodeText)
    : [];
  const announceUrls = [optionalText(root, 'announce'), ...tierUrls].filter(Boolean);
  const createdAt = root.get('creation date');

  return {
    announceUrls: [...new Set(announceUrls)],
    creationDate: Number.isSafeInteger(createdAt)
      && !Number.isNaN(new Date(createdAt * 1000).valueOf())
      ? new Date(createdAt * 1000).toISOString()
      : null,
    createdBy: optionalText(root, 'created by'),
    comment: optionalText(root, 'comment'),
    encoding: optionalText(root, 'encoding'),
    files,
    isMultiFile,
    name: optionalText(info, 'name'),
    pieceCount: pieces.length / 20,
    pieceLength,
    totalSize: files.reduce((total, file) => total + file.size, 0),
    infoHash: sha1Hex(bytes.slice(rawInfo.start, rawInfo.end)),
  };
}
