export const VMDK_HEADER_SIZE = 512;
export const VMDK_SECTOR_SIZE = 512n;
export const VMDK_MAGIC_NUMBER = 0x564d444b;
export const VMDK_MAGIC_ASCII = 'KDMV';
export const VMDK_GD_AT_END = 0xffffffffffffffffn;
export const VMDK_PADDING_SIZE = 433;

export const VMDK_COMPRESS_ALGORITHMS = Object.freeze({
  0: 'None',
  1: 'DEFLATE',
});

export const VMDK_FLAG_DEFINITIONS = Object.freeze([
  {
    bit: 0,
    mask: 0x00000001,
    name: 'Valid New-Line Detection',
    description: 'Line-ending detection bytes are validated for ASCII transfer corruption.',
  },
  {
    bit: 1,
    mask: 0x00000002,
    name: 'Redundant Grain Table',
    description: 'A redundant grain directory and grain tables are maintained.',
  },
  {
    bit: 2,
    mask: 0x00000004,
    name: 'Zeroed-Grain GTE',
    description: 'Zeroed-grain table entries are used (version 2+).',
  },
  {
    bit: 16,
    mask: 0x00010000,
    name: 'Compressed Grains',
    description: 'Data grains are compressed using compressAlgorithm.',
  },
  {
    bit: 17,
    mask: 0x00020000,
    name: 'Stream Markers',
    description: 'Metadata markers are embedded in the extent stream.',
  },
]);

const KNOWN_FLAGS_MASK = VMDK_FLAG_DEFINITIONS.reduce((mask, flag) => mask | flag.mask, 0);
const BASE64_CHAR_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const HEX_ONLY_PATTERN = /^[0-9a-fA-F]+$/;

/**
 * Bounded binary reader over a Uint8Array that verifies remaining byte bounds
 * via `ensure()` before every read.
 */
export class ByteReader {
  /**
   * @param {Uint8Array} bytes Source byte buffer.
   */
  constructor(bytes) {
    if (!(bytes instanceof Uint8Array)) {
      throw new TypeError('ByteReader requires a Uint8Array.');
    }
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.offset = 0;
    this.byteLength = bytes.byteLength;
  }

  /**
   * Ensures at least `byteCount` unread bytes remain from the current offset.
   *
   * @param {number} byteCount Number of bytes required.
   * @throws {RangeError} When reading `byteCount` bytes would exceed buffer bounds.
   */
  ensure(byteCount) {
    if (!Number.isInteger(byteCount) || byteCount < 0) {
      throw new RangeError(`Invalid read length: ${byteCount}.`);
    }
    if (this.offset + byteCount > this.byteLength) {
      throw new RangeError(
        `Unexpected end of input at offset ${this.offset}: ` +
          `needed ${byteCount} byte(s), only ${this.byteLength - this.offset} remaining.`,
      );
    }
  }

  /**
   * Reads an unsigned 8-bit integer and advances the offset by 1 byte.
   *
   * @returns {number}
   */
  readUint8() {
    this.ensure(1);
    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  /**
   * Reads a little-endian unsigned 16-bit integer and advances by 2 bytes.
   *
   * @returns {number}
   */
  readUint16LE() {
    this.ensure(2);
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  /**
   * Reads a little-endian unsigned 32-bit integer and advances by 4 bytes.
   *
   * @returns {number}
   */
  readUint32LE() {
    this.ensure(4);
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  /**
   * Reads a little-endian unsigned 64-bit integer as BigInt and advances by 8 bytes.
   *
   * @returns {bigint}
   */
  readUint64LE() {
    this.ensure(8);
    const value = this.view.getBigUint64(this.offset, true);
    this.offset += 8;
    return value;
  }

  /**
   * Reads `length` raw bytes as a subarray view and advances the offset.
   *
   * @param {number} length Number of bytes to read.
   * @returns {Uint8Array}
   */
  readBytes(length) {
    this.ensure(length);
    const slice = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }
}

/**
 * Formats a number or BigInt as a fixed-width uppercase hexadecimal string with `0x` prefix.
 *
 * @param {number|bigint} value Unsigned integer value.
 * @param {number} digits Minimum hex digit count.
 * @returns {string}
 */
export function formatHex(value, digits = 8) {
  const normalized = typeof value === 'bigint' ? value : BigInt(value >>> 0);
  return `0x${normalized.toString(16).toUpperCase().padStart(digits, '0')}`;
}

/**
 * Formats a byte count (number or BigInt) into a human-readable binary unit string.
 *
 * @param {number|bigint} bytes Byte count.
 * @returns {string}
 */
export function formatByteSize(bytes) {
  const bigBytes = typeof bytes === 'bigint' ? bytes : BigInt(Math.max(0, Math.floor(bytes)));
  if (bigBytes < 1024n) {
    return `${bigBytes.toString()} B`;
  }
  const units = ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB'];
  let divisor = 1024n;
  let unitIndex = 0;
  while (bigBytes >= divisor * 1024n && unitIndex < units.length - 1) {
    divisor *= 1024n;
    unitIndex += 1;
  }
  const scaled = (bigBytes * 100n) / divisor;
  const whole = scaled / 100n;
  const frac = (scaled % 100n).toString().padStart(2, '0');
  return `${whole.toString()}.${frac} ${units[unitIndex]}`;
}

/**
 * Converts up to 4 raw bytes into a printable ASCII string, replacing non-printable bytes with `.`.
 *
 * @param {Uint8Array} bytes Raw bytes.
 * @returns {string}
 */
function bytesToPrintableAscii(bytes) {
  let result = '';
  for (const byte of bytes) {
    result += byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : '.';
  }
  return result;
}

/**
 * Decodes a raw hex string (tolerating spaces, newlines, commas, colons, hyphens, and 0x prefixes)
 * into a Uint8Array without throwing.
 *
 * @param {string} rawHex Hexadecimal input string.
 * @returns {{ ok: true, bytes: Uint8Array } | { ok: false, error: string }}
 */
export function decodeHexToBytes(rawHex) {
  if (typeof rawHex !== 'string') {
    return { ok: false, error: 'Hex input must be a string.' };
  }
  const stripped = rawHex
    .replace(/0[xX](?=[0-9a-fA-F])/g, '')
    .replace(/[\s,:-]+/g, '');

  if (stripped.length === 0) {
    return { ok: false, error: 'Hex input is empty. Paste at least 512 bytes (1024 hex chars).' };
  }
  if (!HEX_ONLY_PATTERN.test(stripped)) {
    return { ok: false, error: 'Invalid hex input: contains non-hexadecimal characters.' };
  }
  if (stripped.length % 2 !== 0) {
    return {
      ok: false,
      error: 'Invalid hex input: expected an even number of hexadecimal characters.',
    };
  }

  const bytes = new Uint8Array(stripped.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(stripped.slice(i * 2, i * 2 + 2), 16);
  }
  return { ok: true, bytes };
}

/**
 * Decodes a Base64 (standard or URL-safe) string into a Uint8Array without throwing.
 *
 * @param {string} rawBase64 Base64 input string.
 * @returns {{ ok: true, bytes: Uint8Array } | { ok: false, error: string }}
 */
export function decodeBase64ToBytes(rawBase64) {
  if (typeof rawBase64 !== 'string') {
    return { ok: false, error: 'Base64 input must be a string.' };
  }
  let cleaned = rawBase64.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (cleaned.length === 0) {
    return { ok: false, error: 'Base64 input is empty. Paste a Base64-encoded VMDK header.' };
  }
  if (cleaned.length % 4 === 1) {
    return { ok: false, error: 'Invalid Base64 input: length cannot be 1 modulo 4.' };
  }
  if (cleaned.length % 4 !== 0) {
    cleaned = cleaned.padEnd(cleaned.length + (4 - (cleaned.length % 4)), '=');
  }
  if (!BASE64_CHAR_PATTERN.test(cleaned)) {
    return { ok: false, error: 'Invalid Base64 input: contains unsupported characters.' };
  }

  try {
    const binary = atob(cleaned);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return { ok: true, bytes };
  } catch {
    return { ok: false, error: 'Invalid Base64 input: failed to decode byte stream.' };
  }
}

/**
 * Reads only the first 512 bytes of a File/Blob without loading grain data into memory.
 *
 * @param {File|Blob} file Uploaded file.
 * @returns {Promise<{ ok: true, bytes: Uint8Array, totalFileSize: number }
 *   | { ok: false, error: string }>}
 */
export function readHeaderBytesFromFile(file) {
  if (!file || typeof file.slice !== 'function') {
    return Promise.resolve({ ok: false, error: 'No readable file was provided.' });
  }
  const headerSlice = file.slice(0, VMDK_HEADER_SIZE);
  const totalFileSize = typeof file.size === 'number' ? file.size : headerSlice.size;

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const buffer = reader.result;
      if (!(buffer instanceof ArrayBuffer)) {
        resolve({ ok: false, error: 'Failed to read binary bytes from the selected file.' });
        return;
      }
      resolve({ ok: true, bytes: new Uint8Array(buffer), totalFileSize });
    };
    reader.onerror = () => {
      resolve({ ok: false, error: 'Failed to read the selected file.' });
    };
    reader.readAsArrayBuffer(headerSlice);
  });
}

/**
 * Decodes the VMDK flags bitmask into named flag states and any unknown set bits.
 *
 * @param {number} flags Unsigned 32-bit flags field.
 * @returns {{ flags: Array<object>, unknownBits: number }}
 */
export function decodeVmdkFlags(flags) {
  const unsigned = flags >>> 0;
  const decoded = VMDK_FLAG_DEFINITIONS.map((def) => ({
    ...def,
    enabled: (unsigned & def.mask) !== 0,
  }));
  const unknownBits = (unsigned & ~KNOWN_FLAGS_MASK) >>> 0;
  return { flags: decoded, unknownBits };
}

/**
 * Parses and validates a 512-byte VMware VMDK sparse extent header.
 * Never throws; returns a discriminated `{ ok, header | error }` result.
 *
 * @param {Uint8Array|ArrayBuffer} input Raw bytes starting at offset 0 of the sparse extent.
 * @returns {{ ok: true, header: object } | { ok: false, error: string }}
 */
export function parseVmdkHeader(input) {
  try {
    let bytes;
    if (input instanceof Uint8Array) {
      bytes = input;
    } else if (input instanceof ArrayBuffer) {
      bytes = new Uint8Array(input);
    } else {
      return { ok: false, error: 'Invalid input: expected a Uint8Array or ArrayBuffer.' };
    }

    if (bytes.byteLength < VMDK_HEADER_SIZE) {
      return {
        ok: false,
        error:
          `Input is too short: expected at least ${VMDK_HEADER_SIZE} bytes ` +
          `for a VMDK sparse extent header, got ${bytes.byteLength} bytes.`,
      };
    }

    const reader = new ByteReader(bytes);
    const magicNumber = reader.readUint32LE();
    const magicAscii = bytesToPrintableAscii(bytes.subarray(0, 4));

    if (magicNumber !== VMDK_MAGIC_NUMBER) {
      return {
        ok: false,
        error:
          `Invalid VMDK magic number: expected ${formatHex(VMDK_MAGIC_NUMBER, 8)} ` +
          `("${VMDK_MAGIC_ASCII}"), got ${formatHex(magicNumber, 8)} ("${magicAscii}").`,
      };
    }

    const version = reader.readUint32LE();
    const flags = reader.readUint32LE();
    const capacity = reader.readUint64LE();
    const grainSize = reader.readUint64LE();
    const descriptorOffset = reader.readUint64LE();
    const descriptorSize = reader.readUint64LE();
    const numGTEsPerGT = reader.readUint32LE();
    const rgdOffset = reader.readUint64LE();
    const gdOffset = reader.readUint64LE();
    const overHead = reader.readUint64LE();
    const uncleanShutdownRaw = reader.readUint8();
    const singleEndLineChar = reader.readUint8();
    const nonEndLineChar = reader.readUint8();
    const doubleEndLineChar1 = reader.readUint8();
    const doubleEndLineChar2 = reader.readUint8();
    const compressAlgorithm = reader.readUint16LE();
    const padding = reader.readBytes(VMDK_PADDING_SIZE);

    let nonZeroPaddingBytes = 0;
    for (let i = 0; i < padding.length; i += 1) {
      if (padding[i] !== 0) {
        nonZeroPaddingBytes += 1;
      }
    }

    const { flags: decodedFlags, unknownBits: unknownFlagBits } = decodeVmdkFlags(flags);
    const isGdAtEnd = gdOffset === VMDK_GD_AT_END;
    const lineEndingsValid =
      singleEndLineChar === 0x0a &&
      nonEndLineChar === 0x20 &&
      doubleEndLineChar1 === 0x0d &&
      doubleEndLineChar2 === 0x0a;
    const grainTableCoverageSectors = grainSize * BigInt(numGTEsPerGT);

    return {
      ok: true,
      header: {
        headerSize: VMDK_HEADER_SIZE,
        inspectedBytes: bytes.byteLength,
        magicNumber,
        magicHex: formatHex(magicNumber, 8),
        magicAscii,
        version,
        flags,
        flagsHex: formatHex(flags, 8),
        decodedFlags,
        unknownFlagBits,
        capacity,
        capacityBytes: capacity * VMDK_SECTOR_SIZE,
        grainSize,
        grainSizeBytes: grainSize * VMDK_SECTOR_SIZE,
        descriptorOffset,
        descriptorOffsetBytes: descriptorOffset * VMDK_SECTOR_SIZE,
        descriptorSize,
        descriptorSizeBytes: descriptorSize * VMDK_SECTOR_SIZE,
        numGTEsPerGT,
        grainTableCoverageSectors,
        grainTableCoverageBytes: grainTableCoverageSectors * VMDK_SECTOR_SIZE,
        rgdOffset,
        rgdOffsetBytes: rgdOffset * VMDK_SECTOR_SIZE,
        gdOffset,
        gdOffsetHex: formatHex(gdOffset, 16),
        isGdAtEnd,
        gdOffsetBytes: isGdAtEnd ? null : gdOffset * VMDK_SECTOR_SIZE,
        overHead,
        overHeadBytes: overHead * VMDK_SECTOR_SIZE,
        uncleanShutdownRaw,
        uncleanShutdown: uncleanShutdownRaw !== 0,
        singleEndLineChar,
        nonEndLineChar,
        doubleEndLineChar1,
        doubleEndLineChar2,
        lineEndingsValid,
        compressAlgorithm,
        compressAlgorithmName:
          VMDK_COMPRESS_ALGORITHMS[compressAlgorithm] ?? `Unknown (${compressAlgorithm})`,
        nonZeroPaddingBytes,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to parse VMDK sparse extent header.',
    };
  }
}

/**
 * Parses raw text input (either `'hex'` or `'base64'`) and inspects the VMDK sparse header.
 *
 * @param {string} text Raw text input.
 * @param {'hex'|'base64'} format Input encoding format.
 * @returns {{ ok: true, header: object } | { ok: false, error: string }}
 */
export function inspectVmdkText(text, format) {
  const decoded = format === 'base64' ? decodeBase64ToBytes(text) : decodeHexToBytes(text);
  if (!decoded.ok) {
    return decoded;
  }
  return parseVmdkHeader(decoded.bytes);
}

/**
 * Builds a valid 512-byte VMDK sparse extent header buffer for samples and tests.
 *
 * @param {object} [overrides] Optional field overrides.
 * @returns {Uint8Array}
 */
export function buildSampleVmdkHeader(overrides = {}) {
  const bytes = new Uint8Array(VMDK_HEADER_SIZE);
  const view = new DataView(bytes.buffer);
  const cfg = {
    magicNumber: VMDK_MAGIC_NUMBER,
    version: 1,
    flags: 0x00000003,
    capacity: 20971520n,
    grainSize: 128n,
    descriptorOffset: 1n,
    descriptorSize: 20n,
    numGTEsPerGT: 512,
    rgdOffset: 21n,
    gdOffset: 128n,
    overHead: 256n,
    uncleanShutdown: 0,
    singleEndLineChar: 0x0a,
    nonEndLineChar: 0x20,
    doubleEndLineChar1: 0x0d,
    doubleEndLineChar2: 0x0a,
    compressAlgorithm: 0,
    ...overrides,
  };

  view.setUint32(0, cfg.magicNumber >>> 0, true);
  view.setUint32(4, cfg.version >>> 0, true);
  view.setUint32(8, cfg.flags >>> 0, true);
  view.setBigUint64(12, BigInt(cfg.capacity), true);
  view.setBigUint64(20, BigInt(cfg.grainSize), true);
  view.setBigUint64(28, BigInt(cfg.descriptorOffset), true);
  view.setBigUint64(36, BigInt(cfg.descriptorSize), true);
  view.setUint32(44, cfg.numGTEsPerGT >>> 0, true);
  view.setBigUint64(48, BigInt(cfg.rgdOffset), true);
  view.setBigUint64(56, BigInt(cfg.gdOffset), true);
  view.setBigUint64(64, BigInt(cfg.overHead), true);
  view.setUint8(72, cfg.uncleanShutdown & 0xff);
  view.setUint8(73, cfg.singleEndLineChar & 0xff);
  view.setUint8(74, cfg.nonEndLineChar & 0xff);
  view.setUint8(75, cfg.doubleEndLineChar1 & 0xff);
  view.setUint8(76, cfg.doubleEndLineChar2 & 0xff);
  view.setUint16(77, cfg.compressAlgorithm & 0xffff, true);

  return bytes;
}

/**
 * Converts a Uint8Array into a space-separated uppercase hex string wrapped at 16 bytes per line.
 *
 * @param {Uint8Array} bytes Raw bytes.
 * @returns {string}
 */
export function bytesToHex(bytes) {
  const lines = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = [];
    for (let j = i; j < Math.min(i + 16, bytes.length); j += 1) {
      chunk.push(bytes[j].toString(16).toUpperCase().padStart(2, '0'));
    }
    lines.push(chunk.join(' '));
  }
  return lines.join('\n');
}

/**
 * Converts a Uint8Array into a Base64-encoded string.
 *
 * @param {Uint8Array} bytes Raw bytes.
 * @returns {string}
 */
export function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Formats a parsed VMDK header into a copyable plain-text JSON summary.
 *
 * @param {object} header Parsed header returned by `parseVmdkHeader`.
 * @returns {string}
 */
export function formatHeaderSummary(header) {
  const activeFlags = header.decodedFlags
    .filter((flag) => flag.enabled)
    .map((flag) => flag.name);

  return JSON.stringify(
    {
      magicNumber: `${header.magicHex} (${header.magicAscii})`,
      version: header.version,
      flags: header.flagsHex,
      activeFlags,
      capacitySectors: header.capacity.toString(),
      capacityFormatted: formatByteSize(header.capacityBytes),
      grainSizeSectors: header.grainSize.toString(),
      grainSizeFormatted: formatByteSize(header.grainSizeBytes),
      descriptorOffsetSectors: header.descriptorOffset.toString(),
      descriptorSizeSectors: header.descriptorSize.toString(),
      numGTEsPerGT: header.numGTEsPerGT,
      rgdOffsetSectors: header.rgdOffset.toString(),
      gdOffsetSectors: header.isGdAtEnd
        ? 'GD_AT_END (0xFFFFFFFFFFFFFFFF)'
        : header.gdOffset.toString(),
      overHeadSectors: header.overHead.toString(),
      uncleanShutdown: header.uncleanShutdown,
      compressAlgorithm: `${header.compressAlgorithm} (${header.compressAlgorithmName})`,
      lineEndingsValid: header.lineEndingsValid,
      nonZeroPaddingBytes: header.nonZeroPaddingBytes,
    },
    null,
    2,
  );
}
