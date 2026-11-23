const LOGO = [
  0xce, 0xed, 0x66, 0x66, 0xcc, 0x0d, 0x00, 0x0b, 0x03, 0x73, 0x00, 0x83,
  0x00, 0x0c, 0x00, 0x0d, 0x00, 0x08, 0x11, 0x1f, 0x88, 0x89, 0x00, 0x0e,
  0xdc, 0xcc, 0x6e, 0xe6, 0xdd, 0xdd, 0xd9, 0x99, 0xbb, 0xbb, 0x67, 0x63,
  0x6e, 0x0e, 0xec, 0xcc, 0xdd, 0xdc, 0x99, 0x9f, 0xbb, 0xb9, 0x33, 0x3e,
];

const TYPES = {
  0x00: 'ROM ONLY', 0x01: 'MBC1', 0x02: 'MBC1+RAM', 0x03: 'MBC1+RAM+BATTERY',
  0x05: 'MBC2', 0x06: 'MBC2+BATTERY', 0x08: 'ROM+RAM', 0x09: 'ROM+RAM+BATTERY',
  0x0b: 'MMM01', 0x0c: 'MMM01+RAM', 0x0d: 'MMM01+RAM+BATTERY',
  0x0f: 'MBC3+TIMER+BATTERY', 0x10: 'MBC3+TIMER+RAM+BATTERY', 0x11: 'MBC3',
  0x12: 'MBC3+RAM', 0x13: 'MBC3+RAM+BATTERY', 0x19: 'MBC5', 0x1a: 'MBC5+RAM',
  0x1b: 'MBC5+RAM+BATTERY', 0x1c: 'MBC5+RUMBLE', 0x1d: 'MBC5+RUMBLE+RAM',
  0x1e: 'MBC5+RUMBLE+RAM+BATTERY', 0x20: 'MBC6', 0x22: 'MBC7+SENSOR+RUMBLE+RAM+BATTERY',
  0xfc: 'POCKET CAMERA', 0xfd: 'BANDAI TAMA5', 0xfe: 'HuC3', 0xff: 'HuC1+RAM+BATTERY',
};
const RAM_SIZES = { 0: 'None', 1: 'Unused', 2: '8 KiB', 3: '32 KiB', 4: '128 KiB', 5: '64 KiB' };
const ROM_SIZES = { 0x52: '1.1 MiB (72 banks)', 0x53: '1.2 MiB (80 banks)',
  0x54: '1.5 MiB (96 banks)' };
const hex = (value, width = 2) => `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
const unknown = (value) => `Unknown (${hex(value)})`;

/** Parse a complete ROM or header-sized byte array without accessing browser APIs. */
export function parseGameBoyHeader(input) {
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
  if (!(bytes instanceof Uint8Array) || bytes.length < 0x150) {
    return { ok: false, error: 'At least 336 bytes (0x150) are required.' };
  }
  const cgb = bytes[0x143];
  const isCgb = cgb === 0x80 || cgb === 0xc0;
  const titleBytes = bytes.slice(0x134, isCgb ? 0x13f : 0x144);
  const zero = titleBytes.indexOf(0);
  const title = Array.from(zero < 0 ? titleBytes : titleBytes.slice(0, zero),
    (byte) => byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '�').join('').trim();
  let headerComputed = 0;
  for (let i = 0x134; i <= 0x14c; i += 1) headerComputed = (headerComputed - bytes[i] - 1) & 0xff;
  let globalComputed = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    if (i !== 0x14e && i !== 0x14f) globalComputed = (globalComputed + bytes[i]) & 0xffff;
  }
  const globalStored = (bytes[0x14e] << 8) | bytes[0x14f];
  const size = bytes[0x148];
  const oldLicensee = bytes[0x14b];
  const newLicensee = String.fromCharCode(bytes[0x144], bytes[0x145]);
  return {
    ok: true,
    title: title || '(empty)',
    cgb: cgb === 0x80 ? 'CGB compatible' : cgb === 0xc0 ? 'CGB only' :
      cgb === 0 ? 'DMG' : unknown(cgb),
    sgb: bytes[0x146] === 3 ? 'Supported' : bytes[0x146] === 0 ? 'Not supported' :
      unknown(bytes[0x146]),
    cartridgeType: TYPES[bytes[0x147]] || unknown(bytes[0x147]),
    romSize: size <= 8 ? `${32 * 2 ** size} KiB (${2 * 2 ** size} banks)` :
      ROM_SIZES[size] || unknown(size),
    ramSize: RAM_SIZES[bytes[0x149]] || unknown(bytes[0x149]),
    destination: bytes[0x14a] === 0 ? 'Japan' : bytes[0x14a] === 1 ? 'Overseas' :
      unknown(bytes[0x14a]),
    oldLicensee: hex(oldLicensee),
    newLicensee: `${JSON.stringify(newLicensee)}${oldLicensee === 0x33 ? ' (active)' : ''}`,
    version: bytes[0x14c],
    logoValid: LOGO.every((value, index) => bytes[0x104 + index] === value),
    headerChecksum: { expected: headerComputed, actual: bytes[0x14d],
      valid: headerComputed === bytes[0x14d] },
    globalChecksum: { expected: globalComputed, actual: globalStored,
      valid: globalComputed === globalStored },
    byteLength: bytes.length,
  };
}

/** Decode explicitly selected hex or Base64 text to bytes. */
export function decodeBytes(text, format) {
  const cleaned = text.replace(/\s/g, '');
  if (!cleaned) return { ok: false, error: 'Enter bytes to inspect.' };
  if (format === 'hex') {
    if (cleaned.length % 2 || !/^[\da-f]+$/i.test(cleaned)) {
      return { ok: false, error: 'Hex input must contain pairs of hexadecimal digits.' };
    }
    return { ok: true, bytes: Uint8Array.from(cleaned.match(/../g), (pair) => parseInt(pair, 16)) };
  }
  try {
    const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
    if (cleaned.length % 4 || !base64Pattern.test(cleaned)) {
      throw new Error('Invalid Base64');
    }
    return { ok: true, bytes: Uint8Array.from(atob(cleaned), (char) => char.charCodeAt(0)) };
  } catch {
    return { ok: false, error: 'Invalid Base64 input.' };
  }
}
