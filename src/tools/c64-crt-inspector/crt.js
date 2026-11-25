const HARDWARE = {
  0: 'Normal cartridge', 1: 'Action Replay', 2: 'KCS Power Cartridge',
  3: 'Final Cartridge III', 4: 'Simons Basic', 5: 'Ocean Type 1',
  7: 'Fun Play', 8: 'Super Games', 9: 'Atomic Power', 10: 'Epyx Fastload',
  15: 'C64 Game System', 19: 'Magic Desk', 32: 'EasyFlash',
};
const CHIP_TYPES = ['ROM', 'RAM', 'Flash'];
const MAX_PACKETS = 4096;

function readSlice(file, start, length) {
  const blob = file.slice(start, start + length);
  if (blob.arrayBuffer) return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

function text(bytes) {
  return Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
}

/** Inspect a CRT file using only its header and packet headers. */
export async function inspectCrt(file) {
  const report = { header: null, chips: [], warnings: [] };
  const warn = (message) => report.warnings.push(message);
  try {
    const headerBytes = new Uint8Array(await readSlice(file, 0, 64));
    if (headerBytes.length < 64) {
      warn('Truncated CRT header.');
      return report;
    }
    if (text(headerBytes.subarray(0, 16)) !== 'C64 CARTRIDGE   ') {
      warn('Invalid CRT signature.');
      return report;
    }
    const view = new DataView(headerBytes.buffer, headerBytes.byteOffset, headerBytes.byteLength);
    const headerLength = view.getUint32(16);
    const version = view.getUint16(20);
    const hardware = view.getUint16(22);
    report.header = {
      headerLength, version, hardware, hardwareName: HARDWARE[hardware] ?? 'Unknown',
      exrom: headerBytes[24], game: headerBytes[25],
      name: text(headerBytes.subarray(32, 64)).replace(/\0.*$/, '').trimEnd(),
    };
    if (!(hardware in HARDWARE)) warn(`Unknown hardware type ${hardware}.`);
    if (headerBytes[24] > 1 || headerBytes[25] > 1) warn('Invalid EXROM or GAME line value.');
    if (headerLength < 64) {
      warn('Malformed CRT header length.');
      return report;
    }
    if (headerLength > file.size) {
      warn('Truncated CRT header: header length exceeds file size.');
      return report;
    }
    let offset = headerLength;
    while (offset < file.size && report.chips.length < MAX_PACKETS) {
      if (file.size - offset < 16) {
        warn('Truncated or trailing data after CHIP packets.');
        break;
      }
      const bytes = new Uint8Array(await readSlice(file, offset, 16));
      if (bytes.length < 16) {
        warn('Truncated CHIP header.');
        break;
      }
      if (text(bytes.subarray(0, 4)) !== 'CHIP') {
        warn('Malformed CHIP signature or trailing data.');
        break;
      }
      const chipView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const length = chipView.getUint32(4);
      const type = chipView.getUint16(8);
      const imageSize = chipView.getUint16(14);
      if (length < 16 || length !== 16 + imageSize) {
        warn('Malformed CHIP packet length or image size.');
        break;
      }
      if (length > file.size - offset) {
        warn('CHIP packet length exceeds file size.');
        break;
      }
      if (type >= CHIP_TYPES.length) warn(`Unknown CHIP type ${type}.`);
      report.chips.push({
        length, type, typeName: CHIP_TYPES[type] ?? 'Unknown', bank: chipView.getUint16(10),
        address: chipView.getUint16(12), imageSize,
      });
      offset += length;
    }
    if (offset < file.size && report.chips.length === MAX_PACKETS) {
      warn(`Packet limit of ${MAX_PACKETS} reached; remaining data was not inspected.`);
    }
  } catch {
    warn('Unable to read the file.');
  }
  return report;
}
