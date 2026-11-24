// On-disk layout: https://github.com/torvalds/linux/blob/master/include/linux/qnx6_fs.h
export const SUPERBLOCK_SIZE = 512;
export const BOOTBLOCK_SIZE = 0x2000;
export const PREFIX_SIZE = BOOTBLOCK_SIZE + SUPERBLOCK_SIZE;
const MAGIC = 0x68191122;

/** Parse the first standard QNX6 superblock in a bounded image prefix. */
export function parseQnx6Superblock(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < SUPERBLOCK_SIZE) {
    throw new Error('Truncated input: a QNX6 superblock requires 512 bytes.');
  }
  const hasMagic = (offset) => offset + 4 <= view.byteLength &&
    (view.getUint32(offset, true) === MAGIC || view.getUint32(offset, false) === MAGIC);
  const offset = hasMagic(BOOTBLOCK_SIZE) ? BOOTBLOCK_SIZE : 0;
  if (!hasMagic(offset)) throw new Error('Bad magic: no QNX6 superblock found.');
  if (view.byteLength < offset + SUPERBLOCK_SIZE) {
    throw new Error('Truncated input: the QNX6 superblock requires 512 bytes.');
  }
  const little = view.getUint32(offset, true) === MAGIC;
  const u32 = (position) => view.getUint32(offset + position, little);
  const u16 = (position) => view.getUint16(offset + position, little);
  const u64 = (position) => view.getBigUint64(offset + position, little);
  const root = (position) => ({
    size: u64(position),
    pointers: Array.from({ length: 16 }, (_, index) => u32(position + 8 + index * 4)),
    levels: view.getUint8(offset + position + 72),
    mode: view.getUint8(offset + position + 73),
  });
  const volumeId = Array.from(new Uint8Array(buffer, offset + 32, 16),
    (byte) => byte.toString(16).padStart(2, '0')).join('');
  return {
    offset, endianness: little ? 'Little-endian' : 'Big-endian', magic: MAGIC,
    checksum: u32(4), serial: u64(8), ctime: u32(16), atime: u32(20), flags: u32(24),
    version1: u16(28), version2: u16(30), volumeId, blockSize: u32(48),
    inodeCount: u32(52), freeInodes: u32(56), blockCount: u32(60),
    freeBlocks: u32(64), allocationGroup: u32(68),
    roots: { Inode: root(72), Bitmap: root(152), Longfile: root(232), Unknown: root(312) },
  };
}
