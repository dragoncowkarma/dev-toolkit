/**
 * Decodes a Base64URL string to a Uint8Array byte array.
 *
 * @param {string} base64url - Base64URL string.
 * @returns {Uint8Array} Decoded bytes.
 */
export function base64UrlToBytes(base64url) {
  let base64 = String(base64url).replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encodes a Uint8Array or ArrayBuffer to a Base64URL string without padding.
 *
 * @param {ArrayBuffer|Uint8Array} buffer - Buffer to encode.
 * @returns {string} Base64URL encoded string.
 */
export function bytesToBase64Url(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Encodes a Uint8Array or ArrayBuffer to standard Base64 string.
 *
 * @param {ArrayBuffer|Uint8Array} buffer - Buffer to encode.
 * @returns {string} Base64 encoded string.
 */
export function bytesToBase64(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Validates a JWK key object against RFC 7517 required members per kty.
 *
 * @param {object} jwk - JWK key object to validate.
 * @returns {{isValid: boolean, kty: string|null, errors: string[], warnings: string[]}} Result.
 */
export function validateJwk(jwk) {
  const errors = [];
  const warnings = [];

  if (!jwk || typeof jwk !== 'object' || Array.isArray(jwk)) {
    return {
      isValid: false,
      kty: null,
      errors: ['Key must be a valid JSON object.'],
      warnings: [],
    };
  }

  const { kty } = jwk;
  if (!kty) {
    errors.push('Missing required member "kty".');
    return { isValid: false, kty: null, errors, warnings };
  }

  if (kty === 'RSA') {
    if (!jwk.n) errors.push('Missing required member "n" for RSA key.');
    if (!jwk.e) errors.push('Missing required member "e" for RSA key.');
  } else if (kty === 'EC') {
    if (!jwk.crv) errors.push('Missing required member "crv" for EC key.');
    if (!jwk.x) errors.push('Missing required member "x" for EC key.');
    if (!jwk.y) errors.push('Missing required member "y" for EC key.');
  } else if (kty === 'oct') {
    if (!jwk.k) errors.push('Missing required member "k" for symmetric (oct) key.');
  } else {
    errors.push(`Unsupported key type (kty): "${kty}". Expected RSA, EC, or oct.`);
  }

  if (jwk.use && !['sig', 'enc'].includes(jwk.use)) {
    warnings.push(
      `Non-standard "use" parameter: "${jwk.use}". Standard values are "sig" or "enc".`
    );
  }

  return {
    isValid: errors.length === 0,
    kty,
    errors,
    warnings,
  };
}

/**
 * Computes the RFC 7638 SHA-256 JWK Thumbprint rendered as base64url.
 *
 * @param {object} jwk - Valid JWK object containing required members.
 * @returns {Promise<string>} Base64url encoded SHA-256 thumbprint.
 * @throws {Error} When required members are missing or kty is unsupported.
 */
export async function computeJwkThumbprint(jwk) {
  if (!jwk || typeof jwk !== 'object') {
    throw new TypeError('JWK must be a non-null object.');
  }

  const kty = jwk.kty;
  if (!kty) {
    throw new Error('JWK missing required member "kty".');
  }

  let requiredKeys;
  if (kty === 'RSA') {
    requiredKeys = ['e', 'kty', 'n'];
  } else if (kty === 'EC') {
    requiredKeys = ['crv', 'kty', 'x', 'y'];
  } else if (kty === 'oct') {
    requiredKeys = ['k', 'kty'];
  } else {
    throw new Error(`Unsupported key type (kty) for thumbprint: "${kty}".`);
  }

  for (const key of requiredKeys) {
    if (jwk[key] === undefined || jwk[key] === null || jwk[key] === '') {
      throw new Error(`JWK missing required member "${key}" for kty "${kty}".`);
    }
  }

  const canonicalObj = {};
  for (const key of requiredKeys) {
    canonicalObj[key] = String(jwk[key]);
  }

  const canonicalJson = JSON.stringify(canonicalObj);

  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto API is unavailable in this environment.');
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(canonicalJson);
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
  return bytesToBase64Url(hashBuffer);
}

/**
 * Converts an RSA or EC SPKI Public Key PEM string into an equivalent JWK object.
 *
 * @param {string} pem - Public Key PEM string (SPKI).
 * @returns {Promise<object>} JWK representation.
 * @throws {Error} When PEM format is invalid or key import fails.
 */
export async function convertPemToJwk(pem) {
  if (typeof pem !== 'string' || !pem.trim()) {
    throw new TypeError('PEM input must be a non-empty string.');
  }

  const clean = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  if (!clean) {
    throw new Error('Invalid PEM format. No Base64 data found.');
  }

  let binary;
  try {
    binary = base64UrlToBytes(clean);
  } catch {
    throw new Error('Invalid Base64 encoding in PEM input.');
  }

  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto API is unavailable in this environment.');
  }

  const candidates = [
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    { name: 'ECDSA', namedCurve: 'P-256' },
    { name: 'ECDSA', namedCurve: 'P-384' },
    { name: 'ECDSA', namedCurve: 'P-521' },
    { name: 'RSA-PSS', hash: 'SHA-256' },
    { name: 'RSA-OAEP', hash: 'SHA-256' },
  ];

  for (const algo of candidates) {
    try {
      const imported = await globalThis.crypto.subtle.importKey(
        'spki',
        binary.buffer,
        algo,
        true,
        ['verify']
      );
      const jwk = await globalThis.crypto.subtle.exportKey('jwk', imported);
      return jwk;
    } catch {
      // Try next algorithm candidate
    }
  }

  throw new Error(
    'Unable to parse public key PEM. Ensure it is a valid RSA or EC SPKI public key.'
  );
}

/**
 * Converts an RSA or EC Public JWK object into an equivalent SPKI PEM string.
 *
 * @param {object} jwk - Public JWK object.
 * @returns {Promise<string>} Formatted SPKI PEM string.
 * @throws {Error} When conversion fails or key type is symmetric.
 */
export async function convertJwkToPem(jwk) {
  if (!jwk || typeof jwk !== 'object') {
    throw new TypeError('JWK must be a non-null object.');
  }

  if (jwk.kty === 'oct') {
    throw new Error('Symmetric keys (oct) cannot be converted to PEM public key format.');
  }

  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto API is unavailable in this environment.');
  }

  let algo;
  let cleanJwk;

  if (jwk.kty === 'RSA') {
    if (!jwk.n || !jwk.e) {
      throw new Error('RSA JWK requires "n" and "e" parameters for PEM conversion.');
    }
    algo = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
    cleanJwk = { kty: 'RSA', n: jwk.n, e: jwk.e };
  } else if (jwk.kty === 'EC') {
    if (!jwk.crv || !jwk.x || !jwk.y) {
      throw new Error('EC JWK requires "crv", "x", and "y" parameters for PEM conversion.');
    }
    algo = { name: 'ECDSA', namedCurve: jwk.crv };
    cleanJwk = { kty: 'EC', crv: jwk.crv, x: jwk.x, y: jwk.y };
  } else {
    throw new Error(`Unsupported key type (kty): "${jwk.kty}" for PEM conversion.`);
  }

  try {
    const imported = await globalThis.crypto.subtle.importKey(
      'jwk',
      cleanJwk,
      algo,
      true,
      ['verify']
    );
    const spki = await globalThis.crypto.subtle.exportKey('spki', imported);
    const base64 = bytesToBase64(spki);
    const lines = base64.match(/.{1,64}/g) || [base64];
    return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`;
  } catch (error) {
    throw new Error(`Failed to convert JWK to PEM: ${error.message}`);
  }
}

/**
 * Creates a human-readable summary of a key's metadata.
 *
 * @param {object} jwk - JWK object.
 * @returns {{kty: string, alg: string, use: string, kid: string, details: string}} Summary.
 */
export function summarizeJwk(jwk) {
  if (!jwk || typeof jwk !== 'object') {
    return {
      kty: 'Unknown',
      alg: 'Not specified',
      use: 'Unspecified',
      kid: 'None',
      details: 'Invalid key object',
    };
  }

  const kty = jwk.kty || 'Unknown';
  const alg = jwk.alg || 'Not specified';
  const kid = jwk.kid || 'None';

  let use = 'Unspecified';
  if (jwk.use === 'sig') use = 'Signature (sig)';
  else if (jwk.use === 'enc') use = 'Encryption (enc)';
  else if (jwk.use) use = String(jwk.use);

  let details = `${kty} Key`;

  if (kty === 'RSA' && jwk.n) {
    try {
      const bytes = base64UrlToBytes(jwk.n);
      const bitLength = bytes.length * 8;
      details = `RSA ${bitLength}-bit`;
    } catch {
      details = 'RSA Key';
    }
  } else if (kty === 'EC' && jwk.crv) {
    details = `EC ${jwk.crv}`;
  } else if (kty === 'oct' && jwk.k) {
    try {
      const bytes = base64UrlToBytes(jwk.k);
      const bitLength = bytes.length * 8;
      details = `Symmetric ${bitLength}-bit`;
    } catch {
      details = 'Symmetric Key';
    }
  }

  return { kty, alg, use, kid, details };
}

/**
 * Parses input text and evaluates all contained keys per the selected or detected mode.
 *
 * @param {string} input - Raw text input (JWK, JWKS, or PEM).
 * @param {'auto'|'JWK'|'JWKS'|'PEM'} [selectedMode='auto'] - Selected mode.
 * @returns {Promise<{mode: string, detectedMode: string, keys: Array<object>, error: string|null}>}
 */
export async function parseAndValidateInput(input, selectedMode = 'auto') {
  const trimmed = (input || '').trim();
  if (!trimmed) {
    return {
      mode: selectedMode === 'auto' ? 'NONE' : selectedMode,
      detectedMode: 'NONE',
      keys: [],
      error: null,
    };
  }

  let detectedMode = 'JWK';
  if (trimmed.startsWith('-----BEGIN')) {
    detectedMode = 'PEM';
  } else if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && Array.isArray(parsed.keys)) {
        detectedMode = 'JWKS';
      } else {
        detectedMode = 'JWK';
      }
    } catch {
      detectedMode = 'JWK';
    }
  }

  const activeMode = selectedMode === 'auto' ? detectedMode : selectedMode;

  if (activeMode === 'PEM') {
    try {
      const jwk = await convertPemToJwk(trimmed);
      const validation = validateJwk(jwk);
      let thumbprint = null;
      try {
        thumbprint = await computeJwkThumbprint(jwk);
      } catch {
        // Ignore thumbprint calculation error for invalid key
      }
      const summary = summarizeJwk(jwk);
      return {
        mode: activeMode,
        detectedMode,
        keys: [
          {
            index: 0,
            originalKey: trimmed,
            jwk,
            pem: trimmed,
            validation,
            thumbprint,
            summary,
          },
        ],
        error: null,
      };
    } catch (err) {
      return {
        mode: activeMode,
        detectedMode,
        keys: [],
        error: `PEM Parse Error: ${err.message}`,
      };
    }
  }

  let parsedJson;
  try {
    parsedJson = JSON.parse(trimmed);
  } catch (err) {
    return {
      mode: activeMode,
      detectedMode,
      keys: [],
      error: `JSON Syntax Error: ${err.message}`,
    };
  }

  let keyList = [];
  if (activeMode === 'JWKS') {
    if (parsedJson && Array.isArray(parsedJson.keys)) {
      keyList = parsedJson.keys;
    } else {
      return {
        mode: activeMode,
        detectedMode,
        keys: [],
        error: 'Invalid JWKS format: Object must contain a "keys" array.',
      };
    }
  } else {
    keyList = [parsedJson];
  }

  const keys = await Promise.all(
    keyList.map(async (keyObj, index) => {
      const validation = validateJwk(keyObj);
      let thumbprint = null;
      if (validation.isValid) {
        try {
          thumbprint = await computeJwkThumbprint(keyObj);
        } catch {
          // Ignore thumbprint calculation error
        }
      }

      let pem = null;
      let pemError = null;
      if (validation.isValid && keyObj.kty !== 'oct') {
        try {
          pem = await convertJwkToPem(keyObj);
        } catch (err) {
          pemError = err.message;
        }
      } else if (keyObj.kty === 'oct') {
        pemError = 'Symmetric keys (oct) do not have a PEM public key representation.';
      }

      const summary = summarizeJwk(keyObj);

      return {
        index,
        originalKey: keyObj,
        jwk: keyObj,
        validation,
        thumbprint,
        summary,
        pem,
        pemError,
      };
    })
  );

  return {
    mode: activeMode,
    detectedMode,
    keys,
    error: null,
  };
}
