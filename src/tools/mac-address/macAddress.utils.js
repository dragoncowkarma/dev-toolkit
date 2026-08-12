const EUI_48_HEX_LENGTH = 12;
const VALID_INPUT_CHARACTERS = /^[0-9a-fA-F:.-\s]+$/;

function formatBytes(bytes, separator) {
  return bytes.join(separator);
}

function formatCiscoDot(bytes) {
  return [bytes.slice(0, 2).join(''), bytes.slice(2, 4).join(''), bytes.slice(4, 6).join('')]
    .join('.')
    .toLowerCase();
}

function formatEui64(bytes) {
  return formatBytes(bytes, ':');
}

/**
 * Parses EUI-48 input without throwing, returning canonical uppercase bytes or a displayable error.
 * @param {string} rawInput The raw MAC address value.
 * @returns {{bytes: string[], bareHex: string, error: ''}|{
 *   bytes: null, bareHex: '', error: string
 * }}
 */
export function parseMacAddress(rawInput) {
  if (typeof rawInput !== 'string' || !rawInput.trim()) {
    return {
      bytes: null,
      bareHex: '',
      error: 'Enter a MAC address containing exactly 6 bytes (12 hexadecimal digits).',
    };
  }

  if (!VALID_INPUT_CHARACTERS.test(rawInput)) {
    return {
      bytes: null,
      bareHex: '',
      error: 'A MAC address may contain only hexadecimal digits and colon, hyphen, dot, '
        + 'or space separators.',
    };
  }

  const bareHex = rawInput.replace(/[:.\-\s]/g, '').toUpperCase();
  if (bareHex.length !== EUI_48_HEX_LENGTH) {
    return {
      bytes: null,
      bareHex: '',
      error: 'A MAC address must contain exactly 6 bytes (12 hexadecimal digits).',
    };
  }

  return {
    bytes: bareHex.match(/.{2}/g),
    bareHex,
    error: '',
  };
}

/**
 * Normalizes a valid EUI-48 address into four conventional display formats.
 * @param {string} rawInput The raw MAC address value.
 * @returns {{formats: object|null, error: string}}
 */
export function normalizeMacAddress(rawInput) {
  const parsed = parseMacAddress(rawInput);
  if (parsed.error) return { formats: null, error: parsed.error };

  return {
    formats: {
      colon: formatBytes(parsed.bytes, ':'),
      hyphen: formatBytes(parsed.bytes, '-'),
      ciscoDot: formatCiscoDot(parsed.bytes),
      bareHex: parsed.bareHex,
    },
    error: '',
  };
}

/**
 * Expands EUI-48 to modified EUI-64 by toggling the U/L bit and inserting FF:FE.
 * @param {string} rawInput The raw MAC address value.
 * @returns {{eui64: string, error: ''}|{eui64: '', error: string}}
 */
export function expandEui48ToEui64(rawInput) {
  const parsed = parseMacAddress(rawInput);
  if (parsed.error) return { eui64: '', error: parsed.error };

  const firstOctet = (Number.parseInt(parsed.bytes[0], 16) ^ 0x02)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
  const expandedBytes = [
    firstOctet,
    ...parsed.bytes.slice(1, 3),
    'FF',
    'FE',
    ...parsed.bytes.slice(3),
  ];

  return { eui64: formatEui64(expandedBytes), error: '' };
}

/**
 * Inspects the I/G and U/L bits and extracts the EUI-48 organizationally unique identifier.
 * @param {string} rawInput The raw MAC address value.
 * @returns {{inspection: object|null, error: string}}
 */
export function inspectMacAddress(rawInput) {
  const parsed = parseMacAddress(rawInput);
  if (parsed.error) return { inspection: null, error: parsed.error };

  const firstOctet = Number.parseInt(parsed.bytes[0], 16);
  return {
    inspection: {
      addressType: (firstOctet & 0x01) === 0 ? 'Unicast' : 'Multicast',
      administration: (firstOctet & 0x02) === 0
        ? 'Universally Administered'
        : 'Locally Administered',
      oui: parsed.bytes.slice(0, 3).join(':'),
    },
    error: '',
  };
}
