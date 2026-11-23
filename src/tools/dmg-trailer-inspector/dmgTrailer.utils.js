const TRAILER_SIZE = 512;

const CHECKSUM_TYPES = new Map([
  [0, 'None'],
  [1, 'CRC-32'],
  [2, 'MD5'],
  [3, 'SHA-1'],
  [4, 'SHA-256'],
]);

const IMAGE_VARIANTS = new Map([
  [0, 'Hard disk image'],
  [1, 'CD-ROM image'],
  [2, 'DVD image'],
]);

const UNAVAILABLE = 'Unavailable';

function unavailableMetadata() {
  return [
    ['Signature', UNAVAILABLE],
    ['Version', UNAVAILABLE],
    ['Header size', UNAVAILABLE],
    ['Flags', UNAVAILABLE],
    ['Data fork offset', UNAVAILABLE],
    ['Data fork length', UNAVAILABLE],
    ['XML plist offset', UNAVAILABLE],
    ['XML plist length', UNAVAILABLE],
    ['Segment number', UNAVAILABLE],
    ['Segment count', UNAVAILABLE],
    ['Data checksum type', UNAVAILABLE],
    ['Master checksum type', UNAVAILABLE],
    ['Image variant', UNAVAILABLE],
  ].map(([label, value]) => ({ label, value }));
}

function formatUnsigned(value) {
  return value.toString();
}

function formatChecksumType(type) {
  return CHECKSUM_TYPES.has(type) ? `${CHECKSUM_TYPES.get(type)} (${type})` : `Unknown (${type})`;
}

function formatImageVariant(variant) {
  return IMAGE_VARIANTS.has(variant)
    ? `${IMAGE_VARIANTS.get(variant)} (${variant})`
    : `Unknown (${variant})`;
}

function hasValidRange(offset, length, totalSize) {
  return offset <= totalSize && length <= totalSize - offset;
}

function boundsWarning(label, offset, length, totalSize) {
  return `${label} range (${offset} + ${length}) exceeds the input size (${totalSize}).`;
}

/**
 * Parses the final 512-byte Apple DMG koly trailer without throwing on invalid input.
 *
 * @param {Uint8Array} bytes - The complete input or its final 512 bytes.
 * @param {number|bigint} [inputSize=bytes.length] - Original input size in bytes.
 * @returns {{metadata: Array<{label: string, value: string}>, warnings: string[]}}
 */
export function parseKolyTrailer(bytes, inputSize = bytes?.length ?? 0) {
  const metadata = unavailableMetadata();
  const warnings = [];
  const safeBytes = bytes instanceof Uint8Array ? bytes : new Uint8Array();
  const numericSize = Number.isFinite(inputSize) ? Math.max(0, Math.trunc(inputSize)) : 0;
  const totalSize = typeof inputSize === 'bigint' && inputSize >= 0n
    ? inputSize
    : BigInt(numericSize);

  if (safeBytes.length < TRAILER_SIZE || totalSize < BigInt(TRAILER_SIZE)) {
    warnings.push('The input is shorter than a 512-byte DMG koly trailer.');
    return { metadata, warnings };
  }

  const trailer = safeBytes.subarray(safeBytes.length - TRAILER_SIZE);
  const view = new DataView(trailer.buffer, trailer.byteOffset, TRAILER_SIZE);
  const signature = new TextDecoder('ascii').decode(trailer.subarray(0, 4));
  if (signature !== 'koly') {
    metadata[0].value = /^[\x20-\x7e]{4}$/.test(signature)
      ? `${signature} (not koly)`
      : UNAVAILABLE;
    warnings.push('The final 512 bytes do not start with the expected koly signature.');
    return { metadata, warnings };
  }

  const version = view.getUint32(4, false);
  const headerSize = view.getUint32(8, false);
  const flags = view.getUint32(12, false);
  const dataForkOffset = view.getBigUint64(24, false);
  const dataForkLength = view.getBigUint64(32, false);
  const segmentNumber = view.getUint32(56, false);
  const segmentCount = view.getUint32(60, false);
  const dataChecksumType = view.getUint32(80, false);
  const xmlOffset = view.getBigUint64(216, false);
  const xmlLength = view.getBigUint64(224, false);
  const masterChecksumType = view.getUint32(352, false);
  const imageVariant = view.getUint32(488, false);

  const values = [
    'koly',
    formatUnsigned(version),
    formatUnsigned(headerSize),
    `0x${flags.toString(16).padStart(8, '0')}`,
    formatUnsigned(dataForkOffset),
    formatUnsigned(dataForkLength),
    formatUnsigned(xmlOffset),
    formatUnsigned(xmlLength),
    formatUnsigned(segmentNumber),
    formatUnsigned(segmentCount),
    formatChecksumType(dataChecksumType),
    formatChecksumType(masterChecksumType),
    formatImageVariant(imageVariant),
  ];
  metadata.forEach((item, index) => {
    item.value = values[index];
  });

  if (headerSize !== TRAILER_SIZE) {
    warnings.push(
      `Header size is ${headerSize}; the expected koly trailer size is ${TRAILER_SIZE}.`
    );
  }
  if (!hasValidRange(dataForkOffset, dataForkLength, totalSize)) {
    warnings.push(boundsWarning('Data fork', dataForkOffset, dataForkLength, totalSize));
  }
  if (!hasValidRange(xmlOffset, xmlLength, totalSize)) {
    warnings.push(boundsWarning('XML plist', xmlOffset, xmlLength, totalSize));
  }
  if (segmentCount === 0 || segmentNumber >= segmentCount) {
    warnings.push(`Segment ${segmentNumber} is inconsistent with segment count ${segmentCount}.`);
  }

  return { metadata, warnings };
}

/**
 * Decodes Base64 into raw bytes without allowing malformed input to throw.
 *
 * @param {string} value
 * @returns {{bytes: Uint8Array, error: string}}
 */
export function decodeBase64Bytes(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return { bytes: new Uint8Array(), error: 'Paste Base64 data to inspect it.' };
  }
  const cleaned = value.replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned) || cleaned.length % 4 !== 0) {
    return { bytes: new Uint8Array(), error: 'The Base64 input is malformed.' };
  }
  try {
    const binary = atob(cleaned);
    return { bytes: Uint8Array.from(binary, (character) => character.charCodeAt(0)), error: '' };
  } catch {
    return { bytes: new Uint8Array(), error: 'The Base64 input is malformed.' };
  }
}

/**
 * Reads only the final DMG trailer from a selected local file.
 *
 * @param {File} file
 * @returns {Promise<{bytes: Uint8Array, size: number}>}
 */
export async function readFileTrailer(file) {
  const start = Math.max(0, file.size - TRAILER_SIZE);
  const buffer = await file.slice(start).arrayBuffer();
  return { bytes: new Uint8Array(buffer), size: file.size };
}
