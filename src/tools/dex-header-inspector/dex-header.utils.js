const DEX_HEADER_SIZE = 112;
const ENDIAN_CONSTANT = 0x12345678;
const REVERSE_ENDIAN_CONSTANT = 0x78563412;

const SECTION_FIELDS = [
  ['Map list', 52],
  ['String IDs', 56],
  ['Type IDs', 64],
  ['Proto IDs', 72],
  ['Field IDs', 80],
  ['Method IDs', 88],
  ['Class defs', 96],
];

/**
 * Converts hexadecimal or Base64 text into raw bytes.
 * @param {string} value
 * @returns {Uint8Array}
 */
export function decodeDexInput(value) {
  const compact = value.replace(/\s/g, '');
  if (!compact) throw new Error('Paste hexadecimal or Base64 DEX data first.');

  if (/^(?:0x)?[0-9a-f]+$/i.test(compact)) {
    const hex = compact.replace(/^0x/i, '');
    if (hex.length % 2 !== 0) {
      throw new Error('Hexadecimal input must contain complete byte pairs.');
    }
    return Uint8Array.from(hex.match(/.{2}/g), (pair) => Number.parseInt(pair, 16));
  }

  try {
    const binary = atob(compact);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new Error('Input must be valid hexadecimal or Base64 data.');
  }
}

/**
 * Parses the fixed-size Android DEX header without executing file contents.
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {{version: string, byteOrder: string, checksum: number, signature: string,
 * fileSize: number,
 * headerSize: number, endianTag: number, linkSize: number, linkOffset: number,
 * sections: Array<{name: string, size: number|null, offset: number}>}}
 */
export function parseDexHeader(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < DEX_HEADER_SIZE) {
    throw new Error(`Truncated DEX header: expected at least ${DEX_HEADER_SIZE} bytes.`);
  }

  const magic = String.fromCharCode(...bytes.slice(0, 8));
  const versionMatch = /^dex\n(0\d{2})\0$/.exec(magic);
  if (!versionMatch) throw new Error('Invalid DEX magic. Expected dex\\n0XX\\0.');

  const tagView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tagAsLittleEndian = tagView.getUint32(40, true);
  let littleEndian;
  if (tagAsLittleEndian === ENDIAN_CONSTANT) littleEndian = true;
  else if (tagAsLittleEndian === REVERSE_ENDIAN_CONSTANT) littleEndian = false;
  else throw new Error('Invalid DEX endian tag.');

  const readUint32 = (offset) => tagView.getUint32(offset, littleEndian);
  const sections = SECTION_FIELDS.map(([name, offset]) => ({
    name,
    // The header stores only the map-list offset. Its item count starts at
    // that offset, so it is intentionally not read from unvalidated file data.
    size: name === 'Map list' ? null : readUint32(offset),
    offset: name === 'Map list' ? readUint32(offset) : readUint32(offset + 4),
  }));

  return {
    version: versionMatch[1],
    byteOrder: littleEndian ? 'Little endian' : 'Big endian (reverse endian)',
    checksum: readUint32(8),
    signature: Array.from(bytes.slice(12, 32), (byte) =>
      byte.toString(16).padStart(2, '0')
    ).join(''),
    fileSize: readUint32(32),
    headerSize: readUint32(36),
    endianTag: readUint32(40),
    linkSize: readUint32(44),
    linkOffset: readUint32(48),
    sections,
  };
}

/**
 * Reads a File as bytes without uploading it.
 * @param {File} file
 * @returns {Promise<Uint8Array>}
 */
export async function readDexFile(file) {
  return new Uint8Array(await file.arrayBuffer());
}

/**
 * Formats an unsigned 32-bit number as a hexadecimal offset/value.
 * @param {number} value
 * @returns {string}
 */
export function formatHex(value) {
  return `0x${value.toString(16).padStart(8, '0')}`;
}
