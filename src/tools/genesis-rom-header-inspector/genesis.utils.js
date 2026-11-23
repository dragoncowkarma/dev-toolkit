/** Parse a Genesis ROM header and calculate the checksum over the ROM payload.
 * @param {ArrayBuffer} buffer ROM data.
 * @returns {object} Decoded header and checksum.
 */
export function parseGenesisRom(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 0x200) {
    throw new Error('The file is too short to contain a complete Genesis ROM header.');
  }
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const text = (offset, length) => Array.from(bytes.subarray(offset, offset + length))
    .map((byte) => (byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : ' '))
    .join('').trim();
  const system = text(0x100, 16);
  if (!/^SEGA\b/i.test(system)) {
    throw new Error('The file does not contain a recognizable Sega Genesis header.');
  }
  let calculatedChecksum = 0;
  for (let offset = 0x200; offset < bytes.length; offset += 2) {
    calculatedChecksum = (calculatedChecksum + (bytes[offset] << 8) + (bytes[offset + 1] ?? 0))
      & 0xffff;
  }
  return {
    system,
    copyright: text(0x110, 16),
    domesticTitle: text(0x120, 48),
    overseasTitle: text(0x150, 48),
    serial: text(0x180, 14),
    checksum: view.getUint16(0x18e),
    calculatedChecksum,
    devices: text(0x190, 16),
    romStart: view.getUint32(0x1a0),
    romEnd: view.getUint32(0x1a4),
    ramStart: view.getUint32(0x1a8),
    ramEnd: view.getUint32(0x1ac),
    region: text(0x1f0, 16),
  };
}
