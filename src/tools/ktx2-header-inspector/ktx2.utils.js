/**
 * KTX2 Header and Container Utilities.
 * Implements parsing according to Khronos KTX 2.0 specification.
 */

export const KTX2_IDENTIFIER = Object.freeze([
  0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/**
 * Mapping of common Vulkan format enum values.
 */
export const VK_FORMAT_MAP = Object.freeze({
  0: 'VK_FORMAT_UNDEFINED/Basis',
  1: 'R4G4_UNORM_PACK8',
  2: 'R4G4B4A4_UNORM_PACK16',
  3: 'B4G4R4A4_UNORM_PACK16',
  4: 'R5G6B5_UNORM_PACK16',
  5: 'B5G6R5_UNORM_PACK16',
  6: 'R5G5B5A1_UNORM_PACK16',
  7: 'B5G5R5A1_UNORM_PACK16',
  8: 'A1R5G5B5_UNORM_PACK16',
  9: 'R8_UNORM',
  10: 'R8_SNORM',
  11: 'R8_USCALED',
  12: 'R8_SSCALED',
  13: 'R8_UINT',
  14: 'R8_SINT',
  15: 'R8_SRGB',
  16: 'R8G8_UNORM',
  17: 'R8G8_SNORM',
  23: 'R8G8B8_UNORM',
  29: 'R8G8B8_SRGB',
  30: 'B8G8R8_UNORM',
  36: 'B8G8R8_SRGB',
  37: 'R8G8B8A8_UNORM',
  38: 'R8G8B8A8_SNORM',
  43: 'R8G8B8A8_SRGB',
  44: 'B8G8R8A8_UNORM',
  50: 'B8G8R8A8_SRGB',
  64: 'A2B10G10R10_UNORM_PACK32',
  97: 'R16G16B16A16_SFLOAT',
  109: 'R32G32B32A32_SFLOAT',
  124: 'D16_UNORM',
  126: 'D32_SFLOAT',
  129: 'D24_UNORM_S8_UINT',
  130: 'D32_SFLOAT_S8_UINT',
  131: 'BC1_RGB_UNORM_BLOCK',
  132: 'BC1_RGB_SRGB_BLOCK',
  133: 'BC1_RGBA_UNORM_BLOCK',
  134: 'BC1_RGBA_SRGB_BLOCK',
  135: 'BC2_UNORM_BLOCK',
  136: 'BC2_SRGB_BLOCK',
  137: 'BC3_UNORM_BLOCK',
  138: 'BC3_SRGB_BLOCK',
  139: 'BC4_UNORM_BLOCK',
  140: 'BC4_SNORM_BLOCK',
  141: 'BC5_UNORM_BLOCK',
  142: 'BC5_SNORM_BLOCK',
  143: 'BC6H_UFLOAT_BLOCK',
  144: 'BC6H_SFLOAT_BLOCK',
  145: 'BC7_UNORM_BLOCK',
  146: 'BC7_SRGB_BLOCK',
  147: 'ETC2_R8G8B8_UNORM_BLOCK',
  148: 'ETC2_R8G8B8_SRGB_BLOCK',
  151: 'ETC2_R8G8B8A8_UNORM_BLOCK',
  152: 'ETC2_R8G8B8A8_SRGB_BLOCK',
  153: 'EAC_R11_UNORM_BLOCK',
  154: 'EAC_R11_SNORM_BLOCK',
  155: 'EAC_R11G11_UNORM_BLOCK',
  156: 'EAC_R11G11_SNORM_BLOCK',
  157: 'ASTC_4x4_UNORM_BLOCK',
  158: 'ASTC_4x4_SRGB_BLOCK',
});

/**
 * Mapping of KTX2 supercompression scheme values.
 */
export const SUPERCOMPRESSION_SCHEME_MAP = Object.freeze({
  0: 'None',
  1: 'BasisLZ',
  2: 'Zstandard',
  3: 'ZLIB',
});

/**
 * Gets a human-readable display name for a Vulkan format ID.
 * @param {number} vkFormat - Format code.
 * @returns {string} Name or fallback "Unknown (n)".
 */
export function getVkFormatName(vkFormat) {
  if (Object.prototype.hasOwnProperty.call(VK_FORMAT_MAP, vkFormat)) {
    return VK_FORMAT_MAP[vkFormat];
  }
  return `Unknown (${vkFormat})`;
}

/**
 * Gets a human-readable name for a KTX2 supercompression scheme ID.
 * @param {number} scheme - Supercompression scheme ID.
 * @returns {string} Name or fallback "Unknown (n)".
 */
export function getSupercompressionSchemeName(scheme) {
  if (Object.prototype.hasOwnProperty.call(SUPERCOMPRESSION_SCHEME_MAP, scheme)) {
    return SUPERCOMPRESSION_SCHEME_MAP[scheme];
  }
  return `Unknown (${scheme})`;
}

/**
 * Parses a KTX2 container header and level index table.
 *
 * @param {ArrayBuffer|ArrayBufferView} input - Binary data to parse.
 * @returns {object} Parsed KTX2 header and derived metadata.
 * @throws {Error} When input is missing, truncated, has bad identifier or invalid level index.
 */
export function parseKtx2Header(input) {
  if (!input) {
    throw new Error('Missing file: no data provided to parse.');
  }

  let buffer;
  let byteOffset = 0;
  let byteLength = 0;

  if (input instanceof ArrayBuffer) {
    buffer = input;
    byteLength = input.byteLength;
  } else if (ArrayBuffer.isView(input)) {
    buffer = input.buffer;
    byteOffset = input.byteOffset;
    byteLength = input.byteLength;
  } else {
    throw new Error('Missing file: input must be an ArrayBuffer, Uint8Array, or DataView.');
  }

  if (byteLength < 80) {
    throw new Error(
      `File is shorter than 80 bytes (expected at least 80 bytes, got ${byteLength} bytes).`,
    );
  }

  const view = new DataView(buffer, byteOffset, byteLength);

  // Validate 12-byte KTX2 identifier
  for (let i = 0; i < KTX2_IDENTIFIER.length; i += 1) {
    if (view.getUint8(i) !== KTX2_IDENTIFIER[i]) {
      throw new Error(
        'Bad identifier: file signature does not match Khronos KTX2 specification.',
      );
    }
  }

  const vkFormat = view.getUint32(12, true);
  const typeSize = view.getUint32(16, true);
  const pixelWidth = view.getUint32(20, true);
  const pixelHeight = view.getUint32(24, true);
  const pixelDepth = view.getUint32(28, true);
  const layerCount = view.getUint32(32, true);
  const faceCount = view.getUint32(36, true);
  const levelCount = view.getUint32(40, true);
  const supercompressionScheme = view.getUint32(44, true);

  const dfdByteOffset = view.getUint32(48, true);
  const dfdByteLength = view.getUint32(52, true);
  const kvdByteOffset = view.getUint32(56, true);
  const kvdByteLength = view.getUint32(60, true);
  const sgdByteOffset = view.getBigUint64(64, true);
  const sgdByteLength = view.getBigUint64(72, true);

  const levelIndexCount = Math.max(levelCount, 1);
  const requiredLevelIndexBytes = 80 + levelIndexCount * 24;

  if (byteLength < requiredLevelIndexBytes) {
    throw new Error(
      `Truncated level index: file size (${byteLength} bytes) is too small ` +
        `for ${levelIndexCount} level index entries ` +
        `(requires at least ${requiredLevelIndexBytes} bytes).`,
    );
  }

  const levels = [];
  for (let i = 0; i < levelIndexCount; i += 1) {
    const entryOffset = 80 + i * 24;
    const levelByteOffset = view.getBigUint64(entryOffset, true);
    const levelByteLength = view.getBigUint64(entryOffset + 8, true);
    const uncompressedByteLength = view.getBigUint64(entryOffset + 16, true);
    const isOutOfBounds = levelByteOffset + levelByteLength > BigInt(byteLength);

    levels.push({
      level: i,
      byteOffset: levelByteOffset,
      byteLength: levelByteLength,
      uncompressedByteLength,
      isOutOfBounds,
      outOfBounds: isOutOfBounds,
    });
  }

  let dimensionality = '1D';
  if (pixelDepth > 0) {
    dimensionality = '3D';
  } else if (pixelHeight > 0) {
    dimensionality = '2D';
  }

  const isCubeMap = faceCount === 6;
  const isArray = layerCount > 0;
  const vkFormatName = getVkFormatName(vkFormat);
  const supercompressionSchemeName = getSupercompressionSchemeName(supercompressionScheme);

  return {
    identifier: Array.from(new Uint8Array(buffer, byteOffset, 12)),
    vkFormat,
    vkFormatName,
    formatName: vkFormatName,
    typeSize,
    pixelWidth,
    pixelHeight,
    pixelDepth,
    layerCount,
    faceCount,
    levelCount,
    supercompressionScheme,
    supercompressionSchemeName,
    supercompressionName: supercompressionSchemeName,
    dfdByteOffset,
    dfdByteLength,
    kvdByteOffset,
    kvdByteLength,
    sgdByteOffset,
    sgdByteLength,
    dimensionality,
    isCubeMap,
    isArray,
    isArrayTexture: isArray,
    levels,
    levelIndex: levels,
    fileSize: byteLength,
  };
}

/**
 * Formats a byte count into a human-readable size string.
 * @param {number|bigint} bytes - Size in bytes.
 * @returns {string} Formatted size string (e.g. "1.5 KB").
 */
export function formatFileSize(bytes) {
  const num = typeof bytes === 'bigint' ? Number(bytes) : bytes;
  if (num < 1024) return `${num} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = num / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Reads a File, Blob, or buffer into an ArrayBuffer.
 * Supports both modern Blob.arrayBuffer() and FileReader for compatibility.
 *
 * @param {File|Blob|ArrayBuffer|ArrayBufferView} file
 * @returns {Promise<ArrayBuffer>}
 */
export function readFileAsArrayBuffer(file) {
  if (!file) {
    return Promise.reject(new Error('Missing file: no data provided.'));
  }
  if (file instanceof ArrayBuffer) {
    return Promise.resolve(file);
  }
  if (ArrayBuffer.isView(file)) {
    return Promise.resolve(file.buffer);
  }
  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(/** @type {ArrayBuffer} */ (reader.result));
    reader.onerror = () => reject(new Error('Failed to read the selected file.'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Creates a valid or customizable KTX2 ArrayBuffer for testing or sample usage.
 * @param {object} [options]
 * @returns {ArrayBuffer}
 */
export function createKtx2Buffer(options = {}) {
  const {
    vkFormat = 37,
    typeSize = 1,
    pixelWidth = 512,
    pixelHeight = 512,
    pixelDepth = 0,
    layerCount = 0,
    faceCount = 1,
    levelCount = 1,
    supercompressionScheme = 0,
    dfdByteOffset = 0,
    dfdByteLength = 0,
    kvdByteOffset = 0,
    kvdByteLength = 0,
    sgdByteOffset = 0n,
    sgdByteLength = 0n,
    levels = null,
    extraBytes = 128,
    corruptIdentifier = false,
  } = options;

  const numLevels = Math.max(levelCount, 1);
  const headerSize = 80;
  const levelIndexSize = numLevels * 24;
  const totalSize = headerSize + levelIndexSize + extraBytes;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  for (let i = 0; i < 12; i += 1) {
    bytes[i] = corruptIdentifier ? 0x00 : KTX2_IDENTIFIER[i];
  }

  view.setUint32(12, vkFormat, true);
  view.setUint32(16, typeSize, true);
  view.setUint32(20, pixelWidth, true);
  view.setUint32(24, pixelHeight, true);
  view.setUint32(28, pixelDepth, true);
  view.setUint32(32, layerCount, true);
  view.setUint32(36, faceCount, true);
  view.setUint32(40, levelCount, true);
  view.setUint32(44, supercompressionScheme, true);
  view.setUint32(48, dfdByteOffset, true);
  view.setUint32(52, dfdByteLength, true);
  view.setUint32(56, kvdByteOffset, true);
  view.setUint32(60, kvdByteLength, true);
  view.setBigUint64(64, BigInt(sgdByteOffset), true);
  view.setBigUint64(72, BigInt(sgdByteLength), true);

  const baseDataOffset = BigInt(headerSize + levelIndexSize);
  for (let i = 0; i < numLevels; i += 1) {
    const entryOffset = headerSize + i * 24;
    const lvl = levels && levels[i] ? levels[i] : {};
    const bOffset =
      lvl.byteOffset !== undefined ? BigInt(lvl.byteOffset) : baseDataOffset;
    const bLength =
      lvl.byteLength !== undefined ? BigInt(lvl.byteLength) : BigInt(extraBytes);
    const uLength =
      lvl.uncompressedByteLength !== undefined
        ? BigInt(lvl.uncompressedByteLength)
        : bLength;

    view.setBigUint64(entryOffset, bOffset, true);
    view.setBigUint64(entryOffset + 8, bLength, true);
    view.setBigUint64(entryOffset + 16, uLength, true);
  }

  return buffer;
}
