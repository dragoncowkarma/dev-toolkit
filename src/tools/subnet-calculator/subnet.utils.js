const MAX_IPV4_INTEGER = 0xffffffff;

/**
 * Parses a dotted-decimal IPv4 address.
 * @param {string} value
 * @returns {{address: string, integer: number}|null}
 */
export function parseIPv4(value) {
  const address = value.trim();
  const octets = address.split('.');
  if (octets.length !== 4 || octets.some((octet) => !/^\d{1,3}$/.test(octet))) return null;

  const numbers = octets.map(Number);
  if (numbers.some((octet) => octet < 0 || octet > 255)) return null;

  const integer = numbers.reduce((total, octet) => total * 256 + octet, 0);
  return { address: numbers.join('.'), integer };
}

/**
 * Converts an IPv4 integer into dotted-decimal notation.
 * @param {number} value
 * @returns {string}
 */
export function integerToIPv4(value) {
  const normalized = Math.max(0, Math.min(MAX_IPV4_INTEGER, Math.floor(value)));
  return [24, 16, 8, 0].map((shift) => Math.floor(normalized / (2 ** shift)) % 256).join('.');
}

/**
 * Builds a contiguous subnet mask from a CIDR prefix length.
 * @param {number} prefix
 * @returns {number|null}
 */
export function maskFromPrefix(prefix) {
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  return prefix === 0 ? 0 : MAX_IPV4_INTEGER - (2 ** (32 - prefix) - 1);
}

/**
 * Extracts a CIDR prefix length from a dotted-decimal contiguous subnet mask.
 * @param {string} value
 * @returns {number|null}
 */
export function prefixFromMask(value) {
  const parsed = parseIPv4(value);
  if (!parsed) return null;

  for (let prefix = 0; prefix <= 32; prefix += 1) {
    if (maskFromPrefix(prefix) === parsed.integer) return prefix;
  }
  return null;
}

/**
 * Parses a CIDR IPv4 address and prefix pair.
 * @param {string} value
 * @returns {{address: string, integer: number, prefix: number}|null}
 */
export function parseCidr(value) {
  const parts = value.trim().split('/');
  if (parts.length !== 2 || !/^\d{1,2}$/.test(parts[1])) return null;
  const parsedIp = parseIPv4(parts[0]);
  const prefix = Number(parts[1]);
  if (!parsedIp || prefix < 0 || prefix > 32) return null;
  return { ...parsedIp, prefix };
}

/**
 * Returns the traditional IPv4 address class for an address.
 * @param {number} integer
 * @returns {'A'|'B'|'C'|'D'|'E'}
 */
export function getAddressClass(integer) {
  const firstOctet = Math.floor(integer / (2 ** 24));
  if (firstOctet <= 127) return 'A';
  if (firstOctet <= 191) return 'B';
  if (firstOctet <= 223) return 'C';
  if (firstOctet <= 239) return 'D';
  return 'E';
}

/**
 * Returns whether an address belongs to an RFC 1918 private range.
 * @param {number} integer
 * @returns {boolean}
 */
export function isPrivateIPv4(integer) {
  const firstOctet = Math.floor(integer / (2 ** 24));
  const secondOctet = Math.floor(integer / (2 ** 16)) % 256;
  return firstOctet === 10
    || (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31)
    || (firstOctet === 192 && secondOctet === 168);
}

/**
 * Calculates the address boundaries and metadata for a valid IPv4 CIDR range.
 * @param {string} address
 * @param {number} prefix
 * @returns {object|null}
 */
export function calculateSubnet(address, prefix) {
  const parsedIp = parseIPv4(address);
  const mask = maskFromPrefix(prefix);
  if (!parsedIp || mask === null) return null;

  const totalAddresses = 2 ** (32 - prefix);
  const networkInteger = Math.floor(parsedIp.integer / totalAddresses) * totalAddresses;
  const broadcastInteger = networkInteger + totalAddresses - 1;
  const usableHostCount = prefix === 32 ? 1 : prefix === 31 ? 2 : totalAddresses - 2;
  const firstHostInteger = prefix >= 31 ? networkInteger : networkInteger + 1;
  const lastHostInteger = prefix >= 31 ? broadcastInteger : broadcastInteger - 1;

  return {
    address: parsedIp.address,
    prefix,
    cidr: `${parsedIp.address}/${prefix}`,
    networkAddress: integerToIPv4(networkInteger),
    broadcastAddress: integerToIPv4(broadcastInteger),
    firstUsableHost: integerToIPv4(firstHostInteger),
    lastUsableHost: integerToIPv4(lastHostInteger),
    totalAddresses,
    usableHostCount,
    subnetMask: integerToIPv4(mask),
    wildcardMask: integerToIPv4(MAX_IPV4_INTEGER - mask),
    addressClass: getAddressClass(parsedIp.integer),
    addressType: isPrivateIPv4(parsedIp.integer) ? 'Private' : 'Public',
  };
}
