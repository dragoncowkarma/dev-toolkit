const FILE_HEADER_SIZE = 14;
const CORE_HEADER_SIZE = 12;
const INFO_HEADER_SIZE = 40;
const KNOWN_DIB_HEADER_SIZES = new Set([12, 40, 52, 56, 64, 108, 124]);

const COMPRESSION_NAMES = {
  0: 'BI_RGB (uncompressed)',
  1: 'BI_RLE8',
  2: 'BI_RLE4',
  3: 'BI_BITFIELDS',
  4: 'BI_JPEG',
  5: 'BI_PNG',
  6: 'BI_ALPHABITFIELDS',
  11: 'BI_CMYK',
  12: 'BI_CMYKRLE8',
  13: 'BI_CMYKRLE4',
};

function requireBytes(view, offset, count, message) {
  if (offset + count > view.byteLength) {
    throw new Error(message);
  }
}

/**
 * Returns a display label for a BMP compression value.
 *
 * @param {number} compression - The little-endian DIB compression value.
 * @returns {string} A named compression method, or an unknown-value label.
 */
export function getCompressionName(compression) {
  return COMPRESSION_NAMES[compression] ?? `Unknown compression (${compression})`;
}

/**
 * Parses the file and DIB headers of a Windows Bitmap from an ArrayBuffer.
 *
 * @param {ArrayBuffer} buffer - BMP file contents.
 * @returns {{fileHeader: object, dibHeader: object, warnings: string[]}} Parsed BMP metadata.
 * @throws {TypeError} When the input is not an ArrayBuffer.
 * @throws {Error} When the file is not a BMP or lacks a complete required header.
 */
export function parseBmpHeader(buffer) {
  if (!(buffer instanceof ArrayBuffer)) {
    throw new TypeError('BMP data must be provided as an ArrayBuffer.');
  }

  const view = new DataView(buffer);
  requireBytes(view, 0, FILE_HEADER_SIZE, 'The BMP file header is truncated.');
  if (view.getUint8(0) !== 0x42 || view.getUint8(1) !== 0x4d) {
    throw new Error('This file is not a BMP: expected the BM magic bytes.');
  }

  const warnings = [];
  const declaredFileSize = view.getUint32(2, true);
  const pixelDataOffset = view.getUint32(10, true);
  if (declaredFileSize > buffer.byteLength) {
    warnings.push(
      `The declared file size (${declaredFileSize} bytes) exceeds the available ` +
        `data (${buffer.byteLength} bytes). The file may be truncated.`
    );
  }
  if (pixelDataOffset > buffer.byteLength) {
    warnings.push(
      `The pixel data offset (${pixelDataOffset}) exceeds the available data ` +
        `(${buffer.byteLength} bytes). The file may be truncated.`
    );
  }

  requireBytes(view, FILE_HEADER_SIZE, 4, 'The BMP DIB header size field is truncated.');
  const dibHeaderSize = view.getUint32(FILE_HEADER_SIZE, true);
  if (!KNOWN_DIB_HEADER_SIZES.has(dibHeaderSize)) {
    warnings.push(`Unsupported or unknown DIB header size: ${dibHeaderSize} bytes.`);
  }
  if (FILE_HEADER_SIZE + dibHeaderSize > buffer.byteLength) {
    warnings.push(
      `The declared DIB header size (${dibHeaderSize} bytes) exceeds the available data. ` +
        'The file may be truncated.'
    );
  }

  const fileHeader = {
    magic: 'BM',
    fileSize: declaredFileSize,
    reserved1: view.getUint16(6, true),
    reserved2: view.getUint16(8, true),
    pixelDataOffset,
  };
  const dibHeader = { size: dibHeaderSize };

  if (dibHeaderSize === CORE_HEADER_SIZE) {
    requireBytes(view, FILE_HEADER_SIZE, CORE_HEADER_SIZE, 'The BITMAPCOREHEADER is truncated.');
    Object.assign(dibHeader, {
      type: 'BITMAPCOREHEADER',
      width: view.getUint16(18, true),
      height: view.getUint16(20, true),
      planes: view.getUint16(22, true),
      bitDepth: view.getUint16(24, true),
      compression: 0,
      compressionName: getCompressionName(0),
      imageSize: null,
      xPixelsPerMeter: null,
      yPixelsPerMeter: null,
      colorsUsed: null,
      orientation: 'bottom-up',
    });
  } else if (dibHeaderSize >= INFO_HEADER_SIZE && buffer.byteLength >= 54) {
    const type = dibHeaderSize === 108
      ? 'BITMAPV4HEADER'
      : dibHeaderSize === 124
        ? 'BITMAPV5HEADER'
        : 'BITMAPINFOHEADER-compatible';
    const rawHeight = view.getInt32(22, true);
    const compression = view.getUint32(30, true);
    Object.assign(dibHeader, {
      type,
      width: view.getInt32(18, true),
      height: rawHeight,
      planes: view.getUint16(26, true),
      bitDepth: view.getUint16(28, true),
      compression,
      compressionName: getCompressionName(compression),
      imageSize: view.getUint32(34, true),
      xPixelsPerMeter: view.getInt32(38, true),
      yPixelsPerMeter: view.getInt32(42, true),
      colorsUsed: view.getUint32(46, true),
      orientation: rawHeight < 0 ? 'top-down' : 'bottom-up',
    });
  } else if (dibHeaderSize !== CORE_HEADER_SIZE) {
    warnings.push('The DIB header is too short to decode common image fields.');
  }

  return { fileHeader, dibHeader, warnings };
}
