const PSD_SIGNATURE = '8BPS';
const RESOURCE_SIGNATURE = '8BIM';

const COLOR_MODES = {
  0: 'Bitmap',
  1: 'Grayscale',
  2: 'Indexed',
  3: 'RGB',
  4: 'CMYK',
  7: 'Multichannel',
  8: 'Duotone',
  9: 'Lab',
};

const RESOURCE_NAMES = {
  0x03ed: 'Resolution info',
  0x040f: 'ICC profile',
};

class ByteReader {
  constructor(bytes, end = bytes.length) {
    this.bytes = bytes;
    this.offset = 0;
    this.end = end;
  }

  ensure(length, label) {
    if (!Number.isSafeInteger(length) || length < 0 || this.offset + length > this.end) {
      throw new Error(`Malformed PSD: ${label} is truncated.`);
    }
  }

  readBytes(length, label) {
    this.ensure(length, label);
    const result = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return result;
  }

  readU16(label) {
    const bytes = this.readBytes(2, label);
    return (bytes[0] << 8) | bytes[1];
  }

  readU32(label) {
    const bytes = this.readBytes(4, label);
    return (bytes[0] * 0x1000000) + (bytes[1] << 16) + (bytes[2] << 8) + bytes[3];
  }

  readU64(label) {
    const bytes = this.readBytes(8, label);
    let value = 0n;
    for (const byte of bytes) value = (value << 8n) | BigInt(byte);
    return value;
  }

  readAscii(length, label) {
    return new TextDecoder('ascii', { fatal: true }).decode(this.readBytes(length, label));
  }

  subReader(length, label) {
    this.ensure(length, label);
    const section = new ByteReader(this.bytes.slice(this.offset, this.offset + length));
    this.offset += length;
    return section;
  }
}

function byteLength(value, label) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Malformed PSD: ${label} is too large to inspect safely.`);
  }
  return Number(value);
}

function readResources(reader) {
  const resourcesLength = reader.readU32('Image Resources length');
  const resources = reader.subReader(resourcesLength, 'Image Resources section');
  const resourceIds = [];

  while (resources.offset < resources.end) {
    const signature = resources.readAscii(4, 'Image Resource signature');
    if (signature !== RESOURCE_SIGNATURE) {
      throw new Error('Malformed PSD: Image Resource signature must be 8BIM.');
    }
    const id = resources.readU16('Image Resource ID');
    const nameLength = resources.readBytes(1, 'Image Resource name length')[0];
    resources.readBytes(nameLength, 'Image Resource name');
    if ((nameLength + 1) % 2 !== 0) resources.readBytes(1, 'Image Resource name padding');
    const dataLength = resources.readU32('Image Resource data length');
    resources.readBytes(dataLength, 'Image Resource data');
    if (dataLength % 2 !== 0) resources.readBytes(1, 'Image Resource data padding');
    resourceIds.push({ id, name: RESOURCE_NAMES[id] ?? 'Unknown resource' });
  }

  return { length: resourcesLength, resourceIds };
}

/**
 * Parses the safe-to-inspect header and section summaries of a PSD or PSB file.
 * @param {Uint8Array} bytes - Raw PSD or PSB file bytes.
 * @returns {object} Decoded document header and section summaries.
 */
export function parsePsdHeader(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('Input must be raw bytes.');
  const reader = new ByteReader(bytes);
  const signature = reader.readAscii(4, 'signature');
  if (signature !== PSD_SIGNATURE) {
    throw new Error('Invalid PSD signature. Expected 8BPS.');
  }
  const version = reader.readU16('version');
  if (version !== 1 && version !== 2) {
    throw new Error(`Unsupported PSD version ${version}. Only PSD (1) and PSB (2) are supported.`);
  }
  reader.readBytes(6, 'reserved header bytes');
  const channels = reader.readU16('channel count');
  const height = reader.readU32('image height');
  const width = reader.readU32('image width');
  const depth = reader.readU16('bit depth');
  const colorModeValue = reader.readU16('color mode');
  const colorModeDataLength = reader.readU32('Color Mode Data length');
  reader.readBytes(colorModeDataLength, 'Color Mode Data section');
  const imageResources = readResources(reader);
  const layerMaskLength = version === 1
    ? BigInt(reader.readU32('Layer and Mask Information length'))
    : reader.readU64('Layer and Mask Information length');
  reader.readBytes(byteLength(layerMaskLength, 'Layer and Mask Information length'),
    'Layer and Mask Information section');

  return {
    signature,
    version,
    format: version === 1 ? 'PSD' : 'PSB',
    channels,
    height,
    width,
    depth,
    colorMode: COLOR_MODES[colorModeValue] ?? `Unknown (${colorModeValue})`,
    colorModeDataLength,
    imageResources,
    layerMaskLength: layerMaskLength.toString(),
  };
}

/**
 * Decodes a whitespace-tolerant hexadecimal or Base64 byte string.
 * @param {string} value - Textual bytes entered by the user.
 * @returns {Uint8Array} Decoded raw bytes.
 */
export function decodePsdInput(value) {
  const compact = value.replace(/\s/g, '');
  if (!compact) throw new Error('Paste hexadecimal or Base64 file bytes to inspect.');
  const hex = compact.replace(/^0x/i, '');
  if (/^[0-9a-f]+$/i.test(hex) && hex.length % 2 === 0) {
    return Uint8Array.from(hex.match(/.{2}/g), (pair) => Number.parseInt(pair, 16));
  }
  if (compact.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) {
    throw new Error('Input must be valid hexadecimal or Base64 bytes.');
  }
  try {
    return Uint8Array.from(atob(compact), (character) => character.charCodeAt(0));
  } catch {
    throw new Error('Input must be valid hexadecimal or Base64 bytes.');
  }
}

/**
 * Reads a browser File as raw bytes without uploading it anywhere.
 * @param {File} file - PSD or PSB file selected by the user.
 * @returns {Promise<Uint8Array>} File bytes.
 */
export async function fileToBytes(file) {
  return new Uint8Array(await file.arrayBuffer());
}
