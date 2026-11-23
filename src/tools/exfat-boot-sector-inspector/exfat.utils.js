const FIELDS = [
  ['PartitionOffset', 64, 8], ['VolumeLength', 72, 8], ['FatOffset', 80, 4],
  ['FatLength', 84, 4], ['ClusterHeapOffset', 88, 4], ['ClusterCount', 92, 4],
  ['FirstClusterOfRootDirectory', 96, 4], ['VolumeSerialNumber', 100, 4],
  ['FileSystemRevision', 104, 2], ['VolumeFlags', 106, 2],
  ['BytesPerSectorShift', 108, 1], ['SectorsPerClusterShift', 109, 1],
  ['NumberOfFats', 110, 1], ['DriveSelect', 111, 1], ['PercentInUse', 112, 1],
];

/** Parse whitespace-separated or contiguous hexadecimal bytes without throwing. */
export function parseHex(text) {
  if (typeof text !== 'string') return { error: 'Enter hexadecimal bytes.' };
  const hex = text.replace(/\s/g, '');
  if (!/^[0-9a-f]*$/i.test(hex) || hex.length % 2 !== 0) {
    return { error: 'Hex input must contain complete hexadecimal byte pairs.' };
  }
  const bytes = new Uint8Array(Math.min(hex.length / 2, 512));
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return { bytes };
}

/** Inspect available exFAT boot sector bytes, reporting malformed input as warnings. */
export function inspectExfat(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(0);
  const warnings = [];
  const fields = {};
  if (bytes.length < 512) warnings.push('Truncated input: at least 512 bytes are required.');
  if (bytes.length >= 11 && String.fromCharCode(...bytes.slice(3, 11)) !== 'EXFAT   ') {
    warnings.push('Invalid filesystem name; expected EXFAT followed by three spaces.');
  }
  if (bytes.length >= 64 && bytes.slice(11, 64).some((byte) => byte !== 0)) {
    warnings.push('MustBeZero region contains nonzero bytes.');
  }
  if (bytes.length >= 512 && (bytes[510] !== 0x55 || bytes[511] !== 0xaa)) {
    warnings.push('Invalid boot signature; expected 55 AA.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (const [name, offset, size] of FIELDS) {
    if (offset + size > bytes.length) continue;
    fields[name] = size === 8 ? view.getBigUint64(offset, true)
      : size === 4 ? view.getUint32(offset, true)
        : size === 2 ? view.getUint16(offset, true) : view.getUint8(offset);
  }
  const sectorShift = fields.BytesPerSectorShift;
  const clusterShift = fields.SectorsPerClusterShift;
  const validSector = sectorShift >= 9 && sectorShift <= 12;
  const validCluster = clusterShift !== undefined && validSector
    && clusterShift <= 25 - sectorShift;
  if (sectorShift !== undefined && !validSector) {
    warnings.push('BytesPerSectorShift must be between 9 and 12.');
  }
  if (clusterShift !== undefined && validSector && !validCluster) {
    warnings.push('SectorsPerClusterShift exceeds the exFAT cluster size limit.');
  }
  if (fields.FileSystemRevision !== undefined && fields.FileSystemRevision !== 0x100) {
    warnings.push('FileSystemRevision is not 1.00.');
  }
  const derived = {};
  if (validSector) {
    derived['Bytes per sector'] = 1n << BigInt(sectorShift);
    if (validCluster) derived['Bytes per cluster'] = 1n << BigInt(sectorShift + clusterShift);
    if (fields.VolumeLength !== undefined) {
      derived['Volume size in bytes'] = fields.VolumeLength * derived['Bytes per sector'];
    }
  }
  return { fields, derived, warnings };
}
