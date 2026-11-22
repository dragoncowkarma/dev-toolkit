const HEADER_SIZE = 12;
const ENTRY_FIXED_SIZE = 62;
const CHECKSUM_SIZE = 20;
export const DISPLAY_ENTRY_CAP = 200;

function truncatedEntryError() {
  return new Error('The index entry table is truncated or incomplete.');
}

function readByte(view, offset, limit) {
  if (offset >= limit) throw truncatedEntryError();
  return view.getUint8(offset);
}

function readNullTerminatedText(bytes, offset, limit) {
  let end = offset;
  while (end < limit && bytes[end] !== 0) end += 1;
  if (end === limit) throw truncatedEntryError();
  return { text: new TextDecoder().decode(bytes.subarray(offset, end)), nextOffset: end + 1 };
}

function readV4PrefixLength(view, offset, limit) {
  let value = 0;
  let nextOffset = offset;
  while (true) {
    const byte = readByte(view, nextOffset, limit);
    nextOffset += 1;
    value = (value << 7) + (byte & 0x7f);
    if ((byte & 0x80) === 0) return { value, nextOffset };
    value += 1;
  }
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function describeMode(mode) {
  const type = mode & 0o170000;
  const typeName = type === 0o120000 ? 'symlink' : type === 0o160000 ? 'gitlink' : 'regular';
  return { type: typeName, permissions: (mode & 0o7777).toString(8).padStart(4, '0') };
}

function parseEntry(view, bytes, offset, version, previousPath, limit) {
  if (offset + ENTRY_FIXED_SIZE > limit) throw truncatedEntryError();
  const flags = view.getUint16(offset + 60);
  const hasExtendedFlags = (flags & 0x4000) !== 0;
  const fixedSize = ENTRY_FIXED_SIZE + (hasExtendedFlags ? 2 : 0);
  if (offset + fixedSize > limit) throw truncatedEntryError();

  let nextOffset = offset + fixedSize;
  let path;
  if (version === 4) {
    const prefix = readV4PrefixLength(view, nextOffset, limit);
    if (prefix.value > previousPath.length) throw truncatedEntryError();
    const suffix = readNullTerminatedText(bytes, prefix.nextOffset, limit);
    path = `${previousPath.slice(0, previousPath.length - prefix.value)}${suffix.text}`;
    nextOffset = suffix.nextOffset;
  } else {
    const name = readNullTerminatedText(bytes, nextOffset, limit);
    path = name.text;
    nextOffset = name.nextOffset;
    nextOffset = offset + Math.ceil((nextOffset - offset) / 8) * 8;
    if (nextOffset > limit) throw truncatedEntryError();
  }

  const mode = describeMode(view.getUint32(offset + 24));
  return {
    entry: {
      ctime: { seconds: view.getUint32(offset), nanoseconds: view.getUint32(offset + 4) },
      mtime: { seconds: view.getUint32(offset + 8), nanoseconds: view.getUint32(offset + 12) },
      dev: view.getUint32(offset + 16),
      ino: view.getUint32(offset + 20),
      mode,
      uid: view.getUint32(offset + 28),
      gid: view.getUint32(offset + 32),
      size: view.getUint32(offset + 36),
      sha1: bytesToHex(bytes.subarray(offset + 40, offset + 60)),
      flags: {
        assumeValid: (flags & 0x8000) !== 0,
        extended: hasExtendedFlags,
        stage: (flags >> 12) & 0x3,
        nameLength: flags & 0x0fff,
      },
      path,
    },
    nextOffset,
  };
}

/**
 * Parses a Git index buffer without sending data outside the browser.
 *
 * @param {ArrayBuffer} buffer - The selected .git/index contents.
 * @returns {object} Parsed Git index data.
 */
export function parseGitIndex(buffer) {
  if (!buffer) throw new Error('Select a Git index file to inspect.');
  if (buffer.byteLength < HEADER_SIZE) {
    throw new Error('The selected file is shorter than the 12-byte Git index header.');
  }
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const signature = new TextDecoder().decode(bytes.subarray(0, 4));
  if (signature !== 'DIRC') throw new Error('Invalid Git index signature: expected DIRC.');

  const version = view.getUint32(4);
  const entryCount = view.getUint32(8);
  const limit = bytes.length - CHECKSUM_SIZE;
  if (limit < HEADER_SIZE) throw truncatedEntryError();

  const entries = [];
  let offset = HEADER_SIZE;
  let previousPath = '';
  for (let index = 0; index < entryCount; index += 1) {
    const parsed = parseEntry(view, bytes, offset, version, previousPath, limit);
    if (entries.length < DISPLAY_ENTRY_CAP) entries.push(parsed.entry);
    previousPath = parsed.entry.path;
    offset = parsed.nextOffset;
  }

  const extensions = [];
  while (offset < limit) {
    if (offset + 8 > limit) throw truncatedEntryError();
    const signatureText = new TextDecoder().decode(bytes.subarray(offset, offset + 4));
    const size = view.getUint32(offset + 4);
    offset += 8;
    if (size > limit - offset) throw truncatedEntryError();
    extensions.push({ signature: signatureText, size });
    offset += size;
  }

  return {
    signature,
    version,
    versionLabel: [2, 3, 4].includes(version) ? String(version) : `Unknown (${version})`,
    entryCount,
    entries,
    extensions,
    checksum: bytesToHex(bytes.subarray(limit)),
  };
}

/**
 * Reads a browser File as an ArrayBuffer.
 *
 * @param {File} file - A selected local file.
 * @returns {Promise<ArrayBuffer>} The file contents.
 */
export function readIndexFile(file) {
  if (!file) return Promise.reject(new Error('Select a Git index file to inspect.'));
  return file.arrayBuffer();
}
