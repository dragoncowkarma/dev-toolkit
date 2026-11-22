const HEADER_SIZE = 512;
const CHECKSUM_OFFSET = 508;
const FILETIME_UNIX_EPOCH_OFFSET_MS = 11644473600000n;
const FILETIME_TICKS_PER_MS = 10000n;

function asBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  throw new TypeError('REGF input must be an ArrayBuffer or byte array.');
}

function formatHex(value) {
  return `0x${value.toString(16).toUpperCase().padStart(8, '0')}`;
}

function parseFiletime(view) {
  const low = BigInt(view.getUint32(12, true));
  const high = BigInt(view.getUint32(16, true));
  const ticks = (high << 32n) | low;
  if (ticks === 0n) return { raw: '0', utc: 'Not set' };

  const unixMilliseconds = ticks / FILETIME_TICKS_PER_MS - FILETIME_UNIX_EPOCH_OFFSET_MS;
  const milliseconds = Number(unixMilliseconds);
  const date = new Date(milliseconds);
  return {
    raw: ticks.toString(),
    utc: Number.isFinite(milliseconds) && !Number.isNaN(date.getTime())
      ? date.toISOString()
      : 'Out of supported date range',
  };
}

function parseHiveName(view) {
  const codeUnits = [];
  for (let offset = 48; offset < 112; offset += 2) {
    const codeUnit = view.getUint16(offset, true);
    if (codeUnit === 0) break;
    codeUnits.push(codeUnit);
  }
  if (codeUnits.length === 0) return null;

  for (let index = 0; index < codeUnits.length; index += 1) {
    const codeUnit = codeUnits[index];
    if (codeUnit < 0x20 || (codeUnit >= 0x7F && codeUnit <= 0x9F)) return null;
    if (codeUnit >= 0xD800 && codeUnit <= 0xDBFF) {
      const trailing = codeUnits[index + 1];
      if (trailing === undefined || trailing < 0xDC00 || trailing > 0xDFFF) return null;
      index += 1;
    } else if (codeUnit >= 0xDC00 && codeUnit <= 0xDFFF) {
      return null;
    }
  }

  const text = String.fromCharCode(...codeUnits);
  return text;
}

/**
 * Computes the REGF header XOR-32 checksum over bytes 0 through 507.
 *
 * @param {ArrayBuffer|ArrayBufferView} input - Bytes containing a REGF header.
 * @returns {number} The unsigned 32-bit checksum.
 */
export function computeRegfChecksum(input) {
  const bytes = asBytes(input);
  if (bytes.byteLength < CHECKSUM_OFFSET) {
    throw new Error('At least 508 bytes are required to compute the REGF checksum.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, CHECKSUM_OFFSET);
  let checksum = 0;
  for (let offset = 0; offset < CHECKSUM_OFFSET; offset += 4) {
    checksum = (checksum ^ view.getUint32(offset, true)) >>> 0;
  }
  return checksum;
}

/**
 * Parses only the fixed 512-byte REGF base block header.
 *
 * @param {ArrayBuffer|ArrayBufferView} input - Registry hive bytes.
 * @returns {object} Parsed fixed-header metadata and checksum validation state.
 */
export function parseRegfHeader(input) {
  const bytes = asBytes(input);
  if (bytes.byteLength < HEADER_SIZE) {
    throw new Error(`Truncated REGF header: expected at least 512 bytes, got ${bytes.byteLength}.`);
  }

  const header = bytes.subarray(0, HEADER_SIZE);
  const magic = String.fromCharCode(...header.subarray(0, 4));
  if (magic !== 'regf') {
    throw new Error('Invalid REGF signature: expected "regf" at offset 0.');
  }

  const view = new DataView(header.buffer, header.byteOffset, HEADER_SIZE);
  const sequence1 = view.getUint32(4, true);
  const sequence2 = view.getUint32(8, true);
  const declaredChecksum = view.getUint32(CHECKSUM_OFFSET, true);
  const computedChecksum = computeRegfChecksum(header);

  return {
    magic,
    sequence1,
    sequence2,
    sequencesMatch: sequence1 === sequence2,
    lastWritten: parseFiletime(view),
    majorVersion: view.getUint32(20, true),
    minorVersion: view.getUint32(24, true),
    fileType: view.getUint32(28, true),
    fileFormat: view.getUint32(32, true),
    rootCellOffset: view.getUint32(36, true),
    hiveBinDataSize: view.getUint32(40, true),
    hiveName: parseHiveName(view),
    declaredChecksum,
    computedChecksum,
    checksumMatches: declaredChecksum === computedChecksum,
    declaredChecksumHex: formatHex(declaredChecksum),
    computedChecksumHex: formatHex(computedChecksum),
  };
}

/**
 * Converts hexadecimal text to bytes.
 *
 * @param {string} value - Hexadecimal text with optional whitespace.
 * @returns {Uint8Array} Decoded bytes.
 */
export function decodeHex(value) {
  const cleaned = value.replace(/\s/g, '');
  if (cleaned.length === 0) throw new Error('Enter hexadecimal REGF header data.');
  if (cleaned.length % 2 !== 0 || !/^[0-9a-f]+$/iu.test(cleaned)) {
    throw new Error('Invalid hexadecimal input. Use complete byte pairs (00-FF).');
  }
  return Uint8Array.from(cleaned.match(/.{2}/gu), (pair) => Number.parseInt(pair, 16));
}

/**
 * Converts Base64 text to bytes.
 *
 * @param {string} value - Base64 text with optional whitespace.
 * @returns {Uint8Array} Decoded bytes.
 */
export function decodeBase64(value) {
  const cleaned = value.replace(/\s/g, '');
  if (cleaned.length === 0) throw new Error('Enter Base64 REGF header data.');
  if (cleaned.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(cleaned)) {
    throw new Error('Invalid Base64 input.');
  }
  try {
    return Uint8Array.from(atob(cleaned), (character) => character.charCodeAt(0));
  } catch {
    throw new Error('Invalid Base64 input.');
  }
}
