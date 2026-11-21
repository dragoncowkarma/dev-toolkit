const SIGNATURE = [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c];
const SIGNATURE_HEADER_SIZE = 32;
const START_HEADER_OFFSET = 12;
const START_HEADER_SIZE = 20;

let crcTable;

function getCrcTable() {
  if (crcTable) return crcTable;

  crcTable = new Uint32Array(256);
  for (let index = 0; index < crcTable.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
    }
    crcTable[index] = value >>> 0;
  }
  return crcTable;
}

/**
 * Calculates an IEEE CRC32 checksum for the supplied bytes.
 *
 * @param {Uint8Array} bytes - Bytes to checksum.
 * @returns {number} The unsigned CRC32 value.
 */
export function calculateCrc32(bytes) {
  let crc = 0xffffffff;
  const table = getCrcTable();
  for (const byte of bytes) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function hasValidSignature(bytes) {
  return SIGNATURE.every((byte, index) => bytes[index] === byte);
}

function formatCrc32(value) {
  return `0x${value.toString(16).padStart(8, '0').toUpperCase()}`;
}

/**
 * Parses a 7-Zip signature header without reading or decompressing its next header.
 *
 * @param {ArrayBuffer|Uint8Array} input - The archive bytes beginning at offset zero.
 * @returns {{version: string, declaredStartHeaderCrc32: string, computedStartHeaderCrc32: string,
 *   nextHeaderOffset: string, nextHeaderSize: string, nextHeaderCrc32: string}}
 * @throws {Error} When the input is not a complete, valid 7-Zip signature header.
 */
export function parse7zSignatureHeader(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < SIGNATURE_HEADER_SIZE) {
    throw new Error('The file is too short to contain a complete 7-Zip signature header.');
  }
  if (!hasValidSignature(bytes)) {
    throw new Error('Invalid 7-Zip signature. Select a .7z archive.');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const declaredCrc32 = view.getUint32(8, true);
  const startHeader = bytes.slice(START_HEADER_OFFSET, START_HEADER_OFFSET + START_HEADER_SIZE);
  const computedCrc32 = calculateCrc32(startHeader);
  if (declaredCrc32 !== computedCrc32) {
    throw new Error(
      `Start header CRC32 mismatch: declared ${formatCrc32(declaredCrc32)}, ` +
        `computed ${formatCrc32(computedCrc32)}.`
    );
  }

  return {
    version: `${bytes[6]}.${bytes[7]}`,
    declaredStartHeaderCrc32: formatCrc32(declaredCrc32),
    computedStartHeaderCrc32: formatCrc32(computedCrc32),
    nextHeaderOffset: view.getBigUint64(12, true).toString(),
    nextHeaderSize: view.getBigUint64(20, true).toString(),
    nextHeaderCrc32: formatCrc32(view.getUint32(28, true)),
  };
}
