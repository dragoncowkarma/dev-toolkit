const FEATURE_NAMES = {
  sb_features_compat: [],
  sb_features_ro_compat: ['FINOBT', 'RMAPBT', 'REFLINK', 'INOBTCNT'],
  sb_features_incompat: [
    'FTYPE', 'SPINODES', 'META_UUID', 'BIGTIME', 'NEEDSREPAIR', 'NREXT64',
    'EXCHRANGE', 'PARENT', 'METADIR', 'ZONED', 'ZONE_GAPS',
  ],
  sb_features_log_incompat: ['XATTRS'],
};

/** Parse a 512-byte XFS superblock without losing 64-bit integer precision. */
export function parseXfsSuperblock(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 512) return { ok: false, error: 'Superblock must contain 512 bytes.' };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0) !== 0x58465342) return { ok: false, error: 'Invalid XFS magic.' };
  const u8 = (offset) => view.getUint8(offset);
  const u16 = (offset) => view.getUint16(offset);
  const u32 = (offset) => view.getUint32(offset);
  const u64 = (offset) => view.getBigUint64(offset).toString();
  const uuid = Array.from(bytes.slice(32, 48), (b) => b.toString(16).padStart(2, '0')).join('');
  const fields = {
    sb_blocksize: u32(4), sb_dblocks: u64(8), sb_rblocks: u64(16),
    sb_uuid: [uuid.slice(0, 8), uuid.slice(8, 12), uuid.slice(12, 16),
      uuid.slice(16, 20), uuid.slice(20)].join('-'),
    sb_logblocks: u32(96), sb_rootino: u64(56), sb_agblocks: u32(84), sb_agcount: u32(88),
    sb_versionnum: u16(100), sb_sectsize: u16(102), sb_inodesize: u16(104),
    sb_inopblock: u16(106),
    sb_fname: new TextDecoder().decode(bytes.slice(108, 120)).split('\0')[0],
    sb_blocklog: u8(120), sb_sectlog: u8(121), sb_inodelog: u8(122),
    sb_icount: u64(128), sb_ifree: u64(136), sb_fdblocks: u64(144),
  };
  const version = fields.sb_versionnum & 0xf;
  if (version !== 4 && version !== 5) {
    return { ok: false, error: `Unsupported XFS version ${version}.` };
  }
  const checks = [
    ['block size', fields.sb_blocksize, fields.sb_blocklog],
    ['sector size', fields.sb_sectsize, fields.sb_sectlog],
    ['inode size', fields.sb_inodesize, fields.sb_inodelog],
  ];
  if (checks.some(([, size, log]) => log > 31 || size !== 2 ** log) ||
      fields.sb_sectsize > fields.sb_blocksize || fields.sb_inodesize > fields.sb_blocksize ||
      fields.sb_inopblock * fields.sb_inodesize !== fields.sb_blocksize ||
      !fields.sb_agblocks || !fields.sb_agcount ||
      BigInt(fields.sb_ifree) > BigInt(fields.sb_icount) ||
      BigInt(fields.sb_fdblocks) > BigInt(fields.sb_dblocks)) {
    return { ok: false, error: 'Inconsistent superblock geometry or counters.' };
  }
  if (version === 5) {
    Object.keys(FEATURE_NAMES).forEach((key, index) => {
      const value = u32(208 + index * 4);
      const names = FEATURE_NAMES[key];
      const flags = [];
      for (let bit = 0; bit < 32; bit += 1) {
        if ((value >>> bit) & 1) flags.push(names[bit] || `UNKNOWN_0x${(2 ** bit).toString(16)}`);
      }
      fields[key] = `0x${value.toString(16).padStart(8, '0')} (${flags.join(', ') || 'none'})`;
    });
  }
  return { ok: true, fields, version };
}

/** Convert whitespace-separated or contiguous hexadecimal text to bytes. */
export function parseHex(text) {
  const compact = text.replace(/\s/g, '');
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(compact)) {
    return { ok: false, error: 'Enter an even number of hexadecimal digits.' };
  }
  return { ok: true, bytes: Uint8Array.from(compact.match(/../g), (pair) => parseInt(pair, 16)) };
}

/** Format bytes as a pasteable hex dump. */
export function formatHex(bytes) {
  return Array.from(bytes, (byte, index) =>
    `${index && index % 16 === 0 ? '\n' : index ? ' ' : ''}${byte.toString(16).padStart(2, '0')}`
  ).join('');
}

/** Construct a small example superblock for the selected version. */
export function createSample(version) {
  const bytes = new Uint8Array(512);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x58465342); view.setUint32(4, 4096);
  view.setBigUint64(8, 100000n); view.setBigUint64(56, 128n);
  view.setUint32(84, 25000); view.setUint32(88, 4); view.setUint32(96, 1000);
  view.setUint16(100, version); view.setUint16(102, 512); view.setUint16(104, 512);
  view.setUint16(106, 8); bytes.set(new TextEncoder().encode(`sample-v${version}`), 108);
  bytes[120] = 12; bytes[121] = 9; bytes[122] = 9;
  view.setBigUint64(128, 1000n); view.setBigUint64(136, 500n);
  view.setBigUint64(144, 50000n);
  if (version === 5) view.setUint32(212, 5);
  return bytes;
}

/** Read only the first 512 bytes from a selected file. */
export function readSuperblock(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = () => reject(new Error('Unable to read file.'));
    reader.onabort = () => reject(new Error('File read was aborted.'));
    reader.readAsArrayBuffer(file.slice(0, 512));
  });
}
