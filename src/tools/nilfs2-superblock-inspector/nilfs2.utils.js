const SUPERBLOCK_SIZE = 1024;
const PRIMARY_OFFSET = 1024;
const REQUIRED_FIELDS = 248;

/** Calculate Linux crc32_le with the stored seed and a zeroed checksum field. */
export function superblockCrc(bytes, length, seed) {
  let crc = seed >>> 0;
  for (let index = 0; index < length; index += 1) {
    crc ^= index >= 16 && index < 20 ? 0 : bytes[index];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return crc >>> 0;
}

/** Parse one superblock; never regard missing bytes as a valid checksum. */
export function parseSuperblock(bytes) {
  if (bytes.length < 8) return { status: 'unknown', message: 'Superblock is incomplete.' };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(6, true) !== 0x3434) {
    return { status: 'invalid', message: 'NILFS2 magic not found.' };
  }
  if (bytes.length < REQUIRED_FIELDS) {
    return { status: 'incomplete', message: 'Superblock fields are incomplete.' };
  }
  const checksumLength = view.getUint16(8, true);
  const uuidBytes = Array.from(bytes.subarray(152, 168), (byte) =>
    byte.toString(16).padStart(2, '0')).join('');
  const nameBytes = bytes.subarray(168, 248);
  const terminator = nameBytes.indexOf(0);
  const fields = {
    revision: `${view.getUint32(0, true)}.${view.getUint16(4, true)}`,
    inodeSize: view.getUint16(144, true),
    blockSizeShift: view.getUint32(20, true),
    blocksPerSegment: view.getUint32(48, true),
    reservedPercentage: view.getUint32(52, true),
    deviceSize: view.getBigUint64(32, true),
    uuid: [uuidBytes.slice(0, 8), uuidBytes.slice(8, 12), uuidBytes.slice(12, 16),
      uuidBytes.slice(16, 20), uuidBytes.slice(20)].join('-'),
    volumeName: new TextDecoder().decode(
      terminator < 0 ? nameBytes : nameBytes.subarray(0, terminator),
    ),
    crcSeed: view.getUint32(12, true),
    checksum: view.getUint32(16, true),
    checksumLength,
  };
  if (checksumLength < REQUIRED_FIELDS || checksumLength > SUPERBLOCK_SIZE) {
    return { status: 'invalid', message: 'Invalid checksum length.', fields };
  }
  if (bytes.length < SUPERBLOCK_SIZE) {
    return { status: 'incomplete', message: 'Superblock data is incomplete.', fields };
  }
  const calculated = superblockCrc(bytes, checksumLength, fields.crcSeed);
  return {
    status: calculated === fields.checksum ? 'valid' : 'warning', fields, calculated,
    message: calculated === fields.checksum ? 'Checksum matches.' : 'Warning: checksum mismatch.',
  };
}

async function readRange(file, start, length) {
  const blob = file.slice(start, start + length);
  if (blob.arrayBuffer) return new Uint8Array(await blob.arrayBuffer());
  return new Uint8Array(await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Unable to read the image.'));
    reader.readAsArrayBuffer(blob);
  }));
}

/** Inspect the primary and, if present in the input, secondary superblock. */
export async function inspectImage(file) {
  const primary = parseSuperblock(await readRange(file, PRIMARY_OFFSET, SUPERBLOCK_SIZE));
  let secondary = { status: 'unknown', message: 'Secondary superblock location is unknown.' };
  const deviceSize = primary.fields?.deviceSize;
  if (deviceSize !== undefined && deviceSize >= 8192n) {
    const offset = (deviceSize / 4096n - 1n) * 4096n;
    secondary = {
      status: 'unknown', offset, message: 'Image is too short for the secondary superblock.',
    };
    if (offset + BigInt(SUPERBLOCK_SIZE) <= BigInt(file.size)) {
      const bytes = await readRange(file, Number(offset), SUPERBLOCK_SIZE);
      secondary = { ...parseSuperblock(bytes), offset };
    }
  }
  return { primary, secondary };
}

/** Create a small synthetic image containing two checksummed superblocks. */
export function createSampleImage() {
  const bytes = new Uint8Array(8192);
  const sb = bytes.subarray(PRIMARY_OFFSET, PRIMARY_OFFSET + SUPERBLOCK_SIZE);
  const view = new DataView(sb.buffer, sb.byteOffset, sb.byteLength);
  view.setUint32(0, 2, true);
  view.setUint16(6, 0x3434, true);
  view.setUint16(8, 280, true);
  view.setUint32(12, 0x12345678, true);
  view.setUint32(20, 2, true);
  view.setBigUint64(32, 8192n, true);
  view.setUint32(48, 512, true);
  view.setUint32(52, 5, true);
  view.setUint16(144, 128, true);
  sb.set(new TextEncoder().encode('NILFS2 sample'), 168);
  view.setUint32(16, superblockCrc(sb, 280, 0x12345678), true);
  bytes.set(sb, 4096);
  return new Blob([bytes]);
}
