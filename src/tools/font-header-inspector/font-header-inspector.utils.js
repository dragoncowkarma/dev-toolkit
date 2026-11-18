const WOFF_SIGNATURE = 'wOFF';
const WOFF2_SIGNATURE = 'wOF2';
const WOFF2_KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf',
  'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT',
  'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT',
  'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar',
  'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd',
  'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill',
];

function formatTag(view, offset) {
  let tag = '';
  for (let index = 0; index < 4; index += 1) {
    tag += String.fromCharCode(view.getUint8(offset + index));
  }
  return tag;
}

function requireBytes(view, offset, length, label) {
  if (!Number.isSafeInteger(offset) || offset < 0 || length > view.byteLength - offset) {
    throw new Error(`The ${label} is truncated or extends beyond the file.`);
  }
}

function readBase128(view, cursor) {
  let value = 0;
  for (let index = 0; index < 5; index += 1) {
    requireBytes(view, cursor.offset, 1, 'WOFF2 table directory');
    const byte = view.getUint8(cursor.offset);
    cursor.offset += 1;
    if (index === 0 && byte === 0x80) throw new Error('The WOFF2 table length is malformed.');
    if (value > 0x01ffffff) throw new Error('The WOFF2 table length is too large.');
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return value;
  }
  throw new Error('The WOFF2 table length is malformed.');
}

function validateDeclaredLength(view, declaredLength, format) {
  if (declaredLength < 1 || declaredLength > view.byteLength) {
    throw new Error(
      `The ${format} file is truncated (its declared length exceeds the available bytes).`,
    );
  }
}

function parseSfnt(view) {
  requireBytes(view, 0, 12, 'SFNT header');
  const version = formatTag(view, 0);
  const numTables = view.getUint16(4);
  const directoryLength = numTables * 16;
  requireBytes(view, 12, directoryLength, 'SFNT table directory');
  const tables = [];
  for (let index = 0; index < numTables; index += 1) {
    const offset = 12 + index * 16;
    const tableOffset = view.getUint32(offset + 8);
    const length = view.getUint32(offset + 12);
    requireBytes(view, tableOffset, length, `SFNT table "${formatTag(view, offset)}"`);
    tables.push({
      tag: formatTag(view, offset),
      checksum: view.getUint32(offset + 4),
      offset: tableOffset,
      length,
    });
  }
  return {
    format: version === 'OTTO' ? 'OTF (CFF SFNT)' : 'TTF/SFNT',
    header: {
      signature: version,
      numTables,
      searchRange: view.getUint16(6),
      entrySelector: view.getUint16(8),
      rangeShift: view.getUint16(10),
    },
    tables,
  };
}

function parseWoff(view) {
  requireBytes(view, 0, 44, 'WOFF header');
  const length = view.getUint32(8);
  const numTables = view.getUint16(12);
  validateDeclaredLength(view, length, 'WOFF');
  requireBytes(view, 44, numTables * 20, 'WOFF table directory');
  const tables = [];
  for (let index = 0; index < numTables; index += 1) {
    const offset = 44 + index * 20;
    const tableOffset = view.getUint32(offset + 4);
    const compLength = view.getUint32(offset + 8);
    requireBytes(view, tableOffset, compLength, `WOFF table "${formatTag(view, offset)}"`);
    tables.push({
      tag: formatTag(view, offset), offset: tableOffset, compLength,
      origLength: view.getUint32(offset + 12), origChecksum: view.getUint32(offset + 16),
    });
  }
  return {
    format: 'WOFF',
    header: {
      signature: WOFF_SIGNATURE, flavor: formatTag(view, 4), length, numTables,
      totalSfntSize: view.getUint32(16), majorVersion: view.getUint16(20),
      minorVersion: view.getUint16(22), metaOffset: view.getUint32(24),
      metaLength: view.getUint32(28),
      privOffset: view.getUint32(36),
      privLength: view.getUint32(40),
    },
    tables,
  };
}

function parseWoff2(view) {
  requireBytes(view, 0, 48, 'WOFF2 header');
  const length = view.getUint32(8);
  const numTables = view.getUint16(12);
  validateDeclaredLength(view, length, 'WOFF2');
  const cursor = { offset: 48 };
  const tables = [];
  for (let index = 0; index < numTables; index += 1) {
    requireBytes(view, cursor.offset, 1, 'WOFF2 table directory');
    const flags = view.getUint8(cursor.offset);
    cursor.offset += 1;
    const tagIndex = flags & 0x3f;
    const transformVersion = flags >>> 6;
    let tag;
    if (tagIndex === 0x3f) {
      requireBytes(view, cursor.offset, 4, 'WOFF2 custom table tag');
      tag = formatTag(view, cursor.offset);
      cursor.offset += 4;
    } else {
      tag = WOFF2_KNOWN_TAGS[tagIndex];
      if (!tag) throw new Error('The WOFF2 table tag index is malformed.');
    }
    const origLength = readBase128(view, cursor);
    const transformed = (tag === 'glyf' || tag === 'loca')
      ? transformVersion === 0
      : tag === 'hmtx' && transformVersion === 1;
    const transformLength = transformed ? readBase128(view, cursor) : null;
    tables.push({ tag, origLength, transformVersion, transformLength });
  }
  return {
    format: 'WOFF2',
    header: {
      signature: WOFF2_SIGNATURE, flavor: formatTag(view, 4), length, numTables,
      totalSfntSize: view.getUint32(16), totalCompressedSize: view.getUint32(20),
      majorVersion: view.getUint16(24), minorVersion: view.getUint16(26),
      metaOffset: view.getUint32(28), metaLength: view.getUint32(32),
      privOffset: view.getUint32(40), privLength: view.getUint32(44),
    },
    tables,
  };
}

/**
 * Inspects a TTF, OTF, WOFF, or WOFF2 file without decoding font glyph data.
 *
 * @param {ArrayBuffer|Uint8Array} input - Raw font bytes.
 * @returns {{format: string, header: object, tables: object[]}}
 * @throws {Error} When the input is unsupported or malformed.
 */
export function inspectFontHeader(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  requireBytes(view, 0, 4, 'font signature');
  const signature = formatTag(view, 0);
  if (signature === WOFF_SIGNATURE) return parseWoff(view);
  if (signature === WOFF2_SIGNATURE) return parseWoff2(view);
  if (signature === 'OTTO' || (view.getUint32(0) === 0x00010000)) return parseSfnt(view);
  throw new Error('Unsupported font signature. Choose a TTF, OTF, WOFF, or WOFF2 file.');
}
