const WOFF1_SIGNATURE = 0x774f4646;
const WOFF2_SIGNATURE = 0x774f4632;
const WOFF1_HEADER_SIZE = 44;
const WOFF2_HEADER_SIZE = 48;
const WOFF1_DIRECTORY_ENTRY_SIZE = 20;
const KNOWN_WOFF2_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post',
  'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT',
  'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea',
  'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH',
  'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar',
  'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar',
  'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop',
  'trak', 'Zapf', 'Sill',
];

function readTag(view, offset) {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
}

function ensureRange(offset, size, fileLength, label) {
  if (offset > fileLength || size > fileLength - offset) {
    throw new Error(`${label} runs past the declared file length.`);
  }
}

function validateOptionalBlock(offset, length, fileLength, label) {
  if (length === 0) return;
  if (offset === 0) {
    throw new Error(`${label} has a length but no offset.`);
  }
  ensureRange(offset, length, fileLength, label);
}

function readUIntBase128(view, offset, fileLength) {
  let value = 0;
  for (let index = 0; index < 5; index += 1) {
    ensureRange(offset + index, 1, fileLength, 'WOFF2 table directory');
    const byte = view.getUint8(offset + index);
    if (index === 0 && byte === 0x80) {
      throw new Error('WOFF2 UIntBase128 value has a leading zero.');
    }
    if (value > 0x01ffffff) {
      throw new Error('WOFF2 UIntBase128 value is too large.');
    }
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) {
      return { value, nextOffset: offset + index + 1 };
    }
  }
  throw new Error('WOFF2 UIntBase128 value is incomplete.');
}

function parseWoff1(view, fileLength) {
  ensureRange(0, WOFF1_HEADER_SIZE, fileLength, 'WOFF1 header');
  const numTables = view.getUint16(12);
  const directoryLength = numTables * WOFF1_DIRECTORY_ENTRY_SIZE;
  ensureRange(WOFF1_HEADER_SIZE, directoryLength, fileLength, 'WOFF1 table directory');

  const header = {
    signature: 'wOFF',
    flavor: view.getUint32(4),
    length: fileLength,
    numTables,
    reserved: view.getUint16(14),
    totalSfntSize: view.getUint32(16),
    majorVersion: view.getUint16(20),
    minorVersion: view.getUint16(22),
    metaOffset: view.getUint32(24),
    metaLength: view.getUint32(28),
    metaOrigLength: view.getUint32(32),
    privOffset: view.getUint32(36),
    privLength: view.getUint32(40),
  };
  validateOptionalBlock(header.metaOffset, header.metaLength, fileLength, 'WOFF1 metadata block');
  validateOptionalBlock(header.privOffset, header.privLength, fileLength, 'WOFF1 private block');

  const tables = Array.from({ length: numTables }, (_, index) => {
    const entryOffset = WOFF1_HEADER_SIZE + index * WOFF1_DIRECTORY_ENTRY_SIZE;
    const offset = view.getUint32(entryOffset + 4);
    const compLength = view.getUint32(entryOffset + 8);
    ensureRange(offset, compLength, fileLength, `WOFF1 table ${index + 1}`);
    return {
      tag: readTag(view, entryOffset),
      offset,
      compLength,
      origLength: view.getUint32(entryOffset + 12),
      origChecksum: view.getUint32(entryOffset + 16),
    };
  });
  return { format: 'WOFF1', header, tables };
}

function isTransformedWoff2Table(tag, transformVersion) {
  return (tag === 'glyf' || tag === 'loca')
    ? transformVersion === 0
    : transformVersion !== 0;
}

function parseWoff2(view, fileLength) {
  ensureRange(0, WOFF2_HEADER_SIZE, fileLength, 'WOFF2 header');
  const numTables = view.getUint16(12);
  const header = {
    signature: 'wOF2',
    flavor: view.getUint32(4),
    length: fileLength,
    numTables,
    reserved: view.getUint16(14),
    totalSfntSize: view.getUint32(16),
    totalCompressedSize: view.getUint32(20),
    majorVersion: view.getUint16(24),
    minorVersion: view.getUint16(26),
    metaOffset: view.getUint32(28),
    metaLength: view.getUint32(32),
    metaOrigLength: view.getUint32(36),
    privOffset: view.getUint32(40),
    privLength: view.getUint32(44),
  };
  validateOptionalBlock(
    header.metaOffset,
    header.metaLength,
    fileLength,
    'WOFF2 metadata block'
  );
  validateOptionalBlock(header.privOffset, header.privLength, fileLength, 'WOFF2 private block');

  let directoryOffset = WOFF2_HEADER_SIZE;
  const tables = Array.from({ length: numTables }, (_, index) => {
    const entryOffset = directoryOffset;
    ensureRange(directoryOffset, 1, fileLength, 'WOFF2 table directory');
    const flags = view.getUint8(directoryOffset);
    directoryOffset += 1;
    const tagIndex = flags & 0x3f;
    const transformVersion = flags >>> 6;
    let tag = KNOWN_WOFF2_TAGS[tagIndex];
    if (tagIndex === 0x3f) {
      ensureRange(directoryOffset, 4, fileLength, 'WOFF2 custom table tag');
      tag = readTag(view, directoryOffset);
      directoryOffset += 4;
    } else if (!tag) {
      throw new Error(`WOFF2 table ${index + 1} uses an invalid known tag index.`);
    }
    const originalLength = readUIntBase128(view, directoryOffset, fileLength);
    directoryOffset = originalLength.nextOffset;
    let transformLength = null;
    if (isTransformedWoff2Table(tag, transformVersion)) {
      const transformedLength = readUIntBase128(view, directoryOffset, fileLength);
      transformLength = transformedLength.value;
      directoryOffset = transformedLength.nextOffset;
    }
    return {
      tag,
      directoryOffset: entryOffset,
      offset: null,
      origLength: originalLength.value,
      transformLength,
      transformVersion,
    };
  });
  ensureRange(directoryOffset, header.totalCompressedSize, fileLength, 'WOFF2 compressed data');
  return { format: 'WOFF2', header, tables };
}

/**
 * Parses a WOFF1 or WOFF2 container header and table directory without inflating payload data.
 *
 * @param {ArrayBuffer|Uint8Array} input Font container bytes.
 * @returns {{format: string, header: object, tables: Array<object>}} Parsed container details.
 * @throws {Error} When the container is truncated, structurally invalid, or has an unknown
 * signature.
 */
export function parseWoffHeader(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength < 4) {
    throw new Error('Input is truncated: a WOFF signature requires 4 bytes.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signature = view.getUint32(0);
  if (signature !== WOFF1_SIGNATURE && signature !== WOFF2_SIGNATURE) {
    throw new Error('Unknown font signature. Expected WOFF (wOFF) or WOFF2 (wOF2).');
  }
  const minimumHeaderSize = signature === WOFF1_SIGNATURE ? WOFF1_HEADER_SIZE : WOFF2_HEADER_SIZE;
  if (bytes.byteLength < minimumHeaderSize) {
    const format = signature === WOFF1_SIGNATURE ? 'WOFF1' : 'WOFF2';
    throw new Error(`Input is truncated: ${format} header requires ${minimumHeaderSize} bytes.`);
  }
  const declaredLength = view.getUint32(8);
  if (declaredLength < minimumHeaderSize) {
    throw new Error('Declared file length is smaller than the required header.');
  }
  if (declaredLength > bytes.byteLength) {
    throw new Error(
      `Input is truncated: declared file length is ${declaredLength} bytes, ` +
        `but only ${bytes.byteLength} bytes were provided.`
    );
  }
  const declaredView = new DataView(bytes.buffer, bytes.byteOffset, declaredLength);
  return signature === WOFF1_SIGNATURE
    ? parseWoff1(declaredView, declaredLength)
    : parseWoff2(declaredView, declaredLength);
}

/**
 * Formats an SFNT flavor number as a readable tag or hexadecimal value.
 *
 * @param {number} flavor SFNT flavor from a WOFF header.
 * @returns {string} Readable flavor label.
 */
export function formatFlavor(flavor) {
  if (flavor === 0x00010000) return 'TrueType (0x00010000)';
  const tag = String.fromCharCode(
    (flavor >>> 24) & 0xff,
    (flavor >>> 16) & 0xff,
    (flavor >>> 8) & 0xff,
    flavor & 0xff
  );
  const hexadecimalFlavor = `0x${flavor.toString(16).padStart(8, '0')}`;
  return /^[\x20-\x7e]{4}$/.test(tag) ? `${tag} (${hexadecimalFlavor})` : hexadecimalFlavor;
}
