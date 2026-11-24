const BOOT_SECTOR_SIZE = 512;
const READ_LIMIT = 4096;

/**
 * Parse the first ReFS volume boot sector using little-endian fields.
 * @param {ArrayBuffer} buffer Boot sector bytes.
 * @returns {object} Parsed boot sector fields.
 * @throws {Error} If the sector is truncated or has invalid signatures.
 */
export function parseBootSector(buffer) {
  if (buffer.byteLength < BOOT_SECTOR_SIZE) {
    throw new Error('Truncated input: a ReFS boot sector requires at least 512 bytes.');
  }
  const bytes = new Uint8Array(buffer);
  const matches = (offset, value) =>
    [...value].every((character, index) => bytes[offset + index] === character.charCodeAt(0));
  if (!matches(3, 'ReFS')) throw new Error('Invalid ReFS file system name.');
  if (!matches(16, 'FSRS')) throw new Error('Invalid FSRS signature.');

  const view = new DataView(buffer);
  return {
    structureLength: view.getUint16(20, true),
    checksum: view.getUint16(22, true),
    sectorCount: view.getBigUint64(24, true),
    bytesPerSector: view.getUint32(32, true),
    sectorsPerCluster: view.getUint32(36, true),
    majorVersion: view.getUint8(40),
    minorVersion: view.getUint8(41),
    serialNumber: view.getBigUint64(56, true),
  };
}

/**
 * Read at most the first 4 KiB of a file.
 * @param {File} file Selected image or boot sector.
 * @returns {Promise<ArrayBuffer>} The bounded prefix.
 */
export function readFilePrefix(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.onabort = () => reject(new Error('File read was aborted.'));
    reader.readAsArrayBuffer(file.slice(0, READ_LIMIT));
  });
}
