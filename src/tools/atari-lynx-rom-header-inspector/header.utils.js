const UNKNOWN = 'Unknown';

/** Parse up to 64 hexadecimal bytes, returning an error for malformed input. */
export function parseHex(input) {
  const compact = input.replace(/\s/g, '');
  if (!/^[0-9a-f]*$/i.test(compact) || compact.length % 2 !== 0) {
    return { error: 'Enter complete hexadecimal bytes separated by whitespace.' };
  }
  if (compact.length > 128) return { error: 'Enter at most 64 bytes.' };
  return { bytes: Uint8Array.from(compact.match(/../g) || [], (byte) => parseInt(byte, 16)) };
}

/** Decode available fields from a 64-byte Atari Lynx header. */
export function parseHeader(bytes) {
  const has = (offset, length) => bytes.length >= offset + length;
  const number = (offset) => has(offset, 2) ? bytes[offset] | (bytes[offset + 1] << 8) : UNKNOWN;
  const string = (offset, length) => {
    if (!has(offset, length)) return UNKNOWN;
    return Array.from(bytes.slice(offset, offset + length))
      .map((byte) => String.fromCharCode(byte)).join('').split('\0')[0].trimEnd();
  };
  const magic = has(0, 4) ? String.fromCharCode(...bytes.slice(0, 4)) : UNKNOWN;
  const rotation = has(58, 1) ? (['None', 'Left', 'Right'][bytes[58]] ?? UNKNOWN) : UNKNOWN;
  const audin = has(59, 1) ? ({ 0: 'No', 1: 'Yes' }[bytes[59]] ?? UNKNOWN) : UNKNOWN;
  const chips = ['None', '93C46', '93C56', '93C66', '93C76', '93C86'];
  const eeprom = has(60, 1) ? bytes[60] : null;
  return {
    error: magic !== UNKNOWN && magic !== 'LYNX' ? 'Invalid magic: expected LYNX.' : '',
    fields: {
      Magic: magic,
      'Bank 0 page size': number(4),
      'Bank 1 page size': number(6),
      Version: number(8),
      'Cart name': string(10, 32),
      Manufacturer: string(42, 16),
      Rotation: rotation,
      AUDIN: audin,
      'EEPROM flag': eeprom === null ? UNKNOWN :
        `0x${eeprom.toString(16).padStart(2, '0').toUpperCase()}`,
      'EEPROM chip': eeprom === null ? UNKNOWN : (chips[eeprom & 7] ?? UNKNOWN),
      'EEPROM storage': eeprom === null ? UNKNOWN : (eeprom & 64 ? 'LynxSD' : 'EEPROM'),
      'EEPROM word size': eeprom === null ? UNKNOWN : (eeprom & 128 ? '8-bit' : '16-bit'),
    },
  };
}
