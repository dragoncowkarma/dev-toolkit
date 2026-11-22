export const HEADER_BYTES = 320 * 1024;
const BLOCK_SIZE = 64 * 1024;

function signature(bytes, offset, text) {
  return [...text].every((char, index) => bytes[offset + index] === char.charCodeAt(0));
}

function guid(view, offset) {
  const hex = (value, width) => value.toString(16).padStart(width, '0');
  const tail = Array.from({ length: 8 }, (_, i) => hex(view.getUint8(offset + 8 + i), 2));
  return [
    hex(view.getUint32(offset, true), 8), hex(view.getUint16(offset + 4, true), 4),
    hex(view.getUint16(offset + 6, true), 4), tail.slice(0, 2).join(''), tail.slice(2).join(''),
  ].join('-');
}

function readHeader(view, offset) {
  return {
    offset,
    checksum: view.getUint32(offset + 4, true),
    sequence: view.getBigUint64(offset + 8, true),
    fileWriteGuid: guid(view, offset + 16),
    dataWriteGuid: guid(view, offset + 32),
    logGuid: guid(view, offset + 48),
    logVersion: view.getUint16(offset + 64, true),
    version: view.getUint16(offset + 66, true),
    logLength: view.getUint32(offset + 68, true),
    logOffset: view.getBigUint64(offset + 72, true),
  };
}

function readRegionTable(view, offset) {
  const count = view.getUint32(offset + 8, true);
  if (count > (BLOCK_SIZE - 16) / 32) return null;
  const entries = Array.from({ length: count }, (_, index) => {
    const entry = offset + 16 + index * 32;
    return {
      guid: guid(view, entry),
      offset: view.getBigUint64(entry + 16, true),
      length: view.getUint32(entry + 24, true),
      required: (view.getUint32(entry + 28, true) & 1) !== 0,
    };
  });
  return { offset, checksum: view.getUint32(offset + 4, true), entries };
}

/** Parse the fixed VHDX header area.
 * @param {Uint8Array} bytes Header bytes.
 * @returns {object} Parsed data or an error.
 */
export function parseVhdx(bytes) {
  try {
    if (!(bytes instanceof Uint8Array) || bytes.length < HEADER_BYTES) {
      return { ok: false, error: 'Truncated VHDX header region (320 KiB required).' };
    }
    if (!signature(bytes, 0, 'vhdxfile')) {
      return { ok: false, error: 'Invalid VHDX file signature.' };
    }
    if (![BLOCK_SIZE, 2 * BLOCK_SIZE].every((offset) => signature(bytes, offset, 'head'))) {
      return { ok: false, error: 'Invalid VHDX header signature.' };
    }
    if (![3 * BLOCK_SIZE, 4 * BLOCK_SIZE].every((offset) => signature(bytes, offset, 'regi'))) {
      return { ok: false, error: 'Invalid VHDX region table signature.' };
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const creator = new TextDecoder('utf-16le').decode(bytes.subarray(8, 520)).split('\0')[0];
    const regionTables = [3 * BLOCK_SIZE, 4 * BLOCK_SIZE]
      .map((offset) => readRegionTable(view, offset));
    if (regionTables.some((table) => table === null)) {
      return { ok: false, error: 'Invalid VHDX region table entry count.' };
    }
    return {
      ok: true,
      creator,
      headers: [BLOCK_SIZE, 2 * BLOCK_SIZE].map((offset) => readHeader(view, offset)),
      regionTables,
    };
  } catch {
    return { ok: false, error: 'Unable to parse the VHDX header region.' };
  }
}

/** Convert hexadecimal text to bytes.
 * @param {string} input Hexadecimal text.
 * @returns {object} Bytes or an error.
 */
export function parseHex(input) {
  const clean = input.replace(/\s/g, '');
  if (!clean || clean.length % 2 || !/^[\da-f]+$/i.test(clean)) {
    return { ok: false, error: 'Enter complete hexadecimal byte pairs separated by whitespace.' };
  }
  if (clean.length > HEADER_BYTES * 2) {
    return { ok: false, error: 'Hex input exceeds the 320 KiB header region.' };
  }
  return { ok: true, bytes: Uint8Array.from(clean.match(/../g), (pair) => parseInt(pair, 16)) };
}
