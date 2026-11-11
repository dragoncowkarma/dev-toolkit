const PNG_SIGNATURE = Object.freeze([137, 80, 78, 71, 13, 10, 26, 10]);
const textDecoder = new TextDecoder('latin1');
const utf8Decoder = new TextDecoder('utf-8', { fatal: false });

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

/** Calculates the PNG CRC-32 value for a byte sequence. */
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Formats bytes as readable hexadecimal pairs. */
export function formatHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

function readAscii(bytes) {
  return String.fromCharCode(...bytes);
}

function readNullTerminated(bytes, start) {
  const end = bytes.indexOf(0, start);
  if (end === -1) return null;
  return { value: bytes.slice(start, end), next: end + 1 };
}

function decodeChunk(type, data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (type === 'IHDR' && data.length === 13) {
    return {
      width: view.getUint32(0), height: view.getUint32(4), bitDepth: data[8],
      colorType: data[9], compressionMethod: data[10], filterMethod: data[11],
      interlaceMethod: data[12],
    };
  }
  if (type === 'PLTE') return { paletteEntries: Math.floor(data.length / 3) };
  if (type === 'IDAT') return { dataBytes: data.length };
  if (type === 'IEND') return {};
  if (type === 'gAMA' && data.length === 4) return { gamma: view.getUint32(0) / 100000 };
  if (type === 'pHYs' && data.length === 9) {
    return {
      pixelsPerUnitX: view.getUint32(0), pixelsPerUnitY: view.getUint32(4),
      unit: data[8] === 1 ? 'meter' : 'unknown',
    };
  }
  if (type === 'tIME' && data.length === 7) {
    const month = String(data[2]).padStart(2, '0');
    const day = String(data[3]).padStart(2, '0');
    const date = `${view.getUint16(0)}-${month}-${day}`;
    const time = [data[4], data[5], data[6]]
      .map((value) => String(value).padStart(2, '0'))
      .join(':');
    return { timestamp: `${date} ${time} UTC` };
  }
  if (type === 'tEXt') {
    const keyword = readNullTerminated(data, 0);
    if (!keyword) return { error: 'Missing tEXt keyword separator.' };
    return {
      keyword: textDecoder.decode(keyword.value),
      text: textDecoder.decode(data.slice(keyword.next)),
    };
  }
  if (type === 'zTXt') {
    const keyword = readNullTerminated(data, 0);
    if (!keyword || keyword.next >= data.length) return { error: 'Malformed zTXt chunk.' };
    return {
      keyword: textDecoder.decode(keyword.value), compressionMethod: data[keyword.next],
      text: `${data.length - keyword.next - 1} compressed bytes`,
    };
  }
  if (type === 'iTXt') {
    const keyword = readNullTerminated(data, 0);
    if (!keyword || keyword.next + 2 > data.length) return { error: 'Malformed iTXt chunk.' };
    const language = readNullTerminated(data, keyword.next + 2);
    const translated = language && readNullTerminated(data, language.next);
    if (!language || !translated) return { error: 'Malformed iTXt chunk.' };
    const compressed = data[keyword.next] === 1;
    return {
      keyword: textDecoder.decode(keyword.value), language: textDecoder.decode(language.value),
      translatedKeyword: utf8Decoder.decode(translated.value),
      text: compressed
        ? `${data.length - translated.next} compressed bytes`
        : utf8Decoder.decode(data.slice(translated.next)),
    };
  }
  return null;
}

/**
 * Parses a PNG byte stream without making network requests.
 * @param {ArrayBuffer|Uint8Array} input PNG bytes.
 * @returns {{chunks: Array<object>, errors: string[]}}
 * @throws {Error} for invalid signatures and structural truncation.
 */
export function parsePng(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const hasValidSignature = bytes.length >= PNG_SIGNATURE.length
    && PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
  if (!hasValidSignature) {
    throw new Error('Invalid PNG signature. Expected the standard 8-byte PNG header.');
  }

  const chunks = [];
  const errors = [];
  let offset = PNG_SIGNATURE.length;
  let foundIend = false;
  while (offset < bytes.length) {
    const chunkOffset = offset;
    if (bytes.length - offset < 12) throw new Error(`Truncated chunk header at offset ${offset}.`);
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, bytes.length - offset);
    const length = view.getUint32(0);
    const typeBytes = bytes.slice(offset + 4, offset + 8);
    const type = readAscii(typeBytes);
    const totalLength = 12 + length;
    if (length > bytes.length - offset - 12) {
      throw new Error(
        `Chunk ${chunks.length} (${type}) at offset ${offset} declares ${length} bytes `
          + 'beyond the remaining file.',
      );
    }
    const data = bytes.slice(offset + 8, offset + 8 + length);
    const storedCrc = view.getUint32(8 + length);
    const calculatedCrc = crc32(bytes.slice(offset + 4, offset + 8 + length));
    const crcValid = storedCrc === calculatedCrc;
    if (!crcValid) {
      errors.push(`CRC mismatch in chunk ${chunks.length} (${type}) at offset ${chunkOffset}.`);
    }
    chunks.push({
      index: chunks.length, type, offset: chunkOffset, length, crcValid, storedCrc, calculatedCrc,
      decoded: decodeChunk(type, data), rawBytes: bytes.slice(offset, offset + totalLength),
    });
    offset += totalLength;
    if (type === 'IEND') {
      foundIend = true;
      break;
    }
  }
  if (chunks[0]?.type !== 'IHDR') errors.push('Missing IHDR as the first chunk.');
  if (!foundIend) errors.push('Missing IEND chunk.');
  return { chunks, errors };
}
