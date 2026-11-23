const SECTOR_SIZE = 512;
const INPUT_SIZE = 4 * SECTOR_SIZE;

/** Convert whitespace-separated hexadecimal input to bytes. */
export function parseHex(input) {
  const hex = input.replace(/\s/g, '');
  if (!hex) return new Uint8Array();
  if (hex.length % 2 || !/^[0-9a-f]+$/i.test(hex)) {
    throw new Error('Enter complete hexadecimal byte pairs.');
  }
  return Uint8Array.from(hex.match(/../g), (byte) => parseInt(byte, 16));
}

/** Compute the LVM2 label CRC over bytes starting at the data offset field. */
export function lvmCrc(bytes) {
  let crc = 0xf597a6cf;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return crc >>> 0;
}

/** Parse an LVM2 PV label and its terminated disk-location lists. */
export function parseLvm2(bytes) {
  if (!bytes.length) throw new Error('Input is empty.');
  if (bytes.length < INPUT_SIZE) {
    throw new Error('Input is short: at least 2048 bytes are required.');
  }
  const ascii = (start, length) => String.fromCharCode(...bytes.subarray(start, start + length));
  let sectorIndex = -1;
  for (let index = 0; index < 4; index += 1) {
    if (ascii(index * SECTOR_SIZE, 8) === 'LABELONE') {
      sectorIndex = index;
      break;
    }
  }
  if (sectorIndex < 0) throw new Error('Not an LVM2 label: LABELONE was not found.');
  const start = sectorIndex * SECTOR_SIZE;
  const end = start + SECTOR_SIZE;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sectorNumber = view.getBigUint64(start + 8, true).toString();
  const storedCrc = view.getUint32(start + 16, true);
  const computedCrc = lvmCrc(bytes.subarray(start + 20, end));
  const dataOffset = view.getUint32(start + 20, true);
  const type = ascii(start + 24, 8);
  if (type !== 'LVM2 001') throw new Error('Not an LVM2 label: unsupported label type.');
  if (dataOffset < 32 || dataOffset + 40 > SECTOR_SIZE) {
    throw new Error('Invalid PV header offset in LVM2 label.');
  }
  const pvStart = start + dataOffset;
  const rawUuid = ascii(pvStart, 32);
  const uuid = [6, 4, 4, 4, 4, 4, 6].map((length, index, sizes) => {
    const offset = sizes.slice(0, index).reduce((sum, size) => sum + size, 0);
    return rawUuid.slice(offset, offset + length);
  }).join('-');
  const deviceSize = view.getBigUint64(pvStart + 32, true).toString();
  let cursor = pvStart + 40;
  function readList() {
    const items = [];
    while (cursor + 16 <= end) {
      const offset = view.getBigUint64(cursor, true);
      const size = view.getBigUint64(cursor + 8, true);
      cursor += 16;
      if (offset === 0n && size === 0n) return items;
      items.push({ offset: offset.toString(), size: size.toString() });
    }
    throw new Error('Invalid LVM2 label: unterminated area descriptor list.');
  }
  const dataAreas = readList();
  const metadataAreas = readList();
  return { sectorIndex, sectorNumber, storedCrc, computedCrc, dataOffset, type, uuid,
    deviceSize, dataAreas, metadataAreas };
}
