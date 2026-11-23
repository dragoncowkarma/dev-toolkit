const powerOfTwo = (value) => value > 0 && (value & (value - 1)) === 0;

/** Parse a 512-byte FAT boot sector and calculate volume geometry.
 * @param {ArrayBuffer} buffer Boot sector bytes.
 * @returns {object} Parsed BPB fields and derived geometry.
 */
export function parseBootSector(buffer) {
  if (buffer.byteLength < 512) throw new Error('Truncated input: at least 512 bytes are required.');
  const view = new DataView(buffer);
  if (view.getUint8(510) !== 0x55 || view.getUint8(511) !== 0xaa) {
    throw new Error('Invalid boot sector signature: expected 0x55AA.');
  }
  const text = (offset, length) => Array.from(
    new Uint8Array(buffer, offset, length), (byte) => String.fromCharCode(byte)
  ).join('').replace(/\0/g, '').trim();
  const bytesPerSector = view.getUint16(11, true);
  const sectorsPerCluster = view.getUint8(13);
  const reservedSectors = view.getUint16(14, true);
  const fatCount = view.getUint8(16);
  const rootEntries = view.getUint16(17, true);
  const totalSectors = view.getUint16(19, true) || view.getUint32(32, true);
  const fat16Size = view.getUint16(22, true);
  const sectorsPerFat = fat16Size || view.getUint32(36, true);
  if (!powerOfTwo(bytesPerSector) || bytesPerSector < 512 || bytesPerSector > 4096) {
    throw new Error('Invalid bytes per sector: expected a power of two from 512 to 4096.');
  }
  if (!powerOfTwo(sectorsPerCluster) || sectorsPerCluster > 128) {
    throw new Error('Invalid sectors per cluster: expected a power of two from 1 to 128.');
  }
  if (!reservedSectors || !fatCount || !totalSectors || !sectorsPerFat) {
    throw new Error('Invalid BPB: reserved sectors, FAT count, total sectors and FAT size ' +
      'must be nonzero.');
  }
  const rootDirectorySectors = Math.ceil(rootEntries * 32 / bytesPerSector);
  const dataRegionStart = reservedSectors + fatCount * sectorsPerFat + rootDirectorySectors;
  if (dataRegionStart >= totalSectors) throw new Error('Invalid BPB: no data region remains.');
  const clusterCount = Math.floor((totalSectors - dataRegionStart) / sectorsPerCluster);
  if (!clusterCount) throw new Error('Invalid BPB: no data clusters remain.');
  const fatType = clusterCount < 4085 ? 'FAT12' : clusterCount < 65525 ? 'FAT16' : 'FAT32';
  if ((fatType === 'FAT32' && (fat16Size || rootEntries)) ||
      (fatType !== 'FAT32' && (!fat16Size || !rootEntries))) {
    throw new Error('Invalid BPB: FAT layout does not match the cluster count.');
  }
  const result = {
    fatType, oemName: text(3, 8), bytesPerSector, sectorsPerCluster, reservedSectors,
    fatCount, rootEntries, totalSectors, mediaDescriptor: view.getUint8(21), sectorsPerFat,
    dataRegionStart, clusterCount,
  };
  if (fatType === 'FAT32') {
    result.rootCluster = view.getUint32(44, true);
    result.fsInfoSector = view.getUint16(48, true);
    if (result.rootCluster < 2 || result.rootCluster >= clusterCount + 2 ||
        (result.fsInfoSector !== 0xffff && result.fsInfoSector >= reservedSectors)) {
      throw new Error('Invalid FAT32 root cluster or FSInfo sector.');
    }
    result.volumeLabel = text(71, 11);
    result.filesystemType = text(82, 8);
  }
  return result;
}
