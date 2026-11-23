export const SUPERBLOCK_OFFSET = 0x400;
export const SUPERBLOCK_SIZE = 3072;

/** Parse the primary F2FS superblock from its on-disk bytes. */
export function parseSuperblock(buffer) {
  if (buffer.byteLength < SUPERBLOCK_SIZE) {
    throw new Error('File is too short to contain an F2FS superblock.');
  }
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0xf2f52010) {
    throw new Error('Invalid F2FS superblock magic.');
  }
  const u32 = (offset) => view.getUint32(offset, true);
  const uuidBytes = Array.from(new Uint8Array(buffer, 108, 16),
    (byte) => byte.toString(16).padStart(2, '0')).join('');
  const uuid = [uuidBytes.slice(0, 8), uuidBytes.slice(8, 12), uuidBytes.slice(12, 16),
    uuidBytes.slice(16, 20), uuidBytes.slice(20)].join('-');
  const nameBytes = new Uint8Array(buffer, 124, 1024);
  let nameLength = 0;
  while (nameLength < nameBytes.length && (nameBytes[nameLength] || nameBytes[nameLength + 1])) {
    nameLength += 2;
  }
  return {
    version: `${view.getUint16(4, true)}.${view.getUint16(6, true)}`,
    logSectorSize: u32(8),
    logSectorsPerBlock: u32(12),
    logBlockSize: u32(16),
    logBlocksPerSegment: u32(20),
    blocksPerSegment: u32(20) < 53 ? 2 ** u32(20) : `2^${u32(20)}`,
    blockCount: view.getBigUint64(36, true).toString(),
    sectionCount: u32(44),
    segmentCount: u32(48),
    checkpointSegments: u32(52),
    sitSegments: u32(56),
    natSegments: u32(60),
    ssaSegments: u32(64),
    mainSegments: u32(68),
    uuid,
    volumeName: new TextDecoder('utf-16le').decode(nameBytes.subarray(0, nameLength)),
    features: `0x${u32(2180).toString(16).padStart(8, '0')}`,
  };
}
