const SFNT_HEADER_SIZE = 12;
const TABLE_RECORD_SIZE = 16;
const WOFF_SIGNATURE = "wOFF";
const WOFF2_SIGNATURE = "wOF2";

const VERSION_LABELS = new Map([
  [0x00010000, "TrueType outlines"],
  [0x4f54544f, "OpenType with CFF outlines"],
  [0x74727565, "Apple TrueType (legacy)"],
  [0x74797031, "Apple Type 1 (legacy)"],
]);

const TABLE_LABELS = {
  cmap: "Character to glyph mapping", glyf: "TrueType glyph data",
  loca: "Glyph locations", hhea: "Horizontal header", hmtx: "Horizontal metrics",
  name: "Naming", post: "PostScript data", "CFF ": "Compact Font Format outlines",
  GSUB: "Glyph substitution", GPOS: "Glyph positioning",
};

const WOFF2_KNOWN_TAGS = [
  "cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ",
  "fpgm", "glyf", "loca", "prep", "CFF ", "VORG", "EBDT", "EBLC", "gasp",
  "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF",
  "GPOS", "GSUB", "EBSC", "JSTF", "MATH", "CBDT", "CBLC", "COLR", "CPAL",
  "SVG ", "sbix", "acnt", "avar", "bdat", "bloc", "bsln", "cvar", "fdsc",
  "feat", "fmtx", "fvar", "gvar", "hsty", "just", "lcar", "mort", "morx",
  "opbd", "prop", "trak", "Zapf", "Silf", "Glat", "Gloc", "Feat", "Sill",
];

function asBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  throw new TypeError("Font input: expected an ArrayBuffer or Uint8Array.");
}

function requireRange(bytes, offset, size, path) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0 ||
    offset > bytes.byteLength - size) {
    throw new Error(
      `${path}: need ${size} byte(s) at offset ${offset}, file is ${bytes.byteLength} bytes.`,
    );
  }
}

function formatTag(bytes, offset) {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}

function formatLongDateTime(view, offset) {
  const seconds = view.getBigInt64(offset, false);
  const milliseconds = (seconds - 2082844800n) * 1000n;
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
  if (!table.inBounds || table.length < 54) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset + table.offset, 54);
  return {
    unitsPerEm: view.getUint16(18, false), created: formatLongDateTime(view, 20),
    modified: formatLongDateTime(view, 28), indexToLocFormat: view.getInt16(50, false),
  };
}

function parseMaxp(bytes, table) {
  if (!table.inBounds || table.length < 6) return null;
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
  requireRange(bytes, SFNT_HEADER_SIZE, numTables * TABLE_RECORD_SIZE, "SFNT table directory");
  const tables = Array.from({ length: numTables }, (_, index) => {
    const recordOffset = SFNT_HEADER_SIZE + index * TABLE_RECORD_SIZE;
    const tag = formatTag(bytes, recordOffset);
    const offset = view.getUint32(recordOffset + 8, false);
    const length = view.getUint32(recordOffset + 12, false);
    return {
      index, tag, label: TABLE_LABELS[tag] ?? null,
      checksum: view.getUint32(recordOffset + 4, false), offset, length,
      inBounds: offset <= bytes.byteLength && length <= bytes.byteLength - offset,
    };
  });
  const byTag = new Map(tables.map((table) => [table.tag, table]));
  return {
    format: sfntVersion === 0x4f54544f ? "OTF (CFF SFNT)" : "TTF/SFNT",
    fileSize: bytes.byteLength,
    sfntVersion: {
      value: sfntVersion, hex: `0x${sfntVersion.toString(16).padStart(8, "0")}`,
      label: VERSION_LABELS.get(sfntVersion) ?? "Unknown SFNT flavor",
    },
    numTables, searchRange: view.getUint16(6, false), entrySelector: view.getUint16(8, false),
    rangeShift: view.getUint16(10, false), tables,
    head: parseHead(bytes, byTag.get("head") ?? {}),
    maxp: parseMaxp(bytes, byTag.get("maxp") ?? {}),
  };
}

function validateDeclaredLength(bytes, declaredLength, format) {
  if (declaredLength < 1 || declaredLength > bytes.byteLength) {
    throw new Error(
      `The ${format} file is truncated (its declared length exceeds the available bytes).`,
    );
  }
}

function parseWoff(bytes) {
  requireRange(bytes, 0, 44, "WOFF header");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(8, false);
  const numTables = view.getUint16(12, false);
  validateDeclaredLength(bytes, length, "WOFF");
  requireRange(bytes, 44, numTables * 20, "WOFF table directory");
  const tables = Array.from({ length: numTables }, (_, index) => {
    const offset = 44 + index * 20;
    const tableOffset = view.getUint32(offset + 4, false);
    const compLength = view.getUint32(offset + 8, false);
    requireRange(bytes, tableOffset, compLength, `WOFF table "${formatTag(bytes, offset)}"`);
    return {
      tag: formatTag(bytes, offset),
      offset: tableOffset,
      compLength,
      origLength: view.getUint32(offset + 12, false),
      origChecksum: view.getUint32(offset + 16, false),
    };
  });
  return { format: "WOFF", header: {
    signature: WOFF_SIGNATURE, flavor: formatTag(bytes, 4), length, numTables,
    totalSfntSize: view.getUint32(16, false), majorVersion: view.getUint16(20, false),
    minorVersion: view.getUint16(22, false), metaOffset: view.getUint32(24, false),
    metaLength: view.getUint32(28, false), privOffset: view.getUint32(36, false),
    privLength: view.getUint32(40, false),
  }, tables };
}

function readBase128(bytes, cursor) {
  let value = 0;
  for (let index = 0; index < 5; index += 1) {
    requireRange(bytes, cursor.offset, 1, "WOFF2 table directory");
    const byte = bytes[cursor.offset++];
    if (index === 0 && byte === 0x80) throw new Error("The WOFF2 table length is malformed.");
    if (value > 0x01ffffff) throw new Error("The WOFF2 table length is too large.");
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return value;
  }
  throw new Error("The WOFF2 table length is malformed.");
}

function parseWoff2(bytes) {
  requireRange(bytes, 0, 48, "WOFF2 header");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(8, false);
  const numTables = view.getUint16(12, false);
  validateDeclaredLength(bytes, length, "WOFF2");
  const cursor = { offset: 48 };
  const tables = Array.from({ length: numTables }, () => {
    requireRange(bytes, cursor.offset, 1, "WOFF2 table directory");
    const flags = bytes[cursor.offset++];
    const tagIndex = flags & 0x3f;
    const transformVersion = flags >>> 6;
    let tag = WOFF2_KNOWN_TAGS[tagIndex];
    if (tagIndex === 0x3f) {
      requireRange(bytes, cursor.offset, 4, "WOFF2 custom table tag");
      tag = formatTag(bytes, cursor.offset);
      cursor.offset += 4;
    }
    if (!tag) throw new Error("The WOFF2 table tag index is malformed.");
    const origLength = readBase128(bytes, cursor);
    const transformed = (tag === "glyf" || tag === "loca") ? transformVersion === 0 :
      tag === "hmtx" && transformVersion === 1;
    return { tag, origLength, transformVersion,
      transformLength: transformed ? readBase128(bytes, cursor) : null };
  });
  return { format: "WOFF2", header: {
    signature: WOFF2_SIGNATURE, flavor: formatTag(bytes, 4), length, numTables,
    totalSfntSize: view.getUint32(16, false), totalCompressedSize: view.getUint32(20, false),
    majorVersion: view.getUint16(24, false), minorVersion: view.getUint16(26, false),
    metaOffset: view.getUint32(28, false), metaLength: view.getUint32(32, false),
    privOffset: view.getUint32(40, false), privLength: view.getUint32(44, false),
  }, tables };
}

/**
 * Inspects a TTF, OTF, WOFF, or WOFF2 file without decoding font glyph data.
 *
 * @param {ArrayBuffer|Uint8Array} input Raw font bytes.
 * @returns {object} Parsed format-specific header and table directory.
 */
export function inspectFontHeader(input) {
  const bytes = asBytes(input);
  requireRange(bytes, 0, 4, "font signature");
  const signature = formatTag(bytes, 0);
  if (signature === WOFF_SIGNATURE) return parseWoff(bytes);
  if (signature === WOFF2_SIGNATURE) return parseWoff2(bytes);
  if (VERSION_LABELS.has(new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, false))) {
    return parseSfnt(bytes);
  }
  throw new Error("Unsupported font signature. Choose a TTF, OTF, WOFF, or WOFF2 file.");
}

/**
 * Decodes a Base64 string into bytes suitable for font parsing.
 *
 * @param {string} value Base64 input, optionally separated by whitespace.
 * @returns {Uint8Array} Decoded bytes.
 */
export function decodeBase64(value) {
  const cleaned = typeof value === "string" ? value.replace(/\s/g, "") : "";
  if (!cleaned || cleaned.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) {
    throw new Error("Base64 input: provide valid, padded Base64 data.");
  }
  try {
    return Uint8Array.from(atob(cleaned), (character) => character.charCodeAt(0));
  } catch {
    throw new Error("Base64 input: provide valid, padded Base64 data.");
  }
}
