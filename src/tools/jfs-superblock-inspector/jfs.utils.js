export const SUPERBLOCK_OFFSET = 32768;
export const SUPERBLOCK_LENGTH = 168;

/** Parse a JFS superblock starting at the first byte of the input. */
export function parseSuperblock(bytes) {
  if (!(bytes instanceof Uint8Array)) return { error: 'Unsupported input: expected bytes.' };
  if (bytes.length < 8) return { error: 'Truncated superblock.' };
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== 'JFS1') {
    return { error: 'Invalid JFS magic (expected JFS1).' };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(4, true);
  if (version !== 1 && version !== 2) return { error: `Unsupported JFS version: ${version}.` };
  const required = version === 1 ? 112 : SUPERBLOCK_LENGTH;
  if (bytes.length < required) return { error: 'Truncated superblock.' };
  const state = view.getUint32(40, true);
  const stateNames = ['Mounted', 'Dirty', 'Logredo failed', 'Extendfs in progress'];
  const states = stateNames.filter((_, index) => state & (1 << index));
  if (state & ~15) states.push(`Unknown bits 0x${((state & ~15) >>> 0).toString(16)}`);
  const uuidBytes = Array.from(bytes.subarray(136, 152), (byte) =>
    byte.toString(16).padStart(2, '0')).join('');
  const labelBytes = version === 1 ? bytes.subarray(101, 112) : bytes.subarray(152, 168);
  const labelEnd = labelBytes.indexOf(0);
  const label = new TextDecoder().decode(
    labelBytes.subarray(0, labelEnd < 0 ? undefined : labelEnd),
  );
  return { data: {
    Magic: 'JFS1',
    Version: String(version),
    'Size (hardware/LVM blocks)': view.getBigUint64(8, true).toString(),
    'Block size (bytes)': String(view.getUint32(16, true)),
    'Log2 block size': String(view.getUint16(20, true)),
    Flags: `0x${view.getUint32(36, true).toString(16).padStart(8, '0')}`,
    State: state === 0 ? 'Clean' : `${states.join(', ')} (0x${state.toString(16)})`,
    UUID: version === 1 ? 'Not available in version 1' :
      `${uuidBytes.slice(0, 8)}-${uuidBytes.slice(8, 12)}-${uuidBytes.slice(12, 16)}-` +
      `${uuidBytes.slice(16, 20)}-${uuidBytes.slice(20)}`,
    'Volume label': label || '(empty)',
    'Log device': `0x${view.getUint32(64, true).toString(16).padStart(8, '0')}`,
    'Log serial': String(view.getUint32(68, true)),
  } };
}

/** Parse whitespace-separated or continuous hexadecimal superblock bytes. */
export function parseHex(input) {
  if (typeof input !== 'string') return { error: 'Unsupported input: expected hexadecimal text.' };
  const hex = input.replace(/\s/g, '');
  if (!hex || hex.length % 2 || !/^[\da-f]+$/i.test(hex)) {
    return { error: 'Invalid hexadecimal input: use complete byte pairs.' };
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return parseSuperblock(bytes);
}

/** Create example superblock bytes as hexadecimal text. */
export function sampleHex() {
  const bytes = new Uint8Array(SUPERBLOCK_LENGTH);
  const view = new DataView(bytes.buffer);
  bytes.set([0x4a, 0x46, 0x53, 0x31]);
  view.setUint32(4, 2, true);
  view.setBigUint64(8, 1048576n, true);
  view.setUint32(16, 4096, true);
  view.setUint16(20, 12, true);
  view.setUint32(36, 0x10000800, true);
  bytes.set(new TextEncoder().encode('Example'), 152);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ');
}
