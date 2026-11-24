/**
 * Maximum header region read from the cartridge file.
 */
export const HEADER_SLICE_SIZE = 1024;

/**
 * Minimum header size required to read marker, boot address, and size field.
 */
export const MIN_HEADER_SIZE = 40;

/**
 * Standard ASCII marker string.
 */
export const MARKER_TEXT = 'ATARI APPROVED DATA HEADER ATRI!';

const STANDARD_MARKER = 'ATARI APPROVED DATA HEADER ATRI';
const SWAPPED_MARKER = 'TARA IPARPVODED TA AEHDAREA RT';

const SIZE_CLASSES = [
  { bytes: 524288, label: '512 KB' },
  { bytes: 1048576, label: '1 MB' },
  { bytes: 2097152, label: '2 MB' },
  { bytes: 3145728, label: '3 MB' },
  { bytes: 4194304, label: '4 MB' },
  { bytes: 6291456, label: '6 MB' },
  { bytes: 8388608, label: '8 MB' },
];

/**
 * Reads up to 1024 bytes of the cartridge ROM header from a File or Blob.
 *
 * @param {Blob|File} file - Uploaded file or blob.
 * @returns {Promise<Uint8Array>} Raw bytes of the header region.
 */
export async function readFileHeader(file) {
  if (!file) {
    throw new Error('No file provided.');
  }
  const slice = file.slice(0, HEADER_SLICE_SIZE);
  if (typeof slice.arrayBuffer === 'function') {
    const buffer = await slice.arrayBuffer();
    return new Uint8Array(buffer);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(new Uint8Array(/** @type {ArrayBuffer} */ (reader.result)));
    };
    reader.onerror = () => {
      reject(new Error('Failed to read the selected file.'));
    };
    reader.readAsArrayBuffer(slice);
  });
}

/**
 * Detects the size class label from either the header ROM size field or file size.
 *
 * @param {number|null} romSizeField - 32-bit ROM size field from the header.
 * @param {number} [fileSize] - Total file size in bytes.
 * @returns {string} Detected size class (e.g. '1 MB', '2 MB') or 'Unknown'.
 */
export function detectSizeClass(romSizeField, fileSize) {
  if (typeof romSizeField === 'number' && romSizeField > 0) {
    const match = SIZE_CLASSES.find((entry) => entry.bytes === romSizeField);
    if (match) {
      return match.label;
    }
  }
  if (typeof fileSize === 'number' && fileSize > 0) {
    const match = SIZE_CLASSES.find(
      (entry) => entry.bytes === fileSize || entry.bytes + 512 === fileSize,
    );
    if (match) {
      return match.label;
    }
  }
  return 'Unknown';
}

/**
 * Searches for standard or byte-swapped Atari Jaguar header marker in bytes.
 *
 * @param {Uint8Array} bytes - Header bytes.
 * @returns {{ offset: number, swapped: boolean } | null}
 */
export function findHeaderOffset(bytes) {
  if (!bytes || bytes.length < MIN_HEADER_SIZE) {
    return null;
  }
  let ascii = '';
  for (let i = 0; i < bytes.length; i++) {
    ascii += String.fromCharCode(bytes[i]);
  }

  const standardIdx = ascii.indexOf(STANDARD_MARKER);
  if (standardIdx !== -1) {
    return { offset: standardIdx, swapped: false };
  }

  const swappedIdx = ascii.indexOf(SWAPPED_MARKER);
  if (swappedIdx !== -1) {
    return { offset: swappedIdx, swapped: true };
  }

  return null;
}

/**
 * Parses Atari Jaguar ROM header bytes and returns inspected fields.
 *
 * @param {Uint8Array} bytes - Header bytes (up to 1024 bytes).
 * @param {number} [fileSize] - Full file size in bytes.
 * @returns {object} Parsed header fields.
 * @throws {Error} If the file or header is truncated.
 */
export function parseJaguarRomHeader(bytes, fileSize) {
  if (!bytes || bytes.length === 0) {
    throw new Error('Truncated file: file is empty.');
  }

  if (bytes.length < MIN_HEADER_SIZE) {
    throw new Error('Truncated file: header is smaller than 40 bytes.');
  }

  if (typeof fileSize === 'number') {
    if (fileSize === 0) {
      throw new Error('Truncated file: file is empty.');
    }
    if (fileSize < MIN_HEADER_SIZE) {
      throw new Error(
        'Truncated file: file size is smaller than the minimum 40-byte header.',
      );
    }
  }

  const markerMatch = findHeaderOffset(bytes);

  if (!markerMatch) {
    return {
      marker: 'Unknown',
      markerPresent: false,
      bootAddress: null,
      bootAddressHex: 'Unknown',
      romSizeField: null,
      romSizeFormatted: 'Unknown',
      sizeClass: detectSizeClass(null, fileSize),
    };
  }

  const { offset, swapped } = markerMatch;

  if (offset + MIN_HEADER_SIZE > bytes.length) {
    throw new Error('Truncated file: incomplete header fields.');
  }

  if (typeof fileSize === 'number' && fileSize < offset + MIN_HEADER_SIZE) {
    throw new Error('Truncated file: file cuts off header fields.');
  }

  let slice = bytes.subarray(offset, offset + MIN_HEADER_SIZE);
  if (swapped) {
    const unswapped = new Uint8Array(MIN_HEADER_SIZE);
    for (let j = 0; j < MIN_HEADER_SIZE; j += 2) {
      unswapped[j] = slice[j + 1];
      unswapped[j + 1] = slice[j];
    }
    slice = unswapped;
  }

  const rawBootAddress =
    ((slice[32] << 24) | (slice[33] << 16) | (slice[34] << 8) | slice[35]) >>>
    0;
  const rawRomSize =
    ((slice[36] << 24) | (slice[37] << 16) | (slice[38] << 8) | slice[39]) >>>
    0;

  const validBootAddress =
    rawBootAddress !== 0 && rawBootAddress !== 0xffffffff;
  const bootAddress = validBootAddress ? rawBootAddress : null;
  const bootAddressHex = validBootAddress
    ? `0x${rawBootAddress.toString(16).toUpperCase().padStart(8, '0')}`
    : 'Unknown';

  const validRomSize = rawRomSize !== 0 && rawRomSize !== 0xffffffff;
  const romSizeField = validRomSize ? rawRomSize : null;
  const romSizeFormatted = validRomSize
    ? `${rawRomSize.toLocaleString()} bytes`
    : 'Unknown';

  const sizeClass = detectSizeClass(romSizeField, fileSize);

  return {
    marker: MARKER_TEXT,
    markerPresent: true,
    bootAddress,
    bootAddressHex,
    romSizeField,
    romSizeFormatted,
    sizeClass,
  };
}

/**
 * Formats a byte size into human-readable text.
 *
 * @param {number} bytes - Number of bytes.
 * @returns {string} Formatted size (e.g. '2.0 MB').
 */
export function formatFileSize(bytes) {
  if (typeof bytes !== 'number' || bytes < 0) return 'Unknown';
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
