const ICONDIR_SIZE = 6;
const ICONDIRENTRY_SIZE = 16;
const BITMAPINFOHEADER_SIZE = 40;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

/**
 * Converts supported binary input into a byte view.
 *
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {Uint8Array}
 */
function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  throw new TypeError('ICO data must be an ArrayBuffer or Uint8Array.');
}

/**
 * Returns a Windows bitmap compression label for a BITMAPINFOHEADER value.
 *
 * @param {number} compression
 * @returns {string}
 */
export function getCompressionName(compression) {
  const names = {
    0: 'BI_RGB',
    1: 'BI_RLE8',
    2: 'BI_RLE4',
    3: 'BI_BITFIELDS',
    4: 'BI_JPEG',
    5: 'BI_PNG',
    6: 'BI_ALPHABITFIELDS',
  };
  return names[compression] ?? `Unknown (${compression})`;
}

function hasPngSignature(bytes, offset) {
  return PNG_SIGNATURE.every((value, index) => bytes[offset + index] === value);
}

function parseBitmapInfoHeader(view, offset, imageEnd) {
  if (offset + BITMAPINFOHEADER_SIZE > imageEnd) return null;
  const headerSize = view.getUint32(offset, true);
  if (headerSize < BITMAPINFOHEADER_SIZE || offset + headerSize > imageEnd) return null;

  const compression = view.getUint32(offset + 16, true);
  return {
    headerSize,
    width: view.getInt32(offset + 4, true),
    height: view.getInt32(offset + 8, true),
    planes: view.getUint16(offset + 12, true),
    bitDepth: view.getUint16(offset + 14, true),
    compression,
    compressionName: getCompressionName(compression),
  };
}

/**
 * Parses an ICO file's directory entries and BMP image headers without decoding pixels.
 *
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {{header: object|null, images: object[], warnings: string[]}}
 */
export function parseIco(input) {
  const bytes = toBytes(input);
  const warnings = [];
  if (bytes.byteLength < ICONDIR_SIZE) {
    return {
      header: null,
      images: [],
      warnings: ['The file is truncated: an ICO header requires at least 6 bytes.'],
    };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header = {
    reserved: view.getUint16(0, true),
    type: view.getUint16(2, true),
    imageCount: view.getUint16(4, true),
  };
  if (header.reserved !== 0) warnings.push(`Unexpected reserved value: ${header.reserved}.`);
  if (header.type !== 1) warnings.push(`Unexpected ICO type: ${header.type}; expected 1.`);

  const availableEntries = Math.floor((bytes.byteLength - ICONDIR_SIZE) / ICONDIRENTRY_SIZE);
  if (availableEntries < header.imageCount) {
    warnings.push(
      `The icon directory declares ${header.imageCount} entries, but only ${availableEntries} `
        + 'complete entries are available.'
    );
  }

  const images = [];
  for (let index = 0; index < Math.min(header.imageCount, availableEntries); index += 1) {
    const entryOffset = ICONDIR_SIZE + index * ICONDIRENTRY_SIZE;
    const widthByte = view.getUint8(entryOffset);
    const heightByte = view.getUint8(entryOffset + 1);
    const sizeInBytes = view.getUint32(entryOffset + 8, true);
    const offset = view.getUint32(entryOffset + 12, true);
    const imageWarnings = [];
    const imageEnd = offset + sizeInBytes;
    const startsInFile = offset < bytes.byteLength;
    const endsInFile = imageEnd <= bytes.byteLength && imageEnd >= offset;

    if (!startsInFile) {
      imageWarnings.push(`Image offset ${offset} is outside the ${bytes.byteLength}-byte file.`);
    } else if (!endsInFile) {
      imageWarnings.push(
        `Declared image data (${sizeInBytes} bytes at offset ${offset}) exceeds the file length.`
      );
    }

    const isPng = sizeInBytes >= PNG_SIGNATURE.length
      && startsInFile
      && offset + PNG_SIGNATURE.length <= bytes.byteLength
      && hasPngSignature(bytes, offset);
    const bitmapHeader = !isPng && endsInFile
      ? parseBitmapInfoHeader(view, offset, imageEnd)
      : null;
    if (!isPng && startsInFile && !bitmapHeader) {
      imageWarnings.push('BMP (DIB) header is missing, truncated, or not a BITMAPINFOHEADER.');
    }

    const image = {
      index: index + 1,
      width: widthByte || 256,
      height: heightByte || 256,
      colorCount: view.getUint8(entryOffset + 2),
      planes: view.getUint16(entryOffset + 4, true),
      bitDepth: view.getUint16(entryOffset + 6, true),
      sizeInBytes,
      offset,
      format: isPng ? 'PNG' : 'BMP (DIB)',
      bitmapHeader,
      warnings: imageWarnings,
    };
    images.push(image);
    warnings.push(...imageWarnings.map((warning) => `Image ${index + 1}: ${warning}`));
  }

  return { header, images, warnings };
}

/**
 * Formats a byte count for display.
 *
 * @param {number} bytes
 * @returns {string}
 */
export function formatByteSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
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
