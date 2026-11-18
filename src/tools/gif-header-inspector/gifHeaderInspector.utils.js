const SIGNATURE_LENGTH = 6;
const LOGICAL_SCREEN_DESCRIPTOR_LENGTH = 7;

const EXTENSION_NAMES = {
  0xf9: 'Graphic Control Extension',
  0xfe: 'Comment Extension',
  0x01: 'Plain Text Extension',
  0xff: 'Application Extension',
};

/**
 * Converts a byte array into a compact, display-ready hexadecimal string.
 *
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

function ascii(bytes) {
  return String.fromCharCode(...bytes);
}

function colorTableSize(packedFields) {
  return 2 ** ((packedFields & 0x07) + 1);
}

function decodeColorTable(bytes) {
  const colors = [];
  for (let offset = 0; offset < bytes.length; offset += 3) {
    const [red, green, blue] = bytes.slice(offset, offset + 3);
    const hex = [red, green, blue]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
    colors.push({ red, green, blue, hex: `#${hex}` });
  }
  return colors;
}

function readColorTable(bytes, position, packedFields, label, errors) {
  const size = colorTableSize(packedFields);
  const byteLength = size * 3;
  const end = position + byteLength;
  if (end > bytes.length) {
    errors.push(
      `${label} is truncated: expected ${byteLength} bytes, found ${bytes.length - position}.`,
    );
    return { position: bytes.length, table: null };
  }
  const rawBytes = bytes.slice(position, end);
  return {
    position: end,
    table: { size, colors: decodeColorTable(rawBytes), rawBytes },
  };
}

function readSubBlocks(bytes, position, label, errors) {
  let cursor = position;
  let dataLength = 0;
  const blocks = [];
  while (cursor < bytes.length) {
    const size = bytes[cursor];
    cursor += 1;
    if (size === 0) return { position: cursor, dataLength, blocks, complete: true };
    if (cursor + size > bytes.length) {
      errors.push(
        `${label} data sub-block is truncated: expected ${size} bytes, ` +
          `found ${bytes.length - cursor}.`,
      );
      return { position: bytes.length, dataLength, blocks, complete: false };
    }
    const data = bytes.slice(cursor, cursor + size);
    blocks.push(data);
    dataLength += size;
    cursor += size;
  }
  errors.push(`${label} is missing its data sub-block terminator.`);
  return { position: cursor, dataLength, blocks, complete: false };
}

function parseGraphicControlExtension(bytes, position, start, errors) {
  if (position >= bytes.length) {
    errors.push('Graphic Control Extension is missing its block size.');
    return { position, block: null };
  }
  const blockSize = bytes[position];
  position += 1;
  if (blockSize !== 4 || position + blockSize >= bytes.length) {
    errors.push('Graphic Control Extension is malformed or truncated.');
    return { position: bytes.length, block: null };
  }
  const packedFields = bytes[position];
  const delayTime = bytes[position + 1] | (bytes[position + 2] << 8);
  const transparentColorIndex = bytes[position + 3];
  position += blockSize;
  if (bytes[position] !== 0) {
    errors.push('Graphic Control Extension is missing its block terminator.');
    return { position: bytes.length, block: null };
  }
  position += 1;
  return {
    position,
    block: {
      type: 'Graphic Control Extension',
      offset: start,
      rawBytes: bytes.slice(start, position),
      details: {
        disposalMethod: (packedFields >> 2) & 0x07,
        userInput: Boolean(packedFields & 0x02),
        transparentColor: Boolean(packedFields & 0x01),
        delayTime,
        transparentColorIndex,
      },
    },
  };
}

function parseExtension(bytes, position, start, errors) {
  if (position >= bytes.length) {
    errors.push('Extension block is missing its label.');
    return { position, block: null };
  }
  const label = bytes[position];
  position += 1;
  if (label === 0xf9) return parseGraphicControlExtension(bytes, position, start, errors);

  const hexLabel = label.toString(16).padStart(2, '0');
  const type = EXTENSION_NAMES[label] ?? `Unknown Extension (0x${hexLabel})`;
  let header = new Uint8Array();
  if (label !== 0xfe) {
    if (position >= bytes.length) {
      errors.push(`${type} is missing its header size.`);
      return { position, block: null };
    }
    const headerSize = bytes[position];
    position += 1;
    if (position + headerSize > bytes.length) {
      errors.push(`${type} header is truncated.`);
      return { position: bytes.length, block: null };
    }
    header = bytes.slice(position, position + headerSize);
    position += headerSize;
  }
  const subBlocks = readSubBlocks(bytes, position, type, errors);
  const details = {
    label: `0x${hexLabel.toUpperCase()}`,
    dataLength: subBlocks.dataLength,
  };
  if (label === 0xff && header.length) details.applicationIdentifier = ascii(header);
  return {
    position: subBlocks.position,
    block: {
      type,
      offset: start,
      rawBytes: bytes.slice(start, subBlocks.position),
      details,
    },
  };
}

function parseImageDescriptor(bytes, position, start, errors) {
  if (position + 9 > bytes.length) {
    errors.push('Image Descriptor is truncated.');
    return { position: bytes.length, block: null };
  }
  const left = bytes[position] | (bytes[position + 1] << 8);
  const top = bytes[position + 2] | (bytes[position + 3] << 8);
  const width = bytes[position + 4] | (bytes[position + 5] << 8);
  const height = bytes[position + 6] | (bytes[position + 7] << 8);
  const packedFields = bytes[position + 8];
  position += 9;
  const hasLocalColorTable = Boolean(packedFields & 0x80);
  let localColorTable = null;
  if (hasLocalColorTable) {
    const parsed = readColorTable(bytes, position, packedFields, 'Local Color Table', errors);
    position = parsed.position;
    localColorTable = parsed.table;
    if (!localColorTable) return { position, block: null };
  }
  if (position >= bytes.length) {
    errors.push('Image Data is missing its LZW minimum code size.');
    return { position, block: null };
  }
  const lzwMinimumCodeSize = bytes[position];
  position += 1;
  const imageData = readSubBlocks(bytes, position, 'Image Data', errors);
  return {
    position: imageData.position,
    block: {
      type: 'Image Descriptor',
      offset: start,
      rawBytes: bytes.slice(start, imageData.position),
      details: {
        left,
        top,
        width,
        height,
        interlaced: Boolean(packedFields & 0x40),
      },
      localColorTable,
      imageData: { lzwMinimumCodeSize, byteLength: imageData.dataLength },
    },
  };
}

/**
 * Parses a GIF header and block stream without decoding or uploading image pixels.
 * Structural errors are returned to the caller instead of being thrown.
 *
 * @param {Uint8Array|ArrayBuffer} input
 * @returns {object} Parsed GIF details and non-fatal validation errors.
 */
export function parseGif(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const result = {
    signature: '',
    logicalScreen: null,
    globalColorTable: null,
    blocks: [],
    errors: [],
    hasTrailer: false,
  };
  if (bytes.length < SIGNATURE_LENGTH) {
    result.errors.push('File is truncated before the 6-byte GIF signature.');
    return result;
  }
  result.signature = ascii(bytes.slice(0, SIGNATURE_LENGTH));
  if (!['GIF87a', 'GIF89a'].includes(result.signature)) {
    result.errors.push(
      `Invalid GIF signature: ${result.signature || '(empty)'}. Expected GIF87a or GIF89a.`,
    );
    return result;
  }
  if (bytes.length < SIGNATURE_LENGTH + LOGICAL_SCREEN_DESCRIPTOR_LENGTH) {
    result.errors.push('File is truncated in the Logical Screen Descriptor.');
    return result;
  }
  let position = SIGNATURE_LENGTH;
  const width = bytes[position] | (bytes[position + 1] << 8);
  const height = bytes[position + 2] | (bytes[position + 3] << 8);
  const packedFields = bytes[position + 4];
  result.logicalScreen = {
    width,
    height,
    globalColorTableFlag: Boolean(packedFields & 0x80),
    colorResolution: ((packedFields >> 4) & 0x07) + 1,
    sortFlag: Boolean(packedFields & 0x08),
    globalColorTableSize: colorTableSize(packedFields),
    backgroundColorIndex: bytes[position + 5],
    pixelAspectRatio: bytes[position + 6],
  };
  position += LOGICAL_SCREEN_DESCRIPTOR_LENGTH;
  if (result.logicalScreen.globalColorTableFlag) {
    const parsed = readColorTable(
      bytes,
      position,
      packedFields,
      'Global Color Table',
      result.errors,
    );
    position = parsed.position;
    result.globalColorTable = parsed.table;
    if (!result.globalColorTable) return result;
  }
  while (position < bytes.length) {
    const start = position;
    const introducer = bytes[position];
    position += 1;
    if (introducer === 0x3b) {
      result.blocks.push({
        type: 'Trailer',
        offset: start,
        rawBytes: bytes.slice(start, position),
      });
      result.hasTrailer = true;
      break;
    }
    let parsed;
    if (introducer === 0x21) {
      parsed = parseExtension(bytes, position, start, result.errors);
    } else if (introducer === 0x2c) {
      parsed = parseImageDescriptor(bytes, position, start, result.errors);
    }
    else {
      const malformedByte = introducer.toString(16).padStart(2, '0').toUpperCase();
      result.errors.push(`Malformed block introducer 0x${malformedByte} at byte ${start}.`);
      break;
    }
    position = parsed.position;
    if (parsed.block) result.blocks.push(parsed.block);
    if (result.errors.length) break;
  }
  if (!result.hasTrailer && !result.errors.length) {
    result.errors.push('GIF stream is missing the Trailer byte (0x3B).');
  }
  return result;
}
