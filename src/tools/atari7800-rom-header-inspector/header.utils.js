const HEADER_SIZE = 128;
const UNKNOWN = 'Unknown';
const FLAGS = [
  'POKEY at $4000', 'SuperGame banking', 'SuperGame RAM at $4000', 'ROM at $4000',
  'Bank 6 at $4000', 'Banked RAM', 'POKEY at $450', 'Mirror RAM at $4000',
  'Activision banking', 'Absolute banking', 'POKEY at $440', 'YM2151 at $460/$461',
  'Souper', 'Banksets', 'Halt banked RAM', 'POKEY at $800',
];
const CONTROLLERS = [
  'None', '7800 joystick', 'Lightgun', 'Paddle', 'Trakball', '2600 joystick',
  '2600 driving', '2600 keypad', 'ST mouse', 'Amiga mouse', 'AtariVox/SaveKey',
  'SNES2Atari', 'Mega7800',
];

/** Parse hexadecimal bytes separated by whitespace, returning errors as data. */
export function parseHex(input) {
  const compact = input.replace(/\s/g, '');
  if (!/^[0-9a-f]*$/i.test(compact) || compact.length % 2) {
    return { error: 'Enter complete hexadecimal byte pairs, separated by spaces if needed.' };
  }
  const bytes = new Uint8Array(Math.min(compact.length / 2, HEADER_SIZE));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = parseInt(compact.slice(index * 2, index * 2 + 2), 16);
  }
  return { bytes };
}

/** Read only the header-sized prefix of a local file. */
export async function readHeader(file) {
  return new Uint8Array(await file.slice(0, HEADER_SIZE).arrayBuffer());
}

function textField(bytes, start, length) {
  if (bytes.length < start + length) return UNKNOWN;
  return String.fromCharCode(...bytes.slice(start, start + length)).replace(/\0.*$/s, '').trim();
}

function controller(byte) {
  return byte === undefined ? UNKNOWN : (CONTROLLERS[byte] ?? `Unknown (${byte})`);
}

/** Decode fields that are completely present in an A78 header prefix. */
export function decodeHeader(input) {
  const bytes = input.slice(0, HEADER_SIZE);
  const signature = bytes.length < 10 ? UNKNOWN :
    (String.fromCharCode(...bytes.slice(1, 10)) === 'ATARI7800' ? 'Valid' : 'Invalid');
  const cart = bytes.length < 55 ? null : bytes[53] * 256 + bytes[54];
  const tv = bytes[57];
  const save = bytes[58];
  const size = bytes.length < 53 ? UNKNOWN :
    (bytes[49] * 0x1000000 + bytes[50] * 0x10000 + bytes[51] * 0x100 + bytes[52]);
  const flags = cart === null ? UNKNOWN :
    FLAGS.filter((_, index) => cart & (1 << index)).join(', ') || 'None';
  const saves = save === undefined ? UNKNOWN : [
    ...(save & 1 ? ['High Score Cartridge'] : []),
    ...(save & 2 ? ['SaveKey/AtariVox'] : []),
    ...(save & 0xfc ? [`Unknown bits 0x${(save & 0xfc).toString(16)}`] : []),
  ].join(', ') || 'None';
  const result = {
    Version: bytes[0] ?? UNKNOWN,
    Signature: signature,
    Title: textField(bytes, 17, 32),
    'ROM size': typeof size === 'number' ? `${size} bytes` : size,
    'Legacy cart flags': flags,
    'Controller 1': controller(bytes[55]),
    'Controller 2': controller(bytes[56]),
    'TV region': tv === undefined ? UNKNOWN :
      `${tv & 1 ? 'PAL' : 'NTSC'}${tv & 4 ? ' (multi-region)' : ''}`,
    'Save device': saves,
  };
  if (bytes[0] >= 4) {
    const mapper = bytes[64];
    result['V4 mapper'] = mapper === undefined ? UNKNOWN :
      (['Linear', 'SuperGame', 'Activision', 'Absolute', 'Souper'][mapper] ??
        `Unknown (${mapper})`);
    result['V4 mapper options'] = bytes[65] === undefined ? UNKNOWN :
      `0x${bytes[65].toString(16).padStart(2, '0')}`;
    result['V4 audio'] = bytes.length < 68 ? UNKNOWN :
      `0x${bytes[66].toString(16).padStart(2, '0')}${bytes[67].toString(16).padStart(2, '0')}`;
  }
  return result;
}
