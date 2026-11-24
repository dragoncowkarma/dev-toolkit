export const HEADER_OFFSET = 0x100000;
export const MAX_HEADER_BYTES = 65536;
const MAGIC = 0xc001d00d;

function uuid(view, offset) {
  const hex = (value, length) => value.toString(16).padStart(length, '0');
  const mac = Array.from({ length: 6 }, (_, i) => hex(view.getUint8(offset + 10 + i), 2));
  return `${hex(view.getUint32(offset, true), 8)}-${hex(view.getUint32(offset + 4, true), 8)}` +
    `-${hex(view.getUint16(offset + 8, true), 4)}-${mac.join('')}`;
}

function stringAt(bytes, offset, length) {
  const field = bytes.subarray(offset, offset + length);
  const end = field.indexOf(0);
  return new TextDecoder().decode(end < 0 ? field : field.subarray(0, end)).trim();
}

/** Parse an LVM device header and its first volume descriptor. */
export function parseVmfsHeader(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 4) throw new Error('Truncated device header.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== MAGIC) throw new Error('Invalid VMFS volume magic.');
  if (bytes.length < 0xd6) throw new Error('Truncated device header.');
  const u32 = (offset) => view.getUint32(offset, true);
  const u64 = (offset) => view.getBigUint64(offset, true);
  const major = u32(4);
  const alignment = u32(0xca);
  const volumeOffset = major >= 6 ? alignment : 0x200;
  if (major >= 6 && (volumeOffset < 0xd6 || volumeOffset + 0x64 > MAX_HEADER_BYTES)) {
    throw new Error('Unsupported LVM metadata alignment.');
  }
  if (u32(0x66) === 0) throw new Error('No logical volume in device header.');
  if (bytes.length < volumeOffset + 0x64) throw new Error('Truncated volume descriptor.');
  return {
    version: `${major}.${u32(8)}`,
    label: stringAt(bytes, volumeOffset + 0x14, 64),
    uuid: uuid(view, volumeOffset + 0x54),
    blockSize: u32(0x5a),
    logicalSize: u64(volumeOffset),
    deviceUuid: uuid(view, 0x82),
    totalBytes: u64(0x5e),
    volumeCount: u32(0x66),
    physicalExtents: u32(0x6a),
    lastExtent: u32(0x6e),
    generation: u64(0x72),
    dataOffset: u64(0x7a),
    created: u64(0x92),
    modified: u64(0x9a),
    extentMaps: u32(0xbe),
    extendedMetadataOffset: u64(0xc2),
    alignment,
    flags: u32(0xd2),
    vendor: stringAt(bytes, 0x12, 8),
    model: stringAt(bytes, 0x1a, 16),
  };
}

function readSlice(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = () => reject(new Error('Failed to read the selected file.'));
    reader.readAsArrayBuffer(blob);
  });
}

/** Read a bounded header from a partition image or a header slice. */
export async function readVmfsFile(file) {
  const first = await readSlice(file.slice(0, MAX_HEADER_BYTES));
  if (first.length >= 4 && new DataView(first.buffer).getUint32(0, true) === MAGIC) {
    return parseVmfsHeader(first);
  }
  if (file.size <= HEADER_OFFSET) return parseVmfsHeader(first);
  const header = await readSlice(file.slice(HEADER_OFFSET, HEADER_OFFSET + MAX_HEADER_BYTES));
  return parseVmfsHeader(header);
}
