const SFNT_HEADER_SIZE = 12;
const TABLE_RECORD_SIZE = 16;

const VERSION_LABELS = new Map([
  [0x00010000, "TrueType outlines"],
  [0x4f54544f, "OpenType with CFF outlines"],
  [0x74727565, "Apple TrueType (legacy)"],
  [0x74797031, "Apple Type 1 (legacy)"],
]);

const TABLE_LABELS = {
  cmap: "Character to glyph mapping",
  glyf: "TrueType glyph data",
  loca: "Glyph locations",
  hhea: "Horizontal header",
  hmtx: "Horizontal metrics",
  name: "Naming",
  post: "PostScript data",
  "CFF ": "Compact Font Format outlines",
  GSUB: "Glyph substitution",
  GPOS: "Glyph positioning",
};

function asBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  throw new TypeError("SFNT input: expected an ArrayBuffer or Uint8Array.");
}

function requireRange(bytes, offset, size, path) {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(size) ||
    offset < 0 ||
    size < 0 ||
    offset > bytes.byteLength - size
  ) {
    throw new Error(
      `${path}: need ${size} byte(s) at offset ${offset}, file is ${bytes.byteLength} bytes.`,
    );
  }
}

function ascii(bytes, offset) {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}

function formatLongDateTime(view, offset) {
  const seconds = view.getBigInt64(offset, false);
  const unixSeconds = seconds - 2082844800n;
  const milliseconds = unixSeconds * 1000n;
  if (
    milliseconds < BigInt(Number.MIN_SAFE_INTEGER) ||
    milliseconds > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    return { seconds: seconds.toString(), iso: null };
  }
  const date = new Date(Number(milliseconds));
  return {
    seconds: seconds.toString(),
    iso: Number.isNaN(date.getTime()) ? null : date.toISOString(),
  };
}

function parseHead(bytes, table) {
  const path = "table directory.head";
  requireRange(bytes, table.offset, table.length, path);
  requireRange(bytes, table.offset, 54, "table directory.head fields");
  const view = new DataView(bytes.buffer, bytes.byteOffset + table.offset, 54);
  return {
    unitsPerEm: view.getUint16(18, false),
    created: formatLongDateTime(view, 20),
    modified: formatLongDateTime(view, 28),
    indexToLocFormat: view.getInt16(50, false),
  };
}

function parseMaxp(bytes, table) {
  requireRange(bytes, table.offset, table.length, "table directory.maxp");
  requireRange(bytes, table.offset, 6, "table directory.maxp fields");
  const view = new DataView(bytes.buffer, bytes.byteOffset + table.offset, 6);
  return { numGlyphs: view.getUint16(4, false) };
}

/**
 * Parses the shared SFNT container header used by TrueType and OpenType fonts.
 *
 * @param {ArrayBuffer|Uint8Array} input Font file bytes.
 * @returns {object} The offset table, table directory, and available key-table details.
 */
export function parseSfnt(input) {
  const bytes = asBytes(input);
  requireRange(bytes, 0, SFNT_HEADER_SIZE, "SFNT offset table");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sfntVersion = view.getUint32(0, false);
  const numTables = view.getUint16(4, false);
  const directorySize = numTables * TABLE_RECORD_SIZE;
  requireRange(bytes, SFNT_HEADER_SIZE, directorySize, "SFNT table directory");

  const tables = [];
  for (let index = 0; index < numTables; index += 1) {
    const recordOffset = SFNT_HEADER_SIZE + index * TABLE_RECORD_SIZE;
    const tag = ascii(bytes, recordOffset);
    const offset = view.getUint32(recordOffset + 8, false);
    const length = view.getUint32(recordOffset + 12, false);
    tables.push({
      index,
      tag,
      label: TABLE_LABELS[tag] ?? null,
      checksum: view.getUint32(recordOffset + 4, false),
      offset,
      length,
      inBounds:
        offset <= bytes.byteLength && length <= bytes.byteLength - offset,
    });
  }

  const byTag = new Map(tables.map((table) => [table.tag, table]));
  const headTable = byTag.get("head");
  const maxpTable = byTag.get("maxp");
  return {
    fileSize: bytes.byteLength,
    sfntVersion: {
      value: sfntVersion,
      hex: `0x${sfntVersion.toString(16).padStart(8, "0")}`,
      label: VERSION_LABELS.get(sfntVersion) ?? "Unknown SFNT flavor",
    },
    numTables,
    searchRange: view.getUint16(6, false),
    entrySelector: view.getUint16(8, false),
    rangeShift: view.getUint16(10, false),
    tables,
    head: headTable?.inBounds ? parseHead(bytes, headTable) : null,
    maxp: maxpTable?.inBounds ? parseMaxp(bytes, maxpTable) : null,
  };
}

/**
 * Decodes a Base64 string into bytes suitable for SFNT parsing.
 *
 * @param {string} value Base64 input, optionally separated by whitespace.
 * @returns {Uint8Array} Decoded bytes.
 */
export function decodeBase64(value) {
  const cleaned = value.replace(/\s/g, "");
  if (
    !cleaned ||
    cleaned.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)
  ) {
    throw new Error("Base64 input: provide valid, padded Base64 data.");
  }
  try {
    return Uint8Array.from(atob(cleaned), (character) =>
      character.charCodeAt(0),
    );
  } catch {
    throw new Error("Base64 input: provide valid, padded Base64 data.");
  }
}
