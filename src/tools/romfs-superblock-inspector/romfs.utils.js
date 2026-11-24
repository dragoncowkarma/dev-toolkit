const MAGIC = '-rom1fs-';
const FIXED_HEADER_SIZE = 16;
const CHECKSUM_LIMIT = 512;

/** Parse a ROMFS header from the first 512 bytes of a file. */
export function parseRomfsHeader(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < FIXED_HEADER_SIZE) throw new Error('Truncated ROMFS header.');
  const magic = String.fromCharCode(...bytes.subarray(0, 8));
  if (magic !== MAGIC) throw new Error('Wrong ROMFS magic; expected -rom1fs-.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fullSize = view.getUint32(8, false);
  const checksum = view.getUint32(12, false);
  const terminator = bytes.indexOf(0, FIXED_HEADER_SIZE);
  if (terminator === -1) {
    throw new Error('Unterminated volume name or truncated ROMFS header.');
  }
  const firstFileOffset = Math.ceil((terminator + 1) / 16) * 16;
  if (bytes.length < firstFileOffset) throw new Error('Truncated ROMFS header padding.');
  const checksumLength = Math.min(fullSize, CHECKSUM_LIMIT);
  if (bytes.length < checksumLength) throw new Error('Truncated input for ROMFS checksum.');
  let sum = 0;
  for (let offset = 0; offset < checksumLength; offset += 4) {
    let word = 0;
    for (let index = 0; index < 4; index += 1) {
      word = (word << 8) | (offset + index < checksumLength ? bytes[offset + index] : 0);
    }
    sum = (sum + (word >>> 0)) >>> 0;
  }
  return {
    magic,
    fullSize,
    checksum,
    volumeName: new TextDecoder().decode(bytes.subarray(FIXED_HEADER_SIZE, terminator)),
    firstFileOffset,
    headerExceedsSize: fullSize < firstFileOffset,
    checksumValid: sum === 0,
  };
}
