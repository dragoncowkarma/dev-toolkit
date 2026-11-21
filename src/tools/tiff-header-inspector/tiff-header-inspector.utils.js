const TYPE_INFO = {
  1: { name: 'BYTE', size: 1, read: 'getUint8' },
  2: { name: 'ASCII', size: 1, read: 'getUint8' },
  3: { name: 'SHORT', size: 2, read: 'getUint16' },
  4: { name: 'LONG', size: 4, read: 'getUint32' },
  5: { name: 'RATIONAL', size: 8, read: 'rational' },
  6: { name: 'SBYTE', size: 1, read: 'getInt8' },
  7: { name: 'UNDEFINED', size: 1, read: 'getUint8' },
  8: { name: 'SSHORT', size: 2, read: 'getInt16' },
  9: { name: 'SLONG', size: 4, read: 'getInt32' },
  10: { name: 'SRATIONAL', size: 8, read: 'signedRational' },
  11: { name: 'FLOAT', size: 4, read: 'getFloat32' },
  12: { name: 'DOUBLE', size: 8, read: 'getFloat64' },
  13: { name: 'IFD', size: 4, read: 'getUint32' },
};

const TAG_NAMES = {
  256: 'ImageWidth',
  257: 'ImageLength',
  258: 'BitsPerSample',
  259: 'Compression',
  262: 'PhotometricInterpretation',
  274: 'Orientation',
  273: 'StripOffsets',
  277: 'SamplesPerPixel',
  278: 'RowsPerStrip',
  279: 'StripByteCounts',
  282: 'XResolution',
  283: 'YResolution',
  284: 'PlanarConfiguration',
  296: 'ResolutionUnit',
  305: 'Software',
  306: 'DateTime',
};

const VALUE_LABELS = {
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

const MAX_DISPLAY_VALUES = 32;
const MAX_IFDS = 256;

class TiffParseError extends Error {}

function ensureRange(byteLength, offset, length, label) {
  const invalidRange = !Number.isSafeInteger(offset)
    || !Number.isSafeInteger(length)
    || offset < 0
    || length < 0
    || offset > byteLength
    || length > byteLength - offset;
  if (invalidRange) {
    throw new TiffParseError(`${label} is outside the file bounds.`);
  }
}

function readValue(view, offset, type, littleEndian) {
  if (type.read === 'rational' || type.read === 'signedRational') {
    const numerator = view[type.read === 'rational' ? 'getUint32' : 'getInt32'](
      offset,
      littleEndian,
    );
    const denominator = view[type.read === 'rational' ? 'getUint32' : 'getInt32'](
      offset + 4,
      littleEndian,
    );
    return denominator === 0 ? `${numerator}/0` : `${numerator}/${denominator}`;
  }
  return view[type.read](offset, littleEndian);
}

function decodeEntryValue(view, valueOffset, type, count, littleEndian, byteLength) {
  const totalBytes = count * type.size;
  ensureRange(byteLength, valueOffset, totalBytes, 'Tag value');

  if (type.name === 'ASCII') {
    const bytes = new Uint8Array(view.buffer, view.byteOffset + valueOffset, count);
    return new TextDecoder('ascii').decode(bytes).replace(/\0+$/, '');
  }

  const displayedCount = Math.min(count, MAX_DISPLAY_VALUES);
  const values = Array.from({ length: displayedCount }, (_, index) =>
    readValue(view, valueOffset + index * type.size, type, littleEndian),
  );
  const suffix = count > MAX_DISPLAY_VALUES ? ` … (${count} values)` : '';
  return `${values.join(', ')}${suffix}`;
}

function parseEntry(view, entryOffset, littleEndian, byteLength) {
  ensureRange(byteLength, entryOffset, 12, 'IFD entry');
  const tagId = view.getUint16(entryOffset, littleEndian);
  const typeId = view.getUint16(entryOffset + 2, littleEndian);
  const count = view.getUint32(entryOffset + 4, littleEndian);
  const type = TYPE_INFO[typeId];
  const rawValueOffset = view.getUint32(entryOffset + 8, littleEndian);

  if (!type) {
    return {
      tagId,
      tagName: TAG_NAMES[tagId] ?? `Tag ${tagId}`,
      typeId,
      typeName: `Unknown (${typeId})`,
      count,
      value: `Raw value/offset: ${rawValueOffset}`,
      valueOffset: rawValueOffset,
    };
  }

  const totalBytes = count * type.size;
  if (!Number.isSafeInteger(totalBytes)) {
    throw new TiffParseError('Tag value size is invalid.');
  }
  const isInlineValue = totalBytes <= 4;
  const valueOffset = isInlineValue ? entryOffset + 8 : rawValueOffset;
  const value = decodeEntryValue(view, valueOffset, type, count, littleEndian, byteLength);
  const firstValue = value.split(', ')[0];
  const valueLabel = VALUE_LABELS[TAG_NAMES[tagId]]?.[firstValue];
  return {
    tagId,
    tagName: TAG_NAMES[tagId] ?? `Tag ${tagId}`,
    typeId,
    typeName: type.name,
    count,
    value: valueLabel ? `${value} (${valueLabel})` : value,
    valueOffset: isInlineValue ? null : rawValueOffset,
  };
}

/**
 * Parses the header and IFD chain of a classic TIFF 6.0 file.
 *
 * @param {ArrayBuffer} buffer - TIFF bytes read from a local file.
 * @returns {{byteOrder: string, firstIfdOffset: number, ifds: Array<object>}} Parsed TIFF data.
 * @throws {Error} When the bytes are not a complete, valid classic TIFF structure.
 */
export function parseTiffHeader(buffer) {
  if (!(buffer instanceof ArrayBuffer)) {
    throw new TiffParseError('Could not read the selected TIFF file.');
  }
  const view = new DataView(buffer);
  const byteLength = view.byteLength;
  ensureRange(byteLength, 0, 8, 'TIFF header');

  const firstByte = view.getUint8(0);
  const secondByte = view.getUint8(1);
  const littleEndian = firstByte === 0x49 && secondByte === 0x49;
  const bigEndian = firstByte === 0x4d && secondByte === 0x4d;
  if (!littleEndian && !bigEndian) {
    throw new TiffParseError('Invalid TIFF byte-order marker. Expected II or MM.');
  }
  if (view.getUint16(2, littleEndian) !== 42) {
    throw new TiffParseError('Invalid TIFF magic number. Expected 42.');
  }

  const firstIfdOffset = view.getUint32(4, littleEndian);
  const ifds = [];
  const visitedOffsets = new Set();
  let ifdOffset = firstIfdOffset;

  while (ifdOffset !== 0) {
    if (ifds.length >= MAX_IFDS || visitedOffsets.has(ifdOffset)) {
      throw new TiffParseError('TIFF IFD chain is cyclic or too long.');
    }
    visitedOffsets.add(ifdOffset);
    ensureRange(byteLength, ifdOffset, 2, 'IFD');
    const entryCount = view.getUint16(ifdOffset, littleEndian);
    const entriesOffset = ifdOffset + 2;
    const entriesSize = entryCount * 12;
    ensureRange(byteLength, entriesOffset, entriesSize + 4, 'IFD entries');
    const entries = Array.from({ length: entryCount }, (_, index) =>
      parseEntry(view, entriesOffset + index * 12, littleEndian, byteLength),
    );
    const nextIfdOffset = view.getUint32(entriesOffset + entriesSize, littleEndian);
    ifds.push({ offset: ifdOffset, entryCount, entries, nextIfdOffset });
    ifdOffset = nextIfdOffset;
  }

  return {
    byteOrder: littleEndian ? 'Little-endian (II)' : 'Big-endian (MM)',
    firstIfdOffset,
    ifds,
  };
}
