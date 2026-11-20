const HEADER_LENGTH = 100;
const SQLITE_MAGIC = 'SQLite format 3\u0000';
const TEXT_ENCODINGS = {
  0: 'Unspecified',
  1: 'UTF-8',
  2: 'UTF-16le',
  3: 'UTF-16be',
};

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ');
}

function isValidPageSize(pageSize) {
  return pageSize >= 512 && pageSize <= 65536 && (pageSize & (pageSize - 1)) === 0;
}

function formatSqliteVersion(version) {
  const major = Math.floor(version / 1000000);
  const minor = Math.floor((version % 1000000) / 1000);
  const release = version % 1000;
  return `${major}.${minor}.${release} (${version})`;
}

function formatFileFormatVersion(version) {
  if (version === 1) return 'Legacy rollback journal';
  if (version === 2) return 'WAL';
  return `Unknown (${version})`;
}

function addField(fields, label, bytes, offset, length, value) {
  fields.push({
    label,
    rawBytes: bytesToHex(bytes.slice(offset, offset + length)),
    value,
  });
}

/**
 * Parses the fixed 100-byte SQLite database header without reading database pages.
 *
 * @param {ArrayBuffer|Uint8Array} input - File bytes containing a SQLite header.
 * @returns {{ fields: Array<{label: string, rawBytes: string, value: string|number}> }}
 * @throws {Error} When the input is not a complete, valid SQLite header.
 */
export function parseSqliteHeader(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < HEADER_LENGTH) {
    throw new Error(
      `Truncated SQLite file: expected at least ${HEADER_LENGTH} bytes, found ${bytes.length}.`
    );
  }

  const magic = new TextDecoder('ascii').decode(bytes.slice(0, 16));
  if (magic !== SQLITE_MAGIC) {
    throw new Error('Invalid SQLite header: expected the "SQLite format 3" magic string.');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, HEADER_LENGTH);
  const rawPageSize = view.getUint16(16, false);
  const pageSize = rawPageSize === 1 ? 65536 : rawPageSize;
  if (!isValidPageSize(pageSize)) {
    throw new Error(
      `Invalid SQLite page size: ${rawPageSize}. Expected a power of two from 512 to 65536.`
    );
  }

  const fields = [];
  addField(fields, 'Magic string', bytes, 0, 16, 'SQLite format 3');
  addField(fields, 'Page size', bytes, 16, 2, `${pageSize.toLocaleString()} bytes`);
  addField(
    fields, 'File format write version', bytes, 18, 1, formatFileFormatVersion(bytes[18])
  );
  addField(
    fields, 'File format read version', bytes, 19, 1, formatFileFormatVersion(bytes[19])
  );
  addField(fields, 'Reserved space at end of each page', bytes, 20, 1, `${bytes[20]} bytes`);
  addField(fields, 'Maximum embedded payload fraction', bytes, 21, 1, bytes[21]);
  addField(fields, 'Minimum embedded payload fraction', bytes, 22, 1, bytes[22]);
  addField(fields, 'Leaf payload fraction', bytes, 23, 1, bytes[23]);
  addField(fields, 'File change counter', bytes, 24, 4, view.getUint32(24, false));
  addField(fields, 'Database size in pages', bytes, 28, 4, view.getUint32(28, false));
  addField(fields, 'Freelist trunk page', bytes, 32, 4, view.getUint32(32, false));
  addField(fields, 'Freelist page count', bytes, 36, 4, view.getUint32(36, false));
  addField(fields, 'Schema cookie', bytes, 40, 4, view.getUint32(40, false));
  addField(fields, 'Schema format number', bytes, 44, 4, view.getUint32(44, false));
  addField(fields, 'Default page cache size', bytes, 48, 4, view.getInt32(48, false));
  addField(
    fields, 'Largest root b-tree page (auto-vacuum)', bytes, 52, 4, view.getUint32(52, false)
  );
  const encoding = view.getUint32(56, false);
  addField(
    fields, 'Text encoding', bytes, 56, 4, TEXT_ENCODINGS[encoding] ?? `Unknown (${encoding})`
  );
  addField(fields, 'User version', bytes, 60, 4, view.getUint32(60, false));
  addField(fields, 'Incremental-vacuum mode', bytes, 64, 4, view.getUint32(64, false));
  addField(
    fields, 'Application ID', bytes, 68, 4,
    `0x${view.getUint32(68, false).toString(16).padStart(8, '0')}`
  );
  addField(fields, 'Version-valid-for number', bytes, 92, 4, view.getUint32(92, false));
  addField(
    fields, 'SQLite version number', bytes, 96, 4, formatSqliteVersion(view.getUint32(96, false))
  );

  return { fields };
}
