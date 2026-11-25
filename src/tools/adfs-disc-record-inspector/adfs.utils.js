const UNKNOWN = 'Unknown';
const BOOT = 0xc00;
const RECORD = BOOT + 0x1c0;

function numberAt(data, offset, length) {
  if (offset + length > data.length) return null;
  let result = 0;
  for (let i = 0; i < length; i += 1) result += data[offset + i] * 2 ** (8 * i);
  return result;
}

function checked(value, condition) {
  return value !== null && condition(value) ? value : UNKNOWN;
}

function checksum(data, offset, size, initial = 0) {
  if (data.length < offset + size) return UNKNOWN;
  let sum = initial;
  for (let i = size - 2; i >= 0; i -= 1) sum = (sum & 255) + (sum >> 8) + data[offset + i];
  return (sum & 255) === data[offset + size - 1] ? 'Valid' : 'Invalid';
}

function nameOf(bytes) {
  if (bytes.some((byte) => byte !== 0 && (byte < 32 || byte > 126))) return UNKNOWN;
  return String.fromCharCode(...bytes).replace(/[\0 ]+$/, '') || UNKNOWN;
}

function oldMap(data) {
  const size = numberAt(data, 252, 3);
  const end = numberAt(data, 510, 1);
  const plausible = size > 0 && end !== null && end <= 246 && end % 3 === 0;
  if (!plausible) return null;
  const extents = [];
  let lastEnd = 0;
  for (let i = 0; i < end; i += 3) {
    const start = numberAt(data, i, 3);
    const length = numberAt(data, 256 + i, 3);
    if (!length || start < lastEnd || start + length > size) return null;
    extents.push({ start, length });
    lastEnd = start + length;
  }
  const name = [];
  for (let i = 0; i < 5; i += 1) name.push(data[247 + i], data[503 + i]);
  return {
    format: 'Old map', log2SectorSize: 8, sectorsPerTrack: UNKNOWN, heads: UNKNOWN,
    density: UNKNOWN, idLength: UNKNOWN, log2BytesPerMapBit: UNKNOWN, skew: UNKNOWN,
    bootOption: checked(data[509], (v) => v <= 3), zones: UNKNOWN,
    discSize: size * 256, discId: numberAt(data, 507, 2), discName: nameOf(name), extents,
    mapChecksums: [checksum(data, 0, 256, 255), checksum(data, 256, 256, 255)],
    bootChecksum: UNKNOWN,
  };
}

/** Parse at most the provided image prefix without reading outside it. */
export function inspectAdfs(input) {
  const data = input instanceof Uint8Array ? input : new Uint8Array(input || 0);
  const byte = (offset) => numberAt(data, RECORD + offset, 1);
  const sector = byte(0);
  const id = byte(4);
  const zonesLow = byte(9);
  const zonesHigh = byte(42);
  const lowSize = numberAt(data, RECORD + 16, 4);
  const highSize = numberAt(data, RECORD + 36, 4);
  const size = lowSize === null || highSize === null ? null : lowSize + highSize * 2 ** 32;
  const zones = zonesLow === null || zonesHigh === null ? null : zonesLow + zonesHigh * 256;
  const plausible = sector >= 8 && sector <= 10 && id >= 3 && id <= 15 &&
    zones > 0 && Number.isSafeInteger(size) && size >= 2 ** sector;
  if (!plausible) {
    return oldMap(data) || { format: UNKNOWN, mapChecksums: [UNKNOWN, UNKNOWN],
      bootChecksum: UNKNOWN, extents: null };
  }
  const nameBytes = data.length >= RECORD + 32 ? [...data.slice(RECORD + 22, RECORD + 32)] : null;
  return {
    format: 'New map (boot record)', log2SectorSize: sector,
    sectorsPerTrack: checked(byte(1), (v) => v > 0), heads: checked(byte(2), (v) => v > 0),
    density: checked(byte(3), (v) => [0, 1, 2, 3, 4, 8].includes(v)), idLength: id,
    log2BytesPerMapBit: checked(byte(5), (v) => v <= 31), skew: byte(6),
    bootOption: checked(byte(7), (v) => v <= 3), zones, discSize: size,
    discId: numberAt(data, RECORD + 20, 2), discName: nameBytes ? nameOf(nameBytes) : UNKNOWN,
    mapChecksums: [UNKNOWN, UNKNOWN], bootChecksum: checksum(data, BOOT, 512), extents: null,
  };
}
