const TYPES = {
  0: 'Old', 1: 'Standard', 2: 'Byte-encoded RLE', 3: 'RGB',
  4: 'TIFF', 5: 'IFF', 65535: 'Experimental',
};
const MAP_TYPES = { 0: 'None', 1: 'RGB', 2: 'Raw' };

/** Decode a hex or Base64 string into bytes. */
export function decodeInput(input, format) {
  const value = input.replace(/\s/g, '');
  if (format === 'hex') {
    if (!value || value.length % 2 || !/^[\da-f]+$/i.test(value)) {
      throw new Error('Enter an even number of hexadecimal digits.');
    }
    return Uint8Array.from(value.match(/.{2}/g), (pair) => parseInt(pair, 16));
  }
  if (!value || value.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new Error('Enter valid Base64 data.');
  }
  try {
    return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  } catch {
    throw new Error('Enter valid Base64 data.');
  }
}

/** Parse and validate a complete Sun Raster header and its declared payload. */
export function parseSunRaster(bytes) {
  if (bytes.length < 32) throw new Error('Truncated Sun Raster header (32 bytes required).');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fields = Array.from({ length: 8 }, (_, index) => view.getUint32(index * 4));
  const [magic, width, height, depth, length, type, maptype, maplength] = fields;
  if (magic !== 0x59a66a95) throw new Error('Invalid Sun Raster magic number.');
  if (!width || !height || !depth) throw new Error('Invalid image dimensions or depth.');
  if (maptype === 0 && maplength !== 0) throw new Error('Colormap length is inconsistent.');
  if (maptype === 1 && maplength % 3 !== 0) {
    throw new Error('RGB colormap length must be divisible by three.');
  }
  const expected = ((BigInt(width) * BigInt(depth) + 15n) / 16n) * 2n * BigInt(height);
  const availablePayload = bytes.length - 32;
  if (maplength > availablePayload) throw new Error('Truncated colormap.');
  const availablePixels = availablePayload - maplength;
  // Old files may omit ras_length. Compressed and embedded formats have their own lengths.
  const declared = type === 0 && length === 0 ? expected : BigInt(length);
  if (declared > BigInt(availablePixels)) throw new Error('Truncated pixel data.');
  if ((type === 0 || type === 1 || type === 3) && declared !== expected) {
    throw new Error('Pixel data length is inconsistent with the image dimensions.');
  }
  return {
    width, height, depth, length, type, typeName: TYPES[type] ?? 'Unknown',
    maptype, mapTypeName: MAP_TYPES[maptype] ?? 'Unknown', maplength,
    expectedPixelLength: expected.toString(), availablePayload, availablePixels,
  };
}
