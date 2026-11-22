const XCF_SIGNATURE = 'gimp xcf ';
const VERSION_LENGTH = 5;
const PRECISION_HEADER_LENGTH = 30;
const PROP_END = 0;
const PROP_COMPRESSION = 17;
const PROP_RESOLUTION = 19;
const PROP_PARASITES = 21;

const BASE_TYPES = ['RGB', 'Grayscale', 'Indexed'];
const COMPRESSION_TYPES = ['None', 'RLE', 'Zlib', 'Fractal (reserved)'];
const PRECISIONS = {
  100: '8-bit integer linear',
  150: '8-bit integer non-linear',
  200: '16-bit integer linear',
  250: '16-bit integer non-linear',
  300: '32-bit integer linear',
  350: '32-bit integer non-linear',
  400: '16-bit floating point linear',
  450: '16-bit floating point non-linear',
  500: '32-bit floating point linear',
  550: '32-bit floating point non-linear',
  600: '64-bit floating point linear',
  650: '64-bit floating point non-linear',
};

function requireBytes(view, offset, length, label) {
  if (offset + length > view.byteLength) {
    throw new Error(`Truncated XCF file while reading ${label}.`);
  }
}

function readUint32(view, offset, label) {
  requireBytes(view, offset, 4, label);
  return view.getUint32(offset, false);
}

function readFloat32(view, offset, label) {
  requireBytes(view, offset, 4, label);
  return view.getFloat32(offset, false);
}

function parseVersion(bytes) {
  const version = new TextDecoder('ascii').decode(bytes).replace(/\0$/, '');
  if (version === 'file' || version === '000') return { label: 'v000 (unversioned)', number: 0 };
  if (!/^v\d{3}$/.test(version)) {
    throw new Error('Invalid XCF version string.');
  }
  return { label: version, number: Number(version.slice(1)) };
}

function parseParasites(view, offset, length) {
  let cursor = offset;
  const end = offset + length;
  let parasiteCount = 0;
  let metadataCount = 0;

  while (cursor < end) {
    const nameLength = readUint32(view, cursor, 'parasite name length');
    cursor += 4;
    if (nameLength === 0 || cursor + nameLength + 8 > end) {
      throw new Error('Malformed parasite property in XCF file.');
    }
    const name = new TextDecoder('utf-8', { fatal: true })
      .decode(new Uint8Array(view.buffer, view.byteOffset + cursor, nameLength))
      .replace(/\0$/, '');
    cursor += nameLength;
    cursor += 4; // Flags are not needed for header inspection.
    const dataLength = readUint32(view, cursor, 'parasite data length');
    cursor += 4;
    if (cursor + dataLength > end) {
      throw new Error('Malformed parasite property in XCF file.');
    }
    cursor += dataLength;
    parasiteCount += 1;
    if (name.toLowerCase().includes('metadata')) metadataCount += 1;
  }

  if (cursor !== end) throw new Error('Malformed parasite property in XCF file.');
  return { parasiteCount, metadataCount };
}

/**
 * Parses the header and image-level properties from an XCF ArrayBuffer.
 *
 * @param {ArrayBuffer} buffer - The complete locally selected XCF file.
 * @returns {{version: string, width: number, height: number, baseType: string,
 * precision: string, compression: string | null, resolution: {x: number, y: number} | null,
 * parasiteCount: number, metadataCount: number, propertyCount: number}}
 * @throws {Error} When the data is not a complete, well-formed XCF header.
 */
export function parseXcfHeader(buffer) {
  if (!(buffer instanceof ArrayBuffer)) {
    throw new TypeError('Expected an ArrayBuffer containing an XCF file.');
  }
  const view = new DataView(buffer);
  requireBytes(view, 0, 14, 'XCF signature and version');
  const signature = new TextDecoder('ascii').decode(new Uint8Array(buffer, 0, 9));
  if (signature !== XCF_SIGNATURE) throw new Error('This file is not a GIMP XCF image.');

  const version = parseVersion(new Uint8Array(buffer, 9, VERSION_LENGTH));
  let offset = 14;
  const width = readUint32(view, offset, 'canvas width');
  const height = readUint32(view, offset + 4, 'canvas height');
  const baseTypeValue = readUint32(view, offset + 8, 'base image type');
  if (baseTypeValue >= BASE_TYPES.length) throw new Error('Invalid XCF base image type.');
  offset += 12;

  let precision = '8-bit integer non-linear (legacy default)';
  if (version.number >= 4) {
    if (view.byteLength < PRECISION_HEADER_LENGTH) {
      throw new Error('Truncated XCF file while reading image precision.');
    }
    const precisionValue = readUint32(view, offset, 'image precision');
    precision = PRECISIONS[precisionValue] ?? `Unknown precision (${precisionValue})`;
    offset += 4;
  }

  let compression = null;
  let resolution = null;
  let parasiteCount = 0;
  let metadataCount = 0;
  let propertyCount = 0;
  let foundEnd = false;

  while (offset < view.byteLength) {
    const type = readUint32(view, offset, 'property type');
    const length = readUint32(view, offset + 4, 'property length');
    offset += 8;
    if (type === PROP_END) {
      if (length !== 0) throw new Error('Malformed XCF end property.');
      foundEnd = true;
      break;
    }
    requireBytes(view, offset, length, 'property payload');
    propertyCount += 1;
    if (type === PROP_COMPRESSION && length >= 1) {
      const mode = view.getUint8(offset);
      compression = COMPRESSION_TYPES[mode] ?? `Unknown (${mode})`;
    } else if (type === PROP_RESOLUTION && length >= 8) {
      resolution = {
        x: readFloat32(view, offset, 'horizontal resolution'),
        y: readFloat32(view, offset + 4, 'vertical resolution'),
      };
    } else if (type === PROP_PARASITES) {
      const counts = parseParasites(view, offset, length);
      parasiteCount += counts.parasiteCount;
      metadataCount += counts.metadataCount;
    }
    offset += length;
  }

  if (!foundEnd) throw new Error('Truncated XCF file: image properties have no end marker.');
  return {
    version: version.label,
    width,
    height,
    baseType: BASE_TYPES[baseTypeValue],
    precision,
    compression,
    resolution,
    parasiteCount,
    metadataCount,
    propertyCount,
  };
}
