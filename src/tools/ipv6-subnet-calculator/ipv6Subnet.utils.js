const IPV6_GROUP_COUNT = 8;
const BITS_PER_GROUP = 16n;
const MAX_IPV6_INTEGER = (1n << 128n) - 1n;
const HEX_GROUP_PATTERN = /^[0-9a-fA-F]{1,4}$/;

/**
 * Expands a valid IPv6 address into eight four-digit hexadecimal groups.
 * @param {string} value
 * @returns {string|null}
 */
export function expandIPv6(value) {
  const address = value.trim();
  if (!address || address.includes('.') || address.includes('/')) return null;

  const compressionParts = address.split('::');
  if (compressionParts.length > 2) return null;

  const hasCompression = compressionParts.length === 2;
  const leftGroups = compressionParts[0] ? compressionParts[0].split(':') : [];
  const rightGroups = hasCompression && compressionParts[1]
    ? compressionParts[1].split(':')
    : [];
  const explicitGroups = [...leftGroups, ...rightGroups];

  if (explicitGroups.some((group) => !HEX_GROUP_PATTERN.test(group))) return null;
  if ((!hasCompression && explicitGroups.length !== IPV6_GROUP_COUNT)
    || (hasCompression && explicitGroups.length >= IPV6_GROUP_COUNT)) return null;

  const missingGroupCount = hasCompression
    ? IPV6_GROUP_COUNT - explicitGroups.length
    : 0;
  const groups = [
    ...leftGroups,
    ...Array(missingGroupCount).fill('0'),
    ...rightGroups,
  ];
  return groups.map((group) => group.toLowerCase().padStart(4, '0')).join(':');
}

/**
 * Compresses a valid IPv6 address using its longest run of zero groups.
 * @param {string} value
 * @returns {string|null}
 */
export function compressIPv6(value) {
  const expanded = expandIPv6(value);
  if (!expanded) return null;

  const groups = expanded.split(':').map((group) => group.replace(/^0+(?=.)/, ''));
  let bestStart = -1;
  let bestLength = 0;
  let currentStart = -1;

  for (let index = 0; index <= groups.length; index += 1) {
    if (index < groups.length && groups[index] === '0') {
      if (currentStart === -1) currentStart = index;
      continue;
    }

    if (currentStart !== -1) {
      const currentLength = index - currentStart;
      if (currentLength > bestLength && currentLength >= 2) {
        bestStart = currentStart;
        bestLength = currentLength;
      }
      currentStart = -1;
    }
  }

  if (bestStart === -1) return groups.join(':');

  const left = groups.slice(0, bestStart).join(':');
  const right = groups.slice(bestStart + bestLength).join(':');
  if (!left && !right) return '::';
  if (!left) return `::${right}`;
  if (!right) return `${left}::`;
  return `${left}::${right}`;
}

/**
 * Converts a valid IPv6 address to its unsigned 128-bit integer value.
 * @param {string} value
 * @returns {bigint|null}
 */
export function ipv6ToBigInt(value) {
  const expanded = expandIPv6(value);
  if (!expanded) return null;
  return expanded.split(':').reduce(
    (integer, group) => (integer << BITS_PER_GROUP) | BigInt(`0x${group}`),
    0n,
  );
}

/**
 * Converts an unsigned 128-bit integer into a compressed IPv6 address.
 * @param {bigint} value
 * @returns {string|null}
 */
export function bigIntToIPv6(value) {
  if (typeof value !== 'bigint' || value < 0n || value > MAX_IPV6_INTEGER) return null;
  const groups = Array.from({ length: IPV6_GROUP_COUNT }, (_, index) => {
    const shift = BigInt((IPV6_GROUP_COUNT - index - 1) * 16);
    return ((value >> shift) & 0xffffn).toString(16).padStart(4, '0');
  });
  return compressIPv6(groups.join(':'));
}

/**
 * Parses an IPv6 address and prefix in CIDR notation.
 * @param {string} value
 * @returns {{address: string, expandedAddress: string, integer: bigint, prefix: number}|null}
 */
export function parseIPv6Cidr(value) {
  const parts = value.trim().split('/');
  if (parts.length !== 2 || !/^(0|[1-9]\d{0,2})$/.test(parts[1])) return null;

  const expandedAddress = expandIPv6(parts[0]);
  const prefix = Number(parts[1]);
  if (!expandedAddress || prefix > 128) return null;

  return {
    address: compressIPv6(expandedAddress),
    expandedAddress,
    integer: ipv6ToBigInt(expandedAddress),
    prefix,
  };
}

/**
 * Calculates normalized addresses and boundaries for an IPv6 CIDR block.
 * @param {string} value
 * @returns {object|null}
 */
export function calculateIPv6Subnet(value) {
  const parsed = parseIPv6Cidr(value);
  if (!parsed) return null;

  const hostBitCount = 128n - BigInt(parsed.prefix);
  const totalAddresses = 1n << hostBitCount;
  const hostMask = totalAddresses - 1n;
  const networkInteger = parsed.integer & (MAX_IPV6_INTEGER ^ hostMask);
  const lastInteger = networkInteger + hostMask;

  return {
    expandedAddress: parsed.expandedAddress,
    compressedAddress: parsed.address,
    networkAddress: bigIntToIPv6(networkInteger),
    prefix: parsed.prefix,
    totalAddresses,
    firstAddress: bigIntToIPv6(networkInteger),
    lastAddress: bigIntToIPv6(lastInteger),
  };
}
