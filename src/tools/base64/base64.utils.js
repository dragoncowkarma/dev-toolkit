const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * Removes all whitespace (spaces, tabs, newlines) from a string.
 * @param {string} value
 * @returns {string}
 */
function stripWhitespace(value) {
  return value.replace(/\s/g, '');
}

/**
 * Encodes a UTF-8 string into a Base64 string.
 * @param {string} text - The plain text to encode.
 * @returns {string} The Base64-encoded result.
 */
export function encodeToBase64(text) {
  if (typeof text !== 'string') {
    throw new TypeError('Input must be a string.');
  }
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * Checks whether a string is well-formed Base64 (ignoring surrounding whitespace).
 * @param {string} value
 * @returns {boolean}
 */
export function isValidBase64(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const cleaned = stripWhitespace(value);
  if (cleaned.length === 0) {
    return true;
  }
  return cleaned.length % 4 === 0 && BASE64_PATTERN.test(cleaned);
}

/**
 * Decodes a Base64 string back into UTF-8 text.
 * @param {string} base64 - The Base64 string to decode.
 * @returns {string} The decoded plain text.
 * @throws {Error} When the input is not valid Base64.
 */
export function decodeFromBase64(base64) {
  if (typeof base64 !== 'string') {
    throw new TypeError('Input must be a string.');
  }
  const cleaned = stripWhitespace(base64);
  if (!isValidBase64(cleaned)) {
    throw new Error('Invalid Base64 input. Please check for typos or missing characters.');
  }
  try {
    const binary = atob(cleaned);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('Invalid Base64 input. Please check for typos or missing characters.');
  }
}

/**
 * Reads a File/Blob and converts its raw bytes into a Base64 string.
 * @param {File|Blob} file
 * @returns {Promise<string>} Resolves with the Base64-encoded file contents.
 */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = /** @type {string} */ (reader.result);
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = () => reject(new Error('Failed to read the selected file.'));
    reader.readAsDataURL(file);
  });
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
