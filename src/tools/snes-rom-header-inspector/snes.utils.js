const HEADER_SIZE = 32;
const CANDIDATES = [
  { mapping: 'LoROM', offset: 0x7fc0, modes: [0x20, 0x30, 0x22, 0x32] },
  { mapping: 'HiROM', offset: 0xffc0, modes: [0x21, 0x31, 0x25, 0x35] },
];

const word = (bytes, offset) => bytes[offset] | (bytes[offset + 1] << 8);
const hex = (value, digits = 2) => `0x${value.toString(16).toUpperCase().padStart(digits, '0')}`;

function scoreHeader(bytes, offset, modes) {
  const mode = bytes[offset + 21];
  const complement = word(bytes, offset + 28);
  const checksum = word(bytes, offset + 30);
  let score = modes.includes(mode) ? 8 : 0;
  if ((checksum ^ complement) === 0xffff && checksum !== 0 && complement !== 0) score += 4;
  if (bytes[offset + 23] >= 7 && bytes[offset + 23] <= 16) score += 1;
  if (bytes[offset + 24] <= 10) score += 1;
  if (bytes[offset + 25] <= 13) score += 1;
  for (let index = 0; index < 21; index += 1) {
    if (bytes[offset + index] >= 0x20 && bytes[offset + index] <= 0x7e) score += 0.1;
  }
  return score;
}

function sizeLabel(exponent, isRam = false) {
  if (isRam && exponent === 0) return 'None';
  if (exponent > 20) return `Unknown (${hex(exponent)})`;
  const size = 2 ** exponent;
  return size >= 1024 ? `${size / 1024} MiB` : `${size} KiB`;
}

/**
 * Parse the most plausible SNES cartridge header from a ROM image.
 * The checksum validity reports the header's complement relationship only.
 * @param {Uint8Array} bytes File contents, optionally including a copier header.
 * @returns {object} Parsed header fields and mapping information.
 */
export function parseSnesHeader(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new Error('Expected ROM bytes.');
  const copierHeader = bytes.length % 0x8000 === 512;
  const prefix = copierHeader ? 512 : 0;
  const candidates = CANDIDATES
    .filter(({ offset }) => bytes.length >= prefix + offset + HEADER_SIZE)
    .map((candidate) => ({
      ...candidate,
      score: scoreHeader(bytes, prefix + candidate.offset, candidate.modes),
    }));
  if (!candidates.length) throw new Error('File is too small to contain a SNES header.');
  candidates.sort((a, b) => b.score - a.score);
  const chosen = candidates[0];
  const offset = prefix + chosen.offset;
  const complement = word(bytes, offset + 28);
  const checksum = word(bytes, offset + 30);
  const destination = bytes[offset + 25];
  const regions = ['Japan', 'North America', 'Europe', 'Sweden', 'Finland', 'Denmark',
    'France', 'Netherlands', 'Spain', 'Germany', 'Italy', 'China', 'Indonesia', 'South Korea'];
  return {
    mapping: chosen.mapping,
    copierHeader,
    headerOffset: hex(offset, 4),
    title: Array.from(bytes.subarray(offset, offset + 21), (byte) =>
      byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : ' ').join('').trim(),
    mapMode: hex(bytes[offset + 21]),
    romType: hex(bytes[offset + 22]),
    romSize: sizeLabel(bytes[offset + 23]),
    ramSize: sizeLabel(bytes[offset + 24], true),
    destination: `${regions[destination] || 'Unknown'} (${hex(destination)})`,
    developerId: hex(bytes[offset + 26]),
    version: hex(bytes[offset + 27]),
    complement: hex(complement, 4),
    checksum: hex(checksum, 4),
    checksumValid: (checksum ^ complement) === 0xffff,
  };
}
