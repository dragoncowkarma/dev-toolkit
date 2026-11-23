const HEADER_LENGTH = 28;
const CHECKSUMS = ['None', 'SHA-1', 'MD5', 'SHA-256', 'SHA-512'];

/**
 * Parses a XAR header and checks its declared boundaries.
 * @param {ArrayBuffer} buffer The first 28 bytes of the file.
 * @param {number} fileSize Total file size in bytes.
 * @returns {object} Header fields and derived information.
 */
export function parseXarHeader(buffer, fileSize = buffer?.byteLength) {
  if (!buffer) throw new Error('Select a file to inspect.');
  if (buffer.byteLength < HEADER_LENGTH) throw new Error('File is shorter than 28 bytes.');
  const view = new DataView(buffer);
  if (view.getUint32(0) !== 0x78617221) throw new Error('Invalid XAR magic.');
  const size = view.getUint16(4);
  if (size < HEADER_LENGTH) {
    throw new Error('Unsupported header size: size is below 28 bytes.');
  }
  if (size > fileSize) throw new Error('Unsupported header size: header extends past the file.');
  const tocLengthCompressed = view.getBigUint64(8);
  const tocLengthUncompressed = view.getBigUint64(16);
  const checksumAlg = view.getUint32(24);
  const heapOffset = BigInt(size) + tocLengthCompressed;
  return {
    size,
    version: view.getUint16(6),
    tocLengthCompressed,
    tocLengthUncompressed,
    checksum: CHECKSUMS[checksumAlg] ?? `Unknown (${checksumAlg})`,
    heapOffset,
    tocPastEof: heapOffset > BigInt(fileSize),
  };
}
