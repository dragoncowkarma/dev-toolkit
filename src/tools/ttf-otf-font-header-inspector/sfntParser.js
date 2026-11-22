const SFNT_HEADER_SIZE = 12;
const TABLE_RECORD_SIZE = 16;

const SFNT_VERSIONS = {
  0x00010000: 'TrueType outlines',
  0x4f54544f: 'OpenType with CFF outlines',
  0x74727565: 'Legacy Apple TrueType',
  0x74797031: 'Legacy Apple Type 1',
};

const TABLE_DESCRIPTIONS = {
  'CFF ': 'Compact Font Format outlines',
  cmap: 'Character-to-glyph mapping',
  glyf: 'TrueType glyph outlines',
  head: 'Font header',
  hhea: 'Horizontal header',
  hmtx: 'Horizontal metrics',
  loca: 'Glyph locations',
  maxp: 'Maximum profile',
  name: 'Naming records',
  post: 'PostScript information',
};

/**
 * Converts a four-byte SFNT tag into an ASCII label.
 *
 * @param {DataView} view - The binary font data.
 * @param {number} offset - The tag's offset in the data view.
 * @returns {string} The four-character tag.
 */
function readTag(view, offset) {
  let tag = '';
  for (let index = 0; index < 4; index += 1) {
    tag += String.fromCharCode(view.getUint8(offset + index));
  }
  return tag;
}

/**
 * Parses the SFNT offset table and table directory without throwing for malformed data.
 *
 * @param {ArrayBuffer} buffer - The font file's binary contents.
 * @returns {{ok: true, font: object}|{ok: false, error: string}} Parse result.
 */
export function parseSfntHeader(buffer) {
  if (!(buffer instanceof ArrayBuffer)) {
    return { ok: false, error: 'The selected file could not be read as binary data.' };
  }

  if (buffer.byteLength < SFNT_HEADER_SIZE) {
    return { ok: false, error: 'This file is truncated: an SFNT header needs at least 12 bytes.' };
  }

  const view = new DataView(buffer);
  const sfntVersion = view.getUint32(0, false);
  const versionLabel = SFNT_VERSIONS[sfntVersion];
  if (!versionLabel) {
    return { ok: false, error: 'This file does not contain a recognized SFNT version.' };
  }

  const numTables = view.getUint16(4, false);
  const directoryLength = numTables * TABLE_RECORD_SIZE;
  if (directoryLength > buffer.byteLength - SFNT_HEADER_SIZE) {
    return { ok: false, error: 'This file is truncated: its SFNT table directory is incomplete.' };
  }

  const tables = [];
  for (let index = 0; index < numTables; index += 1) {
    const recordOffset = SFNT_HEADER_SIZE + index * TABLE_RECORD_SIZE;
    const tag = readTag(view, recordOffset);
    const checksum = view.getUint32(recordOffset + 4, false);
    const offset = view.getUint32(recordOffset + 8, false);
    const length = view.getUint32(recordOffset + 12, false);

    if (offset > buffer.byteLength || length > buffer.byteLength - offset) {
      return {
        ok: false,
        error: `Table "${tag}" points outside the file bounds. The font may be malformed.`,
      };
    }

    tables.push({
      tag,
      checksum,
      offset,
      length,
      description: TABLE_DESCRIPTIONS[tag] ?? 'Unrecognized SFNT table',
    });
  }

  return {
    ok: true,
    font: {
      sfntVersion,
      versionLabel,
      numTables,
      searchRange: view.getUint16(6, false),
      entrySelector: view.getUint16(8, false),
      rangeShift: view.getUint16(10, false),
      tables,
    },
  };
}
