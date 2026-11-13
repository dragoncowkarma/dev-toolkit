const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/;

/**
 * Decodes an unpadded Base64URL value into bytes.
 *
 * @param {string} value - A compact JWE segment.
 * @returns {Uint8Array} The decoded bytes.
 * @throws {Error} When the segment is not valid unpadded Base64URL.
 */
export function decodeBase64Url(value) {
  if (
    typeof value !== 'string' ||
    !BASE64URL_PATTERN.test(value) ||
    value.length % 4 === 1
  ) {
    throw new Error('contains invalid Base64URL data');
  }

  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    value.length + ((4 - (value.length % 4)) % 4),
    '=',
  );

  try {
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    throw new Error('contains invalid Base64URL data');
  }
}

/**
 * Parses a JWE compact serialization without attempting decryption.
 *
 * @param {string} compactJwe - A five-segment JWE compact serialization.
 * @returns {{header: Record<string, unknown>, segmentLengths: Record<string, number>}}
 * The protected header and decoded byte length of each encrypted segment.
 * @throws {Error} When the compact serialization is malformed.
 */
export function inspectCompactJwe(compactJwe) {
  const segments = compactJwe.trim().split('.');
  if (segments.length !== 5) {
    throw new Error('A JWE compact token must contain exactly 5 dot-separated segments.');
  }

  const [protectedHeader, encryptedKey, initializationVector, ciphertext, authenticationTag] = segments;
  let header;

  try {
    const headerText = new TextDecoder('utf-8', { fatal: true }).decode(
      decodeBase64Url(protectedHeader),
    );
    header = JSON.parse(headerText);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('The Protected Header must contain valid JSON.');
    }
    throw new Error(`The Protected Header ${error.message}.`);
  }

  if (header === null || Array.isArray(header) || typeof header !== 'object') {
    throw new Error('The Protected Header must contain a JSON object.');
  }

  const encryptedSegments = [
    ['Encrypted Key', encryptedKey],
    ['IV', initializationVector],
    ['Ciphertext', ciphertext],
    ['Authentication Tag', authenticationTag],
  ];
  const segmentLengths = {};

  for (const [name, segment] of encryptedSegments) {
    try {
      segmentLengths[name] = decodeBase64Url(segment).byteLength;
    } catch {
      throw new Error(`The ${name} segment contains invalid Base64URL data.`);
    }
  }

  return { header, segmentLengths };
}
