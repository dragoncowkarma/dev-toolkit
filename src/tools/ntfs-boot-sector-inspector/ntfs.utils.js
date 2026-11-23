const SECTOR_SIZE = 512;

/** Convert whitespace-separated or continuous hexadecimal text into bytes. */
export function parseHex(input) {
  const hex = input.replace(/\s/g, '');
  if (!hex || hex.length % 2 || !/^[\da-f]+$/i.test(hex)) {
    throw new Error('Enter valid hexadecimal bytes (two digits per byte).');
  }
  // Validate the entire input, but only retain the first sector.
  return Uint8Array.from(hex.slice(0, SECTOR_SIZE * 2).match(/../g), (byte) => parseInt(byte, 16));
}

/** Decode a signed NTFS record size code into clusters or bytes. */
export function decodeRecordSize(code) {
  return code < 0 ? `${2n ** BigInt(-code)} bytes` : `${code} clusters`;
}

/** Parse and validate the first 512 bytes of an NTFS boot sector. */
export function parseNtfsBootSector(input) {
  const bytes = new Uint8Array(
    input.buffer, input.byteOffset, Math.min(input.byteLength, SECTOR_SIZE),
  );
  if (bytes.length < SECTOR_SIZE) throw new Error('Truncated input: 512 bytes are required.');
  if (String.fromCharCode(...bytes.slice(3, 11)) !== 'NTFS    ') {
    throw new Error('Invalid OEM ID: expected NTFS followed by four spaces.');
  }
  if (bytes[510] !== 0x55 || bytes[511] !== 0xaa) {
    throw new Error('Invalid boot sector signature: expected 55 AA.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    bytesPerSector: view.getUint16(11, true),
    sectorsPerCluster: view.getUint8(13),
    mediaDescriptor: view.getUint8(21),
    sectorsPerTrack: view.getUint16(24, true),
    heads: view.getUint16(26, true),
    hiddenSectors: view.getUint32(28, true),
    totalSectors: view.getBigUint64(40, true),
    mftCluster: view.getBigUint64(48, true),
    mftMirrCluster: view.getBigUint64(56, true),
    mftRecordCode: view.getInt8(64),
    indexBufferCode: view.getInt8(68),
    serial: view.getBigUint64(72, true),
    checksum: view.getUint32(80, true),
    bytes,
  };
}

/** Format bytes as a hex dump with offsets. */
export function hexDump(bytes) {
  return Array.from({ length: Math.ceil(bytes.length / 16) }, (_, line) => {
    const offset = line * 16;
    const hex = Array.from(bytes.slice(offset, offset + 16), (byte) =>
      byte.toString(16).padStart(2, '0')).join(' ');
    return `${offset.toString(16).padStart(4, '0')}  ${hex}`;
  }).join('\n');
}
