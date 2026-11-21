const ARCHIVE_MAGIC = '!<arch>\n';
const HEADER_SIZE = 60;
const decoder = new TextDecoder('ascii');

/**
 * Converts supported binary input into an unsigned byte array.
 *
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {Uint8Array}
 */
function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  throw new TypeError('Archive input must be an ArrayBuffer or Uint8Array.');
}

/**
 * Decodes an ASCII byte range after confirming it is present in the archive.
 *
 * @param {Uint8Array} bytes
 * @param {number} start
 * @param {number} length
 * @param {string} label
 * @returns {string}
 */
function readAscii(bytes, start, length, label) {
  if (start < 0 || length < 0 || start + length > bytes.length) {
    throw new Error(`Truncated archive while reading ${label}.`);
  }
  return decoder.decode(bytes.subarray(start, start + length));
}

/**
 * Parses a fixed-width decimal ar header field.
 *
 * @param {string} field
 * @param {string} label
 * @returns {number}
 */
function parseDecimalField(field, label) {
  const value = field.trim();
  if (!/^[0-9]+$/.test(value)) {
    throw new Error(`Invalid ${label} field in archive header.`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new Error(`Invalid ${label} field in archive header.`);
  }
  return number;
}

/**
 * Parses a fixed-width octal ar header field.
 *
 * @param {string} field
 * @returns {number}
 */
function parseMode(field) {
  const value = field.trim();
  if (!/^[0-7]+$/.test(value)) {
    throw new Error('Invalid mode field in archive header.');
  }
  return Number.parseInt(value, 8);
}

/**
 * Resolves a GNU long name from the archive's `//` filename table.
 *
 * @param {Uint8Array|null} nameTable
 * @param {number} offset
 * @returns {string}
 */
function resolveGnuName(nameTable, offset) {
  if (!nameTable) {
    throw new Error('GNU long filename reference appears before its filename table.');
  }
  if (offset < 0 || offset >= nameTable.length) {
    throw new Error('GNU long filename reference is outside the filename table.');
  }

  const ending = nameTable.indexOf(10, offset);
  const end = ending === -1 ? nameTable.length : ending;
  let name = decoder.decode(nameTable.subarray(offset, end));
  if (name.endsWith('/')) name = name.slice(0, -1);
  if (!name) throw new Error('GNU long filename reference resolves to an empty name.');
  return name;
}

/**
 * Parses a Unix ar archive without requiring browser or DOM APIs.
 *
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {{members: Array<{name: string, size: number, mode: number, mtime: number,
 * uid: number, gid: number}>}}
 * @throws {Error} When the archive is malformed or truncated.
 */
export function parseArArchive(input) {
  const bytes = toBytes(input);
  if (readAscii(bytes, 0, ARCHIVE_MAGIC.length, 'archive magic') !== ARCHIVE_MAGIC) {
    throw new Error('Not a Unix ar archive: expected !<arch> magic.');
  }

  const members = [];
  let gnuFilenameTable = null;
  let offset = ARCHIVE_MAGIC.length;

  while (offset < bytes.length) {
    if (bytes.length - offset < HEADER_SIZE) {
      throw new Error('Truncated archive member header.');
    }

    const header = offset;
    const rawName = readAscii(bytes, header, 16, 'member name').trim();
    const mtime = parseDecimalField(readAscii(bytes, header + 16, 12, 'mtime'), 'mtime');
    const uid = parseDecimalField(readAscii(bytes, header + 28, 6, 'uid'), 'uid');
    const gid = parseDecimalField(readAscii(bytes, header + 34, 6, 'gid'), 'gid');
    const mode = parseMode(readAscii(bytes, header + 40, 8, 'mode'));
    const storedSize = parseDecimalField(readAscii(bytes, header + 48, 10, 'size'), 'size');
    if (readAscii(bytes, header + 58, 2, 'member end marker') !== '`\n') {
      throw new Error('Invalid archive member header end marker.');
    }

    const bodyStart = header + HEADER_SIZE;
    const bodyEnd = bodyStart + storedSize;
    if (!Number.isSafeInteger(bodyEnd) || bodyEnd > bytes.length) {
      throw new Error('Truncated archive member data.');
    }
    const body = bytes.subarray(bodyStart, bodyEnd);
    offset = bodyEnd;

    if (rawName === '//') {
      gnuFilenameTable = body;
    } else if (rawName !== '/') {
      let name = rawName.endsWith('/') ? rawName.slice(0, -1) : rawName;
      let size = storedSize;

      if (rawName.startsWith('#1/')) {
        const nameLength = parseDecimalField(rawName.slice(3), 'BSD extended name length');
        if (nameLength > body.length) {
          throw new Error('Truncated BSD extended filename.');
        }
        name = decoder.decode(body.subarray(0, nameLength));
        size -= nameLength;
      } else if (/^\/[0-9]+$/.test(rawName)) {
        name = resolveGnuName(gnuFilenameTable, Number.parseInt(rawName.slice(1), 10));
      }

      if (!name) throw new Error('Archive member has an empty name.');
      members.push({ name, size, mode, mtime, uid, gid });
    }

    if (storedSize % 2 === 1) {
      if (offset >= bytes.length) {
        throw new Error('Truncated archive member padding.');
      }
      offset += 1;
    }
  }

  return { members };
}

/**
 * Formats an ar mode as an octal string for display.
 *
 * @param {number} mode
 * @returns {string}
 */
export function formatArMode(mode) {
  return mode.toString(8).padStart(4, '0');
}

/**
 * Formats a member timestamp for display in the user's locale.
 *
 * @param {number} seconds
 * @returns {string}
 */
export function formatArTimestamp(seconds) {
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
}
