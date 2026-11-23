/**
 * Compression level descriptions for Deflate (CM = 8) per RFC 1950.
 */
export const FLEVEL_NAMES = Object.freeze({
  0: 'fastest',
  1: 'fast',
  2: 'default',
  3: 'maximum',
});

/**
 * Strips whitespace, 0x prefixes, and delimiters from a hex string
 * and parses it into a Uint8Array.
 *
 * @param {string} hex - The hex string to parse.
 * @returns {Uint8Array} The decoded byte array.
 * @throws {TypeError} If the input is not a string.
 * @throws {Error} If the string contains invalid characters or an odd number of digits.
 */
export function hexToBytes(hex) {
  if (typeof hex !== 'string') {
    throw new TypeError('Input must be a string.');
  }

  const cleaned = hex.trim();
  if (cleaned.length === 0) {
    return new Uint8Array(0);
  }

  const sanitized = cleaned
    .replace(/0x/gi, '')
    .replace(/[\s,;:\-_]+/g, '');

  if (!/^[0-9a-fA-F]*$/.test(sanitized)) {
    throw new Error('Input contains invalid hexadecimal characters.');
  }

  if (sanitized.length % 2 !== 0) {
    throw new Error('Hex string must have an even number of digits.');
  }

  const byteLength = sanitized.length / 2;
  const bytes = new Uint8Array(byteLength);
  for (let i = 0; i < byteLength; i += 1) {
    bytes[i] = parseInt(sanitized.substring(i * 2, i * 2 + 2), 16);
  }

  return bytes;
}

/**
 * Formats a byte array as space-separated uppercase hex bytes.
 *
 * @param {Uint8Array|Array<number>} bytes
 * @returns {string}
 */
export function bytesToHex(bytes) {
  if (!bytes || typeof bytes.length !== 'number') {
    return '';
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');
}

/**
 * Formats a byte array into a traditional formatted hex dump.
 * Displays offset, hex representation, and printable ASCII.
 *
 * @param {Uint8Array|Array<number>} input - The byte array to format.
 * @returns {string} Formatted hex dump text.
 */
export function formatHexDump(input) {
  if (!input || input.length === 0) {
    return '';
  }
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const lines = [];

  for (let offset = 0; offset < bytes.length; offset += 16) {
    const chunk = bytes.slice(offset, offset + 16);
    const offsetHex = offset.toString(16).padStart(8, '0');

    const hexParts = [];
    for (let i = 0; i < 16; i += 1) {
      if (i < chunk.length) {
        hexParts.push(chunk[i].toString(16).padStart(2, '0').toUpperCase());
      } else {
        hexParts.push('  ');
      }
    }
    const hexString = `${hexParts.slice(0, 8).join(' ')}  ${hexParts.slice(8).join(' ')}`;

    let asciiString = '';
    for (let i = 0; i < chunk.length; i += 1) {
      const code = chunk[i];
      asciiString += code >= 32 && code <= 126 ? String.fromCharCode(code) : '.';
    }

    lines.push(`${offsetHex}  ${hexString}  |${asciiString}|`);
  }

  return lines.join('\n');
}

/**
 * Parses and validates an RFC 1950 zlib stream header from binary data.
 *
 * @param {Uint8Array|ArrayBuffer|Array<number>} input - Buffer containing zlib data.
 * @returns {{
 *   ok: boolean,
 *   error?: string,
 *   cmf?: number,
 *   flg?: number,
 *   compressionMethod?: string,
 *   compressionMethodId?: number,
 *   cinfo?: number,
 *   windowSize?: number|null,
 *   windowBits?: number|null,
 *   fcheck?: number,
 *   fcheckValid?: boolean,
 *   fdict?: boolean,
 *   dictId?: string|null,
 *   dictIdNumber?: number|null,
 *   flevel?: string,
 *   flevelValue?: number,
 *   adler32?: string|null,
 *   adler32Number?: number|null,
 *   headerLength?: number,
 *   totalBytes?: number
 * }} Parsing result object. Never throws.
 */
export function parseZlibHeader(input) {
  if (!input) {
    return { ok: false, error: 'No data provided to parse.' };
  }

  let buffer;
  if (input instanceof Uint8Array) {
    buffer = input;
  } else if (input instanceof ArrayBuffer) {
    buffer = new Uint8Array(input);
  } else if (Array.isArray(input)) {
    buffer = new Uint8Array(input);
  } else {
    return {
      ok: false,
      error: 'Invalid input type: expected Uint8Array, ArrayBuffer, or Array of bytes.',
    };
  }

  if (buffer.length < 2) {
    return {
      ok: false,
      error: `Truncated buffer: expected at least 2 bytes for zlib header, got ${buffer.length}.`,
    };
  }

  const cmf = buffer[0];
  const flg = buffer[1];

  const cm = cmf & 0x0f;
  const cinfo = (cmf >> 4) & 0x0f;

  const compressionMethod = cm === 8 ? 'deflate' : `unknown (${cm})`;
  let windowSize = null;
  let windowBits = null;

  if (cm === 8) {
    if (cinfo <= 7) {
      windowBits = cinfo + 8;
      windowSize = 2 ** windowBits;
    } else {
      return {
        ok: false,
        error: `Invalid CINFO value: ${cinfo}. ` +
          'RFC 1950 specifies CINFO cannot exceed 7 for Deflate.',
        cmf,
        flg,
        compressionMethod,
        compressionMethodId: cm,
        cinfo,
      };
    }
  }

  const fcheck = flg & 0x1f;
  const headerCheck = cmf * 256 + flg;
  const isFcheckValid = headerCheck % 31 === 0;

  const fdict = Boolean((flg >> 5) & 1);
  const flevelValue = (flg >> 6) & 3;
  const flevel = FLEVEL_NAMES[flevelValue] ?? `unknown (${flevelValue})`;

  if (!isFcheckValid) {
    return {
      ok: false,
      error: `Invalid FCHECK: (CMF*256 + FLG) % 31 must equal 0, but (${cmf}*256 + ${flg}) % 31 = ${
        headerCheck % 31
      }.`,
      fcheckValid: false,
      cmf,
      flg,
      compressionMethod,
      compressionMethodId: cm,
      cinfo,
      windowSize,
      windowBits,
      fcheck,
      fdict,
      flevel,
      flevelValue,
    };
  }

  const minHeaderLength = fdict ? 6 : 2;
  if (fdict && buffer.length < minHeaderLength) {
    return {
      ok: false,
      error: 'Truncated buffer: FDICT flag is set, ' +
        `but buffer is too short for 4-byte DICTID (got ${buffer.length} bytes).`,
      fcheckValid: true,
      cmf,
      flg,
      compressionMethod,
      compressionMethodId: cm,
      cinfo,
      windowSize,
      windowBits,
      fcheck,
      fdict: true,
      flevel,
      flevelValue,
    };
  }

  let dictId = null;
  let dictIdNumber = null;
  if (fdict) {
    const dictBytes = buffer.slice(2, 6);
    dictIdNumber =
      ((dictBytes[0] << 24) >>> 0) +
      (dictBytes[1] << 16) +
      (dictBytes[2] << 8) +
      dictBytes[3];
    dictId = `0x${Array.from(dictBytes)
      .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
      .join('')}`;
  }

  let adler32 = null;
  let adler32Number = null;
  if (buffer.length >= minHeaderLength + 4) {
    const adlerBytes = buffer.slice(buffer.length - 4);
    adler32Number =
      ((adlerBytes[0] << 24) >>> 0) +
      (adlerBytes[1] << 16) +
      (adlerBytes[2] << 8) +
      adlerBytes[3];
    adler32 = `0x${Array.from(adlerBytes)
      .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
      .join('')}`;
  }

  return {
    ok: true,
    error: null,
    cmf,
    flg,
    compressionMethod,
    compressionMethodId: cm,
    cinfo,
    windowSize,
    windowBits,
    fcheck,
    fcheckValid: true,
    fdict,
    dictId,
    dictIdNumber,
    flevel,
    flevelValue,
    adler32,
    adler32Number,
    headerLength: minHeaderLength,
    totalBytes: buffer.length,
  };
}

/**
 * Safely parses zlib header information from a user-provided hex string.
 *
 * @param {string} hexString - Space/comma-separated or continuous hex string.
 * @returns {ReturnType<typeof parseZlibHeader>} Parsed result or failure object.
 */
export function parseZlibFromHex(hexString) {
  try {
    const bytes = hexToBytes(hexString);
    if (bytes.length === 0) {
      return { ok: false, error: 'Please enter hex bytes to inspect.' };
    }
    return parseZlibHeader(bytes);
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
