const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const BASE58_MAP = new Map();
for (let i = 0; i < BASE58_ALPHABET.length; i += 1) {
  BASE58_MAP.set(BASE58_ALPHABET[i], BigInt(i));
}

/**
 * Removes all whitespace characters from a string.
 * @param {string} value
 * @returns {string}
 */
function stripWhitespace(value) {
  return value.replace(/\s/g, '');
}

/**
 * Formats a byte array as a space-separated hex string.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function bytesToHex(bytes) {
  const hexes = [];
  for (let i = 0; i < bytes.length; i += 1) {
    hexes.push(bytes[i].toString(16).padStart(2, '0'));
  }
  return hexes.join(' ');
}

/**
 * Validates hex form (characters + even digit count) and returns the
 * whitespace/prefix-stripped digits along with the decoded byte length,
 * without allocating the full byte array. Shared by `hexToBytes` and the
 * size-limit guard so malformed hex always reports the same descriptive
 * error regardless of input length.
 * @param {string} hex
 * @returns {{ cleaned: string, byteLength: number }}
 */
function validateHexForm(hex) {
  const cleaned = stripWhitespace(hex).replace(/^0x/i, '');
  if (cleaned.length === 0) return { cleaned, byteLength: 0 };
  if (!/^[0-9a-fA-F]*$/.test(cleaned)) {
    throw new Error('Hex input contains invalid characters.');
  }
  if (cleaned.length % 2 !== 0) {
    throw new Error('Hex input must have an even number of digits.');
  }
  return { cleaned, byteLength: cleaned.length / 2 };
}

/**
 * Converts a hex string into a Uint8Array.
 * @param {string} hex
 * @returns {Uint8Array}
 */
export function hexToBytes(hex) {
  const { cleaned, byteLength } = validateHexForm(hex);
  const bytes = new Uint8Array(byteLength);
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes[i / 2] = parseInt(cleaned.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Checks if a value is a Uint8Array across realms.
 * @param {unknown} val
 * @returns {boolean}
 */
function isUint8Array(val) {
  return (
    val instanceof Uint8Array ||
    (Boolean(val) &&
      Object.prototype.toString.call(val) === '[object Uint8Array]')
  );
}

/**
 * Encodes a Uint8Array of bytes into a Base58 string.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function encodeBytesToBase58(bytes) {
  if (!isUint8Array(bytes)) {
    throw new TypeError('Input must be a Uint8Array.');
  }
  if (bytes.length === 0) return '';

  let zeroCount = 0;
  while (zeroCount < bytes.length && bytes[zeroCount] === 0) {
    zeroCount += 1;
  }

  let num = 0n;
  for (let i = zeroCount; i < bytes.length; i += 1) {
    num = (num << 8n) | BigInt(bytes[i]);
  }

  let result = '';
  while (num > 0n) {
    const remainder = Number(num % 58n);
    num = num / 58n;
    result = BASE58_ALPHABET[remainder] + result;
  }

  const prefix = '1'.repeat(zeroCount);
  return prefix + result;
}

/**
 * Decodes a Base58 string to Uint8Array bytes.
 * @param {string} base58
 * @returns {Uint8Array}
 */
export function decodeBase58ToBytes(base58) {
  if (typeof base58 !== 'string') {
    throw new TypeError('Input must be a string.');
  }
  const cleaned = stripWhitespace(base58);
  if (cleaned.length === 0) return new Uint8Array(0);

  let zeroCount = 0;
  while (zeroCount < cleaned.length && cleaned[zeroCount] === '1') {
    zeroCount += 1;
  }

  let num = 0n;
  for (let i = zeroCount; i < cleaned.length; i += 1) {
    const char = cleaned[i];
    const digit = BASE58_MAP.get(char);
    if (digit === undefined) {
      throw new Error(`Invalid Base58 character: '${char}'.`);
    }
    num = num * 58n + digit;
  }

  const bytes = [];
  let temp = num;
  while (temp > 0n) {
    bytes.push(Number(temp & 0xffn));
    temp >>= 8n;
  }
  bytes.reverse();

  const result = new Uint8Array(zeroCount + bytes.length);
  result.fill(0, 0, zeroCount);
  result.set(bytes, zeroCount);

  return result;
}

/**
 * Shared byte-size limit for Base58/Base58Check conversion. It is enforced
 * identically for textarea input and file upload, and for both encode and
 * decode directions (see MAX_BASE58_CHARS for the decode-side bound).
 *
 * `encodeBytesToBase58` / `decodeBase58ToBytes` do whole-payload BigInt
 * arithmetic whose cost grows quadratically with input size, so the
 * previous file-only 16 KB guard could still stall the main thread for
 * seconds, and a pasted (non-file) payload bypassed it entirely.
 *
 * Measured with `node --version` v22.18.0 (x86_64 Darwin, JIT warmed with 5
 * throwaway calls, timings are the mean of 5 further trials on random
 * bytes) via `encodeBytesToBase58`, the more expensive of the two hot paths:
 *   1024 B  ->   ~8 ms
 *   2048 B  ->  ~27 ms   <- selected limit
 *   4096 B  -> ~104 ms
 *   16384 B ->  ~1.6 s   (previous MAX_FILE_SIZE)
 *   32768 B ->  ~8.9 s
 *
 * 2048 bytes keeps worst-case synchronous work in the tens-of-milliseconds
 * range on this measurement machine -- comfortably under a perceptible
 * stall, let alone a multi-second freeze -- while remaining far larger than
 * real Base58 payloads (a Bitcoin address decodes to 25 bytes; most public
 * keys/identifiers are well under 1 KB).
 */
export const MAX_INPUT_BYTES = 2 * 1024; // 2 KB

/**
 * Conservative upper bound, in Base58 characters, for a decoded payload of
 * MAX_INPUT_BYTES bytes. Base58 expands data by log(256)/log(58) ≈ 1.3657x;
 * 138/100 is the standard conservative rounding for that ratio (used by
 * Bitcoin Core's base58 buffer-size estimate). Any decode-mode input longer
 * than this cannot decode to MAX_INPUT_BYTES bytes or fewer, so it can be
 * rejected by a cheap O(n) string-length check before running the O(n^2)
 * BigInt decode loop.
 */
export const MAX_BASE58_CHARS = Math.ceil((MAX_INPUT_BYTES * 138) / 100);

const BASE58_LIMIT_HINT =
  'Base58 is intended for short identifiers and keys (e.g. addresses, ' +
  'public keys), not large payloads.';

/**
 * Guards encode-mode input (text or hex) against MAX_INPUT_BYTES before any
 * BigInt conversion starts. Hex form is validated first, so malformed hex
 * always throws its existing descriptive error rather than being mislabeled
 * as a size failure.
 * @param {string} value - Raw text or hex input.
 * @param {{ inputType?: 'text'|'hex' }} [options]
 * @returns {number} The measured byte length (UTF-8 for text, decoded for hex).
 * @throws {Error} On malformed hex, or when the byte length exceeds MAX_INPUT_BYTES.
 */
export function assertEncodeInputWithinLimit(value, { inputType = 'text' } = {}) {
  const byteLength =
    inputType === 'hex'
      ? validateHexForm(value).byteLength
      : new TextEncoder().encode(value).length;
  if (byteLength > MAX_INPUT_BYTES) {
    throw new Error(
      `Input is ${formatFileSize(byteLength)}, which exceeds the ` +
        `${formatFileSize(MAX_INPUT_BYTES)} Base58 limit. ${BASE58_LIMIT_HINT}`
    );
  }
  return byteLength;
}

/**
 * Guards decode-mode Base58/Base58Check input against MAX_BASE58_CHARS
 * before the BigInt decode loop starts. Uses the whitespace-stripped
 * character count, which is a cheap O(n) upper bound on decoded byte
 * length, avoiding a full decode just to measure size.
 * @param {string} value
 * @returns {number} The whitespace-stripped character length.
 * @throws {Error} When the character length exceeds MAX_BASE58_CHARS.
 */
export function assertDecodeInputWithinLimit(value) {
  const cleaned = typeof value === 'string' ? stripWhitespace(value) : '';
  if (cleaned.length > MAX_BASE58_CHARS) {
    throw new Error(
      `Input is ${cleaned.length} characters, which exceeds the ` +
        `${MAX_BASE58_CHARS}-character Base58 limit (~${formatFileSize(MAX_INPUT_BYTES)} ` +
        `decoded). ${BASE58_LIMIT_HINT}`
    );
  }
  return cleaned.length;
}

/**
 * Encodes a string (UTF-8 text or hex) to Base58.
 * @param {string} input
 * @param {{ inputType?: 'text'|'hex' }} [options]
 * @returns {string}
 */
export function encodeToBase58(input, { inputType = 'text' } = {}) {
  if (typeof input !== 'string') {
    throw new TypeError('Input must be a string.');
  }
  if (input === '') return '';
  assertEncodeInputWithinLimit(input, { inputType });
  const bytes =
    inputType === 'hex' ? hexToBytes(input) : new TextEncoder().encode(input);
  return encodeBytesToBase58(bytes);
}

/**
 * Decodes Base58 to UTF-8 string or hex string.
 * @param {string} base58
 * @param {{ outputType?: 'text'|'hex'|'auto' }} [options]
 * @returns {string}
 */
export function decodeFromBase58(base58, { outputType = 'text' } = {}) {
  assertDecodeInputWithinLimit(base58);
  const bytes = decodeBase58ToBytes(base58);
  if (bytes.length === 0) return '';
  if (outputType === 'hex') return bytesToHex(bytes);

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    if (outputType === 'auto') {
      return bytesToHex(bytes);
    }
    throw new Error(
      'Decoded binary data is not valid UTF-8 text. Switch to Hex mode to view.'
    );
  }
}

/**
 * Decodes Base58 with details about text/hex representation and UTF-8 validity.
 * @param {string} base58
 * @returns {{ bytes: Uint8Array, text: string|null, hex: string, isUtf8: boolean }}
 */
export function decodeBase58Details(base58) {
  assertDecodeInputWithinLimit(base58);
  const bytes = decodeBase58ToBytes(base58);
  const hex = bytesToHex(bytes);
  if (bytes.length === 0) {
    return { bytes, text: '', hex: '', isUtf8: true };
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { bytes, text, hex, isUtf8: true };
  } catch {
    return { bytes, text: null, hex, isUtf8: false };
  }
}

/**
 * Validates whether a string is well-formed Base58.
 * @param {string} value
 * @returns {boolean}
 */
export function isValidBase58(value) {
  if (typeof value !== 'string') return false;
  try {
    decodeBase58ToBytes(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Computes double SHA-256 hash of a byte array using Web Crypto API.
 * @param {Uint8Array} bytes
 * @returns {Promise<Uint8Array>}
 */
export async function doubleSha256(bytes) {
  const hash1 = await crypto.subtle.digest('SHA-256', bytes);
  const hash2 = await crypto.subtle.digest('SHA-256', hash1);
  return new Uint8Array(hash2);
}

/**
 * Encodes bytes into a Base58Check string with a 4-byte checksum.
 * @param {Uint8Array} bytes
 * @returns {Promise<string>}
 */
export async function encodeBytesToBase58Check(bytes) {
  if (!isUint8Array(bytes)) {
    throw new TypeError('Input must be a Uint8Array.');
  }
  const hash = await doubleSha256(bytes);
  const checksum = hash.slice(0, 4);

  const combined = new Uint8Array(bytes.length + 4);
  combined.set(bytes, 0);
  combined.set(checksum, bytes.length);

  return encodeBytesToBase58(combined);
}

/**
 * Encodes text or hex input to Base58Check.
 * @param {string} input
 * @param {{ inputType?: 'text'|'hex' }} [options]
 * @returns {Promise<string>}
 */
export async function encodeToBase58Check(input, { inputType = 'text' } = {}) {
  if (typeof input !== 'string') {
    throw new TypeError('Input must be a string.');
  }
  if (input === '') return '';
  assertEncodeInputWithinLimit(input, { inputType });
  const bytes =
    inputType === 'hex' ? hexToBytes(input) : new TextEncoder().encode(input);
  return encodeBytesToBase58Check(bytes);
}

/**
 * Decodes a Base58Check string into details including checksum validation.
 * @param {string} base58
 * @returns {Promise<{
 *   bytes: Uint8Array,
 *   rawBytes: Uint8Array,
 *   text: string|null,
 *   hex: string,
 *   isUtf8: boolean,
 *   checksumValid: boolean,
 *   checksumError?: string
 * }>}
 */
export async function decodeBase58CheckDetails(base58) {
  assertDecodeInputWithinLimit(base58);
  const rawBytes = decodeBase58ToBytes(base58);

  if (rawBytes.length < 4) {
    const hex = bytesToHex(rawBytes);
    let text = null;
    let isUtf8 = false;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(rawBytes);
      isUtf8 = true;
    } catch {
      isUtf8 = false;
    }
    return {
      bytes: rawBytes,
      rawBytes,
      text: isUtf8 ? text : null,
      hex,
      isUtf8,
      checksumValid: false,
      checksumError:
        'Input is too short for Base58Check (minimum 4-byte checksum required).',
    };
  }

  const payload = rawBytes.slice(0, rawBytes.length - 4);
  const expectedChecksum = rawBytes.slice(rawBytes.length - 4);
  const hash = await doubleSha256(payload);
  const actualChecksum = hash.slice(0, 4);

  let checksumValid = true;
  for (let i = 0; i < 4; i += 1) {
    if (expectedChecksum[i] !== actualChecksum[i]) {
      checksumValid = false;
      break;
    }
  }

  const hex = bytesToHex(payload);
  let text = null;
  let isUtf8 = false;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(payload);
    isUtf8 = true;
  } catch {
    isUtf8 = false;
  }

  return {
    bytes: payload,
    rawBytes,
    text: isUtf8 ? text : null,
    hex,
    isUtf8,
    checksumValid,
    checksumError: checksumValid
      ? undefined
      : 'Base58Check checksum validation failed (checksum mismatch).',
  };
}

/**
 * Reads a File/Blob into a Base58 or Base58Check string.
 * @param {File|Blob} file
 * @param {{ useChecksum?: boolean }} [options]
 * @returns {Promise<string>}
 */
export function fileToBase58(file, { useChecksum = false } = {}) {
  if (file.size > MAX_INPUT_BYTES) {
    return Promise.reject(
      new Error(
        `File is ${formatFileSize(file.size)}, which exceeds the ` +
          `${formatFileSize(MAX_INPUT_BYTES)} Base58 limit. ${BASE58_LIMIT_HINT}`
      )
    );
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const buffer = /** @type {ArrayBuffer} */ (reader.result);
        const bytes = new Uint8Array(buffer);
        if (useChecksum) {
          const result = await encodeBytesToBase58Check(bytes);
          resolve(result);
        } else {
          resolve(encodeBytesToBase58(bytes));
        }
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () =>
      reject(new Error('Failed to read the selected file.'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Formats a byte size.
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
