/** Hash algorithms supported by this tool, in display order. */
export const ALGORITHMS = ['MD5', 'SHA-1', 'SHA-256', 'SHA-512'];

/** Output case formats for the generated hex digest. */
export const FORMATS = { LOWER: 'lower', UPPER: 'upper' };

function safeAdd(x, y) {
  const lsw = (x & 0xffff) + (y & 0xffff);
  const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return (msw << 16) | (lsw & 0xffff);
}

function bitRotateLeft(num, count) {
  return (num << count) | (num >>> (32 - count));
}

function md5cmn(q, a, b, x, s, t) {
  return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
}
function md5ff(a, b, c, d, x, s, t) {
  return md5cmn((b & c) | (~b & d), a, b, x, s, t);
}
function md5gg(a, b, c, d, x, s, t) {
  return md5cmn((b & d) | (c & ~d), a, b, x, s, t);
}
function md5hh(a, b, c, d, x, s, t) {
  return md5cmn(b ^ c ^ d, a, b, x, s, t);
}
function md5ii(a, b, c, d, x, s, t) {
  return md5cmn(c ^ (b | ~d), a, b, x, s, t);
}

/**
 * Runs one 64-round MD5 compression cycle over a 16-word block, mutating
 * the running state in place (RFC 1321 §3.4).
 * @param {Int32Array} state - The 4-word running digest state [a, b, c, d].
 * @param {Int32Array} block - A 16-word (512-bit) message block.
 */
function md5cycle(state, block) {
  let [a, b, c, d] = state;
  const k = block;

  a = md5ff(a, b, c, d, k[0], 7, -680876936);
  d = md5ff(d, a, b, c, k[1], 12, -389564586);
  c = md5ff(c, d, a, b, k[2], 17, 606105819);
  b = md5ff(b, c, d, a, k[3], 22, -1044525330);
  a = md5ff(a, b, c, d, k[4], 7, -176418897);
  d = md5ff(d, a, b, c, k[5], 12, 1200080426);
  c = md5ff(c, d, a, b, k[6], 17, -1473231341);
  b = md5ff(b, c, d, a, k[7], 22, -45705983);
  a = md5ff(a, b, c, d, k[8], 7, 1770035416);
  d = md5ff(d, a, b, c, k[9], 12, -1958414417);
  c = md5ff(c, d, a, b, k[10], 17, -42063);
  b = md5ff(b, c, d, a, k[11], 22, -1990404162);
  a = md5ff(a, b, c, d, k[12], 7, 1804603682);
  d = md5ff(d, a, b, c, k[13], 12, -40341101);
  c = md5ff(c, d, a, b, k[14], 17, -1502002290);
  b = md5ff(b, c, d, a, k[15], 22, 1236535329);

  a = md5gg(a, b, c, d, k[1], 5, -165796510);
  d = md5gg(d, a, b, c, k[6], 9, -1069501632);
  c = md5gg(c, d, a, b, k[11], 14, 643717713);
  b = md5gg(b, c, d, a, k[0], 20, -373897302);
  a = md5gg(a, b, c, d, k[5], 5, -701558691);
  d = md5gg(d, a, b, c, k[10], 9, 38016083);
  c = md5gg(c, d, a, b, k[15], 14, -660478335);
  b = md5gg(b, c, d, a, k[4], 20, -405537848);
  a = md5gg(a, b, c, d, k[9], 5, 568446438);
  d = md5gg(d, a, b, c, k[14], 9, -1019803690);
  c = md5gg(c, d, a, b, k[3], 14, -187363961);
  b = md5gg(b, c, d, a, k[8], 20, 1163531501);
  a = md5gg(a, b, c, d, k[13], 5, -1444681467);
  d = md5gg(d, a, b, c, k[2], 9, -51403784);
  c = md5gg(c, d, a, b, k[7], 14, 1735328473);
  b = md5gg(b, c, d, a, k[12], 20, -1926607734);

  a = md5hh(a, b, c, d, k[5], 4, -378558);
  d = md5hh(d, a, b, c, k[8], 11, -2022574463);
  c = md5hh(c, d, a, b, k[11], 16, 1839030562);
  b = md5hh(b, c, d, a, k[14], 23, -35309556);
  a = md5hh(a, b, c, d, k[1], 4, -1530992060);
  d = md5hh(d, a, b, c, k[4], 11, 1272893353);
  c = md5hh(c, d, a, b, k[7], 16, -155497632);
  b = md5hh(b, c, d, a, k[10], 23, -1094730640);
  a = md5hh(a, b, c, d, k[13], 4, 681279174);
  d = md5hh(d, a, b, c, k[0], 11, -358537222);
  c = md5hh(c, d, a, b, k[3], 16, -722521979);
  b = md5hh(b, c, d, a, k[6], 23, 76029189);
  a = md5hh(a, b, c, d, k[9], 4, -640364487);
  d = md5hh(d, a, b, c, k[12], 11, -421815835);
  c = md5hh(c, d, a, b, k[15], 16, 530742520);
  b = md5hh(b, c, d, a, k[2], 23, -995338651);

  a = md5ii(a, b, c, d, k[0], 6, -198630844);
  d = md5ii(d, a, b, c, k[7], 10, 1126891415);
  c = md5ii(c, d, a, b, k[14], 15, -1416354905);
  b = md5ii(b, c, d, a, k[5], 21, -57434055);
  a = md5ii(a, b, c, d, k[12], 6, 1700485571);
  d = md5ii(d, a, b, c, k[3], 10, -1894986606);
  c = md5ii(c, d, a, b, k[10], 15, -1051523);
  b = md5ii(b, c, d, a, k[1], 21, -2054922799);
  a = md5ii(a, b, c, d, k[8], 6, 1873313359);
  d = md5ii(d, a, b, c, k[15], 10, -30611744);
  c = md5ii(c, d, a, b, k[6], 15, -1560198380);
  b = md5ii(b, c, d, a, k[13], 21, 1309151649);
  a = md5ii(a, b, c, d, k[4], 6, -145523070);
  d = md5ii(d, a, b, c, k[11], 10, -1120210379);
  c = md5ii(c, d, a, b, k[2], 15, 718787259);
  b = md5ii(b, c, d, a, k[9], 21, -343485551);

  state[0] = safeAdd(a, state[0]);
  state[1] = safeAdd(b, state[1]);
  state[2] = safeAdd(c, state[2]);
  state[3] = safeAdd(d, state[3]);
}

/**
 * Pads a byte buffer to the MD5 block format and reinterprets it as an
 * array of little-endian 32-bit words (RFC 1321 §3.1-3.2).
 * @param {Uint8Array} bytes
 * @returns {Int32Array}
 */
function padToWords(bytes) {
  const bitLength = bytes.length * 8;
  let paddedLength = bytes.length + 1;
  while (paddedLength % 64 !== 56) paddedLength += 1;
  paddedLength += 8;

  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, bitLength >>> 0, true);
  view.setUint32(paddedLength - 4, Math.floor(bitLength / 0x100000000), true);

  const words = new Int32Array(paddedLength / 4);
  for (let i = 0; i < words.length; i += 1) {
    words[i] = view.getInt32(i * 4, true);
  }
  return words;
}

/**
 * Computes the MD5 digest of a byte buffer using a pure-JS implementation,
 * since the Web Crypto API (SubtleCrypto) does not support MD5.
 * @param {Uint8Array} bytes
 * @returns {string} The lowercase hex digest.
 */
function md5(bytes) {
  const words = padToWords(bytes);
  const state = Int32Array.from([1732584193, -271733879, -1732584194, 271733878]);
  for (let i = 0; i < words.length; i += 16) {
    md5cycle(state, words.subarray(i, i + 16));
  }
  const digest = new Uint8Array(16);
  const view = new DataView(digest.buffer);
  for (let i = 0; i < 4; i += 1) {
    view.setInt32(i * 4, state[i], true);
  }
  return bytesToHex(digest);
}

/**
 * Converts a byte buffer into a lowercase hex string.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Computes the digest of a byte buffer using the requested algorithm.
 * @param {string} algorithm - One of `ALGORITHMS`.
 * @param {Uint8Array} bytes
 * @returns {Promise<string>} Resolves with the lowercase hex digest.
 */
export async function hashBytes(algorithm, bytes) {
  if (!ALGORITHMS.includes(algorithm)) {
    throw new Error(`Unsupported algorithm: ${algorithm}`);
  }
  if (algorithm === 'MD5') {
    return md5(bytes);
  }
  const digest = await crypto.subtle.digest(algorithm, bytes);
  return bytesToHex(new Uint8Array(digest));
}

/**
 * Computes the digest of a UTF-8 string using the requested algorithm.
 * @param {string} algorithm - One of `ALGORITHMS`.
 * @param {string} text
 * @returns {Promise<string>} Resolves with the lowercase hex digest.
 */
export async function hashText(algorithm, text) {
  if (typeof text !== 'string') {
    throw new TypeError('Input must be a string.');
  }
  return hashBytes(algorithm, new TextEncoder().encode(text));
}

/**
 * Reads a File/Blob and computes its digest using the requested algorithm.
 * @param {string} algorithm - One of `ALGORITHMS`.
 * @param {File|Blob} file
 * @returns {Promise<string>} Resolves with the lowercase hex digest.
 */
export function hashFile(algorithm, file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      hashBytes(algorithm, new Uint8Array(/** @type {ArrayBuffer} */ (reader.result))).then(
        resolve,
        reject
      );
    };
    reader.onerror = () => reject(new Error('Failed to read the selected file.'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Applies the requested case format to a hex digest.
 * @param {string} hex
 * @param {string} format - One of `FORMATS`.
 * @returns {string}
 */
export function formatHash(hex, format) {
  return format === FORMATS.UPPER ? hex.toUpperCase() : hex.toLowerCase();
}

/**
 * Formats a byte count into a human-readable string (e.g. "12.3 KB").
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}
