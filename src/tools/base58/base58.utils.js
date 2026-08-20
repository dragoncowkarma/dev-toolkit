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
 * Byte length of a Base58Check checksum (a 4-byte prefix of double SHA-256).
 * Base58Check decode guards accept this many bytes *on top of*
 * MAX_INPUT_BYTES for the raw (payload + checksum) decode, so that an
 * encoded MAX_INPUT_BYTES payload -- which is exactly what
 * `encodeToBase58Check` accepts -- always decodes back successfully. See
 * `decodeBase58CheckDetails`.
 */
export const CHECKSUM_BYTES = 4;

/**
 * Exact per-byte-budget table of the longest run of non-leading-zero Base58
 * digits that is *guaranteed* to decode to at most that many bytes.
 *
 * A fixed expansion-ratio estimate (e.g. the ~1.38 chars/byte conservative
 * rounding of log(256)/log(58) ≈ 1.3657, used by Bitcoin Core for buffer
 * *allocation*) is the wrong tool for an *acceptance* threshold: it only
 * bounds the average case, not the worst case. The worst case for a numeric
 * run of length L (digits drawn from the 58-symbol alphabet, none of them
 * the zero-valued '1') is the value 58^L - 1 -- e.g. an all-'z' run, 'z'
 * being the highest-value digit. That worst case must fit within the byte
 * budget for the length to be safe to accept, i.e. 58^L <= 256^budget. Using
 * 1.38 as an acceptance cutoff instead of this exact inequality let
 * `'z'.repeat(ceil(2048 * 1.38))` (2,828 chars) through, which decodes to
 * 2,071 bytes -- over MAX_INPUT_BYTES.
 *
 * table[budget] is computed once at module load by walking budget from 0 to
 * MAX_INPUT_BYTES + CHECKSUM_BYTES (the largest budget any guard needs --
 * see `decodeBase58CheckDetails`) and, for each step, extending the
 * longest-safe-length so far only while the next digit still fits
 * (58^(length+1) <= 256^budget). Because the length is monotonic in budget,
 * the total work across the whole table is bounded by the final length (a
 * few thousand BigInt multiplications, ~10ms), not by budget^2 -- and every
 * subsequent lookup during decode is an O(1) array read instead of a
 * per-call computation.
 * @type {number[]}
 */
const NUMERIC_CHAR_LIMIT_TABLE = (() => {
  const maxBudget = MAX_INPUT_BYTES + CHECKSUM_BYTES;
  const table = new Array(maxBudget + 1);
  table[0] = 0;
  let length = 0;
  let value = 1n; // 58^length
  let capacity = 1n; // 256^budget
  for (let budget = 1; budget <= maxBudget; budget += 1) {
    capacity *= 256n;
    while (value * 58n <= capacity) {
      value *= 58n;
      length += 1;
    }
    table[budget] = length;
  }
  return table;
})();

/**
 * Exact upper bound, in Base58 characters, for a decoded payload of
 * MAX_INPUT_BYTES bytes (see NUMERIC_CHAR_LIMIT_TABLE). Any plain-Base58
 * decode-mode input longer than this cannot decode to MAX_INPUT_BYTES bytes
 * or fewer, so it can be rejected by a cheap O(1) table lookup before
 * running the O(n^2) BigInt decode loop.
 */
export const MAX_BASE58_CHARS = NUMERIC_CHAR_LIMIT_TABLE[MAX_INPUT_BYTES];

/**
 * Exact upper bound, in Base58 characters, for a Base58Check *raw* decode
 * (payload + CHECKSUM_BYTES checksum bytes) of at most MAX_INPUT_BYTES
 * payload bytes. Wider than MAX_BASE58_CHARS by the checksum's contribution,
 * so a maximum-size `encodeToBase58Check` output is always accepted for
 * decode -- see `decodeBase58CheckDetails`.
 */
export const MAX_BASE58_CHECK_CHARS =
  NUMERIC_CHAR_LIMIT_TABLE[MAX_INPUT_BYTES + CHECKSUM_BYTES];

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
 * character count, which is a cheap O(1) upper bound (via
 * NUMERIC_CHAR_LIMIT_TABLE) on decoded byte length, avoiding a full decode
 * just to measure size.
 *
 * The MAX_BASE58_CHARS bound alone is not sufficient: each leading '1'
 * decodes 1:1 to a leading zero byte (see `decodeBase58ToBytes`), which is a
 * denser char-to-byte ratio than the general numeric-portion table assumes.
 * A string of `MAX_BASE58_CHARS` leading '1's would pass the plain length
 * check yet decode to `MAX_BASE58_CHARS` bytes -- well over MAX_INPUT_BYTES.
 * So the leading-'1' run is counted and charged against the byte budget
 * directly, and only the remaining (non-zero-prefixed) numeric portion is
 * checked against NUMERIC_CHAR_LIMIT_TABLE for the bytes left in the budget.
 *
 * This length check alone is deliberately given one character of slack
 * beyond NUMERIC_CHAR_LIMIT_TABLE's guaranteed-safe length: that table entry
 * is the longest length for which *every* digit combination is safe, but a
 * full MAX_INPUT_BYTES-byte payload typically needs one more digit to encode
 * (most byte values fall in the top ~1/8 of the range NUMERIC_CHAR_LIMIT_TABLE's
 * length can't reach) -- rejecting on length alone at that exact boundary
 * would reject the majority of legitimate MAX_INPUT_BYTES round-trips. So
 * this check only filters out lengths that can *never* fit (avoiding an O(n^2)
 * BigInt decode stall on grossly oversized input); the exact byte-length
 * guarantee for accepted input is enforced afterward, on the real decoded
 * value, by `assertDecodedBytesWithinLimit`.
 * @param {string} value
 * @param {{ maxBytes?: number }} [options] - Byte budget for this decode.
 *   Defaults to MAX_INPUT_BYTES (plain Base58). `decodeBase58CheckDetails`
 *   passes MAX_INPUT_BYTES + CHECKSUM_BYTES here for the *raw* decode, since
 *   a Base58Check string carries CHECKSUM_BYTES more bytes than its payload;
 *   the payload itself is still capped at MAX_INPUT_BYTES afterward.
 * @returns {number} The whitespace-stripped character length.
 * @throws {Error} When the input cannot possibly decode within maxBytes.
 */
export function assertDecodeInputWithinLimit(value, { maxBytes = MAX_INPUT_BYTES } = {}) {
  const cleaned = typeof value === 'string' ? stripWhitespace(value) : '';

  let zeroCount = 0;
  while (zeroCount < cleaned.length && cleaned[zeroCount] === '1') {
    zeroCount += 1;
  }

  if (zeroCount > maxBytes) {
    throw new Error(
      `Input has ${zeroCount} leading '1' characters, which decode to ` +
        `${formatFileSize(zeroCount)} of leading zero bytes alone -- this ` +
        `exceeds the ${formatFileSize(maxBytes)} Base58 limit. ${BASE58_LIMIT_HINT}`
    );
  }

  const numericLength = cleaned.length - zeroCount;
  const remainingBudgetBytes = maxBytes - zeroCount;
  // +1: see the "one character of slack" note above.
  const maxNumericChars = NUMERIC_CHAR_LIMIT_TABLE[remainingBudgetBytes] + 1;

  if (numericLength > maxNumericChars) {
    const limitChars = NUMERIC_CHAR_LIMIT_TABLE[maxBytes];
    throw new Error(
      `Input is ${cleaned.length} characters, which exceeds the ` +
        `${limitChars}-character Base58 limit (~${formatFileSize(maxBytes)} ` +
        `decoded). ${BASE58_LIMIT_HINT}`
    );
  }

  return cleaned.length;
}

/**
 * Guards a decoded byte array against MAX_INPUT_BYTES. This is the exact
 * complement to `assertDecodeInputWithinLimit`'s length-based prefilter: the
 * prefilter admits a one-character margin so it never rejects a legitimate
 * MAX_INPUT_BYTES payload (see that function's doc comment), which means a
 * small band of inputs just above the guaranteed-safe length can still
 * decode to more than MAX_INPUT_BYTES bytes. This check catches those,
 * comparing the actual decoded length rather than an estimate, so it is
 * exact for every accepted input, not merely long inputs.
 * @param {Uint8Array} bytes
 * @param {{ maxBytes?: number }} [options] - See `assertDecodeInputWithinLimit`.
 * @throws {Error} When bytes.length exceeds maxBytes.
 */
function assertDecodedBytesWithinLimit(bytes, { maxBytes = MAX_INPUT_BYTES } = {}) {
  if (bytes.length > maxBytes) {
    throw new Error(
      `Input decodes to ${formatFileSize(bytes.length)}, which exceeds the ` +
        `${formatFileSize(maxBytes)} Base58 limit. ${BASE58_LIMIT_HINT}`
    );
  }
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
  assertDecodedBytesWithinLimit(bytes);
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
  assertDecodedBytesWithinLimit(bytes);
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
  const checksum = hash.slice(0, CHECKSUM_BYTES);

  const combined = new Uint8Array(bytes.length + CHECKSUM_BYTES);
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
 *
 * The raw decode (payload + CHECKSUM_BYTES-byte checksum) is guarded against
 * MAX_INPUT_BYTES + CHECKSUM_BYTES, not MAX_INPUT_BYTES: `encodeToBase58Check`
 * accepts up to MAX_INPUT_BYTES payload bytes and then appends the checksum,
 * so a maximum-size encode's raw decoded length is
 * MAX_INPUT_BYTES + CHECKSUM_BYTES bytes, not MAX_INPUT_BYTES. Capping the
 * raw decode at MAX_INPUT_BYTES (as if it had no checksum) would reject that
 * string on decode -- a same-policy violation between the two directions.
 * The returned `bytes` payload is still capped at MAX_INPUT_BYTES: since
 * CHECKSUM_BYTES is fixed, payload.length = rawBytes.length - CHECKSUM_BYTES
 * is at most MAX_INPUT_BYTES whenever the raw guard above passes, and the
 * explicit check below keeps that guarantee self-evident rather than
 * implicit in the arithmetic.
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
  const maxRawBytes = MAX_INPUT_BYTES + CHECKSUM_BYTES;
  assertDecodeInputWithinLimit(base58, { maxBytes: maxRawBytes });
  const rawBytes = decodeBase58ToBytes(base58);
  assertDecodedBytesWithinLimit(rawBytes, { maxBytes: maxRawBytes });

  if (rawBytes.length < CHECKSUM_BYTES) {
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

  const payload = rawBytes.slice(0, rawBytes.length - CHECKSUM_BYTES);
  // Self-evident cap: see the function doc comment above.
  assertDecodedBytesWithinLimit(payload);
  const expectedChecksum = rawBytes.slice(rawBytes.length - CHECKSUM_BYTES);
  const hash = await doubleSha256(payload);
  const actualChecksum = hash.slice(0, CHECKSUM_BYTES);

  let checksumValid = true;
  for (let i = 0; i < CHECKSUM_BYTES; i += 1) {
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
