const FIELD_TYPES = {
  1: { name: 'BYTE', size: 1, reader: 'getUint8' },
  2: { name: 'ASCII', size: 1, reader: 'ascii' },
  3: { name: 'SHORT', size: 2, reader: 'getUint16' },
  4: { name: 'LONG', size: 4, reader: 'getUint32' },
  5: { name: 'RATIONAL', size: 8, reader: 'rational' },
  6: { name: 'SBYTE', size: 1, reader: 'getInt8' },
  7: { name: 'UNDEFINED', size: 1, reader: 'getUint8' },
  8: { name: 'SSHORT', size: 2, reader: 'getInt16' },
  9: { name: 'SLONG', size: 4, reader: 'getInt32' },
  10: { name: 'SRATIONAL', size: 8, reader: 'signedRational' },
  11: { name: 'FLOAT', size: 4, reader: 'getFloat32' },
  12: { name: 'DOUBLE', size: 8, reader: 'getFloat64' },
  13: { name: 'IFD', size: 4, reader: 'getUint32' },
};

const TAGS = {
  256: 'ImageWidth', 257: 'ImageLength', 258: 'BitsPerSample', 259: 'Compression',
  262: 'PhotometricInterpretation', 274: 'Orientation', 282: 'XResolution',
  283: 'YResolution', 296: 'ResolutionUnit', 277: 'SamplesPerPixel',
};

const LABELS = {
  Compression: {
    1: 'Uncompressed', 2: 'CCITT 1D', 3: 'CCITT Group 3', 4: 'CCITT Group 4', 5: 'LZW',
    6: 'JPEG', 7: 'JPEG', 8: 'Deflate', 32946: 'Deflate', 32773: 'PackBits',
  },
  PhotometricInterpretation: {
    0: 'White is zero', 1: 'Black is zero', 2: 'RGB', 3: 'Palette color',
    4: 'Transparency mask', 5: 'CMYK', 6: 'YCbCr', 8: 'CIELab',
  },
  Orientation: {
    1: 'Top-left', 2: 'Top-right', 3: 'Bottom-right', 4: 'Bottom-left', 5: 'Left-top',
    6: 'Right-top', 7: 'Right-bottom', 8: 'Left-bottom',
  },
  ResolutionUnit: { 1: 'None', 2: 'Inch', 3: 'Centimeter' },
};

function parserError(message) {
  throw new Error(message);
}

function requireRange(offset, size, length, label) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0 ||
      offset > length || size > length - offset) {
    parserError(`${label} is outside the TIFF file bounds.`);
  }
}

function displayValue(value) {
  if (!Array.isArray(value)) return String(value);
  return value.join(', ');
}

function readValues(view, offset, count, fieldType, littleEndian) {
  const { size, reader } = fieldType;
  const byteLength = count * size;
  requireRange(offset, byteLength, view.byteLength, 'Tag value');
  if (reader === 'ascii') {
    let value = '';
    for (let index = 0; index < count; index += 1) {
      value += String.fromCharCode(view.getUint8(offset + index));
    }
    return value.replace(/\0+$/, '');
  }
  const values = [];
  for (let index = 0; index < count; index += 1) {
    const position = offset + index * size;
    if (reader === 'rational' || reader === 'signedRational') {
      const signed = reader === 'signedRational';
      const numerator = view[signed ? 'getInt32' : 'getUint32'](position, littleEndian);
      const denominator = view[signed ? 'getInt32' : 'getUint32'](position + 4, littleEndian);
      values.push(denominator === 0 ? `${numerator}/0` : numerator / denominator);
    } else {
      values.push(view[reader](position, littleEndian));
    }
  }
  return count === 1 ? values[0] : values;
}

function parseIfd(view, offset, littleEndian) {
  requireRange(offset, 2, view.byteLength, 'IFD offset');
  const entryCount = view.getUint16(offset, littleEndian);
  const tableLength = 2 + entryCount * 12 + 4;
  requireRange(offset, tableLength, view.byteLength, 'IFD entries');
  const tags = [];
  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = offset + 2 + index * 12;
    const id = view.getUint16(entryOffset, littleEndian);
    const typeId = view.getUint16(entryOffset + 2, littleEndian);
    const count = view.getUint32(entryOffset + 4, littleEndian);
    const fieldType = FIELD_TYPES[typeId];
    if (!fieldType) {
      parserError(`Tag ${id} uses unsupported TIFF field type ${typeId}.`);
    }
    const valueSize = count * fieldType.size;
    if (!Number.isSafeInteger(valueSize)) parserError(`Tag ${id} has an invalid value length.`);
    const valueOffset = valueSize <= 4
      ? entryOffset + 8
      : view.getUint32(entryOffset + 8, littleEndian);
    const value = readValues(view, valueOffset, count, fieldType, littleEndian);
    const name = TAGS[id] ?? `Tag ${id}`;
    const numericValue = Array.isArray(value) ? value[0] : value;
    const label = LABELS[name]?.[numericValue];
    tags.push({ id, name, type: fieldType.name, count, value: displayValue(value), label });
  }
  const nextOffset = view.getUint32(offset + 2 + entryCount * 12, littleEndian);
  return { tags, nextOffset };
}

/**
 * Inspects a classic TIFF ArrayBuffer without making any network request.
 * @param {ArrayBuffer} buffer - TIFF file data.
 * @returns {{byteOrder?: string, pages?: Array<{tags: Array}>, error?: string}}
 */
export function inspectTiff(buffer) {
  try {
    if (!(buffer instanceof ArrayBuffer)) parserError('TIFF data must be an ArrayBuffer.');
    const view = new DataView(buffer);
    requireRange(0, 8, view.byteLength, 'TIFF header');
    const first = view.getUint8(0);
    const second = view.getUint8(1);
    const littleEndian = first === 0x49 && second === 0x49;
    const bigEndian = first === 0x4d && second === 0x4d;
    if (!littleEndian && !bigEndian) {
      parserError('Invalid TIFF byte-order marker; expected II or MM.');
    }
    const version = view.getUint16(2, littleEndian);
    if (version === 43) parserError('BigTIFF (version 43) is not supported.');
    if (version !== 42) parserError(`Invalid TIFF magic version ${version}; expected 42.`);
    let nextOffset = view.getUint32(4, littleEndian);
    const pages = [];
    const visited = new Set();
    while (nextOffset !== 0) {
      if (visited.has(nextOffset)) parserError('IFD chain contains a circular offset.');
      visited.add(nextOffset);
      const page = parseIfd(view, nextOffset, littleEndian);
      pages.push({ tags: page.tags });
      nextOffset = page.nextOffset;
    }
    return { byteOrder: littleEndian ? 'Little-endian (II)' : 'Big-endian (MM)', pages };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to inspect this TIFF file.' };
  }
}
