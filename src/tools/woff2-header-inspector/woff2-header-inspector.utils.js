/**
 * Helper class for sequential, bounded reads from a binary Uint8Array.
 */
export class ByteReader {
  /**
   * @param {Uint8Array} bytes
   */
  constructor(bytes) {
    if (!(bytes instanceof Uint8Array)) {
      throw new TypeError('ByteReader requires a Uint8Array instance.');
    }
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.offset = 0;
  }

  /**
   * Total length in bytes.
   * @returns {number}
   */
  get length() {
    return this.bytes.length;
  }

  /**
   * Remaining unread bytes.
   * @returns {number}
   */
  get remaining() {
    return this.bytes.length - this.offset;
  }

  /**
   * Validates that at least `count` bytes remain to be read.
   * @param {number} count
   * @throws {Error} if bounds check fails
   */
  ensure(count) {
    if (this.offset + count > this.bytes.length) {
      throw new Error(
        `Unexpected end of data: needed ${count} byte(s) at offset ${this.offset}, ` +
          `but only ${this.remaining} byte(s) available.`,
      );
    }
  }

  /**
   * Reads an unsigned 8-bit integer.
   * @returns {number}
   */
  readUint8() {
    this.ensure(1);
    const val = this.view.getUint8(this.offset);
    this.offset += 1;
    return val;
  }

  /**
   * Reads an unsigned 16-bit integer in big-endian order.
   * @returns {number}
   */
  readUint16() {
    this.ensure(2);
    const val = this.view.getUint16(this.offset, false);
    this.offset += 2;
    return val;
  }

  /**
   * Reads an unsigned 32-bit integer in big-endian order.
   * @returns {number}
   */
  readUint32() {
    this.ensure(4);
    const val = this.view.getUint32(this.offset, false);
    this.offset += 4;
    return val;
  }

  /**
   * Reads a slice of bytes.
   * @param {number} count
   * @returns {Uint8Array}
   */
  readBytes(count) {
    this.ensure(count);
    const slice = this.bytes.subarray(this.offset, this.offset + count);
    this.offset += count;
    return slice;
  }

  /**
   * Reads a 4-character ASCII tag string.
   * @returns {string}
   */
  readTag() {
    this.ensure(4);
    let tag = '';
    for (let i = 0; i < 4; i += 1) {
      tag += String.fromCharCode(this.bytes[this.offset + i]);
    }
    this.offset += 4;
    return tag;
  }
}

export const WOFF2_SIGNATURE = 0x774f4632; // 'wOF2'
export const WOFF2_SIGNATURE_TAG = 'wOF2';
export const WOFF2_HEADER_SIZE = 48;

export const SAMPLE_WOFF2_HEX =
  '77 4F 46 32 00 01 00 00 00 00 00 30 00 01 00 00 ' +
  '00 00 01 00 00 00 00 20 00 01 00 00 00 00 00 00 ' +
  '00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00';

export const SAMPLE_WOFF2_BASE64 =
  'd09GMgABAAAAAAAwAAEAAAAAAQAAAAAgAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

/**
 * Formats a 32-bit flavor integer into a readable tag and human description.
 * @param {number} flavor
 * @returns {{ tag: string, description: string }}
 */
export function formatFlavor(flavor) {
  if (flavor === 0x00010000) {
    return {
      tag: '0x00010000',
      description: 'TrueType outlines (0x00010000)',
    };
  }
  if (flavor === 0x4f54544f) {
    return {
      tag: 'OTTO',
      description: 'OpenType font with CFF outlines (OTTO)',
    };
  }
  if (flavor === 0x74727565) {
    return {
      tag: 'true',
      description: 'Apple TrueType (true)',
    };
  }
  if (flavor === 0x74797031) {
    return {
      tag: 'typ1',
      description: 'PostScript Type 1 (typ1)',
    };
  }
  const b0 = (flavor >>> 24) & 0xff;
  const b1 = (flavor >>> 16) & 0xff;
  const b2 = (flavor >>> 8) & 0xff;
  const b3 = flavor & 0xff;
  const isPrintable = [b0, b1, b2, b3].every((c) => c >= 32 && c <= 126);
  if (isPrintable) {
    const tag = String.fromCharCode(b0, b1, b2, b3);
    return {
      tag,
      description: `Custom flavor (${tag})`,
    };
  }
  const hex = '0x' + flavor.toString(16).padStart(8, '0').toUpperCase();
  return {
    tag: hex,
    description: `Unknown flavor (${hex})`,
  };
}

/**
 * Formats a byte size into a human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (bytes == null || Number.isNaN(bytes)) return '0 B';
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

/**
 * Converts a hex string into a Uint8Array.
 * Tolerates whitespace, colons, commas, and optional '0x' prefixes.
 * @param {string} hex
 * @returns {Uint8Array}
 */
export function hexToBytes(hex) {
  if (typeof hex !== 'string') {
    throw new TypeError('Hex input must be a string.');
  }
  const cleaned = hex.replace(/0x|\s+|:|,/gi, '');
  if (cleaned.length === 0) {
    throw new Error('Hex input is empty.');
  }
  if (cleaned.length % 2 !== 0) {
    throw new Error('Hex string has an incomplete byte (odd number of characters).');
  }
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) {
    throw new Error('Hex string contains invalid characters.');
  }
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes[i / 2] = parseInt(cleaned.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Converts a Base64 string into a Uint8Array.
 * @param {string} base64
 * @returns {Uint8Array}
 */
export function base64ToBytes(base64) {
  if (typeof base64 !== 'string') {
    throw new TypeError('Base64 input must be a string.');
  }
  const cleaned = base64.replace(/\s+/g, '');
  if (cleaned.length === 0) {
    throw new Error('Base64 input is empty.');
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned) || cleaned.length % 4 !== 0) {
    throw new Error('Invalid Base64 input. Ensure correct padding and valid characters.');
  }
  try {
    const binary = atob(cleaned);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    throw new Error('Invalid Base64 input.');
  }
}

/**
 * Reads a File or Blob and resolves with a Uint8Array.
 * @param {File|Blob} file
 * @returns {Promise<Uint8Array>}
 */
export function fileToBytes(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(new Uint8Array(/** @type {ArrayBuffer} */ (reader.result)));
    };
    reader.onerror = () => reject(new Error('Failed to read the selected file.'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Generates a mock or minimal valid WOFF2 48-byte header Uint8Array.
 * @param {object} [options]
 * @returns {Uint8Array}
 */
export function createSampleWoff2Header({
  flavor = 0x00010000,
  length = 48,
  numTables = 1,
  reserved = 0,
  totalSfntSize = 256,
  totalCompressedSize = 32,
  majorVersion = 1,
  minorVersion = 0,
  metaOffset = 0,
  metaLength = 0,
  metaOrigLength = 0,
  privOffset = 0,
  privLength = 0,
} = {}) {
  const bytes = new Uint8Array(48);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, WOFF2_SIGNATURE);
  view.setUint32(4, flavor);
  view.setUint32(8, length);
  view.setUint16(12, numTables);
  view.setUint16(14, reserved);
  view.setUint32(16, totalSfntSize);
  view.setUint32(20, totalCompressedSize);
  view.setUint16(24, majorVersion);
  view.setUint16(26, minorVersion);
  view.setUint32(28, metaOffset);
  view.setUint32(32, metaLength);
  view.setUint32(36, metaOrigLength);
  view.setUint32(40, privOffset);
  view.setUint32(44, privLength);
  return bytes;
}

/**
 * Parses a 48-byte WOFF2 font header from a Uint8Array.
 * Bounded reads ensure no out-of-bounds exceptions occur.
 * @param {Uint8Array} bytes
 * @returns {object} Parsed header metadata and fields.
 */
export function parseWoff2Header(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError('Input must be a Uint8Array.');
  }

  if (bytes.length < WOFF2_HEADER_SIZE) {
    throw new Error(
      `Truncated header: expected at least ${WOFF2_HEADER_SIZE} bytes for a valid WOFF2 ` +
        `header, received ${bytes.length} byte(s).`,
    );
  }

  const reader = new ByteReader(bytes);

  const signature = reader.readUint32();
  const signatureTag = String.fromCharCode(
    (signature >>> 24) & 0xff,
    (signature >>> 16) & 0xff,
    (signature >>> 8) & 0xff,
    signature & 0xff,
  );

  if (signature !== WOFF2_SIGNATURE) {
    const hex = '0x' + signature.toString(16).padStart(8, '0').toUpperCase();
    if (signature === 0x774f4646) {
      throw new Error(
        `Invalid WOFF2 signature: expected "wOF2" (0x774F4632), but found "${signatureTag}" ` +
          `(${hex}). This is a WOFF 1.0 font, not WOFF2.`,
      );
    }
    const safeTag = /^[ -~]{4}$/.test(signatureTag) ? `"${signatureTag}"` : 'non-ASCII';
    throw new Error(
      `Invalid WOFF2 signature: expected "wOF2" (0x774F4632), received ${safeTag} (${hex}).`,
    );
  }

  const flavor = reader.readUint32();
  const length = reader.readUint32();
  const numTables = reader.readUint16();
  const reserved = reader.readUint16();
  const totalSfntSize = reader.readUint32();
  const totalCompressedSize = reader.readUint32();
  const majorVersion = reader.readUint16();
  const minorVersion = reader.readUint16();
  const metaOffset = reader.readUint32();
  const metaLength = reader.readUint32();
  const metaOrigLength = reader.readUint32();
  const privOffset = reader.readUint32();
  const privLength = reader.readUint32();

  const flavorInfo = formatFlavor(flavor);

  const warnings = [];
  if (reserved !== 0) {
    warnings.push(`Reserved field must be 0 per specification (found: ${reserved}).`);
  }
  if (bytes.length < length) {
    warnings.push(
      `File appears truncated: actual size is ${bytes.length} bytes, ` +
        `but header length field specifies ${length} bytes.`,
    );
  } else if (bytes.length > length) {
    warnings.push(
      `Trailing data detected: actual size is ${bytes.length} bytes, ` +
        `but header length field specifies ${length} bytes.`,
    );
  }
  if (metaLength > 0 && metaOffset === 0) {
    warnings.push(`Metadata block length is ${metaLength} bytes, but metaOffset is 0.`);
  }
  if (privLength > 0 && privOffset === 0) {
    warnings.push(`Private data length is ${privLength} bytes, but privOffset is 0.`);
  }

  const spaceSavings =
    totalSfntSize > 0 && length > 0
      ? Math.max(0, (1 - length / totalSfntSize) * 100).toFixed(1)
      : null;
  const compressionRatio =
    totalSfntSize > 0 && length > 0 ? (totalSfntSize / length).toFixed(2) : null;

  const toHex32 = (val) => '0x' + val.toString(16).padStart(8, '0').toUpperCase();
  const toHex16 = (val) => '0x' + val.toString(16).padStart(4, '0').toUpperCase();

  const fields = [
    {
      name: 'signature',
      offset: 0,
      size: 4,
      rawHex: toHex32(signature),
      interpreted: signatureTag,
      description: 'Magic number identifying WOFF2 ("wOF2")',
      valid: true,
    },
    {
      name: 'flavor',
      offset: 4,
      size: 4,
      rawHex: toHex32(flavor),
      interpreted: flavorInfo.tag,
      description: flavorInfo.description,
      valid: true,
    },
    {
      name: 'length',
      offset: 8,
      size: 4,
      rawHex: toHex32(length),
      interpreted: `${length} bytes (${formatBytes(length)})`,
      description: 'Total size of the WOFF2 file',
      valid: length >= WOFF2_HEADER_SIZE,
    },
    {
      name: 'numTables',
      offset: 12,
      size: 2,
      rawHex: toHex16(numTables),
      interpreted: `${numTables} table${numTables === 1 ? '' : 's'}`,
      description: 'Number of font tables',
      valid: numTables > 0,
    },
    {
      name: 'reserved',
      offset: 14,
      size: 2,
      rawHex: toHex16(reserved),
      interpreted: String(reserved),
      description: 'Reserved; must be set to 0',
      valid: reserved === 0,
    },
    {
      name: 'totalSfntSize',
      offset: 16,
      size: 4,
      rawHex: toHex32(totalSfntSize),
      interpreted: `${totalSfntSize} bytes (${formatBytes(totalSfntSize)})`,
      description: 'Total size needed for uncompressed, reconstructed font',
      valid: true,
    },
    {
      name: 'totalCompressedSize',
      offset: 20,
      size: 4,
      rawHex: toHex32(totalCompressedSize),
      interpreted: `${totalCompressedSize} bytes (${formatBytes(totalCompressedSize)})`,
      description: 'Total size of the compressed font data block',
      valid: true,
    },
    {
      name: 'majorVersion',
      offset: 24,
      size: 2,
      rawHex: toHex16(majorVersion),
      interpreted: String(majorVersion),
      description: 'Major version of the WOFF2 file',
      valid: true,
    },
    {
      name: 'minorVersion',
      offset: 26,
      size: 2,
      rawHex: toHex16(minorVersion),
      interpreted: String(minorVersion),
      description: 'Minor version of the WOFF2 file',
      valid: true,
    },
    {
      name: 'metaOffset',
      offset: 28,
      size: 4,
      rawHex: toHex32(metaOffset),
      interpreted: metaOffset === 0 ? 'None (0)' : `Offset ${metaOffset}`,
      description: 'Offset to extended metadata block from start of file',
      valid: true,
    },
    {
      name: 'metaLength',
      offset: 32,
      size: 4,
      rawHex: toHex32(metaLength),
      interpreted:
        metaLength === 0 ? '0 bytes' : `${metaLength} bytes (${formatBytes(metaLength)})`,
      description: 'Length of compressed metadata block',
      valid: true,
    },
    {
      name: 'metaOrigLength',
      offset: 36,
      size: 4,
      rawHex: toHex32(metaOrigLength),
      interpreted:
        metaOrigLength === 0
          ? '0 bytes'
          : `${metaOrigLength} bytes (${formatBytes(metaOrigLength)})`,
      description: 'Uncompressed size of metadata block',
      valid: true,
    },
    {
      name: 'privOffset',
      offset: 40,
      size: 4,
      rawHex: toHex32(privOffset),
      interpreted: privOffset === 0 ? 'None (0)' : `Offset ${privOffset}`,
      description: 'Offset to private data block from start of file',
      valid: true,
    },
    {
      name: 'privLength',
      offset: 44,
      size: 4,
      rawHex: toHex32(privLength),
      interpreted:
        privLength === 0 ? '0 bytes' : `${privLength} bytes (${formatBytes(privLength)})`,
      description: 'Length of private data block',
      valid: true,
    },
  ];

  return {
    signature: {
      value: signature,
      hex: toHex32(signature),
      tag: signatureTag,
      valid: true,
    },
    flavor: {
      value: flavor,
      hex: toHex32(flavor),
      tag: flavorInfo.tag,
      description: flavorInfo.description,
    },
    length,
    numTables,
    reserved: {
      value: reserved,
      valid: reserved === 0,
    },
    totalSfntSize,
    totalCompressedSize,
    version: {
      major: majorVersion,
      minor: minorVersion,
      formatted: `${majorVersion}.${minorVersion}`,
    },
    metadata: {
      offset: metaOffset,
      length: metaLength,
      origLength: metaOrigLength,
      present: metaLength > 0 && metaOffset > 0,
    },
    privateData: {
      offset: privOffset,
      length: privLength,
      present: privLength > 0 && privOffset > 0,
    },
    actualSize: bytes.length,
    compression: {
      savingsPercent: spaceSavings,
      ratio: compressionRatio,
    },
    warnings,
    fields,
  };
}
