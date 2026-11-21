const ICC_HEADER_SIZE = 128;
const TAG_LABELS = {
  desc: 'Profile description', cprt: 'Copyright notice', wtpt: 'Media white point',
  rXYZ: 'Red colorant', gXYZ: 'Green colorant', bXYZ: 'Blue colorant',
  rTRC: 'Red tone reproduction curve', gTRC: 'Green tone reproduction curve',
  bTRC: 'Blue tone reproduction curve',
};

function signature(bytes, offset) {
  return String.fromCharCode(...bytes.slice(offset, offset + 4));
}

function fixed16(value) {
  return (value / 65536).toFixed(4);
}

function parseDate(view) {
  const fields = [20, 22, 24, 26, 28, 30].map((offset) => view.getUint16(offset));
  const [year, month, day, hour, minute, second] = fields;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} `
    + `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:`
    + `${String(second).padStart(2, '0')}`;
}

function profileId(bytes) {
  return Array.from(bytes.slice(84, 100), (value) => value.toString(16).padStart(2, '0')).join('');
}

/**
 * Parses the header and tag table of an ICC profile.
 * @param {ArrayBuffer|Uint8Array} input ICC profile bytes.
 * @param {string} source Description used in errors.
 * @returns {{header: Array<{label: string, value: string}>, tags: Array<object>}}
 */
export function parseIccProfile(input, source = 'ICC profile') {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < ICC_HEADER_SIZE) {
    throw new Error(`${source}: ICC profile header is truncated (expected 128 bytes).`);
  }
  if (signature(bytes, 36) !== 'acsp') {
    throw new Error(`${source}: missing ICC "acsp" signature at byte offset 36.`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const xyz = [68, 72, 76].map((offset) => fixed16(view.getInt32(offset)));
  const header = [
    ['Profile size', `${view.getUint32(0)} bytes`], ['CMM type', signature(bytes, 4)],
    ['Profile version', `${bytes[8]}.${bytes[9] >> 4}.${bytes[9] & 15}`],
    ['Device class', signature(bytes, 12)], ['Color space', signature(bytes, 16)],
    ['PCS', signature(bytes, 20)], ['Creation date/time', parseDate(view)],
    ['Signature', 'acsp'], ['Platform', signature(bytes, 40)],
    ['Flags', `0x${view.getUint32(44).toString(16).padStart(8, '0')}`],
    ['Device manufacturer', signature(bytes, 48)], ['Device model', signature(bytes, 52)],
    ['Rendering intent', String(view.getUint32(64))],
    ['Illuminant (XYZ)', `X ${xyz[0]}, Y ${xyz[1]}, Z ${xyz[2]}`],
    ['Creator', signature(bytes, 80)], ['Profile ID (MD5)', profileId(bytes)],
  ].map(([label, value]) => ({ label, value }));
  if (bytes.length < 132) {
    throw new Error(`${source}: ICC tag table count is truncated at byte offset 128.`);
  }
  const count = view.getUint32(128);
  const availableEntries = Math.floor((bytes.length - 132) / 12);
  const entries = Math.min(count, availableEntries);
  const tags = Array.from({ length: entries }, (_, index) => {
    const offset = 132 + index * 12;
    const tagSignature = signature(bytes, offset);
    const dataOffset = view.getUint32(offset + 4);
    const size = view.getUint32(offset + 8);
    const outOfBounds = dataOffset > bytes.length || size > bytes.length - dataOffset;
    return {
      signature: tagSignature,
      label: TAG_LABELS[tagSignature] ?? tagSignature,
      offset: dataOffset,
      size,
      outOfBounds,
    };
  });
  if (count > entries) {
    tags.push({
      signature: '—', label: `${count - entries} tag entries truncated`, offset: '—', size: '—',
      outOfBounds: true,
    });
  }
  return { header, tags };
}

function extractJpeg(bytes) {
  const chunks = [];
  for (let offset = 2; offset + 4 <= bytes.length && bytes[offset] === 0xff; ) {
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.length) break;
    const data = bytes.slice(offset + 4, offset + 2 + length);
    if (marker === 0xe2 && signature(data, 0) === 'ICC_') chunks.push(data.slice(14));
    offset += 2 + length;
  }
  if (!chunks.length) return null;
  const joined = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
  return joined;
}

function extractTiff(bytes) {
  if (bytes.length < 8) return null;
  const little = signature(bytes, 0) === 'II*\0';
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (offset) => view.getUint16(offset, little);
  const u32 = (offset) => view.getUint32(offset, little);
  if (!little && signature(bytes, 0) !== 'MM\0*') return null;
  const ifd = u32(4);
  if (ifd + 2 > bytes.length) return null;
  for (let index = 0; index < u16(ifd); index += 1) {
    const entry = ifd + 2 + index * 12;
    if (entry + 12 > bytes.length) return null;
    if (u16(entry) === 34675) {
      const size = u32(entry + 4);
      const offset = u32(entry + 8);
      return offset + size <= bytes.length ? bytes.slice(offset, offset + size) : null;
    }
  }
  return null;
}

/**
 * Finds an ICC profile in raw ICC, JPEG, or TIFF data.
 * @param {Uint8Array} bytes Input file bytes.
 * @param {string} source Input file name.
 * @returns {Uint8Array}
 */
export function extractIccBytes(bytes, source = 'input') {
  if (bytes.length >= 40 && signature(bytes, 36) === 'acsp') return bytes;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 ? extractJpeg(bytes) : null;
  const tiff = extractTiff(bytes);
  if (jpeg) return jpeg;
  if (tiff) return tiff;
  throw new Error(
    `${source}: no ICC profile found (expected raw ICC, JPEG, TIFF, or PNG data).`
  );
}

/**
 * Finds an ICC profile in raw ICC, JPEG, TIFF, or PNG data.
 * @param {Uint8Array} bytes Input file bytes.
 * @param {string} source Input file name.
 * @returns {Promise<Uint8Array>}
 */
export async function extractIccBytesAsync(bytes, source = 'input') {
  if (bytes.length >= 8 && signature(bytes, 1) === 'PNG\r') {
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
      const type = signature(bytes, offset + 4);
      const end = offset + 8 + length;
      if (end + 4 > bytes.length) break;
      if (type === 'iCCP') {
        const nameEnd = bytes.slice(offset + 8, end).indexOf(0);
        const compressed = bytes.slice(offset + 10 + nameEnd, end);
        if (typeof DecompressionStream === 'undefined') {
          throw new Error(`${source}: PNG ICC compression is unsupported by this browser.`);
        }
        const stream = new Blob([compressed]).stream()
          .pipeThrough(new DecompressionStream('deflate'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
      }
      offset = end + 4;
    }
  }
  return extractIccBytes(bytes, source);
}

/**
 * Decodes Base64 into bytes.
 * @param {string} value
 * @returns {Uint8Array}
 */
export function bytesFromBase64(value) {
  try {
    return Uint8Array.from(atob(value.replace(/\s/g, '')), (character) => character.charCodeAt(0));
  } catch {
    throw new Error('Base64 input: invalid Base64 data.');
  }
}
