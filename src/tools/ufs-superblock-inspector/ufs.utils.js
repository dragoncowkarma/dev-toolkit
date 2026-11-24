const MAGIC_OFFSET = 1372;
export const SUPERBLOCK_LENGTH = 1376;
export const CANDIDATE_OFFSETS = [65536, 8192, 262144];

/** Decode a FreeBSD UFS superblock, retaining fields available in a short input. */
export function decodeSuperblock(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fields = {};
  const has = (offset, size) => offset + size <= view.byteLength;
  let little = true;
  let version;
  if (has(MAGIC_OFFSET, 4)) {
    for (const order of [true, false]) {
      const magic = view.getUint32(MAGIC_OFFSET, order);
      if (magic === 0x011954 || magic === 0x19540119) {
        little = order;
        version = magic === 0x011954 ? 'UFS1' : 'UFS2';
        break;
      }
    }
  }
  // Without a valid magic the byte order and UFS version cannot be inferred safely.
  if (!version) {
    return {
      fields,
      error: has(MAGIC_OFFSET, 4) ? 'Invalid UFS magic.' : 'Truncated superblock: missing magic.',
    };
  }
  fields.Version = version;
  fields['Byte order'] = little ? 'Little-endian' : 'Big-endian';
  const u32 = (name, offset) => {
    if (has(offset, 4)) fields[name] = view.getUint32(offset, little);
  };
  const size = (name, oldOffset, newOffset) => {
    if (version === 'UFS1') u32(name, oldOffset);
    else if (has(newOffset, 8)) fields[name] = view.getBigUint64(newOffset, little);
  };
  size('fs_size', 36, 1080);
  size('fs_dsize', 40, 1088);
  for (const [name, offset] of Object.entries({
    fs_ncg: 44, fs_bsize: 48, fs_fsize: 52, fs_frag: 56, fs_ipg: 184, fs_fpg: 188,
  })) u32(name, offset);
  if (has(144, 8)) {
    fields.fs_id = [view.getUint32(144, little), view.getUint32(148, little)]
      .map((part) => part.toString(16).padStart(8, '0')).join(':');
  }
  if (has(680, 32)) {
    const name = bytes.subarray(680, 712);
    const end = name.indexOf(0);
    fields.fs_volname = new TextDecoder().decode(end < 0 ? name : name.subarray(0, end));
  }
  return { fields, error: '' };
}

/** Parse whitespace-separated or continuous hexadecimal superblock bytes. */
export function parseHex(input) {
  const compact = input.replace(/\s/g, '');
  if (!compact || compact.length % 2 || !/^[\da-f]+$/i.test(compact)) {
    throw new Error('Enter an even number of hexadecimal digits.');
  }
  return Uint8Array.from(compact.match(/../g), (pair) => parseInt(pair, 16));
}

/** Inspect only bounded slices at the standard superblock locations. */
export async function inspectImage(file) {
  let truncated = false;
  for (const offset of CANDIDATE_OFFSETS) {
    if (file.size <= offset) continue;
    const slice = file.slice(offset, offset + SUPERBLOCK_LENGTH);
    const bytes = new Uint8Array(await slice.arrayBuffer());
    const result = decodeSuperblock(bytes);
    if (!result.error) return { ...result, offset };
    if (bytes.length < SUPERBLOCK_LENGTH) truncated = true;
  }
  return {
    fields: {},
    error: truncated || file.size <= 8192
      ? 'Truncated image: no complete superblock found.'
      : 'Invalid UFS magic at candidate offsets.',
  };
}
