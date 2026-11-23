const MAGIC = 0xa92b4efc;
const FEATURES = [
  'bitmap offset', 'recovery offset', 'reshape active', 'bad blocks', 'replacement',
  'reshape backwards', 'new offset', 'recovery bitmap', 'clustered', 'journal', 'PPL',
  'multiple PPLs', 'RAID0 layout',
];
const LEVELS = { '-1': 'linear', 0: 'raid0', 1: 'raid1', 4: 'raid4', 5: 'raid5',
  6: 'raid6', 10: 'raid10' };

/** Parse a hex string into bytes, rejecting incomplete or invalid input. */
export function parseHex(text) {
  const hex = text.replace(/\s+/g, '');
  if (!/^[\da-f]*$/i.test(hex) || hex.length % 2) throw new Error('Invalid or incomplete hex.');
  return Uint8Array.from(hex.match(/../g) || [], (byte) => parseInt(byte, 16));
}

/** Parse one mdadm v1 superblock without reading beyond available bytes. */
export function parseSuperblock(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 4) return { error: 'Incomplete input: magic is unknown.' };
  if (view.getUint32(0, true) !== MAGIC) return { error: 'Unknown superblock: bad magic.' };
  if (bytes.length < 8) return { error: 'Incomplete input: major version is unknown.' };
  const version = view.getUint32(4, true);
  if (version !== 1) return { error: `Unsupported major_version: ${version}.` };
  if (bytes.length < 256) return { error: 'Incomplete superblock header.' };
  const count = view.getUint32(220, true);
  if (count > (4096 - 256) / 2) return { error: 'Invalid role table: max_dev exceeds 4096 bytes.' };
  const end = 256 + count * 2;
  if (bytes.length < end) return { error: 'Incomplete device role table; checksum unknown.' };
  let sum = 0n;
  for (let offset = 0; offset + 4 <= end; offset += 4) {
    if (offset !== 216) sum += BigInt(view.getUint32(offset, true));
  }
  if (end % 4) sum += BigInt(view.getUint16(end - 2, true));
  const checksum = Number(((sum & 0xffffffffn) + (sum >> 32n)) & 0xffffffffn);
  const stored = view.getUint32(216, true);
  const map = view.getUint32(8, true);
  const flags = FEATURES.filter((_, index) => map & (1 << index));
  if (map & ~0x1fff) flags.push(`unknown bits 0x${((map & ~0x1fff) >>> 0).toString(16)}`);
  const uuid = Array.from(bytes.slice(16, 32), (byte) => byte.toString(16).padStart(2, '0'));
  const roles = Array.from({ length: count }, (_, i) => {
    const role = view.getUint16(256 + i * 2, true);
    return `${i}: ${role === 0xffff ? 'spare' : role === 0xfffe ? 'faulty' : role}`;
  });
  const seconds = view.getBigUint64(64, true) & ((1n << 40n) - 1n);
  const level = view.getInt32(72, true);
  return {
    fields: {
      'Major version': '1 (little-endian)',
      'Set UUID': [0, 4, 8, 12].map((i) => uuid.slice(i, i + 4).join('')).join(':'),
      'Set name': new TextDecoder().decode(bytes.slice(32, 64)).split('\0')[0],
      'Creation time': `${seconds} seconds since Unix epoch`,
      Level: LEVELS[level] || `unknown (${level})`,
      Layout: view.getUint32(76, true),
      Size: `${view.getBigUint64(80, true)} sectors`,
      'Chunk size': `${view.getUint32(88, true)} sectors`,
      'RAID disks': view.getUint32(92, true),
      'Data offset': `${view.getBigUint64(128, true)} sectors`,
      'Device number': view.getUint32(160, true),
      'Feature map': `0x${map.toString(16)} (${flags.join(', ') || 'none'})`,
      'Device roles': roles.join(', ') || 'none',
      Checksum: stored === checksum ? 'valid' : 'mismatch',
    },
    diagnostic: stored === checksum ? '' : 'Superblock checksum mismatch.',
  };
}

/** Read only the candidate 1.1, 1.2 and 1.0 superblock ranges from a file. */
export async function inspectFile(file) {
  const endOffset = Math.floor((Math.floor(file.size / 512) - 16) / 8) * 4096;
  const offsets = [...new Set([0, 4096, endOffset].filter((offset) => offset >= 0))];
  let incomplete = false;
  for (const offset of offsets) {
    if (offset >= file.size) continue;
    const bytes = new Uint8Array(await file.slice(offset, offset + 4096).arrayBuffer());
    const result = parseSuperblock(bytes);
    if (result.fields || (result.error && !result.error.includes('bad magic') &&
        !result.error.includes('magic is unknown'))) return { ...result, offset };
    if (bytes.length < 4) incomplete = true;
  }
  return { error: incomplete ? 'Incomplete input: magic is unknown.' : 'Unknown superblock.' };
}
