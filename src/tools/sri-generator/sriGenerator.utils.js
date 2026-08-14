/** SRI algorithms supported by the W3C Subresource Integrity specification. */
export const SRI_ALGORITHMS = ['sha256', 'sha384', 'sha512'];

const WEB_CRYPTO_ALGORITHMS = {
  sha256: 'SHA-256',
  sha384: 'SHA-384',
  sha512: 'SHA-512',
};

function normalizeAlgorithm(algorithm) {
  const normalized = String(algorithm).toLowerCase().replace('-', '');
  if (!SRI_ALGORITHMS.includes(normalized)) {
    throw new Error(`Unsupported SRI algorithm: ${algorithm}`);
  }
  return normalized;
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function isBase64(value) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return false;
  try {
    return btoa(atob(value)) === value;
  } catch {
    return false;
  }
}

function escapeHtmlAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Computes a Base64-encoded digest for UTF-8 text using a supported SRI algorithm.
 * @param {string} algorithm - An SRI algorithm such as `sha384` or `SHA-384`.
 * @param {string} content - The exact text content to hash as UTF-8 bytes.
 * @returns {Promise<string>} The Base64 digest, without an algorithm prefix.
 */
export async function computeSriDigest(algorithm, content) {
  if (typeof content !== 'string') throw new TypeError('Content must be a string.');
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto API is unavailable in this browser.');
  const normalized = normalizeAlgorithm(algorithm);
  const digest = await globalThis.crypto.subtle.digest(
    WEB_CRYPTO_ALGORITHMS[normalized],
    new TextEncoder().encode(content)
  );
  return bytesToBase64(new Uint8Array(digest));
}

/**
 * Formats one or more valid SRI hash tokens as an integrity attribute value.
 * @param {string[]} hashes - Hash tokens such as `sha384-base64digest`.
 * @returns {string} A space-separated SRI integrity value.
 * @throws {Error} When a supplied token is not a valid supported SRI hash.
 */
export function formatSriIntegrity(hashes) {
  if (!Array.isArray(hashes) || hashes.length === 0) {
    throw new Error('At least one SRI hash is required.');
  }
  return hashes.map((hash) => {
    const [algorithm, digest, ...remainder] = String(hash).trim().split('-');
    const normalized = normalizeAlgorithm(algorithm);
    if (remainder.length || !isBase64(digest ?? '')) {
      throw new Error('Invalid SRI hash token.');
    }
    return `${normalized}-${digest}`;
  }).join(' ');
}

/**
 * Computes one or more SRI hash tokens for text content.
 * @param {string|string[]} algorithms - One or more supported SRI algorithms.
 * @param {string} content - The exact text content to hash as UTF-8 bytes.
 * @returns {Promise<string>} A formatted SRI integrity value.
 */
export async function generateSriIntegrity(algorithms, content) {
  const selectedAlgorithms = Array.isArray(algorithms) ? algorithms : [algorithms];
  if (selectedAlgorithms.length === 0) throw new Error('At least one SRI algorithm is required.');
  const hashes = await Promise.all(selectedAlgorithms.map(async (algorithm) => {
    const normalized = normalizeAlgorithm(algorithm);
    return `${normalized}-${await computeSriDigest(normalized, content)}`;
  }));
  return formatSriIntegrity(hashes);
}

/**
 * Builds an escaped script or stylesheet link tag with its SRI attributes.
 * @param {'script'|'link'} target - The HTML element to create.
 * @param {string} url - Resource URL for the `src` or `href` attribute.
 * @param {string} integrity - A formatted SRI integrity value.
 * @param {'anonymous'|'use-credentials'|''} crossorigin - Optional CORS mode.
 * @returns {string} A complete HTML resource tag.
 */
export function buildSriTag(target, url, integrity, crossorigin = '') {
  if (!['script', 'link'].includes(target)) throw new Error(`Unsupported target: ${target}`);
  if (typeof url !== 'string') throw new TypeError('Resource URL must be a string.');
  const formattedIntegrity = formatSriIntegrity(parseSriIntegrity(integrity).tokens);
  if (!['', 'anonymous', 'use-credentials'].includes(crossorigin)) {
    throw new Error(`Unsupported crossorigin value: ${crossorigin}`);
  }
  const corsAttribute = crossorigin ? ` crossorigin="${crossorigin}"` : '';
  const integrityAttribute = ` integrity="${escapeHtmlAttribute(formattedIntegrity)}"`;
  if (target === 'script') {
    const source = escapeHtmlAttribute(url);
    return `<script src="${source}"${integrityAttribute}${corsAttribute}></script>`;
  }
  const href = escapeHtmlAttribute(url);
  return `<link rel="stylesheet" href="${href}"${integrityAttribute}${corsAttribute}>`;
}

/**
 * Parses supported SRI hash tokens from an integrity attribute value.
 * @param {string} integrity - Raw integrity attribute text.
 * @returns {{ tokens: string[], hashes: { algorithm: string, digest: string }[] }} Parsed tokens.
 */
export function parseSriIntegrity(integrity) {
  if (typeof integrity !== 'string') throw new TypeError('Integrity must be a string.');
  const rawTokens = integrity.trim() ? integrity.trim().split(/\s+/) : [];
  const hashes = rawTokens.map((token) => {
    const [algorithm, digest, ...remainder] = token.split('-');
    const normalized = normalizeAlgorithm(algorithm);
    if (remainder.length || !isBase64(digest ?? '')) throw new Error('Invalid SRI hash token.');
    return { algorithm: normalized, digest };
  });
  return {
    hashes,
    tokens: hashes.map(({ algorithm, digest }) => `${algorithm}-${digest}`),
  };
}

/**
 * Validates supplied content against one or more expected SRI hash tokens.
 * @param {string} content - The exact text content to validate.
 * @param {string} integrity - Raw integrity attribute text to compare.
 * @returns {Promise<{isMatch: boolean, matchedAlgorithms: string[], calculatedIntegrity: string}>}
 *   Validation status, matching algorithms, and calculated SRI metadata.
 */
export async function validateSriIntegrity(content, integrity) {
  const { hashes, tokens } = parseSriIntegrity(integrity);
  if (hashes.length === 0) {
    return { isMatch: false, matchedAlgorithms: [], calculatedIntegrity: '' };
  }
  const algorithms = [...new Set(hashes.map(({ algorithm }) => algorithm))];
  const calculatedIntegrity = await generateSriIntegrity(algorithms, content);
  const calculated = new Set(calculatedIntegrity.split(' '));
  const matchedAlgorithms = hashes
    .filter(({ algorithm, digest }) => calculated.has(`${algorithm}-${digest}`))
    .map(({ algorithm }) => algorithm);
  return {
    isMatch: matchedAlgorithms.length > 0,
    matchedAlgorithms,
    calculatedIntegrity: formatSriIntegrity(tokens),
  };
}
