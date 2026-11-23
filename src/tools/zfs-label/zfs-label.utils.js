const LABEL_SIZE = 256 * 1024;
const NV_START = 16 * 1024;
const NV_END = 128 * 1024;
const MAGIC = 0x00bab10cn;
const FIELDS = ['version', 'name', 'state', 'txg', 'pool_guid', 'guid', 'ashift'];

function readNvlist(view, start, end, depth = 0) {
  if (depth > 16 || start + 8 > end) throw new Error('Invalid ZFS nvlist.');
  let offset = start + 8;
  const result = {};
  while (offset + 8 <= end) {
    const pairStart = offset;
    const size = view.getUint32(offset);
    const decodedSize = view.getUint32(offset + 4);
    offset += 8;
    if (size === 0 && decodedSize === 0) return { result, offset };
    const pairEnd = pairStart + size;
    if (size < 24 || pairEnd > end || offset + 4 > pairEnd) {
      throw new Error('Invalid ZFS nvlist.');
    }
    const nameLength = view.getUint32(offset);
    offset += 4;
    const paddedName = Math.ceil(nameLength / 4) * 4;
    if (offset + paddedName + 8 > pairEnd) throw new Error('Invalid ZFS nvlist.');
    const name = new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset + offset,
      nameLength)).replace(/\0$/, '');
    offset += paddedName;
    const type = view.getUint32(offset);
    const count = view.getUint32(offset + 4);
    offset += 8;
    if (count === 1 && type === 8 && offset + 8 <= pairEnd) {
      result[name] = view.getBigUint64(offset).toString();
    } else if (count === 1 && type === 9 && offset + 4 <= pairEnd) {
      const length = view.getUint32(offset);
      offset += 4;
      if (offset + Math.ceil(length / 4) * 4 > pairEnd) throw new Error('Invalid ZFS nvlist.');
      result[name] = new TextDecoder().decode(new Uint8Array(view.buffer,
        view.byteOffset + offset, length)).replace(/\0$/, '');
    } else if (count === 1 && type === 19) {
      result[name] = readNvlist(view, offset, pairEnd, depth + 1).result;
    } else if (type === 20 && count <= (pairEnd - offset) / 16) {
      const children = [];
      for (let index = 0; index < count; index += 1) {
        const child = readNvlist(view, offset, pairEnd, depth + 1);
        children.push(child.result);
        offset = child.offset;
      }
      result[name] = children;
    }
    offset = pairEnd;
  }
  throw new Error('Invalid ZFS nvlist.');
}

function findAshift(value) {
  if (!value || typeof value !== 'object') return undefined;
  if (value.ashift !== undefined) return value.ashift;
  for (const child of Object.values(value)) {
    const found = findAshift(child);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Parse the first vdev label from a byte array. */
export function parseLabel(bytes) {
  if (!bytes.length) throw new Error('Input is empty.');
  if (bytes.length < LABEL_SIZE) throw new Error('Input is short: at least 256 KiB is required.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, LABEL_SIZE);
  if (view.getUint8(NV_START) !== 1 || view.getUint8(NV_START + 1) > 1 ||
      view.getUint16(NV_START + 2) !== 0) throw new Error('Not a ZFS XDR label.');
  let nvlist;
  try {
    nvlist = readNvlist(view, NV_START + 4, NV_END).result;
  } catch {
    throw new Error('Not a valid ZFS XDR nvlist.');
  }
  if (!nvlist.name || nvlist.pool_guid === undefined || nvlist.guid === undefined) {
    throw new Error('Not a valid ZFS label: required pool fields are missing.');
  }
  const fields = Object.fromEntries(FIELDS.map((key) => [key,
    key === 'ashift' ? findAshift(nvlist) : nvlist[key]]));
  let uberblock = null;
  for (let offset = NV_END; offset + 40 <= LABEL_SIZE; offset += 8) {
    for (const little of [true, false]) {
      if (view.getBigUint64(offset, little) !== MAGIC) continue;
      const txg = view.getBigUint64(offset + 16, little);
      if (!uberblock || txg > uberblock.txg) {
        uberblock = {
          version: view.getBigUint64(offset + 8, little).toString(),
          txg,
          guid_sum: view.getBigUint64(offset + 24, little).toString(),
          timestamp: view.getBigUint64(offset + 32, little).toString(),
        };
      }
    }
  }
  if (uberblock) uberblock.txg = uberblock.txg.toString();
  return { fields, uberblock };
}

/** Decode whitespace-separated or contiguous hexadecimal bytes. */
export function parseHex(input) {
  const hex = input.replace(/\s/g, '');
  if (!hex) return new Uint8Array();
  if (hex.length % 2 || !/^[\da-f]+$/i.test(hex)) throw new Error('Invalid hexadecimal input.');
  const length = Math.min(hex.length / 2, LABEL_SIZE);
  return Uint8Array.from({ length }, (_, index) =>
    parseInt(hex.slice(index * 2, index * 2 + 2), 16));
}

/** Read only the first label from a selected file. */
export async function readLabelFile(file) {
  if (!file.size) throw new Error('Input is empty.');
  if (file.size < LABEL_SIZE) throw new Error('Input is short: at least 256 KiB is required.');
  return new Uint8Array(await file.slice(0, LABEL_SIZE).arrayBuffer());
}
