const CONTAINER_SIGNATURE = [0, 0, 0, 12, 0x4a, 0x58, 0x4c, 0x20, 13, 10, 0x87, 10];
const CODESTREAM_SIGNATURE = [0xff, 0x0a];
const ASPECT_RATIOS = [null, [1, 1], [6, 5], [4, 3], [3, 2], [16, 9], [5, 4], [2, 1]];

function fail(source, message) {
  throw new Error(`${source}: ${message}`);
}

function matches(bytes, signature, offset = 0) {
  return signature.every((value, index) => bytes[offset + index] === value);
}

function fourCc(bytes, offset) {
  return String.fromCharCode(...bytes.slice(offset, offset + 4));
}

class BitReader {
  constructor(bytes, source) {
    this.bytes = bytes;
    this.source = source;
    this.position = 0;
  }

  read(count) {
    if (this.position + count > this.bytes.length * 8) {
      fail(this.source, 'truncated JPEG XL codestream header.');
    }
    let value = 0;
    for (let index = 0; index < count; index += 1) {
      const byte = this.bytes[Math.floor(this.position / 8)];
      value |= ((byte >> (this.position % 8)) & 1) << index;
      this.position += 1;
    }
    return value;
  }

  readU32(widths) {
    return this.read(widths[this.read(2)]);
  }
}

function readSize(reader) {
  const small = reader.read(1) === 1;
  const height = small ? 8 * (reader.read(5) + 1) : reader.readU32([9, 13, 18, 30]) + 1;
  const ratio = reader.read(3);
  if (ratio !== 0) {
    const [numerator, denominator] = ASPECT_RATIOS[ratio];
    return { width: Math.floor((height * numerator) / denominator), height };
  }
  const width = small ? 8 * (reader.read(5) + 1) : reader.readU32([9, 13, 18, 30]) + 1;
  return { width, height };
}

function parseCodestream(bytes, source) {
  if (!matches(bytes, CODESTREAM_SIGNATURE)) {
    fail(source, 'the codestream does not start with the JPEG XL signature (FF 0A).');
  }
  const reader = new BitReader(bytes.slice(2), source);
  const size = readSize(reader);
  // Bundle::AllDefault stores one bit that means the metadata bundle equals its defaults.
  const metadataDefaults = reader.read(1) === 0;
  if (metadataDefaults) {
    return {
      ...size,
      bitDepth: 8,
      colorChannels: 3,
      hasAlpha: false,
      mode: 'Not available until the first frame header',
      metadataDefaults,
    };
  }
  const extraFields = reader.read(1) === 1;
  if (extraFields) {
    return {
      ...size,
      bitDepth: 'Not available: optional metadata precedes bit depth',
      colorChannels: 'Not available: optional metadata precedes color encoding',
      hasAlpha: 'Not available: optional metadata precedes extra channels',
      mode: 'Not available until the first frame header',
      metadataDefaults,
    };
  }
  const floatingPoint = reader.read(1) === 1;
  const bitDepthSelector = reader.read(2);
  const bitDepth = floatingPoint
    ? [32, 16, 24, reader.read(6) + 1][bitDepthSelector]
    : [8, 10, 12, reader.read(6) + 1][bitDepthSelector];
  // This Bool has a true default, so its encoded value is inverted. Its value
  // is not needed for basic inspection, but consuming it preserves alignment.
  reader.read(1);
  const extraSelector = reader.read(2);
  let extraChannels = 0;
  if (extraSelector === 1) extraChannels = 1;
  if (extraSelector === 2) extraChannels = reader.read(4) + 2;
  if (extraSelector === 3) extraChannels = reader.read(12) + 1;
  const hasAlpha = extraChannels === 0 ? false : 'Present if an extra channel is alpha';
  return {
    ...size,
    bitDepth,
    colorChannels: 'Available after color encoding',
    hasAlpha,
    mode: 'Not available until the first frame header',
    metadataDefaults,
  };
}

function readUint64(view, offset) {
  const value = view.getBigUint64(offset, false);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    return null;
  }
  return Number(value);
}

function parseBoxes(bytes, source) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxes = [];
  let offset = 0;
  let codestream = null;

  while (offset < bytes.length) {
    if (bytes.length - offset < 8) fail(source, `truncated box header at offset ${offset}.`);
    const size32 = view.getUint32(offset, false);
    const type = fourCc(bytes, offset + 4);
    const headerSize = size32 === 1 ? 16 : 8;
    if (size32 === 1 && bytes.length - offset < 16) {
      fail(source, `truncated extended-size box header at offset ${offset}.`);
    }
    const size = size32 === 1 ? readUint64(view, offset + 8) : size32 || bytes.length - offset;
    if (size === null || size < headerSize || size > bytes.length - offset) {
      fail(source, `invalid ${type} box size at offset ${offset}.`);
    }
    boxes.push({ type, offset, size });
    if (!codestream && (type === 'jxlc' || type === 'jxlp')) {
      const payloadOffset = offset + headerSize + (type === 'jxlp' ? 4 : 0);
      if (payloadOffset <= offset + size) codestream = bytes.slice(payloadOffset, offset + size);
    }
    offset += size;
  }
  return { boxes, codestream };
}

/**
 * Inspects a JPEG XL container or naked codestream without uploading it.
 *
 * @param {Uint8Array} bytes - The input bytes.
 * @param {string} source - A user-visible input source label.
 * @returns {{format: string, boxes: Array, header: object}}
 */
export function inspectJxl(bytes, source = 'Input') {
  if (!(bytes instanceof Uint8Array)) fail(source, 'input must be binary data.');
  if (matches(bytes, CONTAINER_SIGNATURE)) {
    const { boxes, codestream } = parseBoxes(bytes, source);
    if (!codestream) fail(source, 'the JXL container has no jxlc or jxlp codestream box.');
    return { format: 'ISOBMFF container', boxes, header: parseCodestream(codestream, source) };
  }
  if (matches(bytes, CODESTREAM_SIGNATURE)) {
    return { format: 'Bare codestream', boxes: [], header: parseCodestream(bytes, source) };
  }
  fail(source, 'not a JPEG XL file: expected a container or bare codestream signature.');
}

/**
 * Decodes a Base64 string into binary input bytes.
 *
 * @param {string} value - Base64 input, optionally containing whitespace.
 * @returns {Uint8Array} Decoded bytes.
 */
export function base64ToBytes(value) {
  const cleaned = value.replace(/\s/g, '');
  if (!cleaned || cleaned.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) {
    throw new Error('Base64 paste: invalid Base64 input.');
  }
  try {
    return Uint8Array.from(atob(cleaned), (character) => character.charCodeAt(0));
  } catch {
    throw new Error('Base64 paste: invalid Base64 input.');
  }
}

/**
 * Reads a selected file as bytes in the browser.
 *
 * @param {File} file - Selected file.
 * @returns {Promise<Uint8Array>} The file bytes.
 */
export async function fileToBytes(file) {
  return new Uint8Array(await file.arrayBuffer());
}
